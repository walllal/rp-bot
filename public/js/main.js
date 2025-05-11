import * as domUtils from './utils/domUtils.js';
import * as uiNotifications from './utils/uiNotifications.js';
import apiService from './services/apiService.js';
import { initNavigation } from './navigation/navigationHandler.js';
import { initAppSettings } from './settings/appSettingsManager.js';
import { initAccessControl } from './settings/accessControlManager.js';
import { initPresetManager } from './presets/presetManager.js';
import { initPresetEditor, getCurrentPresetEditorData } from './presets/presetEditor.js';
import { initPresetAddItemModal } from './presets/presetAddItemModal.js';
import { initAssignmentManager } from './presets/assignmentManager.js';
import { initChatHistoryManager } from './history/chatHistoryManager.js'; // Added import
import { initMessageHistoryManager } from './history/messageHistoryManager.js';
import { initPluginManager } from './plugins/pluginManager.js'; // Added import
import { initPluginConfigModal } from './plugins/pluginConfigModal.js';
// import { initDebugTextManager } from './debug/debugTextManager.js'; // Removed import
// import { initDebugVoiceManager } from './debug/debugVoiceManager.js'; // Removed import
import { initPresetSettingsModal } from './presets/presetSettingsModal.js';
// --- Disguise Module Imports ---
import { initDisguisePresetManager } from './disguise/presetManager.js';
import { initDisguisePresetEditor, getCurrentDisguisePresetEditorData } from './disguise/presetEditor.js';
import { initDisguisePresetAddItemModal } from './disguise/presetAddItemModal.js';
import { initDisguiseAssignmentManager } from './disguise/assignmentManager.js';
import { initDisguisePresetSettingsModal } from './disguise/presetSettingsModal.js';
// +++ Variable Manager Imports +++
import { initGlobalVariableManager } from './variables/globalVariableManager.js';
import { initLocalVariableManager } from './variables/localVariableManager.js';
 
document.addEventListener('DOMContentLoaded', async () => { // Made async for initAppSettings, initAccessControl, initPresetManager, initAssignmentManager, initPluginManager, and disguise modules

    // --- Authentication Check ---
    // This should be one of the first things to run.
    // If on login page, skip this check as login.js handles its own logic.
    if (window.location.pathname !== '/login') {
        try {
            const authStatus = await apiService.getAuthStatus();
            if (authStatus.authEnabled) {
                const token = localStorage.getItem('authToken');
                if (!token) {
                    console.log('Auth enabled, no token found. Redirecting to login.');
                    window.location.href = '/login';
                    return; // Stop further execution of main.js if redirecting
                }
                // Optional: Add a call to a /api/auth/verify-token endpoint here
                // to ensure the token is still valid on the backend.
                // If verification fails, then redirect.
                // For now, we assume if a token exists, it's good enough for initial load.
                // The apiService's fetchWithAuth will handle token expiry/invalidity on API calls.
            } else {
                console.log('Authentication is disabled by backend. Proceeding.');
                // If auth is disabled, clear any lingering token to avoid confusion
                localStorage.removeItem('authToken');
            }
        } catch (error) {
            console.error('Failed to check auth status or redirect:', error);
            // Potentially redirect to an error page or show a global error message
            // If the auth status check itself fails, it might be a server issue.
            // For now, if it's not a redirect to login, let the app try to load,
            // but API calls might fail if auth is actually required and status check failed.
            // A robust solution might involve a retry or a more graceful failure display.
            if (window.location.pathname !== '/login') {
                 // Fallback: if status check fails and we are not on login page, and we assume auth might be required
                 // it's safer to redirect to login to prevent app errors.
                 // However, this could also loop if login.html itself has issues loading.
                 // Consider what the best UX is if the /api/auth/status endpoint is down.
                 // For now, let's log the error and attempt to proceed.
                 // If API calls fail later due to auth, they will redirect.
                 console.warn('Auth status check failed. App will attempt to load, but may be redirected if APIs require login.');
            }
        }
    }
    // --- End Authentication Check ---
 
    // --- DOM 元素获取 ---
    // All temporary DOM element selectors have been moved to their respective modules.
    // The ESC key handler below will get the elements it needs when the event occurs.


    // --- State Variables ---
    // All state variables (allPresets, currentSettings, currentPresetEditorData, sortableInstance)
    // have been moved to their respective modules.


    // --- Rendering Functions ---
    // All temporary rendering functions (renderPresetsTable, updateAssignmentPresetOptions)
    // have been moved to their respective modules.


    // --- Initial Data Loading ---
    // This function now primarily ensures UI elements reflect loaded state.
    // Specific data loading is handled within each module's init function.
    async function finalizeInitialLoad() {
        // Ensure switch status text is updated after all settings/controls are potentially loaded.
        domUtils.updateSwitchStatusText();
        // Add any other final UI adjustments needed after all modules are initialized.
    }

    // --- 添加ESC键关闭弹窗功能 ---
    document.addEventListener('keydown', async (event) => {
        if (event.key === 'Escape') {
            // Get DOM elements needed for ESC handler here
            const presetModal = document.getElementById('preset-modal');
            const presetItemEditModal = document.getElementById('preset-item-edit-modal');
            const presetAddItemModal = document.getElementById('preset-add-item-modal');
            const presetSettingsModal = document.getElementById('preset-settings-modal');
            const pluginConfigModal = document.getElementById('plugin-config-modal');
            // Add disguise modals to ESC handler
            const disguisePresetModal = document.getElementById('disguise-preset-modal');
            const disguisePresetItemEditModal = document.getElementById('disguise-preset-item-edit-modal');
            const disguisePresetAddItemModal = document.getElementById('disguise-preset-add-item-modal');
            const disguisePresetSettingsModal = document.getElementById('disguise-preset-settings-modal'); // Uncommented this line
            // Duplicate declarations removed below

            // 检查每个弹窗是否打开，如果打开则关闭
            if (presetModal && presetModal.hasAttribute('open')) {
                const editorData = getCurrentPresetEditorData(); // Use imported function
                if (editorData.length > 0) {
                    const confirmed = await uiNotifications.showConfirm('关闭确认', '确定要关闭弹窗吗？您的更改可能不会被保存。', '关闭', '取消', 'warning');
                    if (!confirmed) {
                        return;
                    }
                }
                domUtils.closeModal(presetModal);
            }
            if (disguisePresetModal && disguisePresetModal.hasAttribute('open')) { // Check disguise modal
                const editorData = getCurrentDisguisePresetEditorData(); // Use disguise getter
                if (editorData.length > 0) {
                    const confirmed = await uiNotifications.showConfirm('关闭确认', '确定要关闭弹窗吗？您的更改可能不会被保存。', '关闭', '取消', 'warning');
                    if (!confirmed) return;
                }
                domUtils.closeModal(disguisePresetModal);
            }
            if (presetItemEditModal && presetItemEditModal.hasAttribute('open')) {
                domUtils.closeModal(presetItemEditModal);
            }
             if (disguisePresetItemEditModal && disguisePresetItemEditModal.hasAttribute('open')) { // Check disguise modal
                domUtils.closeModal(disguisePresetItemEditModal);
            }
            if (presetAddItemModal && presetAddItemModal.hasAttribute('open')) {
                domUtils.closeModal(presetAddItemModal);
            }
             if (disguisePresetAddItemModal && disguisePresetAddItemModal.hasAttribute('open')) { // Check disguise modal
                domUtils.closeModal(disguisePresetAddItemModal);
            }
            if (presetSettingsModal && presetSettingsModal.hasAttribute('open')) {
                domUtils.closeModal(presetSettingsModal);
            }
             if (disguisePresetSettingsModal && disguisePresetSettingsModal.hasAttribute('open')) { // Check disguise modal
                domUtils.closeModal(disguisePresetSettingsModal);
            }
            if (pluginConfigModal && pluginConfigModal.hasAttribute('open')) {
                domUtils.closeModal(pluginConfigModal);
            }
        }
    });

    // --- 初始化 ---
    initNavigation(); // Initialize navigation
    await initAppSettings(); // Initialize App Settings
    await initAccessControl(); // Initialize Access Control
    await initPresetManager(); // Initialize Preset Manager
    initPresetEditor(); // Initialize Preset Editor
    initPresetAddItemModal(); // Initialize Add Item Modal
    await initAssignmentManager(); // Initialize Assignment Manager
    await initChatHistoryManager(); // Initialize Chat History Manager (now async)
    await initMessageHistoryManager(); // Initialize Message History Manager (now async)
    await initPluginManager(); // Initialize Plugin Manager (loads its own data)
    initPluginConfigModal(); // Initialize Plugin Config Modal
    initPresetSettingsModal(); // Initialize Preset Settings Modal
    // --- Initialize Disguise Modules ---
    await initDisguisePresetManager();
    initDisguisePresetEditor();
    initDisguisePresetAddItemModal();
    await initDisguiseAssignmentManager();
    initDisguisePresetSettingsModal();
    // --- End Disguise Module Init ---

    // +++ Initialize Variable Managers +++
    initGlobalVariableManager();
    initLocalVariableManager();
    
    // --- Logout Button Handler ---
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('authToken');
            window.location.href = '/login';
        });
    } else {
        console.warn('Logout button not found in the DOM.');
    }
    // --- End Logout Button Handler ---

    finalizeInitialLoad(); // Call the final UI update function
 
}); // End of DOMContentLoaded listener