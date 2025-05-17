import { OpenAIMessage, UserMessageContentItem } from './types';

/**
 * 内部核心函数：处理单个文本字符串中的 at 提及。
 * 根据模式移除 at 或者将其转换为 <at>标签。
 *
 * @param text 原始文本字符串
 * @param mode 当前配置的模式 ('STANDARD' 或 'ADVANCED')
 * @param botId 机器人自身的 QQ 号 (仅在高级模式转换 [@me] 时需要)
 * @returns 处理后的文本字符串
 */
function _transformTextWithAtMentions(text: string /*, mode: string, botId?: string */): string {
    // 统一目标：保留所有 [@ID] 格式的提及，仅做必要的空白字符清理。
    // mode 和 botId 参数对于格式转换不再使用，但保留签名以减少其他地方的修改，
    // 或者未来可以用于更细致的控制（例如，仅移除@机器人自身发给AI时）。
    // 当前，我们假设发送给AI的也应该是 [@ID] 格式。
    return text.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
}

/**
 * 处理 OpenAIMessage 数组中的 at 提及信息，用于发送给 OpenAI。
 *
 * @param messages 原始的 OpenAIMessage 数组
 * @param mode 当前配置的模式 ('STANDARD' 或 'ADVANCED')
 * @param botId 机器人自身的 QQ 号
 * @returns 处理后的 OpenAIMessage 数组
 */
export function processAtMentionsInOpenAIMessages(
    messages: OpenAIMessage[],
    mode: string, // Mode is now effectively unused by _transformTextWithAtMentions for @ format conversion
    botId?: string // botId is now effectively unused by _transformTextWithAtMentions for @ format conversion
): OpenAIMessage[] {
    return messages.map(message => {
        const newMessage = { ...message }; // 浅拷贝以修改 content
        if (typeof newMessage.content === 'string') {
            // _transformTextWithAtMentions 现在主要做空白清理，并保留 [@ID]
            newMessage.content = _transformTextWithAtMentions(newMessage.content /*, mode, botId */);
        } else { // content is UserMessageContentItem[]
            newMessage.content = newMessage.content.map(item => {
                if (item.type === 'text') {
                    return { ...item, text: _transformTextWithAtMentions(item.text /*, mode, botId */) };
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
 * @param botId 机器人自身的 QQ 号
 * @returns 处理后的文本字符串
 */
export function transformUserTextForHistory(
    text: string,
    // mode: string, // Mode is not used for history transformation of @mentions
    // botId?: string // BotId is not used for history transformation of @mentions
): string {
    // For history, we want to preserve [@...] mentions as they are from parseOneBotMessage.
    // We only normalize whitespace.
    return text.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
}

/**
 * 处理用户结构化消息内容中的 at 提及，用于存入历史记录。
 *
 * @param contentItems 原始用户消息内容项数组
 * @param mode 当前配置的模式 ('STANDARD' 或 'ADVANCED')
 * @param botId 机器人自身的 QQ 号
 * @returns 处理后的 UserMessageContentItem 数组
 */
export function transformUserMessageContentForHistory(
    contentItems: UserMessageContentItem[],
    // mode: string, // Mode is not used for history transformation of @mentions
    // botId?: string // BotId is not used for history transformation of @mentions
): UserMessageContentItem[] {
    return contentItems.map(item => {
        if (item.type === 'text') {
            // For history, preserve [@...] mentions. Only normalize whitespace.
            const newText = item.text.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
            return { ...item, text: newText };
        }
        return item;
    }).filter(item => {
        // Filter out text items that become effectively empty after whitespace normalization.
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
        // 保留 [@ID] 提及, 只清理多余空格
        const result = rawMessage.replace(/\s\s+/g, ' ').trim();
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
                    case 'image_url': // 处理通过 URL 存储的图片
                        parts.push('[图片]');
                        break;
                    case 'image': // 保留对原始 image 类型的处理
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
        // 保留 [@ID] 提及, 只清理多余空格
        const finalResult = joinedParts.replace(/\s\s+/g, ' ').trim();
        return finalResult;
    }

    return '';
}