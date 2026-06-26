# AI-SE-Assistant Frontend Dockerfile
FROM node:22-alpine

WORKDIR /app

# 安装依赖
COPY package.json package-lock.json ./
RUN npm ci

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 3000

# 开发模式启动
CMD ["npm", "run", "dev"]
