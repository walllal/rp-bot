import { ContextType as DbContextType, Prisma, MessageHistory } from '@prisma/client'; // Added MessageHistory
import { prisma } from './prismaClient'; // Import the shared Prisma instance
// Removed import of getSetting, SettingKey
import { FastifyBaseLogger } from 'fastify'; // Import logger type

// Prisma instance is now imported from './prismaClient'
// const prisma = new PrismaClient(); // Removed

interface LogMessageData {
    contextType: DbContextType;
    contextId: string;
    userId: string;
    userName?: string | null; // 添加可选的 userName
    botName?: string | null; // 添加可选的 botName
    messageId: string;
    rawMessage: Prisma.InputJsonValue; // Expecting JSON compatible value (e.g., array from OneBot)
    imageUrls?: string[]; // 新增：可选的图片 URL 数组
}

/**
 * 记录原始消息到 MessageHistory 表 (原 logRawMessage)
 * @param data 包含消息上下文和内容的日志数据
 * @param timestamp 消息的时间戳 (必需)
 * @param logger Logger instance
 */
export async function logMessage(
    data: LogMessageData,
    timestamp: Date, // 添加必需的 timestamp 参数
    logger: FastifyBaseLogger
): Promise<void> {
    try {
        await prisma.messageHistory.create({ // Renamed model
            data: {
                contextType: data.contextType,
                contextId: data.contextId,
                userId: data.userId,
                userName: data.userName, // 保存 userName
                botName: data.botName, // 保存 botName
                messageId: data.messageId,
                rawMessage: data.rawMessage,
                timestamp: timestamp, // 使用传入的时间戳
                imageUrls: data.imageUrls && data.imageUrls.length > 0 ? JSON.stringify(data.imageUrls) : null,
            },
        });
        // 在日志中也记录时间戳，方便调试
        logger.trace(`原始消息已记录到历史: ${data.contextType}:${data.contextId} (User: ${data.userId}, MsgID: ${data.messageId}, Timestamp: ${timestamp.toISOString()})`);
    } catch (error) {
        logger.error(`记录消息历史失败 (${data.contextType}:${data.contextId}):`, error);
    }
}

/**
 * 清理指定上下文的旧消息历史，使其不超过设置的上限 (原 cleanupOldMessageLogs)
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param limit 保留的消息条数上限
 * @param logger Logger instance
 */
// Modify function signature to accept limit directly
export async function cleanupOldMessageHistory(contextType: DbContextType, contextId: string, limit: number, logger: FastifyBaseLogger): Promise<void> {
    try {
        // Use the passed limit directly
        // const limit = limit; // No need to reassign

        if (isNaN(limit) || limit <= 0) {
            // Use the 'limit' parameter in the log message instead of the removed 'limitSetting'
            logger.warn(`无效的消息历史上限设置 (传入值: ${limit})，跳过清理 ${contextType}:${contextId}`);
            return;
        }

        const count = await prisma.messageHistory.count({ // Renamed model
            where: { contextType, contextId },
        });

        if (count > limit) {
            const deleteCount = count - limit;
            logger.trace(`消息历史超出上限 (${count}/${limit})，准备为 ${contextType}:${contextId} 删除 ${deleteCount} 条最旧历史...`);

            // Find the IDs of the oldest messages to delete
            const historyToDelete = await prisma.messageHistory.findMany({ // Renamed model
                where: { contextType, contextId },
                orderBy: { timestamp: 'asc' },
                take: deleteCount,
                 select: { id: true }, // Only select IDs
             });

            // Add explicit type for 'log' parameter in map
            const idsToDelete = historyToDelete.map((log: { id: number }) => log.id);

            if (idsToDelete.length > 0) {
                const deleteResult = await prisma.messageHistory.deleteMany({ // Renamed model
                    where: { id: { in: idsToDelete } },
                });
                logger.trace(`成功为 ${contextType}:${contextId} 删除了 ${deleteResult.count} 条旧消息历史。`);
            } else {
                 logger.trace(`没有找到需要删除的旧消息历史 for ${contextType}:${contextId} (可能并发操作?)`);
            }
        } else {
             logger.trace(`消息历史数量 (${count}/${limit}) 未超出上限 for ${contextType}:${contextId}，无需清理。`);
        }
    } catch (error) {
        logger.error(`清理旧消息历史失败 (${contextType}:${contextId}):`, error);
    }
}

/**
 * 获取指定上下文的消息历史 (原 getMessageLogs)
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param limit 查询数量上限
 * @returns 消息历史列表 (按时间降序)
 */
export async function getMessageHistory(contextType: DbContextType, contextId: string, limit: number) {
    const take = Math.max(1, Math.min(limit, 500)); // Limit query size for performance
    return prisma.messageHistory.findMany({ // Renamed model
        where: { contextType, contextId },
        orderBy: { timestamp: 'desc' },
        take: take,
        // Explicitly select fields including the new ones
        select: {
            id: true,
            contextType: true,
            contextId: true,
            userId: true,
            userName: true, // Include userName
            botName: true, // Include botName (might be useful later)
            messageId: true,
            rawMessage: true,
            timestamp: true,
        }
    });
}

/**
 * 删除指定上下文最旧的 N 条消息历史 (原 deleteOldestMessageLogs)
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param count 要删除的数量
 * @param logger Logger instance
 * @returns 删除操作的结果
 */
export async function deleteOldestMessageHistory(contextType: DbContextType, contextId: string, count: number, logger: FastifyBaseLogger) {
    if (count <= 0) {
        throw new Error('删除数量必须大于 0');
    }
    logger.info(`请求删除 ${contextType}:${contextId} 最旧的 ${count} 条消息历史...`);
    try {
        // Find the IDs of the oldest messages to delete
        const historyToDelete = await prisma.messageHistory.findMany({ // Renamed model
            where: { contextType, contextId },
            orderBy: { timestamp: 'asc' },
            take: count,
             select: { id: true }, // Only select IDs
         });

        // Add explicit type for 'log' parameter in map
        const idsToDelete = historyToDelete.map((log: { id: number }) => log.id);

        if (idsToDelete.length === 0) {
             logger.info(`没有找到 ${contextType}:${contextId} 的消息历史可供删除。`);
             return { count: 0, message: '没有找到可删除的消息历史。' };
        }

        const deleteResult = await prisma.messageHistory.deleteMany({ // Renamed model
            where: { id: { in: idsToDelete } },
        });
        logger.info(`成功为 ${contextType}:${contextId} 删除了 ${deleteResult.count} 条消息历史。`);
        return { count: deleteResult.count, message: `成功删除了 ${deleteResult.count} 条消息历史。` };

    } catch (error) {
         logger.error(`手动删除旧消息历史失败 (${contextType}:${contextId}):`, error);
         throw new Error('删除消息历史时发生数据库错误');
    }
}

/**
 * 根据消息 ID 从 MessageHistory 表中检索单条消息
 * @param messageId 要查询的消息 ID
 * @param logger Logger instance
 * @returns 消息历史记录或 null (如果未找到)
 */
export async function getMessageByMessageId(messageId: string, logger: FastifyBaseLogger): Promise<MessageHistory | null> {
    try {
        logger.trace(`[DB] 尝试通过 MessageID 查询消息历史: ${messageId}`);
        const message = await prisma.messageHistory.findUnique({
            where: { messageId },
        });
        if (message) {
            logger.trace(`[DB] 成功通过 MessageID (${messageId}) 找到消息历史记录 (DB ID: ${message.id})`);
        } else {
            logger.trace(`[DB] 未通过 MessageID (${messageId}) 找到消息历史记录`);
        }
        return message;
    } catch (error) {
        logger.error(`[DB] 通过 MessageID (${messageId}) 查询消息历史失败:`, error);
        return null;
    }
}
