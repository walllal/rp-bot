import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { ContextType as DbContextType } from '@prisma/client';
import { prisma } from '../server'; // Import shared prisma instance
import { getHistoryItems, deleteHistoryItems } from '../db/history'; // Import history fetching and deleting functions
import { z } from 'zod'; // Import Zod

// 定义查询参数的 schema (limit 代表消息条数)
const getHistoryQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(500).optional().default(10), // 默认 10 条, 最大 500
});

// 定义路径参数的 schema
const historyParamsSchema = z.object({
    contextType: z.string(), // 暂时改为 string，测试是否 z.enum 导致问题
    contextId: z.string(), // 保持移除 .min(1)
});

// 定义删除请求体的 schema (count 代表消息条数)
const deleteHistoryBodySchema = z.object({
    count: z.coerce.number().int().min(1), // 要删除的消息条数
});

async function historyRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

  // --- GET /api/history/:contextType/:contextId - 获取指定上下文的历史记录 ---
  // --- GET /api/history/:contextType/:contextId - 获取指定上下文的历史记录 ---
  // Completely remove schema validation for GET route for debugging
  fastify.get('/:contextType/:contextId', async (
    request: FastifyRequest<{ Params: any, Querystring: any }>, // Use 'any' for types
    reply: FastifyReply
  ) => {
    // Manually validate params and query since schema is removed
    const { contextType: contextTypeParam, contextId } = request.params as { contextType: string, contextId: string };
    const { limit: limitParam } = request.query as { limit?: string };

    // Manual validation for contextType (since schema uses z.string())
    let dbContextType: DbContextType;
    if (contextTypeParam?.toLowerCase() === 'private') {
        dbContextType = DbContextType.PRIVATE;
    } else if (contextTypeParam?.toLowerCase() === 'group') {
        dbContextType = DbContextType.GROUP;
    } else {
        return reply.status(400).send({ error: "无效的上下文类型，应为 'private' 或 'group'" });
    }

    // Manual validation for contextId
    if (!contextId || typeof contextId !== 'string') {
         return reply.status(400).send({ error: '缺少或无效的上下文 ID' }); // Keep manual contextId check for now
    }

    // Manually validate limit since querystring schema is removed
    let messageLimit = 10; // Default
    if (limitParam !== undefined) {
        const parsedLimit = parseInt(limitParam, 10);
        if (isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 500) {
            return reply.status(400).send({ error: '无效的 limit 参数，应为 1-500 之间的整数' });
        }
        messageLimit = parsedLimit;
    }

    try {
      // 调用数据库函数获取历史 (传递 messageLimit)
      const history = await getHistoryItems(dbContextType, contextId, messageLimit);
      return history; // 直接返回获取到的历史记录数组
    } catch (error) {
      request.log.error(`获取历史记录失败 (${dbContextType}:${contextId}):`, error);
      reply.status(500).send({ error: '获取历史记录失败' });
    }
  });

  // --- DELETE /api/history/:contextType/:contextId - 删除指定上下文的历史记录 (按条数) ---
  // Keep DELETE route schema removed due to FST_ERR_SCH_VALIDATION_BUILD issue
  fastify.delete('/:contextType/:contextId', /*{
    schema: {
      params: historyParamsSchema,
      body: deleteHistoryBodySchema,
    }
  },*/ async (
    request: FastifyRequest<{ Params: any, Body: any }>, // Use 'any' for types temporarily
    reply: FastifyReply
  ) => {
    // Manually validate params and body since schema is removed
    const { contextType: contextTypeParam, contextId } = request.params as { contextType: string, contextId: string };
    const { count } = request.body as { count?: number | string }; // Allow string for parsing

    // Manual validation for contextType
    let dbContextType: DbContextType;
    if (contextTypeParam?.toLowerCase() === 'private') {
        dbContextType = DbContextType.PRIVATE;
    } else if (contextTypeParam?.toLowerCase() === 'group') {
        dbContextType = DbContextType.GROUP;
    } else {
        return reply.status(400).send({ error: "无效的上下文类型，应为 'private' 或 'group'" });
    }

    // Manual validation for contextId
    if (!contextId || typeof contextId !== 'string') {
         return reply.status(400).send({ error: '缺少或无效的上下文 ID' });
    }

    // Manual validation for count
    if (count === undefined || count === null) {
        return reply.status(400).send({ error: '请求体中缺少 count 参数' });
    }
    const messagesToDelete = parseInt(String(count), 10); // Convert to string first for safety
    if (isNaN(messagesToDelete) || messagesToDelete <= 0) {
        return reply.status(400).send({ error: '无效的 count 参数，应为正整数' });
    }

    try {
      // 调用数据库函数删除历史 (传递 messagesToDelete)
      const deletedMessageCount = await deleteHistoryItems(dbContextType, contextId, messagesToDelete);
      return { message: `成功删除了 ${deletedMessageCount} 条历史记录。` }; // 返回删除的消息条数
    } catch (error) {
      request.log.error(`删除历史记录失败 (${dbContextType}:${contextId}, count: ${messagesToDelete}):`, error);
      reply.status(500).send({ error: '删除历史记录失败' });
    }
  });

}

export default historyRoutes;
