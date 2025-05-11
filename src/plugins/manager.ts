// 移除重复的 FastifyInstance 导入
import { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { IPlugin, BasePluginConfig } from './plugin-interface';
import { getAppSettings, updateAppSettings } from '../db/configStore'; // 导入新的设置函数
import { EventEmitter } from 'events'; // 导入事件发射器

// 创建插件事件发射器
export const pluginEvents = new EventEmitter();

// 存储已加载的插件实例
const loadedPlugins: Map<string, IPlugin<any>> = new Map();
let serverInstance: FastifyInstance | null = null;

// 日志函数
function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any) {
    if (serverInstance?.log) {
        (serverInstance.log as any)[level](`[PluginManager] ${message}`, data ?? '');
    } else {
        console[level](`[PluginManager] ${message}`, data ?? '');
    }
}

/**
 * 初始化插件管理器并加载所有插件
 * @param server Fastify 实例
 */
export async function initializePlugins(server: FastifyInstance): Promise<void> {
    serverInstance = server;
    log('info', '开始初始化插件管理器...');

    const pluginsDir = path.join(__dirname); // 当前目录就是 src/plugins
    try {
        const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
        const pluginDirs = entries.filter(entry => entry.isDirectory());

        // Get AppSettings to load plugin configurations
        const appSettings = await getAppSettings(server.log);
        let pluginSettings: { [key: string]: any } = {};
        if (appSettings?.pluginSettings) {
            try {
                pluginSettings = JSON.parse(appSettings.pluginSettings);
                log('debug', '成功解析数据库中的 pluginSettings');
            } catch (e) {
                log('error', '解析数据库中的 pluginSettings JSON 字符串失败，将使用空配置。', e);
                pluginSettings = {};
            }
        } else {
             log('warn', '未在数据库中找到 pluginSettings，将使用空配置。');
             pluginSettings = {};
        }


        for (const dir of pluginDirs) {
            const pluginName = dir.name;
            const indexPath = path.join(pluginsDir, pluginName, 'index.js'); // 加载编译后的 JS 文件
            try {
                // 动态导入插件
                const pluginModule = await import(indexPath);
                const pluginInstance = pluginModule.default as IPlugin<any>;

                if (pluginInstance && typeof pluginInstance.initialize === 'function' && pluginInstance.name === pluginName) {
                    // 获取该插件的配置，如果不存在则使用插件的默认配置
                    const initialConfig = pluginSettings[pluginName] || pluginInstance.config || { enabled: false };
                    // 确保至少有 enabled 属性
                    if (typeof initialConfig.enabled === 'undefined') {
                        initialConfig.enabled = false;
                    }

                    await pluginInstance.initialize(server, initialConfig);
                    loadedPlugins.set(pluginName, pluginInstance);
                    log('info', `插件 "${pluginName}" 加载并初始化成功。`);
                } else {
                    log('warn', `目录 "${pluginName}" 中的 index.js 未导出有效的插件实例或名称不匹配。`);
                }
            } catch (error: any) {
                log('error', `加载插件 "${pluginName}" 失败: ${error.message}`, error);
            }
        }
        log('info', `插件管理器初始化完成，共加载 ${loadedPlugins.size} 个插件。`);
    } catch (error: any) {
        log('error', `读取插件目录失败: ${error.message}`, error);
    }
}

/**
 * 获取所有已加载插件的列表（包含基本信息和状态）
 */
export async function getLoadedPluginsInfo(): Promise<any[]> {
    const pluginsInfo = [];
    for (const [name, plugin] of loadedPlugins.entries()) {
        let status = plugin.config.enabled ? '已启用' : '已禁用';
        if (plugin.getStatus) {
            try {
                const pluginStatus = await plugin.getStatus();
                status += ` (${JSON.stringify(pluginStatus)})`; // 添加具体状态
            } catch (e: any) {
                status += ` (获取状态失败: ${e.message})`;
            }
        }
        pluginsInfo.push({
            name: plugin.name,
            description: plugin.description,
            enabled: plugin.config.enabled,
            status: status, // 添加状态信息
        });
    }
    return pluginsInfo;
}

/**
 * 获取指定插件的实例
 * @param name 插件名称
 */
export function getPlugin<T extends BasePluginConfig>(name: string): IPlugin<T> | undefined {
    return loadedPlugins.get(name);
}

/**
 * 获取指定插件的配置定义
 * @param name 插件名称
 */
export async function getPluginConfigDefinition(name: string): Promise<any> {
    const plugin = loadedPlugins.get(name);
    if (plugin?.getConfigDefinition) {
        try {
            return await plugin.getConfigDefinition();
        } catch (error: any) {
            log('error', `获取插件 "${name}" 配置定义失败: ${error.message}`, error);
            return { error: `获取配置定义失败: ${error.message}` };
        }
    }
    return null; // 没有定义或插件不存在
}

/**
 * 获取指定插件的当前配置
 * @param name 插件名称
 */
export function getPluginConfig(name: string): BasePluginConfig | undefined {
    return loadedPlugins.get(name)?.config;
}

/**
 * 更新指定插件的配置并保存到数据库
 * @param name 插件名称
 * @param newConfig 部分或全部新配置
 */
export async function updatePluginConfig(name: string, newConfig: Partial<BasePluginConfig>): Promise<void> {
    const plugin = loadedPlugins.get(name);
    if (!plugin) {
        throw new Error(`插件 "${name}" 未找到`);
    }

    try {
        // 调用插件自身的更新逻辑
        await plugin.updateConfig(newConfig);

        // --- Update and save plugin settings to AppSettings ---
        if (!serverInstance?.log) {
            throw new Error('无法保存插件配置，因为 Logger 未初始化。');
        }
        // Get current settings to update the pluginSettings part
        const currentSettings = await getAppSettings(serverInstance.log);
        let currentPluginSettings: { [key: string]: any } = {};
        if (currentSettings?.pluginSettings) {
            try {
                currentPluginSettings = JSON.parse(currentSettings.pluginSettings);
            } catch (e) {
                log('error', `解析当前 pluginSettings 失败，将覆盖。`, e);
                currentPluginSettings = {};
            }
        }
        // Update the specific plugin's config
        currentPluginSettings[name] = plugin.config; // Store the complete current config

        // Save the updated settings object back
        await updateAppSettings({
            pluginSettings: JSON.stringify(currentPluginSettings) // Stringify before saving
        }, serverInstance.log);

        log('info', `插件 "${name}" 的配置已更新并保存。`);
        
        // 发送插件配置更新事件
        pluginEvents.emit('plugin-config-updated', { name, config: plugin.config });
    } catch (error: any) {
        log('error', `更新插件 "${name}" 配置失败: ${error.message}`, error);
        throw error; // 重新抛出错误
    }
}

/**
 * 启用指定插件
 * @param name 插件名称
 */
export async function enablePlugin(name: string): Promise<void> {
    await updatePluginConfig(name, { enabled: true });
}

/**
 * 禁用指定插件
 * @param name 插件名称
 */
export async function disablePlugin(name: string): Promise<void> {
    await updatePluginConfig(name, { enabled: false });
}

// 可以添加其他管理函数，例如卸载插件等（如果需要）
