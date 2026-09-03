"""The `/api` surface.

Routers are collected here so `main` mounts one thing and each feature ticket
adds a module rather than editing the app factory.
"""

from fastapi import APIRouter

from app.api import auth, chat, documents, drafts, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(chat.router)
api_router.include_router(documents.router)
api_router.include_router(auth.router)
api_router.include_router(drafts.router)

__all__ = ["api_router"]
