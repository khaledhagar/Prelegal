"""The document catalogue.

Read-only and unauthenticated: it is the same list the frontend already ships
inlined, exposed so the picker and the assistant cannot disagree about what is
on offer. Serving it from the generated registry means adding a template shows
up here without anyone editing this file.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.chat.documents import all_documents
from app.chat.models import DocumentSummary

router = APIRouter(tags=["documents"])


@router.get("/documents")
def documents() -> list[DocumentSummary]:
    return [
        DocumentSummary(
            slug=document.slug,
            name=document.name,
            description=document.description,
            limitation=document.limitation,
        )
        for document in all_documents()
    ]
