"""测试配置和 fixtures

使用内存 SQLite 数据库，mock LLM provider，确保测试独立运行不依赖外部服务。
"""
import os
import shutil

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from unittest.mock import AsyncMock, MagicMock

from app.core.db import Base, get_db
from app.core.security import create_access_token, get_password_hash
from app.models.user import User, UserRole
from app.main import app

# 使用内存 SQLite 数据库
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


# ──────────────────────────────────────
# 数据库 fixtures
# ──────────────────────────────────────

@pytest_asyncio.fixture
async def db_engine():
    """创建内存数据库引擎（StaticPool 确保所有连接共享同一内存库）"""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine):
    """创建数据库会话"""
    session_maker = async_sessionmaker(
        db_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session):
    """创建测试用 HTTP 客户端，覆盖数据库依赖"""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ──────────────────────────────────────
# 用户 fixtures
# ──────────────────────────────────────

@pytest_asyncio.fixture
async def test_user(db_session):
    """创建测试用户（需求工程师 RE）"""
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password=get_password_hash("Test1234!"),
        full_name="Test User",
        role=UserRole.REQUIREMENT_ENGINEER,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_sa_user(db_session):
    """创建测试用户（系统架构师 SA）"""
    user = User(
        username="sauser",
        email="sa@example.com",
        hashed_password=get_password_hash("Test1234!"),
        full_name="SA User",
        role=UserRole.SYSTEM_ARCHITECT,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_admin_user(db_session):
    """创建测试用户（管理员）"""
    user = User(
        username="adminuser",
        email="admin@example.com",
        hashed_password=get_password_hash("Test1234!"),
        full_name="Admin User",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


# ──────────────────────────────────────
# 认证 fixtures
# ──────────────────────────────────────

@pytest_asyncio.fixture
async def auth_token(test_user):
    """生成 RE 用户访问令牌"""
    return create_access_token(subject=str(test_user.id))


@pytest_asyncio.fixture
async def sa_auth_token(test_sa_user):
    """生成 SA 用户访问令牌"""
    return create_access_token(subject=str(test_sa_user.id))


@pytest_asyncio.fixture
async def admin_auth_token(test_admin_user):
    """生成 Admin 用户访问令牌"""
    return create_access_token(subject=str(test_admin_user.id))


@pytest_asyncio.fixture
async def auth_client(client, auth_token):
    """带 RE 用户认证的 HTTP 客户端"""
    client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return client


@pytest_asyncio.fixture
async def sa_auth_client(client, sa_auth_token):
    """带 SA 用户认证的 HTTP 客户端"""
    client.headers.update({"Authorization": f"Bearer {sa_auth_token}"})
    return client


@pytest_asyncio.fixture
async def admin_auth_client(client, admin_auth_token):
    """带 Admin 用户认证的 HTTP 客户端"""
    client.headers.update({"Authorization": f"Bearer {admin_auth_token}"})
    return client


# ──────────────────────────────────────
# 项目 fixture
# ──────────────────────────────────────

@pytest_asyncio.fixture
async def test_project(auth_client):
    """创建测试项目"""
    response = await auth_client.post(
        "/api/v1/projects",
        json={"name": "Test Project", "description": "Test Description"},
    )
    assert response.status_code == 201
    return response.json()


# ──────────────────────────────────────
# LLM Mock fixture
# ──────────────────────────────────────

@pytest_asyncio.fixture
async def mock_llm(monkeypatch):
    """Mock LLM Provider，用于测试 AI 功能

    返回 MagicMock provider，测试中可自定义 complete / stream 的返回值。
    自动 patch 所有引用 get_llm_provider 的 API 模块。
    """
    from app.llm.provider import LLMResponse

    provider = MagicMock()
    # 默认返回值，测试中可覆盖
    default_response = LLMResponse(
        content='{"result": "test"}',
        parsed_json={"result": "test"},
        usage={"total_tokens": 100},
    )
    provider.complete = AsyncMock(return_value=default_response)
    provider.stream = AsyncMock()

    # patch 所有引用 get_llm_provider 的模块
    for module_path in [
        "app.api.requirements",
        "app.api.architectures",
        "app.api.documents",
    ]:
        monkeypatch.setattr(module_path + ".get_llm_provider", lambda: provider)

    return provider
