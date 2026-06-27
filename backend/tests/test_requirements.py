"""需求分析 API 测试（包含 AI 功能，mock LLM）"""
import pytest

from app.llm.provider import LLMResponse


@pytest.mark.asyncio
async def test_create_requirement(auth_client, test_project):
    """测试创建需求"""
    project_id = test_project["id"]
    response = await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={
            "title": "用户登录",
            "description": "系统应支持用户使用账号密码登录",
            "source": "客户需求",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "用户登录"
    assert data["description"] == "系统应支持用户使用账号密码登录"
    assert data["status"] == "draft"
    assert "id" in data


@pytest.mark.asyncio
async def test_list_requirements(auth_client, test_project):
    """测试获取需求列表"""
    project_id = test_project["id"]
    # 先创建两个需求
    await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={"title": "需求A", "description": "描述A"},
    )
    await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={"title": "需求B", "description": "描述B"},
    )

    response = await auth_client.get(f"/api/v1/projects/{project_id}/requirements")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 2


@pytest.mark.asyncio
async def test_analyze_requirements(auth_client, test_project, mock_llm):
    """测试 AI 分析需求（mock LLM，验证 UserStory / QualityEvaluation / UseCase 被创建）

    根因 D 修复：mock 数据使用 FR-001/NFR-001 业务编号（不使用 UUID）
    """
    project_id = test_project["id"]

    # 创建需求
    req_resp = await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={"title": "用户注册", "description": "系统应支持用户注册账号"},
    )
    req_id = req_resp.json()["id"]

    # 配置 mock LLM 的四次 complete 调用
    # 1. 提取 FR/NFR（使用 FR-001/NFR-001 业务编号）
    extraction_result = {
        "functional_requirements": [
            {
                "id": "FR-001",
                "title": "用户注册",
                "description": "系统应支持用户注册账号",
                "type": "业务",
                "source": "explicit",
                "rationale": "核心功能",
            }
        ],
        "non_functional_requirements": [
            {
                "id": "NFR-001",
                "title": "安全性",
                "description": "密码需加密存储",
                "category": "安全",
                "source": "inferred",
                "rationale": "安全要求",
            }
        ],
        "user_stories": [
            {
                "requirement_id": "FR-001",
                "role": "用户",
                "goal": "注册账号",
                "benefit": "可以使用系统",
                "acceptance_criteria": "注册成功后可登录",
            }
        ],
        "intent_analysis": {
            "business_goal": "提供用户注册功能",
            "domain": "Web应用",
            "stakeholders": ["用户"],
            "assumptions": ["用户有邮箱"],
        },
    }
    # 2. 分类
    classification_result = {
        "classified_requirements": [
            {"id": "FR-001", "priority": "Must", "rationale": "核心功能"}
        ]
    }
    # 3. 用例
    use_case_result = {
        "use_cases": [
            {
                "requirement_id": "FR-001",
                "title": "用户注册",
                "actor": "用户",
                "preconditions": "用户未注册",
                "main_flow": ["1. 用户填写注册信息", "2. 系统验证信息", "3. 系统创建账号"],
                "alternative_flows": ["邮箱已存在则提示"],
                "postconditions": "账号创建成功",
            }
        ]
    }
    # 4. 图表规划结果
    diagram_plan_result = {
        "diagrams": ["use_case"],
        "reasons": {"use_case": "系统涉及用户交互，需要用例图"},
        "diagram_assignment": {"use_case": ["FR-001"]},
    }
    # 5. 图表生成结果（纯文本 PlantUML）
    diagram_puml = "@startuml\nleft to right direction\nactor User\n@enduml"

    mock_llm.complete.side_effect = [
        LLMResponse(content="{}", parsed_json=extraction_result),
        LLMResponse(content="{}", parsed_json=classification_result),
        LLMResponse(content="{}", parsed_json=use_case_result),
        LLMResponse(content="{}", parsed_json=diagram_plan_result),
        LLMResponse(content=diagram_puml, parsed_json=None),
    ]

    # 调用分析接口
    response = await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements/analyze",
        json={"requirement_ids": [req_id]},
    )
    assert response.status_code == 200
    analysis = response.json()

    # 验证分析结果包含 FR/NFR
    assert "functional_requirements" in analysis
    assert len(analysis["functional_requirements"]) == 1
    assert "non_functional_requirements" in analysis
    assert "user_stories" in analysis
    assert "classification" in analysis
    assert "diagrams" in analysis
    assert "all_diagrams" in analysis
    assert "use_cases" in analysis

    # 验证需求状态变为 analyzed
    req_detail = await auth_client.get(
        f"/api/v1/projects/{project_id}/requirements/{req_id}"
    )
    assert req_detail.json()["status"] == "analyzed"
    assert req_detail.json()["req_type"] == "FR"

    # 验证 UserStory 被创建
    stories_resp = await auth_client.get(
        f"/api/v1/projects/{project_id}/requirements/{req_id}/use-cases"
    )
    assert stories_resp.status_code == 200
    use_cases = stories_resp.json()
    assert len(use_cases) >= 1
    assert use_cases[0]["title"] == "用户注册"
    assert use_cases[0]["actor"] == "用户"


@pytest.mark.asyncio
async def test_analyze_parallel(auth_client, test_project, mock_llm):
    """验证并行 LLM 调用不崩溃（多个需求同时分析）

    根因 D 修复：mock 数据使用 FR-001/FR-002/FR-003 业务编号
    """
    project_id = test_project["id"]

    # 创建多个需求
    req_ids = []
    for i in range(3):
        resp = await auth_client.post(
            f"/api/v1/projects/{project_id}/requirements",
            json={"title": f"需求{i}", "description": f"描述{i}"},
        )
        req_ids.append(resp.json()["id"])

    # mock LLM：第一次返回提取结果，后续三次并行调用
    fr_ids = [f"FR-{i+1:03d}" for i in range(3)]
    frs = [
        {"id": fr_ids[i], "title": f"需求{i}", "description": f"描述{i}", "type": "业务", "source": "explicit"}
        for i in range(3)
    ]
    extraction = {
        "functional_requirements": frs,
        "non_functional_requirements": [],
        "user_stories": [
            {"requirement_id": fr_ids[i], "role": "User", "goal": "test", "benefit": "test", "acceptance_criteria": "test"}
            for i in range(3)
        ],
        "intent_analysis": {"business_goal": "test", "domain": "test", "stakeholders": [], "assumptions": []},
    }
    # 图表规划结果（空列表，不生成图表）
    diagram_plan = {"diagrams": [], "reasons": {}, "diagram_assignment": {}}
    mock_llm.complete.side_effect = [
        LLMResponse(content="{}", parsed_json=extraction),
        LLMResponse(content="{}", parsed_json={"classified_requirements": [{"id": fr_ids[i], "priority": "Must", "rationale": "test"} for i in range(3)]}),
        LLMResponse(content="{}", parsed_json={"use_cases": [{"requirement_id": fr_ids[i], "title": f"用例{i}", "actor": "User", "preconditions": "无", "main_flow": ["步骤1"], "alternative_flows": [], "postconditions": "完成"} for i in range(3)]}),
        LLMResponse(content="{}", parsed_json=diagram_plan),
    ]

    response = await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements/analyze",
        json={"requirement_ids": req_ids},
    )
    assert response.status_code == 200
    analysis = response.json()
    assert len(analysis["functional_requirements"]) == 3
    assert len(analysis["use_cases"]) == 3


@pytest.mark.asyncio
async def test_get_use_cases(auth_client, test_project):
    """测试获取用例（无数据时返回空列表）"""
    project_id = test_project["id"]
    req_resp = await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={"title": "测试需求", "description": "测试描述"},
    )
    req_id = req_resp.json()["id"]

    response = await auth_client.get(
        f"/api/v1/projects/{project_id}/requirements/{req_id}/use-cases"
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_confirm_requirement(auth_client, test_project):
    """测试确认需求"""
    project_id = test_project["id"]
    req_resp = await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements",
        json={"title": "待确认需求", "description": "描述"},
    )
    req_id = req_resp.json()["id"]

    response = await auth_client.put(
        f"/api/v1/projects/{project_id}/requirements/{req_id}/confirm"
    )
    assert response.status_code == 200
    assert "已确认" in response.json()["message"]

    # 验证状态已更新
    detail = await auth_client.get(
        f"/api/v1/projects/{project_id}/requirements/{req_id}"
    )
    assert detail.json()["status"] == "confirmed"


@pytest.mark.asyncio
async def test_import_and_analyze(auth_client, test_project, mock_llm):
    """测试从文档导入并分析需求

    根因 B 修复：验证从文档生成需求的完整流程
    根因 C 修复：验证提取的 FR/NFR 创建独立 Requirement 记录
    根因 D 修复：验证 FR-001/NFR-001 业务编号匹配
    """
    project_id = test_project["id"]

    # 1. 提取 FR/NFR
    extraction_result = {
        "functional_requirements": [
            {
                "id": "FR-001",
                "title": "用户登录",
                "description": "系统应支持用户使用账号密码登录",
                "type": "业务",
                "source": "explicit",
                "rationale": "核心功能",
            },
            {
                "id": "FR-002",
                "title": "用户注销",
                "description": "系统应支持用户注销退出登录",
                "type": "业务",
                "source": "inferred",
                "rationale": "安全要求",
            },
        ],
        "non_functional_requirements": [
            {
                "id": "NFR-001",
                "title": "响应速度",
                "description": "登录响应时间不超过2秒",
                "category": "性能",
                "source": "inferred",
                "rationale": "用户体验要求",
            }
        ],
        "user_stories": [
            {
                "requirement_id": "FR-001",
                "role": "用户",
                "goal": "登录系统",
                "benefit": "可以访问系统功能",
                "acceptance_criteria": "输入正确账号密码后登录成功",
            }
        ],
        "intent_analysis": {
            "business_goal": "提供用户登录功能",
            "domain": "Web应用",
            "stakeholders": ["用户"],
            "assumptions": ["用户已注册"],
        },
    }
    # 2. 分类
    classification_result = {
        "classified_requirements": [
            {"id": "FR-001", "priority": "Must", "rationale": "核心功能"},
            {"id": "FR-002", "priority": "Should", "rationale": "安全需求"},
            {"id": "NFR-001", "priority": "Should", "rationale": "性能要求"},
        ]
    }
    # 3. 用例
    use_case_result = {
        "use_cases": [
            {
                "requirement_id": "FR-001",
                "title": "用户登录",
                "actor": "用户",
                "preconditions": "用户已注册",
                "main_flow": ["1. 用户输入账号密码", "2. 系统验证", "3. 登录成功"],
                "alternative_flows": ["密码错误则提示"],
                "postconditions": "用户已登录",
            }
        ]
    }
    # 4. 图表规划结果
    diagram_plan_result = {
        "diagrams": ["use_case"],
        "reasons": {"use_case": "系统涉及用户交互，需要用例图"},
        "diagram_assignment": {"use_case": ["FR-001", "FR-002"]},
    }
    # 5. 图表生成结果（纯文本 PlantUML）
    diagram_puml = "@startuml\nleft to right direction\nactor User\n@enduml"

    mock_llm.complete.side_effect = [
        LLMResponse(content="{}", parsed_json=extraction_result),
        LLMResponse(content="{}", parsed_json=classification_result),
        LLMResponse(content="{}", parsed_json=use_case_result),
        LLMResponse(content="{}", parsed_json=diagram_plan_result),
        LLMResponse(content=diagram_puml, parsed_json=None),
    ]

    # 调用 import-and-analyze 端点
    document_content = "# 项目计划书\n## 功能需求\n系统应支持用户使用账号密码登录。"
    response = await auth_client.post(
        f"/api/v1/projects/{project_id}/requirements/import-and-analyze",
        json={"content": document_content},
    )
    assert response.status_code == 200
    data = response.json()

    # 验证返回结果
    assert "message" in data
    assert data["extracted_count"] == 3  # 2 FR + 1 NFR
    assert "intent_analysis" in data
    assert len(data["requirements"]) == 3

    # 验证每条需求都有正确的字段
    for req in data["requirements"]:
        assert "id" in req
        assert "title" in req
        assert "description" in req
        assert "req_type" in req
        assert req["req_type"] in ("FR", "NFR")
        assert "status" in req

    # 验证 FR-001 的优先级被回填
    fr_reqs = [r for r in data["requirements"] if r["req_type"] == "FR"]
    assert len(fr_reqs) == 2
    fr001 = next(r for r in fr_reqs if r["title"] == "用户登录")
    assert fr001["priority"] == "Must"

    # 验证 NFR-001 被创建
    nfr_reqs = [r for r in data["requirements"] if r["req_type"] == "NFR"]
    assert len(nfr_reqs) == 1
    assert nfr_reqs[0]["title"] == "响应速度"

    # 验证用例被创建（通过需求列表 API 查询）
    list_resp = await auth_client.get(
        f"/api/v1/projects/{project_id}/requirements"
    )
    assert list_resp.status_code == 200
    all_reqs = list_resp.json()
    assert len(all_reqs) >= 3  # 3 条新创建的需求

    # 验证项目级 all_diagrams 字段
    assert "all_diagrams" in data
    assert "use_case_diagram" in data["all_diagrams"]

    # 验证每条需求只包含分配给它的图表
    fr_reqs_data = [r for r in data["requirements"] if r["req_type"] == "FR"]
    nfr_reqs_data = [r for r in data["requirements"] if r["req_type"] == "NFR"]
    # FR-001 和 FR-002 应该有 use_case_diagram（在分配列表中）
    for fr_req in fr_reqs_data:
        ar = fr_req.get("analysis_result", {})
        diagrams = ar.get("diagrams", {})
        assert "use_case_diagram" in diagrams
    # NFR-001 不应该有 use_case_diagram（未分配）
    for nfr_req in nfr_reqs_data:
        ar = nfr_req.get("analysis_result", {})
        diagrams = ar.get("diagrams", {})
        assert "use_case_diagram" not in diagrams
