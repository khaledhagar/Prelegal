"""The system prompt.

Its whole job is to keep the assistant a *conversation* rather than a form:
work out which agreement someone needs, say plainly when we cannot draft what
they asked for, then ask for one thing at a time until the document is complete.

The prompt is assembled per turn from `documents.json`, so the fields it
describes are always the fields the schema accepts. Nothing about any
particular agreement is written here by hand.
"""

from __future__ import annotations

import json

from app.chat.documents import Document, all_documents
from app.chat.models import DocumentValues

BEHAVIOUR = """\
You are a drafting assistant for Prelegal. You help someone put together a \
Common Paper legal agreement by talking to them, then you record what they tell \
you.

How to talk:
- Ask about one thing at a time. Never present a list of fields to fill in.
- Keep replies to one or two short sentences. This is a chat, not a form.
- Use plain language. Say "who are the two companies signing?", not "specify \
party one and party two".
- If an answer covers several fields at once, record all of them, confirm them \
in a few words, and ask about what is still missing.
- End every reply with a question while anything is still missing. A reply that \
only summarises leaves the user with nothing to do.
- When everything required is filled in, say the agreement is ready to download \
and stop asking questions. Offer to change anything they want.

How to record:
- Put what you learned in `updates`. Leave a field null if this turn told you \
nothing new about it -- null means "no change", it does not clear a value.
- Never invent a value. If the user has not said it, leave it null and ask.
- Record what the user actually said. Do not upgrade a vague answer into a \
precise one.
- Put the parties in `partyOne` and `partyTwo`, each with `company` (legal \
entity name), `printName` (the person signing), `title` (their job title) and \
`noticeAddress` (an email or postal address for legal notices).\
"""

CHOOSING = """\
No agreement has been chosen yet. Your first job is to find out what the user \
needs and set `documentType` to the matching slug from the list below.

- If what they describe matches one of the agreements, set `documentType` and \
start asking about its terms in the same reply.
- If they ask for something we do not have -- an employment contract, a will, a \
lease, anything absent from the list -- say plainly that we cannot draft that \
one, name the closest agreement we *can* draft and what it would cover, and ask \
whether they want it. Do not set `documentType` until they agree.
- If it is genuinely ambiguous, ask one short question to narrow it down.
- You may still record the parties and, if the user gives them, the effective \
date and governing law, before the agreement is chosen.

The agreements we can draft:
"""

DRAFTING = """\
You are drafting a {name}. Set `documentType` again only if the user asks to \
switch to a different agreement.

{description}

The parties are called {party_one} and {party_two}: `partyOne` is the \
{party_one}, `partyTwo` is the {party_two}.
{limitation}
The fields, with the question to ask about each. Required fields are marked; \
ask about those first and do not push for the rest.
"""


def _catalogue() -> str:
    return "\n".join(
        f"- `{document.slug}`: {document.name}. {document.description}"
        for document in all_documents()
    )


#: How to describe a field's expected answer, where saying so helps.
TYPE_NOTES = {
    "date": "Answer is a date, formatted YYYY-MM-DD.",
    "duration": "Answer is a length of time.",
    "money": "Answer is an amount of money.",
    "percent": "Answer is a percentage.",
    "multiline": "Answer may run to several lines.",
}


def _field_lines(document: Document) -> str:
    lines = []
    for field in document.fields:
        parts = [f"- `{field.key}` ({field.label})"]
        if field.required:
            parts.append("[required]")
        parts.append(f"-- ask: {field.ask}")
        note = TYPE_NOTES.get(field.type)
        if note:
            parts.append(note)
        if field.options:
            rendered = " OR ".join(f'"{option}"' for option in field.options)
            parts.append(
                "This is an either/or term: copy one of these phrases verbatim "
                "into the field, replacing {n} with the number the user gives, "
                f"and record nothing else: {rendered}"
            )
        lines.append(" ".join(parts))
    return "\n".join(lines)


def _instructions(document: Document | None) -> str:
    if document is None:
        return f"{BEHAVIOUR}\n\n{CHOOSING}{_catalogue()}"

    limitation = (
        f"\nA limit worth stating if it comes up: {document.limitation}\n"
        if document.limitation
        else ""
    )
    header = DRAFTING.format(
        name=document.name,
        description=document.description,
        party_one=document.parties[0],
        party_two=document.parties[1],
        limitation=limitation,
    )
    return f"{BEHAVIOUR}\n\n{header}{_field_lines(document)}"


def build_messages(
    history: list[dict[str, str]],
    values: DocumentValues,
    document: Document | None,
    today: str,
) -> list[dict[str, str]]:
    """
    Assembles the request: instructions, then what is captured, then the chat.

    The current values go in as a system message on every turn rather than
    being left for the model to infer from the transcript. It is what stops the
    assistant asking again for something the user already answered ten messages
    ago, and it is cheap.
    """
    captured = {
        "fields": values.fields,
        "parties": [party.model_dump(by_alias=True) for party in values.parties],
    }

    return [
        {"role": "system", "content": _instructions(document)},
        {
            "role": "system",
            "content": (
                f"Today's date is {today}.\n"
                "Captured so far (anything absent is still missing):\n"
                f"{json.dumps(captured, indent=2)}"
            ),
        },
        *history,
    ]
