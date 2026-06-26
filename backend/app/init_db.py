"""数据库初始化脚本 - 创建表和初始管理员用户"""

import asyncio
import uuid

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.project import Project
from app.models.requirement import Requirement, UserStory, QualityEvaluation
from app.models.architecture import ArchitectureSolution, ArchComponent, ArchReview, ADR, TraceabilityLink
from app.models.document import Document, OperationLog

# 导入所有模型以确保 Base.metadata 包含所有表
from app.core.db import Base


async def init_db():
    """初始化数据库"""
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        # 创建所有表
        await conn.run_sync(Base.metadata.create_all)
    print("✅ 数据库表创建完成")

    # 创建初始管理员
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.role == UserRole.ADMIN)
        )
        admin = result.scalar_one_or_none()
        if not admin:
            admin = User(
                username="admin",
                email="admin@example.com",
                hashed_password=get_password_hash("admin123456"),
                full_name="系统管理员",
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(admin)
            await session.flush()
            print("✅ 初始管理员创建完成 (admin / admin123456)")
        else:
            print("ℹ️  管理员用户已存在，跳过创建")

        await session.commit()

    await engine.dispose()
    print("✅ 数据库初始化完成！")


if __name__ == "__main__":
    asyncio.run(init_db())
