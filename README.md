# AI-SE Assistant

基于 Web 的 AI 大模型驱动的软件工程需求分析与体系结构设计辅助系统

> 本系统利用大语言模型（LLM）辅助软件工程师完成需求分析、架构设计、质量评估等工作，提升软件工程效率与质量。参考了 [full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template)、[RequirementLinter](https://github.com/jonverrier/RequirementLinter)、[agent-architecture-review-sample](https://github.com/Azure-Samples/agent-architecture-review-sample) 等开源项目。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [API 文档](#api-文档)
- [核心模块详解](#核心模块详解)
- [参考项目](#参考项目)

---

## 功能特性

### 1. 用户与权限管理（RBAC）

| 角色 | 代号 | 权限 |
|------|------|------|
| 需求工程师 | RE | 创建项目、录入需求、发起 AI 需求分析、确认需求 |
| 系统架构师 | SA | 需求分析 + AI 架构推荐、架构评审、创建 ADR、追溯映射 |
| 管理员 | admin | 全部权限 + 用户管理、角色分配、系统仪表盘 |

- JWT 双令牌认证（Access Token + Refresh Token）
- bcrypt 密码加密
- 基于角色的 API 访问控制

### 2. AI 需求分析（核心）

采用 **三步链式 AI 分析流程**：

```
需求文本 → [Step 1: 提取] → [Step 2: 分类] → [Step 3: 质量评估] → 分析结果
```

| 步骤 | 说明 | 参考标准 |
|------|------|----------|
| 需求提取 | 从自然语言中提取功能需求 (FR) 和非功能需求 (NFR) | IEEE 830 |
| MoSCoW 分类 | 按 Must / Should / Could / Wont 四级优先级排序 | MoSCoW 方法 |
| 质量评估 | 基于 INCOSE 7 项质量属性逐条评分 | INCOSE 标准 |

INCOSE 7 项质量属性：

1. **完整性** (Completeness) — 0-10 分
2. **一致性** (Consistency) — 通过/不通过
3. **可验证性** (Verifiability) — 0-10 分
4. **无歧义性** (Unambiguity) — 0-10 分
5. **可追溯性** (Traceability) — 通过/不通过
6. **可行性** (Feasibility) — 0-10 分
7. **单一性** (Singularity) — 通过/不通过

支持 **SSE 流式分析**，实时返回分析进度和内容。

### 3. AI 架构设计（核心）

基于 **ADD (Attribute-Driven Design) 方法** 推荐架构方案：

1. 识别优先级质量属性场景
2. 生成候选架构模式（分层、微服务、事件驱动、MVC、六边形等）
3. 组件划分与职责分配
4. 技术栈推荐
5. 质量属性验证

附加功能：
- **架构评审** — 提交评分和意见
- **ADR (Architecture Decision Record)** — 记录架构决策及背景
- **AI 追溯映射** — 自动建立需求→组件的追溯关系，计算覆盖率

### 4. 项目管理

- 项目 CRUD + 成员管理
- 项目内需求/架构方案的多 Tab 管理
- 统计概览（需求数量、分析状态、架构方案数）

### 5. 管理员仪表盘

- 用户列表、角色切换、启用/禁用
- 系统统计（用户数、项目数、需求数、AI 分析次数）
- 操作日志查询

### 6. AI 助手对话

- 聊天式交互界面
- 快捷提问模板
- 上下文感知的软件工程问答

---

## 技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.12+ | 运行时 |
| FastAPI | 0.115 | Web 框架 |
| SQLAlchemy | 2.0 (asyncio) | ORM |
| asyncpg | 0.30 | PostgreSQL 异步驱动 |
| Pydantic | 2.10 | 数据验证 |
| python-jose | 3.3 | JWT 令牌 |
| passlib + bcrypt | 1.7 / 4.2 | 密码加密 |
| openai (SDK) | 1.57 | LLM API 调用（同时支持 DeepSeek 和 OpenAI） |
| Redis | 7 | 缓存 |
| Docker | — | 容器化部署 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16 (App Router) | 全栈框架 |
| React | 19 | UI 库 |
| TypeScript | 5 | 类型安全 |
| Tailwind CSS | 4 | 原子化样式 |
| shadcn/ui (base-ui) | 4.8 | UI 组件库 |
| Zustand | 5 | 状态管理 |
| Axios | 1.16 | HTTP 客户端 |
| Recharts | 3 | 图表可视化 |
| Lucide React | 1.17 | 图标库 |

### 基础设施

| 技术 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 16 | 主数据库 |
| Redis | 7 | 缓存 |
| Docker Compose | 3.9 | 多容器编排 |

---

## 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                    浏览器 (用户端)                         │
│              http://localhost:3000                        │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────▼───────────────────────────────────┐
│                 前端 (Next.js 16)                          │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ 登录注册 │ │ 项目管理  │ │ 需求分析  │ │  架构设计     │  │
│  │         │ │          │ │          │ │  管理员面板    │  │
│  │ Zustand │ │ CRUD     │ │ INCOSE   │ │  ADD 推荐     │  │
│  │ Auth    │ │ Tabs     │ │ 质量评估  │ │  ADR/追溯     │  │
│  └─────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└──────────────────────┬───────────────────────────────────┘
                       │ REST API (Axios)
┌──────────────────────▼───────────────────────────────────┐
│              后端 (FastAPI) :8000                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │
│  │ Auth API │ │Project   │ │Requirement│ │Architecture │  │
│  │ JWT+RBAC │ │  API     │ │   API    │ │    API      │  │
│  └────┬─────┘ └────┬─────┘ └─────┬────┘ └──────┬──────┘  │
│       │            │             │              │         │
│  ┌────▼────────────▼─────────────▼──────────────▼──────┐  │
│  │              LLM Provider 抽象层                     │  │
│  │  ┌──────────────┐    ┌──────────────────┐           │  │
│  │  │ DeepSeek     │    │ OpenAI (GPT-4o)  │           │  │
│  │  │ Provider     │    │ Provider         │           │  │
│  │  └──────────────┘    └──────────────────┘           │  │
│  │  6 套 Prompt 模板（提取/分类/质量/文档/架构/追溯）    │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────┬───────────────────────────────┬────────────────┘
           │                               │
  ┌────────▼────────┐             ┌────────▼────────┐
  │  PostgreSQL 16  │             │   Redis 7       │
  │  (主数据库)      │             │   (缓存)         │
  └─────────────────┘             └─────────────────┘
```

---

## 项目结构

```
ai-se-assistant/
├── backend/                          # 后端 (FastAPI)
│   ├── app/
│   │   ├── api/                      # API 路由
│   │   │   ├── auth.py               # 认证：注册/登录/刷新/获取用户
│   │   │   ├── projects.py           # 项目 CRUD + 成员管理
│   │   │   ├── requirements.py        # 需求 CRUD + AI 分析 + SSE 流式
│   │   │   ├── architectures.py       # 架构推荐 + 评审 + ADR + 追溯
│   │   │   └── admin.py               # 用户管理 + 仪表盘 + 日志
│   │   ├── core/                     # 核心配置
│   │   │   ├── config.py             # 环境变量配置
│   │   │   ├── db.py                  # 异步数据库引擎
│   │   │   ├── deps.py               # 依赖注入 (JWT 验证 + RBAC)
│   │   │   └── security.py           # JWT 令牌 + bcrypt 密码
│   │   ├── models/                   # SQLAlchemy 数据模型
│   │   │   ├── user.py               # 用户模型 + UserRole 枚举
│   │   │   ├── project.py            # 项目 + 成员模型
│   │   │   ├── requirement.py        # 需求 + 用户故事 + 质量评估
│   │   │   ├── architecture.py       # 架构方案 + 组件 + 评审 + ADR + 追溯
│   │   │   └── document.py           # 文档 + 操作日志
│   │   ├── llm/                      # AI 大模型服务层
│   │   │   ├── provider.py           # LLM Provider 抽象基类
│   │   │   ├── deepseek_provider.py  # DeepSeek 实现
│   │   │   ├── openai_provider.py    # OpenAI 实现
│   │   │   └── prompts/
│   │   │       └── requirement_extractor.py  # 6 套 Prompt 模板
│   │   ├── schemas/
│   │   │   └── schemas.py            # Pydantic 请求/响应模型
│   │   ├── init_db.py                # 数据库初始化脚本
│   │   └── main.py                   # FastAPI 入口
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env                          # 环境变量（需配置 API Key）
│
├── frontend/                         # 前端 (Next.js 16)
│   ├── src/
│   │   ├── app/                      # App Router 页面
│   │   │   ├── login/                # 登录页
│   │   │   ├── register/             # 注册页
│   │   │   ├── dashboard/            # 工作台仪表盘
│   │   │   ├── projects/             # 项目列表
│   │   │   ├── projects/[id]/        # 项目详情 (Tabs)
│   │   │   ├── requirements/         # 需求分析 (AI + INCOSE)
│   │   │   ├── architectures/        # 架构设计 (ADD + ADR)
│   │   │   ├── admin/                # 管理员面板
│   │   │   └── ai-assistant/         # AI 对话助手
│   │   ├── components/
│   │   │   ├── layout/               # 布局组件
│   │   │   │   ├── app-sidebar.tsx   # 侧边导航
│   │   │   │   ├── app-header.tsx    # 顶部栏
│   │   │   │   └── app-layout.tsx    # 认证布局守卫
│   │   │   └── ui/                   # shadcn/ui 组件
│   │   ├── lib/
│   │   │   ├── api.ts                # Axios API 封装
│   │   │   ├── auth-store.ts         # Zustand 认证状态
│   │   │   └── project-store.ts      # Zustand 项目/需求/架构状态
│   │   └── hooks/
│   │       └── use-mobile.ts         # 移动端检测
│   ├── package.json
│   ├── Dockerfile
│   ├── .env.local                    # 前端环境变量
│   └── tsconfig.json
│
├── docker-compose.yml                # Docker Compose 编排
├── start.sh                          # 快速启动脚本
└── README.md
```

---

## 快速开始

### 前置要求

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (推荐方式)
- 或本地安装：Python 3.12+、Node.js 22+、PostgreSQL 16+、Redis 7+
- 一个 LLM API Key（[DeepSeek](https://platform.deepseek.com/) 或 [OpenAI](https://platform.openai.com/)）

### 方式一：Docker Compose（推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/Error404NotFound1/AI_RA_assistant.git
cd AI_RA_assistant

# 2. 配置后端环境变量
cp backend/.env backend/.env.local
# 编辑 backend/.env 填入你的 LLM API Key
vi backend/.env

# 3. 一键启动全部服务
docker compose up -d

# 4. 初始化数据库（创建表 + 管理员账号）
docker compose exec backend python -m app.init_db
```

启动完成后：

| 服务 | 地址 |
|------|------|
| 前端界面 | http://localhost:3000 |
| 后端 API | http://localhost:8000 |
| API 文档 (Swagger) | http://localhost:8000/api/v1/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

**初始管理员账号：** `admin` / `admin123456`

### 方式二：本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/Error404NotFound1/AI_RA_assistant.git
cd AI_RA_assistant

# 2. 启动 PostgreSQL 和 Redis（可用 Docker 单独启动）
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=ai_se_assistant postgres:16-alpine

docker run -d --name redis -p 6379:6379 redis:7-alpine

# 3. 配置后端环境变量
cd backend
cp .env .env.local
# 编辑 .env 填入 API Key
vi .env

# 4. 安装后端依赖并初始化数据库
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.init_db

# 5. 启动后端
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 6. 新终端 - 启动前端
cd frontend
npm install
npm run dev
```

### 方式三：快速启动脚本

```bash
chmod +x start.sh
./start.sh
```

按提示选择 Docker Compose 或本地开发模式。

---

## 配置说明

### 后端环境变量 (`backend/.env`)

```bash
# 数据库
POSTGRES_SERVER=localhost        # Docker 模式下改为 postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=ai_se_assistant

# JWT 安全
SECRET_KEY=your-secret-key-here  # 生产环境请使用 python -c "import secrets; print(secrets.token_hex(32))"
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# LLM API 配置
LLM_PROVIDER=deepseek            # deepseek 或 openai
DEEPSEEK_API_KEY=your-key        # DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
OPENAI_API_KEY=your-key          # OpenAI API Key (如果用 openai)
OPENAI_MODEL=gpt-4o

# Redis
REDIS_URL=redis://localhost:6379/0   # Docker 模式下改为 redis://redis:6379/0

# 调试
DEBUG=false
```

### 前端环境变量 (`frontend/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## API 文档

启动后端后访问 Swagger UI：http://localhost:8000/api/v1/docs

### 主要 API 端点

#### 认证 (`/api/v1/auth`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/register` | 用户注册 |
| POST | `/auth/login` | 用户登录，返回 JWT |
| POST | `/auth/refresh` | 刷新令牌 |
| GET | `/auth/me` | 获取当前用户信息 |

#### 项目 (`/api/v1/projects`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/projects` | 获取用户项目列表 |
| POST | `/projects` | 创建项目 |
| GET | `/projects/{id}` | 获取项目详情 |
| PUT | `/projects/{id}` | 更新项目 |
| DELETE | `/projects/{id}` | 删除项目 |
| POST | `/projects/{id}/members` | 添加项目成员 |

#### 需求 (`/api/v1/projects/{project_id}/requirements`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/requirements` | 获取需求列表 |
| POST | `/requirements` | 录入需求 |
| GET | `/requirements/{id}` | 获取需求详情 |
| PUT | `/requirements/{id}` | 更新需求 |
| POST | `/requirements/analyze` | AI 需求分析（三步链式） |
| POST | `/requirements/analyze/stream` | SSE 流式分析 |
| PUT | `/requirements/{id}/confirm` | 确认需求 |
| GET | `/requirements/{id}/quality` | 获取质量评估 |

#### 架构 (`/api/v1/projects/{project_id}/architectures`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/architectures/recommend` | AI 架构推荐 (ADD 方法) |
| GET | `/architectures` | 获取架构方案列表 |
| GET | `/architectures/{id}` | 获取架构详情 |
| POST | `/architectures/{id}/reviews` | 提交架构评审 |
| POST | `/architectures/{id}/adr` | 创建 ADR |
| POST | `/architectures/traceability/auto-map` | AI 追溯映射 |

#### 管理员 (`/api/v1/admin`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin/users` | 用户列表 |
| PUT | `/admin/users/{id}/role` | 修改用户角色 |
| PUT | `/admin/users/{id}/status` | 启用/禁用用户 |
| GET | `/admin/dashboard` | 仪表盘统计 |
| GET | `/admin/logs` | 操作日志 |

---

## 核心模块详解

### LLM Provider 抽象层

系统通过抽象工厂模式支持多种 LLM 后端，切换只需修改环境变量 `LLM_PROVIDER`：

```
LLMProvider (抽象基类)
├── DeepSeekProvider   → 调用 DeepSeek API
└── OpenAIProvider     → 调用 OpenAI API
```

两个 Provider 都支持：
- `complete()` — 同步调用，返回结构化 JSON
- `stream()` — 流式调用，返回异步生成器

### Prompt 工程

系统内置 6 套精心设计的 Prompt 模板，每套包含 System Prompt + User Template：

| Prompt | 用途 | 参考标准 |
|--------|------|----------|
| EXTRACTOR | 从自然语言提取 FR/NFR | IEEE 830 |
| CLASSIFIER | MoSCoW 优先级分类 | MoSCoW 方法 |
| QUALITY_CHECKER | INCOSE 7 维度质量评估 | INCOSE 标准 |
| DOC_GENERATOR | 生成 SRS 文档 | IEEE 830 |
| ARCH_RECOMMENDER | ADD 方法架构推荐 | ADD 方法 |
| TRACEABILITY_MAPPER | 需求-组件追溯映射 | RTM |

### RBAC 权限模型

```python
RequireRE   → 需求工程师 + 架构师 + 管理员  (可发起 AI 分析)
RequireSA   → 架构师 + 管理员              (可推荐架构)
RequireAdmin → 管理员                       (系统管理)
```

---

## 参考项目

本项目在开发过程中参考了以下开源项目：

| 项目 | 参考内容 |
|------|----------|
| [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) | 前后端分离架构、JWT 认证流程、侧边栏布局模式 |
| [jonverrier/RequirementLinter](https://github.com/jonverrier/RequirementLinter) | INCOSE 需求质量评估规则、模糊词检测 |
| [Azure-Samples/agent-architecture-review-sample](https://github.com/Azure-Samples/agent-architecture-review-sample) | AI Agent 架构评审思路 |
| [noumantechie/req-analyzer-ai](https://github.com/noumantechie/req-analyzer-ai) | MARE 多 Agent 需求分析架构 |
| [github/spec-kit](https://github.com/github/spec-kit) | 规格驱动开发方法论 |

---

## 许可证

本项目仅供学习和实训使用。
