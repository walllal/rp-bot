import { Preset, DisguisePreset, ContextType as DbContextType, Role as DbRole } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { OpenAIMessage, VariableContext, PresetContent, PresetItemSchema } from './types';
import { substituteVariables } from './preset-processor';
import { callOpenAI } from './openai-client';
// import { getBotConfig } from '../onebot/connection'; // --- Removed: getBotConfig no longer returns selfId ---
import { OpenAIRole } from './types'; // +++ Import OpenAIRole
import { processAtMentionsInOpenAIMessages } from './message-utils'; // 导入处理 @ 的函数
import { getAppSettings } from '../db/configStore'; // +++ Import getAppSettings +++

// Helper for logging within this module, similar to trigger-scheduler
function log(level: 'info' | 'warn' | 'error' | 'debug' | 'trace', message: string, serverInstance?: FastifyInstance, data?: any) {
    const logger = serverInstance?.log || console; // Use server logger or a default console
    const logPayload: any = { context: 'MainAiProcessor' };
    if (data) logPayload.data = data;

    if (typeof (logger as any)[level] === 'function') {
        if (data) {
            (logger as any)[level](logPayload, message);
        } else {
            (logger as any)[level]({ context: 'MainAiProcessor' }, message);
        }
    } else {
        console[level as 'log' | 'warn' | 'error'](`[MainAiProcessor] ${level.toUpperCase()}: ${message}`, data || '');
    }
}


export async function processAndExecuteMainAi(
    config: Preset | DisguisePreset,
    contextType: DbContextType,
    contextId: string, // Group ID or User ID depending on contextType
    senderUserId: string, // Always the ID of the user who sent the message
    senderNickname: string | undefined, // Nickname of the sender
    senderCard: string | undefined, // Group card name of the sender
    userInputText: string, // This is the "trigger message" or user's actual message
    serverInstance: FastifyInstance,
    // Optional: if the trigger provides a specific messageId to reply to (e.g., for threaded replies later)
    replyToMessageId?: string,
    replyToContent?: string // Added reply content
): Promise<string | null> {
    // Get app settings to retrieve botId
    const appSettings = await getAppSettings(serverInstance.log); // Pass serverInstance.log for logging
    const botId = appSettings?.botId || undefined; // Get botId from settings
 
    // Construct the complete VariableContext using all available info
    const variableContext: VariableContext = {
        timestamp: new Date(),
        botId: botId, // Use botId from app settings
        botName: config.botName || undefined,
        userId: senderUserId, // Always use the sender's ID
        userNickname: senderNickname,
        userCard: senderCard,
        groupId: contextType === DbContextType.GROUP ? contextId : undefined, // Group ID only if it's a group chat
        isPrivateChat: contextType === DbContextType.PRIVATE ? 'yes' : 'no',
        isGroupChat: contextType === DbContextType.GROUP ? 'yes' : 'no',
        message: userInputText, // User's current message text
        isReply: replyToMessageId ? 'yes' : 'no', // Check if it's a reply
        replayContent: replyToContent, // Add the content being replied to
        // Add other fields if needed, e.g., replyToSenderId if available
    };


    const presetLimits = {
        chatHistoryLimit: config.chatHistoryLimit ?? 10, // Default from schema
        messageHistoryLimit: config.messageHistoryLimit ?? 10, // Default from schema
    };

    const messagesForOpenAI: OpenAIMessage[] = [];
    // Ensure config.content is treated as PresetContent
    const presetContentSource = (config.content as unknown as PresetContent) || [];
    
    // Validate presetContentSource structure if necessary, or assume it's correct
    // For example, using Zod:
    // const parseResult = z.array(PresetItemSchema).safeParse(presetContentSource);
    // if (!parseResult.success) {
    //     log('error', `Invalid preset content structure for ${config.name}`, serverInstance, parseResult.error);
    //     return null;
    // }
    // const validPresetContent = parseResult.data;

    // Using the source directly, assuming it's valid for now
    const validPresetContent = presetContentSource;


    for (const item of validPresetContent) {
        if (item.enabled === false) { // Skip disabled items
            continue;
        }

        // All items in PresetContent (PresetMessage or VariablePlaceholder with content)
        // should be processed by substituteVariables if they are not purely structural placeholders.
        // The key is that `substituteVariables` handles {{user_input}}, {{chat_history}} etc., within a string.
        // If an item is a VariablePlaceholder like `chat_history` itself, it implies it should be part of a message string.
        // The current structure of PresetContent (array of messages or placeholders) means we iterate through messages.
        // If a message's content string contains "{{chat_history}}", substituteVariables will fill it.
        // If a top-level item in presetContent is a chat_history placeholder, it's a bit ambiguous how it should be rendered
        // without a surrounding message structure.
        //
        // Revised logic:
        // Iterate through preset items. If it's a message (not a placeholder), process its content.
        // If it's a placeholder, and that placeholder is 'user_input', we inject the userInputText directly.
        // Other placeholders like 'chat_history' are expected to be *inside* the content string of a PresetMessage.

        if (item.is_variable_placeholder) {
            if (item.variable_name === 'user_input') {
                // This assumes that a top-level 'user_input' placeholder in the preset content
                // should be directly translated to a user message with the userInputText.
                // The role is assumed to be 'user'.
                messagesForOpenAI.push({ role: 'user', content: userInputText });
            }
            // Other top-level placeholders (like a raw 'chat_history' item not embedded in a string) are tricky.
            // `substituteVariables` is designed to work on strings.
            // For now, we will only process PresetMessage items and direct user_input placeholders.
            // If a preset has e.g. `[{is_variable_placeholder: true, variable_name: 'chat_history'}]`
            // this loop won't directly create an OpenAI message from it unless substituteVariables is changed
            // to return an array of messages for such placeholders.
            // The current design of substituteVariables expects {{chat_history}} within a string.
        } else if ('content' in item && typeof item.content === 'string') { // It's a PresetMessage
            // Here, item.content is the template string that might contain {{user_input}}, {{chat_history}}, etc.
            // We pass userInputText to substituteVariables via the VariableContext,
            // and substituteVariables will use it if {{user_input}} is in item.content.
            // If item.content *is* "{{user_input}}", it will be replaced by userInputText.
            
            // We need to provide the original userInputText to substituteVariables if it's meant to replace {{user_input}}
            // The VariableContext already has `message: userInputText` which substituteVariables can use for {{user_input}}
            // However, I removed `message` from VariableContext.
            // Let's adjust substituteVariables or how we pass userInputText.
            // Easiest: ensure `variableContext.message` is set for `substituteVariables` if `{{user_input}}` is to be processed.
            // Or, `substituteVariables` could take `userInputText` as a direct parameter.

            // Let's assume `substituteVariables` will use `context.message` for `{{user_input}}`.
            // So, we need to put `userInputText` into `variableContext.message` temporarily for this call.
            // const tempContext = { ...variableContext, message: userInputText }; // No longer needed

            const processedContent = await substituteVariables(
                item.content,
                variableContext, // Pass context that includes the current user input as 'message'
                presetLimits
                // placeholderType and placeholderConfig are for when substituteVariables is called for a specific placeholder's expansion,
                // not for general template processing.
            );
            // Ensure role is valid OpenAIRole
            const role: OpenAIRole = (item.role && ['system', 'user', 'assistant'].includes(item.role)) ? item.role as OpenAIRole : 'user';
            messagesForOpenAI.push({ role: role, content: processedContent });
        }
    }

    // Filter out any messages that ended up with empty content after substitution,
    // or messages that were just placeholders and didn't resolve to content (e.g. an empty system message if {{system_var}} was empty)
    const finalMessages = messagesForOpenAI.filter(m => m.content && (typeof m.content !== 'string' || m.content.trim() !== '') && m.content.length > 0);

    if (finalMessages.length === 0) {
        log('warn', `No messages to send to OpenAI after processing for ${config.name} in context ${contextType}:${contextId}`, serverInstance);
        return null;
    }
    
    // 处理消息中的 @ 提及，根据模式不同采取不同处理方式
    const processedMessages = processAtMentionsInOpenAIMessages(
        finalMessages,
        config.mode, // 使用配置中的模式（STANDARD 或 ADVANCED）
        botId // 传入从设置获取的机器人 ID
    );
    
    log('debug', `Calling Main AI for ${config.name} in context ${contextType}:${contextId}. Model: ${config.openaiModel}`, serverInstance, { messages: processedMessages });

    try {
        // Construct the config for callOpenAI, including advanced parameters
        const callConfig = {
            apiKey: config.openaiApiKey!,
            baseURL: config.openaiBaseUrl,
            modelName: config.openaiModel!,
            // Main OpenAI call parameters from the preset/disguise
            openaiMaxTokens: config.openaiMaxTokens,
            openaiTemperature: config.openaiTemperature,
            openaiFrequencyPenalty: config.openaiFrequencyPenalty,
            openaiPresencePenalty: config.openaiPresencePenalty,
            openaiTopP: config.openaiTopP,
            // Web search settings (passed to callOpenAI, which decides whether to use them)
            allowWebSearch: config.allowWebSearch ?? false,
            webSearchApiKey: config.webSearchApiKey,
            webSearchBaseUrl: config.webSearchBaseUrl,
            webSearchModel: config.webSearchModel,
            webSearchSystemPrompt: config.webSearchSystemPrompt,
            rawUserTextForSearch: userInputText, // Pass the original user input for potential web search
            // Web search specific OpenAI parameters (also passed to callOpenAI)
            webSearchOpenaiMaxTokens: config.webSearchOpenaiMaxTokens,
            webSearchOpenaiTemperature: config.webSearchOpenaiTemperature,
            webSearchOpenaiFrequencyPenalty: config.webSearchOpenaiFrequencyPenalty,
            webSearchOpenaiPresencePenalty: config.webSearchOpenaiPresencePenalty,
            webSearchOpenaiTopP: config.webSearchOpenaiTopP,
            // AI Trigger parameters are not relevant for the main call
        };

        const mainAiResponseObj = await callOpenAI(
            processedMessages, // 使用处理过 @ 的消息
            callConfig,
            serverInstance.log
        );
        
        const mainAiReplyContent = (mainAiResponseObj && typeof mainAiResponseObj === 'object' && 'content' in mainAiResponseObj)
            ? (mainAiResponseObj.content || "").trim()
            : (mainAiResponseObj as string | null || "").trim();
        
        if (mainAiReplyContent) {
            log('info', `Main AI reply for ${config.name} in context ${contextType}:${contextId}: "${mainAiReplyContent.substring(0,100)}..."`, serverInstance);
            return mainAiReplyContent;
        }
        log('info', `Main AI for ${config.name} in context ${contextType}:${contextId} returned no content.`, serverInstance);
        return null;

    } catch (error: any) {
        log('error', `Error calling Main AI for ${config.name} in context ${contextType}:${contextId}: ${error.message}`, serverInstance, error);
        return null;
    }
}