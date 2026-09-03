"""The wire contract for accounts and saved drafts.

Extends the same `Wire` base the chat uses, so everything crossing the API is
camelCase whatever it is about.
"""

from __future__ import annotations

from pydantic import EmailStr, Field

from app.chat.models import Wire


class SignupRequest(Wire):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=254)
    #: Length is checked in `app.auth.passwords`, which owns the rule and the
    #: wording. The cap is here to stop a megabyte reaching scrypt.
    password: str = Field(max_length=1024)


class LoginRequest(Wire):
    email: str = Field(max_length=254)
    password: str = Field(max_length=1024)


class AccountResponse(Wire):
    """Who is signed in. Never carries the password hash or the token."""

    id: int
    email: str
    name: str


class DraftRequest(Wire):
    document_type: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    #: The captured answers, exactly as the chat and the preview pass them.
    values: dict = {}


class DraftSummary(Wire):
    """A row in "my documents" -- everything the list needs, nothing more."""

    id: int
    document_type: str
    title: str
    created_at: str
    updated_at: str


class DraftDetail(DraftSummary):
    values: dict
