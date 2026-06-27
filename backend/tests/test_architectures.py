"""架构设计 API 测试（mock LLM）"""
import pytest

from app.llm.provider import LLMResponse


async def _setup_project_with_confirmed_req(sa_auth_client):
    """辅助函数：创建项目 + 需求并确认，返回 (project_id, req_id)"""
    proj_resp = await sa_auth_client.post(
        "/api/v1/projects",
        json={"name": "Arch Project", "description": "Architecture test"},
    )
    project_id = proj_resp.json()["id"]

    req_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={"title": "用户认证", "description": "系统应支持用户认证"},
    )
    req_id = req_resp.json()["id"]

    await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/requirements/{req_id}/confirm"
    )
    return project_id, req_id


@pytest.mark.asyncio
async def test_recommend_architecture(sa_auth_client, mock_llm):
    """测试 AI 架构推荐（mock LLM）"""
    project_id, req_id = await _setup_project_with_confirmed_req(sa_auth_client)

    arch_recommendation = {
        "recommended_patterns": [
            {
                "name": "分层架构",
                "suitability_score": 85,
                "pros": ["结构清晰", "易于维护"],
                "cons": ["扩展性受限"],
                "reason": "适合中小型项目",
            }
        ],
        "components": [
            {
                "name": "API网关",
                "type": "gateway",
                "responsibility": "路由和限流",
                "interfaces": ["REST"],
                "dependencies": [],
            },
            {
                "name": "认证服务",
                "type": "service",
                "responsibility": "用户认证",
                "interfaces": ["REST"],
                "dependencies": ["API网关"],
            },
        ],
        "tech_stack": {
            "frontend": "Next.js",
            "backend": "FastAPI",
            "database": "PostgreSQL",
        },
        "quality_verification": {
            "性能": {"score": 8, "risk": "低"}
        },
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=arch_recommendation
    )

    response = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/recommend",
        json={"quality_attributes": ["性能", "安全性"], "constraints": {"team_size": "5人"}},
    )
    assert response.status_code == 200
    data = response.json()
    assert "recommended_patterns" in data
    assert len(data["recommended_patterns"]) == 1
    assert data["recommended_patterns"][0]["name"] == "分层架构"
    assert "components" in data
    assert len(data["components"]) == 2

    # 验证架构方案已保存到数据库
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures"
    )
    assert list_resp.status_code == 200
    solutions = list_resp.json()
    assert len(solutions) >= 1
    assert solutions[0]["pattern"] == "分层架构"


@pytest.mark.asyncio
async def test_auto_map_traceability(sa_auth_client, mock_llm):
    """测试 AI 自动建立 traceability 映射（mock LLM）"""
    project_id, req_id = await _setup_project_with_confirmed_req(sa_auth_client)

    # Step 1: 先调用 recommend 创建架构方案和组件
    arch_recommendation = {
        "recommended_patterns": [
            {"name": "分层架构", "suitability_score": 85, "pros": [], "cons": [], "reason": "test"}
        ],
        "components": [
            {"name": "认证服务", "type": "service", "responsibility": "用户认证", "interfaces": [], "dependencies": []},
        ],
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=arch_recommendation
    )
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/recommend",
        json={"quality_attributes": None, "constraints": None},
    )

    # Step 2: 调用 auto-map（使用 component_name 匹配）
    traceability_mapping = {
        "mappings": [
            {
                "requirement_id": req_id,
                "component_name": "认证服务",
                "mapping_type": "direct",
                "confidence": 0.9,
                "rationale": "直接实现用户认证功能",
            }
        ],
        "uncovered_requirements": [],
        "coverage_percentage": 100.0,
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=traceability_mapping
    )

    response = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/traceability/auto-map"
    )
    assert response.status_code == 200
    data = response.json()
    assert "mappings" in data
    assert len(data["mappings"]) == 1
    assert data["mappings"][0]["component_name"] == "认证服务"


@pytest.mark.asyncio
async def test_get_traceability_matrix(sa_auth_client, mock_llm):
    """测试获取 traceability 矩阵"""
    project_id, req_id = await _setup_project_with_confirmed_req(sa_auth_client)

    # 先创建架构方案和 traceability links
    arch_recommendation = {
        "recommended_patterns": [
            {"name": "分层架构", "suitability_score": 85, "pros": [], "cons": [], "reason": "test"}
        ],
        "components": [
            {"name": "认证模块", "type": "service", "responsibility": "认证", "interfaces": [], "dependencies": []},
        ],
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=arch_recommendation
    )
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/recommend",
        json={"quality_attributes": None, "constraints": None},
    )

    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json={
            "mappings": [
                {"requirement_id": req_id, "component_name": "认证模块", "mapping_type": "direct", "confidence": 0.95, "rationale": "test"}
            ]
        }
    )
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/traceability/auto-map"
    )

    # 查询矩阵
    response = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/traceability/matrix"
    )
    assert response.status_code == 200
    data = response.json()
    assert "requirements" in data
    assert "coverage" in data
    assert data["coverage"]["total"] >= 1
    assert data["coverage"]["covered"] >= 1
    assert data["coverage"]["percentage"] > 0

    # 验证矩阵中的需求条目
    req_entry = data["requirements"][0]
    assert "user_stories" in req_entry
    assert "use_cases" in req_entry
    assert "arch_links" in req_entry
    assert req_entry["covered"] is True


@pytest.mark.asyncio
async def test_generate_arch_doc(sa_auth_client, mock_llm):
    """测试生成架构文档（mock LLM）"""
    project_id, req_id = await _setup_project_with_confirmed_req(sa_auth_client)

    # 创建架构方案
    arch_recommendation = {
        "recommended_patterns": [
            {"name": "分层架构", "suitability_score": 85, "pros": [], "cons": [], "reason": "test"}
        ],
        "components": [
            {"name": "API网关", "type": "gateway", "responsibility": "路由", "interfaces": [], "dependencies": []},
        ],
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=arch_recommendation
    )
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/recommend",
        json={"quality_attributes": None, "constraints": None},
    )

    # 获取 solution_id
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures"
    )
    solution_id = list_resp.json()[0]["id"]

    # 生成架构文档
    mock_llm.complete.return_value = LLMResponse(
        content="# 架构设计文档\n\n## 1. 架构概述\n本文档描述系统架构设计。\n\n## 2. 架构模式\n采用分层架构。",
        parsed_json=None,
    )
    response = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/generate-doc"
    )
    assert response.status_code == 200
    data = response.json()
    assert "document" in data
    assert "架构" in data["document"]
    assert data["solution_id"] == solution_id


@pytest.mark.asyncio
async def test_generate_plantuml(sa_auth_client, mock_llm):
    """测试生成 PlantUML 代码（mock LLM）"""
    project_id, req_id = await _setup_project_with_confirmed_req(sa_auth_client)

    # 创建架构方案和组件
    arch_recommendation = {
        "recommended_patterns": [
            {"name": "分层架构", "suitability_score": 85, "pros": [], "cons": [], "reason": "test"}
        ],
        "components": [
            {"name": "前端", "type": "frontend", "responsibility": "UI", "interfaces": [], "dependencies": []},
            {"name": "API网关", "type": "gateway", "responsibility": "路由", "interfaces": [], "dependencies": ["前端"]},
            {"name": "数据库", "type": "database", "responsibility": "存储", "interfaces": [], "dependencies": ["API网关"]},
        ],
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=arch_recommendation
    )
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/recommend",
        json={"quality_attributes": None, "constraints": None},
    )

    # 获取 solution_id
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures"
    )
    solution_id = list_resp.json()[0]["id"]

    # 生成 PlantUML
    plantuml_code = "@startuml\n[前端] as fe\n[API网关] as api\n[数据库] as db\nfe --> api\napi --> db\n@enduml"
    mock_llm.complete.return_value = LLMResponse(
        content=plantuml_code,
        parsed_json=None,
    )
    response = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/generate-plantuml"
    )
    assert response.status_code == 200
    data = response.json()
    assert "plantuml" in data
    assert "@startuml" in data["plantuml"]
    assert "@enduml" in data["plantuml"]
