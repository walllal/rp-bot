// Navigation Elements
let mainNav, navButtons, tabContents;
let settingsSubNav, settingsSubNavButtons, settingsSubTabContents;
let presetSubNav, historySubNav, variablesSubNav; // +++ Added variablesSubNav
 
function switchTab(targetId) {
    // Deactivate all buttons and hide all content
    navButtons.forEach(button => button.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));

    // Activate the target button and content
    const targetButton = mainNav.querySelector(`.nav-button[data-target="${targetId}"]`);
    const targetContent = document.getElementById(targetId);

    if (targetButton) {
        targetButton.classList.add('active');
    }
    if (targetContent) {
        targetContent.classList.add('active');

        // 处理子导航初始激活状态
        if (targetId === 'tab-content-preset-category') {
            const subNav = document.getElementById('preset-sub-nav'); // Get sub-nav element
            if (subNav) {
                const activeSubButton = subNav.querySelector('.nav-button.active') || subNav.querySelector('.nav-button');
                if (activeSubButton && activeSubButton.dataset.target) {
                    switchSubTab('preset-sub-content', activeSubButton.dataset.target);
                }
            }
        } else if (targetId === 'tab-content-disguise-category') { // Added case for disguise category
             const subNav = document.getElementById('disguise-preset-sub-nav'); // Get disguise sub-nav element
             if (subNav) {
                const activeSubButton = subNav.querySelector('.nav-button.active') || subNav.querySelector('.nav-button');
                if (activeSubButton && activeSubButton.dataset.target) {
                    switchSubTab('disguise-preset-sub-content', activeSubButton.dataset.target); // Use disguise container ID
                }
            }
        } else if (targetId === 'tab-content-history-category') {
            if (historySubNav) {
                const activeSubButton = historySubNav.querySelector('.nav-button.active') ||
                                       historySubNav.querySelector('.nav-button');
                if (activeSubButton && activeSubButton.dataset.target) {
                    switchSubTab('history-sub-content', activeSubButton.dataset.target);
                }
            }
        } else if (targetId === 'tab-content-settings') { // Ensure settings sub-nav initializes
             if (settingsSubNav) {
                const initialActiveSettingsSubButton = settingsSubNav.querySelector('.nav-button.active') || settingsSubNav.querySelector('.nav-button[data-target="settings-sub-tab-connection"]');
                if (initialActiveSettingsSubButton && initialActiveSettingsSubButton.dataset.target) {
                    switchSettingsSubTab(initialActiveSettingsSubButton.dataset.target);
                }
            }
        } else if (targetId === 'tab-content-variables-category') { // +++ Handle Variables Category
            if (variablesSubNav) {
                const activeSubButton = variablesSubNav.querySelector('.nav-button.active') || variablesSubNav.querySelector('.nav-button');
                if (activeSubButton && activeSubButton.dataset.target) {
                    switchSubTab('variables-sub-content', activeSubButton.dataset.target);
                }
            }
        }
    } else {
        console.error(`Tab content with ID ${targetId} not found.`);
        // Optionally show the first tab as a fallback
        document.querySelector('#main-nav .nav-button')?.classList.add('active');
        document.querySelector('.tab-content')?.classList.add('active');
    }
}

// 切换子标签页的函数
function switchSubTab(containerID, targetId) {
    const container = document.getElementById(containerID);
    if (!container) return;

    // 隐藏该容器下所有子页面
    const subContents = container.querySelectorAll('.sub-tab-content');
    subContents.forEach(content => content.classList.remove('active'));

    // 激活目标子页面
    const targetContent = document.getElementById(targetId);
    if (targetContent) {
        targetContent.classList.add('active');
    }
}

function switchSettingsSubTab(targetId) {
    settingsSubNavButtons?.forEach(button => button.classList.remove('active'));
    settingsSubTabContents.forEach(content => content.classList.remove('active'));

    const targetButton = settingsSubNav?.querySelector(`.nav-button[data-target="${targetId}"]`);
    const targetContent = document.getElementById(targetId);

    if (targetButton) {
        targetButton.classList.add('active');
    }
    if (targetContent) {
        targetContent.classList.add('active');
    } else {
        console.error(`Settings sub-tab content with ID ${targetId} not found.`);
        settingsSubNav?.querySelector('.nav-button')?.classList.add('active');
        document.querySelector('.settings-sub-tab')?.classList.add('active');
    }
}

export function initNavigation() {
    mainNav = document.getElementById('main-nav');
    navButtons = mainNav.querySelectorAll('.nav-button');
    tabContents = document.querySelectorAll('.tab-content');

    settingsSubNav = document.getElementById('settings-sub-nav');
    settingsSubNavButtons = settingsSubNav?.querySelectorAll('.nav-button');
    settingsSubTabContents = document.querySelectorAll('.settings-sub-tab');

    presetSubNav = document.getElementById('preset-sub-nav'); // Keep for preset
    historySubNav = document.getElementById('history-sub-nav');
    const disguisePresetSubNav = document.getElementById('disguise-preset-sub-nav'); // Get disguise sub-nav
    variablesSubNav = document.getElementById('variables-sub-nav'); // +++ Get variables sub-nav
 
    mainNav.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('nav-button') && target.dataset.target) {
            switchTab(target.dataset.target);
        }
    });

    if (presetSubNav) {
        presetSubNav.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('nav-button') && target.dataset.target) {
                presetSubNav.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
                switchSubTab('preset-sub-content', target.dataset.target);
            }
        });
    }

    if (historySubNav) {
        historySubNav.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('nav-button') && target.dataset.target) {
                historySubNav.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
                switchSubTab('history-sub-content', target.dataset.target);
            }
        });
    }

    // Add listener for disguise sub-nav
    if (disguisePresetSubNav) {
        disguisePresetSubNav.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('nav-button') && target.dataset.target) {
                disguisePresetSubNav.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
                switchSubTab('disguise-preset-sub-content', target.dataset.target); // Use disguise container ID
            }
        });
    }

    if (settingsSubNav) {
        settingsSubNav.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('nav-button') && target.dataset.target) {
                switchSettingsSubTab(target.dataset.target);
            }
        });
    }
 
    // +++ Add listener for variables sub-nav +++
    if (variablesSubNav) {
        variablesSubNav.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('nav-button') && target.dataset.target) {
                variablesSubNav.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
                target.classList.add('active');
                switchSubTab('variables-sub-content', target.dataset.target);
            }
        });
    }

    // Initialize the first tab as active on page load
    const initialActiveButton = mainNav.querySelector('.nav-button.active');
    if (initialActiveButton && initialActiveButton.dataset.target) {
        switchTab(initialActiveButton.dataset.target);
    } else {
        // Fallback if no button is initially active
        const firstNavButton = mainNav.querySelector('.nav-button');
        if (firstNavButton && firstNavButton.dataset.target) {
            switchTab(firstNavButton.dataset.target);
        }
    }
}