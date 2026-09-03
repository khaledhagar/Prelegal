"""Password reset tokens.

A reset token is a bearer credential that outranks the password itself, so it
is treated like one: 32 bytes of randomness, stored only as its SHA-256, valid
for half an hour, and destroyed the moment it is used.

There is no email in this product yet, so `app.api.auth` writes the link to the
server log and whoever runs the deployment passes it on. That is a delivery
gap, not a security one -- the token is real, and reaching the log already
means owning the server. Swapping the log line for a send is the whole change
when mail arrives.
"""

from __future__ import annotations

import hashlib
import secrets
import sqlite3

#: How long a link stays good. Long enough to notice the message and act on it,
#: short enough that one left in a log or a chat window goes stale quickly.
TTL_MINUTES = 30

_TOKEN_BYTES = 32


def _fingerprint(token: str) -> str:
    """What goes in the database. A plain hash: the token is already
    high-entropy random, so there is nothing for a salt to defend against."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue(connection: sqlite3.Connection, user_id: int) -> str:
    """Creates a reset token and returns it. Only the caller ever sees it."""
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    with connection:
        connection.execute(
            """
            INSERT INTO password_resets (token_hash, user_id, expires_at)
            VALUES (?, ?, datetime('now', ?))
            """,
            (_fingerprint(token), user_id, f"+{TTL_MINUTES} minutes"),
        )
    return token


def redeem(connection: sqlite3.Connection, token: str) -> int | None:
    """
    The user this token belongs to, consuming it. None if it is no good.

    Expired, already used, and never-existed are one answer on purpose: the
    caller has nothing useful to tell apart, and distinguishing them would let
    someone probe which tokens once existed.

    Every outstanding token for the user goes, not just this one. Two requests
    in a row otherwise leave the older link live after the newer one has
    already changed the password.
    """
    row = connection.execute(
        """
        SELECT user_id FROM password_resets
        WHERE token_hash = ? AND expires_at > datetime('now')
        """,
        (_fingerprint(token),),
    ).fetchone()

    if row is None:
        return None

    user_id = int(row["user_id"])
    with connection:
        connection.execute("DELETE FROM password_resets WHERE user_id = ?", (user_id,))
    return user_id


def purge_expired(connection: sqlite3.Connection) -> None:
    """Housekeeping. Nothing depends on this -- `redeem` already refuses an
    expired row -- it just stops the table growing without bound."""
    with connection:
        connection.execute(
            "DELETE FROM password_resets WHERE expires_at <= datetime('now')"
        )
