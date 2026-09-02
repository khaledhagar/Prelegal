-- Prelegal schema.
--
-- Recreated from scratch on every startup (see app/db.py), so there are no
-- migrations and nothing here is expected to survive a restart. When the
-- database becomes durable this file is where migrations start from.

CREATE TABLE users (
    id         INTEGER PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sign-in is a client-side placeholder for now (PL-4), so nothing writes to
-- this table yet. It exists so the shape of the foundation is visible and the
-- first real authentication ticket has somewhere to land.
