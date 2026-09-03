"""The system prompt.

Assembled per turn from the document registry, so what these tests pin down is
that the instructions and the schema always describe the same fields -- and that
the behaviour PL-6 asked for is actually asked of the model.
"""

from __future__ import annotations

from app.chat.documents import all_documents, get_document
from app.chat.prompt import build_messages
from app.chat.models import DocumentValues, Party


def instructions(document_type: str = "") -> str:
    document = get_document(document_type)
    messages = build_messages(
        [], DocumentValues(document_type=document_type), document, today="2026-09-03"
    )
    return messages[0]["content"]


def test_asks_for_a_conversation_not_a_form() -> None:
    assert "one thing at a time" in instructions()
    assert "Never present a list of fields" in instructions()


def test_lists_every_agreement_while_none_is_chosen() -> None:
    text = instructions()
    for document in all_documents():
        assert f"`{document.slug}`" in text


def test_tells_the_model_what_to_do_with_an_unsupported_request() -> None:
    # The ticket's requirement: say plainly we cannot draft it, name the closest
    # thing we can, and do not quietly pick something.
    text = instructions()
    assert "employment contract" in text
    assert "closest" in text
    assert "Do not set `documentType` until they agree" in text


def test_names_the_chosen_agreements_fields_and_questions() -> None:
    text = instructions("service-level-agreement")
    document = get_document("service-level-agreement")

    for field in document.fields:
        assert f"`{field.key}`" in text
        assert field.ask in text


def test_marks_which_fields_are_required() -> None:
    text = instructions("service-level-agreement")
    assert "`targetUptime` (Target Uptime) [required]" in text


def test_describes_the_shape_of_a_typed_answer() -> None:
    assert "formatted YYYY-MM-DD" in instructions("mutual-nda")
    assert "percentage" in instructions("service-level-agreement")


def test_spells_out_the_exact_phrasings_for_an_either_or_term() -> None:
    # The cover page ticks a box by matching the answer, so the wording matters.
    text = instructions("mutual-nda")
    assert "either/or" in text
    assert "Expires {n} year(s) from Effective Date." in text


def test_names_the_parties_the_way_the_agreement_does() -> None:
    assert "Provider" in instructions("service-level-agreement")
    assert "Partner" in instructions("design-partner-agreement")


def test_states_a_documents_limit_where_there_is_one() -> None:
    assert "statement of work" in instructions("professional-services-agreement")


def test_does_not_describe_other_agreements_once_one_is_chosen() -> None:
    text = instructions("service-level-agreement")
    assert "Pilot Period" not in text
    assert "Categories of Personal Data" not in text


def test_sends_what_is_captured_on_every_turn() -> None:
    values = DocumentValues(
        document_type="mutual-nda",
        fields={"governingLaw": "Delaware"},
        parties=[Party(company="Acme"), Party()],
    )

    messages = build_messages(
        [{"role": "user", "content": "Hi"}],
        values,
        get_document("mutual-nda"),
        today="2026-09-03",
    )

    state = messages[1]["content"]
    assert "Delaware" in state
    assert "Acme" in state
    assert "2026-09-03" in state


def test_puts_the_conversation_after_the_instructions() -> None:
    history = [{"role": "user", "content": "Acme and Globex"}]
    messages = build_messages(history, DocumentValues(), None, today="2026-09-03")

    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "system"
    assert messages[-1] == history[0]


def test_uses_the_wire_names_for_captured_parties() -> None:
    # The model answers with `printName`; showing it `print_name` would invite
    # it to answer with that instead.
    values = DocumentValues(parties=[Party(print_name="Ada"), Party()])
    messages = build_messages([], values, None, today="2026-09-03")

    assert "printName" in messages[1]["content"]
    assert "print_name" not in messages[1]["content"]
