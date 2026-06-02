// Lensly v5 — Background Service Worker

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'toggle-reader-view')
    chrome.tabs.sendMessage(tab.id, { action: 'toggleReaderView' }).catch(() => {});
  else if (command === 'toggle-focus-mode')
    chrome.tabs.sendMessage(tab.id, { action: 'toggleFocusMode' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === 'content') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return sendResponse({ error: 'No active tab' });
      chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
        if (chrome.runtime.lastError)
          sendResponse({ error: chrome.runtime.lastError.message });
        else
          sendResponse(response);
      });
    });
    return true;
  }
});

// Context menu for highlight & save
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lensly-highlight-save',
    title: 'Highlight & Save to Lensly',
    contexts: ['selection'],
  });

  chrome.storage.sync.set({
    readerView: false, focusMode: false, readingRuler: false,
    bionicReading: false, dyslexiaFont: 'none',
    tint: 'none', tintOpacity: 0.15, contrastMode: 'none',
    ttsSpeed: 1.0, ttsPitch: 1.0, ttsVoice: '',
    rulerHeight: 40, rulerOpacity: 0.15, rulerColor: '#6096ba',
    focusSpotlightSize: 240,
    chatbotEnabled: false,
    geminiApiKey: '',
    darkMode: false,
    wordSpacing: 0,
    lineHeight: 0,
    textScale: 100,
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lensly-highlight-save' && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'highlightAndSave',
      text: info.selectionText,
    }).catch(() => {});
  }
});
