"""文档管理 API 测试（mock LLM）"""
import pytest

from app.llm.provider import LLMResponse


async def _setup_project_with_confirmed_req(auth_client):
    """辅助函数：创建项目 + 确认需求，返回 project_id"""
    proj_resp = await auth_client.post(
        "/api/v1/projects",
        json={"name": "Doc Project", "description": "Document test"},
    )
    project_id = proj_resp.json()["id"]

    await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={"title": "功能需求", "description": "系统应支持核心功能"},
    )
    # 确认需求（需要 analyzed 或 confirmed 状态才能生成文档）
    req_list = await auth_client.get(f"/api/v1/projects/{project_id}/requirements")
    req_id = req_list.json()[0]["id"]
    await auth_client.put(
        f"/api/v1/projects/{project_id}/requirements/{req_id}/confirm"
    )
    return project_id


@pytest.mark.asyncio
async def test_generate_document(auth_client, mock_llm):
    """测试 AI 生成 SRS 文档（mock LLM）"""
    project_id = await _setup_project_with_confirmed_req(auth_client)

    mock_llm.complete.return_value = LLMResponse(
        content="# 需求规格说明书\n\n## 1. 概述\n本项目是一个测试项目。\n\n## 2. 功能需求\n- 用户认证\n- 数据管理",
        parsed_json=None,
    )

    response = await auth_client.post(
        f"/api/v1/projects/{project_id}/documents/generate"
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "title" in data
    assert "content" in data
    assert "version" in data
    assert data["version"] == 1
    assert "需求规格说明书" in data["content"]


@pytest.mark.asyncio
async def test_list_documents(auth_client, mock_llm):
    """测试获取文档列表"""
    project_id = await _setup_project_with_confirmed_req(auth_client)

    mock_llm.complete.return_value = LLMResponse(
        content="# 文档1", parsed_json=None
    )
    await auth_client.post(f"/api/v1/projects/{project_id}/documents/generate")

    mock_llm.complete.return_value = LLMResponse(
        content="# 文档2", parsed_json=None
    )
    await auth_client.post(f"/api/v1/projects/{project_id}/documents/generate")

    response = await auth_client.get(f"/api/v1/projects/{project_id}/documents")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2
    assert "id" in data[0]
    assert "title" in data[0]
    assert "version" in data[0]


@pytest.mark.asyncio
async def test_get_document(auth_client, mock_llm):
    """测试获取文档详情"""
    project_id = await _setup_project_with_confirmed_req(auth_client)

    mock_llm.complete.return_value = LLMResponse(
        content="# SRS 文档内容\n详细内容...", parsed_json=None
    )
    gen_resp = await auth_client.post(f"/api/v1/projects/{project_id}/documents/generate")
    doc_id = gen_resp.json()["id"]

    response = await auth_client.get(f"/api/v1/projects/{project_id}/documents/{doc_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == doc_id
    assert "title" in data
    assert "content" in data
    assert "version" in data


@pytest.mark.asyncio
async def test_update_document(auth_client, mock_llm):
    """测试在线编辑文档"""
    project_id = await _setup_project_with_confirmed_req(auth_client)

    mock_llm.complete.return_value = LLMResponse(
        content="# 原始内容", parsed_json=None
    )
    gen_resp = await auth_client.post(f"/api/v1/projects/{project_id}/documents/generate")
    doc_id = gen_resp.json()["id"]

    # 更新文档
    response = await auth_client.put(
        f"/api/v1/projects/{project_id}/documents/{doc_id}",
        json={"content": "# 修改后的内容\n新章节", "title": "更新标题"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "修改后的内容" in str(data["content"])
    assert data["title"] == "更新标题"


@pytest.mark.asyncio
async def test_compare_documents(auth_client, mock_llm):
    """测试版本对比"""
    project_id = await _setup_project_with_confirmed_req(auth_client)

    # 生成第一个版本
    mock_llm.complete.return_value = LLMResponse(
        content="# 版本1\n第一行\n第二行", parsed_json=None
    )
    gen1 = await auth_client.post(f"/api/v1/projects/{project_id}/documents/generate")
    doc1_id = gen1.json()["id"]

    # 生成第二个版本
    mock_llm.complete.return_value = LLMResponse(
        content="# 版本2\n第一行修改\n第二行\n第三行新增", parsed_json=None
    )
    gen2 = await auth_client.post(f"/api/v1/projects/{project_id}/documents/generate")
    doc2_id = gen2.json()["id"]

    # 对比
    response = await auth_client.get(
        f"/api/v1/projects/{project_id}/documents/compare?v1={doc1_id}&v2={doc2_id}"
    )
    assert response.status_code == 200
    data = response.json()
    assert "diff" in data
    assert "additions" in data
    assert "deletions" in data
    assert data["v1"]["id"] == doc1_id
    assert data["v2"]["id"] == doc2_id


@pytest.mark.asyncio
async def test_export_document(auth_client, mock_llm):
    """测试导出文档（md / html / txt）"""
    project_id = await _setup_project_with_confirmed_req(auth_client)

    mock_llm.complete.return_value = LLMResponse(
        content="# 导出测试\n## 章节\n正文内容", parsed_json=None
    )
    gen_resp = await auth_client.post(f"/api/v1/projects/{project_id}/documents/generate")
    doc_id = gen_resp.json()["id"]

    # 导出 Markdown
    md_resp = await auth_client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/export?format=md"
    )
    assert md_resp.status_code == 200
    assert "导出测试" in md_resp.text

    # 导出 HTML
    html_resp = await auth_client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/export?format=html"
    )
    assert html_resp.status_code == 200
    assert "<html>" in html_resp.text or "<!DOCTYPE" in html_resp.text

    # 导出 TXT
    txt_resp = await auth_client.get(
        f"/api/v1/projects/{project_id}/documents/{doc_id}/export?format=txt"
    )
    assert txt_resp.status_code == 200
    assert "导出测试" in txt_resp.text
