import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';

// 创建全局助手函数，帮助调试和配置
(function() {
    // 已知的QQ机器人ID列表，可以通过控制台添加
    window.knownBotIds = ['1153731426'];
    
    // 为开发者提供快速添加机器人ID的函数
    window.addBotId = function(id) {
        if (!window.knownBotIds.includes(id)) {
            window.knownBotIds.push(id);
            console.log(`已添加机器人ID: ${id}，当前列表:`, window.knownBotIds);
            return true;
        }
        console.log(`机器人ID ${id} 已存在，当前列表:`, window.knownBotIds);
        return false;
    };
    
    // 显示当前所有已知的机器人ID
    window.showBotIds = function() {
        console.log(`当前已知的机器人ID列表:`, window.knownBotIds);
        return window.knownBotIds;
    };
})();

// DOM Elements
let messageHistoryFilterForm, messageHistoryContextTypeSelect, messageHistoryContextIdInput, // Now a select
    messageHistoryLimitInput, messageHistoryDeleteCountInput, deleteMessageHistoryBtn, messageHistoryOutputDiv;

// Module-level variable to store the fetched bot ID
let currentBotId = null;

// Cached Data (Duplicated from chatHistoryManager - consider refactoring later)
let cachedFriends = [];
let cachedGroups = [];

// Update function signature to accept botId
function renderMessageHistory(history, botIdToUse) {
    if (!messageHistoryOutputDiv) return;
    messageHistoryOutputDiv.innerHTML = '';
    if (!Array.isArray(history) || history.length === 0) {
        messageHistoryOutputDiv.innerHTML = '<p>没有找到相关消息历史记录。</p>';
        return;
    }
    // Reverse the array so that the oldest messages are processed first
    // and appended first, resulting in newest messages at the bottom.
    history.reverse();
    history.forEach(item => {
        // Removed p declaration from here

        let messageContent = '';
        try {
            const rawMsg = item.rawMessage;
            const isAdvancedMode = typeof item.messageId === 'string' && item.messageId.includes('advanced');
            
            if (Array.isArray(rawMsg) && rawMsg.length > 0 && typeof rawMsg[0] === 'object') {
                // 提取原始消息内容
                let combinedMessage = '';
                
                for (const segment of rawMsg) {
                    if (segment.type === 'text' && segment.data && segment.data.text) {
                        combinedMessage += segment.data.text;
                    } else if (segment.type === 'image') {
                        // 使用格式 <image>URL</image>
                        combinedMessage += `<image>${segment.data.file}</image>`;
                    } else if (segment.type === 'at' && segment.data && segment.data.qq) {
                        combinedMessage += `<at>${segment.data.qq}</at>`;
                    } else if (segment.text) {
                        combinedMessage += segment.text;
                    } else {
                        combinedMessage += `[${segment.type || '未知类型'}]`;
                    }
                }
                
                if (!combinedMessage.trim()) {
                    combinedMessage = '[空消息]';
                }
                
                messageContent = combinedMessage;
            } else {
                messageContent = `[未知格式]: ${JSON.stringify(rawMsg)}`;
            }
        } catch (parseError) {
            console.error('解析 rawMessage 失败:', parseError, item.rawMessage);
            messageContent = '[解析 rawMessage 时出错]';
        }

        // Declare metadataParts once at the beginning of the loop iteration
        let metadataParts = [];

        // 判断是否是机器人消息（以下任一条件成立）
        const isBotReplyMessage = typeof item.messageId === 'string' && item.messageId.startsWith('bot_reply');
        const isBotAdvancedMessage = typeof item.messageId === 'string' && item.messageId.startsWith('bot_advanced_'); // Check for advanced preset messages
        // Use the passed botIdToUse for matching
        const isBotIdMatch = item.userId && botIdToUse && item.userId.toString() === botIdToUse.toString();
        const isAssistantId = item.userId === 'assistant';
        // Combine checks (removed hardcoded isKnownBotId)
        const isBotMessage = isBotReplyMessage || isBotAdvancedMessage || isBotIdMatch || isAssistantId;

        // 如果是机器人消息，则跳过渲染 (使用 return 退出当前回调)
        if (isBotMessage) {
            return;
        }

        // --- If it's not a bot message, proceed with rendering: ---

        // Create the parent p element for non-bot messages
        const p = document.createElement('p');
        p.classList.add('message-history-item');

        // Clear and populate metadataParts for non-bot messages
        metadataParts = []; // Clear any potential previous values (though unlikely needed here)
        metadataParts.push(`用户: ${domUtils.escapeHtml(item.userName || item.userId)}`);
        metadataParts.push(`发送者ID: ${item.userId}`);
        metadataParts.push(`时间: ${new Date(item.timestamp).toLocaleString()}`);

        // 创建元数据元素
        const metadataElement = document.createElement('small');
        metadataElement.textContent = metadataParts.join(' | ');
        p.appendChild(metadataElement);
        
        // 创建内容元素 - 使用p标签，与chatHistoryManager保持一致
        const contentElement = document.createElement('p');
        // 使用 escapeHtml 处理内容，防止潜在的 XSS，并确保标签按文本显示
        contentElement.innerHTML = domUtils.escapeHtml(messageContent);
        // 移除 message-history-item p 的默认 margin，因为父元素已有 margin
        contentElement.style.margin = '0';
        
        p.appendChild(contentElement);
        
        messageHistoryOutputDiv.appendChild(p);
    });
    messageHistoryOutputDiv.scrollTop = messageHistoryOutputDiv.scrollHeight;
}

function populateMessageHistoryContextIdSelect(type) {
    if (!messageHistoryContextIdInput) return;

    messageHistoryContextIdInput.innerHTML = ''; // Clear existing options
    messageHistoryContextIdInput.disabled = true; // Disable by default
    messageHistoryContextIdInput.required = false; // Not required by default

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;

    // Note: Message history uses uppercase types ('PRIVATE', 'GROUP')
    if (type === 'PRIVATE') {
        if (cachedFriends.length === 0) {
            placeholderOption.textContent = '--无可用好友--';
        } else {
            placeholderOption.textContent = '--请选择好友--';
            messageHistoryContextIdInput.disabled = false;
            messageHistoryContextIdInput.required = true;
            cachedFriends.forEach(friend => {
                const option = document.createElement('option');
                option.value = friend.userId;
                const displayName = friend.remark || friend.nickname;
                option.textContent = `${friend.userId} - ${displayName}`;
                messageHistoryContextIdInput.appendChild(option);
            });
        }
    } else if (type === 'GROUP') {
        if (cachedGroups.length === 0) {
            placeholderOption.textContent = '--无可用群组--';
        } else {
            placeholderOption.textContent = '--请选择群组--';
            messageHistoryContextIdInput.disabled = false;
            messageHistoryContextIdInput.required = true;
            cachedGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.groupId;
                option.textContent = `${group.groupId} - ${group.groupName}`;
                messageHistoryContextIdInput.appendChild(option);
            });
        }
    } else {
        placeholderOption.textContent = '--请先选择类型--';
    }

    messageHistoryContextIdInput.insertBefore(placeholderOption, messageHistoryContextIdInput.firstChild);
    messageHistoryContextIdInput.value = '';
}


async function handleMessageHistoryFilterSubmit(event) {
    event.preventDefault();
    if (!messageHistoryContextTypeSelect || !messageHistoryContextIdInput || !messageHistoryLimitInput || !messageHistoryOutputDiv) return;

    const contextType = messageHistoryContextTypeSelect.value;
    const contextId = messageHistoryContextIdInput.value.trim();
    const limit = messageHistoryLimitInput.value;

    if (!contextId) {
        uiNotifications.showToast('请输入上下文 ID', 2000, 'warning');
        return;
    }
    // No longer need regex check for number

    messageHistoryOutputDiv.innerHTML = '<p aria-busy="true">正在查询消息历史记录...</p>';
    try {
        const history = await apiService.getMessageHistory(contextType, contextId, limit);
        // Pass the stored currentBotId to the render function
        renderMessageHistory(history, currentBotId);
    } catch (error) {
        console.error('查询消息历史记录失败:', error);
        messageHistoryOutputDiv.innerHTML = '<p style="color: var(--pico-del-color);">查询消息历史记录失败</p>';
    }
}

async function handleDeleteMessageHistory() {
    if (!messageHistoryContextTypeSelect || !messageHistoryContextIdInput || !messageHistoryDeleteCountInput || !messageHistoryOutputDiv) return;

    const contextType = messageHistoryContextTypeSelect.value;
    const contextId = messageHistoryContextIdInput.value.trim();
    const countToDelete = parseInt(messageHistoryDeleteCountInput.value, 10);

    if (!contextId) {
        uiNotifications.showToast('请输入要删除消息历史的QQ号/群号', 2000, 'warning');
        return;
    }
    // No longer need regex check for number
    if (isNaN(countToDelete) || countToDelete <= 0) {
        uiNotifications.showToast('请输入有效的删除条数（正整数）', 2000, 'warning');
        return;
    }
    const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除 ${contextType}:${contextId} 最旧的 ${countToDelete} 条消息历史吗？`, '删除', '取消', 'warning');
    if (!confirmed) return;

    try {
        const result = await apiService.deleteMessageHistory(contextType, contextId, countToDelete);
        uiNotifications.showToast(result.message || '删除成功！');
        messageHistoryOutputDiv.innerHTML = `<p>${result.message || '删除成功！'} 请重新查询以查看最新历史。</p>`;
    } catch (error) {
        console.error('删除消息历史记录失败:', error);
        let errorData = { error: '删除消息历史记录时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`删除消息历史记录失败: ${errorData.error}`, 4000, 'error');
    }
}

export async function initMessageHistoryManager() { // Make async
    messageHistoryFilterForm = document.getElementById('message-history-filter-form');
    messageHistoryContextTypeSelect = document.getElementById('message-history-context-type');
    messageHistoryContextIdInput = document.getElementById('message-history-context-id'); // Now a select
    messageHistoryLimitInput = document.getElementById('message-history-limit');
    messageHistoryDeleteCountInput = document.getElementById('message-history-delete-count');
    deleteMessageHistoryBtn = document.getElementById('delete-message-history-btn');
    messageHistoryOutputDiv = document.getElementById('message-history-output');

    if (!messageHistoryFilterForm || !messageHistoryContextTypeSelect || !messageHistoryContextIdInput || !deleteMessageHistoryBtn || !messageHistoryOutputDiv) { // Added checks
        console.error("One or more message history manager DOM elements not found!");
        return;
    }

    // 尝试获取机器人ID
    try {
        const settings = await apiService.getSettings();
        if (settings && settings.botId) { // Changed onebotSelfId to botId
            // Store the fetched ID in the module-level variable
            currentBotId = settings.botId; // Changed onebotSelfId to botId
            console.log("Stored bot ID for message history:", currentBotId);
        } else {
            console.warn("Message History: botId not found in settings."); // Changed onebotSelfId to botId
        }
    } catch(error) {
        console.error("Error fetching bot ID for message history:", error);
    }

    // Fetch initial contact lists
    try {
        // Reuse cached data if already fetched by another module, or fetch again
        // For simplicity, fetch again here. Refactor later if needed.
        [cachedFriends, cachedGroups] = await Promise.all([
            apiService.getFriends(),
            apiService.getGroups()
        ]);
        // Populate the select based on the initial type
        populateMessageHistoryContextIdSelect(messageHistoryContextTypeSelect.value);
    } catch (error) {
        console.error("Error fetching initial friends/groups list for Message History:", error);
        uiNotifications.showToast("加载好友/群组列表失败 (消息历史)", 3000, "error");
        // Still populate with default state
        populateMessageHistoryContextIdSelect(messageHistoryContextTypeSelect.value);
    }

    messageHistoryFilterForm.addEventListener('submit', handleMessageHistoryFilterSubmit);
    deleteMessageHistoryBtn.addEventListener('click', handleDeleteMessageHistory);
    messageHistoryContextTypeSelect.addEventListener('change', (event) => {
        populateMessageHistoryContextIdSelect(event.target.value);
    });

    // Set default values if needed
    if (messageHistoryLimitInput && !messageHistoryLimitInput.value) messageHistoryLimitInput.value = '10';
    if (messageHistoryDeleteCountInput && !messageHistoryDeleteCountInput.value) messageHistoryDeleteCountInput.value = '10';
}