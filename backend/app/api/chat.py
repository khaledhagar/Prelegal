"""The chat endpoint.

Stateless: the browser keeps the transcript and the cover page, and sends both
with every turn. There is no authenticated user to own a conversation yet and
the database does not survive a restart, so storing it here would be pretending.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.chat.agent import ChatUnavailable, respond
from app.chat.models import ChatRequest, ChatResponse
from app.dependencies import SettingsDep

router = APIRouter(tags=["chat"])


@router.post("/chat")
def chat(request: ChatRequest, settings: SettingsDep) -> ChatResponse:
    if not settings.chat_enabled:
        raise HTTPException(
            status_code=503,
            detail=(
                "The assistant is not configured. Set OPENROUTER_API_KEY in the "
                "repository's .env and restart."
            ),
        )

    if not request.messages:
        raise HTTPException(status_code=422, detail="Send at least one message.")

    try:
        return respond(request.messages, request.fields)
    except ChatUnavailable as error:
        # 502: we are up, the thing we depend on is not. The message is already
        # written for a human to read in a chat bubble.
        raise HTTPException(status_code=502, detail=str(error)) from error
