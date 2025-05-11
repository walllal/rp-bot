document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginErrorElement = document.getElementById('loginError');

    // Check if already logged in (e.g., token exists and is valid)
    // This is a simple check; a more robust check might involve verifying the token with the backend.
    const token = localStorage.getItem('authToken');
    if (token) {
        // Optionally, verify token with a backend endpoint before redirecting
        // For now, if token exists, assume valid and redirect.
        // window.location.href = '/'; // Redirect to main page
        // Let's not redirect immediately, in case the user explicitly navigated to login.html
        // The main app's JS (main.js) should handle redirection if not on login page and no token.
    }


    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            loginErrorElement.style.display = 'none';
            loginErrorElement.textContent = '';

            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            if (!username || !password) {
                loginErrorElement.textContent = '请输入用户名和密码。';
                loginErrorElement.style.display = 'block';
                return;
            }

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password }),
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    if (data.token) { // If token is present, auth is enabled and login was successful
                        localStorage.setItem('authToken', data.token);
                        window.location.href = '/';
                    } else if (data.authDisabled) { // If auth is disabled, allow access
                        console.log('Authentication is disabled by backend. Proceeding without token.');
                        // No token to set, but access is granted
                        window.location.href = '/';
                    } else {
                        // This case should ideally not happen if backend logic is correct
                        // (i.e., success:true should either have a token or authDisabled:true)
                        loginErrorElement.textContent = data.message || '登录成功，但配置似乎不完整。';
                        loginErrorElement.style.display = 'block';
                    }
                } else {
                    loginErrorElement.textContent = data.message || '登录失败，请检查您的凭据。';
                    loginErrorElement.style.display = 'block';
                }
            } catch (error) {
                console.error('Login request failed:', error);
                loginErrorElement.textContent = '登录请求失败，请稍后重试。';
                loginErrorElement.style.display = 'block';
            }
        });
    } else {
        console.error('Login form not found.');
    }

    // Add class to body for specific login page styling if not already present
    // This helps if login.css targets body.login-body
    if (!document.body.classList.contains('login-body')) {
        document.body.classList.add('login-body');
    }
});