"""SQLite access.

The database is durable: it is created if it is missing and otherwise left
exactly as it was found, so accounts and saved drafts survive a restart. The
schema is applied every startup and every statement in it is `IF NOT EXISTS`,
which makes that safe to repeat.

There is still no ORM and no migration tool. `schema.sql` can add tables and
indexes to an existing database but cannot alter or drop what is already there
-- see the note at the top of that file for where this has to grow.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(database_path: Path) -> sqlite3.Connection:
    """Opens a connection with the conventions the rest of the app assumes."""
    connection = sqlite3.connect(database_path)
    # Rows behave like mappings, so callers read `row["email"]` rather than
    # depending on column order.
    connection.row_factory = sqlite3.Row
    # SQLite leaves foreign keys off unless asked, per connection.
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def transaction(database_path: Path) -> Iterator[sqlite3.Connection]:
    """Runs a unit of work, committing on success and always closing after.

    `sqlite3.Connection` is itself a context manager, but it only manages the
    *transaction* -- it commits or rolls back and leaves the connection open.
    Relying on that alone leaks a file handle per call, which on Windows is
    enough to make the next `init_db` fail to delete the database it is
    replacing.
    """
    connection = connect(database_path)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def init_db(database_path: Path) -> None:
    """
    Makes sure the database exists and has the schema, keeping what is there.

    Called on every startup, so most of the time this finds a database that is
    already correct and does nothing. Nothing here deletes: the `-wal` and
    `-shm` siblings in particular hold committed rows that SQLite has not yet
    folded into the main file, so removing them would discard exactly the
    writes made just before the process stopped.
    """
    database_path.parent.mkdir(parents=True, exist_ok=True)

    with transaction(database_path) as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def session(database_path: Path) -> Iterator[sqlite3.Connection]:
    """Yields a connection for the duration of one request, then closes it."""
    connection = connect(database_path)
    try:
        yield connection
    finally:
        connection.close()
