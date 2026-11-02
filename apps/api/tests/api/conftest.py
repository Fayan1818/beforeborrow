import uuid
from typing import AsyncGenerator
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.dependencies import get_current_user
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.finance import *  # Ensure finance models are imported
from app.models.identity import User


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def async_session_factory(test_engine):
    return async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


@pytest_asyncio.fixture(scope="function")
async def db_session(async_session_factory) -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def test_users(db_session: AsyncSession) -> tuple[User, User]:
    u1 = User(
        id=uuid.uuid4(),
        email_normalized="person.b@beforeborrow.test",
        password_hash="test_argon2_hash_dummy_val",
    )
    u2 = User(
        id=uuid.uuid4(),
        email_normalized="other.user@beforeborrow.test",
        password_hash="test_argon2_hash_dummy_val",
    )
    db_session.add(u1)
    db_session.add(u2)
    await db_session.commit()
    await db_session.refresh(u1)
    await db_session.refresh(u2)
    return u1, u2


@pytest_asyncio.fixture(scope="function")
async def unauth_client(async_session_factory) -> AsyncGenerator[AsyncClient, None]:
    async def _get_db():
        async with async_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test/api/v1"
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def auth_client(async_session_factory, test_users) -> AsyncGenerator[tuple[AsyncClient, User, User], None]:
    u1, u2 = test_users

    async def _get_db():
        async with async_session_factory() as session:
            yield session

    async def _get_user_1():
        return u1

    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_current_user] = _get_user_1
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test/api/v1"
        ) as ac:
            yield ac, u1, u2
    finally:
        app.dependency_overrides.clear()
