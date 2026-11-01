"""Shared test fixtures.

DATABASE_URL is set to a throwaway SQLite file BEFORE any app import so the
engine and cached settings bind to the test database.
"""
from __future__ import annotations

import os
import pathlib
import tempfile

_TMP = tempfile.mkdtemp(prefix="curvin-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{pathlib.Path(_TMP).joinpath('test.db').as_posix()}"
os.environ["FRONTEND_URL"] = "http://localhost:3000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401  (register models)
from app.core.database import Base, engine  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture()
def client():
    """Fresh schema for every test; TestClient runs startup (creates tables)."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(create_app()) as c:
        yield c
