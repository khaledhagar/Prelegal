"""The chat wire contract.

These models are the API's shape *and* the schema the LLM fills in, so the
field names have to match `frontend/src/lib/form.ts` exactly. Python stays
snake_case and pydantic serialises to the frontend's camelCase; because
`model_json_schema()` uses aliases, the model is asked for camelCase too, and
one set of names travels all the way from the LLM to the preview.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

TermChoice = Literal["fixed", "untilTerminated"]
ConfidentialityChoice = Literal["fixed", "perpetual"]


class Wire(BaseModel):
    """Base for anything crossing the network: camelCase out, either in."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Party(Wire):
    company: str = ""
    print_name: str = ""
    title: str = ""
    notice_address: str = ""


class NdaFields(Wire):
    """The cover page as the frontend holds it -- mirrors `NdaFormValues`."""

    purpose: str = ""
    effective_date: str = ""
    mnda_term: TermChoice = "fixed"
    mnda_term_years: str = ""
    confidentiality: ConfidentialityChoice = "fixed"
    confidentiality_years: str = ""
    governing_law: str = ""
    jurisdiction: str = ""
    modifications: str = ""
    party_one: Party = Party()
    party_two: Party = Party()


class PartyUpdates(Wire):
    """Only what the model learned about one party this turn."""

    company: str | None = None
    print_name: str | None = None
    title: str | None = None
    notice_address: str | None = None


class NdaFieldUpdates(Wire):
    """
    The model's patch: null means "I learned nothing about this", never "clear
    it". Asking for a full field set each turn invites the model to re-emit what
    it half-remembers and quietly blank a value the user already gave, which on
    a legal document is a bad way to lose the governing law.
    """

    purpose: str | None = None
    effective_date: str | None = None
    mnda_term: TermChoice | None = None
    mnda_term_years: str | None = None
    confidentiality: ConfidentialityChoice | None = None
    confidentiality_years: str | None = None
    governing_law: str | None = None
    jurisdiction: str | None = None
    modifications: str | None = None
    party_one: PartyUpdates | None = None
    party_two: PartyUpdates | None = None


class AssistantTurn(Wire):
    """What the LLM returns: something to say, plus what it understood."""

    reply: str
    updates: NdaFieldUpdates = NdaFieldUpdates()


class ChatMessage(Wire):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(Wire):
    messages: list[ChatMessage]
    fields: NdaFields = NdaFields()


class ChatResponse(Wire):
    reply: str
    #: The merged result, not the patch -- the frontend adopts this wholesale so
    #: the merge rules live in one tested place.
    fields: NdaFields
