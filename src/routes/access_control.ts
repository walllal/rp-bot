import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { AccessControlType } from '@prisma/client';
import { getAccessControlList, addAccessControlEntry, removeAccessControlEntry } from '../db/access_control';

// 定义查询参数接口
interface GetListQuery {
    type: string; // 接收字符串形式的类型
}

// 定义添加/删除请求体接口
interface ModifyEntryBody {
    type: string;
    contextId: string;
}

// 辅助函数：将字符串类型转换为枚举类型
function parseAccessControlType(typeStr: string): AccessControlType | null {
    if (Object.values(AccessControlType).includes(typeStr as AccessControlType)) {
        return typeStr as AccessControlType;
    }
    return null;
}

async function accessControlRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // --- GET /api/access-control - 获取指定类型的列表 ---
    fastify.get('/', async (request: FastifyRequest<{ Querystring: GetListQuery }>, reply: FastifyReply) => {
        const typeStr = request.query.type;
        const type = parseAccessControlType(typeStr);

        if (!type) {
            return reply.status(400).send({ error: '无效的访问控制列表类型' });
        }

        try {
            const list = await getAccessControlList(type);
            return list; // 返回 ID 列表
        } catch (error) {
            request.log.error(`获取访问控制列表 ${type} 失败:`, error);
            reply.status(500).send({ error: `获取列表 ${type} 失败` });
        }
    });

    // --- POST /api/access-control - 添加条目 ---
    fastify.post('/', async (request: FastifyRequest<{ Body: ModifyEntryBody }>, reply: FastifyReply) => {
        const { type: typeStr, contextId } = request.body;
        const type = parseAccessControlType(typeStr);

        if (!type) {
            return reply.status(400).send({ error: '无效的访问控制列表类型' });
        }
        if (!contextId || !/^\d+$/.test(contextId)) {
             return reply.status(400).send({ error: '无效的 Context ID' });
        }

        try {
            const addedEntry = await addAccessControlEntry(type, contextId);
            if (addedEntry) {
                // 成功添加（或已存在），返回最新的列表可能更方便前端更新
                 const list = await getAccessControlList(type);
                 return reply.status(200).send(list);
            } else {
                // 可能因为验证失败或数据库错误导致添加失败
                reply.status(400).send({ error: `添加条目 ${contextId} 到 ${type} 失败` });
            }
        } catch (error) {
            request.log.error(`添加条目到 ${type} (${contextId}) 失败:`, error);
            reply.status(500).send({ error: `添加条目 ${contextId} 到 ${type} 失败` });
        }
    });

    // --- DELETE /api/access-control - 删除条目 ---
    fastify.delete('/', async (request: FastifyRequest<{ Body: ModifyEntryBody }>, reply: FastifyReply) => {
         const { type: typeStr, contextId } = request.body;
         const type = parseAccessControlType(typeStr);

        if (!type) {
            return reply.status(400).send({ error: '无效的访问控制列表类型' });
        }
        if (!contextId) {
             return reply.status(400).send({ error: '缺少 Context ID' });
        }

        try {
            const success = await removeAccessControlEntry(type, contextId);
            if (success) {
                 // 成功删除，返回最新的列表
                 const list = await getAccessControlList(type);
                 return reply.status(200).send(list);
            } else {
                // 未找到要删除的条目或删除失败
                reply.status(404).send({ error: `未在 ${type} 中找到条目 ${contextId} 或删除失败` });
            }
        } catch (error) {
            request.log.error(`从 ${type} 删除条目 (${contextId}) 失败:`, error);
            reply.status(500).send({ error: `从 ${type} 删除条目 ${contextId} 失败` });
        }
    });

}

export default accessControlRoutes;
