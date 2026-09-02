"""SQLite access.

The database is explicitly temporary: it is deleted and rebuilt from
`schema.sql` every time the app starts, which is what the technical design asks
for while there is nothing worth keeping. That is also why there is no ORM and
no migration tool here -- neither earns its weight against a file that never
survives a restart. When the data becomes durable, this module is the seam to
replace.
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
    """Recreates the database from scratch, discarding anything already there."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database_path.unlink(missing_ok=True)
    # SQLite keeps the write-ahead log and shared memory in sibling files;
    # leaving them behind would reintroduce state the new database never had.
    for suffix in ("-wal", "-shm"):
        database_path.with_name(database_path.name + suffix).unlink(missing_ok=True)

    with transaction(database_path) as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def session(database_path: Path) -> Iterator[sqlite3.Connection]:
    """Yields a connection for the duration of one request, then closes it."""
    connection = connect(database_path)
    try:
        yield connection
    finally:
        connection.close()
