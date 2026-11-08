// Google Analytics 4 tracking integration for bible
import { CONFIG } from './config.js?v=20261108_v24';

export const GA_MEASUREMENT_ID = CONFIG.GA_MEASUREMENT_ID || 'G-6B52RELLEB';

function ensureGtag() {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
  }
  return window.gtag;
}

export function initGA() {
  const gtag = ensureGtag();

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
    send_page_view: false
  });
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
  gtag('event', eventName, params);
}
