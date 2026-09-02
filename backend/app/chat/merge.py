"""Applying the model's patch to the cover page.

Kept apart from the LLM call so the rules are testable without a network, and
so there is exactly one place that decides what the assistant is allowed to
change.
"""

from __future__ import annotations

from app.chat.models import NdaFields, NdaFieldUpdates, Party, PartyUpdates

_PARTY_KEYS = ("party_one", "party_two")
_SCALAR_KEYS = tuple(
    key for key in NdaFieldUpdates.model_fields if key not in _PARTY_KEYS
)


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
        if _keeps(value):
            data[key] = value
    return Party(**data)


def merge(fields: NdaFields, updates: NdaFieldUpdates) -> NdaFields:
    """Returns a new cover page with the patch applied over `fields`."""
    data = fields.model_dump()
    patch = updates.model_dump()

    for key in _SCALAR_KEYS:
        if _keeps(patch[key]):
            data[key] = patch[key]

    data["party_one"] = _merge_party(fields.party_one, updates.party_one).model_dump()
    data["party_two"] = _merge_party(fields.party_two, updates.party_two).model_dump()

    return NdaFields(**data)
