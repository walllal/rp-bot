import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client'; // Import Prisma types
import { prisma } from '../db/prismaClient'; // Corrected import path
import { PresetContent, PresetItemSchema } from '../core/types'; // Import core types AND the Zod schema for validation
import { z } from 'zod'; // Import Zod
// Removed import of reinitializeOpenAIClient
import { updateOrRemoveTimedTriggerForPreset } from '../core/trigger-scheduler'; // +++ Import scheduler function
import { createPreset, updatePreset, CreatePresetData, UpdatePresetData } from '../db/presets'; // Import new DB functions/types

// Define request/reply types for better type safety
// This interface now includes the new preset-specific bot settings
interface PresetBody {
  name: string;
  mode?: string; // STANDARD 或 ADVANCED
  content: PresetContent;
  botName?: string | null;
  botNicknames?: string | null;
  advancedModeMessageDelay?: number;
  botFuzzyMatchEnabled?: boolean;
  allowImageInput?: boolean;
  allowVoiceOutput?: boolean; // 新增
  // 触发方式控制
  nameTriggered?: boolean;
  nicknameTriggered?: boolean;
  atTriggered?: boolean;
  replyTriggered?: boolean;
  // 新增的应用和模型设置
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

// Zod Schema for importing a single preset item
const ImportPresetItemSchema = z.object({
    name: z.string().min(1, '预设名称不能为空'),
    mode: z.enum(['STANDARD', 'ADVANCED']).optional().default('STANDARD'),
    content: z.array(PresetItemSchema), // Use the detailed schema for content validation
    // Add new optional fields for import
    botName: z.string().nullable().optional(),
    botNicknames: z.string().nullable().optional(),
    // Provide defaults matching the schema for createMany, as it doesn't use schema defaults
    advancedModeMessageDelay: z.number().int().optional().default(1000),
    botFuzzyMatchEnabled: z.boolean().optional().default(false),
    allowImageInput: z.boolean().optional().default(false),
    allowVoiceOutput: z.boolean().optional().default(false), // 新增
    // 触发方式控制
    nameTriggered: z.boolean().optional().default(true),
    nicknameTriggered: z.boolean().optional().default(true),
    atTriggered: z.boolean().optional().default(true),
    replyTriggered: z.boolean().optional().default(true),
    // 新增的应用和模型设置 for import
    chatHistoryLimit: z.number().int().positive().optional().default(10),
    messageHistoryLimit: z.number().int().positive().optional().default(10),
    openaiApiKey: z.string().nullable().optional(),
    openaiBaseUrl: z.string().url().nullable().optional(),
    openaiModel: z.string().optional().default('gpt-3.5-turbo'),
    // 联网设置
    allowWebSearch: z.boolean().optional().default(false),
    webSearchApiKey: z.string().nullable().optional(),
    webSearchBaseUrl: z.string().url().nullable().optional(),
    webSearchModel: z.string().optional().default('gemini-2.0-flash'),
    webSearchSystemPrompt: z.string().nullable().optional(), // 新增
    // 新增高级触发设置 for Zod schema
    timedTriggerEnabled: z.boolean().optional().default(false),
    timedTriggerInterval: z.number().int().min(10).max(1000).nullable().optional(), // Prisma schema default is not used by createMany
    quantitativeTriggerEnabled: z.boolean().optional().default(false),
    quantitativeTriggerThreshold: z.number().int().min(10).max(100).nullable().optional(),
    aiTriggerEnabled: z.boolean().optional().default(false),
    aiTriggerApiKey: z.string().nullable().optional(),
    aiTriggerBaseUrl: z.string().url().nullable().optional(),
    aiTriggerModel: z.string().nullable().optional().default('gpt-3.5-turbo'), // Prisma schema default is not used by createMany
    aiTriggerKeyword: z.string().nullable().optional(),
    aiTriggerKeywordFuzzyMatch: z.boolean().optional().default(false), // 新增 for Zod
    aiTriggerSystemPrompt: z.string().nullable().optional(),
    aiTriggerUserPrompt: z.string().nullable().optional(),
});

// TypeScript type inferred from the Zod schema
type ImportPresetItem = z.infer<typeof ImportPresetItemSchema>;

// Zod Schema for the entire import request body
const ImportPresetsBodySchema = z.object({
    presets: z.array(ImportPresetItemSchema)
});

// Type for the validated body after Zod parsing
type ValidatedImportPresetsBody = z.infer<typeof ImportPresetsBodySchema>;

// Interface for error responses with details
interface ErrorResponse {
    error: string;
    details?: { name: string; reason: string }[] | z.ZodIssue[]; // Allow Zod issues in details
}


// Explicitly type the function return as Promise<void>
async function presetRoutes(fastify: FastifyInstance, options: FastifyPluginOptions): Promise<void> {

  // --- GET /api/presets - 获取所有预设列表 ---
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const presets = await prisma.preset.findMany({
        select: { id: true, name: true, mode: true, createdAt: true, updatedAt: true }, // Include mode
        orderBy: { updatedAt: 'desc' },
      });
      return presets;
    } catch (error) {
      request.log.error('获取预设列表失败:', error);
      reply.status(500).send({ error: '获取预设列表失败' });
    }
  });

  // --- POST /api/presets - 创建新预设 ---
  fastify.post('/', async (request: FastifyRequest<{ Body: PresetBody }>, reply: FastifyReply) => {
    // Destructure all possible fields from the body
    const {
        name, content, mode,
        botName, botNicknames, advancedModeMessageDelay,
        botFuzzyMatchEnabled, allowImageInput, allowVoiceOutput, // 新增
        // 触发方式控制
        nameTriggered, nicknameTriggered, atTriggered, replyTriggered,
        // 新增的应用和模型设置
        chatHistoryLimit, messageHistoryLimit, openaiApiKey, openaiBaseUrl, openaiModel,
        // 联网设置
        allowWebSearch,
        webSearchApiKey,
        webSearchBaseUrl,
        webSearchModel,
        webSearchSystemPrompt, // 新增
        // 新增高级触发设置
        timedTriggerEnabled, timedTriggerInterval,
        quantitativeTriggerEnabled, quantitativeTriggerThreshold,
        aiTriggerEnabled, aiTriggerApiKey,
        aiTriggerBaseUrl, aiTriggerModel, aiTriggerKeyword, aiTriggerKeywordFuzzyMatch, // 新增
        aiTriggerSystemPrompt, aiTriggerUserPrompt
    } = request.body;

    // Basic validation
    if (!name || !Array.isArray(content)) {
        return reply.status(400).send({ error: '无效的请求体，需要 name 和 content (数组)' });
    }
    // Validate mode if provided
    if (mode && mode !== 'STANDARD' && mode !== 'ADVANCED') {
        return reply.status(400).send({ error: '无效的 mode，必须是 STANDARD 或 ADVANCED' });
    }
    // Validate advancedModeMessageDelay if provided
    if (advancedModeMessageDelay !== undefined && (typeof advancedModeMessageDelay !== 'number' || !Number.isInteger(advancedModeMessageDelay) || advancedModeMessageDelay < 0)) {
        return reply.status(400).send({ error: 'advancedModeMessageDelay 必须是非负整数' });
    }
    // Validate boolean types if provided
    if (botFuzzyMatchEnabled !== undefined && typeof botFuzzyMatchEnabled !== 'boolean') {
         return reply.status(400).send({ error: 'botFuzzyMatchEnabled 必须是布尔值' });
    }
     if (allowImageInput !== undefined && typeof allowImageInput !== 'boolean') {
         return reply.status(400).send({ error: 'allowImageInput 必须是布尔值' });
    }
    if (allowVoiceOutput !== undefined && typeof allowVoiceOutput !== 'boolean') { // 新增
        return reply.status(400).send({ error: 'allowVoiceOutput 必须是布尔值' });
    }
    // 新增字段验证
    if (chatHistoryLimit !== undefined && (typeof chatHistoryLimit !== 'number' || !Number.isInteger(chatHistoryLimit) || chatHistoryLimit <= 0)) {
        return reply.status(400).send({ error: 'chatHistoryLimit 必须是正整数' });
    }
    if (messageHistoryLimit !== undefined && (typeof messageHistoryLimit !== 'number' || !Number.isInteger(messageHistoryLimit) || messageHistoryLimit <= 0)) {
        return reply.status(400).send({ error: 'messageHistoryLimit 必须是正整数' });
    }
    if (openaiApiKey !== undefined && openaiApiKey !== null && typeof openaiApiKey !== 'string') { // Allow null
        return reply.status(400).send({ error: 'openaiApiKey 必须是字符串或null' });
    }
    if (openaiBaseUrl !== undefined && openaiBaseUrl !== null && (typeof openaiBaseUrl !== 'string' || (openaiBaseUrl && !openaiBaseUrl.startsWith('http')))) { // Allow null, check format if not null
        return reply.status(400).send({ error: 'openaiBaseUrl 必须是有效的 URL (以 http(s):// 开头) 或null' });
    }
    if (openaiModel !== undefined && typeof openaiModel !== 'string') {
        return reply.status(400).send({ error: 'openaiModel 必须是字符串' });
    }
    // 验证allowWebSearch
    if (allowWebSearch !== undefined && typeof allowWebSearch !== 'boolean') {
        return reply.status(400).send({ error: 'allowWebSearch 必须是布尔值' });
    }
    // 验证联网设置的独立字段
    if (webSearchApiKey !== undefined && webSearchApiKey !== null && typeof webSearchApiKey !== 'string') {
        return reply.status(400).send({ error: 'webSearchApiKey 必须是字符串或null' });
    }
    if (webSearchBaseUrl !== undefined && webSearchBaseUrl !== null && (typeof webSearchBaseUrl !== 'string' || (webSearchBaseUrl && !webSearchBaseUrl.startsWith('http')))) {
        return reply.status(400).send({ error: 'webSearchBaseUrl 必须是有效的 URL (以 http(s):// 开头) 或null' });
    }
    if (webSearchModel !== undefined && typeof webSearchModel !== 'string') {
        return reply.status(400).send({ error: 'webSearchModel 必须是字符串' });
    }
    if (webSearchSystemPrompt !== undefined && webSearchSystemPrompt !== null && typeof webSearchSystemPrompt !== 'string') { // 新增验证
        return reply.status(400).send({ error: 'webSearchSystemPrompt 必须是字符串或null' });
    }
    // 新增高级触发设置验证
    if (timedTriggerEnabled !== undefined && typeof timedTriggerEnabled !== 'boolean') {
        return reply.status(400).send({ error: 'timedTriggerEnabled 必须是布尔值' });
    }
    if (timedTriggerInterval !== undefined && timedTriggerInterval !== null && (typeof timedTriggerInterval !== 'number' || !Number.isInteger(timedTriggerInterval) || timedTriggerInterval < 10 || timedTriggerInterval > 1000)) {
        return reply.status(400).send({ error: 'timedTriggerInterval 必须是10-1000之间的整数或null' });
    }
    if (quantitativeTriggerEnabled !== undefined && typeof quantitativeTriggerEnabled !== 'boolean') {
        return reply.status(400).send({ error: 'quantitativeTriggerEnabled 必须是布尔值' });
    }
    if (quantitativeTriggerThreshold !== undefined && quantitativeTriggerThreshold !== null && (typeof quantitativeTriggerThreshold !== 'number' || !Number.isInteger(quantitativeTriggerThreshold) || quantitativeTriggerThreshold < 10 || quantitativeTriggerThreshold > 100)) {
        return reply.status(400).send({ error: 'quantitativeTriggerThreshold 必须是10-100之间的整数或null' });
    }
    if (aiTriggerEnabled !== undefined && typeof aiTriggerEnabled !== 'boolean') {
        return reply.status(400).send({ error: 'aiTriggerEnabled 必须是布尔值' });
    }
    // aiTriggerApiKey, aiTriggerBaseUrl, aiTriggerModel, aiTriggerKeyword, aiTriggerSystemPrompt, aiTriggerUserPrompt 都是可选字符串或null，基本类型检查已覆盖
    if (aiTriggerKeywordFuzzyMatch !== undefined && typeof aiTriggerKeywordFuzzyMatch !== 'boolean') { // 新增验证
        return reply.status(400).send({ error: 'aiTriggerKeywordFuzzyMatch 必须是布尔值' });
    }

    // Validate content structure using Zod
    try {
        z.array(PresetItemSchema).parse(content);
    } catch (error: unknown) { // Catch as unknown
         if (error instanceof z.ZodError) {
            request.log.warn('创建预设时内容验证失败:', error.errors);
            const errorPayload: ErrorResponse = { error: '预设内容格式无效', details: error.errors };
            return reply.status(400).send(errorPayload);
        }
        request.log.error('创建预设时内容验证发生未知错误:', error);
        return reply.status(500).send({ error: '预设内容验证失败' });
    }

    try {
      // Prepare data for the createPreset DB function
      const presetData: CreatePresetData = {
          name,
          content,
          mode, // Pass mode (will default to STANDARD in DB function if undefined)
          botName,
          botNicknames,
          advancedModeMessageDelay, // Pass value (will use schema default if undefined)
          botFuzzyMatchEnabled,     // Pass value (will use schema default if undefined)
          allowImageInput,           // Pass value (will use schema default if undefined)
          allowVoiceOutput,          // 新增, Pass value (will use schema default if undefined)
          // 触发方式控制
          nameTriggered,
          nicknameTriggered,
          atTriggered,
          replyTriggered,
          // 新增的应用和模型设置
          chatHistoryLimit,
          messageHistoryLimit,
          openaiApiKey,
          openaiBaseUrl,
          openaiModel,
          // 联网设置
          allowWebSearch,
          webSearchApiKey,
          webSearchBaseUrl,
          webSearchModel,
          webSearchSystemPrompt, // 新增
          // 新增高级触发设置
          timedTriggerEnabled,
          timedTriggerInterval,
          quantitativeTriggerEnabled,
          quantitativeTriggerThreshold,
          aiTriggerEnabled,
          aiTriggerApiKey,
          aiTriggerBaseUrl,
          aiTriggerModel,
          aiTriggerKeyword,
          aiTriggerKeywordFuzzyMatch, // 新增
          aiTriggerSystemPrompt,
          aiTriggerUserPrompt
      };
      const newPreset = await createPreset(presetData); // Use the DB function
      // +++ Schedule timed trigger for the new preset +++
      await updateOrRemoveTimedTriggerForPreset('preset', newPreset.id, fastify);
      reply.status(201).send(newPreset);
    } catch (error: unknown) {
      request.log.error('创建预设失败:', error);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        reply.status(409).send({ error: `预设名称 "${name}" 已存在` });
      } else {
        reply.status(500).send({ error: '创建预设失败' });
      }
    }
  });

  // --- GET /api/presets/:id - 获取单个预设详情 ---
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const presetId = parseInt(id, 10);
      if (isNaN(presetId)) {
          return reply.status(400).send({ error: '无效的预设 ID' });
      }

      try {
          const preset = await prisma.preset.findUnique({
              where: { id: presetId },
          });
          if (!preset) {
              return reply.status(404).send({ error: '找不到指定的预设' });
          }
          return preset;
      } catch (error: unknown) { // Catch as unknown
          request.log.error(`获取预设 ${presetId} 失败:`, error);
          reply.status(500).send({ error: '获取预设失败' });
      }
  });

  // --- PUT /api/presets/:id - 更新单个预设 ---
  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: PresetBody }>, reply: FastifyReply) => {
      const { id } = request.params;
      const presetId = parseInt(id, 10);
      if (isNaN(presetId)) {
          return reply.status(400).send({ error: '无效的预设 ID' });
      }

      // Destructure all possible fields
    const {
        name, content, mode,
        botName, botNicknames, advancedModeMessageDelay,
        botFuzzyMatchEnabled, allowImageInput, allowVoiceOutput, // 新增
        // 触发方式控制
        nameTriggered, nicknameTriggered, atTriggered, replyTriggered,
        // 新增的应用和模型设置
        chatHistoryLimit, messageHistoryLimit, openaiApiKey, openaiBaseUrl, openaiModel,
        // 联网设置
        allowWebSearch,
        webSearchApiKey,
        webSearchBaseUrl,
        webSearchModel,
        webSearchSystemPrompt, // 新增
        // 新增高级触发设置
        timedTriggerEnabled, timedTriggerInterval,
        quantitativeTriggerEnabled, quantitativeTriggerThreshold,
        aiTriggerEnabled, aiTriggerApiKey,
        aiTriggerBaseUrl, aiTriggerModel, aiTriggerKeyword, aiTriggerKeywordFuzzyMatch, // 新增
        aiTriggerSystemPrompt, aiTriggerUserPrompt
    } = request.body;

      // --- Validation ---
      // At least one field must be provided for update, but the DB function handles empty updates gracefully.
      // We only validate fields that ARE provided.
      // If 'name' is provided in the body, it must not be empty.
      if (request.body.hasOwnProperty('name') && !name) {
           return reply.status(400).send({ error: '预设名称不能为空' });
      }
      // If 'content' is provided in the body, it must be an array.
      if (request.body.hasOwnProperty('content') && !Array.isArray(content)) {
          return reply.status(400).send({ error: '预设内容必须是数组' });
      }
      if (mode !== undefined && mode !== 'STANDARD' && mode !== 'ADVANCED') {
          return reply.status(400).send({ error: '无效的 mode，必须是 STANDARD 或 ADVANCED' });
      }
      if (advancedModeMessageDelay !== undefined && (typeof advancedModeMessageDelay !== 'number' || !Number.isInteger(advancedModeMessageDelay) || advancedModeMessageDelay < 0)) {
          return reply.status(400).send({ error: 'advancedModeMessageDelay 必须是非负整数' });
      }
      if (botFuzzyMatchEnabled !== undefined && typeof botFuzzyMatchEnabled !== 'boolean') {
           return reply.status(400).send({ error: 'botFuzzyMatchEnabled 必须是布尔值' });
      }
      if (allowImageInput !== undefined && typeof allowImageInput !== 'boolean') {
           return reply.status(400).send({ error: 'allowImageInput 必须是布尔值' });
      }
      if (allowVoiceOutput !== undefined && typeof allowVoiceOutput !== 'boolean') { // 新增
          return reply.status(400).send({ error: 'allowVoiceOutput 必须是布尔值' });
      }
      // 新增字段验证
      if (chatHistoryLimit !== undefined && (typeof chatHistoryLimit !== 'number' || !Number.isInteger(chatHistoryLimit) || chatHistoryLimit <= 0)) {
          return reply.status(400).send({ error: 'chatHistoryLimit 必须是正整数' });
      }
      if (messageHistoryLimit !== undefined && (typeof messageHistoryLimit !== 'number' || !Number.isInteger(messageHistoryLimit) || messageHistoryLimit <= 0)) {
          return reply.status(400).send({ error: 'messageHistoryLimit 必须是正整数' });
      }
      if (openaiApiKey !== undefined && openaiApiKey !== null && typeof openaiApiKey !== 'string') { // Allow null
          return reply.status(400).send({ error: 'openaiApiKey 必须是字符串或null' });
      }
      if (openaiBaseUrl !== undefined && openaiBaseUrl !== null && (typeof openaiBaseUrl !== 'string' || (openaiBaseUrl && !openaiBaseUrl.startsWith('http')))) { // Allow null, check format if not null
          return reply.status(400).send({ error: 'openaiBaseUrl 必须是有效的 URL (以 http(s):// 开头) 或null' });
      }
      if (openaiModel !== undefined && typeof openaiModel !== 'string') {
          return reply.status(400).send({ error: 'openaiModel 必须是字符串' });
      }
      // 验证allowWebSearch
      if (allowWebSearch !== undefined && typeof allowWebSearch !== 'boolean') {
          return reply.status(400).send({ error: 'allowWebSearch 必须是布尔值' });
      }
      // 验证联网设置的独立字段
      if (webSearchApiKey !== undefined && webSearchApiKey !== null && typeof webSearchApiKey !== 'string') {
          return reply.status(400).send({ error: 'webSearchApiKey 必须是字符串或null' });
      }
      if (webSearchBaseUrl !== undefined && webSearchBaseUrl !== null && (typeof webSearchBaseUrl !== 'string' || (webSearchBaseUrl && !webSearchBaseUrl.startsWith('http')))) {
          return reply.status(400).send({ error: 'webSearchBaseUrl 必须是有效的 URL (以 http(s):// 开头) 或null' });
      }
      if (webSearchModel !== undefined && typeof webSearchModel !== 'string') {
          return reply.status(400).send({ error: 'webSearchModel 必须是字符串' });
      }
      if (webSearchSystemPrompt !== undefined && webSearchSystemPrompt !== null && typeof webSearchSystemPrompt !== 'string') { // 新增验证
          return reply.status(400).send({ error: 'webSearchSystemPrompt 必须是字符串或null' });
      }
      // 新增高级触发设置验证 (与创建时类似)
      if (timedTriggerEnabled !== undefined && typeof timedTriggerEnabled !== 'boolean') {
          return reply.status(400).send({ error: 'timedTriggerEnabled 必须是布尔值' });
      }
      if (timedTriggerInterval !== undefined && timedTriggerInterval !== null && (typeof timedTriggerInterval !== 'number' || !Number.isInteger(timedTriggerInterval) || timedTriggerInterval < 10 || timedTriggerInterval > 1000)) {
          return reply.status(400).send({ error: 'timedTriggerInterval 必须是10-1000之间的整数或null' });
      }
      if (quantitativeTriggerEnabled !== undefined && typeof quantitativeTriggerEnabled !== 'boolean') {
          return reply.status(400).send({ error: 'quantitativeTriggerEnabled 必须是布尔值' });
      }
      if (quantitativeTriggerThreshold !== undefined && quantitativeTriggerThreshold !== null && (typeof quantitativeTriggerThreshold !== 'number' || !Number.isInteger(quantitativeTriggerThreshold) || quantitativeTriggerThreshold < 10 || quantitativeTriggerThreshold > 100)) {
          return reply.status(400).send({ error: 'quantitativeTriggerThreshold 必须是10-100之间的整数或null' });
      }
      if (aiTriggerEnabled !== undefined && typeof aiTriggerEnabled !== 'boolean') {
          return reply.status(400).send({ error: 'aiTriggerEnabled 必须是布尔值' });
      }
      // aiTriggerApiKey, aiTriggerBaseUrl, aiTriggerModel, aiTriggerKeyword, aiTriggerSystemPrompt, aiTriggerUserPrompt 都是可选字符串或null
      if (aiTriggerKeywordFuzzyMatch !== undefined && typeof aiTriggerKeywordFuzzyMatch !== 'boolean') { // 新增验证
          return reply.status(400).send({ error: 'aiTriggerKeywordFuzzyMatch 必须是布尔值' });
      }
      
      // Validate content structure using Zod if content is provided
      try {
          if (content !== undefined) {
              z.array(PresetItemSchema).parse(content);
          }
      } catch (error: unknown) {
           if (error instanceof z.ZodError) {
              request.log.warn(`更新预设 ${presetId} 时内容验证失败:`, error.errors);
              const errorPayload: ErrorResponse = { error: '预设内容格式无效', details: error.errors };
              return reply.status(400).send(errorPayload);
          }
          request.log.error(`更新预设 ${presetId} 时内容验证发生未知错误:`, error);
          return reply.status(500).send({ error: '预设内容验证失败' });
      }

      try {
          // Prepare data for the updatePreset DB function
          // Only include fields that were actually passed in the request body
          const updateData: UpdatePresetData = {};
          if (name !== undefined) updateData.name = name;
          if (content !== undefined) updateData.content = content;
          if (mode !== undefined) updateData.mode = mode;
          if (botName !== undefined) updateData.botName = botName;
          if (botNicknames !== undefined) updateData.botNicknames = botNicknames;
          if (advancedModeMessageDelay !== undefined) updateData.advancedModeMessageDelay = advancedModeMessageDelay;
          if (botFuzzyMatchEnabled !== undefined) updateData.botFuzzyMatchEnabled = botFuzzyMatchEnabled;
          if (allowImageInput !== undefined) updateData.allowImageInput = allowImageInput;
          if (allowVoiceOutput !== undefined) updateData.allowVoiceOutput = allowVoiceOutput; // 新增
          // 触发方式控制
          if (nameTriggered !== undefined) updateData.nameTriggered = nameTriggered;
          if (nicknameTriggered !== undefined) updateData.nicknameTriggered = nicknameTriggered;
          if (atTriggered !== undefined) updateData.atTriggered = atTriggered;
          if (replyTriggered !== undefined) updateData.replyTriggered = replyTriggered;
          // 新增的应用和模型设置
          if (chatHistoryLimit !== undefined) updateData.chatHistoryLimit = chatHistoryLimit;
          if (messageHistoryLimit !== undefined) updateData.messageHistoryLimit = messageHistoryLimit;
          if (openaiApiKey !== undefined) updateData.openaiApiKey = openaiApiKey; // Will pass null if provided as null
          if (openaiBaseUrl !== undefined) updateData.openaiBaseUrl = openaiBaseUrl; // Will pass null if provided as null
          if (openaiModel !== undefined) updateData.openaiModel = openaiModel;
          // 联网设置
          if (allowWebSearch !== undefined) updateData.allowWebSearch = allowWebSearch;
          if (webSearchApiKey !== undefined) updateData.webSearchApiKey = webSearchApiKey;
          if (webSearchBaseUrl !== undefined) updateData.webSearchBaseUrl = webSearchBaseUrl;
          if (webSearchModel !== undefined) updateData.webSearchModel = webSearchModel;
          if (webSearchSystemPrompt !== undefined) updateData.webSearchSystemPrompt = webSearchSystemPrompt; // 新增
          // 新增高级触发设置
          if (timedTriggerEnabled !== undefined) updateData.timedTriggerEnabled = timedTriggerEnabled;
          if (timedTriggerInterval !== undefined) updateData.timedTriggerInterval = timedTriggerInterval; // handles null
          if (quantitativeTriggerEnabled !== undefined) updateData.quantitativeTriggerEnabled = quantitativeTriggerEnabled;
          if (quantitativeTriggerThreshold !== undefined) updateData.quantitativeTriggerThreshold = quantitativeTriggerThreshold; // handles null
          if (aiTriggerEnabled !== undefined) updateData.aiTriggerEnabled = aiTriggerEnabled;
          if (aiTriggerApiKey !== undefined) updateData.aiTriggerApiKey = aiTriggerApiKey; // handles null
          if (aiTriggerBaseUrl !== undefined) updateData.aiTriggerBaseUrl = aiTriggerBaseUrl; // handles null
          if (aiTriggerModel !== undefined) updateData.aiTriggerModel = aiTriggerModel; // handles null
          if (aiTriggerKeyword !== undefined) updateData.aiTriggerKeyword = aiTriggerKeyword; // handles null
          if (aiTriggerKeywordFuzzyMatch !== undefined) updateData.aiTriggerKeywordFuzzyMatch = aiTriggerKeywordFuzzyMatch; // 新增
          if (aiTriggerSystemPrompt !== undefined) updateData.aiTriggerSystemPrompt = aiTriggerSystemPrompt; // handles null
          if (aiTriggerUserPrompt !== undefined) updateData.aiTriggerUserPrompt = aiTriggerUserPrompt; // handles null
  
          const updatedPreset = await updatePreset(presetId, updateData); // Use the DB function

          // +++ Update timed trigger for the updated preset +++
          await updateOrRemoveTimedTriggerForPreset('preset', updatedPreset.id, fastify);
          // Removed logic to check for OpenAI settings changes and call reinitializeOpenAIClient

          return updatedPreset;
      } catch (error: unknown) {
          request.log.error(`更新预设 ${presetId} 失败:`, error);
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
              if (error.code === 'P2025') {
                  return reply.status(404).send({ error: '找不到要更新的预设' });
              } else if (error.code === 'P2002') {
                  return reply.status(409).send({ error: `预设名称 "${name}" 已存在` });
              }
          }
          reply.status(500).send({ error: '更新预设失败' });
      }
  });

  // --- DELETE /api/presets/:id - 删除单个预设 ---
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const presetId = parseInt(id, 10);
      if (isNaN(presetId)) {
          return reply.status(400).send({ error: '无效的预设 ID' });
      }

      try {
          await prisma.preset.delete({
              where: { id: presetId },
          });
          // +++ Remove timed trigger for the deleted preset +++
          await updateOrRemoveTimedTriggerForPreset('preset', presetId, fastify);
          reply.status(204).send();
      } catch (error: unknown) { // Catch as unknown
          request.log.error(`删除预设 ${presetId} 失败:`, error);
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
              return reply.status(404).send({ error: '找不到要删除的预设' });
          }
          reply.status(500).send({ error: '删除预设失败' });
      }
  });

  // --- POST /api/presets/import - 导入预设 ---
  fastify.post('/import', async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    let validatedBody: ValidatedImportPresetsBody;

    // Validate the entire request body using Zod
    try {
        validatedBody = ImportPresetsBodySchema.parse(request.body);
    } catch (error: unknown) { // Catch as unknown
        if (error instanceof z.ZodError) {
            request.log.warn('导入预设请求体验证失败:', error.errors);
            const errorPayload: ErrorResponse = { error: '导入数据格式无效', details: error.errors };
            return reply.status(400).send(errorPayload);
        }
        request.log.error('导入预设请求体验证时发生未知错误:', error);
        return reply.status(500).send({ error: '导入数据验证失败' });
    }

    const importedPresets = validatedBody.presets;

    if (importedPresets.length === 0) {
        return reply.status(400).send({ error: '导入的预设列表不能为空' });
    }

    const results = {
        successCount: 0,
        failedCount: 0,
        errors: [] as { name: string; reason: string }[],
    };

    // Prepare data for createMany, ensuring defaults for new fields are provided
    // as createMany doesn't use schema defaults.
    const presetsToCreate: Prisma.PresetCreateManyInput[] = importedPresets.map((preset: ImportPresetItem) => ({
        name: preset.name.trim(),
        mode: preset.mode, // mode has a default in Zod schema
        content: preset.content as any, // Prisma expects JsonValue
        // Provide values or rely on Zod defaults for new fields
        botName: preset.botName, // Can be null
        botNicknames: preset.botNicknames, // Can be null
        advancedModeMessageDelay: preset.advancedModeMessageDelay, // Has default in Zod
        botFuzzyMatchEnabled: preset.botFuzzyMatchEnabled, // Has default in Zod
        allowImageInput: preset.allowImageInput, // Has default in Zod
        allowVoiceOutput: preset.allowVoiceOutput, // 新增, Has default in Zod
        // 触发方式控制
        nameTriggered: preset.nameTriggered, // Has default in Zod
        nicknameTriggered: preset.nicknameTriggered, // Has default in Zod
        atTriggered: preset.atTriggered, // Has default in Zod
        replyTriggered: preset.replyTriggered, // Has default in Zod
        // 新增的应用和模型设置 for import
        chatHistoryLimit: preset.chatHistoryLimit, // Has default in Zod
        messageHistoryLimit: preset.messageHistoryLimit, // Has default in Zod
        openaiApiKey: preset.openaiApiKey, // Can be null
        openaiBaseUrl: preset.openaiBaseUrl, // Can be null
        openaiModel: preset.openaiModel, // Has default in Zod
        // 联网设置
        allowWebSearch: preset.allowWebSearch,
        webSearchApiKey: preset.webSearchApiKey,
        webSearchBaseUrl: preset.webSearchBaseUrl,
        webSearchModel: preset.webSearchModel,
        webSearchSystemPrompt: preset.webSearchSystemPrompt, // 新增
        // 新增高级触发设置 for import (rely on Zod defaults)
        timedTriggerEnabled: preset.timedTriggerEnabled,
        timedTriggerInterval: preset.timedTriggerInterval,
        quantitativeTriggerEnabled: preset.quantitativeTriggerEnabled,
        quantitativeTriggerThreshold: preset.quantitativeTriggerThreshold,
        aiTriggerEnabled: preset.aiTriggerEnabled,
        aiTriggerApiKey: preset.aiTriggerApiKey,
        aiTriggerBaseUrl: preset.aiTriggerBaseUrl,
        aiTriggerModel: preset.aiTriggerModel,
        aiTriggerKeyword: preset.aiTriggerKeyword,
        aiTriggerKeywordFuzzyMatch: preset.aiTriggerKeywordFuzzyMatch, // 新增
        aiTriggerSystemPrompt: preset.aiTriggerSystemPrompt,
        aiTriggerUserPrompt: preset.aiTriggerUserPrompt,
    }));

    try {
        let createResult;
        try {
            // Inner try specifically for createMany
            createResult = await prisma.preset.createMany({
                data: presetsToCreate,
                // skipDuplicates: false, // Keep removed
            });
        } catch (innerError: unknown) {
            // Catch errors specifically from createMany
            request.log.error('导入预设时 prisma.createMany 失败:', innerError);
            if (innerError instanceof Prisma.PrismaClientKnownRequestError && innerError.code === 'P2002') {
                // Handle P2002 specifically
                results.failedCount = importedPresets.length;
                results.successCount = 0;
                results.errors.push({ name: '多个预设之一', reason: '名称重复，导入操作已取消。请检查文件并确保预设名称唯一或与现有预设不冲突。' });
                const errorPayload: ErrorResponse = {
                    error: '导入失败：一个或多个预设名称与现有预设冲突。',
                    details: results.errors,
                };
                reply.status(409).send(errorPayload);
                return reply; // Return after sending P2002 error
            }
            // Re-throw other errors from createMany to be caught by the outer catch
            throw innerError;
        }

        // If createMany succeeded
        results.successCount = createResult.count;
        reply.status(200).send({
            message: `导入完成: ${results.successCount} 个成功。`,
        });

    } catch (error: unknown) { // Outer catch for validation errors or re-thrown errors
        // Log the error that reached here
        request.log.error('导入预设时发生最终错误:', error);

        // Send generic 500 error
        const errorMessage = error instanceof Error ? error.message : '未知数据库或处理错误';
        results.failedCount = importedPresets.length; // Assume all failed if we reach here
        results.successCount = 0;
        results.errors.push({ name: 'N/A', reason: `处理错误: ${errorMessage}` });

        reply.status(500).send({
            error: '导入预设时发生服务器内部错误'
        });
        // Let Fastify handle the end of the request implicitly
    }
  });

}

export default presetRoutes;
