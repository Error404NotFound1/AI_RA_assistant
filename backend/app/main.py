"""FastAPI 应用入口"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import auth, projects, requirements, architectures, documents, admin, uploads
from app.middleware.audit_middleware import AuditMiddleware

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="基于 Web 的 AI 大模型驱动的软件工程需求分析与体系结构设计辅助系统",
    docs_url=f"{settings.API_V1_STR}/docs",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册审计中间件（记录统计类读操作日志）
app.add_middleware(AuditMiddleware)

# 注册路由
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(projects.router, prefix=settings.API_V1_STR)
app.include_router(requirements.router, prefix=settings.API_V1_STR)
app.include_router(architectures.router, prefix=settings.API_V1_STR)
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(uploads.router, prefix=settings.API_V1_STR)


@app.get("/", tags=["健康检查"])
async def root():
    return {"message": "AI-SE-Assistant API is running", "version": settings.VERSION}


@app.get("/health", tags=["健康检查"])
async def health():
    return {"status": "ok"}