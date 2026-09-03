"""Request-scoped dependencies.

Settings are read off `app.state` rather than from a module-level singleton, so
a test can stand up an app pointed at a temporary database without reaching into
global state.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.auth.sessions import COOKIE_NAME, User, resolve
from app.config import Settings
from app.db import session


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_db(settings: SettingsDep) -> Iterator[sqlite3.Connection]:
    yield from session(settings.database_path)


DbDep = Annotated[sqlite3.Connection, Depends(get_db)]


def get_current_user(request: Request, db: DbDep) -> User:
    """
    The signed-in user, or 401.

    This is the real access control. The route guard in the frontend is a
    convenience for the person using the app -- the frontend is static files,
    so anything that actually needs protecting is enforced here.
    """
    user = resolve(db, request.cookies.get(COOKIE_NAME))
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_optional_user(request: Request, db: DbDep) -> User | None:
    """The signed-in user if there is one. For endpoints that are readable
    either way and only need to know whether to personalise."""
    return resolve(db, request.cookies.get(COOKIE_NAME))


OptionalUser = Annotated[User | None, Depends(get_optional_user)]
