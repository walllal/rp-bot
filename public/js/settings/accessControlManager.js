import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js'; // For updateSwitchStatusText

// DOM Elements
let accessControlSection, accessControlSwitches = {}, accessControlLists = {}, accessControlCounts = {};

async function loadAccessControlList(type) {
    const listElement = accessControlLists[type];
    const countElement = accessControlCounts[type];
    if (!listElement || !countElement) {
        console.warn(`Access control list or count element for type ${type} not found.`);
        return;
    }
    listElement.innerHTML = '<li>加载中...</li>';
    try {
        const list = await apiService.getAccessControlList(type);
        renderAccessControlList(type, list);
    } catch (error) {
        console.error(`加载列表 ${type} 失败:`, error);
        listElement.innerHTML = '<li style="color: var(--pico-del-color);">加载失败</li>';
        countElement.textContent = '?';
    }
}

function renderAccessControlList(type, list) {
    const listElement = accessControlLists[type];
    const countElement = accessControlCounts[type];
    if (!listElement || !countElement) return;

    listElement.innerHTML = '';
    countElement.textContent = list.length;
    if (list.length === 0) {
        listElement.innerHTML = '<li>列表为空</li>';
        return;
    }
    list.forEach(contextId => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${contextId}</span>
            <button class="outline contrast btn-sm delete-ac-entry-btn" data-type="${type}" data-context-id="${contextId}">删除</button>
        `;
        listElement.appendChild(li);
    });
}

async function handleAccessControlFormSubmit(event) {
    if (!event.target.classList.contains('access-control-form')) return;
    event.preventDefault();
    const form = event.target;
    const type = form.dataset.type;
    const input = form.querySelector('input[type="text"]');
    const contextId = input.value.trim();
    if (!contextId) {
        uiNotifications.showToast('请输入 ID', 2000, 'warning');
        return;
    }
    if (!/^\d+$/.test(contextId)) {
        uiNotifications.showToast('ID 必须是数字', 2000, 'warning');
        return;
    }
    const data = { type, contextId };
    try {
        const updatedList = await apiService.addAccessControlEntry(data);
        renderAccessControlList(type, updatedList);
        input.value = '';
    } catch (error) {
        console.error(`添加条目到 ${type} 失败:`, error);
        let errorData = { error: `添加条目到 ${type} 时发生未知错误` };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`添加失败: ${errorData.error}`, 4000, 'error');
    }
}

async function handleDeleteAccessControlEntry(event) {
    if (!event.target.classList.contains('delete-ac-entry-btn')) return;
    const button = event.target;
    const type = button.dataset.type;
    const contextId = button.dataset.contextId;
    const confirmed = await uiNotifications.showConfirm('删除确认', `确定要从 ${type} 列表删除 ID ${contextId} 吗？`, '删除', '取消', 'warning');
    if (!confirmed) return;

    const data = { type, contextId };
    try {
        const updatedList = await apiService.removeAccessControlEntry(data);
        renderAccessControlList(type, updatedList);
    } catch (error) {
        console.error(`从 ${type} 删除条目 ${contextId} 失败:`, error);
        let errorData = { error: `从 ${type} 删除条目 ${contextId} 时发生未知错误` };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`删除失败: ${errorData.error}`, 4000, 'error');
    }
}

async function handleAccessControlSwitchChange(event) {
    const switchElement = event.target;
    const settingKey = switchElement.name; // e.g., privateWhitelistEnabled
    if (!settingKey) return;

    const isChecked = switchElement.checked;
    const settingsToUpdate = {
        [settingKey]: isChecked  // 直接使用布尔值，不要转为字符串
    };
    try {
        // 直接传递settingsToUpdate，不要再嵌套在settings对象中
        await apiService.updateSettings(settingsToUpdate);
        console.log(`Setting ${settingKey} saved to ${isChecked}`);
        // domUtils.updateSwitchStatusText(); // Already called by the switch itself
    } catch (error) {
        console.error(`自动保存开关 ${settingKey} 失败:`, error);
        switchElement.checked = !isChecked; // Revert UI change on error
        domUtils.updateSwitchStatusText(); // Ensure text reverts too
        let errorData = { error: `自动保存开关 ${settingKey} 时发生未知错误` };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`保存失败: ${errorData.error}`, 4000, 'error');
    }
}

export async function initAccessControl() {
    accessControlSection = document.getElementById('access-control-section');
    
    accessControlSwitches = {
        PRIVATE_WHITELIST: document.getElementById('setting-privateWhitelistEnabled'),
        PRIVATE_BLACKLIST: document.getElementById('setting-privateBlacklistEnabled'),
        GROUP_WHITELIST: document.getElementById('setting-groupWhitelistEnabled'),
        GROUP_BLACKLIST: document.getElementById('setting-groupBlacklistEnabled'),
    };
    accessControlLists = {
        PRIVATE_WHITELIST: document.getElementById('private-whitelist'),
        PRIVATE_BLACKLIST: document.getElementById('private-blacklist'),
        GROUP_WHITELIST: document.getElementById('group-whitelist'),
        GROUP_BLACKLIST: document.getElementById('group-blacklist'),
    };
    accessControlCounts = {
        PRIVATE_WHITELIST: document.getElementById('private-whitelist-count'),
        PRIVATE_BLACKLIST: document.getElementById('private-blacklist-count'),
        GROUP_WHITELIST: document.getElementById('group-whitelist-count'),
        GROUP_BLACKLIST: document.getElementById('group-blacklist-count'),
    };

    if (!accessControlSection) {
        console.error("Access control section not found!");
        return;
    }

    // Load all lists initially
    const loadPromises = [];
    for (const type in accessControlLists) {
        if (accessControlLists[type] && accessControlCounts[type]) { // Ensure elements exist
            loadPromises.push(loadAccessControlList(type));
        }
    }
    await Promise.all(loadPromises);
    
    // Add event listeners
    accessControlSection.addEventListener('submit', handleAccessControlFormSubmit);
    accessControlSection.addEventListener('click', handleDeleteAccessControlEntry);

    Object.values(accessControlSwitches).forEach(switchElement => {
        if (switchElement) { // Check if element exists
            switchElement.addEventListener('change', handleAccessControlSwitchChange);
        }
    });
    
    // Call updateSwitchStatusText once during init AFTER appSettingsManager has potentially set the initial checked state.
    // This ensures the initial text matches the initial state loaded from settings.
    domUtils.updateSwitchStatusText();
}