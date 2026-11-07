export function parseActiveRoute() {
  const rawHash = window.location.hash || '';
  if (rawHash && rawHash !== '#' && rawHash !== '#/') {
    const withoutHash = rawHash.replace(/^#/, '');
    const [rawPath, rawQuery = ''] = withoutHash.split('?');
    const cleanPath = (rawPath || '/').replace(/\/+$/, '') || '/';
    const path = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
    const query = new URLSearchParams(rawQuery);
    return { path, query };
  }
  return { path: '/', query: new URLSearchParams() };
}

export function navigate(to) {
  const raw = (to || '/').trim();
  let cleanTo = raw;
  if (!cleanTo.startsWith('#')) {
    cleanTo = '#' + (cleanTo.startsWith('/') ? cleanTo : '/' + cleanTo);
  }
  if (window.location.hash !== cleanTo) {
    window.location.hash = cleanTo;
  } else {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}
