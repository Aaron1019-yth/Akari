from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import chat, files, planner, practice, profile, sessions, settings
from backend.db.database import init_database


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_database()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Akari API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "name": "Akari"}

    app.include_router(planner.router, prefix="/api/planner", tags=["planner"])
    app.include_router(practice.router, prefix="/api", tags=["practice"])
    app.include_router(profile.router, prefix="/api/profile", tags=["profile"])
    app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
    app.include_router(files.router, prefix="/api/files", tags=["files"])
    app.include_router(settings.router, prefix="/api", tags=["settings"])
    app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
    return app


app = create_app()
