"""前端联调契约测试：验证架构页面依赖的 API 响应字段与前端 store 一致"""
import pytest

from app.llm.provider import LLMResponse
from tests.test_architectures import _setup_solution


@pytest.mark.asyncio
async def test_architecture_frontend_contract_flow(sa_auth_client, mock_llm):
    """模拟架构设计页面的完整操作流程"""
    project_id, req_id, solution_id = await _setup_solution(sa_auth_client, mock_llm)

    # 1. 列表方案（页面加载）
    list_resp = await sa_auth_client.get(f"/api/v1/projects/{project_id}/architectures")
    assert list_resp.status_code == 200
    solutions = list_resp.json()
    assert len(solutions) >= 1
    assert "status" in solutions[0]
    assert "quality_scores" in solutions[0]

    # 2. 更新方案状态（状态推进按钮）
    status_resp = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}",
        json={"status": "selected"},
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "selected"

    # 3. 组件 CRUD（组件管理 Tab）
    comp_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components",
        json={"name": "订单服务", "comp_type": "service", "responsibility": "处理订单"},
    )
    assert comp_resp.status_code == 201
    comp_id = comp_resp.json()["id"]

    comps = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/components"
    )
    assert comps.status_code == 200
    assert any(c["id"] == comp_id for c in comps.json())

    # 4. 人工评审（评审 Tab）
    review_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews",
        json={"comment": "联调测试评审", "rating": 4},
    )
    assert review_resp.status_code == 200

    reviews = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews"
    )
    assert reviews.status_code == 200
    assert len(reviews.json()) >= 1
    review_id = reviews.json()[0]["id"]

    update_review = await sa_auth_client.put(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/reviews/{review_id}",
        json={"status": "addressed"},
    )
    assert update_review.status_code == 200
    assert update_review.json()["status"] == "addressed"

    # 5. ADR（ADR Tab）
    adr_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adr",
        json={
            "title": "选用微服务架构",
            "context": "业务模块独立扩展",
            "decision": "采用微服务",
            "consequences": "运维复杂度上升",
        },
    )
    assert adr_resp.status_code == 200

    adrs = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/adrs"
    )
    assert adrs.status_code == 200
    assert len(adrs.json()) >= 1

    # 6. 生成架构文档（字段 document，非 content）
    mock_llm.complete.return_value = LLMResponse(
        content="# 架构文档\n\n联调测试", parsed_json=None
    )
    doc_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/generate-doc"
    )
    assert doc_resp.status_code == 200
    doc_data = doc_resp.json()
    assert "document" in doc_data
    assert isinstance(doc_data["document"], str)

    # 7. 生成 PlantUML
    mock_llm.complete.return_value = LLMResponse(
        content="@startuml\n[A] --> [B]\n@enduml", parsed_json=None
    )
    puml_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/generate-plantuml"
    )
    assert puml_resp.status_code == 200
    assert "plantuml" in puml_resp.json()

    # 8. AI 评审
    ai_review_payload = {
        "summary": "整体良好",
        "overall_rating": 8,
        "quality_assessment": {"性能": "良好"},
        "pattern_fitness": {"微服务": "适配"},
        "defects": [],
        "suggestions": ["增加缓存层"],
    }
    mock_llm.complete.return_value = LLMResponse(
        content="{}", parsed_json=ai_review_payload
    )
    ai_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/ai-review"
    )
    assert ai_resp.status_code == 200
    ai_data = ai_resp.json()
    assert "overall_rating" in ai_data
    assert "summary" in ai_data

    # 9. 追溯映射 + 矩阵（追溯页面）
    mock_llm.complete.return_value = LLMResponse(
        content="{}",
        parsed_json={
            "mappings": [
                {
                    "requirement_id": req_id,
                    "component_name": "用户服务",
                    "mapping_type": "direct",
                    "confidence": 0.9,
                }
            ]
        },
    )
    map_resp = await sa_auth_client.post(
        f"/api/v1/projects/{project_id}/architectures/traceability/auto-map"
    )
    assert map_resp.status_code == 200

    matrix_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/traceability/matrix"
    )
    assert matrix_resp.status_code == 200
    matrix = matrix_resp.json()
    assert "coverage" in matrix
    assert "requirements" in matrix

    # 10. 统计接口
    stats_resp = await sa_auth_client.get(
        f"/api/v1/projects/{project_id}/architectures/{solution_id}/stats"
    )
    assert stats_resp.status_code == 200
    assert "review_count" in stats_resp.json()
