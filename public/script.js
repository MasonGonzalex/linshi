// public/script.js (Diagnostic Version V3 - Restore UI Structure)

document.addEventListener("DOMContentLoaded", () => {
    console.log("诊断脚本 V3 已加载！开始恢复UI...");

    // ================== 步骤 1: 恢复所有 DOM 元素选择器 ==================
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
    
    console.log("所有 DOM 元素已成功选择。");

    // ================== 步骤 2: 恢复一个极简的初始化函数 ==================
    function initializeApp() {
        console.log("initializeApp 函数被调用。");
        
        // 检查 localstorage 中是否有 token
        const token = localStorage.getItem("accessToken");

        if (token) {
            console.log("检测到 Token，显示主应用界面。");
            appContainer.classList.remove("hidden");
            authContainer.classList.add("hidden");
            document.title = "【诊断V3成功】主界面已显示";
        } else {
            console.log("未检测到 Token，显示登录界面。");
            appContainer.classList.add("hidden");
            authContainer.classList.remove("hidden");
            document.title = "【诊断V3成功】登录界面已显示";
        }
    }
    
    // ================== 步骤 3: 调用初始化函数 ==================
    initializeApp();
});