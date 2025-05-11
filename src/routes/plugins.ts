import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
    getLoadedPluginsInfo,
    getPluginConfig,
    getPluginConfigDefinition,
    updatePluginConfig,
    enablePlugin,
    disablePlugin,
    getPlugin, // Import getPlugin to check existence
    pluginEvents // 导入插件事件发射器
} from '../plugins/manager';
import { BasePluginConfig } from '../plugins/plugin-interface'; // Import base config type

// Define types for request parameters and body
interface PluginNameParams {
    name: string;
}

interface UpdateConfigBody {
    config: Partial<BasePluginConfig>; // Expecting an object with partial config
}

export default async function pluginRoutes(server: FastifyInstance) {

    // GET /api/plugins - 获取所有已加载插件的信息
    server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const pluginsInfo = await getLoadedPluginsInfo();
            reply.send(pluginsInfo);
        } catch (error: any) {
            server.log.error('获取插件列表失败:', error);
            reply.status(500).send({ error: '获取插件列表失败' });
        }
    });

    // GET /api/plugins/events - 创建SSE连接，推送插件相关事件
    server.get('/events', (request: FastifyRequest, reply: FastifyReply) => {
        // 设置SSE头
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        
        // 发送初始连接成功消息
        reply.raw.write('event: connected\ndata: true\n\n');
        
        // 定义插件配置更新处理函数
        const onPluginConfigUpdated = (data: any) => {
            reply.raw.write(`event: plugin-config-updated\ndata: ${JSON.stringify(data)}\n\n`);
        };
        
        // 监听插件配置更新事件
        pluginEvents.on('plugin-config-updated', onPluginConfigUpdated);
        
        // 当客户端关闭连接时移除监听器
        request.raw.on('close', () => {
            pluginEvents.off('plugin-config-updated', onPluginConfigUpdated);
        });
    });

    // GET /api/plugins/:name/config - 获取指定插件的当前配置
    server.get('/:name/config', async (request: FastifyRequest<{ Params: PluginNameParams }>, reply: FastifyReply) => {
        const pluginName = request.params.name;
        try {
            const plugin = getPlugin(pluginName); // Check if plugin exists
            if (!plugin) {
                return reply.status(404).send({ error: `插件 "${pluginName}" 未找到` });
            }
            const config = getPluginConfig(pluginName);
            reply.send(config || {}); // Send empty object if config is somehow undefined
        } catch (error: any) {
            server.log.error(`获取插件 "${pluginName}" 配置失败:`, error);
            reply.status(500).send({ error: `获取插件 "${pluginName}" 配置失败` });
        }
    });

    // GET /api/plugins/:name/config/definition - 获取指定插件的配置定义
    server.get('/:name/config/definition', async (request: FastifyRequest<{ Params: PluginNameParams }>, reply: FastifyReply) => {
        const pluginName = request.params.name;
         try {
            const plugin = getPlugin(pluginName); // Check if plugin exists
            if (!plugin) {
                return reply.status(404).send({ error: `插件 "${pluginName}" 未找到` });
            }
            const definition = await getPluginConfigDefinition(pluginName);
            if (definition) {
                reply.send(definition);
            } else {
                reply.status(404).send({ error: `插件 "${pluginName}" 没有提供配置定义` });
            }
        } catch (error: any) {
            server.log.error(`获取插件 "${pluginName}" 配置定义失败:`, error);
            reply.status(500).send({ error: `获取插件 "${pluginName}" 配置定义失败` });
        }
    });

    // PUT /api/plugins/:name/config - 更新指定插件的配置
    server.put('/:name/config', async (request: FastifyRequest<{ Params: PluginNameParams; Body: UpdateConfigBody }>, reply: FastifyReply) => {
        const pluginName = request.params.name;
        const newConfig = request.body.config; // Get config from body.config

        if (!newConfig || typeof newConfig !== 'object') {
             return reply.status(400).send({ error: '请求体必须包含 "config" 对象' });
        }

        try {
            const plugin = getPlugin(pluginName); // Check if plugin exists before updating
            if (!plugin) {
                return reply.status(404).send({ error: `插件 "${pluginName}" 未找到` });
            }
            await updatePluginConfig(pluginName, newConfig);
            const updatedConfig = getPluginConfig(pluginName); // Get the final config after update
            reply.send(updatedConfig); // Return the updated config
        } catch (error: any) {
            server.log.error(`更新插件 "${pluginName}" 配置失败:`, error);
            reply.status(500).send({ error: `更新插件 "${pluginName}" 配置失败: ${error.message}` });
        }
    });

    // POST /api/plugins/:name/enable - 启用指定插件
    server.post('/:name/enable', async (request: FastifyRequest<{ Params: PluginNameParams }>, reply: FastifyReply) => {
        const pluginName = request.params.name;
        try {
            const plugin = getPlugin(pluginName); // Check if plugin exists
            if (!plugin) {
                return reply.status(404).send({ error: `插件 "${pluginName}" 未找到` });
            }
            await enablePlugin(pluginName);
            reply.send({ message: `插件 "${pluginName}" 已启用` });
        } catch (error: any) {
            server.log.error(`启用插件 "${pluginName}" 失败:`, error);
            reply.status(500).send({ error: `启用插件 "${pluginName}" 失败: ${error.message}` });
        }
    });

    // POST /api/plugins/:name/disable - 禁用指定插件
    server.post('/:name/disable', async (request: FastifyRequest<{ Params: PluginNameParams }>, reply: FastifyReply) => {
        const pluginName = request.params.name;
        try {
             const plugin = getPlugin(pluginName); // Check if plugin exists
            if (!plugin) {
                return reply.status(404).send({ error: `插件 "${pluginName}" 未找到` });
            }
            await disablePlugin(pluginName);
            reply.send({ message: `插件 "${pluginName}" 已禁用` });
        } catch (error: any) {
            server.log.error(`禁用插件 "${pluginName}" 失败:`, error);
            reply.status(500).send({ error: `禁用插件 "${pluginName}" 失败: ${error.message}` });
        }
    });

    // --- 特定插件动作路由 (示例：获取 QQ Voice 说话人) ---
    server.get('/qq-voice/speakers', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const plugin = getPlugin('qq-voice');
            if (!plugin) {
                return reply.status(404).send({ error: 'QQ Voice 插件未找到' });
            }
            
            // 获取请求中的群ID参数(如果有)
            const queryParams = request.query as any;
            const groupId = queryParams.groupId;
            
            // 类型守卫或断言来调用 getSpeakers
            if ('getSpeakers' in plugin && typeof plugin.getSpeakers === 'function') {
                try {
                    // 传递可选的groupId参数
                    const speakers = await plugin.getSpeakers(groupId);
                    reply.send(speakers);
                } catch (speakersError: any) {
                    // 根据错误消息提供更精确的HTTP状态码和响应
                    const errorMsg = speakersError.message || '未知错误';
                    
                    if (errorMsg.includes('不在机器人加入的群组列表中')) {
                        // 群号无效
                        reply.status(400).send({ 
                            error: errorMsg,
                            errorType: 'INVALID_GROUP_ID'
                        });
                    } else if (errorMsg.includes('连接错误') || errorMsg.includes('OneBot未连接')) {
                        // 连接问题
                        reply.status(503).send({ 
                            error: errorMsg,
                            errorType: 'CONNECTION_ERROR'
                        });
                    } else if (errorMsg.includes('API错误')) {
                        // QQ API返回的错误
                        reply.status(502).send({ 
                            error: errorMsg,
                            errorType: 'API_ERROR'
                        });
                    } else {
                        // 其他错误
                        reply.status(500).send({ 
                            error: `获取说话人列表失败: ${errorMsg}`,
                            errorType: 'UNKNOWN_ERROR'
                        });
                    }
                }
            } else {
                reply.status(501).send({ error: 'QQ Voice 插件未实现 getSpeakers 方法' });
            }
        } catch (error: any) {
            server.log.error('获取 QQ Voice 说话人列表失败:', error);
            reply.status(500).send({ error: `获取说话人列表失败: ${error.message}` });
        }
    });
    
    // 测试路由：手动触发插件配置更新事件
    server.get('/test-event/:name', async (request: FastifyRequest<{ Params: PluginNameParams }>, reply: FastifyReply) => {
        const pluginName = request.params.name;
        try {
            // 获取插件
            const plugin = getPlugin(pluginName);
            if (!plugin) {
                return reply.status(404).send({ error: `插件 "${pluginName}" 未找到` });
            }
            
            // 发送测试事件 (使用当前配置)
            pluginEvents.emit('plugin-config-updated', { 
                name: pluginName, 
                config: plugin.config 
            });
            
            reply.send({ 
                message: `已触发 ${pluginName} 插件配置更新事件`,
                config: plugin.config
            });
        } catch (error: any) {
            server.log.error(`触发插件配置更新事件失败:`, error);
            reply.status(500).send({ error: `触发插件配置更新事件失败: ${error.message}` });
        }
    });
}
