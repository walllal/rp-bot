import { ContextType, Role as DbRole } from '@prisma/client';
import { z } from 'zod'; // 导入 Zod

/**
 * OpenAI API 的消息角色
 */
export type OpenAIRole = 'system' | 'user' | 'assistant';
export const OpenAIRoleSchema = z.enum(['system', 'user', 'assistant']); // Zod schema for role

/**
 * 预设中定义的消息对象结构
 */
export interface PresetMessage {
  role: OpenAIRole;
  content: string;
  enabled?: boolean; // 添加 enabled 字段
}
// Zod schema for PresetMessage
export const PresetMessageSchema = z.object({
  role: OpenAIRoleSchema,
  content: z.string(),
  enabled: z.boolean().optional().default(true), // 验证 enabled 字段
  is_variable_placeholder: z.literal(false).optional(), // 明确区分
  variable_name: z.undefined().optional(), // 确保消息类型没有 variable_name
  config: z.undefined().optional(), // 确保消息类型没有 config
});


/**
 * 预设中用于表示动态内容的占位符结构
 */
export interface VariablePlaceholder {
  is_variable_placeholder: true;
  variable_name: 'user_input' | 'chat_history' | 'message_history'; // 添加 message_history
  config?: Record<string, any>; // 可选配置，例如 chat_history 的 max_length, message_history 的 limit
  enabled?: boolean; // 添加 enabled 字段
}
// Zod schema for VariablePlaceholder
export const VariablePlaceholderSchema = z.object({
  is_variable_placeholder: z.literal(true),
  variable_name: z.enum(['user_input', 'chat_history', 'message_history']), // 添加 message_history
  config: z.record(z.any()).optional(), // 允许任意配置对象
  enabled: z.boolean().optional().default(true), // 验证 enabled 字段
  role: z.undefined().optional(), // 确保占位符类型没有 role
  content: z.undefined().optional(), // 确保占位符类型没有 content
});


/**
 * 预设内容的单个项目 Zod 验证模式 (导出)
 * 它可以是 PresetMessage 或 VariablePlaceholder
 */
export const PresetItemSchema = z.union([
    PresetMessageSchema,
    VariablePlaceholderSchema
]);

/**
 * 预设内容的完整结构 (消息或占位符的数组)
 */
export type PresetContent = Array<z.infer<typeof PresetItemSchema>>; // 使用 Zod 推断类型

/**
 * 用于变量替换的上下文信息
 */
export interface VariableContext {
  timestamp: Date;        // 当前时间
  botId?: string;         // 机器人自身的 QQ 号
  userId?: string;        // 发送消息用户的 QQ 号
  userNickname?: string;  // 发送消息用户的昵称
  userCard?: string;      // 发送消息用户在群里的名片 (如果是群聊)
  groupId?: string;       // 消息所在的群号 (如果是群聊)
  groupName?: string;     // 消息所在的群名称 (可能需要从 Napcat 获取, 暂未实现)
  botName?: string | null; // 机器人名称 (从预设获取)
  replayContent?: string; // 新增：格式化后的被回复消息内容 (如果当前消息是回复), 对应 {{replay_content}}
  isReply?: string;       // "yes" or "no", 对应 {{replay_is}}
  isPrivateChat?: string; // "yes" or "no", 对应 {{private_is}}
  isGroupChat?: string;   // "yes" or "no", 对应 {{group_is}}
  message?: string;       // 当前处理的用户的原始消息文本 (用于 {{user_input}} 或 {{message_last}} 的基础)
  // 可以根据需要添加更多上下文变量
}

/**
 * 从数据库获取的聊天历史记录项 (映射 Prisma 类型)
 */
export interface ChatHistoryItem {
  role: DbRole; // USER or ASSISTANT from Prisma Enum
  content: string;
  timestamp: Date;
  userId: string; // Add userId
  userName?: string | null; // Add optional userName
  // Add other fields if needed by the processor, e.g., messageId
}

/**
 * 定义用户输入内容的结构化类型 (用于多模态)
 */
export type UserMessageContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }; // 允许可选的 detail

/**
 * 更新 OpenAI 消息结构以支持多模态 content
 */
export interface OpenAIMessage {
  role: OpenAIRole;
  content: string | UserMessageContentItem[]; // content 可以是字符串或结构化数组
}
