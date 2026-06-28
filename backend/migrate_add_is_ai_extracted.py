"""数据库迁移脚本 - 为 requirements 表添加 is_ai_extracted 列

使用方法：
    cd backend
    python -m app.migrate_add_is_ai_extracted
    或
    python migrate_add_is_ai_extracted.py
"""

import asyncio

from sqlalchemy import text

from app.core.db import engine


async def migrate():
    """添加 is_ai_extracted 列到 requirements 表，并标记已有的 AI 提取需求"""
    async with engine.begin() as conn:
        # 1. 添加列（如果不存在）
        await conn.execute(
            text(
                "ALTER TABLE requirements "
                "ADD COLUMN IF NOT EXISTS is_ai_extracted BOOLEAN DEFAULT FALSE"
            )
        )
        print("✅ 已添加 is_ai_extracted 列")

        # 2. 标记已有的 AI 提取需求（基于 source 字段启发式判断）
        result = await conn.execute(
            text(
                "UPDATE requirements SET is_ai_extracted = TRUE "
                "WHERE source IN ('explicit', 'inferred', 'AI提取', '文档提取')"
            )
        )
        print(f"✅ 已标记 {result.rowcount} 条 AI 提取的需求")

    await engine.dispose()
    print("✅ 迁移完成！")


if __name__ == "__main__":
    asyncio.run(migrate())
