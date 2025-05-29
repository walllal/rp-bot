import OpenAI from 'openai';
// 导入 OpenAI 库定义的类型
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { OpenAIMessage } from './types';
// 添加ChatCompletionTool类型导入
import { ChatCompletionTool } from 'openai/resources';
// Removed FastifyInstance, getSetting, SettingKey imports
// Removed import { getAppSettings } from '../db/configStore';

// Removed global variables: openai, serverInstance, modelName

// Removed simplified log function, will use passed-in logger
// function log(level: 'info' | 'warn' | 'error' | 'debug' | 'trace', message: string, data?: any) {
//     console[level](message, data ?? '');
// }

import { FastifyBaseLogger } from 'fastify'; // Import logger type

// Removed initOpenAIClient function
// Removed reinitializeOpenAIClient function

// Define the configuration type expected by callOpenAI
// Includes parameters for main call, web search, and AI trigger
interface OpenAIConfig {
    apiKey: string;
    baseURL?: string | null;
    modelName: string;
    // Main OpenAI call parameters
    openaiMaxTokens?: number | null;
    openaiTemperature?: number | null;
    openaiFrequencyPenalty?: number | null;
    openaiPresencePenalty?: number | null;
    openaiTopP?: number | null;

    // Web Search specific settings
    allowWebSearch?: boolean;
    webSearchApiKey?: string | null; // Use this or main apiKey if null
    webSearchBaseUrl?: string | null; // Use this or main baseURL if null
    webSearchModel?: string;
    webSearchSystemPrompt?: string | null;
    rawUserTextForSearch?: string;
    // Web Search specific OpenAI parameters
    webSearchOpenaiMaxTokens?: number | null;
    webSearchOpenaiTemperature?: number | null;
    webSearchOpenaiFrequencyPenalty?: number | null;
    webSearchOpenaiPresencePenalty?: number | null;
    webSearchOpenaiTopP?: number | null;

    // AI Trigger specific OpenAI parameters (passed when calling for trigger check)
    aiTriggerOpenaiMaxTokens?: number | null;
    aiTriggerOpenaiTemperature?: number | null;
    aiTriggerOpenaiFrequencyPenalty?: number | null;
    aiTriggerOpenaiPresencePenalty?: number | null;
    aiTriggerOpenaiTopP?: number | null;
    // Note: AI Trigger might use its own apiKey/baseURL/modelName,
    // which should be handled by the caller constructing the config for callOpenAI.
    // This interface assumes the caller provides the correct apiKey/baseURL/modelName
    // based on whether it's a main call, web search summary, or AI trigger check.
}

// 定义OpenAIResponse接口，联网搜索时返回对象，包含内容和处理后的消息
interface OpenAIResponse {
    content: string | null;
    processedMessages?: OpenAIMessage[];
}

/**
 * 调用 OpenAI Chat Completions API (动态创建客户端)
 * @param messages 发送给 API 的消息列表
 * @param config 包含 apiKey, baseURL (可选), modelName 的配置对象
 * @param logger Fastify/Pino logger 实例
 * @returns 联网搜索时返回OpenAIResponse对象，否则返回string或null
 */
export async function callOpenAI(
    messages: OpenAIMessage[],
    config: OpenAIConfig,
    logger: FastifyBaseLogger // Added logger parameter
): Promise<OpenAIResponse | string | null> {
    // 1. 验证配置
    if (!config || !config.apiKey) {
        logger.error('[openai-client] 调用 OpenAI 失败：缺少 API Key 配置');
        return null;
    }
    if (!config.modelName) {
        logger.error('[openai-client] 调用 OpenAI 失败：缺少模型名称配置');
        return null; // 或者使用一个默认模型？当前要求严格配置。
    }
    if (messages.length === 0) {
        logger.warn('[openai-client] 尝试调用 OpenAI API，但消息列表为空');
        return null;
    }

    // 如果启用了联网搜索，先进行联网搜索
    if (config.allowWebSearch === true) {
        const result = await performWebSearch(messages, config, logger);
        return result;
    } else {
        // 未启用联网搜索，直接调用普通的AI对话
        return await performStandardAICall(messages, config, logger);
    }
}

// 辅助函数：预处理OpenAI消息，合并相邻的assistant和user消息
function preprocessOpenAIMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
    if (!messages || messages.length === 0) {
        return [];
    }

    let processed = messages;

    // 1. 合并 assistant 消息
    processed = processed.reduce((accumulator, currentMessage) => {
        const lastMessageInAccumulator = accumulator.length > 0 ? accumulator[accumulator.length - 1] : null;

        if (
            lastMessageInAccumulator &&
            lastMessageInAccumulator.role === 'assistant' &&
            currentMessage.role === 'assistant'
        ) {
            const lastContent = lastMessageInAccumulator.content;
            const currentContent = currentMessage.content;
            let canMerge = false;
            let mergedContent: OpenAIMessage['content'] = ''; // Placeholder

            if (typeof lastContent === 'string' && typeof currentContent === 'string') {
                mergedContent = `${lastContent}\n${currentContent}`;
                canMerge = true;
            } else if (
                Array.isArray(lastContent) && lastContent.length === 1 && lastContent[0].type === 'text' &&
                Array.isArray(currentContent) && currentContent.length === 1 && currentContent[0].type === 'text'
            ) {
                // 类型断言以访问 .text 属性
                const lastTextItem = lastContent[0] as { type: 'text'; text: string };
                const currentTextItem = currentContent[0] as { type: 'text'; text: string };
                mergedContent = [{ type: 'text', text: `${lastTextItem.text}\n${currentTextItem.text}` }];
                canMerge = true;
            }

            if (canMerge) {
                accumulator[accumulator.length - 1] = { ...lastMessageInAccumulator, content: mergedContent };
            } else {
                accumulator.push({ ...currentMessage });
            }
        } else {
            accumulator.push({ ...currentMessage });
        }
        return accumulator;
    }, [] as OpenAIMessage[]);

    // 2. 合并 user 消息
    processed = processed.reduce((accumulator, currentMessage) => {
        const lastMessageInAccumulator = accumulator.length > 0 ? accumulator[accumulator.length - 1] : null;

        if (
            lastMessageInAccumulator &&
            lastMessageInAccumulator.role === 'user' &&
            currentMessage.role === 'user'
        ) {
            const lastContent = lastMessageInAccumulator.content;
            const currentContent = currentMessage.content;
            let mergedContentByUser: OpenAIMessage['content'];

            if (typeof lastContent === 'string' && typeof currentContent === 'string') {
                mergedContentByUser = `${lastContent}\n${currentContent}`;
            } else if (Array.isArray(lastContent) && typeof currentContent === 'string') {
                mergedContentByUser = [...lastContent, { type: 'text', text: currentContent }];
            } else if (typeof lastContent === 'string' && Array.isArray(currentContent)) {
                mergedContentByUser = [{ type: 'text', text: lastContent }, ...currentContent];
            } else if (Array.isArray(lastContent) && Array.isArray(currentContent)) {
                mergedContentByUser = [...lastContent, ...currentContent];
            } else {
                // 不可合并的类型组合，单独推送当前消息
                accumulator.push({ ...currentMessage });
                return accumulator;
            }
            accumulator[accumulator.length - 1] = { ...lastMessageInAccumulator, content: mergedContentByUser };
        } else {
            accumulator.push({ ...currentMessage });
        }
        return accumulator;
    }, [] as OpenAIMessage[]);

    return processed;
}

/**
 * 执行标准AI对话调用
 * @param messages 发送给API的消息列表
 * @param config 配置对象
 * @param logger 日志记录器
 * @returns AI回复的内容字符串
 */
async function performStandardAICall(
    messages: OpenAIMessage[],
    config: OpenAIConfig,
    logger: FastifyBaseLogger
): Promise<string | null> {
    const initialMessagesCount = messages.length;
    const processedMessages = preprocessOpenAIMessages(messages);
    const finalMessagesCount = processedMessages.length;

    // 2. 准备 OpenAI 客户端选项
    const options: ConstructorParameters<typeof OpenAI>[0] = { apiKey: config.apiKey };
    if (config.baseURL) {
        options.baseURL = config.baseURL;
        logger.info(`[openai-client] 准备调用 OpenAI API，模型: ${config.modelName}, 原始消息数: ${initialMessagesCount}, 处理后消息数: ${finalMessagesCount}, 使用自定义 URL: ${config.baseURL}`);
    } else {
        logger.info(`[openai-client] 准备调用 OpenAI API，模型: ${config.modelName}, 原始消息数: ${initialMessagesCount}, 处理后消息数: ${finalMessagesCount}`);
    }

    // 3. 动态创建 OpenAI 客户端实例
    let dynamicOpenai: OpenAI;
    try {
        dynamicOpenai = new OpenAI(options);
    } catch (initError: any) {
        logger.error({ err: initError }, `[openai-client] 动态创建 OpenAI 客户端实例时出错: ${initError.message || initError}`);
        return null;
    }

    // 4. 发起 API 调用
    try {
        // Prepare parameters, including advanced ones if provided
        const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: config.modelName,
            messages: processedMessages as ChatCompletionMessageParam[],
        };
        // Add advanced parameters if they exist and are not null
        if (config.openaiMaxTokens !== null && config.openaiMaxTokens !== undefined) {
            completionParams.max_tokens = config.openaiMaxTokens;
        }
        if (config.openaiTemperature !== null && config.openaiTemperature !== undefined) {
            completionParams.temperature = config.openaiTemperature;
        }
        if (config.openaiFrequencyPenalty !== null && config.openaiFrequencyPenalty !== undefined) {
            completionParams.frequency_penalty = config.openaiFrequencyPenalty;
        }
        if (config.openaiPresencePenalty !== null && config.openaiPresencePenalty !== undefined) {
            completionParams.presence_penalty = config.openaiPresencePenalty;
        }
        if (config.openaiTopP !== null && config.openaiTopP !== undefined) {
            completionParams.top_p = config.openaiTopP;
        }
        // Log the parameters being sent (excluding messages for brevity in info log)
        const paramsForLog = { ...completionParams };
        delete (paramsForLog as any).messages; // Remove messages for cleaner log
        logger.debug({ params: paramsForLog }, '[openai-client] Parameters sent to OpenAI API');
        // Log the full messages array for detailed debugging, especially for mimeType issues
        // This will show what rp-bot is sending to the intermediary API (newapi)
        logger.info({ messages_payload: completionParams.messages }, '[openai-client] Detailed messages payload being sent to intermediary API (newapi) (before create call)');

        const completion = await dynamicOpenai.chat.completions.create(completionParams);

        const choice = completion.choices?.[0];
        if (choice?.message?.content) {
            logger.trace(`[openai-client] 成功获取 OpenAI 回复, Finish Reason: ${choice.finish_reason}`);
            // 在 DEBUG_AI 或 DEBUG_ALL 级别下记录 choice 对象
            logger.debug({ choice }, '[openai-client] OpenAI API 响应的 choice 对象');
            return choice.message.content.trim();
        } else {
            logger.warn({ completion }, '[openai-client] OpenAI API 响应中未找到有效的回复内容');
            return null;
        }
    } catch (error: any) {
        logger.error({ err: error }, `[openai-client] 调用 OpenAI API (模型: ${config.modelName}) 时出错: ${error.message || error}`);
        // OpenAI SDK v4+ errors often have more details in error.error or error.data
        if (error.error && typeof error.error === 'object') {
             logger.error('[openai-client] OpenAI API 错误详情 (error.error):', error.error);
        } else if (error.data && typeof error.data === 'object') {
             logger.error('[openai-client] OpenAI API 错误详情 (error.data):', error.data);
        }
        // Deprecated: error.response is for older axios-style errors
        // if (error.response) {
        //     logger.error('[openai-client] OpenAI API 错误详情 (error.response.data):', error.response.data);
        // }
        return null;
    }
}

/**
 * 执行联网搜索并结合AI对话
 * @param messages 发送给API的消息列表
 * @param config 配置对象
 * @param logger 日志记录器
 * @returns AI回复的内容字符串和需要发送给正常请求的消息
 */
async function performWebSearch(
    messages: OpenAIMessage[],
    config: OpenAIConfig,
    logger: FastifyBaseLogger
): Promise<{ content: string | null, processedMessages?: OpenAIMessage[] }> {
    // 检查联网搜索所需的配置
    const webSearchApiKey = config.webSearchApiKey || config.apiKey;
    const webSearchBaseUrl = config.webSearchBaseUrl || config.baseURL;
    const webSearchModel = config.webSearchModel || 'gemini-2.0-flash';

    // 准备联网API选项
    const options: ConstructorParameters<typeof OpenAI>[0] = { apiKey: webSearchApiKey };
    if (webSearchBaseUrl) {
        options.baseURL = webSearchBaseUrl;
        logger.info(`[openai-client] 准备执行联网搜索，模型: ${webSearchModel}, 消息数: ${messages.length}, 使用自定义 URL: ${webSearchBaseUrl}`);
    } else {
        logger.info(`[openai-client] 准备执行联网搜索，模型: ${webSearchModel}, 消息数: ${messages.length}`);
    }

    // 确保在联网搜索前记录处理后的消息
    logger.debug(`[openai-client] 联网搜索前 OpenAI 消息:`, messages);

    // 动态创建联网搜索客户端实例
    let webSearchClient: OpenAI;
    try {
        webSearchClient = new OpenAI(options);
    } catch (initError: any) {
        logger.error({ err: initError }, `[openai-client] 动态创建联网搜索客户端实例时出错: ${initError.message || initError}`);
        logger.info('[openai-client] 将尝试使用标准API调用作为备选方案');
        // 联网搜索失败，回退到标准对话
        const result = await performStandardAICall(messages, config, logger);
        return { content: result };
    }

    try {
        let userTextForSearch: string | null = null;

        if (config.rawUserTextForSearch && config.rawUserTextForSearch.trim()) {
            userTextForSearch = config.rawUserTextForSearch.trim();
            logger.info('[openai-client] 使用配置中提供的原始用户文本进行联网搜索。');
        } else {
            // Fallback: 提取用户的最后一条消息作为搜索查询
            const userMessages = messages.filter(msg => msg.role === 'user');
            const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
            logger.info('[openai-client] 从消息列表中提取用户文本进行联网搜索。');

            if (lastUserMessage && lastUserMessage.content) {
                if (typeof lastUserMessage.content === 'string') {
                    userTextForSearch = lastUserMessage.content.trim();
                } else if (Array.isArray(lastUserMessage.content)) {
                    // 从 UserMessageContentItem[] 提取文本内容
                    userTextForSearch = lastUserMessage.content
                        .filter(item => item.type === 'text')
                        .map(item => (item as Extract<typeof item, { type: 'text' }>).text) // Type assertion
                        .join(' ')
                        .trim();
                }
            }
        }

        if (!userTextForSearch) {
            logger.warn('[openai-client] 无法确定用于联网搜索的用户文本，将使用标准API调用');
            const result = await performStandardAICall(messages, config, logger);
            return { content: result };
        }

        // 从传入的 config 对象获取 webSearchSystemPrompt
        const webSearchSystemPromptFromConfig = config.webSearchSystemPrompt?.trim();

        // 构建专门用于联网搜索的消息列表
        const searchApiMessages: OpenAIMessage[] = [];

        if (webSearchSystemPromptFromConfig) {
            searchApiMessages.push({ role: 'system', content: webSearchSystemPromptFromConfig });
            logger.info('[openai-client] 使用来自配置的联网搜索系统提示词。');
        }

        searchApiMessages.push({ role: 'user', content: userTextForSearch });

        // 记录实际发送给联网搜索API的消息
        logger.debug({
            message: `[openai-client] 发送给联网搜索 API 的消息内容:`,
            data: searchApiMessages
        });
        
        // 准备Gemini专用工具定义
        const geminiSearchTool = {
            type: "function",
            function: {
                name: "googleSearch"
            }
        };

        // 准备OpenAI格式的工具定义
        const openaiSearchTool: ChatCompletionTool = {
            type: "function",
            function: {
                name: "web_search",
                description: "Search for real-time information",
                parameters: {
                    type: "object",
                    properties: {},
                    required: []
                }
            }
        };

        // 根据模型类型选择合适的工具定义
        let toolsParameter;
        if (webSearchModel.startsWith('gemini-')) {
            // Gemini模型使用简化的工具定义格式
            toolsParameter = [geminiSearchTool];
            logger.info(`[openai-client] 检测到Gemini模型，使用Gemini专用工具定义格式`);
        } else {
            // 其他模型使用OpenAI完整格式
            toolsParameter = [openaiSearchTool];
        }

        // 执行联网搜索
        logger.info('[openai-client] 正在执行联网搜索...');
        const searchCompletion = await webSearchClient.chat.completions.create({
            model: webSearchModel,
            messages: searchApiMessages as ChatCompletionMessageParam[], // 使用构造的搜索专用消息
            tools: toolsParameter as any, // 使用类型断言
        });

        const searchChoice = searchCompletion.choices?.[0];
        const searchResult = searchChoice?.message;
        
        // 添加API响应的choice对象日志
        logger.debug({ choice: searchChoice }, '[openai-client] 联网搜索 API 响应的 choice 对象');
        
        if (!searchResult || !searchResult.content) {
            logger.warn({ completion: searchCompletion }, '[openai-client] 联网搜索未返回有效结果，将使用标准API调用');
            const result = await performStandardAICall(messages, config, logger);
            return { content: result };
        }

        // 合并三条日志为一条，同时显示搜索结果内容
        const searchContent = searchResult.content.trim();
        logger.info(`[openai-client] 联网搜索完成，结果长度: ${searchContent.length}字符`);
        logger.debug(`[openai-client] 联网搜索结果内容:\n${searchContent}`);
        // 创建一个新的消息列表用于第二次调用，替换变量
        let messagesForSecondCall = messages.map(msg => {
                if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') {
                    // 查找 {{search_content}} 变量并替换
                    if (typeof msg.content === 'string') {
                        return {
                            ...msg,
                            content: msg.content.replace(/{{search_content}}/g, searchContent)
                        };
                    }
                }
                return msg;
            });
            
            // 合并后的日志 (在合并 assistant 和 user 消息之前)
            logger.debug({
                message: `[openai-client] 替换 search_content 后，准备发送给标准AI调用的消息 (合并前):`,
                data: messagesForSecondCall
            });
            
            // 对替换了 search_content 后的消息进行预处理（合并）
            // messagesForSecondCall = preprocessOpenAIMessages(messagesForSecondCall);
            // logger.debug({
            //     message: `[openai-client] Assistant 和 User 消息合并后，准备发送给标准AI调用的消息:`,
            //     data: messagesForSecondCall
            // });
            // performStandardAICallWithLogs 内部会调用 preprocessOpenAIMessages，所以这里不需要重复调用
    
            // 使用第二个模型和替换变量后的消息进行第二次调用
        // Construct config for the second call, using web search specific parameters
        const secondCallConfig: OpenAIConfig = {
            apiKey: config.apiKey, // Use main API key for the summary call
            baseURL: config.baseURL, // Use main base URL
            modelName: config.modelName, // Use main model for summary
            allowWebSearch: false, // Ensure web search is disabled for the summary call
            // Pass web search specific OpenAI parameters
            openaiMaxTokens: config.webSearchOpenaiMaxTokens,
            openaiTemperature: config.webSearchOpenaiTemperature,
            openaiFrequencyPenalty: config.webSearchOpenaiFrequencyPenalty,
            openaiPresencePenalty: config.webSearchOpenaiPresencePenalty,
            openaiTopP: config.webSearchOpenaiTopP,
            // Other fields from original config are not needed here unless performStandardAICallWithLogs requires them
        };

        const secondCallResult = await performStandardAICallWithLogs(messagesForSecondCall, secondCallConfig, logger);
        
        // 返回结果和处理后的消息，让message-handler能够记录日志
        // 确保返回的 processedMessages 是经过完整预处理的
        const finalProcessedMessages = preprocessOpenAIMessages(messagesForSecondCall);
        return {
            content: secondCallResult,
            processedMessages: finalProcessedMessages
        };
    } catch (error: any) {
        logger.error({ err: error }, `[openai-client] 联网搜索失败: ${error.message || error}`);
        
        // 错误类型分析
        if (error.status === 429) {
            logger.warn('[openai-client] 联网搜索失败: 请求频率超限 (429)');
        } else if (error.status >= 500) {
            logger.warn('[openai-client] 联网搜索失败: 服务器错误');
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
            logger.warn('[openai-client] 联网搜索失败: 连接被拒绝或重置');
        }
        
        logger.info('[openai-client] 联网搜索失败，将使用标准API调用作为备选方案');
        // 联网搜索失败，回退到标准对话
        const result = await performStandardAICall(messages, config, logger);
        return { content: result };
    }
}

/**
 * 执行标准AI对话调用（不输出准备日志）
 * 专门用于联网搜索后的第二次调用，避免日志顺序问题
 */
async function performStandardAICallWithLogs(
    messages: OpenAIMessage[],
    config: OpenAIConfig,
    logger: FastifyBaseLogger
): Promise<string | null> {
    const initialMessagesCount = messages.length;
    const processedMessages = preprocessOpenAIMessages(messages);
    const finalMessagesCount = processedMessages.length;

    // 准备 OpenAI 客户端选项
    const options: ConstructorParameters<typeof OpenAI>[0] = { apiKey: config.apiKey };
    if (config.baseURL) {
        options.baseURL = config.baseURL;
    }
    
    // 动态创建 OpenAI 客户端实例
    let dynamicOpenai: OpenAI;
    try {
        dynamicOpenai = new OpenAI(options);
        
        // 输出准备日志
        if (config.baseURL) {
            logger.info(`[openai-client] 准备调用 OpenAI API (WithLogs)，模型: ${config.modelName}, 原始消息数: ${initialMessagesCount}, 处理后消息数: ${finalMessagesCount}, 使用自定义 URL: ${config.baseURL}`);
        } else {
            logger.info(`[openai-client] 准备调用 OpenAI API (WithLogs)，模型: ${config.modelName}, 原始消息数: ${initialMessagesCount}, 处理后消息数: ${finalMessagesCount}`);
        }
    } catch (initError: any) {
        logger.error({ err: initError }, `[openai-client] 动态创建 OpenAI 客户端实例时出错: ${initError.message || initError}`);
        return null;
    }

    // 发起 API 调用
    try {
        // Prepare parameters, including advanced ones if provided
        const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: config.modelName,
            messages: processedMessages as ChatCompletionMessageParam[],
        };
        // Add advanced parameters if they exist and are not null
        // Note: This function is called by performWebSearch for the summary,
        // so the config passed in should contain the webSearch specific parameters mapped to the generic names.
        if (config.openaiMaxTokens !== null && config.openaiMaxTokens !== undefined) {
            completionParams.max_tokens = config.openaiMaxTokens;
        }
        if (config.openaiTemperature !== null && config.openaiTemperature !== undefined) {
            completionParams.temperature = config.openaiTemperature;
        }
        if (config.openaiFrequencyPenalty !== null && config.openaiFrequencyPenalty !== undefined) {
            completionParams.frequency_penalty = config.openaiFrequencyPenalty;
        }
        if (config.openaiPresencePenalty !== null && config.openaiPresencePenalty !== undefined) {
            completionParams.presence_penalty = config.openaiPresencePenalty;
        }
        if (config.openaiTopP !== null && config.openaiTopP !== undefined) {
            completionParams.top_p = config.openaiTopP;
        }
        // Log the parameters being sent (excluding messages for brevity in info log)
        const paramsForLog = { ...completionParams };
        delete (paramsForLog as any).messages; // Remove messages for cleaner log
        logger.debug({ params: paramsForLog }, '[openai-client] Parameters sent to OpenAI API (performStandardAICallWithLogs)');

        const completion = await dynamicOpenai.chat.completions.create(completionParams);

        const choice = completion.choices?.[0];
        if (choice?.message?.content) {
            logger.trace(`[openai-client] 成功获取 OpenAI 回复, Finish Reason: ${choice.finish_reason}`);
            logger.debug({ choice }, '[openai-client] OpenAI API 响应的 choice 对象');
            return choice.message.content.trim();
        } else {
            logger.warn({ completion }, '[openai-client] OpenAI API 响应中未找到有效的回复内容');
            return null;
        }
    } catch (error: any) {
        logger.error({ err: error }, `[openai-client] 调用 OpenAI API (模型: ${config.modelName}) 时出错: ${error.message || error}`);
        if (error.error && typeof error.error === 'object') {
             logger.error('[openai-client] OpenAI API 错误详情 (error.error):', error.error);
        } else if (error.data && typeof error.data === 'object') {
             logger.error('[openai-client] OpenAI API 错误详情 (error.data):', error.data);
        }
        return null;
    }
}
