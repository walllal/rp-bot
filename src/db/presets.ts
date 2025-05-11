import { ContextType as DbContextTypePrisma, AssignmentType, Prisma, Preset, ContextType as DbContextType } from '@prisma/client'; // Import Prisma namespace for types
import { prisma } from './prismaClient'; // Import the shared Prisma instance
import { PresetContent } from '../core/types'; // Import PresetContent type

// Prisma instance is now imported from './prismaClient'
// const prisma = new PrismaClient(); // Removed

// --- Preset CRUD ---

/**
 * 获取所有预设的基本信息 (ID, 名称, 模式, 更新时间)
 */
export async function getAllPresetsBasic() {
    return prisma.preset.findMany({
        select: {
            id: true,
            name: true,
            mode: true, // Include mode
            updatedAt: true,
        },
        orderBy: {
            updatedAt: 'desc',
        },
    });
}

/**
 * 获取单个预设的完整内容
 * @param id 预设 ID
 */
export async function getPresetById(id: number) {
    return prisma.preset.findUnique({
        where: { id },
        // Prisma returns all scalar fields by default, including the new ones.
    });
}

// 定义创建预设时可以传入的数据接口 (包含新的 BOT 设置)
export interface CreatePresetData {
    name: string;
    content: PresetContent;
    mode?: string; // STANDARD 或 ADVANCED
    botName?: string | null;
    botNicknames?: string | null;
    advancedModeMessageDelay?: number;
    botFuzzyMatchEnabled?: boolean;
    allowImageInput?: boolean;
    allowVoiceOutput?: boolean; // 新增
    // 新增的四种触发方式控制
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

/**
 * 创建新预设
 */
export async function createPreset(data: CreatePresetData): Promise<Preset> {
    if (!Array.isArray(data.content)) {
        throw new Error('预设内容必须是 JSON 数组');
    }
    if (data.mode && data.mode !== 'STANDARD' && data.mode !== 'ADVANCED') {
        throw new Error('无效的预设模式，必须是 STANDARD 或 ADVANCED');
    }

    return prisma.preset.create({
        data: {
            name: data.name,
            mode: data.mode || 'STANDARD',
            content: data.content as unknown as Prisma.InputJsonValue,
            botName: data.botName, // Prisma handles null for optional String?
            botNicknames: data.botNicknames, // Prisma handles null for optional String?
            // For fields with @default in schema, Prisma uses them if undefined is passed
            advancedModeMessageDelay: data.advancedModeMessageDelay, // Will use schema default if undefined
            botFuzzyMatchEnabled: data.botFuzzyMatchEnabled,       // Will use schema default if undefined
            allowImageInput: data.allowImageInput,             // Will use schema default if undefined
            allowVoiceOutput: data.allowVoiceOutput,           // 新增, Will use schema default if undefined
            // 新增的四种触发方式控制
            nameTriggered: data.nameTriggered,
            nicknameTriggered: data.nicknameTriggered,
            atTriggered: data.atTriggered,
            replyTriggered: data.replyTriggered,
            // 新增的应用和模型设置 - Prisma 会使用 schema 的 @default (如果JS值为 undefined)
            chatHistoryLimit: data.chatHistoryLimit,
            messageHistoryLimit: data.messageHistoryLimit,
            openaiApiKey: data.openaiApiKey,
            openaiBaseUrl: data.openaiBaseUrl,
            openaiModel: data.openaiModel,
            // 联网设置
            allowWebSearch: data.allowWebSearch,
            webSearchApiKey: data.webSearchApiKey,
            webSearchBaseUrl: data.webSearchBaseUrl,
            webSearchModel: data.webSearchModel,
            webSearchSystemPrompt: data.webSearchSystemPrompt,
            // 新增高级触发设置
            timedTriggerEnabled: data.timedTriggerEnabled,
            timedTriggerInterval: data.timedTriggerInterval,
            quantitativeTriggerEnabled: data.quantitativeTriggerEnabled,
            quantitativeTriggerThreshold: data.quantitativeTriggerThreshold,
            aiTriggerEnabled: data.aiTriggerEnabled,
            aiTriggerApiKey: data.aiTriggerApiKey,
            aiTriggerBaseUrl: data.aiTriggerBaseUrl,
            aiTriggerModel: data.aiTriggerModel,
            aiTriggerKeyword: data.aiTriggerKeyword,
            aiTriggerKeywordFuzzyMatch: data.aiTriggerKeywordFuzzyMatch, // 新增
            aiTriggerSystemPrompt: data.aiTriggerSystemPrompt,
            aiTriggerUserPrompt: data.aiTriggerUserPrompt,
        },
    });
}

// 定义更新预设时可以传入的数据接口 (所有字段可选)
export interface UpdatePresetData {
    name?: string;
    content?: PresetContent;
    mode?: string;
    botName?: string | null;
    botNicknames?: string | null;
    advancedModeMessageDelay?: number;
    botFuzzyMatchEnabled?: boolean;
    allowImageInput?: boolean;
    allowVoiceOutput?: boolean; // 新增
    // 新增的四种触发方式控制
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

/**
 * 更新现有预设
 * @param id 预设 ID
 * @param data 要更新的字段
 */
export async function updatePreset(id: number, data: UpdatePresetData): Promise<Preset> {
    const updateData: Prisma.PresetUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.mode !== undefined) {
        if (data.mode !== 'STANDARD' && data.mode !== 'ADVANCED') {
            throw new Error('无效的预设模式，必须是 STANDARD 或 ADVANCED');
        }
        updateData.mode = data.mode;
    }
    if (data.content !== undefined) {
        if (!Array.isArray(data.content)) {
            throw new Error('预设内容必须是 JSON 数组');
        }
        updateData.content = data.content as unknown as Prisma.InputJsonValue;
    }
    if (data.botName !== undefined) updateData.botName = data.botName;
    if (data.botNicknames !== undefined) updateData.botNicknames = data.botNicknames;
    if (data.advancedModeMessageDelay !== undefined) updateData.advancedModeMessageDelay = data.advancedModeMessageDelay;
    if (data.botFuzzyMatchEnabled !== undefined) updateData.botFuzzyMatchEnabled = data.botFuzzyMatchEnabled;
    if (data.allowImageInput !== undefined) updateData.allowImageInput = data.allowImageInput;
    if (data.allowVoiceOutput !== undefined) updateData.allowVoiceOutput = data.allowVoiceOutput; // 新增
    // 新增的四种触发方式控制
    if (data.nameTriggered !== undefined) updateData.nameTriggered = data.nameTriggered;
    if (data.nicknameTriggered !== undefined) updateData.nicknameTriggered = data.nicknameTriggered;
    if (data.atTriggered !== undefined) updateData.atTriggered = data.atTriggered;
    if (data.replyTriggered !== undefined) updateData.replyTriggered = data.replyTriggered;
    // 新增的应用和模型设置
    if (data.chatHistoryLimit !== undefined) updateData.chatHistoryLimit = data.chatHistoryLimit;
    if (data.messageHistoryLimit !== undefined) updateData.messageHistoryLimit = data.messageHistoryLimit;
    if (data.openaiApiKey !== undefined) updateData.openaiApiKey = data.openaiApiKey;
    if (data.openaiBaseUrl !== undefined) updateData.openaiBaseUrl = data.openaiBaseUrl;
    if (data.openaiModel !== undefined) updateData.openaiModel = data.openaiModel;
    // 联网设置
    if (data.allowWebSearch !== undefined) updateData.allowWebSearch = data.allowWebSearch;
    if (data.webSearchApiKey !== undefined) updateData.webSearchApiKey = data.webSearchApiKey;
    if (data.webSearchBaseUrl !== undefined) updateData.webSearchBaseUrl = data.webSearchBaseUrl;
    if (data.webSearchModel !== undefined) updateData.webSearchModel = data.webSearchModel;
    if (data.webSearchSystemPrompt !== undefined) updateData.webSearchSystemPrompt = data.webSearchSystemPrompt;
    // 新增高级触发设置
    if (data.timedTriggerEnabled !== undefined) updateData.timedTriggerEnabled = data.timedTriggerEnabled;
    if (data.timedTriggerInterval !== undefined) updateData.timedTriggerInterval = data.timedTriggerInterval;
    if (data.quantitativeTriggerEnabled !== undefined) updateData.quantitativeTriggerEnabled = data.quantitativeTriggerEnabled;
    if (data.quantitativeTriggerThreshold !== undefined) updateData.quantitativeTriggerThreshold = data.quantitativeTriggerThreshold;
    if (data.aiTriggerEnabled !== undefined) updateData.aiTriggerEnabled = data.aiTriggerEnabled;
    if (data.aiTriggerApiKey !== undefined) updateData.aiTriggerApiKey = data.aiTriggerApiKey;
    if (data.aiTriggerBaseUrl !== undefined) updateData.aiTriggerBaseUrl = data.aiTriggerBaseUrl;
    if (data.aiTriggerModel !== undefined) updateData.aiTriggerModel = data.aiTriggerModel;
    if (data.aiTriggerKeyword !== undefined) updateData.aiTriggerKeyword = data.aiTriggerKeyword;
    if (data.aiTriggerKeywordFuzzyMatch !== undefined) updateData.aiTriggerKeywordFuzzyMatch = data.aiTriggerKeywordFuzzyMatch; // 新增
    if (data.aiTriggerSystemPrompt !== undefined) updateData.aiTriggerSystemPrompt = data.aiTriggerSystemPrompt;
    if (data.aiTriggerUserPrompt !== undefined) updateData.aiTriggerUserPrompt = data.aiTriggerUserPrompt;

    if (Object.keys(updateData).length === 0) {
        // 如果没有提供任何要更新的字段，可以选择直接返回当前预设或抛出错误
        const currentPreset = await getPresetById(id);
        if (!currentPreset) throw new Error(`预设 ID ${id} 未找到`);
        return currentPreset;
    }

    return prisma.preset.update({
        where: { id },
        data: updateData,
    });
}

/**
 * 删除预设 (同时删除相关分配)
 * @param id 预设 ID
 */
export async function deletePreset(id: number) {
    // Use a transaction to ensure both deletions succeed or fail together
    return prisma.$transaction([
        // Delete assignments first due to foreign key constraint
        prisma.presetAssignment.deleteMany({
            where: { presetId: id },
        }),
        // Then delete the preset
        prisma.preset.delete({
            where: { id },
        }),
    ]);
}

// --- Preset Assignment CRUD ---

/**
 * 获取所有预设分配，并包含关联的预设名称
 */
export async function getAllAssignments() {
    return prisma.presetAssignment.findMany({
        include: {
            preset: { // Include related preset data
                select: { name: true } // Only select the name
            }
        },
        orderBy: [ // Order for better readability
            { assignmentType: 'asc' },
            { contextId: 'asc' } // Nulls might be first or last depending on DB
        ]
    });
}

/**
 * 更新或创建预设分配
 * @param assignmentType 分配类型 (GLOBAL, PRIVATE, GROUP)
 * @param contextId 上下文 ID (私聊或群聊时需要, GLOBAL 时为 null)
 * @param presetId 关联的预设 ID
 */
export async function upsertAssignment(assignmentType: AssignmentType, contextId: string | null, presetId: number) {
    if (assignmentType === AssignmentType.GLOBAL) {
        // Handle GLOBAL case (contextId must be null)
        if (contextId !== null) {
            throw new Error(`Context ID must be null for assignment type GLOBAL`);
        }
        // Use findFirst + update/create for GLOBAL to avoid upsert issues with null in unique key
        const existingGlobal = await prisma.presetAssignment.findFirst({
            where: {
                assignmentType: AssignmentType.GLOBAL,
                contextId: null
            }
        });

        if (existingGlobal) {
            // Update existing GLOBAL assignment
            return prisma.presetAssignment.update({
                where: { id: existingGlobal.id }, // Update by primary key 'id'
                data: { presetId },
            });
        } else {
            // Create new GLOBAL assignment
            return prisma.presetAssignment.create({
                data: { assignmentType: AssignmentType.GLOBAL, contextId: null, presetId },
            });
        }
    } else if (contextId !== null && (assignmentType === AssignmentType.PRIVATE || assignmentType === AssignmentType.GROUP)) {
        // Handle PRIVATE/GROUP case (contextId must not be null)
        const whereClause: Prisma.PresetAssignmentWhereUniqueInput = {
            assignmentType_contextId: {
                assignmentType,
                contextId: contextId
            }
        };
        return prisma.presetAssignment.upsert({
            where: whereClause,
            update: { presetId },
            // Assert contextId as non-null in create, as we've checked it
            create: { assignmentType, contextId: contextId!, presetId },
        });
    } else {
        // Invalid combination
        throw new Error(`Invalid combination of assignmentType (${assignmentType}) and contextId (${contextId})`);
    }
}

/**
 * 删除预设分配
 * @param assignmentType 分配类型
 * @param contextId 上下文 ID (如果不是 GLOBAL, 则为 string, GLOBAL 时为 null)
 */
export async function deleteAssignment(assignmentType: AssignmentType, contextId: string | null) {
     // Construct the where clause based on the logical condition
     const whereClause: Prisma.PresetAssignmentWhereInput = {
         assignmentType,
         contextId // Match null for GLOBAL or the specific ID for PRIVATE/GROUP
     };

    // Use deleteMany based on the logical condition
    return prisma.presetAssignment.deleteMany({
        where: whereClause,
    });
}


// --- Preset Application Logic ---

/**
 * 根据上下文类型和 ID 获取适用的预设内容
 * @param contextType 上下文类型 (PRIVATE or GROUP from Prisma Enum)
 * @param contextId 上下文 ID (QQ or Group ID)，或者为 null 来获取全局预设
 * @returns 适用的预设对象 (包含所有字段) 或 null
 */
export async function getApplicablePreset(contextType: DbContextTypePrisma, contextId: string | null): Promise<Preset | null> {
    try {
        let assignment: { presetId: number } | null = null;

        // 1. 如果 contextId 不为 null，尝试查找特定上下文的分配 (PRIVATE or GROUP)
        if (contextId !== null && (contextType === DbContextTypePrisma.PRIVATE || contextType === DbContextTypePrisma.GROUP)) {
            const specificAssignmentType = contextType === DbContextTypePrisma.PRIVATE ? AssignmentType.PRIVATE : AssignmentType.GROUP;
            assignment = await prisma.presetAssignment.findUnique({
                where: {
                    assignmentType_contextId: { // Use the compound key
                        assignmentType: specificAssignmentType,
                        contextId: contextId, // contextId is guaranteed non-null here
                    },
                },
                select: { presetId: true },
            });
        }

        // 2. 如果没有特定分配，尝试查找全局默认分配
        if (!assignment) {
             // Use findFirst for GLOBAL check with explicit null contextId
            assignment = await prisma.presetAssignment.findFirst({
                where: {
                    assignmentType: AssignmentType.GLOBAL,
                    contextId: null // Explicitly check for null contextId
                },
                 select: { presetId: true },
            });
        }

        // 3. 如果找到分配，获取对应的完整预设对象
        if (assignment) {
            // Prisma returns all scalar fields by default, including the new BOT setting fields.
            const preset = await prisma.preset.findUnique({
                where: { id: assignment.presetId },
            });
            if (!preset) {
                 console.warn(`Assignment found for ${contextType}:${contextId} (Preset ID: ${assignment.presetId}), but the preset itself was not found.`);
                 return null;
            }
            return preset;
        }

        // 4. 如果连全局默认都没有，返回 null
        return null;

    } catch (error) {
        console.error(`获取适用预设失败 (${contextType}:${contextId}):`, error);
        return null;
    }
}

// Placeholder for seeding default presets if needed in the future
export async function seedDefaultPresets(): Promise<void> {
    console.log('检查并初始化默认预设...');
    // Example: Check if a default preset exists, if not, create one
    const defaultPresetName = '默认角色扮演预设';
    const existing = await prisma.preset.findFirst({ where: { name: defaultPresetName } });

    if (!existing) {
        // Add 'enabled: true' to each item to match the updated PresetContent type
        const defaultContent: PresetContent = [
            { role: "system", content: "你是一个友好的助手。", enabled: true },
            // Placeholder for chat history, adjust maxLength as needed
            { is_variable_placeholder: true, variable_name: "chat_history", config: { maxLength: 10 }, enabled: true },
            // Placeholder for the current user input
            { is_variable_placeholder: true, variable_name: "user_input", enabled: true }
        ];
        // Use try-catch for robustness during seeding
        try {
            // Construct the data object for createPreset
            const presetDataToSeed: CreatePresetData = {
                name: defaultPresetName,
                content: defaultContent,
                mode: 'STANDARD', // Explicitly set mode, or rely on function default
                // The new BOT settings will use their @default values from the schema
                // or be null if not specified and optional (like botName, botNicknames)
            };
            const createdPreset = await createPreset(presetDataToSeed);
            console.log(`默认预设 "${defaultPresetName}" 已创建 (ID: ${createdPreset.id})。`);

            // Assign this default preset globally
            await upsertAssignment(AssignmentType.GLOBAL, null, createdPreset.id);
            console.log(`默认预设已全局分配。`);

        } catch (error) {
             console.error(`创建或分配默认预设时出错:`, error);
        }

    } else {
        console.log('默认预设已存在，无需初始化。');
    }
}

// Remove the duplicate DbContextType definition
// type DbContextType = 'PRIVATE' | 'GROUP';

export async function getActiveContextsForPreset(presetId: number): Promise<{ contextType: DbContextType, contextId: string }[]> {
  // +++ ADDED LOGGING HERE +++
  console.log(`[DB Presets] getActiveContextsForPreset called with presetId: ${presetId}`);
  try {
    const assignments = await prisma.presetAssignment.findMany({
      where: {
        presetId: presetId,
        // We are fetching all assignments for this preset.
        // The trigger scheduler will then decide if the context is "active"
        // based on its own logic or if the assignment implies activity.
        // We also filter out GLOBAL assignments as they don't have a specific contextId for this purpose.
        NOT: {
          assignmentType: AssignmentType.GLOBAL, // Corrected: Use AssignmentType.GLOBAL
        },
        contextId: {
          not: null, // Ensure contextId is not null for PRIVATE/GROUP
        }
      },
      select: {
        contextId: true,
        assignmentType: true, // Corrected: Select assignmentType from the model
      },
    });
    // +++ ADDED LOGGING HERE +++
    console.log(`[DB Presets] Assignments found for presetId ${presetId}:`, JSON.stringify(assignments, null, 2));

    // contextId should be string for non-GLOBAL, and we've filtered out nulls.
    // Map assignmentType to contextType for the return value.
    // Note: Prisma's AssignmentType ('PRIVATE', 'GROUP', 'GLOBAL') needs to be mapped to DbContextType ('PRIVATE', 'GROUP')
    // Since we are filtering out GLOBAL, assignmentType here will be PRIVATE or GROUP.
    if (assignments.length === 0) {
      console.info(`[DB Presets] No specific (non-GLOBAL, with contextId) assignments found for presetId: ${presetId}. This preset might be globally assigned or not assigned to any specific chat/group for timed triggers.`);
    }
    return assignments.map(a => ({
        contextType: a.assignmentType as DbContextType, // Map and cast
        contextId: a.contextId as string,
    }));
  } catch (error) {
    console.error(`Error fetching active contexts for preset ${presetId}:`, error);
    return [];
  }
}
