import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

// ── Minimal DOM & Browser Environment Harness for screens/home.js & api.js ──
function setupBrowserEnv() {
  const storage = new Map();
  const sessionStore = new Map();
  const winListeners = new Map();
  const docListeners = new Map();

  const localStorageMock = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear()
  };

  const sessionStorageMock = {
    getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
    setItem: (k, v) => sessionStore.set(k, String(v)),
    removeItem: (k) => sessionStore.delete(k),
    clear: () => sessionStore.clear()
  };

  function createMockElement(id = '') {
    const listeners = new Map();
    const classSet = new Set();
    return {
      id,
      hidden: false,
      style: {},
      offsetWidth: 400,
      textContent: '',
      innerHTML: '',
      classList: {
        add: (...cls) => cls.forEach((c) => classSet.add(c)),
        remove: (...cls) => cls.forEach((c) => classSet.delete(c)),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classSet.has(c)) { classSet.delete(c); return false; }
            classSet.add(c); return true;
          }
          if (force) classSet.add(c); else classSet.delete(c);
          return Boolean(force);
        },
        contains: (c) => classSet.has(c)
      },
      setAttribute: () => {},
      getAttribute: () => null,
      contains: () => false,
      closest: () => null,
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
      },
      removeEventListener: (type, fn) => {
        if (listeners.has(type)) listeners.get(type).delete(fn);
      },
      dispatchEvent: (evt) => {
        const set = listeners.get(evt.type);
        if (set) {
          for (const fn of [...set]) {
            fn(evt);
          }
        }
      },
      click: function () {
        this.dispatchEvent({
          type: 'click',
          button: 0,
          target: this,
          stopPropagation: () => {},
          preventDefault: () => {}
        });
      }
    };
  }

  function createContainer() {
    const elementsById = new Map();
    const getOrCreate = (sel) => {
      if (!elementsById.has(sel)) {
        elementsById.set(sel, createMockElement(sel));
      }
      return elementsById.get(sel);
    };

    const container = {
      _innerHTML: '',
      set innerHTML(val) {
        this._innerHTML = val;
        // Fresh DOM elements on each renderCard() pass
        elementsById.clear();
      },
      get innerHTML() {
        return this._innerHTML;
      },
      querySelector: (sel) => getOrCreate(sel),
      querySelectorAll: () => []
    };
    return container;
  }

  globalThis.localStorage = localStorageMock;
  globalThis.sessionStorage = sessionStorageMock;

  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    location: {
      hostname: 'promisestocreation.org',
      pathname: '/',
      search: '',
      hash: ''
    },
    history: {
      pushState: () => {},
      replaceState: () => {}
    },
    addEventListener: (type, fn) => {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (winListeners.has(type)) winListeners.get(type).delete(fn);
    },
    dispatchEvent: (evt) => {
      const set = winListeners.get(evt.type);
      if (set) {
        for (const fn of [...set]) {
          fn(evt);
        }
      }
    }
  };

  globalThis.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) {
      this.type = type;
      this.detail = opts.detail;
    }
  };

  globalThis.document = {
    title: '',
    visibilityState: 'visible',
    documentElement: {
      classList: { add: () => {}, remove: () => {} },
      setAttribute: () => {}
    },
    body: {
      classList: { add: () => {}, remove: () => {} },
      contains: () => true,
      appendChild: () => {}
    },
    head: {
      appendChild: () => {}
    },
    addEventListener: (type, fn) => {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (docListeners.has(type)) docListeners.get(type).delete(fn);
    },
    createElement: () => ({
      _html: '',
      set innerHTML(val) { this._html = String(val || ''); },
      get textContent() { return this._html.replace(/<[^>]*>/g, ''); },
      get innerText() { return this._html.replace(/<[^>]*>/g, ''); }
    }),
    getElementById: () => null,
    querySelector: () => null
  };

  // Stub fetch so bible chapter prefetching resolves quietly without network calls
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ([
      { verse: 1, text: 'In the beginning God created the heavens and the earth.' },
      { verse: 2, text: 'The earth was without form and void.' },
      { verse: 3, text: 'And God said, Let there be light.' }
    ])
  });

  return { createContainer };
}

const { createContainer } = setupBrowserEnv();
const api = await import(path.join(ROOT_DIR, 'api.js'));
const home = await import(path.join(ROOT_DIR, 'screens/home.js'));

function isVerseMarkedRead(bookId, chapter, verseNum) {
  const summary = api.getChapterProgressSummary(bookId, chapter);
  return api.isVerseCovered(summary.record, verseNum);
}

function getActiveCarouselHistory() {
  const raw = globalThis.localStorage.getItem('bible_home_daily_history_v1');
  assert.ok(raw, 'Expected daily history in localStorage');
  return JSON.parse(raw);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('1. Landing on a verse on the Home carousel does NOT mark it as read', () => {
  globalThis.localStorage.clear();
  const container = createContainer();
  home.renderLandingScreen(container);

  const state = getActiveCarouselHistory();
  assert.equal(state.currentIndex, 0);
  const v0 = state.history[0];
  assert.ok(v0 && v0.bookId && v0.chapter && v0.verse);

  assert.equal(
    isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse),
    false,
    'Simply landing on the initial verse must NOT mark it as read'
  );
});

test('2. Clicking Next marks the departing verse as read, and does NOT mark the newly landed verse as read', async () => {
  globalThis.localStorage.clear();
  const container = createContainer();
  home.renderLandingScreen(container);

  const initialState = getActiveCarouselHistory();
  const v0 = initialState.history[0];
  assert.equal(isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse), false);

  // Click Next chevron
  const nextBtn = container.querySelector('#votd-carousel-next-btn');
  nextBtn.click();
  await wait(130);

  const afterNextState = getActiveCarouselHistory();
  assert.equal(afterNextState.currentIndex, 1);
  const v1 = afterNextState.history[1];

  assert.equal(
    isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse),
    true,
    'Departing verse (v0) MUST be marked as read after advancing forward (next)'
  );
  assert.equal(
    isVerseMarkedRead(v1.bookId, v1.chapter, v1.verse),
    false,
    'Newly landed verse (v1) must NOT be marked as read just by landing on it'
  );
});

test('3. Going backward (Prev) neither marks the departing verse read nor unmarks the previous read verse', async () => {
  globalThis.localStorage.clear();
  const container = createContainer();
  home.renderLandingScreen(container);

  const v0 = getActiveCarouselHistory().history[0];

  // Advance forward to v1 (marks v0 read, lands on v1 unread)
  container.querySelector('#votd-carousel-next-btn').click();
  await wait(130);

  const v1 = getActiveCarouselHistory().history[1];
  assert.equal(isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse), true);
  assert.equal(isVerseMarkedRead(v1.bookId, v1.chapter, v1.verse), false);

  // Now navigate backward (prev) from v1 back to v0
  container.querySelector('#votd-carousel-prev-btn').click();
  await wait(130);

  const afterPrevState = getActiveCarouselHistory();
  assert.equal(afterPrevState.currentIndex, 0);

  assert.equal(
    isVerseMarkedRead(v1.bookId, v1.chapter, v1.verse),
    false,
    'Backing out of v1 via Prev must NOT mark v1 as read'
  );
  assert.equal(
    isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse),
    true,
    'Swiping/clicking back to v0 must NOT unmark v0 (it remains read)'
  );
});

test('4. Mobile touch swipe left (next) vs swipe right (prev) obeys all three read rules', async () => {
  globalThis.localStorage.clear();
  const container = createContainer();
  home.renderLandingScreen(container);

  // Wait >500ms mount guard
  await wait(520);

  const v0 = getActiveCarouselHistory().history[0];
  let card = container.querySelector('#votd-card');

  // Swipe LEFT (deltaX = -200 -> 'next')
  card.dispatchEvent({ type: 'touchstart', touches: [{ clientX: 300, clientY: 200 }] });
  card.dispatchEvent({ type: 'touchmove', touches: [{ clientX: 100, clientY: 200 }] });
  card.dispatchEvent({ type: 'touchend', target: card });
  await wait(130);

  const v1 = getActiveCarouselHistory().history[1];
  assert.equal(getActiveCarouselHistory().currentIndex, 1);
  assert.equal(isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse), true, 'Swipe left (next) marks v0 read');
  assert.equal(isVerseMarkedRead(v1.bookId, v1.chapter, v1.verse), false, 'Landing on v1 via swipe left leaves v1 unread');

  // Swipe RIGHT (deltaX = +200 -> 'prev')
  card = container.querySelector('#votd-card');
  card.dispatchEvent({ type: 'touchstart', touches: [{ clientX: 100, clientY: 200 }] });
  card.dispatchEvent({ type: 'touchmove', touches: [{ clientX: 300, clientY: 200 }] });
  card.dispatchEvent({ type: 'touchend', target: card });
  await wait(130);

  assert.equal(getActiveCarouselHistory().currentIndex, 0);
  assert.equal(isVerseMarkedRead(v1.bookId, v1.chapter, v1.verse), false, 'Swipe right (prev) does NOT mark v1 read');
  assert.equal(isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse), true, 'Swipe right (prev) does NOT unmark v0');
});

test('5. Desktop mouse drag left (next) vs drag right (prev) & ArrowRight/ArrowLeft obey all three read rules', async () => {
  globalThis.localStorage.clear();
  const container = createContainer();
  home.renderLandingScreen(container);

  const v0 = getActiveCarouselHistory().history[0];
  let card = container.querySelector('#votd-card');

  // Mouse drag LEFT (deltaX = -200 -> 'next')
  card.dispatchEvent({ type: 'mousedown', button: 0, clientX: 350, target: card });
  globalThis.window.dispatchEvent({ type: 'mousemove', clientX: 150 });
  globalThis.window.dispatchEvent({ type: 'mouseup', clientX: 150 });
  await wait(130);

  const v1 = getActiveCarouselHistory().history[1];
  assert.equal(getActiveCarouselHistory().currentIndex, 1);
  assert.equal(isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse), true, 'Mouse drag left (next) marks v0 read');
  assert.equal(isVerseMarkedRead(v1.bookId, v1.chapter, v1.verse), false, 'Landing on v1 leaves v1 unread');

  // Mouse drag RIGHT (deltaX = +200 -> 'prev')
  card = container.querySelector('#votd-card');
  card.dispatchEvent({ type: 'mousedown', button: 0, clientX: 150, target: card });
  globalThis.window.dispatchEvent({ type: 'mousemove', clientX: 350 });
  globalThis.window.dispatchEvent({ type: 'mouseup', clientX: 350 });
  await wait(130);

  assert.equal(getActiveCarouselHistory().currentIndex, 0);
  assert.equal(isVerseMarkedRead(v1.bookId, v1.chapter, v1.verse), false, 'Mouse drag right (prev) leaves v1 unread');
  assert.equal(isVerseMarkedRead(v0.bookId, v0.chapter, v0.verse), true, 'Mouse drag right (prev) keeps v0 read');
});

test('6. Source code invariant guard on screens/home.js', () => {
  const src = fs.readFileSync(path.join(ROOT_DIR, 'screens/home.js'), 'utf8');

  // Ensure window.__bibleHomeCleanup does not reference block-scoped onMouseMove
  assert.match(src, /let onMouseMove = null;/);
  assert.match(src, /let onMouseUp = null;/);

  // Ensure markVerseAsRead in navigateVerse only appears inside direction === 'next'
  const navFnStart = src.indexOf('async function navigateVerse');
  const navFnEnd = src.indexOf('function navigateToPracticeScreen');
  assert.ok(navFnStart !== -1 && navFnEnd > navFnStart);

  const navBody = src.slice(navFnStart, navFnEnd);
  const nextBranchIdx = navBody.indexOf("else if (direction === 'next')");
  const markReadIdx = navBody.indexOf('markVerseAsRead(');

  assert.ok(nextBranchIdx !== -1, "Expected else if (direction === 'next') in navigateVerse");
  assert.ok(markReadIdx > nextBranchIdx, 'markVerseAsRead in navigateVerse must be strictly inside the direction === "next" branch');
  assert.equal(navBody.indexOf('unmarkVerseAsRead'), -1, 'navigateVerse must never unmark a verse as read');
});

test('7. Actions modal strictly isolates mode settings to the current activeMode', () => {
  const typingSrc = fs.readFileSync(path.join(ROOT_DIR, 'screens/typing.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, 'styles.css'), 'utf8');

  // Verify getModeSettingsPanelsForMode exists and openActionsModal uses it instead of appending all 4 panels
  assert.match(typingSrc, /function getModeSettingsPanelsForMode\(targetMode\)/);
  assert.match(typingSrc, /getModeSettingsPanelsForMode\(activeMode\)\.forEach/);

  // Verify styles.css does not use unscoped `#actions-mode-settings-host > .typing-options-body { ... display: flex !important }`
  assert.doesNotMatch(
    cssSrc,
    /#actions-mode-settings-host\s*>\s*\.typing-options-body\s*\{/,
    'styles.css must scope #actions-mode-settings-host > .typing-options-body with :not([hidden]) so [hidden] panels are never forced visible'
  );
  assert.match(cssSrc, /\.typing-actions-card \[hidden\]/);
});
