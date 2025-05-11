import { FastifyInstance } from 'fastify';
import { IVoiceSynthesisPlugin } from '../plugin-interface';
import { QQVoiceConfig } from './config';
import { sendOneBotAction } from '../../onebot/connection'; // 导入 OneBot 调用函数

// 定义说话人类型 (从 luna-vits 借鉴)
interface QQVoiceSpeaker {
    name: string;
    characterId: string;
}

export class QQVoicePlugin implements IVoiceSynthesisPlugin<QQVoiceConfig> {
    readonly name = 'qq-voice';
    readonly description = '使用 QQ 官方接口发送 AI 语音消息 (需要 OneBot 实现支持)';
    config: QQVoiceConfig = { 
        enabled: false,
        autoUpdateTestGroup: true
    }; // 默认配置
    private server!: FastifyInstance; // 用于日志

    async initialize(server: FastifyInstance, initialConfig: QQVoiceConfig): Promise<void> {
        this.server = server;
        this.config = { ...this.config, ...initialConfig };
        this.log('info', `QQ Voice 插件初始化完成。当前状态: ${this.config.enabled ? '启用' : '禁用'}`);
    }

    async updateConfig(newConfig: Partial<QQVoiceConfig>): Promise<void> {
        const wasEnabled = this.config.enabled;
        
        // 明确处理每个可能的配置项，避免引用问题
        if (newConfig.testGroupId !== undefined) {
            this.config.testGroupId = newConfig.testGroupId;
            this.log('debug', `测试群组ID已更新为: ${newConfig.testGroupId}`);
        }
        
        if (newConfig.enabled !== undefined) {
            // 首先转换成字符串，然后比较，避免类型错误
            const enabledValue = String(newConfig.enabled).toLowerCase();
            this.config.enabled = enabledValue === 'true';
        }
        
        if (newConfig.autoUpdateTestGroup !== undefined) {
            // 首先转换成字符串，然后比较，避免类型错误
            const autoUpdateValue = String(newConfig.autoUpdateTestGroup).toLowerCase();
            this.config.autoUpdateTestGroup = autoUpdateValue === 'true';
            this.log('debug', `自动更新测试群设置为: ${this.config.autoUpdateTestGroup}`);
        }
        
        if (newConfig.defaultSpeakerId !== undefined) {
            this.config.defaultSpeakerId = newConfig.defaultSpeakerId;
        }
        
        this.log('info', 'QQ Voice 插件配置已更新。');
        // 如果启用状态改变，则调用 enable/disable
        if (wasEnabled !== this.config.enabled) {
            if (this.config.enabled) {
                await this.enable();
            } else {
                await this.disable();
            }
        }
    }

    async enable(): Promise<void> {
        this.config.enabled = true;
        this.log('info', 'QQ Voice 插件已启用。');
        // 可以在这里添加启用时的逻辑，例如检查配置
        if (!this.config.testGroupId) {
            this.log('warn', '未配置用于获取说话人列表的测试群号 (testGroupId)，将无法获取说话人列表。');
        }
    }

    async disable(): Promise<void> {
        this.config.enabled = false;
        this.log('info', 'QQ Voice 插件已禁用。');
    }

    /**
     * 触发 OneBot 发送 QQ AI 语音消息
     * @param text 要发送的文本
     * @param options 包含 groupId 和 speakerId 的选项
     * @returns Promise<void> (因为实际发送由 OneBot 处理)
     */
    async synthesize(text: string, options?: { groupId?: string; speakerId?: string }): Promise<void> {
        if (!this.config.enabled) {
            throw new Error('QQ Voice 插件未启用');
        }
        if (!options?.groupId) {
            throw new Error('缺少必要的 groupId 参数');
        }

        const speakerId = options.speakerId || this.config.defaultSpeakerId;
        if (!speakerId) {
            throw new Error('缺少 speakerId 参数，且未配置默认说话人');
        }

        this.log('debug', `尝试发送 QQ 语音: 群=${options.groupId}, 说话人=${speakerId}, 文本="${text.substring(0, 50)}..."`);

        try {
            // 调用非标准 OneBot 动作
            const response = await sendOneBotAction({
                action: 'send_group_ai_record',
                params: {
                    group_id: options.groupId,
                    character: speakerId,
                    text: text,
                },
            });
            // QQ 语音动作通常不返回有意义的数据，但检查 status
            if (response.status !== 'ok') {
                 this.log('error', `发送 QQ 语音失败 (OneBot 返回错误): ${response.message || response.retcode}`, response);
                 throw new Error(`发送 QQ 语音失败: ${response.message || response.retcode}`);
            }
            this.log('info', `成功触发 QQ 语音发送: 群=${options.groupId}, 说话人=${speakerId}`);
        } catch (error: any) {
            this.log('error', `调用 send_group_ai_record 动作时出错: ${error.message}`, error);
            throw error; // 重新抛出错误，让调用者知道失败了
        }
    }

    /**
     * 获取可用的 QQ 语音说话人列表
     * @param groupId 可选：指定群ID。如果提供，将使用此群ID而不是配置中的testGroupId
     * @returns 说话人列表 Promise<QQVoiceSpeaker[]>
     * 
     * 注意：QQ官方API要求提供群ID才能获取可用的AI语音角色列表。
     * 这是QQ API的限制，并非本插件的限制。您需要：
     * 1. 在插件配置中设置testGroupId（机器人必须在该群中）
     * 2. 或者在调用此函数时提供groupId参数
     */
    async getSpeakers(groupId?: string): Promise<QQVoiceSpeaker[]> {
        // 即使插件未启用也允许获取说话人列表，仅在debug级别记录此情况
        if (!this.config.enabled) {
            this.log('debug', '插件当前未启用，但仍将尝试获取说话人列表');
            // 继续执行，不要提前返回空数组
        }
        
        // 优先使用传入的groupId，如果没有则使用配置中的testGroupId
        const effectiveGroupId = groupId || this.config.testGroupId;
        
        if (!effectiveGroupId) {
            const errorMsg = '无法获取说话人列表，因为未提供群ID且未配置测试群号 (testGroupId)';
            this.log('error', errorMsg);
            throw new Error(errorMsg);
        }

        // 验证群号是否在机器人的群组列表中
        try {
            // 导入群组查询函数
            const { getAllGroups } = await import('../../db/contacts');
            const groups = await getAllGroups();
            const groupExists = groups.some(g => g.groupId === effectiveGroupId);
            
            if (!groupExists) {
                const errorMsg = `无法获取说话人列表，提供的群号 ${effectiveGroupId} 不在机器人加入的群组列表中`;
                this.log('error', errorMsg);
                throw new Error(errorMsg);
            }
            
            this.log('debug', `尝试使用群 ${effectiveGroupId} 获取 QQ 语音说话人列表...`);
        } catch (error) {
            if ((error as Error).message.includes('不在机器人加入的群组列表中')) {
                // 这是我们自己抛出的错误，直接重新抛出
                throw error;
            }
            // 如果是其他错误（如数据库查询失败），记录但继续尝试
            this.log('warn', `验证群号有效性时出现问题: ${(error as Error).message}，仍将尝试获取说话人列表`);
        }

        try {
            // 调用非标准 OneBot 动作
            const response = await sendOneBotAction({
                action: 'get_ai_characters',
                params: {
                    group_id: effectiveGroupId,
                },
            });

            if (response.status !== 'ok' || !response.data) {
                const errorMsg = `获取说话人列表失败 (OneBot API错误): ${response.message || response.retcode || '未知错误'}`;
                this.log('error', errorMsg, response);
                throw new Error(errorMsg);
            }

            // 解析返回的数据 (结构参考 luna-vits)
            const rawData = response.data as any; // 类型断言为 any 以便访问嵌套属性
            if (!Array.isArray(rawData)) {
                const errorMsg = '获取说话人列表失败，返回的数据格式不正确 (不是数组)';
                this.log('error', errorMsg, rawData);
                throw new Error(errorMsg);
            }

            const speakers: QQVoiceSpeaker[] = rawData.flatMap((category: any) => {
                if (category && Array.isArray(category.characters)) {
                    return category.characters.map((char: any) => ({
                        name: char.character_name,
                        characterId: char.character_id,
                    }));
                }
                return [];
            });

            // 去重 (以防万一)
            const uniqueSpeakers = Array.from(new Map(speakers.map(s => [s.characterId, s])).values());

            this.log('info', `成功获取到 ${uniqueSpeakers.length} 个 QQ 语音说话人。`);
            return uniqueSpeakers;

        } catch (error: any) {
            // 细分错误类型
            let errorMessage: string;
            
            if (error.message.includes('OneBot WebSocket 未连接')) {
                errorMessage = '获取说话人列表失败: 连接错误 - OneBot未连接';
            } else if (error.message.includes('API错误')) {
                errorMessage = error.message; // 已经是格式化好的API错误
            } else if (error.message.includes('不在机器人加入的群组列表中')) {
                errorMessage = error.message; // 已经是格式化好的群组验证错误
            } else {
                errorMessage = `获取说话人列表失败: ${error.message || '未知错误'}`;
            }
            
            this.log('error', `调用 get_ai_characters 动作时出错: ${errorMessage}`, error);
            throw new Error(errorMessage); // 始终抛出错误，不要在这里返回空数组
        }
    }

    // 简单的日志记录方法
    private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
        if (this.server?.log) {
            (this.server.log as any)[level](`[Plugin: ${this.name}] ${message}`, data ?? '');
        } else {
            console[level](`[Plugin: ${this.name}] ${message}`, data ?? '');
        }
    }

    // --- 配置定义 (用于前端) ---
    async getConfigDefinition() {
        // 定义配置项及其类型、标签、描述等
        return [
            { key: 'enabled', type: 'boolean', label: '启用插件', description: '是否启用 QQ 语音插件' },
            { key: 'testGroupId', type: 'text', label: '测试群号', description: '用于获取可用说话人列表的群聊 ID (QQ API要求提供群ID才能获取角色列表，机器人必须是该群成员)', required: false },
            { key: 'autoUpdateTestGroup', type: 'boolean', label: '自动更新测试群', description: '连接成功后自动使用第一个可用群作为测试群，无需手动配置', default: true },
            { key: 'defaultSpeakerId', type: 'text', label: '默认说话人 ID', description: '发送语音时默认使用的角色 ID (可选)', required: false },
            // 可以在这里添加一个按钮或区域来显示/刷新说话人列表
            { type: 'speakers', label: '可用说话人', description: '' }
        ];
    }
}

// 导出插件实例，以便插件管理器加载
export default new QQVoicePlugin();
