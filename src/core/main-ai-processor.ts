import axios from 'axios';
import { Buffer } from 'buffer';
import sharp from 'sharp';
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


// Helper function to download an image URL and convert it to a Base64 Data URI
async function imageUrlToDataUri(
    imageUrl: string,
    logger: FastifyInstance['log'] | typeof console
): Promise<string | null> {
    try {
        const currentLogger = (typeof (logger as any).trace === 'function') ? logger : console;
        (currentLogger as any).trace(`[imageUrlToDataUri] Downloading image from URL: ${imageUrl}`);
        
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 15000 // 15 seconds timeout for image download
        });

        if (response.status !== 200) {
            (currentLogger as any).warn(`[imageUrlToDataUri] Failed to download image from ${imageUrl}. Status: ${response.status}`);
            return null;
        }

        const downloadedImageData = response.data as ArrayBuffer;
        let imageBufferForBase64 = Buffer.from(downloadedImageData); // Initial buffer from downloaded data
        
        let finalMimeType = response.headers['content-type']; // Get MIME type from headers first

        // If header MIME type is missing or not an image type, try to infer from extension
        if (!finalMimeType || !finalMimeType.startsWith('image/')) {
            const extension = imageUrl.substring(imageUrl.lastIndexOf('.') + 1).toLowerCase();
            const extToMime: { [key: string]: string } = {
                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                'gif': 'image/gif', 'webp': 'image/webp',
            };
            const inferredMimeType = extToMime[extension];
            if (inferredMimeType) {
                finalMimeType = inferredMimeType;
                (currentLogger as any).trace(`[imageUrlToDataUri] Inferred MIME type '${finalMimeType}' from extension for ${imageUrl}.`);
            } else {
                (currentLogger as any).warn(`[imageUrlToDataUri] Could not determine a valid image MIME type for ${imageUrl} from headers or extension '${extension}'. Using 'application/octet-stream'.`);
                finalMimeType = 'application/octet-stream'; // Fallback
            }
        }
        
        // If the determined MIME type is GIF, convert to JPEG
        if (finalMimeType === 'image/gif') {
            (currentLogger as any).trace(`[imageUrlToDataUri] Original image is GIF. Attempting to convert to JPEG: ${imageUrl}`);
            try {
                imageBufferForBase64 = await sharp(imageBufferForBase64)
                    .jpeg() // Convert to JPEG
                    .toBuffer();
                finalMimeType = 'image/jpeg'; // Update MIME type to JPEG
                (currentLogger as any).trace(`[imageUrlToDataUri] Successfully converted GIF to JPEG for URL: ${imageUrl}`);
            } catch (conversionError: any) {
                (currentLogger as any).error(`[imageUrlToDataUri] Failed to convert GIF to JPEG for ${imageUrl}: ${conversionError.message}`, conversionError.stack?.substring(0, 300));
                // As per user requirement, if GIF to JPEG conversion fails, we should not proceed with this image.
                return null;
            }
        }
        
        const base64String = imageBufferForBase64.toString('base64');
        (currentLogger as any).trace(`[imageUrlToDataUri] Image processed. Final MIME: ${finalMimeType}, Original URL: ${imageUrl}`);
        return `data:${finalMimeType};base64,${base64String}`;

    } catch (error: any) {
        const currentLogger = (typeof (logger as any).error === 'function') ? logger : console;
        (currentLogger as any).error(`[imageUrlToDataUri] Error processing image URL ${imageUrl}: ${error.message}`, error.stack?.substring(0, 500));
        return null;
    }
}

export async function processAndExecuteMainAi(
    config: Preset | DisguisePreset,
    contextType: DbContextType,
    contextId: string, // Group ID or User ID depending on contextType
    senderUserId: string, // Always the ID of the user who sent the message
    senderNickname: string | undefined, // Nickname of the sender
    senderCard: string | undefined, // Group card name of the sender
    userInputText: string, // This is the "trigger message" or user's actual message (text part)
    userImageItems: Array<{ type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }> | undefined, // Image part
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
    let modifiableMessages = messagesForOpenAI; // Start with messages from preset

    // --- Refactored Image Handling ---
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
    
    const hasCurrentUserImages = !!(userImageItems && userImageItems.length > 0);
    const hasRepliedImages = !!(repliedMessageImageUrls && repliedMessageImageUrls.length > 0);

    // 2. If no suitable existing user message, and there's text or any images to send, create a new one.
    if (!userMessageEntryForImages && (userInputText.trim() || (config.allowImageInput && hasCurrentUserImages) || hasRepliedImages)) {
        // Intentionally not creating a new user message here.
        // User input and images will only be processed if a user message entry
        // was found or created by the preset logic.
        log('debug', 'Condition met to potentially create a new user message for image attachment, but skipping as per new logic.', serverInstance);
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
            userImageItems!.forEach(imgItem => {
                const imageDetail = (imgItem.image_url as any).detail;
                imagesToAttachThisTurn.push({ type: 'image_url', image_url: { url: imgItem.image_url.url, ...(imageDetail && { detail: imageDetail }) } });
            });
            log('debug', `Prepared ${userImageItems!.length} images from current user message for attachment.`, serverInstance);
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

        // 6. Convert collected image URLs to Base64 Data URIs and update the user message entry
        if (imagesToAttachThisTurn.length > 0) {
            log('debug', `Attempting to convert ${imagesToAttachThisTurn.length} image URLs to Base64 Data URIs.`, serverInstance);
            const base64ImageObjects = await Promise.all(
                imagesToAttachThisTurn.map(async (imgObject) => {
                    const originalUrl = imgObject.image_url.url;
                    const dataUri = await imageUrlToDataUri(originalUrl, serverInstance.log);
                    if (dataUri) {
                        return {
                            ...imgObject,
                            image_url: {
                                ...imgObject.image_url, // Keep original detail if any
                                url: dataUri
                            }
                        };
                    }
                    log('warn', `Failed to convert image to Data URI, skipping: ${originalUrl}`, serverInstance);
                    return null;
                })
            );

            const validBase64ImageObjects = base64ImageObjects.filter(
                (img): img is { type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } } => img !== null
            );

            if (validBase64ImageObjects.length > 0) {
                const newContentPayload: Array<{ type: 'text', text: string } | { type: 'image_url', image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }> = [];
                if (baseTextContent.trim() || validBase64ImageObjects.length > 0) {
                    newContentPayload.push({ type: 'text', text: baseTextContent });
                }
                newContentPayload.push(...validBase64ImageObjects);
                
                userMessageEntryForImages.content = newContentPayload;
                log('debug', `User message at index ${userMessageEntryIndex} updated with ${validBase64ImageObjects.length} Base64 images. Final text part: "${baseTextContent}"`, serverInstance);
            } else {
                // No images successfully converted, content remains baseTextContent
                userMessageEntryForImages.content = baseTextContent;
                log('debug', `No images were successfully converted to Base64. User message content remains text only: "${baseTextContent}"`, serverInstance);
            }
        } else {
            // No images were collected to attach, content remains baseTextContent
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