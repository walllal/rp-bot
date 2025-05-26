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

    // 只处理最后一个 <message> 块
    const lastMessageBlockContent = messageBlocks[messageBlocks.length - 1];
    log('debug', `高级模式：提取到最后一个 <message> 块内容进行处理: ${lastMessageBlockContent.substring(0, 300)}...`);

    let currentSegments: OneBotMessageSegment[] = [];
    // 修改正则表达式，只匹配<pre>标签
    const tagRegex = /<pre>(.*?)<\/pre>/gs;
    let tagMatch;
    let lastBlockIndex = 0; // Tracks position within lastMessageBlockContent

    while ((tagMatch = tagRegex.exec(lastMessageBlockContent)) !== null) {
        // 裸露文本（在<pre>标签之外的）将被忽略，所以移除 textBeforeTag 的处理逻辑

        // 解构赋值只针对 preContent
        const [_fullMatch, preContent] = tagMatch; // _fullMatch is unused

        if (preContent !== undefined) { // Should always be true if regex matches
            // 处理 <pre> 内部的文本、@、图片和语音
            // 如果已有消息段 (理论上不应该发生，因为我们清除了裸露文本，并且每个<pre>独立处理)
            // 但为了安全，如果 currentSegments 因某些意外情况有内容，先清空或处理
            if (currentSegments.length > 0) {
                 // This case should ideally not be hit if only <pre> content is processed.
                 // If hit, it implies something was added to currentSegments before this <pre> block.
                 // Depending on desired behavior, either send them or clear them.
                 // For now, let's assume each <pre> starts fresh unless it's part of a multi-segment <pre> (handled by parsePreContent).
                 // The original logic of sending `currentSegments` here before processing a new <pre>
                 // was to ensure each <pre> tag's content is sent as a distinct set of operations.
                 // This behavior is preserved.
                operations.push({ type: 'send_message', segments: [...currentSegments] });
                currentSegments = []; // 清空当前消息段
            }
            
            const preText = preContent.trim();
            
            // 如果<pre>标签为空，则不发送任何消息
            if (!preText) {
                log('debug', '检测到空<pre>标签，不发送消息');
                // lastBlockIndex needs to be updated even if we continue
                lastBlockIndex = tagRegex.lastIndex;
                continue;
            }
            
            // 检查<pre>内是否有<voice>标签
            const voiceRegex = /<voice>(.*?)<\/voice>/g;
            let voiceMatch;
            // let hasVoice = false; // Unused
            let voiceText = '';
            
            if ((voiceMatch = voiceRegex.exec(preText)) !== null) { // Check if any voice tag exists
                // hasVoice = true; // Unused
                let lastVoiceIndex = 0; // Index within preText
                
                voiceRegex.lastIndex = 0; // Reset regex for full scan of preText
                
                while ((voiceMatch = voiceRegex.exec(preText)) !== null) {
                    // 处理<voice>标签前的文本
                    if (voiceMatch.index > lastVoiceIndex) {
                        const textBeforeVoice = preText.substring(lastVoiceIndex, voiceMatch.index).trim();
                        if (textBeforeVoice) {
                            // currentSegments for this part of preText
                            let segmentsForTextBeforeVoice: OneBotMessageSegment[] = [];
                            parsePreContent(textBeforeVoice, segmentsForTextBeforeVoice);
                            if (segmentsForTextBeforeVoice.length > 0) {
                                operations.push({ type: 'send_message', segments: segmentsForTextBeforeVoice });
                            }
                        }
                    }
                    
                    voiceText = voiceMatch[1].trim();
                    if (voiceText) {
                        operations.push({ type: 'send_voice', text: voiceText });
                        log('debug', '解析到混合<pre>中的语音标签:', voiceText);
                    }
                    
                    lastVoiceIndex = voiceRegex.lastIndex;
                }
                
                // 处理最后一个<voice>标签后的文本
                if (lastVoiceIndex < preText.length) {
                    const textAfterLastVoice = preText.substring(lastVoiceIndex).trim();
                    if (textAfterLastVoice) {
                        let segmentsForTextAfterVoice: OneBotMessageSegment[] = [];
                        parsePreContent(textAfterLastVoice, segmentsForTextAfterVoice);
                        if (segmentsForTextAfterVoice.length > 0) {
                            operations.push({ type: 'send_message', segments: segmentsForTextAfterVoice });
                        }
                    }
                }
                // currentSegments should be empty here as parts of preText are sent immediately
                currentSegments = [];
            } else {
                // 不含语音标签的普通<pre>内容，使用通用解析函数处理
                // currentSegments will be populated by parsePreContent
                parsePreContent(preText, currentSegments);
                
                // 立即打包发送当前<pre>内容
                if (currentSegments.length > 0) {
                    operations.push({ type: 'send_message', segments: [...currentSegments] });
                    currentSegments = []; // 清空当前消息段
                }
            }
        }
        // Removed 'else if (imageContent !== undefined)' block as tagRegex only matches <pre>

        lastBlockIndex = tagRegex.lastIndex;
    }

    // 裸露文本（在所有<pre>标签之后，但在</message>之前）将被忽略
    // Removed 'textAfterLastTag' processing logic

    // 如果在处理完最后一个 <message> 块后，仍有未发送的消息段 (理论上不应该，因为每个<pre>都独立发送了)
    // 但以防万一，如果 currentSegments 还有内容，清空它，因为我们只处理 <pre> 块。
    if (currentSegments.length > 0) {
        log('trace', 'Clearing unexpected remaining segments after processing all <pre> tags in the last message block.', currentSegments);
        currentSegments = []; // Ensure no stray segments are sent
    }
    // The old logic of pushing remaining currentSegments is removed because
    // we are only interested in content explicitly within <pre> tags, and each <pre>
    // (or its parts if mixed with <voice>) should have generated its own operations.

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
                const isValidQq = /^\d{5,11}$/.test(userId); // 5-11位数字作为有效QQ号的简单校验
                if (isValidQq) {
                    segments.push({ type: 'at', data: { qq: userId } });
                    log('trace', '解析到<pre>内的有效@标签:', userId);
                } else {
                    // 无效的QQ号，不添加任何消息段，相当于移除了这个<at>标签。
                    // 标签前后的文本会由外层逻辑正常处理。
                    log('warn', `解析到<pre>内的无效@目标 "${userId}"，该<at>标签已被忽略处理。`);
                }
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
