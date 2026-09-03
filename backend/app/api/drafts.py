"""Agreements a user chose to keep.

Every query is scoped by the signed-in user. Someone else's draft id returns
404 rather than 403: a 403 would confirm the row exists, which turns sequential
ids into a way to count and probe other people's documents.
"""

from __future__ import annotations

import json
import sqlite3

from fastapi import APIRouter, HTTPException

from app.auth.models import DraftDetail, DraftRequest, DraftSummary
from app.chat.documents import get_document
from app.dependencies import CurrentUser, DbDep

router = APIRouter(prefix="/drafts", tags=["drafts"])


def _summary(row: sqlite3.Row) -> DraftSummary:
    return DraftSummary(
        id=row["id"],
        document_type=row["document_type"],
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("")
def list_drafts(user: CurrentUser, db: DbDep) -> list[DraftSummary]:
    """This user's saved agreements, newest first."""
    rows = db.execute(
        """
        SELECT id, document_type, title, created_at, updated_at
        FROM drafts
        WHERE user_id = ?
        ORDER BY updated_at DESC, id DESC
        """,
        (user.id,),
    ).fetchall()
    return [_summary(row) for row in rows]


@router.post("", status_code=201)
def save_draft(payload: DraftRequest, user: CurrentUser, db: DbDep) -> DraftSummary:
    if get_document(payload.document_type) is None:
        # An unknown type would save fine and then fail to render on the way
        # back out, which is a worse place to find out.
        raise HTTPException(
            status_code=422, detail="That is not an agreement we can draft."
        )

    with db:
        cursor = db.execute(
            """
            INSERT INTO drafts (user_id, document_type, title, values_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                user.id,
                payload.document_type,
                payload.title.strip(),
                json.dumps(payload.values),
            ),
        )

    row = db.execute(
        """
        SELECT id, document_type, title, created_at, updated_at
        FROM drafts WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    return _summary(row)


@router.get("/{draft_id}")
def read_draft(draft_id: int, user: CurrentUser, db: DbDep) -> DraftDetail:
    row = db.execute(
        """
        SELECT id, document_type, title, values_json, created_at, updated_at
        FROM drafts
        WHERE id = ? AND user_id = ?
        """,
        (draft_id, user.id),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="No such document.")

    return DraftDetail(
        **_summary(row).model_dump(), values=json.loads(row["values_json"])
    )


@router.delete("/{draft_id}", status_code=204)
def delete_draft(draft_id: int, user: CurrentUser, db: DbDep) -> None:
    with db:
        cursor = db.execute(
            "DELETE FROM drafts WHERE id = ? AND user_id = ?", (draft_id, user.id)
        )

    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="No such document.")
