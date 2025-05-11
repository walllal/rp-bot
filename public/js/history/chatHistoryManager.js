import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';

// DOM Elements
let historyFilterForm, historyContextTypeSelect, historyContextIdInput, // historyContextIdInput is now a select
    historyLimitInput, historyDeleteCountInput, deleteHistoryBtn, historyOutputDiv;

// Cached Data
let cachedFriends = [];
let cachedGroups = [];

function renderChatHistory(history) {
    if (!historyOutputDiv) return;
    historyOutputDiv.innerHTML = '';
    if (!Array.isArray(history) || history.length === 0) {
        historyOutputDiv.innerHTML = '<p>没有找到相关对话历史记录。</p>';
        return;
    }
    // Reverse the array so that the oldest messages are processed first
    // and appended first, resulting in newest messages at the bottom.
    history.reverse();
    history.forEach(item => {
        const p = document.createElement('p');
        p.classList.add('message-history-item'); // Use the same class for styling consistency

        let metadataParts = [];
        if (item.role === 'USER') {
            metadataParts.push(`用户: ${domUtils.escapeHtml(item.userName || item.userId)}`);
        } else if (item.role === 'ASSISTANT') {
            metadataParts.push(`本机: ${domUtils.escapeHtml(item.botName || item.userName || '助手')}`);
        } else {
            metadataParts.push(`角色: ${item.role}`);
            if (item.userName) metadataParts.push(`名称: ${domUtils.escapeHtml(item.userName)}`);
        }
        metadataParts.push(`发送者ID: ${item.userId}`);
        // metadataParts.push(`类型: ${item.contextType}`); // Removed
        // metadataParts.push(`上下文ID: ${item.contextId}`); // Removed
        // if (item.messageId) metadataParts.push(`消息ID: ${item.messageId}`); // Removed
        metadataParts.push(`时间: ${new Date(item.timestamp).toLocaleString()}`);

        p.innerHTML = `
            <small>${metadataParts.join(' | ')}</small>
            <p>${domUtils.escapeHtml(item.content)}</p>
        `;
        historyOutputDiv.appendChild(p);
    });
    historyOutputDiv.scrollTop = historyOutputDiv.scrollHeight; // Scroll to bottom
}

function populateChatHistoryContextIdSelect(type) {
    if (!historyContextIdInput) return;

    historyContextIdInput.innerHTML = ''; // Clear existing options
    historyContextIdInput.disabled = true; // Disable by default
    historyContextIdInput.required = false; // Not required by default

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;

    if (type === 'private') {
        if (cachedFriends.length === 0) {
            placeholderOption.textContent = '--无可用好友--';
        } else {
            placeholderOption.textContent = '--请选择好友--';
            historyContextIdInput.disabled = false;
            historyContextIdInput.required = true;
            cachedFriends.forEach(friend => {
                const option = document.createElement('option');
                option.value = friend.userId;
                const displayName = friend.remark || friend.nickname;
                option.textContent = `${friend.userId} - ${displayName}`;
                historyContextIdInput.appendChild(option);
            });
        }
    } else if (type === 'group') {
        if (cachedGroups.length === 0) {
            placeholderOption.textContent = '--无可用群组--';
        } else {
            placeholderOption.textContent = '--请选择群组--';
            historyContextIdInput.disabled = false;
            historyContextIdInput.required = true;
            cachedGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.groupId;
                option.textContent = `${group.groupId} - ${group.groupName}`;
                historyContextIdInput.appendChild(option);
            });
        }
    } else {
        // Handle case where no type or an invalid type is selected
        placeholderOption.textContent = '--请先选择类型--';
    }

    // Add the placeholder option at the beginning
    historyContextIdInput.insertBefore(placeholderOption, historyContextIdInput.firstChild);
    historyContextIdInput.value = ''; // Ensure placeholder is selected initially
}


async function handleHistoryFilterSubmit(event) {
    event.preventDefault();
    if (!historyContextTypeSelect || !historyContextIdInput || !historyLimitInput || !historyOutputDiv) return;

    const contextType = historyContextTypeSelect.value;
    const contextId = historyContextIdInput.value.trim();
    const limit = historyLimitInput.value;

    if (!contextId) {
        uiNotifications.showToast('请输入上下文 ID', 2000, 'warning');
        return;
    }
    // No longer need regex check for number, as it's a select value

    historyOutputDiv.innerHTML = '<p aria-busy="true">正在查询对话历史记录...</p>';
    try {
        const history = await apiService.getHistory(contextType, contextId, limit);
        renderChatHistory(history);
    } catch (error) {
        console.error('查询对话历史记录失败:', error);
        historyOutputDiv.innerHTML = '<p style="color: var(--pico-del-color);">查询对话历史记录失败</p>';
    }
}

async function handleDeleteHistory() {
    if (!historyContextTypeSelect || !historyContextIdInput || !historyDeleteCountInput || !historyOutputDiv) return;

    const contextType = historyContextTypeSelect.value;
    const contextId = historyContextIdInput.value.trim();
    const countToDelete = parseInt(historyDeleteCountInput.value, 10);

    if (!contextId) {
        uiNotifications.showToast('请输入要删除对话历史的QQ号/群号', 2000, 'warning');
        return;
    }
    // No longer need regex check for number, as it's a select value
    if (isNaN(countToDelete) || countToDelete <= 0) {
        uiNotifications.showToast('请输入有效的删除条数（正整数）', 2000, 'warning');
        return;
    }
    const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除 ${contextType}:${contextId} 最旧的 ${countToDelete} 条对话历史吗？`, '删除', '取消', 'warning');
    if (!confirmed) return;

    try {
        const result = await apiService.deleteHistory(contextType, contextId, countToDelete);
        uiNotifications.showToast(result.message || '删除成功！');
        historyOutputDiv.innerHTML = `<p>${result.message || '删除成功！'} 请重新查询以查看最新历史。</p>`;
    } catch (error) {
        console.error('删除对话历史记录失败:', error);
        let errorData = { error: '删除对话历史记录时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`删除对话历史记录失败: ${errorData.error}`, 4000, 'error');
    }
}

export async function initChatHistoryManager() { // Make async to fetch lists
    historyFilterForm = document.getElementById('history-filter-form');
    historyContextTypeSelect = document.getElementById('history-context-type');
    historyContextIdInput = document.getElementById('history-context-id'); // Now a select
    historyLimitInput = document.getElementById('history-limit');
    historyDeleteCountInput = document.getElementById('history-delete-count');
    deleteHistoryBtn = document.getElementById('delete-history-btn');
    historyOutputDiv = document.getElementById('history-output');

    if (!historyFilterForm || !historyContextTypeSelect || !historyContextIdInput || !deleteHistoryBtn || !historyOutputDiv) { // Added checks
        console.error("One or more chat history manager DOM elements not found!");
        return;
    }

    // Fetch initial contact lists
    try {
        [cachedFriends, cachedGroups] = await Promise.all([
            apiService.getFriends(),
            apiService.getGroups()
        ]);
        // Populate the select based on the initial type
        populateChatHistoryContextIdSelect(historyContextTypeSelect.value);
    } catch (error) {
        console.error("Error fetching initial friends/groups list for Chat History:", error);
        uiNotifications.showToast("加载好友/群组列表失败 (对话历史)", 3000, "error");
        // Still populate with default state
        populateChatHistoryContextIdSelect(historyContextTypeSelect.value);
    }


    historyFilterForm.addEventListener('submit', handleHistoryFilterSubmit);
    deleteHistoryBtn.addEventListener('click', handleDeleteHistory);
    historyContextTypeSelect.addEventListener('change', (event) => {
        populateChatHistoryContextIdSelect(event.target.value);
    });


    // Set default values if needed (e.g., limit)
    if (historyLimitInput && !historyLimitInput.value) historyLimitInput.value = '10';
    if (historyDeleteCountInput && !historyDeleteCountInput.value) historyDeleteCountInput.value = '10';
}