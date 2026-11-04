import { Navbar } from './components/navbar.js?v=20261104_v12';
import { Auth, syncLocalToCloud } from './api.js?v=20261104_v12';
import { initGA, trackPageView } from './analytics.js?v=20261104_v12';
import { getBookById } from './bible-data.js?v=20261104_v12';

import { renderSignInScreen } from './screens/signin.js?v=20261104_v12';
import { renderLandingScreen } from './screens/home.js?v=20261104_v12';
import { renderTypingScreen } from './screens/typing.js?v=20261104_v12';
import { renderProgressScreen } from './screens/progress.js?v=20261104_v12';

function parseActiveRoute() {
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

class App {
  constructor() {
    this.navContainer = document.getElementById('nav-container');
    this.mainContainer = document.getElementById('app');

    initGA();

    this.navbar = new Navbar(
      () => this.handleThemeChange(),
      () => this.handleSignOut()
    );

    // Prevent mobile auto-capitalization/autocorrect on typing inputs
    document.addEventListener('focusin', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        if (!e.target.hasAttribute('autocapitalize')) e.target.setAttribute('autocapitalize', 'none');
        if (!e.target.hasAttribute('autocorrect')) e.target.setAttribute('autocorrect', 'off');
        if (!e.target.hasAttribute('spellcheck')) e.target.setAttribute('spellcheck', 'false');
      }
    });

    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('popstate', () => this.handleRoute());

    // Intercept internal #/... links for instant SPA navigation
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.getAttribute('href')) {
        if (
          link.getAttribute('target') === '_blank' ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          (typeof e.button === 'number' && e.button !== 0)
        ) {
          return;
        }
        const href = link.getAttribute('href');
        if (href.startsWith('#/')) {
          e.preventDefault();
          navigate(href);
        }
      }
    });

    // Initial cloud sync if authenticated
    if (Auth.isAuthenticated()) {
      syncLocalToCloud();
    }

    // Auto-sync when returning to tab (without interrupting an active typing session)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Auth.isAuthenticated()) {
        syncLocalToCloud().then(() => {
          const { path } = parseActiveRoute();
          if (path.startsWith('/typing')) return;
          this.handleRoute();
        });
      }
    });

    // Periodic background cloud sync every 20 seconds
    setInterval(() => {
      if (document.visibilityState === 'visible' && Auth.isAuthenticated()) {
        syncLocalToCloud();
      }
    }, 20000);
  }

  init() {
    this.handleRoute();
  }

  handleThemeChange() {}

  handleSignOut() {
    if (window.__bibleTypingCleanup) {
      window.__bibleTypingCleanup();
    }
    navigate('#/');
  }

  handleRoute() {
    const { path, query } = parseActiveRoute();
    const routeToken = path === '/' ? '#/' : `#${path}`;

    // Clean up active typing intervals when leaving the typing screen
    if (!path.startsWith('/typing') && window.__bibleTypingCleanup) {
      window.__bibleTypingCleanup();
    }

    // Re-render navbar (and global unauthenticated warning banner on non-landing/non-signin screens)
    this.navbar.render(this.navContainer, routeToken);

    if (path === '/' || path === '') {
      document.title = 'bible — Scripture Typing & Reach Suite';
      trackPageView('/', document.title);
      renderLandingScreen(this.mainContainer);
      return;
    }

    if (path === '/signin') {
      if (Auth.isAuthenticated()) {
        navigate('#/typing');
        return;
      }
      document.title = 'Sign In | bible';
      trackPageView('/signin', document.title);
      renderSignInScreen(this.mainContainer);
      return;
    }

    if (path === '/hub') {
      navigate('#/typing');
      return;
    }

    if (path === '/typing') {
      document.title = 'Bible Typing | bible';
      trackPageView('/typing', document.title);
      renderTypingScreen(this.mainContainer, {});
      return;
    }

    // Single-Verse Granularity Route: #/typing/:bookId/:chapter/:verse
    const typingVerseMatch = path.match(/^\/typing\/(\d+)\/(\d+)\/(\d+)$/);
    if (typingVerseMatch) {
      const bookId = Number(typingVerseMatch[1]);
      const chapter = Number(typingVerseMatch[2]);
      const verse = Number(typingVerseMatch[3]);
      const book = getBookById(bookId);
      document.title = `${book.name} ${chapter}:${verse} — Single Verse Typing | bible`;
      trackPageView(path, document.title);
      renderTypingScreen(this.mainContainer, {
        bookId,
        chapter,
        verse,
        singleVerseMode: true
      });
      return;
    }

    // Full-Chapter Route (with optional ?verse=X starting verse): #/typing/:bookId/:chapter
    const typingChapterMatch = path.match(/^\/typing\/(\d+)\/(\d+)$/);
    if (typingChapterMatch) {
      const bookId = Number(typingChapterMatch[1]);
      const chapter = Number(typingChapterMatch[2]);
      const startVerse = query.get('verse') ? Number(query.get('verse')) : null;
      const book = getBookById(bookId);
      document.title = `${book.name} ${chapter}${startVerse ? ` (v. ${startVerse})` : ''} — Bible Typing | bible`;
      trackPageView(path, document.title);
      renderTypingScreen(this.mainContainer, {
        bookId,
        chapter,
        startVerse,
        singleVerseMode: false
      });
      return;
    }

    if (path === '/progress') {
      document.title = 'Typing Progress & Bible Reach | bible';
      trackPageView('/progress', document.title);
      renderProgressScreen(this.mainContainer);
      return;
    }

    // Fallback to landing screen
    navigate('#/');
  }
}

function bootApp() {
  if (window.__bibleAppBooted) return;
  window.__bibleAppBooted = true;
  const app = new App();
  app.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootApp);
} else {
  bootApp();
}
