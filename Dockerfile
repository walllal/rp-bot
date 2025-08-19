# ================================
# RP-Bot 简化版 Dockerfile
# ================================

FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 安装系统依赖（一些 npm 包可能需要）
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY . .

# 创建必要目录
RUN mkdir -p /app/prisma/data /app/logs

# 生成 Prisma 客户端
RUN npx prisma generate

# 构建应用
RUN npm run build

# 暴露端口
EXPOSE 8008

# 启动命令
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
