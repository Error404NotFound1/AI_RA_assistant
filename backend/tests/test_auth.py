"""认证 API 测试"""
import pytest


@pytest.mark.asyncio
async def test_register_success(client):
    """测试注册新用户"""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "newuser",
            "email": "new@example.com",
            "password": "Password123!",
            "full_name": "New User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "newuser"
    assert data["email"] == "new@example.com"
    assert data["full_name"] == "New User"
    assert data["is_active"] is True
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate(client):
    """测试重复用户名注册失败"""
    payload = {
        "username": "dupuser",
        "email": "dup@example.com",
        "password": "Password123!",
    }
    # 第一次注册成功
    resp1 = await client.post("/api/v1/auth/register", json=payload)
    assert resp1.status_code == 201

    # 第二次用相同用户名注册失败
    resp2 = await client.post(
        "/api/v1/auth/register",
        json={**payload, "email": "other@example.com"},
    )
    assert resp2.status_code == 400
    assert "已存在" in resp2.json()["detail"]


@pytest.mark.asyncio
async def test_login_success(client):
    """测试正确密码登录"""
    # 先注册
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "loginuser",
            "email": "login@example.com",
            "password": "Password123!",
        },
    )
    # 登录
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "loginuser", "password": "Password123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    """测试错误密码登录失败"""
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "wrongpw",
            "email": "wrong@example.com",
            "password": "Password123!",
        },
    )
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "wrongpw", "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    assert "错误" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_me(auth_client):
    """测试获取当前用户信息"""
    response = await auth_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_refresh_token(client):
    """测试刷新令牌"""
    # 先注册并登录
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "refreshuser",
            "email": "refresh@example.com",
            "password": "Password123!",
        },
    )
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"username": "refreshuser", "password": "Password123!"},
    )
    refresh_token = login_resp.json()["refresh_token"]

    # 刷新令牌
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
