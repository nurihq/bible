// Google Analytics 4 tracking integration for bible
import { CONFIG } from './config.js?v=20261104_v3';

export const GA_MEASUREMENT_ID = CONFIG.GA_MEASUREMENT_ID || 'G-6B52RELLEB';

export function initGA() {
  if (window.gtag) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: false
  });
}

export function trackPageView(pagePath, pageTitle) {
  if (typeof window.gtag === 'function') {
    const raw = (pagePath || '/').replace(/^#/, '');
    const cleanPath = raw.startsWith('/') ? raw : '/' + raw;
    const formattedPath = cleanPath === '/' ? '/' : '/#' + cleanPath;
    const fullUrl = window.location.origin + formattedPath;
    const title = pageTitle || document.title;

    window.gtag('set', {
      page_path: formattedPath,
      page_location: fullUrl,
      page_title: title
    });

    window.gtag('event', 'page_view', {
      page_path: formattedPath,
      page_location: fullUrl,
      page_title: title,
      screen_name: title
    });
  }
}

export function trackEvent(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}
