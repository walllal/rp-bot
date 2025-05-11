import dotenv from 'dotenv';
import pino from 'pino'; // Import pino
import server from './server'; // 导入 Fastify 服务器实例
import { initOneBotConnection, closeOneBotConnection } from './onebot/connection';
import { initMessageHandler, stopMessageHandler } from './onebot/message-handler';
// Removed import of initOpenAIClient
import { getAppSettings, seedDefaultSettings } from './db/configStore'; // Import new settings functions (from renamed file)
import { initializePlugins } from './plugins/manager'; // 导入插件管理器初始化函数
import { initAdvancedResponseParser } from './core/advanced-response-parser'; // 导入高级响应解析器初始化函数
import { initializeAllTimedTriggers } from './core/trigger-scheduler'; // +++ 导入定时触发器初始化函数

// 加载 .env 文件中的环境变量
dotenv.config();

// --- 配置读取 ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
// --- 结束配置读取 ---

/**
 * 启动服务器
 */
const start = async () => {
  // Create a temporary basic logger for initial setup steps
  const tempLogger = pino({ level: 'info', transport: { target: 'pino-pretty' } });
  try {
    // 0. Seed default settings first (this now ensures the AppSettings record exists)
    await seedDefaultSettings(tempLogger);

    // 1. Get settings using the new function
    const appSettings = await getAppSettings(tempLogger); // Use tempLogger initially
    if (!appSettings) {
        tempLogger.fatal('无法获取或创建应用设置，应用无法启动。');
        process.exit(1);
    }
    const logLevelSetting = appSettings.logLevel; // Get logLevel from the object

    // 2. Create the final logger with the correct level
    let pinoLevel: string;
    switch (logLevelSetting) {
        case 'DEBUG_AI': pinoLevel = 'debug'; break;
        case 'DEBUG_ALL': pinoLevel = 'trace'; break;
        case 'NORMAL': default: pinoLevel = 'info'; break;
    }

    const logger = pino({
      level: pinoLevel, // 设置初始日志级别
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          colorize: true,
        },
      },
    });
    server.log = logger; // 将创建的 logger 分配给 server 实例

    // Seed settings call is moved above logger creation

    // Removed OpenAI client initialization here

    // 3. 初始化 OneBot 连接 (它会自己从数据库读取配置)
    initOneBotConnection(server); // Pass server instance

    // 4. 初始化消息处理器
    initMessageHandler(server); // Pass server instance
    logger.debug('消息处理器初始化完成.'); // Add log

    // 4.3 初始化高级响应解析器
    initAdvancedResponseParser(server);
    logger.debug('高级模式响应解析器初始化完成.');

    // 4.5 初始化插件管理器
    await initializePlugins(server); // Pass server instance
    logger.debug('插件管理器初始化完成.');

    // 5. 启动 Fastify 服务器
    logger.info(`准备启动服务器，监听 http://${HOST}:${PORT}...`); // Add log before listen
    try {
        await server.listen({ port: PORT, host: HOST });
        // Fastify 会自动打印监听地址，所以这里不需要额外日志
        // logger.info(`服务器成功启动并监听 http://${HOST}:${PORT}`); // Log after successful listen
    } catch (listenError: any) { // Add type annotation
        // Catch errors specifically from server.listen()
        // Log the full error object for more details
        console.error('!!! 调用 server.listen() 时发生严重错误 !!!');
        console.error('错误对象:', listenError); // Log the entire error object
        logger.error('调用 server.listen() 时发生错误:', listenError.message || listenError); // Log message via logger too
        process.exit(1); // Exit if listen fails
    }

    // 6. 初始化所有定时触发器 (在服务器成功监听之后)
    await initializeAllTimedTriggers(server);
    logger.debug('所有定时触发器初始化完成.');

    // 7. 移除自定义启动日志，因为 Fastify 默认会打印监听地址
    // server.log.info(`Web UI 服务已启动，请访问 http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`);

    // 优雅关闭时清理资源
    const shutdown = async (signal: string) => {
        server.log.info(`收到信号 ${signal}, 开始关闭...`);
        stopMessageHandler(); // 停止监听消息
        closeOneBotConnection(); // 关闭 WS 连接
        // Fastify 的关闭已在 server.ts 中处理 (包括 prisma.$disconnect)
        server.log.info('应用关闭完成.');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err: any) { // Add type annotation for err
    // Ensure logger exists even if error happens early
    const log = server.log || pino(); // Use server logger or a default pino instance
    log.error('启动过程中发生错误:', err);
    process.exit(1); // 启动失败，退出进程
  }
};

// 启动应用
start();
