"""The database outlives the process that created it.

These tests pin that down, because "survives a restart" is the promise accounts
and saved drafts rest on. `init_db` has to be safe to run against a database
that already holds data -- it is called on every startup, and most startups now
find a file already there.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.db import connect, init_db, transaction


def table_names(database_path: Path) -> set[str]:
    with transaction(database_path) as connection:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    return {row["name"] for row in rows}


def test_creates_the_users_table(database_path: Path) -> None:
    init_db(database_path)
    assert "users" in table_names(database_path)


def test_creates_missing_parent_directories(tmp_path: Path) -> None:
    nested = tmp_path / "var" / "data" / "prelegal.db"
    init_db(nested)
    assert nested.exists()


def test_keeps_everything_from_the_previous_run(database_path: Path) -> None:
    """The point of the whole change: a restart must not cost anyone an account."""
    init_db(database_path)
    with transaction(database_path) as connection:
        connection.execute(
            "INSERT INTO users (email, name, password_hash)"
            " VALUES ('ada@acme.com', 'Ada Lovelace', 'x')"
        )

    init_db(database_path)

    with transaction(database_path) as connection:
        remaining = connection.execute("SELECT count(*) AS n FROM users").fetchone()
    assert remaining["n"] == 1


def test_keeps_rows_that_are_still_in_the_write_ahead_log(database_path: Path) -> None:
    """
    In WAL mode a committed row can live in the `-wal` sibling rather than the
    database file itself. Startup used to delete that sibling, which would
    discard exactly the writes made just before the process stopped.
    """
    init_db(database_path)

    connection = connect(database_path)
    connection.execute("PRAGMA journal_mode = WAL")
    with connection:
        connection.execute(
            "INSERT INTO users (email, name, password_hash)"
            " VALUES ('ada@acme.com', 'Ada Lovelace', 'x')"
        )
    # Left open deliberately: closing checkpoints the WAL into the main file,
    # which is the one case where deleting it would have been harmless.
    wal = database_path.with_name(database_path.name + "-wal")
    assert wal.exists(), "expected the row to be sitting in the WAL"

    init_db(database_path)
    connection.close()

    with transaction(database_path) as reopened:
        row = reopened.execute("SELECT email FROM users").fetchone()
    assert row["email"] == "ada@acme.com"


def test_running_twice_leaves_one_set_of_tables(database_path: Path) -> None:
    """`CREATE TABLE` on an existing table raises; the schema has to be idempotent."""
    init_db(database_path)
    init_db(database_path)

    assert {"users", "sessions", "drafts"} <= table_names(database_path)


def test_an_existing_database_keeps_its_drafts(database_path: Path) -> None:
    init_db(database_path)
    with transaction(database_path) as connection:
        connection.execute(
            "INSERT INTO users (email, name, password_hash)"
            " VALUES ('ada@acme.com', 'Ada Lovelace', 'x')"
        )
        connection.execute(
            "INSERT INTO drafts (user_id, document_type, title, values_json)"
            " VALUES (1, 'mutual-nda', 'Acme + Globex', '{}')"
        )

    init_db(database_path)

    with transaction(database_path) as connection:
        row = connection.execute("SELECT title FROM drafts").fetchone()
    assert row["title"] == "Acme + Globex"


def test_rows_are_addressable_by_column_name(database_path: Path) -> None:
    init_db(database_path)
    with transaction(database_path) as connection:
        connection.execute(
            "INSERT INTO users (email, name, password_hash)"
            " VALUES ('ada@acme.com', 'Ada Lovelace', 'x')"
        )
        row = connection.execute("SELECT email, name FROM users").fetchone()
    assert row["email"] == "ada@acme.com"
    assert row["name"] == "Ada Lovelace"


def test_email_is_unique(database_path: Path) -> None:
    init_db(database_path)
    with transaction(database_path) as connection:
        connection.execute(
            "INSERT INTO users (email, name, password_hash)"
            " VALUES ('ada@acme.com', 'Ada Lovelace', 'x')"
        )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO users (email, name, password_hash)"
                " VALUES ('ada@acme.com', 'Ada Byron', 'x')"
            )
