"""健康检查与边界条件测试"""
import pytest


@pytest.mark.asyncio
async def test_root_endpoint(client):
    """测试根路径健康检查"""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "AI-SE-Assistant" in data["message"]
    assert "version" in data


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """测试 /health 健康检查"""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_unauthorized_access_to_projects(client):
    """测试未登录用户无法访问项目列表"""
    response = await client.get("/api/v1/projects")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_unauthorized_access_to_admin(client):
    """测试未登录用户无法访问管理员端点"""
    response = await client.get("/api/v1/admin/dashboard")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token(client):
    """测试无效 Token 被拒绝"""
    client.headers.update({"Authorization": "Bearer invalid_token_here"})
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    """测试重复邮箱注册失败"""
    payload1 = {
        "username": "emailuser1",
        "email": "same@example.com",
        "password": "Password123!",
    }
    resp1 = await client.post("/api/v1/auth/register", json=payload1)
    assert resp1.status_code == 201

    payload2 = {
        "username": "emailuser2",
        "email": "same@example.com",
        "password": "Password123!",
    }
    resp2 = await client.post("/api/v1/auth/register", json=payload2)
    assert resp2.status_code == 400
    assert "邮箱" in resp2.json()["detail"]


@pytest.mark.asyncio
async def test_login_nonexistent_user(client):
    """测试不存在的用户登录失败"""
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "no_such_user", "password": "Password123!"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_nonexistent_project(auth_client):
    """测试获取不存在的项目详情返回 404"""
    response = await auth_client.get(
        "/api/v1/projects/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_re_cannot_access_admin(auth_client):
    """测试 RE 角色用户无法访问管理员端点"""
    response = await auth_client.get("/api/v1/admin/users")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_refresh_with_invalid_token(client):
    """测试使用无效刷新令牌"""
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "completely_invalid_token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_project_empty_name(auth_client):
    """测试创建空名称项目应被拒绝"""
    response = await auth_client.post(
        "/api/v1/projects",
        json={"name": "", "description": "空名称项目"},
    )
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_delete_nonexistent_project(auth_client):
    """测试删除不存在的项目"""
    response = await auth_client.delete(
        "/api/v1/projects/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_sa_cannot_access_admin(sa_auth_client):
    """测试 SA 角色用户无法访问管理员端点"""
    response = await sa_auth_client.get("/api/v1/admin/dashboard")
    assert response.status_code == 403
