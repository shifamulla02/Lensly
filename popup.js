// Lensly v6 — Popup Controller
'use strict';
const $ = id => document.getElementById(id);
function send(msg) {
  return new Promise(r => {
    chrome.runtime.sendMessage({ ...msg, target: 'content' }, res => {
      r(chrome.runtime.lastError ? { error: chrome.runtime.lastError.message } : (res || {}));
    });
  });
}
function save(k, v) { chrome.storage.sync.set({ [k]: v }); }

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    const target = $('tab-' + btn.dataset.tab);
    if (target) target.style.display = 'flex';
  });
});

function wireToggle(id, onOn, onOff, exp) {
  const cb = $(id); if (!cb) return;
  cb.addEventListener('change', async () => {
    if (exp) $(exp)?.classList.toggle('open', cb.checked);
    await (cb.checked ? onOn() : onOff());
  });
}

// ── Reader View ──────────────────────────────────────────────────────────────
wireToggle('toggle-reader',
  () => { save('readerView',true);  return send({action:'toggleReaderView',enabled:true}); },
  () => { save('readerView',false); return send({action:'toggleReaderView',enabled:false}); });

// ── Bionic ───────────────────────────────────────────────────────────────────
wireToggle('toggle-bionic',
  () => { save('bionicReading',true);  return send({action:'toggleBionicReading',enabled:true}); },
  () => { save('bionicReading',false); return send({action:'toggleBionicReading',enabled:false}); });

// ── Ruler ────────────────────────────────────────────────────────────────────
let rH=40,rO=0.15,rC='#6096ba';
wireToggle('toggle-ruler',
  () => { save('readingRuler',true);  return send({action:'toggleReadingRuler',enabled:true}); },
  () => { save('readingRuler',false); return send({action:'toggleReadingRuler',enabled:false}); },
  'ruler-settings');
$('ruler-height').addEventListener('input',e=>{rH=+e.target.value;$('ruler-height-val').textContent=rH+'px';save('rulerHeight',rH);send({action:'updateRuler',height:rH,opacity:rO,color:rC});});
$('ruler-opacity').addEventListener('input',e=>{rO=+e.target.value/100;$('ruler-opacity-val').textContent=e.target.value+'%';save('rulerOpacity',rO);send({action:'updateRuler',height:rH,opacity:rO,color:rC});});
function upRC(c){document.querySelectorAll('#ruler-color-chips .chip').forEach(ch=>ch.classList.toggle('active',ch.dataset.color===c));}
document.querySelectorAll('#ruler-color-chips .chip').forEach(c=>{c.addEventListener('click',()=>{rC=c.dataset.color;save('rulerColor',rC);upRC(rC);if($('toggle-ruler').checked)send({action:'updateRuler',height:rH,opacity:rO,color:rC});});});

// ── Font ─────────────────────────────────────────────────────────────────────
let aFont='lexend';
wireToggle('toggle-font',
  ()=>{save('dyslexiaFont',aFont);upFont(aFont);return send({action:'setDyslexiaFont',font:aFont});},
  ()=>{save('dyslexiaFont','none');upFont('none');return send({action:'setDyslexiaFont',font:'none'});},
  'font-settings');
function upFont(f){document.querySelectorAll('#font-chips .chip').forEach(c=>c.classList.toggle('active',c.dataset.font===f));}
document.querySelectorAll('#font-chips .chip').forEach(c=>{c.addEventListener('click',async()=>{aFont=c.dataset.font;save('dyslexiaFont',aFont);upFont(aFont);if($('toggle-font').checked)await send({action:'setDyslexiaFont',font:aFont});});});

// ── Spacing ──────────────────────────────────────────────────────────────────
let wSp=0,lH=0;
$('word-spacing').addEventListener('input',e=>{wSp=+e.target.value;$('word-spacing-val').textContent=wSp+'px';save('wordSpacing',wSp);send({action:'setTextSpacing',wordSpacing:wSp,lineHeight:lH});});
$('line-height').addEventListener('input',e=>{const raw=+e.target.value;lH=raw===0?0:1.2+(raw/10);$('line-height-val').textContent=raw===0?'Default':lH.toFixed(1);save('lineHeight',lH);send({action:'setTextSpacing',wordSpacing:wSp,lineHeight:lH});});

// ── Text Scale ───────────────────────────────────────────────────────────────
let tScale=100;
function setScale(v){tScale=Math.max(60,Math.min(200,v));$('text-scale').value=tScale;$('text-scale-val').textContent=tScale+'%';save('textScale',tScale);send({action:'setTextScale',percent:tScale});}
$('text-scale').addEventListener('input',e=>setScale(+e.target.value));
$('scale-down').addEventListener('click',()=>setScale(tScale-10));
$('scale-up').addEventListener('click',()=>setScale(tScale+10));
$('scale-reset').addEventListener('click',()=>setScale(100));

// ── Focus ────────────────────────────────────────────────────────────────────
wireToggle('toggle-focus',
  ()=>{save('focusMode',true);return send({action:'toggleFocusMode',enabled:true});},
  ()=>{save('focusMode',false);return send({action:'toggleFocusMode',enabled:false});});

// ── Dark Mode ────────────────────────────────────────────────────────────────
wireToggle('toggle-darkmode',
  ()=>{save('darkMode',true);return send({action:'setDarkMode',enabled:true});},
  ()=>{save('darkMode',false);return send({action:'setDarkMode',enabled:false});});

// ── Tint ─────────────────────────────────────────────────────────────────────
let aTint='blue',tOp=0.15;
wireToggle('toggle-tint',
  ()=>{save('tint',aTint);upSw(aTint);return send({action:'setSensoryTint',tint:aTint,opacity:tOp});},
  ()=>{save('tint','none');return send({action:'setSensoryTint',tint:'none',opacity:0});},
  'tint-settings');
function upSw(t){document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.tint===t));}
document.querySelectorAll('.swatch').forEach(s=>{s.addEventListener('click',async()=>{aTint=s.dataset.tint;save('tint',aTint);upSw(aTint);if($('toggle-tint').checked)await send({action:'setSensoryTint',tint:aTint,opacity:tOp});});});
$('tint-opacity').addEventListener('input',e=>{tOp=+e.target.value/100;$('tint-opacity-val').textContent=e.target.value+'%';save('tintOpacity',tOp);if($('toggle-tint').checked)send({action:'setSensoryTint',tint:aTint,opacity:tOp});});

// ── Contrast ─────────────────────────────────────────────────────────────────
let aCon='dark';
wireToggle('toggle-contrast',
  ()=>{save('contrastMode',aCon);upCon(aCon);return send({action:'setContrastMode',mode:aCon});},
  ()=>{aCon='dark';save('contrastMode','none');upCon('none');return send({action:'setContrastMode',mode:'none'});},
  'contrast-settings');
function upCon(m){document.querySelectorAll('#contrast-settings .chip').forEach(c=>c.classList.toggle('active',c.dataset.contrast===m));}
document.querySelectorAll('#contrast-settings .chip').forEach(c=>{c.addEventListener('click',async()=>{aCon=c.dataset.contrast;save('contrastMode',aCon);upCon(aCon);if($('toggle-contrast').checked)await send({action:'setContrastMode',mode:aCon});});});

// ── TTS ──────────────────────────────────────────────────────────────────────
let ttsP=false,ttsD=false;
function rTTS(){$('tts-play').disabled=ttsP&&!ttsD;$('tts-pause').disabled=!ttsP||ttsD;$('tts-resume').disabled=!ttsD;$('tts-stop').disabled=!ttsP;}
async function lV(){const r=await send({action:'getVoices'});const v=r?.voices||[];const s=$('tts-voice');s.innerHTML='<option value="">Default</option>';v.forEach(x=>{const o=document.createElement('option');o.value=x.name;o.textContent=`${x.name} (${x.lang})`;s.appendChild(o);});}
$('tts-play').addEventListener('click',async()=>{ttsP=true;ttsD=false;rTTS();await send({action:'startTTS',speed:+$('tts-speed').value,pitch:+$('tts-pitch').value,voice:$('tts-voice').value});});
$('tts-pause').addEventListener('click',async()=>{ttsD=true;rTTS();await send({action:'pauseTTS'});});
$('tts-resume').addEventListener('click',async()=>{ttsD=false;rTTS();await send({action:'resumeTTS'});});
$('tts-stop').addEventListener('click',async()=>{ttsP=false;ttsD=false;rTTS();await send({action:'stopTTS'});});
$('tts-speed').addEventListener('input',e=>{$('tts-speed-val').textContent=parseFloat(e.target.value).toFixed(1)+'x';save('ttsSpeed',+e.target.value);});
$('tts-pitch').addEventListener('input',e=>{$('tts-pitch-val').textContent=parseFloat(e.target.value).toFixed(1);save('ttsPitch',+e.target.value);});
$('tts-voice').addEventListener('change',e=>save('ttsVoice',e.target.value));

// ── Summary ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.sum-btn').forEach(b=>{b.addEventListener('click',async()=>{await send({action:'showSummary',length:b.dataset.length});window.close();});});

// ── Highlights ───────────────────────────────────────────────────────────────
$('btn-show-highlights').addEventListener('click',async()=>{await send({action:'showHighlights'});window.close();});

// ── Chatbot ──────────────────────────────────────────────────────────────────
wireToggle('toggle-chatbot',
  ()=>{save('chatbotEnabled',true);return send({action:'setChatbot',enabled:true});},
  ()=>{save('chatbotEnabled',false);return send({action:'setChatbot',enabled:false});});

// ════════════════════════════════════════════════════════════════════════════
//  EMAIL TAB — wire features
// ════════════════════════════════════════════════════════════════════════════
function wireEmailBtn(id, action) {
  $(id)?.addEventListener('click', async () => { await send({ action }); window.close(); });
}
wireEmailBtn('email-categorize',  'emailCategorize');
wireEmailBtn('email-priority',    'emailPriority');
wireEmailBtn('email-followup',    'emailFollowUp');
wireEmailBtn('email-insights',    'emailInsights');

// ════════════════════════════════════════════════════════════════════════════
//  SHEETS TAB — wire all 7 features + data input
// ════════════════════════════════════════════════════════════════════════════
$('sheet-data-save')?.addEventListener('click', async () => {
  const data = $('sheet-data-input').value.trim();
  if (!data) { $('sheet-data-status').textContent = 'Paste some data first.'; return; }
  await send({ action: 'sheetSetData', data });
  $('sheet-data-status').textContent = `Loaded (${data.split('\n').length} rows)`;
  $('sheet-data-status').className = 'lensly-sm-status ok';
});

function wireSheetBtn(id, action) {
  $(id)?.addEventListener('click', async () => { await send({ action }); window.close(); });
}
wireSheetBtn('sheet-analytics', 'sheetAnalytics');

// ── Settings — API Key ───────────────────────────────────────────────────────
const kI=$('groq-key-input'), kS=$('groq-key-status');
$('groq-key-toggle').addEventListener('click',()=>{kI.type=kI.type==='password'?'text':'password';});
$('groq-key-save').addEventListener('click',async()=>{
  const k=kI.value.trim();
  if(!k){kS.textContent='Please enter a key.';kS.className='lensly-key-status error';return;}
  kS.textContent='Verifying...';kS.className='lensly-key-status';
  try{
    const r=await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${k}` }
    });
    if(r.ok){chrome.storage.sync.set({groqApiKey:k});kS.textContent='Key saved and verified.';kS.className='lensly-key-status ok';}
    else{const e=await r.json().catch(()=>({}));kS.textContent='Invalid: '+(e?.error?.message||'check key');kS.className='lensly-key-status error';}
  }catch{chrome.storage.sync.set({groqApiKey:k});kS.textContent='Saved (offline).';kS.className='lensly-key-status ok';}
});

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  const d = await new Promise(r => chrome.storage.sync.get(null, r));
  function chk(id,v,exp){const cb=$(id);if(!cb)return;cb.checked=!!v;if(exp&&v)$(exp)?.classList.add('open');}

  chk('toggle-reader',d.readerView);
  chk('toggle-bionic',d.bionicReading);
  chk('toggle-focus',d.focusMode);
  chk('toggle-ruler',d.readingRuler,'ruler-settings');
  chk('toggle-tint',d.tint&&d.tint!=='none','tint-settings');
  chk('toggle-contrast',d.contrastMode&&d.contrastMode!=='none','contrast-settings');
  chk('toggle-font',d.dyslexiaFont&&d.dyslexiaFont!=='none','font-settings');
  chk('toggle-chatbot',d.chatbotEnabled);
  chk('toggle-darkmode',d.darkMode);

  if(d.dyslexiaFont&&d.dyslexiaFont!=='none'){aFont=d.dyslexiaFont;upFont(aFont);}
  if(d.tint&&d.tint!=='none'){aTint=d.tint;upSw(aTint);}
  if(d.contrastMode&&d.contrastMode!=='none'){aCon=d.contrastMode;upCon(aCon);}
  if(d.rulerHeight){rH=d.rulerHeight;$('ruler-height').value=rH;$('ruler-height-val').textContent=rH+'px';}
  if(d.rulerOpacity){rO=d.rulerOpacity;$('ruler-opacity').value=Math.round(rO*100);$('ruler-opacity-val').textContent=Math.round(rO*100)+'%';}
  if(d.rulerColor){rC=d.rulerColor;upRC(rC);}
  if(d.tintOpacity){tOp=d.tintOpacity;$('tint-opacity').value=Math.round(tOp*100);$('tint-opacity-val').textContent=Math.round(tOp*100)+'%';}
  if(d.ttsSpeed){$('tts-speed').value=d.ttsSpeed;$('tts-speed-val').textContent=parseFloat(d.ttsSpeed).toFixed(1)+'x';}
  if(d.ttsPitch){$('tts-pitch').value=d.ttsPitch;$('tts-pitch-val').textContent=parseFloat(d.ttsPitch).toFixed(1);}
  if(d.wordSpacing){wSp=d.wordSpacing;$('word-spacing').value=wSp;$('word-spacing-val').textContent=wSp+'px';}
  if(d.lineHeight&&d.lineHeight>0){lH=d.lineHeight;$('line-height').value=Math.max(0,Math.round((lH-1.2)*10));$('line-height-val').textContent=lH.toFixed(1);}
  if(d.textScale&&d.textScale!==100){tScale=d.textScale;$('text-scale').value=tScale;$('text-scale-val').textContent=tScale+'%';}
  if(d.groqApiKey){kI.value=d.groqApiKey;kS.textContent='Key saved.';kS.className='lensly-key-status ok';}

  rTTS();
  setTimeout(lV, 350);
}
init();
