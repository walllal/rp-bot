import { PrismaClient, ContextType as DbContextType, Prisma } from '@prisma/client';
// Removed import of getSetting, SettingKey
import { FastifyBaseLogger } from 'fastify'; // Import logger type

// Assuming prisma instance is handled elsewhere or initialized here for simplicity
const prisma = new PrismaClient();

interface LogMessageData {
    contextType: DbContextType;
    contextId: string;
    userId: string;
    messageId: string;
    rawMessage: Prisma.InputJsonValue; // Expecting JSON compatible value (e.g., array from OneBot)
}

/**
 * 记录原始消息到 MessageLog 表
 * @param data 包含消息上下文和内容的日志数据
 * @param logger Logger instance
 */
export async function logRawMessage(data: LogMessageData, logger: FastifyBaseLogger): Promise<void> {
    try {
        // 注意：这个函数可能不再需要，因为 message_history.ts 中有 logMessage
        // 但为了修复编译错误，我们先修改它
        await prisma.messageHistory.create({ // 改为 messageHistory
            data: {
                contextType: data.contextType,
                contextId: data.contextId,
                userId: data.userId,
                messageId: data.messageId,
                rawMessage: data.rawMessage,
                timestamp: new Date(), // 显式添加时间戳
            },
        });
        logger.trace(`原始消息已记录: ${data.contextType}:${data.contextId} (User: ${data.userId}, MsgID: ${data.messageId})`);
    } catch (error) {
        logger.error(`记录原始消息失败 (${data.contextType}:${data.contextId}):`, error);
    }
}

/**
 * 清理指定上下文的旧消息日志，使其不超过设置的上限
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param limit 保留的消息条数上限
 * @param logger Logger instance
 */
// Modify function signature to accept limit directly
export async function cleanupOldMessageLogs(contextType: DbContextType, contextId: string, limit: number, logger: FastifyBaseLogger): Promise<void> {
    try {
        // 注意：这个函数可能不再需要，因为 message_history.ts 中有 cleanupOldMessageHistory
        // 但为了修复编译错误，我们先修改它
        // Use the passed limit directly
        // const limit = limit; // No need to reassign

        if (isNaN(limit) || limit <= 0) {
            // Use the 'limit' parameter in the log message instead of the removed 'limitSetting'
            logger.warn(`无效的消息日志上限设置 (传入值: ${limit})，跳过清理 ${contextType}:${contextId}`);
            return;
        }

        const count = await prisma.messageHistory.count({ // 改为 messageHistory
            where: { contextType, contextId },
        });

        if (count > limit) {
            const deleteCount = count - limit;
            logger.trace(`消息日志超出上限 (${count}/${limit})，准备为 ${contextType}:${contextId} 删除 ${deleteCount} 条最旧日志...`);

            // Find the IDs of the oldest messages to delete
            const logsToDelete = await prisma.messageHistory.findMany({ // 改为 messageHistory
                where: { contextType, contextId },
                orderBy: { timestamp: 'asc' },
                take: deleteCount,
                select: { id: true }, // Only select IDs
            });

            // 添加类型注解
            const idsToDelete = logsToDelete.map((log: { id: number }) => log.id);

            if (idsToDelete.length > 0) {
                const deleteResult = await prisma.messageHistory.deleteMany({ // 改为 messageHistory
                    where: { id: { in: idsToDelete } },
                });
                logger.trace(`成功为 ${contextType}:${contextId} 删除了 ${deleteResult.count} 条旧消息日志。`);
            } else {
                 logger.trace(`没有找到需要删除的旧消息日志 for ${contextType}:${contextId} (可能并发操作?)`);
            }
        } else {
             logger.trace(`消息日志数量 (${count}/${limit}) 未超出上限 for ${contextType}:${contextId}，无需清理。`);
        }
    } catch (error) {
        logger.error(`清理旧消息日志失败 (${contextType}:${contextId}):`, error);
    }
}

/**
 * 获取指定上下文的消息日志
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param limit 查询数量上限
 * @returns 消息日志列表 (按时间降序)
 */
export async function getMessageLogs(contextType: DbContextType, contextId: string, limit: number) {
    // 注意：这个函数可能不再需要，因为 message_history.ts 中有 getMessages
    // 但为了修复编译错误，我们先修改它
    const take = Math.max(1, Math.min(limit, 500)); // Limit query size for performance
    return prisma.messageHistory.findMany({ // 改为 messageHistory
        where: { contextType, contextId },
        orderBy: { timestamp: 'desc' },
        take: take,
    });
}

/**
 * 删除指定上下文最旧的 N 条消息日志
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param count 要删除的数量
 * @param logger Logger instance
 * @returns 删除操作的结果
 */
export async function deleteOldestMessageLogs(contextType: DbContextType, contextId: string, count: number, logger: FastifyBaseLogger) {
    if (count <= 0) {
        throw new Error('删除数量必须大于 0');
    }
    logger.info(`请求删除 ${contextType}:${contextId} 最旧的 ${count} 条消息日志...`);
    try {
        // 注意：这个函数可能不再需要，因为 message_history.ts 中有 deleteOldestMessages
        // 但为了修复编译错误，我们先修改它
        // Find the IDs of the oldest messages to delete
        const logsToDelete = await prisma.messageHistory.findMany({ // 改为 messageHistory
            where: { contextType, contextId },
            orderBy: { timestamp: 'asc' },
            take: count,
            select: { id: true }, // Only select IDs
        });

        // 添加类型注解
        const idsToDelete = logsToDelete.map((log: { id: number }) => log.id);

        if (idsToDelete.length === 0) {
             logger.info(`没有找到 ${contextType}:${contextId} 的消息日志可供删除。`);
             return { count: 0, message: '没有找到可删除的消息日志。' };
        }

        const deleteResult = await prisma.messageHistory.deleteMany({ // 改为 messageHistory
            where: { id: { in: idsToDelete } },
        });
        logger.info(`成功为 ${contextType}:${contextId} 删除了 ${deleteResult.count} 条消息日志。`);
        return { count: deleteResult.count, message: `成功删除了 ${deleteResult.count} 条消息日志。` };

    } catch (error) {
         logger.error(`手动删除旧消息日志失败 (${contextType}:${contextId}):`, error);
         throw new Error('删除消息日志时发生数据库错误');
    }
}
