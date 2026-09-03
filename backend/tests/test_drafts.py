"""Saved agreements.

The behaviour is small; the isolation between users is the part worth pinning
down. Every one of these queries is scoped by the signed-in user, and a test
that stops holding would not otherwise fail visibly.
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

VALUES: dict[str, Any] = {
    "documentType": "mutual-nda",
    "fields": {"governingLaw": "Delaware", "purpose": "Evaluating a deal"},
    "parties": [
        {"company": "Acme Ltd", "printName": "", "title": "", "noticeAddress": ""},
        {"company": "Globex Inc", "printName": "", "title": "", "noticeAddress": ""},
    ],
}


def save(client: TestClient, **overrides: Any):
    payload = {
        "documentType": "mutual-nda",
        "title": "Mutual NDA — Acme & Globex",
        "values": VALUES,
        **overrides,
    }
    return client.post("/api/drafts", json=payload)


# --- saving and reading -----------------------------------------------------


def test_saving_returns_the_stored_row(signed_in_client: TestClient) -> None:
    response = save(signed_in_client)

    assert response.status_code == 201
    body = response.json()
    assert body["documentType"] == "mutual-nda"
    assert body["title"] == "Mutual NDA — Acme & Globex"
    assert body["id"] > 0


def test_a_saved_draft_appears_in_the_list(signed_in_client: TestClient) -> None:
    save(signed_in_client)

    listed = signed_in_client.get("/api/drafts").json()

    assert len(listed) == 1
    assert listed[0]["title"] == "Mutual NDA — Acme & Globex"


def test_the_list_starts_empty(signed_in_client: TestClient) -> None:
    assert signed_in_client.get("/api/drafts").json() == []


def test_reading_gives_back_the_answers_that_were_saved(
    signed_in_client: TestClient,
) -> None:
    # Storing the answers rather than a rendered document is what makes a saved
    # draft something the assistant can carry on editing.
    draft_id = save(signed_in_client).json()["id"]

    body = signed_in_client.get(f"/api/drafts/{draft_id}").json()

    assert body["values"] == VALUES


def test_the_list_does_not_carry_every_answer(signed_in_client: TestClient) -> None:
    # The list needs a title and a date; sending every field of every draft
    # would grow without limit for no benefit.
    save(signed_in_client)

    assert "values" not in signed_in_client.get("/api/drafts").json()[0]


def test_newest_first(signed_in_client: TestClient) -> None:
    save(signed_in_client, title="First")
    save(signed_in_client, title="Second")

    titles = [row["title"] for row in signed_in_client.get("/api/drafts").json()]

    assert titles == ["Second", "First"]


def test_a_title_is_trimmed(signed_in_client: TestClient) -> None:
    assert save(signed_in_client, title="  Spaced  ").json()["title"] == "Spaced"


def test_an_unknown_document_type_is_refused(signed_in_client: TestClient) -> None:
    # It would save fine and then fail to render on the way back out, which is
    # a worse place to find out.
    response = save(signed_in_client, documentType="employment-contract")

    assert response.status_code == 422
    assert signed_in_client.get("/api/drafts").json() == []


def test_every_agreement_can_be_saved(signed_in_client: TestClient) -> None:
    slugs = [row["slug"] for row in signed_in_client.get("/api/documents").json()]

    for slug in slugs:
        assert save(signed_in_client, documentType=slug).status_code == 201, slug


def test_an_empty_title_is_refused(signed_in_client: TestClient) -> None:
    assert save(signed_in_client, title="").status_code == 422


# --- deleting ---------------------------------------------------------------


def test_deleting_removes_it(signed_in_client: TestClient) -> None:
    draft_id = save(signed_in_client).json()["id"]

    assert signed_in_client.delete(f"/api/drafts/{draft_id}").status_code == 204
    assert signed_in_client.get("/api/drafts").json() == []


def test_deleting_something_that_is_not_there(signed_in_client: TestClient) -> None:
    assert signed_in_client.delete("/api/drafts/999").status_code == 404


def test_deleting_twice(signed_in_client: TestClient) -> None:
    draft_id = save(signed_in_client).json()["id"]
    signed_in_client.delete(f"/api/drafts/{draft_id}")

    assert signed_in_client.delete(f"/api/drafts/{draft_id}").status_code == 404


# --- who can see what -------------------------------------------------------


def test_a_stranger_cannot_list_drafts(client: TestClient) -> None:
    assert client.get("/api/drafts").status_code == 401


def test_a_stranger_cannot_save_a_draft(client: TestClient) -> None:
    assert save(client).status_code == 401


def test_a_stranger_cannot_read_a_draft(
    signed_in_client: TestClient, client: TestClient
) -> None:
    draft_id = save(signed_in_client).json()["id"]
    client.cookies.clear()

    assert client.get(f"/api/drafts/{draft_id}").status_code == 401


def test_one_user_does_not_see_anothers_drafts(
    signed_in_client: TestClient, other_client: TestClient
) -> None:
    save(signed_in_client)

    assert other_client.get("/api/drafts").json() == []


def test_reading_someone_elses_draft_looks_like_it_does_not_exist(
    signed_in_client: TestClient, other_client: TestClient
) -> None:
    # 404 rather than 403: a 403 confirms the row exists, which turns
    # sequential ids into a way to count and probe other people's documents.
    draft_id = save(signed_in_client).json()["id"]

    response = other_client.get(f"/api/drafts/{draft_id}")

    assert response.status_code == 404
    assert response.json()["detail"] == "No such document."


def test_the_same_answer_for_a_draft_that_never_existed(
    other_client: TestClient,
) -> None:
    assert other_client.get("/api/drafts/424242").json()["detail"] == "No such document."


def test_deleting_someone_elses_draft_does_nothing(
    signed_in_client: TestClient, other_client: TestClient
) -> None:
    draft_id = save(signed_in_client).json()["id"]

    assert other_client.delete(f"/api/drafts/{draft_id}").status_code == 404
    # And it is still there for its owner.
    assert signed_in_client.get(f"/api/drafts/{draft_id}").status_code == 200


def test_each_user_keeps_their_own(
    signed_in_client: TestClient, other_client: TestClient
) -> None:
    save(signed_in_client, title="Ada's")
    save(other_client, title="Grace's")

    assert [row["title"] for row in signed_in_client.get("/api/drafts").json()] == [
        "Ada's"
    ]
    assert [row["title"] for row in other_client.get("/api/drafts").json()] == [
        "Grace's"
    ]


def test_signing_out_takes_access_with_it(signed_in_client: TestClient) -> None:
    draft_id = save(signed_in_client).json()["id"]
    signed_in_client.post("/api/auth/logout")

    assert signed_in_client.get(f"/api/drafts/{draft_id}").status_code == 401
