"""Faz 5: pekiştirme testi (quiz) üretimi, çözme ve puanlama. Doğru cevaplar istemciye yalnızca puanlamadan sonra gider."""
import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from ..auth import CurrentUser, get_current_user
from ..config import get_settings
from ..llm import model_name
from ..quiz import SYSTEM, QuizParseError, build_prompt, grade, parse_quiz, public_questions
from ..store import get_store
from .summaries import _owned_doc, llm_factory

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["test"])

MAX_QUIZZES_PER_DOC = 20
GENERATE_TIMEOUT = 90   # sn
ATTEMPTS = 2            # model bozuk JSON verirse bir kez daha denenir (tek kota hakkı sayılır)
INFLIGHT_TTL = 180
_inflight: dict[tuple[str, str], float] = {}


class QuizIn(BaseModel):
    count: int = Field(5, ge=3, le=15)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class AttemptIn(BaseModel):
    answers: list[int | None] = Field(max_length=15)


def _uuid(value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test bulunamadı")


def _public(q: dict) -> dict:
    return {"id": q["id"], "document_id": q["document_id"], "difficulty": q["difficulty"],
            "question_count": q["question_count"], "created_at": q["created_at"],
            "questions": public_questions(q["questions"])}


async def _owned_quiz(store, quiz_id: str, user_id: str) -> dict:
    q = await store.get_quiz(_uuid(quiz_id), user_id)
    if not q:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test bulunamadı")
    return q


@router.get("/documents/{doc_id}/quizzes")
async def list_quizzes(doc_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    doc = await _owned_doc(store, doc_id, user.id)
    return await store.list_quizzes(doc["id"], user.id)


@router.post("/documents/{doc_id}/quizzes", status_code=status.HTTP_201_CREATED)
async def create_quiz(doc_id: str, body: QuizIn, user: CurrentUser = Depends(get_current_user),
                      store=Depends(get_store), llm=Depends(llm_factory)):
    doc = await _owned_doc(store, doc_id, user.id)
    if doc["status"] != "ready" or not doc.get("raw_text"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Belge henüz hazır değil veya metni çıkarılamadı.")

    s = get_settings()
    since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    if await store.count_actions_since(user.id, "quiz", since) >= s.daily_quiz_limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Günlük test sınırına ({s.daily_quiz_limit}) ulaştınız. Yarın tekrar deneyin. "
                            "Daha önce hazırlanan testleri yine çözebilirsiniz.")
    if await store.count_quizzes(doc["id"], user.id) >= MAX_QUIZZES_PER_DOC:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Bu belge için en fazla {MAX_QUIZZES_PER_DOC} test saklanır. Yeni test için eskilerden birini silin.")

    key = (user.id, doc["id"])
    started = _inflight.get(key)
    if started is not None and time.monotonic() - started < INFLIGHT_TTL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu belge için test zaten hazırlanıyor, lütfen bekleyin.")
    _inflight[key] = time.monotonic()
    try:
        await store.log_usage(user.id, "quiz", len(doc["raw_text"]))
        prompt = build_prompt(doc["title"], doc["raw_text"], body.count, body.difficulty)
        questions = None
        for attempt in range(ATTEMPTS):
            try:
                raw = await asyncio.wait_for(llm("main").complete(SYSTEM, prompt, max_tokens=4500), GENERATE_TIMEOUT)
                questions = parse_quiz(raw, body.count)
                break
            except QuizParseError as e:
                log.warning("Test çıktısı geçersiz (deneme %d, %s): %s", attempt + 1, doc["id"], e)
            except asyncio.TimeoutError:
                log.warning("Test üretimi zaman aşımı (%s)", doc["id"])
                break
            except Exception:
                log.exception("Test üretim hatası (%s)", doc["id"])  # ayrıntı yalnızca sunucu günlüğüne
                break
        if not questions:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Test şu anda hazırlanamadı. Lütfen biraz sonra tekrar deneyin.")
        row = await store.create_quiz({
            "document_id": doc["id"], "user_id": user.id, "difficulty": body.difficulty,
            "question_count": len(questions), "questions": questions, "model": model_name("main")})
        return _public(row)
    finally:
        _inflight.pop(key, None)


@router.get("/quizzes/{quiz_id}")
async def get_quiz(quiz_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    return _public(await _owned_quiz(store, quiz_id, user.id))


@router.delete("/quizzes/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quiz(quiz_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    if not await store.delete_quiz(_uuid(quiz_id), user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test bulunamadı")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/quizzes/{quiz_id}/attempts")
async def submit_attempt(quiz_id: str, body: AttemptIn, user: CurrentUser = Depends(get_current_user),
                         store=Depends(get_store)):
    quiz = await _owned_quiz(store, quiz_id, user.id)
    total = len(quiz["questions"])
    if len(body.answers) != total:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{total} sorunun hepsi için bir yanıt gönderilmeli (boş için null).")
    if any(a is not None and not 0 <= a < 4 for a in body.answers):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Geçersiz şık numarası.")
    result = grade(quiz["questions"], body.answers)
    try:
        await store.add_attempt({"quiz_id": quiz["id"], "user_id": user.id, "answers": body.answers,
                                 "score": result["score"], "total": result["total"]})
        result["saved"] = True
    except Exception:
        log.exception("Deneme kaydedilemedi (%s)", quiz["id"])
        result["saved"] = False
    return result


@router.get("/quizzes/{quiz_id}/attempts")
async def list_attempts(quiz_id: str, user: CurrentUser = Depends(get_current_user), store=Depends(get_store)):
    quiz = await _owned_quiz(store, quiz_id, user.id)
    return await store.list_attempts(quiz["id"], user.id)
