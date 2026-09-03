"""Creating and finding accounts."""

from __future__ import annotations

import sqlite3

from app.auth.passwords import hash_password, verify_password
from app.auth.sessions import User


class EmailAlreadyRegistered(Exception):
    """That email already has an account."""


def normalise_email(email: str) -> str:
    return email.strip().lower()


def create(connection: sqlite3.Connection, *, name: str, email: str, password: str) -> User:
    """
    Registers an account.

    The hash is computed before the insert so a rejected password never reaches
    the database, and the unique index -- not a prior SELECT -- is what decides
    whether the email is taken. Checking first would leave a gap between the
    check and the insert in which a second signup could slip through.
    """
    password_hash = hash_password(password)
    address = normalise_email(email)

    try:
        with connection:
            cursor = connection.execute(
                "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
                (address, name.strip(), password_hash),
            )
    except sqlite3.IntegrityError as error:
        raise EmailAlreadyRegistered(address) from error

    return User(id=int(cursor.lastrowid), email=address, name=name.strip())


def authenticate(
    connection: sqlite3.Connection, *, email: str, password: str
) -> User | None:
    """
    The user, if the password is right. None otherwise -- the caller must not
    distinguish "no such account" from "wrong password" when it answers, or the
    endpoint becomes a way to discover who has an account here.
    """
    row = connection.execute(
        "SELECT id, email, name, password_hash FROM users WHERE email = ?",
        (normalise_email(email),),
    ).fetchone()

    if row is None:
        # Spend the time anyway. Returning early on an unknown email makes that
        # case measurably faster than a wrong password, which is the same leak
        # by a different route.
        verify_password(password, "scrypt$16384$8$1$00$00")
        return None

    if not verify_password(password, row["password_hash"]):
        return None

    return User(id=row["id"], email=row["email"], name=row["name"])
