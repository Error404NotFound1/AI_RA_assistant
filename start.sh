#!/bin/bash
# AI-SE-Assistant 快速启动脚本

set -e

echo "🚀 AI-SE-Assistant 快速启动"
echo "============================"

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ 未安装 Docker，请先安装 Docker Desktop"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ 未安装 Docker Compose"
    exit 1
fi

# 使用 docker compose 或 docker-compose
COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
fi

echo ""
echo "📌 选择启动模式："
echo "  1) Docker Compose (推荐，包含数据库)"
echo "  2) 本地开发 (需要本地 PostgreSQL)"
read -p "请选择 [1/2]: " mode

if [ "$mode" = "1" ]; then
    echo ""
    echo "🐳 使用 Docker Compose 启动..."
    $COMPOSE_CMD up -d postgres redis
    echo "⏳ 等待数据库就绪..."
    sleep 5
    $COMPOSE_CMD up -d backend
    echo "⏳ 等待后端就绪..."
    sleep 3
    $COMPOSE_CMD up -d frontend
    echo ""
    echo "✅ 服务已启动："
    echo "  - 前端: http://localhost:3000"
    echo "  - 后端 API: http://localhost:8000"
    echo "  - API 文档: http://localhost:8000/api/v1/docs"
    echo "  - PostgreSQL: localhost:5432"
    echo ""
    echo "📋 初始管理员账号: admin / admin123456"
elif [ "$mode" = "2" ]; then
    echo ""
    echo "💻 本地开发模式..."
    
    # 启动后端
    echo "🔧 启动后端..."
    cd backend
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
        source .venv/bin/activate
        pip install -r requirements.txt
    else
        source .venv/bin/activate
    fi
    
    # 初始化数据库
    echo "📊 初始化数据库..."
    python -m app.init_db
    
    # 启动后端服务
    echo "🏃 启动后端服务..."
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
    BACKEND_PID=$!
    
    cd ../frontend
    
    # 启动前端
    echo "🎨 启动前端..."
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    npm run dev &
    FRONTEND_PID=$!
    
    echo ""
    echo "✅ 服务已启动："
    echo "  - 前端: http://localhost:3000"
    echo "  - 后端 API: http://localhost:8000"
    echo "  - API 文档: http://localhost:8000/api/v1/docs"
    echo ""
    echo "📋 初始管理员账号: admin / admin123456"
    echo ""
    echo "按 Ctrl+C 停止服务"
    
    # 等待中断信号
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
    wait
else
    echo "无效选择"
    exit 1
fi
