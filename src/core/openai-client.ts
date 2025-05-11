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
interface OpenAIConfig {
    apiKey: string;
    baseURL?: string | null;
    modelName: string;
    allowWebSearch?: boolean; // 添加是否允许联网搜索的配置
    webSearchApiKey?: string; // 添加联网搜索API Key
    webSearchBaseUrl?: string | null; // 添加联网搜索Base URL
    webSearchModel?: string; // 添加联网搜索模型名称
    webSearchSystemPrompt?: string | null; // 新增：来自预设/伪装的联网搜索系统提示词
    rawUserTextForSearch?: string; // 新增：用于联网搜索的原始用户文本
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
    // 2. 准备 OpenAI 客户端选项
    const options: ConstructorParameters<typeof OpenAI>[0] = { apiKey: config.apiKey };
    if (config.baseURL) {
        options.baseURL = config.baseURL;
        logger.info(`[openai-client] 准备调用 OpenAI API，模型: ${config.modelName}, 消息数: ${messages.length}, 使用自定义 URL: ${config.baseURL}`);
    } else {
        logger.info(`[openai-client] 准备调用 OpenAI API，模型: ${config.modelName}, 消息数: ${messages.length}`);
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
        const completion = await dynamicOpenai.chat.completions.create({
            model: config.modelName,
            messages: messages as ChatCompletionMessageParam[],
            // temperature: 0.7, // 可以根据需要从 config 中获取
        });

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
        const processedMessages = messages.map(msg => {
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
        
        // 合并后的日志
        logger.debug({
            message: `[openai-client] At 提及处理完成，发送给正常请求的 OpenAI 消息:`,
            data: processedMessages
        });
        
        // 使用第二个模型和替换变量后的消息进行第二次调用
        const secondCallResult = await performStandardAICallWithLogs(processedMessages, {
            ...config,
            // 确保使用普通的 OpenAI 模型进行第二次调用，而不是联网搜索模型
            allowWebSearch: false  // 禁用第二次调用的联网搜索，避免循环
        }, logger);
        
        // 返回结果和处理后的消息，让message-handler能够记录日志
        return { 
            content: secondCallResult,
            processedMessages: processedMessages 
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
            logger.info(`[openai-client] 准备调用 OpenAI API，模型: ${config.modelName}, 消息数: ${messages.length}, 使用自定义 URL: ${config.baseURL}`);
        } else {
            logger.info(`[openai-client] 准备调用 OpenAI API，模型: ${config.modelName}, 消息数: ${messages.length}`);
        }
    } catch (initError: any) {
        logger.error({ err: initError }, `[openai-client] 动态创建 OpenAI 客户端实例时出错: ${initError.message || initError}`);
        return null;
    }

    // 发起 API 调用
    try {
        const completion = await dynamicOpenai.chat.completions.create({
            model: config.modelName,
            messages: messages as ChatCompletionMessageParam[],
        });

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
