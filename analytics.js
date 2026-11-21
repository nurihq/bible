// Google Analytics 4 tracking integration for bible
import { CONFIG } from './config.js?v=20261121_v3';

export const GA_MEASUREMENT_ID = CONFIG.GA_MEASUREMENT_ID || 'G-6B52RELLEB';

const VISITOR_PROFILE_KEY = 'bible_app_visitor_profile';
const SESSION_STATE_KEY = 'bible_app_visitor_session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity = new session

let listenersAttached = false;

function safeGetStorage(storage, key) {
  try {
    const val = storage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    return null;
  }
}

function safeSetStorage(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Graceful fallback for quota/storage restrictions
  }
}

export function isLikelyBot() {
  try {
    if (typeof navigator === 'undefined') return true;

    // 1. Explicit automation flag in WebDriver / headless browsers
    if (navigator.webdriver) return true;

    // 2. Known bot / crawler / scraper user agents
    const ua = (navigator.userAgent || '').toLowerCase();
    const botKeywords = [
      'headlesschrome', 'phantomjs', 'selenium', 'puppeteer', 'playwright',
      'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'baiduspider',
      'ahrefsbot', 'semrushbot', 'dotbot', 'mj12bot', 'crawler', 'spider',
      'bytespider', 'petalbot', 'screaming frog'
    ];
    if (botKeywords.some((kw) => ua.includes(kw))) return true;

    // 3. Screen or viewport zero dimension detection
    if (typeof window !== 'undefined') {
      if (window.innerWidth === 0 && window.innerHeight === 0) return true;
      if (window.screen && (window.screen.width === 0 || window.screen.height === 0)) return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

export function getVisitorProfile() {
  return safeGetStorage(localStorage, VISITOR_PROFILE_KEY) || {
    visitCount: 1,
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    visit2Tracked: false
  };
}

function initVisitorSession() {
  const now = Date.now();
  let profile = safeGetStorage(localStorage, VISITOR_PROFILE_KEY);
  let session = safeGetStorage(sessionStorage, SESSION_STATE_KEY);

  if (!profile) {
    // First time visitor
    profile = {
      visitCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      visit2Tracked: false
    };
    safeSetStorage(localStorage, VISITOR_PROFILE_KEY, profile);
  } else {
    // Check if previous session expired or new tab without session
    const isSessionExpired = !session || (now - (profile.lastSeenAt || 0) > SESSION_TIMEOUT_MS);
    if (isSessionExpired) {
      profile.visitCount = (profile.visitCount || 1) + 1;
    }
    profile.lastSeenAt = now;
    safeSetStorage(localStorage, VISITOR_PROFILE_KEY, profile);
  }

  if (!session) {
    session = {
      id: 's_' + Math.random().toString(36).slice(2, 10) + '_' + now,
      humanVerified: false,
      returnEventFired: false,
      startedAt: now
    };
    safeSetStorage(sessionStorage, SESSION_STATE_KEY, session);
  }

  return { profile, session };
}

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
  }
  return window.gtag;
}

export function verifyHumanEngagement(triggerSource = 'interaction') {
  if (isLikelyBot()) return;

  const now = Date.now();
  let session = safeGetStorage(sessionStorage, SESSION_STATE_KEY) || {};
  let profile = safeGetStorage(localStorage, VISITOR_PROFILE_KEY) || { visitCount: 1 };

  if (session.humanVerified) {
    profile.lastSeenAt = now;
    safeSetStorage(localStorage, VISITOR_PROFILE_KEY, profile);
    return;
  }

  session.humanVerified = true;
  safeSetStorage(sessionStorage, SESSION_STATE_KEY, session);

  const visitCount = profile.visitCount || 1;
  const isReturning = visitCount >= 2;

  const gtag = ensureGtag();

  // Set user properties for user-level segmentation
  gtag('set', 'user_properties', {
    user_type: isReturning ? 'returning_human' : 'first_visit_human',
    has_returned: isReturning ? 'true' : 'false'
  });

  // 1. Key Event: Human verified engagement
  trackEvent('human_engaged', {
    human_verified: 'true',
    interaction_type: triggerSource,
    visit_count_str: String(visitCount),
    is_returning: isReturning ? 'true' : 'false'
  });

  // 2. Key Event: Returning human visit
  if (isReturning && !session.returnEventFired) {
    session.returnEventFired = true;
    safeSetStorage(sessionStorage, SESSION_STATE_KEY, session);

    let visitTier = 'visit_2';
    if (visitCount === 3) visitTier = 'visit_3';
    else if (visitCount === 4) visitTier = 'visit_4';
    else if (visitCount === 5) visitTier = 'visit_5';
    else if (visitCount >= 6 && visitCount <= 10) visitTier = 'visit_6_10';
    else if (visitCount > 10) visitTier = 'visit_11_plus';

    trackEvent('returning_human_visit', {
      return_visit_num: visitCount,
      visit_tier: visitTier,
      visit_count_str: String(visitCount),
      human_verified: 'true'
    });

    // 3. Milestone Key Event: User returns for the 2nd time
    if (visitCount === 2 && !profile.visit2Tracked) {
      profile.visit2Tracked = true;
      safeSetStorage(localStorage, VISITOR_PROFILE_KEY, profile);

      trackEvent('returning_visit_2', {
        return_visit_num: 2,
        visit_tier: 'visit_2',
        visit_count_str: '2',
        human_verified: 'true'
      });
    }
  }

  profile.lastSeenAt = now;
  safeSetStorage(localStorage, VISITOR_PROFILE_KEY, profile);
}

function attachHumanListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  const onInteraction = (e) => {
    if (e && e.isTrusted === false) return;
    verifyHumanEngagement(e.type || 'interaction');
    removeListeners();
  };

  const removeListeners = () => {
    window.removeEventListener('pointerdown', onInteraction);
    window.removeEventListener('keydown', onInteraction);
    window.removeEventListener('touchstart', onInteraction);
    window.removeEventListener('wheel', onInteraction);
  };

  window.addEventListener('pointerdown', onInteraction, { passive: true, once: true });
  window.addEventListener('keydown', onInteraction, { passive: true, once: true });
  window.addEventListener('touchstart', onInteraction, { passive: true, once: true });
  window.addEventListener('wheel', onInteraction, { passive: true, once: true });
}

export function initGA() {
  const gtag = ensureGtag();
  const { profile } = initVisitorSession();
  const isReturning = (profile.visitCount || 1) >= 2;

  // If script tag is not already present, dynamically inject it
  const existingScript = document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"]`);
  if (!existingScript) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  }

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false,
    user_properties: {
      user_type: isReturning ? 'returning_human' : 'first_visit_human',
      has_returned: isReturning ? 'true' : 'false'
    }
  });

  attachHumanListeners();
}

export function trackPageView(pagePath, pageTitle) {
  const gtag = ensureGtag();
  const raw = (pagePath || '/').replace(/^#/, '');
  const cleanPath = raw.startsWith('/') ? raw : '/' + raw;
  const formattedPath = cleanPath === '/' ? '/' : '/#' + cleanPath;
  const fullUrl = window.location.origin + formattedPath;
  const title = pageTitle || document.title;

  gtag('set', {
    page_path: formattedPath,
    page_location: fullUrl,
    page_title: title
  });

  gtag('event', 'page_view', {
    page_path: formattedPath,
    page_location: fullUrl,
    page_title: title,
    screen_name: title
  });
}

export function trackEvent(eventName, params = {}) {
  const gtag = ensureGtag();

  // If this event was triggered by user action, ensure human engagement is verified
  if (!['human_engaged', 'returning_human_visit', 'returning_visit_2'].includes(eventName)) {
    verifyHumanEngagement('event:' + eventName);
  }

  gtag('event', eventName, params);
}
