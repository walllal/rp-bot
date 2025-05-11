import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';
// Import functions for DISGUISE modals/editors
import { openDisguisePresetEditorForNew, openDisguisePresetEditorForEdit } from './presetEditor.js'; // Assuming these will be renamed in presetEditor.js copy
import { openDisguisePresetSettingsModal } from './presetSettingsModal.js'; // Assuming this will be renamed in presetSettingsModal.js copy
import { loadDisguiseAssignments as reloadDisguiseAssignmentsList } from './assignmentManager.js';

let allDisguisePresets = [];

// DOM Elements (with disguise prefix)
let disguisePresetsTableBody;
let disguiseAddPresetBtn;
let disguiseImportPresetsBtn;
let disguiseAssignmentPresetSelect; // This is also updated here

function renderDisguisePresetsTable() {
    if (!disguisePresetsTableBody) return;
    disguisePresetsTableBody.innerHTML = '';
    if (allDisguisePresets.length === 0) {
        disguisePresetsTableBody.innerHTML = '<tr><td colspan="3">暂无伪装</td></tr>'; // Updated text
        return;
    }
    allDisguisePresets.forEach(preset => {
        const row = document.createElement('tr');
        // Use disguise-prefixed class names for buttons
        row.innerHTML = `
            <td>${domUtils.escapeHtml(preset.name)}</td>
            <td>${new Date(preset.updatedAt).toLocaleString()}</td>
             <td>
                 <button class="outline secondary btn-sm disguise-export-single-preset-btn" data-id="${preset.id}" title="导出此伪装">导出</button>
                 <button class="outline secondary btn-sm disguise-edit-preset-btn" data-id="${preset.id}">编辑</button>
                 <button class="outline secondary btn-sm disguise-preset-settings-btn" data-id="${preset.id}">设置</button>
                 <button class="outline contrast btn-sm disguise-delete-preset-btn" data-id="${preset.id}">删除</button>
             </td>
        `;
        disguisePresetsTableBody.appendChild(row);
    });
    updateDisguiseAssignmentPresetOptions();
}

export function updateDisguiseAssignmentPresetOptions() {
    if (!disguiseAssignmentPresetSelect) {
        // Try to select it here if not already done in init (e.g., if init order changes)
        disguiseAssignmentPresetSelect = document.getElementById('disguise-assignment-preset-id');
        if (!disguiseAssignmentPresetSelect) return; // Still not found, exit
    }
    const currentVal = disguiseAssignmentPresetSelect.value;
    disguiseAssignmentPresetSelect.innerHTML = '<option value="">-- 请选择 --</option>';
    allDisguisePresets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = domUtils.escapeHtml(preset.name);
        disguiseAssignmentPresetSelect.appendChild(option);
    });
    if (currentVal) {
        disguiseAssignmentPresetSelect.value = currentVal;
    }
}

// Remove original loadPresets function
// async function loadPresets() { ... }

// Renamed function to load disguise presets
async function loadDisguisePresets() {
    if (!disguisePresetsTableBody) return;
    try {
        domUtils.setLoading(disguisePresetsTableBody, true, 3);
        const presets = await apiService.getDisguisePresets(); // Use new API method
        allDisguisePresets = presets || []; // Use renamed state variable, ensure it's an array
        renderDisguisePresetsTable(); // Use renamed render function
    } catch (error) {
        console.error('加载伪装列表失败:', error); // Updated text
        domUtils.showError(disguisePresetsTableBody, '加载伪装列表失败', 3); // Updated text
    } finally {
        domUtils.setLoading(disguisePresetsTableBody, false, 3);
    }
}

// Renamed function to handle clicks within the disguise presets table
async function handleDisguisePresetsTableClick(event) {
    const target = event.target;
    const presetId = target.dataset.id;

    // Use disguise-prefixed class names
    if (target.classList.contains('disguise-edit-preset-btn')) {
        if (presetId) openDisguisePresetEditorForEdit(presetId);
    } else if (target.classList.contains('disguise-delete-preset-btn')) {
        if (presetId) {
            const presetData = allDisguisePresets.find(p => p.id == presetId);
            const name = presetData?.name || `ID ${presetId}`;
            const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除伪装 "${domUtils.escapeHtml(name)}" 吗？相关的伪装分配也会被删除！`, '删除', '取消', 'warning');
            if (confirmed) {
                try {
                    await apiService.deleteDisguisePreset(presetId);
                    uiNotifications.showToast('伪装删除成功');
                    loadDisguisePresets();
                    reloadDisguiseAssignmentsList(); // Reload disguise assignments list
                    // TODO: Potentially need to reload disguise assignments as well
                } catch (error) {
                    console.error(`删除伪装 ${presetId} 失败:`, error);
                    uiNotifications.showToast('删除伪装失败', 3000, 'error');
                }
            }
        }
    } else if (target.classList.contains('disguise-preset-settings-btn')) {
        if (presetId) openDisguisePresetSettingsModal(presetId);
    } else if (target.classList.contains('disguise-export-single-preset-btn')) {
        if (presetId) exportSingleDisguisePreset(presetId, target);
    }
}

async function exportSingleDisguisePreset(presetId, button) {
    button.textContent = '导出中...';
    button.disabled = true;
    try {
        const preset = await apiService.getDisguisePreset(presetId);
        const contentWithCustomNames = (preset.content || []).map(item => {
            const cleanItem = { ...item };
            Object.keys(cleanItem).forEach(key => {
                if (cleanItem[key] === undefined || (typeof cleanItem[key] === 'object' && cleanItem[key] !== null && Object.keys(cleanItem[key]).length === 0)) {
                    delete cleanItem[key];
                }
            });
            return cleanItem;
        });

        const presetData = {
            name: preset.name,
            mode: preset.mode || 'STANDARD',
            botName: preset.botName || null,
            botNicknames: preset.botNicknames || null,
            advancedModeMessageDelay: preset.advancedModeMessageDelay ?? 1000,
            botFuzzyMatchEnabled: preset.botFuzzyMatchEnabled ?? false,
            allowImageInput: preset.allowImageInput ?? false,
            allowVoiceOutput: preset.allowVoiceOutput ?? false,
            // 触发方式控制
            nameTriggered: preset.nameTriggered ?? false,
            nicknameTriggered: preset.nicknameTriggered ?? false,
            atTriggered: preset.atTriggered ?? false,
            replyTriggered: preset.replyTriggered ?? false,
            // New app & model settings
            chatHistoryLimit: preset.chatHistoryLimit ?? 10,
            messageHistoryLimit: preset.messageHistoryLimit ?? 10,
            openaiApiKey: preset.openaiApiKey || null,
            openaiBaseUrl: preset.openaiBaseUrl || null,
            openaiModel: preset.openaiModel || 'gpt-3.5-turbo',
            // 联网设置
            allowWebSearch: preset.allowWebSearch ?? false,
            webSearchApiKey: preset.webSearchApiKey || null,
            webSearchBaseUrl: preset.webSearchBaseUrl || null,
            webSearchModel: preset.webSearchModel || 'gemini-2.0-flash',
            // content must be last for better readability in exported JSON
        };
        const orderedPreset = {...presetData, content: contentWithCustomNames}; // Add content last

        const dataToExport = [orderedPreset];
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 确保伪装名称可用于文件名
        const disguiseName = preset.name || 'unnamed';
        // 处理文件名中不允许的字符
        const safeName = disguiseName.replace(/[^a-z0-9_\-\u4e00-\u9fa5]/gi, '_').substring(0, 50);
        
        // 获取当前时间，格式化为 YYYYMMDD_HHMMSS
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const dateTimeString = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        
        // 构建文件名：伪装_伪装名_日期时间.json
        a.download = `伪装_${safeName}_${dateTimeString}.json`;
        // 调试日志，确认使用的文件名
        console.log(`导出伪装文件名: ${a.download}, 原始名称: ${disguiseName}`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        uiNotifications.showToast(`伪装 "${domUtils.escapeHtml(preset.name)}" 已导出`);
    } catch (error) { // Removed : any
        console.error(`导出伪装 ${presetId} 失败:`, error);
        uiNotifications.showToast(`导出伪装失败: ${error.message || '未知错误'}`, 4000, 'error');
    } finally {
        button.textContent = '导出';
        button.disabled = false;
    }
}

function handleImportDisguisePresets() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) {
            document.body.removeChild(fileInput);
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsedData = JSON.parse(e.target.result);
                if (!Array.isArray(parsedData)) {
                    throw new Error('导入的文件内容不是有效的 JSON 数组格式。');
                }
                if (parsedData.length === 0) {
                    uiNotifications.showToast('导入的文件不包含任何伪装。', 2000, 'warning'); // Updated text
                    return;
                }

                const dataToSend = { presets: parsedData }; // Backend expects { presets: [...] }
                disguiseImportPresetsBtn.disabled = true;
                disguiseImportPresetsBtn.textContent = '导入中...';

                try {
                    // Call the new API service function
                    const response = await apiService.importDisguisePresets(dataToSend);
                    let successMsg = response.message || `成功导入 ${response.successCount || 0} 个伪装。`;
                    if (response.errors && response.errors.length > 0) {
                        successMsg += ` (${response.errors.length} 个失败)`;
                        console.warn('导入伪装时发生错误:', response.errors);
                        // Optionally show more detailed errors in a modal or larger toast
                    }
                    uiNotifications.showToast(successMsg, response.errors?.length > 0 ? 4000 : 2500, response.errors?.length > 0 ? 'warning' : 'success');
                } catch (error) { // Catch errors from apiService call (e.g., network error, or rejected promise from API)
                    console.error('导入伪装失败:', error);
                    let errorMessage = '导入伪装失败: ';
                    if (error instanceof Error) {
                        errorMessage += error.message;
                        // Check if the error object has our custom 'details' attached
                        if (error.details && Array.isArray(error.details)) {
                            errorMessage += '\n失败详情:\n';
                            errorMessage += error.details.map(d => `- ${d.name || '未知名称'}: ${d.reason}`).join('\n');
                        }
                    } else {
                        errorMessage += '未知错误。';
                    }
                    // Show error toast, potentially longer duration if there are details
                    uiNotifications.showToast(errorMessage, error.details ? 6000 : 4000, 'error');
                } finally {
                     loadDisguisePresets(); // Refresh list regardless of success or failure
                }
            } catch (error) { // Removed : any
                console.error('导入伪装失败:', error); // Updated text
                let errorMessage = '导入伪装失败: '; // Updated text
                if (error instanceof Error) {
                    errorMessage += error.message;
                    if (error.details) { // Removed 'as any'
                        errorMessage += '\n\n详细信息:\n';
                        const details = error.details; // Removed 'as any'
                        if (Array.isArray(details)) {
                            errorMessage += details.map((d) => `- ${d.name ? `预设 "${d.name}": ` : ''}${d.reason || JSON.stringify(d)}`).join('\n'); // Removed ': any'
                        } else {
                            errorMessage += JSON.stringify(details, null, 2);
                        }
                    }
                } else { errorMessage += '未知错误。'; }
                uiNotifications.showToast(errorMessage, 5000, 'error');
            } finally {
                if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
                // Reset button state in the finally block of the try/catch/finally for the API call
                if(disguiseImportPresetsBtn) {
                    disguiseImportPresetsBtn.disabled = false;
                    disguiseImportPresetsBtn.textContent = '导入伪装';
                }
            }
        };
        reader.onerror = () => {
            uiNotifications.showToast('读取文件时出错。', 3000, 'error');
            if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
        };
        reader.readAsText(file);
    });
    document.body.appendChild(fileInput);
    fileInput.click();
}


// Renamed export function for initialization
export async function initDisguisePresetManager() {
    // Select elements with disguise prefix
    disguisePresetsTableBody = document.querySelector('#disguise-presets-table tbody');
    disguiseAddPresetBtn = document.getElementById('disguise-add-preset-btn');
    disguiseImportPresetsBtn = document.getElementById('disguise-import-presets-btn');
    // Get the select element from the disguise assignment section
    disguiseAssignmentPresetSelect = document.getElementById('disguise-assignment-preset-id');

    if (!disguisePresetsTableBody || !disguiseAddPresetBtn || !disguiseImportPresetsBtn || !disguiseAssignmentPresetSelect) {
        console.error("One or more disguise preset manager DOM elements not found!");
        return;
    }

    // Add event listeners to disguise elements
    disguiseAddPresetBtn.addEventListener('click', () => openDisguisePresetEditorForNew());
    disguisePresetsTableBody.addEventListener('click', handleDisguisePresetsTableClick);
    disguiseImportPresetsBtn.addEventListener('click', handleImportDisguisePresets);

    await loadDisguisePresets(); // Load initial disguise presets
}

// Renamed getter for disguise presets state
export function getAllDisguisePresetsState() {
    return [...allDisguisePresets];
}

// Expose loadDisguisePresets for refresh purposes (e.g., after saving in editor)
export { loadDisguisePresets };