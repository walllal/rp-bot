import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';
// Import the function to open the config modal (will be created later)
import { openPluginConfigModal, notifyPluginConfigUpdated } from './pluginConfigModal.js';

// DOM Elements
let pluginsListDiv;
let sseSource; // SSE事件源

// 建立SSE连接，监听插件事件
function setupEventSource() {
    // 如果已存在连接，先关闭
    if (sseSource) {
        sseSource.close();
    }
    
    // 创建新的SSE连接
    sseSource = new EventSource('/api/plugins/events');
    
    // 连接成功事件
    sseSource.addEventListener('connected', (event) => {
        // console.log('与服务器建立SSE连接成功'); // Removed debug log
    });

    // 插件配置更新事件
    sseSource.addEventListener('plugin-config-updated', (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('收到插件配置更新事件:', data);
            
            // 通知打开的配置模态框更新内容
            notifyPluginConfigUpdated(data.name, data.config);
            
            // 刷新插件列表，显示最新状态
            loadPlugins();
        } catch (err) {
            console.error('处理插件配置更新事件失败:', err);
        }
    });
    
    // 错误处理
    sseSource.onerror = (error) => {
        console.error('SSE连接错误:', error);
        // 重连逻辑
        setTimeout(() => {
            console.log('尝试重新连接SSE...');
            setupEventSource();
        }, 5000);
    };
}

function renderPluginsList(plugins) {
    if (!pluginsListDiv) return;
    pluginsListDiv.innerHTML = ''; // Clear list

    if (!Array.isArray(plugins) || plugins.length === 0) {
        pluginsListDiv.innerHTML = '<p>没有找到任何插件。</p>';
        return;
    }

    plugins.forEach(plugin => {
        const article = document.createElement('article');
        article.dataset.pluginName = plugin.name; // Store name for event handlers
        article.innerHTML = `
            <header>
                <hgroup>
                    <h4>${domUtils.escapeHtml(plugin.name)}</h4>
                    <p>${domUtils.escapeHtml(plugin.description)}</p>
                </hgroup>
            </header>
            <div>
                <strong>状态:</strong> ${domUtils.escapeHtml(plugin.status || (plugin.enabled ? '已启用' : '已禁用'))}
            </div>
            <footer>
                <label style="margin-right: 1rem;">
                    <input type="checkbox" class="plugin-enable-switch" role="switch" ${plugin.enabled ? 'checked' : ''}>
                    启用
                </label>
                <button class="outline secondary btn-sm configure-plugin-btn">配置</button>
            </footer>
        `;
        pluginsListDiv.appendChild(article);
    });
}

async function loadPlugins() {
    if (!pluginsListDiv) return;
    pluginsListDiv.innerHTML = '<p aria-busy="true">正在加载插件列表...</p>';
    try {
        const plugins = await apiService.getPlugins();
        renderPluginsList(plugins);
    } catch (error) {
        console.error('加载插件列表失败:', error);
        pluginsListDiv.innerHTML = '<p style="color: var(--pico-del-color);">加载插件列表失败</p>';
    }
}

async function handlePluginEnableSwitchChange(event) {
    const target = event.target;
    if (!target.classList.contains('plugin-enable-switch')) return;

    const article = target.closest('article');
    const pluginName = article?.dataset.pluginName;
    const isEnabled = target.checked;

    if (!pluginName) return;

    target.disabled = true; // Disable switch during API call

    try {
        if (isEnabled) {
            await apiService.enablePlugin(pluginName);
            uiNotifications.showToast(`插件 "${pluginName}" 已启用`);
        } else {
            await apiService.disablePlugin(pluginName);
            uiNotifications.showToast(`插件 "${pluginName}" 已禁用`);
        }
        // Refresh the list to show updated status (backend might provide more status info)
        await loadPlugins(); // Use await here
    } catch (error) {
        console.error(`${isEnabled ? '启用' : '禁用'}插件 "${pluginName}" 失败:`, error);
        let errorMsg = '未知错误';
        if (error instanceof Response) {
            try { const errData = await error.json(); errorMsg = errData.error || error.statusText; } catch(e) { errorMsg = error.statusText; }
        } else if (error.message) { errorMsg = error.message; }
        uiNotifications.showToast(`${isEnabled ? '启用' : '禁用'}插件失败: ${errorMsg}`, 4000, 'error');
        target.checked = !isEnabled; // Revert switch state on error
    } finally {
        target.disabled = false;
    }
}

function handleConfigurePluginClick(event) {
    const target = event.target;
    if (!target.classList.contains('configure-plugin-btn')) return;

    const article = target.closest('article');
    const pluginName = article?.dataset.pluginName;

    if (pluginName) {
        // Call the function (imported from pluginConfigModal.js) to open the modal
        openPluginConfigModal(pluginName);
    } else {
        console.error("Could not find plugin name for configuration.");
        uiNotifications.showToast("无法配置插件：未找到插件名称。", 3000, 'error');
    }
}

export async function initPluginManager() {
    pluginsListDiv = document.getElementById('plugins-list');

    if (!pluginsListDiv) {
        console.error("Plugin list container element not found!");
        return;
    }

    pluginsListDiv.addEventListener('change', handlePluginEnableSwitchChange);
    pluginsListDiv.addEventListener('click', handleConfigurePluginClick);

    await loadPlugins(); // Load initial plugin list
    
    // 建立SSE连接
    setupEventSource();
    
    // 导出重载函数到全局，便于其他模块调用
    window.reloadPlugins = loadPlugins;
}

// 添加清理函数
export function cleanupPluginManager() {
    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }
}