import { CONFIG } from './config.js?v=20261104_v6';
import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  TOTAL_BIBLE_CHAPTERS,
  TOTAL_OT_CHAPTERS,
  TOTAL_NT_CHAPTERS,
  TOTAL_BIBLE_VERSES,
  getChapterVerseCount,
  getBookById
} from './bible-data.js?v=20261104_v6';

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
          isRefreshingToken = false;
          return true;
        }
      }
    }
  } catch (e) {}

  isRefreshingToken = false;
  return false;
}

// ── Local & Cloud Store ─────────────────────────────────────────
function createDefaultStore() {
  return {
    preferredTranslation: 'ESV',
    skipCompletedVerses: true,
    lastBookId: 1,
    lastChapter: 1,
    lastVerse: null,
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
          skipCompletedVerses: parsed.skipCompletedVerses !== false,
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

export function getSkipCompletedVersesPref() {
  const store = getLocalStore();
  return store.skipCompletedVerses !== false;
}

export function setSkipCompletedVersesPref(skip) {
  const store = getLocalStore();
  store.skipCompletedVerses = Boolean(skip);
  saveLocalStore(store);
}

export function setLastSelectedChapter(bookId, chapter, verse = null) {
  const store = getLocalStore();
  store.lastBookId = Number(bookId) || 1;
  store.lastChapter = Number(chapter) || 1;
  store.lastVerse = verse ? Number(verse) : null;
  saveLocalStore(store);
}

// ── Chapter & Verse Completion Helpers ──────────────────────────
export function isChapterRecordFullyCompleted(rec) {
  if (!rec) return false;
  if (rec.isFullyCompleted === true) return true;
  const completedVersesObj = rec.completedVerses || {};
  const completedCount = Object.keys(completedVersesObj).length;
  if (rec.totalVerses > 0 && completedCount >= rec.totalVerses) return true;
  // Backward compatibility for chapter records created before per-verse tracking
  if (completedCount === 0 && (rec.completedCount || 0) > 0 && rec.isFullyCompleted !== false) {
    return true;
  }
  return false;
}

export function isVerseCompletedInRecord(rec, verseNum, translationFilter = 'ALL') {
  if (!rec) return false;
  const vKey = String(verseNum);
  const vRec = rec.completedVerses?.[vKey];
  if (vRec) {
    if (translationFilter === 'ALL') return true;
    return Boolean(vRec.translations?.[translationFilter]);
  }
  // Legacy full-chapter completion fallback
  if (!rec.completedVerses || Object.keys(rec.completedVerses).length === 0) {
    if ((rec.completedCount || 0) > 0 && rec.isFullyCompleted !== false) {
      if (translationFilter === 'ALL') return true;
      return Boolean(rec.translations?.[translationFilter]);
    }
  }
  return false;
}

export function getChapterProgressSummary(bookId, chapter, translationFilter = 'ALL') {
  const store = getLocalStore();
  const key = `${Number(bookId)}:${Number(chapter)}`;
  const rec = store.chapters?.[key] || null;
  if (!rec) {
    return {
      hasAnyProgress: false,
      isFullyCompleted: false,
      isPartial: false,
      completedVersesCount: 0,
      totalVerses: getChapterVerseCount(bookId, chapter),
      completedVerseNums: [],
      bestWpm: 0,
      bestCpm: 0,
      record: null
    };
  }

  const totalVerses = Math.max(Number(rec.totalVerses) || 0, getChapterVerseCount(bookId, chapter)) || Number(rec.versesCount) || 0;
  const completedVersesObj = rec.completedVerses || {};
  let completedVerseNums = Object.keys(completedVersesObj)
    .map(k => Number(k))
    .filter(n => {
      if (n < 1) return false;
      if (translationFilter === 'ALL') return true;
      return Boolean(completedVersesObj[String(n)]?.translations?.[translationFilter]);
    })
    .sort((a, b) => a - b);

  let isFullyCompleted = false;
  if (translationFilter === 'ALL') {
    isFullyCompleted = isChapterRecordFullyCompleted(rec);
    if (isFullyCompleted && completedVerseNums.length === 0 && totalVerses > 0) {
      completedVerseNums = Array.from({ length: totalVerses }, (_, i) => i + 1);
    }
  } else {
    const trStat = rec.translations?.[translationFilter];
    if (trStat) {
      if (trStat.isFullyCompleted) {
        isFullyCompleted = true;
      } else if (totalVerses > 0 && completedVerseNums.length >= totalVerses) {
        isFullyCompleted = true;
      } else if ((!rec.completedVerses || Object.keys(rec.completedVerses).length === 0) && trStat.count > 0) {
        isFullyCompleted = true;
      }
    }
  }

  const completedVersesCount = isFullyCompleted && totalVerses > 0
    ? Math.max(completedVerseNums.length, totalVerses)
    : completedVerseNums.length;
  const hasAnyProgress = isFullyCompleted || completedVersesCount > 0;
  const isPartial = hasAnyProgress && !isFullyCompleted;

  return {
    hasAnyProgress,
    isFullyCompleted,
    isPartial,
    completedVersesCount,
    totalVerses,
    completedVerseNums,
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
  const wpm = Number(session.wpm) || 0;
  const cpm = Number(session.cpm) || 0;
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
    const vWpm = vs ? Number(vs.wpm) || 0 : wpm;
    const vCpm = vs ? Number(vs.cpm) || 0 : cpm;
    const vAcc = vs ? Number(vs.accuracy) || 100 : accuracy;
    prevCompletedVerses[vKey] = {
      verse: vNum,
      count: (prevV?.count || 0) + 1,
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
  const isNowFullyCompleted = Boolean(
    wasFullyCompleted ||
    session.isFullChapter ||
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
 * Record a single completed verse immediately (supports both Single-Verse Mode and Partial/Full Chapter Mode).
 * The sitting's session is updated in-place (same sessionId) so partial chapter progress is saved after every
 * verse without creating a new history row per verse.
 */
export async function recordCompletedVerse(verseData) {
  const store = getLocalStore();
  const bookId = Number(verseData.bookId) || 1;
  const book = getBookById(bookId);
  const chapter = Number(verseData.chapter) || 1;
  const verse = Number(verseData.verse) || 1;
  const totalChapterVerses = Math.max(Number(verseData.totalChapterVerses) || 0, getChapterVerseCount(book.id, chapter));
  const allVerseNumbers = Array.isArray(verseData.allVerseNumbers) ? verseData.allVerseNumbers.map(Number) : [];
  const translation = String(verseData.translation || store.preferredTranslation || 'ESV').toUpperCase();
  const wpm = Math.max(0, Math.round((Number(verseData.wpm) || 0) * 10) / 10);
  const cpm = Math.max(0, Math.round(Number(verseData.cpm) || 0));
  const accuracy = Math.min(100, Math.max(0, Math.round((Number(verseData.accuracy) ?? 100) * 10) / 10));
  const charsTyped = Math.max(0, Math.round(Number(verseData.charsTyped) || 0));
  const wordsTyped = Math.max(0, Math.round(Number(verseData.wordsTyped) || 0));
  const mistakes = Math.max(0, Math.round(Number(verseData.mistakes) || 0));
  const durationMs = Math.max(0, Math.round(Number(verseData.durationMs) || 0));
  const completedAt = verseData.completedAt || new Date().toISOString();
  const sessionId = verseData.sittingSessionId || verseData.sessionId || `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const chapterKey = `${book.id}:${chapter}`;
  const prevChapter = store.chapters[chapterKey];
  const wasChapterComplete = isChapterRecordFullyCompleted(prevChapter);
  const wasVerseCompleteOverall = isVerseCompletedInRecord(prevChapter, verse, 'ALL');
  const wasVerseCompleteInTr = isVerseCompletedInRecord(prevChapter, verse, translation);
  const prevBestWpm = prevChapter?.completedVerses?.[String(verse)]?.bestWpm || 0;
  const isNewVersePersonalBest = wpm > prevBestWpm;

  // Does this verse complete the chapter in this translation? (uses the verses that actually exist in the loaded text)
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

  const verseStatEntry = { wpm, cpm, accuracy };

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
    const aggCpm = Math.round(totalChars / mins);
    const aggWpm = Math.round((totalChars / 5 / mins) * 10) / 10;
    const aggAcc = Math.round((((Number(prevS.accuracy) || 100) * prevVersesList.length + accuracy) / (prevVersesList.length + 1)) * 10) / 10;

    sessionObj = {
      ...prevS,
      sessionId,
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
  const totalChapterVerses = Math.max(versesTyped, Number(sessionData.totalChapterVerses) || versesTyped);
  const completedVerseNumbers = Array.isArray(sessionData.completedVerseNumbers) && sessionData.completedVerseNumbers.length > 0
    ? sessionData.completedVerseNumbers
    : Array.from({ length: totalChapterVerses }, (_, i) => i + 1);
  const verseRange = String(sessionData.verseRange || formatVerseNumbersRange(completedVerseNumbers));
  const mistakes = Math.max(0, Math.round(Number(sessionData.mistakes) || 0));
  const durationMs = Math.max(0, Math.round(Number(sessionData.durationMs) || 0));
  const completedAt = sessionData.completedAt || new Date().toISOString();
  const sessionId = sessionData.sittingSessionId || sessionData.sessionId || `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const chapterKey = `${book.id}:${chapter}`;
  const prevChapter = store.chapters[chapterKey];
  const wasFullyCompleted = isChapterRecordFullyCompleted(prevChapter);
  const isNewPersonalBest = !prevChapter || wpm > (prevChapter.bestWpm || 0);
  const isFirstTimeOverall = !wasFullyCompleted;
  const isFirstTimeInTranslation = !prevChapter?.translations?.[translation]?.isFullyCompleted;

  const newSession = {
    sessionId,
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

// ── Compute Comprehensive Typing & Bible Reach Statistics ────────
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
    const reflected = rec && (verses.length === 0 || verses.every(v => isVerseCompletedInRecord(rec, v, normalized.translation)));
    if (!reflected) {
      mergedChapters[key] = applySessionToChapterRecord(rec, normalized, normalized.totalChapterVerses || 0);
    }
  }

  const allChapterRecords = Object.values(mergedChapters);
  const fullyCompletedChaptersList = allChapterRecords.filter(c => isChapterRecordFullyCompleted(c));
  const partialChaptersList = allChapterRecords.filter(c => !isChapterRecordFullyCompleted(c) && (Object.keys(c.completedVerses || {}).length > 0));

  const overallCompletedChapters = fullyCompletedChaptersList.length;
  const partialChaptersCount = partialChaptersList.length;
  const overallPercentage = Math.round((overallCompletedChapters / TOTAL_BIBLE_CHAPTERS) * 1000) / 10;

  // Count unique completed verses across all chapters
  let overallCompletedVerses = 0;
  for (const c of allChapterRecords) {
    const vCount = Object.keys(c.completedVerses || {}).length;
    if (isChapterRecordFullyCompleted(c)) {
      overallCompletedVerses += Math.max(vCount, Number(c.totalVerses) || Number(c.versesCount) || 0);
    } else {
      overallCompletedVerses += vCount;
    }
  }
  const overallVersesPercentage = Math.round((overallCompletedVerses / TOTAL_BIBLE_VERSES) * 1000) / 10;

  let otCompletedChapters = 0;
  let ntCompletedChapters = 0;
  for (const c of fullyCompletedChaptersList) {
    if (Number(c.bookId) <= 39) otCompletedChapters++;
    else ntCompletedChapters++;
  }

  // Count books fully completed (overall)
  let completedBooksCount = 0;
  for (const book of BIBLE_BOOKS) {
    let doneInBook = 0;
    for (let ch = 1; ch <= book.chapters; ch++) {
      if (isChapterRecordFullyCompleted(mergedChapters[`${book.id}:${ch}`])) doneInBook++;
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

  if (sessions.length === 0 && allChapterRecords.length > 0) {
    for (const c of allChapterRecords) {
      totalWpmSum += Number(c.bestWpm) || 0;
      totalCpmSum += Number(c.bestCpm) || 0;
      totalAccSum += Number(c.bestAccuracy) || 100;
      if ((c.bestWpm || 0) > bestWpm) bestWpm = c.bestWpm;
      if ((c.bestCpm || 0) > bestCpm) bestCpm = c.bestCpm;
      totalVersesTyped += Object.keys(c.completedVerses || {}).length || Number(c.versesCount) || 0;
    }
  }

  const denom = sessions.length || allChapterRecords.length || 0;
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
    overallCompletedChapters,
    partialChaptersCount,
    totalBibleChapters: TOTAL_BIBLE_CHAPTERS,
    overallPercentage,
    overallCompletedVerses,
    totalBibleVerses: TOTAL_BIBLE_VERSES,
    overallVersesPercentage,
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
  const isFullyCompleted = Boolean(
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

    if (profileData && profileData.profile && profileData.profile.preferredTranslation) {
      latestStore.preferredTranslation = profileData.profile.preferredTranslation;
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
  getGlobalTypingStats,
  getPreferredTranslation,
  setPreferredTranslation,
  getSkipCompletedVersesPref,
  setSkipCompletedVersesPref,
  getChapterProgressSummary,
  isChapterRecordFullyCompleted,
  isVerseCompletedInRecord
};
