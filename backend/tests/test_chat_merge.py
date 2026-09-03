"""The merge rules.

One place decides what the assistant is allowed to change, so it is worth
pinning down precisely. The rule that matters most: a patch can fill a field in
but can never blank one out. Losing the governing law from a signed agreement
because the model half-remembered a turn is not a trade worth making.
"""

from __future__ import annotations

from typing import Any

from app.chat.documents import get_document
from app.chat.merge import merge
from app.chat.models import DocumentValues, Party, turn_model


def patch(
    document_type: str = "mutual-nda",
    updates: dict[str, Any] | None = None,
    **parties: Any,
) -> Any:
    schema = turn_model(get_document(document_type))
    return schema(
        reply="ok",
        documentType=document_type,
        updates=schema.model_fields["updates"].annotation(**(updates or {})),
        **parties,
    )


def values(document_type: str = "mutual-nda", **fields: str) -> DocumentValues:
    return DocumentValues(document_type=document_type, fields=dict(fields))


def test_fills_in_a_field_the_model_learned() -> None:
    result = merge(values(), patch(updates={"governingLaw": "Delaware"}))
    assert result.fields["governingLaw"] == "Delaware"


def test_leaves_a_field_alone_when_the_patch_says_nothing() -> None:
    # null means "I learned nothing about this", not "clear it".
    result = merge(
        values(governingLaw="Delaware"), patch(updates={"jurisdiction": "New Castle"})
    )
    assert result.fields["governingLaw"] == "Delaware"


def test_a_blank_never_erases_an_answer() -> None:
    result = merge(values(governingLaw="Delaware"), patch(updates={"governingLaw": ""}))
    assert result.fields["governingLaw"] == "Delaware"


def test_whitespace_never_erases_an_answer() -> None:
    result = merge(
        values(governingLaw="Delaware"), patch(updates={"governingLaw": "   "})
    )
    assert result.fields["governingLaw"] == "Delaware"


def test_trims_what_it_stores() -> None:
    result = merge(values(), patch(updates={"governingLaw": "  Delaware  "}))
    assert result.fields["governingLaw"] == "Delaware"


def test_overwrites_an_answer_the_user_changed() -> None:
    result = merge(values(governingLaw="Delaware"), patch(updates={"governingLaw": "New York"}))
    assert result.fields["governingLaw"] == "New York"


def test_does_not_mutate_what_it_was_given() -> None:
    before = values(governingLaw="Delaware")
    merge(before, patch(updates={"governingLaw": "New York"}))
    assert before.fields["governingLaw"] == "Delaware"


def test_merges_one_party_without_touching_the_other() -> None:
    start = DocumentValues(
        document_type="mutual-nda",
        parties=[Party(company="Acme"), Party(company="Globex")],
    )

    result = merge(start, patch(partyOne={"printName": "Ada Lovelace"}))

    assert result.parties[0].company == "Acme"
    assert result.parties[0].print_name == "Ada Lovelace"
    assert result.parties[1].company == "Globex"
    assert result.parties[1].print_name == ""


def test_a_blank_never_erases_a_party_detail() -> None:
    start = DocumentValues(
        document_type="mutual-nda", parties=[Party(company="Acme"), Party()]
    )

    result = merge(start, patch(partyOne={"company": ""}))

    assert result.parties[0].company == "Acme"


def test_drops_a_field_the_chosen_agreement_does_not_have() -> None:
    # The schema only names the document's own fields, so a stray key means the
    # model improvised. A value nothing renders is worse than no value: it looks
    # captured in the read-out and never reaches the document.
    result = merge(
        values("mutual-nda"),
        patch("mutual-nda", updates={"governingLaw": "Delaware"}),
    )

    assert set(result.fields) <= set(get_document("mutual-nda").field_keys)


def test_adopts_the_document_the_turn_chooses() -> None:
    result = merge(
        DocumentValues(),
        patch("service-level-agreement", updates={"targetUptime": "99.9%"}),
    )

    assert result.document_type == "service-level-agreement"
    assert result.fields["targetUptime"] == "99.9%"


def test_keeps_the_document_when_the_turn_names_none() -> None:
    schema = turn_model(get_document("mutual-nda"))
    turn = schema(
        reply="ok",
        documentType="",
        updates=schema.model_fields["updates"].annotation(),
    )

    assert merge(values("mutual-nda"), turn).document_type == "mutual-nda"


def test_switching_agreement_keeps_the_answers_the_new_one_also_asks_for() -> None:
    start = values("mutual-nda", governingLaw="Delaware", purpose="A deal")

    result = merge(start, patch("pilot-agreement"))

    assert result.document_type == "pilot-agreement"
    # A Pilot Agreement asks for governing law too.
    assert result.fields["governingLaw"] == "Delaware"
    # It has no notion of an NDA's purpose, so that answer is forgotten rather
    # than carried into a document that will never show it.
    assert "purpose" not in result.fields


def test_switching_agreement_keeps_the_parties() -> None:
    start = DocumentValues(
        document_type="mutual-nda",
        parties=[Party(company="Acme"), Party(company="Globex")],
    )

    result = merge(start, patch("pilot-agreement"))

    assert [party.company for party in result.parties] == ["Acme", "Globex"]
