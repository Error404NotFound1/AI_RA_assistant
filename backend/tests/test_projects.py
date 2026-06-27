"""项目 CRUD API 测试"""
import pytest


@pytest.mark.asyncio
async def test_create_project(auth_client):
    """测试创建项目"""
    response = await auth_client.post(
        "/api/v1/projects",
        json={"name": "My Project", "description": "A test project"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Project"
    assert data["description"] == "A test project"
    assert data["status"] == "active"
    assert "id" in data
    assert "owner_id" in data


@pytest.mark.asyncio
async def test_list_projects(auth_client, test_project):
    """测试获取项目列表"""
    response = await auth_client.get("/api/v1/projects")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["name"] == "Test Project"


@pytest.mark.asyncio
async def test_get_project(auth_client, test_project):
    """测试获取项目详情"""
    project_id = test_project["id"]
    response = await auth_client.get(f"/api/v1/projects/{project_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == project_id
    assert data["name"] == "Test Project"


@pytest.mark.asyncio
async def test_get_project_not_found(auth_client):
    """测试获取不存在的项目返回 404"""
    response = await auth_client.get(
        "/api/v1/projects/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_project(auth_client, test_project):
    """测试更新项目"""
    project_id = test_project["id"]
    response = await auth_client.put(
        f"/api/v1/projects/{project_id}",
        json={"name": "Updated Project", "description": "Updated description"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Project"
    assert data["description"] == "Updated description"


@pytest.mark.asyncio
async def test_delete_project(auth_client):
    """测试删除项目"""
    # 先创建一个项目
    create_resp = await auth_client.post(
        "/api/v1/projects",
        json={"name": "To Delete", "description": "Will be deleted"},
    )
    project_id = create_resp.json()["id"]

    # 删除项目
    response = await auth_client.delete(f"/api/v1/projects/{project_id}")
    assert response.status_code == 200
    assert "已删除" in response.json()["message"]

    # 验证项目已被删除
    get_resp = await auth_client.get(f"/api/v1/projects/{project_id}")
    assert get_resp.status_code == 404
