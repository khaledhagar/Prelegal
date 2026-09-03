"""Applying the model's patch to the captured values.

Kept apart from the LLM call so the rules are testable without a network, and
so there is exactly one place that decides what the assistant is allowed to
change.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.chat.documents import get_document
from app.chat.models import DocumentValues, Party, PartyUpdates


def _keeps(value: object) -> bool:
    """
    Whether a patch value is a real update.

    `None` is the model saying "I learned nothing about this". A blank string is
    treated the same way: it carries no information, and letting it through
    would let one careless response erase a value the user already gave. The
    cost is that the assistant cannot clear a field back to empty once set --
    an acceptable trade against silently dropping terms from an agreement.
    """
    if value is None:
        return False
    if isinstance(value, str) and value.strip() == "":
        return False
    return True


def _merge_party(current: Party, patch: PartyUpdates | None) -> Party:
    if patch is None:
        return current
    data = current.model_dump()
    for key, value in patch.model_dump().items():
        # PartyUpdates names fields as they travel the wire; Party is snake_case.
        target = {"printName": "print_name", "noticeAddress": "notice_address"}.get(
            key, key
        )
        if _keeps(value):
            data[target] = value
    return Party(**data)


def merge(values: DocumentValues, turn: BaseModel) -> DocumentValues:
    """
    Returns new values with the turn's patch applied over `values`.

    Unknown field keys are dropped rather than stored. The schema handed to the
    model only names fields the chosen agreement declares, so a stray key means
    the model improvised -- and a value nothing renders is worse than no value,
    because it looks captured in the read-out and never appears in the document.
    """
    document_type = getattr(turn, "documentType", "") or values.document_type
    document = get_document(document_type)
    allowed = set(document.field_keys) if document else set()

    # Switching agreement keeps the answers the new one also asks for -- the
    # parties and usually the effective date -- and forgets the rest, which
    # belong to a document no longer being drafted.
    fields = {key: value for key, value in values.fields.items() if key in allowed}

    for key, value in turn.updates.model_dump().items():
        if key in allowed and _keeps(value):
            fields[key] = value.strip()

    one, two = values.parties[0], values.parties[1]
    return DocumentValues(
        document_type=document_type,
        fields=fields,
        parties=[
            _merge_party(one, getattr(turn, "partyOne", None)),
            _merge_party(two, getattr(turn, "partyTwo", None)),
        ],
    )
