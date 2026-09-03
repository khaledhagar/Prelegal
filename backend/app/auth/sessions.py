"""Signed-in browsers.

A session is an opaque random token held in an httpOnly cookie. The database
stores only its SHA-256, so reading the `sessions` table gives an attacker
nothing they can present as a cookie -- the same reasoning as storing password
hashes rather than passwords.

Signing out deletes the row, which is the reason for keeping server state at
all: a self-contained signed token cannot be revoked before it expires.
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
from dataclasses import dataclass

#: The cookie the browser sends back. Read only by the server.
COOKIE_NAME = "prelegal_session"

#: 32 bytes of randomness, URL-safe. Far past guessing.
_TOKEN_BYTES = 32


@dataclass(frozen=True)
class User:
    id: int
    email: str
    name: str


def _fingerprint(token: str) -> str:
    """What goes in the database. A plain hash: the token is already
    high-entropy random, so there is nothing for a salt to defend against."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue(connection: sqlite3.Connection, user_id: int) -> str:
    """Starts a session and returns the token to hand to the browser."""
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    with connection:
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)",
            (_fingerprint(token), user_id),
        )
    return token


def resolve(connection: sqlite3.Connection, token: str | None) -> User | None:
    """The user this token belongs to, or None if it belongs to nobody."""
    if not token:
        return None

    row = connection.execute(
        """
        SELECT users.id, users.email, users.name
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
        """,
        (_fingerprint(token),),
    ).fetchone()

    return User(id=row["id"], email=row["email"], name=row["name"]) if row else None


def revoke_all_for_user(
    connection: sqlite3.Connection, user_id: int, *, keep: str | None = None
) -> None:
    """
    Ends every session this user has, optionally sparing one.

    Used when the password changes. Changing a password is how someone reacts
    to a session they no longer trust, so leaving the others signed in would
    defeat the point -- but signing them out of the browser they are holding
    would read as a failure, hence `keep`.

    Does not commit. It belongs in the same transaction as the password change
    that prompted it -- a new password with the old sessions still live, or the
    reverse, is worse than either half failing outright.
    """
    if keep:
        connection.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user_id, _fingerprint(keep)),
        )
    else:
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def revoke(connection: sqlite3.Connection, token: str | None) -> None:
    """Ends one session. Silent when the token is already gone -- signing out
    twice is not an error worth telling anyone about."""
    if not token:
        return
    with connection:
        connection.execute(
            "DELETE FROM sessions WHERE token_hash = ?", (_fingerprint(token),)
        )
