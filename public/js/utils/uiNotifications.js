// --- SweetAlert2 Helper Functions ---

/**
 * 显示一个自动消失的提示 (Toast)
 * @param {string} message 提示信息
 * @param {number} [duration=2000] 显示时长 (毫秒)
 * @param {'success'|'error'|'warning'|'info'|'question'} [icon='success'] 图标类型
 */
export function showToast(message, duration = 2000, icon = 'success') {
    if (typeof Swal === 'undefined') {
        console.warn('SweetAlert2 not loaded, falling back to alert');
        alert(message);
        return;
    }
    Swal.fire({
        toast: true,
        position: 'bottom', // 修改位置从'top-end'到'bottom'，使提示显示在中间下方
        icon: icon,
        title: message,
        showConfirmButton: false,
        timer: duration,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });
}

/**
 * 显示一个确认对话框
 * @param {string} title 标题
 * @param {string} text 内容文本
 * @param {string} [confirmButtonText='确定'] 确认按钮文字
 * @param {string} [cancelButtonText='取消'] 取消按钮文字
 * @param {'warning'|'error'|'success'|'info'|'question'} [icon='warning'] 图标类型
 * @returns {Promise<boolean>} 用户是否点击了确认按钮
 */
export async function showConfirm(title, text, confirmButtonText = '确定', cancelButtonText = '取消', icon = 'warning') {
    if (typeof Swal === 'undefined') {
        console.warn('SweetAlert2 not loaded, falling back to confirm');
        // Fallback for confirm needs careful handling in async context
        // For simplicity, we'll just return the confirm result directly,
        // but this breaks the async flow if Swal is not loaded.
        return confirm(`${title}\n${text}`);
    }
    const result = await Swal.fire({
        title: title,
        text: text,
        icon: icon,
        showCancelButton: true,
        confirmButtonText: confirmButtonText,
        cancelButtonText: cancelButtonText,
        confirmButtonColor: 'var(--pico-primary)', // Use Pico primary color
        cancelButtonColor: 'var(--pico-secondary)', // Use Pico secondary color
        reverseButtons: true, // Put confirm button on the right
        scrollbarPadding: false, // 防止滚动条变化引起的布局位移
        allowOutsideClick: false // 防止意外点击关闭
    });
    return result.isConfirmed;
}

/**
 * 显示一个带输入框的提示框
 * @param {string} title 标题
 * @param {string} inputLabel 输入框标签
 * @param {string} [inputPlaceholder=''] 输入框占位符
 * @param {string} [initialValue=''] 输入框初始值
 * @param {string} [confirmButtonText='确定'] 确认按钮文字
 * @param {string} [cancelButtonText='取消'] 取消按钮文字
 * @param {(value: string) => string | null | Promise<string | null>} [inputValidator] 输入验证函数
 * @returns {Promise<string | null>} 用户输入的值，如果取消则返回 null
 */
export async function showPrompt(title, inputLabel, inputPlaceholder = '', initialValue = '', confirmButtonText = '确定', cancelButtonText = '取消', inputValidator = null) {
    if (typeof Swal === 'undefined') {
        console.warn('SweetAlert2 not loaded, falling back to prompt');
        return prompt(`${title}\n${inputLabel}`, initialValue);
    }
    const result = await Swal.fire({
        title: title,
        input: 'text',
        inputLabel: inputLabel,
        inputPlaceholder: inputPlaceholder,
        inputValue: initialValue,
        showCancelButton: true,
        confirmButtonText: confirmButtonText,
        cancelButtonText: cancelButtonText,
        confirmButtonColor: 'var(--pico-primary)',
        cancelButtonColor: 'var(--pico-secondary)',
        reverseButtons: true,
        inputValidator: inputValidator ? (value) => {
            return new Promise(async (resolve) => { // Validator can be async
                const validationResult = await inputValidator(value);
                resolve(validationResult); // Resolve with null (valid) or error message (invalid)
            });
        } : undefined,
        allowOutsideClick: () => !Swal.isLoading()
    });

    if (result.isConfirmed) {
        return result.value;
    } else {
        return null; // User cancelled
    }
}
/**
 * 显示一个带“是”、“否”、“取消”三个选项的确认对话框
 * @param {string} title 标题
 * @param {string} text 内容文本
 * @param {string} [confirmButtonText='是'] “是”按钮文字
 * @param {string} [denyButtonText='否'] “否”按钮文字
 * @param {string} [cancelButtonText='取消'] “取消”按钮文字
 * @param {'warning'|'error'|'success'|'info'|'question'} [icon='question'] 图标类型
 * @returns {Promise<'yes'|'no'|'cancel'>} 用户选择的结果 ('yes', 'no', 'cancel')
 */
export async function showYesNoCancelConfirm(title, text, confirmButtonText = '是', denyButtonText = '否', cancelButtonText = '取消', icon = 'question') {
    if (typeof Swal === 'undefined') {
        console.warn('SweetAlert2 not loaded, cannot show Yes/No/Cancel confirm.');
        // 提供一个简化的回退，但这不完全模拟三选项
        const confirmed = confirm(`${title}\n${text}\n(OK = 是, Cancel = 取消/否)`);
        return confirmed ? 'yes' : 'cancel'; // 简化回退逻辑
    }
    const result = await Swal.fire({
        title: title,
        text: text,
        icon: icon,
        showConfirmButton: true,
        confirmButtonText: confirmButtonText,
        confirmButtonColor: 'var(--pico-primary)',
        showDenyButton: true, // 显示“否”按钮
        denyButtonText: denyButtonText,
        denyButtonColor: 'var(--pico-secondary)', // 可以为“否”按钮设置不同颜色
        showCancelButton: true, // 显示“取消”按钮
        cancelButtonText: cancelButtonText,
        cancelButtonColor: 'var(--pico-muted-border-color)', // 使用柔和的颜色
        reverseButtons: true, // 按钮顺序: 是, 否, 取消 (从右到左)
        scrollbarPadding: false,
        allowOutsideClick: false
    });

    if (result.isConfirmed) {
        return 'yes';
    } else if (result.isDenied) {
        return 'no';
    } else {
        return 'cancel';
    }
}