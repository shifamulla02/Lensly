/**
 * Lensly Chatbot v4 — Floating page assistant
 * - OFF by default
 * - Only injected when toggled on via popup
 * - Reads current page content as context, answers via Groq API
 */
window.LenslyChatbot = (function () {
  let chatHistory = [];
  let pageContext = '';
  let apiKey = '';
  let isOpen = false;
  let isInjected = false;

  function getPageContext() {
    const reader = document.getElementById('lensly-reader-content');
    const src = reader || document.body;
    return (src.innerText || src.textContent || '').trim().slice(0, 15000);
  }

  function loadApiKey() {
    return new Promise(resolve => {
      try {
        chrome.storage.sync.get('groqApiKey', d => resolve(d?.groqApiKey || ''));
      } catch (e) { resolve(''); }
    });
  }

  function buildUI() {
    if (document.getElementById('lensly-chat-root')) return;

    const root = document.createElement('div');
    root.id = 'lensly-chat-root';
    root.innerHTML = `
      <button id="lensly-chat-bubble" aria-label="Open Lensly Chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <div id="lensly-chat-panel" aria-hidden="true">
        <div id="lensly-chat-header">
          <div id="lensly-chat-header-info">
            <div id="lensly-chat-title">Page Assistant</div>
            <div id="lensly-chat-subtitle">Ask anything about this page</div>
          </div>
          <div id="lensly-chat-header-btns">
            <button id="lensly-chat-clear" title="Clear chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.01"/></svg>
            </button>
            <button id="lensly-chat-close" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div id="lensly-chat-messages">
          <div class="lensly-chat-msg lensly-chat-msg-ai">
            <div class="lensly-chat-bubble-text">Hello! I have read this page and I am ready to answer your questions about it.</div>
          </div>
        </div>
        <div id="lensly-chat-input-row">
          <textarea id="lensly-chat-input" placeholder="Ask about this page..." rows="1" aria-label="Your question"></textarea>
          <button id="lensly-chat-send" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
      </div>`;
    document.body.appendChild(root);

    document.getElementById('lensly-chat-bubble').addEventListener('click', toggleChat);
    document.getElementById('lensly-chat-close').addEventListener('click', closeChat);
    document.getElementById('lensly-chat-clear').addEventListener('click', clearChat);
    document.getElementById('lensly-chat-send').addEventListener('click', sendMessage);

    const input = document.getElementById('lensly-chat-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    isInjected = true;
  }

  function toggleChat() { isOpen ? closeChat() : openChat(); }

  function openChat() {
    isOpen = true;
    const panel = document.getElementById('lensly-chat-panel');
    const bubble = document.getElementById('lensly-chat-bubble');
    if (panel) { panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false'); }
    if (bubble) bubble.classList.add('active');
    pageContext = getPageContext();
    loadApiKey().then(k => { apiKey = k; });
    setTimeout(() => document.getElementById('lensly-chat-input')?.focus(), 200);
  }

  function closeChat() {
    isOpen = false;
    const panel = document.getElementById('lensly-chat-panel');
    const bubble = document.getElementById('lensly-chat-bubble');
    if (panel) { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); }
    if (bubble) bubble.classList.remove('active');
  }

  function clearChat() {
    chatHistory = [];
    const msgs = document.getElementById('lensly-chat-messages');
    if (msgs) msgs.innerHTML = `
      <div class="lensly-chat-msg lensly-chat-msg-ai">
        <div class="lensly-chat-bubble-text">Chat cleared. Ask me anything about this page.</div>
      </div>`;
  }

  function appendMessage(role, text, isLoading = false) {
    const msgs = document.getElementById('lensly-chat-messages');
    if (!msgs) return null;
    const div = document.createElement('div');
    div.className = `lensly-chat-msg lensly-chat-msg-${role === 'user' ? 'user' : 'ai'}`;
    if (isLoading) {
      div.id = 'lensly-chat-loading-msg';
      div.innerHTML = `<div class="lensly-chat-bubble-text lensly-chat-typing"><span></span><span></span><span></span></div>`;
    } else {
      const bubble = document.createElement('div');
      bubble.className = 'lensly-chat-bubble-text';
      bubble.textContent = text;
      div.appendChild(bubble);
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  async function sendMessage() {
    const input = document.getElementById('lensly-chat-input');
    const sendBtn = document.getElementById('lensly-chat-send');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    if (sendBtn) sendBtn.disabled = true;

    appendMessage('user', text);
    chatHistory.push({ role: 'user', content: text });

    const loadingEl = appendMessage('ai', '', true);

    try {
      pageContext = getPageContext();
      apiKey = await loadApiKey();

      let reply;
      if (apiKey && window.LenslySummarizer?.groqChat) {
        reply = await window.LenslySummarizer.groqChat(chatHistory, pageContext, apiKey);
      } else {
        reply = 'Please add your Groq API key in the Lensly Settings tab to enable AI answers.';
      }

      chatHistory.push({ role: 'assistant', content: reply });
      if (loadingEl) loadingEl.remove();
      appendMessage('ai', reply);
    } catch (err) {
      if (loadingEl) loadingEl.remove();
      appendMessage('ai', 'Error: ' + err.message);
    }

    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function enable() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', enable, { once: true });
      return;
    }
    if (!isInjected) buildUI();
    const root = document.getElementById('lensly-chat-root');
    if (root) root.style.display = 'block';
  }

  function disable() {
    closeChat();
    const root = document.getElementById('lensly-chat-root');
    if (root) root.style.display = 'none';
  }

  function destroy() {
    closeChat();
    document.getElementById('lensly-chat-root')?.remove();
    isInjected = false;
    chatHistory = [];
  }

  return { enable, disable, destroy, openChat, closeChat };
})();

// Auto-init from storage — only enable if user has toggled it on
try {
  chrome.storage.sync.get('chatbotEnabled', d => {
    if (d?.chatbotEnabled) {
      // Wait for body before enabling
      if (document.body) window.LenslyChatbot.enable();
      else document.addEventListener('DOMContentLoaded', () => window.LenslyChatbot.enable(), { once: true });
    }
  });
} catch (e) { /* chrome.storage not available */ }
