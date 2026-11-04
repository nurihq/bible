import { Navbar } from './components/navbar.js';
import { Auth, syncLocalToCloud } from './api.js';
import { initGA, trackPageView } from './analytics.js';
import { getBookById } from './bible-data.js';

import { renderSignInScreen } from './screens/signin.js';
import { renderLandingScreen, renderHubScreen } from './screens/home.js';
import { renderTypingScreen } from './screens/typing.js';
import { renderProgressScreen } from './screens/progress.js';

function getActiveRoutePath() {
  const rawHash = window.location.hash || '';
  if (rawHash && rawHash !== '#' && rawHash !== '#/') {
    const hashPath = rawHash.replace(/^#/, '').replace(/\/+$/, '') || '/';
    return hashPath.startsWith('/') ? hashPath : '/' + hashPath;
  }
  return '/';
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

    // Initial cloud sync if authenticated
    if (Auth.isAuthenticated()) {
      syncLocalToCloud();
    }

    // Auto-sync when returning to tab (without interrupting an active typing session)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Auth.isAuthenticated()) {
        syncLocalToCloud().then(() => {
          const currentPath = getActiveRoutePath();
          if (currentPath.startsWith('/typing')) return;
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
    const path = getActiveRoutePath();
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
        navigate('#/hub');
        return;
      }
      document.title = 'Sign In | bible';
      trackPageView('/signin', document.title);
      renderSignInScreen(this.mainContainer);
      return;
    }

    if (path === '/hub') {
      document.title = 'Scripture Suite | bible';
      trackPageView('/hub', document.title);
      renderHubScreen(this.mainContainer);
      return;
    }

    if (path === '/typing') {
      document.title = 'Bible Typing | bible';
      trackPageView('/typing', document.title);
      renderTypingScreen(this.mainContainer, {});
      return;
    }

    const typingChapterMatch = path.match(/^\/typing\/(\d+)\/(\d+)$/);
    if (typingChapterMatch) {
      const bookId = Number(typingChapterMatch[1]);
      const chapter = Number(typingChapterMatch[2]);
      const book = getBookById(bookId);
      document.title = `${book.name} ${chapter} — Bible Typing | bible`;
      trackPageView(path, document.title);
      renderTypingScreen(this.mainContainer, { bookId, chapter });
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

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
