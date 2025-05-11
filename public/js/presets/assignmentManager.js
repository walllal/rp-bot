import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';
// Import function to update preset dropdown options when assignments are loaded/changed
// Note: presetManager should call this initially when presets are loaded.
// This module might call it again if needed, or rely on presetManager.
import { updateAssignmentPresetOptions } from './presetManager.js';

// DOM Elements
let assignmentsTableBody, assignmentForm, assignmentTypeSelect, assignmentContextIdInput, deleteAssignmentBtn, assignmentPresetSelect;

// Cached Data
let cachedFriends = [];
let cachedGroups = [];

function renderAssignmentsTable(assignments) {
    if (!assignmentsTableBody) return;
    assignmentsTableBody.innerHTML = ''; // Clear previous content

    if (!Array.isArray(assignments) || assignments.length === 0) {
        assignmentsTableBody.innerHTML = '<tr><td colspan="4">暂无分配数据</td></tr>';
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
            <td>${domUtils.escapeHtml(assignment.preset?.name || '未知预设')}</td>
            <td>
                <button class="custom-btn delete-btn" data-action="delete" data-type="${assignment.assignmentType}" data-context-id="${assignment.contextId || ''}">删除</button>
            </td>
        `;
        assignmentsTableBody.appendChild(tr);
    });
}

export async function loadAssignments() {
    if (!assignmentsTableBody) return;
    try {
        domUtils.setLoading(assignmentsTableBody, true, 4);
        const assignments = await apiService.getAssignments();
        renderAssignmentsTable(assignments);
        // Ensure preset options are up-to-date after loading assignments,
        // in case a preset was deleted but an assignment still references it.
        updateAssignmentPresetOptions();
    } catch (error) {
        console.error('加载分配列表失败:', error);
        domUtils.showError(assignmentsTableBody, '加载分配列表失败', 4);
    } finally {
        domUtils.setLoading(assignmentsTableBody, false, 4);
    }
}

function populateContextIdSelect(type) {
    if (!assignmentContextIdInput) return;

    assignmentContextIdInput.innerHTML = ''; // Clear existing options
    assignmentContextIdInput.disabled = true; // Disable by default

    if (type === 'GLOBAL') {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '--全局无需指定--';
        option.disabled = true;
        assignmentContextIdInput.appendChild(option);
        assignmentContextIdInput.value = ''; // Ensure value is cleared
    } else if (type === 'PRIVATE') {
        if (cachedFriends.length === 0) {
             const option = document.createElement('option');
             option.value = '';
             option.textContent = '--无可用好友--';
             option.disabled = true;
             assignmentContextIdInput.appendChild(option);
        } else {
            assignmentContextIdInput.disabled = false;
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '--请选择好友--';
            defaultOption.selected = true;
             defaultOption.disabled = true; // Make placeholder unselectable
            assignmentContextIdInput.appendChild(defaultOption);

            cachedFriends.forEach(friend => {
                const option = document.createElement('option');
                option.value = friend.userId;
                // Prioritize remark, then nickname for display name
                const displayName = friend.remark || friend.nickname;
                option.textContent = `${friend.userId} - ${displayName}`;
                assignmentContextIdInput.appendChild(option);
            });
        }
         assignmentContextIdInput.required = true; // Make selection required
    } else if (type === 'GROUP') {
         if (cachedGroups.length === 0) {
             const option = document.createElement('option');
             option.value = '';
             option.textContent = '--无可用群组--';
             option.disabled = true;
             assignmentContextIdInput.appendChild(option);
         } else {
            assignmentContextIdInput.disabled = false;
             const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '--请选择群组--';
            defaultOption.selected = true;
             defaultOption.disabled = true; // Make placeholder unselectable
            assignmentContextIdInput.appendChild(defaultOption);

            cachedGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.groupId;
                option.textContent = `${group.groupId} - ${group.groupName}`;
                assignmentContextIdInput.appendChild(option);
            });
         }
         assignmentContextIdInput.required = true; // Make selection required
    } else {
         // Handle unexpected type? Add a disabled default.
         const option = document.createElement('option');
         option.value = '';
         option.textContent = '--请先选择类型--';
         option.disabled = true;
         assignmentContextIdInput.appendChild(option);
         assignmentContextIdInput.required = false; // Not required if type is invalid/default
    }
}


function handleAssignmentTypeChange(event) {
    populateContextIdSelect(event.target.value);
}

async function handleAssignmentFormSubmit(event) {
    event.preventDefault();
    // assignmentPresetSelect is needed here, ensure it's selected in init
    if (!assignmentTypeSelect || !assignmentContextIdInput || !assignmentPresetSelect) {
        console.error("Assignment form submit handler missing required elements (type, contextId, or presetSelect).");
        return;
    }

    const assignmentType = assignmentTypeSelect.value;
    const rawContextId = assignmentContextIdInput.value.trim();
    const presetId = parseInt(assignmentPresetSelect.value, 10);

    if (!presetId) {
        uiNotifications.showToast('请选择一个预设', 2000, 'warning');
        return;
    }
    let contextId = assignmentContextIdInput.value; // Get value from select

    // Validate selection for PRIVATE/GROUP
    if ((assignmentType === 'PRIVATE' || assignmentType === 'GROUP') && !contextId) {
         uiNotifications.showToast('请为私聊或群聊分配选择一个具体的 QQ号/群号', 2000, 'warning');
         return;
    }
    // If type is GLOBAL, contextId should be null for the API call
    if (assignmentType === 'GLOBAL') {
        contextId = null;
    }
    const data = { assignmentType, contextId, presetId };
    try {
        await apiService.updateAssignment(data);
        uiNotifications.showToast('分配设置成功！');
        loadAssignments(); // Reload the table
        if (assignmentForm) assignmentForm.reset(); // Reset the form
        if (assignmentContextIdInput) assignmentContextIdInput.disabled = assignmentTypeSelect.value === 'GLOBAL'; // Reset disabled state
    } catch (error) {
        console.error('设置分配失败:', error);
        let errorData = { error: '设置分配时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`设置分配失败: ${errorData.error}`, 4000, 'error');
    }
}

async function handleDeleteAssignmentFromForm() {
    if (!assignmentTypeSelect || !assignmentContextIdInput) return;
    const assignmentType = assignmentTypeSelect.value;
    const rawContextId = assignmentContextIdInput.value.trim();
    let contextId = assignmentContextIdInput.value; // Get value from select

    // Validate selection for PRIVATE/GROUP
    if ((assignmentType === 'PRIVATE' || assignmentType === 'GROUP') && !contextId) {
         uiNotifications.showToast('请选择要删除分配的具体 QQ号/群号', 2000, 'warning');
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
    const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除 ${confirmationTargetText} 的预设分配吗？`, '删除', '取消', 'warning');
    if (!confirmed) return;

    const data = { assignmentType, contextId };
    try {
        await apiService.deleteAssignment(data);
        uiNotifications.showToast('分配删除成功！');
        loadAssignments(); // Reload the table
        if (assignmentForm) assignmentForm.reset();
        if (assignmentContextIdInput) assignmentContextIdInput.disabled = assignmentTypeSelect.value === 'GLOBAL';
    } catch (error) {
        console.error('删除分配失败:', error);
        let errorData = { error: '删除分配时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`删除分配失败: ${errorData.error}`, 4000, 'error');
    }
}

async function handleDeleteAssignmentFromTable(event) {
    if (!event.target.matches('button[data-action="delete"]')) return;

    const button = event.target;
    const assignmentType = button.dataset.type;
    const contextId = button.dataset.contextId === '' ? null : button.dataset.contextId;
    // Map internal type names to Chinese for confirmation dialog
    const typeDisplayMap = { 'GLOBAL': '全局默认', 'PRIVATE': '私聊', 'GROUP': '群组' };
    const typeDisplayText = typeDisplayMap[assignmentType] || assignmentType; // Fallback to original if not found
    const confirmationTargetText = assignmentType === 'GLOBAL' ? typeDisplayText : `${typeDisplayText} ${contextId}`;
    const confirmed = await uiNotifications.showConfirm('删除确认', `确定要删除 ${confirmationTargetText} 的预设分配吗？`, '删除', '取消', 'warning');
    if (!confirmed) return;

    const data = { assignmentType, contextId };
    try {
        await apiService.deleteAssignment(data);
        uiNotifications.showToast('分配删除成功！');
        loadAssignments(); // Reload the table
    } catch (error) {
        console.error('删除分配失败:', error);
        let errorData = { error: '删除分配时发生未知错误' };
        if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`删除分配失败: ${errorData.error}`, 4000, 'error');
    }
}

export async function initAssignmentManager() {
    assignmentsTableBody = document.querySelector('#assignments-table tbody');
    assignmentForm = document.getElementById('assignment-form');
    assignmentTypeSelect = document.getElementById('assignment-type');
    assignmentContextIdInput = document.getElementById('assignment-context-id');
    deleteAssignmentBtn = document.getElementById('delete-assignment-btn');
    assignmentPresetSelect = document.getElementById('assignment-preset-id'); // Select the preset dropdown

    if (!assignmentsTableBody || !assignmentForm || !assignmentTypeSelect || !assignmentContextIdInput || !deleteAssignmentBtn || !assignmentPresetSelect) { // Added check for assignmentPresetSelect
        console.error("One or more assignment manager DOM elements not found!");
        return;
    }

    assignmentTypeSelect.addEventListener('change', handleAssignmentTypeChange);
    assignmentForm.addEventListener('submit', handleAssignmentFormSubmit);
    deleteAssignmentBtn.addEventListener('click', handleDeleteAssignmentFromForm); // Keep this for form-based deletion
    assignmentsTableBody.addEventListener('click', handleDeleteAssignmentFromTable);

    // Initial state setup for the select dropdown
    populateContextIdSelect(assignmentTypeSelect.value);

    // Fetch initial data (assignments, friends, groups)
    try {
        // Fetch friends and groups in parallel
        const [friends, groups] = await Promise.all([
            apiService.getFriends(),
            apiService.getGroups()
        ]);
        cachedFriends = friends || [];
        cachedGroups = groups || [];

        // Now load assignments (which might depend on preset options being ready)
        await loadAssignments(); // Load initial assignments

        // Populate the context ID select based on the initial type AFTER fetching friends/groups
        populateContextIdSelect(assignmentTypeSelect.value);

    } catch (error) {
        console.error("Error fetching initial friends/groups list:", error);
        uiNotifications.showToast("加载好友/群组列表失败", 3000, "error");
        // Still try to load assignments even if contact lists fail
        await loadAssignments();
    }
}