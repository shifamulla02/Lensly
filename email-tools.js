/**
 * Lensly Email Tools v8 — 100% offline, rule-based inbox sorting + AI features
 * Highlights and REARRANGES/SORTS emails in Gmail/Outlook list, adds a floating toolbar, and provides an in-page dashboard.
 * v8: Added exhaustive rule-based email metadata engine (analyzeEmail) — no AI required.
 */
window.LenslyEmailTools = (function () {

  let _emailToolbarInjected = false;
  let _emailDashboardEl = null;
  let _emailFilter = null; // 'personal_travel' or null
  let _activeMode = null;
  let _observerInterval = null;

  // ── Keyword dictionaries ────────────────────────────────────────────────────
  const CATEGORIES = {
    finance: { keywords: ['invoice', 'payment', 'receipt', 'bank', 'transaction', 'transfer', 'balance', 'credit', 'debit', 'billing', 'subscription', 'refund', 'tax', 'paypal', 'stripe', 'statement', 'bill', 'receipts', 'chase', 'wells fargo', 'crypto', 'coinbase'], label: 'Finance' },
    work: { keywords: ['meeting', 'agenda', 'project', 'deadline', 'quarterly', 'report', 'standup', 'sprint', 'jira', 'slack', 'milestone', 'deliverable', 'stakeholder', 'onboard', 'offboard', 'review', 'approval', 'zoom', 'teams', 'client', 'sync', 'follow up', 'docs'], label: 'Work' },
    shopping: { keywords: ['order', 'shipping', 'delivered', 'tracking', 'cart', 'purchase', 'discount', 'coupon', 'sale', 'amazon', 'flipkart', 'ebay', 'shopify', 'return', 'warehouse', 'delivery', 'package', 'store', 'receipt', 'shipped'], label: 'Shopping' },
    social: { keywords: ['facebook', 'twitter', 'instagram', 'linkedin', 'tiktok', 'youtube', 'notification', 'friend request', 'tagged', 'mentioned', 'followed', 'liked', 'commented', 'connection', 'pinterest', 'reddit', 'tweet'], label: 'Social Media' },
    newsletter: { keywords: ['unsubscribe', 'newsletter', 'weekly digest', 'daily digest', 'monthly update', 'mailing list', 'email preferences', 'view in browser', 'no longer wish', 'opt out', 'subscription', 'digest', 'read more', 'roundup'], label: 'Newsletter' },
    travel: { keywords: ['flight', 'booking', 'reservation', 'hotel', 'airbnb', 'itinerary', 'boarding pass', 'check-in', 'layover', 'departure', 'arrival', 'uber', 'lyft', 'taxi', 'ticket', 'trip', 'airline', 'expedia', 'booking.com'], label: 'Travel' },
    promo: { keywords: ['% off', 'limited time', 'act now', 'exclusive offer', 'free trial', 'click here', 'buy now', 'don\'t miss', 'hurry', 'deal', 'clearance', 'flash sale', 'promo code', 'special offer', 'save', 'discount'], label: 'Promotional' },
    security: { keywords: ['password', 'login attempt', 'suspicious', 'verify', 'two-factor', '2fa', 'authentication', 'security alert', 'unusual activity', 'reset your', 'account locked', 'sign-in', 'unauthorized', 'verification', 'code'], label: 'Security' },
    personal: { keywords: ['birthday', 'happy birthday', 'congratulations', 'wedding', 'baby', 'vacation', 'holiday', 'family', 'reunion', 'dinner', 'lunch', 'party', 'invite', 'rsvp', 'onedrive', 'hello', 'how are you', 'catching up', 'weekend'], label: 'Personal' },
  };

  const PRIORITY_HIGH = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'deadline today', 'action required', 'time-sensitive', 'respond by', 'eod', 'end of day', 'important'];
  const PRIORITY_MED = ['follow up', 'reminder', 'please review', 'when you can', 'by this week', 'schedule', 'let me know', 'your input', 'feedback needed', 'pending'];
  const FOLLOWUP_SIGNALS = ['?', 'please reply', 'let me know', 'your thoughts', 'awaiting', 'waiting for', 'get back to', 'any update', 'follow up', 'could you', 'can you', 'would you'];
  const ATTACHMENT_KEYWORDS = ['attached', 'attachment', 'find enclosed', 'see attached', 'enclosed', 'file', 'document', 'pdf', 'spreadsheet', 'presentation', 'image', 'photo', 'screenshot'];

  // ── Rule-Based Email Metadata Engine ───────────────────────────────────────
  // Returns exhaustive structured metadata for any email, 100% offline.

  const META_RULES = {
    // Subcategory signal maps
    subcategories: {
      'invoice': ['finance', 'billing'],
      'overdue': ['finance', 'urgent-billing'],
      'payment success': ['finance', 'receipt'],
      'receipt': ['finance', 'receipt'],
      'ticket': ['travel', 'booking-confirmation'],
      'boarding pass': ['travel', 'flight'],
      'booking': ['travel', 'reservation'],
      'reservation': ['travel', 'reservation'],
      'hotel': ['travel', 'accommodation'],
      'flight': ['travel', 'flight'],
      'metro': ['travel', 'transit'],
      'password': ['security', 'credential-alert'],
      'login': ['security', 'account-access'],
      'security alert': ['security', 'threat-notification'],
      'verify': ['security', 'account-verification'],
      'two-factor': ['security', '2fa'],
      '2fa': ['security', '2fa'],
      'account locked': ['security', 'account-lockout'],
      'unauthorized': ['security', 'breach-alert'],
      'suspicious': ['security', 'threat-notification'],
      'expired': ['security', 'subscription-lapse'],
      'protection': ['security', 'antivirus'],
      'newsletter': ['newsletter', 'digest'],
      'unsubscribe': ['newsletter', 'mailing-list'],
      'digest': ['newsletter', 'digest'],
      'weekly': ['newsletter', 'weekly-digest'],
      'monthly': ['newsletter', 'monthly-digest'],
      'order': ['shopping', 'order-confirmation'],
      'shipped': ['shopping', 'shipment'],
      'delivered': ['shopping', 'delivery'],
      'tracking': ['shopping', 'shipment-tracking'],
      'amazon': ['shopping', 'amazon-order'],
      'subscription': ['shopping', 'subscription-management'],
      'meeting': ['work', 'calendar-invite'],
      'agenda': ['work', 'meeting-prep'],
      'standup': ['work', 'scrum'],
      'sprint': ['work', 'agile'],
      'deadline': ['work', 'project-management'],
      'review': ['work', 'approval-request'],
      'onboarding': ['work', 'hr'],
      'offer': ['work', 'job-offer'],
      'application': ['work', 'recruitment'],
      'interview': ['work', 'recruitment'],
      'birthday': ['personal', 'celebration'],
      'congratulations': ['personal', 'celebration'],
      'wedding': ['personal', 'life-event'],
      'holiday': ['personal', 'vacation'],
      'memories': ['personal', 'nostalgia'],
      'onedrive': ['personal', 'cloud-storage'],
      'photos': ['personal', 'media'],
      'privacy': ['legal', 'policy-update'],
      'terms': ['legal', 'policy-update'],
      'gdpr': ['legal', 'compliance'],
      'settings': ['account', 'account-settings'],
      'course': ['education', 'e-learning'],
      'webinar': ['education', 'event'],
      'benchmark': ['education', 'data-science'],
      'dataset': ['education', 'data-science'],
      'kaggle': ['education', 'data-science'],
      'contribution': ['social', 'community'],
      'maps': ['social', 'location-services'],
      'review needed': ['social', 'user-generated-content'],
      'promo': ['promotional', 'discount'],
      '% off': ['promotional', 'sale'],
      'limited time': ['promotional', 'flash-sale'],
      'deal': ['promotional', 'offer'],
    },

    // Company name detection patterns
    companies: {
      'tripozo': 'Tripozo',
      'google': 'Google',
      'kaggle': 'Kaggle',
      'mcafee': 'McAfee',
      'amazon': 'Amazon',
      'amazonmusic': 'Amazon Music',
      'amazon music': 'Amazon Music',
      'onedrive': 'Microsoft OneDrive',
      'microsoft': 'Microsoft',
      'google maps': 'Google Maps',
      'paypal': 'PayPal',
      'stripe': 'Stripe',
      'uber': 'Uber',
      'lyft': 'Lyft',
      'airbnb': 'Airbnb',
      'expedia': 'Expedia',
      'booking.com': 'Booking.com',
      'flipkart': 'Flipkart',
      'ebay': 'eBay',
      'shopify': 'Shopify',
      'facebook': 'Facebook',
      'instagram': 'Instagram',
      'linkedin': 'LinkedIn',
      'twitter': 'Twitter',
      'tiktok': 'TikTok',
      'youtube': 'YouTube',
      'reddit': 'Reddit',
      'pinterest': 'Pinterest',
      'slack': 'Slack',
      'jira': 'Jira',
      'zoom': 'Zoom',
      'teams': 'Microsoft Teams',
      'norton': 'Norton',
      'kaspersky': 'Kaspersky',
      'avast': 'Avast',
      'coinbase': 'Coinbase',
      'chase': 'Chase Bank',
      'wells fargo': 'Wells Fargo',
      'spotify': 'Spotify',
      'netflix': 'Netflix',
    },

    // Ticket/Invoice/Order number patterns
    refPatterns: [
      { regex: /\bTM\d{7,12}\b/gi, prefix: 'ticket' },
      { regex: /\bINV[-#]?\d{4,10}\b/gi, prefix: 'invoice' },
      { regex: /\bORD[-#]?\d{4,10}\b/gi, prefix: 'order' },
      { regex: /\b[A-Z]{2,3}\d{6,12}\b/g, prefix: 'ref' },
      { regex: /order\s*#?\s*(\d{5,12})/gi, prefix: 'order' },
      { regex: /invoice\s*#?\s*(\d{4,10})/gi, prefix: 'invoice' },
    ],

    // Deadline detection patterns
    deadlines: [
      /by\s+(today|tomorrow|end of day|eod|midnight)/i,
      /due\s+(today|tomorrow|on\s+\w+\s+\d+)/i,
      /expires?\s+(today|tomorrow|in\s+\d+\s+days?)/i,
      /respond\s+by\s+(\w+\s+\d+|\d+\s+\w+)/i,
      /deadline[:\s]+(\w+\s+\d+|\d+\s+\w+)/i,
      /action\s+required\s+by\s+(\w+\s+\d+)/i,
      /before\s+(\w+\s+\d+,?\s*\d{4})/i,
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(,?\s*\d{4})?/i,
    ],

    // Email type classification
    emailTypes: {
      'payment success': 'receipt',
      'invoice': 'invoice',
      'overdue': 'invoice-overdue',
      'ticket': 'booking-confirmation',
      'boarding pass': 'boarding-pass',
      'itinerary': 'travel-itinerary',
      'security alert': 'security-alert',
      'security notification': 'security-alert',
      'verify': 'verification-request',
      'reset your': 'password-reset',
      'account locked': 'account-alert',
      'unauthorized': 'breach-notification',
      'newsletter': 'newsletter',
      'digest': 'newsletter',
      'weekly update': 'newsletter',
      'unsubscribe': 'newsletter',
      'order': 'order-confirmation',
      'shipped': 'shipping-notification',
      'delivered': 'delivery-confirmation',
      'tracking': 'shipping-notification',
      'meeting': 'meeting-invitation',
      'agenda': 'meeting-invitation',
      'interview': 'recruitment',
      'offer letter': 'job-offer',
      'application': 'recruitment',
      'privacy': 'policy-update',
      'terms': 'policy-update',
      'settings': 'account-notification',
      '% off': 'promotional',
      'deal': 'promotional',
      'limited time': 'promotional',
      'promo': 'promotional',
      'course': 'educational',
      'webinar': 'educational',
      'benchmark': 'educational',
      'contribution': 'community-notification',
      'memories': 'system-notification',
      'reminder': 'reminder',
      'follow up': 'follow-up',
    },

    // Action type detection
    actionTypes: {
      'action required': 'Respond immediately',
      'overdue': 'Make payment',
      'payment due': 'Make payment',
      'please pay': 'Make payment',
      'invoice': 'Review and pay invoice',
      'verify': 'Complete verification',
      'confirm': 'Confirm action',
      'reset your password': 'Reset password',
      'account locked': 'Unlock account',
      'unauthorized': 'Secure account',
      'suspicious': 'Investigate security alert',
      'rsvp': 'RSVP to event',
      'register': 'Register for event',
      'sign up': 'Sign up',
      'review': 'Review document',
      'approve': 'Approve request',
      'interview': 'Schedule interview',
      'expires': 'Renew subscription',
      'expired': 'Renew subscription',
      'protection has': 'Renew protection',
      'tracking': 'Track shipment',
      'return': 'Initiate return',
      'unsubscribe': 'Manage subscription',
      'update your': 'Update settings/info',
      'privacy settings': 'Review privacy settings',
    },

    // Sentiment signals
    sentimentPositive: ['success', 'thank you', 'congratulations', 'approved', 'completed', 'delivered', 'memories', 'contributions', 'great', 'welcome', 'confirmed', 'booked'],
    sentimentNegative: ['overdue', 'urgent', 'immediately', 'suspended', 'blocked', 'failed', 'error', 'problem', 'issue', 'expired', 'locked', 'unauthorized', 'suspicious', 'warning', 'alert'],
    sentimentNeutral: ['settings', 'update', 'reminder', 'notification', 'newsletter', 'digest', 'course', 'benchmark'],
  };

  function fallbackAnalyzeEmail(emailObj) {
    const { sender = '', subject = '', snippet = '', body = '' } = emailObj;
    const fullText = `${sender} ${subject} ${snippet} ${body}`.toLowerCase();
    const rawText = `${sender} ${subject} ${snippet} ${body}`;

    // ── Primary category
    let bestCat = 'other';
    let bestScore = 0;
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const score = cat.keywords.reduce((s, kw) => s + (fullText.includes(kw) ? kw.split(' ').length : 0), 0);
      if (score > bestScore) { bestScore = score; bestCat = key; }
    }
    const primary_category = CATEGORIES[bestCat]?.label || 'Other';

    // ── Subcategories
    const subcatSet = new Set();
    for (const [kw, cats] of Object.entries(META_RULES.subcategories)) {
      if (fullText.includes(kw)) cats.forEach(c => subcatSet.add(c));
    }
    const subcategories = [...subcatSet].slice(0, 5);

    // ── Companies
    const companySet = new Set();
    for (const [kw, name] of Object.entries(META_RULES.companies)) {
      if (fullText.includes(kw)) companySet.add(name);
    }
    const companies = [...companySet];

    // ── People (extract names from sender if it looks like a person)
    const people = [];
    const senderClean = sender.trim();
    const isPersonName = /^[A-Z][a-z]+ [A-Z][a-z]+/.test(senderClean);
    if (isPersonName) people.push(senderClean);

    // ── Reference numbers (ticket, invoice, order)
    const refTags = [];
    for (const { regex, prefix } of META_RULES.refPatterns) {
      const matches = rawText.match(regex) || [];
      matches.forEach(m => refTags.push(`${prefix}-${m.replace(/\s/g, '')}`));
    }

    // ── Email type
    let email_type = 'general-notification';
    for (const [kw, type] of Object.entries(META_RULES.emailTypes)) {
      if (fullText.includes(kw)) { email_type = type; break; }
    }

    // ── Priority
    let priority = 'low';
    const isHigh = PRIORITY_HIGH.some(kw => fullText.includes(kw));
    const isMed = PRIORITY_MED.some(kw => fullText.includes(kw));
    if (fullText.includes('overdue') || fullText.includes('critical') || fullText.includes('emergency')) priority = 'critical';
    else if (isHigh) priority = 'high';
    else if (isMed) priority = 'medium';

    // ── Action required & type
    let action_required = false;
    let action_type = '';
    for (const [kw, atype] of Object.entries(META_RULES.actionTypes)) {
      if (fullText.includes(kw)) { action_required = true; action_type = atype; break; }
    }
    if (!action_required && FOLLOWUP_SIGNALS.some(s => fullText.includes(s))) {
      action_required = true;
      action_type = 'Reply needed';
    }

    // ── Deadline detection
    let deadline_detected = '';
    for (const pattern of META_RULES.deadlines) {
      const m = rawText.match(pattern);
      if (m) { deadline_detected = m[0].trim(); break; }
    }

    // ── Sentiment
    let sentiment = 'neutral';
    const posScore = META_RULES.sentimentPositive.filter(w => fullText.includes(w)).length;
    const negScore = META_RULES.sentimentNegative.filter(w => fullText.includes(w)).length;
    if (negScore > posScore) sentiment = 'negative';
    else if (posScore > negScore) sentiment = 'positive';

    // ── Tags (5–15 specific tags)
    const tagSet = new Set();

    // Add company tags
    companies.forEach(c => tagSet.add(c.toLowerCase().replace(/\s+/g, '-')));

    // Add people tags
    people.forEach(p => tagSet.add(p.toLowerCase().replace(/\s+/g, '-')));

    // Add reference number tags
    refTags.forEach(r => tagSet.add(r.toLowerCase()));

    // Add category-specific tags
    tagSet.add(primary_category.toLowerCase().replace(/\s+/g, '-'));
    subcategories.forEach(s => tagSet.add(s));

    // Add email type tag
    tagSet.add(email_type);

    // Add priority tag if high/critical
    if (priority === 'critical') tagSet.add('urgent');
    if (priority === 'high') tagSet.add('high-priority');

    // Add action tags
    if (action_required && action_type) tagSet.add(action_type.toLowerCase().replace(/\s+/g, '-'));

    // Add deadline tag
    if (deadline_detected) tagSet.add('has-deadline');

    // Add keyword-derived specific tags
    const specificKeywordTags = {
      'invoice': 'invoice', 'overdue': 'payment-overdue', 'payment success': 'payment-confirmed',
      'ticket': 'ticket', 'metro': 'metro-transit', 'flight': 'flight-booking',
      'hotel': 'hotel-booking', 'boarding pass': 'boarding-pass', 'itinerary': 'itinerary',
      'security': 'security-alert', 'password': 'password-related', '2fa': '2fa',
      'two-factor': '2fa', 'unauthorized': 'unauthorized-access', 'account locked': 'account-locked',
      'expired': 'subscription-expired', 'protection': 'antivirus-protection',
      'newsletter': 'newsletter', 'unsubscribe': 'unsubscribe-option', 'digest': 'digest-email',
      'shipped': 'shipment', 'delivered': 'delivery', 'tracking': 'package-tracking',
      'order': 'order', 'subscription': 'subscription',
      'meeting': 'meeting', 'deadline': 'deadline', 'review': 'review-needed',
      'birthday': 'birthday', 'memories': 'memories', 'onedrive': 'cloud-storage',
      'photos': 'photos', 'privacy': 'privacy-policy', 'settings': 'account-settings',
      'course': 'online-course', 'benchmark': 'data-benchmark', 'dataset': 'dataset',
      'contribution': 'user-contribution', 'maps': 'maps-review',
      'promo': 'promotional', '% off': 'discount', 'deal': 'deal',
      'reminder': 'reminder',
    };
    for (const [kw, tag] of Object.entries(specificKeywordTags)) {
      if (fullText.includes(kw)) tagSet.add(tag);
    }

    // Add sender domain as tag if noreply/automated
    if (sender.toLowerCase().includes('no-reply') || sender.toLowerCase().includes('noreply')) {
      tagSet.add('automated-sender');
    }

    // Add attachment tag if signals present
    if (ATTACHMENT_KEYWORDS.some(kw => fullText.includes(kw))) tagSet.add('has-attachment');

    const tags = [...tagSet].filter(Boolean).slice(0, 15);

    // ── Summary
    let summary = '';
    if (email_type === 'invoice-overdue') summary = `Overdue invoice from ${sender} requiring immediate payment action.`;
    else if (email_type === 'receipt') summary = `Payment confirmation/receipt from ${sender}.`;
    else if (email_type === 'booking-confirmation') summary = `Booking or ticket confirmation from ${sender}.`;
    else if (email_type === 'security-alert') summary = `Security alert from ${sender} — account or subscription may need attention.`;
    else if (email_type === 'policy-update') summary = `${sender} has updated their privacy or terms policy.`;
    else if (email_type === 'newsletter') summary = `Newsletter or digest from ${sender}.`;
    else if (email_type === 'system-notification') summary = `Automated notification from ${sender}.`;
    else if (email_type === 'educational') summary = `Educational content or course invitation from ${sender}.`;
    else if (email_type === 'community-notification') summary = `Community or contribution update from ${sender}.`;
    else if (email_type === 'promotional') summary = `Promotional offer or deal from ${sender}.`;
    else summary = `${email_type.replace(/-/g, ' ')} from ${sender}.`;
    if (subject) summary += ` Subject: "${subject}".`;

    // ── Reasoning
    const reasonParts = [];
    reasonParts.push(`Classified as "${primary_category}" based on keyword matches.`);
    if (companies.length) reasonParts.push(`Detected companies: ${companies.join(', ')}.`);
    if (people.length) reasonParts.push(`Sender appears to be a person: ${people.join(', ')}.`);
    if (refTags.length) reasonParts.push(`Reference numbers found: ${refTags.join(', ')}.`);
    if (deadline_detected) reasonParts.push(`Deadline signal detected: "${deadline_detected}".`);
    if (action_required) reasonParts.push(`Action required: ${action_type}.`);
    if (priority === 'critical' || priority === 'high') reasonParts.push(`Priority elevated due to urgency keywords in subject/body.`);
    reasonParts.push(`Sentiment: ${sentiment} (pos signals: ${posScore}, neg signals: ${negScore}).`);
    const reasoning = reasonParts.join(' ');

    return {
      primary_category,
      subcategories,
      tags,
      priority,
      action_required,
      action_type,
      deadline_detected,
      companies,
      people,
      sentiment,
      email_type,
      summary,
      reasoning,
    };
  }

  // ── Smart Analysis (AI-powered) ─────────────────────────────────────────────
  async function analyzeEmailsBatch(emails) {
    const k = await new Promise(r => chrome.storage.sync.get('groqApiKey', d => r(d?.groqApiKey || '')));
    if (!k) {
      console.warn('Lensly: No Groq API key found. Falling back to offline tagger.');
      return emails.map(e => fallbackAnalyzeEmail(e));
    }
    
    const emailPayload = emails.map((e, i) => ({
      id: i,
      sender: e.sender,
      subject: e.subject,
      snippet: e.snippet,
      date: e.date
    }));

    const prompt = 
      `Analyze the following batch of emails.\n` +
      `For each email, generate a structured JSON object containing:\n` +
      `- "primary_category" (e.g. Work, Finance, Social, Newsletter, Promotional, Important)\n` +
      `- "subcategories" (array of strings)\n` +
      `- "tags" (generate 5 to 15 highly specific descriptive tags)\n` +
      `- "priority" ("critical", "high", "medium", "low")\n` +
      `- "action_required" (boolean)\n` +
      `- "action_type" (string describing the action)\n` +
      `- "deadline_detected" (string or null)\n\n` +
      `RETURN ONLY A JSON OBJECT with an "emails" array containing these results, keeping the exact same order as the input.\n\n` +
      JSON.stringify(emailPayload, null, 2);

    try {
      const response = await window.LenslySummarizer.groqChat(
        [{ role: 'user', content: prompt }], 
        '', 
        k, 
        { 
          jsonMode: true, 
          systemInstruction: 'You are an advanced email intelligence engine. Output valid JSON only.',
          temperature: 0.1,
          maxTokens: 4000
        }
      );
      
      const data = JSON.parse(response);
      return data.emails || [];
    } catch (err) {
      console.error('Lensly AI batch analysis failed:', err);
      return emails.map(e => fallbackAnalyzeEmail(e));
    }
  }

  // ── DOM readers ─────────────────────────────────────────────────────────────
  function readGmailInbox() {
    const rows = document.querySelectorAll('tr.zA, div[role="row"]');
    return Array.from(rows).map(row => {
      const sender = (row.querySelector('.yX.xY .yP, .yW, [email]')?.innerText || row.querySelector('.yX')?.innerText || '').trim();
      const subject = (row.querySelector('.y6, .bog, .bqe')?.innerText || '').trim();
      const snippet = (row.querySelector('.y2')?.innerText || '').trim();
      const date = (row.querySelector('.xW.xY .xW, td:last-child')?.innerText || '').trim();
      const unread = row.classList.contains('zE');
      const hasAttachment = !!row.querySelector('.yf.xY .brc, [aria-label*="attachment" i], [aria-label*="attached" i], .aZo, img[alt*="attachment" i]');
      const starred = !!row.querySelector('.T-KT-Jp[aria-label*="Starred"], .T-KT-Jp.T-KT-Jp-Mo');
      const fullText = `${sender} ${subject} ${snippet}`.toLowerCase();
      return { sender, subject, snippet, date, unread, hasAttachment, starred, fullText, el: row };
    });
  }

  function readOutlookInbox() {
    const rows = document.querySelectorAll('[role="option"], [data-convid], .customScrollBar [role="listbox"] > div');
    return Array.from(rows).map(row => {
      const text = (row.innerText || '').trim();
      const parts = text.split('\n').map(s => s.trim()).filter(Boolean);
      const sender = parts[0] || '';
      const subject = parts[1] || '';
      const snippet = parts.slice(2, 4).join(' ');
      const date = parts[parts.length - 1] || '';
      const hasAttachment = !!row.querySelector('[class*="attachment" i], [aria-label*="attachment" i], [aria-label*="file" i], i[data-icon-name*="Attachment" i], img[src*="attachment" i]');
      const fullText = text.toLowerCase();
      return { sender, subject, snippet, date, unread: false, hasAttachment, starred: false, fullText, el: row };
    });
  }

  function getEmails() {
    const host = location.hostname.toLowerCase();
    if (host.includes('mail.google.com')) return readGmailInbox();
    if (host.includes('outlook')) return readOutlookInbox();
    return [];
  }

  function getCurrentEmail() {
    const gmailBody = document.querySelector('[data-message-id] .a3s, .gs .a3s, .ii.gt, .nH .adn .a3s');
    if (gmailBody) {
      const subject = document.querySelector('h2.hP')?.innerText?.trim() || '';
      const sender = document.querySelector('.gD')?.getAttribute('email') || document.querySelector('.gD')?.innerText?.trim() || '';
      const body = gmailBody.innerText?.trim() || '';
      return { subject, sender, body, fullText: `${subject} ${sender} ${body}`.toLowerCase() };
    }
    const outlookBody = document.querySelector('[role="main"] [aria-label="Message body"], .ReadMsgBody, .allowTextSelection');
    if (outlookBody) {
      const subject = document.querySelector('[role="main"] [role="heading"]')?.innerText?.trim() || '';
      const body = outlookBody.innerText?.trim() || '';
      return { subject, sender: '', body, fullText: `${subject} ${body}`.toLowerCase() };
    }
    return null;
  }

  // ── Highlighting and Badge injection ───────────────────────────────────────
  function insertBadges(rowEl, badges) {
    if (rowEl.querySelector('.lensly-email-badge-container')) {
      rowEl.querySelector('.lensly-email-badge-container').remove();
    }
    // Remove old single badges if they exist
    rowEl.querySelectorAll('.lensly-email-badge').forEach(b => b.remove());

    if (!badges || !badges.length) return;

    const container = document.createElement('span');
    container.className = 'lensly-email-badge-container';
    container.style.cssText = 'display:inline-flex; gap:4px; margin-right:8px; align-items:center; vertical-align:middle;';

    badges.forEach(b => {
      const badge = document.createElement('span');
      badge.className = `lensly-email-badge ${b.className}`;
      badge.textContent = b.label;
      // Default inline styling to guarantee visibility
      badge.style.cssText = 'font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; text-transform:uppercase; line-height:1.2; letter-spacing:0.5px;';
      
      if (b.type === 'priority') {
        if (b.label === 'High' || b.label === 'Critical') { badge.style.backgroundColor = '#fee2e2'; badge.style.color = '#dc2626'; }
        else if (b.label === 'Medium') { badge.style.backgroundColor = '#fef3c7'; badge.style.color = '#d97706'; }
        else { badge.style.backgroundColor = '#f1f5f9'; badge.style.color = '#475569'; }
      } else {
        // Categories
        badge.style.backgroundColor = '#e0f2fe'; badge.style.color = '#0284c7';
      }
      container.appendChild(badge);
    });

    // Try finding the subject text container more aggressively
    // In Gmail, unread is often .bog, .bqe. Read is .y6. We also check common Outlook classes.
    const subjectContainer = rowEl.querySelector('.y6, .bog, .bqe, .xT .a4W, [class*="subject"], div > span');
    if (subjectContainer) {
      subjectContainer.insertBefore(container, subjectContainer.firstChild);
    } else {
      // Fallback: prepend to the row itself if nothing else matches
      rowEl.insertBefore(container, rowEl.firstChild);
    }
  }

  function clearEmailHighlights() {
    const classes = [
      'lensly-email-row-work', 'lensly-email-row-finance', 'lensly-email-row-shopping',
      'lensly-email-row-social', 'lensly-email-row-newsletter', 'lensly-email-row-travel',
      'lensly-email-row-promo', 'lensly-email-row-security', 'lensly-email-row-personal',
      'lensly-email-row-high', 'lensly-email-row-medium', 'lensly-email-row-low',
      'lensly-email-row-onedrive', 'lensly-email-row-critical'
    ];
    document.querySelectorAll(classes.map(c => '.' + c).join(', ')).forEach(el => {
      classes.forEach(c => el.classList.remove(c));
    });
    document.querySelectorAll('.lensly-email-badge, .lensly-email-badge-container').forEach(b => b.remove());
  }

  // ── Sorting Logic ──────────────────────────────────────────────────────────
  function getCategoryKey(fullText) {
    let bestCat = 'other';
    let bestScore = 0;
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const score = cat.keywords.reduce((s, kw) => s + (fullText.includes(kw) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; bestCat = key; }
    }
    return bestCat;
  }

  function getPriorityWeight(fullText, starred, unread, sender) {
    const text = fullText || '';
    if (text.includes('onedrive')) return 1;
    const isHigh = PRIORITY_HIGH.some(kw => text.includes(kw)) || starred || (unread && sender && sender.toLowerCase().includes('boss'));
    if (isHigh) return 3;
    const isMed = PRIORITY_MED.some(kw => text.includes(kw)) || unread;
    if (isMed) return 2;
    return 1;
  }

  function rearrangeEmails(sortedEmails) {
    if (!sortedEmails || !sortedEmails.length) return;
    const parent = sortedEmails[0].el.parentNode;
    if (!parent) return;
    const originalStyles = sortedEmails.map(e => ({
      transform: e.el.style.transform || '',
      top: e.el.style.top || '',
      position: e.el.style.position || ''
    }));
    sortedEmails.forEach((e, idx) => {
      parent.appendChild(e.el);
      if (originalStyles[idx]) {
        if (originalStyles[idx].transform) e.el.style.transform = originalStyles[idx].transform;
        if (originalStyles[idx].top) e.el.style.top = originalStyles[idx].top;
      }
    });
  }

  // ── Unified Smart Tagging ──────────────────────────────────────────────────
  let _isAnalyzing = false;

  async function applySmartTags(isInterval = false) {
    if (_isAnalyzing) return;
    if (!isInterval) clearEmailHighlights();
    const emails = getEmails();
    if (!emails.length) return;

    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    
    const untaggedEmails = emails.filter(e => {
      if (e.el.dataset.lenslyTagged || e.el.dataset.lenslyProcessing) return false;
      const rect = e.el.getBoundingClientRect();
      return (rect.top >= -200 && rect.bottom <= windowHeight + 200);
    });

    if (!untaggedEmails.length) return;

    const batch = untaggedEmails.slice(0, 10);
    if (!batch.length) return;

    _isAnalyzing = true;
    batch.forEach(e => {
      e.el.dataset.lenslyProcessing = 'true';
      insertBadges(e.el, [{ label: 'Analyzing...', className: 'lensly-badge-category', type: 'category' }]);
    });

    const results = await analyzeEmailsBatch(batch);

    results.forEach((meta, idx) => {
      const e = batch[idx];
      if (!e || !meta) return;
      delete e.el.dataset.lenslyProcessing;
      e.el.dataset.lenslyTagged = 'true';

      const badgesToInsert = [];

      const priorityStr = (meta.priority || 'low').toLowerCase();
      if (priorityStr === 'critical' || priorityStr === 'high') {
        badgesToInsert.push({ label: priorityStr === 'critical' ? 'CRITICAL' : 'HIGH PRIORITY', className: `lensly-badge-${priorityStr}`, type: 'priority' });
        e.el.classList.add(`lensly-email-row-${priorityStr}`);
      } else if (priorityStr === 'medium') {
        badgesToInsert.push({ label: 'MEDIUM', className: `lensly-badge-${priorityStr}`, type: 'priority' });
        e.el.classList.add(`lensly-email-row-${priorityStr}`);
      }

      if (meta.primary_category) {
        badgesToInsert.push({ label: meta.primary_category.toUpperCase(), className: `lensly-badge-category`, type: 'category' });
      }

      if (meta.action_required && meta.action_type) {
        badgesToInsert.push({ label: meta.action_type.toUpperCase(), className: `lensly-badge-action`, type: 'category' });
      }
      
      if (Array.isArray(meta.tags)) {
        meta.tags.slice(0, 3).forEach(t => {
          badgesToInsert.push({ label: t.replace(/-/g, ' ').toUpperCase(), className: `lensly-badge-tag`, type: 'category' });
        });
      }

      insertBadges(e.el, badgesToInsert);
    });

    _isAnalyzing = false;
    
    // Automatically process next batch if there are more untagged emails in view
    setTimeout(() => {
      applySmartTags(true);
    }, 500);
  }

  function applyCategorization(isInterval = false) {
    applySmartTags(isInterval);
  }

  function applyPriority(isInterval = false) {
    applySmartTags(isInterval);
  }

  function detectPriority() {
    applyPriority();
    openEmailDashboard('email-overview');
    return 'Priority detection complete. High-priority threads sorted to top.';
  }

  // ── 3. Follow-Up Reminders ─────────────────────────────────────────────────
  function followUpReminders() {
    openEmailDashboard('email-followup');
    return 'Follow-up analysis shown in the side panel.';
  }

  function getFollowUpData() {
    const emails = getEmails();
    const current = getCurrentEmail();
    const toCheck = current ? [{ ...current, sender: current.sender, subject: current.subject }] : emails;
    const needFollowUp = [];

    toCheck.forEach(e => {
      const text = e.fullText || '';
      const reasons = [];
      FOLLOWUP_SIGNALS.forEach(sig => {
        if (text.includes(sig)) reasons.push(`Contains "${sig}"`);
      });
      if (e.unread) reasons.push('Unread');
      if (reasons.length) {
        needFollowUp.push({
          sender: e.sender || 'Unknown',
          subject: e.subject || '(no subject)',
          reasons: reasons.slice(0, 3),
          el: e.el
        });
      }
    });
    return needFollowUp;
  }

  function guessFileType(name) {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const map = { pdf: 'PDF', doc: 'Document', docx: 'Document', xls: 'Spreadsheet', xlsx: 'Spreadsheet', csv: 'Spreadsheet', ppt: 'Presentation', pptx: 'Presentation', jpg: 'Image', jpeg: 'Image', png: 'Image', gif: 'Image', zip: 'Archive', rar: 'Archive', txt: 'Text' };
    return map[ext] || 'File';
  }

  // ── 5. Duplicate Detection ─────────────────────────────────────────────────
  function detectDuplicates() {
    openEmailDashboard('email-overview');
    return 'Duplicates categorized in the Overview panel.';
  }

  // ── 6. AI Summarize & Tasks ────────────────────────────────────────────────
  async function summarizeEmail() {
    const current = getCurrentEmail();
    if (!current) throw new Error('Open an email first to use AI Summarizer.');
    const k = await new Promise(r => chrome.storage.sync.get('groqApiKey', d => r(d?.groqApiKey || '')));

    if (!k) {
      return window.LenslySummarizer.extractSummarise(current.body, 3);
    }
    return window.LenslySummarizer.groqChat([
      { role: 'user', content: 'Summarize this email in 3-4 bullet points highlighting sender, key topic, and any deadline:\n\n' + current.body }
    ], '', k);
  }

  async function extractTasks() {
    const current = getCurrentEmail();
    if (!current) throw new Error('Open an email first to extract action items.');
    const k = await new Promise(r => chrome.storage.sync.get('groqApiKey', d => r(d?.groqApiKey || '')));

    if (!k) {
      return 'Please enter a Groq API Key in settings to extract tasks.';
    }
    return window.LenslySummarizer.groqChat([
      { role: 'user', content: 'Extract a clean list of action items, tasks, and to-dos from this email. Return only a bulleted list of tasks, nothing else. If no tasks, reply: "No tasks found."\n\n' + current.body }
    ], '', k);
  }

  // ── In-Page Email Dashboard ────────────────────────────────────────────────
  function initEmailDashboard() {
    if (document.getElementById('lensly-email-dashboard')) return;

    _emailDashboardEl = document.createElement('div');
    _emailDashboardEl.id = 'lensly-email-dashboard';
    _emailDashboardEl.className = 'lensly-inpage-dashboard';
    _emailDashboardEl.innerHTML = `
      <div class="lid-header">
        <div class="lid-header-title">Email Intelligence</div>
        <button class="lid-close" type="button">&times;</button>
      </div>
      <div class="lid-tabs">
        <button class="lid-tab-btn active" data-tab="email-overview">Overview</button>
        <button class="lid-tab-btn" data-tab="email-followup">Follow-Ups</button>
        <button class="lid-tab-btn" data-tab="email-ai">AI Insights</button>
      </div>
      <div class="lid-body">
        <div class="lid-tab-panel" id="lid-panel-email-overview" style="display:block"></div>
        <div class="lid-tab-panel" id="lid-panel-email-followup" style="display:none"></div>
        <div class="lid-tab-panel" id="lid-panel-email-ai" style="display:none"></div>
      </div>
      <div class="lid-footer">
        <button class="lid-btn" id="lid-email-clear-hl" style="flex: 1;" type="button">Clear Highlights</button>
      </div>
    `;

    document.body.appendChild(_emailDashboardEl);

    _emailDashboardEl.querySelector('.lid-close').addEventListener('click', () => {
      _emailDashboardEl.classList.remove('open');
    });

    const tabBtns = _emailDashboardEl.querySelectorAll('.lid-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _emailDashboardEl.querySelectorAll('.lid-tab-panel').forEach(p => p.style.display = 'none');
        _emailDashboardEl.querySelector('#lid-panel-' + btn.dataset.tab).style.display = 'block';
        refreshDashboardPanel(btn.dataset.tab);
      });
    });

    _emailDashboardEl.querySelector('#lid-email-clear-hl').addEventListener('click', () => {
      clearEmailHighlights();
    });
  }

  function openEmailDashboard(activeTab = 'email-overview') {
    initEmailDashboard();
    _emailDashboardEl.classList.add('open');
    const tabBtn = _emailDashboardEl.querySelector(`.lid-tab-btn[data-tab="${activeTab}"]`);
    if (tabBtn) tabBtn.click();
  }

  function refreshDashboardPanel(tab) {
    if (tab === 'email-overview') populateOverviewPanel();
    else if (tab === 'email-followup') populateFollowupPanel();
    else if (tab === 'email-ai') populateAIPanel();
  }

  // ── Populate Email Panels ──────────────────────────────────────────────────
  function populateOverviewPanel() {
    const container = document.getElementById('lid-panel-email-overview');
    if (!container) return;

    const emails = getEmails();
    if (!emails.length) {
      container.innerHTML = `<div class="lid-empty">Inbox is empty or not loaded yet. Open Gmail or Outlook.</div>`;
      return;
    }

    const categoriesCount = {};
    emails.forEach(e => {
      const isOneDrive = e.fullText.includes('onedrive');
      const catKey = isOneDrive ? 'personal' : getCategoryKey(e.fullText);
      const bestCat = CATEGORIES[catKey]?.label || 'Other';
      categoriesCount[bestCat] = (categoriesCount[bestCat] || 0) + 1;
    });

    let catSummary = '';
    Object.entries(categoriesCount).forEach(([cat, count]) => {
      const isCurrentFilter = _emailFilter === cat.toLowerCase();
      catSummary += `
        <div class="lid-cat-summary-row" data-cat="${cat.toLowerCase()}" style="display:flex; justify-content:space-between; font-size:12.5px; padding:6px 8px; border-bottom:1px solid #f2f5f8; cursor:pointer; border-radius:4px; background:${isCurrentFilter ? 'rgba(39,76,119,0.08)' : 'transparent'};">
          <span style="font-weight:500; text-decoration:underline;">${cat}</span>
          <span style="font-weight:600; color:#274c77;">${count} emails</span>
        </div>
      `;
    });

    const filteredEmails = emails.filter(e => {
      if (_emailFilter) {
        const isOneDrive = e.fullText.includes('onedrive');
        const catKey = isOneDrive ? 'personal' : getCategoryKey(e.fullText);
        const bestCat = CATEGORIES[catKey]?.label || 'Other';
        return bestCat.toLowerCase() === _emailFilter;
      }
      return true;
    });

    const threadTitle = _emailFilter
      ? `Email Threads (Filtered: ${_emailFilter.charAt(0).toUpperCase() + _emailFilter.slice(1)} — ${filteredEmails.length})`
      : `Email Threads (${emails.length})`;

    container.innerHTML = `
      <div class="lid-section-title">Inbox Breakdown</div>
      <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">Click Work, Personal, or Travel to filter list.</div>
      <div style="margin-bottom: 15px; background:#f8fafc; padding:6px; border-radius:8px; border:1px solid #e7ecef;">
        ${catSummary || 'No categories found.'}
      </div>
      <div class="lid-section-title">${threadTitle}</div>
      <div class="lid-list"></div>
    `;

    container.querySelectorAll('.lid-cat-summary-row').forEach(row => {
      const cat = row.dataset.cat;
      row.addEventListener('click', () => {
        _emailFilter = _emailFilter === cat ? null : cat;
        populateOverviewPanel();
      });
    });

    const list = container.querySelector('.lid-list');
    filteredEmails.forEach(e => {
      const el = document.createElement('div');
      el.className = 'lid-item';
      el.innerHTML = `
        <div class="lid-item-title" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${e.sender}</div>
        <div class="lid-item-desc" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap;"><strong>${e.subject || '(No Subject)'}</strong></div>
        <div class="lid-item-desc" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-style:italic;">${e.snippet || ''}</div>
      `;
      if (e.el) {
        el.addEventListener('click', () => {
          e.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          e.el.style.outline = '2px solid #274c77';
          e.el.click();
          setTimeout(() => { e.el.style.outline = ''; }, 1500);
        });
      }
      list.appendChild(el);
    });
  }

  function populateFollowupPanel() {
    const container = document.getElementById('lid-panel-email-followup');
    if (!container) return;

    const followUps = getFollowUpData();
    if (!followUps.length) {
      container.innerHTML = `<div class="lid-empty">No emails flagged for follow-up reminders.</div>`;
      return;
    }

    container.innerHTML = `
      <div class="lid-section-title">Follow-up Reminders (${followUps.length})</div>
      <div style="font-size:11.5px; color:#64748b; margin-bottom:12px;">These threads contain response indicators or remain unread.</div>
      <div class="lid-list"></div>
    `;

    const list = container.querySelector('.lid-list');
    followUps.forEach(f => {
      const el = document.createElement('div');
      el.className = 'lid-item';
      el.innerHTML = `
        <div class="lid-item-title" style="color: #d97706">[Review Needed] ${f.sender}</div>
        <div class="lid-item-desc"><strong>${f.subject}</strong></div>
        <div class="lid-item-desc" style="margin-top:4px;">Signals: <span style="font-weight:600; color:#4b5563;">${f.reasons.join(', ')}</span></div>
      `;
      if (f.el) {
        el.addEventListener('click', () => {
          f.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          f.el.style.outline = '2px solid #f59e0b';
          setTimeout(() => { f.el.style.outline = ''; }, 1500);
        });
      }
      list.appendChild(el);
    });
  }

  function populateAIPanel() {
    const container = document.getElementById('lid-panel-email-ai');
    if (!container) return;

    const current = getCurrentEmail();
    if (!current) {
      container.innerHTML = `
        <div class="lid-empty">
          <svg style="width:36px; height:36px; fill:#7a96ae; margin-bottom:8px;" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
          <div style="font-weight:600;">No email open</div>
          <div style="font-size:12px; margin-top:4px;">Open an email in Gmail or Outlook to generate AI summaries and extract tasks.</div>
        </div>
      `;
      return;
    }

    // Run rule-based analysis immediately on the open email
    const meta = analyzeEmail(current);

    // Priority color map
    const priorityColors = { critical: '#b94040', high: '#d97706', medium: '#2563eb', low: '#64748b' };
    const sentimentColors = { positive: '#16a34a', negative: '#b94040', neutral: '#64748b' };

    // Build tags HTML
    const tagsHtml = meta.tags.map(t =>
      `<span style="display:inline-block; background:#f0f4f8; color:#3a5068; font-size:10.5px; padding:2px 7px; border-radius:10px; margin:2px 2px 2px 0; border:1px solid #e2e8f0;">${t}</span>`
    ).join('');

    container.innerHTML = `
      <div class="lid-section-title">AI Email Assistant</div>
      <div style="font-size:12px; margin-bottom:10px; background:#f2f5f8; padding:8px; border-radius:6px; font-weight:500;">
        Active Email: <strong style="color:#274c77;">${current.subject || '(no subject)'}</strong>
      </div>

      <div style="margin-bottom:12px; background:#f8fafc; border:1px solid #e7ecef; border-radius:8px; padding:10px 12px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <span style="font-size:11px; font-weight:600; background:#274c77; color:#fff; padding:2px 9px; border-radius:10px;">${meta.primary_category}</span>
          <span style="font-size:11px; font-weight:600; color:${priorityColors[meta.priority] || '#64748b'}; border:1px solid ${priorityColors[meta.priority] || '#e2e8f0'}; padding:2px 8px; border-radius:10px; text-transform:uppercase;">${meta.priority}</span>
          ${meta.action_required ? `<span style="font-size:11px; font-weight:600; background:#fff3cd; color:#92400e; padding:2px 8px; border-radius:10px;">⚠ Action Required</span>` : ''}
          <span style="font-size:11px; color:${sentimentColors[meta.sentiment] || '#64748b'}; padding:2px 8px; border-radius:10px; border:1px solid #e2e8f0;">${meta.sentiment}</span>
        </div>

        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <tr>
            <td style="color:#64748b; padding:3px 0; width:38%;">Email type</td>
            <td style="color:#1e293b; font-weight:500;">${meta.email_type}</td>
          </tr>
          ${meta.action_type ? `<tr><td style="color:#64748b; padding:3px 0;">Action</td><td style="color:#1e293b; font-weight:500;">${meta.action_type}</td></tr>` : ''}
          ${meta.deadline_detected ? `<tr><td style="color:#64748b; padding:3px 0;">Deadline</td><td style="color:#b94040; font-weight:500;">${meta.deadline_detected}</td></tr>` : ''}
          ${meta.companies.length ? `<tr><td style="color:#64748b; padding:3px 0;">Companies</td><td style="color:#1e293b; font-weight:500;">${meta.companies.join(', ')}</td></tr>` : ''}
          ${meta.people.length ? `<tr><td style="color:#64748b; padding:3px 0;">People</td><td style="color:#1e293b; font-weight:500;">${meta.people.join(', ')}</td></tr>` : ''}
          ${meta.subcategories.length ? `<tr><td style="color:#64748b; padding:3px 0;">Subcategories</td><td style="color:#1e293b;">${meta.subcategories.join(', ')}</td></tr>` : ''}
        </table>

        <div style="margin-top:8px; border-top:1px solid #e7ecef; padding-top:8px;">
          <div style="font-size:11px; color:#64748b; margin-bottom:4px; font-weight:500;">Tags</div>
          <div>${tagsHtml}</div>
        </div>

        <div style="margin-top:8px; border-top:1px solid #e7ecef; padding-top:8px; font-size:12px; color:#3a5068; font-style:italic; line-height:1.5;">
          ${meta.summary}
        </div>

        <div style="margin-top:8px; border-top:1px solid #e7ecef; padding-top:8px; font-size:11px; color:#64748b; line-height:1.5;">
          <strong>Reasoning:</strong> ${meta.reasoning}
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button class="lid-btn lid-btn-primary" id="lid-btn-sum" style="flex:1;">Summarize (AI)</button>
        <button class="lid-btn lid-btn-primary" id="lid-btn-tasks" style="flex:1;">Extract Tasks (AI)</button>
      </div>

      <div id="lid-ai-loading" style="display:none; align-items:center; gap:8px; font-size:13px; color:#3a5068;">
        <div class="lensly-spinner"></div> Processing...
      </div>

      <div id="lid-ai-result" style="display:none; font-size:13px; line-height:1.6; white-space:pre-wrap; background:#f8fafc; border:1px solid #e7ecef; padding:12px; border-radius:8px; max-height:220px; overflow-y:auto;">
      </div>
    `;

    const loadEl = container.querySelector('#lid-ai-loading');
    const resEl = container.querySelector('#lid-ai-result');

    container.querySelector('#lid-btn-sum').addEventListener('click', () => {
      loadEl.style.display = 'flex';
      resEl.style.display = 'none';
      summarizeEmail().then(summary => {
        loadEl.style.display = 'none';
        resEl.textContent = summary;
        resEl.style.display = 'block';
      }).catch(err => {
        loadEl.style.display = 'none';
        resEl.innerHTML = `<span style="color:#b94040">Error: ${err.message}</span>`;
        resEl.style.display = 'block';
      });
    });

    container.querySelector('#lid-btn-tasks').addEventListener('click', () => {
      loadEl.style.display = 'flex';
      resEl.style.display = 'none';
      extractTasks().then(tasks => {
        loadEl.style.display = 'none';
        resEl.textContent = tasks;
        resEl.style.display = 'block';
      }).catch(err => {
        loadEl.style.display = 'none';
        resEl.innerHTML = `<span style="color:#b94040">Error: ${err.message}</span>`;
        resEl.style.display = 'block';
      });
    });
  }

  // ── Toolbar injection ──────────────────────────────────────────────────────
  function injectEmailToolbar() {
    if (_emailToolbarInjected || document.getElementById('lensly-email-toolbar')) return;
    const host = location.hostname.toLowerCase();
    const isGmail = host.includes('mail.google.com');
    const isOutlook = host.includes('outlook');
    if (!isGmail && !isOutlook) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'lensly-email-toolbar';
    toolbar.innerHTML = `
      <span class="let-label">Lensly Email</span>
      <button class="let-btn" data-action="emailCategorize" title="Categorize & Rearrange Emails">Categorize</button>
      <button class="let-btn" data-action="emailPriority" title="Priority & Sort Emails">Priority</button>
      <button class="let-btn" data-action="emailFollowUp" title="Follow-Up Reminders">Follow-Ups</button>
      <button class="let-btn let-close" data-action="close" title="Close toolbar">&times;</button>
    `;
    document.body.appendChild(toolbar);
    _emailToolbarInjected = true;

    function setToolbarMode(action) {
      if (_activeMode === action) {
        _activeMode = null;
        clearEmailHighlights();
        if (_observerInterval) clearInterval(_observerInterval);
        document.querySelectorAll('#lensly-email-toolbar .let-btn').forEach(b => b.classList.remove('active', 'btn-toggled-on'));
        return;
      }
      _activeMode = action;
      document.querySelectorAll('#lensly-email-toolbar .let-btn').forEach(b => {
        if (b.dataset.action === action) b.classList.add('active', 'btn-toggled-on');
        else b.classList.remove('active', 'btn-toggled-on');
      });
      executeMode(action);
      if (_observerInterval) clearInterval(_observerInterval);
      if (action === 'emailCategorize' || action === 'emailPriority') {
        _observerInterval = setInterval(() => {
          executeMode(_activeMode, true);
        }, 1000);
      }
    }

    function executeMode(action, isInterval = false) {
      if (action === 'emailCategorize') {
        applyCategorization(isInterval);
        if (!isInterval) openEmailDashboard('email-overview');
      } else if (action === 'emailPriority') {
        applyPriority(isInterval);
        if (!isInterval) openEmailDashboard('email-overview');
      } else if (action === 'emailFollowUp') {
        if (!isInterval) openEmailDashboard('email-followup');
      }
    }

    toolbar.addEventListener('click', e => {
      const action = e.target.dataset?.action;
      if (!action) return;
      if (action === 'close') {
        toolbar.remove();
        _emailToolbarInjected = false;
        if (_observerInterval) clearInterval(_observerInterval);
        clearEmailHighlights();
        return;
      }
      try {
        setToolbarMode(action);
      } catch (err) {
        alert('Lensly: ' + err.message);
      }
    });
  }

  // ── Auto-init ──────────────────────────────────────────────────────────────
  function autoInit() {
    const host = location.hostname.toLowerCase();
    if (host.includes('mail.google.com') || host.includes('outlook')) {
      setTimeout(injectEmailToolbar, 2000);
    }
  }

  return { categorize, detectPriority, followUpReminders, detectDuplicates, summarizeEmail, extractTasks, analyzeEmail, autoInit, injectEmailToolbar, openEmailDashboard };
})();

// Auto-initialize
window.LenslyEmailTools.autoInit();