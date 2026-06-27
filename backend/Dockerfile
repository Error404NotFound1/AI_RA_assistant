# AI-SE-Assistant Backend Dockerfile
# IMAGE_REGISTRY 由 docker-compose.yml 传入，默认 docker.io
ARG IMAGE_REGISTRY=docker.io
FROM ${IMAGE_REGISTRY}/python:3.12-slim

WORKDIR /app

# 安装系统依赖（使用国内 Debian 镜像加速）
RUN sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true && \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（PIP_INDEX_URL 由 docker-compose.yml 传入，使用清华源）
ARG PIP_INDEX_URL=https://pypi.org/simple
COPY requirements.txt .
RUN pip install --no-cache-dir -i ${PIP_INDEX_URL} -r requirements.txt

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
