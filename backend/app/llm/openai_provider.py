"""OpenAI Provider 实现"""

import json
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.core.config import settings
from app.llm.provider import LLMProvider, LLMResponse


class OpenAIProvider(LLMProvider):
    """OpenAI API Provider"""

    def __init__(self):
        super().__init__()
        self.model = settings.OPENAI_MODEL
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    async def complete(self, system_prompt: str, user_prompt: str, temperature: float = 0.3) -> LLMResponse:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or ""

        parsed_json = None
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