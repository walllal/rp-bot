import * as domUtils from '../utils/domUtils.js';
import * as uiNotifications from '../utils/uiNotifications.js';
// Import the function from presetEditor to add the item and re-render
import { addNewPresetItem } from './presetEditor.js';

// DOM Elements
let presetAddItemModal, presetAddItemForm, addItemRoleSelect, addItemContentTextarea;

function handleAddItemFormSubmit(event) {
    event.preventDefault();
    if (!addItemRoleSelect || !addItemContentTextarea) return;

    const role = addItemRoleSelect.value;
    const content = addItemContentTextarea.value;

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

    // Call the function imported from presetEditor.js
    addNewPresetItem(newItemData);

    // Close the modal
    domUtils.closeModal(presetAddItemModal);

    // Show success toast
    uiNotifications.showToast('成功添加消息');
}

export function openPresetAddItemModal() {
    if (!presetAddItemForm || !addItemRoleSelect || !presetAddItemModal) {
         console.error("Add preset item modal or its form elements not found/initialized.");
         uiNotifications.showToast('无法打开添加消息窗口。', 3000, 'error');
         return;
    }
    // Reset the form
    presetAddItemForm.reset();
    addItemRoleSelect.value = 'system'; // Default to system message
    // addItemContentTextarea.value = ''; // reset() should handle this

    // Open the modal
    domUtils.openModal(presetAddItemModal);
}

export function initPresetAddItemModal() {
    presetAddItemModal = document.getElementById('preset-add-item-modal');
    presetAddItemForm = document.getElementById('preset-add-item-form');
    addItemRoleSelect = document.getElementById('add-item-role');
    addItemContentTextarea = document.getElementById('add-item-content');

    if (!presetAddItemModal || !presetAddItemForm) {
        console.error("Preset add item modal or form not found!");
        return;
    }

    presetAddItemForm.addEventListener('submit', handleAddItemFormSubmit);

    // Close button listener
    presetAddItemModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="preset-add-item-modal"][rel="prev"]')) {
            domUtils.closeModal(presetAddItemModal);
        }
    });
}