import { CONFIG } from './config.js?v=20261112_v1';
import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  TOTAL_BIBLE_CHAPTERS,
  TOTAL_OT_CHAPTERS,
  TOTAL_NT_CHAPTERS,
  TOTAL_BIBLE_VERSES,
  getChapterVerseCount,
  getBookById
} from './bible-data.js?v=20261112_v1';

const STORAGE_PREFIX = 'bible_app_';
const AUTH_TOKEN_KEY = `${STORAGE_PREFIX}auth_token`;
const USER_KEY = `${STORAGE_PREFIX}user`;
const AUTH_SESSION_EXP_KEY = `${STORAGE_PREFIX}auth_session_exp`;
const LOCAL_DATA_KEY = `${STORAGE_PREFIX}local_data_v1`;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ── Authentication & Session Management (30-day login session) ───
export const Auth = {
  getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },
  setToken(token) {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },
  setUser(user) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  },
  getSessionExpiry() {
    const raw = localStorage.getItem(AUTH_SESSION_EXP_KEY);
    return raw ? Number(raw) : 0;
  },
  setSessionExpiry(timestamp = null) {
    const exp = timestamp || (Date.now() + THIRTY_DAYS_MS);
    localStorage.setItem(AUTH_SESSION_EXP_KEY, String(exp));
  },
  isTokenValid() {
    const token = this.getToken();
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    } catch (e) {
      return false;
    }
  },
  isAuthenticated() {
    const user = this.getUser();
    const token = this.getToken();
    if (!user || !token) return false;
    const exp = this.getSessionExpiry();
    if (!exp) {
      this.setSessionExpiry();
      return true;
    }
    return exp > Date.now();
  },
  signOut() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AUTH_SESSION_EXP_KEY);
    try {
      if (CONFIG.FIREBASE_CONFIG) {
        Promise.all([
          import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
        ]).then(([{ getApps }, { getAuth, signOut }]) => {
          const apps = getApps();
          if (apps.length > 0) {
            signOut(getAuth(apps[0])).catch(() => {});
          }
        }).catch(() => {});
      }
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('bible:auth-changed', { detail: { authenticated: false } }));
  }
};

let isRefreshingToken = false;
export async function attemptSilentGoogleRefresh() {
  if (isRefreshingToken) return false;
  isRefreshingToken = true;

  try {
    // Try refreshing via Firebase Auth if an active Firebase session exists
    if (CONFIG.FIREBASE_CONFIG) {
      const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
      ]);
      const apps = getApps();
      const app = apps.length > 0 ? apps[0] : initializeApp(CONFIG.FIREBASE_CONFIG);
      const auth = getAuth(app);
      if (auth.currentUser) {
        const freshToken = await auth.currentUser.getIdToken(true);
        if (freshToken) {
          Auth.setToken(freshToken);
          Auth.setSessionExpiry();
          isRefreshingToken = false;
          return true;
        }
      }
    }
  } catch (e) {}

  isRefreshingToken = false;
  return false;
}

let firebaseObserverInitialized = false;
export async function initFirebaseAuthObserver() {
  if (firebaseObserverInitialized || !CONFIG.FIREBASE_CONFIG) return;
  firebaseObserverInitialized = true;

  try {
    const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
    ]);
    const apps = getApps();
    const app = apps.length > 0 ? apps[0] : initializeApp(CONFIG.FIREBASE_CONFIG);
    const auth = getAuth(app);

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const freshToken = await user.getIdToken();
          if (freshToken) {
            Auth.setToken(freshToken);
            Auth.setSessionExpiry();
            const sub = user.providerData?.[0]?.uid || user.uid;
            Auth.setUser({
              sub,
              name: user.displayName || (user.email ? user.email.split('@')[0] : 'Reader'),
              email: user.email || '',
              picture: user.photoURL || ''
            });
            window.dispatchEvent(new CustomEvent('bible:auth-changed', { detail: { authenticated: true } }));
          }
        } catch (e) {}
      }
    });
  } catch (e) {}
}

export const DEFAULT_MEDITATE_FONT = "Arial, -apple-system, sans-serif";
export const DEFAULT_MEDITATE_FONT_SIZE = 20;
export const DEFAULT_MEDITATE_FONT_CASE = "none";
export const DEFAULT_MEDITATE_FONT_COLOR = "";
export const DEFAULT_MEDITATE_BOX_WIDTH = 440;

// ── Local & Cloud Store ─────────────────────────────────────────
function createDefaultStore() {
  return {
    preferredTranslation: 'ESV',
    singleVerseMode: true,
    shuffleVerses: true,
    autoAdvance: false,
    advanceButton: true,
    skipCompletedVerses: true,
    showTypingStats: false,
    showProgressTags: true,
    lastBookId: 1,
    lastChapter: 1,
    lastVerse: null,
    activeMode: 'type', // 'type' | 'speak' | 'draw'
    meditateMode: false,
    meditateFont: DEFAULT_MEDITATE_FONT,
    meditateFontSize: DEFAULT_MEDITATE_FONT_SIZE,
    meditateFontCase: DEFAULT_MEDITATE_FONT_CASE,
    meditateFontColor: DEFAULT_MEDITATE_FONT_COLOR,
    meditateBoxWidth: DEFAULT_MEDITATE_BOX_WIDTH,
    meditatePalette: [
      '#38BDF8',
      '#3B82F6',
      '#22C55E',
      '#EAB308',
      '#F97316',
      '#EC4899',
      '#A855F7',
      '#B45309',
      '#64748B',
      '#FFFFFF'
    ],
    drawings: {}, // { "1:1:1": DrawingRecord }
    meditations: {}, // legacy alias synced with drawings
    favorites: {}, // { "1:1:1": FavoriteRecord }
    bookmarks: {}, // { [id]: BookmarkRecord }
    chapters: {}, // { "1:1": CompletedChapterRecord }
    sessions: [], // TypingSession[] (sorted newest first)
    unsyncedSessionIds: []
  };
}

export function getLocalStore() {
  const raw = localStorage.getItem(LOCAL_DATA_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const mergedDrawings = {
          ...((parsed.meditations && typeof parsed.meditations === 'object') ? parsed.meditations : {}),
          ...((parsed.drawings && typeof parsed.drawings === 'object') ? parsed.drawings : {})
        };
        const resolvedActiveMode = ['type', 'speak', 'draw'].includes(parsed.activeMode)
          ? parsed.activeMode
          : (parsed.meditateMode ? 'draw' : 'type');
        const store = {
          ...createDefaultStore(),
          ...parsed,
          activeMode: resolvedActiveMode,
          meditateMode: resolvedActiveMode === 'draw',
          singleVerseMode: parsed.singleVerseMode !== undefined ? Boolean(parsed.singleVerseMode) : true,
          shuffleVerses: parsed.shuffleVerses !== undefined ? Boolean(parsed.shuffleVerses) : true,
          skipCompletedVerses: parsed.skipCompletedVerses !== false,
          drawings: mergedDrawings,
          meditations: mergedDrawings,
          favorites: (parsed.favorites && typeof parsed.favorites === 'object') ? parsed.favorites : {},
          bookmarks: (parsed.bookmarks && typeof parsed.bookmarks === 'object') ? parsed.bookmarks : {},
          chapters: parsed.chapters || {},
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          unsyncedSessionIds: Array.isArray(parsed.unsyncedSessionIds) ? parsed.unsyncedSessionIds : []
        };
        if (!store.meditateFont || store.meditateFont.includes('Playfair')) {
          store.meditateFont = DEFAULT_MEDITATE_FONT;
        }
        return store;
      }
    } catch (e) {}
  }
  const def = createDefaultStore();
  saveLocalStore(def);
  return def;
}

export function saveLocalStore(store) {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('bible:stats-updated'));
}

export function getPreferredTranslation() {
  const store = getLocalStore();
  return store.preferredTranslation || 'ESV';
}

export function syncPreferencesToCloud() {
  if (!Auth.isAuthenticated() || !CONFIG.API_ENDPOINTS.profile) return;
  const store = getLocalStore();
  const combinedDrawings = { ...(store.meditations || {}), ...(store.drawings || {}) };
  const deletedDrawings = Array.from(new Set([
    ...(store.deletedMeditationKeys || []),
    ...(store.deletedDrawingKeys || [])
  ]));
  fetchWithAuth(CONFIG.API_ENDPOINTS.profile, {
    method: 'POST',
    body: JSON.stringify({
      preferredTranslation: store.preferredTranslation || 'ESV',
      singleVerseMode: Boolean(store.singleVerseMode),
      autoAdvance: Boolean(store.autoAdvance),
      advanceButton: store.advanceButton !== undefined ? Boolean(store.advanceButton) : true,
      skipCompletedVerses: store.skipCompletedVerses !== false,
      showTypingStats: Boolean(store.showTypingStats),
      showProgressTags: store.showProgressTags !== false,
      shuffleVerses: Boolean(store.shuffleVerses),
      shuffleScope: store.shuffleScope || 'bible',
      activeMode: store.activeMode || (store.meditateMode ? 'draw' : 'type'),
      meditateMode: Boolean(store.meditateMode),
      meditatePalette: Array.isArray(store.meditatePalette) ? store.meditatePalette : DEFAULT_MEDITATE_PALETTE,
      meditateFont: store.meditateFont || DEFAULT_MEDITATE_FONT,
      meditateFontSize: store.meditateFontSize || DEFAULT_MEDITATE_FONT_SIZE,
      meditateFontCase: store.meditateFontCase || DEFAULT_MEDITATE_FONT_CASE,
      meditateFontColor: store.meditateFontColor || DEFAULT_MEDITATE_FONT_COLOR,
      meditateBoxWidth: store.meditateBoxWidth || DEFAULT_MEDITATE_BOX_WIDTH,
      drawings: combinedDrawings,
      meditations: combinedDrawings,
      favorites: store.favorites || {},
      bookmarks: store.bookmarks || {},
      deletedDrawingKeys: deletedDrawings,
      deletedMeditationKeys: deletedDrawings,
      deletedFavoriteKeys: store.deletedFavoriteKeys || [],
      deletedBookmarkIds: store.deletedBookmarkIds || []
    })
  }).then(() => {
    const fresh = getLocalStore();
    if (fresh.deletedDrawingKeys?.length || fresh.deletedMeditationKeys?.length || fresh.deletedFavoriteKeys?.length || fresh.deletedBookmarkIds?.length) {
      delete fresh.deletedDrawingKeys;
      delete fresh.deletedMeditationKeys;
      delete fresh.deletedFavoriteKeys;
      delete fresh.deletedBookmarkIds;
      saveLocalStore(fresh);
    }
  }).catch(() => {});
}

export function setPreferredTranslation(translationCode) {
  const code = String(translationCode || 'ESV').toUpperCase();
  const store = getLocalStore();
  store.preferredTranslation = code;
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getSkipCompletedVersesPref() {
  const store = getLocalStore();
  return store.skipCompletedVerses !== false;
}

export function setSkipCompletedVersesPref(skip) {
  const store = getLocalStore();
  store.skipCompletedVerses = Boolean(skip);
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getShowTypingStatsPref() {
  const store = getLocalStore();
  return Boolean(store.showTypingStats);
}

export function setShowTypingStatsPref(show) {
  const store = getLocalStore();
  store.showTypingStats = Boolean(show);
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getShowProgressTagsPref() {
  const store = getLocalStore();
  if (store.showProgressTags === undefined) return true;
  return Boolean(store.showProgressTags);
}

export function setShowProgressTagsPref(show) {
  const store = getLocalStore();
  store.showProgressTags = Boolean(show);
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getSingleVerseModePref() {
  const store = getLocalStore();
  if (store.singleVerseMode === undefined) return true;
  return Boolean(store.singleVerseMode);
}

export function setSingleVerseModePref(enabled) {
  const store = getLocalStore();
  store.singleVerseMode = Boolean(enabled);
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getAutoAdvancePref() {
  const store = getLocalStore();
  if (store.autoAdvance !== undefined) {
    return Boolean(store.autoAdvance);
  }
  if (store.advanceButton !== undefined) {
    return !store.advanceButton;
  }
  if (store.skipCelebrationModal !== undefined) {
    return Boolean(store.skipCelebrationModal);
  }
  return false;
}

export function setAutoAdvancePref(autoAdvance) {
  const store = getLocalStore();
  const val = Boolean(autoAdvance);
  store.autoAdvance = val;
  store.advanceButton = !val;
  store.skipCelebrationModal = val;
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getSkipCelebrationModalPref() {
  return getAutoAdvancePref();
}

export function setSkipCelebrationModalPref(skip) {
  setAutoAdvancePref(skip);
}

export function getShuffleVersesPref() {
  const store = getLocalStore();
  if (store.shuffleVerses === undefined) return true;
  return Boolean(store.shuffleVerses);
}

export function setShuffleVersesPref(shuffle) {
  const store = getLocalStore();
  store.shuffleVerses = Boolean(shuffle);
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getShuffleScopePref() {
  const store = getLocalStore();
  return store.shuffleScope || 'bible';
}

export function setShuffleScopePref(scope) {
  const store = getLocalStore();
  store.shuffleScope = scope === 'chapter' ? 'chapter' : 'bible';
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getAdvanceButtonPref() {
  const store = getLocalStore();
  if (store.advanceButton === undefined) {
    return true; // default on
  }
  return Boolean(store.advanceButton);
}

export function setAdvanceButtonPref(advance) {
  const store = getLocalStore();
  store.advanceButton = Boolean(advance);
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export const DEFAULT_MEDITATE_PALETTE = [
  '#38BDF8', // Sky Blue
  '#3B82F6', // Royal Blue
  '#22C55E', // Meadow Green
  '#EAB308', // Sun Gold
  '#F97316', // Sunset Orange
  '#EC4899', // Blossom Pink
  '#A855F7', // Lilac Purple
  '#B45309', // Warm Earth
  '#64748B', // Slate Grey
  '#FFFFFF'  // Eraser / White
];

export function getActiveModePref() {
  const store = getLocalStore();
  if (['type', 'speak', 'draw'].includes(store.activeMode)) {
    return store.activeMode;
  }
  return store.meditateMode ? 'draw' : 'type';
}

export function setActiveModePref(mode) {
  const cleanMode = ['type', 'speak', 'draw'].includes(mode) ? mode : 'type';
  const store = getLocalStore();
  store.activeMode = cleanMode;
  store.meditateMode = cleanMode === 'draw';
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:mode-changed', { detail: { mode: cleanMode } }));
}

export function getMeditateModePref() {
  return getActiveModePref() === 'draw';
}

export function setMeditateModePref(enabled) {
  setActiveModePref(enabled ? 'draw' : 'type');
}

export function getSpeakStrictnessPref() {
  const store = getLocalStore();
  if (['lenient', 'standard', 'strict'].includes(store.speakStrictness)) {
    return store.speakStrictness;
  }
  return 'lenient';
}

export function setSpeakStrictnessPref(strictness) {
  const clean = ['lenient', 'standard', 'strict'].includes(strictness) ? strictness : 'lenient';
  const store = getLocalStore();
  store.speakStrictness = clean;
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getSpeakTrackingModePref() {
  const store = getLocalStore();
  if (['realtime', 'phrase'].includes(store.speakTrackingMode)) {
    return store.speakTrackingMode;
  }
  return 'realtime';
}

export function setSpeakTrackingModePref(mode) {
  const clean = ['realtime', 'phrase'].includes(mode) ? mode : 'realtime';
  const store = getLocalStore();
  store.speakTrackingMode = clean;
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getMeditatePalettePref() {
  const store = getLocalStore();
  if (Array.isArray(store.meditatePalette) && store.meditatePalette.length === 10) {
    return store.meditatePalette;
  }
  return [...DEFAULT_MEDITATE_PALETTE];
}

export function setMeditatePalettePref(palette) {
  const store = getLocalStore();
  if (Array.isArray(palette) && palette.length === 10) {
    store.meditatePalette = palette;
    saveLocalStore(store);
    syncPreferencesToCloud();
  }
}

export function getMeditateFontPref() {
  const store = getLocalStore();
  if (!store.meditateFont || store.meditateFont.includes('Playfair')) {
    store.meditateFont = DEFAULT_MEDITATE_FONT;
    saveLocalStore(store);
  }
  return store.meditateFont || DEFAULT_MEDITATE_FONT;
}

export function setMeditateFontPref(font) {
  const store = getLocalStore();
  store.meditateFont = String(font || DEFAULT_MEDITATE_FONT);
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getMeditateFontSizePref() {
  const store = getLocalStore();
  return typeof store.meditateFontSize === 'number' ? store.meditateFontSize : DEFAULT_MEDITATE_FONT_SIZE;
}

export function setMeditateFontSizePref(size) {
  const store = getLocalStore();
  store.meditateFontSize = Math.max(12, Math.min(48, Number(size) || DEFAULT_MEDITATE_FONT_SIZE));
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getMeditateFontCasePref() {
  const store = getLocalStore();
  const val = store.meditateFontCase;
  return val === 'uppercase' ? 'uppercase' : 'none';
}

export function setMeditateFontCasePref(fontCase) {
  const store = getLocalStore();
  store.meditateFontCase = fontCase === 'uppercase' ? 'uppercase' : 'none';
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getMeditateFontColorPref() {
  const store = getLocalStore();
  return typeof store.meditateFontColor === 'string' ? store.meditateFontColor : DEFAULT_MEDITATE_FONT_COLOR;
}

export function setMeditateFontColorPref(color) {
  const store = getLocalStore();
  store.meditateFontColor = String(color || '');
  saveLocalStore(store);
  syncPreferencesToCloud();
}

export function getMeditateBoxWidthPref() {
  const store = getLocalStore();
  return typeof store.meditateBoxWidth === 'number' ? store.meditateBoxWidth : DEFAULT_MEDITATE_BOX_WIDTH;
}

export function setMeditateBoxWidthPref(width) {
  const store = getLocalStore();
  store.meditateBoxWidth = Math.max(160, Math.min(900, Number(width) || DEFAULT_MEDITATE_BOX_WIDTH));
  saveLocalStore(store);
  syncPreferencesToCloud();
}

// ── Scripture Drawings (Saved Color-by-Numbers Artworks) ─────
export function saveVerseDrawing({
  bookId,
  chapter,
  verse,
  verseRef,
  verseText,
  translation,
  templateIdx,
  fills,
  fontFamily,
  fontSize,
  fontCase,
  fontColor,
  boxWidth,
  textX,
  textY
}) {
  const store = getLocalStore();
  if (!store.drawings || typeof store.drawings !== 'object') {
    store.drawings = {};
  }
  if (!store.meditations || typeof store.meditations !== 'object') {
    store.meditations = {};
  }
  const key = `${bookId}:${chapter}:${verse}`;
  const existing = store.drawings[key] || store.meditations[key] || {};
  const mergedFills = { ...(existing.fills || {}), ...(fills || {}) };

  const determinedCase = fontCase !== undefined
    ? (fontCase === 'uppercase' ? 'uppercase' : 'none')
    : (existing.fontCase === 'uppercase' ? 'uppercase' : 'none');

  const determinedColor = typeof fontColor === 'string'
    ? fontColor
    : (typeof existing.fontColor === 'string' ? existing.fontColor : (DEFAULT_MEDITATE_FONT_COLOR || ''));

  const record = {
    key,
    bookId: Number(bookId),
    chapter: Number(chapter),
    verse: Number(verse),
    verseRef: String(verseRef || ''),
    verseText: String(verseText || ''),
    translation: String(translation || 'ESV'),
    templateIdx: Number(templateIdx || 0),
    fills: mergedFills,
    fontFamily: fontFamily || existing.fontFamily || DEFAULT_MEDITATE_FONT,
    fontSize: typeof fontSize === 'number' ? fontSize : (typeof existing.fontSize === 'number' ? existing.fontSize : DEFAULT_MEDITATE_FONT_SIZE),
    fontCase: determinedCase,
    fontColor: determinedColor,
    boxWidth: typeof boxWidth === 'number' ? boxWidth : (typeof existing.boxWidth === 'number' ? existing.boxWidth : DEFAULT_MEDITATE_BOX_WIDTH),
    textX: typeof textX === 'number' ? textX : (typeof existing.textX === 'number' ? existing.textX : 50),
    textY: typeof textY === 'number' ? textY : (typeof existing.textY === 'number' ? existing.textY : 76),
    updatedAt: new Date().toISOString()
  };
  store.drawings[key] = record;
  store.meditations[key] = record;
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:drawings-updated', { detail: { record } }));
  window.dispatchEvent(new CustomEvent('bible:meditations-updated', { detail: { record } }));
  return record;
}

export function getVerseDrawing(bookId, chapter, verse) {
  const store = getLocalStore();
  const key = `${bookId}:${chapter}:${verse}`;
  const med = store.drawings?.[key] || store.meditations?.[key] || null;
  if (!med) return null;
  if (!med.fontFamily || med.fontFamily.includes('Playfair')) {
    med.fontFamily = DEFAULT_MEDITATE_FONT;
  }
  return med;
}

export function getAllDrawings() {
  const store = getLocalStore();
  const combined = { ...(store.meditations || {}), ...(store.drawings || {}) };
  const list = Object.values(combined);
  return list
    .filter(m => m && m.fills && typeof m.fills === 'object' && Object.keys(m.fills).length > 0)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function deleteVerseDrawing(bookId, chapter, verse) {
  const store = getLocalStore();
  const key = `${bookId}:${chapter}:${verse}`;
  const hadDrawing = Boolean((store.drawings && store.drawings[key]) || (store.meditations && store.meditations[key]));
  if (hadDrawing) {
    if (store.drawings) delete store.drawings[key];
    if (store.meditations) delete store.meditations[key];
    if (!store.deletedDrawingKeys) store.deletedDrawingKeys = [];
    if (!store.deletedDrawingKeys.includes(key)) store.deletedDrawingKeys.push(key);
    if (!store.deletedMeditationKeys) store.deletedMeditationKeys = [];
    if (!store.deletedMeditationKeys.includes(key)) store.deletedMeditationKeys.push(key);
    saveLocalStore(store);
    syncPreferencesToCloud();
    window.dispatchEvent(new CustomEvent('bible:drawings-updated', { detail: { key, deleted: true } }));
    window.dispatchEvent(new CustomEvent('bible:meditations-updated', { detail: { key, deleted: true } }));
  }
}

// Backward-compatible aliases
export const saveVerseMeditation = saveVerseDrawing;
export const getVerseMeditation = getVerseDrawing;
export const getAllMeditations = getAllDrawings;
export const deleteVerseMeditation = deleteVerseDrawing;

// ── Favorited Scripture Verses ─────────────────────────────────
export function saveVerseFavorite({ bookId, chapter, verse, verseRef, verseText, translation, comment }) {
  const store = getLocalStore();
  if (!store.favorites || typeof store.favorites !== 'object') {
    store.favorites = {};
  }
  const key = `${bookId}:${chapter}:${verse}`;
  const existing = store.favorites[key] || {};
  const record = {
    key,
    bookId: Number(bookId),
    chapter: Number(chapter),
    verse: Number(verse),
    verseRef: String(verseRef || existing.verseRef || ''),
    verseText: String(verseText || existing.verseText || ''),
    translation: String(translation || existing.translation || 'ESV'),
    addedAt: existing.addedAt || new Date().toISOString(),
    comment: typeof comment === 'string' ? comment.trim() : (existing.comment || ''),
    commentUpdatedAt: existing.commentUpdatedAt || null
  };
  store.favorites[key] = record;
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:favorites-updated', { detail: { record, isFavorited: true } }));
  return record;
}

export function updateFavoriteComment(bookId, chapter, verse, comment) {
  const store = getLocalStore();
  const key = `${bookId}:${chapter}:${verse}`;
  if (!store.favorites || !store.favorites[key]) {
    return null;
  }
  const cleanComment = typeof comment === 'string' ? comment.trim() : '';
  store.favorites[key].comment = cleanComment;
  store.favorites[key].commentUpdatedAt = cleanComment ? new Date().toISOString() : null;
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:favorites-updated', { detail: { record: store.favorites[key], isFavorited: true } }));
  return store.favorites[key];
}

export function removeVerseFavorite(bookId, chapter, verse) {
  const store = getLocalStore();
  const key = `${bookId}:${chapter}:${verse}`;
  if (store.favorites && store.favorites[key]) {
    delete store.favorites[key];
    if (!store.deletedFavoriteKeys) store.deletedFavoriteKeys = [];
    if (!store.deletedFavoriteKeys.includes(key)) store.deletedFavoriteKeys.push(key);
    saveLocalStore(store);
    syncPreferencesToCloud();
    window.dispatchEvent(new CustomEvent('bible:favorites-updated', { detail: { key, isFavorited: false } }));
    return true;
  }
  return false;
}

export function toggleVerseFavorite({ bookId, chapter, verse, verseRef, verseText, translation }) {
  const key = `${bookId}:${chapter}:${verse}`;
  const store = getLocalStore();
  if (store.favorites && store.favorites[key]) {
    removeVerseFavorite(bookId, chapter, verse);
    return false;
  } else {
    saveVerseFavorite({ bookId, chapter, verse, verseRef, verseText, translation });
    return true;
  }
}

export function isVerseFavorited(bookId, chapter, verse) {
  const store = getLocalStore();
  const key = `${bookId}:${chapter}:${verse}`;
  return Boolean(store.favorites && store.favorites[key]);
}

export function getAllFavorites() {
  const store = getLocalStore();
  const list = Object.values(store.favorites || {});
  return list.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
}

// ── Scripture Bookmarks ─────────────────────────────────────────
export function getAllBookmarks() {
  const store = getLocalStore();
  const list = Object.values(store.bookmarks || {});
  return list.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
}

export function getRecentBookmarks(limit = 5) {
  return getAllBookmarks().slice(0, limit);
}

export function getBookmarkById(id) {
  const store = getLocalStore();
  return (store.bookmarks && store.bookmarks[id]) || null;
}

export function findBookmarkByName(name) {
  if (!name || typeof name !== 'string') return null;
  const cleanName = name.trim().toLowerCase();
  const bookmarks = getAllBookmarks();
  return bookmarks.find(b => (b.name || '').trim().toLowerCase() === cleanName) || null;
}

export function isVerseBookmarked(bookId, chapter, verse) {
  const bookmarks = getAllBookmarks();
  const bId = Number(bookId);
  const ch = Number(chapter);
  const vr = verse !== null && verse !== undefined ? Number(verse) : null;
  return bookmarks.some(b => b.bookId === bId && b.chapter === ch && (vr === null || b.verse === vr));
}

export function getBookmarksForVerse(bookId, chapter, verse) {
  const bookmarks = getAllBookmarks();
  const bId = Number(bookId);
  const ch = Number(chapter);
  const vr = verse !== null && verse !== undefined ? Number(verse) : null;
  return bookmarks.filter(b => b.bookId === bId && b.chapter === ch && (vr === null || b.verse === vr));
}

export function createBookmark({ name, bookId, chapter, verse, verseRef, verseText, translation }) {
  const store = getLocalStore();
  if (!store.bookmarks || typeof store.bookmarks !== 'object') {
    store.bookmarks = {};
  }
  const id = 'bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const now = new Date().toISOString();
  const cleanName = String(name || '').trim() || 'Bookmark';
  const record = {
    id,
    name: cleanName,
    bookId: Number(bookId),
    chapter: Number(chapter),
    verse: verse !== null && verse !== undefined ? Number(verse) : null,
    verseRef: String(verseRef || ''),
    verseText: String(verseText || ''),
    translation: String(translation || 'ESV'),
    createdAt: now,
    updatedAt: now,
    history: []
  };
  store.bookmarks[id] = record;
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:bookmarks-updated', { detail: { record, action: 'create' } }));
  return record;
}

export function updateBookmarkLocation(id, { bookId, chapter, verse, verseRef, verseText, translation }) {
  const store = getLocalStore();
  if (!store.bookmarks || !store.bookmarks[id]) return null;
  const bm = store.bookmarks[id];
  const newBookId = Number(bookId);
  const newChapter = Number(chapter);
  const newVerse = verse !== null && verse !== undefined ? Number(verse) : null;

  const isSameLocation = bm.bookId === newBookId && bm.chapter === newChapter && bm.verse === newVerse;
  if (!isSameLocation) {
    if (!Array.isArray(bm.history)) bm.history = [];
    bm.history.unshift({
      bookId: bm.bookId,
      chapter: bm.chapter,
      verse: bm.verse,
      verseRef: bm.verseRef || '',
      verseText: bm.verseText || '',
      translation: bm.translation || 'ESV',
      timestamp: bm.updatedAt || bm.createdAt || new Date().toISOString()
    });
    if (bm.history.length > 50) bm.history.pop();
  }

  bm.bookId = newBookId;
  bm.chapter = newChapter;
  bm.verse = newVerse;
  if (verseRef) bm.verseRef = String(verseRef);
  if (verseText) bm.verseText = String(verseText);
  if (translation) bm.translation = String(translation);
  bm.updatedAt = new Date().toISOString();

  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:bookmarks-updated', { detail: { record: bm, action: 'update_location' } }));
  return bm;
}

export function renameBookmark(id, newName) {
  const store = getLocalStore();
  if (!store.bookmarks || !store.bookmarks[id]) return null;
  const cleanName = String(newName || '').trim();
  if (!cleanName) return null;
  store.bookmarks[id].name = cleanName;
  store.bookmarks[id].updatedAt = new Date().toISOString();
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:bookmarks-updated', { detail: { record: store.bookmarks[id], action: 'rename' } }));
  return store.bookmarks[id];
}

export function deleteBookmark(id) {
  const store = getLocalStore();
  if (!store.bookmarks || !store.bookmarks[id]) return false;
  delete store.bookmarks[id];
  if (!store.deletedBookmarkIds) store.deletedBookmarkIds = [];
  if (!store.deletedBookmarkIds.includes(id)) store.deletedBookmarkIds.push(id);
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:bookmarks-updated', { detail: { id, action: 'delete' } }));
  return true;
}

export function restoreBookmarkHistory(id, historyIndex) {
  const store = getLocalStore();
  if (!store.bookmarks || !store.bookmarks[id]) return null;
  const bm = store.bookmarks[id];
  if (!Array.isArray(bm.history) || !bm.history[historyIndex]) return null;
  const target = bm.history[historyIndex];
  bm.history.splice(historyIndex, 1);
  bm.history.unshift({
    bookId: bm.bookId,
    chapter: bm.chapter,
    verse: bm.verse,
    verseRef: bm.verseRef || '',
    verseText: bm.verseText || '',
    translation: bm.translation || 'ESV',
    timestamp: bm.updatedAt || new Date().toISOString()
  });
  bm.bookId = target.bookId;
  bm.chapter = target.chapter;
  bm.verse = target.verse;
  bm.verseRef = target.verseRef;
  bm.verseText = target.verseText;
  bm.translation = target.translation;
  bm.updatedAt = new Date().toISOString();

  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:bookmarks-updated', { detail: { record: bm, action: 'restore_history' } }));
  return bm;
}

export function deleteBookmarkHistoryEntry(id, historyIndex) {
  const store = getLocalStore();
  if (!store.bookmarks || !store.bookmarks[id]) return null;
  const bm = store.bookmarks[id];
  if (!Array.isArray(bm.history) || !bm.history[historyIndex]) return null;
  bm.history.splice(historyIndex, 1);
  saveLocalStore(store);
  syncPreferencesToCloud();
  window.dispatchEvent(new CustomEvent('bible:bookmarks-updated', { detail: { record: bm, action: 'delete_history_entry' } }));
  return bm;
}

const RANDOM_HISTORY_KEY = 'bible_random_verse_history';
const RANDOM_FORWARD_KEY = 'bible_random_verse_forward';

export function pushRandomVerseHistory(ref) {
  try {
    const list = JSON.parse(sessionStorage.getItem(RANDOM_HISTORY_KEY) || '[]');
    list.push(ref);
    if (list.length > 50) list.shift();
    sessionStorage.setItem(RANDOM_HISTORY_KEY, JSON.stringify(list));
  } catch {}
}

export function popRandomVerseHistory() {
  try {
    const list = JSON.parse(sessionStorage.getItem(RANDOM_HISTORY_KEY) || '[]');
    if (list.length === 0) return null;
    const item = list.pop();
    sessionStorage.setItem(RANDOM_HISTORY_KEY, JSON.stringify(list));
    return item;
  } catch {
    return null;
  }
}

export function pushRandomVerseForward(ref) {
  try {
    const list = JSON.parse(sessionStorage.getItem(RANDOM_FORWARD_KEY) || '[]');
    list.push(ref);
    if (list.length > 50) list.shift();
    sessionStorage.setItem(RANDOM_FORWARD_KEY, JSON.stringify(list));
  } catch {}
}

export function popRandomVerseForward() {
  try {
    const list = JSON.parse(sessionStorage.getItem(RANDOM_FORWARD_KEY) || '[]');
    if (list.length === 0) return null;
    const item = list.pop();
    sessionStorage.setItem(RANDOM_FORWARD_KEY, JSON.stringify(list));
    return item;
  } catch {
    return null;
  }
}

export function clearRandomVerseForward() {
  try {
    sessionStorage.removeItem(RANDOM_FORWARD_KEY);
  } catch {}
}

export function setLastSelectedChapter(bookId, chapter, verse = null) {
  const store = getLocalStore();
  store.lastBookId = Number(bookId) || 1;
  store.lastChapter = Number(chapter) || 1;
  store.lastVerse = verse ? Number(verse) : null;
  saveLocalStore(store);
}

// ── Chapter & Verse Completion Helpers ──────────────────────────
export function isChapterRecordFullyRead(rec) {
  if (!rec) return false;
  if (rec.isFullyRead === true || rec.isRead === true) return true;
  const total = Math.max(Number(rec.totalVerses) || 0, Number(rec.versesCount) || 0);
  if (total <= 0) return false;
  const readCount = Object.values(rec.completedVerses || {}).filter(v => v && v.isRead).length;
  return readCount >= total;
}

export function isChapterRecordFullySpoken(rec) {
  if (!rec) return false;
  if (rec.isFullySpoken === true) return true;
  const total = Math.max(Number(rec.totalVerses) || 0, Number(rec.versesCount) || 0);
  if (total <= 0) return false;
  const spokenCount = Object.values(rec.completedVerses || {}).filter(v => v && v.isSpoken).length;
  return spokenCount >= total;
}

export function isChapterRecordFullyTyped(rec, translationFilter = 'ALL') {
  if (!rec) return false;
  const total = Math.max(Number(rec.totalVerses) || 0, Number(rec.versesCount) || 0);
  if (translationFilter === 'ALL') {
    if (rec.isFullyTyped === true) return true;
    if (rec.isFullyCompleted === true && !rec.isFullyRead && rec.isRead !== true && !rec.isFullySpoken && rec.isSpoken !== true) return true;
    const typedCount = Object.values(rec.completedVerses || {}).filter(v =>
      v && v.isTyped !== false && (v.isTyped === true || (!v.isRead && !v.isSpoken && ((v.count || 0) > 0 || (v.bestWpm || 0) > 0)))
    ).length;
    if (total > 0 && typedCount >= total) return true;
    if (typedCount === 0 && (rec.completedCount || 0) > 0 && rec.isRead !== true && rec.isSpoken !== true) return true;
    return false;
  }
  const trStat = rec.translations?.[translationFilter];
  if (!trStat) return false;
  if (trStat.isFullyCompleted) return true;
  const trVerses = Array.isArray(trStat.completedVerses) ? trStat.completedVerses.length : 0;
  if (total > 0 && trVerses >= total) return true;
  if ((!rec.completedVerses || Object.keys(rec.completedVerses).length === 0) && (trStat.count || 0) > 0) return true;
  return false;
}

export function isChapterRecordFullyCompleted(rec) {
  if (!rec) return false;
  if (rec.isFullyCompleted === true) return true;
  if (isChapterRecordFullyRead(rec)) return true;
  if (isChapterRecordFullyTyped(rec)) return true;
  if (isChapterRecordFullySpoken(rec)) return true;
  const total = Math.max(Number(rec.totalVerses) || 0, Number(rec.versesCount) || 0);
  const coveredCount = Object.keys(rec.completedVerses || {}).length;
  if (total > 0 && coveredCount >= total) return true;
  if (coveredCount === 0 && (rec.completedCount || 0) > 0) return true;
  return false;
}

export function isVerseRead(rec, verseNum) {
  if (!rec) return false;
  if (rec.isFullyRead === true || rec.isRead === true) return true;
  const vKey = String(verseNum);
  const vRec = rec.completedVerses?.[vKey];
  return Boolean(vRec?.isRead);
}

export function isVerseSpoken(rec, verseNum) {
  if (!rec) return false;
  if (rec.isFullySpoken === true) return true;
  const vKey = String(verseNum);
  const vRec = rec.completedVerses?.[vKey];
  return Boolean(vRec?.isSpoken);
}

export function isVerseTyped(rec, verseNum, translationFilter = 'ALL') {
  if (!rec) return false;
  const vKey = String(verseNum);
  const vRec = rec.completedVerses?.[vKey];
  if (vRec) {
    const hasTyped = vRec.isTyped !== false && (vRec.isTyped === true || (!vRec.isRead && !vRec.isSpoken && ((vRec.count || 0) > 0 || (vRec.bestWpm || 0) > 0)));
    if (!hasTyped) return false;
    if (translationFilter === 'ALL') return true;
    return Boolean(vRec.translations?.[translationFilter]);
  }
  // Legacy full-chapter completion fallback
  if (!rec.completedVerses || Object.keys(rec.completedVerses).length === 0) {
    if ((rec.completedCount || 0) > 0 && rec.isFullyCompleted !== false && rec.isRead !== true && rec.isSpoken !== true) {
      if (translationFilter === 'ALL') return true;
      return Boolean(rec.translations?.[translationFilter]);
    }
  }
  return false;
}

export function isVerseCovered(rec, verseNum, translationFilter = 'ALL') {
  return isVerseRead(rec, verseNum) || isVerseTyped(rec, verseNum, translationFilter) || isVerseSpoken(rec, verseNum);
}

export function isVerseCompletedInRecord(rec, verseNum, translationFilter = 'ALL') {
  return isVerseCovered(rec, verseNum, translationFilter);
}

export function markChapterAsRead(bookId, chapter, translation = 'ESV') {
  const store = getLocalStore();
  const bId = Number(bookId) || 1;
  const book = getBookById(bId);
  const ch = Number(chapter) || 1;
  const key = `${bId}:${ch}`;
  const totalVerses = getChapterVerseCount(bId, ch);
  const now = new Date().toISOString();
  const prevChapter = store.chapters[key] || {};
  const prevVerses = { ...(prevChapter.completedVerses || {}) };

  for (let v = 1; v <= totalVerses; v++) {
    const vKey = String(v);
    const prevV = prevVerses[vKey];
    prevVerses[vKey] = {
      verse: v,
      count: prevV?.count || 0,
      bestWpm: prevV?.bestWpm || 0,
      bestCpm: prevV?.bestCpm || 0,
      bestAccuracy: prevV?.bestAccuracy || 100,
      isRead: true,
      readAt: now,
      isSpoken: Boolean(prevV?.isSpoken),
      spokenAt: prevV?.spokenAt || null,
      isTyped: Boolean(prevV?.isTyped || (!prevV?.isSpoken && ((prevV?.count && prevV.count > 0) || (prevV?.bestWpm && prevV.bestWpm > 0)))),
      translations: prevV?.translations || {},
      firstCompletedAt: prevV?.firstCompletedAt || now,
      lastCompletedAt: prevV?.lastCompletedAt || now
    };
  }

  const isFullyTyped = Boolean(prevChapter.isFullyTyped || (totalVerses > 0 && Object.values(prevVerses).filter(v => v.isTyped).length >= totalVerses));
  const isFullySpoken = Boolean(prevChapter.isFullySpoken || (totalVerses > 0 && Object.values(prevVerses).filter(v => v.isSpoken).length >= totalVerses));

  store.chapters[key] = {
    ...prevChapter,
    chapterKey: key,
    bookId: book.id,
    bookName: book.name,
    chapter: ch,
    totalVerses,
    versesCount: Math.max(prevChapter.versesCount || 0, totalVerses),
    completedVersesCount: Object.keys(prevVerses).length,
    isFullyCompleted: true, // covered
    isFullyRead: true,
    isRead: true,
    readAt: now,
    isFullyTyped,
    isTyped: Boolean(prevChapter.isTyped || isFullyTyped || (prevChapter.completedCount && prevChapter.completedCount > 0)),
    isFullySpoken,
    isSpoken: Boolean(prevChapter.isSpoken || isFullySpoken),
    completedVerses: prevVerses,
    firstCompletedAt: prevChapter.firstCompletedAt || now,
    lastCompletedAt: now
  };

  saveLocalStore(store);

  // Sync to cloud if authenticated
  if (Auth.isAuthenticated() && CONFIG.API_ENDPOINTS.progress) {
    const sessionObj = {
      sessionId: `read_ch_${bId}_${ch}_${Date.now()}`,
      activityType: 'read',
      bookId: book.id,
      bookName: book.name,
      chapter: ch,
      verseNumber: null,
      completedVerseNumbers: Array.from({ length: totalVerses }, (_, i) => i + 1),
      totalChapterVerses: totalVerses,
      isFullChapter: true,
      translation: String(translation || store.preferredTranslation || 'ESV').toUpperCase(),
      wpm: 0,
      cpm: 0,
      accuracy: 100,
      charsTyped: 0,
      wordsTyped: 0,
      versesTyped: totalVerses,
      verseRange: `1-${totalVerses}`,
      mistakes: 0,
      durationMs: 0,
      completedAt: now
    };
    fetchWithAuth(CONFIG.API_ENDPOINTS.progress, {
      method: 'POST',
      body: JSON.stringify({ session: sessionObj })
    }).catch(() => {});
  }

  return store.chapters[key];
}

export function unmarkChapterAsRead(bookId, chapter) {
  const store = getLocalStore();
  const bId = Number(bookId) || 1;
  const ch = Number(chapter) || 1;
  const key = `${bId}:${ch}`;
  const rec = store.chapters[key];
  if (!rec) return null;

  const prevVerses = { ...(rec.completedVerses || {}) };
  for (const [vKey, vObj] of Object.entries(prevVerses)) {
    if (vObj && (vObj.isTyped || vObj.isSpoken)) {
      prevVerses[vKey] = { ...vObj, isRead: false, readAt: null };
    } else {
      delete prevVerses[vKey];
    }
  }

  const typedVersesCount = Object.values(prevVerses).filter(v => v.isTyped).length;
  const spokenVersesCount = Object.values(prevVerses).filter(v => v.isSpoken).length;
  const totalVerses = rec.totalVerses || getChapterVerseCount(bId, ch);
  const isFullyTyped = Boolean(rec.isFullyTyped || (totalVerses > 0 && typedVersesCount >= totalVerses));
  const isFullySpoken = Boolean(rec.isFullySpoken || (totalVerses > 0 && spokenVersesCount >= totalVerses));

  store.chapters[key] = {
    ...rec,
    isRead: false,
    isFullyRead: false,
    readAt: null,
    isFullyCompleted: Boolean(isFullyTyped || isFullySpoken || (totalVerses > 0 && Object.keys(prevVerses).length >= totalVerses)),
    completedVerses: prevVerses,
    completedVersesCount: Object.keys(prevVerses).length
  };

  saveLocalStore(store);
  return store.chapters[key];
}

export function toggleChapterRead(bookId, chapter, translation = 'ESV') {
  const sum = getChapterProgressSummary(bookId, chapter);
  if (sum.isFullyRead) {
    unmarkChapterAsRead(bookId, chapter);
    return false;
  } else {
    markChapterAsRead(bookId, chapter, translation);
    return true;
  }
}

export function markVerseAsRead(bookId, chapter, verse, translation = 'ESV') {
  const store = getLocalStore();
  const bId = Number(bookId) || 1;
  const book = getBookById(bId);
  const ch = Number(chapter) || 1;
  const vNum = Number(verse) || 1;
  const key = `${bId}:${ch}`;
  const totalVerses = getChapterVerseCount(bId, ch);
  const now = new Date().toISOString();
  const prevChapter = store.chapters[key] || {};
  const prevVerses = { ...(prevChapter.completedVerses || {}) };
  const prevV = prevVerses[String(vNum)];

  prevVerses[String(vNum)] = {
    verse: vNum,
    count: prevV?.count || 0,
    bestWpm: prevV?.bestWpm || 0,
    bestCpm: prevV?.bestCpm || 0,
    bestAccuracy: prevV?.bestAccuracy || 100,
    isRead: true,
    readAt: now,
    isSpoken: Boolean(prevV?.isSpoken),
    spokenAt: prevV?.spokenAt || null,
    isTyped: Boolean(prevV?.isTyped || (!prevV?.isSpoken && ((prevV?.count && prevV.count > 0) || (prevV?.bestWpm && prevV.bestWpm > 0)))),
    translations: prevV?.translations || {},
    firstCompletedAt: prevV?.firstCompletedAt || now,
    lastCompletedAt: prevV?.lastCompletedAt || now
  };

  const readVersesCount = Object.values(prevVerses).filter(v => v.isRead).length;
  const isFullyRead = totalVerses > 0 && readVersesCount >= totalVerses;
  const typedVersesCount = Object.values(prevVerses).filter(v => v.isTyped).length;
  const isFullyTyped = Boolean(prevChapter.isFullyTyped || (totalVerses > 0 && typedVersesCount >= totalVerses));
  const spokenVersesCount = Object.values(prevVerses).filter(v => v.isSpoken).length;
  const isFullySpoken = Boolean(prevChapter.isFullySpoken || (totalVerses > 0 && spokenVersesCount >= totalVerses));
  const isFullyCompleted = Boolean(isFullyRead || isFullyTyped || isFullySpoken || (totalVerses > 0 && Object.keys(prevVerses).length >= totalVerses));

  store.chapters[key] = {
    ...prevChapter,
    chapterKey: key,
    bookId: book.id,
    bookName: book.name,
    chapter: ch,
    totalVerses,
    versesCount: Math.max(prevChapter.versesCount || 0, totalVerses),
    completedVersesCount: Object.keys(prevVerses).length,
    isFullyCompleted,
    isFullyRead,
    isRead: Boolean(prevChapter.isRead || isFullyRead),
    readAt: isFullyRead ? now : prevChapter.readAt,
    isFullyTyped,
    isTyped: Boolean(prevChapter.isTyped || typedVersesCount > 0),
    isFullySpoken,
    isSpoken: Boolean(prevChapter.isSpoken || spokenVersesCount > 0),
    completedVerses: prevVerses,
    firstCompletedAt: prevChapter.firstCompletedAt || now,
    lastCompletedAt: now
  };

  saveLocalStore(store);

  // Sync to cloud if authenticated
  if (Auth.isAuthenticated() && CONFIG.API_ENDPOINTS.progress) {
    const sessionObj = {
      sessionId: `read_v_${bId}_${ch}_${vNum}_${Date.now()}`,
      activityType: 'read',
      bookId: book.id,
      bookName: book.name,
      chapter: ch,
      verseNumber: vNum,
      completedVerseNumbers: [vNum],
      totalChapterVerses: totalVerses,
      isFullChapter: isFullyRead,
      translation: String(translation || store.preferredTranslation || 'ESV').toUpperCase(),
      wpm: 0,
      cpm: 0,
      accuracy: 100,
      charsTyped: 0,
      wordsTyped: 0,
      versesTyped: 1,
      verseRange: String(vNum),
      mistakes: 0,
      durationMs: 0,
      completedAt: now
    };
    fetchWithAuth(CONFIG.API_ENDPOINTS.progress, {
      method: 'POST',
      body: JSON.stringify({ session: sessionObj })
    }).catch(() => {});
  }

  return store.chapters[key];
}

export function unmarkVerseAsRead(bookId, chapter, verse) {
  const store = getLocalStore();
  const bId = Number(bookId) || 1;
  const ch = Number(chapter) || 1;
  const vNum = Number(verse) || 1;
  const key = `${bId}:${ch}`;
  const rec = store.chapters[key];
  if (!rec) return null;

  const prevVerses = { ...(rec.completedVerses || {}) };
  const vKey = String(vNum);
  const prevV = prevVerses[vKey];
  if (!prevV) return rec;

  if (prevV.isTyped || prevV.isSpoken) {
    prevVerses[vKey] = { ...prevV, isRead: false, readAt: null };
  } else {
    delete prevVerses[vKey];
  }

  const totalVerses = rec.totalVerses || getChapterVerseCount(bId, ch);
  const readVersesCount = Object.values(prevVerses).filter(v => v.isRead).length;
  const isFullyRead = totalVerses > 0 && readVersesCount >= totalVerses;
  const typedVersesCount = Object.values(prevVerses).filter(v => v.isTyped).length;
  const isFullyTyped = Boolean(rec.isFullyTyped || (totalVerses > 0 && typedVersesCount >= totalVerses));
  const spokenVersesCount = Object.values(prevVerses).filter(v => v.isSpoken).length;
  const isFullySpoken = Boolean(rec.isFullySpoken || (totalVerses > 0 && spokenVersesCount >= totalVerses));
  const isFullyCompleted = Boolean(isFullyRead || isFullyTyped || isFullySpoken || (totalVerses > 0 && Object.keys(prevVerses).length >= totalVerses));

  store.chapters[key] = {
    ...rec,
    isFullyRead,
    isRead: isFullyRead,
    isFullyCompleted,
    completedVerses: prevVerses,
    completedVersesCount: Object.keys(prevVerses).length
  };

  saveLocalStore(store);
  return store.chapters[key];
}

export function toggleVerseRead(bookId, chapter, verse, translation = 'ESV') {
  const sum = getChapterProgressSummary(bookId, chapter);
  const isRead = Boolean(sum.isFullyRead || sum.readVerseNums.includes(Number(verse)));
  if (isRead) {
    unmarkVerseAsRead(bookId, chapter, verse);
    return false;
  } else {
    markVerseAsRead(bookId, chapter, verse, translation);
    return true;
  }
}

export function getChapterProgressSummary(bookId, chapter, translationFilter = 'ALL') {
  const store = getLocalStore();
  const key = `${Number(bookId)}:${Number(chapter)}`;
  const rec = store.chapters?.[key] || null;
  const canonicalTotal = getChapterVerseCount(bookId, chapter);

  if (!rec) {
    return {
      hasAnyProgress: false,
      isFullyCompleted: false, // covered (read, typed, or spoken)
      isFullyRead: false,
      isFullyTyped: false,
      isFullySpoken: false,
      isBoth: false,
      isReadOnly: false,
      isTypedOnly: false,
      isSpokenOnly: false,
      isPartial: false,
      coverageType: 'unseen', // 'both' | 'typed' | 'spoken' | 'read' | 'partial' | 'unseen'
      completedVersesCount: 0, // unique covered count
      readVersesCount: 0,
      typedVersesCount: 0,
      spokenVersesCount: 0,
      totalVerses: canonicalTotal,
      completedVerseNums: [],
      readVerseNums: [],
      typedVerseNums: [],
      spokenVerseNums: [],
      bestWpm: 0,
      bestCpm: 0,
      record: null
    };
  }

  const totalVerses = Math.max(Number(rec.totalVerses) || 0, canonicalTotal) || Number(rec.versesCount) || 0;
  const completedVersesObj = rec.completedVerses || {};

  const readVerseNums = [];
  const typedVerseNums = [];
  const spokenVerseNums = [];

  const allVerseKeys = new Set(Object.keys(completedVersesObj).map(Number).filter(n => n >= 1));
  const isFullyReadCh = isChapterRecordFullyRead(rec);
  const isFullyTypedCh = isChapterRecordFullyTyped(rec, translationFilter);
  const isFullySpokenCh = isChapterRecordFullySpoken(rec);

  if (isFullyReadCh && allVerseKeys.size === 0 && totalVerses > 0) {
    for (let i = 1; i <= totalVerses; i++) readVerseNums.push(i);
  } else {
    for (const [k, v] of Object.entries(completedVersesObj)) {
      const vNum = Number(k);
      if (vNum >= 1 && (v?.isRead || isFullyReadCh)) {
        readVerseNums.push(vNum);
      }
    }
  }

  if (isFullySpokenCh && allVerseKeys.size === 0 && totalVerses > 0) {
    for (let i = 1; i <= totalVerses; i++) spokenVerseNums.push(i);
  } else {
    for (const [k, v] of Object.entries(completedVersesObj)) {
      const vNum = Number(k);
      if (vNum >= 1 && (v?.isSpoken || isFullySpokenCh)) {
        spokenVerseNums.push(vNum);
      }
    }
  }

  if (isFullyTypedCh && allVerseKeys.size === 0 && totalVerses > 0) {
    for (let i = 1; i <= totalVerses; i++) typedVerseNums.push(i);
  } else {
    for (const [k, v] of Object.entries(completedVersesObj)) {
      const vNum = Number(k);
      if (vNum >= 1) {
        const hasTyped = v?.isTyped !== false && (v?.isTyped === true || (!v?.isRead && !v?.isSpoken && ((v?.count || 0) > 0 || (v?.bestWpm || 0) > 0)));
        if (hasTyped) {
          if (translationFilter === 'ALL' || v?.translations?.[translationFilter]) {
            typedVerseNums.push(vNum);
          }
        }
      }
    }
  }

  readVerseNums.sort((a, b) => a - b);
  typedVerseNums.sort((a, b) => a - b);
  spokenVerseNums.sort((a, b) => a - b);

  const coveredSet = new Set([...readVerseNums, ...typedVerseNums, ...spokenVerseNums]);
  const completedVerseNumsSorted = Array.from(coveredSet).sort((a, b) => a - b);

  let isFullyCompleted = false;
  if (translationFilter === 'ALL') {
    isFullyCompleted = isChapterRecordFullyCompleted(rec);
    if (!isFullyCompleted && totalVerses > 0 && coveredSet.size >= totalVerses) {
      isFullyCompleted = true;
    }
  } else {
    isFullyCompleted = isFullyTypedCh || (totalVerses > 0 && typedVerseNums.length >= totalVerses);
  }

  const isFullyRead = isFullyReadCh || (totalVerses > 0 && readVerseNums.length >= totalVerses);
  const isFullyTyped = isFullyTypedCh || (totalVerses > 0 && typedVerseNums.length >= totalVerses);
  const isFullySpoken = isFullySpokenCh || (totalVerses > 0 && spokenVerseNums.length >= totalVerses);

  const fullModesCount = (isFullyRead ? 1 : 0) + (isFullyTyped ? 1 : 0) + (isFullySpoken ? 1 : 0);
  const isBoth = fullModesCount >= 2;
  const isReadOnly = isFullyRead && !isFullyTyped && !isFullySpoken;
  const isTypedOnly = isFullyTyped && !isFullyRead && !isFullySpoken;
  const isSpokenOnly = isFullySpoken && !isFullyRead && !isFullyTyped;

  const completedVersesCount = isFullyCompleted && totalVerses > 0
    ? Math.max(completedVerseNumsSorted.length, totalVerses)
    : completedVerseNumsSorted.length;

  const readVersesCount = isFullyRead && totalVerses > 0
    ? Math.max(readVerseNums.length, totalVerses)
    : readVerseNums.length;

  const typedVersesCount = isFullyTyped && totalVerses > 0
    ? Math.max(typedVerseNums.length, totalVerses)
    : typedVerseNums.length;

  const spokenVersesCount = isFullySpoken && totalVerses > 0
    ? Math.max(spokenVerseNums.length, totalVerses)
    : spokenVerseNums.length;

  const hasAnyProgress = isFullyCompleted || completedVersesCount > 0;
  const isPartial = hasAnyProgress && !isFullyCompleted;

  let coverageType = 'unseen';
  if (isBoth) coverageType = 'both';
  else if (isTypedOnly) coverageType = 'typed';
  else if (isSpokenOnly) coverageType = 'spoken';
  else if (isReadOnly) coverageType = 'read';
  else if (isPartial) coverageType = 'partial';

  return {
    hasAnyProgress,
    isFullyCompleted, // covered (read, typed, or spoken)
    isFullyRead,
    isFullyTyped,
    isFullySpoken,
    isBoth,
    isReadOnly,
    isTypedOnly,
    isSpokenOnly,
    isPartial,
    coverageType,
    completedVersesCount,
    readVersesCount,
    typedVersesCount,
    spokenVersesCount,
    totalVerses,
    completedVerseNums: completedVerseNumsSorted,
    readVerseNums,
    typedVerseNums,
    spokenVerseNums,
    bestWpm: rec.bestWpm || 0,
    bestCpm: rec.bestCpm || 0,
    record: rec
  };
}

function formatVerseNumbersRange(verseNums) {
  if (!Array.isArray(verseNums) || verseNums.length === 0) return '1';
  const sorted = Array.from(new Set(verseNums.map(Number).filter(n => n >= 1))).sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  // Group consecutive runs (e.g. "1-3, 5, 7-9")
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) {
      prev = sorted[i];
    } else {
      ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}

function applySessionToChapterRecord(prevChapter, session, totalChapterVerses = 0) {
  const bookId = Number(session.bookId) || 1;
  const book = getBookById(bookId);
  const chapter = Number(session.chapter) || 1;
  const chapterKey = `${book.id}:${chapter}`;
  const translation = String(session.translation || 'ESV').toUpperCase();
  const isReadActivity = session.activityType === 'read';
  const isSpokenActivity = session.activityType === 'spoken';
  const isTypedActivity = !isReadActivity && !isSpokenActivity;
  const wpm = isTypedActivity ? (Number(session.wpm) || 0) : 0;
  const cpm = isTypedActivity ? (Number(session.cpm) || 0) : 0;
  const accuracy = Number(session.accuracy) ?? 100;
  const completedAt = session.completedAt || new Date().toISOString();

  const verseNumbers = Array.isArray(session.completedVerseNumbers) && session.completedVerseNumbers.length > 0
    ? session.completedVerseNumbers.map(Number).filter(n => n >= 1)
    : (session.verseNumber ? [Number(session.verseNumber)] : []);

  const prevCompletedVerses = { ...(prevChapter?.completedVerses || {}) };
  for (const vNum of verseNumbers) {
    const vKey = String(vNum);
    const prevV = prevCompletedVerses[vKey];
    const prevVTr = prevV?.translations?.[translation];
    const vs = session.verseStats?.[vKey];
    const vWpm = isTypedActivity ? (vs ? Number(vs.wpm) || 0 : wpm) : 0;
    const vCpm = isTypedActivity ? (vs ? Number(vs.cpm) || 0 : cpm) : 0;
    const vAcc = vs ? Number(vs.accuracy) || 100 : accuracy;
    prevCompletedVerses[vKey] = {
      verse: vNum,
      count: (prevV?.count || 0) + 1,
      isTyped: Boolean(prevV?.isTyped || isTypedActivity),
      isRead: Boolean(prevV?.isRead || isReadActivity),
      isSpoken: Boolean(prevV?.isSpoken || isSpokenActivity),
      readAt: isReadActivity ? completedAt : (prevV?.readAt || null),
      spokenAt: isSpokenActivity ? completedAt : (prevV?.spokenAt || null),
      bestWpm: Math.max(prevV?.bestWpm || 0, vWpm),
      bestCpm: Math.max(prevV?.bestCpm || 0, vCpm),
      bestAccuracy: Math.max(prevV?.bestAccuracy || 0, vAcc),
      translations: {
        ...(prevV?.translations || {}),
        [translation]: {
          count: (prevVTr?.count || 0) + 1,
          bestWpm: Math.max(prevVTr?.bestWpm || 0, vWpm),
          bestCpm: Math.max(prevVTr?.bestCpm || 0, vCpm),
          bestAccuracy: Math.max(prevVTr?.bestAccuracy || 0, vAcc),
          lastCompletedAt: completedAt
        }
      },
      firstCompletedAt: prevV?.firstCompletedAt && prevV.firstCompletedAt < completedAt ? prevV.firstCompletedAt : completedAt,
      lastCompletedAt: completedAt > (prevV?.lastCompletedAt || '') ? completedAt : (prevV?.lastCompletedAt || completedAt)
    };
  }

  const resolvedTotalVerses = Math.max(
    prevChapter?.totalVerses || 0,
    getChapterVerseCount(book.id, chapter),
    Number(totalChapterVerses) || 0,
    Number(session.totalChapterVerses) || 0,
    session.isFullChapter ? (Number(session.versesTyped) || 0) : 0,
    ...Object.keys(prevCompletedVerses).map(k => Number(k) || 0)
  );

  const completedVersesCount = Object.keys(prevCompletedVerses).length;
  const wasFullyCompleted = isChapterRecordFullyCompleted(prevChapter);
  const typedVersesCount = Object.values(prevCompletedVerses).filter(v =>
    v && v.isTyped !== false && (v.isTyped === true || (!v.isRead && !v.isSpoken && ((v.count || 0) > 0 || (v.bestWpm || 0) > 0)))
  ).length;
  const spokenVersesCount = Object.values(prevCompletedVerses).filter(v => v && v.isSpoken).length;
  const isNowFullyTyped = Boolean(
    prevChapter?.isFullyTyped ||
    (session.isFullChapter && isTypedActivity) ||
    (resolvedTotalVerses > 0 && typedVersesCount >= resolvedTotalVerses)
  );
  const isNowFullySpoken = Boolean(
    prevChapter?.isFullySpoken ||
    (session.isFullChapter && isSpokenActivity) ||
    (resolvedTotalVerses > 0 && spokenVersesCount >= resolvedTotalVerses)
  );
  const isNowFullyRead = Boolean(
    prevChapter?.isFullyRead ||
    (session.isFullChapter && isReadActivity) ||
    (resolvedTotalVerses > 0 && Object.values(prevCompletedVerses).filter(v => v && v.isRead).length >= resolvedTotalVerses)
  );
  const isNowFullyCompleted = Boolean(
    wasFullyCompleted ||
    isNowFullyTyped ||
    isNowFullySpoken ||
    isNowFullyRead ||
    (resolvedTotalVerses > 0 && completedVersesCount >= resolvedTotalVerses)
  );

  // Per-translation verse tracking
  const prevTr = prevChapter?.translations?.[translation] || {
    count: 0,
    bestWpm: 0,
    bestCpm: 0,
    bestAccuracy: 0,
    completedVerses: [],
    isFullyCompleted: false,
    lastCompletedAt: completedAt
  };
  const trVerseSet = new Set(prevTr.completedVerses || []);
  for (const vNum of verseNumbers) trVerseSet.add(vNum);
  const trCompletedVerses = Array.from(trVerseSet).sort((a, b) => a - b);
  const trIsFullyCompleted = Boolean(
    prevTr.isFullyCompleted ||
    session.isFullChapter ||
    (resolvedTotalVerses > 0 && trCompletedVerses.length >= resolvedTotalVerses)
  );

  return {
    chapterKey,
    bookId: book.id,
    bookName: book.name,
    chapter,
    totalVerses: resolvedTotalVerses,
    versesCount: Math.max(prevChapter?.versesCount || 0, resolvedTotalVerses, completedVersesCount),
    completedVersesCount,
    isFullyCompleted: isNowFullyCompleted,
    isFullyTyped: isNowFullyTyped,
    isFullySpoken: isNowFullySpoken,
    isFullyRead: isNowFullyRead,
    isRead: Boolean(prevChapter?.isRead || isNowFullyRead),
    isSpoken: Boolean(prevChapter?.isSpoken || isSpokenActivity || isNowFullySpoken),
    isTyped: Boolean(prevChapter?.isTyped || isTypedActivity || isNowFullyTyped),
    completedVerses: prevCompletedVerses,
    completedCount: isNowFullyCompleted
      ? Math.max(1, (prevChapter?.completedCount || 0) + (!wasFullyCompleted ? 1 : 0))
      : (prevChapter?.completedCount || 0),
    bestWpm: Math.max(prevChapter?.bestWpm || 0, wpm),
    bestCpm: Math.max(prevChapter?.bestCpm || 0, cpm),
    bestAccuracy: Math.max(prevChapter?.bestAccuracy || 0, accuracy),
    translations: {
      ...(prevChapter?.translations || {}),
      [translation]: {
        count: (prevTr.count || 0) + 1,
        bestWpm: Math.max(prevTr.bestWpm || 0, wpm),
        bestCpm: Math.max(prevTr.bestCpm || 0, cpm),
        bestAccuracy: Math.max(prevTr.bestAccuracy || 0, accuracy),
        completedVerses: trCompletedVerses,
        isFullyCompleted: trIsFullyCompleted,
        lastCompletedAt: completedAt
      }
    },
    firstCompletedAt: prevChapter?.firstCompletedAt && prevChapter.firstCompletedAt < completedAt
      ? prevChapter.firstCompletedAt
      : completedAt,
    lastCompletedAt: completedAt
  };
}

/**
 * Record a single completed verse immediately (supports both Single-Verse Mode and Partial/Full Chapter Mode,
 * and both 'typed' and 'spoken' activityType).
 */
export async function recordCompletedVerse(verseData) {
  const store = getLocalStore();
  const activityType = verseData.activityType === 'spoken' ? 'spoken' : 'typed';
  const isSpoken = activityType === 'spoken';
  const bookId = Number(verseData.bookId) || 1;
  const book = getBookById(bookId);
  const chapter = Number(verseData.chapter) || 1;
  const verse = Number(verseData.verse) || 1;
  const totalChapterVerses = Math.max(Number(verseData.totalChapterVerses) || 0, getChapterVerseCount(book.id, chapter));
  const allVerseNumbers = Array.isArray(verseData.allVerseNumbers) ? verseData.allVerseNumbers.map(Number) : [];
  const translation = String(verseData.translation || store.preferredTranslation || 'ESV').toUpperCase();
  const wpm = Math.max(0, Math.round((Number(verseData.wpm) || 0) * 10) / 10);
  const cpm = isSpoken ? 0 : Math.max(0, Math.round(Number(verseData.cpm) || 0));
  const accuracy = Math.min(100, Math.max(0, Math.round((Number(verseData.accuracy) ?? 100) * 10) / 10));
  const enunciation = isSpoken
    ? Math.min(100, Math.max(0, Math.round((Number(verseData.enunciation ?? verseData.accuracy) ?? 100) * 10) / 10))
    : undefined;
  const charsTyped = Math.max(0, Math.round(Number(verseData.charsTyped) || 0));
  const wordsTyped = Math.max(0, Math.round(Number(verseData.wordsTyped) || 0));
  const mistakes = Math.max(0, Math.round(Number(verseData.mistakes) || 0));
  const durationMs = Math.max(0, Math.round(Number(verseData.durationMs) || 0));
  const completedAt = verseData.completedAt || new Date().toISOString();
  const sessionId = verseData.sittingSessionId || verseData.sessionId || `${isSpoken ? 'spk' : 's'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const chapterKey = `${book.id}:${chapter}`;
  const prevChapter = store.chapters[chapterKey];
  const wasChapterComplete = isChapterRecordFullyCompleted(prevChapter);
  const wasVerseCompleteOverall = isVerseCompletedInRecord(prevChapter, verse, 'ALL');
  const wasVerseCompleteInTr = isVerseCompletedInRecord(prevChapter, verse, translation);
  const prevBestWpm = prevChapter?.completedVerses?.[String(verse)]?.bestWpm || 0;
  const isNewVersePersonalBest = !isSpoken && wpm > prevBestWpm;

  // Does this verse complete the chapter in this translation?
  const trCovered = new Set();
  for (const [vKey, vRec] of Object.entries(prevChapter?.completedVerses || {})) {
    if (vRec?.translations?.[translation]) trCovered.add(Number(vKey));
  }
  for (const n of prevChapter?.translations?.[translation]?.completedVerses || []) trCovered.add(Number(n));
  trCovered.add(verse);
  const prevTrStat = prevChapter?.translations?.[translation];
  const legacyFullInTr = Boolean(
    prevTrStat &&
    (prevTrStat.count || 0) > 0 &&
    (!prevChapter.completedVerses || Object.keys(prevChapter.completedVerses).length === 0)
  );
  const completesInTranslation = Boolean(
    prevTrStat?.isFullyCompleted ||
    legacyFullInTr ||
    (allVerseNumbers.length > 0 && allVerseNumbers.every(n => trCovered.has(n)))
  );

  const verseStatEntry = isSpoken
    ? { wpm: 0, cpm: 0, accuracy }
    : { wpm, cpm, accuracy };

  // Build or update the sitting session in store.sessions
  const existingSessionIdx = store.sessions.findIndex(s => s.sessionId === sessionId);
  let sessionObj;

  if (existingSessionIdx >= 0) {
    const prevS = store.sessions[existingSessionIdx];
    const prevVersesList = Array.isArray(prevS.completedVerseNumbers) && prevS.completedVerseNumbers.length > 0
      ? prevS.completedVerseNumbers
      : (prevS.verseNumber ? [prevS.verseNumber] : []);
    const combinedVerseNums = Array.from(new Set([...prevVersesList, verse])).sort((a, b) => a - b);
    const totalChars = (Number(prevS.charsTyped) || 0) + charsTyped;
    const totalWords = (Number(prevS.wordsTyped) || 0) + wordsTyped;
    const totalDur = (Number(prevS.durationMs) || 0) + durationMs;
    const totalMistakes = (Number(prevS.mistakes) || 0) + mistakes;
    const mins = Math.max(totalDur / 60000, 1 / 600);
    const aggCpm = isSpoken ? 0 : Math.round(totalChars / mins);
    const aggWpm = isSpoken
      ? Math.round((totalWords / mins) * 10) / 10
      : Math.round((totalChars / 5 / mins) * 10) / 10;
    const aggAcc = Math.round((((Number(prevS.accuracy) || 100) * prevVersesList.length + accuracy) / (prevVersesList.length + 1)) * 10) / 10;
    const aggEnun = isSpoken
      ? Math.round((((Number(prevS.enunciation ?? prevS.accuracy) || 100) * prevVersesList.length + (enunciation ?? accuracy)) / (prevVersesList.length + 1)) * 10) / 10
      : undefined;

    sessionObj = {
      ...prevS,
      sessionId,
      activityType,
      bookId: book.id,
      bookName: book.name,
      chapter,
      verseNumber: combinedVerseNums.length === 1 ? combinedVerseNums[0] : null,
      completedVerseNumbers: combinedVerseNums,
      verseStats: { ...(prevS.verseStats || {}), [String(verse)]: verseStatEntry },
      totalChapterVerses,
      isFullChapter: completesInTranslation || Boolean(prevS.isFullChapter),
      translation,
      wpm: aggWpm,
      cpm: aggCpm,
      accuracy: aggAcc,
      ...(isSpoken ? { enunciation: aggEnun } : {}),
      charsTyped: totalChars,
      wordsTyped: totalWords,
      versesTyped: combinedVerseNums.length,
      verseRange: formatVerseNumbersRange(combinedVerseNums),
      mistakes: totalMistakes,
      durationMs: totalDur,
      completedAt
    };
    store.sessions[existingSessionIdx] = sessionObj;
  } else {
    sessionObj = {
      sessionId,
      activityType,
      bookId: book.id,
      bookName: book.name,
      chapter,
      verseNumber: verse,
      completedVerseNumbers: [verse],
      verseStats: { [String(verse)]: verseStatEntry },
      totalChapterVerses,
      isFullChapter: completesInTranslation,
      translation,
      wpm,
      cpm,
      accuracy,
      ...(isSpoken ? { enunciation: enunciation ?? accuracy } : {}),
      charsTyped,
      wordsTyped,
      versesTyped: 1,
      verseRange: String(verse),
      mistakes,
      durationMs,
      completedAt
    };
    store.sessions.unshift(sessionObj);
  }

  // Update chapter aggregate with this completed verse
  const singleVerseDelta = {
    activityType,
    bookId: book.id,
    bookName: book.name,
    chapter,
    verseNumber: verse,
    completedVerseNumbers: [verse],
    verseStats: { [String(verse)]: verseStatEntry },
    totalChapterVerses,
    isFullChapter: completesInTranslation,
    translation,
    wpm: isSpoken ? 0 : wpm,
    cpm: isSpoken ? 0 : cpm,
    accuracy,
    versesTyped: 1,
    completedAt
  };
  store.chapters[chapterKey] = applySessionToChapterRecord(prevChapter, singleVerseDelta, totalChapterVerses);

  const isNowChapterComplete = isChapterRecordFullyCompleted(store.chapters[chapterKey]);
  const justCompletedFullChapter = !wasChapterComplete && isNowChapterComplete;

  if (!store.unsyncedSessionIds.includes(sessionId)) {
    store.unsyncedSessionIds.push(sessionId);
  }

  saveLocalStore(store);

  // Sync to cloud in background
  if (Auth.isAuthenticated() && CONFIG.API_ENDPOINTS.progress) {
    fetchWithAuth(CONFIG.API_ENDPOINTS.progress, {
      method: 'POST',
      body: JSON.stringify({ session: sessionObj })
    })
      .then(() => {
        const latest = getLocalStore();
        latest.unsyncedSessionIds = latest.unsyncedSessionIds.filter(id => id !== sessionId);
        saveLocalStore(latest);
      })
      .catch(() => {});
  }

  return {
    session: sessionObj,
    chapterRecord: store.chapters[chapterKey],
    isFirstTimeVerseOverall: !wasVerseCompleteOverall,
    isFirstTimeVerseInTranslation: !wasVerseCompleteInTr,
    isNewVersePersonalBest,
    isNowChapterComplete,
    justCompletedFullChapter
  };
}

export async function recordSpokenVerse(verseData) {
  return recordCompletedVerse({ ...verseData, activityType: 'spoken', cpm: 0 });
}

// ── Record Completed Chapter Locally & Sync to Cloud ────────────
export async function recordCompletedChapter(sessionData) {
  const store = getLocalStore();
  const activityType = sessionData.activityType === 'spoken' ? 'spoken' : 'typed';
  const isSpoken = activityType === 'spoken';
  const bookId = Number(sessionData.bookId) || 1;
  const book = getBookById(bookId);
  const chapter = Number(sessionData.chapter) || 1;
  const translation = String(sessionData.translation || store.preferredTranslation || 'ESV').toUpperCase();
  const wpm = Math.max(0, Math.round((Number(sessionData.wpm) || 0) * 10) / 10);
  const cpm = isSpoken ? 0 : Math.max(0, Math.round(Number(sessionData.cpm) || 0));
  const accuracy = Math.min(100, Math.max(0, Math.round((Number(sessionData.accuracy) ?? 100) * 10) / 10));
  const enunciation = isSpoken
    ? Math.min(100, Math.max(0, Math.round((Number(sessionData.enunciation ?? sessionData.accuracy) ?? 100) * 10) / 10))
    : undefined;
  const charsTyped = Math.max(0, Math.round(Number(sessionData.charsTyped) || 0));
  const wordsTyped = Math.max(0, Math.round(Number(sessionData.wordsTyped) || 0));
  const versesTyped = Math.max(1, Math.round(Number(sessionData.versesTyped) || 1));
  const totalChapterVerses = Math.max(versesTyped, Number(sessionData.totalChapterVerses) || versesTyped);
  const completedVerseNumbers = Array.isArray(sessionData.completedVerseNumbers) && sessionData.completedVerseNumbers.length > 0
    ? sessionData.completedVerseNumbers
    : Array.from({ length: totalChapterVerses }, (_, i) => i + 1);
  const verseRange = String(sessionData.verseRange || formatVerseNumbersRange(completedVerseNumbers));
  const mistakes = Math.max(0, Math.round(Number(sessionData.mistakes) || 0));
  const durationMs = Math.max(0, Math.round(Number(sessionData.durationMs) || 0));
  const completedAt = sessionData.completedAt || new Date().toISOString();
  const sessionId = sessionData.sittingSessionId || sessionData.sessionId || `${isSpoken ? 'spk' : 's'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const chapterKey = `${book.id}:${chapter}`;
  const prevChapter = store.chapters[chapterKey];
  const wasFullyCompleted = isChapterRecordFullyCompleted(prevChapter);
  const isNewPersonalBest = !isSpoken && (!prevChapter || wpm > (prevChapter.bestWpm || 0));
  const isFirstTimeOverall = !wasFullyCompleted;
  const isFirstTimeInTranslation = !prevChapter?.translations?.[translation]?.isFullyCompleted;

  const newSession = {
    sessionId,
    activityType,
    bookId: book.id,
    bookName: book.name,
    chapter,
    verseNumber: completedVerseNumbers.length === 1 ? completedVerseNumbers[0] : null,
    completedVerseNumbers,
    totalChapterVerses,
    isFullChapter: Boolean(sessionData.isFullChapter !== false),
    translation,
    wpm,
    cpm,
    accuracy,
    ...(isSpoken ? { enunciation: enunciation ?? accuracy } : {}),
    charsTyped,
    wordsTyped,
    versesTyped: completedVerseNumbers.length,
    verseRange,
    mistakes,
    durationMs,
    completedAt
  };

  const existingIdx = store.sessions.findIndex(s => s.sessionId === sessionId);
  if (existingIdx >= 0) {
    store.sessions[existingIdx] = newSession;
  } else {
    store.sessions.unshift(newSession);
  }

  store.chapters[chapterKey] = applySessionToChapterRecord(prevChapter, newSession, totalChapterVerses);

  if (!store.unsyncedSessionIds.includes(sessionId)) {
    store.unsyncedSessionIds.push(sessionId);
  }

  saveLocalStore(store);

  if (Auth.isAuthenticated() && CONFIG.API_ENDPOINTS.progress) {
    try {
      await fetchWithAuth(CONFIG.API_ENDPOINTS.progress, {
        method: 'POST',
        body: JSON.stringify({ session: newSession })
      });
      const updated = getLocalStore();
      updated.unsyncedSessionIds = updated.unsyncedSessionIds.filter(id => id !== sessionId);
      saveLocalStore(updated);
    } catch (e) {
      console.warn('Will retry syncing session on next sync:', e);
    }
  }

  return {
    session: newSession,
    chapterRecord: store.chapters[chapterKey],
    isNewPersonalBest,
    isFirstTimeOverall,
    isFirstTimeInTranslation
  };
}

export async function recordSpokenChapter(sessionData) {
  return recordCompletedChapter({ ...sessionData, activityType: 'spoken', cpm: 0 });
}

function normalizeSessionForReconstruct(s) {
  if (Array.isArray(s.completedVerseNumbers) && s.completedVerseNumbers.length > 0) return s;
  if (s.verseNumber) {
    return { ...s, completedVerseNumbers: [Number(s.verseNumber)] };
  }
  // Legacy full-chapter sessions only carried a "1-N" verseRange
  const m = String(s.verseRange || '').match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) {
    const out = [];
    for (let v = Number(m[1]); v <= Number(m[2]) && out.length < 200; v++) out.push(v);
    return { ...s, completedVerseNumbers: out, isFullChapter: s.isFullChapter ?? true };
  }
  return s;
}

// ── Compute Comprehensive Typing, Speaking & Bible Reach Statistics ──
export function getGlobalTypingStats() {
  const store = getLocalStore();
  const chaptersMap = store.chapters || {};
  const sessions = store.sessions || [];

  // Reconstruct chapters map from sessions as well so nothing is ever out of sync (idempotent)
  const mergedChapters = { ...chaptersMap };
  for (const s of sessions) {
    const key = `${s.bookId}:${s.chapter}`;
    const normalized = normalizeSessionForReconstruct(s);
    const rec = mergedChapters[key];
    const verses = normalized.completedVerseNumbers || [];
    const reflected = rec && (verses.length === 0 || verses.every(v => {
      if (normalized.activityType === 'spoken') return isVerseSpoken(rec, v);
      if (normalized.activityType === 'read') return isVerseRead(rec, v);
      return isVerseTyped(rec, v, normalized.translation);
    }));
    if (!reflected) {
      mergedChapters[key] = applySessionToChapterRecord(rec, normalized, normalized.totalChapterVerses || 0);
    }
  }

  const allChapterRecords = Object.values(mergedChapters);

  let overallCoveredChapters = 0;
  let overallReadChapters = 0;
  let overallTypedChapters = 0;
  let overallSpokenChapters = 0;
  let overallBothChapters = 0;
  let partialChaptersCount = 0;
  let overallCoveredVerses = 0;
  let overallReadVerses = 0;
  let overallTypedVerses = 0;
  let overallSpokenVerses = 0;
  let overallBothVerses = 0;
  let otCoveredChapters = 0;
  let ntCoveredChapters = 0;

  for (const book of BIBLE_BOOKS) {
    for (let ch = 1; ch <= book.chapters; ch++) {
      const sum = getChapterProgressSummary(book.id, ch, 'ALL');
      if (sum.isFullyCompleted) {
        overallCoveredChapters++;
        overallCoveredVerses += sum.totalVerses;
        if (book.id <= 39) otCoveredChapters++;
        else ntCoveredChapters++;
      } else if (sum.isPartial) {
        partialChaptersCount++;
        overallCoveredVerses += sum.completedVersesCount;
      }

      if (sum.isFullyRead) {
        overallReadChapters++;
        overallReadVerses += sum.totalVerses;
      } else if (sum.readVersesCount > 0) {
        overallReadVerses += sum.readVersesCount;
      }

      if (sum.isFullyTyped) {
        overallTypedChapters++;
        overallTypedVerses += sum.totalVerses;
      } else if (sum.typedVersesCount > 0) {
        overallTypedVerses += sum.typedVersesCount;
      }

      if (sum.isFullySpoken) {
        overallSpokenChapters++;
        overallSpokenVerses += sum.totalVerses;
      } else if (sum.spokenVersesCount > 0) {
        overallSpokenVerses += sum.spokenVersesCount;
      }

      if (sum.isBoth) {
        overallBothChapters++;
        overallBothVerses += sum.totalVerses;
      } else if (sum.readVersesCount > 0 && sum.typedVersesCount > 0) {
        const bothCount = sum.readVerseNums.filter(v => sum.typedVerseNums.includes(v)).length;
        overallBothVerses += bothCount;
      }
    }
  }

  const overallCoveredPercentage = Math.round((overallCoveredChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;
  const overallCoveredVersesPercentage = Math.round((overallCoveredVerses / TOTAL_BIBLE_VERSES) * 1000) / 10;
  const overallReadPercentage = Math.round((overallReadChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;
  const overallReadVersesPercentage = Math.round((overallReadVerses / TOTAL_BIBLE_VERSES) * 1000) / 10;
  const overallTypedPercentage = Math.round((overallTypedChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;
  const overallTypedVersesPercentage = Math.round((overallTypedVerses / TOTAL_BIBLE_VERSES) * 1000) / 10;
  const overallSpokenPercentage = Math.round((overallSpokenChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;
  const overallSpokenVersesPercentage = Math.round((overallSpokenVerses / TOTAL_BIBLE_VERSES) * 1000) / 10;
  const overallReadOnlyChapters = Math.max(0, overallReadChapters - overallBothChapters);
  const overallTypedOnlyChapters = Math.max(0, overallTypedChapters - overallBothChapters);
  const overallSpokenOnlyChapters = Math.max(0, overallSpokenChapters - overallBothChapters);

  // Count books fully completed (covered, read, typed, spoken)
  let completedBooksCount = 0;
  let readBooksCount = 0;
  let typedBooksCount = 0;
  let spokenBooksCount = 0;
  for (const book of BIBLE_BOOKS) {
    let coveredInBook = 0;
    let readInBook = 0;
    let typedInBook = 0;
    let spokenInBook = 0;
    for (let ch = 1; ch <= book.chapters; ch++) {
      const sum = getChapterProgressSummary(book.id, ch, 'ALL');
      if (sum.isFullyCompleted) coveredInBook++;
      if (sum.isFullyRead) readInBook++;
      if (sum.isFullyTyped) typedInBook++;
      if (sum.isFullySpoken) spokenInBook++;
    }
    if (coveredInBook === book.chapters) completedBooksCount++;
    if (readInBook === book.chapters) readBooksCount++;
    if (typedInBook === book.chapters) typedBooksCount++;
    if (spokenInBook === book.chapters) spokenBooksCount++;
  }

  // Speed & volume metrics across TYPED sessions only (do not include read or spoken sessions in typing WPM/CPM)
  const typedSessions = sessions.filter(s => s.activityType !== 'read' && s.activityType !== 'spoken');
  let totalWpmSum = 0;
  let totalCpmSum = 0;
  let totalAccSum = 0;
  let bestWpm = 0;
  let bestCpm = 0;
  let totalVersesTyped = 0;
  let totalWordsTyped = 0;
  let totalCharsTyped = 0;
  let totalDurationMs = 0;

  for (const s of typedSessions) {
    const wpm = Number(s.wpm) || 0;
    const cpm = Number(s.cpm) || 0;
    const acc = Number(s.accuracy) ?? 100;
    totalWpmSum += wpm;
    totalCpmSum += cpm;
    totalAccSum += acc;
    if (wpm > bestWpm) bestWpm = wpm;
    if (cpm > bestCpm) bestCpm = cpm;
    totalVersesTyped += Number(s.versesTyped) || 0;
    totalWordsTyped += Number(s.wordsTyped) || 0;
    totalCharsTyped += Number(s.charsTyped) || 0;
    totalDurationMs += Number(s.durationMs) || 0;
  }

  const typedChapterRecords = allChapterRecords.filter(c => (c.bestWpm || 0) > 0 || c.isTyped);
  if (typedSessions.length === 0 && typedChapterRecords.length > 0) {
    for (const c of typedChapterRecords) {
      totalWpmSum += Number(c.bestWpm) || 0;
      totalCpmSum += Number(c.bestCpm) || 0;
      totalAccSum += Number(c.bestAccuracy) || 100;
      if ((c.bestWpm || 0) > bestWpm) bestWpm = c.bestWpm;
      if ((c.bestCpm || 0) > bestCpm) bestCpm = c.bestCpm;
      totalVersesTyped += Object.keys(c.completedVerses || {}).length || Number(c.versesCount) || 0;
    }
  }

  const denom = typedSessions.length || typedChapterRecords.length || 0;
  const avgWpm = denom > 0 ? Math.round((totalWpmSum / denom) * 10) / 10 : 0;
  const avgCpm = denom > 0 ? Math.round(totalCpmSum / denom) : 0;
  const avgAccuracy = denom > 0 ? Math.round((totalAccSum / denom) * 10) / 10 : 100;

  // Speaking Cadence (WPM), Pronunciation Accuracy & Enunciation across SPOKEN sessions
  const spokenSessions = sessions.filter(s => s.activityType === 'spoken');
  let speakWpmSum = 0;
  let speakWpmCount = 0;
  let speakPronSum = 0;
  let speakEnunSum = 0;
  let totalVersesSpokenInSessions = 0;
  let totalWordsSpoken = 0;
  let totalSpeakDurationMs = 0;

  for (const s of spokenSessions) {
    const swpm = Number(s.wpm) || 0;
    if (swpm > 0) {
      speakWpmSum += swpm;
      speakWpmCount++;
    }
    const pron = Number(s.accuracy) ?? 100;
    const enun = Number(s.enunciation ?? s.accuracy) ?? 100;
    speakPronSum += pron;
    speakEnunSum += enun;
    totalVersesSpokenInSessions += Number(s.versesTyped) || 0;
    totalWordsSpoken += Number(s.wordsTyped) || 0;
    totalSpeakDurationMs += Number(s.durationMs) || 0;
  }

  const avgSpeakCadenceWpm = speakWpmCount > 0 ? Math.round((speakWpmSum / speakWpmCount) * 10) / 10 : 0;
  const avgPronunciationAccuracy = spokenSessions.length > 0
    ? Math.round((speakPronSum / spokenSessions.length) * 10) / 10
    : 100;
  const avgEnunciation = spokenSessions.length > 0
    ? Math.round((speakEnunSum / spokenSessions.length) * 10) / 10
    : 100;

  // Per-translation completeness breakdown
  const byTranslation = {};
  for (const t of BIBLE_TRANSLATIONS) {
    byTranslation[t.code] = {
      code: t.code,
      name: t.name,
      shortName: t.shortName,
      completedChapters: 0,
      partialChapters: 0,
      completedVerses: 0,
      percentage: 0,
      sessionsCount: 0,
      bestWpm: 0,
      bestCpm: 0
    };
  }

  for (const c of allChapterRecords) {
    const trMap = c.translations || {};
    const totalV = Number(c.totalVerses) || Number(c.versesCount) || 0;
    for (const [trCode, trStat] of Object.entries(trMap)) {
      if (!byTranslation[trCode]) {
        byTranslation[trCode] = {
          code: trCode,
          name: trCode,
          shortName: trCode,
          completedChapters: 0,
          partialChapters: 0,
          completedVerses: 0,
          percentage: 0,
          sessionsCount: 0,
          bestWpm: 0,
          bestCpm: 0
        };
      }
      const trVersesLen = Array.isArray(trStat.completedVerses) ? trStat.completedVerses.length : 0;
      const trFull = Boolean(trStat.isFullyCompleted || (totalV > 0 && trVersesLen >= totalV) || (!c.completedVerses && trStat.count > 0));
      if (trFull) {
        byTranslation[trCode].completedChapters += 1;
        byTranslation[trCode].completedVerses += Math.max(trVersesLen, totalV);
      } else if (trVersesLen > 0) {
        byTranslation[trCode].partialChapters += 1;
        byTranslation[trCode].completedVerses += trVersesLen;
      }
      byTranslation[trCode].sessionsCount += Number(trStat.count) || 1;
      byTranslation[trCode].bestWpm = Math.max(byTranslation[trCode].bestWpm, Number(trStat.bestWpm) || 0);
      byTranslation[trCode].bestCpm = Math.max(byTranslation[trCode].bestCpm, Number(trStat.bestCpm) || 0);
    }
  }

  for (const trObj of Object.values(byTranslation)) {
    trObj.percentage = Math.round((trObj.completedChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;
  }

  return {
    // Total Bible Covered (Read, Typed, OR Spoken)
    overallCoveredChapters,
    overallCoveredVerses,
    overallCoveredPercentage,
    overallCoveredVersesPercentage,
    // Read Breakdown
    overallReadChapters,
    overallReadVerses,
    overallReadPercentage,
    overallReadVersesPercentage,
    overallReadOnlyChapters,
    // Typed Breakdown
    overallTypedChapters,
    overallTypedVerses,
    overallTypedPercentage,
    overallTypedVersesPercentage,
    overallTypedOnlyChapters,
    // Spoken Breakdown
    overallSpokenChapters,
    overallSpokenVerses,
    overallSpokenPercentage,
    overallSpokenVersesPercentage,
    overallSpokenOnlyChapters,
    // Speaking Cadence, Pronunciation & Enunciation
    avgSpeakCadenceWpm,
    avgPronunciationAccuracy,
    avgEnunciation,
    totalWordsSpoken,
    totalVersesSpokenInSessions,
    totalSpeakDurationMs,
    spokenSessionsCount: spokenSessions.length,
    // Both Breakdown
    overallBothChapters,
    overallBothVerses,
    // Backward compatibility aliases
    overallCompletedChapters: overallCoveredChapters,
    overallCompletedVerses: overallCoveredVerses,
    overallPercentage: overallCoveredPercentage,
    overallVersesPercentage: overallCoveredVersesPercentage,
    partialChaptersCount,
    totalBibleChapters: TOTAL_BIBLE_CHAPTERS,
    totalBibleVerses: TOTAL_BIBLE_VERSES,
    otCompletedChapters: otCoveredChapters,
    otCoveredChapters,
    totalOtChapters: TOTAL_OT_CHAPTERS,
    ntCompletedChapters: ntCoveredChapters,
    ntCoveredChapters,
    totalNtChapters: TOTAL_NT_CHAPTERS,
    completedBooksCount,
    readBooksCount,
    typedBooksCount,
    spokenBooksCount,
    totalBooksCount: BIBLE_BOOKS.length,
    avgWpm,
    avgCpm,
    bestWpm: Math.round(bestWpm * 10) / 10,
    bestCpm: Math.round(bestCpm),
    avgAccuracy,
    totalVersesTyped,
    totalWordsTyped,
    totalCharsTyped,
    totalDurationMs,
    sessionsCount: typedSessions.length,
    chaptersMap: mergedChapters,
    sessions,
    byTranslation
  };
}

// ── Cloud Sync Helpers ──────────────────────────────────────────
async function fetchWithAuth(url, options = {}) {
  if (!Auth.isAuthenticated()) {
    throw new Error('Not authenticated');
  }

  if (!Auth.isTokenValid()) {
    await attemptSilentGoogleRefresh();
  }
  const token = Auth.getToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    const refreshed = await attemptSilentGoogleRefresh();
    if (refreshed) {
      const retryToken = Auth.getToken();
      const retryRes = await fetch(url, {
        ...options,
        headers: { ...headers, Authorization: `Bearer ${retryToken}` }
      });
      if (retryRes.ok) return retryRes.json();
    }
    if (!Auth.isAuthenticated()) {
      Auth.signOut();
      throw new Error('Authentication expired. Please sign in again.');
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function mergeChapterRecords(localCh, cloudCh) {
  if (!localCh) return cloudCh;
  if (!cloudCh) return localCh;

  const mergedVerses = { ...(cloudCh.completedVerses || {}) };
  for (const [vKey, localV] of Object.entries(localCh.completedVerses || {})) {
    const cloudV = mergedVerses[vKey];
    if (!cloudV) {
      mergedVerses[vKey] = localV;
    } else {
      mergedVerses[vKey] = {
        ...cloudV,
        ...localV,
        count: Math.max(localV.count || 0, cloudV.count || 0),
        isRead: Boolean(localV.isRead || cloudV.isRead),
        isSpoken: Boolean(localV.isSpoken || cloudV.isSpoken),
        isTyped: Boolean(localV.isTyped || cloudV.isTyped || (!localV.isRead && !localV.isSpoken && localV.count > 0) || (!cloudV.isRead && !cloudV.isSpoken && cloudV.count > 0)),
        readAt: localV.readAt && cloudV.readAt ? (localV.readAt > cloudV.readAt ? localV.readAt : cloudV.readAt) : (localV.readAt || cloudV.readAt),
        spokenAt: localV.spokenAt && cloudV.spokenAt ? (localV.spokenAt > cloudV.spokenAt ? localV.spokenAt : cloudV.spokenAt) : (localV.spokenAt || cloudV.spokenAt),
        bestWpm: Math.max(localV.bestWpm || 0, cloudV.bestWpm || 0),
        bestCpm: Math.max(localV.bestCpm || 0, cloudV.bestCpm || 0),
        bestAccuracy: Math.max(localV.bestAccuracy || 0, cloudV.bestAccuracy || 0),
        translations: {
          ...(cloudV.translations || {}),
          ...(localV.translations || {})
        }
      };
    }
  }

  const totalVerses = Math.max(localCh.totalVerses || 0, cloudCh.totalVerses || 0, localCh.versesCount || 0, cloudCh.versesCount || 0);
  const completedVersesCount = Object.keys(mergedVerses).length;
  const isFullyRead = Boolean(
    localCh.isFullyRead ||
    cloudCh.isFullyRead ||
    localCh.isRead ||
    cloudCh.isRead ||
    (totalVerses > 0 && Object.values(mergedVerses).filter(v => v.isRead).length >= totalVerses)
  );
  const isFullyTyped = Boolean(
    localCh.isFullyTyped ||
    cloudCh.isFullyTyped ||
    (totalVerses > 0 && Object.values(mergedVerses).filter(v => v.isTyped).length >= totalVerses)
  );
  const isFullySpoken = Boolean(
    localCh.isFullySpoken ||
    cloudCh.isFullySpoken ||
    (totalVerses > 0 && Object.values(mergedVerses).filter(v => v.isSpoken).length >= totalVerses)
  );
  const isFullyCompleted = Boolean(
    isFullyRead ||
    isFullyTyped ||
    isFullySpoken ||
    isChapterRecordFullyCompleted(localCh) ||
    isChapterRecordFullyCompleted(cloudCh) ||
    (totalVerses > 0 && completedVersesCount >= totalVerses)
  );

  return {
    ...cloudCh,
    ...localCh,
    totalVerses,
    versesCount: Math.max(localCh.versesCount || 0, cloudCh.versesCount || 0, completedVersesCount),
    completedVersesCount,
    isFullyCompleted,
    isFullyRead,
    isFullyTyped,
    isFullySpoken,
    isRead: isFullyRead,
    isSpoken: Boolean(localCh.isSpoken || cloudCh.isSpoken || isFullySpoken),
    isTyped: Boolean(localCh.isTyped || cloudCh.isTyped || isFullyTyped),
    completedVerses: mergedVerses,
    completedCount: Math.max(localCh.completedCount || 0, cloudCh.completedCount || 0),
    bestWpm: Math.max(localCh.bestWpm || 0, cloudCh.bestWpm || 0),
    bestCpm: Math.max(localCh.bestCpm || 0, cloudCh.bestCpm || 0),
    bestAccuracy: Math.max(localCh.bestAccuracy || 0, cloudCh.bestAccuracy || 0),
    translations: {
      ...(cloudCh.translations || {}),
      ...(localCh.translations || {})
    }
  };
}

let isSyncing = false;
export async function syncLocalToCloud() {
  if (isSyncing || !Auth.isAuthenticated()) return;
  if (!CONFIG.API_ENDPOINTS.progress) return;

  isSyncing = true;
  try {
    const store = getLocalStore();

    // 1. Push any unsynced local sessions first
    if (store.unsyncedSessionIds && store.unsyncedSessionIds.length > 0) {
      const toPush = store.sessions.filter(s => store.unsyncedSessionIds.includes(s.sessionId));
      if (toPush.length > 0) {
        await fetchWithAuth(CONFIG.API_ENDPOINTS.progress, {
          method: 'POST',
          body: JSON.stringify({ sessions: toPush })
        });
      }
      store.unsyncedSessionIds = [];
      saveLocalStore(store);
    }

    // 2. Pull cloud chapters, sessions, and profile
    const [progressData, profileData] = await Promise.all([
      fetchWithAuth(CONFIG.API_ENDPOINTS.progress, { method: 'GET' }).catch(() => null),
      CONFIG.API_ENDPOINTS.profile
        ? fetchWithAuth(CONFIG.API_ENDPOINTS.profile, { method: 'GET' }).catch(() => null)
        : Promise.resolve(null)
    ]);

    const latestStore = getLocalStore();
    let drawingsChanged = false;
    let favoritesChanged = false;
    let bookmarksChanged = false;

    if (profileData && profileData.profile) {
      const cp = profileData.profile;
      if (cp.preferredTranslation) latestStore.preferredTranslation = cp.preferredTranslation;
      if (cp.singleVerseMode !== undefined) latestStore.singleVerseMode = Boolean(cp.singleVerseMode);
      if (cp.autoAdvance !== undefined) latestStore.autoAdvance = Boolean(cp.autoAdvance);
      if (cp.advanceButton !== undefined) latestStore.advanceButton = Boolean(cp.advanceButton);
      if (cp.skipCompletedVerses !== undefined) latestStore.skipCompletedVerses = Boolean(cp.skipCompletedVerses);
      if (cp.showTypingStats !== undefined) latestStore.showTypingStats = Boolean(cp.showTypingStats);
      if (cp.showProgressTags !== undefined) latestStore.showProgressTags = Boolean(cp.showProgressTags);
      if (cp.shuffleVerses !== undefined) latestStore.shuffleVerses = Boolean(cp.shuffleVerses);
      if (cp.shuffleScope) latestStore.shuffleScope = cp.shuffleScope;
      if (['type', 'speak', 'draw'].includes(cp.activeMode)) {
        latestStore.activeMode = cp.activeMode;
        latestStore.meditateMode = cp.activeMode === 'draw';
      } else if (cp.meditateMode !== undefined) {
        latestStore.meditateMode = Boolean(cp.meditateMode);
        latestStore.activeMode = latestStore.meditateMode ? 'draw' : 'type';
      }
      if (Array.isArray(cp.meditatePalette) && cp.meditatePalette.length === 10) {
        latestStore.meditatePalette = cp.meditatePalette;
      }
      if (cp.meditateFont) latestStore.meditateFont = cp.meditateFont;
      if (typeof cp.meditateFontSize === 'number') latestStore.meditateFontSize = cp.meditateFontSize;

      const cloudDrawings = { ...(cp.meditations || {}), ...(cp.drawings || {}) };
      if (Object.keys(cloudDrawings).length > 0) {
        const localMeds = { ...(latestStore.meditations || {}), ...(latestStore.drawings || {}) };
        const mergedMeds = { ...localMeds };
        for (const [key, cloudMed] of Object.entries(cloudDrawings)) {
          if (!cloudMed) continue;
          const localMed = mergedMeds[key];
          const cloudTime = cloudMed.updatedAt || '';
          const localTime = localMed?.updatedAt || '';
          if (!localMed || cloudTime >= localTime) {
            if (JSON.stringify(localMed) !== JSON.stringify(cloudMed)) {
              mergedMeds[key] = cloudMed;
              drawingsChanged = true;
            }
          }
        }
        latestStore.drawings = mergedMeds;
        latestStore.meditations = mergedMeds;
      }

      if (cp.favorites && typeof cp.favorites === 'object') {
        const localFavs = latestStore.favorites || {};
        const mergedFavs = { ...localFavs };
        for (const [key, cloudFav] of Object.entries(cp.favorites)) {
          if (!cloudFav) continue;
          const localFav = mergedFavs[key];
          const cloudTime = cloudFav.commentUpdatedAt || cloudFav.addedAt || '';
          const localTime = localFav ? (localFav.commentUpdatedAt || localFav.addedAt || '') : '';
          if (!localFav || cloudTime >= localTime) {
            if (JSON.stringify(localFav) !== JSON.stringify(cloudFav)) {
              mergedFavs[key] = cloudFav;
              favoritesChanged = true;
            }
          }
        }
        latestStore.favorites = mergedFavs;
      }

      if (cp.bookmarks && typeof cp.bookmarks === 'object') {
        const localBms = latestStore.bookmarks || {};
        const mergedBms = { ...localBms };
        for (const [key, cloudBm] of Object.entries(cp.bookmarks)) {
          if (!cloudBm) continue;
          const localBm = mergedBms[key];
          const cloudTime = cloudBm.updatedAt || cloudBm.createdAt || '';
          const localTime = localBm ? (localBm.updatedAt || localBm.createdAt || '') : '';
          if (!localBm || cloudTime >= localTime) {
            if (JSON.stringify(localBm) !== JSON.stringify(cloudBm)) {
              mergedBms[key] = cloudBm;
              bookmarksChanged = true;
            }
          }
        }
        latestStore.bookmarks = mergedBms;
      }
    }

    if (progressData) {
      const cloudChapters = progressData.chapters || {};
      const cloudSessions = Array.isArray(progressData.sessions) ? progressData.sessions : [];

      const mergedChapters = { ...latestStore.chapters };
      for (const [key, cloudCh] of Object.entries(cloudChapters)) {
        mergedChapters[key] = mergeChapterRecords(mergedChapters[key], cloudCh);
      }
      latestStore.chapters = mergedChapters;

      // Merge sessions by sessionId
      const sessionMap = new Map();
      for (const s of latestStore.sessions) {
        if (s && s.sessionId) sessionMap.set(s.sessionId, s);
      }
      for (const s of cloudSessions) {
        if (s && s.sessionId) {
          const existing = sessionMap.get(s.sessionId);
          if (!existing || (s.versesTyped || 0) >= (existing.versesTyped || 0)) {
            sessionMap.set(s.sessionId, s);
          }
        }
      }

      const cloudIds = new Set(cloudSessions.map(s => s.sessionId));
      const localOnlySessions = latestStore.sessions.filter(s => s.sessionId && !cloudIds.has(s.sessionId));
      if (localOnlySessions.length > 0) {
        fetchWithAuth(CONFIG.API_ENDPOINTS.progress, {
          method: 'POST',
          body: JSON.stringify({ sessions: localOnlySessions })
        }).catch(() => {});
      }

      latestStore.sessions = Array.from(sessionMap.values()).sort((a, b) =>
        (b.completedAt || '').localeCompare(a.completedAt || '')
      );
    }

    saveLocalStore(latestStore);

    if (drawingsChanged) {
      window.dispatchEvent(new CustomEvent('bible:drawings-updated'));
      window.dispatchEvent(new CustomEvent('bible:meditations-updated'));
    }
    if (favoritesChanged) {
      window.dispatchEvent(new CustomEvent('bible:favorites-updated'));
    }
    if (bookmarksChanged) {
      window.dispatchEvent(new CustomEvent('bible:bookmarks-updated'));
    }

    syncPreferencesToCloud();
  } catch (err) {
    console.warn('Cloud sync warning:', err);
  } finally {
    isSyncing = false;
  }
}

export const Api = {
  syncLocalToCloud,
  recordCompletedVerse,
  recordCompletedChapter,
  recordSpokenVerse,
  recordSpokenChapter,
  markChapterAsRead,
  unmarkChapterAsRead,
  toggleChapterRead,
  markVerseAsRead,
  unmarkVerseAsRead,
  toggleVerseRead,
  getGlobalTypingStats,
  getPreferredTranslation,
  setPreferredTranslation,
  getSkipCompletedVersesPref,
  setSkipCompletedVersesPref,
  getShowTypingStatsPref,
  setShowTypingStatsPref,
  getShowProgressTagsPref,
  setShowProgressTagsPref,
  getSingleVerseModePref,
  setSingleVerseModePref,
  getAutoAdvancePref,
  setAutoAdvancePref,
  getSkipCelebrationModalPref,
  setSkipCelebrationModalPref,
  getAdvanceButtonPref,
  setAdvanceButtonPref,
  getShuffleVersesPref,
  setShuffleVersesPref,
  getActiveModePref,
  setActiveModePref,
  getMeditateModePref,
  setMeditateModePref,
  saveVerseDrawing,
  getVerseDrawing,
  getAllDrawings,
  deleteVerseDrawing,
  saveVerseMeditation,
  getVerseMeditation,
  getAllMeditations,
  deleteVerseMeditation,
  getChapterProgressSummary,
  isChapterRecordFullyCompleted,
  isChapterRecordFullyRead,
  isChapterRecordFullyTyped,
  isChapterRecordFullySpoken,
  isVerseCompletedInRecord,
  isVerseRead,
  isVerseTyped,
  isVerseSpoken,
  isVerseCovered
};
