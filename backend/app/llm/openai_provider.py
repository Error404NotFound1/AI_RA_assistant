"""OpenAI Provider 实现"""

import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.core.config import settings
from app.llm.provider import LLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """OpenAI API Provider"""

    def __init__(self):
        super().__init__()
        self.model = settings.OPENAI_MODEL
        client_kwargs = {"api_key": settings.OPENAI_API_KEY, "timeout": 60, "max_retries": 2}
        if settings.OPENAI_BASE_URL:
            client_kwargs["base_url"] = settings.OPENAI_BASE_URL
        self.client = AsyncOpenAI(**client_kwargs)

    async def complete(self, system_prompt: str, user_prompt: str, temperature: float = 0.3, json_mode: bool = True) -> LLMResponse:
        """调用 OpenAI API 获取完整响应。json_mode=True 时强制 JSON 输出，False 时允许文本输出"""
        kwargs = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await self.client.chat.completions.create(**kwargs)
        except Exception as e:
            logger.error("OpenAI API 调用失败: %s", e)
            raise

        content = response.choices[0].message.content or ""

        # 仅在 json_mode=True 时尝试解析 JSON
        parsed_json = None
        if json_mode:
            try:
                parsed_json = json.loads(content)
            except json.JSONDecodeError:
                pass

        usage = {}
        if response.usage:
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        return LLMResponse(content=content, parsed_json=parsed_json, usage=usage)

    async def stream(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> AsyncGenerator[str, None]:
        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content