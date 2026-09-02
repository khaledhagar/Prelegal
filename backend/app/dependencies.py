"""Request-scoped dependencies.

Settings are read off `app.state` rather than from a module-level singleton, so
a test can stand up an app pointed at a temporary database without reaching into
global state.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings
from app.db import session


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_db(settings: SettingsDep) -> Iterator[sqlite3.Connection]:
    yield from session(settings.database_path)


DbDep = Annotated[sqlite3.Connection, Depends(get_db)]
