// public/script.js (Diagnostic Version V4 - Restore Authentication)

document.addEventListener("DOMContentLoaded", () => {
    console.log("诊断脚本 V4 已加载！恢复认证功能...");

    // ================== DOM 元素选择器 (保持不变) ==================
    const appContainer = document.getElementById("app-container");
    const authContainer = document.getElementById("auth-container");
    const authForm = document.getElementById("auth-form");
    const authTitle = document.getElementById("auth-title");
    const authUsername = document.getElementById("auth-username");
    const authPassword = document.getElementById("auth-password");
    const authSubmitBtn = document.getElementById("auth-submit-btn");
    const switchAuthModeBtn = document.getElementById("switch-auth-mode");
    const authMessage = document.getElementById("auth-message");
    // ... (其他选择器保持不变)
    const usernameDisplay = document.getElementById("username-display");

    // ================== 状态变量 (只保留必要的) ==================
    let state = {
        token: localStorage.getItem("accessToken"),
        username: localStorage.getItem("username"),
        isRegisterMode: false,
    };
    
    // ================== 步骤 1: 恢复认证相关函数和事件监听 ==================

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

    switchAuthModeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        state.isRegisterMode = !state.isRegisterMode;
        toggleAuthModeUI();
    });

    authForm.addEventListener("submit", async (event) => {
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
                // 登录成功后，重新调用初始化函数来切换界面
                initializeApp();
            }
        } catch (error) {
            authMessage.style.color = "#F05252";
            authMessage.textContent = error.message;
        }
    });
    
    console.log("认证功能和事件监听已恢复。");

    // ================== 步骤 2: 恢复一个稍微复杂点的初始化函数 ==================
    
    function toggleAuthViews(isLoggedIn) {
        if (isLoggedIn) {
            appContainer.classList.remove("hidden");
            authContainer.classList.add("hidden");
            usernameDisplay.textContent = state.username;
            document.title = "【诊断V4成功】已登录，主界面显示";
        } else {
            appContainer.classList.add("hidden");
            authContainer.classList.remove("hidden");
            document.title = "【诊断V4成功】请登录";
        }
    }

    function initializeApp() {
        console.log("initializeApp 函数被调用。");
        // 恢复状态变量的读取
        state.token = localStorage.getItem("accessToken");
        state.username = localStorage.getItem("username");
        
        toggleAuthViews(!!state.token); // 使用 !!state.token 来判断是否已登录
        
        // 在这一版，我们还不加载API和会话，只测试登录
        if (state.token) {
            console.log("已登录，但暂时不加载会话数据。");
            // 在这里清空聊天框和会话列表，以防有旧的渲染残留
            const chatBox = document.getElementById("chat-box");
            const sessionList = document.getElementById("session-list");
            chatBox.innerHTML = "<p>登录成功！下一步将恢复会话加载功能。</p>";
            sessionList.innerHTML = "";
        }
    }
    
    // ================== 步骤 3: 调用初始化函数 ==================
    initializeApp();
});