// import { PrismaClient } from '@prisma/client'; // Replaced by shared instance
import { prisma } from '../db/prismaClient'; // Import the shared Prisma instance
import {
  PresetContent,
  PresetMessage,
  VariablePlaceholder,
  VariableContext,
   OpenAIMessage,
   ChatHistoryItem,
   OpenAIRole,
   UserMessageContentItem,
   ImageURL, // 确保导入 ImageURL 类型
 } from './types';
import { convertGifToJpegBase64 } from './image-utils'; // +++ Import image processing utility +++
 // Import message history fetching function
 import { getMessageHistory } from '../db/message_history';
 import { getHistoryItems } from '../db/history'; // Import getHistoryItems
 import { ContextType as DbContextType, Preset, DisguisePreset } from '@prisma/client'; // Import ContextType enum and Preset/DisguisePreset types
 import {
  getGlobalVariable,
  getLocalVariableDefinitionByName, // New import
  getLocalVariableInstance,         // New import
  upsertLocalVariableInstance     // New import
} from '../db/variables'; // +++ Import custom variable functions
// 导入处理@的函数
import { processAtMentionsInOpenAIMessages } from './message-utils';
 // Removed import of getSetting and SettingKey

 // Prisma Client is now initialized and imported from '../db/prismaClient'
 // const prisma = new PrismaClient(); // Removed

/**
 * 辅助函数：数字补零 (例如: 7 -> "07")
 * @param num 数字
 * @param length 目标长度 (通常是 2)
 * @returns 补零后的字符串
 */
function padZero(num: number, length: number = 2): string {
    return String(num).padStart(length, '0');
}


/**
 * 替换字符串中的变量 {{var_name}}
 * @param template 包含变量的模板字符串
 * @param context 包含变量值的上下文对象
 * @returns 替换后的字符串 (可能需要异步处理 message_history)
 */
// Modify substituteVariables to accept preset config for limits
export async function substituteVariables(template: string, context: VariableContext, presetConfig: { chatHistoryLimit: number, messageHistoryLimit: number }): Promise<string> {
  // +++ Log the incoming context for debugging {{message_last}} +++
  console.log('[substituteVariables] Received context:', JSON.stringify(context, null, 2));
  // 使用异步替换函数
  const promises: Promise<string>[] = [];
  template.replace(/\{\{([^}]*)\}\}/g, (match, variableName) => {
    let key = variableName.trim(); // Use let as key might be reassigned for base variable name
    // 将每个匹配的处理推入 Promise 数组
    promises.push((async () => {
        // 如果 key 为空字符串 (即 {{}}), 直接视为空变量处理
        if (key === '') {
            console.warn(`空的预设变量: {{}}`);
            return '';
        }

        let customLimit: number | undefined = undefined;
        let baseKey = key; // Store the original key or the base part if parameters are found

        // Try to parse chat_history::N
        const chatHistoryMatch = key.match(/^chat_history::(\d+)$/);
        if (chatHistoryMatch) {
            const parsedNum = parseInt(chatHistoryMatch[1], 10);
            if (!isNaN(parsedNum) && parsedNum >= 0) { // Allow 0 for no history, or positive for specific count
                customLimit = parsedNum;
            }
            baseKey = 'chat_history'; // Set baseKey for logic branching
        }

        // Try to parse message_history::N
        const messageHistoryMatch = key.match(/^message_history::(\d+)$/);
        if (messageHistoryMatch) {
            const parsedNum = parseInt(messageHistoryMatch[1], 10);
            if (!isNaN(parsedNum) && parsedNum >= 0) { // Allow 0 for no history
                customLimit = parsedNum;
            }
            baseKey = 'message_history'; // Set baseKey for logic branching
        }

        // --- 处理 {{message_history}} 或 {{message_history::N}} 变量 ---
        if (baseKey === 'message_history') {
            // Use customLimit if valid and provided, otherwise use limit from presetConfig
            const limit = customLimit !== undefined ? customLimit : presetConfig.messageHistoryLimit;
            if (limit === 0) return '[消息历史(0条)]'; // Explicitly return if limit is 0

            const contextType = context.groupId ? DbContextType.GROUP : DbContextType.PRIVATE;
            const contextId = context.groupId || context.userId;

            if (contextId) {
                try {
                    const rawHistory = await getMessageHistory(contextType, contextId, limit);
                    if (rawHistory.length > 0) {
                        // 如果有历史记录，去除最新的一条（可能是当前用户的发言）
                        // 只在有多条记录时去除，避免没有历史记录可显示
                        const historyToUse = rawHistory.length > 1 ? rawHistory.slice(1) : rawHistory;
                        
                        // Format the raw history according to the new spec (newest last)
                        const mappedMessages = historyToUse.reverse().map(item => {
                            // Format date and time
                            const date = new Date(item.timestamp);
                            const formattedDate = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
                            const formattedTime = `${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;

                            // Extract message content (handle potential errors)
                            let messageText = '[无法解析]';
                            try {
                                const rawMsg = item.rawMessage as any;
                                if (typeof rawMsg === 'string') messageText = rawMsg;
                                else if (Array.isArray(rawMsg)) {
                                    messageText = rawMsg.map(segment => {
                                        if (segment.type === 'text') return segment.text || segment.data?.text || '';
                                        if (segment.type === 'image_url') return '[图片]';
                                        if (segment.type === 'image') return '[图片]';
                                        if (segment.type === 'face') return `[表情:${segment.data?.id}]`;
                                        if (segment.type === 'at') return `[@${segment.data?.qq}]`;
                                        if (segment.type === 'reply') return `[回复:${segment.data?.id}]`;
                                        return `[${segment.type}]`;
                                    }).join('');
                                }
                            } catch (e) { console.error("Error parsing raw message for variable:", e); }

                            // Get userName, default to '未知' if null/undefined
                            // Ensure item.userName exists due to potential type issues
                            const userName = (item as any).userName || '未知';

                            // Format the final string
                            return `(user_id: ${item.userId}, user_name: ${userName}, date: ${formattedDate}, time: ${formattedTime}): ${messageText.trim()}`;
                        });
                        let fullHistoryText = mappedMessages.join('\n');
                        // For {{message_history}} variable, convert [@ID] to <at>ID</at>
                        if (fullHistoryText) {
                            fullHistoryText = fullHistoryText.replace(/\[@([^\]]+)\]/g, '<at>$1</at>');
                        }
                        return fullHistoryText;
                    } else {
                        return '[无消息历史记录]';
                    }
                    } catch (error) {
                        console.error(`获取消息历史失败 for variable ${contextType}:${contextId}:`, error);
                        return '[获取消息历史失败]';
                    }
            } else {
                return '[无法确定上下文以获取消息历史]';
            }
        }
        // --- 处理 {{chat_history}} 或 {{chat_history::N}} 变量 ---
        else if (baseKey === 'chat_history') {
            // Use customLimit if valid and provided, otherwise use limit from presetConfig
            const messageLimit = customLimit !== undefined ? customLimit : presetConfig.chatHistoryLimit;
            if (messageLimit === 0) return '[对话历史(0条)]'; // Explicitly return if limit is 0
            
            const contextType = context.groupId ? DbContextType.GROUP : DbContextType.PRIVATE;
            const contextId = context.groupId || context.userId;

            if (contextId) {
                try {
                    // Call getHistoryItems with the message limit
                    const chatHistoryItems = await getHistoryItems(contextType, contextId, messageLimit); // Pass messageLimit

                    if (chatHistoryItems.length > 0) {
                        // 如果有历史记录，去除最新的一条（可能是当前用户的发言）
                        // 只在有多条记录时去除，避免没有历史记录可显示
                        const historyToUse = chatHistoryItems.length > 1 ? chatHistoryItems.slice(1) : chatHistoryItems;
                        
                        // 获取的数据库记录是最新在前，需要反转以使最新的在最后
                        const orderedHistory = [...historyToUse].reverse();
                        // Format the history with newest messages at the bottom
                        return orderedHistory.map(item => {
                            const date = new Date(item.timestamp);
                            const formattedDate = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
                            const formattedTime = `${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
                            // Use userName if available, otherwise fallback based on role
                            // Use 'as any' to access potentially missing userName due to type issues
                            const senderName = (item as any).userName || (item.role === 'USER' ? '用户' : '助手');
                            let chatItemContent = item.content.trim();
                            // For {{chat_history}} variable, convert [@ID] to <at>ID</at>
                            chatItemContent = chatItemContent.replace(/\[@([^\]]+)\]/g, '<at>$1</at>');
                            return `(user_id: ${item.userId}, user_name: ${senderName}, date: ${formattedDate}, time: ${formattedTime}): ${chatItemContent}`;
                        }).join('\n');
                    } else {
                        return '[无对话历史记录]'; // Return specific text if no history
                    }
                } catch (error) {
                    console.error(`获取对话历史失败 for variable ${contextType}:${contextId}:`, error);
                    return '[获取对话历史失败]'; // Return error text
                }
            } else {
                return '[无法确定上下文以获取对话历史]'; // Return error text
            }
        }
        // --- 处理 {{message_last}} 变量 ---
        else if (key === 'message_last') {
            const contextType = context.groupId ? DbContextType.GROUP : DbContextType.PRIVATE;
            const contextId = context.groupId || context.userId;

            if (contextId) {
                try {
                    // Fetch only the latest message (limit 1)
                    const latestMessages = await getMessageHistory(contextType, contextId, 1);
                    if (latestMessages.length > 0) {
                        const item = latestMessages[0]; // Get the first (and only) message
                        // Format the message (reuse formatting logic if possible, or define here)
                        const date = new Date(item.timestamp);
                        const formattedDate = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
                        const formattedTime = `${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
                        let messageText = '[无法解析]';
                        try {
                            const rawMsg = item.rawMessage as any;
                            if (typeof rawMsg === 'string') messageText = rawMsg;
                            else if (Array.isArray(rawMsg)) {
                                messageText = rawMsg.map(segment => {
                                    if (segment.type === 'text') return segment.text || segment.data?.text || '';
                                    if (segment.type === 'image_url') return '[图片]'; // Handle image_url type
                                    if (segment.type === 'image') return '[图片]';
                                    if (segment.type === 'face') return `[表情:${segment.data?.id}]`;
                                    if (segment.type === 'at') return `[@${segment.data?.qq}]`; // Keep as [@ID] for {{message_last}}
                                    if (segment.type === 'reply') return `[回复:${segment.data?.id}]`;
                                    return `[${segment.type}]`;
                                }).join('');
                            }
                        } catch (e) { console.error("Error parsing raw message for message_last:", e); }
                        const userName = (item as any).userName || '未知';
                        // For {{message_last}} variable, convert [@ID] to <at>ID</at>
                        if (messageText) {
                            messageText = messageText.replace(/\[@([^\]]+)\]/g, '<at>$1</at>');
                        }
                        return `(user_id: ${item.userId}, user_name: ${userName}, date: ${formattedDate}, time: ${formattedTime}): ${messageText.trim()}`;
                    } else {
                        return '[无最新消息记录]';
                    }
                } catch (error) {
                    console.error(`获取最新消息失败 for message_last ${contextType}:${contextId}:`, error);
                    return '[获取最新消息失败]';
                }
            } else {
                return '[无法确定上下文以获取最新消息]';
            }
        }

        // --- 检查其他特殊格式变量 ---
        // 1. 骰子 {{roll NdX}}
        const rollMatch = key.match(/^roll\s+(\d+)d(\d+)$/i);
        if (rollMatch) {
        const numDice = parseInt(rollMatch[1], 10);
        const numSides = parseInt(rollMatch[2], 10);
        if (isNaN(numDice) || isNaN(numSides) || numDice < 1 || numSides < 1) {
            console.warn(`无效的骰子格式: {{${key}}}`);
            return '';
        }
        let total = 0;
        for (let i = 0; i < numDice; i++) {
            total += Math.floor(Math.random() * numSides) + 1; // 1 到 numSides
        }
        return String(total);
    }

        // 2. 随机选择 {{random::item1::item2...}}
        if (key.startsWith('random::')) {
        const optionsString = key.substring(8); // 获取 "::" 后面的部分
        // Add explicit 'string' type to map and filter parameters
        const options = optionsString.split('::').map((s: string) => s.trim()).filter((s: string) => s !== ''); // 分割并清理空选项
        if (options.length > 0) {
            const randomIndex = Math.floor(Math.random() * options.length);
            return options[randomIndex];
        } else {
            console.warn(`随机选择变量没有提供有效选项: {{${key}}}`);
            return '';
        }
    }
 
        // --- 首先处理新的 getvar 和 getglobalvar 指令 ---
        const getVarMatch = key.match(/^getvar::(.+)$/);
        const getGlobalVarMatch = key.match(/^getglobalvar::(.+)$/);

        if (getVarMatch) {
            const varName = getVarMatch[1];
            // Determine contextType and contextId from VariableContext
            let dbContextType: DbContextType | undefined;
            let dbContextId: string | undefined;

            if (context.isGroupChat === 'yes' && context.groupId) {
                dbContextType = DbContextType.GROUP;
                dbContextId = context.groupId;
            } else if (context.isPrivateChat === 'yes' && context.userId) {
                dbContextType = DbContextType.PRIVATE;
                dbContextId = context.userId; // For private chat, contextId is userId
            }

            if (varName && dbContextType && dbContextId && context.userId) {
                try {
                    const definition = await getLocalVariableDefinitionByName(varName);
                    if (!definition) {
                        // console.warn(`Local variable definition '${varName}' not found for getvar.`);
                        return ''; // Definition not found, return empty string
                    }

                    let instance = await getLocalVariableInstance(definition.id, dbContextType, dbContextId, context.userId);
                    
                    if (!instance) {
                        // Instance does not exist, create it with default value and return default value
                        await upsertLocalVariableInstance({
                            definitionId: definition.id,
                            value: definition.defaultValue,
                            contextType: dbContextType,
                            contextId: dbContextId,
                            userId: context.userId,
                        });
                        return definition.defaultValue;
                    } else {
                        // Instance exists, return its value
                        return instance.value;
                    }
                } catch (error) {
                    console.error(`Error processing getvar for local variable '${varName}' in substituteVariables:`, error);
                    return `[Err LVar]`; // Or empty string
                }
            } else {
                console.warn(`Cannot process getvar for local variable '${varName}' due to incomplete context or varName.`);
                return ''; // Or some indicator like [Ctx LVar?]
            }
        } else if (getGlobalVarMatch) {
            const varName = getGlobalVarMatch[1];
            if (varName) {
                try {
                    const globalVar = await getGlobalVariable(varName);
                    return globalVar ? globalVar.value : ''; // Return empty string if not found
                } catch (error) {
                    console.error(`Error fetching global variable '${varName}' in substituteVariables:`, error);
                    return `[Err GVar]`; // Or empty string
                }
            } else {
                 console.warn(`Cannot fetch global variable due to empty varName.`);
                 return '';
            }
        }

        // --- 如果不是特殊格式、历史记录或自定义变量，则检查内置上下文变量 ---
        const now = context.timestamp; // 使用传入的时间戳，保证一致性
        switch (key) {
      case 'date':
        const year = now.getFullYear();
        const month = padZero(now.getMonth() + 1); // 月份从 0 开始
        const day = padZero(now.getDate());
        return `${year}-${month}-${day}`; // YYYY-MM-DD
      case 'time': // 修改时间格式
        const hours = padZero(now.getHours());
        const minutes = padZero(now.getMinutes());
        const seconds = padZero(now.getSeconds());
        return `${hours}:${minutes}:${seconds}`; // hh:mm:ss (24小时制)
      case 'week': // 新增星期变量
        const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
        return weekdays[now.getDay()];
      case 'bot_id': // 新增机器人 ID 变量
        return context.botId ?? '';
      case 'user_id': // 确保使用 context 中的 userId
        return context.userId ?? '';
      case 'user_name': // 新增用户名变量 (优先使用群名片)
        return (context.userCard?.trim() || context.userNickname) ?? '';
      case 'user_nickname': // 保留原始昵称变量 (以防万一)
        return context.userNickname ?? '';
      case 'group_id': // 确保使用 context 中的 groupId
        return context.groupId ?? '';
       case 'group_name': // 暂未实现，返回空
         return context.groupName ?? '';
       case 'bot_name': // 新增机器人名称变量 - 从 context 获取
         return context.botName ?? ''; // Use botName from variableContext
       case 'replay_content': // 处理回复内容变量
         return context.replayContent ?? ''; // 使用 context.replayContent
       case 'replay_is': // 是否是回复
         return context.isReply ?? 'no';
       case 'private_is': // 是否是私聊
         return context.isPrivateChat ?? 'no';
       case 'group_is': // 是否是群聊
         return context.isGroupChat ?? 'no';
       // 可以添加更多内置变量
       default:
         // 对于未定义的变量，将其替换为空字符串
         // console.warn(`在 substituteVariables 中遇到未定义变量: ${match}, 将替换为空字符串.`);
         if (key === 'user_input') {
          // 修改: 不再返回原始匹配，而是直接替换为用户输入
          let userInput = context.message || '';
          // For {{user_input}} variable, convert [@ID] to <at>ID</at>
          if (userInput) {
            userInput = userInput.replace(/\[@([^\]]+)\]/g, '<at>$1</at>');
          }
          console.log(`[substituteVariables] 检测到 'user_input'，将替换为用户输入 (处理后): "${userInput}"`);
          return userInput;
         }
         // 移除对 {{last_message}} 的特殊警告，因为它现在不应该被匹配到这里
         // if (key === 'last_message') {
         //  console.warn(`[substituteVariables] 检测到已废弃的 'last_message' 变量，请使用 'message_last'。将返回空字符串。`);
         // }
         return ''; // 返回空字符串
   }
   })()); // 立即执行异步函数并推入 Promise
   return ''; // replace 的回调需要同步返回，我们稍后处理结果
  });

  // 等待所有 Promise 完成
  const resolvedValues = await Promise.all(promises);

  // 使用 resolvedValues 替换原始模板中的占位符
  let currentIndex = 0;
  const finalString = template.replace(/\{\{([^}]*)\}\}/g, () => {
      return resolvedValues[currentIndex++];
  });

  return finalString;
}

/**
 * 处理预设内容，生成发送给 OpenAI 的消息列表
 * @param applicablePreset 完整的预设对象 (包含所有配置)
 * @param userMessageContent 当前用户的结构化输入内容 (包含文本和图片 URL)
 * @param historyItems 从数据库获取的相关对话历史 (按时间升序, 最多包含 pairLimit * 2 条)
 * @param variableContext 包含变量值的上下文对象
 * @returns 准备发送给 OpenAI API 的消息列表
 */
  // Modify processPreset to accept Preset or DisguisePreset or null
  export async function processPreset(
    applicableConfig: Preset | DisguisePreset | null, // Accept Preset, DisguisePreset, or null
    userMessageContent: UserMessageContentItem[], // 使用新的类型
    historyItems: ChatHistoryItem[],
    variableContext: VariableContext
  ): Promise<OpenAIMessage[]> {
    // Handle null config case
    if (!applicableConfig) {
        console.warn('[processPreset] Received null configuration, returning empty messages.');
        return [];
    }

   const outputMessages: OpenAIMessage[] = [];
   const presetContent = applicableConfig.content as PresetContent; // Extract content (assuming structure is the same)
   const presetMode = applicableConfig.mode; // Extract mode
   // Extract limits for substituteVariables from the applicable config
   const presetLimits = {
       chatHistoryLimit: applicableConfig.chatHistoryLimit,
       messageHistoryLimit: applicableConfig.messageHistoryLimit
   };

  for (const item of presetContent) {
    // --- 处理占位符 ---
    if ('is_variable_placeholder' in item && item.is_variable_placeholder) {
      const placeholder = item as VariablePlaceholder;
      // 跳过禁用的占位符
      if (placeholder.enabled === false) continue;

       if (placeholder.variable_name === 'user_input') {
         // --- 处理独立的 {{user_input}} 占位符项目 ---
         // 插入当前用户的文本输入内容，而不是结构化内容
         // 确保 variableContext.message 不为空，优先使用它
         if (variableContext.message && variableContext.message.trim()) {
             // 直接使用 variableContext.message 作为 content 推入
             outputMessages.push({ role: 'user', content: variableContext.message });
             console.log(`[processPreset] 使用 variableContext.message 为独立的 {{user_input}} 占位符: "${variableContext.message}"`);
         } else if (userMessageContent && userMessageContent.length > 0) {
             // 如果没有 message 字段，则尝试使用结构化内容
             // 将文本类型的项目合并
             const textParts = userMessageContent
                 .filter(item => item.type === 'text')
                 .map(item => (item as {type: 'text', text: string}).text);
             const combinedText = textParts.join(' ').trim();
             
             if (combinedText) {
                 outputMessages.push({ role: 'user', content: combinedText });
                 console.log(`[processPreset] 使用合并的文本内容为独立的 {{user_input}} 占位符: "${combinedText}"`);
             } else {
                 // 如果没有文本内容，添加一个空的用户消息
                 outputMessages.push({ role: 'user', content: '' });
                 console.warn(`独立的 {{user_input}} 占位符没有可用的文本内容，添加空消息。`);
             }
         } else {
             console.warn(`独立的 {{user_input}} 占位符遇到空的用户输入内容和空的 variableContext.message。`);
             // 确保即使用户输入为空，也添加一个空的user消息
             // 这对回复触发特别重要，因为即使用户没有输入任何文本，也需要处理这个消息
             outputMessages.push({ role: 'user', content: '' });
         }
         // --- 结束处理独立的 {{user_input}} 占位符 ---
       } else if (placeholder.variable_name === 'chat_history') {
        // --- 对话历史注入逻辑 (根据 presetMode 调整) ---
        console.log(`[processPreset] DEBUG: Entering chat_history processing. Config: ${JSON.stringify(placeholder.config)}, historyItems length: ${historyItems.length}`); // 新增日志
        const maxMessages = placeholder.config?.maxLength ?? 10; // Default to 10 messages
        const historyToUse = historyItems.length > 1 ? historyItems.slice(1) : historyItems;
        const relevantHistory = historyToUse.slice(-maxMessages);
        console.log(`[processPreset] DEBUG: chat_history - relevantHistory length: ${relevantHistory.length}`); // 新增日志

        if (presetMode === 'ADVANCED') {
            console.log('[processPreset] DEBUG: chat_history - ADVANCED mode selected.'); // 新增日志
            // 高级模式：将每条历史记录格式化为独立的 role 消息
            if (relevantHistory.length > 0) {
                // 反转历史记录，使最新的消息在最后，符合对话顺序
                const orderedHistory = [...relevantHistory].reverse();
                console.log(`[processPreset] DEBUG: chat_history (ADVANCED) - orderedHistory length: ${orderedHistory.length}`); // 新增日志
                for (const historyItem of orderedHistory) {
                    // 类型断言，ChatHistoryItem 已经包含了 imageUrls (如果 Prisma Client 正确生成)
                    const chatItem = historyItem as typeof historyItem & { imageUrls?: string | null };
                    console.log(`[processPreset] DEBUG: chat_history (ADVANCED) - Processing item (before format): ${JSON.stringify(chatItem).substring(0, 200)}...`);

                    const date = new Date(chatItem.timestamp);
                    const formattedDate = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
                    const formattedTime = `${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
                    
                    const senderName = chatItem.userName || (chatItem.role === 'USER' ? '用户' : '助手');
                    const textContent = `(user_id: ${chatItem.userId}, user_name: ${senderName}, date: ${formattedDate}, time: ${formattedTime}): ${chatItem.content.trim()}`;
                    
                    const messageContentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: ImageURL }> = [{ type: 'text', text: textContent }];
                    let processedImageCount = 0;

                    if (applicableConfig.allowImageInput && chatItem.imageUrls) {
                        try {
                            const urls: string[] = JSON.parse(chatItem.imageUrls);
                            if (urls.length > 0) {
                                console.log(`[processPreset] DEBUG: chat_history (ADVANCED) - Found ${urls.length} image URLs for item ${chatItem.userId}. allowImageInput: ${applicableConfig.allowImageInput}`);
                                for (const originalUrl of urls) {
                                    const gifBase64 = await convertGifToJpegBase64(originalUrl, console); // Using console for logger temporarily
                                    if (gifBase64) {
                                        messageContentParts.push({ type: 'image_url', image_url: { url: gifBase64 } });
                                        processedImageCount++;
                                    } else {
                                        // Not a GIF or conversion failed, use original URL
                                        messageContentParts.push({ type: 'image_url', image_url: { url: originalUrl } });
                                        processedImageCount++;
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("[processPreset] DEBUG: chat_history (ADVANCED) - Error parsing or processing imageUrls:", e);
                        }
                    }
                    
                    let role = chatItem.role.toLowerCase() as OpenAIRole;
                    // Apply role change if mode is ADVANCED
                    if (applicableConfig.mode === 'ADVANCED' && (role === 'user' || role === 'assistant')) {
                        role = 'system';
                        console.log(`[processPreset] DEBUG: chat_history (ADVANCED) - Role for item ${chatItem.userId} (original: ${chatItem.role}) changed to 'system'.`);
                    }

                    if (role === 'user' || role === 'assistant' || role === 'system') { // Ensure role is valid before pushing
                        outputMessages.push({ role: role, content: messageContentParts });
                        console.log(`[processPreset] DEBUG: chat_history (ADVANCED) - Pushed to outputMessages. Role: ${role}, Text: ${textContent.substring(0,50)}..., Images: ${processedImageCount}`);
                    } else {
                         console.warn(`[processPreset] chat_history (ADVANCED): Skipping history item with role '${chatItem.role}' (after potential modification) for user_id: ${chatItem.userId}`);
                    }
                }
            } else {
                console.log(`[processPreset] DEBUG: chat_history (ADVANCED) - relevantHistory is empty, no items to process.`); // 新增日志
            }
        } else { // STANDARD mode for chat_history
            console.log('[processPreset] DEBUG: chat_history - STANDARD mode selected.'); // 新增日志
            // 标准模式：注入 role: content 对，保留原始内容中的换行符
            const orderedHistory = [...relevantHistory].reverse();
            console.log(`[processPreset] DEBUG: chat_history (STANDARD) - orderedHistory length: ${orderedHistory.length}`); // 新增日志
            for (const historyItem of orderedHistory) {
                const role = historyItem.role.toLowerCase() as OpenAIRole;
                if (role === 'user' || role === 'assistant') { // Standard mode does not change role to system
                    outputMessages.push({ role: role, content: historyItem.content });
                    console.log(`[processPreset] DEBUG: chat_history (STANDARD) - Pushed to outputMessages. Role: ${role}, Content: ${historyItem.content.substring(0,100)}...`); // 新增日志
                }
            }
        }
        // --- 结束对话历史注入 ---
      } else if (placeholder.variable_name === 'message_history') {
        // --- 消息历史占位符注入逻辑 (修改后) ---
        console.log(`[processPreset] DEBUG: Entering message_history processing. Config: ${JSON.stringify(placeholder.config)}`); // 新增日志
        const limit = placeholder.config?.limit ?? 10; // Default to 10 messages
        const contextTypeForMsgHist = variableContext.groupId ? DbContextType.GROUP : DbContextType.PRIVATE;
        const contextIdForMsgHist = variableContext.groupId || variableContext.userId;

        if (contextIdForMsgHist) {
            try {
                const rawHistoryItems = await getMessageHistory(contextTypeForMsgHist, contextIdForMsgHist, limit);
                console.log(`[processPreset] DEBUG: message_history - rawHistoryItems length: ${rawHistoryItems.length}`); // 新增日志
                if (rawHistoryItems.length > 0) {
                    const historyToProcess = rawHistoryItems.length > 1 ? rawHistoryItems.slice(1) : rawHistoryItems;
                    // 反转历史记录，使最新的消息在最后，符合对话顺序
                    const orderedHistory = [...historyToProcess].reverse();
                    console.log(`[processPreset] DEBUG: message_history - orderedHistory length: ${orderedHistory.length}`); // 新增日志

                    for (const item of orderedHistory) {
                        console.log(`[processPreset] DEBUG: message_history - Processing item (before format): ${JSON.stringify(item).substring(0, 200)}...`); // 新增日志
                        const messageItem = item as typeof item & { imageUrls?: string | null };

                        let messageText = '[无法解析]';
                        try {
                            const rawMsg = messageItem.rawMessage as any;
                            if (typeof rawMsg === 'string') {
                                messageText = rawMsg;
                            } else if (Array.isArray(rawMsg)) {
                                messageText = rawMsg.map(segment => {
                                    if (segment.type === 'text') return segment.text || segment.data?.text || '';
                                    if (segment.type === 'image') return '[图片]';
                                    if (segment.type === 'image_url') return '[图片]';
                                    if (segment.type === 'face') return `[表情:${segment.data?.id}]`;
                                    if (segment.type === 'at') return `[@${segment.data?.qq}]`;
                                    if (segment.type === 'reply') return `[回复:${segment.data?.id}]`;
                                    return `[${segment.type}]`;
                                }).join('');
                            }
                        } catch (e) { console.error("Error parsing raw message in preset processor (message_history):", e); }

                        const date = new Date(messageItem.timestamp);
                        const formattedDate = `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
                        const formattedTime = `${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`;
                        const userName = messageItem.userName || '未知';
                        
                        const textContent = `(user_id: ${messageItem.userId}, user_name: ${userName}, date: ${formattedDate}, time: ${formattedTime}): ${messageText.trim()}`;
                        const messageContentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: ImageURL }> = [{ type: 'text', text: textContent }];
                        let processedImageCount = 0;

                        if (applicableConfig.allowImageInput && messageItem.imageUrls) {
                            try {
                                const urls: string[] = JSON.parse(messageItem.imageUrls);
                                if (urls.length > 0) {
                                    console.log(`[processPreset] DEBUG: message_history - Found ${urls.length} image URLs for item ${messageItem.userId}. allowImageInput: ${applicableConfig.allowImageInput}`);
                                    for (const originalUrl of urls) {
                                        const gifBase64 = await convertGifToJpegBase64(originalUrl, console);
                                        if (gifBase64) {
                                            messageContentParts.push({ type: 'image_url', image_url: { url: gifBase64 } });
                                            processedImageCount++;
                                        } else {
                                            messageContentParts.push({ type: 'image_url', image_url: { url: originalUrl } });
                                            processedImageCount++;
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error("[processPreset] DEBUG: message_history - Error parsing or processing imageUrls:", e);
                            }
                        }
                        
                        let messageRole: OpenAIRole = (variableContext.botId && messageItem.userId === variableContext.botId) ? 'assistant' : 'user';
                        // Apply role change if mode is ADVANCED
                        if (applicableConfig.mode === 'ADVANCED' && (messageRole === 'user' || messageRole === 'assistant')) {
                            messageRole = 'system';
                            console.log(`[processPreset] DEBUG: message_history (ADVANCED) - Role for item ${messageItem.userId} (original determined: ${messageItem.userId === variableContext.botId ? 'assistant' : 'user'}) changed to 'system'.`);
                        }
                        outputMessages.push({ role: messageRole, content: messageContentParts });
                        console.log(`[processPreset] DEBUG: message_history - Pushed to outputMessages. Role: ${messageRole}, Text: ${textContent.substring(0,50)}..., Images: ${processedImageCount}`);
                    }
                }  else {
                    console.log(`[processPreset] DEBUG: message_history - rawHistoryItems is empty, no items to process.`); // 新增日志
                }
            } catch (error) {
                 console.error(`[processPreset] DEBUG: message_history - Error fetching/processing:`, error); // 修改日志级别
            }
        }
        // --- 结束消息历史占位符注入 ---
      }
    // --- 处理普通消息 ---
    } else {
      const message = item as PresetMessage;
      // 跳过禁用的消息
      if (message.enabled === false) continue;

      // 异步处理内容中的其他变量替换 (如 {{date}}, {{time}} 等)
      // Pass presetLimits to substituteVariables
      const processedContentString = await substituteVariables(message.content, variableContext, presetLimits);
      
      // +++ DEBUG: Log the exact string that will be checked for {{user_input}} +++
      console.log(`[processPreset] Role: ${message.role}, AFTER substituteVariables, processedContentString: "${processedContentString}"`);

      // const isEnabled = message.enabled === true || message.enabled === undefined; // 更明确地检查 true 或 undefined // This variable is unused

      // 直接将处理过的内容字符串作为 content 推入
      // 我们已修改 substituteVariables 函数直接替换 {{user_input}}，不再需要特殊处理
      if (processedContentString.trim()) { // 确保内容不为空
          let finalItemRole = message.role;
          const historyPlaceholderRegex = /\{\{(chat_history|message_history)(::\d+)?\}\}/;

          if (applicableConfig.mode === 'ADVANCED' &&
              (finalItemRole === 'user' || finalItemRole === 'assistant') &&
              historyPlaceholderRegex.test(message.content)) { // Test on original template 'message.content'
              finalItemRole = 'system';
              console.log(`[processPreset] DEBUG: Ordinary message item (ADVANCED) - Role for item containing history placeholder (original: ${message.role}) changed to 'system'. Original template: "${message.content.substring(0,100)}..."`);
          }

          const messageToAdd = { role: finalItemRole, content: processedContentString.trim() };
          console.log(`[processPreset] Pushing message for role ${finalItemRole}:`, JSON.stringify(messageToAdd)); // +++ DEBUG
          outputMessages.push(messageToAdd);
      } else {
           console.log(`[processPreset] Skipping empty content for role ${message.role}.`); // +++ DEBUG
      }
      // --- 结束消息处理 ---
    }
  }

  // 确保最后一条消息是 user role (如果预设没有显式包含 user_input) - 保持注释，让预设控制
  // ...

  // 处理消息中的@提及，根据模式不同采取不同处理方式
  let finalMessages = outputMessages;
  if (applicableConfig.mode && outputMessages.length > 0) {
    finalMessages = processAtMentionsInOpenAIMessages(
      outputMessages,
      applicableConfig.mode,
      variableContext.botId
    );
  }

  return finalMessages;
}
