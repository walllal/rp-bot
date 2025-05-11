// --- 函数处理黑白名单开关状态文本 ---
export function updateSwitchStatusText() {
    // 获取所有状态文本元素
    const switchStatusElements = document.querySelectorAll('.switch-status');

    // 遍历每个状态文本元素
    switchStatusElements.forEach(statusElement => {
        // 获取其所在标签内的开关元素
        const switchElement = statusElement.closest('.switch-label').querySelector('input[role="switch"]');
        if (switchElement) {
            // 根据开关状态设置文本
            statusElement.textContent = switchElement.checked ? '启用' : '禁用';

            // 添加开关状态变化事件
            switchElement.addEventListener('change', function() {
                statusElement.textContent = this.checked ? '启用' : '禁用';
            });
        }
    });
}

// --- 辅助函数 ---
export function setLoading(element, isLoading, colspan = 1) {
    if (isLoading) {
        element.innerHTML = `<tr><td colspan="${colspan}" aria-busy="true">正在加载...</td></tr>`;
    } else {
        if (element.querySelector('tr td[aria-busy="true"]')) {
             element.innerHTML = `<tr><td colspan="${colspan}">暂无数据</td></tr>`;
        }
    }
}

export function showError(element, message, colspan = 1) {
     element.innerHTML = `<tr><td colspan="${colspan}" style="color: var(--pico-del-color);">${message}</td></tr>`;
}

export function openModal(modalElement) {
    if (modalElement) {
        modalElement.setAttribute('open', '');
    } else {
        console.warn('Attempted to open a null modal element.');
    }
}

export function closeModal(modalElement) {
    if (modalElement) {
        modalElement.removeAttribute('open');
    } else {
        console.warn('Attempted to close a null modal element.');
    }
}

export function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = unsafe;
    return div.innerHTML;
}