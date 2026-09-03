"""Registering, signing in, and signing out.

The session token travels in an httpOnly cookie rather than the response body.
No script can read it, which is what stops an injected one from walking off
with somebody's session, and the browser attaches it without the frontend
having to remember anything.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response

from app.auth.accounts import EmailAlreadyRegistered, authenticate, create
from app.auth.models import AccountResponse, LoginRequest, SignupRequest
from app.auth.passwords import InvalidPassword
from app.auth.sessions import COOKIE_NAME, issue, revoke
from app.dependencies import CurrentUser, DbDep, SettingsDep

router = APIRouter(prefix="/auth", tags=["auth"])

#: One week. The database is rebuilt on every restart, so in practice a session
#: rarely lives that long -- this is the ceiling, not the expectation.
SESSION_MAX_AGE = 7 * 24 * 60 * 60


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
