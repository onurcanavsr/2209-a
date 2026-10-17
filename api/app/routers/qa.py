"""Faz 5: belge hakkında soru-cevap (SSE akışı, geçmiş, günlük sınır)."""
import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..llm import model_name
from ..qa import HISTORY_TURNS, SYSTEM, build_prompt, cited_sources, select_passages
from ..store import get_store
from .summaries import _owned_doc, _sse, llm_factory

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["soru-cevap"])

INFLIGHT_TTL = 120  # sn: aynı belgede aynı anda tek soru (maliyet ve sıra karışmasın)
_inflight: dict[tuple[str, str], float] = {}


class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@router.get("/{doc_id}/qa")
async def list_qa(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    doc = await _owned_doc(store, doc_id, user.id)
    return await store.list_qa(doc["id"], user.id, 50)


@router.delete("/{doc_id}/qa", status_code=status.HTTP_204_NO_CONTENT)
async def clear_qa(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    doc = await _owned_doc(store, doc_id, user.id)
    await store.delete_qa(doc["id"], user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{doc_id}/ask")
async def ask(doc_id: str, body: AskIn, user: CurrentUser = Depends(get_current_user),
              store=Depends(get_store), llm=Depends(llm_factory)):
    doc = await _owned_doc(store, doc_id, user.id)
    if doc["status"] != "ready" or not doc.get("raw_text"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Belge henüz hazır değil veya metni çıkarılamadı.")
    question = " ".join(body.question.split())
    if len(question) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lütfen sorunuzu biraz daha ayrıntılı yazın.")

    s = get_settings()
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if await store.count_actions_since(user.id, "ask", since) >= s.daily_qa_limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Günlük soru sınırına ({s.daily_qa_limit}) ulaştınız. Yarın tekrar deneyin. "
                            "Önceki sorularınızı ve cevaplarını yine görüntüleyebilirsiniz.")

    history = await store.list_qa(doc["id"], user.id, HISTORY_TURNS)
    passages, _matched = select_passages(doc["raw_text"], question, history[-1]["question"] if history else None)
    prompt = build_prompt(doc["title"], question, passages, history)

    key = (user.id, doc["id"])
    started = _inflight.get(key)
    if started is not None and time.monotonic() - started < INFLIGHT_TTL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Önceki sorunuz hâlâ yanıtlanıyor, lütfen bekleyin.")
    _inflight[key] = time.monotonic()
    try:
        await store.log_usage(user.id, "ask", len(prompt))  # birim: modele giden istem karakteri
    except Exception:
        _inflight.pop(key, None)
        raise

    async def events():
        try:
            yield _sse({"type": "start"})
            parts: list[str] = []
            async for piece in llm("main").stream(SYSTEM, prompt, max_tokens=900):
                parts.append(piece)
                yield _sse({"type": "delta", "text": piece})
            answer = "".join(parts).strip()
            if not answer:
                raise RuntimeError("Model boş yanıt döndürdü")
            sources = cited_sources(answer, passages)
            saved = True
            try:
                await store.add_qa(doc["id"], user.id, question, answer, sources, model_name("main"))
            except Exception:
                log.exception("Soru-cevap kaydedilemedi (%s)", doc["id"])
                saved = False
            yield _sse({"type": "done", "saved": saved, "sources": sources})
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Soru-cevap hatası (%s)", doc["id"])  # ayrıntı yalnızca sunucu günlüğüne
            yield _sse({"type": "error", "message": "Cevap şu anda hazırlanamadı. Lütfen biraz sonra tekrar deneyin."})
        finally:
            _inflight.pop(key, None)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
