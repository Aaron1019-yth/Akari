import tempfile
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import backend.db.database as db_module
from backend.db import models
from backend.db.database import get_db
from backend.main import app


@pytest.fixture
def client():
    db_dir = Path(tempfile.mkdtemp())
    db_path = db_dir / "test.db"
    database_url = f"sqlite:///{db_path}"

    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    models.Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    # Override DATA_DIR for files_service and chat_service
    import backend.services.files_service as fs
    import backend.services.chat_service as cs

    original_data_dir = db_module.DATA_DIR
    original_files_dir = fs.FILES_DIR
    original_index_path = fs.INDEX_PATH
    original_sessions_dir = cs.SESSIONS_DIR

    db_module.DATA_DIR = db_dir
    fs.FILES_DIR = db_dir / "uploads"
    fs.INDEX_PATH = fs.FILES_DIR / "index.json"
    cs.SESSIONS_DIR = db_dir / "memory" / "sessions"

    yield TestClient(app)

    del app.dependency_overrides[get_db]
    db_module.DATA_DIR = original_data_dir
    fs.FILES_DIR = original_files_dir
    fs.INDEX_PATH = original_index_path
    cs.SESSIONS_DIR = original_sessions_dir
    shutil.rmtree(db_dir, ignore_errors=True)
