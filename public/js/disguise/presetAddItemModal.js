import * as domUtils from '../utils/domUtils.js';
import * as uiNotifications from '../utils/uiNotifications.js';
// Import the function from the DISGUISE presetEditor
import { addNewDisguisePresetItem } from './presetEditor.js'; // Renamed import

// DOM Elements (with disguise prefix)
let disguisePresetAddItemModal, disguisePresetAddItemForm, disguiseAddItemRoleSelect, disguiseAddItemContentTextarea;

// Renamed function
function handleDisguiseAddItemFormSubmit(event) {
    event.preventDefault();
    if (!disguiseAddItemRoleSelect || !disguiseAddItemContentTextarea) {
        console.error('Cannot submit disguise item form: roleSelect or contentTextArea is null.');
        uiNotifications.showToast('表单元素未正确加载，无法提交。', 3000, 'error');
        return;
    }

    const role = disguiseAddItemRoleSelect.value;
    const content = disguiseAddItemContentTextarea.value;
    console.log('Submitting new disguise item. Role:', role, 'Content:', content);

    // Basic validation (optional: add more checks if needed)
    // if (!content.trim()) {
    //     uiNotifications.showToast('消息内容不能为空', 2000, 'warning');
    //     return;
    // }

    const newItemData = {
        enabled: true,
        role: role,
        content: content,
        is_variable_placeholder: false // Ensure this is set correctly for messages
    };

    // Call the function imported from the DISGUISE presetEditor.js
    addNewDisguisePresetItem(newItemData); // Use renamed function

    // Close the disguise modal
    domUtils.closeModal(disguisePresetAddItemModal); // Use renamed element variable

    // Show success toast
    uiNotifications.showToast('成功添加伪装消息'); // Updated text
}

// Renamed export function
export function openDisguisePresetAddItemModal() {
    // Use disguise element variables
    if (!disguisePresetAddItemForm || !disguiseAddItemRoleSelect || !disguisePresetAddItemModal) {
         console.error("Disguise add preset item modal or its form elements not found/initialized.");
         uiNotifications.showToast('无法打开添加伪装消息窗口。', 3000, 'error'); // Updated text
         return;
    }
    // Reset the disguise form
    disguisePresetAddItemForm.reset();
    disguiseAddItemRoleSelect.value = 'system'; // Default to system message

    // Open the disguise modal
    domUtils.openModal(disguisePresetAddItemModal);
}

// Renamed export function
export function initDisguisePresetAddItemModal() {
    // Select elements with disguise prefix
    disguisePresetAddItemModal = document.getElementById('disguise-preset-add-item-modal'); // Assuming duplicated modal ID
    
    if (!disguisePresetAddItemModal) {
        console.error("Disguise preset add item modal not found!");
        return;
    }
    // Query within the specific modal to avoid ID conflicts
    disguisePresetAddItemForm = disguisePresetAddItemModal.querySelector('#disguise-preset-add-item-form'); // HTML form ID is disguise-preset-add-item-form
    disguiseAddItemRoleSelect = disguisePresetAddItemModal.querySelector('#disguise-add-item-role'); // Use new ID
    disguiseAddItemContentTextarea = disguisePresetAddItemModal.querySelector('#disguise-add-item-content'); // Use new ID

    if (!disguisePresetAddItemForm) { // Check form separately as it's queried from modal
        console.error("Disguise preset add item form not found within the modal!");
        return;
    }
    // It's also good to check roleSelect and contentTextArea, though the error message might already indicate this
    if (!disguiseAddItemRoleSelect || !disguiseAddItemContentTextarea) {
        console.error("Role select or content textarea not found within the disguise add item modal!");
        // No return here, as the openDisguisePresetAddItemModal function already checks these and shows a user-facing error.
    }

    disguisePresetAddItemForm.addEventListener('submit', handleDisguiseAddItemFormSubmit); // Use renamed handler

    // Close button listener
    disguisePresetAddItemModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="disguise-preset-add-item-modal"][rel="prev"]')) { // Update target
            domUtils.closeModal(disguisePresetAddItemModal);
        }
    });
}