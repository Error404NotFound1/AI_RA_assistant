"""管理员 API 测试"""
import pytest


@pytest.mark.asyncio
async def test_get_dashboard(admin_auth_client):
    """测试管理员仪表盘统计"""
    response = await admin_auth_client.get("/api/v1/admin/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert "user_count" in data
    assert "active_user_count" in data
    assert "project_count" in data
    assert "requirement_count" in data
    assert "architecture_count" in data
    assert "ai_usage_count" in data
    assert data["user_count"] >= 1  # 至少有 admin 用户


@pytest.mark.asyncio
async def test_get_statistics(admin_auth_client):
    """测试系统统计数据"""
    response = await admin_auth_client.get("/api/v1/admin/statistics")
    assert response.status_code == 200
    data = response.json()
    assert "ai_usage" in data
    assert "requirement_coverage" in data
    assert "structured_data" in data
    assert "architecture" in data
    assert "documents" in data
    assert "users" in data

    # 验证 ai_usage 结构
    assert "total_calls" in data["ai_usage"]
    assert "by_action" in data["ai_usage"]

    # 验证 requirement_coverage 结构
    assert "total" in data["requirement_coverage"]
    assert "analyzed" in data["requirement_coverage"]
    assert "confirmed" in data["requirement_coverage"]
    assert "analysis_coverage" in data["requirement_coverage"]

    # 验证 users 结构
    assert "total" in data["users"]
    assert data["users"]["total"] >= 1


@pytest.mark.asyncio
async def test_get_logs(admin_auth_client):
    """测试操作日志列表"""
    response = await admin_auth_client.get("/api/v1/admin/logs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

    # 验证日志条目结构（如果有数据）
    if len(data) > 0:
        log = data[0]
        assert "id" in log
        assert "action" in log
        assert "created_at" in log


@pytest.mark.asyncio
async def test_list_users(admin_auth_client):
    """测试用户列表"""
    response = await admin_auth_client.get("/api/v1/admin/users")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "username" in data[0]
    assert "email" in data[0]
    assert "role" in data[0]


@pytest.mark.asyncio
async def test_update_user_role(admin_auth_client):
    """测试更新用户角色"""
    # 先注册一个普通用户
    reg_resp = await admin_auth_client.post(
        "/api/v1/auth/register",
        json={
            "username": "rolechange",
            "email": "role@example.com",
            "password": "Password123!",
        },
    )
    user_id = reg_resp.json()["id"]

    # 更新角色为 SA
    response = await admin_auth_client.put(
        f"/api/v1/admin/users/{user_id}/role",
        json={"role": "SA"},
    )
    assert response.status_code == 200
    assert "已更新" in response.json()["message"]

    # 验证角色已更新
    users_resp = await admin_auth_client.get("/api/v1/admin/users")
    users = users_resp.json()
    target = next(u for u in users if u["id"] == user_id)
    assert target["role"] == "SA"


@pytest.mark.asyncio
async def test_admin_permission_denied(auth_client):
    """测试非管理员用户无法访问管理员端点"""
    response = await auth_client.get("/api/v1/admin/users")
    assert response.status_code == 403
    assert "权限不足" in response.json()["detail"]
