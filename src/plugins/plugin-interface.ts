import { FastifyInstance } from 'fastify';

/**
 * 插件配置对象的基础接口
 * 所有插件的配置都应扩展此接口
 */
export interface BasePluginConfig {
    enabled: boolean; // 插件是否启用
}

/**
 * 插件实例的基础接口
 */
export interface IPlugin<T extends BasePluginConfig> {
    /**
     * 插件的唯一名称/ID (例如 'qq-voice')
     */
    readonly name: string;

    /**
     * 插件的可读描述
     */
    readonly description: string;

    /**
     * 插件的当前配置
     */
    config: T;

    /**
     * 初始化插件
     * @param server Fastify 服务器实例，用于日志记录等
     * @param initialConfig 初始配置
     */
    initialize(server: FastifyInstance, initialConfig: T): Promise<void>;

    /**
     * 更新插件配置
     * @param newConfig 新的配置对象
     */
    updateConfig(newConfig: Partial<T>): Promise<void>;

    /**
     * 启用插件
     */
    enable(): Promise<void>;

    /**
     * 禁用插件
     */
    disable(): Promise<void>;

    /**
     * 获取插件的当前状态（例如，是否已连接到外部服务）
     * @returns 状态描述字符串或对象
     */
    getStatus?(): Promise<any>;

    /**
     * 获取插件配置的定义（用于前端 UI 生成）
     * @returns 配置项数组或其他结构
     */
    getConfigDefinition?(): Promise<any>; // TODO: 定义更具体的配置结构
}

/**
 * 语音合成插件的特定接口 (如果需要统一调用)
 */
export interface IVoiceSynthesisPlugin<T extends BasePluginConfig> extends IPlugin<T> {
    /**
     * 合成语音
     * @param text 要合成的文本
     * @param options 合成选项 (例如 speakerId)
     * @returns 合成结果 (例如音频数据 Buffer 或 Base64, 或直接触发发送)
     */
    synthesize(text: string, options?: any): Promise<any>;

    /**
     * 获取可用的说话人列表 (可选)
     * @returns 说话人列表
     */
    getSpeakers?(): Promise<any[]>;
}
