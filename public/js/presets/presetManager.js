import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
// Import the specific confirmation function we need
import { showYesNoCancelConfirm } from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';
// Import functions to open other modals/editors related to presets
import { openPresetEditorForNew, openPresetEditorForEdit } from './presetEditor.js';
import { openPresetSettingsModal } from './presetSettingsModal.js';
import { loadAssignments as reloadAssignmentsList } from './assignmentManager.js';

let allPresets = [];

// DOM Elements
let presetsTableBody;
let addPresetBtn;
let importPresetsBtn;
let assignmentPresetSelect; // This is also updated here

function renderPresetsTable() {
    if (!presetsTableBody) return;
    presetsTableBody.innerHTML = '';
    if (allPresets.length === 0) {
        presetsTableBody.innerHTML = '<tr><td colspan="3">暂无预设</td></tr>'; // Colspan is 3 now
        return;
    }
    allPresets.forEach(preset => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${domUtils.escapeHtml(preset.name)}</td>
            <td>${new Date(preset.updatedAt).toLocaleString()}</td>
             <td>
                 <button class="outline secondary btn-sm export-single-preset-btn" data-id="${preset.id}" title="导出此预设">导出</button>
                 <button class="outline secondary btn-sm edit-preset-btn" data-id="${preset.id}">编辑</button>
                 <button class="outline secondary btn-sm preset-settings-btn" data-id="${preset.id}">设置</button>
                 <button class="outline contrast btn-sm delete-preset-btn" data-id="${preset.id}">删除</button>
             </td>
        `;
        presetsTableBody.appendChild(row);
    });
    updateAssignmentPresetOptions();
}

export function updateAssignmentPresetOptions() {
    if (!assignmentPresetSelect) return;
    const currentVal = assignmentPresetSelect.value;
    assignmentPresetSelect.innerHTML = '<option value="">-- 请选择 --</option>';
    allPresets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = domUtils.escapeHtml(preset.name);
        assignmentPresetSelect.appendChild(option);
    });
    if (currentVal) {
        assignmentPresetSelect.value = currentVal;
    }
}

async function loadPresets() { // Removed export keyword here
    if (!presetsTableBody) return;
    try {
        domUtils.setLoading(presetsTableBody, true, 3);
        const presets = await apiService.getPresets();
        allPresets = presets;
        renderPresetsTable();
    } catch (error) {
        console.error('加载预设失败:', error);
        domUtils.showError(presetsTableBody, '加载预设失败', 3);
    } finally {
        domUtils.setLoading(presetsTableBody, false, 3);
    }
}

async function handlePresetsTableClick(event) {
    const target = event.target;
    const presetId = target.dataset.id;

    if (target.classList.contains('edit-preset-btn')) {
        if (presetId) openPresetEditorForEdit(presetId);
    } else if (target.classList.contains('delete-preset-btn')) {
        if (presetId) {
            const presetData = allPresets.find(p => p.id == presetId);
            const name = presetData?.name || `ID ${presetId}`;
            const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除预设 "${domUtils.escapeHtml(name)}" 吗？相关的分配也会被删除！`, '删除', '取消', 'warning');
            if (confirmed) {
                try {
                    await apiService.deletePreset(presetId);
                    uiNotifications.showToast('预设删除成功');
                    loadPresets(); // Reload presets list
                    reloadAssignmentsList(); // Reload assignments list
                    // Potentially need to reload assignments as well, or have assignmentManager listen for preset deletion.
                } catch (error) {
                    console.error(`删除预设 ${presetId} 失败:`, error);
                    uiNotifications.showToast('删除预设失败', 3000, 'error');
                }
            }
        }
    } else if (target.classList.contains('preset-settings-btn')) {
        if (presetId) openPresetSettingsModal(presetId);
    } else if (target.classList.contains('export-single-preset-btn')) {
        if (presetId) exportSinglePreset(presetId, target);
    }
}

async function exportSinglePreset(presetId, button) {
    button.textContent = '准备导出...'; // Initial state before confirmation
    button.disabled = true;

    try {
        // Ask the user first
        const exportChoice = await showYesNoCancelConfirm(
            '导出确认',
            '是否包含 API 密钥、URL 和模型名称等敏感信息？\n选择“否”将移除这些信息。',
            '是 (包含)', // Confirm button text for 'yes'
            '否 (移除)', // Deny button text for 'no'
            '取消'       // Cancel button text
        );

        if (exportChoice === 'cancel') {
            uiNotifications.showToast('导出已取消', 2000, 'info');
            // No 'finally' block needed here, reset button state directly
            button.textContent = '导出';
            button.disabled = false;
            return; // Exit the function
        }

        // Proceed with export
        button.textContent = '导出中...'; // Update button text

        const preset = await apiService.getPreset(presetId);
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
            nameTriggered: preset.nameTriggered ?? true,
            nicknameTriggered: preset.nicknameTriggered ?? true,
            atTriggered: preset.atTriggered ?? true,
            replyTriggered: preset.replyTriggered ?? true,
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
            webSearchSystemPrompt: preset.webSearchSystemPrompt || null, // 新增
            // Advanced Trigger Settings
            timedTriggerEnabled: preset.timedTriggerEnabled ?? false,
            timedTriggerInterval: preset.timedTriggerInterval ?? null, // Use interval
            quantitativeTriggerEnabled: preset.quantitativeTriggerEnabled ?? false,
            quantitativeTriggerThreshold: preset.quantitativeTriggerThreshold ?? null,
            aiTriggerEnabled: preset.aiTriggerEnabled ?? false,
            aiTriggerApiKey: preset.aiTriggerApiKey || null,
            aiTriggerBaseUrl: preset.aiTriggerBaseUrl || null,
            aiTriggerModel: preset.aiTriggerModel || null,
            aiTriggerKeyword: preset.aiTriggerKeyword || null,
            aiTriggerKeywordFuzzyMatch: preset.aiTriggerKeywordFuzzyMatch ?? false,
            aiTriggerSystemPrompt: preset.aiTriggerSystemPrompt || null,
            aiTriggerUserPrompt: preset.aiTriggerUserPrompt || null,
            // content must be last for better readability in exported JSON
        };
        let presetToExport = {...presetData, content: contentWithCustomNames}; // Add content last

        // If user chose 'no', remove sensitive data
        if (exportChoice === 'no') {
            const sensitiveKeys = [
                'openaiApiKey', 'openaiBaseUrl', 'openaiModel',
                'webSearchApiKey', 'webSearchBaseUrl', 'webSearchModel',
                'aiTriggerApiKey', 'aiTriggerBaseUrl', 'aiTriggerModel'
            ];
            // Create a copy to modify, or modify in place if acceptable
            const sanitizedPreset = { ...presetToExport };
            sensitiveKeys.forEach(key => {
                if (key in sanitizedPreset) {
                    delete sanitizedPreset[key];
                }
            });
            presetToExport = sanitizedPreset; // Use the sanitized version
            uiNotifications.showToast('敏感信息已移除', 1500, 'info'); // Inform user
        }

        const dataToExport = [presetToExport]; // Export the (potentially sanitized) preset
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 确保预设名称可用于文件名
        const presetName = preset.name || 'unnamed';
        // 处理文件名中不允许的字符，保留中文字符
        const safeName = presetName.replace(/[^a-z0-9_\-\u4e00-\u9fa5]/gi, '_').substring(0, 50);
        
        // 获取当前时间，格式化为 YYYYMMDD_HHMMSS
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const dateTimeString = `${year}${month}${day}_${hours}${minutes}${seconds}`;
        
        // 构建文件名：预设_预设名_日期时间.json
        a.download = `预设_${safeName}_${dateTimeString}.json`;
        // 调试日志，确认使用的文件名
        console.log(`导出预设文件名: ${a.download}, 原始名称: ${presetName}`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        uiNotifications.showToast(`预设 "${domUtils.escapeHtml(preset.name)}" 已导出`);
    } catch (error) {
        console.error(`导出预设 ${presetId} 失败:`, error);
        uiNotifications.showToast(`导出预设失败: ${error.message || '未知错误'}`, 4000, 'error');
    } finally {
        button.textContent = '导出';
        button.disabled = false;
    }
}

function handleImportPresets() {
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
                    uiNotifications.showToast('导入的文件不包含任何预设。', 2000, 'warning');
                    return;
                }
                const dataToSend = { presets: parsedData };
                importPresetsBtn.disabled = true;
                importPresetsBtn.textContent = '导入中...';
                const response = await apiService.importPresets(dataToSend);
                uiNotifications.showToast(response.message || `成功导入 ${response.successCount || '?'} 个预设。`);
                loadPresets(); // Refresh list
            } catch (error) {
                console.error('导入预设失败:', error);
                let errorMessage = '导入预设失败: ';
                if (error instanceof Error) {
                    errorMessage += error.message;
                    if (error.details) {
                        errorMessage += '\n\n详细信息:\n';
                        if (Array.isArray(error.details)) {
                            errorMessage += error.details.map(d => `- ${d.name ? `预设 "${d.name}": ` : ''}${d.reason || JSON.stringify(d)}`).join('\n');
                        } else {
                            errorMessage += JSON.stringify(error.details, null, 2);
                        }
                    }
                } else { errorMessage += '未知错误。'; }
                uiNotifications.showToast(errorMessage, 5000, 'error');
            } finally {
                if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
                importPresetsBtn.disabled = false;
                importPresetsBtn.textContent = '导入预设';
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


// Make loadPresets available for other modules to call for refresh
export { loadPresets };

export async function initPresetManager() {
    presetsTableBody = document.querySelector('#presets-table tbody');
    addPresetBtn = document.getElementById('add-preset-btn');
    importPresetsBtn = document.getElementById('import-presets-btn');
    assignmentPresetSelect = document.getElementById('assignment-preset-id'); // Used by updateAssignmentPresetOptions

    if (!presetsTableBody || !addPresetBtn || !importPresetsBtn || !assignmentPresetSelect) {
        console.error("One or more preset manager DOM elements not found!");
        return;
    }

    addPresetBtn.addEventListener('click', () => openPresetEditorForNew());
    presetsTableBody.addEventListener('click', handlePresetsTableClick);
    importPresetsBtn.addEventListener('click', handleImportPresets);

    await loadPresets(); // Load initial presets
}

// Getter for allPresets if other modules need read-only access.
// Consider if this is the best approach or if methods should be provided.
export function getAllPresets() {
    return [...allPresets];
}