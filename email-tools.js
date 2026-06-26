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
    finance: {
      strong: ['invoice', 'tax return', '1099', 'w-2', 'wire transfer', 'mortgage', 'overdue', 'chargeback', 'bank statement'],
      keywords: ['payment', 'receipt', 'bank', 'transaction', 'transfer', 'balance', 'credit', 'debit', 'billing', 'subscription', 'refund', 'tax', 'paypal', 'stripe', 'statement', 'bill', 'receipts', 'chase', 'wells fargo', 'crypto', 'coinbase', 'deposit', 'withdrawal', 'overdraft', 'loan', 'salary', 'payroll', 'payslip', 'investment', 'portfolio', 'dividend', 'expense', 'reimbursement', 'checkout', 'remittance', 'card ending in', 'account ending in', 'declined', 'funds', 'venmo', 'cashapp', 'zelle', 'amortization', 'audit', '1040', 'stock', 'bond', 'ira', '401k', 'pension', 'mutual fund', 'etf', 'wire', 'ach', 'direct deposit', 'settlement', 'escrow', 'insurance', 'premium', 'deductible', 'claim', 'appraisal', 'routing number', 'swift code', 'iban', 'delinquent', 'dispute', 'foreclosure', 'bankruptcy', 'capital gains', 'roth', 'dividend yield'],
      label: 'Finance'
    },
    work: {
      strong: ['jira', 'pull request', 'merge request', 'all hands', 'standup', 'sprint', 'performance review', 'timesheet', 'post-mortem', 'rca'],
      keywords: ['meeting', 'agenda', 'project', 'deadline', 'quarterly', 'report', 'slack', 'milestone', 'deliverable', 'stakeholder', 'onboard', 'offboard', 'review', 'approval', 'zoom', 'teams', 'client', 'sync', 'follow up', 'docs', 'okr', 'kpi', 'roadmap', 'pitch', 'proposal', 'contract', 'nda', 'invoice', 'huddle', '1:1', 'one on one', 'briefing', 'minutes', 'action items', 'deployment', 'outage', 'downtime', 'git', 'github', 'gitlab', 'all-hands', 'town hall', 'brown bag', 'retrospective', 'retro', 'root cause', 'capacity', 'bandwidth', 'resourcing', 'timesheets', 'pto', 'sick leave', 'vacation request', 'wfh', 'out of office', 'ooo', 'onboarding', 'training', 'compliance', 'phishing simulation', 'it ticket', 'helpdesk', 'access request', 'vpn', 'sso', 'scrum', 'kanban', 'on-call', 'pagerduty'],
      label: 'Work'
    },
    shopping: {
      strong: ['order confirmation', 'shipped', 'out for delivery', 'tracking number', 'refund processed', 'receipt', 'your item', 'dispatched'],
      keywords: ['order', 'shipping', 'delivered', 'tracking', 'cart', 'purchase', 'discount', 'coupon', 'sale', 'amazon', 'flipkart', 'ebay', 'shopify', 'return', 'warehouse', 'delivery', 'package', 'store', 'fedex', 'ups', 'usps', 'dhl', 'arrive by', 'estimated delivery', 'shopping bag', 'wishlist', 'in stock', 'backorder', 'cancel order', 'back in stock', 'price drop', 'black friday', 'cyber monday', 'prime day', 'gift card', 'e-gift', 'store credit', 'loyalty points', 'cash back', 'rebate', 'warranty', 'guarantee', 'exchange', 'rma', 'restocking fee', 'pre-order', 'waitlist', 'early bird', 'add to cart', 'checkout now', 'bogo', 'clearance'],
      label: 'Shopping'
    },
    social: {
      strong: ['friend request', 'tagged', 'mentioned', 'new follower', 'wants to connect', 'accepted your invitation', 'retweeted', 'upvoted'],
      keywords: ['facebook', 'twitter', 'instagram', 'linkedin', 'tiktok', 'youtube', 'notification', 'followed', 'liked', 'commented', 'connection', 'pinterest', 'reddit', 'tweet', 'retweet', 'shared your post', 'replied to your', 'snapchat', 'discord', 'twitch', 'subscribed', 'upvote', 'pinned', 'highlight', 'story', 'reel', 'short', 'live stream', 'went live', 'channel', 'subscribed to', 'patreon', 'discord server', 'slack workspace', 'invitation to join', 'friend suggestion', 'people you may know', 'group invite', 'event invite', 'attending', 'connections'],
      label: 'Social Media'
    },
    newsletter: {
      strong: ['unsubscribe', 'manage your preferences', 'why am i receiving this', 'view in browser', 'opt out', 'mailing list'],
      keywords: ['newsletter', 'weekly digest', 'daily digest', 'monthly update', 'email preferences', 'no longer wish', 'subscription', 'digest', 'read more', 'roundup', 'add us to your address book', 'subscribers', 'bulletin', 'latest news', 'update from', 'in this edition', 'curated for you', 'trending', 'the week in review', 'monthly roundup', 'editor\'s picks', 'top stories', 'breaking news', 'exclusive content', 'sneak peek', 'behind the scenes', 'insider', 'forwarded this email', 'update your preferences', 'privacy policy update', 'terms of service update', 'read full article', 'substack', 'medium', 'ghost'],
      label: 'Newsletter'
    },
    travel: {
      strong: ['boarding pass', 'itinerary', 'flight', 'reservation', 'check-in', 'departure', 'arrival', 'seat assignment'],
      keywords: ['booking', 'hotel', 'airbnb', 'layover', 'uber', 'lyft', 'taxi', 'ticket', 'trip', 'airline', 'expedia', 'booking.com', 'agoda', 'kayak', 'skyscanner', 'terminal', 'gate', 'baggage', 'seat', 'miles', 'frequent flyer', 'passport', 'visa', 'car rental', 'train ticket', 'amtrak', 'cruise', 'accommodation', 'hostel', 'resort', 'check out', 'boarding time', 'upgrade', 'frequent flyer program', 'lounge access', 'tsa precheck', 'global entry', 'customs', 'immigration', 'rental car confirmation', 'shuttle', 'transfer', 'excursion', 'tour', 'sightseeing', 'museum ticket', 'travel insurance', 'cancellation policy', 'non-refundable', 'boarding group'],
      label: 'Travel'
    },
    promo: {
      strong: ['% off', 'flash sale', 'doorbuster', 'everything must go', 'bogo 50%', 'liquidation', 'clearance sale', 'promo code'],
      keywords: ['limited time', 'act now', 'exclusive offer', 'free trial', 'click here', 'buy now', 'don\'t miss', 'hurry', 'deal', 'clearance', 'special offer', 'save', 'discount', 'bogo', 'half price', 'early access', 'vip', 'rewards', 'cashback', 'giveaway', 'win', 'chance to win', 'today only', 'ends soon', 'last chance', 'flash deal', 'going out of business', 'buy one get one', 'free shipping', 'free returns', 'no minimum', 'stackable', 'loyalty member', 'vip exclusive', 'early access sale', 'refer a friend', 'affiliate', 'markdown', 'promo', 'coupon inside'],
      label: 'Promotional'
    },
    security: {
      strong: ['unusual activity', 'suspicious sign-in', 'unauthorized', 'compromised', 'vulnerability', 'reset your password', 'security alert', 'new sign-in'],
      keywords: ['password', 'login attempt', 'suspicious', 'verify', 'two-factor', '2fa', 'authentication', 'reset your', 'account locked', 'sign-in', 'verification', 'code', 'one-time passcode', 'otp', 'device recognized', 'new device', 'security notice', 'breach', 'phishing', 'recovery', 'identity', 'mfa', 'authenticator', 'login alert', 'unrecognized device', 'password changed', 'email address changed', 'phone number added', 'recovery email', 'security questions', 'prevented a sign-in', 'blocked attempt', 'verify your identity', 'confirm your email', 'activate your account', 'suspicious activity'],
      label: 'Security'
    },
    personal: {
      strong: ['happy birthday', 'wedding', 'sympathy card', 'baby shower', 'bridal shower', 'bachelorette', 'save the date'],
      keywords: ['birthday', 'congratulations', 'baby', 'vacation', 'holiday', 'family', 'reunion', 'dinner', 'lunch', 'party', 'invite', 'rsvp', 'onedrive', 'hello', 'how are you', 'catching up', 'weekend', 'miss you', 'get well', 'sympathy', 'condolences', 'thinking of you', 'let\'s meet', 'drinks', 'coffee', 'bbq', 'barbecue', 'celebration', 'graduation', 'anniversary', 'photos', 'album', 'memories', 'happy anniversary', 'congrats', 'so proud of you', 'missed you', 'thinking about you', 'praying for you', 'bachelor party', 'invitation', 'potluck', 'picnic', 'get together', 'catch up soon', 'catch up'],
      label: 'Personal'
    },
  };

  const PRIORITY_HIGH = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'deadline today', 'action required', 'time-sensitive', 'respond by', 'eod', 'end of day', 'important', 'needs your attention', 'escalation', 'blocker', 'attention required', 'past due', 'final notice', 'action needed', 'immediate action', 'urgent request', 'please read', 'closing tonight', 'final reminder', 'action required today', 'due today', 'expires today', 'last chance', 'warning', 'breach', 'security alert', 'unauthorized', 'suspicious', 'cancellation', 'declined', 'failed', 'overdue', 'penalty', 'urgent action', 'required immediately', 'must be completed', 'immediate attention', 'urgent matter', 'time sensitive', 'requires your attention', 'imperative', 'mandatory', 'expiring', 'action requested', 'attention needed', 'high priority', 'action required immediately', 'shutdown', 'shut down'];
  const PRIORITY_MED = ['follow up', 'reminder', 'please review', 'when you can', 'by this week', 'schedule', 'let me know', 'your input', 'feedback needed', 'pending', 'checking in', 'touch base', 'quick question', 'thoughts on', 'for your review', 'update on', 'status update', 'circle back', 'following up', 'just a reminder', 'action items', 'to do', 'upcoming deadline', 'don\'t forget', 'don’t forget', 'action recommended', 'please complete', 'kindly review', 'needs review', 'please respond', 'requires approval', 'needs approval', 'action item', 'action required by', 'upcoming', 'due soon', 'approaching', 'heads up', 'for your awareness', 'check-in', 'gentle reminder'];
  const FOLLOWUP_SIGNALS = ['?', 'please reply', 'let me know', 'your thoughts', 'awaiting', 'waiting for', 'get back to', 'any update', 'follow up', 'could you', 'can you', 'would you', 'what do you think', 'let me know if', 'please confirm', 'does this work', 'are you available', 'when are you free', 'how does that sound', 'look forward to hearing from you', 'please advise'];
  const ATTACHMENT_KEYWORDS = ['attached', 'attachment', 'find enclosed', 'see attached', 'enclosed', 'file', 'document', 'pdf', 'spreadsheet', 'presentation', 'image', 'photo', 'screenshot', 'have attached', 'is attached', 'are attached', 'attaching', 'upload', 'resume', 'cv', 'portfolio', 'receipt', 'invoice', 'contract'];

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

  function analyzeEmail(emailObj) {
    const { sender = '', subject = '', snippet = '', body = '' } = emailObj;
    const fullText = `${sender} ${subject} ${snippet} ${body}`.toLowerCase();
    const rawText = `${sender} ${subject} ${snippet} ${body}`;

    // ── Primary category
    let bestCat = 'other';
    let bestScore = 0;
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const score = cat.keywords.reduce((s, kw) => {
        const regex = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '\\b', 'i');
        return s + (regex.test(rawText) ? kw.split(' ').length : 0);
      }, 0);
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

  // ── DOM readers ─────────────────────────────────────────────────────────────
  function readGmailInbox() {
    const rows = document.querySelectorAll('tr.zA, tr.zE');
    return Array.from(rows).slice(0, 150).map(row => {
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
    const allCandidates = document.querySelectorAll('[role="option"], [data-convid], [aria-selected], div[draggable="true"]');

    // Filter out wrappers (elements that contain other candidates) to prevent parsing entire date groups
    const rows = Array.from(allCandidates).filter(row => {
      if (row.querySelector('[role="option"], [data-convid], [aria-selected], div[draggable="true"]')) {
        return false;
      }
      return true;
    });

    return rows.slice(0, 150).map(row => {
      const text = (row.innerText || '').trim();
      const parts = text.split('\n').map(s => s.trim()).filter(Boolean);

      let startIndex = 0;
      if (parts.length > 2) {
        if (parts[0].toLowerCase() === 'unread') {
          startIndex = 1;
        }
        const p0 = parts[startIndex];
        if (p0) {
          const isIcon = /^[^a-zA-Z0-9]+$/.test(p0) || p0 === '' || p0 === '' || p0.includes('');
          const isInitials = p0.length <= 2 && p0 === p0.toUpperCase();
          let matchesInitials = false;
          if (isInitials && p0.length > 0 && parts[startIndex + 1]) {
            if (p0[0] === parts[startIndex + 1][0].toUpperCase()) {
              matchesInitials = true;
            }
          }
          if (isIcon || matchesInitials) {
            startIndex++;
          }
        }
      }

      const sender = parts[startIndex] || '';
      const subject = parts[startIndex + 1] || '';
      const snippet = parts.slice(startIndex + 2, startIndex + 4).join(' ');
      const date = parts[parts.length - 1] || '';
      const hasAttachment = !!row.querySelector('[class*="attachment" i], [aria-label*="attachment" i], [aria-label*="file" i], i[data-icon-name*="Attachment" i], img[src*="attachment" i]');
      const fullText = text.toLowerCase();
      return { sender, subject, snippet, date, unread: false, hasAttachment, starred: false, fullText, el: row };
    }).filter(e => e.sender && e.subject); // Ensure it's a real email row
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
  function insertBadge(rowEl, label, className) {
    if (rowEl.querySelector('.lensly-email-badge')) {
      rowEl.querySelector('.lensly-email-badge').remove();
    }
    const badge = document.createElement('span');
    badge.className = `lensly-email-badge ${className}`;
    badge.textContent = label;

    if (window.location.hostname.includes('outlook') || window.location.hostname.includes('office')) {
      badge.style.position = 'absolute';
      badge.style.top = '8px';
      badge.style.right = '55px';
      badge.style.zIndex = '100';
      badge.style.boxShadow = '0 2px 5px rgba(0,0,0,0.15)';
      rowEl.style.position = 'relative';
      rowEl.appendChild(badge);
      return;
    }

    let target = rowEl.querySelector('.y6, .bog, .bqe, .xT .a4W, .yX, [class*="subject"], div > span');
    if (!target) {
      target = rowEl.querySelector('td') || rowEl;
    }
    target.insertBefore(badge, target.firstChild);
  }

  function clearEmailHighlights() {
    const classes = [
      'lensly-email-row-work', 'lensly-email-row-finance', 'lensly-email-row-shopping',
      'lensly-email-row-social', 'lensly-email-row-newsletter', 'lensly-email-row-travel',
      'lensly-email-row-promo', 'lensly-email-row-security', 'lensly-email-row-personal',
      'lensly-email-row-high', 'lensly-email-row-medium', 'lensly-email-row-low',
      'lensly-email-row-onedrive'
    ];
    document.querySelectorAll(classes.map(c => '.' + c).join(', ')).forEach(el => {
      classes.forEach(c => el.classList.remove(c));
    });
    document.querySelectorAll('.lensly-email-badge').forEach(b => b.remove());
  }

  // ── Sorting Logic ──────────────────────────────────────────────────────────
  function getCategoryKey(fullText) {
    let bestCat = 'other';
    let bestScore = 0;
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      let score = 0;
      if (cat.strong) {
        score += cat.strong.reduce((s, kw) => s + (fullText.includes(kw) ? 3 : 0), 0);
      }
      if (cat.keywords) {
        score += cat.keywords.reduce((s, kw) => s + (fullText.includes(kw) ? 1 : 0), 0);
      }
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

  // ── 1. Categorize ──────────────────────────────────────────────────────────
  function applyCategorization(isInterval = false) {
    if (!isInterval) clearEmailHighlights();
    const emails = getEmails();
    if (!emails.length) return;

    emails.forEach(e => {
      if (e.el.querySelector('.lensly-email-badge')) return;
      const isOneDrive = e.fullText.includes('onedrive');
      if (isOneDrive) {
        e.el.classList.add('lensly-email-row-onedrive');
        insertBadge(e.el, 'Personal (OneDrive)', 'lensly-badge-onedrive');
      } else {
        const catKey = getCategoryKey(e.fullText);
        const bestCat = CATEGORIES[catKey]?.label || 'Other';
        e.el.classList.add(`lensly-email-row-${catKey}`);
        insertBadge(e.el, bestCat, `lensly-badge-${catKey}`);
      }
    });

    const catOrder = ['work', 'finance', 'security', 'personal', 'travel', 'shopping', 'social', 'newsletter', 'promo', 'other'];
    const sorted = [...emails].sort((a, b) => {
      const isOD_A = a.fullText.includes('onedrive');
      const isOD_B = b.fullText.includes('onedrive');
      const catA = isOD_A ? 'personal' : getCategoryKey(a.fullText);
      const catB = isOD_B ? 'personal' : getCategoryKey(b.fullText);
      return catOrder.indexOf(catA) - catOrder.indexOf(catB);
    });
    // rearrangeEmails(sorted); // DISABLED: Physically moving DOM nodes breaks Outlook/Gmail virtual lists click routing
  }

  function categorize() {
    applyCategorization();
    openEmailDashboard('email-overview');
    return 'Inbox categorization complete. Badges applied and emails grouped.';
  }

  // ── 2. Priority Detection ──────────────────────────────────────────────────
  function applyPriority(isInterval = false) {
    if (!isInterval) clearEmailHighlights();
    const emails = getEmails();
    if (!emails.length) return;

    emails.forEach(e => {
      if (e.el.querySelector('.lensly-email-badge')) return;
      const text = e.fullText;
      const weight = getPriorityWeight(text, e.starred, e.unread, e.sender);
      let priorityLabel = 'Low';
      let priorityKey = 'low';
      if (weight === 3) { priorityLabel = 'High'; priorityKey = 'high'; }
      else if (weight === 2) { priorityLabel = 'Medium'; priorityKey = 'medium'; }
      e.el.classList.add(`lensly-email-row-${priorityKey}`);
      insertBadge(e.el, priorityLabel, `lensly-badge-${priorityKey}`);
    });

    const sorted = [...emails].sort((a, b) => {
      const wA = getPriorityWeight(a.fullText, a.starred, a.unread, a.sender);
      const wB = getPriorityWeight(b.fullText, b.starred, b.unread, b.sender);
      return wB - wA;
    });
    // rearrangeEmails(sorted); // DISABLED
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
    const result = await window.LenslySummarizer.summarise(current.body, 3, k);
    return result.summary;
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

  async function generateDraftReply() {
    const current = getCurrentEmail();
    if (!current) throw new Error('Open an email first to generate a reply.');
    const k = await new Promise(r => chrome.storage.sync.get('groqApiKey', d => r(d?.groqApiKey || '')));

    if (!k) {
      return 'Please enter a Groq API Key in settings to generate replies.';
    }

    const emailContent = `Subject: ${current.subject}\nSender: ${current.sender || 'Unknown'}\n\n${current.body}`;
    const result = await window.LenslySummarizer.groqAutoProcess(emailContent, k);
    return result.draft_response;
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
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
        <div class="lid-section-title" style="margin-bottom:0;">${threadTitle}</div>
        <div style="display:flex; gap:6px;">
          <button id="lid-select-all-btn" style="font-size:11px; padding:3px 8px; border-radius:4px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; color:#475569; font-family:inherit;">Select All</button>
          <button id="lid-move-folder-btn" style="font-size:11px; padding:3px 8px; border-radius:4px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; color:#2563eb; opacity:0.5; font-family:inherit;" disabled>Move to Folder</button>
          <button id="lid-delete-selected-btn" style="font-size:11px; padding:3px 8px; border-radius:4px; border:1px solid #cbd5e1; background:#fff; cursor:pointer; color:#b94040; opacity:0.5; font-family:inherit;" disabled>Delete</button>
        </div>
      </div>
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
    const emailCheckboxes = [];

    filteredEmails.forEach((e, index) => {
      const el = document.createElement('div');
      el.className = 'lid-item';
      el.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <input type="checkbox" class="lid-email-checkbox" data-index="${index}" style="margin-top:4px; cursor:pointer;" />
          <div style="flex:1; min-width:0;" class="lid-item-content">
            <div class="lid-item-title" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; cursor:pointer;">${e.sender}</div>
            <div class="lid-item-desc" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; cursor:pointer;"><strong>${e.subject || '(No Subject)'}</strong></div>
            <div class="lid-item-desc" style="text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-style:italic; cursor:pointer;">${e.snippet || ''}</div>
          </div>
        </div>
      `;

      const checkbox = el.querySelector('.lid-email-checkbox');
      emailCheckboxes.push({ checkbox, email: e });

      checkbox.addEventListener('change', () => {
        const anyChecked = emailCheckboxes.some(item => item.checkbox.checked);
        const deleteBtn = container.querySelector('#lid-delete-selected-btn');
        const moveBtn = container.querySelector('#lid-move-folder-btn');
        if (deleteBtn) {
          deleteBtn.disabled = !anyChecked;
          deleteBtn.style.opacity = anyChecked ? '1' : '0.5';
        }
        if (moveBtn) {
          moveBtn.disabled = !anyChecked;
          moveBtn.style.opacity = anyChecked ? '1' : '0.5';
        }
      });

      if (e.el) {
        el.querySelector('.lid-item-content').addEventListener('click', () => {
          e.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          e.el.style.outline = '2px solid #274c77';
          e.el.click();
          setTimeout(() => { e.el.style.outline = ''; }, 1500);
        });
      }
      list.appendChild(el);
    });

    const selectAllBtn = container.querySelector('#lid-select-all-btn');
    const deleteSelectedBtn = container.querySelector('#lid-delete-selected-btn');

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        const allChecked = emailCheckboxes.every(item => item.checkbox.checked);
        emailCheckboxes.forEach(item => { item.checkbox.checked = !allChecked; });
        selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
        const moveBtn = container.querySelector('#lid-move-folder-btn');
        if (deleteSelectedBtn) {
          deleteSelectedBtn.disabled = allChecked;
          deleteSelectedBtn.style.opacity = allChecked ? '0.5' : '1';
        }
        if (moveBtn) {
          moveBtn.disabled = allChecked;
          moveBtn.style.opacity = allChecked ? '0.5' : '1';
        }
      });
    }

    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener('click', () => {
        emailCheckboxes.forEach(item => {
          if (item.checkbox.checked) {
            if (item.email && item.email.el) {
              item.email.el.remove(); // Visually remove from DOM
            }
          }
        });

        // Refresh panel after deletion
        setTimeout(() => {
          populateOverviewPanel();
        }, 100);
      });
    }

    const moveFolderBtn = container.querySelector('#lid-move-folder-btn');
    if (moveFolderBtn) {
      moveFolderBtn.addEventListener('click', () => {
        const folderName = prompt("Enter folder name to move selected emails to (existing or new):");
        if (folderName && folderName.trim() !== "") {
          let movedCount = 0;
          emailCheckboxes.forEach(item => {
            if (item.checkbox.checked) {
              if (item.email && item.email.el) {
                item.email.el.remove(); // Visually move from DOM
              }
              movedCount++;
            }
          });
          alert(`Moved ${movedCount} emails to folder: "${folderName.trim()}"`);
          setTimeout(() => {
            populateOverviewPanel();
          }, 100);
        }
      });
    }
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

        <div id="lid-ai-summary-text" style="margin-top:8px; border-top:1px solid #e7ecef; padding-top:8px; font-size:12px; color:#3a5068; font-style:italic; line-height:1.5; white-space:pre-wrap;">
          ${meta.summary}
        </div>

        <div style="margin-top:8px; border-top:1px solid #e7ecef; padding-top:8px; font-size:11px; color:#64748b; line-height:1.5;">
          <strong>Reasoning:</strong> ${meta.reasoning}
        </div>
      </div>

      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button class="lid-btn lid-btn-primary" id="lid-btn-sum" style="flex:1;">Summarize</button>
        <button class="lid-btn lid-btn-primary" id="lid-btn-tasks" style="flex:1;">Extract Tasks</button>
        <button class="lid-btn lid-btn-primary" id="lid-btn-reply" style="flex:1;">Draft Reply</button>
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

        // Inject summary directly into the main summary text block instead of the result box at the bottom
        const summaryTextEl = container.querySelector('#lid-ai-summary-text');
        if (summaryTextEl) {
          summaryTextEl.textContent = summary;
          summaryTextEl.style.fontStyle = 'normal';
          summaryTextEl.style.color = '#0d0d0d';
          summaryTextEl.style.fontSize = '13px';
        }
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

    const replyBtn = container.querySelector('#lid-btn-reply');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        loadEl.style.display = 'flex';
        resEl.style.display = 'none';

        generateDraftReply().then(reply => {
          loadEl.style.display = 'none';
          resEl.textContent = reply;
          resEl.style.display = 'block';

          const host = location.hostname.toLowerCase();
          const isGmail = host.includes('mail.google.com');
          const isOutlook = host.includes('outlook');
          autoFillReply(reply, isGmail, isOutlook);

        }).catch(err => {
          loadEl.style.display = 'none';
          resEl.innerHTML = `<span style="color:#b94040">Error: ${err.message}</span>`;
          resEl.style.display = 'block';
        });
      });
    }
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
      <button class="let-btn" data-action="emailInsights" title="Open AI Insights">Insights</button>
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
      } else if (action === 'emailInsights') {
        if (!isInterval) openEmailDashboard('email-ai');
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

  // ── 7. Auto AI Processing (Groq) ───────────────────────────────────────────
  let _lastProcessedEmailId = null;

  async function autoProcessEmail() {
    const host = location.hostname.toLowerCase();
    const isGmail = host.includes('mail.google.com');
    const isOutlook = host.includes('outlook');
    if (!isGmail && !isOutlook) return;

    const current = getCurrentEmail();
    if (!current) {
      // console.log('[Lensly] Debug: No email detected by getCurrentEmail()');
      return;
    }
    if (!current.body || current.body.length < 20) {
      console.log('[Lensly] Debug: Email body too short or empty', current.body);
      return;
    }

    const emailId = current.subject + current.sender;
    if (_lastProcessedEmailId === emailId) {
      // console.log('[Lensly] Debug: Email already processed', emailId);
      return;
    }

    const apiKey = await new Promise(r => chrome.storage.sync.get('groqApiKey', d => r(d?.groqApiKey || '')));
    if (!apiKey) {
      console.log('[Lensly] Debug: No Groq API Key found in settings!');
      return;
    }

    console.log('[Lensly] Auto-processing email detected:', emailId);
    _lastProcessedEmailId = emailId;

    try {
      const emailContent = `Subject: ${current.subject}\nSender: ${current.sender || 'Unknown'}\n\n${current.body}`;
      const result = await window.LenslySummarizer.groqAutoProcess(emailContent, apiKey);
      if (!result) return;

      if (result.summary) {
        injectSummaryBanner(result.summary, isGmail);
      }

      if (result.draft_response) {
        autoFillReply(result.draft_response, isGmail, isOutlook);
      }
    } catch (e) {
      console.error('[Lensly] Auto-process failed:', e);
      _lastProcessedEmailId = null;
    }
  }

  function injectSummaryBanner(summaryText, isGmail) {
    if (document.getElementById('lensly-auto-summary')) {
      document.getElementById('lensly-auto-summary').remove();
    }

    const banner = document.createElement('div');
    banner.id = 'lensly-auto-summary';
    banner.style.cssText = 'background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin:10px 0; font-family:"DM Sans", sans-serif; color:#334155; display:flex; gap:12px; align-items:flex-start; box-shadow:0 1px 3px rgba(0,0,0,0.05);';

    banner.innerHTML = `
      <div style="background:#e0e7ff; color:#4338ca; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15 9l7 1-5 5 1 7-7-4-7 4 1-7-5-5 7-1z"/></svg>
      </div>
      <div>
        <strong style="display:block; margin-bottom:4px; color:#1e293b; font-size:13px;">Lensly AI Summary</strong>
        <div style="font-size:13px; line-height:1.5;">${summaryText}</div>
      </div>
    `;

    if (isGmail) {
      const header = document.querySelector('.nH .adn .gs');
      if (header) {
        header.insertBefore(banner, header.firstChild);
      } else {
        const body = document.querySelector('.a3s');
        if (body && body.parentElement) body.parentElement.insertBefore(banner, body);
      }
    } else {
      const header = document.querySelector('[role="main"] [role="heading"]')?.parentElement;
      if (header) header.appendChild(banner);
    }
  }

  function autoFillReply(draftText, isGmail, isOutlook) {
    function copyToClipboardFallback(msg) {
      const textArea = document.createElement("textarea");
      textArea.value = draftText;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        alert('Lensly: ' + msg + '\n\nDraft copied to clipboard instead! You can paste it directly.');
      } catch (err) {
        alert('Lensly: ' + msg + '\n\nCould not copy to clipboard. Here is your text:\n\n' + draftText);
      } finally {
        textArea.remove();
      }
    }

    if (isGmail) {
      const replyBtn = document.querySelector('.ams.bkH, .T-I.J-J5-Ji.T-I-Js-IF.aaq.T-I-ax7.L3, div[data-tooltip="Reply"], span[data-tooltip="Reply"], div[aria-label="Reply"], span[aria-label="Reply"]');
      if (replyBtn) {
        replyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        replyBtn.click();
        let attempts = 0;
        const interval = setInterval(() => {
          const composeBox = document.querySelector('div[role="textbox"][g_editable="true"], div[role="textbox"][contenteditable="true"], .editable[role="textbox"]');
          if (composeBox) {
            clearInterval(interval);
            composeBox.innerHTML = draftText.trim().replace(/\n/g, '<br>');
            composeBox.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (++attempts > 30) {
            clearInterval(interval);
            copyToClipboardFallback('Could not find the Gmail compose box.');
          }
        }, 150);
      } else {
        copyToClipboardFallback('Could not find the Gmail Reply button.');
      }
    } else if (isOutlook) {
      const replyBtn = document.querySelector('button[aria-label="Reply"], button[data-icon-name="Reply"]');
      if (replyBtn) {
        replyBtn.click();
        let attempts = 0;
        const interval = setInterval(() => {
          const composeBox = document.querySelector('div[role="textbox"][aria-label="Message body"], div[role="textbox"][contenteditable="true"]');
          if (composeBox) {
            clearInterval(interval);
            composeBox.innerHTML = draftText.trim().replace(/\n/g, '<br>');
            composeBox.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (++attempts > 30) {
            clearInterval(interval);
            copyToClipboardFallback('Could not find the Outlook compose box.');
          }
        }, 150);
      } else {
        copyToClipboardFallback('Could not find the Outlook Reply button.');
      }
    } else {
      copyToClipboardFallback('Auto-fill is only supported on Gmail and Outlook.');
    }
  }

  // ── Auto-init ──────────────────────────────────────────────────────────────
  function autoInit() {
    const host = location.hostname.toLowerCase();
    if (host.includes('mail.google.com') || host.includes('outlook')) {
      setTimeout(injectEmailToolbar, 2000);

      setInterval(() => {
        autoProcessEmail();
      }, 1500);
    }
  }

  return { categorize, detectPriority, followUpReminders, detectDuplicates, summarizeEmail, extractTasks, analyzeEmail, autoInit, injectEmailToolbar, openEmailDashboard };
})();

// Auto-initialize
window.LenslyEmailTools.autoInit();