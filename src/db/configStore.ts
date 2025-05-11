import { PrismaClient, AppSettings } from '@prisma/client'; // Restored Prisma imports
import { FastifyBaseLogger } from 'fastify';

let prisma: PrismaClient; // Restored Prisma instance
try {
  prisma = new PrismaClient({
    // log: ['query', 'info', 'warn', 'error'], // 可选：添加 Prisma 日志进行调试
  });
} catch (e: any) {
  // 如果实例化失败，后续使用 prisma 的地方会出错
  // 最好还是记录一个错误，以便知道实例化失败了
  console.error("!!! CRITICAL: Failed to instantiate PrismaClient in configStore.ts !!!", e);
  // 也可以考虑在这里抛出错误，让应用启动失败
  // throw e;
}

// AppSettings type is now imported from @prisma/client


// 定义默认设置值 (用于 seedDefaultSettings)
const defaultAppSettings: Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'> = {
    onebotMode: 'ws-reverse',
    onebotUrl: null,
    onebotPort: 6701,
    onebotAccessToken: null,
    onebotReconnectInterval: 5000,
    logLevel: 'NORMAL',
    privateWhitelistEnabled: false,
    privateBlacklistEnabled: false,
    groupWhitelistEnabled: false,
    groupBlacklistEnabled: false,
    presetFeatureEnabled: true,
    disguiseFeatureEnabled: false,
    pluginSettings: "{}", // Default as an empty JSON string
};

/**
 * 获取应用设置 (保证返回一条记录，如果不存在则创建)
 * @param logger Logger instance
 * @returns AppSettings object
 */
export async function getAppSettings(logger: FastifyBaseLogger): Promise<AppSettings> {
    // Removed potential leftover [DIAG] comment from previous steps
    if (!prisma) { // PrismaClient 可能实例化失败
        logger.error('Prisma client is not available in getAppSettings.');
        // 返回一个临时的默认对象以避免应用崩溃
        return { id: 1, createdAt: new Date(), updatedAt: new Date(), ...defaultAppSettings } as AppSettings;
    }
    try {
        let settings = await prisma.appSettings.findUnique({
            where: { id: 1 },
        });

        if (!settings) {
            logger.warn('应用设置记录不存在，将使用默认值创建...');
            settings = await seedDefaultSettings(logger); // 创建并返回默认设置
            if (!settings) {
                 // 如果 seed 也失败，抛出错误或返回一个内存中的默认对象
                 logger.error('创建默认应用设置失败！ (called from getAppSettings)');
                 // 返回一个临时的默认对象以避免应用崩溃，但这表示数据库有问题
                 return { id: 1, createdAt: new Date(), updatedAt: new Date(), ...defaultAppSettings } as AppSettings;
            }
        }
        return settings;
    } catch (error: any) {
        logger.error('获取应用设置失败 (getAppSettings catch block):', error.message || error);
        // 返回一个临时的默认对象以避免应用崩溃
        return { id: 1, createdAt: new Date(), updatedAt: new Date(), ...defaultAppSettings } as AppSettings;
    }
}

/**
 * 更新应用设置
 * @param settingsData Partial<Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>> 包含要更新的字段的对象
 * @param logger Logger instance
 */
export async function updateAppSettings(
    settingsData: Partial<Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>>,
    logger: FastifyBaseLogger
): Promise<AppSettings | null> {
    if (!prisma) { // PrismaClient 可能实例化失败
        logger.error('Prisma client is not available in updateAppSettings.');
        return null;
    }
    try {
        // 确保传入的数据类型正确 (例如，字符串转数字/布尔值)
        const dataToUpdate: Record<string, any> = {};
        for (const key of Object.keys(settingsData)) {
            const typedKey = key as keyof typeof settingsData;
            let value = settingsData[typedKey];

            if (typedKey === 'onebotPort' || typedKey === 'onebotReconnectInterval') {
                dataToUpdate[typedKey] = value !== null && value !== undefined ? Number(value) : null;
            } else if (typedKey === 'pluginSettings') {
                if (typeof value === 'object' && value !== null) {
                    try {
                        dataToUpdate[typedKey] = JSON.stringify(value);
                    } catch (e) {
                        logger.error(`无法序列化 pluginSettings 对象: ${e}`, value);
                        continue;
                    }
                } else if (typeof value === 'string') {
                    dataToUpdate[typedKey] = value;
                } else {
                     logger.warn(`收到无效的 pluginSettings 类型 (${typeof value})，将存储为 "{}"`);
                     dataToUpdate[typedKey] = "{}";
                }
            }
            else if (
                typedKey === 'privateWhitelistEnabled' ||
                typedKey === 'privateBlacklistEnabled' ||
                typedKey === 'groupWhitelistEnabled' ||
                typedKey === 'groupBlacklistEnabled' ||
                typedKey === 'presetFeatureEnabled' ||
                typedKey === 'disguiseFeatureEnabled'
            ) {
                dataToUpdate[typedKey] = value === true || value === 'true';
            } else {
                 dataToUpdate[typedKey] = value !== undefined ? value : null;
            }
        } // End of for loop

        const updatedSettings = await prisma.appSettings.update({
            where: { id: 1 },
            data: dataToUpdate,
        });
        logger.info('应用设置已更新。');
        return updatedSettings;
    } catch (error: any) {
        logger.error('更新应用设置失败 (updateAppSettings catch block):', error.message || error);
        return null;
    }
}


/**
 * 初始化数据库中的默认应用设置（如果不存在）
 * @param logger Logger instance
 * @returns The created or existing AppSettings record, or null if error occurs
 */
export async function seedDefaultSettings(logger: FastifyBaseLogger): Promise<AppSettings | null> {
    logger.info('检查并初始化默认应用设置...');
    if (!prisma) { // PrismaClient 可能实例化失败
        logger.error('Prisma client is not available in seedDefaultSettings.');
        return null;
    }
    try {
        const existingSettings = await prisma.appSettings.findUnique({
            where: { id: 1 },
        });

        if (!existingSettings) {
            const createdSettings = await prisma.appSettings.create({
                data: {
                    id: 1, // Explicitly set the ID
                    ...defaultAppSettings,
                },
            });
            logger.info('成功初始化了默认应用设置。');
            return createdSettings;
        } else {
            logger.info('默认应用设置已存在，无需初始化。');
            // Optionally check and update if schema added new fields with defaults
             let needsUpdate = false;
             const dataToUpdate: Partial<AppSettings> = {};
             if (existingSettings.presetFeatureEnabled === null || existingSettings.presetFeatureEnabled === undefined) {
                 dataToUpdate.presetFeatureEnabled = defaultAppSettings.presetFeatureEnabled;
                 needsUpdate = true;
             }
              if (existingSettings.disguiseFeatureEnabled === null || existingSettings.disguiseFeatureEnabled === undefined) {
                 dataToUpdate.disguiseFeatureEnabled = defaultAppSettings.disguiseFeatureEnabled;
                 needsUpdate = true;
             }
             // Add checks for other potentially missing fields here...

             if (needsUpdate) {
                 logger.info('检测到现有设置缺少新字段，正在更新...');
                 const updatedSettings = await prisma.appSettings.update({
                     where: { id: 1 },
                     data: dataToUpdate,
                 });
                 logger.info('现有设置已更新以包含新字段。');
                 return updatedSettings;
             }
            return existingSettings;
        }
    } catch (error: any) {
        // Restore standard error logging via logger
        logger.error('初始化或检查默认应用设置失败:', error);
        // Optionally log Prisma specific details if needed for future debugging
        // if (error.code) { logger.error(`Prisma Error Code: ${error.code}`); }
        // if (error.meta) { logger.error(`Prisma Meta: ${JSON.stringify(error.meta)}`); }
        return null;
    }
}
