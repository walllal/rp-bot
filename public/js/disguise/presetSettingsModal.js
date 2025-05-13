import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';

// DOM Elements (with disguise prefix)
let disguisePresetSettingsModal, disguisePresetSettingsModalTitle, disguisePresetSettingsForm, disguisePresetSettingsIdInput;

// Renamed function
async function handleDisguisePresetSettingsFormSubmit(event) {
    event.preventDefault();
    if (!disguisePresetSettingsIdInput || !disguisePresetSettingsForm) {
        console.error("Cannot submit disguise settings: ID input or form not found.");
        return;
    }

    const id = disguisePresetSettingsIdInput.value;
    if (!id) {
        uiNotifications.showToast('无法保存设置：伪装预设 ID 丢失。', 3000, 'error'); // Updated text
        return;
    }

    // Read data from the disguise form elements
    const settingsData = {
        // Basic Settings
        botName: disguisePresetSettingsForm.elements['botName'].value.trim() || null,
        botNicknames: disguisePresetSettingsForm.elements['botNicknames'].value.trim() || null,
        chatHistoryLimit: parseInt(disguisePresetSettingsForm.elements['chatHistoryLimit'].value, 10) || 10,
        messageHistoryLimit: parseInt(disguisePresetSettingsForm.elements['messageHistoryLimit'].value, 10) || 10,
        // Feature Settings
        mode: disguisePresetSettingsForm.elements['mode'].checked ? 'ADVANCED' : 'STANDARD',
        advancedModeMessageDelay: parseInt(disguisePresetSettingsForm.elements['advancedModeMessageDelay'].value, 10) || 1000,
        botFuzzyMatchEnabled: disguisePresetSettingsForm.elements['botFuzzyMatchEnabled'].checked,
        allowImageInput: disguisePresetSettingsForm.elements['allowImageInput'].checked,
        allowVoiceOutput: disguisePresetSettingsForm.elements['allowVoiceOutput'].checked,
        // Model Settings
        openaiApiKey: disguisePresetSettingsForm.elements['openaiApiKey'].value.trim() || null,
        openaiBaseUrl: disguisePresetSettingsForm.elements['openaiBaseUrl'].value.trim() || null,
        openaiModel: disguisePresetSettingsForm.elements['openaiModel'].value.trim() || 'gpt-3.5-turbo',
        openaiMaxTokens: disguisePresetSettingsForm.elements['openaiMaxTokens'].value ? parseInt(disguisePresetSettingsForm.elements['openaiMaxTokens'].value, 10) : null,
        openaiTemperature: disguisePresetSettingsForm.elements['openaiTemperature'].value ? parseFloat(disguisePresetSettingsForm.elements['openaiTemperature'].value) : null,
        openaiFrequencyPenalty: disguisePresetSettingsForm.elements['openaiFrequencyPenalty'].value ? parseFloat(disguisePresetSettingsForm.elements['openaiFrequencyPenalty'].value) : null,
        openaiPresencePenalty: disguisePresetSettingsForm.elements['openaiPresencePenalty'].value ? parseFloat(disguisePresetSettingsForm.elements['openaiPresencePenalty'].value) : null,
        openaiTopP: disguisePresetSettingsForm.elements['openaiTopP'].value ? parseFloat(disguisePresetSettingsForm.elements['openaiTopP'].value) : null,
        // Web Search Settings
        allowWebSearch: disguisePresetSettingsForm.elements['allowWebSearch'].checked,
        webSearchApiKey: disguisePresetSettingsForm.elements['webSearchApiKey'].value.trim() || null,
        webSearchBaseUrl: disguisePresetSettingsForm.elements['webSearchBaseUrl'].value.trim() || null,
        webSearchModel: disguisePresetSettingsForm.elements['webSearchModel'].value.trim() || 'gemini-2.0-flash',
        webSearchOpenaiMaxTokens: disguisePresetSettingsForm.elements['webSearchOpenaiMaxTokens'].value ? parseInt(disguisePresetSettingsForm.elements['webSearchOpenaiMaxTokens'].value, 10) : null,
        webSearchOpenaiTemperature: disguisePresetSettingsForm.elements['webSearchOpenaiTemperature'].value ? parseFloat(disguisePresetSettingsForm.elements['webSearchOpenaiTemperature'].value) : null,
        webSearchOpenaiFrequencyPenalty: disguisePresetSettingsForm.elements['webSearchOpenaiFrequencyPenalty'].value ? parseFloat(disguisePresetSettingsForm.elements['webSearchOpenaiFrequencyPenalty'].value) : null,
        webSearchOpenaiPresencePenalty: disguisePresetSettingsForm.elements['webSearchOpenaiPresencePenalty'].value ? parseFloat(disguisePresetSettingsForm.elements['webSearchOpenaiPresencePenalty'].value) : null,
        webSearchOpenaiTopP: disguisePresetSettingsForm.elements['webSearchOpenaiTopP'].value ? parseFloat(disguisePresetSettingsForm.elements['webSearchOpenaiTopP'].value) : null,
        webSearchSystemPrompt: disguisePresetSettingsForm.elements['webSearchSystemPrompt'].value.trim() || null,
        // Trigger Settings - Normal
        nameTriggered: disguisePresetSettingsForm.elements['nameTriggered'].checked,
        nicknameTriggered: disguisePresetSettingsForm.elements['nicknameTriggered'].checked,
        atTriggered: disguisePresetSettingsForm.elements['atTriggered'].checked,
        replyTriggered: disguisePresetSettingsForm.elements['replyTriggered'].checked,
        // Trigger Settings - AI
        timedTriggerEnabled: disguisePresetSettingsForm.elements['timedTriggerEnabled'].checked,
        timedTriggerInterval: disguisePresetSettingsForm.elements['timedTriggerInterval'].value ? parseInt(disguisePresetSettingsForm.elements['timedTriggerInterval'].value, 10) : null,
        quantitativeTriggerEnabled: disguisePresetSettingsForm.elements['quantitativeTriggerEnabled'].checked,
        quantitativeTriggerThreshold: disguisePresetSettingsForm.elements['quantitativeTriggerThreshold'].value ? parseInt(disguisePresetSettingsForm.elements['quantitativeTriggerThreshold'].value, 10) : null,
        aiTriggerApiKey: disguisePresetSettingsForm.elements['aiTriggerApiKey'].value.trim() || null,
        aiTriggerBaseUrl: disguisePresetSettingsForm.elements['aiTriggerBaseUrl'].value.trim() || null,
        aiTriggerModel: disguisePresetSettingsForm.elements['aiTriggerModel'].value.trim() || 'gpt-3.5-turbo',
        aiTriggerOpenaiMaxTokens: disguisePresetSettingsForm.elements['aiTriggerOpenaiMaxTokens'].value ? parseInt(disguisePresetSettingsForm.elements['aiTriggerOpenaiMaxTokens'].value, 10) : null,
        aiTriggerOpenaiTemperature: disguisePresetSettingsForm.elements['aiTriggerOpenaiTemperature'].value ? parseFloat(disguisePresetSettingsForm.elements['aiTriggerOpenaiTemperature'].value) : null,
        aiTriggerOpenaiFrequencyPenalty: disguisePresetSettingsForm.elements['aiTriggerOpenaiFrequencyPenalty'].value ? parseFloat(disguisePresetSettingsForm.elements['aiTriggerOpenaiFrequencyPenalty'].value) : null,
        aiTriggerOpenaiPresencePenalty: disguisePresetSettingsForm.elements['aiTriggerOpenaiPresencePenalty'].value ? parseFloat(disguisePresetSettingsForm.elements['aiTriggerOpenaiPresencePenalty'].value) : null,
        aiTriggerOpenaiTopP: disguisePresetSettingsForm.elements['aiTriggerOpenaiTopP'].value ? parseFloat(disguisePresetSettingsForm.elements['aiTriggerOpenaiTopP'].value) : null,
        aiTriggerKeyword: disguisePresetSettingsForm.elements['aiTriggerKeyword'].value.trim() || null,
        aiTriggerKeywordFuzzyMatch: disguisePresetSettingsForm.elements['aiTriggerKeywordFuzzyMatch'].checked,
        aiTriggerSystemPrompt: disguisePresetSettingsForm.elements['aiTriggerSystemPrompt'].value.trim() || null,
        aiTriggerUserPrompt: disguisePresetSettingsForm.elements['aiTriggerUserPrompt'].value.trim() || null,
    };

    const saveButton = disguisePresetSettingsForm.querySelector('button[type="submit"]');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = '保存中...';
    }

    try {
        await apiService.updateDisguisePreset(id, settingsData); // Use new API method
        uiNotifications.showToast('伪装设置已保存！'); // Updated text
        domUtils.closeModal(disguisePresetSettingsModal); // Use renamed element variable
        // Optionally notify presetManager to update its cache if needed
        // e.g., if (window.updateDisguisePresetCache) window.updateDisguisePresetCache(id, settingsData);
    } catch (error) {
        console.error(`更新伪装 ${id} 设置失败:`, error); // Updated text
        let errorData = { error: '更新伪装设置时发生未知错误' }; // Updated text
         if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`保存伪装设置失败: ${errorData.error}`, 4000, 'error'); // Updated text
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = '保存设置';
        }
    }
}

// Renamed export function
export async function openDisguisePresetSettingsModal(presetId) {
    // Use disguise element variables
    if (!presetId || !disguisePresetSettingsModal || !disguisePresetSettingsIdInput || !disguisePresetSettingsModalTitle || !disguisePresetSettingsForm) {
         console.error("Disguise preset settings modal or required elements not found/initialized.");
         uiNotifications.showToast('无法打开伪装设置。', 3000, 'error'); // Updated text
         return;
    }

    try {
        // 1. Fetch disguise preset data
        const preset = await apiService.getDisguisePreset(presetId); // Use new API method
        if (!preset) {
             uiNotifications.showToast('加载伪装设置失败: 未找到伪装', 3000, 'error'); // Updated text
             return;
        }

        // 2. Populate the disguise settings modal form
        disguisePresetSettingsIdInput.value = preset.id;
        disguisePresetSettingsModalTitle.textContent = `伪装设置: ${domUtils.escapeHtml(preset.name)}`; // Updated text

        // Populate fields in the disguise form - Basic Settings
        disguisePresetSettingsForm.elements['botName'].value = preset.botName || '';
        disguisePresetSettingsForm.elements['botNicknames'].value = preset.botNicknames || '';
        disguisePresetSettingsForm.elements['chatHistoryLimit'].value = preset.chatHistoryLimit ?? 10;
        disguisePresetSettingsForm.elements['messageHistoryLimit'].value = preset.messageHistoryLimit ?? 10;

        // Populate fields - Feature Settings
        disguisePresetSettingsForm.elements['mode'].checked = preset.mode === 'ADVANCED';
        disguisePresetSettingsForm.elements['advancedModeMessageDelay'].value = preset.advancedModeMessageDelay ?? 1000;
        disguisePresetSettingsForm.elements['botFuzzyMatchEnabled'].checked = preset.botFuzzyMatchEnabled ?? false;
        disguisePresetSettingsForm.elements['allowImageInput'].checked = preset.allowImageInput ?? false;
        disguisePresetSettingsForm.elements['allowVoiceOutput'].checked = preset.allowVoiceOutput ?? false;

        // Populate fields - Model Settings
        disguisePresetSettingsForm.elements['openaiApiKey'].value = preset.openaiApiKey || '';
        disguisePresetSettingsForm.elements['openaiBaseUrl'].value = preset.openaiBaseUrl || '';
        disguisePresetSettingsForm.elements['openaiModel'].value = preset.openaiModel || 'gpt-3.5-turbo';
        disguisePresetSettingsForm.elements['openaiMaxTokens'].value = preset.openaiMaxTokens ?? '';
        disguisePresetSettingsForm.elements['openaiTemperature'].value = preset.openaiTemperature ?? 1.0;
        disguisePresetSettingsForm.elements['openaiFrequencyPenalty'].value = preset.openaiFrequencyPenalty ?? 0.0;
        disguisePresetSettingsForm.elements['openaiPresencePenalty'].value = preset.openaiPresencePenalty ?? 0.0;
        disguisePresetSettingsForm.elements['openaiTopP'].value = preset.openaiTopP ?? 1.0;
        // Update slider value displays for Model Settings
        updateDisguiseSliderValue('disguise-settings-openai-temperature', 'disguise-settings-openai-temperature-value');
        updateDisguiseSliderValue('disguise-settings-openai-frequency-penalty', 'disguise-settings-openai-frequency-penalty-value');
        updateDisguiseSliderValue('disguise-settings-openai-presence-penalty', 'disguise-settings-openai-presence-penalty-value');
        updateDisguiseSliderValue('disguise-settings-openai-top-p', 'disguise-settings-openai-top-p-value');

        // Populate fields - Web Search Settings
        disguisePresetSettingsForm.elements['allowWebSearch'].checked = preset.allowWebSearch ?? false;
        disguisePresetSettingsForm.elements['webSearchApiKey'].value = preset.webSearchApiKey || '';
        disguisePresetSettingsForm.elements['webSearchBaseUrl'].value = preset.webSearchBaseUrl || '';
        disguisePresetSettingsForm.elements['webSearchModel'].value = preset.webSearchModel || 'gemini-2.0-flash';
        disguisePresetSettingsForm.elements['webSearchOpenaiMaxTokens'].value = preset.webSearchOpenaiMaxTokens ?? '';
        disguisePresetSettingsForm.elements['webSearchOpenaiTemperature'].value = preset.webSearchOpenaiTemperature ?? 1.0;
        disguisePresetSettingsForm.elements['webSearchOpenaiFrequencyPenalty'].value = preset.webSearchOpenaiFrequencyPenalty ?? 0.0;
        disguisePresetSettingsForm.elements['webSearchOpenaiPresencePenalty'].value = preset.webSearchOpenaiPresencePenalty ?? 0.0;
        disguisePresetSettingsForm.elements['webSearchOpenaiTopP'].value = preset.webSearchOpenaiTopP ?? 1.0;
        disguisePresetSettingsForm.elements['webSearchSystemPrompt'].value = preset.webSearchSystemPrompt || '';
        // Update slider value displays for Web Search Settings
        updateDisguiseSliderValue('disguise-settings-web-search-openai-temperature', 'disguise-settings-web-search-openai-temperature-value');
        updateDisguiseSliderValue('disguise-settings-web-search-openai-frequency-penalty', 'disguise-settings-web-search-openai-frequency-penalty-value');
        updateDisguiseSliderValue('disguise-settings-web-search-openai-presence-penalty', 'disguise-settings-web-search-openai-presence-penalty-value');
        updateDisguiseSliderValue('disguise-settings-web-search-openai-top-p', 'disguise-settings-web-search-openai-top-p-value');
        
        // Populate fields - Trigger Settings - Normal
        disguisePresetSettingsForm.elements['nameTriggered'].checked = preset.nameTriggered ?? false; // Default to false for disguise
        disguisePresetSettingsForm.elements['nicknameTriggered'].checked = preset.nicknameTriggered ?? false; // Default to false
        disguisePresetSettingsForm.elements['atTriggered'].checked = preset.atTriggered ?? false; // Default to false
        disguisePresetSettingsForm.elements['replyTriggered'].checked = preset.replyTriggered ?? false; // Default to false
        // Populate fields - Trigger Settings - AI
        disguisePresetSettingsForm.elements['timedTriggerEnabled'].checked = preset.timedTriggerEnabled ?? false;
        disguisePresetSettingsForm.elements['timedTriggerInterval'].value = preset.timedTriggerInterval ?? '';
        disguisePresetSettingsForm.elements['quantitativeTriggerEnabled'].checked = preset.quantitativeTriggerEnabled ?? false;
        disguisePresetSettingsForm.elements['quantitativeTriggerThreshold'].value = preset.quantitativeTriggerThreshold ?? '';
        disguisePresetSettingsForm.elements['aiTriggerApiKey'].value = preset.aiTriggerApiKey || '';
        disguisePresetSettingsForm.elements['aiTriggerBaseUrl'].value = preset.aiTriggerBaseUrl || '';
        disguisePresetSettingsForm.elements['aiTriggerModel'].value = preset.aiTriggerModel || 'gpt-3.5-turbo';
        disguisePresetSettingsForm.elements['aiTriggerOpenaiMaxTokens'].value = preset.aiTriggerOpenaiMaxTokens ?? '';
        disguisePresetSettingsForm.elements['aiTriggerOpenaiTemperature'].value = preset.aiTriggerOpenaiTemperature ?? 1.0;
        disguisePresetSettingsForm.elements['aiTriggerOpenaiFrequencyPenalty'].value = preset.aiTriggerOpenaiFrequencyPenalty ?? 0.0;
        disguisePresetSettingsForm.elements['aiTriggerOpenaiPresencePenalty'].value = preset.aiTriggerOpenaiPresencePenalty ?? 0.0;
        disguisePresetSettingsForm.elements['aiTriggerOpenaiTopP'].value = preset.aiTriggerOpenaiTopP ?? 1.0;
        disguisePresetSettingsForm.elements['aiTriggerKeyword'].value = preset.aiTriggerKeyword || '';
        disguisePresetSettingsForm.elements['aiTriggerKeywordFuzzyMatch'].checked = preset.aiTriggerKeywordFuzzyMatch ?? false;
        disguisePresetSettingsForm.elements['aiTriggerSystemPrompt'].value = preset.aiTriggerSystemPrompt || '';
        disguisePresetSettingsForm.elements['aiTriggerUserPrompt'].value = preset.aiTriggerUserPrompt || '';
        // Update slider value displays for AI Trigger Settings
        updateDisguiseSliderValue('disguise-settings-ai-trigger-openai-temperature', 'disguise-settings-ai-trigger-openai-temperature-value');
        updateDisguiseSliderValue('disguise-settings-ai-trigger-openai-frequency-penalty', 'disguise-settings-ai-trigger-openai-frequency-penalty-value');
        updateDisguiseSliderValue('disguise-settings-ai-trigger-openai-presence-penalty', 'disguise-settings-ai-trigger-openai-presence-penalty-value');
        updateDisguiseSliderValue('disguise-settings-ai-trigger-openai-top-p', 'disguise-settings-ai-trigger-openai-top-p-value');

        // 3. Open the disguise modal
        domUtils.openModal(disguisePresetSettingsModal);

    } catch (error) {
        console.error(`加载伪装 ${presetId} 设置失败:`, error); // Updated text
        uiNotifications.showToast('加载伪装设置失败', 3000, 'error'); // Updated text
    }
}

// Helper function to update slider value display for disguise modal
function updateDisguiseSliderValue(sliderId, valueDisplayId) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueDisplayId);
    if (slider && valueDisplay) {
        valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
    }
}

// Renamed export function
export function initDisguisePresetSettingsModal() {
    // Select elements with disguise prefix
    disguisePresetSettingsModal = document.getElementById('disguise-preset-settings-modal');
    disguisePresetSettingsModalTitle = document.getElementById('disguise-preset-settings-modal-title');
    disguisePresetSettingsForm = document.getElementById('disguise-preset-settings-form');
    disguisePresetSettingsIdInput = document.getElementById('disguise-preset-settings-id');

    if (!disguisePresetSettingsModal || !disguisePresetSettingsForm) {
        console.error("Disguise preset settings modal or form not found!");
        return;
    }

    disguisePresetSettingsForm.addEventListener('submit', handleDisguisePresetSettingsFormSubmit);

    // Main Tab navigation logic for disguise modal
    const mainTabButtons = disguisePresetSettingsModal.querySelectorAll('form#disguise-preset-settings-form > nav.settings-modal-sub-nav .nav-button');
    const mainTabContents = disguisePresetSettingsModal.querySelectorAll('.settings-modal-content-container > .settings-modal-tab-content');

    mainTabButtons.forEach(button => {
        button.addEventListener('click', () => {
            mainTabButtons.forEach(btn => btn.classList.remove('active'));
            mainTabContents.forEach(content => {
                content.classList.remove('active');
                content.style.display = 'none';
            });
            button.classList.add('active');
            const targetContentId = button.dataset.target;
            const targetContent = document.getElementById(targetContentId);

            if (targetContent) {
                targetContent.classList.add('active');
                targetContent.style.display = 'block';

                // If the activated main tab is 'Trigger Settings', ensure its default secondary tab is also activated
                if (targetContentId === 'disguise-settings-trigger-content') {
                    const triggerSettingsTab = document.getElementById('disguise-settings-trigger-content');
                    const defaultSecondaryTabButton = triggerSettingsTab.querySelector('.secondary-tab-nav .nav-button[data-target="disguise-trigger-normal-content"]');
                    const defaultSecondaryTabContent = document.getElementById('disguise-trigger-normal-content');
                    const secondaryTabButtons = triggerSettingsTab.querySelectorAll('.secondary-tab-nav .nav-button');
                    const secondaryTabContents = triggerSettingsTab.querySelectorAll(':scope > .settings-modal-tab-content');
                    
                    secondaryTabButtons.forEach(btn => btn.classList.remove('active'));
                    secondaryTabContents.forEach(content => {
                        content.classList.remove('active');
                        content.style.display = 'none';
                    });

                    if (defaultSecondaryTabButton && defaultSecondaryTabContent) {
                        defaultSecondaryTabButton.classList.add('active');
                        defaultSecondaryTabContent.classList.add('active');
                        defaultSecondaryTabContent.style.display = 'block';
                    }
                }
            }
        });
    });

    // Ensure default main tab is shown (Basic Settings) and its content
    const defaultMainTabButton = disguisePresetSettingsModal.querySelector('form#disguise-preset-settings-form > nav.settings-modal-sub-nav .nav-button[data-target="disguise-settings-basic-content"]');
    const defaultMainTabContent = document.getElementById('disguise-settings-basic-content');
    if (defaultMainTabButton && defaultMainTabContent) {
        mainTabButtons.forEach(btn => btn.classList.remove('active'));
        mainTabContents.forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });
        defaultMainTabButton.classList.add('active');
        defaultMainTabContent.classList.add('active');
        defaultMainTabContent.style.display = 'block';
    }

    // Secondary Tab navigation logic (within Trigger Settings Tab for disguise modal)
    const triggerSettingsTab = document.getElementById('disguise-settings-trigger-content');
    if (triggerSettingsTab) {
        const secondaryTabButtons = triggerSettingsTab.querySelectorAll(':scope > nav.secondary-tab-nav .nav-button');
        const secondaryTabContents = triggerSettingsTab.querySelectorAll(':scope > .settings-modal-tab-content');

        secondaryTabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                secondaryTabButtons.forEach(btn => btn.classList.remove('active'));
                secondaryTabContents.forEach(content => {
                    content.classList.remove('active');
                    content.style.display = 'none';
                });
                button.classList.add('active');
                const targetContentId = button.dataset.target;
                const targetContent = document.getElementById(targetContentId);
                if (targetContent) {
                    targetContent.classList.add('active');
                    targetContent.style.display = 'block';
                }
            });
        });

        const defaultSecondaryTabButton = triggerSettingsTab.querySelector(':scope > nav.secondary-tab-nav .nav-button[data-target="disguise-trigger-normal-content"]');
        const defaultSecondaryTabContent = document.getElementById('disguise-trigger-normal-content');
        if (defaultSecondaryTabButton && defaultSecondaryTabContent) {
            secondaryTabButtons.forEach(btn => btn.classList.remove('active'));
            secondaryTabContents.forEach(content => {
                 content.classList.remove('active');
                 content.style.display = 'none';
            });
            defaultSecondaryTabButton.classList.add('active');
            defaultSecondaryTabContent.classList.add('active');
        }
    }

    // Close button listener
    disguisePresetSettingsModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="disguise-preset-settings-modal"][rel="prev"]')) {
            domUtils.closeModal(disguisePresetSettingsModal);
        }
    });

    // Add event listeners for all new sliders in disguise modal
    const sliderConfigs = [
        // Model Settings Sliders
        { sliderId: 'disguise-settings-openai-temperature', valueId: 'disguise-settings-openai-temperature-value' },
        { sliderId: 'disguise-settings-openai-frequency-penalty', valueId: 'disguise-settings-openai-frequency-penalty-value' },
        { sliderId: 'disguise-settings-openai-presence-penalty', valueId: 'disguise-settings-openai-presence-penalty-value' },
        { sliderId: 'disguise-settings-openai-top-p', valueId: 'disguise-settings-openai-top-p-value' },
        // Web Search Settings Sliders
        { sliderId: 'disguise-settings-web-search-openai-temperature', valueId: 'disguise-settings-web-search-openai-temperature-value' },
        { sliderId: 'disguise-settings-web-search-openai-frequency-penalty', valueId: 'disguise-settings-web-search-openai-frequency-penalty-value' },
        { sliderId: 'disguise-settings-web-search-openai-presence-penalty', valueId: 'disguise-settings-web-search-openai-presence-penalty-value' },
        { sliderId: 'disguise-settings-web-search-openai-top-p', valueId: 'disguise-settings-web-search-openai-top-p-value' },
        // AI Trigger Settings Sliders
        { sliderId: 'disguise-settings-ai-trigger-openai-temperature', valueId: 'disguise-settings-ai-trigger-openai-temperature-value' },
        { sliderId: 'disguise-settings-ai-trigger-openai-frequency-penalty', valueId: 'disguise-settings-ai-trigger-openai-frequency-penalty-value' },
        { sliderId: 'disguise-settings-ai-trigger-openai-presence-penalty', valueId: 'disguise-settings-ai-trigger-openai-presence-penalty-value' },
        { sliderId: 'disguise-settings-ai-trigger-openai-top-p', valueId: 'disguise-settings-ai-trigger-openai-top-p-value' },
    ];

    sliderConfigs.forEach(config => {
        const slider = document.getElementById(config.sliderId);
        if (slider) {
            slider.addEventListener('input', () => updateDisguiseSliderValue(config.sliderId, config.valueId));
        }
    });
}