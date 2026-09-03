"""Changing a password, and resetting a forgotten one.

Two flows with different threat models. Changing requires the current password,
so the danger is a hijacked session quietly locking the owner out. Resetting
requires only a token, so the danger is the token: it must be unguessable,
short-lived, usable once, and it must never confirm to a stranger whether an
address has an account here.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.auth import resets
from app.auth.sessions import COOKIE_NAME
from tests.conftest import TEST_ACCOUNT

NEW_PASSWORD = "a-considerably-better-one"


def signed_in_cookie(client: TestClient) -> str:
    return client.cookies[COOKIE_NAME]


def request_reset(client: TestClient, email: str):
    return client.post("/api/auth/forgot", json={"email": email})


# --------------------------------------------------------------------------
# Changing a password while signed in
# --------------------------------------------------------------------------


def test_changes_the_password(signed_in_client: TestClient) -> None:
    response = signed_in_client.post(
        "/api/auth/password",
        json={
            "currentPassword": TEST_ACCOUNT["password"],
            "newPassword": NEW_PASSWORD,
        },
    )
    assert response.status_code == 204, response.text

    signed_in_client.post("/api/auth/logout")
    assert (
        signed_in_client.post(
            "/api/auth/login",
            json={"email": TEST_ACCOUNT["email"], "password": NEW_PASSWORD},
        ).status_code
        == 200
    )


def test_the_old_password_stops_working(signed_in_client: TestClient) -> None:
    signed_in_client.post(
        "/api/auth/password",
        json={
            "currentPassword": TEST_ACCOUNT["password"],
            "newPassword": NEW_PASSWORD,
        },
    )
    signed_in_client.post("/api/auth/logout")

    response = signed_in_client.post(
        "/api/auth/login",
        json={"email": TEST_ACCOUNT["email"], "password": TEST_ACCOUNT["password"]},
    )
    assert response.status_code == 401


def test_the_current_password_must_be_right(signed_in_client: TestClient) -> None:
    """Otherwise a borrowed session is enough to take the account for good."""
    response = signed_in_client.post(
        "/api/auth/password",
        json={"currentPassword": "not-it", "newPassword": NEW_PASSWORD},
    )
    assert response.status_code == 403

    # And nothing changed.
    signed_in_client.post("/api/auth/logout")
    assert (
        signed_in_client.post(
            "/api/auth/login",
            json={
                "email": TEST_ACCOUNT["email"],
                "password": TEST_ACCOUNT["password"],
            },
        ).status_code
        == 200
    )


def test_the_new_password_must_be_long_enough(signed_in_client: TestClient) -> None:
    response = signed_in_client.post(
        "/api/auth/password",
        json={"currentPassword": TEST_ACCOUNT["password"], "newPassword": "short"},
    )
    assert response.status_code == 422


def test_changing_requires_a_session(client: TestClient) -> None:
    response = client.post(
        "/api/auth/password",
        json={"currentPassword": "whatever", "newPassword": NEW_PASSWORD},
    )
    assert response.status_code == 401


def test_changing_keeps_the_session_that_did_it(signed_in_client: TestClient) -> None:
    """Being signed out of the browser you just used feels like a failure."""
    signed_in_client.post(
        "/api/auth/password",
        json={
            "currentPassword": TEST_ACCOUNT["password"],
            "newPassword": NEW_PASSWORD,
        },
    )
    assert signed_in_client.get("/api/auth/me").status_code == 200


def test_changing_ends_every_other_session(
    signed_in_client: TestClient, database_path: Path
) -> None:
    """A password change is how someone reacts to a session they cannot trust."""
    other = TestClient(signed_in_client.app)
    other.post(
        "/api/auth/login",
        json={"email": TEST_ACCOUNT["email"], "password": TEST_ACCOUNT["password"]},
    )
    assert other.get("/api/auth/me").status_code == 200

    signed_in_client.post(
        "/api/auth/password",
        json={
            "currentPassword": TEST_ACCOUNT["password"],
            "newPassword": NEW_PASSWORD,
        },
    )

    assert other.get("/api/auth/me").status_code == 401


# --------------------------------------------------------------------------
# Asking for a reset
# --------------------------------------------------------------------------


def test_forgot_accepts_a_known_address(signed_in_client: TestClient) -> None:
    assert request_reset(signed_in_client, TEST_ACCOUNT["email"]).status_code == 202


def test_forgot_says_the_same_thing_for_an_unknown_address(
    signed_in_client: TestClient,
) -> None:
    """The endpoint must not become a way to find out who has an account."""
    known = request_reset(signed_in_client, TEST_ACCOUNT["email"])
    unknown = request_reset(signed_in_client, "nobody@example.com")

    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


def test_forgot_makes_no_token_for_an_unknown_address(
    signed_in_client: TestClient, database_path: Path
) -> None:
    request_reset(signed_in_client, "nobody@example.com")

    connection = sqlite3.connect(database_path)
    count = connection.execute("SELECT count(*) FROM password_resets").fetchone()[0]
    connection.close()
    assert count == 0


def test_the_raw_token_is_never_stored(
    signed_in_client: TestClient, database_path: Path
) -> None:
    """Same reasoning as sessions: the database should hold nothing presentable."""
    token = issue_token_for(signed_in_client, database_path)

    connection = sqlite3.connect(database_path)
    rows = connection.execute("SELECT token_hash FROM password_resets").fetchall()
    connection.close()

    assert rows
    assert all(row[0] != token for row in rows)


def issue_token_for(client: TestClient, database_path: Path) -> str:
    """A reset token for the test account, taken the way the app makes one."""
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    try:
        user_id = connection.execute(
            "SELECT id FROM users WHERE email = ?", (TEST_ACCOUNT["email"],)
        ).fetchone()["id"]
        return resets.issue(connection, user_id)
    finally:
        connection.close()


# --------------------------------------------------------------------------
# Redeeming a reset
# --------------------------------------------------------------------------


def test_a_token_sets_a_new_password(
    signed_in_client: TestClient, database_path: Path
) -> None:
    token = issue_token_for(signed_in_client, database_path)

    response = signed_in_client.post(
        "/api/auth/reset", json={"token": token, "newPassword": NEW_PASSWORD}
    )
    assert response.status_code == 204, response.text

    signed_in_client.cookies.clear()
    assert (
        signed_in_client.post(
            "/api/auth/login",
            json={"email": TEST_ACCOUNT["email"], "password": NEW_PASSWORD},
        ).status_code
        == 200
    )


def test_a_token_works_only_once(
    signed_in_client: TestClient, database_path: Path
) -> None:
    token = issue_token_for(signed_in_client, database_path)

    first = signed_in_client.post(
        "/api/auth/reset", json={"token": token, "newPassword": NEW_PASSWORD}
    )
    second = signed_in_client.post(
        "/api/auth/reset", json={"token": token, "newPassword": "another-one-entirely"}
    )

    assert first.status_code == 204
    assert second.status_code == 400


def test_an_expired_token_is_refused(
    signed_in_client: TestClient, database_path: Path
) -> None:
    token = issue_token_for(signed_in_client, database_path)

    connection = sqlite3.connect(database_path)
    with connection:
        connection.execute(
            "UPDATE password_resets SET expires_at = datetime('now', '-1 minute')"
        )
    connection.close()

    response = signed_in_client.post(
        "/api/auth/reset", json={"token": token, "newPassword": NEW_PASSWORD}
    )
    assert response.status_code == 400


def test_a_made_up_token_is_refused(signed_in_client: TestClient) -> None:
    response = signed_in_client.post(
        "/api/auth/reset",
        json={"token": "not-a-real-token", "newPassword": NEW_PASSWORD},
    )
    assert response.status_code == 400


def test_reset_rejects_a_short_password_without_spending_the_token(
    signed_in_client: TestClient, database_path: Path
) -> None:
    """A typo in the new password should not force another reset request."""
    token = issue_token_for(signed_in_client, database_path)

    assert (
        signed_in_client.post(
            "/api/auth/reset", json={"token": token, "newPassword": "short"}
        ).status_code
        == 422
    )
    assert (
        signed_in_client.post(
            "/api/auth/reset", json={"token": token, "newPassword": NEW_PASSWORD}
        ).status_code
        == 204
    )


def test_reset_ends_every_session(
    signed_in_client: TestClient, database_path: Path
) -> None:
    """Whoever forced the reset should not still be signed in afterwards."""
    token = issue_token_for(signed_in_client, database_path)

    signed_in_client.post(
        "/api/auth/reset", json={"token": token, "newPassword": NEW_PASSWORD}
    )

    assert signed_in_client.get("/api/auth/me").status_code == 401


def test_using_a_token_invalidates_any_other_outstanding_token(
    signed_in_client: TestClient, database_path: Path
) -> None:
    """Two requests, then one used: the older link must not still work."""
    first = issue_token_for(signed_in_client, database_path)
    second = issue_token_for(signed_in_client, database_path)

    assert (
        signed_in_client.post(
            "/api/auth/reset", json={"token": second, "newPassword": NEW_PASSWORD}
        ).status_code
        == 204
    )
    assert (
        signed_in_client.post(
            "/api/auth/reset", json={"token": first, "newPassword": "yet-another-one"}
        ).status_code
        == 400
    )
