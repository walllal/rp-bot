import { Preset, DisguisePreset } from '@prisma/client';
import { prisma } from '../db/prismaClient';
import { FastifyInstance } from 'fastify';
import { callOpenAI } from './openai-client';
import { OpenAIMessage, VariableContext } from './types'; // +++ Import VariableContext
import { substituteVariables } from './preset-processor'; // +++ Import substituteVariables
import { getActiveContextsForPreset } from '../db/presets'; // +++ New Import
import { getActiveContextsForDisguisePreset } from '../db/disguise'; // +++ New Import
import { ContextType as DbContextType } from '@prisma/client'; // +++ New Import for DbContextType
import { processAndExecuteMainAi } from './main-ai-processor'; // +++ Import main AI processor
import { getBotInstance, getBotConfig, sendOneBotAction } from '../onebot/connection'; // +++ Import OneBot helpers, including sendOneBotAction

// Store for active timers: presetType_presetId -> NodeJS.Timeout
const activeTimers: Record<string, NodeJS.Timeout> = {};
function log(level: 'info' | 'warn' | 'error' | 'debug' | 'trace', message: string, serverInstance?: FastifyInstance, data?: any) {
    const logger = serverInstance?.log || console; // Use server logger if available, else console
    const logPayload: any = { context: 'TriggerScheduler' };
    if (data) logPayload.data = data;

    // Check if the logger has the specified level method
    if (typeof (logger as any)[level] === 'function') {
        if (data) {
            (logger as any)[level](logPayload, message);
        } else {
            (logger as any)[level]({ context: 'TriggerScheduler' }, message);
        }
    } else { // Fallback for basic console
        console[level as 'log' | 'warn' | 'error'](`[TriggerScheduler] ${level.toUpperCase()}: ${message}`, data || '');
    }
}

// New function to execute Sub-AI for a specific context
async function executeSubAiForSpecificContext(
    configType: 'preset' | 'disguise',
    config: Preset | DisguisePreset,
    contextType: DbContextType,
    contextId: string,
    serverInstance: FastifyInstance
) {
    log('info', `Executing Sub-AI for ${configType} '${config.name}' (ID: ${config.id}) in context ${contextType}:${contextId}`, serverInstance);

    // If timedTriggerEnabled is true (which it must be to reach here via scheduleTimedTrigger),
    // we should attempt to use the Sub-AI if its core parameters are set.
    // The separate aiTriggerEnabled flag is considered redundant for this flow.
    if (!config.aiTriggerApiKey || !config.aiTriggerModel || !config.aiTriggerKeyword) {
        log('debug', `Sub-AI trigger parameters (API Key, Model, or Keyword) not fully configured for ${configType} '${config.name}' in context ${contextType}:${contextId}. Skipping.`, serverInstance);
        return;
    }

    // User Prompt Check: If empty, skip Sub-AI
    const rawUserPrompt = config.aiTriggerUserPrompt; // Get user prompt directly
    if (!rawUserPrompt || rawUserPrompt.trim() === "") {
        log('debug', `Sub-AI user prompt for ${configType} '${config.name}' in context ${contextType}:${contextId} is empty. Skipping Sub-AI.`, serverInstance);
        return;
    }

    // System Prompt: Get it, but don't apply a default here. It will be conditionally added later.
    const rawSystemPrompt = config.aiTriggerSystemPrompt;

    const variableContextForSubAI: VariableContext = {
        timestamp: new Date(),
        botId: getBotConfig()?.selfId || undefined, // Use getBotConfig
        botName: config.botName || undefined,
        userId: contextType === DbContextType.PRIVATE ? contextId : undefined,
        groupId: contextType === DbContextType.GROUP ? contextId : undefined,
        isPrivateChat: contextType === DbContextType.PRIVATE ? 'yes' : 'no',
        isGroupChat: contextType === DbContextType.GROUP ? 'yes' : 'no',
        // No explicit context_id or context_type needed here as they are covered by userId/groupId and isPrivateChat/isGroupChat
    };

    const subAiPresetLimits = {
        // Use the main config's chatHistoryLimit and messageHistoryLimit for the Sub-AI's default limits
        // when processing {{chat_history}} or {{message_history}} variables in its prompts.
        // Parameterized versions like {{chat_history::N}} will override these.
        chatHistoryLimit: config.chatHistoryLimit, // Use main preset's chat history limit
        messageHistoryLimit: config.messageHistoryLimit // Use main preset's message history limit
    };

    try {
        // Process user prompt (we've already confirmed rawUserPrompt is not empty)
        const processedUserPrompt = await substituteVariables(rawUserPrompt, variableContextForSubAI, subAiPresetLimits);
        
        const messagesForSubAI: OpenAIMessage[] = [];

        // Conditionally add system prompt if it exists and is not empty after processing
        if (rawSystemPrompt && rawSystemPrompt.trim() !== "") {
            const processedSystemPrompt = await substituteVariables(rawSystemPrompt, variableContextForSubAI, subAiPresetLimits);
            if (processedSystemPrompt && processedSystemPrompt.trim() !== "") {
                messagesForSubAI.push({ role: 'system', content: processedSystemPrompt });
            }
        }
        
        messagesForSubAI.push({ role: 'user', content: processedUserPrompt });

        log('debug', `Calling Sub-AI for ${configType} '${config.name}' in context ${contextType}:${contextId}. Model: ${config.aiTriggerModel}`, serverInstance, {
            processedMessages: messagesForSubAI
        });

        const subAiResponseObj = await callOpenAI(
            messagesForSubAI,
            {
                apiKey: config.aiTriggerApiKey,
                baseURL: config.aiTriggerBaseUrl,
                modelName: config.aiTriggerModel,
                allowWebSearch: false,
            },
            serverInstance.log
        );
        const subAiResponseContent = (subAiResponseObj && typeof subAiResponseObj === 'object' && 'content' in subAiResponseObj)
            ? (subAiResponseObj.content || "").trim()
            : (subAiResponseObj as string | null || "").trim();

        log('info', `Sub-AI response for ${configType} '${config.name}' in context ${contextType}:${contextId}: "${subAiResponseContent}" (Keyword: "${config.aiTriggerKeyword}", FuzzyMatch: ${config.aiTriggerKeywordFuzzyMatch})`, serverInstance);

        let mainAiShouldBeTriggered = false;
        if (config.aiTriggerKeywordFuzzyMatch) {
            // Fuzzy match: check if the response INCLUDES the keyword
            if (config.aiTriggerKeyword && subAiResponseContent.includes(config.aiTriggerKeyword)) {
                mainAiShouldBeTriggered = true;
            }
        } else {
            // Exact match: check if the response IS EQUAL to the keyword
            if (subAiResponseContent === config.aiTriggerKeyword) {
                mainAiShouldBeTriggered = true;
            }
        }

        if (mainAiShouldBeTriggered) {
            const matchType = config.aiTriggerKeywordFuzzyMatch ? "Fuzzy matched" : "Exactly matched";
            log('info', `Sub-AI for ${configType} '${config.name}' in context ${contextType}:${contextId} indicates MAIN AI trigger. (Keyword ${matchType})`, serverInstance);
            
            // Define the "input" for the main AI.
            // This could be the sub-AI's response, or a predefined message, or a template from config.
            // For now, let's use a generic trigger message, as `mainAiTimedTriggerPrompt` is not in the schema.
            const mainAiTriggerMessage = `定时任务触发：预设“${config.name}”在上下文 ${contextType}:${contextId} 中需要主AI处理。`;

            const mainAiReply = await processAndExecuteMainAi(
                config,
                contextType,
                contextId,
                mainAiTriggerMessage,
                serverInstance
            );

            if (mainAiReply) {
                // const bot = getBotInstance(); // getBotInstance returns WebSocket, not the action helper
                // We need to use sendOneBotAction
                try {
                    if (contextType === DbContextType.GROUP) {
                        await sendOneBotAction({
                            action: 'send_group_msg',
                            params: {
                                group_id: parseInt(contextId, 10),
                                message: mainAiReply,
                            },
                        });
                        log('info', `Sent Main AI reply to group ${contextId}`, serverInstance);
                    } else if (contextType === DbContextType.PRIVATE) {
                        await sendOneBotAction({
                            action: 'send_private_msg',
                            params: {
                                user_id: parseInt(contextId, 10),
                                message: mainAiReply,
                            },
                        });
                        log('info', `Sent Main AI reply to private chat ${contextId}`, serverInstance);
                    }
                } catch (sendError: any) {
                    log('error', `Failed to send Main AI reply via sendOneBotAction to ${contextType}:${contextId}: ${sendError.message || sendError}`, serverInstance, sendError);
                }
            } else {
                log('info', `Main AI for ${configType} '${config.name}' in context ${contextType}:${contextId} did not produce a reply.`, serverInstance);
            }

        } else {
            log('info', `Sub-AI for ${configType} '${config.name}' in context ${contextType}:${contextId} did NOT indicate main AI trigger.`, serverInstance);
        }

    } catch (error: any) {
        log('error', `Error executing Sub-AI for ${configType} '${config.name}' in context ${contextType}:${contextId}: ${error.message}`, serverInstance, error);
    }
}


export function scheduleTimedTrigger(
    config: Preset | DisguisePreset,
    configType: 'preset' | 'disguise',
    serverInstance: FastifyInstance
) {
    const timerId = `${configType}_${config.id}`;

    if (activeTimers[timerId]) {
        clearTimeout(activeTimers[timerId]);
        delete activeTimers[timerId];
        log('debug', `Cleared existing timed trigger for ${timerId}`, serverInstance);
    }

    if (config.timedTriggerEnabled && config.timedTriggerInterval && config.timedTriggerInterval > 0) {
        const intervalMs = config.timedTriggerInterval * 1000;
        const safeIntervalMs = Math.max(intervalMs, 5000); // Minimum 5 seconds

        log('info', `Scheduling timed trigger for ${timerId} (${config.name}) in ${safeIntervalMs / 1000} seconds.`, serverInstance);

        activeTimers[timerId] = setTimeout(async () => {
            // const prisma = getPrisma(serverInstance); // Replaced with imported prisma
            let currentConfig: Preset | DisguisePreset | null = null;
            try {
                if (configType === 'preset') {
                    currentConfig = await prisma.preset.findUnique({ where: { id: config.id } });
                } else {
                    currentConfig = await prisma.disguisePreset.findUnique({ where: { id: config.id } });
                }

                if (currentConfig && currentConfig.timedTriggerEnabled) {
                    log('info', `Timed trigger initiated for ${configType} '${currentConfig.name}' (ID: ${currentConfig.id})`, serverInstance);
                    
                    // +++ ADDED LOGGING HERE +++
                    log('debug', `[TriggerScheduler] Attempting to fetch active contexts for ${configType} ID: ${currentConfig.id}`, serverInstance);

                    let activeContexts: { contextType: DbContextType, contextId: string }[] = [];
                    if (configType === 'preset') {
                        activeContexts = await getActiveContextsForPreset(currentConfig.id);
                    } else { // 'disguise'
                        activeContexts = await getActiveContextsForDisguisePreset(currentConfig.id);
                    }

                    if (activeContexts.length === 0) {
                        log('info', `No active contexts found for ${configType} '${currentConfig.name}'. Timed trigger execution skipped for this cycle.`, serverInstance);
                    } else {
                        log('info', `Found ${activeContexts.length} active context(s) for ${configType} '${currentConfig.name}'. Executing Sub-AI for each.`, serverInstance);
                        await Promise.all(activeContexts.map(actx =>
                            executeSubAiForSpecificContext(configType, currentConfig!, actx.contextType, actx.contextId, serverInstance)
                        ));
                    }
                    // Reschedule based on the potentially updated currentConfig
                    scheduleTimedTrigger(currentConfig, configType, serverInstance);
                } else {
                    log('info', `Timed trigger for ${timerId} was disabled or config deleted before execution. Clearing timer.`, serverInstance);
                    if (activeTimers[timerId]) {
                        clearTimeout(activeTimers[timerId]);
                        delete activeTimers[timerId];
                    }
                }
            } catch (error: any) {
                log('error', `Error during timed trigger execution or refetch for ${timerId}: ${error.message}`, serverInstance, error);
                // If an error occurs (e.g., DB error fetching contexts or config), decide on rescheduling.
                // For now, we'll try to reschedule with the original config if currentConfig couldn't be fetched,
                // but if the error was during activeContexts fetching or sub-AI execution, it will reschedule based on currentConfig.
                // A more robust error handling might be needed here.
                // If currentConfig is null due to fetch error, we might want to clear the timer or use original 'config' to reschedule.
                // Let's ensure it reschedules if the original config intended it.
                if (activeTimers[timerId]) { // If timer was set
                     clearTimeout(activeTimers[timerId]); // Clear it first
                     delete activeTimers[timerId];
                }
                // Attempt to reschedule with the config that was initially used to set up this timer instance,
                // if it's still marked as enabled.
                if (config.timedTriggerEnabled && config.timedTriggerInterval && config.timedTriggerInterval > 0) {
                    log('warn', `Rescheduling ${timerId} with its original/last known interval due to error during execution cycle.`, serverInstance);
                    scheduleTimedTrigger(config, configType, serverInstance);
                } else {
                     log('warn', `Not rescheduling ${timerId} as original config is no longer enabled or interval invalid.`, serverInstance);
                }
            }
        }, safeIntervalMs);
    } else {
        log('info', `Timed trigger for ${timerId} (${config.name}) is disabled or interval is invalid. Not scheduling.`, serverInstance);
    }
}

export async function updateOrRemoveTimedTriggerForPreset(
    configType: 'preset' | 'disguise',
    // presetId: number, // This was the source of confusion, only one ID is needed.
    configId: number,
    serverInstance: FastifyInstance
) {
    // const prisma = getPrisma(serverInstance); // Replaced with imported prisma
    let configToSchedule: Preset | DisguisePreset | null = null;

    log('debug', `Updating/Removing timed trigger for ${configType} ID ${configId}`, serverInstance);

    try {
        if (configType === 'preset') {
            configToSchedule = await prisma.preset.findUnique({ where: { id: configId } });
        } else { // 'disguise'
            configToSchedule = await prisma.disguisePreset.findUnique({ where: { id: configId } });
        }

        if (configToSchedule) {
            scheduleTimedTrigger(configToSchedule, configType, serverInstance);
        } else {
            // Config was deleted or not found, ensure timer is cleared
            const timerId = `${configType}_${configId}`;
            if (activeTimers[timerId]) {
                clearTimeout(activeTimers[timerId]);
                delete activeTimers[timerId];
                log('info', `Timed trigger for ${timerId} (config not found/deleted) has been removed.`, serverInstance);
            }
        }
    } catch (error: any) {
        log('error', `Error fetching ${configType} ID ${configId} for trigger update: ${error.message}`, serverInstance, error);
    }
}

export async function initializeAllTimedTriggers(serverInstance: FastifyInstance) {
    // const prisma = getPrisma(serverInstance); // Replaced with imported prisma
    
    log('trace', '正在初始化所有定时触发器...', serverInstance);
    try {
        const presets = await prisma.preset.findMany({
            where: { timedTriggerEnabled: true, timedTriggerInterval: { gt: 0 } } // Fetch only relevant presets
        });
        for (const preset of presets) {
            scheduleTimedTrigger(preset, 'preset', serverInstance);
        }
        log('trace', `已调度 ${presets.length} 个预设定时触发器。`, serverInstance);

        const disguisePresets = await prisma.disguisePreset.findMany({
            where: { timedTriggerEnabled: true, timedTriggerInterval: { gt: 0 } } // Fetch only relevant disguise presets
        });
        for (const disguise of disguisePresets) {
             scheduleTimedTrigger(disguise, 'disguise', serverInstance);
        }
        log('trace', `已调度 ${disguisePresets.length} 个伪装定时触发器。`, serverInstance);

    } catch (error: any) {
        log('error', `Error initializing timed triggers: ${error.message}`, serverInstance, error);
    }
    log('trace', '定时触发器初始化完成。', serverInstance);
}