/**
 * Lensly Summarizer v4
 * Primary:  Google Gemini API (gemini-2.0-flash)
 * Fallback: Offline TF-IDF extractive summarizer
 */
window.LenslySummarizer = (function () {

  const STOP = new Set([
    'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
    'from','is','are','was','were','be','been','being','have','has','had','do',
    'does','did','will','would','could','should','may','might','this','that',
    'these','those','it','its','we','our','you','your','he','she','they','their',
    'i','my','me','us','him','her','his','as','so','if','not','no','nor','than',
    'then','when','where','who','which','what','how','all','any','both','each',
    'few','more','most','other','some','such','into','through','during','before',
    'after','above','below','between','out','off','over','under','again','there',
    'here','just','also','about','up','down','can','now','only','very','too',
    'same','own','because',
  ]);

  function splitSentences(text) {
    try {
      return text
        .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\./gi, m => m.replace('.', '\x00'))
        .replace(/\b([A-Z])\./g, '$1\x00')
        .split(/(?<=[.!?])\s+(?=[A-Z"'])/g)
        .map(s => s.replace(/\x00/g, '.').trim())
        .filter(s => s.length > 25);
    } catch (e) {
      // Lookbehind unsupported → fallback
      return text.split(/[.!?]+\s+/).filter(s => s.length > 25);
    }
  }

  function tokenize(s) {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  }

  function extractSummarise(text, count) {
    if (!text || text.length < 80) return 'Not enough content on this page to summarise.';
    const sentences = splitSentences(text);
    if (!sentences.length) return 'Could not extract sentences from this page.';
    if (sentences.length <= count) return sentences.join(' ');
    const freq = {};
    sentences.forEach(s => tokenize(s).forEach(w => { freq[w] = (freq[w]||0)+1; }));
    const maxF = Math.max(...Object.values(freq), 1);
    const scored = sentences.map((s, i) => {
      const ws = tokenize(s);
      let score = ws.length ? ws.reduce((a,w) => a+(freq[w]||0), 0) / (ws.length * maxF) : 0;
      const pos = i / sentences.length;
      if (i === 0)       score *= 1.6;
      else if (pos < 0.1) score *= 1.3;
      else if (pos > 0.9) score *= 1.15;
      return { s, score, i };
    });
    return scored
      .sort((a,b) => b.score - a.score)
      .slice(0, count)
      .sort((a,b) => a.i - b.i)
      .map(x => x.s)
      .join(' ');
  }

  async function groqSummarise(text, count, apiKey) {
    if (!apiKey) throw new Error('No API key');
    const prompt =
      `Summarise the following article in exactly ${count} clear, informative sentences. ` +
      `Return only the summary — no preamble, no bullet points, no labels.\n\n` +
      text.slice(0, 12000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const err = await res.json(); errMsg = err?.error?.message || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error('Empty response from Groq');
    return out;
  }

  async function groqChat(messages, pageContext, apiKey, opts = {}) {
    if (!apiKey) throw new Error('No API key — please add your Groq key in Settings.');

    const systemInstruction = opts.systemInstruction ||
      `You are a helpful assistant embedded in a browser extension called Lensly. ` +
      `The user is asking questions about the current webpage. ` +
      `Use the page content below to answer accurately and concisely. ` +
      `If the answer is not in the page content, say so honestly.\n\n` +
      `PAGE CONTENT:\n${pageContext.slice(0, 12000)}`;

    const apiMessages = [
      { role: 'system', content: systemInstruction },
      ...messages.map(m => ({
        role: m.role,
        content: m.content
      }))
    ];

    const body = {
      model: 'llama-3.3-70b-versatile',
      messages: apiMessages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1500
    };

    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const err = await res.json(); errMsg = err?.error?.message || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error('Empty response from Groq');
    return out;
  }

  async function summarise(text, count, apiKey) {
    if (apiKey) {
      try {
        const summary = await groqSummarise(text, count, apiKey);
        return { summary, source: 'ai' };
      } catch (e) {
        console.warn('[Lensly] Groq summary failed, falling back:', e.message);
        return { summary: extractSummarise(text, count), source: 'offline', error: e.message };
      }
    }
    return { summary: extractSummarise(text, count), source: 'offline' };
  }

  async function groqAutoProcess(text, apiKey) {
    if (!apiKey) throw new Error('No API key — please add your Groq key in Settings.');

    const prompt = 
      `You are an AI assistant processing an incoming email.\n` +
      `Read the following email text. You must output a JSON object with two keys:\n` +
      `1. "summary": A concise 2-3 sentence summary of the email.\n` +
      `2. "draft_response": A highly professional, polite, and well-structured draft reply to the sender of this email. You are acting as the recipient replying back to the sender. DO NOT summarize the email in the reply. Directly address the sender's inquiry or statement appropriately. It should be fully written and ready to send.\n` +
      `   CRITICAL FORMAT: You MUST structure the draft_response exactly like this, with double line breaks separating the parts:\n` +
      `   [Salutation],\n\n` +
      `   [Message Content]\n\n` +
      `   [Closing]\n\n` +
      `   For the [Closing] sign-off name, DO NOT use "AI Assistant", "Lensly", or any AI mention. Instead, use the name the sender used to address you in their email (e.g., if they said "Dear Student", sign off as "Student"; if they said "Dear Arun", sign off as "Arun"). If no name was used to address you, just leave the name blank after "Best regards,".\n\n` +
      `EMAIL CONTENT:\n${text.slice(0, 10000)}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      })
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const err = await res.json(); errMsg = err?.error?.message || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const data = await res.json();
    const out = data?.choices?.[0]?.message?.content?.trim();
    if (!out) throw new Error('Empty response from Groq');
    
    try {
      return JSON.parse(out);
    } catch (e) {
      throw new Error('Failed to parse JSON response from Groq');
    }
  }

  return { summarise, extractSummarise, groqChat, groqAutoProcess };
})();
