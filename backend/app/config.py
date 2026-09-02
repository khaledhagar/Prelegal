"""Where the backend finds its database and the built frontend.

Both are overridable by environment variable so the Docker image can put them
where it likes without the code needing to know it is in a container. The
defaults are the ones that make `uv run uvicorn app.main:app` work from a
checkout with no configuration at all.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent

DEFAULT_DATABASE_PATH = BACKEND_ROOT / "var" / "prelegal.db"
DEFAULT_STATIC_DIR = REPO_ROOT / "frontend" / "out"


@dataclass(frozen=True)
class Settings:
    """Runtime configuration, resolved once at startup."""

    database_path: Path
    """SQLite file. Deleted and recreated on every startup -- see `app.db`."""

    static_dir: Path
    """The frontend's `next build` output. Absent during backend-only work."""

    @property
    def serves_frontend(self) -> bool:
        return self.static_dir.is_dir()


def _path_from_env(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser().resolve() if value else default


def load_settings() -> Settings:
    return Settings(
        database_path=_path_from_env("PRELEGAL_DATABASE_PATH", DEFAULT_DATABASE_PATH),
        static_dir=_path_from_env("PRELEGAL_STATIC_DIR", DEFAULT_STATIC_DIR),
    )
