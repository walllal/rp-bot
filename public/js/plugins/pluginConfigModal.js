import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';

// DOM Elements
let pluginConfigModal, pluginConfigModalTitle, pluginConfigForm, pluginConfigFieldsDiv, pluginConfigPluginNameInput;
// 当前打开的插件名称
let currentPluginName = null;

// 处理从服务器推送过来的插件配置更新事件
export function notifyPluginConfigUpdated(pluginName, newConfig) {
    // 如果当前没有打开插件配置弹窗，或打开的不是更新的插件，则忽略
    if (!currentPluginName || currentPluginName !== pluginName || !pluginConfigModal) {
        return;
    }
    
    // 检查弹窗是否可见
    const isModalOpen = pluginConfigModal.classList.contains('modal-is-open');
    if (!isModalOpen) {
        return;
    }
    
    console.log(`配置弹窗已打开，并且是当前更新的插件 ${pluginName}，自动刷新弹窗内容`);
    
    // 如果当前正在编辑该插件的配置，则显示通知并刷新表单
    try {
        // 获取插件配置定义，然后用新配置重新渲染表单
        getPluginConfigDefinition(pluginName)
            .then(definition => {
                if (definition) {
                    renderPluginConfigForm(definition, newConfig);
                    uiNotifications.showToast(`插件配置已由系统更新，表单已刷新`, 3000, 'info');
                }
            })
            .catch(err => {
                console.error('刷新配置定义失败:', err);
            });
    } catch (e) {
        console.error('处理配置更新通知时出错:', e);
    }
}

// 获取插件配置定义的辅助函数
async function getPluginConfigDefinition(pluginName) {
    try {
        return await apiService.getPluginConfigDefinition(pluginName);
    } catch (error) {
        console.error(`获取插件 "${pluginName}" 配置定义失败:`, error);
        throw error;
    }
}

function renderPluginConfigForm(definition, currentConfig) {
    if (!pluginConfigFieldsDiv) return;
    pluginConfigFieldsDiv.innerHTML = ''; // Clear

    if (!Array.isArray(definition) || definition.length === 0) {
        pluginConfigFieldsDiv.innerHTML = '<p>此插件没有可配置的选项。</p>';
        // Keep save button visible as backend might still accept empty config or handle defaults
    }

    definition.forEach(field => {
        // Skip 'enabled' as it's handled by the switch in the list
        if (field.key === 'enabled') return;

        const value = currentConfig && currentConfig[field.key] !== undefined ? currentConfig[field.key] : (field.default ?? ''); // Use default from definition if available
        const uniqueId = `plugin-config-${field.key}-${Date.now()}`;
        let fieldHtml = '';
        const labelHtml = `<label for="${uniqueId}">${domUtils.escapeHtml(field.label || field.key)}</label>`;
        let inputHtml = '';
        const requiredAttr = field.required ? 'required' : '';
        const placeholder = field.placeholder || '';

        switch (field.type) {
            case 'boolean':
                // For boolean, use label around the input for better click handling
                fieldHtml = `
                    <label for="${uniqueId}">
                        <input type="checkbox" id="${uniqueId}" name="${field.key}" role="switch" ${value === true || value === 'true' ? 'checked' : ''}>
                        ${domUtils.escapeHtml(field.label || field.key)}
                    </label>
                `;
                break;
            case 'number':
                inputHtml = `<input type="number" id="${uniqueId}" name="${field.key}" value="${domUtils.escapeHtml(value)}" ${requiredAttr} placeholder="${domUtils.escapeHtml(placeholder)}">`;
                break;
            case 'password':
                inputHtml = `<input type="password" id="${uniqueId}" name="${field.key}" value="${domUtils.escapeHtml(value)}" ${requiredAttr} placeholder="${domUtils.escapeHtml(placeholder)}">`;
                break;
            case 'textarea':
                inputHtml = `<textarea id="${uniqueId}" name="${field.key}" rows="3" ${requiredAttr} placeholder="${domUtils.escapeHtml(placeholder)}">${domUtils.escapeHtml(value)}</textarea>`;
                break;
            case 'speakers': // Special handling for QQ Voice speakers list
                 fieldHtml = `
                    <div>
                        <label>${domUtils.escapeHtml(field.label || '可用说话人')}</label>
                        <button type="button" id="refresh-speakers-btn" class="outline secondary btn-sm">刷新列表</button>
                        <div id="qq-voice-speakers-list" style="max-height: 150px; overflow-y: auto; border: 1px solid var(--pico-muted-border-color); padding: 0.5rem; margin-top: 0.5rem;">
                            <small>点击刷新按钮获取QQ可用说话人列表。</small>
                        </div>
                        <small>${domUtils.escapeHtml(field.description || '')}</small>
                    </div>
                 `;
                 break;
            case 'text':
            default:
                inputHtml = `<input type="text" id="${uniqueId}" name="${field.key}" value="${domUtils.escapeHtml(value)}" ${requiredAttr} placeholder="${domUtils.escapeHtml(placeholder)}">`;
                break;
        }

        // Combine label and input unless handled specially (boolean, speakers)
        if (field.type !== 'boolean' && field.type !== 'speakers') {
            fieldHtml = `<div>${labelHtml}${inputHtml}`;
            if (field.description) {
                fieldHtml += `<small>${domUtils.escapeHtml(field.description)}</small>`;
            }
            fieldHtml += `</div>`;
        } else if (field.type === 'boolean' && field.description) {
             // Add description separately for boolean if needed
             fieldHtml += `<small>${domUtils.escapeHtml(field.description)}</small>`;
        }

        pluginConfigFieldsDiv.innerHTML += fieldHtml;
    });

    // Add event listener for the refresh button if it exists
    const refreshBtn = pluginConfigFieldsDiv.querySelector('#refresh-speakers-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            const listDiv = pluginConfigFieldsDiv.querySelector('#qq-voice-speakers-list');
            if (!listDiv) return;
            listDiv.innerHTML = '<small aria-busy="true">正在获取...</small>';
            refreshBtn.disabled = true;
            
            try {
                // 尝试从表单中获取群ID，如果有的话
                const groupIdField = pluginConfigForm.querySelector('input[name="testGroupId"]');
                const groupId = groupIdField ? groupIdField.value.trim() : '';
                
                // 使用提供的群ID调用API
                const speakers = await apiService.getQQVoiceSpeakers(groupId);
                
                if (Array.isArray(speakers) && speakers.length > 0) {
                    listDiv.innerHTML = '<ul>' + speakers.map(s => `<li>${domUtils.escapeHtml(s.name)} (ID: <code>${domUtils.escapeHtml(s.characterId)}</code>)</li>`).join('') + '</ul>';
                } else {
                    listDiv.innerHTML = '<small>未能获取到说话人列表或列表为空。</small>';
                }
            } catch (error) {
                console.error('获取 QQ Voice 说话人失败:', error);
                
                // 根据错误类型提供更有帮助的错误信息
                let errorMessage = error.message || '未知错误';
                let errorDetail = '';
                
                if (error.errorType) {
                    switch (error.errorType) {
                        case 'INVALID_GROUP_ID':
                            errorMessage = '无效的群号';
                            errorDetail = '请确保提供的群号有效，且机器人已加入该群。';
                            break;
                        case 'CONNECTION_ERROR':
                            errorMessage = 'OneBot连接错误';
                            errorDetail = '机器人未连接或连接状态异常。';
                            break;
                        case 'API_ERROR':
                            errorMessage = 'QQ API错误';
                            errorDetail = '调用QQ API失败，请检查机器人的OneBot实现是否支持语音功能。';
                            break;
                    }
                }
                
                listDiv.innerHTML = `
                    <div style="color: var(--pico-del-color);">
                        <strong>获取失败: ${errorMessage}</strong>
                        ${errorDetail ? `<p><small>${errorDetail}</small></p>` : ''}
                    </div>`;
            } finally {
                refreshBtn.disabled = false;
            }
        });
    }
}


async function handlePluginConfigFormSubmit(event) {
    event.preventDefault();
    if (!pluginConfigPluginNameInput || !pluginConfigForm) return;

    const pluginName = pluginConfigPluginNameInput.value;
    if (!pluginName) return;

    const formData = new FormData(pluginConfigForm);
    const configToSave = {};

    // Iterate over form elements to correctly capture checkbox values
    for (const element of pluginConfigForm.elements) {
        if (element.name) {
            if (element.type === 'checkbox') {
                // Convert checkbox state to string 'true' or 'false'
                configToSave[element.name] = String(element.checked);
            } else if (element.type === 'number') {
                 configToSave[element.name] = element.value === '' ? null : Number(element.value); // Send null if empty, otherwise number
            } else if (element.value !== undefined) { // Exclude buttons etc.
                configToSave[element.name] = element.value;
            }
        }
    }
    // Remove the hidden pluginName input from the config object
    delete configToSave.pluginName;


    const saveButton = pluginConfigForm.querySelector('button[type="submit"]');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = '保存中...';
    }

    try {
        await apiService.updatePluginConfig(pluginName, configToSave);
        uiNotifications.showToast(`插件 "${pluginName}" 配置已保存`);
        domUtils.closeModal(pluginConfigModal);
        // Optionally notify pluginManager to reload list if status might change
        if (window.reloadPlugins) window.reloadPlugins();
    } catch (error) {
        console.error(`保存插件 "${pluginName}" 配置失败:`, error);
        let errorMsg = '未知错误';
        if (error instanceof Response) {
            try { const errData = await error.json(); errorMsg = errData.error || error.statusText; } catch(e) { errorMsg = error.statusText; }
        } else if (error.message) { errorMsg = error.message; }
        uiNotifications.showToast(`保存配置失败: ${errorMsg}`, 4000, 'error');
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = '保存配置';
        }
    }
}

export async function openPluginConfigModal(pluginName) {
     if (!pluginName || !pluginConfigModal || !pluginConfigModalTitle || !pluginConfigPluginNameInput || !pluginConfigFieldsDiv) {
         console.error("Plugin config modal or required elements not found/initialized.");
         uiNotifications.showToast("无法打开插件配置。", 3000, 'error');
         return;
     }

    // 记录当前打开的插件名称
    currentPluginName = pluginName;
    pluginConfigModalTitle.textContent = `配置插件: ${pluginName}`;
    pluginConfigPluginNameInput.value = pluginName;
    pluginConfigFieldsDiv.innerHTML = '<p aria-busy="true">正在加载配置...</p>';
    domUtils.openModal(pluginConfigModal);

    try {
        const [definition, currentConfig] = await Promise.all([
            apiService.getPluginConfigDefinition(pluginName),
            apiService.getPluginConfig(pluginName)
        ]);
        renderPluginConfigForm(definition, currentConfig);
    } catch (error) {
        console.error(`加载插件 "${pluginName}" 配置失败:`, error);
        pluginConfigFieldsDiv.innerHTML = `<p style="color: var(--pico-del-color);">加载配置失败: ${error.message || '未知错误'}</p>`;
    }
}

export function initPluginConfigModal() {
    pluginConfigModal = document.getElementById('plugin-config-modal');
    pluginConfigModalTitle = document.getElementById('plugin-config-modal-title');
    pluginConfigForm = document.getElementById('plugin-config-form');
    pluginConfigFieldsDiv = document.getElementById('plugin-config-fields');
    pluginConfigPluginNameInput = document.getElementById('plugin-config-plugin-name');

    if (!pluginConfigModal || !pluginConfigForm) {
        console.error("Plugin config modal or form not found!");
        return;
    }

    pluginConfigForm.addEventListener('submit', handlePluginConfigFormSubmit);

    pluginConfigModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="plugin-config-modal"][rel="prev"]')) {
            // 关闭模态框时清空当前插件名称
            currentPluginName = null;
            domUtils.closeModal(pluginConfigModal);
        }
    });
}