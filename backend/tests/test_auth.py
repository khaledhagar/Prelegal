"""Registering, signing in, and signing out.

Half of these are ordinary behaviour and half are the security properties the
endpoint is supposed to have. Both matter, and the second half is the half that
fails silently if someone refactors carelessly.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.auth.passwords import MINIMUM_LENGTH, hash_password, verify_password
from app.auth.sessions import COOKIE_NAME
from app.db import connect
from tests.conftest import TEST_ACCOUNT


def signup(client: TestClient, **overrides: str):
    return client.post("/api/auth/signup", json={**TEST_ACCOUNT, **overrides})


# --- passwords -------------------------------------------------------------


def test_a_password_verifies_against_its_own_hash() -> None:
    stored = hash_password("correct-horse-battery")
    assert verify_password("correct-horse-battery", stored)


def test_a_wrong_password_does_not_verify() -> None:
    stored = hash_password("correct-horse-battery")
    assert not verify_password("correct-horse-stapler", stored)


def test_the_same_password_hashes_differently_every_time() -> None:
    # A fresh salt each time, so two people who chose the same password do not
    # give each other away by having the same hash.
    assert hash_password("correct-horse") != hash_password("correct-horse")


def test_the_hash_does_not_contain_the_password() -> None:
    assert "correct-horse" not in hash_password("correct-horse")


def test_a_corrupt_record_fails_the_login_rather_than_the_request() -> None:
    for broken in ("", "nonsense", "scrypt$bad", "md5$1$1$1$aa$bb"):
        assert verify_password("correct-horse", broken) is False


# --- signing up ------------------------------------------------------------


def test_signing_up_creates_an_account(client: TestClient) -> None:
    response = signup(client)

    assert response.status_code == 201
    assert response.json() == {
        "id": 1,
        "email": "ada@acme.com",
        "name": "Ada Lovelace",
    }


def test_signing_up_signs_you_in(client: TestClient) -> None:
    signup(client)
    assert client.get("/api/auth/me").status_code == 200


def test_the_session_cookie_cannot_be_read_by_script(client: TestClient) -> None:
    # The whole reason for a cookie rather than a token in localStorage.
    header = signup(client).headers["set-cookie"].lower()

    assert "httponly" in header
    assert "samesite=lax" in header


def test_the_response_never_contains_the_token(client: TestClient) -> None:
    body = signup(client).text
    token = client.cookies.get(COOKIE_NAME)

    assert token is not None
    assert token not in body


def test_the_response_never_contains_the_password_hash(client: TestClient) -> None:
    assert "password" not in signup(client).text.lower()


def test_email_is_treated_case_insensitively(client: TestClient) -> None:
    signup(client, email="Ada@Acme.COM")

    assert signup(client, email="ada@acme.com").status_code == 409


def test_email_is_stored_normalised(client: TestClient) -> None:
    assert signup(client, email="  Ada@Acme.COM  ").json()["email"] == "ada@acme.com"


def test_a_taken_email_is_refused(client: TestClient) -> None:
    signup(client)

    response = signup(client, name="Someone Else")

    assert response.status_code == 409
    assert "already has an account" in response.json()["detail"]


def test_a_short_password_is_refused(client: TestClient) -> None:
    response = signup(client, password="a" * (MINIMUM_LENGTH - 1))

    assert response.status_code == 422
    assert str(MINIMUM_LENGTH) in response.json()["detail"]


def test_a_refused_password_creates_no_account(client: TestClient) -> None:
    signup(client, password="short")

    assert client.post("/api/auth/login", json=TEST_ACCOUNT).status_code == 401


def test_the_database_stores_a_hash_not_a_password(
    client: TestClient, database_path: Path
) -> None:
    signup(client)

    connection = connect(database_path)
    try:
        stored = connection.execute(
            "SELECT password_hash FROM users WHERE email = 'ada@acme.com'"
        ).fetchone()["password_hash"]
    finally:
        connection.close()

    assert TEST_ACCOUNT["password"] not in stored
    assert stored.startswith("scrypt$")


# --- signing in ------------------------------------------------------------


def test_signing_in_with_the_right_password(client: TestClient) -> None:
    signup(client)
    client.post("/api/auth/logout")

    response = client.post(
        "/api/auth/login",
        json={"email": TEST_ACCOUNT["email"], "password": TEST_ACCOUNT["password"]},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "ada@acme.com"


def test_signing_in_is_case_insensitive_about_the_email(client: TestClient) -> None:
    signup(client)
    client.post("/api/auth/logout")

    response = client.post(
        "/api/auth/login",
        json={"email": "ADA@ACME.COM", "password": TEST_ACCOUNT["password"]},
    )

    assert response.status_code == 200


def test_a_wrong_password_is_refused(client: TestClient) -> None:
    signup(client)

    response = client.post(
        "/api/auth/login",
        json={"email": TEST_ACCOUNT["email"], "password": "not-the-password"},
    )

    assert response.status_code == 401


def test_an_unknown_email_and_a_wrong_password_are_indistinguishable(
    client: TestClient,
) -> None:
    # Otherwise the endpoint becomes a way to find out who has an account here.
    signup(client)

    wrong_password = client.post(
        "/api/auth/login",
        json={"email": TEST_ACCOUNT["email"], "password": "not-the-password"},
    )
    unknown_email = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "not-the-password"},
    )

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json()


# --- the session ------------------------------------------------------------


def test_me_says_who_is_signed_in(signed_in_client: TestClient) -> None:
    assert signed_in_client.get("/api/auth/me").json()["email"] == "ada@acme.com"


def test_me_refuses_a_stranger(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_refuses_an_invented_token(client: TestClient) -> None:
    client.cookies.set(COOKIE_NAME, "a-token-someone-made-up")

    assert client.get("/api/auth/me").status_code == 401


def test_signing_out_ends_the_session(signed_in_client: TestClient) -> None:
    assert signed_in_client.post("/api/auth/logout").status_code == 204
    assert signed_in_client.get("/api/auth/me").status_code == 401


def test_signing_out_deletes_the_session_server_side(
    signed_in_client: TestClient, database_path: Path
) -> None:
    # Clearing the cookie alone would leave a token that still works for
    # anyone who kept a copy.
    token = signed_in_client.cookies.get(COOKIE_NAME)
    signed_in_client.post("/api/auth/logout")

    signed_in_client.cookies.set(COOKIE_NAME, token)

    assert signed_in_client.get("/api/auth/me").status_code == 401


def test_signing_out_twice_is_not_an_error(signed_in_client: TestClient) -> None:
    signed_in_client.post("/api/auth/logout")
    assert signed_in_client.post("/api/auth/logout").status_code == 204


def test_the_stored_session_is_not_the_cookie(
    signed_in_client: TestClient, database_path: Path
) -> None:
    # Reading the table must not hand anyone a usable cookie.
    token = signed_in_client.cookies.get(COOKIE_NAME)

    connection = connect(database_path)
    try:
        rows = connection.execute("SELECT token_hash FROM sessions").fetchall()
    finally:
        connection.close()

    assert len(rows) == 1
    assert rows[0]["token_hash"] != token


def test_two_sessions_can_exist_at_once(
    signed_in_client: TestClient, other_client: TestClient
) -> None:
    # Signing in on a phone must not sign you out on a laptop.
    assert signed_in_client.get("/api/auth/me").json()["email"] == "ada@acme.com"
    assert other_client.get("/api/auth/me").json()["email"] == "grace@navy.mil"


def test_deleting_a_user_takes_their_sessions_with_them(
    signed_in_client: TestClient, database_path: Path
) -> None:
    # The foreign key is declared ON DELETE CASCADE; SQLite only honours it
    # when `PRAGMA foreign_keys` is on, which `connect` does.
    connection = connect(database_path)
    try:
        with connection:
            connection.execute("DELETE FROM users WHERE email = 'ada@acme.com'")
        remaining = connection.execute("SELECT COUNT(*) AS n FROM sessions").fetchone()
    finally:
        connection.close()

    assert remaining["n"] == 0


# --- the rest of the app ----------------------------------------------------


def test_health_needs_no_account(client: TestClient) -> None:
    assert client.get("/api/health").status_code == 200


def test_the_catalogue_needs_no_account(client: TestClient) -> None:
    # Browsing what the product can draft is not privileged.
    assert client.get("/api/documents").status_code == 200
