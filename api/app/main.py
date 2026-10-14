from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import me

s = get_settings()
app = FastAPI(title="Akademik Asistan API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in s.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Her yeni router varsayılan olarak girişli olmalıdır (Depends(get_current_user)).
app.include_router(me.router)


@app.get("/health", include_in_schema=False)  # tek kamusal uç nokta (izleme için)
def health():
    return {"status": "ok"}
