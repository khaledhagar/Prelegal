"""Registering, signing in, and signing out.

The session token travels in an httpOnly cookie rather than the response body.
No script can read it, which is what stops an injected one from walking off
with somebody's session, and the browser attaches it without the frontend
having to remember anything.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, Response

from app.auth import resets
from app.auth.accounts import (
    EmailAlreadyRegistered,
    authenticate,
    create,
    find_by_email,
    set_password,
)
from app.auth.models import (
    AccountResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignupRequest,
)
from app.auth.passwords import InvalidPassword, validate, verify_password
from app.auth.sessions import COOKIE_NAME, issue, revoke, revoke_all_for_user
from app.dependencies import CurrentUser, DbDep, SettingsDep

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

#: One week. The ceiling, not the expectation -- signing out, changing a
#: password or resetting one all end sessions earlier.
SESSION_MAX_AGE = 7 * 24 * 60 * 60

#: What `/auth/forgot` says, whatever the answer really is. Worded so that it
#: is true either way: something was done if the address is known, and the
#: sentence does not promise that it was.
RESET_REQUESTED = (
    "If that address has an account, a password reset link has been created."
)


def _set_session_cookie(response: Response, token: str, *, secure: bool) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        # Lax, not None: the cookie rides along with ordinary navigation to the
        # app but not with a cross-site form post, which is what makes CSRF
        # against these endpoints impractical without a separate token.
        samesite="lax",
        secure=secure,
        path="/",
    )


@router.post("/signup", status_code=201)
def signup(
    payload: SignupRequest,
    response: Response,
    db: DbDep,
    settings: SettingsDep,
) -> AccountResponse:
    try:
        user = create(
            db, name=payload.name, email=payload.email, password=payload.password
        )
    except InvalidPassword as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except EmailAlreadyRegistered as error:
        # This does tell a stranger whether an address is registered. Signup
        # cannot usefully hide that -- someone has to be told the address is
        # taken -- so the honesty is deliberate and confined to this endpoint.
        # `/auth/login` gives nothing away.
        raise HTTPException(
            status_code=409,
            detail="That email already has an account. Sign in instead.",
        ) from error

    _set_session_cookie(response, issue(db, user.id), secure=settings.secure_cookies)
    return AccountResponse(id=user.id, email=user.email, name=user.name)


@router.post("/login")
def login(
    payload: LoginRequest,
    response: Response,
    db: DbDep,
    settings: SettingsDep,
) -> AccountResponse:
    user = authenticate(db, email=payload.email, password=payload.password)
    if user is None:
        # One message for both "no such account" and "wrong password". Saying
        # which would turn this endpoint into a way to find out who has an
        # account here.
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")

    _set_session_cookie(response, issue(db, user.id), secure=settings.secure_cookies)
    return AccountResponse(id=user.id, email=user.email, name=user.name)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DbDep) -> None:
    """
    Ends the session server-side, then clears the cookie.

    Deleting the row is the part that matters: clearing the cookie alone would
    leave a token that still works for anyone who kept a copy. Signing out when
    already signed out succeeds quietly rather than returning 401 to someone
    who is trying to leave.
    """
    revoke(db, request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me")
def me(user: CurrentUser) -> AccountResponse:
    """Who the cookie belongs to. 401 when it belongs to nobody, which is what
    the frontend uses to decide whether to show the app at all."""
    return AccountResponse(id=user.id, email=user.email, name=user.name)


@router.post("/password", status_code=204)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: CurrentUser,
    db: DbDep,
) -> None:
    """
    Changes the password of the signed-in account.

    The current password is required on top of the session. The session only
    proves that somebody is signed in; without the second check, a session
    someone walked away from -- or one that was stolen -- would be enough to
    set a new password and lock the owner out permanently.
    """
    row = db.execute(
        "SELECT password_hash FROM users WHERE id = ?", (user.id,)
    ).fetchone()
    if row is None or not verify_password(payload.current_password, row["password_hash"]):
        raise HTTPException(status_code=403, detail="That is not your current password.")

    try:
        with db:
            set_password(db, user.id, payload.new_password)
            # Every other session goes: changing a password is how someone
            # reacts to one they no longer trust. The browser doing it stays.
            revoke_all_for_user(db, user.id, keep=request.cookies.get(COOKIE_NAME))
    except InvalidPassword as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/forgot", status_code=202)
def forgot_password(
    payload: ForgotPasswordRequest, request: Request, db: DbDep
) -> dict[str, str]:
    """
    Starts a password reset.

    Answers the same way for an address that has an account and one that does
    not. Anything else -- a different status, a different message, a
    measurably different delay -- turns this into a way to find out who has an
    account here, which is exactly what `/auth/login` already refuses to say.

    There is no mail sending in this product, so the link goes to the server
    log for whoever runs the deployment to pass on. The token is real; only the
    delivery is manual. See `app.auth.resets`.
    """
    resets.purge_expired(db)
    user = find_by_email(db, payload.email)

    if user is not None:
        token = resets.issue(db, user.id)
        link = f"{str(request.base_url).rstrip('/')}/reset/?token={token}"
        # The one place a token is ever written down. It is a credential, so
        # it goes to the log and nowhere near the response body.
        logger.warning(
            "password reset requested for %s -- link (valid %d minutes): %s",
            user.email,
            resets.TTL_MINUTES,
            link,
        )
    else:
        logger.info(
            "password reset requested for an address with no account; saying nothing"
        )

    return {"detail": RESET_REQUESTED}


@router.post("/reset", status_code=204)
def reset_password(
    payload: ResetPasswordRequest, response: Response, db: DbDep
) -> None:
    """
    Sets a new password from a reset token.

    The password is validated before the token is spent, so a typo costs a
    retry rather than another reset request. Every session ends -- whoever
    prompted the reset should not still be signed in when it finishes.
    """
    try:
        # Checked first, and against nothing stored, so an unusable password
        # never consumes the link.
        validate(payload.new_password)
    except InvalidPassword as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    user_id = resets.redeem(db, payload.token)
    if user_id is None:
        # Expired, already used, or never real -- one answer for all three.
        raise HTTPException(
            status_code=400,
            detail="That reset link is no longer valid. Request a new one.",
        )

    with db:
        set_password(db, user_id, payload.new_password)
        revoke_all_for_user(db, user_id)

    response.delete_cookie(COOKIE_NAME, path="/")
