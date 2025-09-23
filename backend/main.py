from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.core.config import settings
from app.core.database import Base, engine

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.on_event("shutdown") 
def on_shutdown() -> None:
    """Cleanup resources on application shutdown"""
    engine.dispose()


app.include_router(api_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "MockMate API", "environment": settings.environment}
