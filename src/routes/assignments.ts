import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { AssignmentType, ContextType as DbContextType, Prisma } from '@prisma/client';
import { prisma } from '../db/prismaClient'; // Corrected import path

// 定义更新分配的请求体接口
interface UpdateAssignmentBody {
  assignmentType: AssignmentType; // 'GLOBAL', 'PRIVATE', 'GROUP'
  contextId?: string | null;      // QQ or Group ID, null for GLOBAL
  presetId: number;             // The ID of the preset to assign
}

async function assignmentRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

  // --- GET /api/assignments - 获取所有当前的预设分配 ---
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const assignments = await prisma.presetAssignment.findMany({
        include: { preset: { select: { id: true, name: true } } }, // 包含关联的预设名称
        orderBy: [{ assignmentType: 'asc' }, { contextId: 'asc' }], // 排序方便查看
      });
      return assignments;
    } catch (error) {
      request.log.error('获取预设分配列表失败:', error);
      reply.status(500).send({ error: '获取预设分配列表失败' });
    }
  });

  // --- PUT /api/assignments - 创建或更新预设分配 ---
  // 使用 PUT 实现 upsert 逻辑：如果指定类型的分配已存在，则更新；否则创建。
  fastify.put('/', async (request: FastifyRequest<{ Body: UpdateAssignmentBody }>, reply: FastifyReply) => {
    const { assignmentType, contextId: rawContextId, presetId } = request.body;

    // --- 数据验证 ---
    if (!assignmentType || !presetId) {
      return reply.status(400).send({ error: '缺少 assignmentType 或 presetId' });
    }
    if (!Object.values(AssignmentType).includes(assignmentType)) {
        return reply.status(400).send({ error: '无效的 assignmentType' });
    }
    if (typeof presetId !== 'number' || presetId <= 0) {
        return reply.status(400).send({ error: '无效的 presetId' });
    }

    let contextId: string | null = null;
    if (assignmentType === AssignmentType.GLOBAL) {
      if (rawContextId !== undefined && rawContextId !== null) {
        return reply.status(400).send({ error: '全局分配 (GLOBAL) 的 contextId 必须为 null 或省略' });
      }
      contextId = null;
    } else if (assignmentType === AssignmentType.PRIVATE || assignmentType === AssignmentType.GROUP) {
      if (typeof rawContextId !== 'string' || !rawContextId.trim()) {
        return reply.status(400).send({ error: `类型 ${assignmentType} 需要一个有效的 contextId (字符串)` });
      }
      contextId = rawContextId.trim();
    } else {
         // Should not happen due to enum check, but for safety
         return reply.status(400).send({ error: '未知的 assignmentType' });
    }
    // --- 结束数据验证 ---

    try {
      // 检查预设是否存在
      const presetExists = await prisma.preset.findUnique({ where: { id: presetId } });
      if (!presetExists) {
        return reply.status(404).send({ error: `找不到 ID 为 ${presetId} 的预设` });
      }

      // 手动实现 Upsert 逻辑
      const existingAssignment = await prisma.presetAssignment.findFirst({
          where: {
              assignmentType: assignmentType,
              contextId: contextId,
          }
      });

      let resultAssignment;
      if (existingAssignment) {
          // 更新现有记录
          resultAssignment = await prisma.presetAssignment.update({
              where: { id: existingAssignment.id }, // 使用找到的记录 ID 更新
              data: { presetId: presetId },
              include: { preset: { select: { id: true, name: true } } },
          });
          request.log.info(`更新了预设分配: ${assignmentType} - ${contextId ?? 'GLOBAL'}`);
      } else {
          // 创建新记录
          resultAssignment = await prisma.presetAssignment.create({
              data: {
                  assignmentType: assignmentType,
                  contextId: contextId,
                  presetId: presetId,
              },
              include: { preset: { select: { id: true, name: true } } },
          });
          request.log.info(`创建了新的预设分配: ${assignmentType} - ${contextId ?? 'GLOBAL'}`);
      }

      return resultAssignment;

    } catch (error: any) {
      request.log.error('更新/创建预设分配失败:', error);
      // 这里可能需要处理特定的 Prisma 错误，但通用错误处理可能足够
      reply.status(500).send({ error: '更新/创建预设分配失败' });
    }
  });

  // --- DELETE /api/assignments - 删除指定类型的分配 ---
  // 需要提供 assignmentType 和 contextId 来确定要删除哪一个
  // 使用 DELETE 请求体可能不标准，但可以传递必要信息
  // 或者使用 DELETE /api/assignments/:assignmentType/:contextId (更 RESTful)
  // 这里先实现一个简单的，通过请求体传递
  fastify.delete('/', async (request: FastifyRequest<{ Body: { assignmentType: AssignmentType, contextId?: string | null } }>, reply: FastifyReply) => {
      const { assignmentType, contextId: rawContextId } = request.body;

      // --- 数据验证 ---
      if (!assignmentType) {
          return reply.status(400).send({ error: '缺少 assignmentType' });
      }
      if (!Object.values(AssignmentType).includes(assignmentType)) {
          return reply.status(400).send({ error: '无效的 assignmentType' });
      }

      let contextId: string | null = null;
      if (assignmentType === AssignmentType.GLOBAL) {
          if (rawContextId !== undefined && rawContextId !== null) {
              return reply.status(400).send({ error: '全局分配 (GLOBAL) 的 contextId 必须为 null 或省略' });
          }
          contextId = null;
      } else if (assignmentType === AssignmentType.PRIVATE || assignmentType === AssignmentType.GROUP) {
          if (typeof rawContextId !== 'string' || !rawContextId.trim()) {
              return reply.status(400).send({ error: `类型 ${assignmentType} 需要一个有效的 contextId (字符串)` });
          }
          contextId = rawContextId.trim();
      } else {
          return reply.status(400).send({ error: '未知的 assignmentType' });
      }
      // --- 结束数据验证 ---

      try {
          // 使用 deleteMany，它的 where 条件更灵活
          const deleteResult = await prisma.presetAssignment.deleteMany({
              where: {
                  assignmentType: assignmentType,
                  contextId: contextId,
              },
          });

          if (deleteResult.count === 0) {
              // 如果没有记录被删除，说明找不到匹配的分配
              return reply.status(404).send({ error: '找不到要删除的预设分配' });
          }

          request.log.info(`删除了预设分配: ${assignmentType} - ${contextId ?? 'GLOBAL'}`);
          reply.status(204).send(); // No content on successful delete
      } catch (error: any) {
          // deleteMany 不会因为找不到记录而抛出 P2025 错误，所以上面的 count 检查是必要的
          request.log.error('删除预设分配失败:', error);
          reply.status(500).send({ error: '删除预设分配失败' });
      }
  });

}

export default assignmentRoutes;
