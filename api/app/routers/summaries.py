import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..llm import get_llm, model_name
from ..store import get_store
from ..summarize import summarize_stream

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["özetler"])

INFLIGHT_TTL = 300  # sn: akış hiç başlamadan koparsa kilit kalıcı takılmasın
_inflight: dict[tuple[str, str, str], float] = {}  # aynı özet iki kez paralel üretilmesin (maliyet)


def llm_factory():
    """Testlerde değiştirilebilsin diye bağımlılık olarak sunulur."""
    return get_llm


class SummarizeIn(BaseModel):
    level: Literal["short", "medium", "detailed"] = "medium"
    regenerate: bool = False


def _uuid(doc_id: str) -> str:
    try:
        return str(uuid.UUID(doc_id))
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


async def _owned_doc(store, doc_id: str, user_id: str) -> dict:
    doc = await store.get_document(_uuid(doc_id), user_id)
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Belge bulunamadı")
    return doc


@router.get("/{doc_id}/summaries")
async def list_summaries(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    doc = await _owned_doc(store, doc_id, user.id)
    return await store.list_summaries(doc["id"])


@router.post("/{doc_id}/summarize")
async def summarize(doc_id: str, body: SummarizeIn, user: CurrentUser = Depends(get_current_user),
                    store=Depends(get_store), llm=Depends(llm_factory)):
    doc = await _owned_doc(store, doc_id, user.id)
    if doc["status"] != "ready" or not doc.get("raw_text"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Belge henüz hazır değil veya metni çıkarılamadı.")

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

    if not body.regenerate:
        cached = await store.get_summary(doc["id"], body.level)
        if cached:
            async def replay():
                yield _sse({"type": "start", "cached": True})
                yield _sse({"type": "delta", "text": cached["content"]})
                yield _sse({"type": "done", "saved": True})
            return StreamingResponse(replay(), media_type="text/event-stream", headers=headers)

    s = get_settings()
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if await store.count_actions_since(user.id, "summarize", since) >= s.daily_summary_limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Günlük özet sınırına ({s.daily_summary_limit}) ulaştınız. Yarın tekrar deneyin. "
                            "Daha önce hazırlanan özetleri yine görüntüleyebilirsiniz.")

    key = (user.id, doc["id"], body.level)
    started = _inflight.get(key)
    if started is not None and time.monotonic() - started < INFLIGHT_TTL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu özet zaten hazırlanıyor, lütfen bekleyin.")
    _inflight[key] = time.monotonic()
    try:
        await store.log_usage(user.id, "summarize", len(doc["raw_text"]))
    except Exception:
        _inflight.pop(key, None)
        raise

    async def events():
        try:
            yield _sse({"type": "start", "cached": False})
            parts: list[str] = []
            async for piece in summarize_stream(llm, doc["raw_text"], body.level, doc["title"]):
                parts.append(piece)
                yield _sse({"type": "delta", "text": piece})
            content = "".join(parts).strip()
            if not content:
                raise RuntimeError("Model boş yanıt döndürdü")
            saved = True
            try:
                await store.save_summary(doc["id"], body.level, content, model_name("main"))
            except Exception:
                log.exception("Özet kaydedilemedi (%s)", doc["id"])
                saved = False
            yield _sse({"type": "done", "saved": saved})
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Özetleme hatası (%s)", doc["id"])  # ayrıntı yalnızca sunucu günlüğüne
            yield _sse({"type": "error", "message": "Özet şu anda hazırlanamadı. Lütfen biraz sonra tekrar deneyin."})
        finally:
            _inflight.pop(key, None)

    return StreamingResponse(events(), media_type="text/event-stream", headers=headers)
