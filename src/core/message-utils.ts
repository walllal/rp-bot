import { OpenAIMessage, UserMessageContentItem } from './types';

/**
 * 内部核心函数：处理单个文本字符串中的 at 提及。
 * 根据模式移除 at 或者将其转换为 <at>标签。
 *
 * @param text 原始文本字符串
 * @param mode 当前配置的模式 ('STANDARD' 或 'ADVANCED')
 * @param selfId 机器人自身的 QQ 号 (仅在高级模式转换 [@me] 时需要)
 * @returns 处理后的文本字符串
 */
function _transformTextWithAtMentions(text: string, mode: string, selfId?: string): string {
    if (mode !== 'ADVANCED') {
        // 非高级模式：移除 [@...]
        // 仅规范化水平空白字符，保留换行符
        // 先替换@提及为空格
        let processed = text.replace(/\[@.*?\]/g, ' ');
        // 然后按行分割文本，对每行分别处理水平空白，再重新用换行符连接
        return processed.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
    } else {
        // 高级模式：转换 [@...] 为 <at>...</at>
        let tempContent = text;
        if (selfId) {
            // 替换 [@me]
            tempContent = tempContent.replace(/\[@me\]/g, `<at>${selfId}</at>`);
        }
        // 替换其他 [@target]
        // 正则表达式确保只匹配方括号内的非方括号字符，避免贪婪匹配问题
        return tempContent.replace(/\[@([^\]]+)\]/g, (match, target) => {
            if (target === 'me') {
                // 如果 selfId 未提供或因某种原因[@me]未被替换，则保留原始的[@me]
                // 或者根据业务需求返回空字符串或特定标记
                return match;
            }
            return `<at>${target}</at>`;
        });
    }
}

/**
 * 处理 OpenAIMessage 数组中的 at 提及信息，用于发送给 OpenAI。
 *
 * @param messages 原始的 OpenAIMessage 数组
 * @param mode 当前配置的模式 ('STANDARD' 或 'ADVANCED')
 * @param selfId 机器人自身的 QQ 号
 * @returns 处理后的 OpenAIMessage 数组
 */
export function processAtMentionsInOpenAIMessages(
    messages: OpenAIMessage[],
    mode: string,
    selfId?: string
): OpenAIMessage[] {
    return messages.map(message => {
        const newMessage = { ...message }; // 浅拷贝以修改 content
        if (typeof newMessage.content === 'string') {
            newMessage.content = _transformTextWithAtMentions(newMessage.content, mode, selfId);
        } else { // content is UserMessageContentItem[]
            newMessage.content = newMessage.content.map(item => {
                if (item.type === 'text') {
                    return { ...item, text: _transformTextWithAtMentions(item.text, mode, selfId) };
                }
                return item;
            });
        }
        return newMessage;
    });
}

/**
 * 处理用户纯文本消息中的 at 提及，用于存入历史记录。
 *
 * @param text 原始用户消息文本
 * @param mode 当前配置的模式 ('STANDARD' 或 'ADVANCED')
 * @param selfId 机器人自身的 QQ 号
 * @returns 处理后的文本字符串
 */
export function transformUserTextForHistory(
    text: string,
    mode: string,
    selfId?: string
): string {
    return _transformTextWithAtMentions(text, mode, selfId);
}

/**
 * 处理用户结构化消息内容中的 at 提及，用于存入历史记录。
 *
 * @param contentItems 原始用户消息内容项数组
 * @param mode 当前配置的模式 ('STANDARD' 或 'ADVANCED')
 * @param selfId 机器人自身的 QQ 号
 * @returns 处理后的 UserMessageContentItem 数组
 */
export function transformUserMessageContentForHistory(
    contentItems: UserMessageContentItem[],
    mode: string,
    selfId?: string
): UserMessageContentItem[] {
    return contentItems.map(item => {
        if (item.type === 'text') {
            const newText = _transformTextWithAtMentions(item.text, mode, selfId);
            // 如果处理后文本为空，可以考虑是否要保留这个 text item
            // 当前逻辑是保留，即使 text 为空字符串
            return { ...item, text: newText };
        }
        return item;
    }).filter(item => { // 过滤掉处理后文本内容为空的 text item
        if (item.type === 'text' && !item.text.trim()) {
            return false;
        }
        return true;
    });
}

/**
 * 从 MessageHistory 的 rawMessage (可能是字符串或 OneBotMessageSegment[]) 中提取纯文本内容。
 * 非文本内容会被转换为占位符，所有形式的 @提及 (如 `[@12345]`, `[@me]`) 会被移除。
 * @param rawMessage 消息历史记录中的 rawMessage 字段
 * @returns 处理后的纯文本字符串
 */
export function extractPlainTextFromRepliedMessage(rawMessage: any): string {
    if (typeof rawMessage === 'string') {
        const result = rawMessage.replace(/\[@(?:me|\d+|未知)\]/g, '').replace(/\s\s+/g, ' ').trim();
        return result;
    }

    if (Array.isArray(rawMessage)) {
        const parts: string[] = [];
        for (let i = 0; i < rawMessage.length; i++) {
            const segment = rawMessage[i];
            // Ensure segment is an object and has a type property
            if (segment && typeof segment === 'object' && typeof segment.type === 'string') {
                switch (segment.type) {
                    case 'text':
                        // rawMessage from DB stores UserMessageContentItem[]
                        // UserMessageContentTextItem is { type: 'text', text: string }
                        // It does not have a 'data' property for text.
                        const textItem = segment as UserMessageContentItem; // Cast to base UserMessageContentItem
                        if (textItem.type === 'text' && typeof textItem.text === 'string') {
                            parts.push(textItem.text);
                        }
                        break;
                    case 'at':
                        break;
                    case 'image':
                        parts.push('[图片]');
                        break;
                    case 'face':
                        parts.push('[表情]');
                        break;
                    case 'record':
                        parts.push('[语音]');
                        break;
                    case 'video':
                        parts.push('[视频]');
                        break;
                    case 'share':
                        parts.push('[分享]');
                        break;
                    case 'location':
                        parts.push('[位置]');
                        break;
                    case 'reply':
                        break;
                    default:
                        break;
                }
            }
        }
        const joinedParts = parts.join(' ');
        const finalResult = joinedParts.replace(/\[@(?:me|\d+|未知)\]/g, '').replace(/\s\s+/g, ' ').trim();
        return finalResult;
    }

    return '';
}