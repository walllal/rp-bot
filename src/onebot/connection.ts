import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import { OneBotBaseEvent, OneBotActionRequest, OneBotActionResponse, OneBotMessageEvent, OneBotGroupMessageEvent, OneBotMetaEvent, OneBotLifecycleEvent } from './types'; // Add OneBotLifecycleEvent
import { FastifyInstance } from 'fastify';
import { getAppSettings } from '../db/configStore'; // Import the new settings function
import { checkAccess } from '../db/access_control';
import { syncFriends, syncGroups } from '../db/contacts'; // Import sync functions

// Define OneBot connection config interface (remains the same)
interface OneBotConnectionConfig {
    mode: 'ws' | 'ws-reverse';
    url?: string;
    port?: number;
    accessToken?: string;
    reconnectInterval: number;
}

export const oneBotEmitter = new EventEmitter();

let currentWs: WebSocket | null = null;
let currentWss: WebSocketServer | null = null;
let currentFastifyInstance: FastifyInstance | null = null; // Store Fastify instance locally
let currentConnectionConfig: OneBotConnectionConfig | null = null; // Store current config used
let reconnectTimer: NodeJS.Timeout | null = null;
const pendingActions = new Map<string, (response: OneBotActionResponse) => void>();
let currentSelfId: string | null = null; // +++ Store self_id

// Update log function to accept all relevant Pino levels
function log(level: 'info' | 'warn' | 'error' | 'debug' | 'trace', message: string, data?: any) {
    if (currentFastifyInstance?.log) { // Check if serverInstance and serverInstance.log exist
        // Use type assertion to satisfy TypeScript, as currentFastifyInstance.log should have all methods
        (currentFastifyInstance.log as any)[level](data ? { data, message } : message);
    } else {
        console[level](message, data ?? '');
    }
}

// Modified handleOneBotEvent to include access check before logging/emitting
async function handleOneBotEvent(data: Buffer | string) {
    try {
        const event = JSON.parse(data.toString()) as OneBotBaseEvent | OneBotActionResponse | OneBotMessageEvent;

        // --- Access Check for Message Events ---
        if ('post_type' in event && event.post_type === 'message') {
            const messageEvent = event as OneBotMessageEvent; // Type assertion
            const messageType = messageEvent.message_type; // 'private' or 'group'
            const checkUserId = messageEvent.user_id.toString();
            const checkGroupId = messageType === 'group' ? (messageEvent as OneBotGroupMessageEvent).group_id.toString() : null;
            const checkContextId = messageType === 'private' ? checkUserId : checkGroupId;

            if (!checkContextId) {
                log('warn', '无法确定消息事件的 Context ID 进行访问检查');
                // Decide whether to proceed or block if context ID is missing
                // For safety, let's block here, though this shouldn't happen for valid messages
                return;
            }

            // Ensure logger is available before checking access
            if (!currentFastifyInstance?.log) {
                console.error('Logger not available during access check, blocking message.');
                return; // Block message if logger isn't ready
            }

            // Pass the logger instance to checkAccess
            const allowed = await checkAccess(messageType, checkContextId, currentFastifyInstance.log);
            if (!allowed) {
                // Access denied, do not log or emit this message event
                return;
            }
            // If allowed, fall through to the logging and emitting logic below
        }
        // --- End Access Check ---

        // Log based on event type
        if ('post_type' in event && event.post_type === 'meta_event') {
             // Check if it's a heartbeat after confirming it's a meta_event
             const metaEvent = event as OneBotMetaEvent;
             if (metaEvent.meta_event_type === 'heartbeat') {
                 log('trace', '收到 OneBot 心跳事件'); // Keep as trace
             } else if (metaEvent.meta_event_type === 'lifecycle') {
                 const lifecycleEvent = event as OneBotLifecycleEvent; // Cast to LifecycleEvent
                 if (lifecycleEvent.sub_type === 'connect') {
                     log('info', 'OneBot 客户端已连接'); // Keep as info
                 } else {
                     // Log other lifecycle events with data
                     log('info', '收到 OneBot 生命周期事件 (通过访问控制):', event); // Keep as info
                 }
             } else {
                 // Log other unknown meta events with data
                 log('info', '收到未知 OneBot 元事件 (通过访问控制):', event); // Keep as info
             }
        } else {
            // Log other allowed messages, events, or responses with data at TRACE level
            log('trace', '收到 OneBot 事件/响应 (通过访问控制):', event); // Keep as trace
        }

        if ('post_type' in event) {
            // Emit generic event first
            oneBotEmitter.emit('onebot-event', event);
            // Emit specific message event only if it's a message (already passed access check)
            if (event.post_type === 'message') {
                oneBotEmitter.emit('onebot-message', event as OneBotMessageEvent);
            }
            // Handle other post_types if needed (notice, request, meta_event)
        } else if ('echo' in event && typeof event.echo === 'string' && pendingActions.has(event.echo)) {
            // Handle action responses
            const callback = pendingActions.get(event.echo);
            if (callback) {
                callback(event);
                pendingActions.delete(event.echo);
            }
        } else {
            log('warn', '收到未知类型的 OneBot 消息');
        }
    } catch (error) {
        log('error', '解析 OneBot 消息失败:', error);
    }
}

/**
 * Fetches friend and group lists from OneBot API and syncs them with the database.
 * This should be called after a successful connection is established.
 */
async function syncContactsOnConnect() {
    const logger = currentFastifyInstance?.log; // Get logger instance
    if (!logger) {
        console.error('Logger instance is not available in syncContactsOnConnect. Skipping contact sync.');
        return;
    }
    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
        logger.warn('尝试同步联系人列表，但 WebSocket 未连接或未准备好。');
        return;
    }
    logger.info('OneBot 连接成功，开始同步好友和群组列表...');

    // +++ Get Login Info to store self_id +++
    try {
        logger.debug('正在获取机器人登录信息 (get_login_info)...');
        const loginInfoResponse = await sendOneBotAction({ action: 'get_login_info', params: {} });
        if (loginInfoResponse.status === 'ok' && loginInfoResponse.data && typeof loginInfoResponse.data.user_id === 'number') { // Or string depending on OneBot impl
            currentSelfId = String(loginInfoResponse.data.user_id);
            logger.info(`机器人自身 QQ 号 (self_id): ${currentSelfId}`);
        } else {
            logger.error({ response: loginInfoResponse }, '获取机器人登录信息失败或响应格式不正确');
            currentSelfId = null; // Ensure it's reset if fetch fails
        }
    } catch (error) {
        log('error', '获取机器人登录信息 (get_login_info) 时出错:', error);
        currentSelfId = null;
    }
    // +++ End Get Login Info +++

    // Sync Friends
    try {
        logger.debug('正在获取好友列表...');
        // Add empty params object to satisfy OneBotActionRequest type
        const friendResponse = await sendOneBotAction({ action: 'get_friend_list', params: {} });
        if (friendResponse.status === 'ok' && Array.isArray(friendResponse.data)) {
            logger.trace({ data: friendResponse.data }, '获取到的原始好友列表'); // Use logger correctly
            // Assuming friendResponse.data matches FriendFromApi structure
            await syncFriends(friendResponse.data, logger); // Pass the logger instance
        } else {
            logger.error({ response: friendResponse }, '获取好友列表失败或响应格式不正确');
        }
    } catch (error) {
        log('error', '获取或同步好友列表时出错:', error);
    }

    // Sync Groups and update QQ Voice plugin's test group
    let firstGroupId: string | undefined;
    try {
        logger.debug('正在获取群组列表...');
        // Add empty params object to satisfy OneBotActionRequest type
        const groupResponse = await sendOneBotAction({ action: 'get_group_list', params: {} });
         if (groupResponse.status === 'ok' && Array.isArray(groupResponse.data)) {
            logger.trace({ data: groupResponse.data }, '获取到的原始群组列表'); // Use logger correctly
            
            // Save first group ID for QQ Voice plugin
            if (groupResponse.data.length > 0) {
                firstGroupId = groupResponse.data[0].group_id.toString();
                logger.debug(`找到第一个群: ${firstGroupId}, 将用于QQ语音插件`);
            }
            
            // Assuming groupResponse.data matches GroupFromApi structure
            await syncGroups(groupResponse.data, logger); // Pass the logger instance
        } else {
            logger.error({ response: groupResponse }, '获取群组列表失败或响应格式不正确');
        }
    } catch (error) {
        log('error', '获取或同步群组列表时出错:', error);
    }
    
    // Update QQ Voice plugin test group if we found a group
    if (firstGroupId) {
        try {
            // 动态导入插件管理器，避免循环引用
            const { getPlugin, updatePluginConfig } = await import('../plugins/manager');
            
            // 获取QQ语音插件实例
            const qqVoicePlugin = getPlugin('qq-voice');
            if (qqVoicePlugin) {
                // 使用类型断言将配置转换为具有testGroupId和autoUpdateTestGroup属性的类型
                const qqVoiceConfig = qqVoicePlugin.config as any;
                
                // 检查autoUpdateTestGroup的值，将它统一转换为字符串处理
                const autoUpdateValue = String(qqVoiceConfig.autoUpdateTestGroup).toLowerCase();
                const shouldAutoUpdate = autoUpdateValue === 'true';
                
                // 只有当插件未配置testGroupId或启用了自动更新时才更新
                if (!qqVoiceConfig.testGroupId || shouldAutoUpdate) {
                    // 只有当启用了自动更新时才输出更新日志
                    if (shouldAutoUpdate) {
                        logger.info(`正在更新QQ语音插件的测试群为: ${firstGroupId}`);
                    }
                    
                    // 创建新的配置对象，确保不使用原来配置的引用
                    const newConfig = { 
                        ...qqVoiceConfig,  // 复制其他配置值
                        testGroupId: firstGroupId  // 明确设置新的群ID
                    };
                    
                    // 确保删除旧的testGroupId (如果存在的话)，避免混淆
                    delete newConfig['testGroupId']; // 先删除旧属性
                    newConfig.testGroupId = firstGroupId; // 再设置新值
                    
                    await updatePluginConfig('qq-voice', newConfig);
                    
                    // 获取更新后的插件配置
                    const updatedPlugin = getPlugin('qq-voice');
                    const updatedConfig = updatedPlugin?.config as any;
                    logger.info(`已成功将QQ语音插件的测试群更新为: ${firstGroupId}，当前配置: ${JSON.stringify(updatedConfig)}`);
                } else {
                    logger.debug(`QQ语音插件已有测试群配置: ${qqVoiceConfig.testGroupId}，且未启用自动更新(autoUpdateTestGroup=${qqVoiceConfig.autoUpdateTestGroup})，保持不变`);
                }
            }
        } catch (error) {
            logger.error('更新QQ语音插件测试群时出错:', error);
        }
    }
     
    log('info', '好友和群组列表同步完成。');
}


/**
 * Cleans up the current WebSocket connection and timers.
 */
function cleanupConnection() {
    log('debug', '清理现有 OneBot 连接...'); // Change to debug
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    pendingActions.clear();
    if (currentWs) {
        currentWs.removeAllListeners();
        // Don't terminate immediately if it's a client from wss, just remove listeners
        if (currentConnectionConfig?.mode === 'ws') {
             currentWs.terminate();
        }
        currentWs = null;
    }
     // Close the server if it exists
    if (currentWss) {
        currentWss.close((err) => {
            if (err) {
                log('error', '关闭反向 WS 服务器时出错:', err);
            } else {
                 log('info', '反向 WS 服务器已关闭'); // Keep info for server close confirmation
            }
        });
        currentWss = null;
    }
     log('debug', '现有 OneBot 连接清理完毕。'); // Change to debug
}

/**
 * Establishes a forward WebSocket connection based on the provided config.
 */
function connectForwardWS(config: OneBotConnectionConfig) {
    if (!config.url) {
        log('error', '正向 WebSocket 模式需要配置 URL');
        return;
    }
    log('info', `尝试连接到 OneBot (正向 WS): ${config.url}`); // Keep info for connection attempt
    try {
        const newWs = new WebSocket(config.url, {
            headers: config.accessToken
                ? { Authorization: `Bearer ${config.accessToken}` }
                : undefined,
        });

        newWs.on('open', () => {
            log('info', '成功连接到 OneBot (正向 WS)'); // Keep info for success
            currentWs = newWs; // Assign to currentWs only on successful open
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            // Sync contacts after successful connection
            syncContactsOnConnect();
        });

        newWs.on('message', (data) => handleOneBotEvent(data as Buffer));
        newWs.on('error', (error) => log('error', 'OneBot 连接出错 (正向 WS):', error));
        newWs.on('close', (code, reason) => {
            log('warn', `与 OneBot 的连接已断开 (正向 WS). Code: ${code}, Reason: ${reason.toString()}`);
            if (currentWs === newWs) currentWs = null; // Clear if it's the active connection
            // Schedule reconnect only if this config is still the active one
            if (currentConnectionConfig === config && !reconnectTimer) {
                log('info', `将在 ${config.reconnectInterval / 1000} 秒后尝试重连...`); // Keep info for reconnect schedule
                // Use triggerOneBotReconnect for retries to ensure latest settings are used
                reconnectTimer = setTimeout(triggerOneBotReconnect, config.reconnectInterval);
            }
        });
    } catch (connectError) {
         log('error', `创建正向 WS 连接失败 (URL: ${config.url}):`, connectError);
         // Schedule reconnect if this config is still active
         if (currentConnectionConfig === config && !reconnectTimer) {
            log('info', `将在 ${config.reconnectInterval / 1000} 秒后尝试重连...`);
            reconnectTimer = setTimeout(triggerOneBotReconnect, config.reconnectInterval);
        }
    }
}

/**
 * Starts a reverse WebSocket server based on the provided config.
 */
function startReverseWSServer(config: OneBotConnectionConfig) {
    if (!config.port) {
        log('error', '反向 WebSocket 模式需要配置端口');
        return;
    }
    log('info', `启动 OneBot 反向 WS 服务器，监听端口: ${config.port}`); // Keep info for server start
    let newWss: WebSocketServer;
    try {
        newWss = new WebSocketServer({ port: config.port });
    } catch (serverError) {
        log('error', `创建反向 WS 服务器失败 (端口: ${config.port}):`, serverError);
        // Optionally re-throw or handle differently, e.g., schedule retry
        return; // Stop further execution in this function if server creation fails
    }

    // Add error listener specifically for server startup issues (like EADDRINUSE)
    newWss.on('error', (error) => {
        log('error', `反向 WS 服务器出错 (端口: ${config.port}):`, error);
        if (currentWss === newWss) currentWss = null; // Clear if it's the active server
        // Consider scheduling a reconnect attempt here as well
        if (currentConnectionConfig === config && !reconnectTimer) {
            log('info', `反向 WS 服务器启动失败，将在 ${config.reconnectInterval / 1000} 秒后尝试重连...`);
            reconnectTimer = setTimeout(triggerOneBotReconnect, config.reconnectInterval);
        }
    });

    newWss.on('listening', () => {
         log('info', `反向 WS 服务器成功启动并监听端口: ${config.port}`);
         currentWss = newWss; // Assign to currentWss only after successful listening
    });

    newWss.on('connection', (clientWs, req) => {
        const authHeader = req.headers['authorization'];
        const token = config.accessToken;
        if (token && (!authHeader || authHeader !== `Bearer ${token}`)) {
            log('warn', '反向 WS 连接授权失败，拒绝连接');
            clientWs.close(1008, 'Invalid Access Token');
            return;
        }

        if (currentWs) {
            log('warn', '已有 OneBot 客户端连接，关闭旧连接');
            currentWs.terminate(); // Terminate the old client connection immediately
        }

        log('info', '接受新的 OneBot 连接 (反向 WS)'); // Keep info for new connection accepted
        currentWs = clientWs; // Assign the new client connection

        // Sync contacts after successful connection
        syncContactsOnConnect();

        currentWs.on('message', (data) => handleOneBotEvent(data as Buffer));
        currentWs.on('error', (error) => log('error', 'OneBot 客户端连接出错 (反向 WS):', error));
        currentWs.on('close', (code, reason) => {
            log('warn', `OneBot 客户端连接已断开 (反向 WS). Code: ${code}, Reason: ${reason.toString()}`);
            if (currentWs === clientWs) {
                currentWs = null; // Clear if it's the active connection
            }
        });
    });

    // Note: 'error' listener is already attached above to catch startup errors
    // newWss.on('error', (error) => { ... }); // This listener is redundant now

    // currentWss = newWss; // Assign to currentWss only after setup - MOVED to 'listening' event
}

/**
 * Fetches latest settings and establishes/re-establishes the OneBot connection.
 */
export async function triggerOneBotReconnect() {
    log('debug', '触发 OneBot 重连...'); // Change to debug
    cleanupConnection(); // Clean up any existing connection first

    if (!currentFastifyInstance) {
        log('error', 'Fastify 实例未初始化，无法触发重连');
        return;
    }

    try {
        // Fetch latest settings using the new function
        const settings = await getAppSettings(currentFastifyInstance.log);
        if (!settings) {
            log('error', '无法获取应用设置，无法触发重连。');
            return;
        }

        // Validate mode, default to ws-reverse if invalid
        const mode = (settings.onebotMode === 'ws' || settings.onebotMode === 'ws-reverse') ? settings.onebotMode : 'ws-reverse';

        // Use settings directly, providing defaults where necessary
        const port = settings.onebotPort ?? 6701;
        const reconnectInterval = settings.onebotReconnectInterval ?? 5000;

        const newConfig: OneBotConnectionConfig = {
            mode: mode,
            url: settings.onebotUrl ?? undefined, // Use nullish coalescing
            port: port, // Already has default
            accessToken: settings.onebotAccessToken ?? undefined, // Use nullish coalescing
            reconnectInterval: reconnectInterval >= 1000 ? reconnectInterval : 5000, // Keep validation
        };
        currentConnectionConfig = newConfig; // Store the new config

        // Establish connection based on mode
        if (newConfig.mode === 'ws') {
            connectForwardWS(newConfig);
        } else if (newConfig.mode === 'ws-reverse') {
            startReverseWSServer(newConfig);
        } else {
            log('error', `从数据库读取到不支持的 OneBot 连接模式: ${newConfig.mode}`);
        }
    } catch (error) {
        // Add more specific logging in the catch block
        log('error', '在 triggerOneBotReconnect 过程中出错:', error);
        // Determine if error was during settings fetch or connection setup based on where it likely occurred
        // (This is a best guess, the stack trace would be more definitive if available)
        if (error instanceof Error && (error.message.includes('getSetting') || error.message.includes('database'))) {
             log('error', '错误可能发生在从数据库获取设置时。');
        } else {
             log('error', '错误可能发生在尝试建立 WebSocket 连接或启动服务器时。');
        }
        // Optionally schedule another retry?
    }
}

/**
 * Initializes the OneBot connection on application startup.
 * @param fastifyInstance Fastify 实例，用于日志
 */
export function initOneBotConnection(fastifyInstance: FastifyInstance) {
    if (currentFastifyInstance) {
        log('debug', 'OneBot 连接已初始化，忽略重复调用'); // Change to debug
        return;
    }
    currentFastifyInstance = fastifyInstance; // Store Fastify instance
    triggerOneBotReconnect(); // Trigger the initial connection using DB settings
}

/**
 * Sends a OneBot Action.
 * (sendOneBotAction remains the same as before)
 */
export function sendOneBotAction(action: OneBotActionRequest, timeout = 10000): Promise<OneBotActionResponse> {
     return new Promise((resolve, reject) => {
        if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
            return reject(new Error('OneBot WebSocket 未连接或未准备好'));
        }

        const echo = action.echo || Date.now().toString() + Math.random().toString(36);
        action.echo = echo;

        const timeoutTimer = setTimeout(() => {
            pendingActions.delete(echo);
            reject(new Error(`OneBot Action 超时: ${action.action}`));
        }, timeout);

        pendingActions.set(echo, (response) => {
            clearTimeout(timeoutTimer);
            if (response.status === 'ok') {
                resolve(response);
            } else {
                reject(new Error(`OneBot Action 失败: ${response.message || response.retcode}`));
            }
        });

        try {
            // Log summary at info level, full data at debug level
            let summary = `发送 OneBot Action: ${action.action}`;
            if (action.action === 'send_private_msg' && action.params?.user_id) {
                summary += ` 到私聊 ${action.params.user_id}`;
            } else if (action.action === 'send_group_msg' && action.params?.group_id) {
                summary += ` 到群聊 ${action.params.group_id}`;
            }
            // log('debug', summary); // Remove this debug log as it's redundant with the info log in message-handler
            log('trace', '发送 OneBot Action 完整数据:', action); // Keep full data log at trace level

            currentWs.send(JSON.stringify(action));
        } catch (error) {
            pendingActions.delete(echo);
            clearTimeout(timeoutTimer);
            reject(error);
        }
    });
}

/**
 * Closes the OneBot connection gracefully.
 */
export function closeOneBotConnection() {
    log('info', '正在关闭 OneBot 连接...'); // Keep info for shutdown process
    cleanupConnection();
    currentConnectionConfig = null; // Clear stored config on explicit close
    currentSelfId = null; // +++ Clear self_id on close +++
    // Don't clear currentFastifyInstance here, might be needed if app restarts connection later
}

// +++ Exported functions to get bot instance and config +++
export function getBotInstance(): WebSocket | null {
    return currentWs;
}

export interface BotConnectionInfo {
    selfId: string | null;
    mode: 'ws' | 'ws-reverse' | null;
    url?: string;
    port?: number;
}

export function getBotConfig(): BotConnectionInfo {
    return {
        selfId: currentSelfId,
        mode: currentConnectionConfig?.mode || null,
        url: currentConnectionConfig?.url,
        port: currentConnectionConfig?.port,
    };
}
