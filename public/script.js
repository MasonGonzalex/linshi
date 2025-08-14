// public/script.js (Diagnostic Version V4.2 - Syntax Corrected, Auth Restored)

document.addEventListener("DOMContentLoaded", () => {
    console.log("诊断脚本 V4.2 已加载！恢复认证功能 (语法修正)...");

    // ================== 1. 定义所有 DOM 元素选择器 (确保完整) ==================
    const appContainer = document.getElementById("app-container");
    const authContainer = document.getElementById("auth-container");
    const authForm = document.getElementById("auth-form");
    const authTitle = document.getElementById("auth-title");
    const authUsername = document.getElementById("auth-username");
    const authPassword = document.getElementById("auth-password");
    const authSubmitBtn = document.getElementById("auth-submit-btn");
    const switchAuthModeBtn = document.getElementById("switch-auth-mode");
    const authMessage = document.getElementById("auth-message");
    const newChatBtn = document.getElementById("new-chat-btn");
    const sessionList = document.getElementById("session-list");
    const chatForm = document.getElementById("chat-form");
    const userInput = document.getElementById("user-input");
    const chatBox = document.getElementById("chat-box");
    const modelSelect = document.getElementById("model-select");
    const usernameDisplay = document.getElementById("username-display");
    const logoutBtn = document.getElementById("logout-btn");
    const historyToggleBtn = document.getElementById("history-toggle-btn");
    const historyDrawer = document.getElementById("history-drawer");
    const drawerOverlay = document.getElementById("drawer-overlay");
    const sendButton = chatForm.querySelector("button[type=submit]");
    
    // ================== 2. 定义状态变量 ==================
    let state = {
        token: localStorage.getItem("accessToken"),
        username: localStorage.getItem("username"),
        isRegisterMode: false,
    };

    // ================== 3. 定义所有需要的函数 ==================

    // --- 认证UI切换 ---
    function toggleAuthModeUI() {
        authMessage.textContent = "";
        if (state.isRegisterMode) {
            authTitle.textContent = "注册";
            authSubmitBtn.textContent = "注册";
            switchAuthModeBtn.textContent = "已有账号？点击登录";
        } else {
            authTitle.textContent = "登录";
            authSubmitBtn.textContent = "登录";
            switchAuthModeBtn.textContent = "没有账号？点击注册";
        }
    }

    // --- 登录/注册表单提交逻辑 ---
    async function handleAuthSubmit(event) {
        event.preventDefault();
        const username = authUsername.value;
        const password = authPassword.value;
        const endpoint = state.isRegisterMode ? "/api/auth/register" : "/api/auth/login";
        
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || "操作失败");
            }
            if (state.isRegisterMode) {
                state.isRegisterMode = false;
                toggleAuthModeUI();
                authMessage.style.color = "#0E9F6E";
                authMessage.textContent = "注册成功！请登录。";
            } else {
                state.token = data.accessToken;
                state.username = data.username;
                localStorage.setItem("accessToken", state.token);
                localStorage.setItem("username", state.username);
                initializeApp(); // 登录成功后，重新初始化界面
            }
        } catch (error) {
            authMessage.style.color = "#F05252";
            authMessage.textContent = error.message;
        }
    }

    // --- 视图切换 ---
    function toggleAuthViews(isLoggedIn) {
        if (isLoggedIn) {
            appContainer.classList.remove("hidden");
            authContainer.classList.add("hidden");
            usernameDisplay.textContent = state.username;
            document.title = "【诊断V4.2成功】已登录";
        } else {
            appContainer.classList.add("hidden");
            authContainer.classList.remove("hidden");
            document.title = "【诊断V4.2成功】请登录";
        }
    }

    // --- 主初始化函数 ---
    function initializeApp() {
        console.log("initializeApp 函数被调用。");
        state.token = localStorage.getItem("accessToken");
        state.username = localStorage.getItem("username");
        
        toggleAuthViews(!!state.token);
        
        if (state.token) {
            console.log("已登录，但暂时不加载会话数据。");
            // 清空内容以防旧数据残留
            chatBox.innerHTML = "<p>登录成功！下一步将恢复会话加载功能。</p>";
            sessionList.innerHTML = "";
            modelSelect.innerHTML = "";
        }
    }

    // ================== 4. 绑定事件监听器 ==================
    // 确保在元素存在时才绑定事件，防止 null 错误
    if (switchAuthModeBtn) {
        switchAuthModeBtn.addEventListener("click", (event) => {
            event.preventDefault();
            state.isRegisterMode = !state.isRegisterMode;
            toggleAuthModeUI();
        });
    }

    if (authForm) {
        authForm.addEventListener("submit", handleAuthSubmit);
    }
    
    // ================== 5. 启动应用 ==================
    initializeApp();
});