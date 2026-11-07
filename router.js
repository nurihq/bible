/**
 * Clean URL Router for Promises to Creation
 * Uses HTML5 History API (pushState/replaceState) with automatic legacy hash link migration.
 */

export function parseActiveRoute() {
  // 1. If legacy hash route is present (e.g. #/typing/1/1), migrate to clean URL without page reload
  const rawHash = window.location.hash || '';
  if (rawHash && rawHash.startsWith('#/')) {
    const withoutHash = rawHash.replace(/^#/, '');
    try {
      window.history.replaceState(null, '', withoutHash);
    } catch (_) {}
    const [rawPath, rawQuery = ''] = withoutHash.split('?');
    const cleanPath = (rawPath || '/').replace(/\/+$/, '') || '/';
    const path = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
    const query = new URLSearchParams(rawQuery);
    return { path, query };
  }

  // 2. Parse modern clean path & query from window.location
  let rawPath = window.location.pathname || '/';

  // If deployed under a subpath on github.io, strip repo segment if needed
  if (window.location.hostname.endsWith('github.io')) {
    const segments = rawPath.split('/').filter(Boolean);
    if (segments.length > 0 && segments[0] === 'bible') {
      rawPath = '/' + segments.slice(1).join('/');
    }
  }

  // Strip trailing slashes and index.html
  let cleanPath = (rawPath || '/').replace(/\/+$/, '') || '/';
  if (!cleanPath.startsWith('/') || cleanPath === '/index.html') {
    cleanPath = '/';
  }

  const query = new URLSearchParams(window.location.search || '');
  return { path: cleanPath, query };
}

export function navigate(to) {
  const raw = (to || '/').trim();
  let cleanTo = raw.replace(/^#/, '');
  if (!cleanTo.startsWith('/')) {
    cleanTo = '/' + cleanTo;
  }

  // Preserve repo subpath on github.io if applicable
  let targetUrl = cleanTo;
  if (window.location.hostname.endsWith('github.io') && window.location.pathname.startsWith('/bible')) {
    targetUrl = '/bible' + cleanTo;
  }

  const current = window.location.pathname + window.location.search;
  if (current !== targetUrl) {
    window.history.pushState(null, '', targetUrl);
  }
  window.dispatchEvent(new CustomEvent('bible:route-changed', { detail: { path: cleanTo } }));
}
