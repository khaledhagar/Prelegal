"""Liveness and readiness.

The start scripts poll this until it answers before reporting the stack is up,
so it has to fail while the database is still being built rather than as soon as
the socket is open.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.dependencies import DbDep

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: str
    database: str


@router.get("/health")
def health(db: DbDep) -> Health:
    # Reading the schema, not just opening the file: sqlite3.connect() happily
    # creates an empty database, so a successful connection on its own would
    # report "ready" for a database that has no tables in it.
    table = db.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).fetchone()
    return Health(status="ok", database="ready" if table else "uninitialised")
