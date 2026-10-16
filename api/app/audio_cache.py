"""Üretilen ses bölümlerinin sunucu diskinde süreli önbelleği.
Yol: <audio_dir>/<user_id>/<doc_id>/<anahtar>.mp3 (kimlikler UUID doğrulamasından geçer)."""
import asyncio
import logging
import os
import shutil
import time
import uuid
from pathlib import Path

from .config import get_settings

log = logging.getLogger(__name__)


def _uid(v: str) -> str | None:
    try:
        return str(uuid.UUID(v))
    except (ValueError, AttributeError, TypeError):
        return None


def root() -> Path:
    return Path(get_settings().audio_dir)


def path_for(user_id: str, doc_id: str, key: str) -> Path:
    u, d = _uid(user_id), _uid(doc_id)
    if not u or not d or not key.isalnum():
        raise ValueError("Geçersiz önbellek yolu")
    return root() / u / d / f"{key}.mp3"


def read(path: Path) -> bytes | None:
    try:
        data = path.read_bytes()
        os.utime(path)  # kullanılan dosya süresiyle birlikte taze kalsın
        return data
    except FileNotFoundError:
        return None


def exists(path: Path) -> bool:
    return path.is_file()


def write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    tmp.write_bytes(data)
    tmp.replace(path)  # yarım dosya asla görünmez


def purge_document(user_id: str, doc_id: str) -> None:
    u, d = _uid(user_id), _uid(doc_id)
    if u and d:
        shutil.rmtree(root() / u / d, ignore_errors=True)


def purge_user(user_id: str) -> None:
    u = _uid(user_id)
    if u:
        shutil.rmtree(root() / u, ignore_errors=True)


def cleanup(ttl_days: int) -> int:
    """Süresi dolmuş dosyaları ve boş klasörleri siler. Silinen dosya sayısını döndürür."""
    base = root()
    if not base.is_dir():
        return 0
    cutoff = time.time() - ttl_days * 86400
    n = 0
    for f in base.rglob("*"):
        try:
            if f.is_file() and f.stat().st_mtime < cutoff:
                f.unlink()
                n += 1
        except OSError:
            continue
    for d in sorted((p for p in base.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        try:
            d.rmdir()  # yalnızca boşsa silinir
        except OSError:
            pass
    return n


async def cleanup_loop() -> None:
    while True:
        try:
            n = await asyncio.to_thread(cleanup, get_settings().audio_ttl_days)
            if n:
                log.info("Süresi dolan %d ses dosyası silindi", n)
        except Exception:
            log.exception("Ses önbelleği temizlenemedi")
        await asyncio.sleep(3600)
