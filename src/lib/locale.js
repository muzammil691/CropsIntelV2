// CropsIntel V2 — Multilingual locale dictionary + detection
// 2026-04-25 · Mini-Phase 5
//
// Supported launch set: en, ar, hi, tr, es
// Per user directive (hard memory feedback_multilingual_default.md):
//   - Zyra's FIRST greeting should use the IP-detected local language
//     even if the user's stored preference is English
//   - Resolution order for app chrome: user pref → IP-derived → Accept-Language → en
//
// Zero external deps. Flat dict for simplicity; swap in react-i18next later
// if we outgrow this.

export const SUPPORTED_LOCALES = ['en', 'ar', 'hi', 'tr', 'es'];
export const DEFAULT_LOCALE = 'en';

// Country → locale mapping (primary launch markets + common trade partners).
// Full ISO-3166 mapping isn't needed; unmapped falls back to en.
export const COUNTRY_TO_LOCALE = {
  // English (explicit)
  US: 'en', GB: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en', SG: 'en', ZA: 'en',
  // Arabic
  AE: 'ar', SA: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar',
  LB: 'ar', SY: 'ar', IQ: 'ar', EG: 'ar', LY: 'ar', TN: 'ar', DZ: 'ar',
  MA: 'ar', YE: 'ar', SD: 'ar', PS: 'ar',
  // Hindi (primary market: India)
  IN: 'hi',
  // Turkish
  TR: 'tr', CY: 'tr',
  // Spanish
  ES: 'es', MX: 'es', AR: 'es', CL: 'es', CO: 'es', PE: 'es', VE: 'es',
  UY: 'es', PY: 'es', BO: 'es', EC: 'es', DO: 'es', CR: 'es', PA: 'es',
  GT: 'es', HN: 'es', SV: 'es', NI: 'es', CU: 'es', PR: 'es',
};

export const LOCALE_META = {
  en: { name: 'English',   native: 'English',   dir: 'ltr', flag: '🇬🇧' },
  ar: { name: 'Arabic',    native: 'العربية',    dir: 'rtl', flag: '🇦🇪' },
  hi: { name: 'Hindi',     native: 'हिन्दी',      dir: 'ltr', flag: '🇮🇳' },
  tr: { name: 'Turkish',   native: 'Türkçe',    dir: 'ltr', flag: '🇹🇷' },
  es: { name: 'Spanish',   native: 'Español',   dir: 'ltr', flag: '🇪🇸' },
};

// Zyra first-greeting lines per (locale × userTier). Kept short — goal is
// only to prove multilingual awareness, full copy can land later.
export const ZYRA_GREETINGS = {
  en: {
    guest:      "Hi! I'm Zyra, your almond market intelligence assistant. I can give you a quick overview of the California almond market. Register for free to unlock deeper insights!",
    registered: "Welcome back! I'm Zyra, your market intelligence assistant. I have the latest ABC position data loaded. Ask me anything about the almond market.",
    verified:   "Hi! Zyra here with your personalized market brief ready. I've loaded the latest data for your markets. What would you like to know?",
    maxons:     "Zyra online with full MAXONS intelligence. Market data, CRM insights, and pricing engine loaded. Ready for your command.",
  },
  ar: {
    guest:      'مرحباً! أنا زيرا، مساعدتك الذكية لذكاء سوق اللوز. يمكنني إعطاؤك نظرة عامة سريعة على سوق اللوز في كاليفورنيا. سجّل مجاناً للحصول على رؤى أعمق.',
    registered: 'مرحباً بعودتك! أنا زيرا. لديّ أحدث بيانات ABC وأسعار السوق جاهزة. اسألني أي شيء عن سوق اللوز.',
    verified:   'مرحباً! زيرا هنا بموجزك الشخصي. حمّلت أحدث البيانات لأسواقك. ماذا تودّ أن تعرف؟',
    maxons:     'زيرا متصلة بكامل ذكاء MAXONS. بيانات السوق ورؤى CRM ومحرّك التسعير جاهزة. في خدمتك.',
  },
  hi: {
    guest:      "नमस्ते! मैं ज़ायरा हूँ, आपकी बादाम बाज़ार इंटेलिजेंस सहायक। मैं आपको कैलिफोर्निया बादाम बाज़ार का संक्षिप्त अवलोकन दे सकती हूँ। गहरी जानकारी के लिए निःशुल्क पंजीकरण करें।",
    registered: "वापस स्वागत है! मैं ज़ायरा हूँ। मेरे पास ABC स्थिति रिपोर्ट्स और मूल्य का नवीनतम डेटा है। बादाम बाज़ार के बारे में कुछ भी पूछें।",
    verified:   "नमस्ते! ज़ायरा आपके लिए व्यक्तिगत मार्केट ब्रीफ के साथ तैयार है। मैंने आपके बाज़ारों का नवीनतम डेटा लोड कर लिया है। आप क्या जानना चाहेंगे?",
    maxons:     "ज़ायरा पूर्ण MAXONS इंटेलिजेंस के साथ ऑनलाइन। मार्केट डेटा, CRM अंतर्दृष्टि और मूल्य निर्धारण इंजन लोडेड। आपके आदेश के लिए तैयार।",
  },
  tr: {
    guest:      'Merhaba! Ben Zyra, badem pazar istihbaratı asistanınız. Kaliforniya badem piyasasına hızlı bir genel bakış sunabilirim. Daha derin içgörüler için ücretsiz kayıt olun!',
    registered: 'Tekrar hoş geldiniz! Ben Zyra. En güncel ABC pozisyon verileri ve fiyatlar yüklendi. Badem piyasası hakkında her şeyi sorabilirsiniz.',
    verified:   'Merhaba! Kişiselleştirilmiş piyasa özetinizle Zyra burada. Pazarlarınız için en güncel verileri yükledim. Ne öğrenmek istersiniz?',
    maxons:     'Zyra, MAXONS\'un tam istihbaratı ile çevrimiçi. Piyasa verileri, CRM içgörüleri ve fiyatlandırma motoru hazır. Komutunuz için hazırım.',
  },
  es: {
    guest:      '¡Hola! Soy Zyra, tu asistente de inteligencia del mercado de almendras. Puedo darte un resumen rápido del mercado californiano de almendras. ¡Regístrate gratis para desbloquear insights más profundos!',
    registered: '¡Bienvenido de vuelta! Soy Zyra. Tengo cargados los datos más recientes de posición ABC y precios. Pregúntame cualquier cosa sobre el mercado de almendras.',
    verified:   '¡Hola! Zyra aquí con tu resumen de mercado personalizado listo. He cargado los datos más recientes para tus mercados. ¿Qué te gustaría saber?',
    maxons:     'Zyra en línea con la inteligencia MAXONS completa. Datos de mercado, insights de CRM y motor de precios cargados. Listo para tu comando.',
  },
};

// Core UI strings used by the LocaleSwitcher + nav shell. Additional strings
// land per-page as we translate deeper.
// Path-based nav keys (nav.path.*) let App.jsx render every NAV_ITEM label
// via t() without keeping a second parallel mapping. Falls through to the
// hardcoded English in App.jsx's NAV_ITEMS if the key is missing.
export const DICT = {
  en: {
    'nav.dashboard':   'Dashboard',
    'nav.supply':      'Supply',
    'nav.destinations':'Destinations',
    'nav.pricing':     'Pricing',
    'nav.forecasts':   'Forecasts',
    'nav.reports':     'Reports',
    'nav.news':        'News',
    'nav.crm':         'CRM',
    'nav.zyra':        'Zyra',
    'nav.settings':    'Settings',
    'locale.label':    'Language',
    'zyra.detectedHint': 'Detected from your region. Switch anytime in Settings.',
    // Path-keyed nav labels (App.jsx)
    'nav.path./dashboard':              'Dashboard',
    'nav.path./analysis':               'Analysis',
    'nav.path./supply':                 'Supply & Demand',
    'nav.path./destinations':           'Destinations',
    'nav.path./pricing':                'Pricing',
    'nav.path./forecasts':              'Forecasts',
    'nav.path./news':                   'News & Intel',
    'nav.path./intelligence':           'AI Intelligence',
    'nav.path./reports':                'Reports',
    'nav.path./crm':                    'CRM & Deals',
    'nav.path./brokers':                'Brokers (BRM)',
    'nav.path./suppliers':              'Suppliers (SRM)',
    'nav.path./trading':                'Trading Portal',
    'nav.path./settings#team-panel':    'Team & Users',
    'nav.path./settings#broadcast-panel':'Broadcast',
    'nav.path./autonomous':             'Autonomous',
    'nav.path./settings':               'Settings',
    // Nav section headers
    'nav.section.main':          'Main',
    'nav.section.marketData':    'Market Data',
    'nav.section.aiIntelligence':'AI & Intelligence',
    'nav.section.relationships': 'Relationships',
    'nav.section.admin':         'Admin',
    // Auth chrome
    'auth.signIn':   'Sign In',
    'auth.signOut':  'Sign Out',
    'auth.register': 'Register',
    'auth.guest':    'guest',
  },
  ar: {
    'nav.dashboard':   'لوحة التحكم',
    'nav.supply':      'العرض',
    'nav.destinations':'الوجهات',
    'nav.pricing':     'التسعير',
    'nav.forecasts':   'التوقعات',
    'nav.reports':     'التقارير',
    'nav.news':        'الأخبار',
    'nav.crm':         'إدارة العلاقات',
    'nav.zyra':        'زيرا',
    'nav.settings':    'الإعدادات',
    'locale.label':    'اللغة',
    'zyra.detectedHint': 'اكتُشفت من منطقتك. يمكنك تغييرها في الإعدادات في أي وقت.',
    'nav.path./dashboard':              'لوحة التحكم',
    'nav.path./analysis':               'التحليل',
    'nav.path./supply':                 'العرض والطلب',
    'nav.path./destinations':           'الوجهات',
    'nav.path./pricing':                'التسعير',
    'nav.path./forecasts':              'التوقعات',
    'nav.path./news':                   'الأخبار',
    'nav.path./intelligence':           'الذكاء الاصطناعي',
    'nav.path./reports':                'التقارير',
    'nav.path./crm':                    'العلاقات والصفقات',
    'nav.path./brokers':                'الوسطاء',
    'nav.path./suppliers':              'الموردون',
    'nav.path./trading':                'بوابة التداول',
    'nav.path./settings#team-panel':    'الفريق والمستخدمون',
    'nav.path./settings#broadcast-panel':'البث',
    'nav.path./autonomous':             'المستقل',
    'nav.path./settings':               'الإعدادات',
    'nav.section.main':          'الرئيسية',
    'nav.section.marketData':    'بيانات السوق',
    'nav.section.aiIntelligence':'الذكاء',
    'nav.section.relationships': 'العلاقات',
    'nav.section.admin':         'الإدارة',
    'auth.signIn':   'تسجيل الدخول',
    'auth.signOut':  'تسجيل الخروج',
    'auth.register': 'إنشاء حساب',
    'auth.guest':    'زائر',
  },
  hi: {
    'nav.dashboard':   'डैशबोर्ड',
    'nav.supply':      'सप्लाई',
    'nav.destinations':'गंतव्य',
    'nav.pricing':     'मूल्य',
    'nav.forecasts':   'पूर्वानुमान',
    'nav.reports':     'रिपोर्ट्स',
    'nav.news':        'समाचार',
    'nav.crm':         'सीआरएम',
    'nav.zyra':        'ज़ायरा',
    'nav.settings':    'सेटिंग्स',
    'locale.label':    'भाषा',
    'zyra.detectedHint': 'आपके क्षेत्र से पहचाना गया। सेटिंग्स में कभी भी बदलें।',
    'nav.path./dashboard':              'डैशबोर्ड',
    'nav.path./analysis':               'विश्लेषण',
    'nav.path./supply':                 'आपूर्ति व मांग',
    'nav.path./destinations':           'गंतव्य',
    'nav.path./pricing':                'मूल्य',
    'nav.path./forecasts':              'पूर्वानुमान',
    'nav.path./news':                   'समाचार',
    'nav.path./intelligence':           'एआई इंटेलिजेंस',
    'nav.path./reports':                'रिपोर्ट्स',
    'nav.path./crm':                    'सीआरएम और डील्स',
    'nav.path./brokers':                'ब्रोकर (बीआरएम)',
    'nav.path./suppliers':              'आपूर्तिकर्ता (एसआरएम)',
    'nav.path./trading':                'ट्रेडिंग पोर्टल',
    'nav.path./settings#team-panel':    'टीम व उपयोगकर्ता',
    'nav.path./settings#broadcast-panel':'प्रसारण',
    'nav.path./autonomous':             'स्वायत्त',
    'nav.path./settings':               'सेटिंग्स',
    'nav.section.main':          'मुख्य',
    'nav.section.marketData':    'बाज़ार डेटा',
    'nav.section.aiIntelligence':'एआई व इंटेलिजेंस',
    'nav.section.relationships': 'संबंध',
    'nav.section.admin':         'प्रशासन',
    'auth.signIn':   'साइन इन',
    'auth.signOut':  'साइन आउट',
    'auth.register': 'रजिस्टर करें',
    'auth.guest':    'अतिथि',
  },
  tr: {
    'nav.dashboard':   'Kontrol Paneli',
    'nav.supply':      'Arz',
    'nav.destinations':'Hedef Pazarlar',
    'nav.pricing':     'Fiyatlandırma',
    'nav.forecasts':   'Tahminler',
    'nav.reports':     'Raporlar',
    'nav.news':        'Haberler',
    'nav.crm':         'CRM',
    'nav.zyra':        'Zyra',
    'nav.settings':    'Ayarlar',
    'locale.label':    'Dil',
    'zyra.detectedHint': 'Bölgenizden algılandı. Ayarlar\'dan istediğiniz zaman değiştirebilirsiniz.',
    'nav.path./dashboard':              'Kontrol Paneli',
    'nav.path./analysis':               'Analiz',
    'nav.path./supply':                 'Arz ve Talep',
    'nav.path./destinations':           'Hedef Pazarlar',
    'nav.path./pricing':                'Fiyatlandırma',
    'nav.path./forecasts':              'Tahminler',
    'nav.path./news':                   'Haberler',
    'nav.path./intelligence':           'AI İstihbaratı',
    'nav.path./reports':                'Raporlar',
    'nav.path./crm':                    'CRM ve Anlaşmalar',
    'nav.path./brokers':                'Brokerlar (BRM)',
    'nav.path./suppliers':              'Tedarikçiler (SRM)',
    'nav.path./trading':                'Ticaret Portalı',
    'nav.path./settings#team-panel':    'Ekip ve Kullanıcılar',
    'nav.path./settings#broadcast-panel':'Yayın',
    'nav.path./autonomous':             'Otonom',
    'nav.path./settings':               'Ayarlar',
    'nav.section.main':          'Ana',
    'nav.section.marketData':    'Piyasa Verileri',
    'nav.section.aiIntelligence':'AI ve İstihbarat',
    'nav.section.relationships': 'İlişkiler',
    'nav.section.admin':         'Yönetim',
    'auth.signIn':   'Giriş Yap',
    'auth.signOut':  'Çıkış Yap',
    'auth.register': 'Kayıt Ol',
    'auth.guest':    'misafir',
  },
  es: {
    'nav.dashboard':   'Panel',
    'nav.supply':      'Suministro',
    'nav.destinations':'Destinos',
    'nav.pricing':     'Precios',
    'nav.forecasts':   'Pronósticos',
    'nav.reports':     'Reportes',
    'nav.news':        'Noticias',
    'nav.crm':         'CRM',
    'nav.zyra':        'Zyra',
    'nav.settings':    'Ajustes',
    'locale.label':    'Idioma',
    'zyra.detectedHint': 'Detectado desde tu región. Cámbialo en Ajustes cuando quieras.',
    'nav.path./dashboard':              'Panel',
    'nav.path./analysis':               'Análisis',
    'nav.path./supply':                 'Suministro y Demanda',
    'nav.path./destinations':           'Destinos',
    'nav.path./pricing':                'Precios',
    'nav.path./forecasts':              'Pronósticos',
    'nav.path./news':                   'Noticias',
    'nav.path./intelligence':           'Inteligencia IA',
    'nav.path./reports':                'Reportes',
    'nav.path./crm':                    'CRM y Negocios',
    'nav.path./brokers':                'Brókeres (BRM)',
    'nav.path./suppliers':              'Proveedores (SRM)',
    'nav.path./trading':                'Portal de Trading',
    'nav.path./settings#team-panel':    'Equipo y Usuarios',
    'nav.path./settings#broadcast-panel':'Difusión',
    'nav.path./autonomous':             'Autónomo',
    'nav.path./settings':               'Ajustes',
    'nav.section.main':          'Principal',
    'nav.section.marketData':    'Datos de Mercado',
    'nav.section.aiIntelligence':'IA e Inteligencia',
    'nav.section.relationships': 'Relaciones',
    'nav.section.admin':         'Administración',
    'auth.signIn':   'Iniciar Sesión',
    'auth.signOut':  'Cerrar Sesión',
    'auth.register': 'Registrarse',
    'auth.guest':    'invitado',
  },
};

// Translate helper. Falls through to English, then the key itself.
export function t(locale, key) {
  if (DICT[locale] && DICT[locale][key]) return DICT[locale][key];
  if (DICT.en[key]) return DICT.en[key];
  return key;
}

// Return the Zyra greeting for a given (locale, userTier) combo. Falls
// back to English per tier, then to English/guest.
export function getZyraGreeting(locale, userTier, firstName = null) {
  const tierGreetings = ZYRA_GREETINGS[locale] || ZYRA_GREETINGS.en;
  let greeting = tierGreetings[userTier] || tierGreetings.guest || ZYRA_GREETINGS.en.guest;
  if (firstName) {
    // Replace generic placeholder with first name for 'verified' + 'maxons'.
    greeting = greeting.replace(/^Hi!/, `Hi ${firstName}!`)
                       .replace(/^مرحباً!/, `مرحباً ${firstName}!`)
                       .replace(/^नमस्ते!/, `नमस्ते ${firstName}!`)
                       .replace(/^Merhaba!/, `Merhaba ${firstName}!`)
                       .replace(/^¡Hola!/, `¡Hola ${firstName}!`);
  }
  return greeting;
}

// Derive locale from country code (Cloudflare CF-IPCountry header or a
// geo-IP service). Unmapped countries fall back to English.
export function localeFromCountry(countryCode) {
  if (!countryCode) return null;
  const uc = String(countryCode).toUpperCase().trim();
  return COUNTRY_TO_LOCALE[uc] || null;
}

// Best-effort browser detection — navigator.language ("en-US") → 'en'.
export function localeFromBrowser() {
  if (typeof navigator === 'undefined') return null;
  const raw = (navigator.language || navigator.userLanguage || '').toLowerCase();
  const base = raw.split('-')[0];
  return SUPPORTED_LOCALES.includes(base) ? base : null;
}

// Free public IP-geo service (no key). Used only if CF header isn't
// available (i.e. running on non-Cloudflare infra). Result cached in
// sessionStorage to avoid hammering their free tier.
export async function detectLocaleFromIP({ timeoutMs = 3000 } = {}) {
  if (typeof window === 'undefined') return null;
  try {
    const cached = sessionStorage.getItem('cropsintel_ip_locale');
    if (cached) return cached === 'null' ? null : cached;
  } catch {}
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ipapi ${res.status}`);
    const j = await res.json();
    const locale = localeFromCountry(j?.country_code);
    try { sessionStorage.setItem('cropsintel_ip_locale', String(locale || 'null')); } catch {}
    return locale;
  } catch {
    try { sessionStorage.setItem('cropsintel_ip_locale', 'null'); } catch {}
    return null;
  }
}

// Full resolution chain for app chrome.
//   1. user preference (from user_profiles.preferred_language)
//   2. IP-derived (cached)
//   3. browser (navigator.language)
//   4. 'en'
export async function resolveAppLocale({ preferred = null } = {}) {
  if (preferred && SUPPORTED_LOCALES.includes(preferred)) return preferred;
  const ipLoc = await detectLocaleFromIP();
  if (ipLoc) return ipLoc;
  const browserLoc = localeFromBrowser();
  if (browserLoc) return browserLoc;
  return DEFAULT_LOCALE;
}

// Resolution for Zyra's FIRST greeting — IP takes priority even if user
// preference is English (per user directive 2026-04-25). Subsequent Zyra
// responses should use the detected user language or app locale.
export async function resolveZyraFirstLocale() {
  const ipLoc = await detectLocaleFromIP();
  if (ipLoc) return ipLoc;
  const browserLoc = localeFromBrowser();
  if (browserLoc) return browserLoc;
  return DEFAULT_LOCALE;
}
