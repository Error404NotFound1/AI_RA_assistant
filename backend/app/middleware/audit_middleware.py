"""审计中间件 - 记录统计类读操作日志"""

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# 需要记录日志的读操作路径模式（统计类读操作）
STATISTICAL_READ_PATTERNS = [
    "/requirements/",  # 查看需求分析结果
    "/architectures/",  # 查看架构推荐结果
    "/traceability/",  # 查看 traceability 矩阵
    "/documents/",  # 查看文档
]


class AuditMiddleware(BaseHTTPMiddleware):
    """审计日志中间件 - 记录统计类读操作"""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # 仅记录 GET 请求
        if request.method != "GET":
            return response

        # 仅记录成功的请求
        if response.status_code != 200:
            return response

        # 检查是否是统计类读操作
        path = request.url.path
        should_log = any(pattern in path for pattern in STATISTICAL_READ_PATTERNS)

        if not should_log:
            return response

        # 获取用户信息（从 JWT token 解析）
        user_id = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from app.core import security

                token = auth_header.split(" ")[1]
                payload = security.verify_token(token)
                if payload is not None:
                    user_id = payload.get("sub")
            except Exception:
                pass

        # 记录到日志（异步写入数据库会复杂，这里先记录到应用日志）
        # 数据库写入可通过后台任务实现
        logger.info(
            f"AUDIT: user={user_id}, method=GET, path={path}, status={response.status_code}"
        )

        return response
