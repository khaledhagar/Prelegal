"""Configuration resolution."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import DEFAULT_DATABASE_PATH, DEFAULT_STATIC_DIR, Settings, load_settings


def test_defaults_point_at_the_checkout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PRELEGAL_DATABASE_PATH", raising=False)
    monkeypatch.delenv("PRELEGAL_STATIC_DIR", raising=False)

    settings = load_settings()

    assert settings.database_path == DEFAULT_DATABASE_PATH
    assert settings.static_dir == DEFAULT_STATIC_DIR
    # The static default has to be the frontend's build output, or the container
    # would come up serving nothing.
    assert settings.static_dir.parts[-2:] == ("frontend", "out")


def test_environment_overrides_both_paths(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("PRELEGAL_DATABASE_PATH", str(tmp_path / "db.sqlite"))
    monkeypatch.setenv("PRELEGAL_STATIC_DIR", str(tmp_path / "static"))

    settings = load_settings()

    assert settings.database_path == (tmp_path / "db.sqlite").resolve()
    assert settings.static_dir == (tmp_path / "static").resolve()


def test_serves_frontend_is_false_until_the_directory_exists(tmp_path: Path) -> None:
    settings = Settings(database_path=tmp_path / "db", static_dir=tmp_path / "out")
    assert not settings.serves_frontend

    (tmp_path / "out").mkdir()
    assert settings.serves_frontend
