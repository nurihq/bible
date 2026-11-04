import { CONFIG } from './config.js?v=20261104_v3';
import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  TOTAL_BIBLE_CHAPTERS,
  TOTAL_OT_CHAPTERS,
  TOTAL_NT_CHAPTERS,
  getBookById
} from './bible-data.js?v=20261104_v3';

const STORAGE_PREFIX = 'bible_app_';
const AUTH_TOKEN_KEY = `${STORAGE_PREFIX}auth_token`;
const USER_KEY = `${STORAGE_PREFIX}user`;
const LOCAL_DATA_KEY = `${STORAGE_PREFIX}local_data_v1`;

// ── Authentication & Session Management ─────────────────────────
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
    return this.isTokenValid() && !!this.getUser();
  },
  signOut() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

let isRefreshingToken = false;
export async function attemptSilentGoogleRefresh() {
  if (isRefreshingToken) return false;
  isRefreshingToken = true;

  return new Promise((resolve) => {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response && response.credential) {
            Auth.setToken(response.credential);
            try {
              const payload = JSON.parse(atob(response.credential.split('.')[1]));
              Auth.setUser({
                sub: payload.sub,
                name: payload.name,
                email: payload.email,
                picture: payload.picture
              });
            } catch (e) {}
            syncLocalToCloud().catch(() => {});
            isRefreshingToken = false;
            resolve(true);
            return;
          }
          isRefreshingToken = false;
          resolve(false);
        },
        auto_select: true,
        cancel_on_tap_outside: true
      });
      google.accounts.id.prompt((notification) => {
        if (notification && (notification.isNotDisplayed() || notification.isSkippedMoment())) {
          isRefreshingToken = false;
          resolve(false);
        }
      });
      setTimeout(() => {
        isRefreshingToken = false;
        resolve(false);
      }, 3500);
    } else {
      isRefreshingToken = false;
      resolve(false);
    }
  });
}

// ── Local & Cloud Store ─────────────────────────────────────────
function createDefaultStore() {
  return {
    preferredTranslation: 'ESV',
    lastBookId: 1,
    lastChapter: 1,
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
        return {
          ...createDefaultStore(),
          ...parsed,
          chapters: parsed.chapters || {},
          sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
          unsyncedSessionIds: Array.isArray(parsed.unsyncedSessionIds) ? parsed.unsyncedSessionIds : []
        };
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

export function setPreferredTranslation(translationCode) {
  const code = String(translationCode || 'ESV').toUpperCase();
  const store = getLocalStore();
  store.preferredTranslation = code;
  saveLocalStore(store);
  if (Auth.isAuthenticated() && CONFIG.API_ENDPOINTS.profile) {
    fetchWithAuth(CONFIG.API_ENDPOINTS.profile, {
      method: 'POST',
      body: JSON.stringify({ preferredTranslation: code })
    }).catch(() => {});
  }
}

export function setLastSelectedChapter(bookId, chapter) {
  const store = getLocalStore();
  store.lastBookId = Number(bookId) || 1;
  store.lastChapter = Number(chapter) || 1;
  saveLocalStore(store);
}

// ── Record Completed Chapter Locally & Sync to Cloud ────────────
export async function recordCompletedChapter(sessionData) {
  const store = getLocalStore();
  const bookId = Number(sessionData.bookId) || 1;
  const book = getBookById(bookId);
  const chapter = Number(sessionData.chapter) || 1;
  const translation = String(sessionData.translation || store.preferredTranslation || 'ESV').toUpperCase();
  const wpm = Math.max(0, Math.round((Number(sessionData.wpm) || 0) * 10) / 10);
  const cpm = Math.max(0, Math.round(Number(sessionData.cpm) || 0));
  const accuracy = Math.min(100, Math.max(0, Math.round((Number(sessionData.accuracy) ?? 100) * 10) / 10));
  const charsTyped = Math.max(0, Math.round(Number(sessionData.charsTyped) || 0));
  const wordsTyped = Math.max(0, Math.round(Number(sessionData.wordsTyped) || 0));
  const versesTyped = Math.max(1, Math.round(Number(sessionData.versesTyped) || 1));
  const verseRange = String(sessionData.verseRange || `1-${versesTyped}`);
  const mistakes = Math.max(0, Math.round(Number(sessionData.mistakes) || 0));
  const durationMs = Math.max(0, Math.round(Number(sessionData.durationMs) || 0));
  const completedAt = sessionData.completedAt || new Date().toISOString();
  const sessionId = sessionData.sessionId || `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const newSession = {
    sessionId,
    bookId: book.id,
    bookName: book.name,
    chapter,
    translation,
    wpm,
    cpm,
    accuracy,
    charsTyped,
    wordsTyped,
    versesTyped,
    verseRange,
    mistakes,
    durationMs,
    completedAt
  };

  // Prepend to sessions list (avoid duplicates)
  const existingIdx = store.sessions.findIndex(s => s.sessionId === sessionId);
  if (existingIdx === -1) {
    store.sessions.unshift(newSession);
  }

  // Update chapter aggregate record
  const chapterKey = `${book.id}:${chapter}`;
  const prevChapter = store.chapters[chapterKey];
  const isNewPersonalBest = !prevChapter || wpm > (prevChapter.bestWpm || 0);
  const isFirstTimeOverall = !prevChapter;
  const isFirstTimeInTranslation = !prevChapter?.translations?.[translation];

  if (!prevChapter) {
    store.chapters[chapterKey] = {
      chapterKey,
      bookId: book.id,
      bookName: book.name,
      chapter,
      versesCount: versesTyped,
      completedCount: 1,
      bestWpm: wpm,
      bestCpm: cpm,
      bestAccuracy: accuracy,
      translations: {
        [translation]: {
          count: 1,
          bestWpm: wpm,
          bestCpm: cpm,
          bestAccuracy: accuracy,
          lastCompletedAt: completedAt
        }
      },
      firstCompletedAt: completedAt,
      lastCompletedAt: completedAt
    };
  } else {
    const prevTr = prevChapter.translations?.[translation] || {
      count: 0,
      bestWpm: 0,
      bestCpm: 0,
      bestAccuracy: 0,
      lastCompletedAt: completedAt
    };
    store.chapters[chapterKey] = {
      ...prevChapter,
      versesCount: Math.max(prevChapter.versesCount || 0, versesTyped),
      completedCount: (prevChapter.completedCount || 0) + 1,
      bestWpm: Math.max(prevChapter.bestWpm || 0, wpm),
      bestCpm: Math.max(prevChapter.bestCpm || 0, cpm),
      bestAccuracy: Math.max(prevChapter.bestAccuracy || 0, accuracy),
      translations: {
        ...(prevChapter.translations || {}),
        [translation]: {
          count: (prevTr.count || 0) + 1,
          bestWpm: Math.max(prevTr.bestWpm || 0, wpm),
          bestCpm: Math.max(prevTr.bestCpm || 0, cpm),
          bestAccuracy: Math.max(prevTr.bestAccuracy || 0, accuracy),
          lastCompletedAt: completedAt
        }
      },
      lastCompletedAt: completedAt
    };
  }

  if (!store.unsyncedSessionIds.includes(sessionId)) {
    store.unsyncedSessionIds.push(sessionId);
  }

  saveLocalStore(store);

  // Sync to cloud in background
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

// ── Compute Comprehensive Typing & Bible Reach Statistics ────────
export function getGlobalTypingStats() {
  const store = getLocalStore();
  const chaptersMap = store.chapters || {};
  const sessions = store.sessions || [];

  // Reconstruct chapters map from sessions as well so nothing is ever out of sync
  const mergedChapters = { ...chaptersMap };
  for (const s of sessions) {
    const key = `${s.bookId}:${s.chapter}`;
    const tr = (s.translation || 'ESV').toUpperCase();
    if (!mergedChapters[key]) {
      mergedChapters[key] = {
        chapterKey: key,
        bookId: s.bookId,
        bookName: s.bookName || getBookById(s.bookId).name,
        chapter: s.chapter,
        versesCount: s.versesTyped || 0,
        completedCount: 1,
        bestWpm: s.wpm || 0,
        bestCpm: s.cpm || 0,
        bestAccuracy: s.accuracy ?? 100,
        translations: {
          [tr]: {
            count: 1,
            bestWpm: s.wpm || 0,
            bestCpm: s.cpm || 0,
            bestAccuracy: s.accuracy ?? 100,
            lastCompletedAt: s.completedAt
          }
        },
        firstCompletedAt: s.completedAt,
        lastCompletedAt: s.completedAt
      };
    } else if (!mergedChapters[key].translations?.[tr]) {
      mergedChapters[key].translations = {
        ...(mergedChapters[key].translations || {}),
        [tr]: {
          count: 1,
          bestWpm: s.wpm || 0,
          bestCpm: s.cpm || 0,
          bestAccuracy: s.accuracy ?? 100,
          lastCompletedAt: s.completedAt
        }
      };
    }
  }

  const completedChapterList = Object.values(mergedChapters);
  const overallCompletedChapters = completedChapterList.length;
  const overallPercentage = Math.round((overallCompletedChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;

  let otCompletedChapters = 0;
  let ntCompletedChapters = 0;
  for (const c of completedChapterList) {
    if (Number(c.bookId) <= 39) otCompletedChapters++;
    else ntCompletedChapters++;
  }

  // Count books fully completed (overall)
  let completedBooksCount = 0;
  for (const book of BIBLE_BOOKS) {
    let doneInBook = 0;
    for (let ch = 1; ch <= book.chapters; ch++) {
      if (mergedChapters[`${book.id}:${ch}`]) doneInBook++;
    }
    if (doneInBook === book.chapters) completedBooksCount++;
  }

  // Speed & volume metrics across sessions
  let totalWpmSum = 0;
  let totalCpmSum = 0;
  let totalAccSum = 0;
  let bestWpm = 0;
  let bestCpm = 0;
  let totalVersesTyped = 0;
  let totalWordsTyped = 0;
  let totalCharsTyped = 0;
  let totalDurationMs = 0;

  for (const s of sessions) {
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

  // Fallback if chapters exist from cloud before sessions
  if (sessions.length === 0 && completedChapterList.length > 0) {
    for (const c of completedChapterList) {
      totalWpmSum += Number(c.bestWpm) || 0;
      totalCpmSum += Number(c.bestCpm) || 0;
      totalAccSum += Number(c.bestAccuracy) || 100;
      if ((c.bestWpm || 0) > bestWpm) bestWpm = c.bestWpm;
      if ((c.bestCpm || 0) > bestCpm) bestCpm = c.bestCpm;
      totalVersesTyped += Number(c.versesCount) || 0;
    }
  }

  const denom = sessions.length || completedChapterList.length || 0;
  const avgWpm = denom > 0 ? Math.round((totalWpmSum / denom) * 10) / 10 : 0;
  const avgCpm = denom > 0 ? Math.round(totalCpmSum / denom) : 0;
  const avgAccuracy = denom > 0 ? Math.round((totalAccSum / denom) * 10) / 10 : 100;

  // Per-translation completeness breakdown
  const byTranslation = {};
  for (const t of BIBLE_TRANSLATIONS) {
    byTranslation[t.code] = {
      code: t.code,
      name: t.name,
      shortName: t.shortName,
      completedChapters: 0,
      percentage: 0,
      sessionsCount: 0,
      bestWpm: 0,
      bestCpm: 0
    };
  }

  for (const c of completedChapterList) {
    const trMap = c.translations || {};
    for (const [trCode, trStat] of Object.entries(trMap)) {
      if (!byTranslation[trCode]) {
        byTranslation[trCode] = {
          code: trCode,
          name: trCode,
          shortName: trCode,
          completedChapters: 0,
          percentage: 0,
          sessionsCount: 0,
          bestWpm: 0,
          bestCpm: 0
        };
      }
      byTranslation[trCode].completedChapters += 1;
      byTranslation[trCode].sessionsCount += Number(trStat.count) || 1;
      byTranslation[trCode].bestWpm = Math.max(byTranslation[trCode].bestWpm, Number(trStat.bestWpm) || 0);
      byTranslation[trCode].bestCpm = Math.max(byTranslation[trCode].bestCpm, Number(trStat.bestCpm) || 0);
    }
  }

  for (const trObj of Object.values(byTranslation)) {
    trObj.percentage = Math.round((trObj.completedChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;
  }

  return {
    overallCompletedChapters,
    totalBibleChapters: TOTAL_BIBLE_CHAPTERS,
    overallPercentage,
    otCompletedChapters,
    totalOtChapters: TOTAL_OT_CHAPTERS,
    ntCompletedChapters,
    totalNtChapters: TOTAL_NT_CHAPTERS,
    completedBooksCount,
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
    sessionsCount: sessions.length,
    chaptersMap: mergedChapters,
    sessions,
    byTranslation
  };
}

// ── Cloud Sync Helpers ──────────────────────────────────────────
async function fetchWithAuth(url, options = {}) {
  if (!Auth.isTokenValid()) {
    await attemptSilentGoogleRefresh();
  }
  const token = Auth.getToken();
  if (!token) throw new Error('Not authenticated');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
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

    if (profileData && profileData.profile && profileData.profile.preferredTranslation) {
      latestStore.preferredTranslation = profileData.profile.preferredTranslation;
    }

    if (progressData) {
      const cloudChapters = progressData.chapters || {};
      const cloudSessions = Array.isArray(progressData.sessions) ? progressData.sessions : [];

      // Merge chapters
      const mergedChapters = { ...latestStore.chapters };
      for (const [key, cloudCh] of Object.entries(cloudChapters)) {
        const localCh = mergedChapters[key];
        if (!localCh) {
          mergedChapters[key] = cloudCh;
        } else {
          mergedChapters[key] = {
            ...localCh,
            ...cloudCh,
            completedCount: Math.max(localCh.completedCount || 0, cloudCh.completedCount || 0),
            bestWpm: Math.max(localCh.bestWpm || 0, cloudCh.bestWpm || 0),
            bestCpm: Math.max(localCh.bestCpm || 0, cloudCh.bestCpm || 0),
            bestAccuracy: Math.max(localCh.bestAccuracy || 0, cloudCh.bestAccuracy || 0),
            translations: {
              ...(localCh.translations || {}),
              ...(cloudCh.translations || {})
            }
          };
        }
      }
      latestStore.chapters = mergedChapters;

      // Merge sessions by sessionId
      const sessionMap = new Map();
      for (const s of latestStore.sessions) {
        if (s && s.sessionId) sessionMap.set(s.sessionId, s);
      }
      for (const s of cloudSessions) {
        if (s && s.sessionId) sessionMap.set(s.sessionId, s);
      }

      // If local had sessions that weren't in cloud yet, push them up
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
  } catch (err) {
    console.warn('Cloud sync warning:', err);
  } finally {
    isSyncing = false;
  }
}

export const Api = {
  syncLocalToCloud,
  recordCompletedChapter,
  getGlobalTypingStats,
  getPreferredTranslation,
  setPreferredTranslation
};
