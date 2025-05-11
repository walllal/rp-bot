import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';
// Import functions from the DISGUISE preset add item modal
import { openDisguisePresetAddItemModal } from './presetAddItemModal.js';
// Import function from the DISGUISE preset manager
import { loadDisguisePresets } from './presetManager.js';

// DOM Elements (with disguise prefix where applicable)
let disguisePresetModal, disguisePresetModalTitle, disguisePresetForm, disguisePresetIdInput, disguisePresetNameInput,
    disguisePresetEditorList, disguisePresetEditorControls,
    disguisePresetItemEditModal, disguisePresetItemEditModalTitle, disguisePresetItemEditForm,
    disguiseEditItemIndexInput, disguiseEditItemFieldsDiv;

// State (specific to disguise editor)
let currentDisguisePresetEditorData = [];
let disguiseSortableInstance = null;

// --- Helper function to populate item summary (remains largely the same logic) ---
function populateDisguiseItemSummary(itemData, summaryContainer) {
    let itemTypeDisplay = '❓ 未知类型';
    let itemPreview = '';
    const varNameMap = { 'chat_history': '对话历史', 'user_input': '用户输入', 'message_history': '消息历史' };
    const roleNameMap = { 'system': '系统消息', 'user': '用户消息', 'assistant': '助手消息' };

    if (itemData.is_variable_placeholder) {
        let placeholderIcon = '📋';
        let varName = itemData.variable_name;
        let displayName = itemData.custom_name || varNameMap[varName] || varName;
        switch(varName) {
            case 'chat_history': placeholderIcon = '💬'; break;
            case 'user_input': placeholderIcon = '✏️'; break;
            case 'message_history': placeholderIcon = '📝'; break;
        }
        itemTypeDisplay = `${placeholderIcon} ${displayName}`;
        if (varName === 'chat_history' && itemData.config?.maxLength) {
            itemPreview = `(最大 ${itemData.config.maxLength} 轮)`;
        } else if (varName === 'message_history' && itemData.config?.limit) {
            itemPreview = `(最多 ${itemData.config.limit} 条)`;
        } else {
            itemPreview = '';
        }
    } else if (itemData.role) {
        let roleIcon = '❓';
        let roleName = itemData.role;
        let displayName = itemData.custom_name || roleNameMap[roleName] || roleName;
        switch(roleName) {
            case 'system': roleIcon = '⚙️'; break;
            case 'user': roleIcon = '👤'; break;
            case 'assistant': roleIcon = '🤖'; break;
        }
        itemTypeDisplay = `${roleIcon} ${displayName}`;
        itemPreview = itemData.content?.substring(0, 50) + (itemData.content?.length > 50 ? '...' : '');
    } else {
        itemPreview = '无效的项目数据';
    }
    summaryContainer.innerHTML = `
        <span class="item-type">${itemTypeDisplay} <button class="rename-btn" title="重命名" data-original-name="${itemData.is_variable_placeholder ? itemData.variable_name : itemData.role}">📝</button></span>
        <span class="item-preview">${domUtils.escapeHtml(itemPreview)}</span>
    `;
}

// --- Helper function to create item element (remains largely the same logic) ---
function createDisguisePresetItemElement(itemData, index) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'preset-item'; // Keep generic class for styling
    itemDiv.dataset.index = index;
    if (itemData.enabled === false) {
        itemDiv.classList.add('disabled');
    }
    const handle = document.createElement('div');
    handle.className = 'preset-item-handle'; // Keep generic class
    handle.innerHTML = '☰';
    itemDiv.appendChild(handle);

    const summary = document.createElement('div');
    summary.className = 'preset-item-summary'; // Keep generic class
    itemDiv.appendChild(summary);

    const actions = document.createElement('div');
    actions.className = 'preset-item-actions'; // Keep generic class
    // Use generic button classes inside, rely on parent container for context if needed
    actions.innerHTML = `
        <a href="#" class="custom-btn delete-btn delete-preset-item-btn" title="删除此项">删除</a>
        <a href="#" class="custom-btn edit-btn edit-preset-item-btn" title="编辑此项">编辑</a>
        <input type="checkbox" class="item-activate-switch" role="switch" title="启用/禁用此项" ${itemData.enabled !== false ? 'checked' : ''}>
    `;
    itemDiv.appendChild(actions);
    populateDisguiseItemSummary(itemData, summary); // Use the renamed summary populator
    return itemDiv;
}

// --- Renders the editor list ---
function renderDisguisePresetEditor() {
    if (!disguisePresetEditorList) return;
    const currentData = currentDisguisePresetEditorData;
    disguisePresetEditorList.innerHTML = '';
    if (!Array.isArray(currentData) || currentData.length === 0) {
        disguisePresetEditorList.innerHTML = '<p>请添加伪装项目。</p>'; // Updated text
        if (disguiseSortableInstance) {
            disguiseSortableInstance.destroy();
            disguiseSortableInstance = null;
        }
        return;
    }
    currentData.forEach((item, index) => {
        const itemElement = createDisguisePresetItemElement(item, index);
        disguisePresetEditorList.appendChild(itemElement);
    });

    if (disguiseSortableInstance) disguiseSortableInstance.destroy();
    if (typeof Sortable !== 'undefined') {
        disguiseSortableInstance = new Sortable(disguisePresetEditorList, {
            handle: '.preset-item-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
                const dataCopy = [...currentDisguisePresetEditorData];
                const [movedItem] = dataCopy.splice(oldIndex, 1);
                if (movedItem) {
                    dataCopy.splice(newIndex, 0, movedItem);
                    currentDisguisePresetEditorData = dataCopy;
                } else { return; }
                renderDisguisePresetEditor(); // Re-render to update data-index
            }
        });
    } else {
        console.error("SortableJS library not loaded.");
    }
}

// --- Populates the item edit modal ---
function populateDisguiseEditModal(itemData) {
    if (!disguiseEditItemFieldsDiv || !disguisePresetItemEditModalTitle) return;
    disguiseEditItemFieldsDiv.innerHTML = '';
    const uniqueId = `disguise-edit-${Date.now()}`; // Prefix ID

    if (itemData.is_variable_placeholder) {
        const varName = itemData.variable_name;
        disguisePresetItemEditModalTitle.textContent = `编辑伪装占位符: ${varName}`; // Updated text
        disguiseEditItemFieldsDiv.innerHTML = `<h4 style="margin-bottom: 1.5rem; text-align: center;">占位符类型: ${varName}</h4>`;
        if (varName === 'chat_history') {
            const maxLength = itemData.config?.maxLength ?? 20;
            disguiseEditItemFieldsDiv.innerHTML += `
                <div class="grid">
                    <label for="edit-maxLength-${uniqueId}">最大历史条数 (maxLength)</label>
                    <input type="number" id="edit-maxLength-${uniqueId}" name="config.maxLength" value="${maxLength}" min="1" step="1">
                    <small>设置此占位符包含的最大对话历史条数</small>
                </div>
            `;
        } else if (varName === 'message_history') {
            const limit = itemData.config?.limit ?? 10;
            disguiseEditItemFieldsDiv.innerHTML += `
                <div class="grid">
                    <label for="edit-limit-${uniqueId}">最大消息条数 (limit)</label>
                    <input type="number" id="edit-limit-${uniqueId}" name="config.limit" value="${limit}" min="1" step="1">
                    <small>设置此占位符包含的最大消息历史条数</small>
                </div>
            `;
        }
        disguiseEditItemFieldsDiv.innerHTML += `<input type="hidden" name="variable_name" value="${varName}">`;
        disguiseEditItemFieldsDiv.innerHTML += `<input type="hidden" name="is_variable_placeholder" value="true">`;
    } else if (itemData.role) {
        const role = itemData.role;
        const content = itemData.content ?? '';
        disguisePresetItemEditModalTitle.textContent = `编辑伪装消息`; // Updated text
        const rowCount = role === 'system' ? 20 : (role === 'assistant' ? 15 : 10);
        disguiseEditItemFieldsDiv.innerHTML = `
            <div class="grid">
                <label for="edit-role-${uniqueId}">
                    角色 (Role)
                    <select id="edit-role-${uniqueId}" name="role" style="max-width: 300px;">
                        <option value="system" ${role === 'system' ? 'selected' : ''}>System (系统指令)</option>
                        <option value="user" ${role === 'user' ? 'selected' : ''}>User (用户消息)</option>
                        <option value="assistant" ${role === 'assistant' ? 'selected' : ''}>Assistant (助手回复)</option>
                    </select>
                    <small>系统指令用于设置AI的行为，用户消息是用户的输入，助手回复是预设的AI回复</small>
                </label>
            </div>
            <div style="margin-top: 1rem;">
                <label for="edit-content-${uniqueId}">
                    内容 (Content)
                    <textarea id="edit-content-${uniqueId}" name="content" rows="${rowCount}" style="min-height: 250px; resize: vertical;">${domUtils.escapeHtml(content)}</textarea>
                </label>
            </div>
            <input type="hidden" name="is_variable_placeholder" value="false">
        `;
    } else {
        disguisePresetItemEditModalTitle.textContent = '编辑伪装项目'; // Updated text
        disguiseEditItemFieldsDiv.innerHTML = '<p style="color: var(--pico-del-color);">无法识别的项目类型。</p>';
    }
}

// --- Event Handlers ---

async function handleDisguisePresetEditorListClick(event) {
    const target = event.target;
    const presetItem = target.closest('.preset-item');
    if (!presetItem) return;
    const index = parseInt(presetItem.dataset.index, 10);

    // Use generic button classes defined in createDisguisePresetItemElement
    if (target.classList.contains('delete-preset-item-btn')) {
        if (index >= 0 && index < currentDisguisePresetEditorData.length) {
            const confirmed = await uiNotifications.showConfirm('删除确认', '确定要删除此伪装项目吗？', '删除', '取消', 'warning'); // Updated text
            if (confirmed) {
                currentDisguisePresetEditorData.splice(index, 1);
                renderDisguisePresetEditor();
            }
        }
    } else if (target.classList.contains('edit-preset-item-btn')) {
        if (index >= 0 && index < currentDisguisePresetEditorData.length) {
            const itemData = currentDisguisePresetEditorData[index];
            if (disguiseEditItemIndexInput) disguiseEditItemIndexInput.value = index;
            populateDisguiseEditModal(itemData);
            domUtils.openModal(disguisePresetItemEditModal);
        }
    } else if (target.classList.contains('item-activate-switch')) {
        if (index >= 0 && index < currentDisguisePresetEditorData.length) {
            const isEnabled = target.checked;
            currentDisguisePresetEditorData[index].enabled = isEnabled;
            presetItem.classList.toggle('disabled', !isEnabled);
        }
    } else if (target.classList.contains('rename-btn')) {
        if (index >= 0 && index < currentDisguisePresetEditorData.length) {
            const itemData = currentDisguisePresetEditorData[index];
            const itemTypeSpan = presetItem.querySelector('.item-type');
            if (itemTypeSpan.querySelector('.rename-input')) return;

            let inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.className = 'rename-input';
            const varNameMap = { 'chat_history': '对话历史', 'user_input': '用户输入', 'message_history': '消息历史' };
            const roleNameMap = { 'system': '系统消息', 'user': '用户消息', 'assistant': '助手消息' };
            inputElement.value = itemData.custom_name || (itemData.is_variable_placeholder ? (varNameMap[itemData.variable_name] || itemData.variable_name) : (roleNameMap[itemData.role] || itemData.role));

            itemTypeSpan.innerHTML = '';
            itemTypeSpan.appendChild(inputElement);
            inputElement.focus();
            inputElement.select();

            const finishRename = (save) => {
                if (save && inputElement.value.trim()) {
                    itemData.custom_name = inputElement.value.trim();
                }
                renderDisguisePresetEditor();
            };
            inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finishRename(true);
                else if (e.key === 'Escape') finishRename(false);
            });
            inputElement.addEventListener('blur', () => finishRename(true));
        }
    }
}

function handleDisguisePresetEditorControlsClick(event) {
    console.log('handleDisguisePresetEditorControlsClick triggered for disguise modal', event.target); // 新增日志
    const target = event.target;
    if (target.tagName === 'BUTTON' && target.dataset.addType) {
        const type = target.dataset.addType;
        if (type === 'message') {
            openDisguisePresetAddItemModal(); // Use renamed function
            return;
        }
        let newItemData = { enabled: true };
        switch (type) {
            case 'user_input': newItemData = { ...newItemData, is_variable_placeholder: true, variable_name: 'user_input' }; break;
            case 'chat_history': newItemData = { ...newItemData, is_variable_placeholder: true, variable_name: 'chat_history', config: { maxLength: 10 } }; break;
            case 'message_history': newItemData = { ...newItemData, is_variable_placeholder: true, variable_name: 'message_history', config: { limit: 10 } }; break;
            default: return;
        }
        currentDisguisePresetEditorData.push(newItemData);
        renderDisguisePresetEditor();
        const newItemElement = disguisePresetEditorList.lastElementChild;
        if (newItemElement) newItemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function handleDisguisePresetItemEditFormSubmit(event) {
    event.preventDefault();
    if (!disguiseEditItemIndexInput) return;
    const index = parseInt(disguiseEditItemIndexInput.value, 10);
    if (isNaN(index) || index < 0 || index >= currentDisguisePresetEditorData.length) {
        uiNotifications.showToast("保存伪装项目时出错：无效的索引。", 3000, 'error'); // Updated text
        return;
    }
    const formData = new FormData(disguisePresetItemEditForm);
    const updatedItemData = { ...currentDisguisePresetEditorData[index] };
    let config = updatedItemData.config || {};

    formData.forEach((value, key) => {
        if (key.startsWith('config.')) {
            config[key.substring(7)] = parseInt(value, 10) || (key.includes('Length') || key.includes('limit') ? 10 : 0);
        } else if (key === 'is_variable_placeholder') {
            updatedItemData[key] = value === 'true';
        } else {
            updatedItemData[key] = value;
        }
    });
    if (Object.keys(config).length > 0) updatedItemData.config = config; else delete updatedItemData.config;
    if (updatedItemData.is_variable_placeholder) {
        delete updatedItemData.role; delete updatedItemData.content;
    } else {
        delete updatedItemData.variable_name; delete updatedItemData.config;
        updatedItemData.is_variable_placeholder = false;
    }
    currentDisguisePresetEditorData[index] = updatedItemData;
    renderDisguisePresetEditor();
    domUtils.closeModal(disguisePresetItemEditModal);
}

async function handleDisguisePresetFormSubmit(event) {
    event.preventDefault();
    if (!disguisePresetIdInput || !disguisePresetNameInput) return;

    const id = disguisePresetIdInput.value;
    const name = disguisePresetNameInput.value.trim();
    const contentToSave = currentDisguisePresetEditorData.map(item => {
        const cleanItem = { ...item };
        if (!cleanItem.custom_name) delete cleanItem.custom_name;
        if (cleanItem.is_variable_placeholder) {
            delete cleanItem.role; delete cleanItem.content;
        } else {
            delete cleanItem.variable_name; delete cleanItem.config;
            cleanItem.is_variable_placeholder = false;
        }
        return cleanItem;
    });

    if (!name) {
        uiNotifications.showToast('伪装名称不能为空', 2000, 'warning'); // Updated text
        return;
    }
    const data = { name, content: contentToSave };
    const action = id ? apiService.updateDisguisePreset(id, data) : apiService.createDisguisePreset(data); // Use new API methods
    const actionText = id ? '更新' : '创建';

    try {
        await action;
        domUtils.closeModal(disguisePresetModal);
        uiNotifications.showToast(`${actionText}伪装成功！`); // Updated text
        loadDisguisePresets(); // Reload the disguise preset list
    } catch (error) {
        console.error(`${actionText}伪装失败:`, error); // Updated text
        let errorData = { error: `${actionText}伪装时发生未知错误` }; // Updated text
         if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`${actionText}伪装失败: ${errorData.error}`, 4000, 'error'); // Updated text
    }
}

// --- Exported Functions ---

export function openDisguisePresetEditorForNew() {
    if (!disguisePresetForm || !disguisePresetIdInput || !disguisePresetModalTitle) return;
    disguisePresetForm.reset();
    disguisePresetIdInput.value = '';
    disguisePresetModalTitle.textContent = '新增伪装'; // Updated text
    currentDisguisePresetEditorData = [];
    renderDisguisePresetEditor();
    domUtils.openModal(disguisePresetModal);
}

export async function openDisguisePresetEditorForEdit(presetId) {
    if (!disguisePresetIdInput || !disguisePresetNameInput || !disguisePresetModalTitle) return;
    try {
        const preset = await apiService.getDisguisePreset(presetId); // Use new API method
        if (!preset) {
             uiNotifications.showToast('加载伪装详情失败: 未找到伪装', 3000, 'error'); // Updated text
             return;
        }
        disguisePresetIdInput.value = preset.id;
        disguisePresetNameInput.value = preset.name;
        disguisePresetModalTitle.textContent = '编辑伪装内容'; // Updated text
        const contentArray = (preset.content || []).map(item => ({
            ...item,
            enabled: item.enabled !== false,
            custom_name: item.custom_name || undefined
        }));
        currentDisguisePresetEditorData = contentArray;
        renderDisguisePresetEditor();
        domUtils.openModal(disguisePresetModal);
    } catch (error) {
        console.error(`加载伪装 ${presetId} 失败:`, error); // Updated text
        uiNotifications.showToast('加载伪装详情失败', 3000, 'error'); // Updated text
    }
}

export function initDisguisePresetEditor() {
    // Select elements with disguise prefix, assuming they exist in HTML
    disguisePresetModal = document.getElementById('disguise-preset-modal');
    disguisePresetModalTitle = document.getElementById('disguise-preset-modal-title');
    disguisePresetForm = document.getElementById('disguise-preset-form');
    disguisePresetIdInput = document.getElementById('disguise-preset-id');
    disguisePresetNameInput = document.getElementById('disguise-preset-name');
    disguisePresetEditorList = document.getElementById('disguise-preset-editor-list');
    // Use a more specific selector for controls within the disguise tab
    disguisePresetEditorControls = document.querySelector('#disguise-preset-modal .preset-editor-controls');

    disguisePresetItemEditModal = document.getElementById('disguise-preset-item-edit-modal'); // Assuming duplicated modal ID
    disguisePresetItemEditModalTitle = document.getElementById('disguise-preset-item-edit-modal-title');
    disguisePresetItemEditForm = document.getElementById('disguise-preset-item-edit-form');
    disguiseEditItemIndexInput = document.getElementById('disguise-edit-item-index');
    disguiseEditItemFieldsDiv = document.getElementById('disguise-edit-item-fields');

    if (!disguisePresetModal || !disguisePresetForm || !disguisePresetEditorList || !disguisePresetEditorControls || !disguisePresetItemEditModal || !disguisePresetItemEditForm) {
        console.error("One or more disguise preset editor DOM elements not found! Ensure HTML IDs are prefixed with 'disguise-'.");
        return;
    }

    // Add event listeners to disguise elements
    disguisePresetEditorList.addEventListener('click', handleDisguisePresetEditorListClick);
    if (disguisePresetEditorControls) { // Check if controls exist before adding listener
        disguisePresetEditorControls.addEventListener('click', handleDisguisePresetEditorControlsClick);
    }
    disguisePresetForm.addEventListener('submit', handleDisguisePresetFormSubmit);
    disguisePresetItemEditForm.addEventListener('submit', handleDisguisePresetItemEditFormSubmit);

    // Modal close listeners
    disguisePresetModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="disguise-preset-modal"][rel="prev"]')) { // Update target
            domUtils.closeModal(disguisePresetModal);
        }
    });
    disguisePresetItemEditModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="disguise-preset-item-edit-modal"][rel="prev"]')) { // Update target
            domUtils.closeModal(disguisePresetItemEditModal);
        }
    });
}

// Function called by disguise presetAddItemModal to add a new item
export function addNewDisguisePresetItem(itemData) {
    currentDisguisePresetEditorData.push(itemData);
    renderDisguisePresetEditor();
    // Scroll to the new item
    const newItemElement = disguisePresetEditorList.lastElementChild;
    if (newItemElement) newItemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Renamed getter for disguise editor data
export function getCurrentDisguisePresetEditorData() {
    return currentDisguisePresetEditorData;
}