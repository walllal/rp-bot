# RP Bot - 一款专注角色扮演的聊天机器人

以角色扮演为核心，旨在为用户带来充满乐趣和高度自定义的互动体验。通过其强大的预设系统和灵活的变量机制，您可以轻松打造出各种独具个性的虚拟角色，并与它们展开引人入胜的对话。

## ✨ 特性

*   **高度自定义的预设系统**：允许用户创建和管理不同的角色扮演场景和机器人行为。您可以定义角色的性格、背景故事、说话方式等，让每个角色都栩栩如生。
*   **灵活的变量系统**：支持在预设和对话中动态使用和修改变量。这使得角色能够记住对话内容、根据不同情境做出反应，极大地增强了角色扮演的互动性和个性化。
*   **基于 OneBot 标准**：通过 WebSocket 与兼容 OneBot v11 标准的 QQ 机器人客户端（如 NapCatQQ）连接，确保了良好的兼容性和扩展性。
*   **Web 用户界面**：提供一个直观易用的 Web 管理界面。用户可以在此界面方便地配置角色预设、管理对话变量、设置 OpenAI API 参数、连接到 OneBot 客户端以及监控机器人的运行状态。
*   **OpenAI API 集成**：利用先进的 OpenAI 大型语言模型驱动角色扮演对话，提供流畅、自然且富有创造力的交互体验 (API Key 等相关配置在 Web UI 中设置)。

## 🚀 快速开始

### 环境要求

*   Node.js (建议版本 >= 18.x)
*   npm 或 yarn
*   一个兼容 OneBot v11 标准的 QQ 机器人客户端 (例如 [NapCatQQ](https://github.com/NapNeko/NapCatQQ))
*   OpenAI API Key (用于驱动 AI 对话，在 Web UI 中配置)

### 安装与配置

1.  **克隆项目**
    ```bash
    git clone https://github.com/foamcold/rp-bot.git
    cd rp-bot
    ```
2.  **安装依赖**
    ```bash
    npm install
    ```
3.  **应用数据库迁移 (生产环境)**
    在首次部署或数据库结构有变更后，需要运行此命令来应用数据库迁移。
    ```bash
    npx prisma migrate deploy
    ```

4.  **配置环境变量**
    复制项目根目录下的 `.env.example` 文件为 `.env`：
    ```bash
    cp .env.example .env
    ```
    然后，编辑 `.env` 文件，根据您的实际情况修改以下配置项：
    *   `DATABASE_URL`: 数据库连接字符串。默认为 SQLite (`file:./dev.db`)，这种方式下，数据库文件将创建在项目根目录的 `prisma` 文件夹下，通常无需额外配置即可开始使用。如果您希望使用 PostgreSQL 或 MySQL，请参照 `.env.example` 中的注释格式进行修改。
    *   `JWT_SECRET`: 用于 Web UI 登录认证的 JSON Web Token 密钥。**请务必修改为一个强大且随机的字符串**，以确保安全性。
    *   `ADMIN_USERNAME`: Web UI 的管理员登录用户名 (默认为 `admin`)。
    *   `ADMIN_PASSWORD`: Web UI 的管理员登录密码 (默认为 `your_plain_text_password`)。**请务必修改为一个强密码**。
    *   `PORT`: Web UI 和 API 服务器的监听端口 (默认为 `3000`)。
    *   `HOST`: Web UI 和 API 服务器的监听地址 (默认为 `0.0.0.0`，允许来自任何网络的访问；如果只想本机访问，可以改为 `127.0.0.1`)。
    *   其他配置项可以根据 `.env.example` 中的说明按需进行调整。

5.  **构建项目**
    ```bash
    npm run build
    ```
    此命令会将 TypeScript 代码编译为 JavaScript。

6.  **启动应用**
    ```bash
    npm start
    ```
    应用在首次启动时会自动进行数据库的初始化和迁移。成功启动后，Web UI 应该可以通过浏览器访问 `http://<YOUR_SERVER_HOST>:<PORT>` (例如，如果使用默认配置且在本机运行，则为 `http://localhost:3000`)。

### 连接与配置 (通过 Web UI)

1.  打开浏览器，访问您的 RP Bot Web UI 地址。
2.  使用您在 `.env` 文件中设置的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。
3.  在 Web UI 的相关设置页面中，完成以下关键配置：
    *   **OpenAI 配置**: 输入您的 OpenAI API Key。如果需要通过代理访问 OpenAI 服务，也可以配置相应的 Base URL。
    *   **OneBot 配置**: 输入您的 OneBot 客户端 (如 NapCatQQ) 提供的 WebSocket 连接地址 (例如 `ws://127.0.0.1:6700`)。
4.  确保您的 OneBot 客户端已经正确安装、配置并成功登录 QQ 账号且正在运行。

完成以上步骤后，您的 RP Bot 就准备好开始角色扮演之旅了！

## 🔧 使用说明

*   RP Bot 的所有核心功能，包括角色预设创建与管理、变量设置、AI 模型参数调整等，均通过其便捷的 Web 用户界面进行操作。
*   更详细和图文并茂的使用教程正在制作中，将会尽快发布，敬请期待！

## 🛠️ 开发

### 主要技术栈

*   **后端**: TypeScript, Node.js, Fastify (Web 框架), Prisma (ORM)
*   **AI**: OpenAI API
*   **通信**: WebSocket (用于 OneBot 连接)
*   **前端**: HTML, CSS, JavaScript (用于 Web UI)

### 常用开发脚本

以下是一些在开发过程中常用的 npm 脚本:

*   `npm run dev`: 使用 `tsc` 编译 TypeScript 代码后，启动应用。适合快速查看编译后效果。
*   `npm run dev:watch`: 实时监听 `src` 目录下 TypeScript 文件的改动，自动重新编译并重启服务。这是开发过程中最常用的命令，可以显著提高开发效率。
*   `npm run dev:fresh`: 执行 TypeScript 完整构建，然后运行 Prisma 数据库迁移 (适用于开发环境的 `prisma migrate dev`)，最后启动应用。适用于需要清理构建缓存或确保数据库结构最新的场景。
*   `npm run build`: 构建生产版本的应用，将编译后的 JavaScript 文件输出到 `dist` 目录。
*   `npm start`: 启动生产版本的应用 (执行 `dist/index.js`)。
*   `npm run clean:build`: 清理 `dist` 目录并重新执行构建。
