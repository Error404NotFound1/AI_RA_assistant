# AI-SE-Assistant Frontend Dockerfile
# IMAGE_REGISTRY 由 docker-compose.yml 传入，默认 docker.io
ARG IMAGE_REGISTRY=docker.io
FROM ${IMAGE_REGISTRY}/node:22-alpine

WORKDIR /app

# 安装依赖（NPM_REGISTRY 由 docker-compose.yml 传入，使用淘宝源）
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm config set registry ${NPM_REGISTRY}
COPY package.json package-lock.json ./
RUN npm ci

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 3000

# 开发模式启动
CMD ["npm", "run", "dev"]
