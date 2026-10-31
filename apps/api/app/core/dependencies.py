import uuid
from datetime import datetime, timezone
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_token
from app.db.session import get_db
from app.models.identity import Session, User


async def get_current_user(
    request: Request,
    session_token: str | None = Cookie(None, alias="bb_session"),
    x_csrf_token: str | None = Header(None, alias="X-CSRF-Token"),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token_h = hash_token(session_token)
    now = datetime.now(timezone.utc)

    stmt = (
        select(Session)
        .where(
            Session.token_hash == token_h,
            Session.revoked_at.is_(None),
            Session.expires_at > now,
        )
    )
    result = await db.execute(stmt)
    sess = result.scalar_one_or_none()

    if not sess:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid",
        )

    # CSRF check on state-changing requests
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not x_csrf_token or hash_token(x_csrf_token) != sess.csrf_hash:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF validation failed",
            )

    user = await db.get(User, sess.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    request.state.current_user = user
    return user
