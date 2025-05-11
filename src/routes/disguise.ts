import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import {
    getAllDisguisePresets,
    getDisguisePresetById,
    createDisguisePreset,
    updateDisguisePreset,
    deleteDisguisePreset,
    getAllDisguiseAssignments,
    upsertDisguiseAssignment,
    deleteDisguiseAssignment
} from '../db/disguise';
import { AssignmentType, DisguisePreset } from '@prisma/client'; // Import enum and type
import { PresetContent } from '../core/types'; // Import shared type
import { updateOrRemoveTimedTriggerForPreset } from '../core/trigger-scheduler'; // +++ Import scheduler function

// Interfaces for request bodies
interface CreateDisguisePresetBody {
    name: string;
    mode?: string;
    content: PresetContent;
    botName?: string | null;
    botNicknames?: string | null;
    advancedModeMessageDelay?: number;
    botFuzzyMatchEnabled?: boolean;
    allowImageInput?: boolean;
    allowVoiceOutput?: boolean;
    // 触发方式控制
    nameTriggered?: boolean;
    nicknameTriggered?: boolean;
    atTriggered?: boolean;
    replyTriggered?: boolean;
    chatHistoryLimit?: number;
    messageHistoryLimit?: number;
    openaiApiKey?: string | null;
    openaiBaseUrl?: string | null;
    openaiModel?: string;
    // 联网设置
    allowWebSearch?: boolean;
    webSearchApiKey?: string | null;
    webSearchBaseUrl?: string | null;
    webSearchModel?: string;
    webSearchSystemPrompt?: string | null; // 新增
    // 新增高级触发设置
    timedTriggerEnabled?: boolean;
    timedTriggerInterval?: number | null;
    quantitativeTriggerEnabled?: boolean;
    quantitativeTriggerThreshold?: number | null;
    aiTriggerEnabled?: boolean;
    aiTriggerApiKey?: string | null;
    aiTriggerBaseUrl?: string | null;
    aiTriggerModel?: string | null;
    aiTriggerKeyword?: string | null;
    aiTriggerKeywordFuzzyMatch?: boolean; // 新增
    aiTriggerSystemPrompt?: string | null;
    aiTriggerUserPrompt?: string | null;
}

// Explicit interface for updating disguise presets, including new fields
interface UpdateDisguisePresetBody {
    name?: string;
    mode?: string;
    content?: PresetContent; // Ensure this matches the expected type in the DB layer
    botName?: string | null;
    botNicknames?: string | null;
    advancedModeMessageDelay?: number;
    botFuzzyMatchEnabled?: boolean;
    allowImageInput?: boolean;
    allowVoiceOutput?: boolean;
    nameTriggered?: boolean;
    nicknameTriggered?: boolean;
    atTriggered?: boolean;
    replyTriggered?: boolean;
    chatHistoryLimit?: number;
    messageHistoryLimit?: number;
    openaiApiKey?: string | null;
    openaiBaseUrl?: string | null;
    openaiModel?: string;
    allowWebSearch?: boolean;
    webSearchApiKey?: string | null;
    webSearchBaseUrl?: string | null;
    webSearchModel?: string;
    webSearchSystemPrompt?: string | null;
    // 新增高级触发设置
    timedTriggerEnabled?: boolean;
    timedTriggerInterval?: number | null;
    quantitativeTriggerEnabled?: boolean;
    quantitativeTriggerThreshold?: number | null;
    aiTriggerEnabled?: boolean;
    aiTriggerApiKey?: string | null;
    aiTriggerBaseUrl?: string | null;
    aiTriggerModel?: string | null;
    aiTriggerKeyword?: string | null;
    aiTriggerKeywordFuzzyMatch?: boolean; // 新增
    aiTriggerSystemPrompt?: string | null;
    aiTriggerUserPrompt?: string | null;
}

interface UpsertDisguiseAssignmentBody {
    assignmentType: AssignmentType;
    contextId?: string | null; // Optional for GLOBAL
    presetId: number;
}

interface DeleteDisguiseAssignmentBody {
    assignmentType: AssignmentType;
    contextId?: string | null; // Optional for GLOBAL
}

// Interface for import request body
interface ImportDisguisePresetsBody {
    presets: CreateDisguisePresetBody[]; // Array of presets to import
}

async function disguiseRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // --- Disguise Presets Routes ---

    // GET /api/disguise-presets - Retrieve all disguise presets
    fastify.get('/presets', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const presets = await getAllDisguisePresets();
            reply.send(presets);
        } catch (error) {
            request.log.error('获取伪装预设列表时出错:', error);
            reply.status(500).send({ error: '获取伪装预设列表失败' });
        }
    });

    // GET /api/disguise-presets/:id - Retrieve a single disguise preset
    fastify.get('/presets/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) {
            return reply.status(400).send({ error: '无效的预设 ID' });
        }
        try {
            const preset = await getDisguisePresetById(id);
            if (!preset) {
                return reply.status(404).send({ error: '伪装预设未找到' });
            }
            reply.send(preset);
        } catch (error) {
            request.log.error(`获取伪装预设 ${id} 时出错:`, error);
            reply.status(500).send({ error: '获取伪装预设失败' });
        }
    });

    // POST /api/disguise-presets - Create a new disguise preset
    fastify.post('/presets', async (request: FastifyRequest<{ Body: CreateDisguisePresetBody }>, reply: FastifyReply) => {
        const body = request.body;
        // Basic validation (can be expanded with Zod later if desired)
        if (!body.name || !Array.isArray(body.content)) {
            return reply.status(400).send({ error: '无效的请求体，需要 name 和 content (数组)' });
        }
        // Add more specific validations for new fields as done in presets.ts
        if (body.timedTriggerInterval !== undefined && body.timedTriggerInterval !== null && (typeof body.timedTriggerInterval !== 'number' || !Number.isInteger(body.timedTriggerInterval) || body.timedTriggerInterval < 10 || body.timedTriggerInterval > 1000)) {
            return reply.status(400).send({ error: 'timedTriggerInterval 必须是10-1000之间的整数或null' });
        }
        if (body.quantitativeTriggerThreshold !== undefined && body.quantitativeTriggerThreshold !== null && (typeof body.quantitativeTriggerThreshold !== 'number' || !Number.isInteger(body.quantitativeTriggerThreshold) || body.quantitativeTriggerThreshold < 10 || body.quantitativeTriggerThreshold > 100)) {
            return reply.status(400).send({ error: 'quantitativeTriggerThreshold 必须是10-100之间的整数或null' });
        }
        if (body.aiTriggerKeywordFuzzyMatch !== undefined && typeof body.aiTriggerKeywordFuzzyMatch !== 'boolean') { // 新增验证
            return reply.status(400).send({ error: 'aiTriggerKeywordFuzzyMatch 必须是布尔值' });
        }
        // Other boolean and string fields are generally covered by TypeScript types, but more specific checks can be added.

        try {
            // Ensure all fields from CreateDisguisePresetBody are passed to createDisguisePreset
            const dataToCreate: CreateDisguisePresetBody = { ...body };
            const newPreset = await createDisguisePreset(dataToCreate);
            // +++ Schedule timed trigger for the new disguise preset +++
            await updateOrRemoveTimedTriggerForPreset('disguise', newPreset.id, fastify);
            reply.status(201).send(newPreset);
        } catch (error: any) {
            request.log.error('创建伪装预设时出错:', error);
             if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
                reply.status(409).send({ error: '已存在同名的伪装预设' });
            } else {
                reply.status(500).send({ error: '创建伪装预设失败' });
            }
        }
    });

     // PUT /api/disguise-presets/:id - Update an existing disguise preset
    fastify.put('/presets/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: UpdateDisguisePresetBody }>, reply: FastifyReply) => {
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) {
            return reply.status(400).send({ error: '无效的预设 ID' });
        }
        const body = request.body;
        // Add specific validations for new fields if they are present in the body
        if (body.timedTriggerInterval !== undefined && body.timedTriggerInterval !== null && (typeof body.timedTriggerInterval !== 'number' || !Number.isInteger(body.timedTriggerInterval) || body.timedTriggerInterval < 10 || body.timedTriggerInterval > 1000)) {
            return reply.status(400).send({ error: 'timedTriggerInterval 必须是10-1000之间的整数或null' });
        }
        if (body.quantitativeTriggerThreshold !== undefined && body.quantitativeTriggerThreshold !== null && (typeof body.quantitativeTriggerThreshold !== 'number' || !Number.isInteger(body.quantitativeTriggerThreshold) || body.quantitativeTriggerThreshold < 10 || body.quantitativeTriggerThreshold > 100)) {
            return reply.status(400).send({ error: 'quantitativeTriggerThreshold 必须是10-100之间的整数或null' });
        }
        if (body.aiTriggerKeywordFuzzyMatch !== undefined && typeof body.aiTriggerKeywordFuzzyMatch !== 'boolean') { // 新增验证
            return reply.status(400).send({ error: 'aiTriggerKeywordFuzzyMatch 必须是布尔值' });
        }

        try {
            // Construct the data object for the DB update function, ensuring type compatibility
            // Explicitly list all properties from UpdateDisguisePresetBody to ensure all are passed if present
            const dataForDb: import('../db/disguise').UpdateDisguisePresetData = {};
            // Iterate over keys of UpdateDisguisePresetBody definition if possible, or list them manually
            // For now, manual listing based on the interface:
            if (body.name !== undefined) dataForDb.name = body.name;
            if (body.mode !== undefined) dataForDb.mode = body.mode;
            if (body.content !== undefined) dataForDb.content = body.content;
            if (body.botName !== undefined) dataForDb.botName = body.botName;
            if (body.botNicknames !== undefined) dataForDb.botNicknames = body.botNicknames;
            if (body.advancedModeMessageDelay !== undefined) dataForDb.advancedModeMessageDelay = body.advancedModeMessageDelay;
            if (body.botFuzzyMatchEnabled !== undefined) dataForDb.botFuzzyMatchEnabled = body.botFuzzyMatchEnabled;
            if (body.allowImageInput !== undefined) dataForDb.allowImageInput = body.allowImageInput;
            if (body.allowVoiceOutput !== undefined) dataForDb.allowVoiceOutput = body.allowVoiceOutput;
            if (body.nameTriggered !== undefined) dataForDb.nameTriggered = body.nameTriggered;
            if (body.nicknameTriggered !== undefined) dataForDb.nicknameTriggered = body.nicknameTriggered;
            if (body.atTriggered !== undefined) dataForDb.atTriggered = body.atTriggered;
            if (body.replyTriggered !== undefined) dataForDb.replyTriggered = body.replyTriggered;
            if (body.chatHistoryLimit !== undefined) dataForDb.chatHistoryLimit = body.chatHistoryLimit;
            if (body.messageHistoryLimit !== undefined) dataForDb.messageHistoryLimit = body.messageHistoryLimit;
            if (body.openaiApiKey !== undefined) dataForDb.openaiApiKey = body.openaiApiKey;
            if (body.openaiBaseUrl !== undefined) dataForDb.openaiBaseUrl = body.openaiBaseUrl;
            if (body.openaiModel !== undefined) dataForDb.openaiModel = body.openaiModel;
            if (body.allowWebSearch !== undefined) dataForDb.allowWebSearch = body.allowWebSearch;
            if (body.webSearchApiKey !== undefined) dataForDb.webSearchApiKey = body.webSearchApiKey;
            if (body.webSearchBaseUrl !== undefined) dataForDb.webSearchBaseUrl = body.webSearchBaseUrl;
            if (body.webSearchModel !== undefined) dataForDb.webSearchModel = body.webSearchModel;
            if (body.webSearchSystemPrompt !== undefined) dataForDb.webSearchSystemPrompt = body.webSearchSystemPrompt;
            if (body.timedTriggerEnabled !== undefined) dataForDb.timedTriggerEnabled = body.timedTriggerEnabled;
            if (body.timedTriggerInterval !== undefined) dataForDb.timedTriggerInterval = body.timedTriggerInterval;
            if (body.quantitativeTriggerEnabled !== undefined) dataForDb.quantitativeTriggerEnabled = body.quantitativeTriggerEnabled;
            if (body.quantitativeTriggerThreshold !== undefined) dataForDb.quantitativeTriggerThreshold = body.quantitativeTriggerThreshold;
            if (body.aiTriggerEnabled !== undefined) dataForDb.aiTriggerEnabled = body.aiTriggerEnabled;
            if (body.aiTriggerApiKey !== undefined) dataForDb.aiTriggerApiKey = body.aiTriggerApiKey;
            if (body.aiTriggerBaseUrl !== undefined) dataForDb.aiTriggerBaseUrl = body.aiTriggerBaseUrl;
            if (body.aiTriggerModel !== undefined) dataForDb.aiTriggerModel = body.aiTriggerModel;
            if (body.aiTriggerKeyword !== undefined) dataForDb.aiTriggerKeyword = body.aiTriggerKeyword;
            if (body.aiTriggerKeywordFuzzyMatch !== undefined) dataForDb.aiTriggerKeywordFuzzyMatch = body.aiTriggerKeywordFuzzyMatch; // 新增
            if (body.aiTriggerSystemPrompt !== undefined) dataForDb.aiTriggerSystemPrompt = body.aiTriggerSystemPrompt;
            if (body.aiTriggerUserPrompt !== undefined) dataForDb.aiTriggerUserPrompt = body.aiTriggerUserPrompt;

            if (body.content && !Array.isArray(body.content)) { // Additional check for content structure if provided
                 return reply.status(400).send({ error: '预设内容必须是数组 (如果提供)' });
            }

            const updatedPreset = await updateDisguisePreset(id, dataForDb);
            // +++ Update timed trigger for the updated disguise preset +++
            await updateOrRemoveTimedTriggerForPreset('disguise', updatedPreset.id, fastify);
            reply.send(updatedPreset);
        } catch (error: any) {
            request.log.error(`更新伪装预设 ${id} 时出错:`, error);
             if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
                reply.status(409).send({ error: '更新失败，已存在同名的伪装预设' });
            } else if (error.code === 'P2025') { // Record not found for update
                 reply.status(404).send({ error: '要更新的伪装预设未找到' });
            } else {
                reply.status(500).send({ error: '更新伪装预设失败' });
            }
        }
    });

    // DELETE /api/disguise-presets/:id - Delete a disguise preset
    fastify.delete('/presets/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) {
            return reply.status(400).send({ error: '无效的预设 ID' });
        }
        try {
            await deleteDisguisePreset(id);
            // +++ Remove timed trigger for the deleted disguise preset +++
            await updateOrRemoveTimedTriggerForPreset('disguise', id, fastify);
            reply.status(204).send(); // No content on successful delete
        } catch (error: any) {
            request.log.error(`删除伪装预设 ${id} 时出错:`, error);
             if (error.code === 'P2025') { // Record not found for delete
                 reply.status(404).send({ error: '要删除的伪装预设未找到' });
            } else {
                reply.status(500).send({ error: '删除伪装预设失败' });
            }
        }
    });

    // POST /api/disguise-presets/import - Import multiple disguise presets
    fastify.post('/presets/import', async (request: FastifyRequest<{ Body: ImportDisguisePresetsBody }>, reply: FastifyReply) => {
        // Type assertion might be needed if Fastify doesn't automatically infer from the generic
        const body = request.body as ImportDisguisePresetsBody;
        const presets = body?.presets; // Safely access presets

        if (!Array.isArray(presets)) {
            return reply.status(400).send({ error: '请求体必须包含一个 "presets" 数组' });
        }

        let successCount = 0;
        const errors: { name: string; reason: string }[] = [];

        for (const presetData of presets) {
            try {
                // Basic validation for each preset object (can be enhanced)
                if (!presetData.name || !presetData.content) {
                    errors.push({ name: presetData.name || '未知名称', reason: '缺少名称或内容字段' });
                    continue;
                }
                await createDisguisePreset(presetData);
                successCount++;
            } catch (error: any) {
                request.log.warn(`导入伪装预设 "${presetData.name || '未知名称'}" 时出错:`, error);
                let reason = '未知错误';
                if (error.code === 'P2002' && error.meta?.target?.includes('name')) {
                    reason = '名称已存在';
                } else if (error.message) {
                    reason = error.message;
                }
                errors.push({ name: presetData.name || '未知名称', reason });
            }
        }

        reply.send({
            message: `伪装预设导入完成。成功: ${successCount}, 失败: ${errors.length}`,
            successCount,
            errors
        });
    });


    // --- Disguise Assignments Routes ---

    // GET /api/disguise-assignments - Retrieve all disguise assignments
    fastify.get('/assignments', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const assignments = await getAllDisguiseAssignments();
            reply.send(assignments);
        } catch (error) {
            request.log.error('获取伪装分配列表时出错:', error);
            reply.status(500).send({ error: '获取伪装分配列表失败' });
        }
    });

    // PUT /api/disguise-assignments - Create or update a disguise assignment
    fastify.put('/assignments', async (request: FastifyRequest<{ Body: UpsertDisguiseAssignmentBody }>, reply: FastifyReply) => {
        // TODO: Add validation for request.body
        // Request body is now typed
        const { assignmentType, contextId, presetId } = request.body as UpsertDisguiseAssignmentBody; // Use type assertion

        if (!assignmentType || !presetId || !Object.values(AssignmentType).includes(assignmentType)) {
             return reply.status(400).send({ error: '请求体缺少必要字段或类型无效' });
        }
        if (assignmentType !== 'GLOBAL' && !contextId) {
             return reply.status(400).send({ error: '私聊或群聊分配必须提供 contextId' });
        }

        try {
            // presetId is already a number due to the interface UpsertDisguiseAssignmentBody
            if (typeof presetId !== 'number' || isNaN(presetId)) { // Add validation just in case
                 return reply.status(400).send({ error: '无效的 presetId' });
            }
            const result = await upsertDisguiseAssignment({
                assignmentType: assignmentType as AssignmentType,
                // Ensure contextId is explicitly null for GLOBAL, otherwise pass the validated string
                contextId: assignmentType === 'GLOBAL' ? null : contextId!,
                presetId: presetId // Use the number directly
            });
            reply.send(result);
        } catch (error: any) {
            request.log.error('创建/更新伪装分配时出错:', error);
             if (error.code === 'P2003') { // Foreign key constraint failed (presetId likely invalid)
                 reply.status(400).send({ error: '指定的伪装预设 ID 无效' });
             } else {
                reply.status(500).send({ error: '设置伪装分配失败' });
             }
        }
    });

    // DELETE /api/disguise-assignments - Delete a disguise assignment
    fastify.delete('/assignments', async (request: FastifyRequest<{ Body: DeleteDisguiseAssignmentBody }>, reply: FastifyReply) => {
         // TODO: Add validation for request.body
         // Request body is now typed
        const { assignmentType, contextId } = request.body as DeleteDisguiseAssignmentBody; // Use type assertion

         if (!assignmentType || !Object.values(AssignmentType).includes(assignmentType)) {
             return reply.status(400).send({ error: '请求体缺少 assignmentType 或类型无效' });
        }
         if (assignmentType !== 'GLOBAL' && contextId === undefined) { // contextId can be null for GLOBAL, but must exist (even if null) for non-GLOBAL delete via body
             return reply.status(400).send({ error: '删除私聊或群聊分配必须提供 contextId' });
        }

        try {
            await deleteDisguiseAssignment({
                assignmentType: assignmentType as AssignmentType,
                 // Ensure contextId is explicitly null for GLOBAL, otherwise pass the validated string
                contextId: assignmentType === 'GLOBAL' ? null : contextId!
            });
            reply.status(204).send();
        } catch (error: any) {
            request.log.error('删除伪装分配时出错:', error);
             if (error.code === 'P2025') { // Record to delete not found
                 reply.status(404).send({ error: '要删除的伪装分配未找到' });
            } else {
                reply.status(500).send({ error: '删除伪装分配失败' });
            }
        }
    });
}

export default disguiseRoutes;