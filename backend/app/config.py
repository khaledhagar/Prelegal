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

from dotenv import load_dotenv

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

    openrouter_api_key: str | None
    """
    Credentials for the chat assistant. Absent is a supported state: the rest of
    the app works and /api/chat says plainly that it is not configured, which
    beats a container that refuses to start.
    """

    secure_cookies: bool = False
    """
    Whether the session cookie is marked Secure.

    Off by default because the product runs on http://localhost:8000, and a
    Secure cookie is simply dropped there -- nobody could sign in. Set
    PRELEGAL_SECURE_COOKIES=1 when serving over HTTPS, which is the only place
    it can be honoured.
    """

    @property
    def serves_frontend(self) -> bool:
        return self.static_dir.is_dir()

    @property
    def chat_enabled(self) -> bool:
        return bool(self.openrouter_api_key)


def _path_from_env(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser().resolve() if value else default


def _flag_from_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def load_settings() -> Settings:
    # Convenience for `uv run uvicorn ...` from a checkout: the key lives in the
    # repository's .env. Real environment variables win, which is what the
    # container relies on -- the image deliberately ships without a .env.
    load_dotenv(REPO_ROOT / ".env", override=False)

    return Settings(
        database_path=_path_from_env("PRELEGAL_DATABASE_PATH", DEFAULT_DATABASE_PATH),
        static_dir=_path_from_env("PRELEGAL_STATIC_DIR", DEFAULT_STATIC_DIR),
        openrouter_api_key=os.environ.get("OPENROUTER_API_KEY") or None,
        secure_cookies=_flag_from_env("PRELEGAL_SECURE_COOKIES"),
    )
