import { BasePluginConfig } from '../plugin-interface';

/**
 * QQ Voice 插件的配置接口
 */
export interface QQVoiceConfig extends BasePluginConfig {
    /**
     * 用于获取说话人列表的群号
     * 
     * 注意：这是由QQ官方API限制决定的，获取AI语音角色列表必须提供一个群ID。
     * 您需要在插件配置中设置一个机器人所在的群号，仅用于获取全局可用的语音角色列表。
     * 角色列表获取后会被缓存，供所有会话使用，而不仅限于此群。
     * 
     * 机器人必须是该群的成员才能成功获取列表。
     */
    testGroupId?: string;

    /**
     * 是否在机器人连接成功后自动更新测试群
     * 
     * 如果启用此选项，系统会在连接成功并获取群列表后，
     * 自动将第一个可用群设置为测试群，无需手动配置。
     * 
     * 注意：如果您已手动设置了特定的测试群且想保持不变，请关闭此选项。
     */
    autoUpdateTestGroup?: boolean;

    /**
     * 默认使用的说话人 ID (可选)
     */
    defaultSpeakerId?: string;

    // 注意：AppID 和 Token 通常是 OneBot 实现 (如 NapCatQQ) 的配置，
    // 而不是这个插件的配置。插件只需要调用动作即可。
    // 如果需要特定于此插件的 QQ 语音相关配置，可以在这里添加。
}
