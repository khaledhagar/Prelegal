"""The /api/chat endpoint.

The LLM is replaced throughout -- these tests are about the wiring around it:
what reaches the model, what comes back to the browser, and what happens when
the provider is unreachable. No test makes a network call.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.chat import agent
from app.chat.models import AssistantTurn, NdaFieldUpdates, PartyUpdates


class FakeCompletion:
    """Stands in for `litellm.completion`, recording how it was called."""

    def __init__(self, turn: AssistantTurn | None = None) -> None:
        self.turn = turn or AssistantTurn(reply="Who are the two companies?")
        self.calls: list[dict[str, Any]] = []

    def __call__(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        content = self.turn.model_dump_json(by_alias=True)
        message = type("Message", (), {"content": content})()
        choice = type("Choice", (), {"message": message})()
        return type("Response", (), {"choices": [choice]})()


@pytest.fixture
def fake_llm(monkeypatch: pytest.MonkeyPatch) -> FakeCompletion:
    fake = FakeCompletion()
    monkeypatch.setattr(agent, "completion", fake)
    return fake


def post(client: TestClient, **body: Any) -> Any:
    payload = {"messages": [{"role": "user", "content": "Hello"}], **body}
    return client.post("/api/chat", json=payload)


def test_returns_the_assistant_reply(client: TestClient, fake_llm: FakeCompletion) -> None:
    response = post(client)
    assert response.status_code == 200
    assert response.json()["reply"] == "Who are the two companies?"


def test_returns_the_cover_page_with_the_patch_applied(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    fake_llm.turn = AssistantTurn(
        reply="Delaware it is.",
        updates=NdaFieldUpdates(governing_law="Delaware"),
    )

    response = post(
        client,
        fields={"governingLaw": "", "jurisdiction": "New Castle, DE"},
    )

    fields = response.json()["fields"]
    assert fields["governingLaw"] == "Delaware"
    # Untouched by this turn, and still there.
    assert fields["jurisdiction"] == "New Castle, DE"


def test_returns_fields_under_the_names_the_frontend_uses(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    fake_llm.turn = AssistantTurn(
        reply="Noted.",
        updates=NdaFieldUpdates(party_one=PartyUpdates(print_name="Ada Lovelace")),
    )

    fields = post(client).json()["fields"]

    assert fields["partyOne"]["printName"] == "Ada Lovelace"
    assert "mndaTermYears" in fields
    assert "party_one" not in fields


def test_sends_the_conversation_and_the_current_state_to_the_model(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    post(
        client,
        messages=[
            {"role": "assistant", "content": "Who are the parties?"},
            {"role": "user", "content": "Acme and Globex"},
        ],
        fields={"governingLaw": "Delaware"},
    )

    sent = fake_llm.calls[0]["messages"]
    assert sent[0]["role"] == "system"
    # The cover page so far rides along on every turn, so the assistant does not
    # ask again for something answered ten messages ago.
    assert "Delaware" in sent[1]["content"]
    assert sent[-1] == {"role": "user", "content": "Acme and Globex"}


def test_asks_cerebras_for_structured_output(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    post(client)

    call = fake_llm.calls[0]
    assert call["model"] == "openrouter/openai/gpt-oss-120b"
    assert call["extra_body"] == {"provider": {"order": ["cerebras"]}}
    assert call["response_format"] is AssistantTurn


def test_says_so_when_the_assistant_is_not_configured(
    unconfigured_client: TestClient,
) -> None:
    response = post(unconfigured_client)
    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_health_still_works_without_a_key(unconfigured_client: TestClient) -> None:
    # Chat is optional; the rest of the app must not care.
    assert unconfigured_client.get("/api/health").status_code == 200


def test_reports_a_provider_failure_without_leaking_it(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def explode(**_: Any) -> Any:
        raise RuntimeError("connection reset by peer; key=sk-secret")

    monkeypatch.setattr(agent, "completion", explode)

    response = post(client)

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "unavailable" in detail
    assert "sk-secret" not in detail


def test_reports_unusable_model_output(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def nonsense(**_: Any) -> Any:
        message = type("Message", (), {"content": "I'd rather not use JSON."})()
        choice = type("Choice", (), {"message": message})()
        return type("Response", (), {"choices": [choice]})()

    monkeypatch.setattr(agent, "completion", nonsense)

    response = post(client)

    assert response.status_code == 502
    assert "unexpected" in response.json()["detail"]


def test_rejects_an_empty_conversation(client: TestClient, fake_llm: FakeCompletion) -> None:
    response = client.post("/api/chat", json={"messages": []})
    assert response.status_code == 422


def test_starts_from_a_blank_cover_page_when_none_is_sent(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    response = client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "Hi"}]}
    )
    assert response.status_code == 200
    assert response.json()["fields"]["purpose"] == ""
