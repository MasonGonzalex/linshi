// public/script.js (Diagnostic Version V3 - Proven Stable)

document.addEventListener("DOMContentLoaded", () => {
    console.log("诊断脚本 V3 已加载！进行 CSS 强制显示测试...");

    const appContainer = document.getElementById("app-container");
    const authContainer = document.getElementById("auth-container");
    const usernameDisplay = document.getElementById("username-display"); // 确保这个变量被定义

    function initializeApp() {
        console.log("initializeApp 函数被调用。");
        const token = localStorage.getItem("accessToken");

        if (token) {
            console.log("检测到 Token，显示主应用界面。");
            appContainer.classList.remove("hidden");
            authContainer.classList.add("hidden");
            usernameDisplay.textContent = localStorage.getItem("username");
            document.title = "【诊断V5】主界面";
        } else {
            console.log("未检测到 Token，显示登录界面。");
            appContainer.classList.add("hidden");
            authContainer.classList.remove("hidden");
            document.title = "【诊断V5】登录界面";
        }
    }
    
    initializeApp();
});