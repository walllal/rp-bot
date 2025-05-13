import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js'; // For updateSwitchStatusText if settings affect switches

let currentAppSettings = {};

// DOM Elements for App Settings
let settingOnebotModeSelect, settingOnebotUrlInput, settingOnebotPortInput,
    settingOnebotAccessTokenInput, settingBotIdInput, // +++ Add botId input +++
    settingOnebotReconnectIntervalInput,
    settingLogLevelSelect;
let settingsSection; // Parent for save buttons
// Also need access control switches here to set initial state
let accessControlSwitches = {};
let presetFeatureSwitch, disguiseFeatureSwitch; // Declare new switch elements
let presetSubContent, disguiseSubContent; // Declare content area elements

async function loadAppSettings() {
    try {
        // Assuming API now returns the AppSettings object directly
        const settings = await apiService.getSettings(); // Removed ': any' type annotation
        currentAppSettings = settings || {}; // Store the whole object

        // Populate connection settings
        if (settingOnebotModeSelect) settingOnebotModeSelect.value = currentAppSettings.onebotMode ?? 'ws-reverse';
        if (settingOnebotUrlInput) settingOnebotUrlInput.value = currentAppSettings.onebotUrl ?? '';
        if (settingOnebotPortInput) settingOnebotPortInput.value = currentAppSettings.onebotPort ?? '';
        if (settingOnebotAccessTokenInput) settingOnebotAccessTokenInput.value = currentAppSettings.onebotAccessToken ?? '';
        if (settingBotIdInput) settingBotIdInput.value = currentAppSettings.botId ?? ''; // +++ Load botId +++
        if (settingOnebotReconnectIntervalInput) settingOnebotReconnectIntervalInput.value = currentAppSettings.onebotReconnectInterval ?? '';
        // Populate log level
        if (settingLogLevelSelect) settingLogLevelSelect.value = currentAppSettings.logLevel ?? 'NORMAL';

        // Set the initial checked state for access control switches
        if (accessControlSwitches.PRIVATE_WHITELIST) accessControlSwitches.PRIVATE_WHITELIST.checked = !!currentAppSettings.privateWhitelistEnabled;
        if (accessControlSwitches.PRIVATE_BLACKLIST) accessControlSwitches.PRIVATE_BLACKLIST.checked = !!currentAppSettings.privateBlacklistEnabled;
        if (accessControlSwitches.GROUP_WHITELIST) accessControlSwitches.GROUP_WHITELIST.checked = !!currentAppSettings.groupWhitelistEnabled;
        if (accessControlSwitches.GROUP_BLACKLIST) accessControlSwitches.GROUP_BLACKLIST.checked = !!currentAppSettings.groupBlacklistEnabled;

        // Set initial state for new feature switches and UI disabling
        // Preset默认为true，Disguise默认为false
        const presetEnabled = currentAppSettings.presetFeatureEnabled !== false;
        const disguiseEnabled = currentAppSettings.disguiseFeatureEnabled === true; // 明确要求为true才启用，默认为false

        if (presetFeatureSwitch) presetFeatureSwitch.checked = presetEnabled;
        if (disguiseFeatureSwitch) disguiseFeatureSwitch.checked = disguiseEnabled;

        if (presetSubContent) presetSubContent.classList.toggle('feature-disabled', !presetEnabled);
        if (disguiseSubContent) disguiseSubContent.classList.toggle('feature-disabled', !disguiseEnabled);

        // Update status text for ALL switches after setting their state
        domUtils.updateSwitchStatusText();


    } catch (error) {
        console.error('加载应用设置失败:', error);
        uiNotifications.showToast('加载应用设置失败', 3000, 'error');
    }
}

// New function to save a single setting change (e.g., from a toggle)
async function saveSingleAppSetting(key, value) { // Removed TS types
    const settingsToUpdate = { [key]: value };
    console.log('Saving single app setting:', settingsToUpdate); // Debug log

    try {
        // Assuming updateSettings API can handle partial updates based on the new AppSettings model
        const updatedSettings = await apiService.updateSettings(settingsToUpdate);
        // Update local cache with the full response (which should be the complete settings object)
        currentAppSettings = updatedSettings || currentAppSettings;
        uiNotifications.showToast('设置已保存', 1500);
    } catch (error) {
        console.error(`保存设置 ${key} 失败:`, error);
        let errorData = { error: `保存设置 ${key} 时发生未知错误` };
         if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`保存失败: ${errorData.error}`, 4000, 'error');
        // Revert UI change on error by reloading settings
        await loadAppSettings();
    }
}


// Handles saving settings from the main "Save" buttons within sections
function handleSaveAppSettings(event) {
    if (!event.target || !event.target.classList.contains('save-settings-btn')) return; // Added null check for target

    const button = event.target;
    const sectionKey = button.dataset.settingsSection; // e.g., "connection", "log"

    // Only handle sections relevant to appSettingsManager
    if (sectionKey !== 'connection' && sectionKey !== 'log') {
        return;
    }

    const sectionDiv = document.getElementById(`settings-sub-tab-${sectionKey}`);
    if (!sectionDiv) {
        console.error(`Could not find settings section div for ${sectionKey}`);
        uiNotifications.showToast('保存设置时出错：未找到对应的设置区域。', 3000, 'error');
        return;
    }

    const inputs = sectionDiv.querySelectorAll('input, select, textarea'); // 新增 textarea
    const settingsToUpdate = {};
    let validationError = false;

    inputs.forEach(input => {
        // Skip elements without a name attribute
        if (!input.name) return;

        // Use type property directly from the element
        const value = input.type === 'checkbox' ? input.checked : input.value.trim();

        // Basic Validation
        if (input.required && !input.value.trim() && input.type !== 'checkbox') { // Check trimmed value for non-checkboxes
            uiNotifications.showToast(`字段 "${input.previousElementSibling?.textContent || input.name}" 不能为空`, 2500, 'warning');
            validationError = true;
            return;
        }
        if (input.type === 'number' && input.min && parseFloat(input.value) < parseFloat(input.min)) {
            uiNotifications.showToast(`字段 "${input.previousElementSibling?.textContent || input.name}" 的值不能小于 ${input.min}`, 2500, 'warning');
            validationError = true;
            return;
        }
        if (input.type === 'number' && input.max && parseFloat(input.value) > parseFloat(input.max)) {
            uiNotifications.showToast(`字段 "${input.previousElementSibling?.textContent || input.name}" 的值不能大于 ${input.max}`, 2500, 'warning');
            validationError = true;
            return;
        }
        // Corrected URL validation
        if (input.type === 'url' && input.value && !input.value.startsWith('ws://') && !input.value.startsWith('wss://')) {
             if (input.name === 'onebotUrl') { // Only validate ws/wss for onebotUrl
                uiNotifications.showToast('OneBot URL 必须以 ws:// 或 wss:// 开头', 2500, 'warning');
                validationError = true;
                return;
             }
             // Add validation for http/https for other potential URL fields if needed
             // else if (!input.value.startsWith('http://') && !input.value.startsWith('https://')) { ... }
        }
        settingsToUpdate[input.name] = value;
    });

    if (validationError) return;

    // Specific validation for combined fields
    if (sectionKey === 'connection') {
        const onebotMode = settingsToUpdate['onebotMode'];
        const onebotPort = settingsToUpdate['onebotPort'];
        const onebotUrl = settingsToUpdate['onebotUrl'];
        const portNum = parseInt(onebotPort, 10);
        if (onebotMode === 'ws-reverse' && (isNaN(portNum) || portNum <= 1024 || portNum > 65535)) {
            uiNotifications.showToast('反向 WS 模式下，端口必须是 1025-65535 之间的数字', 2500, 'warning');
            return;
        }
        if (onebotMode === 'ws' && (!onebotUrl || (!onebotUrl.startsWith('ws://') && !onebotUrl.startsWith('wss://')))) {
            uiNotifications.showToast('正向 WS 模式下，URL 不能为空且必须以 ws:// 或 wss:// 开头', 2500, 'warning');
            return;
        }
        const intervalNum = parseInt(settingsToUpdate['onebotReconnectInterval'], 10);
        if (isNaN(intervalNum) || intervalNum < 1000) {
            uiNotifications.showToast('重连间隔必须是大于等于 1000 的数字 (毫秒)', 2000, 'warning');
            return;
        }
    }

    button.disabled = true;
    button.textContent = '保存中...';

    // Prepare data in the format expected by the new updateAppSettings
    // The new API expects the direct object, not nested under 'settings'
    apiService.updateSettings(settingsToUpdate)
        .then(updatedSettings => {
            // The API now returns the full updated AppSettings object
            currentAppSettings = updatedSettings || currentAppSettings; // Update local cache, handle potential null response
            uiNotifications.showToast(`${sectionKey.toUpperCase()} 设置保存成功！`, 2000);
            // Re-populate form fields in case API modified/validated values (optional but good practice)
            loadAppSettings(); // Reload to reflect potentially validated/modified values
        })
        .catch(async error => {
            console.error(`保存 ${sectionKey} 设置失败:`, error);
            let errorData = { error: `保存 ${sectionKey} 设置时发生未知错误` };
            if (error instanceof Response) {
                try {
                    errorData = await error.json();
                } catch (e) { /* ignore json parse error */ }
            } else if (error.message) {
                errorData.error = error.message;
            }
            uiNotifications.showToast(`保存失败: ${errorData.error}`, 4000, 'error');
        })
        .finally(() => {
            button.disabled = false;
            let sectionName = '';
            switch (sectionKey) {
                case 'connection': sectionName = '连接'; break;
                case 'log': sectionName = '日志'; break;
                default: sectionName = sectionKey.toUpperCase();
            }
            button.textContent = `保存${sectionName}设置`;
        });
}

// New handler for feature toggle switches
function handleFeatureToggleChange(event) { // Removed TS type
    const target = event.target; // Removed TS assertion
    // Added checks for target and type
    if (!target || !(target instanceof HTMLInputElement) || target.type !== 'checkbox' || !target.name) return;

    const featureKey = target.name; // e.g., "presetFeatureEnabled"
    const isEnabled = target.checked;

    console.log(`Feature toggle changed: ${featureKey} = ${isEnabled}`); // Debug log

    // Update UI immediately
    if (featureKey === 'presetFeatureEnabled' && presetSubContent) {
        presetSubContent.classList.toggle('feature-disabled', !isEnabled);
    } else if (featureKey === 'disguiseFeatureEnabled' && disguiseSubContent) {
        disguiseSubContent.classList.toggle('feature-disabled', !isEnabled);
    }

    // Update switch status text
    const label = target.closest('.switch-label');
    const statusSpan = label?.querySelector('.switch-status');
    if (statusSpan) {
        statusSpan.textContent = isEnabled ? '启用' : '禁用';
    }

    // Save the change
    saveSingleAppSetting(featureKey, isEnabled);
}


export async function initAppSettings() {
    // DOM Element Selection
    settingOnebotModeSelect = document.getElementById('setting-onebot-mode');
    settingOnebotUrlInput = document.getElementById('setting-onebot-url');
    settingOnebotPortInput = document.getElementById('setting-onebot-port');
    settingOnebotAccessTokenInput = document.getElementById('setting-onebot-access-token');
    settingBotIdInput = document.getElementById('setting-bot-id'); // +++ Get botId input element +++
    settingOnebotReconnectIntervalInput = document.getElementById('setting-onebot-reconnect-interval');
    settingLogLevelSelect = document.getElementById('setting-log-level');
    settingsSection = document.getElementById('settings-section'); // For event delegation

    // Get access control switches needed for setting initial state
    accessControlSwitches = {
        PRIVATE_WHITELIST: document.getElementById('setting-privateWhitelistEnabled'),
        PRIVATE_BLACKLIST: document.getElementById('setting-privateBlacklistEnabled'),
        GROUP_WHITELIST: document.getElementById('setting-groupWhitelistEnabled'),
        GROUP_BLACKLIST: document.getElementById('setting-groupBlacklistEnabled'),
    };
    // Get new switch elements
    presetFeatureSwitch = document.getElementById('setting-presetFeatureEnabled'); // Removed TS assertion
    disguiseFeatureSwitch = document.getElementById('setting-disguiseFeatureEnabled'); // Removed TS assertion
    // Get content areas
    presetSubContent = document.getElementById('preset-sub-content');
    disguiseSubContent = document.getElementById('disguise-preset-sub-content');


    await loadAppSettings(); // Load settings and set initial UI state

    // Add event listeners
    if (settingsSection) {
        settingsSection.addEventListener('click', handleSaveAppSettings);
    }
    if (presetFeatureSwitch) {
        presetFeatureSwitch.addEventListener('change', handleFeatureToggleChange);
    }
     if (disguiseFeatureSwitch) {
        disguiseFeatureSwitch.addEventListener('change', handleFeatureToggleChange);
    }
}