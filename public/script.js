// script.js (iOS 14.4 深度优化版 - 解决性能瓶颈和UI遮挡问题)
(function() {
'use strict';

// === iOS 14.4 关键修复和优化 ===

// 1. 提前声明全局变量，减少作用域查找
let globalState = null;
let domElements = {};
let apiConfig = {
  requestQueue: [],
  maxConcurrentRequests: 2, // iOS 14.4限制并发
  activeRequests: 0
};

// 2. iOS 14.4 兼容性修复函数
function applyiOS14Fixes() {
  // 修复Chrome顶部横幅遮挡问题
  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover, shrink-to-fit=no');
  }

  // 添加安全区域CSS变量
  document.documentElement.style.setProperty('--safe-area-inset-top', 'env(safe-area-inset-top, 0px)');
  document.documentElement.style.setProperty('--safe-area-inset-bottom', 'env(safe-area-inset-bottom, 0px)');
  
  // iOS 14.4 flexbox修复
  const style = document.createElement('style');
  style.textContent = `
    .header { padding-top: max(12px, env(safe-area-inset-top)) !important; }
    .chat-container { height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important; }
    .main-container { display: -webkit-box !important; display: -webkit-flex !important; }
  `;
  document.head.appendChild(style);
}

// 3. 内存管理优化
function optimizeMemoryUsage() {
  // 限制消息历史长度
  const MAX_MESSAGES = 100;
  
  // 定期清理DOM
  setInterval(() => {
    // 清理过多的聊天消息
    const messages = document.querySelectorAll('.message');
    if (messages.length > MAX_MESSAGES) {
      const toRemove = messages.length - MAX_MESSAGES;
      for (let i = 0; i < toRemove; i++) {
        messages[i].remove();
      }
    }
    
    // 强制垃圾回收提示
    if (window.gc) window.gc();
  }, 60000); // 每分钟清理一次
}

// 4. 事件处理优化 - 使用事件委托
function setupOptimizedEventHandlers() {
  // 统一事件处理器
  document.addEventListener('click', function(e) {
    const target = e.target;
    const closest = target.closest.bind(target);
    
    // 新建对话
    if (closest('#new-chat-btn')) {
      e.preventDefault();
      createNewSession();
      return;
    }
    
    // 会话列表项
    if (closest('#session-list li')) {
      const sessionId = closest('#session-list li').dataset.sessionId;
      if (sessionId) loadSessionMessages(sessionId);
      return;
    }
    
    // 历史记录切换
    if (closest('#history-toggle-btn')) {
      toggleHistoryDrawer();
      return;
    }
    
    // 登出
    if (closest('#logout-btn')) {
      handleLogout();
      return;
    }
    
    // 思考过程切换
    if (closest('.thinking-header')) {
      const wrapper = closest('.message').querySelector('.thought-wrapper');
      const arrow = closest('.thinking-header').querySelector('.arrow');
      if (wrapper && arrow) {
        wrapper.classList.toggle('collapsed');
        arrow.classList.toggle('down');
      }
      return;
    }
    
    // 抽屉遮罩
    if (closest('#drawer-overlay')) {
      closeHistoryDrawer();
      return;
    }
    
    // 认证模式切换
    if (closest('#switch-auth-mode')) {
      e.preventDefault();
      toggleAuthMode();
      return;
    }
  }, { passive: false });
  
  // 表单提交优化
  document.addEventListener('submit', function(e) {
    if (e.target.id === 'auth-form') {
      e.preventDefault();
      handleAuthSubmit();
    } else if (e.target.id === 'chat-form') {
      e.preventDefault();
      handleChatSubmit();
    }
  }, { passive: false });
  
  // 输入优化
  document.addEventListener('input', function(e) {
    if (e.target.id === 'user-input') {
      const btn = domElements.sendButton;
      if (btn) {
        btn.disabled = !e.target.value.trim();
      }
    }
  }, { passive: true });
}

// === 核心状态管理 ===
function initializeState() {
  globalState = {
    sessions: [],
    activeSessionId: null,
    token: localStorage.getItem("accessToken"),
    username: localStorage.getItem("username"),
    isRegisterMode: false,
    currentMessages: [],
    apiProviders: [],
    isLoading: false,
    requestController: null
  };
}

// === DOM 元素缓存 ===
function cacheDOMElements() {
  // NEW: Helper function to convert kebab-case to camelCase
  // e.g., 'app-container' becomes 'appContainer'
  const kebabToCamel = (str) => str.replace(/-(\w)/g, (_, c) => c.toUpperCase());

  const elements = [
    'app-container', 'auth-container', 'auth-form', 'auth-title',
    'auth-username', 'auth-password', 'auth-submit-btn', 'switch-auth-mode',
    'auth-message', 'new-chat-btn', 'session-list', 'chat-form',
    'user-input', 'chat-box', 'model-select', 'username-display',
    'logout-btn', 'history-toggle-btn', 'history-drawer', 'drawer-overlay'
  ];

  elements.forEach(id => {
    // CHANGED: Convert ID to a camelCase key before storing the element
    const key = kebabToCamel(id);
    domElements[key] = document.getElementById(id);
  });

  // This line is fine, 'chatForm' was correctly converted from 'chat-form'
  domElements.sendButton = domElements.chatForm?.querySelector('button[type=submit]');
}

// === 库配置优化 ===
function configureLibraries() {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      highlight: function(code, lang) {
        if (typeof hljs === 'undefined') return code;
        
        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        try {
          return hljs.highlight(code, { language, ignoreIllegals: true }).value;
        } catch (e) {
          try {
            return hljs.highlightAuto(code).value;
          } catch (e) {
            return code;
          }
        }
      },
      breaks: true,
      gfm: true
    });
  }
}

// === 认证功能 ===
function toggleAuthMode() {
  globalState.isRegisterMode = !globalState.isRegisterMode;
  updateAuthUI();
}

function updateAuthUI() {
  if (!domElements.authTitle) return;
  
  domElements.authMessage.textContent = "";
  
  if (globalState.isRegisterMode) {
    domElements.authTitle.textContent = "注册";
    domElements.authSubmitBtn.textContent = "注册";
    domElements.switchAuthModeBtn.textContent = "已有账号？点击登录";
  } else {
    domElements.authTitle.textContent = "登录";
    domElements.authSubmitBtn.textContent = "登录";
    domElements.switchAuthModeBtn.textContent = "没有账号？点击注册";
  }
}

async function handleAuthSubmit() {
  if (globalState.isLoading) return;
  
  const username = domElements.authUsername.value.trim();
  const password = domElements.authPassword.value.trim();
  
  if (!username || !password || password.length < 6) {
    showAuthMessage("用户名或密码格式不正确", "error");
    return;
  }
  
  globalState.isLoading = true;
  domElements.authSubmitBtn.disabled = true;
  domElements.authSubmitBtn.textContent = "处理中...";
  
  try {
    const endpoint = globalState.isRegisterMode ? "/api/auth/register" : "/api/auth/login";
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || "操作失败");
    }
    
    if (globalState.isRegisterMode) {
      globalState.isRegisterMode = false;
      updateAuthUI();
      showAuthMessage("注册成功！请登录。", "success");
    } else {
      globalState.token = data.accessToken;
      globalState.username = data.username;
      localStorage.setItem("accessToken", globalState.token);
      localStorage.setItem("username", globalState.username);
      await initializeApp();
    }
  } catch (error) {
    showAuthMessage(error.message, "error");
  } finally {
    globalState.isLoading = false;
    domElements.authSubmitBtn.disabled = false;
    domElements.authSubmitBtn.textContent = globalState.isRegisterMode ? "注册" : "登录";
  }
}

function showAuthMessage(message, type) {
  if (!domElements.authMessage) return;
  
  domElements.authMessage.style.color = type === "error" ? "#F05252" : "#0E9F6E";
  domElements.authMessage.textContent = message;
  
  setTimeout(() => {
    if (domElements.authMessage) {
      domElements.authMessage.textContent = "";
    }
  }, 5000);
}

function handleLogout() {
  globalState.token = null;
  globalState.username = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("username");
  localStorage.removeItem("lastActiveSessionId");
  toggleAuthViews(false);
}

function toggleAuthViews(isLoggedIn) {
  if (!domElements.appContainer || !domElements.authContainer) return;
  
  if (isLoggedIn) {
    domElements.appContainer.classList.remove("hidden");
    domElements.authContainer.classList.add("hidden");
    if (domElements.usernameDisplay) {
      domElements.usernameDisplay.textContent = globalState.username;
    }
  } else {
    domElements.appContainer.classList.add("hidden");
    domElements.authContainer.classList.remove("hidden");
  }
}

// === 侧边栏管理 ===
function toggleHistoryDrawer() {
  if (!domElements.historyDrawer || !domElements.drawerOverlay) return;
  
  domElements.historyDrawer.classList.toggle("open");
  domElements.drawerOverlay.classList.toggle("visible");
}

function closeHistoryDrawer() {
  if (!domElements.historyDrawer || !domElements.drawerOverlay) return;
  
  domElements.historyDrawer.classList.remove("open");
  domElements.drawerOverlay.classList.remove("visible");
}

// === 网络请求优化 ===
function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const defaultHeaders = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (globalState.token) {
    defaultHeaders["x-access-token"] = globalState.token;
  }
  
  return fetch(url, {
    ...options,
    headers: defaultHeaders,
    signal: controller.signal
  }).then(response => {
    clearTimeout(timeoutId);
    
    if (response.status === 401) {
      handleLogout();
      throw new Error("登录已过期，请重新登录。");
    }
    
    return response;
  }).catch(error => {
    clearTimeout(timeoutId);
    throw error;
  });
}

// === 会话管理 ===
async function loadSessions() {
  try {
    const response = await fetchWithTimeout("/api/sessions");
    const sessions = await response.json();
    
    globalState.sessions = sessions;
    renderSessions();
    
    if (sessions && sessions.length > 0) {
      const lastActiveSessionId = localStorage.getItem("lastActiveSessionId");
      const sessionExists = sessions.some(s => s.id === lastActiveSessionId);
      const activeSessionId = (lastActiveSessionId && sessionExists) ? lastActiveSessionId : sessions[0].id;
      await loadSessionMessages(activeSessionId);
    } else {
      await createNewSession();
    }
  } catch (error) {
    console.error("加载对话列表失败:", error);
  }
}

async function createNewSession() {
  if (globalState.isLoading) return;
  
  try {
    globalState.isLoading = true;
    const response = await fetchWithTimeout("/api/sessions", { method: "POST" });
    const newSession = await response.json();
    
    globalState.sessions.unshift(newSession);
    await loadSessionMessages(newSession.id);
  } catch (error) {
    console.error("创建新对话失败:", error);
  } finally {
    globalState.isLoading = false;
  }
}

async function loadSessionMessages(sessionId) {
  closeHistoryDrawer();
  
  globalState.activeSessionId = sessionId;
  localStorage.setItem("lastActiveSessionId", sessionId);
  renderSessions();
  
  try {
    const response = await fetchWithTimeout(`/api/sessions/${sessionId}/messages`);
    globalState.currentMessages = await response.json();
    renderMessages();
    
    if (domElements.userInput) {
      domElements.userInput.focus();
    }
  } catch (error) {
    console.error(`加载对话 [${sessionId}] 失败:`, error);
    if (domElements.chatBox) {
      domElements.chatBox.innerHTML = `<div class="message assistant" style="color:red">加载消息失败: ${error.message}</div>`;
    }
  }
}

function renderSessions() {
  if (!domElements.sessionList || !globalState.sessions) return;
  
  const fragment = document.createDocumentFragment();
  
  globalState.sessions.forEach((session) => {
    const listItem = document.createElement("li");
    listItem.dataset.sessionId = session.id;
    
    const titleSpan = document.createElement("span");
    titleSpan.className = "session-title";
    titleSpan.textContent = session.title;
    
    const timeSpan = document.createElement("span");
    timeSpan.className = "session-time";
    const date = new Date(session.created_at);
    timeSpan.textContent = date.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).replace(/\//g, "-");
    
    if (session.id === globalState.activeSessionId) {
      listItem.classList.add("active");
    }
    
    listItem.appendChild(titleSpan);
    listItem.appendChild(timeSpan);
    fragment.appendChild(listItem);
  });
  
  domElements.sessionList.innerHTML = "";
  domElements.sessionList.appendChild(fragment);
}

// === 消息渲染优化 ===
function renderMessages() {
  if (!domElements.chatBox) return;
  
  domElements.chatBox.innerHTML = "";
  
  if (globalState.currentMessages) {
    const fragment = document.createDocumentFragment();
    
    globalState.currentMessages
      .filter((msg) => msg.role !== "system")
      .forEach((msg) => {
        try {
          const parsedContent = JSON.parse(msg.content);
          if (parsedContent && typeof parsedContent === 'object' && 'answer' in parsedContent) {
            fragment.appendChild(createThinkingMessage(parsedContent));
          } else {
            fragment.appendChild(createSimpleMessage(msg.content, msg.role));
          }
        } catch (e) {
          fragment.appendChild(createSimpleMessage(msg.content, msg.role));
        }
      });
    
    domElements.chatBox.appendChild(fragment);
  }
  
  scrollToBottom();
}

function createSimpleMessage(content, role) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}`;
  
  if (typeof marked !== 'undefined') {
    messageDiv.innerHTML = marked.parse(String(content));
  } else {
    messageDiv.textContent = content;
  }
  
  // 延迟代码高亮，避免阻塞主线程
  requestAnimationFrame(() => {
    if (typeof hljs !== 'undefined') {
      messageDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  });
  
  return messageDiv;
}

function createThinkingMessage(data) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message assistant";

  const thoughtBlock = (data.thought && data.thought.trim() !== '') ? `
    <div class="thinking-header">
        <span class="timer">思考过程 ${data.duration ? `(${data.duration}秒)` : ''}</span>
        <span class="toggle-thought">
            <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </span>
    </div>
    <div class="thought-wrapper collapsed">
        <div class="thought-process"></div>
    </div>
  ` : '';

  messageDiv.innerHTML = `
    ${thoughtBlock}
    <div class="final-answer"></div>
  `;

  // 延迟渲染内容
  requestAnimationFrame(() => {
    if (data.thought && data.thought.trim() !== '' && typeof marked !== 'undefined') {
      const thoughtDiv = messageDiv.querySelector(".thought-process");
      if (thoughtDiv) {
        thoughtDiv.innerHTML = marked.parse(data.thought);
      }
    }
    
    const answerDiv = messageDiv.querySelector(".final-answer");
    if (answerDiv && typeof marked !== 'undefined') {
      answerDiv.innerHTML = marked.parse(data.answer);
    }
    
    // 代码高亮
    if (typeof hljs !== 'undefined') {
      messageDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  });

  return messageDiv;
}

function scrollToBottom() {
  if (domElements.chatBox) {
    domElements.chatBox.scrollTop = domElements.chatBox.scrollHeight;
  }
}

// === API 提供商管理 ===
async function loadApiProviders() {
  try {
    const response = await fetchWithTimeout("/api/providers");
    const providers = await response.json();
    
    globalState.apiProviders = providers;
    
    if (domElements.modelSelect) {
      domElements.modelSelect.innerHTML = "";
      
      providers.forEach((provider, index) => {
        const option = document.createElement("option");
        option.value = provider.id;
        option.textContent = provider.name;
        if (index === 0) option.selected = true;
        domElements.modelSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("加载 API 列表失败:", error);
    if (domElements.modelSelect) {
      domElements.modelSelect.innerHTML = "<option>加载失败</option>";
    }
  }
}

// === 聊天功能优化 ===
async function handleChatSubmit() {
  if (globalState.isLoading) return;
  
  const message = domElements.userInput.value.trim();
  if (!message || !globalState.activeSessionId) return;

  globalState.isLoading = true;
  domElements.sendButton.disabled = true;
  
  const userMessage = { role: "user", content: message };
  globalState.currentMessages.push(userMessage);
  renderMessages();
  
  domElements.userInput.value = "";
  domElements.userInput.focus();

  try {
    // 保存用户消息
    await fetchWithTimeout(`/api/sessions/${globalState.activeSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(userMessage)
    });

    const apiId = domElements.modelSelect.value;
    await handleStreamingChat(apiId, message);
  } catch (error) {
    console.error("发送消息失败:", error);
    showChatError(error.message);
  } finally {
    globalState.isLoading = false;
    domElements.sendButton.disabled = false;
  }
}

async function handleStreamingChat(apiId, userMessage) {
  const startTime = Date.now();
  
  // 创建AI回复容器
  const assistantMessageDiv = document.createElement("div");
  assistantMessageDiv.className = "message assistant";
  domElements.chatBox.appendChild(assistantMessageDiv);

  // 状态变量
  let currentThought = "";
  let currentAnswer = "";
  let timerElement = null;
  let timerInterval = null;

  // 创建初始UI
  function createInitialUI() {
    assistantMessageDiv.innerHTML = `
      <div class="thinking-header">
          <span class="timer">思考中 0.0 秒</span>
          <span class="toggle-thought">
              <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
      </div>
      <div class="thought-wrapper collapsed">
          <div class="thought-process"></div>
      </div>
      <div class="final-answer"></div>
    `;
    
    timerElement = assistantMessageDiv.querySelector(".timer");
  }

  // 启动计时器
  function startTimer() {
    timerInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (timerElement) {
        timerElement.textContent = `思考中 ${elapsed} 秒`;
      }
    }, 100);
  }

  // 停止计时器
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    const finalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    if (timerElement) {
      timerElement.textContent = `思考了 ${finalTime} 秒`;
    }
    return finalTime;
  }

  // 渲染流式内容
  function renderStreamingContent(thought, answer) {
    const thoughtElement = assistantMessageDiv.querySelector(".thought-process");
    const answerElement = assistantMessageDiv.querySelector(".final-answer");
    
    if (thought !== currentThought) {
      currentThought = thought;
      if (thoughtElement && thought.trim() && typeof marked !== 'undefined') {
        thoughtElement.innerHTML = marked.parse(thought);
        if (typeof hljs !== 'undefined') {
          thoughtElement.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }
      }
    }
    
    if (answer !== currentAnswer) {
      currentAnswer = answer;
      if (answerElement && typeof marked !== 'undefined') {
        answerElement.innerHTML = marked.parse(answer + "▋");
        if (typeof hljs !== 'undefined') {
          answerElement.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        }
      }
    }
    
    scrollToBottom();
  }

  // 完成渲染
  function finalizeContent() {
    const answerElement = assistantMessageDiv.querySelector(".final-answer");
    if (answerElement && typeof marked !== 'undefined') {
      answerElement.innerHTML = marked.parse(currentAnswer);
      if (typeof hljs !== 'undefined') {
        answerElement.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
      }
    }
  }

  try {
    createInitialUI();
    startTimer();

    // 发起聊天请求
    const requestResponse = await fetchWithTimeout("/api/chat-request", {
      method: "POST",
      body: JSON.stringify({
        messages: globalState.currentMessages,
        apiId: apiId
      })
    });

    const requestData = await requestResponse.json();
    
    if (!requestData.taskId) {
      throw new Error("未能获取有效的任务ID");
    }

    const { taskId } = requestData;

    // 轮询获取结果 - iOS 14.4 优化间隔
    await new Promise((resolve, reject) => {
      let pollCount = 0;
      const maxPolls = 300; // 最多轮询5分钟
      
      const pollInterval = setInterval(async () => {
        try {
          pollCount++;
          
          if (pollCount > maxPolls) {
            clearInterval(pollInterval);
            return reject(new Error("请求超时"));
          }

          const pollResponse = await fetchWithTimeout(`/api/chat-poll/${taskId}`, {}, 10000);
          const pollData = await pollResponse.json();
          
          if (pollData.error) {
            clearInterval(pollInterval);
            return reject(new Error(pollData.error));
          }

          // 更新内容
          renderStreamingContent(
            pollData.fullThought || "", 
            pollData.fullAnswer || ""
          );

          // 检查是否完成
          if (pollData.done) {
            clearInterval(pollInterval);
            resolve();
          }
        } catch (error) {
          clearInterval(pollInterval);
          reject(error);
        }
      }, 250); // 250ms轮询间隔，平衡性能和体验
    });

  } catch (error) {
    console.error("聊天请求错误:", error);
    assistantMessageDiv.innerHTML = `
      <div class="final-answer">
        <span style="color: red;">请求处理错误: ${error.message}</span>
      </div>
    `;
    return;
  } finally {
    const duration = stopTimer();
    finalizeContent();

    // 保存消息到数据库
    const messageData = {
      thought: currentThought,
      answer: currentAnswer,
      duration: duration
    };

    const finalMessage = {
      role: "assistant",
      content: JSON.stringify(messageData)
    };
    
    globalState.currentMessages.push(finalMessage);

    try {
      await fetchWithTimeout(`/api/sessions/${globalState.activeSessionId}/messages`, {
        method: "POST",
        body: JSON.stringify(finalMessage)
      });
      await updateSessionTitle(userMessage);
    } catch (e) {
      console.error("保存最终消息失败:", e);
    }
  }
}

function showChatError(message) {
  if (!domElements.chatBox) return;
  
  const errorDiv = document.createElement("div");
  errorDiv.className = "message assistant";
  errorDiv.innerHTML = `<div class="final-answer" style="color: red;">错误: ${message}</div>`;
  domElements.chatBox.appendChild(errorDiv);
  scrollToBottom();
}

async function updateSessionTitle(userMessage) {
  const userMessagesCount = globalState.currentMessages.filter((msg) => msg.role === "user").length;
  
  if (userMessagesCount === 1) {
    const newTitle = userMessage.substring(0, 20);
    try {
      await fetchWithTimeout(`/api/sessions/${globalState.activeSessionId}/title`, {
        method: "PUT",
        body: JSON.stringify({ title: newTitle })
      });
      
      const sessionToUpdate = globalState.sessions.find((s) => s.id === globalState.activeSessionId);
      if (sessionToUpdate) {
        sessionToUpdate.title = newTitle;
        renderSessions();
      }
    } catch (error) {
      console.error("更新标题失败:", error);
    }
  }
}

// === 应用初始化 ===
async function initializeApp() {
  globalState.token = localStorage.getItem("accessToken");
  globalState.username = localStorage.getItem("username");

  toggleAuthViews(!!globalState.token);

  if (globalState.token) {
    await Promise.allSettled([
      loadApiProviders(),
      loadSessions()
    ]);
    
    if (domElements.sendButton) {
      domElements.sendButton.disabled = true;
    }
  }
}

// === 主初始化函数 ===
function initialize() {
  try {
    // 应用iOS 14.4修复
    applyiOS14Fixes();
    
    // 初始化状态
    initializeState();
    
    // 缓存DOM元素
    cacheDOMElements();
    
    // 配置库
    configureLibraries();
    
    // 设置优化的事件处理
    setupOptimizedEventHandlers();
    
    // 内存优化
    optimizeMemoryUsage();
    // 初始化认证UI
    updateAuthUI();

    // 初始化应用
    initializeApp().then(() => {
      console.log("应用初始化完成 - iOS 14.4 优化版");
      // 隐藏loading屏幕
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.opacity = '0';
      }
      // 延迟显示主容器
      setTimeout(() => {
        domElements.appContainer.classList.remove("hidden");
      }, 50);
    }).catch((error) => {
      console.error("初始化错误:", error);
    });
  } catch (error) {
    console.error("初始化错误:", error);
  }
}

// 检测应用是否准备就绪
function checkAppReady() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 50;
    
    const checkInterval = setInterval(() => {
      attempts++;
      
      if (domElements.userInput && domElements.sendButton && globalState.token) {
        clearInterval(checkInterval);
        resolve(true);
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
}

// === 启动应用 ===
// 使用 window.load 事件确保所有资源（包括由其他脚本动态添加的）
// 都已加载完毕，DOM 已经稳定。
function startApplication() {
  // 在启动前再次确认关键元素是否存在
  if (document.getElementById('app-container') && document.getElementById('auth-container')) {
    initialize();
  } else {
    // 如果关键元素仍不存在，延迟重试，作为最后的保险
    console.warn("DOM 元素尚未准备好，延迟启动...");
    setTimeout(startApplication, 100);
  }
}

if (document.readyState === 'complete') {
  // 如果页面已经完全加载，直接启动
  startApplication();
} else {
  // 否则，监听 load 事件
  window.addEventListener('load', startApplication, { once: true });
}

// 隐藏残留的loading屏幕
setTimeout(() => {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
    loadingScreen.style.opacity = '0';
    setTimeout(() => loadingScreen.remove(), 300);
  }
}, 5000);

// 防止内存泄漏的清理函数
window.addEventListener('beforeunload', () => {
  if (globalState.requestController) {
    globalState.requestController.abort();
  }
  
  document.querySelectorAll('.message').forEach(msg => {
    msg.innerHTML = '';
  });
  
  globalState = null;
  domElements = null;
}, { passive: true });

// 导出主函数
window.zhiheAI = {
  initialize,
  handleChatSubmit,
  loadSessions,
  createNewSession,
  toggleHistoryDrawer,
  handleLogout
};

})();