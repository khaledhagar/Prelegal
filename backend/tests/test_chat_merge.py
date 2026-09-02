"""Applying the assistant's patch.

The rule that matters: the assistant can fill a field in, but must not quietly
empty one. Everything here is a way of checking that.
"""

from __future__ import annotations

from app.chat.merge import merge
from app.chat.models import NdaFields, NdaFieldUpdates, Party, PartyUpdates


def test_sets_a_field_it_learned() -> None:
    merged = merge(NdaFields(), NdaFieldUpdates(governing_law="Delaware"))
    assert merged.governing_law == "Delaware"


def test_leaves_untouched_fields_alone() -> None:
    before = NdaFields(governing_law="Delaware", purpose="Evaluating a partnership")

    merged = merge(before, NdaFieldUpdates(jurisdiction="New Castle, DE"))

    assert merged.governing_law == "Delaware"
    assert merged.purpose == "Evaluating a partnership"
    assert merged.jurisdiction == "New Castle, DE"


def test_null_means_no_change_not_clear() -> None:
    before = NdaFields(governing_law="Delaware")
    merged = merge(before, NdaFieldUpdates(governing_law=None))
    assert merged.governing_law == "Delaware"


def test_a_blank_string_does_not_erase_an_answer() -> None:
    # A careless model emitting "" must not cost the user a term they gave.
    before = NdaFields(governing_law="Delaware")
    merged = merge(before, NdaFieldUpdates(governing_law="   "))
    assert merged.governing_law == "Delaware"


def test_overwrites_when_the_user_changes_their_mind() -> None:
    before = NdaFields(governing_law="Delaware")
    merged = merge(before, NdaFieldUpdates(governing_law="New York"))
    assert merged.governing_law == "New York"


def test_merges_one_party_without_disturbing_the_other() -> None:
    before = NdaFields(
        party_one=Party(company="Acme, Inc.", print_name="Ada Lovelace"),
        party_two=Party(company="Globex Corporation"),
    )

    merged = merge(
        before,
        NdaFieldUpdates(party_one=PartyUpdates(title="Chief Executive Officer")),
    )

    assert merged.party_one.company == "Acme, Inc."
    assert merged.party_one.print_name == "Ada Lovelace"
    assert merged.party_one.title == "Chief Executive Officer"
    assert merged.party_two.company == "Globex Corporation"


def test_a_null_party_leaves_that_party_untouched() -> None:
    before = NdaFields(party_one=Party(company="Acme, Inc."))
    merged = merge(before, NdaFieldUpdates(party_one=None))
    assert merged.party_one.company == "Acme, Inc."


def test_records_several_fields_from_one_answer() -> None:
    # "Acme and Globex, Delaware law, one year" in a single message.
    merged = merge(
        NdaFields(),
        NdaFieldUpdates(
            governing_law="Delaware",
            mnda_term="fixed",
            mnda_term_years="1",
            party_one=PartyUpdates(company="Acme, Inc."),
            party_two=PartyUpdates(company="Globex Corporation"),
        ),
    )

    assert merged.governing_law == "Delaware"
    assert merged.mnda_term_years == "1"
    assert merged.party_one.company == "Acme, Inc."
    assert merged.party_two.company == "Globex Corporation"


def test_does_not_mutate_the_fields_it_was_given() -> None:
    before = NdaFields(governing_law="Delaware")
    merge(before, NdaFieldUpdates(governing_law="New York"))
    assert before.governing_law == "Delaware"


def test_choice_fields_accept_their_alternatives() -> None:
    merged = merge(
        NdaFields(),
        NdaFieldUpdates(mnda_term="untilTerminated", confidentiality="perpetual"),
    )
    assert merged.mnda_term == "untilTerminated"
    assert merged.confidentiality == "perpetual"


def test_serialises_to_the_names_the_frontend_uses() -> None:
    # The frontend adopts this object wholesale, so the keys have to match
    # NdaFormValues exactly.
    payload = merge(
        NdaFields(), NdaFieldUpdates(party_one=PartyUpdates(print_name="Ada"))
    ).model_dump(by_alias=True)

    assert payload["governingLaw"] == ""
    assert payload["mndaTermYears"] == ""
    assert payload["effectiveDate"] == ""
    assert payload["partyOne"]["printName"] == "Ada"
    assert payload["partyTwo"]["noticeAddress"] == ""
