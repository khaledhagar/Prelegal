"""The database is meant to be temporary and rebuilt on every startup.

These tests pin that down, because "recreated from scratch each time" is a
promise the rest of the design leans on -- it is why there are no migrations.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from app.db import init_db, transaction


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


def test_discards_everything_from_the_previous_run(database_path: Path) -> None:
    init_db(database_path)
    with transaction(database_path) as connection:
        connection.execute(
            "INSERT INTO users (email, name, password_hash)"
            " VALUES ('ada@acme.com', 'Ada Lovelace', 'x')"
        )

    init_db(database_path)

    with transaction(database_path) as connection:
        remaining = connection.execute("SELECT count(*) AS n FROM users").fetchone()
    assert remaining["n"] == 0


def test_removes_the_write_ahead_log_alongside_the_database(database_path: Path) -> None:
    init_db(database_path)
    wal = database_path.with_name(database_path.name + "-wal")
    wal.write_bytes(b"stale")

    init_db(database_path)

    assert not wal.exists()


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
