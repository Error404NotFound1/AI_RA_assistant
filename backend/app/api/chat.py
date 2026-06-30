"""AI 助手对话 API"""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import json

from app.core.deps import CurrentUser
from app.models.user import User
from app.llm.provider import get_llm_provider
from app.llm.prompts.requirement_extractor import AI_ASSISTANT_SYSTEM_PROMPT

router = APIRouter(tags=["chat"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    project_context: Optional[str] = None


@router.post("/chat")
async def chat(
    request: ChatRequest,
    current_user: User = Depends(CurrentUser)
):
    """AI助手对话 - 流式SSE响应"""
    provider = get_llm_provider()

    # 构建系统提示（可选加入项目上下文）
    system_prompt = AI_ASSISTANT_SYSTEM_PROMPT
    if request.project_context:
        system_prompt += f"\n\n当前项目上下文：{request.project_context}"

    # 构建消息历史
    messages = []
    for msg in request.history[-10:]:  # 最多保留最近10轮
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    # 将历史拼接为用户prompt
    user_prompt = "\n".join(
        [f"{'用户' if m['role']=='user' else 'AI'}: {m['content']}" for m in messages]
    )

    async def event_generator():
        try:
            full_response = ""
            async for chunk in provider.stream(system_prompt, user_prompt):
                full_response += chunk
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'done': True, 'full_content': full_response}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/chat/simple")
async def chat_simple(
    request: ChatRequest,
    current_user: User = Depends(CurrentUser)
):
    """AI助手对话 - 非流式响应（备用）"""
    provider = get_llm_provider()

    system_prompt = AI_ASSISTANT_SYSTEM_PROMPT
    if request.project_context:
        system_prompt += f"\n\n当前项目上下文：{request.project_context}"

    messages = []
    for msg in request.history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    user_prompt = "\n".join(
        [f"{'用户' if m['role']=='user' else 'AI'}: {m['content']}" for m in messages]
    )

    try:
        response = await provider.complete(system_prompt, user_prompt, json_mode=False)
        return {"content": response.content}
    except Exception as e:
        return {"error": str(e), "content": "抱歉，AI服务暂时不可用，请稍后再试。"}
