import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import audio_cache
from .config import get_settings
from .routers import audio, documents, me, qa, quiz, summaries
from .store import StoreError, get_store

log = logging.getLogger(__name__)
s = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await get_store().fail_stale_processing()
    except Exception:
        log.warning("Yarım kalan işler temizlenemedi", exc_info=True)
    cleaner = asyncio.create_task(audio_cache.cleanup_loop())
    yield
    cleaner.cancel()
    await get_store().close()


app = FastAPI(title="Akademik Asistan API", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.exception_handler(StoreError)
async def store_error_handler(request, exc):
    log.error("Veri katmanı hatası: %s", exc)
    return JSONResponse({"detail": "Veritabanına şu anda ulaşılamıyor, lütfen tekrar deneyin."}, status_code=502)


# Her yeni router varsayılan olarak girişli olmalıdır (Depends(get_current_user)).
app.include_router(me.router)
app.include_router(documents.router)
app.include_router(summaries.router)
app.include_router(audio.router)
app.include_router(qa.router)
app.include_router(quiz.router)


@app.get("/health", include_in_schema=False)  # tek kamusal uç nokta (izleme için)
def health():
    return {"status": "ok"}
