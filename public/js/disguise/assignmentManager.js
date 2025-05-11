import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';
// Import function to update preset dropdown options when assignments are loaded/changed
// Note: presetManager should call this initially when presets are loaded.
// This module might call it again if needed, or rely on presetManager.
// Import function from the DISGUISE preset manager
import { updateDisguiseAssignmentPresetOptions } from './presetManager.js';

// DOM Elements (with disguise prefix)
let disguiseAssignmentsTableBody, disguiseAssignmentForm, disguiseAssignmentTypeSelect, disguiseAssignmentContextIdInput, disguiseDeleteAssignmentBtn, disguiseAssignmentPresetSelect;

// Cached Data
let cachedFriends = [];
let cachedGroups = [];

function renderDisguiseAssignmentsTable(assignments) { // Renamed function
    if (!disguiseAssignmentsTableBody) return;
    disguiseAssignmentsTableBody.innerHTML = ''; // Clear previous content

    if (!Array.isArray(assignments) || assignments.length === 0) {
        disguiseAssignmentsTableBody.innerHTML = '<tr><td colspan="4">暂无伪装分配数据</td></tr>'; // Updated text
        return;
    }

    assignments.forEach(assignment => {
        const typeText = {
            'GLOBAL': '全局',
            'PRIVATE': '私聊',
            'GROUP': '群聊'
        }[assignment.assignmentType] || assignment.assignmentType;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${typeText}</td>
            <td>${assignment.contextId || '默认'}</td>
            <td>${domUtils.escapeHtml(assignment.preset?.name || '未知伪装')}</td> <!-- Updated text -->
            <td>
                <button class="custom-btn delete-btn disguise-delete-assignment-table-btn" data-action="delete" data-type="${assignment.assignmentType}" data-context-id="${assignment.contextId || ''}">删除</button>
            </td>
        `;
        disguiseAssignmentsTableBody.appendChild(tr);
    });
}

export async function loadDisguiseAssignments() { // Renamed function
    if (!disguiseAssignmentsTableBody) return;
    try {
        domUtils.setLoading(disguiseAssignmentsTableBody, true, 4);
        const assignments = await apiService.getDisguiseAssignments(); // Use new API method
        renderDisguiseAssignmentsTable(assignments); // Use renamed render function
        // Ensure DISGUISE preset options are up-to-date
        updateDisguiseAssignmentPresetOptions(); // Use renamed import
    } catch (error) {
        console.error('加载伪装分配列表失败:', error); // Updated text
        domUtils.showError(disguiseAssignmentsTableBody, '加载伪装分配列表失败', 4); // Updated text
    } finally {
        domUtils.setLoading(disguiseAssignmentsTableBody, false, 4);
    }
}

// Renamed function
function populateDisguiseContextIdSelect(type) {
    if (!disguiseAssignmentContextIdInput) return;

    disguiseAssignmentContextIdInput.innerHTML = ''; // Clear existing options
    disguiseAssignmentContextIdInput.disabled = true; // Disable by default

    if (type === 'GLOBAL') {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '--全局无需指定--';
        option.disabled = true;
        disguiseAssignmentContextIdInput.appendChild(option);
        disguiseAssignmentContextIdInput.value = ''; // Ensure value is cleared
    } else if (type === 'PRIVATE') {
        if (cachedFriends.length === 0) {
             const option = document.createElement('option');
             option.value = '';
             option.textContent = '--无可用好友--';
             option.disabled = true;
             disguiseAssignmentContextIdInput.appendChild(option);
        } else {
            disguiseAssignmentContextIdInput.disabled = false;
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '--请选择好友--';
            defaultOption.selected = true;
             defaultOption.disabled = true; // Make placeholder unselectable
            disguiseAssignmentContextIdInput.appendChild(defaultOption);

            cachedFriends.forEach(friend => {
                const option = document.createElement('option');
                option.value = friend.userId;
                // Prioritize remark, then nickname for display name
                const displayName = friend.remark || friend.nickname;
                option.textContent = `${friend.userId} - ${displayName}`;
                disguiseAssignmentContextIdInput.appendChild(option);
            });
        }
         disguiseAssignmentContextIdInput.required = true; // Make selection required
    } else if (type === 'GROUP') {
         if (cachedGroups.length === 0) {
             const option = document.createElement('option');
             option.value = '';
             option.textContent = '--无可用群组--';
             option.disabled = true;
             disguiseAssignmentContextIdInput.appendChild(option);
         } else {
            disguiseAssignmentContextIdInput.disabled = false;
             const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '--请选择群组--';
            defaultOption.selected = true;
             defaultOption.disabled = true; // Make placeholder unselectable
            disguiseAssignmentContextIdInput.appendChild(defaultOption);

            cachedGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.groupId;
                option.textContent = `${group.groupId} - ${group.groupName}`;
                disguiseAssignmentContextIdInput.appendChild(option);
            });
         }
         disguiseAssignmentContextIdInput.required = true; // Make selection required
    } else {
         // Handle unexpected type? Add a disabled default.
         const option = document.createElement('option');
         option.value = '';
         option.textContent = '--请先选择类型--';
         option.disabled = true;
         disguiseAssignmentContextIdInput.appendChild(option);
         disguiseAssignmentContextIdInput.required = false; // Not required if type is invalid/default
    }
}


function handleDisguiseAssignmentTypeChange(event) { // Renamed function
    populateDisguiseContextIdSelect(event.target.value); // Use renamed populate function
}

async function handleDisguiseAssignmentFormSubmit(event) { // Renamed function
    event.preventDefault();
    // Use disguise element variables
    if (!disguiseAssignmentTypeSelect || !disguiseAssignmentContextIdInput || !disguiseAssignmentPresetSelect) {
        console.error("Disguise assignment form submit handler missing required elements.");
        return;
    }

    const assignmentType = disguiseAssignmentTypeSelect.value;
    // const rawContextId = disguiseAssignmentContextIdInput.value.trim(); // No longer needed with select
    const presetId = parseInt(disguiseAssignmentPresetSelect.value, 10);

    if (!presetId) {
        uiNotifications.showToast('请选择一个伪装', 2000, 'warning'); // Updated text
        return;
    }
    let contextId = disguiseAssignmentContextIdInput.value; // Get value from select

    // Validate selection for PRIVATE/GROUP
    if ((assignmentType === 'PRIVATE' || assignmentType === 'GROUP') && !contextId) {
         uiNotifications.showToast('请为私聊或群聊分配选择一个具体的 QQ号/群号', 2000, 'warning'); // Keep text generic
         return;
    }
    // If type is GLOBAL, contextId should be null for the API call
    if (assignmentType === 'GLOBAL') {
        contextId = null;
    }
    const data = { assignmentType, contextId, presetId };
    try {
        await apiService.upsertDisguiseAssignment(data); // Use new API method
        uiNotifications.showToast('伪装分配设置成功！'); // Updated text
        loadDisguiseAssignments(); // Reload the table using renamed function
        if (disguiseAssignmentForm) disguiseAssignmentForm.reset(); // Reset the form
        // Re-populate select after reset to show placeholder
        populateDisguiseContextIdSelect(disguiseAssignmentTypeSelect.value);
    } catch (error) {
        console.error('设置伪装分配失败:', error); // Updated text
        let errorData = { error: '设置分配时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`设置伪装分配失败: ${errorData.error}`, 4000, 'error'); // Updated text
    }
}

async function handleDeleteDisguiseAssignmentFromForm() { // Renamed function
    // Use disguise element variables
    if (!disguiseAssignmentTypeSelect || !disguiseAssignmentContextIdInput) return;
    const assignmentType = disguiseAssignmentTypeSelect.value;
    // const rawContextId = disguiseAssignmentContextIdInput.value.trim(); // No longer needed
    let contextId = disguiseAssignmentContextIdInput.value; // Get value from select

    // Validate selection for PRIVATE/GROUP
    if ((assignmentType === 'PRIVATE' || assignmentType === 'GROUP') && !contextId) {
         uiNotifications.showToast('请选择要删除分配的具体 QQ号/群号', 2000, 'warning'); // Keep text generic
         return;
    }
     // If type is GLOBAL, contextId should be null for the API call
    if (assignmentType === 'GLOBAL') {
        contextId = null;
    }
    // Map internal type names to Chinese for confirmation dialog
    const typeDisplayMap = { 'GLOBAL': '全局默认', 'PRIVATE': '私聊', 'GROUP': '群组' };
    const typeDisplayText = typeDisplayMap[assignmentType] || assignmentType; // Fallback to original if not found
    const confirmationTargetText = assignmentType === 'GLOBAL' ? typeDisplayText : `${typeDisplayText} ${contextId}`;
    const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除 ${confirmationTargetText} 的伪装分配吗？`, '删除', '取消', 'warning'); // Updated text
    if (!confirmed) return;

    const data = { assignmentType, contextId };
    try {
        await apiService.deleteDisguiseAssignment(data); // Use new API method
        uiNotifications.showToast('伪装分配删除成功！'); // Updated text
        loadDisguiseAssignments(); // Reload the table
        if (disguiseAssignmentForm) disguiseAssignmentForm.reset();
         // Re-populate select after reset to show placeholder
        populateDisguiseContextIdSelect(disguiseAssignmentTypeSelect.value);
    } catch (error) {
        console.error('删除伪装分配失败:', error); // Updated text
        let errorData = { error: '删除分配时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`删除伪装分配失败: ${errorData.error}`, 4000, 'error'); // Updated text
    }
}

async function handleDeleteDisguiseAssignmentFromTable(event) { // Renamed function
    // Use a more specific selector if needed, e.g., event.target.matches('.disguise-delete-assignment-table-btn')
    if (!event.target.matches('.disguise-delete-assignment-table-btn')) return;

    const button = event.target;
    const assignmentType = button.dataset.type;
    const contextId = button.dataset.contextId === '' ? null : button.dataset.contextId;
    // Map internal type names to Chinese for confirmation dialog
    const typeDisplayMap = { 'GLOBAL': '全局默认', 'PRIVATE': '私聊', 'GROUP': '群组' };
    const typeDisplayText = typeDisplayMap[assignmentType] || assignmentType; // Fallback to original if not found
    const confirmationTargetText = assignmentType === 'GLOBAL' ? typeDisplayText : `${typeDisplayText} ${contextId}`;
    const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除 ${confirmationTargetText} 的伪装分配吗？`, '删除', '取消', 'warning'); // Updated text
    if (!confirmed) return;

    const data = { assignmentType, contextId };
    try {
        await apiService.deleteDisguiseAssignment(data); // Use new API method
        uiNotifications.showToast('伪装分配删除成功！'); // Updated text
        loadDisguiseAssignments(); // Reload the table
    } catch (error) {
        console.error('删除伪装分配失败:', error); // Updated text
        let errorData = { error: '删除分配时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`删除伪装分配失败: ${errorData.error}`, 4000, 'error'); // Updated text
    }
}

export async function initDisguiseAssignmentManager() { // Renamed export function
    // Select elements with disguise prefix
    disguiseAssignmentsTableBody = document.querySelector('#disguise-assignments-table tbody');
    disguiseAssignmentForm = document.getElementById('disguise-assignment-form');
    disguiseAssignmentTypeSelect = document.getElementById('disguise-assignment-type');
    disguiseAssignmentContextIdInput = document.getElementById('disguise-assignment-context-id');
    disguiseDeleteAssignmentBtn = document.getElementById('disguise-delete-assignment-btn');
    disguiseAssignmentPresetSelect = document.getElementById('disguise-assignment-preset-id');

    if (!disguiseAssignmentsTableBody || !disguiseAssignmentForm || !disguiseAssignmentTypeSelect || !disguiseAssignmentContextIdInput || !disguiseDeleteAssignmentBtn || !disguiseAssignmentPresetSelect) {
        console.error("One or more disguise assignment manager DOM elements not found!");
        return;
    }

    // Add event listeners to disguise elements
    disguiseAssignmentTypeSelect.addEventListener('change', handleDisguiseAssignmentTypeChange);
    disguiseAssignmentForm.addEventListener('submit', handleDisguiseAssignmentFormSubmit);
    disguiseDeleteAssignmentBtn.addEventListener('click', handleDeleteDisguiseAssignmentFromForm);
    disguiseAssignmentsTableBody.addEventListener('click', handleDeleteDisguiseAssignmentFromTable);

    // Initial state setup for the disguise select dropdown
    populateDisguiseContextIdSelect(disguiseAssignmentTypeSelect.value);

    // Fetch initial data (assignments, friends, groups)
    try {
        // Fetch friends and groups in parallel
        const [friends, groups] = await Promise.all([
            apiService.getFriends(),
            apiService.getGroups()
        ]);
        cachedFriends = friends || [];
        cachedGroups = groups || [];

        // Now load disguise assignments
        await loadDisguiseAssignments(); // Load initial disguise assignments

        // Populate the context ID select based on the initial type AFTER fetching friends/groups
        populateDisguiseContextIdSelect(disguiseAssignmentTypeSelect.value);

    } catch (error) {
        console.error("Error fetching initial friends/groups list for Disguise:", error); // Updated log
        uiNotifications.showToast("加载好友/群组列表失败 (伪装)", 3000, "error"); // Updated text
        // Still try to load disguise assignments even if contact lists fail
        await loadDisguiseAssignments();
    }
}