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


# =============================================
# 以下为新增测试用例，覆盖 Reviews / ADR / Component / TraceabilityLink / Solution 端点
# =============================================

async def _setup_solution(sa_auth_client, mock_llm):
    """辅助函数：创建项目 + 需求 + 架构方案，返回 (project_id, req_id, solution_id)"""
    project_id, req_id = await _setup_project_with_confirmed_req(sa_auth_client)

    arch_recommendation = {
        "recommended_patterns": [
            {"name": "微服务架构", "suitability_score": 90, "pros": [], "cons": [], "reason": "test"}
        ],
        "components": [
            {"name": "用户服务", "type": "service", "responsibility": "用户管理", "interfaces": [], "dependencies": []},
        ],
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=arch_recommendation
    )
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/recommend",
        json={"quality_attributes": None, "constraints": None},
    )

    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures"
    )
    solution_id = list_resp.json()[0]["id"]
    return project_id, req_id, solution_id


@pytest.mark.asyncio
async def test_list_and_get_reviews(sa_auth_client, mock_llm):
    """测试评审的列表查询和详情获取"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 创建评审
    create_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews",
        json={"comment": "架构设计合理，建议补充安全模块", "rating": 4},
    )
    assert create_resp.status_code == 200

    # 获取评审列表
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews"
    )
    assert list_resp.status_code == 200
    reviews = list_resp.json()
    assert len(reviews) >= 1
    review_id = reviews[0]["id"]
    assert reviews[0]["comment"] == "架构设计合理，建议补充安全模块"
    assert reviews[0]["rating"] == 4
    assert reviews[0]["status"] == "open"

    # 获取评审详情
    detail_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews/{review_id}"
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["id"] == review_id
    assert detail_resp.json()["comment"] == "架构设计合理，建议补充安全模块"


@pytest.mark.asyncio
async def test_update_review_status(sa_auth_client, mock_llm):
    """测试评审状态流转：open → addressed → resolved，以及非法流转被拒绝"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 创建评审（默认 status=open）
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews",
        json={"comment": "需要优化性能", "rating": 3},
    )
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews"
    )
    review_id = list_resp.json()[0]["id"]

    # 非法流转：open 直接到 resolved 应被拒绝
    bad_resp = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews/{review_id}",
        json={"status": "resolved"},
    )
    assert bad_resp.status_code == 400

    # 合法流转：open → addressed
    resp1 = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews/{review_id}",
        json={"status": "addressed"},
    )
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "addressed"

    # 合法流转：addressed → resolved
    resp2 = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews/{review_id}",
        json={"status": "resolved"},
    )
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "resolved"


@pytest.mark.asyncio
async def test_delete_review(sa_auth_client, mock_llm):
    """测试删除评审"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 创建评审
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews",
        json={"comment": "待删除的评审", "rating": 2},
    )
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews"
    )
    review_id = list_resp.json()[0]["id"]

    # 删除评审
    del_resp = await sa_auth_client.delete(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews/{review_id}"
    )
    assert del_resp.status_code == 200
    assert "已删除" in del_resp.json()["message"]

    # 验证已删除
    get_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews/{review_id}"
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_crud_adrs(sa_auth_client, mock_llm):
    """测试 ADR 的完整 CRUD"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 创建 ADR
    create_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adr",
        json={
            "title": "ADR-001: 选择微服务架构",
            "context": "系统需要高可扩展性",
            "decision": "采用微服务架构",
            "consequences": "运维复杂度增加",
        },
    )
    assert create_resp.status_code == 200

    # 列表查询
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adrs"
    )
    assert list_resp.status_code == 200
    adrs = list_resp.json()
    assert len(adrs) >= 1
    adr_id = adrs[0]["id"]
    assert adrs[0]["title"] == "ADR-001: 选择微服务架构"
    assert adrs[0]["status"] == "proposed"

    # 详情查询
    detail_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adrs/{adr_id}"
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["decision"] == "采用微服务架构"

    # 更新 ADR（修改 title 和 status）
    update_resp = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adrs/{adr_id}",
        json={"title": "ADR-001: 确认微服务架构", "status": "accepted"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["title"] == "ADR-001: 确认微服务架构"
    assert update_resp.json()["status"] == "accepted"

    # 删除 ADR
    del_resp = await sa_auth_client.delete(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adrs/{adr_id}"
    )
    assert del_resp.status_code == 200
    assert "已删除" in del_resp.json()["message"]

    # 验证已删除
    get_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adrs/{adr_id}"
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_crud_components(sa_auth_client, mock_llm):
    """测试组件的完整 CRUD（含级联删除 traceability link 验证）"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # POST 创建组件
    create_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components",
        json={"name": "支付服务", "comp_type": "service", "responsibility": "处理支付逻辑"},
    )
    assert create_resp.status_code == 201
    component_id = create_resp.json()["id"]
    assert create_resp.json()["name"] == "支付服务"

    # GET 列表查询（应包含 recommend 创建的组件 + 手动创建的）
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components"
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 2  # 至少有 "用户服务" 和 "支付服务"

    # GET 详情
    detail_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components/{component_id}"
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["responsibility"] == "处理支付逻辑"

    # PUT 编辑
    update_resp = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components/{component_id}",
        json={"name": "支付网关", "responsibility": "统一支付入口"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "支付网关"
    assert update_resp.json()["responsibility"] == "统一支付入口"

    # 创建追溯链接以验证级联删除
    link_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links",
        json={"requirement_id": req_id, "component_id": component_id, "mapping_type": "direct", "confidence": 0.9},
    )
    assert link_resp.status_code == 201

    # DELETE 删除组件（应级联删除 traceability link）
    del_resp = await sa_auth_client.delete(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components/{component_id}"
    )
    assert del_resp.status_code == 200

    # 验证组件已删除
    get_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components/{component_id}"
    )
    assert get_resp.status_code == 404

    # 验证追溯链接也被级联删除
    links_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links"
    )
    assert links_resp.status_code == 200
    remaining_links = [lk for lk in links_resp.json() if lk["component_id"] == component_id]
    assert len(remaining_links) == 0


@pytest.mark.asyncio
async def test_crud_traceability_links(sa_auth_client, mock_llm):
    """测试追溯链接的完整 CRUD（含重复创建拒绝验证）"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 获取 recommend 创建的组件 ID
    comp_list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components"
    )
    component_id = comp_list_resp.json()[0]["id"]

    # POST 创建链接
    create_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links",
        json={
            "requirement_id": req_id,
            "component_id": component_id,
            "mapping_type": "direct",
            "confidence": 0.85,
            "rationale": "直接实现需求",
        },
    )
    assert create_resp.status_code == 201
    link_id = create_resp.json()["id"]
    assert create_resp.json()["mapping_type"] == "direct"
    assert create_resp.json()["confidence"] == 0.85

    # 验证重复创建被拒绝
    dup_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links",
        json={"requirement_id": req_id, "component_id": component_id},
    )
    assert dup_resp.status_code == 400
    assert "已存在" in dup_resp.json()["detail"]

    # GET 列表查询
    list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links"
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1

    # PUT 编辑（修改 mapping_type 和 confidence）
    update_resp = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links/{link_id}",
        json={"mapping_type": "indirect", "confidence": 0.7},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["mapping_type"] == "indirect"
    assert update_resp.json()["confidence"] == 0.7

    # DELETE 删除
    del_resp = await sa_auth_client.delete(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links/{link_id}"
    )
    assert del_resp.status_code == 200
    assert "已删除" in del_resp.json()["message"]


@pytest.mark.asyncio
async def test_bidirectional_traceability(sa_auth_client, mock_llm):
    """测试组件→需求的反向查询（双向追溯）"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 获取组件 ID
    comp_list_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components"
    )
    component_id = comp_list_resp.json()[0]["id"]

    # 创建追溯链接
    await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/traceability/links",
        json={
            "requirement_id": req_id,
            "component_id": component_id,
            "mapping_type": "direct",
            "confidence": 0.92,
            "rationale": "该组件直接实现用户认证需求",
        },
    )

    # GET 组件关联的需求（反向查询）
    resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components/{component_id}/requirements"
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["requirement_id"] == req_id
    assert data[0]["requirement_title"] == "用户认证"
    assert data[0]["mapping_type"] == "direct"
    assert data[0]["confidence"] == 0.92


@pytest.mark.asyncio
async def test_update_solution(sa_auth_client, mock_llm):
    """测试方案编辑：修改名称 + 编辑 recommendation 后 version 自动递增"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 获取初始 version
    detail_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}"
    )
    initial_version = detail_resp.json()["version"]

    # PUT 编辑方案名称（不涉及 recommendation，version 不变）
    name_resp = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}",
        json={"name": "优化后的微服务方案"},
    )
    assert name_resp.status_code == 200
    assert name_resp.json()["name"] == "优化后的微服务方案"
    assert name_resp.json()["version"] == initial_version  # version 不变

    # PUT 编辑 recommendation → version 自动递增
    rec_resp = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}",
        json={"recommendation": {"note": "updated"}},
    )
    assert rec_resp.status_code == 200
    assert rec_resp.json()["version"] == initial_version + 1
    assert rec_resp.json()["recommendation"] == {"note": "updated"}
