import apiService from '../services/apiService.js';
import * as uiNotifications from '../utils/uiNotifications.js';
import * as domUtils from '../utils/domUtils.js';

// DOM Elements
let presetSettingsModal, presetSettingsModalTitle, presetSettingsForm, presetSettingsIdInput;

async function handlePresetSettingsFormSubmit(event) {
    event.preventDefault();
    if (!presetSettingsIdInput || !presetSettingsForm) return;

    const id = presetSettingsIdInput.value;
    if (!id) {
        uiNotifications.showToast('无法保存设置：预设 ID 丢失。', 3000, 'error');
        return;
    }

    const settingsData = {
        // Basic Settings
        botName: presetSettingsForm.elements['botName'].value.trim() || null,
        botNicknames: presetSettingsForm.elements['botNicknames'].value.trim() || null,
        chatHistoryLimit: parseInt(presetSettingsForm.elements['chatHistoryLimit'].value, 10) || 10,
        messageHistoryLimit: parseInt(presetSettingsForm.elements['messageHistoryLimit'].value, 10) || 10,
        // Feature Settings
        mode: presetSettingsForm.elements['mode'].checked ? 'ADVANCED' : 'STANDARD',
        advancedModeMessageDelay: parseInt(presetSettingsForm.elements['advancedModeMessageDelay'].value, 10) || 1000,
        botFuzzyMatchEnabled: presetSettingsForm.elements['botFuzzyMatchEnabled'].checked,
        allowImageInput: presetSettingsForm.elements['allowImageInput'].checked,
        allowVoiceOutput: presetSettingsForm.elements['allowVoiceOutput'].checked,
        // Model Settings
        openaiApiKey: presetSettingsForm.elements['openaiApiKey'].value.trim() || null,
        openaiBaseUrl: presetSettingsForm.elements['openaiBaseUrl'].value.trim() || null,
        openaiModel: presetSettingsForm.elements['openaiModel'].value.trim() || 'gpt-3.5-turbo',
        openaiMaxTokens: presetSettingsForm.elements['openaiMaxTokens'].value ? parseInt(presetSettingsForm.elements['openaiMaxTokens'].value, 10) : null,
        openaiTemperature: presetSettingsForm.elements['openaiTemperature'].value ? parseFloat(presetSettingsForm.elements['openaiTemperature'].value) : null,
        openaiFrequencyPenalty: presetSettingsForm.elements['openaiFrequencyPenalty'].value ? parseFloat(presetSettingsForm.elements['openaiFrequencyPenalty'].value) : null,
        openaiPresencePenalty: presetSettingsForm.elements['openaiPresencePenalty'].value ? parseFloat(presetSettingsForm.elements['openaiPresencePenalty'].value) : null,
        openaiTopP: presetSettingsForm.elements['openaiTopP'].value ? parseFloat(presetSettingsForm.elements['openaiTopP'].value) : null,
        // Web Search Settings
        allowWebSearch: presetSettingsForm.elements['allowWebSearch'].checked,
        webSearchApiKey: presetSettingsForm.elements['webSearchApiKey'].value.trim() || null,
        webSearchBaseUrl: presetSettingsForm.elements['webSearchBaseUrl'].value.trim() || null,
        webSearchModel: presetSettingsForm.elements['webSearchModel'].value.trim() || 'gemini-2.0-flash',
        webSearchOpenaiMaxTokens: presetSettingsForm.elements['webSearchOpenaiMaxTokens'].value ? parseInt(presetSettingsForm.elements['webSearchOpenaiMaxTokens'].value, 10) : null,
        webSearchOpenaiTemperature: presetSettingsForm.elements['webSearchOpenaiTemperature'].value ? parseFloat(presetSettingsForm.elements['webSearchOpenaiTemperature'].value) : null,
        webSearchOpenaiFrequencyPenalty: presetSettingsForm.elements['webSearchOpenaiFrequencyPenalty'].value ? parseFloat(presetSettingsForm.elements['webSearchOpenaiFrequencyPenalty'].value) : null,
        webSearchOpenaiPresencePenalty: presetSettingsForm.elements['webSearchOpenaiPresencePenalty'].value ? parseFloat(presetSettingsForm.elements['webSearchOpenaiPresencePenalty'].value) : null,
        webSearchOpenaiTopP: presetSettingsForm.elements['webSearchOpenaiTopP'].value ? parseFloat(presetSettingsForm.elements['webSearchOpenaiTopP'].value) : null,
        webSearchSystemPrompt: presetSettingsForm.elements['webSearchSystemPrompt'].value.trim() || null,
        // Trigger Settings - Normal
        nameTriggered: presetSettingsForm.elements['nameTriggered'].checked,
        nicknameTriggered: presetSettingsForm.elements['nicknameTriggered'].checked,
        atTriggered: presetSettingsForm.elements['atTriggered'].checked,
        replyTriggered: presetSettingsForm.elements['replyTriggered'].checked,
        // Trigger Settings - AI
        timedTriggerEnabled: presetSettingsForm.elements['timedTriggerEnabled'].checked,
        timedTriggerInterval: presetSettingsForm.elements['timedTriggerInterval'].value ? parseInt(presetSettingsForm.elements['timedTriggerInterval'].value, 10) : null,
        quantitativeTriggerEnabled: presetSettingsForm.elements['quantitativeTriggerEnabled'].checked,
        quantitativeTriggerThreshold: presetSettingsForm.elements['quantitativeTriggerThreshold'].value ? parseInt(presetSettingsForm.elements['quantitativeTriggerThreshold'].value, 10) : null,
        aiTriggerApiKey: presetSettingsForm.elements['aiTriggerApiKey'].value.trim() || null,
        aiTriggerBaseUrl: presetSettingsForm.elements['aiTriggerBaseUrl'].value.trim() || null,
        aiTriggerModel: presetSettingsForm.elements['aiTriggerModel'].value.trim() || 'gpt-3.5-turbo',
        aiTriggerOpenaiMaxTokens: presetSettingsForm.elements['aiTriggerOpenaiMaxTokens'].value ? parseInt(presetSettingsForm.elements['aiTriggerOpenaiMaxTokens'].value, 10) : null,
        aiTriggerOpenaiTemperature: presetSettingsForm.elements['aiTriggerOpenaiTemperature'].value ? parseFloat(presetSettingsForm.elements['aiTriggerOpenaiTemperature'].value) : null,
        aiTriggerOpenaiFrequencyPenalty: presetSettingsForm.elements['aiTriggerOpenaiFrequencyPenalty'].value ? parseFloat(presetSettingsForm.elements['aiTriggerOpenaiFrequencyPenalty'].value) : null,
        aiTriggerOpenaiPresencePenalty: presetSettingsForm.elements['aiTriggerOpenaiPresencePenalty'].value ? parseFloat(presetSettingsForm.elements['aiTriggerOpenaiPresencePenalty'].value) : null,
        aiTriggerOpenaiTopP: presetSettingsForm.elements['aiTriggerOpenaiTopP'].value ? parseFloat(presetSettingsForm.elements['aiTriggerOpenaiTopP'].value) : null,
        aiTriggerKeyword: presetSettingsForm.elements['aiTriggerKeyword'].value.trim() || null,
        aiTriggerKeywordFuzzyMatch: presetSettingsForm.elements['aiTriggerKeywordFuzzyMatch'].checked,
        aiTriggerSystemPrompt: presetSettingsForm.elements['aiTriggerSystemPrompt'].value.trim() || null,
        aiTriggerUserPrompt: presetSettingsForm.elements['aiTriggerUserPrompt'].value.trim() || null,
    };

    const saveButton = presetSettingsForm.querySelector('button[type="submit"]');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = '保存中...';
    }

    try {
        await apiService.updatePreset(id, settingsData);
        uiNotifications.showToast('预设设置已保存！');
        domUtils.closeModal(presetSettingsModal);
        // Optionally notify presetManager to update its cache if needed
        // e.g., if (window.updatePresetCache) window.updatePresetCache(id, settingsData);
    } catch (error) {
        console.error(`更新预设 ${id} 设置失败:`, error);
        let errorData = { error: '更新预设设置时发生未知错误' };
         if (error instanceof Response) {
            try { errorData = await error.json(); } catch (e) { /* ignore */ }
        } else if (error.message) { errorData.error = error.message; }
        uiNotifications.showToast(`保存设置失败: ${errorData.error}`, 4000, 'error');
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = '保存设置';
        }
    }
}

export async function openPresetSettingsModal(presetId) {
    if (!presetId || !presetSettingsModal || !presetSettingsIdInput || !presetSettingsModalTitle || !presetSettingsForm) {
         console.error("Preset settings modal or required elements not found/initialized.");
         uiNotifications.showToast('无法打开预设设置。', 3000, 'error');
         return;
    }

    try {
        // 1. Fetch preset data
        const preset = await apiService.getPreset(presetId);

        // 2. Populate the settings modal form
        presetSettingsIdInput.value = preset.id;
        presetSettingsModalTitle.textContent = `预设设置: ${domUtils.escapeHtml(preset.name)}`;

        // Populate fields - Basic Settings
        presetSettingsForm.elements['botName'].value = preset.botName || '';
        presetSettingsForm.elements['botNicknames'].value = preset.botNicknames || '';
        presetSettingsForm.elements['chatHistoryLimit'].value = preset.chatHistoryLimit ?? 10;
        presetSettingsForm.elements['messageHistoryLimit'].value = preset.messageHistoryLimit ?? 10;

        // Populate fields - Feature Settings
        presetSettingsForm.elements['mode'].checked = preset.mode === 'ADVANCED';
        presetSettingsForm.elements['advancedModeMessageDelay'].value = preset.advancedModeMessageDelay ?? 1000;
        presetSettingsForm.elements['botFuzzyMatchEnabled'].checked = preset.botFuzzyMatchEnabled ?? false;
        presetSettingsForm.elements['allowImageInput'].checked = preset.allowImageInput ?? false;
        presetSettingsForm.elements['allowVoiceOutput'].checked = preset.allowVoiceOutput ?? false;

        // Populate fields - Model Settings
        presetSettingsForm.elements['openaiApiKey'].value = preset.openaiApiKey || '';
        presetSettingsForm.elements['openaiBaseUrl'].value = preset.openaiBaseUrl || '';
        presetSettingsForm.elements['openaiModel'].value = preset.openaiModel || 'gpt-3.5-turbo';
        presetSettingsForm.elements['openaiMaxTokens'].value = preset.openaiMaxTokens ?? ''; // Default to empty for placeholder
        presetSettingsForm.elements['openaiTemperature'].value = preset.openaiTemperature ?? 1.0;
        presetSettingsForm.elements['openaiFrequencyPenalty'].value = preset.openaiFrequencyPenalty ?? 0.0;
        presetSettingsForm.elements['openaiPresencePenalty'].value = preset.openaiPresencePenalty ?? 0.0;
        presetSettingsForm.elements['openaiTopP'].value = preset.openaiTopP ?? 1.0;
        // Update slider value displays for Model Settings
        updateSliderValue('preset-settings-openai-temperature', 'preset-settings-openai-temperature-value');
        updateSliderValue('preset-settings-openai-frequency-penalty', 'preset-settings-openai-frequency-penalty-value');
        updateSliderValue('preset-settings-openai-presence-penalty', 'preset-settings-openai-presence-penalty-value');
        updateSliderValue('preset-settings-openai-top-p', 'preset-settings-openai-top-p-value');


        // Populate fields - Web Search Settings
        presetSettingsForm.elements['allowWebSearch'].checked = preset.allowWebSearch ?? false;
        presetSettingsForm.elements['webSearchApiKey'].value = preset.webSearchApiKey || '';
        presetSettingsForm.elements['webSearchBaseUrl'].value = preset.webSearchBaseUrl || '';
        presetSettingsForm.elements['webSearchModel'].value = preset.webSearchModel || 'gemini-2.0-flash';
        presetSettingsForm.elements['webSearchOpenaiMaxTokens'].value = preset.webSearchOpenaiMaxTokens ?? '';
        presetSettingsForm.elements['webSearchOpenaiTemperature'].value = preset.webSearchOpenaiTemperature ?? 1.0;
        presetSettingsForm.elements['webSearchOpenaiFrequencyPenalty'].value = preset.webSearchOpenaiFrequencyPenalty ?? 0.0;
        presetSettingsForm.elements['webSearchOpenaiPresencePenalty'].value = preset.webSearchOpenaiPresencePenalty ?? 0.0;
        presetSettingsForm.elements['webSearchOpenaiTopP'].value = preset.webSearchOpenaiTopP ?? 1.0;
        presetSettingsForm.elements['webSearchSystemPrompt'].value = preset.webSearchSystemPrompt || '';
        // Update slider value displays for Web Search Settings
        updateSliderValue('preset-settings-web-search-openai-temperature', 'preset-settings-web-search-openai-temperature-value');
        updateSliderValue('preset-settings-web-search-openai-frequency-penalty', 'preset-settings-web-search-openai-frequency-penalty-value');
        updateSliderValue('preset-settings-web-search-openai-presence-penalty', 'preset-settings-web-search-openai-presence-penalty-value');
        updateSliderValue('preset-settings-web-search-openai-top-p', 'preset-settings-web-search-openai-top-p-value');

        // Populate fields - Trigger Settings - Normal
        presetSettingsForm.elements['nameTriggered'].checked = preset.nameTriggered ?? true;
        presetSettingsForm.elements['nicknameTriggered'].checked = preset.nicknameTriggered ?? true;
        presetSettingsForm.elements['atTriggered'].checked = preset.atTriggered ?? true;
        presetSettingsForm.elements['replyTriggered'].checked = preset.replyTriggered ?? true;
        // Populate fields - Trigger Settings - AI
        presetSettingsForm.elements['timedTriggerEnabled'].checked = preset.timedTriggerEnabled ?? false;
        presetSettingsForm.elements['timedTriggerInterval'].value = preset.timedTriggerInterval ?? '';
        presetSettingsForm.elements['quantitativeTriggerEnabled'].checked = preset.quantitativeTriggerEnabled ?? false;
        presetSettingsForm.elements['quantitativeTriggerThreshold'].value = preset.quantitativeTriggerThreshold ?? '';
        presetSettingsForm.elements['aiTriggerApiKey'].value = preset.aiTriggerApiKey || '';
        presetSettingsForm.elements['aiTriggerBaseUrl'].value = preset.aiTriggerBaseUrl || '';
        presetSettingsForm.elements['aiTriggerModel'].value = preset.aiTriggerModel || 'gpt-3.5-turbo';
        presetSettingsForm.elements['aiTriggerOpenaiMaxTokens'].value = preset.aiTriggerOpenaiMaxTokens ?? '';
        presetSettingsForm.elements['aiTriggerOpenaiTemperature'].value = preset.aiTriggerOpenaiTemperature ?? 1.0;
        presetSettingsForm.elements['aiTriggerOpenaiFrequencyPenalty'].value = preset.aiTriggerOpenaiFrequencyPenalty ?? 0.0;
        presetSettingsForm.elements['aiTriggerOpenaiPresencePenalty'].value = preset.aiTriggerOpenaiPresencePenalty ?? 0.0;
        presetSettingsForm.elements['aiTriggerOpenaiTopP'].value = preset.aiTriggerOpenaiTopP ?? 1.0;
        presetSettingsForm.elements['aiTriggerKeyword'].value = preset.aiTriggerKeyword || '';
        presetSettingsForm.elements['aiTriggerKeywordFuzzyMatch'].checked = preset.aiTriggerKeywordFuzzyMatch ?? false;
        presetSettingsForm.elements['aiTriggerSystemPrompt'].value = preset.aiTriggerSystemPrompt || '';
        presetSettingsForm.elements['aiTriggerUserPrompt'].value = preset.aiTriggerUserPrompt || '';
        // Update slider value displays for AI Trigger Settings
        updateSliderValue('preset-settings-ai-trigger-openai-temperature', 'preset-settings-ai-trigger-openai-temperature-value');
        updateSliderValue('preset-settings-ai-trigger-openai-frequency-penalty', 'preset-settings-ai-trigger-openai-frequency-penalty-value');
        updateSliderValue('preset-settings-ai-trigger-openai-presence-penalty', 'preset-settings-ai-trigger-openai-presence-penalty-value');
        updateSliderValue('preset-settings-ai-trigger-openai-top-p', 'preset-settings-ai-trigger-openai-top-p-value');

        // 3. Open the modal
        domUtils.openModal(presetSettingsModal);

    } catch (error) {
        console.error(`加载预设 ${presetId} 设置失败:`, error);
        uiNotifications.showToast('加载预设设置失败', 3000, 'error');
    }
}

// Helper function to update slider value display
function updateSliderValue(sliderId, valueDisplayId) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueDisplayId);
    if (slider && valueDisplay) {
        valueDisplay.textContent = parseFloat(slider.value).toFixed(2);
    }
}

export function initPresetSettingsModal() {
    presetSettingsModal = document.getElementById('preset-settings-modal');
    presetSettingsModalTitle = document.getElementById('preset-settings-modal-title');
    presetSettingsForm = document.getElementById('preset-settings-form');
    presetSettingsIdInput = document.getElementById('preset-settings-id');

    if (!presetSettingsModal || !presetSettingsForm) {
        console.error("Preset settings modal or form not found!");
        return;
    }

    presetSettingsForm.addEventListener('submit', handlePresetSettingsFormSubmit);

    // Main Tab navigation logic
    const mainTabButtons = presetSettingsModal.querySelectorAll('form#preset-settings-form > nav.settings-modal-sub-nav .nav-button');
    const mainTabContents = presetSettingsModal.querySelectorAll('.settings-modal-content-container > .settings-modal-tab-content');

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
                if (targetContentId === 'preset-settings-trigger-content') {
                    const triggerSettingsTab = document.getElementById('preset-settings-trigger-content');
                    const defaultSecondaryTabButton = triggerSettingsTab.querySelector('.secondary-tab-nav .nav-button[data-target="preset-trigger-normal-content"]');
                    const defaultSecondaryTabContent = document.getElementById('preset-trigger-normal-content');
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
    const defaultMainTabButton = presetSettingsModal.querySelector('form#preset-settings-form > nav.settings-modal-sub-nav .nav-button[data-target="preset-settings-basic-content"]');
    const defaultMainTabContent = document.getElementById('preset-settings-basic-content');
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

    // Secondary Tab navigation logic (within Trigger Settings Tab)
    const triggerSettingsTab = document.getElementById('preset-settings-trigger-content');
    if (triggerSettingsTab) {
        const secondaryTabButtons = triggerSettingsTab.querySelectorAll(':scope > nav.secondary-tab-nav .nav-button');
        const secondaryTabContents = triggerSettingsTab.querySelectorAll(':scope > .settings-modal-tab-content'); // Direct children content divs

        secondaryTabButtons.forEach(button => {
            button.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent main tab click listener from firing
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
        
        // Set default secondary tab (Normal Triggers) when initPresetSettingsModal is called.
        // This will be correctly shown/hidden by the main tab logic.
        const defaultSecondaryTabButton = triggerSettingsTab.querySelector(':scope > nav.secondary-tab-nav .nav-button[data-target="preset-trigger-normal-content"]');
        const defaultSecondaryTabContent = document.getElementById('preset-trigger-normal-content');
        if (defaultSecondaryTabButton && defaultSecondaryTabContent) {
            secondaryTabButtons.forEach(btn => btn.classList.remove('active'));
            secondaryTabContents.forEach(content => {
                 content.classList.remove('active');
                 content.style.display = 'none';
            });
            defaultSecondaryTabButton.classList.add('active');
            defaultSecondaryTabContent.classList.add('active');
            // Visibility of defaultSecondaryTabContent is handled by the main tab's click listener
            // when 'preset-settings-trigger-content' becomes active.
        }
    }

    // Close button listener
    presetSettingsModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-target="preset-settings-modal"][rel="prev"]')) {
            domUtils.closeModal(presetSettingsModal);
        }
    });

    // Add event listeners for all new sliders
    const sliderConfigs = [
        // Model Settings Sliders
        { sliderId: 'preset-settings-openai-temperature', valueId: 'preset-settings-openai-temperature-value' },
        { sliderId: 'preset-settings-openai-frequency-penalty', valueId: 'preset-settings-openai-frequency-penalty-value' },
        { sliderId: 'preset-settings-openai-presence-penalty', valueId: 'preset-settings-openai-presence-penalty-value' },
        { sliderId: 'preset-settings-openai-top-p', valueId: 'preset-settings-openai-top-p-value' },
        // Web Search Settings Sliders
        { sliderId: 'preset-settings-web-search-openai-temperature', valueId: 'preset-settings-web-search-openai-temperature-value' },
        { sliderId: 'preset-settings-web-search-openai-frequency-penalty', valueId: 'preset-settings-web-search-openai-frequency-penalty-value' },
        { sliderId: 'preset-settings-web-search-openai-presence-penalty', valueId: 'preset-settings-web-search-openai-presence-penalty-value' },
        { sliderId: 'preset-settings-web-search-openai-top-p', valueId: 'preset-settings-web-search-openai-top-p-value' },
        // AI Trigger Settings Sliders
        { sliderId: 'preset-settings-ai-trigger-openai-temperature', valueId: 'preset-settings-ai-trigger-openai-temperature-value' },
        { sliderId: 'preset-settings-ai-trigger-openai-frequency-penalty', valueId: 'preset-settings-ai-trigger-openai-frequency-penalty-value' },
        { sliderId: 'preset-settings-ai-trigger-openai-presence-penalty', valueId: 'preset-settings-ai-trigger-openai-presence-penalty-value' },
        { sliderId: 'preset-settings-ai-trigger-openai-top-p', valueId: 'preset-settings-ai-trigger-openai-top-p-value' },
    ];

    sliderConfigs.forEach(config => {
        const slider = document.getElementById(config.sliderId);
        if (slider) {
            slider.addEventListener('input', () => updateSliderValue(config.sliderId, config.valueId));
        }
    });
}