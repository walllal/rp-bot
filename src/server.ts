import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import path from 'path'; // 导入 path 模块
import fastifyStatic from '@fastify/static'; // 导入插件
import { authMiddleware } from './middleware/authMiddleware'; // +++ 导入认证中间件

// 初始化 Prisma Client (更合适的位置)
export const prisma = new PrismaClient();

// 创建 Fastify 实例
const server = Fastify({
  logger: false // 禁用默认日志记录器，稍后在 index.ts 中手动创建和分配
  /*
  logger: { // Previous logger config (now moved to index.ts)
    transport: {
      target: 'pino-pretty', // 使用 pino-pretty
      options: {
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', // 格式化时间
        ignore: 'pid,hostname', // 忽略 pid 和 hostname
        colorize: true, // 启用颜色
      },
    },
  },
  */
});

// +++ 注册全局认证中间件 (onRequest Hook) +++
// 这应该在注册需要保护的路由之前，但在静态文件服务之后（如果静态文件服务不需要认证）
// 或者根据 authMiddleware 内部逻辑调整其位置和排除规则
server.addHook('onRequest', authMiddleware);

// --- 注册静态文件服务 ---
server.register(fastifyStatic, {
  // 使用 process.cwd() (当前工作目录) 来定位 public 文件夹，假设脚本从项目根目录运行
  root: path.join(process.cwd(), 'public'),
  prefix: '/', // 根路径提供服务
});
// --- 结束静态文件服务注册 ---

// --- 特定页面路由 (美化 URL) ---
// 处理 /login 请求，发送 login.html
server.get('/login', (request, reply) => {
  reply.sendFile('login.html'); // fastify-static 会从 root 目录 (public) 查找
});
// fastify-static 默认会将 / 请求映射到 public/index.html (如果存在)

// --- 注册 API 路由 ---
import presetRoutes from './routes/presets';
import historyRoutes from './routes/history';
import assignmentRoutes from './routes/assignments';
import settingsRoutes from './routes/settings';
import accessControlRoutes from './routes/access_control';
import messageHistoryRoutes from './routes/message_history'; // 导入消息历史路由 (Renamed)
// import debugRoutes from './routes/debug'; // Removed debug route import
import pluginRoutes from './routes/plugins';
import contactsRoutes from './routes/contacts';
import disguiseRoutes from './routes/disguise'; // 导入伪装路由
import variableRoutes from './routes/variables'; // +++ 导入变量路由
import authRoutes from './routes/auth'; // +++ 导入认证路由
 
server.register(presetRoutes, { prefix: '/api/presets' });
server.register(historyRoutes, { prefix: '/api/history' }); // This is for AI Chat History
server.register(assignmentRoutes, { prefix: '/api/assignments' });
server.register(settingsRoutes, { prefix: '/api/settings' });
server.register(accessControlRoutes, { prefix: '/api/access-control' });
server.register(messageHistoryRoutes, { prefix: '/api/message-history' }); // 注册消息历史路由 (Renamed prefix)
// server.register(debugRoutes, { prefix: '/api/debug' }); // Removed debug route registration
server.register(pluginRoutes, { prefix: '/api/plugins' });
server.register(contactsRoutes, { prefix: '/api/contacts' });
server.register(disguiseRoutes, { prefix: '/api/disguise' }); // 注册伪装路由
server.register(variableRoutes, { prefix: '/api/variables' }); // +++ 注册变量路由
server.register(authRoutes, { prefix: '/api/auth' }); // +++ 注册认证路由
// --- 结束路由注册 ---
 
// 优雅关闭处理
const gracefulShutdown = async (signal: string) => {
  server.log.info(`收到信号 ${signal}, 正在关闭...`);
  try {
      await server.close();
      await prisma.$disconnect(); // 关闭数据库连接
      server.log.info('服务已成功关闭.');
      process.exit(0);
  } catch (err) {
      server.log.error('关闭服务时出错:', err);
      process.exit(1);
  }
};

// 监听关闭信号
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default server;
