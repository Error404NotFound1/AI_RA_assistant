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
    async def complete(self, system_prompt: str, user_prompt: str, temperature: float = 0.3, json_mode: bool = True) -> LLMResponse:
        """同步调用 LLM。json_mode=True 时强制 JSON 输出，False 时允许文本输出"""
        ...

    @abstractmethod
    async def stream(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> AsyncGenerator[str, None]:
        """流式调用 LLM"""
        ...


_provider_instance: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    """根据配置获取 LLM Provider 实例（单例）"""
    global _provider_instance
    if _provider_instance is None:
        if settings.LLM_PROVIDER == "openai":
            from app.llm.openai_provider import OpenAIProvider
            _provider_instance = OpenAIProvider()
        else:
            from app.llm.deepseek_provider import DeepSeekProvider
            _provider_instance = DeepSeekProvider()
    return _provider_instance