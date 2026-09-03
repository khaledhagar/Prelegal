"""Hashing and checking passwords.

Uses `hashlib.scrypt` from the standard library. scrypt is memory-hard, which
is the property that matters against someone with a stolen database and a GPU,
and it needs no dependency to compile into the runtime image -- the backend
ships on python:3.13-slim with no build toolchain.

The stored string carries its own parameters, so raising the cost later does
not invalidate the hashes already written:

    scrypt$16384$8$1$<salt-hex>$<hash-hex>
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

#: Cost parameters. n is the work factor; 2**14 keeps a single hash near the
#: tens-of-milliseconds mark, which is slow enough to matter to an attacker and
#: fast enough that a signup does not feel like a stall.
_N = 16384
_R = 8
_P = 1
_SALT_BYTES = 16
_KEY_BYTES = 32

#: Shortest password we will accept. Long enough to rule out the worst, short
#: enough not to push people towards writing it on a note.
MINIMUM_LENGTH = 8


class InvalidPassword(ValueError):
    """The password cannot be used. Carries a user-facing message."""


def _derive(password: str, salt: bytes, n: int, r: int, p: int) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=_KEY_BYTES
    )


def validate(password: str) -> None:
    """Raises `InvalidPassword` if the password is too short to accept."""
    if len(password) < MINIMUM_LENGTH:
        raise InvalidPassword(
            f"Choose a password of at least {MINIMUM_LENGTH} characters."
        )


def hash_password(password: str) -> str:
    """Returns the string to store. A fresh salt every time, so two people with
    the same password do not end up with the same hash."""
    validate(password)
    salt = secrets.token_bytes(_SALT_BYTES)
    derived = _derive(password, salt, _N, _R, _P)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${derived.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """
    Whether the password matches what was stored.

    Returns False rather than raising on a malformed record: a corrupt row
    should fail the login, not the request. The comparison is constant-time so
    the answer cannot be recovered a byte at a time from how long it took.
    """
    try:
        scheme, n, r, p, salt_hex, expected_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        derived = _derive(password, bytes.fromhex(salt_hex), int(n), int(r), int(p))
    except (ValueError, TypeError):
        return False

    return hmac.compare_digest(derived.hex(), expected_hex)
