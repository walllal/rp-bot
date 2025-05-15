import { OneBotMessageSegment } from '../onebot/types'; // 修正导入的类型名称

// 添加log函数导入
import { FastifyInstance } from 'fastify';

// 声明日志变量
let serverInstance: FastifyInstance | null = null;

// 添加log函数
function log(level: 'info' | 'warn' | 'error' | 'debug' | 'trace', message: string, data?: any) {
    if (serverInstance?.log) {
        (serverInstance.log as any)[level](data ? { data, message } : message);
    } else {
        console[level === 'trace' ? 'debug' : level](message, data ?? '');
    }
}

// 添加init函数
export function initAdvancedResponseParser(fastifyInstance: FastifyInstance) {
    serverInstance = fastifyInstance;
    log('debug', '高级模式响应解析器已初始化');
}

/**
 * 定义高级模式解析后产生的操作类型
 */
export type AdvancedOperation =
  | { type: 'send_message'; segments: OneBotMessageSegment[] } // 发送包含文本、@、图片的消息段
  | { type: 'send_voice'; text: string }; // 发送语音合成指令

/**
 * 解析 AI 在高级模式下返回的包含自定义标签的响应文本。
 *
 * @param responseText AI 返回的原始文本。
 * @returns 返回一个操作对象数组，按顺序执行。
 */
export function parseAdvancedResponse(responseText: string): AdvancedOperation[] {
    const operations: AdvancedOperation[] = [];
    if (!responseText) {
        return operations;
    }

    // 记录原始AI响应内容 - Trace级别用于详细调试
    log('trace', 'AI原始响应内容:', responseText);

    // 判断是否仅包含空的<pre>标签
    const emptyPreRegex = /^<message>\s*<pre>\s*<\/pre>\s*<\/message>$/s;
    if (emptyPreRegex.test(responseText.trim())) {
        log('debug', '检测到仅含空<pre>标签的消息，不发送任何内容');
        return operations;
    }

    // 正则表达式查找顶层的 <message>...</message> 块
    // 使用非贪婪匹配 .*? 来处理嵌套或多个 message 块（虽然我们主要处理顶层）
    // 使用 s 标志让 . 匹配换行符
    const messageBlockRegex = /<message>(.*?)<\/message>/gs;
    let messageMatch;
    let lastIndex = 0;
    const messageBlocks: string[] = [];

    while ((messageMatch = messageBlockRegex.exec(responseText)) !== null) {
        messageBlocks.push(messageMatch[1]); // 提取 <message> 内部的内容
        lastIndex = messageBlockRegex.lastIndex;
    }

    // 如果没有找到 <message> 块，则不执行任何操作
    if (messageBlocks.length === 0) {
        // 添加日志记录原始AI回复内容 - 使用debug级别便于查看
        log('debug', '高级模式：AI完整回复内容:', responseText);
        log('warn', '高级模式：未识别到有效的<message>标签，不发送消息');
        return operations;
    }

    // 处理每个 <message> 块
    for (const blockContent of messageBlocks) {
        let currentSegments: OneBotMessageSegment[] = [];
        // 修改正则表达式，只匹配<pre>和<image>标签
        const tagRegex = /<pre>(.*?)<\/pre>|<image>(.*?)<\/image>/gs;
        let tagMatch;
        let lastBlockIndex = 0;

        while ((tagMatch = tagRegex.exec(blockContent)) !== null) {
            // 检查标签前是否有裸露文本 (在 <pre> 之外) - 通常应该避免，但可以作为 text 段处理
            let textBeforeTag = blockContent.substring(lastBlockIndex, tagMatch.index).trim();
            if (textBeforeTag) {
                // 只有当裸露文本不包含类似标签的结构时才发送
                if (!textBeforeTag.includes("<pre") && !textBeforeTag.includes("<image")) {
                    currentSegments.push({ type: 'text', data: { text: textBeforeTag } });
                } else {
                    log('debug', '检测到标签前的裸露文本中包含类标签结构，已忽略:', textBeforeTag);
                }
            }

            // 由于移除了<voice>标签的直接匹配，需要调整解构赋值
            const [fullMatch, preContent, imageContent] = tagMatch;

            if (preContent !== undefined) {
                // 处理 <pre> 内部的文本、@、图片和语音
                // 如果已有消息段，先打包发送，实现每个<pre>单独发送的效果
                if (currentSegments.length > 0) {
                    operations.push({ type: 'send_message', segments: [...currentSegments] });
                    currentSegments = []; // 清空当前消息段
                }
                
                const preText = preContent.trim();
                
                // 如果<pre>标签为空，则不发送任何消息
                if (!preText) {
                    log('debug', '检测到空<pre>标签，不发送消息');
                    continue;
                }
                
                // 检查<pre>内是否有<voice>标签
                const voiceRegex = /<voice>(.*?)<\/voice>/g;
                let voiceMatch;
                let hasVoice = false;
                let voiceText = '';
                
                // 处理<pre>文本<voice>语音</voice></pre>或<pre><voice>语音</voice>文本</pre>的情况
                // 将其拆分为多条消息：文本消息和语音消息
                if ((voiceMatch = voiceRegex.exec(preText)) !== null) {
                    hasVoice = true;
                    let lastIndex = 0;
                    let segments = [];
                    
                    // 重置regex，因为已经执行过一次exec
                    voiceRegex.lastIndex = 0;
                    
                    // 查找所有<voice>标签并按顺序处理
                    while ((voiceMatch = voiceRegex.exec(preText)) !== null) {
                        // 处理<voice>标签前的文本
                        if (voiceMatch.index > lastIndex) {
                            const textBefore = preText.substring(lastIndex, voiceMatch.index).trim();
                            if (textBefore) {
                                parsePreContent(textBefore, currentSegments);
                                if (currentSegments.length > 0) {
                                    operations.push({ type: 'send_message', segments: [...currentSegments] });
                                    currentSegments = [];
                                }
                            }
                        }
                        
                        // 处理语音内容
                        voiceText = voiceMatch[1].trim();
                        if (voiceText) {
                            operations.push({ type: 'send_voice', text: voiceText });
                            log('debug', '解析到混合<pre>中的语音标签:', voiceText);
                        }
                        
                        lastIndex = voiceRegex.lastIndex;
                    }
                    
                    // 处理最后一个<voice>标签后的文本
                    if (lastIndex < preText.length) {
                        const textAfter = preText.substring(lastIndex).trim();
                        if (textAfter) {
                            parsePreContent(textAfter, currentSegments);
                            if (currentSegments.length > 0) {
                                operations.push({ type: 'send_message', segments: [...currentSegments] });
                                currentSegments = [];
                            }
                        }
                    }
                } else {
                    // 不含语音标签的普通<pre>内容，使用通用解析函数处理
                    parsePreContent(preText, currentSegments);
                    
                    // 立即打包发送当前<pre>内容
                    if (currentSegments.length > 0) {
                        operations.push({ type: 'send_message', segments: [...currentSegments] });
                        currentSegments = []; // 清空当前消息段，准备处理下一个标签
                    }
                }
            } else if (imageContent !== undefined) {
                const imageUrl = imageContent.trim();
                if (imageUrl) {
                    currentSegments.push({ type: 'image', data: { file: imageUrl } });
                }
            }
            lastBlockIndex = tagRegex.lastIndex;
        }

        // 处理最后一个标签之后可能存在的裸露文本
        let textAfterLastTag = blockContent.substring(lastBlockIndex).trim();
        if (textAfterLastTag) {
            // 只有当裸露文本不包含类似标签的结构时才发送
            if (!textAfterLastTag.includes("<pre") && !textAfterLastTag.includes("<image")) {
                currentSegments.push({ type: 'text', data: { text: textAfterLastTag } });
            } else {
                log('debug', '检测到最后一个标签后的裸露文本中包含类标签结构，已忽略:', textAfterLastTag);
            }
        }

        // 如果在处理完一个 <message> 块后，仍有未发送的消息段，打包它们
        if (currentSegments.length > 0) {
            operations.push({ type: 'send_message', segments: currentSegments });
        }
    } // 结束 messageBlocks 循环

    return operations;
}

// --- 辅助函数 ---
/**
 * 解析<pre>标签内的内容，支持同时处理<at>和<image>标签，保持原文顺序
 * @param preText <pre>标签内的文本内容
 * @param segments 消息段数组，解析结果会添加到这个数组中
 */
function parsePreContent(preText: string, segments: OneBotMessageSegment[]): void {
    // 如果内容为空或只有空白，不添加任何消息段
    if (!preText || preText.trim() === '') {
        return;
    }
    
    // 复合正则表达式匹配<at>和<image>标签
    const tagRegex = /<(at|image)>(.*?)<\/\1>/g;
    let tagMatch;
    let lastIndex = 0;
    let hasTag = false;
    
    // 遍历所有标签
    while ((tagMatch = tagRegex.exec(preText)) !== null) {
        hasTag = true;
        const [fullMatch, tagType, content] = tagMatch;
        
        // 处理标签前的文本
        if (tagMatch.index !== undefined && tagMatch.index > lastIndex) {
            const textBefore = preText.substring(lastIndex, tagMatch.index); // 不使用 trim()
            if (textBefore) { // 检查是否为空字符串，但保留空格
                segments.push({ type: 'text', data: { text: textBefore } });
            }
        }
        
        // 根据标签类型添加不同的消息段
        if (tagType === 'at') {
            const userId = content.trim();
            if (userId) {
                segments.push({ type: 'at', data: { qq: userId } });
                log('trace', '解析到<pre>内的@标签:', userId);
            }
        } else if (tagType === 'image') {
            const imageUrl = content.trim();
            if (imageUrl) {
                segments.push({ type: 'image', data: { file: imageUrl } });
                log('debug', '解析到<pre>内的图片标签:', imageUrl);
            }
        }
        
        lastIndex = tagMatch.index !== undefined ? tagMatch.index + fullMatch.length : 0;
    }
    
    // 处理最后一个标签后的文本
    if (hasTag) {
        const textAfter = preText.substring(lastIndex); // 不使用 trim()
        if (textAfter) { // 检查是否为空字符串，但保留空格
            segments.push({ type: 'text', data: { text: textAfter } });
        }
    } else {
        // 没有任何标签，直接添加为纯文本（如果 preText 本身不为空）
        if (preText) { // 检查 preText 是否为空字符串，但保留空格
            segments.push({ type: 'text', data: { text: preText } });
        }
    }
}
