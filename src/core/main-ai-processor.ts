import { Preset, DisguisePreset, ContextType as DbContextType, Role as DbRole } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { OpenAIMessage, VariableContext, PresetContent, PresetItemSchema } from './types';
import { substituteVariables, processPreset } from './preset-processor'; // +++ Import processPreset
import { callOpenAI } from './openai-client';
import { getHistoryItems } from '../db/history'; // +++ Import getHistoryItems
// import { getBotConfig } from '../onebot/connection'; // --- Removed: getBotConfig no longer returns selfId ---
import { OpenAIRole } from './types'; // +++ Import OpenAIRole
import { processAtMentionsInOpenAIMessages } from './message-utils'; // 导入处理 @ 的函数
import { getAppSettings } from '../db/configStore'; // +++ Import getAppSettings +++
import { convertGifToJpegBase64 } from './image-utils'; // +++ Import from image-utils +++

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


// The convertGifToJpegBase64 function has been moved to image-utils.ts

export async function processAndExecuteMainAi(
    config: Preset | DisguisePreset,
    contextType: DbContextType,
    contextId: string, // Group ID or User ID depending on contextType
    senderUserId: string, // Always the ID of the user who sent the message
    senderNickname: string | undefined, // Nickname of the sender
    senderCard: string | undefined, // Group card name of the sender
    userInputText: string, // This is the "trigger message" or user's actual message (text part)
    userImageItemsArray: Array<{ type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }> | undefined, // Renamed for clarity
    serverInstance: FastifyInstance,
    // Optional: if the trigger provides a specific messageId to reply to (e.g., for threaded replies later)
    replyToMessageId?: string,
    replyToContent?: string, // Added reply content
    repliedMessageImageUrls?: string[] // 新增：被回复消息的图片URL数组
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


    // Fetch history items for processPreset
    const historyFetchLimit = config.chatHistoryLimit ?? 10; // Use chatHistoryLimit from config
    const historyItems = await getHistoryItems(contextType, contextId, historyFetchLimit);
    log('trace', `Fetched ${historyItems.length} history items for processPreset. Limit: ${historyFetchLimit}`, serverInstance);

    // Construct UserMessageContentItem[] for processPreset
    const userMessageContentForPreset: Array<{ type: 'text', text: string } | { type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }> = [];
    if (userInputText.trim()) {
        userMessageContentForPreset.push({ type: 'text', text: userInputText });
    }
    if (userImageItemsArray && userImageItemsArray.length > 0) {
        userMessageContentForPreset.push(...userImageItemsArray);
    }
    // If both are empty, add an empty text item so processPreset still processes user_input placeholder if present
    if (userMessageContentForPreset.length === 0) {
        userMessageContentForPreset.push({ type: 'text', text: '' });
    }
    log('trace', `Constructed userMessageContentForPreset for processPreset: ${JSON.stringify(userMessageContentForPreset).substring(0,300)}...`, serverInstance);


    // Call processPreset to get the full list of messages for OpenAI
    // processPreset will handle system messages, history placeholders, and user input placeholders.
    const messagesForOpenAI = await processPreset(
        config,
        userMessageContentForPreset, // Pass the structured user message
        historyItems,
        variableContext // This context already includes `message: userInputText`
    );
    log('trace', `Messages from processPreset (before image handling): ${JSON.stringify(messagesForOpenAI).substring(0,500)}...`, serverInstance);


    // Filter out any messages that ended up with empty content after substitution,
    // or messages that were just placeholders and didn't resolve to content (e.g. an empty system message if {{system_var}} was empty)
    let modifiableMessages = messagesForOpenAI;

    // --- Refactored Image Handling ---
    // This section assumes images are to be attached to the *last user message* generated by processPreset.
    // If processPreset didn't generate a user message (e.g., preset only has system messages),
    // this image handling logic might need adjustment or might not attach images.
    let userMessageEntryForImages: OpenAIMessage | undefined = undefined;
    let userMessageEntryIndex = -1;

    // 1. Try to find the last user message that could correspond to userInputText
    // This loop should operate on `modifiableMessages`.
    for (let i = modifiableMessages.length - 1; i >= 0; i--) {
        if (modifiableMessages[i].role === 'user' && typeof modifiableMessages[i].content === 'string') {
            // Heuristic: if the preset resulted in a user message whose content IS the userInputText,
            // or if it's the last user message in the list and userInputText is present.
            const currentContent = modifiableMessages[i].content as string;
            if (currentContent === userInputText || (i === modifiableMessages.length - 1 && userInputText.trim() !== "")) {
                userMessageEntryForImages = modifiableMessages[i];
                userMessageEntryIndex = i;
                break;
            }
        }
    }
    
    const hasCurrentUserImages = !!(userImageItemsArray && userImageItemsArray.length > 0);
    const hasRepliedImages = !!(repliedMessageImageUrls && repliedMessageImageUrls.length > 0);

    // 2. If no suitable existing user message, and there's text or any images to send, create a new one.
    //    This block is less relevant now as processPreset should have created the user message if {{user_input}} was present.
    //    We are looking for the last 'user' role message from processPreset's output.
    if (!userMessageEntryForImages && (userInputText.trim() || (config.allowImageInput && hasCurrentUserImages) || hasRepliedImages)) {
        log('debug', 'No existing user message found from preset to attach images. This might be okay if preset handles user input differently or no user input placeholder exists.', serverInstance);
    }

    // 3. If we have a user message entry to attach images to:
    if (userMessageEntryForImages) {
        let baseTextContent = '';
        if (typeof userMessageEntryForImages.content === 'string') {
            baseTextContent = userMessageEntryForImages.content;
        } else if (Array.isArray(userMessageEntryForImages.content)) {
            // If content is already an array, find the text part.
            const textPart = userMessageEntryForImages.content.find(part => part.type === 'text');
            if (textPart && typeof textPart.text === 'string') {
                baseTextContent = textPart.text;
            }
        }

        const imagesToAttachThisTurn: Array<{ type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }> = [];

        // 4. Attach images from the current user message (if allowed)
        if (config.allowImageInput && hasCurrentUserImages) {
            userImageItemsArray!.forEach(imgItem => { // Use userImageItemsArray
                const imageDetail = (imgItem.image_url as any).detail;
                imagesToAttachThisTurn.push({ type: 'image_url', image_url: { url: imgItem.image_url.url, ...(imageDetail && { detail: imageDetail }) } });
            });
            log('debug', `Prepared ${userImageItemsArray!.length} images from current user message for attachment.`, serverInstance);
        }

        // 5. Attach images from the replied message
        if (hasRepliedImages) {
            repliedMessageImageUrls!.forEach(url => {
                if (typeof url === 'string' && url.trim() !== '') {
                    imagesToAttachThisTurn.push({ type: 'image_url', image_url: { url: url, detail: 'low' } });
                }
            });
            log('debug', `Prepared ${repliedMessageImageUrls!.length} images from replied message for attachment.`, serverInstance);
        }

        // 6. Process collected image URLs (convert GIF to Base64, use direct URL for others) and update the user message entry
        if (imagesToAttachThisTurn.length > 0 && config.allowImageInput) { // Check allowImageInput from preset
            log('debug', `Processing ${imagesToAttachThisTurn.length} image URLs based on type (GIF vs non-GIF) and allowImageInput=true.`, serverInstance);
            const processedImageObjects = await Promise.all(
                imagesToAttachThisTurn.map(async (imgObject) => {
                    const originalUrl = imgObject.image_url.url;
                    // Try to convert if it's a GIF
                    const gifBase64DataUri = await convertGifToJpegBase64(originalUrl, serverInstance.log);

                    if (gifBase64DataUri) { // It was a GIF and successfully converted
                        return {
                            ...imgObject,
                            image_url: { ...imgObject.image_url, url: gifBase64DataUri }
                        };
                    } else { // Not a GIF, or GIF conversion failed; use original URL
                        log('trace', `Image ${originalUrl} is not a GIF or GIF conversion failed, using direct URL for this image part.`, serverInstance);
                        return { // Return the original image object (with direct URL)
                            ...imgObject
                        };
                    }
                })
            );

            // Filter out any nulls that might have occurred if an error happened during mapping
            const validProcessedImageObjects = processedImageObjects.filter(
                (img): img is { type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } } => img !== null && img.image_url.url !== null
            );

            if (validProcessedImageObjects.length > 0) {
                const newContentPayload: Array<{ type: 'text', text: string } | { type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }> = [];
                // Add text part only if it has content or if there are images to accompany
                if (baseTextContent.trim() || validProcessedImageObjects.length > 0) {
                    newContentPayload.push({ type: 'text', text: baseTextContent });
                }
                newContentPayload.push(...validProcessedImageObjects);
                
                userMessageEntryForImages.content = newContentPayload;
                log('debug', `User message at index ${userMessageEntryIndex} updated with ${validProcessedImageObjects.length} processed images. Final text part: "${baseTextContent}"`, serverInstance);
            } else {
                userMessageEntryForImages.content = baseTextContent; // Only text if no valid images
                log('debug', `No valid images processed or attached. User message content remains text only: "${baseTextContent}"`, serverInstance);
            }
        } else if (imagesToAttachThisTurn.length > 0 && !config.allowImageInput) {
            userMessageEntryForImages.content = baseTextContent; // Only text if images not allowed
            log('debug', `Image input not allowed by preset (allowImageInput=false). User message content remains text only: "${baseTextContent}"`, serverInstance);
        } else { // No images were collected to attach
            userMessageEntryForImages.content = baseTextContent;
        }
    }
    // --- End Refactored Image Handling ---

    // Filter out messages with empty or invalid content AFTER all modifications
    let finalMessages = modifiableMessages.filter(m => {
        if (!m.content) return false;
        if (typeof m.content === 'string') return m.content.trim() !== '';
        if (Array.isArray(m.content)) {
            // For arrays, ensure it's not empty and contains at least one valid part.
            // A valid part could be text with content or an image_url.
            if (m.content.length === 0) return false;
            return m.content.some(part => (part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '') || part.type === 'image_url');
        }
        return false; // Should not happen with OpenAIMessage type
    });
    
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