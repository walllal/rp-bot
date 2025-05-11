import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { ContextType as DbContextType } from '@prisma/client';
// Update import path and function names
import { getMessageHistory, deleteOldestMessageHistory } from '../db/message_history';

// 验证 ContextType 参数
function isValidContextType(type: string): type is 'PRIVATE' | 'GROUP' {
    return type === 'PRIVATE' || type === 'GROUP';
}

// 定义删除请求的 Body 接口
interface DeleteMessageHistoryBody { // Renamed interface
    count: number;
}

async function messageHistoryRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) { // Renamed function

    // --- GET /api/message-history/:contextType/:contextId - 获取消息历史 --- (Renamed route in comment)
    fastify.get('/:contextType/:contextId', async (
        request: FastifyRequest<{ Params: { contextType: string; contextId: string }, Querystring: { limit?: string } }>,
        reply: FastifyReply
    ) => {
        const { contextType: typeParam, contextId } = request.params;
        const limitParam = request.query.limit;
        const limit = parseInt(limitParam ?? '10', 10); // Default limit 10

        // 验证 contextType
        const upperContextType = typeParam.toUpperCase();
        if (!isValidContextType(upperContextType)) {
            return reply.status(400).send({ error: '无效的 contextType，必须是 PRIVATE 或 GROUP' });
        }
        const contextType: DbContextType = upperContextType as DbContextType;

        if (!contextId || !/^\d+$/.test(contextId)) {
             return reply.status(400).send({ error: '无效的 contextId，必须是数字' });
        }
        if (isNaN(limit) || limit <= 0) {
             return reply.status(400).send({ error: '无效的 limit，必须是正整数' });
        }

        try {
            const history = await getMessageHistory(contextType, contextId, limit); // Renamed function call
            // 注意：rawMessage 是 JSON，前端需要处理
            return history;
        } catch (error) {
            request.log.error(`获取消息历史失败 (${contextType}:${contextId}):`, error); // Updated log message
            reply.status(500).send({ error: '获取消息历史失败' }); // Updated error message
        }
    });

    // --- DELETE /api/message-history/:contextType/:contextId - 删除旧消息历史 --- (Renamed route in comment)
    fastify.delete('/:contextType/:contextId', async (
        request: FastifyRequest<{ Params: { contextType: string; contextId: string }, Body: DeleteMessageHistoryBody }>, // Renamed interface
        reply: FastifyReply
    ) => {
        const { contextType: typeParam, contextId } = request.params;
        const { count } = request.body;

        // 验证 contextType
        const upperContextType = typeParam.toUpperCase();
        if (!isValidContextType(upperContextType)) {
            return reply.status(400).send({ error: '无效的 contextType，必须是 PRIVATE 或 GROUP' });
        }
        const contextType: DbContextType = upperContextType as DbContextType;

         if (!contextId || !/^\d+$/.test(contextId)) {
             return reply.status(400).send({ error: '无效的 contextId，必须是数字' });
        }
        if (typeof count !== 'number' || isNaN(count) || count <= 0) {
            return reply.status(400).send({ error: '请求体必须包含一个有效的 count (正整数)' });
        }

        try {
            // 确保 logger 实例可用
            if (!request.log) {
                 console.error('Logger instance is not available for deleting message history.'); // Updated log message
                 throw new Error('Logger not available');
            }
            const result = await deleteOldestMessageHistory(contextType, contextId, count, request.log); // Renamed function call
            return result; // 返回 { count: number, message: string }
        } catch (error: any) {
            request.log.error(`删除消息历史失败 (${contextType}:${contextId}):`, error); // Updated log message
            reply.status(500).send({ error: error.message || '删除消息历史失败' }); // Updated error message
        }
    });

}

export default messageHistoryRoutes; // Renamed export
