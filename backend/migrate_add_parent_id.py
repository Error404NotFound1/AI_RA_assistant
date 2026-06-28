"""数据库迁移脚本 - 为 requirements 表添加 parent_id 列

使用方法：
    cd backend
    python -m migrate_add_parent_id
    或
    python migrate_add_parent_id.py
"""

import asyncio

from sqlalchemy import text

from app.core.db import engine


async def migrate():
    """添加 parent_id 列到 requirements 表（自引用外键，UUID 类型）"""
    async with engine.begin() as conn:
        dialect = conn.dialect.name

        # 检查列是否已存在
        result = await conn.execute(
            text(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_name = 'requirements' AND column_name = 'parent_id'"
            )
        )
        existing = result.fetchone()

        if existing:
            # 检查类型是否正确（应为 uuid）
            data_type = existing[1] if existing else None
            if data_type and data_type != "uuid":
                print(f"⚠️  parent_id 列存在但类型为 {data_type}，需要修复为 UUID")
                # 删除旧的约束和索引
                try:
                    await conn.execute(text(
                        "ALTER TABLE requirements DROP CONSTRAINT IF EXISTS fk_requirements_parent_id"
                    ))
                except Exception:
                    pass
                try:
                    await conn.execute(text(
                        "DROP INDEX IF EXISTS ix_requirements_parent_id"
                    ))
                except Exception:
                    pass
                # 修改列类型为 UUID
                await conn.execute(text(
                    "ALTER TABLE requirements ALTER COLUMN parent_id TYPE UUID USING parent_id::uuid"
                ))
                print("✅ 已将 parent_id 列类型修改为 UUID")
            else:
                print("ℹ️  parent_id 列已存在且类型正确，跳过添加")
        else:
            # 添加列 — PostgreSQL 用 UUID 类型，SQLite 用 VARCHAR
            if dialect == "postgresql":
                await conn.execute(
                    text("ALTER TABLE requirements ADD COLUMN parent_id UUID")
                )
            else:
                await conn.execute(
                    text("ALTER TABLE requirements ADD COLUMN parent_id VARCHAR(36)")
                )
            print("✅ 已添加 parent_id 列")

        # 尝试添加外键约束（PostgreSQL）
        try:
            if dialect == "postgresql":
                await conn.execute(
                    text(
                        "ALTER TABLE requirements "
                        "ADD CONSTRAINT fk_requirements_parent_id "
                        "FOREIGN KEY (parent_id) REFERENCES requirements(id) "
                        "ON DELETE CASCADE"
                    )
                )
                print("✅ 已添加外键约束 (PostgreSQL)")
            else:
                print(f"ℹ️  跳过外键约束 (dialect: {dialect})")
        except Exception as e:
            print(f"⚠️  添加外键约束失败（可能已存在）: {e}")

        # 添加索引（如果不存在）
        try:
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_requirements_parent_id "
                    "ON requirements (parent_id)"
                )
            )
            print("✅ 已添加 parent_id 索引")
        except Exception:
            print("ℹ️  索引已存在或创建失败，跳过")

    await engine.dispose()
    print("✅ 迁移完成！")


if __name__ == "__main__":
    asyncio.run(migrate())
