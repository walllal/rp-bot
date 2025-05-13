import { DisguisePreset, DisguisePresetAssignment, AssignmentType, ContextType as DbContextType, Prisma } from '@prisma/client'; // Import Prisma namespace
import { prisma } from './prismaClient'; // Import the shared Prisma instance
import { PresetContent } from '../core/types'; // Assuming PresetContent type is reusable

// const prisma = new PrismaClient(); // Removed, using shared instance

// --- Disguise Preset Functions ---

/**
 * Retrieves all disguise presets.
 */
export async function getAllDisguisePresets(): Promise<DisguisePreset[]> {
    return prisma.disguisePreset.findMany({
        orderBy: { updatedAt: 'desc' }
    });
}

/**
 * Retrieves a single disguise preset by its ID.
 */
export async function getDisguisePresetById(id: number): Promise<DisguisePreset | null> {
    return prisma.disguisePreset.findUnique({
        where: { id }
    });
}

/**
 * Creates a new disguise preset.
 */
export interface CreateDisguisePresetData {
    name: string;
    mode?: string;
    content: PresetContent; // Use the shared type
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
    openaiMaxTokens?: number | null;
    openaiTemperature?: number | null;
    openaiFrequencyPenalty?: number | null;
    openaiPresencePenalty?: number | null;
    openaiTopP?: number | null;
    allowWebSearch?: boolean;
    webSearchApiKey?: string | null;
    webSearchBaseUrl?: string | null;
    webSearchModel?: string;
    webSearchOpenaiMaxTokens?: number | null;
    webSearchOpenaiTemperature?: number | null;
    webSearchOpenaiFrequencyPenalty?: number | null;
    webSearchOpenaiPresencePenalty?: number | null;
    webSearchOpenaiTopP?: number | null;
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
    aiTriggerOpenaiMaxTokens?: number | null;
    aiTriggerOpenaiTemperature?: number | null;
    aiTriggerOpenaiFrequencyPenalty?: number | null;
    aiTriggerOpenaiPresencePenalty?: number | null;
    aiTriggerOpenaiTopP?: number | null;
    aiTriggerKeyword?: string | null;
    aiTriggerKeywordFuzzyMatch?: boolean; // 新增
    aiTriggerSystemPrompt?: string | null;
    aiTriggerUserPrompt?: string | null;
}

export async function createDisguisePreset(data: CreateDisguisePresetData): Promise<DisguisePreset> {
    return prisma.disguisePreset.create({
        data: {
            name: data.name,
            mode: data.mode ?? 'STANDARD',
            content: data.content,
            botName: data.botName,
            botNicknames: data.botNicknames,
            advancedModeMessageDelay: data.advancedModeMessageDelay,
            botFuzzyMatchEnabled: data.botFuzzyMatchEnabled,
            allowImageInput: data.allowImageInput,
            allowVoiceOutput: data.allowVoiceOutput,
            nameTriggered: data.nameTriggered,
            nicknameTriggered: data.nicknameTriggered,
            atTriggered: data.atTriggered,
            replyTriggered: data.replyTriggered,
            chatHistoryLimit: data.chatHistoryLimit,
            messageHistoryLimit: data.messageHistoryLimit,
            openaiApiKey: data.openaiApiKey,
            openaiBaseUrl: data.openaiBaseUrl,
            openaiModel: data.openaiModel,
            openaiMaxTokens: data.openaiMaxTokens,
            openaiTemperature: data.openaiTemperature,
            openaiFrequencyPenalty: data.openaiFrequencyPenalty,
            openaiPresencePenalty: data.openaiPresencePenalty,
            openaiTopP: data.openaiTopP,
            allowWebSearch: data.allowWebSearch,
            webSearchApiKey: data.webSearchApiKey,
            webSearchBaseUrl: data.webSearchBaseUrl,
            webSearchModel: data.webSearchModel,
            webSearchOpenaiMaxTokens: data.webSearchOpenaiMaxTokens,
            webSearchOpenaiTemperature: data.webSearchOpenaiTemperature,
            webSearchOpenaiFrequencyPenalty: data.webSearchOpenaiFrequencyPenalty,
            webSearchOpenaiPresencePenalty: data.webSearchOpenaiPresencePenalty,
            webSearchOpenaiTopP: data.webSearchOpenaiTopP,
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
            aiTriggerOpenaiMaxTokens: data.aiTriggerOpenaiMaxTokens,
            aiTriggerOpenaiTemperature: data.aiTriggerOpenaiTemperature,
            aiTriggerOpenaiFrequencyPenalty: data.aiTriggerOpenaiFrequencyPenalty,
            aiTriggerOpenaiPresencePenalty: data.aiTriggerOpenaiPresencePenalty,
            aiTriggerOpenaiTopP: data.aiTriggerOpenaiTopP,
            aiTriggerKeyword: data.aiTriggerKeyword,
            aiTriggerKeywordFuzzyMatch: data.aiTriggerKeywordFuzzyMatch, // 新增
            aiTriggerSystemPrompt: data.aiTriggerSystemPrompt,
            aiTriggerUserPrompt: data.aiTriggerUserPrompt,
        }
    });
}

/**
 * Updates an existing disguise preset.
 */
export interface UpdateDisguisePresetData {
    name?: string;
    mode?: string;
    content?: PresetContent;
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
    openaiMaxTokens?: number | null;
    openaiTemperature?: number | null;
    openaiFrequencyPenalty?: number | null;
    openaiPresencePenalty?: number | null;
    openaiTopP?: number | null;
    allowWebSearch?: boolean;
    webSearchApiKey?: string | null;
    webSearchBaseUrl?: string | null;
    webSearchModel?: string;
    webSearchOpenaiMaxTokens?: number | null;
    webSearchOpenaiTemperature?: number | null;
    webSearchOpenaiFrequencyPenalty?: number | null;
    webSearchOpenaiPresencePenalty?: number | null;
    webSearchOpenaiTopP?: number | null;
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
    aiTriggerOpenaiMaxTokens?: number | null;
    aiTriggerOpenaiTemperature?: number | null;
    aiTriggerOpenaiFrequencyPenalty?: number | null;
    aiTriggerOpenaiPresencePenalty?: number | null;
    aiTriggerOpenaiTopP?: number | null;
    aiTriggerKeyword?: string | null;
    aiTriggerKeywordFuzzyMatch?: boolean; // 新增
    aiTriggerSystemPrompt?: string | null;
    aiTriggerUserPrompt?: string | null;
}

export async function updateDisguisePreset(id: number, data: UpdateDisguisePresetData): Promise<DisguisePreset> {
    const updateData: Prisma.DisguisePresetUpdateInput = {}; // Use Prisma generated type for safety

    // Explicitly map fields from data to updateData
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
    if (data.allowVoiceOutput !== undefined) updateData.allowVoiceOutput = data.allowVoiceOutput;
    if (data.nameTriggered !== undefined) updateData.nameTriggered = data.nameTriggered;
    if (data.nicknameTriggered !== undefined) updateData.nicknameTriggered = data.nicknameTriggered;
    if (data.atTriggered !== undefined) updateData.atTriggered = data.atTriggered;
    if (data.replyTriggered !== undefined) updateData.replyTriggered = data.replyTriggered;
    if (data.chatHistoryLimit !== undefined) updateData.chatHistoryLimit = data.chatHistoryLimit;
    if (data.messageHistoryLimit !== undefined) updateData.messageHistoryLimit = data.messageHistoryLimit;
    if (data.openaiApiKey !== undefined) updateData.openaiApiKey = data.openaiApiKey;
    if (data.openaiBaseUrl !== undefined) updateData.openaiBaseUrl = data.openaiBaseUrl;
    if (data.openaiModel !== undefined) updateData.openaiModel = data.openaiModel;
    if (data.openaiMaxTokens !== undefined) updateData.openaiMaxTokens = data.openaiMaxTokens;
    if (data.openaiTemperature !== undefined) updateData.openaiTemperature = data.openaiTemperature;
    if (data.openaiFrequencyPenalty !== undefined) updateData.openaiFrequencyPenalty = data.openaiFrequencyPenalty;
    if (data.openaiPresencePenalty !== undefined) updateData.openaiPresencePenalty = data.openaiPresencePenalty;
    if (data.openaiTopP !== undefined) updateData.openaiTopP = data.openaiTopP;
    if (data.allowWebSearch !== undefined) updateData.allowWebSearch = data.allowWebSearch;
    if (data.webSearchApiKey !== undefined) updateData.webSearchApiKey = data.webSearchApiKey;
    if (data.webSearchBaseUrl !== undefined) updateData.webSearchBaseUrl = data.webSearchBaseUrl;
    if (data.webSearchModel !== undefined) updateData.webSearchModel = data.webSearchModel;
    if (data.webSearchOpenaiMaxTokens !== undefined) updateData.webSearchOpenaiMaxTokens = data.webSearchOpenaiMaxTokens;
    if (data.webSearchOpenaiTemperature !== undefined) updateData.webSearchOpenaiTemperature = data.webSearchOpenaiTemperature;
    if (data.webSearchOpenaiFrequencyPenalty !== undefined) updateData.webSearchOpenaiFrequencyPenalty = data.webSearchOpenaiFrequencyPenalty;
    if (data.webSearchOpenaiPresencePenalty !== undefined) updateData.webSearchOpenaiPresencePenalty = data.webSearchOpenaiPresencePenalty;
    if (data.webSearchOpenaiTopP !== undefined) updateData.webSearchOpenaiTopP = data.webSearchOpenaiTopP;
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
    if (data.aiTriggerOpenaiMaxTokens !== undefined) updateData.aiTriggerOpenaiMaxTokens = data.aiTriggerOpenaiMaxTokens;
    if (data.aiTriggerOpenaiTemperature !== undefined) updateData.aiTriggerOpenaiTemperature = data.aiTriggerOpenaiTemperature;
    if (data.aiTriggerOpenaiFrequencyPenalty !== undefined) updateData.aiTriggerOpenaiFrequencyPenalty = data.aiTriggerOpenaiFrequencyPenalty;
    if (data.aiTriggerOpenaiPresencePenalty !== undefined) updateData.aiTriggerOpenaiPresencePenalty = data.aiTriggerOpenaiPresencePenalty;
    if (data.aiTriggerOpenaiTopP !== undefined) updateData.aiTriggerOpenaiTopP = data.aiTriggerOpenaiTopP;
    if (data.aiTriggerKeyword !== undefined) updateData.aiTriggerKeyword = data.aiTriggerKeyword;
    if (data.aiTriggerKeywordFuzzyMatch !== undefined) updateData.aiTriggerKeywordFuzzyMatch = data.aiTriggerKeywordFuzzyMatch; // 新增
    if (data.aiTriggerSystemPrompt !== undefined) updateData.aiTriggerSystemPrompt = data.aiTriggerSystemPrompt;
    if (data.aiTriggerUserPrompt !== undefined) updateData.aiTriggerUserPrompt = data.aiTriggerUserPrompt;
    
    // Validations for fields that were actually provided
    if (data.content !== undefined && !Array.isArray(data.content)) {
        throw new Error('预设内容必须是 JSON 数组');
    }
    if (data.mode !== undefined && data.mode !== 'STANDARD' && data.mode !== 'ADVANCED') {
        throw new Error('无效的预设模式，必须是 STANDARD 或 ADVANCED');
    }

    if (Object.keys(updateData).length === 0) {
        const currentPreset = await getDisguisePresetById(id);
        if (!currentPreset) throw new Error(`伪装预设 ID ${id} 未找到`);
        return currentPreset;
    }

    return prisma.disguisePreset.update({
        where: { id },
        data: updateData,
    });
}

/**
 * Deletes a disguise preset by its ID. Also deletes associated assignments due to onDelete: Cascade.
 */
export async function deleteDisguisePreset(id: number): Promise<DisguisePreset> {
    return prisma.disguisePreset.delete({
        where: { id }
    });
}

// --- Disguise Assignment Functions ---

/**
 * Retrieves all disguise preset assignments, including the related preset name.
 */
export async function getAllDisguiseAssignments(): Promise<(DisguisePresetAssignment & { preset: { name: string } | null })[]> {
    return prisma.disguisePresetAssignment.findMany({
        include: {
            preset: { // Include the related DisguisePreset
                select: { name: true } // Only select the name
            }
        },
        orderBy: [ // Order for better readability
            { assignmentType: 'asc' },
            { contextId: 'asc' }
        ]
    });
}

/**
 * Creates or updates a disguise preset assignment.
 */
export async function upsertDisguiseAssignment(data: {
    assignmentType: AssignmentType;
    contextId: string | null;
    presetId: number;
}): Promise<DisguisePresetAssignment> {
    if (data.assignmentType === AssignmentType.GLOBAL) {
        // Handle GLOBAL case: Find first, then update or create
        const existingAssignment = await prisma.disguisePresetAssignment.findFirst({
            where: {
                assignmentType: AssignmentType.GLOBAL,
                contextId: null
            }
        });

        if (existingAssignment) {
            // Update existing GLOBAL assignment
            return prisma.disguisePresetAssignment.update({
                where: { id: existingAssignment.id }, // Use the primary key 'id' for update
                data: { presetId: data.presetId }
            });
        } else {
            // Create new GLOBAL assignment
            return prisma.disguisePresetAssignment.create({
                data: {
                    assignmentType: AssignmentType.GLOBAL,
                    contextId: null,
                    presetId: data.presetId
                }
            });
        }
    } else {
        // Handle PRIVATE and GROUP cases where contextId is guaranteed to be a string
        if (!data.contextId) {
             // This should ideally be caught before calling the db function, but double-check
             throw new Error('ContextId cannot be null for PRIVATE or GROUP assignment types.');
        }
        return prisma.disguisePresetAssignment.upsert({
            where: {
                assignmentType_contextId: {
                    assignmentType: data.assignmentType,
                    contextId: data.contextId // contextId is string here
                }
            },
            update: {
                presetId: data.presetId
            },
            create: {
                assignmentType: data.assignmentType,
                contextId: data.contextId, // contextId is guaranteed string here
                presetId: data.presetId
            }
        });
    } // This closing brace was correctly added before
}

/**
 * Deletes a disguise preset assignment.
 */
export async function deleteDisguiseAssignment(data: {
    assignmentType: AssignmentType;
    contextId: string | null;
}): Promise<DisguisePresetAssignment | null> { // Return type might be null if not found
   if (data.assignmentType === AssignmentType.GLOBAL) {
       // Handle GLOBAL case: Use deleteMany as the combination is unique
       // deleteMany returns a count, not the deleted record.
       // If we need the deleted record, we'd findFirst then delete by id.
       // For simplicity, let's use deleteMany and adjust return type or logic.
       try {
            await prisma.disguisePresetAssignment.deleteMany({
                where: {
                    assignmentType: AssignmentType.GLOBAL,
                    contextId: null
                }
            });
            // Since deleteMany doesn't return the record, return null or a success indicator
            return null; // Or adjust function signature/caller expectation
       } catch (error) {
            console.error("Error deleting GLOBAL disguise assignment:", error);
            throw error; // Re-throw
       }

   } else {
        // Handle PRIVATE and GROUP cases where contextId is guaranteed to be a string
       if (!data.contextId) {
           throw new Error('ContextId cannot be null for PRIVATE or GROUP assignment types when deleting.');
       }
       return prisma.disguisePresetAssignment.delete({
           where: {
               assignmentType_contextId: {
                   assignmentType: data.assignmentType,
                   contextId: data.contextId // contextId is string here
               }
           }
       });
   }
}

/**
* 根据上下文类型和 ID 获取适用的伪装预设
* @param contextType 上下文类型 (PRIVATE or GROUP from Prisma Enum)
* @param contextId 上下文 ID (QQ or Group ID)，或者为 null 来获取全局伪装预设
* @returns 适用的伪装预设对象 (包含所有字段) 或 null
*/
export async function getApplicableDisguisePreset(
   contextType: DbContextType, // Use the imported DbContextType enum directly
   contextId: string | null
): Promise<DisguisePreset | null> {
    // Map the DbContextType to the AssignmentType needed for the query
    const assignmentTypeForQuery = contextType === DbContextType.PRIVATE ? AssignmentType.PRIVATE :
                                  contextType === DbContextType.GROUP ? AssignmentType.GROUP : null;

   try {
       let assignment: { presetId: number } | null = null;

       // 1. 如果 contextId 不为 null，尝试查找特定上下文的分配 (PRIVATE or GROUP)
       if (contextId !== null && assignmentTypeForQuery) { // Check if assignmentTypeForQuery is valid
           assignment = await prisma.disguisePresetAssignment.findUnique({
               where: {
                   assignmentType_contextId: { // Use the compound key
                       assignmentType: assignmentTypeForQuery,
                       contextId: contextId,
                   },
               },
               select: { presetId: true },
           });
       }

       // 2. 如果没有特定分配，尝试查找全局默认分配
       if (!assignment) {
           assignment = await prisma.disguisePresetAssignment.findFirst({
               where: {
                   assignmentType: AssignmentType.GLOBAL,
                   contextId: null // Explicitly check for null contextId
               },
                select: { presetId: true },
           });
       }

       // 3. 如果找到分配，获取对应的完整伪装预设对象
       if (assignment) {
           const preset = await prisma.disguisePreset.findUnique({
               where: { id: assignment.presetId },
           });
           if (!preset) {
                console.warn(`Disguise assignment found for ${contextType}:${contextId} (Preset ID: ${assignment.presetId}), but the disguise preset itself was not found.`);
                return null;
           }
           return preset;
       }

       // 4. 如果连全局默认都没有，返回 null
       return null;

   } catch (error) {
       console.error(`获取适用伪装预设失败 (${contextType}:${contextId}):`, error);
       return null;
   }
}

export async function getActiveContextsForDisguisePreset(disguisePresetId: number): Promise<{ contextType: DbContextType, contextId: string }[]> {
 try {
   const assignments = await prisma.disguisePresetAssignment.findMany({
     where: {
       presetId: disguisePresetId, // In DisguiseAssignment, the foreign key is presetId
       NOT: {
         assignmentType: AssignmentType.GLOBAL,
       },
       contextId: {
         not: null,
       }
     },
     select: {
       contextId: true,
       assignmentType: true, // Select assignmentType from the model
     },
   });
   // Map assignmentType to contextType for the return value.
   // Since we are filtering out GLOBAL, assignmentType here will be PRIVATE or GROUP.
   return assignments.map(a => ({
       contextType: a.assignmentType as DbContextType, // Map and cast
       contextId: a.contextId as string,
   }));
 } catch (error) {
   console.error(`Error fetching active contexts for disguise preset ${disguisePresetId}:`, error);
   return [];
 }
}