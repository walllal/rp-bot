import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';
// presetAddItemModal functions will be imported when that module is created
import { openPresetAddItemModal } from './presetAddItemModal.js';
import { loadPresets } from './presetManager.js'; // Import loadPresets


// DOM Elements
let presetModal, presetModalTitle, presetForm, presetIdInput, presetNameInput,
    presetEditorList, presetEditorControls,
    presetItemEditModal, presetItemEditModalTitle, presetItemEditForm,
    editItemIndexInput, editItemFieldsDiv;

// State
let currentPresetEditorData = [];
let sortableInstance = null;

function populateItemSummary(itemData, summaryContainer) {
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

function createPresetItemElement(itemData, index) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'preset-item';
    itemDiv.dataset.index = index;
    if (itemData.enabled === false) {
        itemDiv.classList.add('disabled');
    }
    const handle = document.createElement('div');
    handle.className = 'preset-item-handle';
    handle.innerHTML = '☰';
    itemDiv.appendChild(handle);

    const summary = document.createElement('div');
    summary.className = 'preset-item-summary';
    itemDiv.appendChild(summary);

    const actions = document.createElement('div');
    actions.className = 'preset-item-actions';
    actions.innerHTML = `
        <a href="#" class="custom-btn delete-btn delete-preset-item-btn" title="删除此项">删除</a>
        <a href="#" class="custom-btn edit-btn edit-preset-item-btn" title="编辑此项">编辑</a>
        <input type="checkbox" class="item-activate-switch" role="switch" title="启用/禁用此项" ${itemData.enabled !== false ? 'checked' : ''}>
    `;
    itemDiv.appendChild(actions);
    populateItemSummary(itemData, summary);
    return itemDiv;
}

function renderPresetEditor() {
    if (!presetEditorList) return;
    const currentData = currentPresetEditorData;
    presetEditorList.innerHTML = '';
    if (!Array.isArray(currentData) || currentData.length === 0) {
        presetEditorList.innerHTML = '<p>请添加预设项目。</p>';
        if (sortableInstance) {
            sortableInstance.destroy();
            sortableInstance = null;
        }
        return;
    }
    currentData.forEach((item, index) => {
        const itemElement = createPresetItemElement(item, index);
        presetEditorList.appendChild(itemElement);
    });

    if (sortableInstance) sortableInstance.destroy();
    if (typeof Sortable !== 'undefined') {
        sortableInstance = new Sortable(presetEditorList, {
            handle: '.preset-item-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                const oldIndex = evt.oldIndex;
                const newIndex = evt.newIndex;
                if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
                const dataCopy = [...currentPresetEditorData];
                const [movedItem] = dataCopy.splice(oldIndex, 1);
                if (movedItem) {
                    dataCopy.splice(newIndex, 0, movedItem);
                    currentPresetEditorData = dataCopy;
                } else { return; }
                renderPresetEditor(); // Re-render to update data-index and ensure consistency
            }
        });
    } else {
        console.error("SortableJS library not loaded.");
    }
}

function populateEditModal(itemData) {
    if (!editItemFieldsDiv || !presetItemEditModalTitle) return;
    editItemFieldsDiv.innerHTML = '';
    const uniqueId = `edit-${Date.now()}`;

    if (itemData.is_variable_placeholder) {
        const varName = itemData.variable_name;
        presetItemEditModalTitle.textContent = `编辑占位符: ${varName}`;
        editItemFieldsDiv.innerHTML = `<h4 style="margin-bottom: 1.5rem; text-align: center;">占位符类型: ${varName}</h4>`;
        if (varName === 'chat_history') {
            const maxLength = itemData.config?.maxLength ?? 20;
            editItemFieldsDiv.innerHTML += `
                <div class="grid">
                    <label for="edit-maxLength-${uniqueId}">最大历史条数 (maxLength)</label>
                    <input type="number" id="edit-maxLength-${uniqueId}" name="config.maxLength" value="${maxLength}" min="1" step="1">
                    <small>设置此占位符包含的最大对话历史条数</small>
                </div>
            `;
        } else if (varName === 'message_history') {
            const limit = itemData.config?.limit ?? 10;
            editItemFieldsDiv.innerHTML += `
                <div class="grid">
                    <label for="edit-limit-${uniqueId}">最大消息条数 (limit)</label>
                    <input type="number" id="edit-limit-${uniqueId}" name="config.limit" value="${limit}" min="1" step="1">
                    <small>设置此占位符包含的最大消息历史条数</small>
                </div>
            `;
        }
        editItemFieldsDiv.innerHTML += `<input type="hidden" name="variable_name" value="${varName}">`;
        editItemFieldsDiv.innerHTML += `<input type="hidden" name="is_variable_placeholder" value="true">`;
    } else if (itemData.role) {
        const role = itemData.role;
        const content = itemData.content ?? '';
        presetItemEditModalTitle.textContent = `编辑消息`;
        const rowCount = role === 'system' ? 20 : (role === 'assistant' ? 15 : 10);
        editItemFieldsDiv.innerHTML = `
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
        presetItemEditModalTitle.textContent = '编辑项目';
        editItemFieldsDiv.innerHTML = '<p style="color: var(--pico-del-color);">无法识别的项目类型。</p>';
    }
}

async function handlePresetEditorListClick(event) {
    const target = event.target;
    const presetItem = target.closest('.preset-item');
    if (!presetItem) return;
    const index = parseInt(presetItem.dataset.index, 10);

    if (target.classList.contains('delete-preset-item-btn')) {
        if (index >= 0 && index < currentPresetEditorData.length) {
            const confirmed = await uiNotifications.showConfirm('删除确认', '确定要删除此预设项目吗？', '删除', '取消', 'warning');
            if (confirmed) {
                currentPresetEditorData.splice(index, 1);
                renderPresetEditor();
            }
        }
    } else if (target.classList.contains('edit-preset-item-btn')) {
        if (index >= 0 && index < currentPresetEditorData.length) {
            const itemData = currentPresetEditorData[index];
            if (editItemIndexInput) editItemIndexInput.value = index;
            populateEditModal(itemData);
            domUtils.openModal(presetItemEditModal);
        }
    } else if (target.classList.contains('item-activate-switch')) {
        if (index >= 0 && index < currentPresetEditorData.length) {
            const isEnabled = target.checked;
            currentPresetEditorData[index].enabled = isEnabled;
            presetItem.classList.toggle('disabled', !isEnabled);
        }
    } else if (target.classList.contains('rename-btn')) {
        if (index >= 0 && index < currentPresetEditorData.length) {
            const itemData = currentPresetEditorData[index];
            const itemTypeSpan = presetItem.querySelector('.item-type');
            if (itemTypeSpan.querySelector('.rename-input')) return;

            let inputElement = document.createElement('input');
            inputElement.type = 'text';
            inputElement.className = 'rename-input';
            const varNameMap = { 'chat_history': '对话历史', 'user_input': '用户输入', 'message_history': '消息历史' };
            const roleNameMap = { 'system': '系统消息', 'user': '用户消息', 'assistant': '助手消息' };
            inputElement.value = itemData.custom_name || (itemData.is_variable_placeholder ? (varNameMap[itemData.variable_name] || itemData.variable_name) : (roleNameMap[itemData.role] || itemData.role));
            
            itemTypeSpan.innerHTML = ''; // Clear before appending input
            itemTypeSpan.appendChild(inputElement);
            inputElement.focus();
            inputElement.select();

            const finishRename = (save) => {
                if (save && inputElement.value.trim()) {
                    itemData.custom_name = inputElement.value.trim();
                }
                renderPresetEditor(); // Re-render to reflect name change and remove input
            };
            inputElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') finishRename(true);
                else if (e.key === 'Escape') finishRename(false);
            });
            inputElement.addEventListener('blur', () => finishRename(true)); // Save on blur
        }
    }
}

function handlePresetEditorControlsClick(event) {
    const target = event.target;
    if (target.tagName === 'BUTTON' && target.dataset.addType) {
        const type = target.dataset.addType;
        if (type === 'message') {
            openPresetAddItemModal(); // This function will be imported from presetAddItemModal.js
            return;
        }
        let newItemData = { enabled: true };
        switch (type) {
            case 'user_input': newItemData = { ...newItemData, is_variable_placeholder: true, variable_name: 'user_input' }; break;
            case 'chat_history': newItemData = { ...newItemData, is_variable_placeholder: true, variable_name: 'chat_history', config: { maxLength: 10 } }; break;
            case 'message_history': newItemData = { ...newItemData, is_variable_placeholder: true, variable_name: 'message_history', config: { limit: 10 } }; break;
            default: return;
        }
        currentPresetEditorData.push(newItemData);
        renderPresetEditor();
        const newItemElement = presetEditorList.lastElementChild;
        if (newItemElement) newItemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function handlePresetItemEditFormSubmit(event) {
    event.preventDefault();
    if (!editItemIndexInput) return;
    const index = parseInt(editItemIndexInput.value, 10);
    if (isNaN(index) || index < 0 || index >= currentPresetEditorData.length) {
        uiNotifications.showToast("保存项目时出错：无效的索引。", 3000, 'error');
        return;
    }
    const formData = new FormData(presetItemEditForm);
    const updatedItemData = { ...currentPresetEditorData[index] };
    let config = updatedItemData.config || {};

    formData.forEach((value, key) => {
        if (key.startsWith('config.')) {
            config[key.substring(7)] = parseInt(value, 10) || (key.includes('Length') || key.includes('limit') ? 10 : 0); // Default based on common keys
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
    currentPresetEditorData[index] = updatedItemData;
    renderPresetEditor();
    domUtils.closeModal(presetItemEditModal);
}

async function handlePresetFormSubmit(event) {
    event.preventDefault();
    if (!presetIdInput || !presetNameInput) return;

    const id = presetIdInput.value;
    const name = presetNameInput.value.trim();
    const contentToSave = currentPresetEditorData.map(item => {
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
        uiNotifications.showToast('预设名称不能为空', 2000, 'warning');
        return;
    }
    const data = { name, content: contentToSave };
    const action = id ? apiService.updatePreset(id, data) : apiService.createPreset(data);
    const actionText = id ? '更新' : '创建';

    try {
        await action;
        domUtils.closeModal(presetModal);
        uiNotifications.showToast(`${actionText}预设成功！`);
        loadPresets(); // Reload the preset list in the background table
    } catch (error) {
        console.error(`${actionText}预设失败:`, error);
        let errorData = { error: `${actionText}预设时发生未知错误` };
         if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`${actionText}预设失败: ${errorData.error}`, 4000, 'error');
    }
}

export function openPresetEditorForNew() {
    if (!presetForm || !presetIdInput || !presetModalTitle) return;
    presetForm.reset();
    presetIdInput.value = '';
    presetModalTitle.textContent = '新增预设';
    currentPresetEditorData = [];
    renderPresetEditor();
    domUtils.openModal(presetModal);
}

export async function openPresetEditorForEdit(presetId) {
    if (!presetIdInput || !presetNameInput || !presetModalTitle) return;
    try {
        const preset = await apiService.getPreset(presetId);
        presetIdInput.value = preset.id;
        presetNameInput.value = preset.name;
        presetModalTitle.textContent = '编辑预设内容';
        const contentArray = (preset.content || []).map(item => ({
            ...item,
            enabled: item.enabled !== false,
            custom_name: item.custom_name || undefined
        }));
        currentPresetEditorData = contentArray;
        renderPresetEditor();
        domUtils.openModal(presetModal);
    } catch (error) {
        console.error(`加载预设 ${presetId} 失败:`, error);
        uiNotifications.showToast('加载预设详情失败', 3000, 'error');
    }
}

export function initPresetEditor() {
    presetModal = document.getElementById('preset-modal');
    presetModalTitle = document.getElementById('preset-modal-title');
    presetForm = document.getElementById('preset-form');
    presetIdInput = document.getElementById('preset-id');
    presetNameInput = document.getElementById('preset-name');
    presetEditorList = document.getElementById('preset-editor-list');
    presetEditorControls = document.querySelector('.preset-editor-controls');

    presetItemEditModal = document.getElementById('preset-item-edit-modal');
    presetItemEditModalTitle = document.getElementById('preset-item-edit-modal-title');
    presetItemEditForm = document.getElementById('preset-item-edit-form');
    editItemIndexInput = document.getElementById('edit-item-index');
    editItemFieldsDiv = document.getElementById('edit-item-fields');

    if (!presetModal || !presetForm || !presetEditorList || !presetEditorControls || !presetItemEditModal || !presetItemEditForm) {
        console.error("One or more preset editor DOM elements not found!");
        return;
    }

    presetEditorList.addEventListener('click', handlePresetEditorListClick);
    presetEditorControls.addEventListener('click', handlePresetEditorControlsClick);
    presetForm.addEventListener('submit', handlePresetFormSubmit);
    presetItemEditForm.addEventListener('submit', handlePresetItemEditFormSubmit);

    presetModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="preset-modal"][rel="prev"]')) {
            domUtils.closeModal(presetModal);
        }
    });
    presetItemEditModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="preset-item-edit-modal"][rel="prev"]')) {
            domUtils.closeModal(presetItemEditModal);
        }
    });
}

// Function called by presetAddItemModal to add a new item
export function addNewPresetItem(itemData) {
    currentPresetEditorData.push(itemData);
    renderPresetEditor();
    // Scroll to the new item
    const newItemElement = presetEditorList.lastElementChild;
    if (newItemElement) newItemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Expose currentPresetEditorData for ESC key handler in main.js (or refactor ESC handler)
export function getCurrentPresetEditorData() {
    // Return a copy to prevent direct modification from outside? Or trust consumers?
    // For now, return direct reference as original code did implicitly.
    return currentPresetEditorData;
}