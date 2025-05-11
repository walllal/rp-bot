import apiService from '../services/apiService.js'; // Changed to default import
import { showToast } from '../utils/uiNotifications.js'; // Changed showNotification to showToast
// import { getDialogElement, openModal, closeModal } from '../utils/domUtils.js'; // Assuming domUtils for modal handling - Removed as not used yet

// DOM Elements
let globalVariablesTableBody, createGlobalVarBtn, globalVarNameInput, globalVarValueInput;
let searchGlobalVarInput; // For search functionality

async function loadGlobalVariables(searchTerm = '') {
    if (!globalVariablesTableBody) return;
    globalVariablesTableBody.innerHTML = `<tr><td colspan="4" aria-busy="true">正在加载全局变量列表...</td></tr>`;
    try {
        // const params = searchTerm ? { search: searchTerm } : {}; // Old way
        // const variables = await apiService.get('/variables/global', params); // Old way
        const variables = await apiService.listGlobalVariables(searchTerm); // New way
        renderGlobalVariables(variables);
    } catch (error) {
        console.error('Error loading global variables:', error);
        globalVariablesTableBody.innerHTML = `<tr><td colspan="4">加载全局变量失败: ${error.message}</td></tr>`;
        showToast('加载全局变量失败', 2000, 'error');
    }
}

function renderGlobalVariables(variables) {
    if (!globalVariablesTableBody) return;
    globalVariablesTableBody.innerHTML = ''; // Clear existing rows
 
    if (!variables || variables.length === 0) {
        globalVariablesTableBody.innerHTML = `<tr><td colspan="4">没有找到全局变量。</td></tr>`;
        return;
    }
 
    variables.forEach(variable => {
        const row = globalVariablesTableBody.insertRow();
        // row.insertCell().textContent = variable.id; // ID column removed
        row.insertCell().textContent = variable.name;
        
        const valueCell = row.insertCell();
        const pre = document.createElement('pre');
        pre.textContent = variable.value;
        valueCell.appendChild(pre);
        
        row.insertCell().textContent = new Date(variable.updatedAt).toLocaleString();

        const actionsCell = row.insertCell();
        const editButton = document.createElement('button');
        editButton.textContent = '编辑';
        editButton.classList.add('btn-sm');
        editButton.onclick = () => openEditGlobalVariableModal(variable);
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
        deleteButton.classList.add('secondary', 'btn-sm');
        deleteButton.style.marginLeft = '0.5rem';
        deleteButton.onclick = () => confirmDeleteGlobalVariable(variable.name);

        actionsCell.appendChild(editButton);
        actionsCell.appendChild(deleteButton);
    });
}

async function handleCreateGlobalVariable() {
    const name = globalVarNameInput.value.trim();
    const value = globalVarValueInput.value; // Value can be empty or contain newlines

    if (!name) {
        showToast('变量名称不能为空', 2000, 'error'); // Changed to showToast
        return;
    }
    // Value can be an empty string, so no check for !value

    try {
        // await apiService.post('/variables/global', { name, value }); // Old way
        await apiService.createGlobalVariable({ name, value }); // New way
        showToast('全局变量创建成功', 2000, 'success');
        globalVarNameInput.value = '';
        globalVarValueInput.value = '';
        loadGlobalVariables(searchGlobalVarInput?.value || ''); // Reload list, considering current search
    } catch (error) {
        console.error('Error creating global variable:', error);
        showToast(`创建全局变量失败: ${error.message || error}`, 2000, 'error'); // Changed to showToast
    }
}

async function confirmDeleteGlobalVariable(variableName) {
    // Using SweetAlert2 for confirmation, assuming it's globally available via sweetalert2.all.min.js
    if (window.Swal) {
        const result = await window.Swal.fire({
            title: `确定要删除全局变量 "${variableName}"吗?`,
            text: "此操作无法撤销！",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '是的，删除它！',
            cancelButtonText: '取消',
            scrollbarPadding: false // Prevent SweetAlert2 from adding padding
        });

        if (result.isConfirmed) {
            deleteGlobalVariable(variableName);
        }
    } else { // Fallback to basic confirm
        if (confirm(`确定要删除全局变量 "${variableName}"吗?`)) {
            deleteGlobalVariable(variableName);
        }
    }
}

async function deleteGlobalVariable(variableName) {
    try {
        // await apiService.delete(`/variables/global/${variableName}`); // Old way
        await apiService.deleteGlobalVariable(variableName); // New way
        showToast(`全局变量 "${variableName}" 删除成功`, 2000, 'success');
        loadGlobalVariables(searchGlobalVarInput?.value || ''); // Reload list
    } catch (error) {
        console.error(`Error deleting global variable ${variableName}:`, error);
        showToast(`删除全局变量失败: ${error.message || error}`, 2000, 'error');
    }
}

// Placeholder for edit modal functionality
async function openEditGlobalVariableModal(variable) {
    if (!window.Swal) {
        console.error('SweetAlert2 is not available. Cannot open edit modal.');
        alert(`编辑功能需要 SweetAlert2。变量名: ${variable.name}, 当前值: ${variable.value}`);
        return;
    }

    const { value: newValue, isConfirmed } = await window.Swal.fire({
        title: '编辑全局变量',
        html: `
            <div>
                <label for="swal-input-name" style="display: block; text-align: left; margin-bottom: .5em;">变量名称 (只读)</label>
                <input id="swal-input-name" class="swal2-input" value="${variable.name}" readonly style="margin-bottom: 1em;">
            </div>
            <div>
                <label for="swal-input-value" style="display: block; text-align: left; margin-bottom: .5em;">变量值</label>
                <textarea id="swal-input-value" class="swal2-textarea" placeholder="输入变量值...">${variable.value}</textarea>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        preConfirm: () => {
            return document.getElementById('swal-input-value').value;
        },
        customClass: {
            // Optional: Add custom classes for styling if needed
            // container: 'your-custom-container',
            // popup: 'your-custom-popup',
        },
        scrollbarPadding: false // Prevent SweetAlert2 from adding padding
    });

    if (isConfirmed && newValue !== undefined) { // newValue can be an empty string
        try {
            await apiService.updateGlobalVariable(variable.name, { value: newValue });
            showToast('全局变量更新成功', 2000, 'success');
            loadGlobalVariables(searchGlobalVarInput?.value || ''); // Reload list
        } catch (error) {
            console.error(`Error updating global variable '${variable.name}':`, error);
            showToast(`更新全局变量失败: ${error.message || error}`, 3000, 'error');
        }
    }
}
 
 
export function initGlobalVariableManager() {
    globalVariablesTableBody = document.querySelector('#global-variables-table tbody');
    createGlobalVarBtn = document.getElementById('create-global-var-btn');
    globalVarNameInput = document.getElementById('global-var-name');
    globalVarValueInput = document.getElementById('global-var-value');
    searchGlobalVarInput = document.getElementById('search-global-var-name');

    if (createGlobalVarBtn) {
        createGlobalVarBtn.addEventListener('click', handleCreateGlobalVariable);
    } else {
        console.warn('Create Global Variable button not found.');
    }
    
    if (searchGlobalVarInput) {
        let debounceTimer;
        searchGlobalVarInput.addEventListener('input', (event) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadGlobalVariables(event.target.value.trim());
            }, 300); // Debounce search
        });
    }

    // Initial load
    loadGlobalVariables();
    // console.log('Global Variable Manager initialized.');
}