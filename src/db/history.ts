import { ContextType, Role } from '@prisma/client';
import { prisma } from './prismaClient'; // Import the shared Prisma instance
// Removed import of getSetting, SettingKey
import { FastifyBaseLogger } from 'fastify'; // Import logger type

// Use a shared Prisma instance if possible, otherwise initialize locally
// Prisma instance is now imported from './prismaClient'
// const prisma = new PrismaClient(); // Removed

/**
 * 自动清理超出上限的历史记录
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param limit 保留的消息条数上限
 * @param logger A logger instance (e.g., from Fastify)
 */
// Modify function signature to accept limit directly
export async function cleanupOldHistory(contextType: ContextType, contextId: string, limit: number, logger: FastifyBaseLogger): Promise<void> {
    try {
        // Use the passed limit directly
        const messageLimit = limit;

        // Only proceed if messageLimit is a valid positive integer
        if (!isNaN(messageLimit) && messageLimit > 0) {
            const currentMessageCount = await prisma.chatHistory.count({
                where: { contextType, contextId },
            });

            // No need to calculate messageLimit, it's directly from settings

            if (currentMessageCount > messageLimit) {
                const messagesToDelete = currentMessageCount - messageLimit;
                // Use logger.trace for cleanup logs
                logger.trace(`[自动清理历史] ${contextType}:${contextId} 当前 ${currentMessageCount} 条消息，超过上限 ${messageLimit} 条，准备删除最旧的 ${messagesToDelete} 条消息。`); // Updated log message

                const oldestItems = await prisma.chatHistory.findMany({
                    where: { contextType, contextId },
                    orderBy: { timestamp: 'asc' },
                    take: messagesToDelete,
                    select: { id: true },
                });

                const idsToDelete = oldestItems.map(item => item.id);

                if (idsToDelete.length > 0) {
                    const deleteResult = await prisma.chatHistory.deleteMany({
                        where: { id: { in: idsToDelete } },
                    });
                     // Use logger.trace for cleanup logs
                    logger.trace(`[自动清理历史] 成功删除 ${deleteResult.count} 条旧消息记录。`);
                }
            }
        } else {
            // logger.trace(`[自动清理历史] 未配置有效的 chatHistoryLimit (${limitSetting})，跳过清理。`); // Optional trace log, updated key name
        }
    } catch (cleanupError) {
        // Use logger.error if available, otherwise console.error
        const logError = logger?.error || console.error;
        logError(`[自动清理历史] 执行清理时出错 (${contextType}:${contextId}):`, cleanupError);
        // Cleanup failure should not block the main flow, just log the error
    }
}

/**
 * 添加一条对话历史记录
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param userId 发送者 QQ 号
 * @param role 角色
 * @param content 消息内容
 * @param messageId 原始消息 ID (可选)
 * @param userName 发送者昵称/群名片 (可选)
 * @param botName 当时生效的机器人名称 (可选)
 * @param timestamp 消息的时间戳 (必需)
 */
export async function addHistoryItem(
    contextType: ContextType,
    contextId: string,
    userId: string,
    role: Role,
    content: string,
    timestamp: Date, // 添加必需的 timestamp 参数
    messageId?: string,
    userName?: string | null, // Add userName
    botName?: string | null // Add botName
): Promise<void> {
    try {
        await prisma.chatHistory.create({
            data: {
                timestamp, // 使用传入的时间戳
                contextType,
                contextId,
                userId,
                userName, // Save userName
                botName, // Save botName
                role,
                content,
                messageId,
            },
        });
        // Automatic cleanup logic is now moved to cleanupOldHistory function
        // and called explicitly after both user and assistant messages are added.
    } catch (error) {
        console.error(`添加历史记录失败 (${contextType}:${contextId}):`, error);
    }
}

/**
 * 获取指定上下文的对话历史记录 (按条数)
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param messageLimit 获取的消息条数上限
 * @returns 对话历史记录数组 (包含详细信息, 最新在前)
 */
export async function getHistoryItems(
    contextType: ContextType,
    contextId: string,
    messageLimit: number = 10 // 默认获取 10 条
): Promise<any[]> { // Return type changed to any[] for now, or define a specific detailed type
    if (messageLimit <= 0) return [];

    try {
        const history = await prisma.chatHistory.findMany({
            where: { contextType, contextId },
            orderBy: { timestamp: 'desc' }, // 按时间降序获取 (最新在前)
            take: messageLimit, // Use messageLimit directly
            // Select all necessary fields for detailed display and advanced mode processing
            select: {
                id: true,
                contextType: true,
                contextId: true,
                userId: true,
                userName: true, // Include userName
                botName: true, // Include botName
                messageId: true,
                role: true,
                content: true,
                timestamp: true
            },
        });
        // 移除 .reverse()，因为数据库查询已按 desc 排序 (最新在前)
        return history;
    } catch (error) {
        console.error(`获取历史记录失败 (${contextType}:${contextId}):`, error);
        return [];
    }
}

/**
 * 删除指定上下文的对话历史记录 (按条数)
 * @param contextType 上下文类型
 * @param contextId 上下文 ID
 * @param messagesToDelete 要删除的消息条数
 * @returns 实际删除的消息条数
 */
export async function deleteHistoryItems(
    contextType: ContextType,
    contextId: string,
    messagesToDelete: number // Parameter is now message count
): Promise<number> {
    if (messagesToDelete <= 0) {
        console.log(`[删除历史] 请求删除 0 条或负数条 (${messagesToDelete})，不执行操作。`); // Updated log
        return 0;
    }

    try {
        const totalCount = await prisma.chatHistory.count({
            where: { contextType, contextId },
        });

        if (totalCount === 0) {
            console.log(`[删除历史] ${contextType}:${contextId} 没有历史记录可删除。`);
            return 0;
        }

        // No need to calculate messagesToDelete, it's the input parameter

        if (messagesToDelete >= totalCount) {
            console.log(`[删除历史] 请求删除 ${messagesToDelete} 条消息，总共 ${totalCount} 条，将删除全部 ${contextType}:${contextId} 的历史记录。`); // Updated log
            const deleteResult = await prisma.chatHistory.deleteMany({
                where: { contextType, contextId },
            });
            console.log(`[删除历史] 成功删除 ${deleteResult.count} 条记录。`);
            return deleteResult.count;
        }

        console.log(`[删除历史] 请求删除 ${contextType}:${contextId} 最旧的 ${messagesToDelete} 条消息 (总共 ${totalCount} 条)。`); // Updated log
        const oldestItems = await prisma.chatHistory.findMany({
            where: { contextType, contextId },
            orderBy: { timestamp: 'asc' },
            take: messagesToDelete, // Use messagesToDelete directly
            select: { id: true },
        });

        const idsToDelete = oldestItems.map(item => item.id);

        if (idsToDelete.length === 0) {
            console.log(`[删除历史] 未找到可删除的旧记录。`);
            return 0;
        }

        const deleteResult = await prisma.chatHistory.deleteMany({
            where: { id: { in: idsToDelete } },
        });
        console.log(`[删除历史] 成功删除 ${deleteResult.count} 条旧消息记录。`);
        return deleteResult.count;

    } catch (error) {
        console.error(`删除历史记录失败 (${contextType}:${contextId}, count: ${messagesToDelete}):`, error); // Updated log
        return 0;
    }
}
