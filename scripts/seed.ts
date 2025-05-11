import { PrismaClient } from '@prisma/client';
import { seedDefaultPresets } from '../src/db/presets'; // Assuming this exists or adjust path
import { seedDefaultSettings } from '../src/db/settings'; // Correct import
import { FastifyBaseLogger } from 'fastify'; // Import logger type for compatibility

const prisma = new PrismaClient();

// Create a simple console-based logger compatible with FastifyBaseLogger interface
const consoleLogger: FastifyBaseLogger = {
    level: 'info', // Default level
    silent: () => {},
    info: (obj: any, msg?: string, ...args: any[]) => console.info(msg ?? obj, ...args),
    warn: (obj: any, msg?: string, ...args: any[]) => console.warn(msg ?? obj, ...args),
    error: (obj: any, msg?: string, ...args: any[]) => console.error(msg ?? obj, ...args),
    fatal: (obj: any, msg?: string, ...args: any[]) => console.error(`FATAL: ${msg ?? obj}`, ...args),
    trace: (obj: any, msg?: string, ...args: any[]) => console.debug(`TRACE: ${msg ?? obj}`, ...args), // Use debug for trace
    debug: (obj: any, msg?: string, ...args: any[]) => console.debug(msg ?? obj, ...args),
    child: () => consoleLogger, // Return self for child logger
    // Add other methods if needed, or leave them as stubs if not used by seedDefaultSettings
    // ... other pino methods if required
} as FastifyBaseLogger;


async function main() {
    console.log('开始执行数据库初始化脚本...');

    // 1. 初始化默认设置
    await seedDefaultSettings(consoleLogger); // Pass the logger

    // 2. 初始化默认预设
    await seedDefaultPresets(); // Assuming this function exists

    console.log('数据库初始化脚本执行完毕。');
}

main()
    .catch((e) => {
        console.error('数据库初始化脚本执行失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
