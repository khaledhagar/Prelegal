"""The LLM call.

LiteLLM to OpenRouter, pinned to Cerebras as the inference provider, with
Structured Outputs so the reply and the field updates come back as one parsed
object rather than prose we would have to scrape.
"""

from __future__ import annotations

import logging
from datetime import date

from litellm import completion

from app.chat.merge import merge
from app.chat.models import AssistantTurn, ChatMessage, ChatResponse, NdaFields
from app.chat.prompt import build_messages

logger = logging.getLogger(__name__)

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}


class ChatUnavailable(RuntimeError):
    """The assistant could not be reached. Carries a user-facing message."""


def respond(messages: list[ChatMessage], fields: NdaFields) -> ChatResponse:
    """One turn: what the assistant says, and the cover page after its edits."""
    history = [
        {"role": message.role, "content": message.content} for message in messages
    ]
    request = build_messages(history, fields, today=date.today().isoformat())

    try:
        response = completion(
            model=MODEL,
            messages=request,
            response_format=AssistantTurn,
            reasoning_effort="low",
            extra_body=EXTRA_BODY,
        )
        content = response.choices[0].message.content
    except Exception as error:
        # Anything from an expired key to a provider outage. The detail belongs
        # in the log, not in a chat bubble.
        logger.exception("chat completion failed")
        raise ChatUnavailable(
            "The assistant is unavailable right now. Please try again in a moment."
        ) from error

    try:
        turn = AssistantTurn.model_validate_json(content)
    except Exception as error:
        logger.exception("chat completion returned unusable content: %r", content)
        raise ChatUnavailable(
            "The assistant returned something unexpected. Please try again."
        ) from error

    return ChatResponse(reply=turn.reply, fields=merge(fields, turn.updates))
