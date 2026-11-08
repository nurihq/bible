import { Navbar } from './components/navbar.js?v=20261108_v14';
import {
  Auth,
  syncLocalToCloud,
  getSingleVerseModePref,
  getShuffleVersesPref,
  getPreferredTranslation,
  getActiveModePref,
  setActiveModePref,
  getLocalStore,
  initFirebaseAuthObserver
} from './api.js?v=20261108_v14';
import { initGA, trackPageView } from './analytics.js?v=20261108_v14';
import { getBookById, replenishRandomVersePreloads, getNextPreloadedRandomVerse } from './bible-data.js?v=20261108_v14';
import { navigate, parseActiveRoute } from './router.js?v=20261108_v14';
export { navigate, parseActiveRoute } from './router.js?v=20261108_v14';

import { renderSignInScreen } from './screens/signin.js?v=20261108_v14';
import { renderLandingScreen } from './screens/home.js?v=20261108_v14';
import { renderTypingScreen } from './screens/typing.js?v=20261108_v14';
import { renderProgressScreen } from './screens/progress.js?v=20261108_v14';
import { renderDrawingsScreen } from './screens/drawings.js?v=20261108_v14';
import { renderFavoritesScreen } from './screens/favorites.js?v=20261108_v14';
import { renderBookmarksScreen } from './screens/bookmarks.js?v=20261108_v14';

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
    window.addEventListener('bible:route-changed', () => this.handleRoute());

    // Intercept internal links for instant SPA navigation without page reload
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.getAttribute('href')) {
        if (
          link.getAttribute('target') === '_blank' ||
          link.hasAttribute('download') ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          (typeof e.button === 'number' && e.button !== 0)
        ) {
          return;
        }
        const href = link.getAttribute('href');
        // Handle both clean paths (/typing, /progress) and legacy (#/typing, #/)
        if (href.startsWith('#/')) {
          e.preventDefault();
          navigate(href.slice(1));
        } else if (href.startsWith('/') && !href.startsWith('//')) {
          e.preventDefault();
          navigate(href);
        }
      }
    });

    // Initial cloud sync if authenticated
    if (Auth.isAuthenticated()) {
      syncLocalToCloud();
    }

    // Auto-sync when returning to tab (without interrupting an active session)
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Auth.isAuthenticated()) {
        syncLocalToCloud().then(() => {
          const { path } = parseActiveRoute();
          if (/^\/(?:typing|type|speak|draw|promises)/.test(path)) return;
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

    // Re-render and handle sync immediately when auth state changes
    window.addEventListener('bible:auth-changed', () => {
      const { path } = parseActiveRoute();
      this.navbar.render(this.navContainer, path);
      if (Auth.isAuthenticated()) {
        syncLocalToCloud().catch(() => {});
      }
    });
  }

  init() {
    initFirebaseAuthObserver().catch(() => {});
    this.handleRoute();
    if (getSingleVerseModePref() && getShuffleVersesPref()) {
      replenishRandomVersePreloads().catch(() => {});
    }
  }

  handleThemeChange() {}

  handleSignOut() {
    if (window.__bibleTypingCleanup) {
      window.__bibleTypingCleanup();
    }
    navigate('/');
  }

  handleRoute() {
    const { path, query } = parseActiveRoute();

    const isPracticeRoute = /^\/(?:typing|type|speak|draw|promises)(?:\/|$)/.test(path);

    // Clean up active typing/speech intervals when leaving the practice screen
    if (!isPracticeRoute && window.__bibleTypingCleanup) {
      window.__bibleTypingCleanup();
    }
    if (path !== '/drawings' && path !== '/meditations' && window.__bibleDrawingsCleanup) {
      window.__bibleDrawingsCleanup();
    }

    // Re-render navbar (and global unauthenticated warning banner on non-landing/non-signin screens)
    this.navbar.render(this.navContainer, path);

    if (path === '/' || path === '') {
      document.title = 'Promises to Creation — Bible Typing, Speaking & Drawing App';
      trackPageView('/', document.title);
      renderLandingScreen(this.mainContainer);
      return;
    }

    if (path === '/signin') {
      if (Auth.isAuthenticated()) {
        navigate(`/${getActiveModePref()}`);
        return;
      }
      document.title = 'Sign In | Promises to Creation';
      trackPageView('/signin', document.title);
      renderSignInScreen(this.mainContainer);
      return;
    }

    if (path === '/hub' || path === '/promises') {
      navigate(`/${getActiveModePref()}`, { replace: true });
      return;
    }

    // Bare mode entry points: /typing, /type, /speak, /draw
    const bareModeMatch = path.match(/^\/(typing|type|speak|draw)$/);
    if (bareModeMatch) {
      const rawMode = bareModeMatch[1];
      const targetMode = rawMode === 'typing' ? getActiveModePref() : rawMode;
      if (rawMode !== 'typing' && getActiveModePref() !== targetMode) {
        setActiveModePref(targetMode);
      }

      if (targetMode === 'draw' || getSingleVerseModePref()) {
        if (getShuffleVersesPref()) {
          const randRef = getNextPreloadedRandomVerse(getPreferredTranslation() || 'ESV');
          navigate(`/${targetMode}/${randRef.bookId}/${randRef.chapter}/${randRef.verse}`, { replace: true });
          return;
        }
        const store = getLocalStore();
        const bId = store.lastBookId || 1;
        const ch = store.lastChapter || 1;
        const vr = store.lastVerse || 1;
        navigate(`/${targetMode}/${bId}/${ch}/${vr}`, { replace: true });
        return;
      }
      const store = getLocalStore();
      const bId = store.lastBookId || 1;
      const ch = store.lastChapter || 1;
      navigate(`/${targetMode}/${bId}/${ch}`, { replace: true });
      return;
    }

    // Single-Verse Granularity Route: /:mode/:bookId/:chapter/:verse
    const verseMatch = path.match(/^\/(typing|type|speak|draw)\/(\d+)\/(\d+)\/(\d+)$/);
    if (verseMatch) {
      const rawMode = verseMatch[1];
      const bookId = Number(verseMatch[2]);
      const chapter = Number(verseMatch[3]);
      const verse = Number(verseMatch[4]);
      const mode = rawMode === 'typing' ? getActiveModePref() : rawMode;
      if (rawMode !== 'typing' && getActiveModePref() !== mode) {
        setActiveModePref(mode);
      }
      if (rawMode === 'typing') {
        navigate(`/${mode}/${bookId}/${chapter}/${verse}`, { replace: true });
        return;
      }
      const book = getBookById(bookId);
      const modeTitle = mode === 'speak' ? 'Speak' : (mode === 'draw' ? 'Draw' : 'Type');
      document.title = `${book.name} ${chapter}:${verse} — ${modeTitle} | Promises to Creation`;
      trackPageView(path, document.title);
      renderTypingScreen(this.mainContainer, {
        bookId,
        chapter,
        verse,
        mode,
        singleVerseMode: true
      });
      return;
    }

    // Full-Chapter Route (with optional ?verse=X starting verse): /:mode/:bookId/:chapter
    const chapterMatch = path.match(/^\/(typing|type|speak|draw)\/(\d+)\/(\d+)$/);
    if (chapterMatch) {
      const rawMode = chapterMatch[1];
      const bookId = Number(chapterMatch[2]);
      const chapter = Number(chapterMatch[3]);
      const startVerse = query.get('verse') ? Number(query.get('verse')) : null;
      const mode = rawMode === 'typing' ? getActiveModePref() : rawMode;
      if (rawMode !== 'typing' && getActiveModePref() !== mode) {
        setActiveModePref(mode);
      }
      // Draw mode is always single-verse
      if (mode === 'draw') {
        navigate(`/draw/${bookId}/${chapter}/${startVerse || 1}`, { replace: true });
        return;
      }
      if (rawMode === 'typing') {
        navigate(`/${mode}/${bookId}/${chapter}${startVerse ? `?verse=${startVerse}` : ''}`, { replace: true });
        return;
      }
      const book = getBookById(bookId);
      const modeTitle = mode === 'speak' ? 'Speak' : 'Type';
      document.title = `${book.name} ${chapter}${startVerse ? ` (v. ${startVerse})` : ''} — ${modeTitle} | Promises to Creation`;
      trackPageView(path, document.title);
      renderTypingScreen(this.mainContainer, {
        bookId,
        chapter,
        startVerse,
        mode,
        singleVerseMode: false
      });
      return;
    }

    if (path === '/progress') {
      document.title = 'Progress & Bible Tracking | Promises to Creation';
      trackPageView('/progress', document.title);
      renderProgressScreen(this.mainContainer);
      return;
    }

    if (path === '/drawings' || path === '/meditations') {
      if (path === '/meditations') {
        navigate('/drawings', { replace: true });
        return;
      }
      document.title = 'Scripture Drawings | Promises to Creation';
      trackPageView('/drawings', document.title);
      renderDrawingsScreen(this.mainContainer);
      return;
    }

    if (path === '/favorites') {
      document.title = 'Favorited Verses | Promises to Creation';
      trackPageView('/favorites', document.title);
      renderFavoritesScreen(this.mainContainer);
      return;
    }

    if (path === '/bookmarks') {
      document.title = 'Bookmarks | Promises to Creation';
      trackPageView('/bookmarks', document.title);
      renderBookmarksScreen(this.mainContainer);
      return;
    }

    // Fallback to landing screen
    navigate('/');
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
