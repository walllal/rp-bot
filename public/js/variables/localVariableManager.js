import apiService from '../services/apiService.js'; // Changed to default import
import { showToast } from '../utils/uiNotifications.js'; // Changed showNotification to showToast
// Assuming domUtils for modal handling if needed for editing later
// import { getDialogElement, openModal, closeModal } from '../utils/domUtils.js';

// DOM Elements
let localVariablesTableBody, createLocalVarDefinitionBtn, filterLocalVarInstancesBtn,
    localVariableDefinitionsTableBody, // For the new definitions table
    localVarDefFilterNameInput;    // For filtering definitions by name
    // filterLocalVarDefinitionsBtn removed as button is removed from HTML

// localVarNameInput will be for definition name (creation)
// localVarDefaultValueInput will be for definition defaultValue (creation)
// Context inputs are for filtering instances
let localVarNameInput, localVarDefaultValueInput,
    localVarFilterDefNameInput,         // For filtering definitions by name
    localVarInstanceFilterDefNameInput, // For filtering instances by definition name
    localVarFilterContextTypeSelect, localVarFilterContextIdInput, localVarFilterUserIdInput;


// --- LocalVariableDefinition Functions ---

async function loadLocalVariableDefinitions(filters = {}) {
    if (!localVariableDefinitionsTableBody) return;
    localVariableDefinitionsTableBody.innerHTML = `<tr><td colspan="4" aria-busy="true">正在加载局部变量定义列表...</td></tr>`;
    try {
        const activeFilters = Object.fromEntries(
            Object.entries(filters).filter(([_, v]) => v != null && v !== '')
        );
        const definitions = await apiService.listLocalVariableDefinitions(activeFilters);
        renderLocalVariableDefinitions(definitions);
    } catch (error) {
        console.error('Error loading local variable definitions:', error);
        localVariableDefinitionsTableBody.innerHTML = `<tr><td colspan="4">加载局部变量定义失败: ${error.message}</td></tr>`;
        showToast('加载局部变量定义失败', 2000, 'error');
    }
}

function renderLocalVariableDefinitions(definitions) {
    if (!localVariableDefinitionsTableBody) return;
    localVariableDefinitionsTableBody.innerHTML = '';
 
    if (!definitions || definitions.length === 0) {
        localVariableDefinitionsTableBody.innerHTML = `<tr><td colspan="4">没有找到符合条件的局部变量定义。</td></tr>`;
        return;
    }
 
    definitions.forEach(definition => {
        const row = localVariableDefinitionsTableBody.insertRow();
        // row.insertCell().textContent = definition.id; // ID column removed
        row.insertCell().textContent = definition.name;
        
        const defaultValueCell = row.insertCell();
        const preDefaultValue = document.createElement('pre');
        preDefaultValue.textContent = definition.defaultValue;
        defaultValueCell.appendChild(preDefaultValue);
        
        row.insertCell().textContent = new Date(definition.updatedAt).toLocaleString();

        const actionsCell = row.insertCell();
        // Delete button for definitions will be added in the next step
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
        deleteButton.classList.add('secondary', 'btn-sm');
        deleteButton.onclick = () => confirmDeleteLocalVariableDefinition(definition.id, definition.name);
        actionsCell.appendChild(deleteButton);
    });
}

function handleFilterLocalVariableDefinitions() {
    if (!localVarDefFilterNameInput) {
        console.warn('Attempted to filter local definitions, but the filter input element is not available. Loading all definitions.');
        loadLocalVariableDefinitions(); // Load all if filter input is missing
        return;
    }
    const filters = {
        name: localVarDefFilterNameInput.value.trim(),
    };
    loadLocalVariableDefinitions(filters);
}


// --- LocalVariableInstance Functions ---
// Renamed function to reflect it loads instances
async function loadLocalVariableInstances(filters = {}) {
    if (!localVariablesTableBody) return;
    // Adjusted colspan for new table structure
    localVariablesTableBody.innerHTML = `<tr><td colspan="8" aria-busy="true">正在加载局部变量实例列表...</td></tr>`;
    try {
        const activeFilters = Object.fromEntries(
            Object.entries(filters).filter(([_, v]) => v != null && v !== '')
        );
        const instances = await apiService.listLocalVariableInstances(activeFilters);
        renderLocalVariableInstances(instances);
    } catch (error) {
        console.error('Error loading local variable instances:', error);
        localVariablesTableBody.innerHTML = `<tr><td colspan="8">加载局部变量实例失败: ${error.message}</td></tr>`;
        showToast('加载局部变量实例失败', 2000, 'error');
    }
}

// Renamed function and updated to render instances and their definitions
function renderLocalVariableInstances(instances) {
    if (!localVariablesTableBody) return;
    localVariablesTableBody.innerHTML = '';
 
    if (!instances || instances.length === 0) {
        localVariablesTableBody.innerHTML = `<tr><td colspan="8">没有找到符合条件的局部变量实例。</td></tr>`;
        return;
    }
 
    instances.forEach(instance => {
        const row = localVariablesTableBody.insertRow();
        // row.insertCell().textContent = instance.id; // Instance ID column removed
        row.insertCell().textContent = instance.definition?.name || 'N/A'; // Definition Name
        
        const instanceValueCell = row.insertCell();
        const preInstanceValue = document.createElement('pre');
        preInstanceValue.textContent = instance.value; // Instance Value
        instanceValueCell.appendChild(preInstanceValue);

        const defaultValueCell = row.insertCell();
        const preDefaultValue = document.createElement('pre');
        preDefaultValue.textContent = instance.definition?.defaultValue || 'N/A'; // Definition Default Value
        defaultValueCell.appendChild(preDefaultValue);

        row.insertCell().textContent = instance.contextType;
        row.insertCell().textContent = instance.contextId;
        row.insertCell().textContent = instance.userId;
        row.insertCell().textContent = new Date(instance.updatedAt).toLocaleString();

        const actionsCell = row.insertCell();
        const editButton = document.createElement('button');
        editButton.textContent = '编辑'; // Clarify editing instance value
        editButton.classList.add('btn-sm');
        // Pass the instance to the edit modal function
        editButton.onclick = () => openEditLocalVariableInstanceModal(instance);
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除'; // Clarify deleting instance
        deleteButton.classList.add('secondary', 'btn-sm');
        deleteButton.style.marginLeft = '0.5rem';
        // Pass instance ID and definition name for confirmation message
        deleteButton.onclick = () => confirmDeleteLocalVariableInstance(instance.id, instance.definition?.name || '未知变量');

        actionsCell.appendChild(editButton);
        actionsCell.appendChild(deleteButton);
    });
}

// Renamed and modified to handle LocalVariableDefinition creation
async function handleCreateLocalVariableDefinition() {
    const name = localVarNameInput.value.trim(); // This input is now for definition name
    const defaultValue = localVarDefaultValueInput.value; // This input is for definition's default value

    if (!name) return showToast('变量定义名称不能为空', 2000, 'error');
    // defaultValue can be an empty string

    try {
        await apiService.createLocalVariableDefinition({ name, defaultValue });
        showToast('局部变量定义创建成功', 2000, 'success');
        localVarNameInput.value = ''; // Clear definition name input
        localVarDefaultValueInput.value = ''; // Clear default value input
        loadLocalVariableDefinitions(); // Reload definitions list
        // Optionally, also reload instances if a new definition might immediately affect instance view
        // For now, only reloading definitions. Instances are reloaded by their own filter button.
        // handleFilterLocalVariableInstances();
    } catch (error) {
        console.error('Error creating local variable definition:', error);
        showToast(`创建局部变量定义失败: ${error.message || error}`, 2000, 'error');
    }
}

// Renamed to reflect filtering instances
function handleFilterLocalVariableInstances() {
    const filters = {
        definitionName: localVarInstanceFilterDefNameInput.value.trim(), // Use the new dedicated input for instance filtering
        contextType: localVarFilterContextTypeSelect.value,
        contextId: localVarFilterContextIdInput.value.trim(),
        userId: localVarFilterUserIdInput.value.trim(),
        // value: localVarValueInput.value.trim() // If we want to filter by instance value
    };
    loadLocalVariableInstances(filters);
}

// Renamed and updated for instance deletion
async function confirmDeleteLocalVariableInstance(instanceId, definitionName) {
    if (window.Swal) {
        const result = await window.Swal.fire({
            title: `确定要删除变量实例 "${definitionName}" (ID: ${instanceId}) 吗?`,
            text: "此操作无法撤销！这将删除此特定上下文中的变量实例。",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '是的，删除它！',
            cancelButtonText: '取消'
        });

        if (result.isConfirmed) {
            deleteLocalVariableInstance(instanceId);
        }
    } else {
        if (confirm(`确定要删除变量实例 "${definitionName}" (ID: ${instanceId}) 吗?`)) {
            deleteLocalVariableInstance(instanceId);
        }
    }
}

// Renamed and updated for instance deletion
async function deleteLocalVariableInstance(instanceId) {
    try {
        // Assuming apiService will have deleteLocalVariableInstance
        await apiService.deleteLocalVariableInstance(instanceId); // This service method needs to be added to apiService.js
        showToast(`局部变量实例 (ID: ${instanceId}) 删除成功`, 2000, 'success');
        handleFilterLocalVariableInstances(); // Reload list with current filters
    } catch (error) {
        console.error(`Error deleting local variable instance ${instanceId}:`, error);
        showToast(`删除局部变量实例失败: ${error.message || error}`, 2000, 'error');
    }
}

// Renamed to reflect editing an instance, or potentially its definition
// For now, this is a placeholder for editing the INSTANCE's value.
async function openEditLocalVariableInstanceModal(instance) {
    if (!window.Swal) {
        console.error('SweetAlert2 is not available. Cannot open edit modal for local variable instance.');
        alert(`编辑实例功能需要 SweetAlert2。定义名: ${instance.definition?.name}, 实例值: ${instance.value}`);
        return;
    }

    const { value: newValue, isConfirmed } = await window.Swal.fire({
        title: '编辑局部变量实例值',
        html: `
            <p><strong>定义名称:</strong> ${instance.definition?.name || 'N/A'}</p>
            <p><strong>作用域:</strong> ${instance.contextType} / ${instance.contextId} / ${instance.userId}</p>
            <label for="swal-input-instance-value" style="display: block; text-align: left; margin-top: 1em; margin-bottom: .5em;">实例值</label>
            <textarea id="swal-input-instance-value" class="swal2-textarea" placeholder="输入实例值...">${instance.value}</textarea>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        preConfirm: () => {
            return document.getElementById('swal-input-instance-value').value;
        },
        customClass: {
            // popup: 'your-custom-popup-class-for-local-var-instance', // Optional custom styling
        },
        scrollbarPadding: false
    });

    if (isConfirmed && newValue !== undefined) { // newValue can be an empty string
        try {
            await apiService.updateLocalVariableInstance(instance.id, { value: newValue });
            showToast('局部变量实例更新成功', 2000, 'success');
            // Reload the instances list, preferably with current filters
            // Assuming handleFilterLocalVariableInstances() reloads with current filters.
            // If not, might need to call loadLocalVariableInstances() with stored filters.
            handleFilterLocalVariableInstances();
        } catch (error) {
            console.error(`Error updating local variable instance ID '${instance.id}':`, error);
            showToast(`更新局部变量实例失败: ${error.message || error}`, 3000, 'error');
        }
    }
}
 
// --- Functions for Deleting LocalVariableDefinition ---
async function confirmDeleteLocalVariableDefinition(definitionId, definitionName) {
    if (window.Swal) {
        const result = await window.Swal.fire({
            title: `确定要删除局部变量定义 "${definitionName}" (ID: ${definitionId}) 吗?`,
            text: "此操作无法撤销！所有使用此定义的实例也将被删除。",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: '是的，删除它！',
            cancelButtonText: '取消',
            scrollbarPadding: false // Prevent SweetAlert2 from adding padding
        });

        if (result.isConfirmed) {
            deleteLocalVariableDefinition(definitionId);
        }
    } else {
        if (confirm(`确定要删除局部变量定义 "${definitionName}" (ID: ${definitionId}) 吗? 这将删除所有关联的实例。`)) {
            deleteLocalVariableDefinition(definitionId);
        }
    }
}

async function deleteLocalVariableDefinition(definitionId) {
    try {
        await apiService.deleteLocalVariableDefinition(definitionId);
        showToast(`局部变量定义 (ID: ${definitionId}) 删除成功`, 2000, 'success');
        loadLocalVariableDefinitions(); // Reload definitions list
        loadLocalVariableInstances(); // Reload instances list as they might have been cascade deleted
    } catch (error) {
        console.error(`Error deleting local variable definition ${definitionId}:`, error);
        showToast(`删除局部变量定义失败: ${error.message || error}`, 2000, 'error');
    }
}


export function initLocalVariableManager() {
    const localVariablesTabContent = document.getElementById('tab-content-local-variables');
    if (!localVariablesTabContent) {
        console.error('CRITICAL: Local variables tab content (tab-content-local-variables) not found! Cannot initialize local variable manager.');
        return;
    }

    // Get elements within the localVariablesTabContent
    localVariableDefinitionsTableBody = localVariablesTabContent.querySelector('#local-variable-definitions-table tbody');
    localVarDefFilterNameInput = localVariablesTabContent.querySelector('#local-var-def-filter-name'); // Changed to querySelector for consistency

    localVariablesTableBody = localVariablesTabContent.querySelector('#local-variables-table tbody');
    createLocalVarDefinitionBtn = localVariablesTabContent.querySelector('#create-local-var-definition-btn');
    filterLocalVarInstancesBtn = localVariablesTabContent.querySelector('#filter-local-var-instances-btn');

    localVarNameInput = localVariablesTabContent.querySelector('#local-var-def-name');
    localVarDefaultValueInput = localVariablesTabContent.querySelector('#local-var-def-value');
    
    // Note: localVarFilterDefNameInput is already fetched above for definitions filter.
    // If it were a different element for instance filtering, it would be fetched here.
    // For now, we assume the same input might be intended if IDs were different, or it's correctly shared.
    // However, the ID 'local-var-def-filter-name' is for the definition filter.
    // The instance filter for definition name uses 'local-var-instance-filter-def-name'.
    localVarInstanceFilterDefNameInput = localVariablesTabContent.querySelector('#local-var-instance-filter-def-name');
    localVarFilterContextTypeSelect = localVariablesTabContent.querySelector('#local-var-filter-context-type');
    localVarFilterContextIdInput = localVariablesTabContent.querySelector('#local-var-filter-context-id');
    localVarFilterUserIdInput = localVariablesTabContent.querySelector('#local-var-filter-user-id');

    // Check if critical elements for definitions were found
    if (!localVariableDefinitionsTableBody) {
        console.error('CRITICAL: Local Variable Definitions table body (#local-variable-definitions-table tbody) not found within its tab. Cannot initialize definitions list.');
        // No return here, as instance manager might still work, but definitions won't load.
    }
    if (!localVarDefFilterNameInput) {
         // This warning is now more contextual if the main tab content was found.
        console.warn('Local Variable Definition filter input (#local-var-def-filter-name) not found within its tab. Search on input will not work.');
    }

    if (createLocalVarDefinitionBtn) {
        createLocalVarDefinitionBtn.addEventListener('click', handleCreateLocalVariableDefinition);
    } else {
        console.warn('Create Local Variable Definition button not found. Check ID "create-local-var-definition-btn".');
    }
// Add input event listener to the definition filter input (localVarDefFilterNameInput)
    if (localVarDefFilterNameInput) {
        localVarDefFilterNameInput.addEventListener('input', handleFilterLocalVariableDefinitions);
    } else {
        // The warning for localVarDefFilterNameInput not being found is already logged when it's (not) assigned.
        // console.warn('Local Variable Definition filter input not found. Check ID "local-var-def-filter-name". Input event listener not added.');
    }

    if (filterLocalVarInstancesBtn) {
        filterLocalVarInstancesBtn.addEventListener('click', handleFilterLocalVariableInstances);
    } else {
        console.warn('Filter Local Variable Instances button not found. Check ID "filter-local-var-instances-btn".');
    }
    
    // Initial loads
    if (localVariableDefinitionsTableBody) { // Only load if table body exists
        loadLocalVariableDefinitions();
    } else {
        console.error('CRITICAL: Local Variable Definitions table body not found. Cannot load definitions.');
    }
    loadLocalVariableInstances();
    // console.log('Local Variable Manager initialized for Definitions and Instances.');
}