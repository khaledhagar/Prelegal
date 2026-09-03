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
from app.chat.documents import get_document
from app.chat.models import turn_model


def make_turn(
    document_type: str = "",
    reply: str = "Who are the two companies?",
    updates: dict[str, str] | None = None,
    **parties: dict[str, str],
) -> Any:
    """Builds a response in the schema the chosen document's turn model uses."""
    schema = turn_model(get_document(document_type))
    return schema(
        reply=reply,
        documentType=document_type,
        updates=schema.model_fields["updates"].annotation(**(updates or {})),
        **parties,
    )


class FakeCompletion:
    """Stands in for `litellm.completion`, recording how it was called."""

    def __init__(self, turn: Any = None) -> None:
        self.turn = turn if turn is not None else make_turn()
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


def test_returns_the_assistant_reply(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    response = post(client)
    assert response.status_code == 200
    assert response.json()["reply"] == "Who are the two companies?"


def test_records_the_document_the_assistant_settles_on(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    # Which agreement to draft rides in the same response as the reply; there is
    # no second call to classify it.
    fake_llm.turn = make_turn("service-level-agreement", reply="An SLA it is.")

    values = post(client).json()["values"]

    assert values["documentType"] == "service-level-agreement"


def test_leaves_the_document_unset_when_the_request_is_unsupported(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    # "We can't draft an employment contract, but here is the closest thing" is
    # a reply, not a decision -- nothing should be selected on the back of it.
    fake_llm.turn = make_turn(reply="We can't draft that. The closest is a PSA.")

    values = post(client).json()["values"]

    assert values["documentType"] == ""


def test_returns_the_values_with_the_patch_applied(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    fake_llm.turn = make_turn(
        "service-level-agreement",
        reply="Noted.",
        updates={"targetUptime": "99.9%"},
    )

    response = post(
        client,
        values={
            "documentType": "service-level-agreement",
            "fields": {"supportChannel": "support@acme.io"},
        },
    )

    fields = response.json()["values"]["fields"]
    assert fields["targetUptime"] == "99.9%"
    # Untouched by this turn, and still there.
    assert fields["supportChannel"] == "support@acme.io"


def test_returns_names_the_frontend_reads(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    fake_llm.turn = make_turn(
        "mutual-nda",
        reply="Noted.",
        partyOne={"printName": "Ada Lovelace"},
    )

    values = post(client, values={"documentType": "mutual-nda"}).json()["values"]

    assert values["parties"][0]["printName"] == "Ada Lovelace"
    assert "print_name" not in values["parties"][0]
    assert "document_type" not in values


def test_records_a_field_before_the_document_is_chosen(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    # "an SLA with 99.9% uptime" settles the document and gives an answer in the
    # same breath; asking again for what was just said is the rudeness the chat
    # exists to avoid.
    fake_llm.turn = make_turn(
        "service-level-agreement",
        reply="An SLA at 99.9%.",
        updates={"targetUptime": "99.9%"},
    )

    values = post(client).json()["values"]

    assert values["fields"]["targetUptime"] == "99.9%"


def test_sends_the_conversation_and_the_current_state_to_the_model(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    post(
        client,
        messages=[
            {"role": "assistant", "content": "Who are the parties?"},
            {"role": "user", "content": "Acme and Globex"},
        ],
        values={
            "documentType": "mutual-nda",
            "fields": {"governingLaw": "Delaware"},
        },
    )

    sent = fake_llm.calls[0]["messages"]
    assert sent[0]["role"] == "system"
    # What is captured rides along on every turn, so the assistant does not ask
    # again for something answered ten messages ago.
    assert "Delaware" in sent[1]["content"]
    assert sent[-1] == {"role": "user", "content": "Acme and Globex"}


def test_describes_the_catalogue_while_no_document_is_chosen(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    post(client)

    instructions = fake_llm.calls[0]["messages"][0]["content"]
    assert "service-level-agreement" in instructions
    assert "cannot draft" in instructions or "can't" in instructions


def test_describes_only_the_chosen_document_once_one_is_settled(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    post(client, values={"documentType": "service-level-agreement"})

    instructions = fake_llm.calls[0]["messages"][0]["content"]
    assert "Target Uptime" in instructions
    # A field belonging to a different agreement has no business here.
    assert "Pilot Period" not in instructions


def test_asks_cerebras_for_structured_output(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    post(client, values={"documentType": "service-level-agreement"})

    call = fake_llm.calls[0]
    assert call["model"] == "openrouter/openai/gpt-oss-120b"
    assert call["extra_body"] == {"provider": {"order": ["cerebras"]}}
    assert call["response_format"] is turn_model(
        get_document("service-level-agreement")
    )


def test_makes_exactly_one_model_call_per_turn(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    # The reply and the document choice come from one completion. A second call
    # here would mean a classification round trip crept back in.
    post(client)
    assert len(fake_llm.calls) == 1


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


def test_rejects_an_empty_conversation(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    response = client.post("/api/chat", json={"messages": []})
    assert response.status_code == 422


def test_starts_from_nothing_captured_when_no_values_are_sent(
    client: TestClient, fake_llm: FakeCompletion
) -> None:
    response = client.post(
        "/api/chat", json={"messages": [{"role": "user", "content": "Hi"}]}
    )

    assert response.status_code == 200
    values = response.json()["values"]
    assert values["documentType"] == ""
    assert values["fields"] == {}
