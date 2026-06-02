// Lensly v5 — Popup Controller
'use strict';
const $ = id => document.getElementById(id);
function sendToContent(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ ...msg, target: 'content' }, res => {
      resolve(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : (res || {}));
    });
  });
}
function save(key, val) { chrome.storage.sync.set({ [key]: val }); }

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('tab-tools').style.display    = btn.dataset.tab === 'tools'    ? 'flex' : 'none';
    $('tab-settings').style.display = btn.dataset.tab === 'settings' ? 'flex' : 'none';
  });
});

function wireToggle(cbId, onOn, onOff, expandId) {
  const cb = $(cbId); if (!cb) return;
  cb.addEventListener('change', async () => {
    if (expandId) $(expandId)?.classList.toggle('open', cb.checked);
    await (cb.checked ? onOn() : onOff());
  });
}

// ── Reader View ──────────────────────────────────────────────────────────────
wireToggle('toggle-reader',
  () => { save('readerView',true);  return sendToContent({action:'toggleReaderView',enabled:true}); },
  () => { save('readerView',false); return sendToContent({action:'toggleReaderView',enabled:false}); }
);

// ── Bionic Reading ───────────────────────────────────────────────────────────
wireToggle('toggle-bionic',
  () => { save('bionicReading',true);  return sendToContent({action:'toggleBionicReading',enabled:true}); },
  () => { save('bionicReading',false); return sendToContent({action:'toggleBionicReading',enabled:false}); }
);

// ── Reading Ruler ────────────────────────────────────────────────────────────
let rulerH = 40, rulerO = 0.15, rulerC = '#6096ba';
wireToggle('toggle-ruler',
  () => { save('readingRuler',true);  return sendToContent({action:'toggleReadingRuler',enabled:true}); },
  () => { save('readingRuler',false); return sendToContent({action:'toggleReadingRuler',enabled:false}); },
  'ruler-settings'
);
$('ruler-height').addEventListener('input', e => { rulerH=+e.target.value; $('ruler-height-val').textContent=rulerH+'px'; save('rulerHeight',rulerH); sendToContent({action:'updateRuler',height:rulerH,opacity:rulerO,color:rulerC}); });
$('ruler-opacity').addEventListener('input', e => { rulerO=+e.target.value/100; $('ruler-opacity-val').textContent=e.target.value+'%'; save('rulerOpacity',rulerO); sendToContent({action:'updateRuler',height:rulerH,opacity:rulerO,color:rulerC}); });

function updateRulerChips(c) { document.querySelectorAll('#ruler-color-chips .chip').forEach(ch=>ch.classList.toggle('active',ch.dataset.color===c)); }
document.querySelectorAll('#ruler-color-chips .chip').forEach(c => {
  c.addEventListener('click',()=>{ rulerC=c.dataset.color; save('rulerColor',rulerC); updateRulerChips(rulerC); if($('toggle-ruler').checked) sendToContent({action:'updateRuler',height:rulerH,opacity:rulerO,color:rulerC}); });
});

// ── Dyslexia Font ────────────────────────────────────────────────────────────
let activeFont = 'lexend';
wireToggle('toggle-font',
  () => { save('dyslexiaFont',activeFont); updateFontChips(activeFont); return sendToContent({action:'setDyslexiaFont',font:activeFont}); },
  () => { save('dyslexiaFont','none'); updateFontChips('none'); return sendToContent({action:'setDyslexiaFont',font:'none'}); },
  'font-settings'
);
function updateFontChips(f) { document.querySelectorAll('#font-chips .chip').forEach(c=>c.classList.toggle('active',c.dataset.font===f)); }
document.querySelectorAll('#font-chips .chip').forEach(c => {
  c.addEventListener('click',async()=>{ activeFont=c.dataset.font; save('dyslexiaFont',activeFont); updateFontChips(activeFont); if($('toggle-font').checked) await sendToContent({action:'setDyslexiaFont',font:activeFont}); });
});

// ── Word Spacing & Line Height ───────────────────────────────────────────────
let wordSp = 0, lineH = 0;
$('word-spacing').addEventListener('input', e => {
  wordSp = +e.target.value;
  $('word-spacing-val').textContent = wordSp + 'px';
  save('wordSpacing', wordSp);
  sendToContent({action:'setTextSpacing', wordSpacing:wordSp, lineHeight:lineH});
});
$('line-height').addEventListener('input', e => {
  const raw = +e.target.value;
  lineH = raw === 0 ? 0 : 1.2 + (raw / 10);
  $('line-height-val').textContent = raw === 0 ? 'Default' : lineH.toFixed(1);
  save('lineHeight', lineH);
  sendToContent({action:'setTextSpacing', wordSpacing:wordSp, lineHeight:lineH});
});

// ── Text Size Scaler ─────────────────────────────────────────────────────────
let textScale = 100;
function setScale(val) {
  textScale = Math.max(60, Math.min(200, val));
  $('text-scale').value = textScale;
  $('text-scale-val').textContent = textScale + '%';
  save('textScale', textScale);
  sendToContent({action:'setTextScale', percent:textScale});
}
$('text-scale').addEventListener('input', e => setScale(+e.target.value));
$('scale-down').addEventListener('click', () => setScale(textScale - 10));
$('scale-up').addEventListener('click', () => setScale(textScale + 10));
$('scale-reset').addEventListener('click', () => setScale(100));

// ── Focus Mode ───────────────────────────────────────────────────────────────
wireToggle('toggle-focus',
  () => { save('focusMode',true);  return sendToContent({action:'toggleFocusMode',enabled:true}); },
  () => { save('focusMode',false); return sendToContent({action:'toggleFocusMode',enabled:false}); }
);

// ── Dark Mode ────────────────────────────────────────────────────────────────
wireToggle('toggle-darkmode',
  () => { save('darkMode',true);  return sendToContent({action:'setDarkMode',enabled:true}); },
  () => { save('darkMode',false); return sendToContent({action:'setDarkMode',enabled:false}); }
);

// ── Sensory Tint ─────────────────────────────────────────────────────────────
let activeTint = 'blue', tintOp = 0.15;
wireToggle('toggle-tint',
  () => { save('tint',activeTint); updateSwatches(activeTint); return sendToContent({action:'setSensoryTint',tint:activeTint,opacity:tintOp}); },
  () => { save('tint','none'); return sendToContent({action:'setSensoryTint',tint:'none',opacity:0}); },
  'tint-settings'
);
function updateSwatches(t) { document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.tint===t)); }
document.querySelectorAll('.swatch').forEach(s => { s.addEventListener('click',async()=>{ activeTint=s.dataset.tint; save('tint',activeTint); updateSwatches(activeTint); if($('toggle-tint').checked) await sendToContent({action:'setSensoryTint',tint:activeTint,opacity:tintOp}); }); });
$('tint-opacity').addEventListener('input', e => { tintOp=+e.target.value/100; $('tint-opacity-val').textContent=e.target.value+'%'; save('tintOpacity',tintOp); if($('toggle-tint').checked) sendToContent({action:'setSensoryTint',tint:activeTint,opacity:tintOp}); });

// ── High Contrast ────────────────────────────────────────────────────────────
let activeContrast = 'dark';
wireToggle('toggle-contrast',
  () => { save('contrastMode',activeContrast); updateCChips(activeContrast); return sendToContent({action:'setContrastMode',mode:activeContrast}); },
  () => { activeContrast='dark'; save('contrastMode','none'); updateCChips('none'); return sendToContent({action:'setContrastMode',mode:'none'}); },
  'contrast-settings'
);
function updateCChips(m) { document.querySelectorAll('#contrast-settings .chip').forEach(c=>c.classList.toggle('active',c.dataset.contrast===m)); }
document.querySelectorAll('#contrast-settings .chip').forEach(c => { c.addEventListener('click',async()=>{ activeContrast=c.dataset.contrast; save('contrastMode',activeContrast); updateCChips(activeContrast); if($('toggle-contrast').checked) await sendToContent({action:'setContrastMode',mode:activeContrast}); }); });

// ── TTS ──────────────────────────────────────────────────────────────────────
let ttsPlaying = false, ttsPaused = false;
function refreshTTS() { $('tts-play').disabled=ttsPlaying&&!ttsPaused; $('tts-pause').disabled=!ttsPlaying||ttsPaused; $('tts-resume').disabled=!ttsPaused; $('tts-stop').disabled=!ttsPlaying; }
async function loadVoices() {
  const res=await sendToContent({action:'getVoices'}); const voices=res?.voices||[];
  const sel=$('tts-voice'); sel.innerHTML='<option value="">Default voice</option>';
  voices.forEach(v=>{const o=document.createElement('option');o.value=v.name;o.textContent=`${v.name} (${v.lang})${v.default?' *':''}`;sel.appendChild(o);});
}
$('tts-play').addEventListener('click',async()=>{ttsPlaying=true;ttsPaused=false;refreshTTS();await sendToContent({action:'startTTS',speed:+$('tts-speed').value,pitch:+$('tts-pitch').value,voice:$('tts-voice').value});});
$('tts-pause').addEventListener('click',async()=>{ttsPaused=true;refreshTTS();await sendToContent({action:'pauseTTS'});});
$('tts-resume').addEventListener('click',async()=>{ttsPaused=false;refreshTTS();await sendToContent({action:'resumeTTS'});});
$('tts-stop').addEventListener('click',async()=>{ttsPlaying=false;ttsPaused=false;refreshTTS();await sendToContent({action:'stopTTS'});});
$('tts-speed').addEventListener('input',e=>{$('tts-speed-val').textContent=parseFloat(e.target.value).toFixed(1)+'x';save('ttsSpeed',+e.target.value);});
$('tts-pitch').addEventListener('input',e=>{$('tts-pitch-val').textContent=parseFloat(e.target.value).toFixed(1);save('ttsPitch',+e.target.value);});
$('tts-voice').addEventListener('change',e=>{save('ttsVoice',e.target.value);});

// ── Summary ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.sum-btn').forEach(btn => { btn.addEventListener('click',async()=>{await sendToContent({action:'showSummary',length:btn.dataset.length});window.close();}); });

// ── Highlights ───────────────────────────────────────────────────────────────
$('btn-show-highlights').addEventListener('click',async()=>{await sendToContent({action:'showHighlights'});window.close();});

// ── Chatbot ──────────────────────────────────────────────────────────────────
wireToggle('toggle-chatbot',
  () => { save('chatbotEnabled',true);  return sendToContent({action:'setChatbot',enabled:true}); },
  () => { save('chatbotEnabled',false); return sendToContent({action:'setChatbot',enabled:false}); }
);

// ── Settings — Gemini Key ────────────────────────────────────────────────────
const keyInput=$('gemini-key-input'), keyStatus=$('gemini-key-status');
$('gemini-key-toggle').addEventListener('click',()=>{keyInput.type=keyInput.type==='password'?'text':'password';});
$('gemini-key-save').addEventListener('click',async()=>{
  const key=keyInput.value.trim();
  if(!key){keyStatus.textContent='Please enter a key.';keyStatus.className='lensly-key-status error';return;}
  keyStatus.textContent='Verifying...';keyStatus.className='lensly-key-status';
  try{const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if(res.ok){chrome.storage.sync.set({geminiApiKey:key});keyStatus.textContent='Key saved and verified.';keyStatus.className='lensly-key-status ok';}
    else{const err=await res.json().catch(()=>({}));keyStatus.textContent='Invalid: '+(err?.error?.message||'check your key');keyStatus.className='lensly-key-status error';}
  }catch{chrome.storage.sync.set({geminiApiKey:key});keyStatus.textContent='Saved (offline).';keyStatus.className='lensly-key-status ok';}
});

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const d = await new Promise(r => chrome.storage.sync.get(null, r));

  function check(id,val,exp) { const cb=$(id);if(!cb)return;cb.checked=!!val;if(exp&&val)$(exp)?.classList.add('open'); }
  check('toggle-reader',d.readerView);
  check('toggle-bionic',d.bionicReading);
  check('toggle-focus',d.focusMode);
  check('toggle-ruler',d.readingRuler,'ruler-settings');
  check('toggle-tint',d.tint&&d.tint!=='none','tint-settings');
  check('toggle-contrast',d.contrastMode&&d.contrastMode!=='none','contrast-settings');
  check('toggle-font',d.dyslexiaFont&&d.dyslexiaFont!=='none','font-settings');
  check('toggle-chatbot',d.chatbotEnabled);
  check('toggle-darkmode',d.darkMode);

  if(d.dyslexiaFont&&d.dyslexiaFont!=='none'){activeFont=d.dyslexiaFont;updateFontChips(activeFont);}
  if(d.tint&&d.tint!=='none'){activeTint=d.tint;updateSwatches(activeTint);}
  if(d.contrastMode&&d.contrastMode!=='none'){activeContrast=d.contrastMode;updateCChips(activeContrast);}

  if(d.rulerHeight){rulerH=d.rulerHeight;$('ruler-height').value=d.rulerHeight;$('ruler-height-val').textContent=d.rulerHeight+'px';}
  if(d.rulerOpacity){rulerO=d.rulerOpacity;$('ruler-opacity').value=Math.round(d.rulerOpacity*100);$('ruler-opacity-val').textContent=Math.round(d.rulerOpacity*100)+'%';}
  if(d.rulerColor){rulerC=d.rulerColor;updateRulerChips(d.rulerColor);}
  if(d.tintOpacity){tintOp=d.tintOpacity;$('tint-opacity').value=Math.round(d.tintOpacity*100);$('tint-opacity-val').textContent=Math.round(d.tintOpacity*100)+'%';}
  if(d.ttsSpeed){$('tts-speed').value=d.ttsSpeed;$('tts-speed-val').textContent=parseFloat(d.ttsSpeed).toFixed(1)+'x';}
  if(d.ttsPitch){$('tts-pitch').value=d.ttsPitch;$('tts-pitch-val').textContent=parseFloat(d.ttsPitch).toFixed(1);}

  // New settings
  if(d.wordSpacing){wordSp=d.wordSpacing;$('word-spacing').value=d.wordSpacing;$('word-spacing-val').textContent=d.wordSpacing+'px';}
  if(d.lineHeight&&d.lineHeight>0){lineH=d.lineHeight;const raw=Math.round((d.lineHeight-1.2)*10);$('line-height').value=Math.max(0,raw);$('line-height-val').textContent=d.lineHeight.toFixed(1);}
  if(d.textScale&&d.textScale!==100){textScale=d.textScale;$('text-scale').value=d.textScale;$('text-scale-val').textContent=d.textScale+'%';}

  if(d.geminiApiKey){keyInput.value=d.geminiApiKey;keyStatus.textContent='Key saved.';keyStatus.className='lensly-key-status ok';}
  refreshTTS();
  setTimeout(loadVoices,350);
}
init();
