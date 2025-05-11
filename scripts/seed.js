"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const presets_1 = require("../src/db/presets"); // Assuming this exists or adjust path
const settings_1 = require("../src/db/settings"); // Correct import
const prisma = new client_1.PrismaClient();
// Create a simple console-based logger compatible with FastifyBaseLogger interface
const consoleLogger = {
    level: 'info', // Default level
    silent: () => { },
    info: (obj, msg, ...args) => console.info(msg !== null && msg !== void 0 ? msg : obj, ...args),
    warn: (obj, msg, ...args) => console.warn(msg !== null && msg !== void 0 ? msg : obj, ...args),
    error: (obj, msg, ...args) => console.error(msg !== null && msg !== void 0 ? msg : obj, ...args),
    fatal: (obj, msg, ...args) => console.error(`FATAL: ${msg !== null && msg !== void 0 ? msg : obj}`, ...args),
    trace: (obj, msg, ...args) => console.debug(`TRACE: ${msg !== null && msg !== void 0 ? msg : obj}`, ...args), // Use debug for trace
    debug: (obj, msg, ...args) => console.debug(msg !== null && msg !== void 0 ? msg : obj, ...args),
    child: () => consoleLogger, // Return self for child logger
    // Add other methods if needed, or leave them as stubs if not used by seedDefaultSettings
    // ... other pino methods if required
};
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('开始执行数据库初始化脚本...');
        // 1. 初始化默认设置
        yield (0, settings_1.seedDefaultSettings)(consoleLogger); // Pass the logger
        // 2. 初始化默认预设
        yield (0, presets_1.seedDefaultPresets)(); // Assuming this function exists
        console.log('数据库初始化脚本执行完毕。');
    });
}
main()
    .catch((e) => {
    console.error('数据库初始化脚本执行失败:', e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
