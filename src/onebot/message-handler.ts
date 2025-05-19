import { oneBotEmitter, sendOneBotAction } from './connection';
import { OneBotMessageEvent, OneBotPrivateMessageEvent, OneBotGroupMessageEvent, OneBotMessageSegment } from './types';
import { getApplicablePreset } from '../db/presets';
import { getApplicableDisguisePreset } from '../db/disguise'; // Import disguise function
import { getAppSettings } from '../db/configStore'; // Import settings function
import { getHistoryItems, addHistoryItem, cleanupOldHistory } from '../db/history';
import { logMessage, cleanupOldMessageHistory, getMessageByMessageId } from '../db/message_history'; // Added getMessageByMessageId
import { processPreset } from '../core/preset-processor'; // This might be removed if logic fully moves
import { callOpenAI } from '../core/openai-client'; // This will be called inside main-ai-processor
import { checkAccess } from '../db/access_control';
import { VariableContext, ChatHistoryItem, UserMessageContentItem, OpenAIRole } from '../core/types'; // +++ Import OpenAIRole
import { processAndExecuteMainAi } from '../core/main-ai-processor'; // +++ Import new main AI processor
import { ContextType as DbContextType, Role as DbRole, Preset, DisguisePreset } from '@prisma/client';
import { getPlugin } from '../plugins/manager';
import { QQVoicePlugin } from '../plugins/qq-voice';
import { parseAdvancedResponse, AdvancedOperation } from '../core/advanced-response-parser';
import { FastifyInstance } from 'fastify';
import axios from 'axios';
import sharp from 'sharp';
import {
    processAtMentionsInOpenAIMessages,
    transformUserTextForHistory,
    transformUserMessageContentForHistory,
    extractPlainTextFromRepliedMessage // Added extractPlainTextFromRepliedMessage
} from '../core/message-utils';
import { processAndStripSetCommands } from '../core/variable-processor'; // +++ Import set command processor
import { substituteVariables } from '../core/preset-processor'; // +++ Import substituteVariables
 
// 导入OpenAIResponse接口
import { OpenAIMessage } from '../core/types';

// 定义OpenAIResponse接口，与core/openai-client.ts中的保持一致
interface OpenAIResponse {
    content: string | null;
    processedMessages?: OpenAIMessage[];
}

let serverInstance: FastifyInstance | null = null;
const quantitativeMessageCounters = new Map<string, number>(); // <'contextType:contextId', count>
 
function convertOneBotSegmentsToUserContentItems(segments: OneBotMessageSegment[] | undefined): UserMessageContentItem[] {
    const items: UserMessageContentItem[] = [];
    if (!segments || !Array.isArray(segments)) {
        return [{ type: 'text', text: '[消息段无效或为空]' }];
    }
    for (const seg of segments) {
        let currentText = '';
        if (seg.type === 'text' && seg.data?.text) {
            currentText = seg.data.text;
        } else if (seg.type === 'image' && seg.data?.file) {
            // For bot-sent images, represent them as '[图片]' in MessageHistory content and variables.
            currentText = '[图片]';
        } else if (seg.type === 'at' && seg.data?.qq) {
            currentText = `[@${seg.data.qq}]`;
        } else if (seg.type === 'face' && seg.data?.id) {
            currentText = `[表情:${seg.data.id}]`;
        } else if (seg.type === 'reply' && seg.data?.id) {
            // Typically, reply segments are not part of the displayable content itself for UserMessageContentItem
            // but provide metadata. We can choose to ignore or add a placeholder.
            // For now, ignoring to keep content clean.
            continue;
        } else if (seg.type) {
            // For other unknown or unhandled segment types, create a generic placeholder
            currentText = `[${seg.type}]`;
        }

        if (currentText) {
            const lastItem = items.length > 0 ? items[items.length - 1] : null;
            if (lastItem && lastItem.type === 'text') {
                // Append to last text item if it exists
                lastItem.text = (lastItem.text + ' ' + currentText).trim();
            } else {
                items.push({ type: 'text', text: currentText.trim() });
            }
        }
    }
    // Ensure there's at least one item, even if it's just a placeholder for empty content
    if (items.length === 0) {
        items.push({ type: 'text', text: '[空内容]' });
    }
    return items.filter(item => !(item.type === 'text' && !item.text)); // Remove empty text items
}
function log(level: 'info' | 'warn' | 'error' | 'debug' | 'trace', message: string, data?: any) {
    if (serverInstance?.log) {
        (serverInstance.log as any)[level](data ? { message, data } : message);
    } else {
        console[level](message, data ?? '');
    }
}

async function parseOneBotMessage(
    message: string | OneBotMessageSegment[],
    allowImageInput: boolean,
    botId?: string // Changed selfId to botId
): Promise<{ contentItems: UserMessageContentItem[], displayMessage: string, mentionedSelf: boolean, repliedMessageId: string | null }> {
    const contentItems: UserMessageContentItem[] = [];
    let displayMessageParts: string[] = [];
    let mentionedSelf = false;
    let repliedMessageId: string | null = null;
    let imageCounter = 1;

    if (typeof message === 'string') {
        const text = message.trim();
        if (text) {
            contentItems.push({ type: 'text', text: text });
        }
        displayMessageParts.push(text);
    } else if (Array.isArray(message)) {
        for (const segment of message) {
            if (segment.type === 'text') {
                const text = segment.data.text.trim();
                if (text) {
                    const lastContent = contentItems[contentItems.length - 1];
                    if (lastContent?.type === 'text') {
                        lastContent.text += ' ' + text;
                    } else {
                        contentItems.push({ type: 'text', text: text });
                    }
                    displayMessageParts.push(text);
                }
            } else if (segment.type === 'image') {
                const imagePlaceholderText = `[图片${imageCounter}]`;
                displayMessageParts.push('[图片]');

                if (allowImageInput) {
                    let imageUrl = segment.data.url;
                    if (imageUrl) {
                        const qqMultimediaPrefix = 'https://multimedia.nt.qq.com.cn';
                        if (imageUrl.startsWith(qqMultimediaPrefix)) {
                            imageUrl = imageUrl.replace('https://', 'http://');
                            log('trace', `QQ URL 协议替换: ${segment.data.url} -> ${imageUrl}`);
                        }
                        // 修改：直接使用图片URL，不再进行Base64转换
                        if (imageUrl) {
                            contentItems.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'low' } });
                            log('trace', `已添加图片 ${imageCounter} (直接使用 URL: ${imageUrl})`);
                            imageCounter++;
                        } else {
                            // 此情况理论上不应发生，因为外层已经有 if (imageUrl) 判断
                            // 但为保险起见，保留一个处理分支
                            log('warn', `图片URL在QQ特定处理后变为空 (原始URL: ${segment.data.url})`);
                            contentItems.push({ type: 'text', text: `[图片URL处理后为空:${imageCounter}]` });
                            imageCounter++;
                        }
                    } else {
                         contentItems.push({ type: 'text', text: `[图片无URL:${imageCounter}]` });
                         imageCounter++;
                    }
                } else {
                    contentItems.push({ type: 'text', text: '[图片]' });
                    log('trace', '不允许图片输入，已添加通用 [图片] 占位符');
                }
            } else if (segment.type === 'face') {
                const faceText = `[表情:${segment.data.id || '未知'}]`;
                displayMessageParts.push(faceText);
                const lastContent = contentItems[contentItems.length - 1];
                if (lastContent?.type === 'text') { lastContent.text += ' ' + faceText; }
                else { contentItems.push({ type: 'text', text: faceText }); }
            } else if (segment.type === 'at') {
                const atTarget = segment.data.qq || '未知';
                // Always use the actual ID for the text representation.
                // mentionedSelf is still set if the target is the bot.
                const atText = `[@${atTarget}]`;
                if (botId && atTarget === botId) {
                    mentionedSelf = true;
                }
                displayMessageParts.push(atText);
                const lastContent = contentItems[contentItems.length - 1];
                if (lastContent?.type === 'text') {
                    lastContent.text = (lastContent.text + ' ' + atText).trim();
                } else {
                    contentItems.push({ type: 'text', text: atText });
                }
            } else if (segment.type === 'reply' && segment.data) {
                if (typeof segment.data.id === 'string' && segment.data.id) {
                    repliedMessageId = segment.data.id;
                } else if (typeof segment.data.id === 'number') { // OneBot v11 reply id is number
                    repliedMessageId = String(segment.data.id);
                }
                // 根据计划，不将 [回复:ID] 文本添加到 displayMessageParts 或 contentItems
            } else if (segment.type === 'record') {
                const recordText = '[语音消息]';
                displayMessageParts.push(recordText);
                const lastContent = contentItems[contentItems.length - 1];
                if (lastContent?.type === 'text') {
                    lastContent.text = (lastContent.text + ' ' + recordText).trim();
                } else {
                    contentItems.push({ type: 'text', text: recordText });
                }
            } else { // For any other unhandled segment types
                 const otherText = `[${segment.type || '未知类型'}]`;
                 displayMessageParts.push(otherText);
                 const lastContent = contentItems[contentItems.length - 1];
                 if (lastContent?.type === 'text') {
                    lastContent.text = (lastContent.text + ' ' + otherText).trim();
                } else {
                    contentItems.push({ type: 'text', text: otherText });
                }
            }
        }
    }

    const finalContentItems: UserMessageContentItem[] = [];
    let lastItemWasText = false;
    for(const item of contentItems) {
        if (item.type === 'text') {
            if (lastItemWasText && finalContentItems.length > 0) {
                (finalContentItems[finalContentItems.length - 1] as Extract<UserMessageContentItem, { type: 'text' }>).text += ' ' + item.text;
            } else {
                finalContentItems.push({ type: 'text', text: item.text });
                lastItemWasText = true;
            }
        } else {
            finalContentItems.push(item);
            lastItemWasText = false;
        }
    }

    const filteredContentItems = finalContentItems.filter(item => !(item.type === 'text' && !item.text.trim()));
    const finalDisplayMessage = displayMessageParts.join(' ').trim();
    return { contentItems: filteredContentItems, displayMessage: finalDisplayMessage, mentionedSelf, repliedMessageId };
}

/**
 * Processes a specific configuration (Preset or DisguisePreset) and sends a response if triggered.
 */
async function handleConfigurationProcessing(
    config: Preset | DisguisePreset,
    configSource: 'preset' | 'disguise',
    event: OneBotMessageEvent,
    userMessageContent: UserMessageContentItem[], // This is the original, unprocessed user message content
    mentionedSelf: boolean,
    isReplyToBot: boolean, // 新增参数，标记是否回复了机器人消息
    variableContext: VariableContext, // Base context, might lack specific user details initially
    contextType: DbContextType,
    contextId: string,
    userId: string, // Sender's User ID
    // New parameters for original user message, to be processed for history (must come before optional params)
    originalUserMessageText: string, // Plain text version of user's message (this is displayMessage)
    originalUserMessageContent: UserMessageContentItem[], // Structured version of user's message
    replayValue: string, // Formatted content of the message being replied to
    isReply: string, // "yes" or "no"
    isPrivateChat: string, // "yes" or "no"
    isGroupChat: string, // "yes" or "no"
    // New parameters for sender details
    senderNickname: string | undefined, // Actual nickname
    senderCard: string | undefined, // Actual group card name
    userMessageTimestamp: Date, // <<<< 新增：用户消息的时间戳
    repliedMessageIdParam?: string, // +++ Add repliedMessageId as a parameter +++
    repliedMessageImageUrls?: string[], // +++ 新增：被回复消息的图片URL数组 +++
    // Optional parameters last
    userName?: string, // Display name (card or nickname) - might be redundant now
    botId?: string // Changed selfId to botId
) {
    log('debug', `开始处理 ${configSource} 配置: ${config.name} (ID: ${config.id})`);

    // --- Check Trigger Conditions ---
    const botNameFromConfig = config.botName?.trim() || '';
    const botNicknames = (config.botNicknames || '')
        .split(',')
        .map(n => n.trim())
        .filter(n => n !== '');
    const fuzzyMatchEnabled = config.botFuzzyMatchEnabled;
    let shouldProcessAI = false;
    
    log('debug', `检查触发条件: 配置=${config.name}, 来源=${configSource}, 触发器状态=[名称=${config.nameTriggered}, 昵称=${config.nicknameTriggered}, @=${config.atTriggered}, 回复=${config.replyTriggered}], 消息类型=${event.message_type}, 被@=${mentionedSelf}, 是回复机器人=${isReplyToBot}`);
    
    if (event.message_type === 'private') {
        shouldProcessAI = true;
        log('debug', `私聊消息，直接触发处理`);
    } else if (event.message_type === 'group') {
        // 检查是否被@，并且@触发开关已启用
        if (mentionedSelf && config.atTriggered) {
            shouldProcessAI = true;
            log('debug', `@触发已激活 (配置: ${config.name}, atTriggered=${config.atTriggered}, mentionedSelf=${mentionedSelf})`);
        } 
        // 检查是否是回复机器人的消息，且回复触发开关已启用
        else if (isReplyToBot && config.replyTriggered) {
            shouldProcessAI = true;
            log('debug', `回复触发已激活 (配置: ${config.name}, replyTriggered=${config.replyTriggered}, isReplyToBot=${isReplyToBot})`);
        }
        // 检查是否使用机器人名称或昵称触发
        else {
            const firstTextSegment = userMessageContent.find(item => item.type === 'text')?.text || '';
            const allTextContent = userMessageContent.filter(item => item.type === 'text').map(item => item.text).join(' ');
            const matchFn = fuzzyMatchEnabled
                ? (text: string, keyword: string) => text.includes(keyword)
                : (text: string, keyword: string) => text.startsWith(keyword);
            
            log('debug', `检查名称/昵称触发, 文本内容="${allTextContent}", 机器人名称="${botNameFromConfig}", 昵称=[${botNicknames.join(', ')}]`);
                
            // 检查名称触发（仅当nameTriggered为true时）
            if (botNameFromConfig && config.nameTriggered && matchFn(fuzzyMatchEnabled ? allTextContent : firstTextSegment, botNameFromConfig)) {
                shouldProcessAI = true;
                log('debug', `名称触发已激活 (配置: ${config.name}, nameTriggered=${config.nameTriggered}, 名称="${botNameFromConfig}")`);
            } 
            // 检查昵称触发（仅当nicknameTriggered为true且有昵称时）
            else if (config.nicknameTriggered && botNicknames.length > 0) {
                for (const nickname of botNicknames) {
                    if (nickname && matchFn(fuzzyMatchEnabled ? allTextContent : firstTextSegment, nickname)) {
                        shouldProcessAI = true;
                        log('debug', `昵称触发已激活 (配置: ${config.name}, nicknameTriggered=${config.nicknameTriggered}, 昵称="${nickname}")`);
                        break;
                    }
                }
            }
        }
    }
    
    // --- New "Monitoring AI Trigger" Logic ---
    // This runs if standard triggers (name, nickname, @, reply in group, or any private message)
    // haven't already set shouldProcessAI to true, AND the config has aiTriggerEnabled.
    // This is a "pre-check" using a sub-AI before deciding to process the main AI.
    if (!shouldProcessAI && config.aiTriggerEnabled && config.aiTriggerApiKey && config.aiTriggerModel && config.aiTriggerKeyword) {
        log('debug', `标准触发器未激活 (${config.name})，但启用了AI监视触发，执行副AI判断...`);

        const subAiSystemPrompt = config.aiTriggerSystemPrompt || "You are an assistant that decides if the main AI should respond based on the user's message and recent chat history. Respond with ONLY '{{keyword}}' if the main AI should be triggered, otherwise respond with anything else or nothing.";
        // Ensure {{message_last}} is used correctly by substituteVariables
        const subAiUserPrompt = config.aiTriggerUserPrompt || "User message: {{message_last}}\nRecent history (if any):\n{{chat_history_for_sub_ai}}\n\nShould the main AI be triggered? (respond with '{{keyword}}' for yes)";
        
        // Prepare VariableContext for substituteVariables for the sub-AI prompts
        // This context should reflect the current user message being processed.
        const contextForSubAiPromptProcessing: VariableContext = {
            timestamp: variableContext.timestamp, // from original event
            botId: botId, // Changed selfId to botId
            userId: userId,
            userNickname: variableContext.userNickname,
            userCard: variableContext.userCard,
            groupId: variableContext.groupId,
            botName: config.botName || undefined,
            replayContent: replayValue, // {{replay}}
            isReply: isReply,           // {{is_reply}}
            isPrivateChat: isPrivateChat, // {{is_private_chat}}
            isGroupChat: isGroupChat,   // {{is_group_chat}}
            // message_last will be resolved by substituteVariables using this context
            // chat_history_for_sub_ai will be a custom variable handled below
        };

        const subAiPresetLimits = {
            chatHistoryLimit: 0, // Not using {{chat_history}} directly here, but {{chat_history_for_sub_ai}}
            messageHistoryLimit: 1 // For {{message_last}}
        };
        
        let chatHistoryForSubAiText = "[No recent history available for Sub-AI]";
        // Use the main config's chatHistoryLimit for the sub-AI's "chat_history_for_sub_ai" variable.
        // If the user wants a different limit for this specific sub-AI,
        // they should use {{chat_history::N}} directly in the subAiUserPrompt.
        if (config.chatHistoryLimit && config.chatHistoryLimit > 0) {
            const subAiHistoryItems = await getHistoryItems(contextType, contextId, config.chatHistoryLimit);
            if (subAiHistoryItems.length > 0) {
                chatHistoryForSubAiText = subAiHistoryItems
                    .slice() // Create a shallow copy to avoid modifying the original
                    .reverse() // Newest last, as per typical chat flow
                    .map(item => `${item.role === 'USER' ? (item.userName || 'User') : (item.botName || 'Assistant')}: ${item.content}`)
                    .join('\n');
            }
        }

        // Substitute {{keyword}} and {{chat_history_for_sub_ai}} manually before general substitution
        let finalSubAiUserPrompt = subAiUserPrompt.replace(/\{\{keyword\}\}/g, config.aiTriggerKeyword);
        finalSubAiUserPrompt = finalSubAiUserPrompt.replace(/\{\{chat_history_for_sub_ai\}\}/g, chatHistoryForSubAiText);

        const processedSubAiSystemPrompt = await substituteVariables(subAiSystemPrompt, contextForSubAiPromptProcessing, subAiPresetLimits);
        const processedSubAiUserPrompt = await substituteVariables(finalSubAiUserPrompt, contextForSubAiPromptProcessing, subAiPresetLimits);

        const messagesForSubAI: OpenAIMessage[] = [
            { role: 'system', content: processedSubAiSystemPrompt },
            { role: 'user', content: processedSubAiUserPrompt }
        ];
        
        log('debug', `调用副AI进行监视判断 (${config.name})。模型: ${config.aiTriggerModel}`, { systemPrompt: processedSubAiSystemPrompt, userPrompt: processedSubAiUserPrompt });

        try {
            const loggerForSubAICall = serverInstance?.log;
            if (!loggerForSubAICall) {
                log('error', `Logger not available for Sub-AI call (config: ${config.name}). Skipping Sub-AI check.`);
            } else {
                const subAiResponseObj = await callOpenAI(
                    messagesForSubAI,
                    {
                        apiKey: config.aiTriggerApiKey,
                        baseURL: config.aiTriggerBaseUrl,
                        modelName: config.aiTriggerModel,
                        allowWebSearch: false, // Sub-AI typically doesn't do web search for this purpose
                    },
                    loggerForSubAICall
                );
                const subAiResponseContent = (subAiResponseObj && typeof subAiResponseObj === 'object' && 'content' in subAiResponseObj)
                    ? (subAiResponseObj.content || "").trim() // Ensure it's a string and trim whitespace
                    : (subAiResponseObj as string | null || "").trim(); // Ensure it's a string and trim

                log('info', `副AI监视响应 (${config.name}): "${subAiResponseContent}" (关键词: "${config.aiTriggerKeyword}")`);
                
                // Strict check:副AI的响应是否 *完全等于* 关键词
                if (subAiResponseContent === config.aiTriggerKeyword) {
                    log('debug', `副AI (${config.name}) 指示触发主AI (响应完全匹配关键词 "${config.aiTriggerKeyword}")`);
                    shouldProcessAI = true;
                } else {
                    log('debug', `副AI (${config.name}) 未指示触发主AI (响应 "${subAiResponseContent}" 不完全匹配关键词 "${config.aiTriggerKeyword}")`);
                }
            }
        } catch (subAiError: any) {
            log('error', `调用副AI进行监视判断 (${config.name}) 出错: ${subAiError.message}`, subAiError);
            // If sub-AI fails, we typically don't proceed with main AI for this trigger type.
        }
    }
    // --- End of New "Monitoring AI Trigger" Logic ---

    // The old simplified trigger checks (timed, quantitative, AI) are removed as they are either
    // handled by trigger-scheduler.ts (timed) or superseded by the new monitoring AI trigger logic.

    // --- Quantitative Trigger Check ---
    // Only proceed if standard triggers AND monitoring AI trigger did NOT set shouldProcessAI to true
    // AND quantitative trigger is enabled for the current config.
    if (!shouldProcessAI && config.quantitativeTriggerEnabled && config.quantitativeTriggerThreshold && config.quantitativeTriggerThreshold > 0) {
        const counterKey = `${contextType}:${contextId}`;
        const currentQuantitativeCount = quantitativeMessageCounters.get(counterKey) || 0;
 
        log('debug', `Quantitative trigger check for ${configSource} '${config.name}' in ${counterKey}: Count=${currentQuantitativeCount}, Threshold=${config.quantitativeTriggerThreshold}`);
 
        if (currentQuantitativeCount >= config.quantitativeTriggerThreshold) {
            log('info', `Quantitative trigger threshold met for ${configSource} '${config.name}' in ${counterKey}. Attempting to trigger Sub-AI.`);
 
            quantitativeMessageCounters.set(counterKey, 0); // Reset counter immediately
            log('debug', `Quantitative trigger: Counter for ${counterKey} reset to 0.`);
 
            if (config.aiTriggerApiKey && config.aiTriggerModel && config.aiTriggerKeyword && config.aiTriggerUserPrompt) {
                const subAiSystemPrompt = config.aiTriggerSystemPrompt;
                const subAiUserPrompt = config.aiTriggerUserPrompt;

                const contextForSubAi: VariableContext = {
                    timestamp: variableContext.timestamp,
                    botId: botId, // Changed selfId to botId
                    userId: userId,
                    userNickname: variableContext.userNickname,
                    userCard: variableContext.userCard,
                    groupId: variableContext.groupId,
                    botName: config.botName || undefined,
                    replayContent: replayValue,
                    isReply: isReply,
                    isPrivateChat: isPrivateChat,
                    isGroupChat: isGroupChat,
                    // {{message_last}} in subAiUserPrompt will be resolved by substituteVariables from DB
                };

                const subAiLimits = {
                    chatHistoryLimit: config.chatHistoryLimit,
                    messageHistoryLimit: config.messageHistoryLimit,
                };

                try {
                    const messagesForSubAI: OpenAIMessage[] = [];
                    if (subAiSystemPrompt && subAiSystemPrompt.trim() !== "") {
                        const processedSystemPrompt = await substituteVariables(subAiSystemPrompt, contextForSubAi, subAiLimits);
                        if (processedSystemPrompt && processedSystemPrompt.trim() !== "") {
                            messagesForSubAI.push({ role: 'system', content: processedSystemPrompt });
                        }
                    }
                    const processedUserPrompt = await substituteVariables(subAiUserPrompt, contextForSubAi, subAiLimits);
                    messagesForSubAI.push({ role: 'user', content: processedUserPrompt });
 
                    log('debug', `Calling Sub-AI for quantitative trigger (${configSource} '${config.name}'). Model: ${config.aiTriggerModel}`, {
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
                        serverInstance!.log // Assert serverInstance is not null here
                    );
                    const subAiResponseContent = (subAiResponseObj && typeof subAiResponseObj === 'object' && 'content' in subAiResponseObj)
                        ? (subAiResponseObj.content || "").trim()
                        : (subAiResponseObj as string | null || "").trim();

                    log('info', `Quantitative Sub-AI response for ${configSource} '${config.name}': "${subAiResponseContent}" (Keyword: "${config.aiTriggerKeyword}")`);
 
                    let mainAiShouldBeTriggeredByQuantitative = false;
                    if (config.aiTriggerKeywordFuzzyMatch) {
                        if (config.aiTriggerKeyword && subAiResponseContent.includes(config.aiTriggerKeyword)) {
                            mainAiShouldBeTriggeredByQuantitative = true;
                        }
                    } else {
                        if (subAiResponseContent === config.aiTriggerKeyword) {
                            mainAiShouldBeTriggeredByQuantitative = true;
                        }
                    }

                    if (mainAiShouldBeTriggeredByQuantitative) {
                        log('info', `Quantitative Sub-AI for ${configSource} '${config.name}' indicates MAIN AI trigger. Processing main AI with current message.`);
                        shouldProcessAI = true; // This will make the subsequent block execute
                    } else {
                        log('info', `Quantitative Sub-AI for ${configSource} '${config.name}' did NOT indicate main AI trigger.`);
                    }
                } catch (subAiError: any) {
                    log('error', `Error executing quantitative Sub-AI for ${configSource} '${config.name}': ${subAiError.message}`, subAiError);
                }
            } else {
                log('debug', `Quantitative trigger for ${configSource} '${config.name}' met threshold, but Sub-AI parameters (API Key, Model, Keyword, or User Prompt) are not fully configured. Skipping Sub-AI call.`);
            }
        }
    }
    // --- End Quantitative Trigger Check ---
 
    if (!shouldProcessAI) {
        log('debug', `消息未触发机器人 (基于配置: ${config.name}, 来源: ${configSource}, 所有适用触发器均未满足)`);
        return; // Stop processing for this config if not triggered
    }

    // --- Process Main AI and Respond ---
    try {
        log('debug', `机器人已触发 (配置: ${config.name}, 来源: ${configSource}, Mode: ${config.mode})，准备处理主AI...`);

        // --- Log Processed User Message to History ---
        // This is done here because we now have the config (for mode) and selfId
        if (serverInstance?.log) {
            const processedUserTextForHistory = transformUserTextForHistory(
                originalUserMessageText
            );
            const processedUserContentForHistory = transformUserMessageContentForHistory(
                originalUserMessageContent
            );
 
            if (processedUserTextForHistory.trim()) {
                await addHistoryItem(
                    contextType,
                    contextId,
                    userId, // User's ID
                    DbRole.USER,
                    processedUserTextForHistory,
                    variableContext.timestamp, // Use timestamp from variableContext (derived from event.time)
                    event.message_id.toString(),
                    userName,
                    undefined // botName for user message is undefined
                );
                log('trace', `用户消息 (处理后) 已存入对话历史 (${configSource}: ${config.name})`);
                // Cleanup ChatHistory based on config limits
                await cleanupOldHistory(contextType, contextId, config.chatHistoryLimit, serverInstance.log);
            }

            // 用户消息已在handleMessageEvent中记录到MessageHistory，这里不再重复记录
            // 只清理旧的MessageHistory记录
            await cleanupOldMessageHistory(contextType, contextId, config.messageHistoryLimit || config.chatHistoryLimit, serverInstance.log);
        } else {
            console.error('[message-handler] Logger not available for logging processed user message history.');
        }
        // --- End of Logging Processed User Message ---

        // Fetch chat history for AI context (this history already exists and is not the one we just logged)
        const MAX_HISTORY_FETCH = config.chatHistoryLimit || 10;
        const historyItems: ChatHistoryItem[] = await getHistoryItems(contextType, contextId, MAX_HISTORY_FETCH);
        log('trace', `获取了 ${historyItems.length} 条对话历史记录 (上限: ${MAX_HISTORY_FETCH}) for ${configSource}`);

        // Process preset/disguise content
        // Add replayValue and new status flags to the variableContext passed to processPreset
        const contextForPreset = {
            ...variableContext,
            replayContent: replayValue,
            isReply: isReply,
            isPrivateChat: isPrivateChat,
            isGroupChat: isGroupChat,
            message: originalUserMessageText // 添加 message 字段，确保用户输入文本可用于 {{user_input}} 变量
        };
        log('trace', `Context for preset processing (${configSource}: ${config.name}):`, contextForPreset);
        
        // --- Process User Input for {{...}} commands before sending to AI ---
        log('trace', `处理用户输入中的 set 指令 (仅处理 {{...}}): "${originalUserMessageText.substring(0, 200)}..."`);
        // Use contextForPreset as it contains all necessary fields for variable processing
        const processedUserInputText = await processAndStripSetCommands(originalUserMessageText, contextForPreset, 'user');
        log('trace', `处理用户输入 set 指令后 (发送给AI的内容): "${processedUserInputText.substring(0, 200)}..."`);
        // --- End User Input Processing ---

        // --- Call New Main AI Processor ---
        // `processedUserInputText` now has {{...}} stripped, but [[...]] preserved.
        // `repliedMessageIdParam` is the ID of the message being replied to, if any.
        // Pass the full sender details and reply content to the main AI processor

        // Extract image items from originalUserMessageContent (parameter of handleConfigurationProcessing)
        // originalUserMessageContent is UserMessageContentItem[]
        const userImageItemsForAI = originalUserMessageContent
            .filter((item): item is Extract<UserMessageContentItem, { type: 'image_url' }> =>
                item.type === 'image_url' && !!item.image_url // Ensure item.image_url is truthy
            )
            .map(item => ({ // item is now correctly typed as Extract<UserMessageContentItem, { type: 'image_url' }>
                type: 'image_url' as 'image_url',
                image_url: { url: item.image_url.url, ...((item.image_url as any).detail && { detail: (item.image_url as any).detail }) }
            }));

        let aiResponseContent = await processAndExecuteMainAi(
            config,                     // The preset or disguise config
            contextType,                // PRIVATE or GROUP
            contextId,                  // Group ID or User ID (depending on contextType)
            userId,                     // Always the sender's User ID (senderUserId in target function)
            senderNickname,             // Use the new parameter
            senderCard,                 // Use the new parameter
            processedUserInputText,     // User's message after stripping {{set...}} (userInputText in target)
            userImageItemsForAI.length > 0 ? userImageItemsForAI : undefined, // NEW: userImageItems
            serverInstance!,            // Fastify instance
            repliedMessageIdParam,      // ID of the message being replied to (optional, replyToMessageId in target)
            replayValue,                // Use the existing parameter 'replayValue' (replyToContent in target)
            repliedMessageImageUrls     // 新增：传递被回复消息的图片URL数组
        );
        // `processAndExecuteMainAi` now handles:
        // - Building a complete VariableContext
        // - Processing config.content with substituteVariables (handling {{user_input}}, {{chat_history}}, etc.)
        // - Calling callOpenAI with appropriate parameters (including web search if configured)
        // - Returning the AI's textual response or null.
 
        if (aiResponseContent) {
            const botResponseTimestamp = new Date(userMessageTimestamp.getTime() + 100); // <<<< 修改：基于用户消息时间戳
            // +++ Process and strip set commands from AI response +++
            // The contextForPreset is suitable here as it contains all necessary fields for set command processing.
            log('trace', `原始 AI 响应内容 (处理 set 指令前): "${aiResponseContent.substring(0, 200)}..."`);
            aiResponseContent = await processAndStripSetCommands(aiResponseContent, contextForPreset, 'ai'); // Added 'ai' source
            log('trace', `处理 set 指令后 AI 响应内容: "${aiResponseContent.substring(0, 200)}..."`);
            // +++ End of set command processing +++
 
            // Proceed only if there's content left after stripping set commands
            if (!aiResponseContent) {
                log('info', `AI 响应在移除 set 指令后为空，不再继续处理 (${configSource}: ${config.name})`);
                return;
            }

            let actualStandardMessageId: string | null = null; // Declare here for wider scope
            try {
                // Handle response based on mode (Advanced/Standard)
                if (config.mode === 'ADVANCED') {
                    log('debug', `高级模式 (${configSource}: ${config.name})：解析 AI 响应...`);
                    
                    // // 原先的高级模式 ChatHistory 记录逻辑 (基于 <message> 标签) 已被注释/移除
                    // const messageTagRegex = /<message>(.*?)<\/message>/gs;
                    // const allMessageContents: string[] = [];
                    // let match;
                    // while ((match = messageTagRegex.exec(aiResponseContent)) !== null) {
                    //     if (match[1] && match[1].trim()) {
                    //         allMessageContents.push(match[1].trim());
                    //     }
                    // }
                    // const historyContent = allMessageContents.length > 0 
                    //     ? allMessageContents.join('\n\n') 
                    //     : ''; 
                    // const chatHistoryMessageId = `bot_advanced_chat_${configSource}_${Date.now()}`;
                    // if (serverInstance?.log && botId && allMessageContents.length > 0) {
                    //     await addHistoryItem(
                    //         contextType, contextId, botId || 'assistant', DbRole.ASSISTANT,
                    //         historyContent, botResponseTimestamp, chatHistoryMessageId,
                    //         config.botName || '', config.botName || ''
                    //     );
                    //     log('trace', `高级模式：<message> 内容已记录到对话历史 (ChatHistory ID: ${chatHistoryMessageId})`);
                    // } else if (allMessageContents.length === 0) {
                    //     log('debug', `高级模式：未找到<message>标签内容，跳过旧版对话历史记录`);
                    // }
                    
                    // 继续正常的高级模式消息解析和发送流程
                    const operations = parseAdvancedResponse(aiResponseContent);
                    log('trace', '解析结果:', operations);
                    if (operations.length > 0) {
                        const delayMs = config.advancedModeMessageDelay;
                        const safeDelay = Math.max(100, Math.min(delayMs, 5000));
                        
                        // 用于收集所有文本内容以便合并记录到消息历史
                        let allTextSegments: OneBotMessageSegment[] = [];
                        let hasVoice = false;
                        
                        for (let i = 0; i < operations.length; i++) {
                            const operation = operations[i];
                            if (i > 0) {
                                log('trace', `高级模式：应用延时 ${safeDelay}ms`);
                                await new Promise(resolve => setTimeout(resolve, safeDelay));
                            }
                            if (operation.type === 'send_message') {
                                if (operation.segments.length > 0) {
                                    const actionParams = event.message_type === 'private'
                                        ? { user_id: event.user_id, message: operation.segments }
                                        : { group_id: (event as OneBotGroupMessageEvent).group_id, message: operation.segments };
                                    const actionType = event.message_type === 'private' ? 'send_private_msg' : 'send_group_msg';

                                    const sendResponse = await sendOneBotAction({ action: actionType, params: actionParams });
                                    const operationTimestamp = new Date(); // 为此操作获取当前时间戳

                                    if (sendResponse && sendResponse.status === 'ok' && sendResponse.retcode === 0) {
                                        log('info', `[高级-${configSource}] (操作 ${i + 1}/${operations.length}) 发送成功 for ${contextType}:${contextId} (User:${userId}, Config:${config.name}, BotID:${botId}). Segments: ${JSON.stringify(operation.segments)}`);
                                        const messageIdForDb = sendResponse.data?.message_id ? String(sendResponse.data.message_id) : `bot_adv_msg_${configSource}_${Date.now()}_${i}`;

                                        if (serverInstance?.log && botId) {
                                            // 分条记录到 MessageHistory
                                            const effectiveBotUserIdForAdvMsg = botId || config.botName?.trim() || 'BOT_INTERNAL_ID';
                                            await logMessage({
                                                contextType, contextId, userId: effectiveBotUserIdForAdvMsg,
                                                userName: config.botName || '', botName: config.botName || '',
                                                messageId: messageIdForDb,
                                                rawMessage: convertOneBotSegmentsToUserContentItems(operation.segments),
                                            }, operationTimestamp, serverInstance.log);
                                            log('trace', `[高级-${configSource}] 消息操作已存入消息历史 (ID: ${messageIdForDb})`);

                                            // 分条记录到 ChatHistory
                                            const chatContent = operation.segments
                                                .map(seg => {
                                                    if (seg.type === 'text' && seg.data.text) {
                                                        return seg.data.text.trim();
                                                    } else if (seg.type === 'at' && seg.data.qq) {
                                                        return `[@${seg.data.qq}]`;
                                                    }
                                                    return '';
                                                })
                                                .filter(text => text)
                                                .join(' ')
                                                .trim();
                                            if (chatContent) {
                                                const chatHistoryOpId = `bot_adv_chat_msg_${configSource}_${Date.now()}_${i}`;
                                                await addHistoryItem(
                                                    contextType, contextId, botId, DbRole.ASSISTANT,
                                                    chatContent, operationTimestamp, chatHistoryOpId,
                                                    config.botName || '', config.botName || ''
                                                );
                                                log('trace', `[高级-${configSource}] 消息操作文本已存入对话历史 (ID: ${chatHistoryOpId})`);
                                            }
                                        }
                                        allTextSegments = allTextSegments.concat(operation.segments);
                                    } else {
                                        log('warn', `[高级-${configSource}] OneBot发送操作失败 (操作 ${i + 1}/${operations.length}) for ${contextType}:${contextId} (User:${userId}, Config:${config.name}, BotID:${botId}). Action: ${actionType}, Params: ${JSON.stringify(actionParams)}. OneBot Response: ${JSON.stringify(sendResponse)}`);
                                        throw new Error(`OneBot action failed in advanced mode operation ${i + 1} for config ${config.name}. Response: ${JSON.stringify(sendResponse)}`);
                                    }
                                } else {
                                    log('warn', `[高级-${configSource}] 解析到一个空的 send_message 操作，已跳过`);
                                }
                            } else if (operation.type === 'send_voice') {
                                hasVoice = true;
                                try {
                                    const qqVoicePlugin = getPlugin<any>('qq-voice') as QQVoicePlugin | undefined;
                                    if (qqVoicePlugin && qqVoicePlugin.config.enabled && config.allowVoiceOutput) {
                                        if (event.message_type === 'group') {
                                            await qqVoicePlugin.synthesize(operation.text, { groupId: contextId });
                                            const operationTimestamp = new Date(); // 为此操作获取当前时间戳
                                            log('info', `[高级-${configSource}] 通过 QQ Voice 插件触发群聊语音发送 [群:${contextId}]`);
                                            
                                            const voiceMessageIdForDb = `bot_adv_voice_${configSource}_${Date.now()}_${i}`;
                                            const voiceTextContent = `[语音消息] ${operation.text.trim()}`;

                                            if (serverInstance?.log && botId) {
                                                // 分条记录到 MessageHistory
                                                const effectiveBotUserIdForAdvVoice = botId || config.botName?.trim() || 'BOT_INTERNAL_ID';
                                                await logMessage({
                                                    contextType, contextId, userId: effectiveBotUserIdForAdvVoice,
                                                    userName: config.botName || '', botName: config.botName || '',
                                                    messageId: voiceMessageIdForDb,
                                                    rawMessage: [{ type: 'text', text: voiceTextContent }],
                                                }, operationTimestamp, serverInstance.log);
                                                log('trace', `[高级-${configSource}] 语音操作已存入消息历史 (ID: ${voiceMessageIdForDb})`);

                                                // 分条记录到 ChatHistory
                                                const chatHistoryVoiceOpId = `bot_adv_chat_voice_${configSource}_${Date.now()}_${i}`;
                                                await addHistoryItem(
                                                    contextType, contextId, botId, DbRole.ASSISTANT,
                                                    voiceTextContent, operationTimestamp, chatHistoryVoiceOpId,
                                                    config.botName || '', config.botName || ''
                                                );
                                                log('trace', `[高级-${configSource}] 语音操作文本已存入对话历史 (ID: ${chatHistoryVoiceOpId})`);
                                            }

                                            // 收集所有消息段 (如果 allTextSegments 仍有其他用途)
                                            allTextSegments.push({
                                                type: 'text',
                                                data: { text: voiceTextContent }
                                            });
                                        } else {
                                            log('warn', `[高级-${configSource}] 尝试在私聊中发送语音，但 QQ Voice 插件仅支持群聊。将忽略此语音操作。`);
                                        }
                                    } else if (!config.allowVoiceOutput) {
                                        log('warn', `[高级-${configSource}] 尝试发送语音，但当前配置已禁用语音输出。将忽略此语音操作。`);
                                    } else if (!qqVoicePlugin || !qqVoicePlugin.config.enabled) {
                                        log('warn', `[高级-${configSource}] 尝试发送语音，但 QQ Voice 插件未找到或未启用。将忽略此语音操作。`);
                                    }
                                } catch (pluginError: any) {
                                    log('error', `[高级-${configSource}] 使用 QQ Voice 插件发送语音失败: ${pluginError.message}`, pluginError);
                                }
                            }
                        }
                        // 聚合记录 MessageHistory 和 ChatHistory 的逻辑已移除，改为在循环内分条记录
                    } else {
                         log('warn', `[高级-${configSource}] AI 响应解析后未产生任何有效操作。`);
                    }
                } else { // Standard Mode
                    log('debug', `标准模式 (${configSource}: ${config.name})：处理 AI 响应...`);
                    let standardMessageLoggedToHistory = false; // Flag to track if message was logged
                    // actualStandardMessageId is now declared above

                    // --- Voice Output Handling (Standard Mode) ---
                    let standardVoiceSent = false;
                    if (config.allowVoiceOutput) {
                        try {
                            const qqVoicePlugin = getPlugin<any>('qq-voice') as QQVoicePlugin | undefined;
                            if (qqVoicePlugin && qqVoicePlugin.config.enabled) {
                                if (event.message_type === 'group') {
                                    await qqVoicePlugin.synthesize(aiResponseContent, { groupId: contextId });
                                    log('info', `[标准-${configSource}] 已通过 QQ Voice 插件触发群聊语音发送 [群:${contextId}]`);
                                    standardVoiceSent = true;
                                    // 记录标准模式语音到消息历史 (使用内部ID，因为插件可能不返回可回复ID)
                                    if (serverInstance?.log && botId) { // Changed selfId to botId
                                        const voiceMsgId = `bot_voice_${configSource}_std_${Date.now()}`;
                                        const effectiveBotUserIdForStdVoice = botId || config.botName?.trim() || 'BOT_INTERNAL_ID';
                                        await logMessage({
                                            contextType, contextId, userId: effectiveBotUserIdForStdVoice,
                                            userName: config.botName || '', botName: config.botName || '',
                                            messageId: voiceMsgId,
                                            rawMessage: [{ type: 'text', text: `[语音消息] ${aiResponseContent}` }] as any,
                                        }, new Date(), serverInstance.log); // 使用当前本地时间
                                        log('trace', `[标准-${configSource}] 语音消息已存入消息历史 (ID: ${voiceMsgId})`);
                                        standardMessageLoggedToHistory = true; // Mark as logged
                                        actualStandardMessageId = voiceMsgId; // Store this ID for ChatHistory
                                    }
                                } else {
                                    log('debug', `[标准-${configSource}] QQ Voice 插件仅支持群聊语音，私聊将发送文本。`);
                                }
                            }
                        } catch (pluginError: any) {
                            log('error', `[标准-${configSource}] 使用 QQ Voice 插件发送语音失败: ${pluginError.message}`, pluginError);
                        }
                    } else {
                        log('debug', `[标准-${configSource}] 当前配置已禁用语音输出，将只发送文本消息。`);
                    }

                    // --- Text Output Handling (Standard Mode, if voice not sent) ---
                    if (!standardVoiceSent) {
                        const actionParams = event.message_type === 'private'
                            ? { user_id: event.user_id, message: aiResponseContent }
                            : { group_id: (event as OneBotGroupMessageEvent).group_id, message: aiResponseContent };
                        const actionType = event.message_type === 'private' ? 'send_private_msg' : 'send_group_msg';

                        const sendResponse = await sendOneBotAction({ action: actionType, params: actionParams });

                        if (sendResponse && sendResponse.status === 'ok' && sendResponse.retcode === 0) {
                            log('info', `[标准-${configSource}] 发送成功 for ${contextType}:${contextId} (User:${userId}, Config:${config.name}, BotID:${botId}). Content: ${aiResponseContent.substring(0,100)}...`);
                            actualStandardMessageId = sendResponse.data?.message_id ? String(sendResponse.data.message_id) : null;

                            if (actualStandardMessageId && serverInstance?.log && botId !== undefined) {
                                const effectiveBotUserIdForStdMsg = botId || config.botName?.trim() || 'BOT_INTERNAL_ID';
                                await logMessage({
                                    contextType, contextId, userId: effectiveBotUserIdForStdMsg,
                                    userName: config.botName || '', botName: config.botName || '',
                                    messageId: actualStandardMessageId,
                                    rawMessage: [{ type: 'text', text: aiResponseContent }] as any,
                                }, new Date(), serverInstance.log);
                                log('trace', `[标准-${configSource}] ${event.message_type === 'private' ? '私聊' : '群聊'}文本消息已存入消息历史 (真实ID: ${actualStandardMessageId})`);
                                standardMessageLoggedToHistory = true;
                            } else if (serverInstance?.log && botId) { // This condition implies actualStandardMessageId was null or botId was undefined (though caught by outer if)
                                log('warn', `[标准-${configSource}] 发送${event.message_type === 'private' ? '私聊' : '群聊'}文本消息成功但未能获取真实 message_id (or logger/botId unavailable) for config ${config.name}. OneBot Response: ${JSON.stringify(sendResponse)}`);
                                actualStandardMessageId = `bot_text_${configSource}_fallback_${Date.now()}`; // Fallback for ChatHistory
                            }
                        } else {
                            log('warn', `[标准-${configSource}] OneBot发送操作失败 for ${contextType}:${contextId} (User:${userId}, Config:${config.name}, BotID:${botId}). Action: ${actionType}, Params: ${JSON.stringify(actionParams)}. OneBot Response: ${JSON.stringify(sendResponse)}`);
                            actualStandardMessageId = null; // Ensure no history is logged with a bad ID
                            throw new Error(`OneBot action failed in standard mode for config ${config.name}. Response: ${JSON.stringify(sendResponse)}`);
                        }
                    }
                }

                // --- Record AI response to ChatHistory (only for standard mode, advanced mode records its own history as per new logic) ---
                if (aiResponseContent && serverInstance?.log && botId && config.mode !== 'ADVANCED') { 
                    log('trace', `准备保存 AI 对话历史记录 (${configSource}: ${config.name})...`);
                    const effectiveBotId = botId || 'assistant'; 
                    const chatHistoryMessageId = actualStandardMessageId || `bot_chat_entry_${configSource}_${Date.now()}`;

                    // const assistantReplyTimestamp = botResponseTimestamp; // 此行不再准确反映实际记录时间
                    await addHistoryItem(
                        contextType, contextId, effectiveBotId, DbRole.ASSISTANT,
                        aiResponseContent, new Date(), chatHistoryMessageId, // 使用当前本地时间
                        config.botName || '', config.botName || ''
                    );
                    log('trace', `AI 回复 (${configSource}: ${config.name}) 已存入对话历史 (ChatHistory ID: ${chatHistoryMessageId})`);
                }
                
                // Cleanup histories (for both modes)
                if (serverInstance?.log) {
                    await cleanupOldHistory(contextType, contextId, config.chatHistoryLimit, serverInstance.log);
                    await cleanupOldMessageHistory(contextType, contextId, config.messageHistoryLimit || config.chatHistoryLimit, serverInstance.log);
                }

            } catch (sendError: any) {
                const errorContext = {
                    configSource,
                    configName: config.name,
                    configId: config.id,
                    contextType,
                    contextId,
                    userId,
                    botId,
                    mode: config.mode,
                };
                // Check if sendError is one of our custom thrown errors
                if (sendError && typeof sendError === 'object' && sendError.message && sendError.message.startsWith('OneBot action failed')) {
                    log('error', `发送OneBot Action时出错 (${configSource}: ${config.name}). Error: ${sendError.message}`, { context: errorContext });
                } else {
                    // For other errors (network, DB issues, unexpected exceptions)
                    log('error', `处理AI响应或后续操作时发生意外错误 (${configSource}: ${config.name}). Error: ${sendError instanceof Error ? sendError.message : String(sendError)}`, { context: errorContext, stack: sendError instanceof Error ? sendError.stack : undefined, originalErrorDetails: JSON.stringify(sendError, Object.getOwnPropertyNames(sendError)) });
                }
            }
        } else {
            log('error', `未能从 AI 获取有效回复 (${configSource}: ${config.name})`);
        }
    } catch (processingError) {
        log('error', `处理配置 ${config.name} (来源: ${configSource}) 时发生错误:`, processingError);
    }
}


async function handleMessageEvent(event: OneBotMessageEvent) {
    if (event.self_id && event.user_id === event.self_id) {
        return; // Ignore messages sent by the bot itself
    }
 
    // const selfId = event.self_id?.toString(); // --- selfId is already removed from event ---
    const userId = event.user_id.toString();
    const timestamp = new Date(); // 使用本地服务器时间，不再使用 event.time

    let contextType: DbContextType;
    let contextId: string;
    let userName: string | undefined;
    let userNicknameForContext: string | undefined;
    let userCardForContext: string | undefined;
    let groupIdForContext: string | undefined;

    if (event.message_type === 'private') {
        contextType = DbContextType.PRIVATE;
        contextId = userId;
        userName = (event as OneBotPrivateMessageEvent).sender.nickname;
        userNicknameForContext = userName;
    } else if (event.message_type === 'group') {
        const groupEvent = event as OneBotGroupMessageEvent;
        contextType = DbContextType.GROUP;
        contextId = groupEvent.group_id.toString();
        userName = groupEvent.sender.card || groupEvent.sender.nickname;
        userNicknameForContext = groupEvent.sender.nickname;
        userCardForContext = groupEvent.sender.card;
        groupIdForContext = contextId;
    } else {
        log('warn', '收到未知类型的消息事件');
        return;
    }

    // Ensure logger is available
    if (!serverInstance?.log) {
        console.error('Logger instance is not available in message handler. Skipping processing.');
        return;
    }

    // --- Access Control Check ---
    const accessCheckContextType = contextType.toLowerCase() as 'private' | 'group';
    const isAllowed = await checkAccess(accessCheckContextType, contextId, serverInstance.log);
    if (!isAllowed) {
        log('info', `消息来源 ${contextType}:${contextId} (User: ${userId}) 未通过访问控制，已忽略`);
        return;
    }
    log('trace', `消息来源 ${contextType}:${contextId} (User: ${userId}) 通过访问控制`);

    // --- Get App Settings ---
    const appSettings = await getAppSettings(serverInstance.log);
    if (!appSettings) {
        log('error', '无法获取应用设置，跳过消息处理');
        return;
    }
    const botId = appSettings.botId; // botId is already being fetched from settings
 
    // --- Parse User Message ---
    // Need to parse message early to get mentionedSelf status and content for logging
    // We pass a temporary allowImageInput=true, the actual check happens within handleConfigurationProcessing
    // Destructure to let for mutable displayMessage and userMessageContent
    const parseResult = await parseOneBotMessage(
        event.message,
        true, // Temporarily allow image for parsing, actual logic uses config.allowImageInput
        botId ?? undefined // Changed selfId to botId, ensure undefined if null
    );
    let userMessageContent = parseResult.contentItems; // Now mutable
    let displayMessage = parseResult.displayMessage;   // Now mutable
    const mentionedSelf = parseResult.mentionedSelf;
    const repliedMessageId = parseResult.repliedMessageId;


    // --- Prepare Formatted Replay String for Variable Context ---
    let formattedReplayString = ""; // Default to empty string if not a reply
    let parsedRepliedImageUrls: string[] = []; // 新增：用于存储从被回复消息中解析出的图片URL

    if (repliedMessageId) { // Only proceed if it's actually a reply
        if (serverInstance?.log) {
            log('debug', `检测到回复消息，被回复的消息 ID: ${repliedMessageId}。尝试获取其内容和图片URL。`);
            const repliedMessageData = await getMessageByMessageId(repliedMessageId, serverInstance.log);

            if (repliedMessageData) { // Successfully fetched replied message data
                // 处理文本内容
                let repliedTextContent = extractPlainTextFromRepliedMessage(repliedMessageData.rawMessage);
                if (!repliedTextContent.trim()) {
                    repliedTextContent = "空";
                }
                const ts = new Date(repliedMessageData.timestamp);
                const pad = (num: number) => String(num).padStart(2, '0');
                const dateStr = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}`;
                const timeStr = `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
                formattedReplayString = `(user_id: ${repliedMessageData.userId}, user_name: ${repliedMessageData.userName || '未知用户'}, date: ${dateStr}, time: ${timeStr}): ${repliedTextContent}`;
                log('trace', `格式化的回复文本内容 (formattedReplayString): "${formattedReplayString.substring(0, 200)}..."`);

                // 处理图片URL
                if (repliedMessageData.imageUrls) { // imageUrls 是 String? (JSON 字符串或 null)
                    try {
                        const parsed = JSON.parse(repliedMessageData.imageUrls);
                        if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
                            parsedRepliedImageUrls = parsed;
                            log('trace', `从被回复消息中成功解析 ${parsedRepliedImageUrls.length} 个图片URL。`);
                        } else {
                            log('warn', `解析被回复消息的 imageUrls 失败 (非数组或元素非字符串): ${repliedMessageData.imageUrls}`);
                        }
                    } catch (e) {
                        log('error', `JSON 解析被回复消息的 imageUrls 失败: ${repliedMessageData.imageUrls}`, e);
                    }
                } else {
                    log('trace', '被回复消息中没有 imageUrls 字段或为 null。');
                }
            } else {
                log('debug', `未能在消息历史中找到被回复的消息 (ID: ${repliedMessageId})，{{replay}} 变量将设为 "空"，图片URL为空数组。`);
                formattedReplayString = "空";
            }
        } else {
            log('warn', `RepliedMessageId (${repliedMessageId}) 存在但 logger 不可用。{{replay}} 变量将设为 "空"，图片URL为空数组。`);
            formattedReplayString = "空";
        }
    }
    // If repliedMessageId was null from the start (not a reply message), formattedReplayString remains ""
    // --- End of Preparing Formatted Replay String ---

    // Determine new status values
    const isReplyValue = repliedMessageId ? "yes" : "no";
    const isPrivateChatValue = (event.message_type === 'private') ? "yes" : "no";
    const isGroupChatValue = (event.message_type === 'group') ? "yes" : "no";
    log('trace', `Status flags: isReply=${isReplyValue}, isPrivate=${isPrivateChatValue}, isGroup=${isGroupChatValue}`);

// --- 检查消息是否是回复机器人的消息 (isReplyToBot) ---
    // repliedMessageId 是由 parseOneBotMessage 从消息中提取的，如果消息是回复，它就是被回复消息的ID。
    // botId 是机器人自身的ID (从设置获取)。
    let isReplyToBot = false; // Default to false
    if (repliedMessageId && botId && serverInstance?.log) { // botId is already used here
        // 只有当消息确实是一个回复 (repliedMessageId 有值) 并且我们能获取机器人自身ID和日志服务时，才进行检查
        log('debug', `当前消息是一个回复，被回复的消息 ID (来自 parseOneBotMessage): ${repliedMessageId}。检查是否回复了机器人 (Bot ID: ${botId})。`);
        const repliedMessageDataFromDb = await getMessageByMessageId(repliedMessageId, serverInstance.log);
        
        if (repliedMessageDataFromDb) {
            if (repliedMessageDataFromDb.userId === botId) { // botId is already used here
                isReplyToBot = true;
                log('debug', `确认回复了机器人 (被回复消息发送者ID: ${repliedMessageDataFromDb.userId} === botId: ${botId})。`);
            } else {
                log('debug', `回复了其他用户 (被回复消息发送者ID: ${repliedMessageDataFromDb.userId} !== botId: ${botId})，不是机器人。`);
            }
        } else {
            // 虽然是回复事件，但在消息历史中未找到被回复的消息。
            // 这可能是因为被回复的消息太旧已被清理，或者记录时出了问题。
            // 在这种情况下，我们不能确认它是否回复了机器人。保守起见，isReplyToBot 保持 false。
            log('debug', `在消息历史中未找到被回复的消息 (ID: ${repliedMessageId})，无法确认是否回复机器人。isReplyToBot 将为 false。`);
        }
    }
    // --- End of 检查消息是否是回复机器人的消息 ---

    // Log initial message info
     if (event.message_type === 'private') {
        log('info', `收到私聊消息 [${userId} (${userName || '未知昵称'})]: ${displayMessage}`);
    } else if (event.message_type === 'group') {
        log('info', `收到群聊消息 [群:${contextId}, 人:${userId} (${userName || '未知名称'})]: ${displayMessage}`);
    }

    // 始终将用户消息记录到消息历史中，无论是否触发了机器人
    // 这样消息历史将包含所有消息，而不仅仅是触发了机器人的消息
    if (serverInstance?.log) {
        try {
            // 首先检查是否有适用的预设或伪装配置，以使用其模式来处理@消息
            let configMode = 'STANDARD'; // 默认使用标准模式
            
            // 如果伪装功能启用，先尝试获取伪装配置
            if (appSettings.disguiseFeatureEnabled) {
                const disguiseConfig = await getApplicableDisguisePreset(contextType, contextId);
                if (disguiseConfig) {
                    configMode = disguiseConfig.mode;
                    log('trace', `使用伪装配置 ${disguiseConfig.name} 的模式 (${configMode}) 处理消息历史`);
                }
            }
            
            // 如果没有找到伪装配置，并且预设功能启用，尝试获取预设配置
            if (configMode === 'STANDARD' && appSettings.presetFeatureEnabled) {
                const presetConfig = await getApplicablePreset(contextType, contextId);
                if (presetConfig) {
                    configMode = presetConfig.mode;
                    log('trace', `使用预设配置 ${presetConfig.name} 的模式 (${configMode}) 处理消息历史`);
                }
            }
            
            // 根据确定的模式处理消息内容
            const processedMessageContent = transformUserMessageContentForHistory(
                userMessageContent
            );
            
            // 从 userMessageContent 中提取图片 URL 数组用于存储
            const imageUrlsToStore: string[] = userMessageContent
                .filter((item): item is Extract<UserMessageContentItem, { type: 'image_url' }> =>
                    item.type === 'image_url' && typeof item.image_url?.url === 'string'
                )
                .map(item => item.image_url.url);

            await logMessage({
                contextType,
                contextId,
                userId,
                userName,
                botName: undefined, // 用户消息没有botName
                messageId: event.message_id.toString(),
                rawMessage: processedMessageContent as any,
                imageUrls: imageUrlsToStore.length > 0 ? imageUrlsToStore : undefined, // 如果为空数组则传递 undefined
            }, timestamp, serverInstance.log); // timestamp is userMessageTimestamp
            log('trace', `用户原始消息已存入消息历史 [${contextType}:${contextId}, 用户:${userId}] (模式: ${configMode}, 图片数: ${imageUrlsToStore.length})`);

            // --- Quantitative Trigger Counting ---
            // This must happen AFTER the message is logged to MessageHistory,
            // as the count is based on messages in MessageHistory.
            let applicableConfigForCounting: Preset | DisguisePreset | null = null;
            if (appSettings.disguiseFeatureEnabled) {
                const disguiseConfig = await getApplicableDisguisePreset(contextType, contextId);
                if (disguiseConfig) {
                    applicableConfigForCounting = disguiseConfig;
                }
            }
            if (!applicableConfigForCounting && appSettings.presetFeatureEnabled) {
                const presetConfig = await getApplicablePreset(contextType, contextId);
                if (presetConfig) {
                    applicableConfigForCounting = presetConfig;
                }
            }

            if (applicableConfigForCounting && applicableConfigForCounting.quantitativeTriggerEnabled && applicableConfigForCounting.quantitativeTriggerThreshold && applicableConfigForCounting.quantitativeTriggerThreshold > 0) {
                const counterKey = `${contextType}:${contextId}`;
                const currentCount = quantitativeMessageCounters.get(counterKey) || 0;
                const newCount = currentCount + 1;
                quantitativeMessageCounters.set(counterKey, newCount);
                log('debug', `Quantitative trigger: Count for ${counterKey} incremented to ${newCount} (Threshold: ${applicableConfigForCounting.quantitativeTriggerThreshold})`);
            }
            // --- End Quantitative Trigger Counting ---
 
        } catch (logError) {
            log('error', `记录用户原始消息到消息历史或处理定量计数失败:`, logError);
        }
    }
  
    // --- Check if message has valid content for AI processing ---
    const hasTextContent = userMessageContent.some(item => item.type === 'text' && item.text.trim());
    const hasImageContent = userMessageContent.some(item => item.type === 'image_url');
    const isValidReplyTrigger = isReplyToBot && repliedMessageId; // 回复触发是否有效
    
    // 如果既没有文本内容，又没有图片内容，并且不是有效的回复触发，则跳过AI处理
    if (!hasTextContent && !hasImageContent && !isValidReplyTrigger) {
        log('debug', '消息不包含有效内容 (文本、图片或回复触发)，跳过 AI 处理');
        return;
    }
    
    // 如果是纯回复触发(没有其他内容)，确保userMessageContent至少有一个空的文本项
    if (isValidReplyTrigger && !hasTextContent && !hasImageContent) {
        userMessageContent.push({ type: 'text', text: '' });
        log('debug', '检测到纯回复触发，已添加空文本项以确保处理继续');
    }
    // Note: Image input check is now inside handleConfigurationProcessing

    // --- Prepare Variable Context ---
    // Bot name is determined per config, so set to undefined initially
    const variableContext: VariableContext = {
        timestamp, // This is userMessageTimestamp
        botId: botId ?? undefined, // Changed selfId to botId, ensure undefined if null
        userId,
        userNickname: userNicknameForContext,
        userCard: userCardForContext,
        groupId: groupIdForContext,
        botName: undefined, // Will be set within handleConfigurationProcessing if needed
    };

    // --- Process Disguise (if enabled) ---
    if (appSettings.disguiseFeatureEnabled) {
        log('info', `伪装功能已启用，尝试获取并处理伪装配置 for ${contextType}:${contextId}`);
        const disguiseConfig = await getApplicableDisguisePreset(contextType, contextId);
        if (disguiseConfig) {
            // Pass a copy of variableContext to avoid modification conflicts if preset also runs
            await handleConfigurationProcessing(
                disguiseConfig,
                'disguise',
                event,
                userMessageContent, // This is the original user message content
                mentionedSelf,
                isReplyToBot, // 添加isReplyToBot参数
                { ...variableContext, botName: disguiseConfig.botName || undefined }, // param 7: variableContext
                contextType, // param 8
                contextId, // param 9
                userId, // param 10: Sender's User ID
                displayMessage, // param 11: originalUserMessageText
                userMessageContent, // param 12: originalUserMessageContent (this is the correct one from parseOneBotMessage for history)
                formattedReplayString, // param 13: Formatted content of the message being replied to
                isReplyValue, // param 14
                isPrivateChatValue, // param 15
                isGroupChatValue, // param 16
                userNicknameForContext, // param 17: Actual nickname
                userCardForContext,     // param 18: Actual group card name
                timestamp, // <<<< 传递 userMessageTimestamp
                repliedMessageId === null ? undefined : repliedMessageId, // param for repliedMessageIdParam
                parsedRepliedImageUrls.length > 0 ? parsedRepliedImageUrls : undefined, // param for repliedMessageImageUrls
                // Optional params at the end
                userName,
                botId ?? undefined
            );
        } else {
            log('info', `未找到适用伪装 for ${contextType}:${contextId}`);
        }
    } else {
        log('info', '伪装功能已禁用，跳过处理');
    }

    // --- Process Preset (if enabled) ---
    if (appSettings.presetFeatureEnabled) {
        log('info', `预设功能已启用，尝试获取并处理预设配置 for ${contextType}:${contextId}`);
        const presetConfig = await getApplicablePreset(contextType, contextId);
        if (presetConfig) {
             // Pass a copy of variableContext
            await handleConfigurationProcessing(
                presetConfig,
                'preset',
                event,
                userMessageContent, // Original user message content
                mentionedSelf,
                isReplyToBot, // 添加isReplyToBot参数
                { ...variableContext, botName: presetConfig.botName || undefined }, // param 7: variableContext
                contextType, // param 8
                contextId, // param 9
                userId, // param 10: Sender's User ID
                displayMessage, // param 11: originalUserMessageText
                userMessageContent, // param 12: originalUserMessageContent (this is the correct one from parseOneBotMessage for history)
                formattedReplayString, // param 13: Formatted content of the message being replied to
                isReplyValue, // param 14
                isPrivateChatValue, // param 15
                isGroupChatValue, // param 16
                userNicknameForContext, // param 17: Actual nickname
                userCardForContext,     // param 18: Actual group card name
                timestamp, // <<<< 传递 userMessageTimestamp
                repliedMessageId === null ? undefined : repliedMessageId, // param for repliedMessageIdParam
                parsedRepliedImageUrls.length > 0 ? parsedRepliedImageUrls : undefined, // param for repliedMessageImageUrls
                // Optional params at the end
                userName,
                botId ?? undefined
            );
        } else {
            log('info', `未找到适用预设 for ${contextType}:${contextId}`);
        }
    } else {
        log('info', '预设功能已禁用，跳过处理');
    }
}


export function initMessageHandler(fastifyInstance: FastifyInstance) {
    serverInstance = fastifyInstance;
    oneBotEmitter.on('onebot-message', handleMessageEvent);
    log('debug', 'OneBot 消息处理器已初始化');
}

export function stopMessageHandler() {
    oneBotEmitter.off('onebot-message', handleMessageEvent);
    log('info', 'OneBot 消息处理器已停止');
}
