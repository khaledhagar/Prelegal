from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture
def database_path(tmp_path: Path) -> Path:
    return tmp_path / "prelegal.db"


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """A stand-in for the frontend's `next build` output.

    Shaped like the real export -- `index.html` at the root, a directory with
    its own `index.html` for a nested route, and a `404.html` -- because those
    are exactly the cases the static mount has to resolve.
    """
    out = tmp_path / "out"
    (out / "app").mkdir(parents=True)
    (out / "index.html").write_text("<html>sign in</html>", encoding="utf-8")
    (out / "app" / "index.html").write_text("<html>platform</html>", encoding="utf-8")
    (out / "404.html").write_text("<html>not found</html>", encoding="utf-8")
    return out


@pytest.fixture
def client(database_path: Path, static_dir: Path) -> Iterator[TestClient]:
    """The whole app: API, database and frontend, as it is actually deployed."""
    app = create_app(
        Settings(
            database_path=database_path,
            static_dir=static_dir,
            # Present so /api/chat is reachable. No test makes a real call --
            # `tests/test_chat_api.py` replaces the LLM.
            openrouter_api_key="test-key",
        )
    )
    # Entering the context manager runs the lifespan, which builds the database.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def api_only_client(database_path: Path, tmp_path: Path) -> Iterator[TestClient]:
    """The app as it runs during backend-only work, with no frontend built."""
    app = create_app(
        Settings(
            database_path=database_path,
            static_dir=tmp_path / "never-built",
            openrouter_api_key="test-key",
        )
    )
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def unconfigured_client(database_path: Path, static_dir: Path) -> Iterator[TestClient]:
    """The app with no OPENROUTER_API_KEY -- everything but chat still works."""
    app = create_app(
        Settings(
            database_path=database_path,
            static_dir=static_dir,
            openrouter_api_key=None,
        )
    )
    with TestClient(app) as test_client:
        yield test_client
