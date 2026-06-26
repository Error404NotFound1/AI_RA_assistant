"""LLM Provider 抽象层（参考 agent-architecture-review-sample 和 RequirementLinter）"""

from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator
from pydantic import BaseModel

from app.core.config import settings


class LLMResponse(BaseModel):
    """LLM 响应结构"""
    content: str
    parsed_json: dict | None = None
    usage: dict | None = None


class LLMProvider(ABC):
    """LLM Provider 抽象基类"""

    def __init__(self):
        self.model: str = ""

    @abstractmethod
    async def complete(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> LLMResponse:
        """同步调用 LLM"""
        ...

    @abstractmethod
    async def stream(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> AsyncGenerator[str, None]:
        """流式调用 LLM"""
        ...


def get_llm_provider() -> LLMProvider:
    """根据配置获取 LLM Provider 实例"""
    if settings.LLM_PROVIDER == "openai":
        from app.llm.openai_provider import OpenAIProvider
        return OpenAIProvider()
    else:
        from app.llm.deepseek_provider import DeepSeekProvider
        return DeepSeekProvider()