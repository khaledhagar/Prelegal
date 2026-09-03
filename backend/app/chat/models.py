"""The chat wire contract, and the schema the LLM fills in.

Two shapes live here and they are not the same shape:

  - `DocumentValues` is what the API carries and the browser renders. It is
    flat and generic -- `fields` is a plain map -- so one contract serves all
    eleven agreements.
  - The *turn* model is built per document by `turn_model()`, naming every
    field the chosen agreement declares. The LLM gets a schema listing exactly
    the fields it may fill in, which is what stops it inventing one.

Field names are the camelCase keys from `documents.json`, and
`frontend/src/lib/values.ts` reads the same names off the response, so the two
must not drift.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, create_model
from pydantic.alias_generators import to_camel

from app.chat.documents import Document, all_documents


class Wire(BaseModel):
    """Base for anything crossing the network: camelCase out, either in."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Party(Wire):
    company: str = ""
    print_name: str = ""
    title: str = ""
    notice_address: str = ""


class PartyUpdates(BaseModel):
    """Only what the model learned about one party this turn."""

    company: str | None = None
    printName: str | None = None  # noqa: N815 - the wire name, matched exactly
    title: str | None = None
    noticeAddress: str | None = None  # noqa: N815


class DocumentValues(Wire):
    """Everything captured for one agreement -- mirrors `DocumentValues` in TS."""

    document_type: str = ""
    """The chosen agreement's slug; empty until the assistant settles on one."""

    fields: dict[str, str] = {}
    """Keyed by the field keys the chosen document declares."""

    parties: list[Party] = [Party(), Party()]


class ChatMessage(Wire):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(Wire):
    messages: list[ChatMessage]
    values: DocumentValues = DocumentValues()


class ChatResponse(Wire):
    reply: str
    #: The merged result, not the patch -- the frontend adopts this wholesale so
    #: the merge rules live in one tested place.
    values: DocumentValues


class DocumentSummary(Wire):
    """One row of the catalogue the picker shows."""

    slug: str
    name: str
    description: str
    limitation: str | None = None


# --- the per-document structured-output schema -----------------------------

def _undecided_keys() -> tuple[str, ...]:
    """
    Every field any agreement declares, for the turn before one is chosen.

    Someone opening with "an SLA with 99.9% uptime" has given a real answer, and
    the turn that settles the document is the same turn that hears it. Offering
    only the universally-shared fields here would drop it and ask again -- the
    exact rudeness the chat was built to avoid. Merging prunes whatever the
    chosen agreement does not declare, so a key belonging to some other document
    costs nothing.
    """
    keys: list[str] = []
    for document in all_documents():
        for key in document.field_keys:
            if key not in keys:
                keys.append(key)
    return tuple(keys)


def _updates_model(name: str, keys: tuple[str, ...]) -> type[BaseModel]:
    """
    A patch model naming exactly these fields, each optional.

    Built with plain `BaseModel` rather than `Wire`: the keys are already the
    camelCase wire names, so running them through an alias generator would
    rename them a second time.
    """
    return create_model(  # type: ignore[call-overload]
        name,
        __doc__=(
            "What the assistant learned this turn. null means 'no change'; it "
            "never clears a value."
        ),
        **{key: (str | None, None) for key in keys},
    )


def _turn_model(name: str, keys: tuple[str, ...], slugs: tuple[str, ...]) -> type[BaseModel]:
    """
    One turn's structured output: what to say, which document, what was learned.

    `documentType` rides in the same schema as the reply rather than being
    settled by a separate classification call. One completion per turn is the
    whole design -- see `app.chat.agent`.
    """
    return create_model(  # type: ignore[call-overload]
        name,
        reply=(str, ...),
        documentType=(Literal[slugs + ("",)], ""),  # type: ignore[valid-type]
        updates=(_updates_model(f"{name}Updates", keys), ...),
        partyOne=(PartyUpdates | None, None),
        partyTwo=(PartyUpdates | None, None),
    )


def _model_cache() -> dict[str, type[BaseModel]]:
    slugs = tuple(document.slug for document in all_documents())
    cache: dict[str, type[BaseModel]] = {
        "": _turn_model("UndecidedTurn", _undecided_keys(), slugs)
    }
    for document in all_documents():
        name = "".join(part.title() for part in document.slug.split("-")) + "Turn"
        cache[document.slug] = _turn_model(name, document.field_keys, slugs)
    return cache


_MODELS: dict[str, type[BaseModel]] | None = None


def turn_model(document: Document | None) -> type[BaseModel]:
    """
    The Structured Outputs schema for a turn about this document.

    Built once per document and reused: `create_model` is not free, and the
    schema for a given agreement never changes at runtime.
    """
    global _MODELS
    if _MODELS is None:
        _MODELS = _model_cache()
    return _MODELS[document.slug if document else ""]
