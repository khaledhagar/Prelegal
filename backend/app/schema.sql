-- Prelegal schema.
--
-- Recreated from scratch on every startup (see app/db.py), so there are no
-- migrations and nothing here is expected to survive a restart. Accounts and
-- saved drafts go with it: PL-7 asks for real registration, not durable
-- storage. When the database becomes durable this file is where migrations
-- start from.

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    -- NOCASE so "Ada@Acme.com" and "ada@acme.com" are one account, and the
    -- unique index enforces that rather than leaving it to the caller.
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    -- Never a password: see app/auth/passwords.py for the format.
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per signed-in browser.
--
-- The key is a SHA-256 of the token, never the token itself, so reading this
-- table gives you nothing you can present as a cookie. Deleting a row is what
-- makes signing out real, which a self-contained signed token could not offer.
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An agreement someone chose to keep.
--
-- `values_json` is the captured answers, the same shape the chat and the
-- preview pass around. Storing the answers rather than a rendered document
-- means reopening a draft gives back a live, editable agreement -- and that a
-- change to the templates reaches work already saved.
CREATE TABLE drafts (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    title         TEXT NOT NULL,
    values_json   TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every read is "this user's drafts, newest first".
CREATE INDEX drafts_by_user ON drafts (user_id, updated_at DESC);
