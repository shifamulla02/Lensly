// Lensly v5 — Content Script
(function () {
  'use strict';
  if (window.__lenslyLoaded) return;
  window.__lenslyLoaded = true;

  // ── State ──────────────────────────────────────────────────────────────────
  const S = {
    readerView: false, focusMode: false, readingRuler: false,
    bionicReading: false, dyslexiaFont: 'none',
    tint: 'none', tintOpacity: 0.15, contrastMode: 'none',
    ttsActive: false, ttsSpeed: 1.0, ttsPitch: 1.0, ttsVoice: '',
    rulerHeight: 40, rulerOpacity: 0.15, rulerColor: '#6096ba',
    focusSpotlightSize: 240,
    originalHTML: null, originalBodyStyle: '',
    focusMouseHandler: null,
    darkMode: false,
    wordSpacing: 0,    // 0 = default, px added
    lineHeight: 0,     // 0 = default, multiplier added
    textScale: 100,    // percent
  };

  // ── Site detection ─────────────────────────────────────────────────────────
  function detectSiteKind() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    if (path.endsWith('.pdf') || document.contentType === 'application/pdf') return 'pdf';
    if (host.includes('mail.google.com')) return 'gmail';
    if (host.includes('outlook.live.com') || host.includes('outlook.office')) return 'outlook';
    if (host.includes('mail.yahoo.com')) return 'yahoo-mail';
    if (host.includes('mail.proton.me') || host.includes('protonmail.com')) return 'protonmail';
    return 'normal';
  }
  const siteKind = detectSiteKind();
  const isEmail  = ['gmail','outlook','yahoo-mail','protonmail'].includes(siteKind);
  const isPdf    = siteKind === 'pdf';

  // ── Helpers ────────────────────────────────────────────────────────────────
  const removeEl = id => document.getElementById(id)?.remove();

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function showToast(msg, type = 'info') {
    removeEl('lensly-toast');
    const t = document.createElement('div');
    t.id = 'lensly-toast'; t.className = `lensly-toast-${type}`;
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.classList.add('lensly-toast-out'), 2400);
    setTimeout(() => t.remove(), 3000);
  }

  function getReadableText() {
    if (isEmail || isPdf) return (document.body.innerText || '').trim();
    const reader = document.getElementById('lensly-reader-content');
    if (reader) return (reader.innerText || '').trim();
    const article = document.querySelector('article, main, [role="main"]');
    if (article) { const t = (article.innerText || '').trim(); if (t.length > 200) return t; }
    return (document.body.innerText || '').trim();
  }

  // ── 1. Reader View ─────────────────────────────────────────────────────────
  function toggleReaderView(enabled) {
    if (enabled && (isEmail || isPdf)) {
      showToast('Reader View is not available on this page type.', 'warn');
      S.readerView = false; return;
    }
    S.readerView = enabled;
    if (enabled) {
      if (!S.originalHTML) {
        try {
          S.originalHTML = document.body.innerHTML;
          S.originalBodyStyle = document.body.getAttribute('style') || '';
        } catch { showToast('Cannot enable Reader View here.', 'error'); S.readerView=false; return; }
      }
      let article = null;
      try { article = new Readability(document.cloneNode(true)).parse(); } catch {}
      if (!article?.content || (article.length||0) < 250) {
        showToast('No readable article found on this page.', 'warn');
        S.readerView = false; S.originalHTML = null; return;
      }

      // Calculate estimated reading time
      const wordCount = (article.textContent || '').trim().split(/\s+/).length;
      const readingTime = Math.max(1, Math.ceil(wordCount / 230));

      try {
        document.body.innerHTML = `
          <div id="lensly-reader"><div id="lensly-reader-inner">
            <div id="lensly-reader-meta">
              ${article.siteName ? `<span class="lensly-site"></span>` : ''}
              ${article.byline ? `<span class="lensly-byline"></span>` : ''}
              <span class="lensly-read-time">${readingTime} min read</span>
            </div>
            <h1 id="lensly-reader-title"></h1>
            <div id="lensly-reader-content"></div>
          </div></div>`;
        if (article.siteName) document.querySelector('.lensly-site').textContent = article.siteName;
        if (article.byline) document.querySelector('.lensly-byline').textContent = 'By ' + article.byline;
        document.getElementById('lensly-reader-title').textContent = article.title || document.title;
        document.getElementById('lensly-reader-content').innerHTML = article.content;
        document.body.setAttribute('style', '');
      } catch (e) { showToast('Reader View failed.', 'error'); S.readerView=false; return; }
    } else {
      if (S.originalHTML) {
        try {
          document.body.innerHTML = S.originalHTML;
          document.body.setAttribute('style', S.originalBodyStyle);
        } catch {}
        S.originalHTML = null;
      }
    }
    if (window.LenslyChatbot) window.LenslyChatbot.init?.();
    reapply();
  }

  // ── 2. Focus Spotlight ─────────────────────────────────────────────────────
  function toggleFocusMode(enabled) {
    S.focusMode = enabled;
    removeEl('lensly-focus-spotlight');
    if (S.focusMouseHandler) {
      document.removeEventListener('mousemove', S.focusMouseHandler);
      S.focusMouseHandler = null;
    }
    if (!enabled) return;
    if (isEmail || isPdf) { showToast('Focus Mode is disabled on this page type.', 'warn'); S.focusMode=false; return; }

    const spot = document.createElement('div');
    spot.id = 'lensly-focus-spotlight';
    document.body.appendChild(spot);
    const size = S.focusSpotlightSize;
    function update(x, y) {
      spot.style.background = `radial-gradient(circle ${size}px at ${x}px ${y}px, transparent 0%, transparent ${size*0.7}px, rgba(0,0,0,0.72) ${size}px)`;
    }
    update(window.innerWidth/2, window.innerHeight/2);
    S.focusMouseHandler = e => update(e.clientX, e.clientY);
    document.addEventListener('mousemove', S.focusMouseHandler, { passive: true });
  }

  // ── 3. Reading Ruler ───────────────────────────────────────────────────────
  function toggleReadingRuler(enabled) {
    S.readingRuler = enabled;
    removeEl('lensly-ruler');
    if (window.__lenslyRulerFn) {
      document.removeEventListener('mousemove', window.__lenslyRulerFn);
      window.__lenslyRulerFn = null;
    }
    if (!enabled) return;
    const ruler = document.createElement('div');
    ruler.id = 'lensly-ruler';
    ruler.style.height = S.rulerHeight + 'px';
    ruler.style.opacity = S.rulerOpacity;
    ruler.style.background = S.rulerColor;
    document.body.appendChild(ruler);
    window.__lenslyRulerFn = e => {
      const r = document.getElementById('lensly-ruler');
      if (r) r.style.top = (e.clientY - S.rulerHeight/2) + 'px';
    };
    document.addEventListener('mousemove', window.__lenslyRulerFn, { passive: true });
  }

  function updateRuler(h, o, color) {
    if (h !== undefined) S.rulerHeight = h;
    if (o !== undefined) S.rulerOpacity = o;
    if (color) S.rulerColor = color;
    const r = document.getElementById('lensly-ruler');
    if (r) { r.style.height = S.rulerHeight+'px'; r.style.opacity = S.rulerOpacity; r.style.background = S.rulerColor; }
  }

  // ── 4. Bionic Reading ──────────────────────────────────────────────────────
  function applyBionicReading(enabled) {
    S.bionicReading = enabled;
    if (!enabled) {
      document.querySelectorAll('.lensly-bionic-word').forEach(el => {
        const p = el.parentNode;
        if (p) { p.replaceChild(document.createTextNode(el.textContent), el); p.normalize(); }
      });
      return;
    }
    const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','INPUT','TEXTAREA','BUTTON','SELECT','OPTION']);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const el = n.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (skip.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.closest('[contenteditable="true"],[contenteditable=""]')) return NodeFilter.FILTER_REJECT;
        if (el.closest('#lensly-chat-root,#lensly-summary-panel,#lensly-toast,#lensly-highlights-panel')) return NodeFilter.FILTER_REJECT;
        if (el.classList?.contains('lensly-bionic-word')) return NodeFilter.FILTER_SKIP;
        if (n.textContent.trim().length < 2) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      try {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(tok => {
          if (/^\s*$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
          const len = Math.ceil(tok.length * 0.45);
          const span = document.createElement('span'); span.className = 'lensly-bionic-word';
          const b = document.createElement('b'); b.textContent = tok.slice(0, len);
          span.appendChild(b); span.appendChild(document.createTextNode(tok.slice(len)));
          frag.appendChild(span);
        });
        node.parentNode?.replaceChild(frag, node);
      } catch {}
    });
  }

  // ── 5. Dyslexia Font ───────────────────────────────────────────────────────
  const fontFamilies = { opendyslexic:"'OpenDyslexic',sans-serif", lexend:"'Lexend',sans-serif", atkinson:"'Atkinson Hyperlegible',sans-serif" };
  const fontURLs = { lexend:'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600&display=swap', atkinson:'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap' };

  function applyDyslexiaFont(font) {
    S.dyslexiaFont = font; removeEl('lensly-font-style');
    if (font === 'none') return;
    if (fontURLs[font] && !document.querySelector(`link[data-lf="${font}"]`)) {
      const l = document.createElement('link'); l.rel='stylesheet'; l.href=fontURLs[font]; l.setAttribute('data-lf',font); document.head.appendChild(l);
    }
    const s = document.createElement('style'); s.id='lensly-font-style';
    s.textContent=`body,body *:not(code):not(pre):not(kbd):not(#lensly-chat-root):not(#lensly-chat-root *){font-family:${fontFamilies[font]}!important}`;
    document.head.appendChild(s);
  }

  // ── 6. Sensory Tint ────────────────────────────────────────────────────────
  const tintColors = { blue:'#6096ba', icy:'#a3cef1', green:'#8bc4a8', rose:'#e8b4b8', gray:'#9aacb8' };
  function applySensoryTint(tint, opacity) {
    S.tint=tint; S.tintOpacity=opacity; removeEl('lensly-tint');
    if (tint==='none'||!tintColors[tint]) return;
    const el = document.createElement('div'); el.id='lensly-tint';
    el.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:${tintColors[tint]};opacity:${opacity};pointer-events:none;z-index:2147483598;mix-blend-mode:multiply;`;
    document.body.appendChild(el);
  }

  // ── 7. High Contrast ───────────────────────────────────────────────────────
  function applyContrastMode(mode) {
    S.contrastMode=mode; removeEl('lensly-contrast-style');
    if (mode==='none') return;
    const s = document.createElement('style'); s.id='lensly-contrast-style';
    const exclude = ':not(#lensly-chat-root):not(#lensly-chat-root *):not(#lensly-summary-panel):not(#lensly-summary-panel *):not(#lensly-highlights-panel):not(#lensly-highlights-panel *)';
    if (mode==='dark')
      s.textContent=`html,body,*${exclude}{background:#000!important;color:#FFFF00!important;border-color:#FFFF00!important}a,a *{color:#00FFFF!important}img,video,canvas{filter:brightness(0.8) contrast(1.2)!important}input,textarea,select{background:#111!important;color:#FFFF00!important;border:1px solid #FFFF00!important}`;
    else
      s.textContent=`html,body,*${exclude}{background:#fff!important;color:#000!important;border-color:#000!important}a,a *{color:#00008B!important}input,textarea,select{background:#fff!important;color:#000!important;border:1px solid #000!important}`;
    document.head.appendChild(s);
  }

  // ── 8. TTS ─────────────────────────────────────────────────────────────────
  function stopTTS() { try { window.speechSynthesis.cancel(); } catch {} S.ttsActive=false; }
  function startTTS(speed, pitch, voiceName) {
    stopTTS(); S.ttsActive=true;
    const text = getReadableText();
    if (!text) { showToast('No text found.','warn'); return; }
    try {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate=speed; utt.pitch=pitch;
      if (voiceName) { const v=window.speechSynthesis.getVoices().find(v=>v.name===voiceName); if(v) utt.voice=v; }
      utt.onend=()=>{S.ttsActive=false;}; utt.onerror=e=>{S.ttsActive=false;};
      window.speechSynthesis.speak(utt);
    } catch (e) { showToast('TTS failed.','error'); }
  }
  function getVoices() { try { return window.speechSynthesis.getVoices().map(v=>({name:v.name,lang:v.lang,default:v.default})); } catch { return []; } }

  // ── 9. Summary Panel (unchanged from v4) ────────────────────────────────────
  function showSummaryPanel(length) {
    removeEl('lensly-summary-panel');
    const counts={short:3,medium:5,detailed:10,full:20}; const count=counts[length]||5;
    let panel;
    try {
      panel = document.createElement('div'); panel.id='lensly-summary-panel';
      panel.innerHTML=`<div id="lensly-summary-header"><div><div id="lensly-summary-title">Summary</div><div id="lensly-summary-source"></div></div><button id="lensly-summary-close" type="button">&#x2715;</button></div><div id="lensly-summary-body"><div id="lensly-summary-loading"><div class="lensly-spinner"></div><span>Analysing...</span></div><div id="lensly-summary-text" style="display:none"></div></div><div id="lensly-summary-footer" style="display:none"><button id="lensly-summary-copy" type="button">Copy</button><button id="lensly-summary-download" type="button">Download</button></div>`;
      document.body.appendChild(panel);
      panel.querySelector('#lensly-summary-close').addEventListener('click',()=>panel.remove());
    } catch (e) { showToast('Could not show summary.','error'); return; }

    let text='';
    try { text = getReadableText(); } catch {}
    if (!text||text.length<80) { document.getElementById('lensly-summary-loading').textContent='Not enough content.'; return; }

    try {
      chrome.storage.sync.get('groqApiKey', d => {
        const apiKey=d?.groqApiKey||'';
        const sm=window.LenslySummarizer;
        if (!sm) { render(fallbackExtract(text,count),'offline'); return; }
        sm.summarise(text,count,apiKey).then(({summary,source,error})=>render(summary,source,error)).catch(err=>{
          try { render(sm.extractSummarise(text,count),'offline',err.message); } catch { document.getElementById('lensly-summary-loading').textContent='Error: '+err.message; }
        });
      });
    } catch (e) { try { render(window.LenslySummarizer?.extractSummarise(text,count)||fallbackExtract(text,count),'offline'); } catch {} }

    function render(summary,source,errorMsg) {
      try {
        const ld=document.getElementById('lensly-summary-loading'), tx=document.getElementById('lensly-summary-text'), ft=document.getElementById('lensly-summary-footer'), sr=document.getElementById('lensly-summary-source');
        if(!tx||!ft) return; if(ld) ld.style.display='none';
        tx.textContent=summary; tx.style.display='block'; ft.style.display='flex';
        if(sr) sr.textContent=source==='ai'?'AI-generated (Groq)':errorMsg?'Offline — '+errorMsg.slice(0,50):'Extracted from page';
        document.getElementById('lensly-summary-copy').addEventListener('click',()=>{navigator.clipboard.writeText(summary).then(()=>showToast('Copied','success')).catch(()=>showToast('Copy failed','warn'));});
        document.getElementById('lensly-summary-download').addEventListener('click',()=>{try{const b=new Blob([summary],{type:'text/plain'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='lensly-summary.txt';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);}catch{}});
      } catch {}
    }
  }
  function fallbackExtract(t,c) { const s=t.match(/[^.!?]+[.!?]+/g)||[]; return s.slice(0,c).join(' ')||t.slice(0,500); }

  // ════════════════════════════════════════════════════════════════════════════
  //  NEW FEATURES IN v5
  // ════════════════════════════════════════════════════════════════════════════

  // ── 10. Dark Mode Toggle ───────────────────────────────────────────────────
  function applyDarkMode(enabled) {
    S.darkMode = enabled;
    removeEl('lensly-darkmode-style');
    if (!enabled) return;

    const s = document.createElement('style');
    s.id = 'lensly-darkmode-style';
    // Invert luminance, preserve hues, then re-invert images/videos/canvas
    s.textContent = `
      html {
        filter: invert(0.92) hue-rotate(180deg) !important;
        background: #111 !important;
      }
      img, video, canvas, svg, picture,
      [style*="background-image"],
      .lensly-highlight-mark {
        filter: invert(1) hue-rotate(180deg) !important;
      }
      #lensly-chat-root, #lensly-chat-root *,
      #lensly-summary-panel, #lensly-summary-panel *,
      #lensly-highlights-panel, #lensly-highlights-panel *,
      #lensly-toast {
        filter: none !important;
      }
    `;
    document.head.appendChild(s);
  }

  // ── 11. Word Spacing & Line Height ──────────────────────────────────────────
  function applyTextSpacing(wordSpacing, lineHeight) {
    S.wordSpacing = wordSpacing;
    S.lineHeight = lineHeight;
    removeEl('lensly-spacing-style');

    if (wordSpacing === 0 && lineHeight === 0) return;

    const rules = [];
    const exclude = ':not(code):not(pre):not(kbd):not(#lensly-chat-root *):not(#lensly-summary-panel *):not(#lensly-highlights-panel *)';
    if (wordSpacing > 0) rules.push(`word-spacing: ${wordSpacing}px !important`);
    if (lineHeight > 0) rules.push(`line-height: ${lineHeight} !important`);

    if (rules.length) {
      const s = document.createElement('style');
      s.id = 'lensly-spacing-style';
      s.textContent = `body *${exclude} { ${rules.join('; ')}; }`;
      document.head.appendChild(s);
    }
  }

  // ── 12. Text Size Scaler ────────────────────────────────────────────────────
  function applyTextScale(percent) {
    S.textScale = percent;
    removeEl('lensly-scale-style');
    if (percent === 100) return;

    const factor = percent / 100;
    const s = document.createElement('style');
    s.id = 'lensly-scale-style';
    s.textContent = `
      body { font-size: ${factor}em !important; }
    `;
    document.head.appendChild(s);
  }

  // ── 13. Highlight & Save ────────────────────────────────────────────────────
  function highlightAndSave(selectedText) {
    if (!selectedText || !selectedText.trim()) return;
    const text = selectedText.trim();
    const pageUrl = location.href;
    const pageTitle = document.title;

    // Visual highlight — find and wrap the selected text in the DOM
    highlightTextInDOM(text);

    // Save to Chrome storage
    chrome.storage.local.get('lenslyHighlights', data => {
      const highlights = data?.lenslyHighlights || [];
      highlights.push({
        text,
        url: pageUrl,
        title: pageTitle,
        timestamp: Date.now(),
        id: 'hl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      });
      chrome.storage.local.set({ lenslyHighlights: highlights }, () => {
        showToast('Highlight saved', 'success');
      });
    });
  }

  function highlightTextInDOM(text) {
    // Use window.find to select, then wrap in mark
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // Try to find and select the text
      if (window.find && window.find(text, false, false, true, false, true, false)) {
        const newSel = window.getSelection();
        if (newSel && newSel.rangeCount > 0) {
          wrapSelectionWithHighlight(newSel);
        }
      }
    } else {
      wrapSelectionWithHighlight(sel);
    }
  }

  function wrapSelectionWithHighlight(sel) {
    try {
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const mark = document.createElement('mark');
      mark.className = 'lensly-highlight-mark';
      range.surroundContents(mark);
      sel.removeAllRanges();
    } catch (e) {
      // surroundContents fails across element boundaries — that's OK
      // The text is still saved to storage even without visual highlighting
    }
  }

  function restoreHighlightsForPage() {
    try {
      chrome.storage.local.get('lenslyHighlights', data => {
        const highlights = data?.lenslyHighlights || [];
        const pageHighlights = highlights.filter(h => h.url === location.href);
        pageHighlights.forEach(h => {
          try { highlightTextInDOM(h.text); } catch {}
        });
      });
    } catch {}
  }

  function showHighlightsPanel() {
    removeEl('lensly-highlights-panel');

    const panel = document.createElement('div');
    panel.id = 'lensly-highlights-panel';
    panel.innerHTML = `
      <div id="lensly-hl-header">
        <div id="lensly-hl-title">Saved Highlights</div>
        <div id="lensly-hl-header-btns">
          <button id="lensly-hl-clear-all" title="Clear all highlights">Clear All</button>
          <button id="lensly-hl-close" title="Close">&#x2715;</button>
        </div>
      </div>
      <div id="lensly-hl-tabs">
        <button class="lensly-hl-tab active" data-filter="page">This Page</button>
        <button class="lensly-hl-tab" data-filter="all">All Highlights</button>
      </div>
      <div id="lensly-hl-body"><div id="lensly-hl-loading">Loading...</div></div>`;
    document.body.appendChild(panel);

    panel.querySelector('#lensly-hl-close').addEventListener('click', () => panel.remove());

    let currentFilter = 'page';
    panel.querySelectorAll('.lensly-hl-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.lensly-hl-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        loadHighlights();
      });
    });

    panel.querySelector('#lensly-hl-clear-all').addEventListener('click', () => {
      if (currentFilter === 'page') {
        chrome.storage.local.get('lenslyHighlights', data => {
          const hl = (data?.lenslyHighlights || []).filter(h => h.url !== location.href);
          chrome.storage.local.set({ lenslyHighlights: hl }, loadHighlights);
        });
      } else {
        chrome.storage.local.set({ lenslyHighlights: [] }, loadHighlights);
      }
      // Remove visual highlights
      document.querySelectorAll('.lensly-highlight-mark').forEach(m => {
        const parent = m.parentNode;
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      });
      showToast('Highlights cleared', 'success');
    });

    function loadHighlights() {
      chrome.storage.local.get('lenslyHighlights', data => {
        let hl = data?.lenslyHighlights || [];
        if (currentFilter === 'page') hl = hl.filter(h => h.url === location.href);
        hl.sort((a, b) => b.timestamp - a.timestamp);

        const body = panel.querySelector('#lensly-hl-body');
        if (!hl.length) {
          body.innerHTML = '<div class="lensly-hl-empty">No highlights saved yet.</div>';
          return;
        }
        body.innerHTML = hl.map(h => `
          <div class="lensly-hl-item" data-id="${h.id}">
            <div class="lensly-hl-text">"${h.text.slice(0, 200)}${h.text.length > 200 ? '...' : ''}"</div>
            <div class="lensly-hl-meta">
              <span class="lensly-hl-page">${h.title?.slice(0, 40) || 'Unknown'}</span>
              <span class="lensly-hl-date">${new Date(h.timestamp).toLocaleDateString()}</span>
            </div>
            <button class="lensly-hl-delete" data-id="${h.id}" title="Delete">&#x2715;</button>
          </div>`).join('');

        body.querySelectorAll('.lensly-hl-delete').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            chrome.storage.local.get('lenslyHighlights', data2 => {
              const filtered = (data2?.lenslyHighlights || []).filter(h => h.id !== id);
              chrome.storage.local.set({ lenslyHighlights: filtered }, loadHighlights);
            });
          });
        });
      });
    }

    loadHighlights();
  }

  // ── Reapply ────────────────────────────────────────────────────────────────
  function reapply() {
    if (S.bionicReading)           applyBionicReading(true);
    if (S.tint !== 'none')         applySensoryTint(S.tint, S.tintOpacity);
    if (S.contrastMode !== 'none') applyContrastMode(S.contrastMode);
    if (S.dyslexiaFont !== 'none') applyDyslexiaFont(S.dyslexiaFont);
    if (S.focusMode)               toggleFocusMode(true);
    if (S.readingRuler)            toggleReadingRuler(true);
    if (S.darkMode)                applyDarkMode(true);
    if (S.wordSpacing || S.lineHeight) applyTextSpacing(S.wordSpacing, S.lineHeight);
    if (S.textScale !== 100)       applyTextScale(S.textScale);
  }

  // ── AI Tool Results Panel (used by email & sheet tools) ─────────────────────
  function runLocalTool(title, syncFn) {
    removeEl('lensly-ai-result-panel');
    const panel = document.createElement('div');
    panel.id = 'lensly-ai-result-panel';
    panel.innerHTML = `
      <div class="lair-header"><div class="lair-title">${title}</div><button class="lair-close" type="button">&#x2715;</button></div>
      <div class="lair-body"><div class="lair-loading"><div class="lensly-spinner"></div><span>Processing...</span></div><div class="lair-content" style="display:none"></div></div>
      <div class="lair-footer" style="display:none"><button class="lair-copy" type="button">Copy</button><button class="lair-download" type="button">Download</button></div>`;
    document.body.appendChild(panel);
    panel.querySelector('.lair-close').addEventListener('click', () => panel.remove());

    setTimeout(() => {
      try {
        const result = syncFn();
        panel.querySelector('.lair-loading').style.display = 'none';
        const content = panel.querySelector('.lair-content');
        content.textContent = result;
        content.style.display = 'block';
        panel.querySelector('.lair-footer').style.display = 'flex';
        panel.querySelector('.lair-copy').addEventListener('click', () => {
          navigator.clipboard.writeText(result).then(() => showToast('Copied', 'success')).catch(() => showToast('Copy failed', 'warn'));
        });
        panel.querySelector('.lair-download').addEventListener('click', () => {
          try { const b=new Blob([result],{type:'text/plain'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`lensly-${title.toLowerCase().replace(/\s+/g,'-')}.txt`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u); } catch {}
        });
      } catch (err) {
        panel.querySelector('.lair-loading').innerHTML = `<span style="color:#b94040">Error: ${err.message}</span>`;
      }
    }, 60);
  }

  function runAITool(title, asyncFn) {
    removeEl('lensly-ai-result-panel');
    const panel = document.createElement('div');
    panel.id = 'lensly-ai-result-panel';
    panel.innerHTML = `
      <div class="lair-header"><div class="lair-title">${title}</div><button class="lair-close" type="button">&#x2715;</button></div>
      <div class="lair-body"><div class="lair-loading"><div class="lensly-spinner"></div><span>Processing...</span></div><div class="lair-content" style="display:none"></div></div>
      <div class="lair-footer" style="display:none"><button class="lair-copy" type="button">Copy</button><button class="lair-download" type="button">Download</button></div>`;
    document.body.appendChild(panel);
    panel.querySelector('.lair-close').addEventListener('click', () => panel.remove());

    asyncFn().then(result => {
      panel.querySelector('.lair-loading').style.display = 'none';
      const content = panel.querySelector('.lair-content');
      content.textContent = result;
      content.style.display = 'block';
      panel.querySelector('.lair-footer').style.display = 'flex';
      panel.querySelector('.lair-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(result).then(() => showToast('Copied', 'success')).catch(() => showToast('Copy failed', 'warn'));
      });
      panel.querySelector('.lair-download').addEventListener('click', () => {
        try { const b=new Blob([result],{type:'text/plain'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`lensly-${title.toLowerCase().replace(/\s+/g,'-')}.txt`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u); } catch {}
      });
    }).catch(err => {
      const loadEl = panel.querySelector('.lair-loading');
      if (loadEl) loadEl.innerHTML = `<span style="color:#b94040">Error: ${err.message}</span>`;
    });
  }

  // ── Chatbot ────────────────────────────────────────────────────────────────
  function setChatbotEnabled(enabled) {
    if (!window.LenslyChatbot) return;
    if (enabled) window.LenslyChatbot.enable(); else window.LenslyChatbot.disable();
  }

  // ── Message handler ────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      switch (msg.action) {
        case 'toggleReaderView':    toggleReaderView(msg.enabled??!S.readerView);     break;
        case 'toggleFocusMode':     toggleFocusMode(msg.enabled??!S.focusMode);       break;
        case 'toggleReadingRuler':  toggleReadingRuler(msg.enabled);                  break;
        case 'updateRuler':         updateRuler(msg.height,msg.opacity,msg.color);    break;
        case 'toggleBionicReading': applyBionicReading(msg.enabled);                  break;
        case 'setDyslexiaFont':     applyDyslexiaFont(msg.font);                      break;
        case 'setSensoryTint':      applySensoryTint(msg.tint,msg.opacity);           break;
        case 'setContrastMode':     applyContrastMode(msg.mode);                      break;
        case 'startTTS':            startTTS(msg.speed,msg.pitch,msg.voice);          break;
        case 'pauseTTS':            try{window.speechSynthesis.pause();}catch{}        break;
        case 'resumeTTS':           try{window.speechSynthesis.resume();}catch{}       break;
        case 'stopTTS':             stopTTS();                                        break;
        case 'getVoices':           sendResponse({voices:getVoices()}); return true;
        case 'showSummary':         showSummaryPanel(msg.length);                     break;
        case 'setChatbot':          setChatbotEnabled(!!msg.enabled);                 break;
        case 'setDarkMode':         applyDarkMode(msg.enabled);                       break;
        case 'setTextSpacing':      applyTextSpacing(msg.wordSpacing, msg.lineHeight); break;
        case 'setTextScale':        applyTextScale(msg.percent);                       break;
        case 'highlightAndSave':    highlightAndSave(msg.text);                       break;
        case 'showHighlights':      showHighlightsPanel();                            break;
        // Email tools (offline, rule-based)
        case 'emailCategorize':     if (window.LenslyEmailTools) { window.LenslyEmailTools.categorize(); } break;
        case 'emailPriority':       if (window.LenslyEmailTools) { window.LenslyEmailTools.detectPriority(); } break;
        case 'emailFollowUp':       if (window.LenslyEmailTools) { window.LenslyEmailTools.followUpReminders(); } break;
        case 'emailDuplicates':     if (window.LenslyEmailTools) { window.LenslyEmailTools.categorize(); } break;
        // AI email tools (still need Groq)
        case 'emailSummarize':      if (window.LenslyEmailTools) { window.LenslyEmailTools.openEmailDashboard('email-ai'); } break;
        case 'emailTasks':          if (window.LenslyEmailTools) { window.LenslyEmailTools.openEmailDashboard('email-ai'); } break;
        // Sheet tools (offline, algorithmic — reads directly from the sheet)
        case 'sheetSetData':        if(window.LenslySheetTools) window.LenslySheetTools.setManualData(msg.data||''); sendResponse({ok:true}); return true;
        case 'sheetClean':          if (window.LenslySheetTools) { window.LenslySheetTools.cleanData(); } break;
        case 'sheetClassify':       if (window.LenslySheetTools) { window.LenslySheetTools.classifyColumns(); } break;
        case 'sheetDuplicates':     if (window.LenslySheetTools) { window.LenslySheetTools.detectDuplicates(); } break;
        case 'sheetAnalytics':      if (window.LenslySheetTools) { window.LenslySheetTools.generateAnalytics(); } break;
        // AI sheet tools (still need Groq)
        case 'sheetQuery':          if (window.LenslySheetTools) { window.LenslySheetTools.openDashboard('analytics'); } break;
        case 'sheetFormula':        if (window.LenslySheetTools) { window.LenslySheetTools.openDashboard('analytics'); } break;
        case 'sheetSummary':        if (window.LenslySheetTools) { window.LenslySheetTools.openDashboard('analytics'); } break;
        case 'sheetCharts':         if (window.LenslySheetTools) { window.LenslySheetTools.generateAnalytics(); } break;
        default: sendResponse({error:'Unknown'}); return true;
      }
      sendResponse({ok:true});
    } catch(e) { sendResponse({error:e.message}); }
    return true;
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  try {
    chrome.storage.sync.get(null, saved => {
      if (chrome.runtime.lastError) return;
      if (saved.bionicReading) applyBionicReading(true);
      if (saved.dyslexiaFont && saved.dyslexiaFont !== 'none') applyDyslexiaFont(saved.dyslexiaFont);
      if (saved.tint && saved.tint !== 'none') applySensoryTint(saved.tint, saved.tintOpacity || 0.15);
      if (saved.contrastMode && saved.contrastMode !== 'none') applyContrastMode(saved.contrastMode);
      if (saved.readingRuler) toggleReadingRuler(true);
      if (saved.focusMode && !isEmail && !isPdf) toggleFocusMode(true);
      if (saved.darkMode) applyDarkMode(true);
      if (saved.wordSpacing || saved.lineHeight) applyTextSpacing(saved.wordSpacing || 0, saved.lineHeight || 0);
      if (saved.textScale && saved.textScale !== 100) applyTextScale(saved.textScale);
      if (saved.rulerHeight) S.rulerHeight = saved.rulerHeight;
      if (saved.rulerOpacity) S.rulerOpacity = saved.rulerOpacity;
      if (saved.rulerColor) S.rulerColor = saved.rulerColor;
      if (saved.ttsSpeed) S.ttsSpeed = saved.ttsSpeed;
      if (saved.ttsPitch) S.ttsPitch = saved.ttsPitch;
      if (saved.ttsVoice) S.ttsVoice = saved.ttsVoice;
    });
  } catch {}

  // Restore highlights
  setTimeout(restoreHighlightsForPage, 1500);

  if (window.speechSynthesis) {
    try { window.speechSynthesis.getVoices(); window.speechSynthesis.addEventListener('voiceschanged',()=>{}); } catch {}
  }
})();
