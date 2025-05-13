import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { AppSettings } from '@prisma/client'; // Import the AppSettings type
import { getAppSettings, updateAppSettings } from '../db/configStore'; // Import new db functions
import { triggerOneBotReconnect, getBotConfig } from '../onebot/connection'; // +++ Import getBotConfig +++
// Removed unused imports: cleanupOldHistory, prisma, DbContextType

// Define the expected request body for updating settings
// It should contain fields matching the AppSettings model (excluding id, createdAt, updatedAt)
type UpdateSettingsBody = Partial<Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>>;

async function settingsRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // --- GET /api/settings - 获取所有设置 ---
    fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Use the new function, passing the logger
            const dbSettings = await getAppSettings(request.log);
            // The function now guarantees returning settings or throws/logs internally

            // +++ Get current bot connection info (including selfId) +++
            const botInfo = getBotConfig();

            // +++ Merge selfId into the settings object +++
            // Create a new object to avoid modifying the original dbSettings potentially cached elsewhere
            const settingsWithSelfId = {
                ...dbSettings,
                onebotSelfId: botInfo.selfId // Add selfId under the key frontend expects
            };

            return settingsWithSelfId; // Return the merged object
        } catch (error) {
            // This catch might be redundant if getAppSettings handles errors robustly,
            // but kept for safety.
            request.log.error('获取设置 API 出错:', error);
            reply.status(500).send({ error: '获取应用设置失败' });
        }
    });

    // --- PUT /api/settings - 更新设置 ---
    fastify.put('/', async (request: FastifyRequest<{ Body: UpdateSettingsBody }>, reply: FastifyReply) => {
        const settingsToUpdate = request.body;

        if (typeof settingsToUpdate !== 'object' || settingsToUpdate === null) {
            return reply.status(400).send({ error: '请求体必须是一个包含设置的对象' });
        }

        // Basic validation (can be enhanced)
        if (Object.keys(settingsToUpdate).length === 0) {
             return reply.status(400).send({ error: '请求体不能为空对象' });
        }

        try {
            // Get current settings to check for changes (needed for side effects)
            const currentSettings = await getAppSettings(request.log);

            // Call the new update function
            const updatedSettingsResult = await updateAppSettings(settingsToUpdate, request.log);

            if (!updatedSettingsResult) {
                 return reply.status(500).send({ error: '更新应用设置失败' });
            }

            // --- Handle Side Effects ---

            // 1. Log Level Change
            if (settingsToUpdate.logLevel !== undefined && settingsToUpdate.logLevel !== currentSettings.logLevel) {
                let pinoLevel: string;
                switch (settingsToUpdate.logLevel) {
                    case 'DEBUG_AI': pinoLevel = 'debug'; break;
                    case 'DEBUG_ALL': pinoLevel = 'trace'; break;
                    case 'NORMAL': default: pinoLevel = 'info'; break;
                }
                request.server.log.level = pinoLevel;
                request.log.info(`日志级别已动态更新为: ${pinoLevel} (对应设置: ${settingsToUpdate.logLevel})`);
            }

            // 2. OneBot Connection Change
            const onebotKeys: (keyof UpdateSettingsBody)[] = [
                'onebotMode', 'onebotUrl', 'onebotPort',
                'onebotAccessToken', 'onebotReconnectInterval',
            ];
            const onebotSettingsChanged = onebotKeys.some(key =>
                settingsToUpdate[key] !== undefined && settingsToUpdate[key] !== currentSettings[key]
            );

            if (onebotSettingsChanged) {
                request.log.info('OneBot 设置已更改，触发重连...');
                triggerOneBotReconnect().catch(err => {
                    request.log.error('触发 OneBot 重连时出错:', err);
                });
            }

            // Return the latest settings after update
            // We could return updatedSettingsResult directly if confident it's up-to-date
            // But fetching again ensures consistency if there were concurrent updates (unlikely here)
            const latestSettings = await getAppSettings(request.log);
            return latestSettings;

        } catch (error) {
            request.log.error('更新设置 API 出错:', error);
            reply.status(500).send({ error: '更新应用设置失败' });
        }
    });
}

export default settingsRoutes;
