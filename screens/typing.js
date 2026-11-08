import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  getBookById,
  getTranslationByCode,
  getNextChapterRef,
  getPrevChapterRef,
  searchBibleChapters,
  fetchChapterVerses,
  getCachedChapterVerses,
  prefetchChapterVerses,
  getRandomVerseRef,
  getNextPreloadedRandomVerse,
  replenishRandomVersePreloads
} from '../bible-data.js?v=20261108_v15';
import {
  getLocalStore,
  getPreferredTranslation,
  setPreferredTranslation,
  getSkipCompletedVersesPref,
  setSkipCompletedVersesPref,
  getShowTypingStatsPref,
  setShowTypingStatsPref,
  getSingleVerseModePref,
  setSingleVerseModePref,
  getAutoAdvancePref,
  setAutoAdvancePref,
  getShuffleVersesPref,
  setShuffleVersesPref,
  getActiveModePref,
  setActiveModePref,
  getMeditateModePref,
  setMeditateModePref,
  getMeditatePalettePref,
  setMeditatePalettePref,
  DEFAULT_MEDITATE_PALETTE,
  pushRandomVerseHistory,
  popRandomVerseHistory,
  pushRandomVerseForward,
  popRandomVerseForward,
  clearRandomVerseForward,
  setLastSelectedChapter,
  recordCompletedVerse,
  recordCompletedChapter,
  recordSpokenVerse,
  recordSpokenChapter,
  getGlobalTypingStats,
  getChapterProgressSummary,
  isVerseCompletedInRecord,
  isVerseRead,
  isVerseTyped,
  isVerseSpoken,
  toggleChapterRead,
  toggleVerseRead,
  saveVerseDrawing,
  getVerseDrawing,
  deleteVerseDrawing,
  saveVerseMeditation,
  getVerseMeditation,
  deleteVerseMeditation,
  toggleVerseFavorite,
  isVerseFavorited,
  getAllBookmarks,
  getRecentBookmarks,
  findBookmarkByName,
  isVerseBookmarked,
  getBookmarksForVerse,
  createBookmark,
  updateBookmarkLocation,
  getMeditateFontPref,
  setMeditateFontPref,
  getMeditateFontSizePref,
  setMeditateFontSizePref,
  getMeditateFontCasePref,
  setMeditateFontCasePref,
  getMeditateFontColorPref,
  setMeditateFontColorPref,
  getMeditateBoxWidthPref,
  setMeditateBoxWidthPref,
  DEFAULT_MEDITATE_FONT,
  DEFAULT_MEDITATE_FONT_SIZE,
  DEFAULT_MEDITATE_FONT_CASE,
  DEFAULT_MEDITATE_FONT_COLOR,
  DEFAULT_MEDITATE_BOX_WIDTH
} from '../api.js?v=20261108_v15';
import {
  renderMeditateArtworkSvg,
  TOTAL_MEDITATE_ART_TEMPLATES
} from '../meditate-art.js?v=20261108_v15';
import { trackEvent } from '../analytics.js?v=20261108_v15';
import { navigate } from '../router.js?v=20261108_v15';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const NUMBER_WORDS_MAP = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen', '14': 'fourteen',
  '15': 'fifteen', '16': 'sixteen', '17': 'seventeen', '18': 'eighteen', '19': 'nineteen',
  '20': 'twenty', '30': 'thirty', '40': 'forty', '50': 'fifty', '60': 'sixty',
  '70': 'seventy', '80': 'eighty', '90': 'ninety', '100': 'hundred', '1000': 'thousand'
};

export function normalizeSpokenWord(raw) {
  const cleaned = String(raw || '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '')
    .replace(/'s$/g, 's')
    .replace(/'/g, '');
  return NUMBER_WORDS_MAP[cleaned] || cleaned;
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

export function computeWordSimilarity(spokenRaw, targetClean) {
  const spoken = normalizeSpokenWord(spokenRaw);
  const target = normalizeSpokenWord(targetClean);
  if (!target && !spoken) return 1;
  if (!target || !spoken) return 0;
  if (spoken === target) return 1;
  const dist = editDistance(spoken, target);
  const maxLen = Math.max(spoken.length, target.length, 1);
  return Math.max(0, 1 - dist / maxLen);
}

export function isSpokenWordMatch(spokenRaw, targetClean) {
  const spoken = normalizeSpokenWord(spokenRaw);
  const target = normalizeSpokenWord(targetClean);
  if (!target) return true;
  if (!spoken) return false;
  if (spoken === target) return true;
  // Allow slight 1-character phonetic variation on longer words (6+ chars, e.g. biblical proper nouns)
  if (target.length >= 6 && spoken.length >= 4 && editDistance(spoken, target) <= 1) {
    return true;
  }
  return false;
}

export function evaluateSpokenWord(spokenRaw, targetClean, recognizerConfidence = 0.92) {
  const spoken = normalizeSpokenWord(spokenRaw);
  const target = normalizeSpokenWord(targetClean);
  const rawConf = (typeof recognizerConfidence === 'number' && recognizerConfidence > 0)
    ? recognizerConfidence
    : 0.92;
  const normConf = Math.min(1, Math.max(0.55, rawConf / 0.93));

  if (!target) {
    return { matched: true, exact: true, similarity: 1, pronunciationScore: 100, enunciationScore: 100 };
  }
  if (!spoken) {
    return { matched: false, exact: false, similarity: 0, pronunciationScore: 0, enunciationScore: 25 };
  }
  const sim = computeWordSimilarity(spoken, target);
  if (spoken === target) {
    const enun = Math.round(Math.min(100, (normConf * 0.55 + 0.45) * 100));
    return { matched: true, exact: true, similarity: 1, pronunciationScore: 100, enunciationScore: enun };
  }
  if (target.length >= 6 && spoken.length >= 4 && editDistance(spoken, target) <= 1) {
    const enun = Math.round(Math.min(95, (normConf * 0.45 + sim * 0.55) * 92));
    return { matched: true, exact: false, similarity: sim, pronunciationScore: 92, enunciationScore: enun };
  }
  const enun = Math.round(Math.max(20, sim * 68));
  return { matched: false, exact: false, similarity: sim, pronunciationScore: 0, enunciationScore: enun };
}

export function getCadenceDescriptor(wpm) {
  const val = Number(wpm) || 0;
  if (val <= 0) return { label: '—', shortLabel: '', badgeClass: '' };
  if (val < 85) return { label: 'Slow & Reflective', shortLabel: 'Reflective', badgeClass: 'is-sky' };
  if (val < 110) return { label: 'Contemplative Pace', shortLabel: 'Contemplative', badgeClass: 'is-emerald' };
  if (val <= 155) return { label: 'Natural Cadence', shortLabel: 'Natural', badgeClass: 'is-emerald' };
  if (val <= 180) return { label: 'Brisk Pace', shortLabel: 'Brisk', badgeClass: 'is-lavender' };
  return { label: 'Rapid / Rushed', shortLabel: 'Rapid', badgeClass: 'is-amber' };
}

export function renderTypingScreen(container, params = {}) {
  const store = getLocalStore();
  const initialBookId = Number(params.bookId) || store.lastBookId || 1;
  const book = getBookById(initialBookId);
  const initialChapter = Math.max(1, Math.min(Number(params.chapter) || store.lastChapter || 1, book.chapters));
  let singleVerseMode = Boolean(params.singleVerseMode && params.verse);
  let targetSingleVerseNum = singleVerseMode ? Math.max(1, Number(params.verse) || 1) : null;
  let requestedStartVerse = !singleVerseMode && params.startVerse ? Math.max(1, Number(params.startVerse)) : null;

  let activeTranslation = getPreferredTranslation() || 'ESV';
  let skipCompletedVerses = getSkipCompletedVersesPref();
  let showTypingStats = getShowTypingStatsPref();
  let autoAdvance = getAutoAdvancePref();
  let shuffleVerses = getShuffleVersesPref();
  let activeMode = ['type', 'speak', 'draw'].includes(params.mode) ? params.mode : getActiveModePref();
  if (!singleVerseMode && activeMode === 'draw') {
    activeMode = 'type';
  }
  let meditateMode = activeMode === 'draw';
  let meditatePalette = getMeditatePalettePref();
  let activePaletteIndex = 0;
  let currentArtworkTemplateIdx = Math.abs((book.id * 31 + initialChapter * 7 + (targetSingleVerseNum || 1))) % TOTAL_MEDITATE_ART_TEMPLATES;

  // Speak mode state
  let micEnabled = true; // Enabled by default when in Speak mode
  let speechRecognition = null;
  let speechSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  let wordsList = []; // [{ wordIdx, verse, vIdx, rawWord, cleanWord, startCharIdx, endCharIdx, nextCursorCharIdx, isLastWordOfVerse, wordEl }]
  let charToWordIdxMap = [];
  let currentWordIdx = 0;
  let speechProcessedMap = new Map(); // resultIndex -> number of tokens processed
  let speechInterimErrorTimer = null;
  let speechAutoAdvanceTimer = null;
  let spokenWordErrors = []; // [{ wordIdx, verse, expected, spoken }]
  let verseSpokenWordErrors = [];
  let spokenWordsEvaluated = 0;
  let spokenWordsCorrect = 0;
  let spokenPronunciationSum = 0;
  let spokenEnunciationSum = 0;
  let verseSpokenWordsEvaluated = 0;
  let verseSpokenWordsCorrect = 0;
  let verseSpokenPronunciationSum = 0;
  let verseSpokenEnunciationSum = 0;
  let spokenWordStatusMap = new Map(); // wordIdx -> 'correct' | 'error'

  setLastSelectedChapter(book.id, initialChapter, targetSingleVerseNum || requestedStartVerse || null);

  const prevChapterRef = getPrevChapterRef(book.id, initialChapter);
  const nextChapterRef = getNextChapterRef(book.id, initialChapter);
  const chapterKey = `${book.id}:${initialChapter}`;

  // Cleanup any previous active session before setting up the new one
  if (window.__bibleTypingCleanup) {
    const prevCleanup = window.__bibleTypingCleanup;
    window.__bibleTypingCleanup = null;
    prevCleanup();
  }

  // Reset scroll and lock screen to viewport height
  window.scrollTo(0, 0);
  document.documentElement.classList.add('typing-active-view');
  document.body.classList.add('typing-active-view');

  // Active typing/speaking session state
  let allChapterVerses = []; // Full chapter verses from API
  let verses = []; // Verses rendered in viewport (either all chapter verses or 1 verse in singleVerseMode)
  let verseRanges = []; // [{ verse, vIdx, startCharIdx, wordEndIdx, endCharIdx, charCount, wordCount, verseBlockEl, supEl }]
  let targetChars = [];
  let charToVerseMap = [];
  let charToVerseIdxMap = [];
  let charEls = [];
  let completedVerseSet = new Set(); // Set of verse numbers completed in this chapter
  let sittingTypedVersesSet = new Set(); // Set of verse numbers typed/spoken during this sitting

  let cursorIdx = 0;
  let errorBuffer = [];
  let startTime = null;
  let elapsedMs = 0;
  let timerInterval = null;
  let totalKeystrokes = 0;
  let correctKeystrokes = 0;
  let mistakes = 0;
  let isCompleted = false;

  // Per-verse live telemetry for accurate single-verse recording
  let verseStartTime = null;
  let verseKeystrokes = 0;
  let verseCorrectKeystrokes = 0;
  let verseMistakes = 0;
  let lastSkipJumpTime = 0;
  let sittingSessionId = `${activeMode === 'speak' ? 'spk' : 's'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let lastTrackedCursorVerse = null;

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (speechAutoAdvanceTimer) {
      clearTimeout(speechAutoAdvanceTimer);
      speechAutoAdvanceTimer = null;
    }
  }

  function stopSpeechRecognition() {
    if (speechInterimErrorTimer) {
      clearTimeout(speechInterimErrorTimer);
      speechInterimErrorTimer = null;
    }
    if (speechRecognition) {
      try {
        speechRecognition.onresult = null;
        speechRecognition.onerror = null;
        speechRecognition.onend = null;
        speechRecognition.stop();
      } catch (_) {}
      speechRecognition = null;
    }
  }

  let onWindowKeydown = null;
  let onStatsUpdated = null;
  let onFavoritesUpdated = null;
  let onBookmarksUpdated = null;
  let onWindowWheel = null;
  function cleanup() {
    clearTimer();
    stopSpeechRecognition();
    document.documentElement.classList.remove('typing-active-view');
    document.body.classList.remove('typing-active-view');
    if (onWindowKeydown) {
      window.removeEventListener('keydown', onWindowKeydown);
      onWindowKeydown = null;
    }
    if (onStatsUpdated) {
      window.removeEventListener('bible:stats-updated', onStatsUpdated);
      onStatsUpdated = null;
    }
    if (onFavoritesUpdated) {
      window.removeEventListener('bible:favorites-updated', onFavoritesUpdated);
      onFavoritesUpdated = null;
    }
    if (onBookmarksUpdated) {
      window.removeEventListener('bible:bookmarks-updated', onBookmarksUpdated);
      onBookmarksUpdated = null;
    }
    if (onWindowWheel) {
      window.removeEventListener('wheel', onWindowWheel);
      onWindowWheel = null;
    }
  }
  window.__bibleTypingCleanup = cleanup;

  function loadCompletedVersesFromStore() {
    const latestStore = getLocalStore();
    const rec = latestStore.chapters?.[chapterKey] || null;
    const set = new Set();
    if (rec && allChapterVerses.length > 0) {
      for (const v of allChapterVerses) {
        if (isVerseCompletedInRecord(rec, v.verse, 'ALL')) {
          set.add(v.verse);
        }
      }
    }
    return { set, rec };
  }

  function getProgressBadgeHtml() {
    const summary = getChapterProgressSummary(book.id, initialChapter, activeTranslation);
    const totalV = summary.totalVerses || allChapterVerses.length || 0;
    const trText = activeTranslation ? ` · ${getTranslationByCode(activeTranslation).shortName}` : '';

    if (singleVerseMode && targetSingleVerseNum) {
      const vRec = summary.record?.completedVerses?.[String(targetSingleVerseNum)];
      const vIsRead = Boolean(summary.isFullyRead || vRec?.isRead);
      const vIsSpoken = Boolean(summary.isFullySpoken || vRec?.isSpoken);
      const vIsTyped = Boolean(summary.isFullyTyped || vRec?.isTyped || (!vIsSpoken && !vIsRead && vRec?.count && vRec.count > 0));
      const modesDone = [];
      if (vIsRead) modesDone.push('Read');
      if (vIsTyped) modesDone.push('Typed');
      if (vIsSpoken) modesDone.push('Spoken');
      if (modesDone.length >= 2) {
        return `
          <span class="chapter-completed-pill is-both" title="Verse ${targetSingleVerseNum} completed (${modesDone.join(' & ')})!">
            ✓ Verse ${targetSingleVerseNum} ${modesDone.join(' &amp;')}${vRec?.bestWpm ? ` · Best ${vRec.bestWpm} WPM` : ''}
          </span>
        `;
      }
      if (vIsTyped) {
        return `
          <span class="chapter-completed-pill is-done" title="Verse ${targetSingleVerseNum} completed in typing engine!">
            ✓ Verse ${targetSingleVerseNum} Typed${vRec?.bestWpm ? ` · Best ${vRec.bestWpm} WPM` : ''}
          </span>
        `;
      }
      if (vIsSpoken) {
        return `
          <span class="chapter-completed-pill is-spoken" title="Verse ${targetSingleVerseNum} completed in speak mode!">
            🗣️ Verse ${targetSingleVerseNum} Spoken
          </span>
        `;
      }
      if (vIsRead) {
        return `
          <span class="chapter-completed-pill is-read" title="Verse ${targetSingleVerseNum} marked as read!">
            📖 Verse ${targetSingleVerseNum} Read
          </span>
        `;
      }
      return '';
    }

    if (summary.isBoth) {
      const parts = [];
      if (summary.isFullyRead) parts.push('Read');
      if (summary.isFullyTyped) parts.push('Typed');
      if (summary.isFullySpoken) parts.push('Spoken');
      return `
        <span class="chapter-completed-pill is-both" title="All ${totalV} verses completed (${parts.join(' & ')})!">
          ✓ ${parts.join(' &amp; ')} (${totalV}/${totalV}v)${trText}${summary.bestWpm ? ` · Best ${summary.bestWpm} WPM` : ''}
        </span>
      `;
    }

    if (summary.isTypedOnly || (summary.isFullyTyped && !summary.isFullyRead && !summary.isFullySpoken)) {
      return `
        <span class="chapter-completed-pill is-done" title="All ${totalV} verses typed!">
          ✓ Typed (${totalV}/${totalV}v)${trText}${summary.bestWpm ? ` · Best ${summary.bestWpm} WPM` : ''}
        </span>
      `;
    }

    if (summary.isSpokenOnly || (summary.isFullySpoken && !summary.isFullyRead && !summary.isFullyTyped)) {
      return `
        <span class="chapter-completed-pill is-spoken" title="All ${totalV} verses spoken!">
          🗣️ Spoken (${totalV}/${totalV}v)${trText}
        </span>
      `;
    }

    if (summary.isReadOnly || (summary.isFullyRead && !summary.isFullyTyped && !summary.isFullySpoken)) {
      return `
        <span class="chapter-completed-pill is-read" title="All ${totalV} verses marked as read!">
          📖 Read (${totalV}/${totalV}v)
        </span>
      `;
    }

    return '';
  }

  function getModeBtnLabelHtml() {
    return '⚙️ Mode';
  }

  const initialVerseNum = singleVerseMode ? (targetSingleVerseNum || 1) : (requestedStartVerse || 1);
  const isInitialFav = isVerseFavorited(book.id, initialChapter, initialVerseNum);
  const isInitialBookmarked = isVerseBookmarked(book.id, initialChapter, initialVerseNum);
  const initialFavTooltip = singleVerseMode
    ? (isInitialFav ? 'Favourite (Saved)' : 'Favourite')
    : (isInitialFav ? `Favourite (v. ${initialVerseNum} Saved)` : `Favourite (v. ${initialVerseNum})`);
  const initialBookmarkTooltip = singleVerseMode
    ? (isInitialBookmarked ? 'Bookmark (Saved)' : 'Bookmark')
    : (isInitialBookmarked ? `Bookmark (v. ${initialVerseNum} Saved)` : `Bookmark (v. ${initialVerseNum})`);

  container.innerHTML = `
    <div class="typing-screen-container">
      <!-- Two-Line Summary Bar: Line 1 Navigation & Actions, Line 2 Live Telemetry -->
      <div class="typing-summary-bar">
        <!-- Line 1: Chapter Nav, Title, Mode & Action Controls -->
        <div class="summary-line summary-line-top">
          <div class="summary-nav-group">
            <button class="btn btn-secondary btn-sm summary-step-btn" id="prev-step-btn" title="Previous ${singleVerseMode ? 'Verse' : 'Chapter'}">‹</button>
            <div class="summary-heading">
              <h1 class="summary-title" id="telemetry-heading-title">
                ${singleVerseMode ? `${book.name} ${initialChapter}:${targetSingleVerseNum}` : `${book.name} ${initialChapter}`}
              </h1>
              <span class="summary-tr-tag" id="telemetry-translation-tag">${getTranslationByCode(activeTranslation).shortName}</span>
            </div>
            <button class="btn btn-secondary btn-sm summary-step-btn" id="next-step-btn" title="Next ${singleVerseMode ? 'Verse' : 'Chapter'}">›</button>
            <button type="button" class="btn btn-secondary btn-sm advance-step-btn" id="advance-step-btn" title="Advance to next verse (or press Enter)" ${singleVerseMode && !autoAdvance && activeMode !== 'draw' ? '' : 'hidden'}>
              ${(singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›'}
            </button>
            <button type="button" class="btn btn-secondary btn-sm meditate-mark-read-btn" id="meditate-mark-read-btn" title="Mark this verse as read" ${singleVerseMode && activeMode === 'draw' ? '' : 'hidden'}>
              <span id="meditate-mark-read-label">📖 Mark Read</span>
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm speak-mic-toggle-btn ${micEnabled ? 'is-mic-active' : ''}"
              id="speak-mic-toggle-btn"
              title="Toggle microphone for Speak Mode"
              ${activeMode === 'speak' ? '' : 'hidden'}
            >
              <span id="speak-mic-toggle-label">${micEnabled ? '🎙️ Mic On' : '🔇 Mic Off'}</span>
            </button>
            <span class="speak-status-pill" id="speak-status-pill" ${activeMode === 'speak' ? '' : 'hidden'}>
              Speak each word aloud...
            </span>
            <span id="telemetry-completed-badge">${getProgressBadgeHtml()}</span>
          </div>

          <div class="summary-actions-group">
            <button
              type="button"
              class="btn btn-secondary btn-sm summary-action-btn single-verse-fav-btn ${isInitialFav ? 'is-favorited' : ''}"
              id="single-verse-fav-btn"
              data-tooltip="${initialFavTooltip}"
              aria-label="${isInitialFav ? `Verse ${initialVerseNum} is in Favorites. Click to remove.` : `Save verse ${initialVerseNum} to Favorites`}"
            >
              <span id="single-verse-fav-icon">${isInitialFav ? '❤️' : '🤍'}</span>
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm summary-action-btn single-verse-bookmark-btn ${isInitialBookmarked ? 'is-bookmarked' : ''}"
              id="single-verse-bookmark-btn"
              data-tooltip="${initialBookmarkTooltip}"
              aria-label="${isInitialBookmarked ? `Verse ${initialVerseNum} is bookmarked. Click to view, update or add bookmarks.` : `Bookmark verse ${initialVerseNum}`}"
            >
              <svg class="bookmark-ribbon-icon" width="16" height="16" viewBox="0 0 24 24" fill="${isInitialBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm summary-action-btn single-verse-read-chapter-btn"
              id="single-verse-read-chapter-btn"
              title="Open the full chapter (${escapeHtml(book.name)} ${initialChapter})"
              ${singleVerseMode ? '' : 'hidden'}
            >
              📖 Read Full Chapter
            </button>
            <button type="button" class="btn btn-secondary btn-sm summary-action-btn typing-actions-btn" id="typing-actions-btn" title="General Options &amp; Actions">
              ⚡ Actions
            </button>
            <button type="button" class="btn btn-secondary btn-sm summary-action-btn typing-mode-btn" id="typing-mode-btn" title="Select Mode (Type, Draw, Speak) &amp; Mode Settings">
              <span id="typing-mode-btn-label">⚙️ Mode</span>
            </button>
          </div>
        </div>

        <!-- Line 2: Live Metrics / Telemetry (Toggled via Actions modal, shown in Type & Speak modes) -->
        <div class="summary-line summary-line-bottom" id="typing-summary-stats-line" ${(showTypingStats && activeMode !== 'draw') ? '' : 'hidden'}>
          <div class="summary-metrics-group">
            <div class="summary-stat-box">
              <span class="stat-lbl" id="live-stat-lbl-1">${activeMode === 'speak' ? 'Cadence' : 'WPM'}</span>
              <span class="stat-num" id="live-wpm">${activeMode === 'speak' ? '0 WPM' : '0'}</span>
            </div>
            <div class="summary-stat-divider">·</div>
            <div class="summary-stat-box">
              <span class="stat-lbl" id="live-stat-lbl-2">${activeMode === 'speak' ? 'Pronunciation' : 'CPM'}</span>
              <span class="stat-num" id="live-cpm">${activeMode === 'speak' ? '100%' : '0'}</span>
            </div>
            <div class="summary-stat-divider">·</div>
            <div class="summary-stat-box">
              <span class="stat-lbl" id="live-stat-lbl-3">${activeMode === 'speak' ? 'Enunciation' : 'Accuracy'}</span>
              <span class="stat-num" id="live-acc">100%</span>
            </div>
            <div class="summary-stat-divider">·</div>
            <div class="summary-stat-box">
              <span class="stat-lbl">Verse</span>
              <span class="stat-num" id="live-verse">-/-</span>
            </div>
            <div class="summary-stat-divider">·</div>
            <div class="summary-stat-box">
              <span class="stat-lbl">Time</span>
              <span class="stat-num" id="live-time">0:00</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Strict Backspace Error Banner (Only shown when an active typing mistake needs Backspace) -->
      <div class="typing-error-alert" id="typing-error-alert" hidden>
        <span>⌫ Mistyped character — press <strong>Backspace</strong> to fix before continuing</span>
      </div>

      <!-- Main Scripture Viewport (fills remaining viewport height) -->
      <div class="typing-viewport-wrapper" id="typing-viewport-wrapper">
        <input
          type="text"
          id="typing-hidden-input"
          class="typing-hidden-input"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          aria-label="Type the Bible passage"
        />

        <div class="typing-focus-banner" id="typing-focus-banner" hidden>
          <span id="typing-focus-banner-text">${activeMode === 'speak' ? '🎙️ Click any word or enable microphone to speak aloud' : '⌨️ Click any verse or press any key to resume typing'}</span>
        </div>

        <div class="typing-passage-scroll" id="typing-passage-scroll" ${singleVerseMode && activeMode === 'draw' ? 'hidden' : ''}>
          <div class="typing-passage-content" id="typing-passage-content">
            <div class="typing-loading-state">
              <div class="loading-spinner"></div>
              <p>Loading ${book.name} ${initialChapter}${singleVerseMode ? `:${targetSingleVerseNum}` : ''} (${getTranslationByCode(activeTranslation).shortName})...</p>
            </div>
          </div>

          <!-- End-of-Verse Speech Summary & Pronunciation Errors Card (Shown at end of Single Verse in Speak Mode) -->
          <div class="speak-end-summary-card" id="speak-end-summary-card" hidden></div>
        </div>

        <!-- Draw Mode Interactive Artwork & Verse Canvas (Full Height, No Scroll) -->
        <div class="meditate-canvas-wrapper" id="meditate-canvas-wrapper" ${singleVerseMode && activeMode === 'draw' ? '' : 'hidden'}></div>
      </div>

      <!-- Chapter / Verse Completion Modal -->
      <div class="completion-modal-backdrop" id="completion-modal-backdrop" hidden>
        <div class="completion-modal-card">
          <div class="completion-badge-icon">🎉</div>
          <h2 class="completion-title" id="completion-modal-title">
            ${singleVerseMode ? 'Verse Completed!' : 'Chapter Completed!'}
          </h2>
          <p class="completion-subtitle" id="completion-subtitle">
            ${book.name} ${initialChapter}${singleVerseMode ? `:${targetSingleVerseNum}` : ''} (${getTranslationByCode(activeTranslation).shortName})
          </p>

          <div class="completion-highlights" id="completion-highlights"></div>

          <div class="completion-stats-grid" id="completion-stats-grid">
            <div class="completion-stat-item" id="comp-wpm-box">
              <span class="c-stat-label" id="comp-lbl-wpm">${activeMode === 'speak' ? 'Cadence (WPM)' : 'Speed (WPM)'}</span>
              <span class="c-stat-val" id="comp-wpm">0</span>
            </div>
            <div class="completion-stat-item" id="comp-cpm-box">
              <span class="c-stat-label" id="comp-lbl-cpm">${activeMode === 'speak' ? 'Pronunciation' : 'Speed (CPM)'}</span>
              <span class="c-stat-val" id="comp-cpm">0</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label" id="comp-lbl-acc">${activeMode === 'speak' ? 'Enunciation' : 'Accuracy'}</span>
              <span class="c-stat-val" id="comp-acc">100%</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label">Chapter Reach</span>
              <span class="c-stat-val" id="comp-verses">0</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label" id="comp-lbl-chars">${activeMode === 'speak' ? 'Words Spoken' : 'Characters'}</span>
              <span class="c-stat-val" id="comp-chars">0</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label">Duration</span>
              <span class="c-stat-val" id="comp-time">0:00</span>
            </div>
          </div>

          <div class="completion-speech-errors" id="completion-speech-errors" hidden></div>

          <div class="completion-reach-summary" id="completion-reach-summary"></div>

          <div class="completion-actions" id="completion-actions">
            <button class="btn btn-secondary" id="comp-retry-btn">
              ↺ ${activeMode === 'speak' ? 'Speak Again' : 'Type Again'}
            </button>
            ${singleVerseMode ? `
              <button class="btn btn-secondary" id="comp-open-chapter-btn">
                📖 Open Entire Chapter (${book.name} ${initialChapter})
              </button>
            ` : `
              <a href="/progress" class="btn btn-secondary" id="comp-progress-btn">
                📊 View Progress
              </a>
            `}
            <button class="btn btn-primary" id="comp-next-btn">
              Next →
            </button>
          </div>
        </div>
      </div>

      <!-- 1. Mode Selection Modal (Base Layer of Stacked Modals) -->
      <div class="typing-options-backdrop mode-select-backdrop" id="mode-select-backdrop" hidden>
        <div class="typing-options-card mode-select-card" role="dialog" aria-modal="true" aria-labelledby="mode-select-title">
          <div class="typing-options-header">
            <h2 class="typing-options-title" id="mode-select-title">Mode</h2>
            <button type="button" class="options-close-btn" id="mode-select-close-btn" aria-label="Close mode modal">✕</button>
          </div>

          <div class="typing-options-body mode-radio-list" role="radiogroup" aria-label="Select Mode">
            <!-- Mode 1: Type -->
            <div class="mode-radio-item ${activeMode === 'type' ? 'is-selected' : ''}" data-mode-item="type">
              <label class="mode-radio-label" for="mode-radio-type">
                <input type="radio" name="bible-mode-radio" id="mode-radio-type" value="type" class="mode-radio-input" ${activeMode === 'type' ? 'checked' : ''} />
                <span class="mode-radio-custom"></span>
                <span class="mode-radio-info">
                  <strong class="mode-radio-name">⌨️ Type</strong>
                  <span class="mode-radio-desc">Type scripture character by character (${singleVerseMode ? 'Single Verse' : 'Chapter'})</span>
                </span>
              </label>
              <button type="button" class="btn btn-secondary btn-sm mode-settings-gear-btn" data-open-mode-settings="type" title="Type Mode Settings" aria-label="Type Mode Settings">
                ⚙️
              </button>
            </div>

            <!-- Mode 2: Draw -->
            <div class="mode-radio-item ${activeMode === 'draw' ? 'is-selected' : ''}" data-mode-item="draw">
              <label class="mode-radio-label" for="mode-radio-draw">
                <input type="radio" name="bible-mode-radio" id="mode-radio-draw" value="draw" class="mode-radio-input" ${activeMode === 'draw' ? 'checked' : ''} />
                <span class="mode-radio-custom"></span>
                <span class="mode-radio-info">
                  <strong class="mode-radio-name">🎨 Draw</strong>
                  <span class="mode-radio-desc">Color-by-numbers scripture artwork (Single Verse)</span>
                </span>
              </label>
              <button type="button" class="btn btn-secondary btn-sm mode-settings-gear-btn" data-open-mode-settings="draw" title="Draw Mode Settings" aria-label="Draw Mode Settings">
                ⚙️
              </button>
            </div>

            <!-- Mode 3: Speak -->
            <div class="mode-radio-item ${activeMode === 'speak' ? 'is-selected' : ''}" data-mode-item="speak">
              <label class="mode-radio-label" for="mode-radio-speak">
                <input type="radio" name="bible-mode-radio" id="mode-radio-speak" value="speak" class="mode-radio-input" ${activeMode === 'speak' ? 'checked' : ''} />
                <span class="mode-radio-custom"></span>
                <span class="mode-radio-info">
                  <strong class="mode-radio-name">🗣️ Speak</strong>
                  <span class="mode-radio-desc">Speak scripture aloud word by word (${singleVerseMode ? 'Single Verse' : 'Chapter'})</span>
                </span>
              </label>
              <button type="button" class="btn btn-secondary btn-sm mode-settings-gear-btn" data-open-mode-settings="speak" title="Speak Mode Settings" aria-label="Speak Mode Settings">
                ⚙️
              </button>
            </div>
          </div>

          <div class="typing-options-footer">
            <button type="button" class="btn btn-primary btn-sm" id="mode-select-done-btn">Done</button>
          </div>
        </div>
      </div>

      <!-- 2. Per-Mode Settings Modal (Stacked on top of Mode Modal) -->
      <div class="typing-options-backdrop mode-settings-backdrop" id="mode-settings-backdrop" hidden>
        <div class="typing-options-card mode-settings-card" role="dialog" aria-modal="true" aria-labelledby="mode-settings-title">
          <div class="typing-options-header">
            <h2 class="typing-options-title" id="mode-settings-title">⚙️ Mode Settings</h2>
            <button type="button" class="options-close-btn" id="mode-settings-close-btn" aria-label="Close mode settings">✕</button>
          </div>

          <!-- Type / Speak Settings Body: Radio Buttons for Chapter Mode & Single Verse Mode with Settings Gears -->
          <div class="typing-options-body mode-radio-list" id="mode-settings-type-speak-body">
            <!-- Scope 1: Chapter Mode -->
            <div class="mode-radio-item ${!singleVerseMode ? 'is-selected' : ''}" data-scope-item="chapter">
              <label class="mode-radio-label" for="scope-radio-chapter">
                <input type="radio" name="bible-scope-radio" id="scope-radio-chapter" value="chapter" class="mode-radio-input scope-radio-input" ${!singleVerseMode ? 'checked' : ''} />
                <span class="mode-radio-custom"></span>
                <span class="mode-radio-info">
                  <strong class="mode-radio-name">📖 Chapter Mode</strong>
                  <span class="mode-radio-desc">Practice the full chapter continuously verse by verse</span>
                </span>
              </label>
              <button type="button" class="btn btn-secondary btn-sm mode-settings-gear-btn scope-settings-gear-btn" data-open-scope-settings="chapter" title="Chapter Mode Settings" aria-label="Chapter Mode Settings">
                ⚙️
              </button>
            </div>

            <!-- Scope 2: Single Verse Mode -->
            <div class="mode-radio-item ${singleVerseMode ? 'is-selected' : ''}" data-scope-item="single">
              <label class="mode-radio-label" for="scope-radio-single">
                <input type="radio" name="bible-scope-radio" id="scope-radio-single" value="single" class="mode-radio-input scope-radio-input" ${singleVerseMode ? 'checked' : ''} />
                <span class="mode-radio-custom"></span>
                <span class="mode-radio-info">
                  <strong class="mode-radio-name">🎯 Single Verse Mode</strong>
                  <span class="mode-radio-desc">Focus on one verse at a time</span>
                </span>
              </label>
              <button type="button" class="btn btn-secondary btn-sm mode-settings-gear-btn scope-settings-gear-btn" data-open-scope-settings="single" title="Single Verse Mode Settings" aria-label="Single Verse Mode Settings">
                ⚙️
              </button>
            </div>
          </div>

          <!-- Draw Settings Body -->
          <div class="typing-options-body" id="mode-settings-draw-body" hidden>
            <label class="typing-option-row" for="toggle-draw-auto-advance-checkbox">
              <span class="option-title">Auto-Advance When Marking Read</span>
              <input type="checkbox" id="toggle-draw-auto-advance-checkbox" class="option-switch" ${autoAdvance ? 'checked' : ''} />
            </label>

            <label class="typing-option-row" for="toggle-draw-shuffle-checkbox">
              <span class="option-title">Shuffle Next Verses (Entire Bible)</span>
              <input type="checkbox" id="toggle-draw-shuffle-checkbox" class="option-switch" ${shuffleVerses ? 'checked' : ''} />
            </label>

            <div class="typing-option-row option-action-row">
              <span class="option-title">Default Artwork Typography</span>
              <button type="button" class="btn btn-secondary btn-sm" id="draw-reset-typography-btn">↺ Reset Font &amp; Size</button>
            </div>
          </div>

          <div class="typing-options-footer">
            <button type="button" class="btn btn-primary btn-sm" id="mode-settings-done-btn">Done</button>
          </div>
        </div>
      </div>

      <!-- 2b. Scope Settings Modal (Stacked on top of Mode Settings Modal) -->
      <div class="typing-options-backdrop scope-settings-backdrop" id="scope-settings-backdrop" hidden>
        <div class="typing-options-card scope-settings-card" role="dialog" aria-modal="true" aria-labelledby="scope-settings-title">
          <div class="typing-options-header">
            <h2 class="typing-options-title" id="scope-settings-title">⚙️ Scope Settings</h2>
            <button type="button" class="options-close-btn" id="scope-settings-close-btn" aria-label="Close scope settings">✕</button>
          </div>

          <!-- Chapter Mode Settings Body -->
          <div class="typing-options-body" id="scope-settings-chapter-body">
            <label class="typing-option-row" for="toggle-skip-done-checkbox">
              <span class="option-title">Jump Past Completed Verses</span>
              <input type="checkbox" id="toggle-skip-done-checkbox" class="option-switch" ${skipCompletedVerses ? 'checked' : ''} />
            </label>
          </div>

          <!-- Single Verse Mode Settings Body -->
          <div class="typing-options-body" id="scope-settings-single-body" hidden>
            <label class="typing-option-row" for="toggle-auto-advance-checkbox">
              <span class="option-title">Auto-Advance</span>
              <input type="checkbox" id="toggle-auto-advance-checkbox" class="option-switch" ${autoAdvance ? 'checked' : ''} />
            </label>

            <label class="typing-option-row" id="toggle-shuffle-row" for="toggle-shuffle-checkbox">
              <span class="option-title">Shuffle Next Verses (Entire Bible)</span>
              <input type="checkbox" id="toggle-shuffle-checkbox" class="option-switch" ${shuffleVerses ? 'checked' : ''} />
            </label>
          </div>

          <div class="typing-options-footer">
            <button type="button" class="btn btn-primary btn-sm" id="scope-settings-done-btn">Done</button>
          </div>
        </div>
      </div>

      <!-- 3. Actions Modal (General Options & Mark as Read) -->
      <div class="typing-options-backdrop typing-actions-backdrop" id="typing-actions-backdrop" hidden>
        <div class="typing-options-card typing-actions-card" role="dialog" aria-modal="true" aria-labelledby="typing-actions-title">
          <div class="typing-options-header">
            <h2 class="typing-options-title" id="typing-actions-title">⚡ Actions</h2>
            <button type="button" class="options-close-btn" id="actions-close-btn" aria-label="Close actions">✕</button>
          </div>

          <div class="typing-options-body">
            <!-- Mark as Read section (shown when not already on the main summary bar for that mode) -->
            <div id="actions-mark-read-section" ${singleVerseMode && activeMode === 'draw' ? 'hidden' : ''}>
              <div class="typing-options-section-divider" style="margin-top: 0;">
                <span>Mark as Read</span>
              </div>

              <!-- Mark Current Verse Read -->
              <div class="typing-option-row option-action-row" id="modal-mark-verse-row">
                <span class="option-title" id="modal-mark-verse-title">Verse ${targetSingleVerseNum || 1}</span>
                <button type="button" class="btn btn-secondary btn-sm mark-read-btn" id="modal-mark-verse-read-btn">
                  <span id="modal-mark-verse-read-label">📖 Mark Read</span>
                </button>
              </div>

              <!-- Mark Entire Chapter Read (shown in Chapter Mode) -->
              <div class="typing-option-row option-action-row" id="modal-mark-ch-row" ${singleVerseMode ? 'hidden' : ''}>
                <span class="option-title">${book.name} ${initialChapter} (Full Chapter)</span>
                <button type="button" class="btn btn-secondary btn-sm mark-read-btn" id="modal-mark-ch-read-btn">
                  <span id="modal-mark-ch-read-label">📖 Mark Read</span>
                </button>
              </div>
            </div>

            <div class="typing-options-section-divider">
              <span>General Options</span>
            </div>

            <!-- Toggle: Live Stats Bar -->
            <label class="typing-option-row" id="actions-stats-row" for="toggle-stats-checkbox" ${activeMode === 'draw' ? 'hidden' : ''}>
              <span class="option-title">Show Live Stats Bar</span>
              <input type="checkbox" id="toggle-stats-checkbox" class="option-switch" ${showTypingStats ? 'checked' : ''} />
            </label>

            <!-- Action: Restart Passage -->
            <div class="typing-option-row option-action-row" id="actions-restart-row" ${activeMode === 'draw' ? 'hidden' : ''}>
              <span class="option-title">Cursor Position</span>
              <button type="button" class="btn btn-secondary btn-sm" id="modal-restart-btn">↺ Reset to Start</button>
            </div>
          </div>

          <div class="typing-options-footer">
            <button type="button" class="btn btn-primary btn-sm" id="actions-done-btn">Done</button>
          </div>
        </div>
      </div>

      <!-- Bookmark Modal Backdrop -->
      <div class="typing-options-backdrop typing-bookmark-backdrop" id="typing-bookmark-backdrop" hidden>
        <div class="typing-options-card typing-bookmark-card" role="dialog" aria-modal="true" aria-labelledby="bookmark-modal-title">
          <div class="typing-options-header">
            <div>
              <h2 class="typing-options-title" id="bookmark-modal-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>Bookmark Verse
              </h2>
              <p class="bookmark-modal-subtitle" id="bookmark-modal-subtitle">
                ${escapeHtml(book.name)} ${initialChapter}:${targetSingleVerseNum || 1} (${getTranslationByCode(activeTranslation).shortName})
              </p>
            </div>
            <button type="button" class="options-close-btn" id="bookmark-close-btn" aria-label="Close bookmarks">✕</button>
          </div>

          <div class="typing-options-body">
            <!-- Search or Add Input -->
            <div class="bookmark-input-group">
              <input
                type="text"
                id="bookmark-search-input"
                class="bookmark-name-input"
                placeholder="Search or enter bookmark name..."
                autocomplete="off"
                maxlength="60"
              />
              <button type="button" class="btn btn-primary btn-sm" id="bookmark-save-btn">
                Save
              </button>
            </div>
            <div class="bookmark-feedback-msg" id="bookmark-feedback-msg" hidden></div>

            <!-- Recent Bookmarks Section -->
            <div class="bookmark-recent-section">
              <div class="bookmark-section-header">
                <span class="bookmark-section-title" id="bookmark-section-title">Recent Bookmarks</span>
                <a href="/bookmarks" class="bookmark-view-all-link" id="bookmark-view-all-link">Manage All & History ›</a>
              </div>
              <div class="bookmark-recent-list" id="bookmark-recent-list">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // DOM Elements
  const prevStepBtn = container.querySelector('#prev-step-btn');
  const nextStepBtn = container.querySelector('#next-step-btn');
  const advanceStepBtn = container.querySelector('#advance-step-btn');
  const singleFavBtn = container.querySelector('#single-verse-fav-btn');
  const singleFavIcon = container.querySelector('#single-verse-fav-icon');
  const readFullChapterBtn = container.querySelector('#single-verse-read-chapter-btn');
  const modeBtn = container.querySelector('#typing-mode-btn');
  const modeBtnLabel = container.querySelector('#typing-mode-btn-label');
  const actionsBtn = container.querySelector('#typing-actions-btn');
  const speakMicToggleBtn = container.querySelector('#speak-mic-toggle-btn');
  const speakMicToggleLabel = container.querySelector('#speak-mic-toggle-label');
  const speakStatusPill = container.querySelector('#speak-status-pill');

  // Mode Modal (Base), Mode Settings Modal (Stacked Level 2) & Scope Settings Modal (Stacked Level 3)
  const modeSelectBackdrop = container.querySelector('#mode-select-backdrop');
  const modeSelectCloseBtn = container.querySelector('#mode-select-close-btn');
  const modeSelectDoneBtn = container.querySelector('#mode-select-done-btn');
  const modeSettingsBackdrop = container.querySelector('#mode-settings-backdrop');
  const modeSettingsTitle = container.querySelector('#mode-settings-title');
  const modeSettingsCloseBtn = container.querySelector('#mode-settings-close-btn');
  const modeSettingsDoneBtn = container.querySelector('#mode-settings-done-btn');
  const modeSettingsTypeSpeakBody = container.querySelector('#mode-settings-type-speak-body');
  const modeSettingsDrawBody = container.querySelector('#mode-settings-draw-body');
  const scopeSettingsBackdrop = container.querySelector('#scope-settings-backdrop');
  const scopeSettingsTitle = container.querySelector('#scope-settings-title');
  const scopeSettingsCloseBtn = container.querySelector('#scope-settings-close-btn');
  const scopeSettingsDoneBtn = container.querySelector('#scope-settings-done-btn');
  const scopeSettingsChapterBody = container.querySelector('#scope-settings-chapter-body');
  const scopeSettingsSingleBody = container.querySelector('#scope-settings-single-body');

  // Actions Modal
  const actionsBackdrop = container.querySelector('#typing-actions-backdrop');
  const actionsCloseBtn = container.querySelector('#actions-close-btn');
  const actionsDoneBtn = container.querySelector('#actions-done-btn');
  const actionsMarkReadSection = container.querySelector('#actions-mark-read-section');
  const actionsStatsRow = container.querySelector('#actions-stats-row');
  const actionsRestartRow = container.querySelector('#actions-restart-row');

  const toggleShuffleCheckbox = container.querySelector('#toggle-shuffle-checkbox');
  const toggleAutoAdvanceCheckbox = container.querySelector('#toggle-auto-advance-checkbox');
  const toggleDrawAutoAdvanceCheckbox = container.querySelector('#toggle-draw-auto-advance-checkbox');
  const toggleDrawShuffleCheckbox = container.querySelector('#toggle-draw-shuffle-checkbox');
  const drawResetTypographyBtn = container.querySelector('#draw-reset-typography-btn');
  const meditateMarkReadBtn = container.querySelector('#meditate-mark-read-btn');
  const meditateMarkReadLbl = container.querySelector('#meditate-mark-read-label');
  const toggleStatsCheckbox = container.querySelector('#toggle-stats-checkbox');
  const toggleSkipDoneCheckbox = container.querySelector('#toggle-skip-done-checkbox');
  const modalMarkChBtn = container.querySelector('#modal-mark-ch-read-btn');
  const modalMarkVerseBtn = container.querySelector('#modal-mark-verse-read-btn');
  const modalRestartBtn = container.querySelector('#modal-restart-btn');
  const summaryStatsLine = container.querySelector('#typing-summary-stats-line');
  const hiddenInput = container.querySelector('#typing-hidden-input');
  const viewportWrapper = container.querySelector('#typing-viewport-wrapper');
  const meditateCanvasWrapper = container.querySelector('#meditate-canvas-wrapper');
  const focusBanner = container.querySelector('#typing-focus-banner');
  const focusBannerText = container.querySelector('#typing-focus-banner-text');
  const passageScroll = container.querySelector('#typing-passage-scroll');
  const passageContent = container.querySelector('#typing-passage-content');
  const errorAlert = container.querySelector('#typing-error-alert');
  const progressFill = container.querySelector('#typing-chapter-progress-fill');
  const liveWpmEl = container.querySelector('#live-wpm');
  const liveCpmEl = container.querySelector('#live-cpm');
  const liveAccEl = container.querySelector('#live-acc');
  const liveVerseEl = container.querySelector('#live-verse');
  const liveTimeEl = container.querySelector('#live-time');
  const telemetrySubStatusEl = null;
  const completionBackdrop = container.querySelector('#completion-modal-backdrop');

  function isAnyModalOpen() {
    return Boolean(
      (modeSelectBackdrop && !modeSelectBackdrop.hidden) ||
      (modeSettingsBackdrop && !modeSettingsBackdrop.hidden) ||
      (scopeSettingsBackdrop && !scopeSettingsBackdrop.hidden) ||
      (actionsBackdrop && !actionsBackdrop.hidden) ||
      (bookmarkBackdrop && !bookmarkBackdrop.hidden) ||
      (completionBackdrop && !completionBackdrop.hidden)
    );
  }

  // ── 1. Mode Modal, Stacked Mode Settings Modal, Stacked Scope Settings Modal & Actions Modal ──
  function syncScopeRadioUI(isSingle = singleVerseMode) {
    container.querySelectorAll('[data-scope-item]').forEach(item => {
      const sc = item.getAttribute('data-scope-item');
      const isSel = (sc === 'single') === Boolean(isSingle);
      item.classList.toggle('is-selected', isSel);
      const radio = item.querySelector('.scope-radio-input');
      if (radio) radio.checked = isSel;
    });
  }

  function updateScopeHeaderAndUrlInPlace() {
    const titleEl = container.querySelector('#telemetry-heading-title');
    if (titleEl) {
      titleEl.textContent = singleVerseMode
        ? `${book.name} ${initialChapter}:${targetSingleVerseNum || 1}`
        : `${book.name} ${initialChapter}`;
    }
    if (prevStepBtn) {
      prevStepBtn.title = `Previous ${singleVerseMode ? 'Verse' : 'Chapter'}`;
    }
    if (nextStepBtn) {
      nextStepBtn.title = `Next ${singleVerseMode ? 'Verse' : 'Chapter'}`;
    }
    if (readFullChapterBtn) {
      readFullChapterBtn.hidden = !singleVerseMode;
    }
    if (advanceStepBtn) {
      advanceStepBtn.hidden = !singleVerseMode || autoAdvance || activeMode === 'draw';
      advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
    }
    const markChRow = container.querySelector('#modal-mark-ch-row');
    if (markChRow) {
      markChRow.hidden = singleVerseMode;
    }
    const badgeEl = container.querySelector('#telemetry-completed-badge');
    if (badgeEl) {
      badgeEl.innerHTML = getProgressBadgeHtml();
    }

    // Update descriptions in Mode Modal
    container.querySelectorAll('[data-mode-item]').forEach(item => {
      const m = item.getAttribute('data-mode-item');
      const desc = item.querySelector('.mode-radio-desc');
      if (desc && m === 'type') {
        desc.textContent = `Type scripture character by character (${singleVerseMode ? 'Single Verse' : 'Chapter'})`;
      } else if (desc && m === 'speak') {
        desc.textContent = `Speak scripture aloud word by word (${singleVerseMode ? 'Single Verse' : 'Chapter'})`;
      }
    });

    const cleanTargetUrl = singleVerseMode
      ? `/${activeMode}/${book.id}/${initialChapter}/${targetSingleVerseNum || 1}`
      : `/${activeMode}/${book.id}/${initialChapter}`;
    if (window.location.pathname !== cleanTargetUrl) {
      window.history.replaceState(null, '', cleanTargetUrl);
    }
    const modeTitle = activeMode === 'speak' ? 'Speak' : (activeMode === 'draw' ? 'Draw' : 'Type');
    document.title = `${book.name} ${initialChapter}${singleVerseMode ? `:${targetSingleVerseNum || 1}` : ''} — ${modeTitle} | Promises to Creation`;

    setLastSelectedChapter(book.id, initialChapter, singleVerseMode ? (targetSingleVerseNum || 1) : (requestedStartVerse || null));
  }

  function selectScopeMode(isSingle) {
    const nextIsSingle = Boolean(isSingle);
    setSingleVerseModePref(nextIsSingle);
    syncScopeRadioUI(nextIsSingle);

    if (nextIsSingle === singleVerseMode) {
      updateScopeHeaderAndUrlInPlace();
      return;
    }

    if (nextIsSingle) {
      const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
      const vNum = curVIdx >= 0 && verseRanges[curVIdx]
        ? verseRanges[curVIdx].verse
        : (targetSingleVerseNum || requestedStartVerse || 1);
      singleVerseMode = true;
      targetSingleVerseNum = vNum;
      currentArtworkTemplateIdx = Math.abs((book.id * 31 + initialChapter * 7 + (targetSingleVerseNum || 1))) % TOTAL_MEDITATE_ART_TEMPLATES;
    } else {
      const vNum = targetSingleVerseNum || 1;
      singleVerseMode = false;
      requestedStartVerse = vNum;
      if (activeMode === 'draw') {
        activeMode = 'type';
        meditateMode = false;
        setActiveModePref('type');
        syncModeRadioUI();
      }
    }

    updateScopeHeaderAndUrlInPlace();
    if (allChapterVerses && allChapterVerses.length > 0) {
      buildPassageDOM(allChapterVerses);
    }
    updateSingleVerseFavBtn();
    updateSingleVerseBookmarkBtn();
    updateReadButtons();
  }

  function syncModeRadioUI() {
    container.querySelectorAll('[data-mode-item]').forEach(item => {
      const m = item.getAttribute('data-mode-item');
      const isSel = m === activeMode;
      item.classList.toggle('is-selected', isSel);
      const radio = item.querySelector('input[name="bible-mode-radio"]');
      if (radio) radio.checked = isSel;
    });
    if (modeBtnLabel) {
      modeBtnLabel.textContent = getModeBtnLabelHtml();
    }
    const navPromisesBtn = document.getElementById('nav-promises-btn');
    if (navPromisesBtn) {
      navPromisesBtn.setAttribute('href', `/${activeMode}`);
    }
  }

  function switchActiveMode(newMode) {
    if (!['type', 'draw', 'speak'].includes(newMode)) return;
    const prevMode = activeMode;
    activeMode = newMode;
    meditateMode = activeMode === 'draw';
    setActiveModePref(activeMode);
    syncModeRadioUI();
    trackEvent('switch_mode', { mode: activeMode, prevMode });

    // If switching to Draw mode while in Chapter mode, switch to Single Verse mode IN-PLACE without closing modals
    let scopeChangedToSingle = false;
    if (activeMode === 'draw' && !singleVerseMode) {
      const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
      const vNum = curVIdx >= 0 && verseRanges[curVIdx]
        ? verseRanges[curVIdx].verse
        : (targetSingleVerseNum || requestedStartVerse || 1);
      singleVerseMode = true;
      targetSingleVerseNum = vNum;
      setSingleVerseModePref(true);
      syncScopeRadioUI(true);
      currentArtworkTemplateIdx = Math.abs((book.id * 31 + initialChapter * 7 + (targetSingleVerseNum || 1))) % TOTAL_MEDITATE_ART_TEMPLATES;
      scopeChangedToSingle = true;
    }

    if (activeMode === 'speak') {
      micEnabled = true;
    }

    updateScopeHeaderAndUrlInPlace();
    if (scopeChangedToSingle && allChapterVerses && allChapterVerses.length > 0) {
      buildPassageDOM(allChapterVerses);
    } else {
      applyMeditateModeState();
    }
    updateSingleVerseFavBtn();
    updateSingleVerseBookmarkBtn();
    updateReadButtons();
  }

  function openModeSelectModal() {
    syncModeRadioUI();
    if (modeSelectBackdrop) modeSelectBackdrop.hidden = false;
  }

  function closeModeSelectModal() {
    if (scopeSettingsBackdrop) scopeSettingsBackdrop.hidden = true;
    if (modeSettingsBackdrop) modeSettingsBackdrop.hidden = true;
    if (modeSelectBackdrop) modeSelectBackdrop.hidden = true;
    focusTypingInput();
  }

  function openModeSettingsModal(targetMode) {
    syncScopeRadioUI(singleVerseMode);
    if (toggleShuffleCheckbox) toggleShuffleCheckbox.checked = shuffleVerses;
    if (toggleAutoAdvanceCheckbox) toggleAutoAdvanceCheckbox.checked = autoAdvance;
    if (toggleDrawAutoAdvanceCheckbox) toggleDrawAutoAdvanceCheckbox.checked = autoAdvance;
    if (toggleDrawShuffleCheckbox) toggleDrawShuffleCheckbox.checked = shuffleVerses;
    if (toggleSkipDoneCheckbox) toggleSkipDoneCheckbox.checked = skipCompletedVerses;

    if (targetMode === 'draw') {
      if (modeSettingsTitle) modeSettingsTitle.textContent = '🎨 Draw Mode Settings';
      if (modeSettingsTypeSpeakBody) modeSettingsTypeSpeakBody.hidden = true;
      if (modeSettingsDrawBody) modeSettingsDrawBody.hidden = false;
    } else if (targetMode === 'speak') {
      if (modeSettingsTitle) modeSettingsTitle.textContent = '🗣️ Speak Mode Settings';
      if (modeSettingsTypeSpeakBody) modeSettingsTypeSpeakBody.hidden = false;
      if (modeSettingsDrawBody) modeSettingsDrawBody.hidden = true;
    } else {
      if (modeSettingsTitle) modeSettingsTitle.textContent = '⌨️ Type Mode Settings';
      if (modeSettingsTypeSpeakBody) modeSettingsTypeSpeakBody.hidden = false;
      if (modeSettingsDrawBody) modeSettingsDrawBody.hidden = true;
    }

    if (modeSettingsBackdrop) modeSettingsBackdrop.hidden = false;
  }

  function closeModeSettingsModal() {
    if (scopeSettingsBackdrop) scopeSettingsBackdrop.hidden = true;
    if (modeSettingsBackdrop) modeSettingsBackdrop.hidden = true;
  }

  function openScopeSettingsModal(targetScope) {
    if (toggleShuffleCheckbox) toggleShuffleCheckbox.checked = shuffleVerses;
    if (toggleAutoAdvanceCheckbox) toggleAutoAdvanceCheckbox.checked = autoAdvance;
    if (toggleSkipDoneCheckbox) toggleSkipDoneCheckbox.checked = skipCompletedVerses;

    if (targetScope === 'single') {
      if (scopeSettingsTitle) scopeSettingsTitle.textContent = '🎯 Single Verse Mode Settings';
      if (scopeSettingsChapterBody) scopeSettingsChapterBody.hidden = true;
      if (scopeSettingsSingleBody) scopeSettingsSingleBody.hidden = false;
    } else {
      if (scopeSettingsTitle) scopeSettingsTitle.textContent = '📖 Chapter Mode Settings';
      if (scopeSettingsChapterBody) scopeSettingsChapterBody.hidden = false;
      if (scopeSettingsSingleBody) scopeSettingsSingleBody.hidden = true;
    }

    if (scopeSettingsBackdrop) scopeSettingsBackdrop.hidden = false;
  }

  function closeScopeSettingsModal() {
    if (scopeSettingsBackdrop) scopeSettingsBackdrop.hidden = true;
  }

  function openActionsModal() {
    if (toggleStatsCheckbox) toggleStatsCheckbox.checked = showTypingStats;
    if (actionsMarkReadSection) {
      actionsMarkReadSection.hidden = Boolean(singleVerseMode && activeMode === 'draw');
    }
    if (actionsStatsRow) {
      actionsStatsRow.hidden = activeMode === 'draw';
    }
    if (actionsRestartRow) {
      actionsRestartRow.hidden = activeMode === 'draw';
    }
    updateReadButtons();
    if (actionsBackdrop) actionsBackdrop.hidden = false;
  }

  function closeActionsModal() {
    if (actionsBackdrop) actionsBackdrop.hidden = true;
    focusTypingInput();
  }

  if (modeBtn) {
    modeBtn.addEventListener('click', () => openModeSelectModal());
  }
  if (modeSelectCloseBtn) {
    modeSelectCloseBtn.addEventListener('click', () => closeModeSelectModal());
  }
  if (modeSelectDoneBtn) {
    modeSelectDoneBtn.addEventListener('click', () => closeModeSelectModal());
  }
  if (modeSelectBackdrop) {
    modeSelectBackdrop.addEventListener('click', (e) => {
      if (e.target === modeSelectBackdrop) closeModeSelectModal();
    });
  }

  // Radio selection inside Mode Modal (Type, Draw, Speak)
  container.querySelectorAll('input[name="bible-mode-radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        switchActiveMode(e.target.value);
      }
    });
  });

  // Settings gear buttons inside Mode Modal (opens Stacked Mode Settings Modal)
  container.querySelectorAll('[data-open-mode-settings]').forEach(gearBtn => {
    gearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetMode = gearBtn.getAttribute('data-open-mode-settings') || activeMode;
      openModeSettingsModal(targetMode);
    });
  });

  // Radio selection inside Mode Settings Modal (Chapter Mode vs Single Verse Mode)
  container.querySelectorAll('input[name="bible-scope-radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectScopeMode(e.target.value === 'single');
      }
    });
  });

  // Settings gear buttons inside Mode Settings Modal (opens Stacked Scope Settings Modal)
  container.querySelectorAll('[data-open-scope-settings]').forEach(gearBtn => {
    gearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetScope = gearBtn.getAttribute('data-open-scope-settings') || (singleVerseMode ? 'single' : 'chapter');
      openScopeSettingsModal(targetScope);
    });
  });

  if (modeSettingsCloseBtn) {
    modeSettingsCloseBtn.addEventListener('click', () => closeModeSettingsModal());
  }
  if (modeSettingsDoneBtn) {
    modeSettingsDoneBtn.addEventListener('click', () => closeModeSettingsModal());
  }
  if (modeSettingsBackdrop) {
    modeSettingsBackdrop.addEventListener('click', (e) => {
      if (e.target === modeSettingsBackdrop) closeModeSettingsModal();
    });
  }

  if (scopeSettingsCloseBtn) {
    scopeSettingsCloseBtn.addEventListener('click', () => closeScopeSettingsModal());
  }
  if (scopeSettingsDoneBtn) {
    scopeSettingsDoneBtn.addEventListener('click', () => closeScopeSettingsModal());
  }
  if (scopeSettingsBackdrop) {
    scopeSettingsBackdrop.addEventListener('click', (e) => {
      if (e.target === scopeSettingsBackdrop) closeScopeSettingsModal();
    });
  }

  if (actionsBtn) {
    actionsBtn.addEventListener('click', () => openActionsModal());
  }
  if (actionsCloseBtn) {
    actionsCloseBtn.addEventListener('click', () => closeActionsModal());
  }
  if (actionsDoneBtn) {
    actionsDoneBtn.addEventListener('click', () => closeActionsModal());
  }
  if (actionsBackdrop) {
    actionsBackdrop.addEventListener('click', (e) => {
      if (e.target === actionsBackdrop) closeActionsModal();
    });
  }

  const syncShuffleToggle = (enabled) => {
    shuffleVerses = Boolean(enabled);
    setShuffleVersesPref(shuffleVerses);
    if (toggleShuffleCheckbox) toggleShuffleCheckbox.checked = shuffleVerses;
    if (toggleDrawShuffleCheckbox) toggleDrawShuffleCheckbox.checked = shuffleVerses;
    trackEvent('toggle_shuffle', { enabled: shuffleVerses });
    if (advanceStepBtn) {
      advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
    }
  };

  if (toggleShuffleCheckbox) {
    toggleShuffleCheckbox.addEventListener('change', () => syncShuffleToggle(toggleShuffleCheckbox.checked));
  }
  if (toggleDrawShuffleCheckbox) {
    toggleDrawShuffleCheckbox.addEventListener('change', () => syncShuffleToggle(toggleDrawShuffleCheckbox.checked));
  }

  const syncAutoAdvanceToggle = (enabled) => {
    autoAdvance = Boolean(enabled);
    setAutoAdvancePref(autoAdvance);
    if (toggleAutoAdvanceCheckbox) toggleAutoAdvanceCheckbox.checked = autoAdvance;
    if (toggleDrawAutoAdvanceCheckbox) toggleDrawAutoAdvanceCheckbox.checked = autoAdvance;
    trackEvent('toggle_auto_advance', { enabled: autoAdvance });
    if (advanceStepBtn) {
      advanceStepBtn.hidden = !singleVerseMode || autoAdvance || activeMode === 'draw';
    }
  };

  if (toggleAutoAdvanceCheckbox) {
    toggleAutoAdvanceCheckbox.addEventListener('change', () => syncAutoAdvanceToggle(toggleAutoAdvanceCheckbox.checked));
  }
  if (toggleDrawAutoAdvanceCheckbox) {
    toggleDrawAutoAdvanceCheckbox.addEventListener('change', () => syncAutoAdvanceToggle(toggleDrawAutoAdvanceCheckbox.checked));
  }

  if (drawResetTypographyBtn) {
    drawResetTypographyBtn.addEventListener('click', () => {
      setMeditateFontPref(DEFAULT_MEDITATE_FONT);
      setMeditateFontSizePref(DEFAULT_MEDITATE_FONT_SIZE);
      setMeditateFontCasePref(DEFAULT_MEDITATE_FONT_CASE);
      setMeditateFontColorPref(DEFAULT_MEDITATE_FONT_COLOR);
      setMeditateBoxWidthPref(DEFAULT_MEDITATE_BOX_WIDTH);
      if (activeMode === 'draw') {
        renderMeditateModeCanvas();
      }
    });
  }

  if (advanceStepBtn) {
    advanceStepBtn.addEventListener('click', () => {
      trackEvent('advance_verse_step', { bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum || 1 });
      navigateNextStep();
    });
  }

  if (toggleStatsCheckbox) {
    toggleStatsCheckbox.addEventListener('change', () => {
      showTypingStats = toggleStatsCheckbox.checked;
      setShowTypingStatsPref(showTypingStats);
      trackEvent('toggle_typing_stats', { enabled: showTypingStats });
      if (summaryStatsLine) {
        summaryStatsLine.hidden = !showTypingStats || activeMode === 'draw';
      }
    });
  }

  if (toggleSkipDoneCheckbox) {
    toggleSkipDoneCheckbox.addEventListener('change', () => {
      skipCompletedVerses = toggleSkipDoneCheckbox.checked;
      setSkipCompletedVersesPref(skipCompletedVerses);
      trackEvent('toggle_skip_completed', { enabled: skipCompletedVerses });
    });
  }

  if (speakMicToggleBtn) {
    speakMicToggleBtn.addEventListener('click', () => {
      micEnabled = !micEnabled;
      updateSpeakMicUI();
      if (micEnabled && activeMode === 'speak' && !isCompleted) {
        startSpeechRecognition();
      } else {
        stopSpeechRecognition();
      }
    });
  }

  // ── Mark Chapter & Verse as Read Controls ─────────────────────
  function updateReadButtons() {
    const sum = getChapterProgressSummary(book.id, initialChapter, activeTranslation);
    const isChRead = sum.isFullyRead;
    const markChBtn = container.querySelector('#modal-mark-ch-read-btn');
    const markChLbl = container.querySelector('#modal-mark-ch-read-label');
    const markChDesc = container.querySelector('#modal-ch-read-desc');
    if (markChBtn && markChLbl) {
      if (isChRead) {
        markChBtn.classList.add('is-read-active');
        markChLbl.textContent = '✓ Read';
        if (markChDesc) markChDesc.textContent = `${book.name} ${initialChapter} is marked as read`;
        markChBtn.title = `Chapter ${initialChapter} is marked as read. Click to unmark.`;
      } else {
        markChBtn.classList.remove('is-read-active');
        markChLbl.textContent = '📖 Mark Read';
        if (markChDesc) markChDesc.textContent = `Mark ${book.name} ${initialChapter} as read`;
        markChBtn.title = `Mark all of ${book.name} ${initialChapter} as read`;
      }
    }

    function getActiveVerseNumberForRead() {
      if (singleVerseMode && targetSingleVerseNum) return targetSingleVerseNum;
      const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
      if (curVIdx >= 0 && verseRanges[curVIdx]) return verseRanges[curVIdx].verse;
      return targetSingleVerseNum || 1;
    }

    const activeVNum = getActiveVerseNumberForRead();
    const vTitleEl = container.querySelector('#modal-mark-verse-title');
    if (vTitleEl) vTitleEl.textContent = `Verse ${activeVNum}`;
    const vRec = sum.record?.completedVerses?.[String(activeVNum)];
    const isVRead = Boolean(isChRead || vRec?.isRead);
    const markVBtn = container.querySelector('#modal-mark-verse-read-btn');
    const markVLbl = container.querySelector('#modal-mark-verse-read-label');
    const markVDesc = container.querySelector('#modal-verse-read-desc');
    if (markVBtn && markVLbl) {
      if (isVRead) {
        markVBtn.classList.add('is-read-active');
        markVLbl.textContent = '✓ Read';
        if (markVDesc) markVDesc.textContent = `Verse ${activeVNum} is marked as read`;
        markVBtn.title = `Verse ${activeVNum} is marked as read. Click to unmark.`;
      } else {
        markVBtn.classList.remove('is-read-active');
        markVLbl.textContent = '📖 Mark Read';
        if (markVDesc) markVDesc.textContent = `Mark verse ${activeVNum} as read`;
        markVBtn.title = `Mark verse ${activeVNum} as read`;
      }
    }

    if (meditateMarkReadBtn && meditateMarkReadLbl) {
      if (isVRead) {
        meditateMarkReadBtn.classList.add('is-read-active');
        meditateMarkReadLbl.textContent = '✓ Read';
        meditateMarkReadBtn.title = `Verse ${activeVNum} is marked as read. Click to unmark.`;
      } else {
        meditateMarkReadBtn.classList.remove('is-read-active');
        meditateMarkReadLbl.textContent = '📖 Mark Read';
        meditateMarkReadBtn.title = `Mark verse ${activeVNum} as read`;
      }
    }
  }

  if (modalMarkChBtn) {
    modalMarkChBtn.addEventListener('click', () => {
      toggleChapterRead(book.id, initialChapter, activeTranslation);
      trackEvent('toggle_chapter_read', { bookId: book.id, chapter: initialChapter });
      updateReadButtons();
    });
  }

  if (modalMarkVerseBtn) {
    modalMarkVerseBtn.addEventListener('click', () => {
      const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
      const vNum = (singleVerseMode && targetSingleVerseNum)
        ? targetSingleVerseNum
        : ((curVIdx >= 0 && verseRanges[curVIdx]) ? verseRanges[curVIdx].verse : (targetSingleVerseNum || 1));
      toggleVerseRead(book.id, initialChapter, vNum, activeTranslation);
      trackEvent('toggle_verse_read', { bookId: book.id, chapter: initialChapter, verse: vNum });
      updateReadButtons();
      if (singleVerseMode && autoAdvance) {
        closeActionsModal();
        setTimeout(() => {
          navigateNextStep();
        }, 350);
      }
    });
  }

  if (meditateMarkReadBtn) {
    meditateMarkReadBtn.addEventListener('click', () => {
      const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
      const vNum = (singleVerseMode && targetSingleVerseNum)
        ? targetSingleVerseNum
        : ((curVIdx >= 0 && verseRanges[curVIdx]) ? verseRanges[curVIdx].verse : (targetSingleVerseNum || 1));
      toggleVerseRead(book.id, initialChapter, vNum, activeTranslation);
      trackEvent('toggle_verse_read_draw', { bookId: book.id, chapter: initialChapter, verse: vNum });
      updateReadButtons();
      if (autoAdvance) {
        setTimeout(() => {
          navigateNextStep();
        }, 350);
      }
    });
  }

  updateReadButtons();

  onStatsUpdated = () => {
    const badgeEl = container.querySelector('#telemetry-completed-badge');
    if (badgeEl) badgeEl.innerHTML = getProgressBadgeHtml();
    updateReadButtons();
    for (const vr of verseRanges) {
      if (vr.supEl) updateVerseSup(vr.supEl, vr.verse);
    }
  };
  window.addEventListener('bible:stats-updated', onStatsUpdated);

  function getCurrentCursorVerseNum() {
    if (singleVerseMode) {
      return targetSingleVerseNum || 1;
    }
    if (Array.isArray(charToVerseMap) && charToVerseMap.length > 0) {
      const idx = Math.min(cursorIdx, charToVerseMap.length - 1);
      return charToVerseMap[Math.max(0, idx)] || (verses && verses[0]?.verse) || 1;
    }
    return requestedStartVerse || (verses && verses[0]?.verse) || 1;
  }

  function updateSingleVerseFavBtn() {
    if (!singleFavBtn || !singleFavIcon) return;
    const vNum = getCurrentCursorVerseNum();
    const isFav = isVerseFavorited(book.id, initialChapter, vNum);
    singleFavBtn.classList.toggle('is-favorited', isFav);
    singleFavIcon.textContent = isFav ? '❤️' : '🤍';
    const tooltipText = singleVerseMode
      ? (isFav ? 'Favourite (Saved)' : 'Favourite')
      : (isFav ? `Favourite (v. ${vNum} Saved)` : `Favourite (v. ${vNum})`);
    singleFavBtn.setAttribute('data-tooltip', tooltipText);
    singleFavBtn.setAttribute('aria-label', isFav
      ? `Verse ${vNum} is in Favorites. Click to remove.`
      : `Save Verse ${vNum} to Favorites`);
    singleFavBtn.removeAttribute('title');
  }

  if (singleFavBtn) {
    singleFavBtn.addEventListener('click', () => {
      const vNum = getCurrentCursorVerseNum();
      const matched = (verses && verses.find(v => v.verse === vNum)) || (allChapterVerses && allChapterVerses.find(v => v.verse === vNum)) || (verses && verses[0]);
      const vText = matched ? matched.text : '';
      const nowFav = toggleVerseFavorite({
        bookId: book.id,
        chapter: initialChapter,
        verse: vNum,
        verseRef: `${book.name} ${initialChapter}:${vNum}`,
        verseText: vText,
        translation: activeTranslation
      });
      updateSingleVerseFavBtn();
      trackEvent('toggle_verse_favorite', {
        bookId: book.id,
        chapter: initialChapter,
        verse: vNum,
        isFavorited: nowFav,
        mode: singleVerseMode ? 'single' : 'chapter_header'
      });
    });
  }

  if (readFullChapterBtn) {
    readFullChapterBtn.addEventListener('click', () => {
      const vNum = targetSingleVerseNum || 1;
      setSingleVerseModePref(false);
      const targetChapterMode = activeMode === 'draw' ? 'type' : activeMode;
      if (activeMode === 'draw') {
        setActiveModePref('type');
      }
      trackEvent('single_verse_read_full_chapter_click', {
        bookId: book.id,
        chapter: initialChapter,
        verse: vNum,
        mode: targetChapterMode
      });
      navigate(`/${targetChapterMode}/${book.id}/${initialChapter}?verse=${vNum}`);
    });
  }

  onFavoritesUpdated = (e) => {
    updateSingleVerseFavBtn();
    const vNum = e?.detail?.record?.verse || (e?.detail?.key ? Number(e.detail.key.split(':')[2]) : null);
    if (vNum) {
      const favBtn = container.querySelector(`.verse-fav-btn[data-verse="${vNum}"]`);
      if (favBtn) {
        const isFav = isVerseFavorited(book.id, initialChapter, vNum);
        favBtn.classList.toggle('is-favorited', isFav);
        favBtn.textContent = isFav ? '❤️' : '🤍';
        favBtn.title = isFav
          ? `Verse ${vNum} in favorites. Click to remove.`
          : `Save Verse ${vNum} to favorites`;
      }
    }
  };
  window.addEventListener('bible:favorites-updated', onFavoritesUpdated);

  // ── Scripture Bookmark Controls & Modal ───────────────────────
  const singleBookmarkBtn = container.querySelector('#single-verse-bookmark-btn');
  const bookmarkBackdrop = container.querySelector('#typing-bookmark-backdrop');
  const bookmarkCloseBtn = container.querySelector('#bookmark-close-btn');
  const bookmarkSearchInput = container.querySelector('#bookmark-search-input');
  const bookmarkSaveBtn = container.querySelector('#bookmark-save-btn');
  const bookmarkFeedbackMsg = container.querySelector('#bookmark-feedback-msg');
  const bookmarkRecentList = container.querySelector('#bookmark-recent-list');
  const bookmarkModalSubtitle = container.querySelector('#bookmark-modal-subtitle');

  function updateSingleVerseBookmarkBtn() {
    if (!singleBookmarkBtn) return;
    const vNum = getCurrentCursorVerseNum();
    const isBookmarked = isVerseBookmarked(book.id, initialChapter, vNum);
    singleBookmarkBtn.classList.toggle('is-bookmarked', isBookmarked);
    const svgEl = singleBookmarkBtn.querySelector('.bookmark-ribbon-icon');
    if (svgEl) svgEl.setAttribute('fill', isBookmarked ? 'currentColor' : 'none');
    const tooltipText = singleVerseMode
      ? (isBookmarked ? 'Bookmark (Saved)' : 'Bookmark')
      : (isBookmarked ? `Bookmark (v. ${vNum} Saved)` : `Bookmark (v. ${vNum})`);
    singleBookmarkBtn.setAttribute('data-tooltip', tooltipText);
    singleBookmarkBtn.setAttribute('aria-label', isBookmarked
      ? `Verse ${vNum} is bookmarked. Click to view, update, or add bookmarks.`
      : `Bookmark Verse ${vNum}`);
    singleBookmarkBtn.removeAttribute('title');
  }

  function getCurrentVerseInfo() {
    const vNum = getCurrentCursorVerseNum();
    const matched = (verses && verses.find(v => v.verse === vNum)) || (allChapterVerses && allChapterVerses.find(v => v.verse === vNum)) || (verses && verses[0]);
    const vText = matched ? matched.text : '';
    const vRef = `${book.name} ${initialChapter}:${vNum}`;
    return { vNum, vText, vRef };
  }

  function showBookmarkFeedback(msg, isError = false) {
    if (!bookmarkFeedbackMsg) return;
    bookmarkFeedbackMsg.textContent = msg;
    bookmarkFeedbackMsg.classList.toggle('is-error', isError);
    bookmarkFeedbackMsg.hidden = false;
    setTimeout(() => {
      if (bookmarkFeedbackMsg) bookmarkFeedbackMsg.hidden = true;
    }, 4000);
  }

  function renderBookmarkRecentList(filterText = '') {
    if (!bookmarkRecentList) return;
    const all = getAllBookmarks();
    const { vNum, vRef, vText } = getCurrentVerseInfo();
    const cleanFilter = filterText.trim().toLowerCase();

    let itemsToShow = [];
    if (cleanFilter) {
      itemsToShow = all.filter(b => (b.name || '').toLowerCase().includes(cleanFilter)).slice(0, 5);
    } else {
      itemsToShow = all.slice(0, 5);
    }

    if (itemsToShow.length === 0) {
      if (cleanFilter) {
        bookmarkRecentList.innerHTML = `
          <div class="bookmark-empty-hint">
            No existing bookmark matches "<strong>${escapeHtml(filterText)}</strong>".<br />
            Click <strong>Save</strong> or press Enter to create it!
          </div>
        `;
      } else {
        bookmarkRecentList.innerHTML = `
          <div class="bookmark-empty-hint">
            No bookmarks yet. Type a name above to create your first bookmark!
          </div>
        `;
      }
      return;
    }

    bookmarkRecentList.innerHTML = itemsToShow.map(bm => {
      const isCurrentVerse = bm.bookId === book.id && bm.chapter === initialChapter && bm.verse === vNum;
      const bmRef = bm.verseRef || `${bm.bookId}:${bm.chapter}:${bm.verse || 1}`;
      return `
        <div class="bookmark-recent-item" data-id="${escapeHtml(bm.id)}">
          <div class="bookmark-item-main">
            <span class="bookmark-item-name" title="${escapeHtml(bm.name)}">${escapeHtml(bm.name)}</span>
            <span class="bookmark-item-ref">${escapeHtml(bmRef)} (${escapeHtml(bm.translation || 'ESV')})</span>
          </div>
          ${isCurrentVerse ? `
            <span class="bookmark-item-badge is-current">✓ Current verse</span>
          ` : `
            <button type="button" class="bookmark-item-action-btn bm-update-to-here-btn" data-id="${escapeHtml(bm.id)}" title="Update '${escapeHtml(bm.name)}' to ${escapeHtml(vRef)}">
              Update to here ›
            </button>
          `}
        </div>
      `;
    }).join('');

    bookmarkRecentList.querySelectorAll('.bookmark-recent-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const bm = all.find(b => b.id === id);
        if (!bm) return;
        const isCurrentVerse = bm.bookId === book.id && bm.chapter === initialChapter && bm.verse === vNum;
        if (isCurrentVerse) {
          showBookmarkFeedback(`"${bm.name}" is already pointing to ${vRef}.`);
          return;
        }
        updateBookmarkLocation(id, {
          bookId: book.id,
          chapter: initialChapter,
          verse: vNum,
          verseRef: vRef,
          verseText: vText,
          translation: activeTranslation
        });
        showBookmarkFeedback(`✓ Updated "${bm.name}" to ${vRef}`);
        updateSingleVerseBookmarkBtn();
        renderBookmarkRecentList(bookmarkSearchInput ? bookmarkSearchInput.value : '');
      });
    });
  }

  function openBookmarkModal() {
    if (!bookmarkBackdrop) return;
    const { vNum, vRef } = getCurrentVerseInfo();
    if (bookmarkModalSubtitle) {
      bookmarkModalSubtitle.textContent = `${vRef} (${getTranslationByCode(activeTranslation).shortName})`;
    }
    if (bookmarkFeedbackMsg) bookmarkFeedbackMsg.hidden = true;
    if (bookmarkSearchInput) {
      bookmarkSearchInput.value = '';
    }
    renderBookmarkRecentList('');
    bookmarkBackdrop.hidden = false;
    setTimeout(() => {
      if (bookmarkSearchInput) bookmarkSearchInput.focus();
    }, 50);
  }

  function closeBookmarkModal() {
    if (bookmarkBackdrop) bookmarkBackdrop.hidden = true;
    focusTypingInput();
  }

  function handleSaveBookmark() {
    if (!bookmarkSearchInput) return;
    const name = bookmarkSearchInput.value.trim();
    if (!name) {
      showBookmarkFeedback('Please enter a bookmark name.', true);
      bookmarkSearchInput.focus();
      return;
    }
    const { vNum, vRef, vText } = getCurrentVerseInfo();
    const existing = findBookmarkByName(name);
    if (existing) {
      updateBookmarkLocation(existing.id, {
        bookId: book.id,
        chapter: initialChapter,
        verse: vNum,
        verseRef: vRef,
        verseText: vText,
        translation: activeTranslation
      });
      showBookmarkFeedback(`✓ Updated existing bookmark "${existing.name}" to ${vRef}`);
    } else {
      createBookmark({
        name,
        bookId: book.id,
        chapter: initialChapter,
        verse: vNum,
        verseRef: vRef,
        verseText: vText,
        translation: activeTranslation
      });
      showBookmarkFeedback(`✓ Created new bookmark "${name}" at ${vRef}`);
    }
    updateSingleVerseBookmarkBtn();
    renderBookmarkRecentList(bookmarkSearchInput.value);
  }

  if (singleBookmarkBtn) {
    singleBookmarkBtn.addEventListener('click', () => {
      openBookmarkModal();
    });
  }

  if (bookmarkCloseBtn) {
    bookmarkCloseBtn.addEventListener('click', closeBookmarkModal);
  }

  if (bookmarkBackdrop) {
    bookmarkBackdrop.addEventListener('click', (e) => {
      if (e.target === bookmarkBackdrop) closeBookmarkModal();
    });
  }

  if (bookmarkSaveBtn) {
    bookmarkSaveBtn.addEventListener('click', handleSaveBookmark);
  }

  if (bookmarkSearchInput) {
    bookmarkSearchInput.addEventListener('input', (e) => {
      renderBookmarkRecentList(e.target.value);
    });
    bookmarkSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveBookmark();
      } else if (e.key === 'Escape') {
        closeBookmarkModal();
      }
    });
  }

  onBookmarksUpdated = () => {
    updateSingleVerseBookmarkBtn();
  };
  window.addEventListener('bible:bookmarks-updated', onBookmarksUpdated);

  // ── 3. Prev / Next Chapter Stepper & Restart Button ────────────
  function navigatePrevStep() {
    if (singleVerseMode && targetSingleVerseNum) {
      if (shuffleVerses) {
        const prev = popRandomVerseHistory();
        if (prev) {
          pushRandomVerseForward({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
          navigate(`/${activeMode}/${prev.bookId}/${prev.chapter}/${prev.verse}`);
          return;
        }
      }
      if (targetSingleVerseNum > 1) {
        navigate(`/${activeMode}/${book.id}/${initialChapter}/${targetSingleVerseNum - 1}`);
      } else {
        navigate(`/${activeMode}/${prevChapterRef.bookId}/${prevChapterRef.chapter}/1`);
      }
    } else {
      navigate(`/${activeMode}/${prevChapterRef.bookId}/${prevChapterRef.chapter}`);
    }
  }

  function navigateNextStep() {
    if (singleVerseMode && targetSingleVerseNum) {
      if (shuffleVerses) {
        const fwd = popRandomVerseForward();
        if (fwd) {
          pushRandomVerseHistory({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
          navigate(`/${activeMode}/${fwd.bookId}/${fwd.chapter}/${fwd.verse}`);
          return;
        }

        pushRandomVerseHistory({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
        clearRandomVerseForward();

        // Use preloaded random verse for instantaneous transition
        const nextRef = getNextPreloadedRandomVerse(activeTranslation, { bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
        navigate(`/${activeMode}/${nextRef.bookId}/${nextRef.chapter}/${nextRef.verse}`);
        return;
      }

      const maxV = allChapterVerses.length || targetSingleVerseNum;
      if (targetSingleVerseNum < maxV) {
        navigate(`/${activeMode}/${book.id}/${initialChapter}/${targetSingleVerseNum + 1}`);
      } else {
        navigate(`/${activeMode}/${nextChapterRef.bookId}/${nextChapterRef.chapter}/1`);
      }
    } else {
      navigate(`/${activeMode}/${nextChapterRef.bookId}/${nextChapterRef.chapter}`);
    }
  }

  if (prevStepBtn) prevStepBtn.addEventListener('click', navigatePrevStep);
  if (nextStepBtn) nextStepBtn.addEventListener('click', navigateNextStep);

  function syncLiveStatsLabels() {
    const lbl1 = container.querySelector('#live-stat-lbl-1');
    const lbl2 = container.querySelector('#live-stat-lbl-2');
    const lbl3 = container.querySelector('#live-stat-lbl-3');
    if (activeMode === 'speak') {
      if (lbl1) lbl1.textContent = 'Cadence';
      if (lbl2) lbl2.textContent = 'Pronunciation';
      if (lbl3) lbl3.textContent = 'Enunciation';
    } else {
      if (lbl1) lbl1.textContent = 'WPM';
      if (lbl2) lbl2.textContent = 'CPM';
      if (lbl3) lbl3.textContent = 'Accuracy';
    }
  }

  function restartTyping() {
    clearTimer();
    startTime = null;
    elapsedMs = 0;
    totalKeystrokes = 0;
    correctKeystrokes = 0;
    mistakes = 0;
    errorBuffer = [];
    isCompleted = false;
    spokenWordErrors = [];
    spokenWordsEvaluated = 0;
    spokenWordsCorrect = 0;
    spokenPronunciationSum = 0;
    spokenEnunciationSum = 0;
    spokenWordStatusMap.clear();
    speechProcessedMap.clear();
    resetActiveVerseTelemetry();

    const speakEndCard = container.querySelector('#speak-end-summary-card');
    if (speakEndCard) {
      speakEndCard.hidden = true;
      speakEndCard.innerHTML = '';
    }
    wordsList.forEach(w => {
      if (w.wordEl) w.wordEl.classList.remove('is-speak-error', 'is-speak-active');
    });

    syncLiveStatsLabels();
    if (liveWpmEl) liveWpmEl.textContent = activeMode === 'speak' ? '0 WPM' : '0';
    if (liveCpmEl) liveCpmEl.textContent = activeMode === 'speak' ? '100%' : '0';
    if (liveAccEl) liveAccEl.textContent = '100%';
    if (liveTimeEl) liveTimeEl.textContent = '0:00';
    if (errorAlert) errorAlert.hidden = true;
    if (completionBackdrop) completionBackdrop.hidden = true;
    if (viewportWrapper) viewportWrapper.classList.remove('has-active-error');
    if (advanceStepBtn) {
      advanceStepBtn.hidden = !singleVerseMode || autoAdvance || activeMode === 'draw';
      advanceStepBtn.classList.remove('btn-primary', 'is-ready');
      advanceStepBtn.classList.add('btn-secondary');
      advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
      advanceStepBtn.title = 'Advance to next verse (or press Enter)';
    }

    // Move cursor to start without clearing completed verses
    const startVerseNum = singleVerseMode
      ? (targetSingleVerseNum || 1)
      : (verseRanges[0]?.verse || 1);

    jumpToVerse(startVerseNum, {
      manualClick: true,
      statusMessage: `↺ Cursor moved to start of ${singleVerseMode ? `Verse ${startVerseNum}` : `${book.name} ${initialChapter}`}. Completed verses are preserved.`
    });

    if (passageScroll) {
      passageScroll.scrollTop = 0;
    }
    if (activeMode === 'speak' && micEnabled) {
      stopSpeechRecognition();
      startSpeechRecognition();
    } else {
      focusTypingInput();
    }
  }

  if (modalRestartBtn) {
    modalRestartBtn.addEventListener('click', () => {
      closeActionsModal();
      trackEvent('restart_bible_chapter', { bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum, mode: activeMode });
      restartTyping();
    });
  }

  // ── 6. Jump to Verse & Find Next Incomplete Verse Helpers ──────
  function resetActiveVerseTelemetry() {
    verseStartTime = null;
    verseKeystrokes = 0;
    verseCorrectKeystrokes = 0;
    verseMistakes = 0;
    verseSpokenWordErrors = [];
    verseSpokenWordsEvaluated = 0;
    verseSpokenWordsCorrect = 0;
    verseSpokenPronunciationSum = 0;
    verseSpokenEnunciationSum = 0;
  }

  function findNextIncompleteVerseIdx(fromVIdx, wrapAround = false) {
    for (let i = fromVIdx; i < verseRanges.length; i++) {
      if (!completedVerseSet.has(verseRanges[i].verse)) {
        return i;
      }
    }
    if (wrapAround) {
      for (let i = 0; i < fromVIdx; i++) {
        if (!completedVerseSet.has(verseRanges[i].verse)) {
          return i;
        }
      }
    }
    return -1;
  }

  function jumpToVerse(verseNum, options = {}) {
    const vRange = verseRanges.find(vr => vr.verse === Number(verseNum));
    if (!vRange) return false;

    errorBuffer = [];
    cursorIdx = vRange.startCharIdx;
    const mappedWordIdx = charToWordIdxMap[cursorIdx];
    if (typeof mappedWordIdx === 'number' && mappedWordIdx >= 0) {
      currentWordIdx = mappedWordIdx;
    } else {
      const firstWordInVerse = wordsList.findIndex(w => w.verse === Number(verseNum));
      currentWordIdx = firstWordInVerse >= 0 ? firstWordInVerse : 0;
    }
    resetActiveVerseTelemetry();

    if (options.isSkipJump) {
      lastSkipJumpTime = performance.now();
    }

    // Clear all transient .is-correct / .is-error / .is-current classes and refresh DOM styling
    refreshAllCharClasses();
    updateCursorAndErrorClasses(cursorIdx, 0);

    if (options.statusMessage && telemetrySubStatusEl) {
      telemetrySubStatusEl.innerHTML = options.statusMessage;
    }

    if (activeMode !== 'speak') {
      focusTypingInput();
    }
    return true;
  }

  function refreshAllCharClasses() {
    const currentVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
    const currentVR = verseRanges[currentVIdx];

    for (let vIdx = 0; vIdx < verseRanges.length; vIdx++) {
      const vr = verseRanges[vIdx];
      const isVDone = completedVerseSet.has(vr.verse);
      if (vr.verseBlockEl) {
        vr.verseBlockEl.classList.toggle('is-verse-completed', isVDone);
      }
      if (vr.supEl) {
        vr.supEl.classList.toggle('is-done', isVDone);
        vr.supEl.textContent = isVDone ? `✓ ${vr.verse}` : String(vr.verse);
      }
      for (let cIdx = vr.startCharIdx; cIdx <= vr.endCharIdx; cIdx++) {
        const el = charEls[cIdx];
        if (!el) continue;
        el.classList.remove('is-current', 'is-error', 'is-error-caret', 'is-speak-error');
        const wIdx = charToWordIdxMap[cIdx];
        const wordStatus = typeof wIdx === 'number' ? spokenWordStatusMap.get(wIdx) : null;
        if (wordStatus === 'error' && activeMode === 'speak') {
          el.classList.remove('is-correct');
          el.classList.add('is-speak-error');
        } else if (isVDone) {
          el.classList.add('is-correct');
        } else if (vr === currentVR && cIdx < cursorIdx) {
          el.classList.add('is-correct');
        } else {
          el.classList.remove('is-correct');
        }
      }
    }

    wordsList.forEach(w => {
      if (!w.wordEl) return;
      const st = spokenWordStatusMap.get(w.wordIdx);
      w.wordEl.classList.toggle('is-speak-error', activeMode === 'speak' && st === 'error');
      w.wordEl.classList.toggle('is-speak-active', activeMode === 'speak' && !isCompleted && w.wordIdx === currentWordIdx);
    });
  }

  // ── 7. Passage DOM Builder & Typing / Speaking Engine ──────────
  function updateVerseSup(supEl, vNum) {
    if (!supEl) return;
    const summary = getChapterProgressSummary(book.id, initialChapter, activeTranslation);
    const vRec = summary.record?.completedVerses?.[String(vNum)];
    const isVRead = Boolean(summary.isFullyRead || vRec?.isRead);
    const isVSpoken = Boolean(summary.isFullySpoken || vRec?.isSpoken);
    const isVTyped = Boolean(summary.isFullyTyped || vRec?.isTyped || (!isVSpoken && !isVRead && vRec?.count && vRec.count > 0));
    const modesCount = (isVRead ? 1 : 0) + (isVTyped ? 1 : 0) + (isVSpoken ? 1 : 0);
    let cls = 'verse-num';
    let txt = String(vNum);
    let tip = `Verse ${vNum}`;
    if (modesCount >= 2) {
      cls += ' is-both';
      txt = `✓ ${vNum}`;
      tip = `Verse ${vNum} — Completed in multiple modes! Click to toggle read status.`;
    } else if (isVTyped) {
      cls += ' is-done';
      txt = `✓ ${vNum}`;
      tip = `Verse ${vNum} — Typed in typing engine. Click to toggle read status.`;
    } else if (isVSpoken) {
      cls += ' is-spoken';
      txt = `🗣️ ${vNum}`;
      tip = `Verse ${vNum} — Spoken aloud. Click to toggle read status.`;
    } else if (isVRead) {
      cls += ' is-read';
      txt = `📖 ${vNum}`;
      tip = `Verse ${vNum} — Marked as read. Click to toggle read status.`;
    } else {
      tip = `Verse ${vNum} — Click to mark as read.`;
    }
    supEl.className = cls;
    supEl.textContent = txt;
    supEl.title = tip;
  }

  function buildPassageDOM(loadedChapterVerses) {
    allChapterVerses = loadedChapterVerses;
    const { set: storedDoneSet } = loadCompletedVersesFromStore();
    completedVerseSet = storedDoneSet;

    if (singleVerseMode && targetSingleVerseNum) {
      const matchedVerse = allChapterVerses.find(v => v.verse === targetSingleVerseNum) || allChapterVerses[0];
      verses = matchedVerse ? [matchedVerse] : [];
    } else {
      verses = allChapterVerses;
    }

    verseRanges = [];
    targetChars = [];
    charToVerseMap = [];
    charToVerseIdxMap = [];
    charEls = [];
    wordsList = [];
    charToWordIdxMap = [];
    currentWordIdx = 0;
    spokenWordErrors = [];
    spokenWordsEvaluated = 0;
    spokenWordsCorrect = 0;
    spokenPronunciationSum = 0;
    spokenEnunciationSum = 0;
    spokenWordStatusMap.clear();
    speechProcessedMap.clear();
    cursorIdx = 0;
    errorBuffer = [];
    startTime = null;
    elapsedMs = 0;
    totalKeystrokes = 0;
    correctKeystrokes = 0;
    mistakes = 0;
    isCompleted = false;
    sittingTypedVersesSet = new Set();
    sittingSessionId = `${activeMode === 'speak' ? 'spk' : 's'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    resetActiveVerseTelemetry();
    clearTimer();

    const speakEndCard = container.querySelector('#speak-end-summary-card');
    if (speakEndCard) {
      speakEndCard.hidden = true;
      speakEndCard.innerHTML = '';
    }

    const fragment = document.createDocumentFragment();
    let globalCharIdx = 0;

    verses.forEach((v, vIdx) => {
      const isVDone = completedVerseSet.has(v.verse);
      const verseBlock = document.createElement('span');
      verseBlock.className = `verse-block ${isVDone ? 'is-verse-completed' : ''}`;
      verseBlock.setAttribute('data-verse', String(v.verse));
      verseBlock.title = singleVerseMode
        ? `${book.name} ${initialChapter}:${v.verse}`
        : `Verse ${v.verse}${isVDone ? ' (✓ Completed)' : ''} — Click to start at Verse ${v.verse}`;

      const startCharIdx = globalCharIdx;
      let supElement = null;

      const words = v.text.split(' ').filter(w => w.length > 0);
      words.forEach((word, wIdx) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 't-word';
        const thisWordGlobalIdx = wordsList.length;
        wordSpan.setAttribute('data-word-idx', String(thisWordGlobalIdx));

        // Attach visible (non-typed) verse number superscript right before the first word of the verse
        if (wIdx === 0) {
          const sup = document.createElement('sup');
          sup.setAttribute('aria-hidden', 'true');
          sup.style.cursor = 'pointer';
          updateVerseSup(sup, v.verse);
          sup.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleVerseRead(book.id, initialChapter, v.verse, activeTranslation);
          });
          wordSpan.appendChild(sup);
          supElement = sup;

          if (!singleVerseMode) {
            const favBtn = document.createElement('button');
            favBtn.type = 'button';
            favBtn.className = 'verse-fav-btn';
            favBtn.setAttribute('data-verse', String(v.verse));
            const isFav = isVerseFavorited(book.id, initialChapter, v.verse);
            if (isFav) {
              favBtn.classList.add('is-favorited');
              favBtn.textContent = '❤️';
              favBtn.title = `Verse ${v.verse} in favorites. Click to remove.`;
            } else {
              favBtn.textContent = '🤍';
              favBtn.title = `Save Verse ${v.verse} to favorites`;
            }
            favBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const nowFav = toggleVerseFavorite({
                bookId: book.id,
                chapter: initialChapter,
                verse: v.verse,
                verseRef: `${book.name} ${initialChapter}:${v.verse}`,
                verseText: v.text,
                translation: activeTranslation
              });
              favBtn.classList.toggle('is-favorited', nowFav);
              favBtn.textContent = nowFav ? '❤️' : '🤍';
              favBtn.title = nowFav
                ? `Verse ${v.verse} in favorites. Click to remove.`
                : `Save Verse ${v.verse} to favorites`;
              trackEvent('toggle_verse_favorite', {
                bookId: book.id,
                chapter: initialChapter,
                verse: v.verse,
                isFavorited: nowFav,
                mode: 'chapter'
              });
            });
            wordSpan.appendChild(favBtn);
          }
        }

        const wordStartCharIdx = globalCharIdx;
        for (let i = 0; i < word.length; i++) {
          const ch = word[i];
          const charSpan = document.createElement('span');
          charSpan.className = 't-char';
          charSpan.setAttribute('data-idx', String(globalCharIdx));
          charSpan.textContent = ch;
          wordSpan.appendChild(charSpan);

          targetChars.push(ch);
          charToVerseMap.push(v.verse);
          charToVerseIdxMap.push(vIdx);
          charToWordIdxMap.push(thisWordGlobalIdx);
          charEls.push(charSpan);
          globalCharIdx++;
        }
        const wordEndCharIdx = globalCharIdx - 1;

        verseBlock.appendChild(wordSpan);

        const isLastWordOfVerse = wIdx === words.length - 1;
        const isLastVerseOfChapter = vIdx === verses.length - 1;
        if (!isLastWordOfVerse || !isLastVerseOfChapter) {
          const spaceSpan = document.createElement('span');
          spaceSpan.className = 't-char t-space';
          spaceSpan.setAttribute('data-idx', String(globalCharIdx));
          spaceSpan.textContent = ' ';
          verseBlock.appendChild(spaceSpan);

          targetChars.push(' ');
          charToVerseMap.push(v.verse);
          charToVerseIdxMap.push(vIdx);
          charToWordIdxMap.push(thisWordGlobalIdx);
          charEls.push(spaceSpan);
          globalCharIdx++;
        }

        wordsList.push({
          wordIdx: thisWordGlobalIdx,
          verse: v.verse,
          vIdx,
          rawWord: word,
          cleanWord: normalizeSpokenWord(word),
          startCharIdx: wordStartCharIdx,
          endCharIdx: wordEndCharIdx,
          nextCursorCharIdx: globalCharIdx,
          isLastWordOfVerse,
          wordEl: wordSpan
        });
      });

      const endCharIdx = globalCharIdx - 1;
      const isLastVerseOfChapter = vIdx === verses.length - 1;
      const wordEndIdx = isLastVerseOfChapter ? endCharIdx : endCharIdx - 1;

      verseRanges.push({
        verse: v.verse,
        vIdx,
        startCharIdx,
        wordEndIdx,
        endCharIdx,
        charCount: Math.max(1, wordEndIdx - startCharIdx + 1),
        wordCount: words.length,
        verseBlockEl: verseBlock,
        supEl: supElement
      });

      // Allow clicking any verse in Full-Chapter mode to jump the cursor to the start of that verse
      if (!singleVerseMode) {
        verseBlock.addEventListener('click', (e) => {
          e.stopPropagation();
          jumpToVerse(v.verse, {
            manualClick: true,
            statusMessage: `📍 Jumped to <strong>${book.name} ${initialChapter}:${v.verse}</strong>.`
          });
        });
      }

      fragment.appendChild(verseBlock);
    });

    passageContent.innerHTML = '';
    passageContent.appendChild(fragment);

    // Update header badge
    const badgeEl = container.querySelector('#telemetry-completed-badge');
    if (badgeEl) badgeEl.innerHTML = getProgressBadgeHtml();

    // Determine initial starting verse
    let initialTargetVerseNum = verses[0]?.verse || 1;
    let initialSkipNotice = '';

    if (!singleVerseMode) {
      if (requestedStartVerse && verseRanges.some(vr => vr.verse === requestedStartVerse)) {
        initialTargetVerseNum = requestedStartVerse;
        initialSkipNotice = `📍 Starting at <strong>${book.name} ${initialChapter}:${requestedStartVerse}</strong>. Click any verse to jump.`;
      } else if (skipCompletedVerses && completedVerseSet.size > 0 && completedVerseSet.size < verses.length) {
        const firstIncompleteIdx = findNextIncompleteVerseIdx(0, false);
        if (firstIncompleteIdx >= 0) {
          initialTargetVerseNum = verseRanges[firstIncompleteIdx].verse;
          if (firstIncompleteIdx > 0) {
            initialSkipNotice = `⏭️ Resuming partial chapter at next incomplete verse: <strong>${book.name} ${initialChapter}:${initialTargetVerseNum}</strong> (${completedVerseSet.size}/${verses.length} verses already completed). Click any verse to jump.`;
          }
        }
      }
    }

    // Reset telemetry UI
    syncLiveStatsLabels();
    liveWpmEl.textContent = activeMode === 'speak' ? '0 WPM' : '0';
    liveCpmEl.textContent = activeMode === 'speak' ? '100%' : '0';
    liveAccEl.textContent = '100%';
    liveTimeEl.textContent = '0:00';
    errorAlert.hidden = true;
    completionBackdrop.hidden = true;
    passageScroll.scrollTop = 0;

    jumpToVerse(initialTargetVerseNum, {
      statusMessage: initialSkipNotice || (singleVerseMode
        ? `Single-verse mode — ${activeMode === 'speak' ? 'speak' : 'type'} Verse ${targetSingleVerseNum}, or click "Read Full Chapter" to view all ${allChapterVerses.length} verses.`
        : `Click any verse in the chapter to start from that verse. Completed verses are remembered automatically.`)
    });

    applyMeditateModeState();
  }

  function updateSpeakMicUI() {
    if (!speakMicToggleBtn) return;
    const isSpeak = activeMode === 'speak';
    speakMicToggleBtn.hidden = !isSpeak;
    speakMicToggleBtn.classList.toggle('is-mic-active', Boolean(isSpeak && micEnabled));
    if (speakMicToggleLabel) {
      speakMicToggleLabel.textContent = micEnabled ? '🎙️ Mic On' : '🔇 Mic Off';
    }
    if (speakStatusPill) {
      speakStatusPill.hidden = !isSpeak;
      if (isSpeak) {
        if (!speechSupported) {
          speakStatusPill.textContent = '⚠️ Speech recognition unsupported in this browser (try Chrome/Edge/Safari)';
          speakStatusPill.classList.add('is-error');
        } else if (!micEnabled) {
          speakStatusPill.textContent = 'Mic paused — click "Mic On" to resume speaking';
          speakStatusPill.classList.remove('is-error');
        } else {
          speakStatusPill.textContent = '🎙️ Listening — speak each word naturally...';
          speakStatusPill.classList.remove('is-error');
        }
      }
    }
  }

  // ── Draw Mode (Coloring Canvas & Verse Sanctuary) & Mode State ─
  function applyMeditateModeState() {
    const isMeditate = Boolean(singleVerseMode && activeMode === 'draw');
    const isSpeak = activeMode === 'speak';

    if (viewportWrapper) {
      viewportWrapper.classList.toggle('is-meditate-active', isMeditate);
      viewportWrapper.classList.toggle('is-speak-active', isSpeak);
    }

    if (advanceStepBtn) {
      advanceStepBtn.hidden = isMeditate || !singleVerseMode || autoAdvance;
    }

    if (meditateMarkReadBtn) {
      meditateMarkReadBtn.hidden = !isMeditate;
    }

    syncLiveStatsLabels();
    if (summaryStatsLine) {
      summaryStatsLine.hidden = isMeditate || !showTypingStats;
    }

    if (focusBannerText) {
      focusBannerText.textContent = isSpeak
        ? '🎙️ Speak aloud into your microphone to advance word by word'
        : '⌨️ Click any verse or press any key to resume typing';
    }

    if (focusBanner && (isMeditate || isSpeak)) {
      focusBanner.hidden = true;
    }

    if (errorAlert && (isMeditate || isSpeak)) {
      errorAlert.hidden = true;
    }

    updateSpeakMicUI();

    if (isMeditate) {
      stopSpeechRecognition();
      if (passageScroll) passageScroll.hidden = true;
      if (meditateCanvasWrapper) {
        meditateCanvasWrapper.hidden = false;
        renderMeditateModeCanvas();
      }
    } else if (isSpeak) {
      if (passageScroll) passageScroll.hidden = false;
      if (meditateCanvasWrapper) {
        meditateCanvasWrapper.hidden = true;
      }
      refreshAllCharClasses();
      updateCursorAndErrorClasses(cursorIdx, 0);
      if (micEnabled && !isCompleted) {
        startSpeechRecognition();
      } else {
        stopSpeechRecognition();
      }
    } else {
      stopSpeechRecognition();
      if (passageScroll) passageScroll.hidden = false;
      if (meditateCanvasWrapper) {
        meditateCanvasWrapper.hidden = true;
      }
      refreshAllCharClasses();
      updateCursorAndErrorClasses(cursorIdx, 0);
      focusTypingInput();
    }
  }

  function renderMeditateModeCanvas() {
    if (!meditateCanvasWrapper) return;

    const activeVNum = targetSingleVerseNum || 1;
    const currentVerseObj = verses.find(v => v.verse === activeVNum) || verses[0] || { verse: activeVNum, text: '' };
    const verseText = currentVerseObj.text || '';
    const verseRef = `${book.name} ${initialChapter}:${activeVNum}`;

    const existingMed = getVerseMeditation(book.id, initialChapter, activeVNum);
    if (existingMed && typeof existingMed.templateIdx === 'number') {
      currentArtworkTemplateIdx = existingMed.templateIdx;
    }

    let savedFills = existingMed?.fills ? { ...existingMed.fills } : {};
    let activeFont = (existingMed?.fontFamily && !existingMed.fontFamily.includes('Playfair'))
      ? existingMed.fontFamily
      : getMeditateFontPref();
    let activeFontSize = typeof existingMed?.fontSize === 'number' ? existingMed.fontSize : getMeditateFontSizePref();
    let activeFontCase = existingMed?.fontCase === 'uppercase' ? 'uppercase' : (getMeditateFontCasePref() === 'uppercase' ? 'uppercase' : 'none');
    let activeFontColor = typeof existingMed?.fontColor === 'string' ? existingMed.fontColor : getMeditateFontColorPref();
    let activeBoxWidth = typeof existingMed?.boxWidth === 'number' ? existingMed.boxWidth : getMeditateBoxWidthPref();
    let textX = typeof existingMed?.textX === 'number' ? existingMed.textX : 50;
    let textY = typeof existingMed?.textY === 'number' ? existingMed.textY : 76;

    function persistMeditation() {
      // First colour equals save: only save if user has started coloring
      if (!savedFills || Object.keys(savedFills).length === 0) {
        return;
      }
      saveVerseMeditation({
        bookId: book.id,
        chapter: initialChapter,
        verse: activeVNum,
        verseRef,
        verseText,
        translation: getTranslationByCode(activeTranslation).shortName,
        templateIdx: currentArtworkTemplateIdx,
        fills: savedFills,
        fontFamily: activeFont,
        fontSize: activeFontSize,
        fontCase: activeFontCase,
        fontColor: activeFontColor,
        boxWidth: activeBoxWidth,
        textX,
        textY
      });
    }

    // Render artwork with NO border plaque (verse text rendered as interactive draggable overlay)
    const svgHtml = renderMeditateArtworkSvg(
      currentArtworkTemplateIdx,
      '',
      '',
      '',
      savedFills,
      { textX, textY, fontFamily: activeFont, fontSize: activeFontSize, fontCase: activeFontCase, fontColor: activeFontColor, boxWidth: activeBoxWidth }
    );

    const activeColor = meditatePalette[activePaletteIndex] || '#38BDF8';
    const isEraserActive = activePaletteIndex === 9 || activeColor.toUpperCase() === '#FFFFFF';

    meditateCanvasWrapper.innerHTML = `
      <div class="meditate-art-container" id="meditate-art-container">
        ${svgHtml}

        <!-- Draggable, Resizable Scripture Typography (NO border plaque, wraps dynamically) -->
        <div
          class="meditate-draggable-text-box ${activeFontColor ? 'has-custom-color' : ''}"
          id="meditate-draggable-text-box"
          style="left: ${textX}%; top: ${textY}%; width: ${activeBoxWidth}px; font-family: ${activeFont}; font-size: ${activeFontSize}px; text-transform: ${activeFontCase}; ${activeFontColor ? `--meditate-font-color: ${activeFontColor}; color: ${activeFontColor};` : ''}"
          title="Drag to position scripture, or drag edge handle to resize width"
        >
          <div class="meditate-drag-grip" id="meditate-drag-grip" title="Click &amp; drag to reposition scripture">
            <span class="grip-dots">⋮⋮</span>
            <span class="grip-label">Drag</span>
          </div>
          <div class="meditate-drag-content">
            <p class="meditate-drag-quote">“${escapeHtml(verseText)}”</p>
            <div class="meditate-drag-citation">
              <strong>${escapeHtml(verseRef)}</strong>
              <span class="meditate-tr-badge">${escapeHtml(getTranslationByCode(activeTranslation).shortName)}</span>
            </div>
          </div>
          <!-- Right-edge Resize Handle -->
          <div class="meditate-text-resize-handle" id="meditate-text-resize-handle" title="Drag to resize text box width"></div>
        </div>
      </div>

      <!-- Bottom Palette Toolbar -->
      <div class="meditate-palette-bar" id="meditate-palette-bar">
        <!-- Tool Mode Indicator -->
        <div class="meditate-tool-indicator">
          <span class="meditate-tool-icon">${isEraserActive ? '🧹 Eraser' : '🎨 Paint'}</span>
          <span class="meditate-active-color-dot" id="meditate-active-color-dot" style="background:${activeColor};"></span>
        </div>

        <!-- 10 Colors Swatches -->
        <div class="meditate-swatches-strip" id="meditate-swatches-strip">
          ${meditatePalette.map((color, idx) => {
            const isEraser = idx === 9;
            const isActive = idx === activePaletteIndex;
            return `
              <div class="meditate-swatch-unit" data-idx="${idx}">
                <button
                  type="button"
                  class="meditate-swatch-btn ${isActive ? 'is-active' : ''} ${isEraser ? 'is-eraser' : ''}"
                  data-idx="${idx}"
                  style="background: ${color};"
                  title="${isEraser ? 'Eraser (White)' : `Color ${idx + 1}: ${color}`}"
                >
                  ${isEraser ? '🧹' : ''}
                </button>
                <label class="meditate-swatch-edit-trigger" title="Change this color">
                  ✎
                  <input
                    type="color"
                    class="meditate-color-input-hidden"
                    data-idx="${idx}"
                    value="${color}"
                    aria-label="Edit color ${idx + 1}"
                  />
                </label>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Font Popover Button & Change Artwork Actions -->
        <div class="meditate-actions-strip">
          <!-- Font (A) Popover Button -->
          <div class="meditate-font-btn-wrap" id="meditate-font-btn-wrap">
            <button
              type="button"
              class="btn btn-secondary btn-xs meditate-font-btn"
              id="meditate-font-popover-btn"
              title="Typography & Text Settings"
              aria-haspopup="true"
              aria-expanded="false"
            >
              <span class="meditate-font-badge-a">A</span> Font
            </button>

            <!-- Typography Popover Card -->
            <div class="meditate-font-popover" id="meditate-font-popover" hidden>
              <!-- Font Family Selector -->
              <div class="meditate-popover-row">
                <span class="meditate-popover-label">Font Family</span>
                <select class="meditate-font-select" id="meditate-font-select" title="Choose scripture font">
                  <option value="Arial, -apple-system, sans-serif" ${activeFont.includes('Arial') ? 'selected' : ''}>Arial (Default)</option>
                  <option value="'Playfair Display', Georgia, serif" ${activeFont.includes('Playfair') ? 'selected' : ''}>Playfair Display (Serif)</option>
                  <option value="'Inter', -apple-system, sans-serif" ${activeFont.includes('Inter') ? 'selected' : ''}>Inter (Modern Sans)</option>
                  <option value="'Caveat', cursive, serif" ${activeFont.includes('Caveat') ? 'selected' : ''}>Caveat (Handwriting)</option>
                  <option value="'Cinzel', Georgia, serif" ${activeFont.includes('Cinzel') ? 'selected' : ''}>Cinzel (Majestic Serif)</option>
                  <option value="'JetBrains Mono', monospace" ${activeFont.includes('Mono') ? 'selected' : ''}>JetBrains Mono</option>
                  <option value="Georgia, serif" ${activeFont === 'Georgia, serif' ? 'selected' : ''}>Georgia</option>
                </select>
              </div>

              <!-- Text Style: Default (Arial, Normal Case) vs ALL CAPS -->
              <div class="meditate-popover-row">
                <span class="meditate-popover-label">Text Style</span>
                <div class="meditate-case-toggle-group" id="meditate-case-toggle-group">
                  <button
                    type="button"
                    class="meditate-case-btn ${activeFontCase !== 'uppercase' && activeFont.includes('Arial') ? 'is-active' : ''}"
                    data-case="default"
                    id="meditate-case-default-btn"
                    title="Reset to default font (Arial, normal case, 20px)"
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    class="meditate-case-btn ${activeFontCase === 'uppercase' ? 'is-active' : ''}"
                    data-case="uppercase"
                    id="meditate-case-uppercase-btn"
                    title="Convert text to ALL CAPS"
                  >
                    ALL CAPS
                  </button>
                </div>
              </div>

              <!-- Font Size Stepper -->
              <div class="meditate-popover-size-row">
                <span class="meditate-popover-label">Font Size</span>
                <div class="meditate-font-size-group">
                  <button type="button" class="btn btn-secondary btn-xs font-size-btn" id="meditate-font-down-btn" title="Decrease font size">A−</button>
                  <span class="meditate-font-size-lbl" id="meditate-font-size-lbl">${activeFontSize}px</span>
                  <button type="button" class="btn btn-secondary btn-xs font-size-btn" id="meditate-font-up-btn" title="Increase font size">A+</button>
                </div>
              </div>

              <!-- Font Colour Selector -->
              <div class="meditate-popover-row">
                <span class="meditate-popover-label">Font Colour</span>
                <div class="meditate-font-color-row" id="meditate-font-color-row">
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${!activeFontColor ? 'is-active' : ''}"
                    data-color=""
                    title="Default (Theme Auto)"
                  >
                    <span class="swatch-auto-icon">Auto</span>
                  </button>
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${activeFontColor.toLowerCase() === '#ffffff' ? 'is-active' : ''}"
                    data-color="#ffffff"
                    title="White"
                  >
                    <span class="swatch-circle" style="background: #ffffff; border: 1px solid rgba(0,0,0,0.25);"></span>
                  </button>
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${activeFontColor.toLowerCase() === '#0f172a' ? 'is-active' : ''}"
                    data-color="#0f172a"
                    title="Charcoal"
                  >
                    <span class="swatch-circle" style="background: #0f172a;"></span>
                  </button>
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${activeFontColor.toLowerCase() === '#f59e0b' ? 'is-active' : ''}"
                    data-color="#f59e0b"
                    title="Gold"
                  >
                    <span class="swatch-circle" style="background: #f59e0b;"></span>
                  </button>
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${activeFontColor.toLowerCase() === '#38bdf8' ? 'is-active' : ''}"
                    data-color="#38bdf8"
                    title="Sky Blue"
                  >
                    <span class="swatch-circle" style="background: #38bdf8;"></span>
                  </button>
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${activeFontColor.toLowerCase() === '#10b981' ? 'is-active' : ''}"
                    data-color="#10b981"
                    title="Emerald"
                  >
                    <span class="swatch-circle" style="background: #10b981;"></span>
                  </button>
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${activeFontColor.toLowerCase() === '#f43f5e' ? 'is-active' : ''}"
                    data-color="#f43f5e"
                    title="Rose"
                  >
                    <span class="swatch-circle" style="background: #f43f5e;"></span>
                  </button>
                  <button
                    type="button"
                    class="meditate-color-swatch-btn ${activeFontColor.toLowerCase() === '#8b5cf6' ? 'is-active' : ''}"
                    data-color="#8b5cf6"
                    title="Violet"
                  >
                    <span class="swatch-circle" style="background: #8b5cf6;"></span>
                  </button>
                  <label class="meditate-color-picker-btn" title="Pick custom colour">
                    <input type="color" id="meditate-font-color-picker" class="meditate-color-picker-input" value="${activeFontColor || '#38bdf8'}" />
                    <span class="meditate-picker-label">🎨</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Change Artwork (NO numbers on button) -->
          <button type="button" class="btn btn-secondary btn-xs" id="meditate-change-art-btn" title="Cycle to next uplifting artwork">
            🎨 Change Artwork
          </button>
        </div>
      </div>
    `;

    // Attach click listener on SVG segments
    const svgEl = meditateCanvasWrapper.querySelector('.meditate-svg-art');
    if (svgEl) {
      svgEl.addEventListener('click', (e) => {
        const seg = e.target.closest('.paint-segment');
        if (!seg) return;
        const segId = seg.getAttribute('data-seg-id') || seg.id;
        if (!segId) return;

        const currentColor = meditatePalette[activePaletteIndex] || '#38BDF8';
        seg.setAttribute('fill', currentColor);
        seg.style.fill = currentColor;

        savedFills[segId] = currentColor;
        trackEvent('paint_meditation_segment', {
          bookId: book.id,
          chapter: initialChapter,
          verse: activeVNum,
          segId,
          templateIdx: currentArtworkTemplateIdx
        });
        persistMeditation();
      });
    }

    // Attach Draggable Text Handler
    const dragBox = meditateCanvasWrapper.querySelector('#meditate-draggable-text-box');
    const containerEl = meditateCanvasWrapper.querySelector('#meditate-art-container');
    const resizeHandle = meditateCanvasWrapper.querySelector('#meditate-text-resize-handle');

    if (dragBox && containerEl) {
      let isDragging = false;
      let startMouseX = 0;
      let startMouseY = 0;
      let startLeftPct = textX;
      let startTopPct = textY;

      const onPointerDown = (e) => {
        if (e.target && e.target.closest('#meditate-text-resize-handle')) {
          return; // Resize handle handles resizing
        }
        if (e.button !== undefined && e.button !== 0) return;
        isDragging = true;
        dragBox.classList.add('is-dragging');
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startLeftPct = textX;
        startTopPct = textY;
        try {
          dragBox.setPointerCapture(e.pointerId);
        } catch (_) {}
        e.preventDefault();
        e.stopPropagation();
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;
        const rect = containerEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const deltaX = e.clientX - startMouseX;
        const deltaY = e.clientY - startMouseY;

        const deltaPctX = (deltaX / rect.width) * 100;
        const deltaPctY = (deltaY / rect.height) * 100;

        textX = Math.max(2, Math.min(95, Math.round((startLeftPct + deltaPctX) * 10) / 10));
        textY = Math.max(2, Math.min(95, Math.round((startTopPct + deltaPctY) * 10) / 10));

        dragBox.style.left = `${textX}%`;
        dragBox.style.top = `${textY}%`;
      };

      const onPointerUp = (e) => {
        if (!isDragging) return;
        isDragging = false;
        dragBox.classList.remove('is-dragging');
        try {
          dragBox.releasePointerCapture(e.pointerId);
        } catch (_) {}

        persistMeditation();
      };

      dragBox.addEventListener('pointerdown', onPointerDown);
      dragBox.addEventListener('pointermove', onPointerMove);
      dragBox.addEventListener('pointerup', onPointerUp);
      dragBox.addEventListener('pointercancel', onPointerUp);
    }

    // Attach Resizable Text Box Handler
    if (resizeHandle && dragBox && containerEl) {
      let isResizing = false;
      let startResizeX = 0;
      let startBoxWidth = activeBoxWidth;

      const onResizeDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isResizing = true;
        dragBox.classList.add('is-resizing');
        startResizeX = e.clientX;
        startBoxWidth = activeBoxWidth;
        try {
          resizeHandle.setPointerCapture(e.pointerId);
        } catch (_) {}
        e.preventDefault();
        e.stopPropagation();
      };

      const onResizeMove = (e) => {
        if (!isResizing) return;
        const containerRect = containerEl.getBoundingClientRect();
        const maxW = Math.max(280, Math.min(850, Math.round(containerRect.width * 0.94)));
        const deltaX = (e.clientX - startResizeX) * 2; // Symmetric expansion relative to center
        activeBoxWidth = Math.max(180, Math.min(maxW, Math.round(startBoxWidth + deltaX)));
        dragBox.style.width = `${activeBoxWidth}px`;
      };

      const onResizeUp = (e) => {
        if (!isResizing) return;
        isResizing = false;
        dragBox.classList.remove('is-resizing');
        try {
          resizeHandle.releasePointerCapture(e.pointerId);
        } catch (_) {}

        setMeditateBoxWidthPref(activeBoxWidth);
        persistMeditation();
      };

      resizeHandle.addEventListener('pointerdown', onResizeDown);
      resizeHandle.addEventListener('pointermove', onResizeMove);
      resizeHandle.addEventListener('pointerup', onResizeUp);
      resizeHandle.addEventListener('pointercancel', onResizeUp);
    }

    // Attach Font (A) Popover Button & Outside-click handling
    const fontPopoverBtn = meditateCanvasWrapper.querySelector('#meditate-font-popover-btn');
    const fontPopover = meditateCanvasWrapper.querySelector('#meditate-font-popover');
    if (fontPopoverBtn && fontPopover) {
      fontPopoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willShow = fontPopover.hidden;
        fontPopover.hidden = !willShow;
        fontPopoverBtn.setAttribute('aria-expanded', willShow ? 'true' : 'false');
      });

      // Prevent clicks inside popover from closing it or propagating to canvas
      fontPopover.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
      });
      fontPopover.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      const onDocPointerDown = (e) => {
        if (fontPopover.hidden) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.includes(fontPopover) || path.includes(fontPopoverBtn)) {
          return;
        }
        if (!fontPopover.contains(e.target) && !fontPopoverBtn.contains(e.target)) {
          fontPopover.hidden = true;
          fontPopoverBtn.setAttribute('aria-expanded', 'false');
        }
      };

      if (meditateCanvasWrapper._popoverDocListener) {
        document.removeEventListener('pointerdown', meditateCanvasWrapper._popoverDocListener);
      }
      meditateCanvasWrapper._popoverDocListener = onDocPointerDown;
      document.addEventListener('pointerdown', onDocPointerDown);
    }

    // Attach Font Family Selector handler
    const fontSelect = meditateCanvasWrapper.querySelector('#meditate-font-select');
    const defaultBtn = meditateCanvasWrapper.querySelector('#meditate-case-default-btn');
    const allCapsBtn = meditateCanvasWrapper.querySelector('#meditate-case-uppercase-btn');
    const fontSizeLbl = meditateCanvasWrapper.querySelector('#meditate-font-size-lbl');

    if (fontSelect) {
      fontSelect.addEventListener('change', (e) => {
        activeFont = e.target.value;
        setMeditateFontPref(activeFont);
        if (dragBox) dragBox.style.fontFamily = activeFont;
        if (defaultBtn) {
          defaultBtn.classList.toggle('is-active', activeFont.includes('Arial') && activeFontCase !== 'uppercase');
        }
        persistMeditation();
      });
    }

    // Attach Default button (resets font to Arial, normal case, 20px, default width, default color)
    if (defaultBtn) {
      defaultBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeFont = DEFAULT_MEDITATE_FONT;
        activeFontSize = DEFAULT_MEDITATE_FONT_SIZE;
        activeFontCase = DEFAULT_MEDITATE_FONT_CASE; // 'none'
        activeFontColor = DEFAULT_MEDITATE_FONT_COLOR; // ''
        activeBoxWidth = DEFAULT_MEDITATE_BOX_WIDTH;

        setMeditateFontPref(activeFont);
        setMeditateFontSizePref(activeFontSize);
        setMeditateFontCasePref(activeFontCase);
        setMeditateFontColorPref(activeFontColor);
        setMeditateBoxWidthPref(activeBoxWidth);

        if (fontSelect) fontSelect.value = DEFAULT_MEDITATE_FONT;
        if (fontSizeLbl) fontSizeLbl.textContent = `${activeFontSize}px`;
        defaultBtn.classList.add('is-active');
        if (allCapsBtn) allCapsBtn.classList.remove('is-active');

        // Reset color swatches active state
        meditateCanvasWrapper.querySelectorAll('.meditate-color-swatch-btn').forEach(btn => {
          btn.classList.toggle('is-active', !btn.getAttribute('data-color'));
        });

        if (dragBox) {
          dragBox.style.fontFamily = activeFont;
          dragBox.style.fontSize = `${activeFontSize}px`;
          dragBox.style.textTransform = 'none';
          dragBox.style.width = `${activeBoxWidth}px`;
          dragBox.style.removeProperty('--meditate-font-color');
          dragBox.style.removeProperty('color');
          dragBox.classList.remove('has-custom-color');
        }
        persistMeditation();
      });
    }

    // Attach ALL CAPS button
    if (allCapsBtn) {
      allCapsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeFontCase = 'uppercase';
        setMeditateFontCasePref(activeFontCase);
        allCapsBtn.classList.add('is-active');
        if (defaultBtn) defaultBtn.classList.remove('is-active');
        if (dragBox) dragBox.style.textTransform = 'uppercase';
        persistMeditation();
      });
    }

    // Attach Font Size Stepper handlers
    const fontDownBtn = meditateCanvasWrapper.querySelector('#meditate-font-down-btn');
    const fontUpBtn = meditateCanvasWrapper.querySelector('#meditate-font-up-btn');

    const updateFontSize = (newSize) => {
      activeFontSize = Math.max(13, Math.min(42, newSize));
      setMeditateFontSizePref(activeFontSize);
      if (fontSizeLbl) fontSizeLbl.textContent = `${activeFontSize}px`;
      if (dragBox) dragBox.style.fontSize = `${activeFontSize}px`;
      persistMeditation();
    };

    if (fontDownBtn) {
      fontDownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateFontSize(activeFontSize - 2);
      });
    }
    if (fontUpBtn) {
      fontUpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateFontSize(activeFontSize + 2);
      });
    }

    // Attach Font Colour Swatches & Picker handlers
    const fontColorSwatches = meditateCanvasWrapper.querySelectorAll('.meditate-color-swatch-btn');
    const fontColorPicker = meditateCanvasWrapper.querySelector('#meditate-font-color-picker');

    const updateFontColor = (newColor) => {
      activeFontColor = newColor || '';
      setMeditateFontColorPref(activeFontColor);

      fontColorSwatches.forEach(btn => {
        const c = btn.getAttribute('data-color') || '';
        btn.classList.toggle('is-active', (c.toLowerCase() === activeFontColor.toLowerCase()) || (!c && !activeFontColor));
      });

      if (dragBox) {
        if (activeFontColor) {
          dragBox.style.setProperty('--meditate-font-color', activeFontColor);
          dragBox.style.color = activeFontColor;
          dragBox.classList.add('has-custom-color');
        } else {
          dragBox.style.removeProperty('--meditate-font-color');
          dragBox.style.removeProperty('color');
          dragBox.classList.remove('has-custom-color');
        }
      }

      if (defaultBtn) {
        defaultBtn.classList.toggle('is-active', activeFont.includes('Arial') && activeFontCase !== 'uppercase' && !activeFontColor);
      }

      persistMeditation();
    };

    fontColorSwatches.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const color = btn.getAttribute('data-color') || '';
        updateFontColor(color);
      });
    });

    if (fontColorPicker) {
      fontColorPicker.addEventListener('input', (e) => {
        e.stopPropagation();
        updateFontColor(e.target.value);
      });
      fontColorPicker.addEventListener('change', (e) => {
        e.stopPropagation();
        updateFontColor(e.target.value);
      });
    }

    // Attach Swatch Click handlers
    const swatchBtns = meditateCanvasWrapper.querySelectorAll('.meditate-swatch-btn');
    swatchBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute('data-idx'));
        activePaletteIndex = idx;
        trackEvent('select_meditation_color', { index: idx, color: meditatePalette[idx] });
        updatePaletteUI();
      });
    });

    // Attach Color Input change handlers
    const colorInputs = meditateCanvasWrapper.querySelectorAll('.meditate-color-input-hidden');
    colorInputs.forEach((input) => {
      const onColorChange = (e) => {
        const idx = Number(input.getAttribute('data-idx'));
        const newHex = e.target.value.toUpperCase();
        meditatePalette[idx] = newHex;
        setMeditatePalettePref(meditatePalette);
        updatePaletteUI();
      };
      input.addEventListener('input', onColorChange);
      input.addEventListener('change', onColorChange);
    });

    // Attach Change Art button (No numbers on button)
    const changeArtBtn = meditateCanvasWrapper.querySelector('#meditate-change-art-btn');
    if (changeArtBtn) {
      changeArtBtn.addEventListener('click', () => {
        currentArtworkTemplateIdx = (currentArtworkTemplateIdx + 1) % TOTAL_MEDITATE_ART_TEMPLATES;
        persistMeditation();
        renderMeditateModeCanvas();
      });
    }

    function updatePaletteUI() {
      const curColor = meditatePalette[activePaletteIndex] || '#38BDF8';
      const isEraser = activePaletteIndex === 9 || curColor.toUpperCase() === '#FFFFFF';

      const toolIcon = meditateCanvasWrapper.querySelector('.meditate-tool-icon');
      if (toolIcon) toolIcon.textContent = isEraser ? '🧹 Eraser' : '🎨 Paint';

      const dot = meditateCanvasWrapper.querySelector('#meditate-active-color-dot');
      if (dot) dot.style.background = curColor;

      swatchBtns.forEach((btn) => {
        const idx = Number(btn.getAttribute('data-idx'));
        const btnColor = meditatePalette[idx];
        btn.style.background = btnColor;
        btn.classList.toggle('is-active', idx === activePaletteIndex);
      });
    }
  }

  function updateLiveMetrics() {
    if (!startTime) return;
    elapsedMs = performance.now() - startTime;
    const minutes = Math.max(elapsedMs / 60000, 1 / 600);

    if (activeMode === 'speak') {
      const cadenceWpm = spokenWordsEvaluated > 0
        ? Math.round((spokenWordsEvaluated / minutes) * 10) / 10
        : 0;
      const cadenceDesc = getCadenceDescriptor(cadenceWpm);
      const pronAcc = spokenWordsEvaluated > 0
        ? Math.round((spokenPronunciationSum / spokenWordsEvaluated) * 10) / 10
        : 100;
      const enunAcc = spokenWordsEvaluated > 0
        ? Math.round((spokenEnunciationSum / spokenWordsEvaluated) * 10) / 10
        : 100;

      liveWpmEl.textContent = cadenceWpm > 0
        ? `${Math.round(cadenceWpm)} WPM${cadenceDesc.shortLabel ? ` · ${cadenceDesc.shortLabel}` : ''}`
        : '0 WPM';
      liveCpmEl.textContent = `${pronAcc}%`;
      liveAccEl.textContent = `${enunAcc}%`;
      liveTimeEl.textContent = formatDuration(elapsedMs);
      return;
    }

    const cpm = Math.round(correctKeystrokes / minutes);
    const wpm = Math.round((correctKeystrokes / 5 / minutes) * 10) / 10;
    const acc = totalKeystrokes > 0
      ? Math.round((correctKeystrokes / totalKeystrokes) * 1000) / 10
      : 100;

    liveWpmEl.textContent = wpm.toFixed(1);
    liveCpmEl.textContent = String(cpm);
    liveAccEl.textContent = `${acc}%`;
    liveTimeEl.textContent = formatDuration(elapsedMs);
  }

  function updateCursorAndErrorClasses(prevCursor, prevErrLen) {
    const clearStart = Math.max(0, Math.min(prevCursor, cursorIdx) - 2);
    const clearEnd = Math.min(charEls.length - 1, Math.max(prevCursor + prevErrLen, cursorIdx + errorBuffer.length) + 2);
    const currentVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
    const currentVR = verseRanges[currentVIdx];

    for (let i = clearStart; i <= clearEnd; i++) {
      const el = charEls[i];
      if (!el) continue;
      el.classList.remove('is-current', 'is-error', 'is-error-caret', 'is-speak-error');
      const vNum = charToVerseMap[i];
      const isVDone = completedVerseSet.has(vNum);
      const wIdx = charToWordIdxMap[i];
      const wordStatus = typeof wIdx === 'number' ? spokenWordStatusMap.get(wIdx) : null;
      if (activeMode === 'speak' && wordStatus === 'error') {
        el.classList.remove('is-correct');
        el.classList.add('is-speak-error');
      } else if (isVDone) {
        el.classList.add('is-correct');
      } else if (currentVR && i >= currentVR.startCharIdx && i < cursorIdx) {
        el.classList.add('is-correct');
      } else {
        el.classList.remove('is-correct');
      }
    }

    if (errorBuffer.length > 0 && activeMode === 'type') {
      for (let eIdx = 0; eIdx < errorBuffer.length; eIdx++) {
        const targetIndex = cursorIdx + eIdx;
        if (charEls[targetIndex]) {
          charEls[targetIndex].classList.add('is-error');
        }
      }
      const caretTarget = Math.min(cursorIdx + errorBuffer.length, charEls.length - 1);
      if (charEls[caretTarget]) {
        charEls[caretTarget].classList.add('is-error-caret');
      }
      errorAlert.hidden = false;
      viewportWrapper.classList.add('has-active-error');
    } else {
      errorAlert.hidden = true;
      viewportWrapper.classList.remove('has-active-error');
      if (charEls[cursorIdx]) {
        charEls[cursorIdx].classList.remove('is-correct');
        charEls[cursorIdx].classList.add('is-current');
      }
    }

    if (activeMode === 'speak') {
      wordsList.forEach(w => {
        if (!w.wordEl) return;
        const st = spokenWordStatusMap.get(w.wordIdx);
        w.wordEl.classList.toggle('is-speak-error', st === 'error');
        w.wordEl.classList.toggle('is-speak-active', !isCompleted && w.wordIdx === currentWordIdx);
      });
    }

    // Highlight active verse block & update verse counter
    const currentVerseNum = charToVerseMap[Math.min(cursorIdx, Math.max(0, charToVerseMap.length - 1))] || 1;
    if (singleVerseMode) {
      liveVerseEl.textContent = `v.${currentVerseNum}`;
    } else {
      liveVerseEl.textContent = `${currentVerseNum}/${verses.length}`;
    }

    passageContent.querySelectorAll('.verse-block.is-active-verse').forEach(vb => {
      if (vb.getAttribute('data-verse') !== String(currentVerseNum)) {
        vb.classList.remove('is-active-verse');
      }
    });
    const activeVerseBlock = passageContent.querySelector(`.verse-block[data-verse="${currentVerseNum}"]`);
    if (activeVerseBlock) {
      activeVerseBlock.classList.add('is-active-verse');
    }

    if (!singleVerseMode && currentVerseNum !== lastTrackedCursorVerse) {
      lastTrackedCursorVerse = currentVerseNum;
      updateSingleVerseFavBtn();
      updateSingleVerseBookmarkBtn();
    }

    // Update progress bar if element exists
    if (progressFill) {
      if (singleVerseMode) {
        const pct = targetChars.length > 0 ? Math.min(100, (cursorIdx / targetChars.length) * 100) : 0;
        progressFill.style.width = `${pct.toFixed(1)}%`;
      } else {
        const activeVIdx = charToVerseIdxMap[Math.min(cursorIdx, Math.max(0, charToVerseIdxMap.length - 1))] || 0;
        const activeVR = verseRanges[activeVIdx];
        const intraVerseFraction = activeVR
          ? Math.min(1, Math.max(0, (cursorIdx - activeVR.startCharIdx) / Math.max(1, activeVR.charCount)))
          : 0;
        const effectiveDoneVerses = completedVerseSet.size + (completedVerseSet.has(currentVerseNum) ? 0 : intraVerseFraction);
        const pct = verses.length > 0 ? Math.min(100, (effectiveDoneVerses / verses.length) * 100) : 0;
        progressFill.style.width = `${pct.toFixed(1)}%`;
      }
    }

    // Smooth auto-scroll to keep the active character comfortably centered
    const activeCharEl = charEls[Math.min(cursorIdx + errorBuffer.length, charEls.length - 1)];
    if (activeCharEl) {
      const containerRect = passageScroll.getBoundingClientRect();
      const charRect = activeCharEl.getBoundingClientRect();
      const relativeTop = charRect.top - containerRect.top;
      const targetBand = containerRect.height * 0.42;

      if (relativeTop > containerRect.height * 0.62 || relativeTop < containerRect.height * 0.18) {
        passageScroll.scrollTo({
          top: Math.max(0, passageScroll.scrollTop + (relativeTop - targetBand)),
          behavior: 'smooth'
        });
      }
    }
  }

  function completeSingleVerseNow(vRange) {
    const vDurMs = verseStartTime ? Math.max(200, performance.now() - verseStartTime) : 1000;
    const vMins = Math.max(vDurMs / 60000, 1 / 600);

    completedVerseSet.add(vRange.verse);
    sittingTypedVersesSet.add(vRange.verse);

    if (vRange.verseBlockEl) {
      vRange.verseBlockEl.classList.add('is-verse-completed');
    }
    if (vRange.supEl) {
      vRange.supEl.classList.add('is-done');
      vRange.supEl.textContent = activeMode === 'speak' ? `🗣️ ${vRange.verse}` : `✓ ${vRange.verse}`;
    }

    if (activeMode === 'speak') {
      const vWordsEval = Math.max(1, verseSpokenWordsEvaluated || vRange.wordCount);
      const vCadenceWpm = Math.round((vWordsEval / vMins) * 10) / 10;
      const vPronAcc = verseSpokenWordsEvaluated > 0
        ? Math.round((verseSpokenPronunciationSum / verseSpokenWordsEvaluated) * 10) / 10
        : 100;
      const vEnunAcc = verseSpokenWordsEvaluated > 0
        ? Math.round((verseSpokenEnunciationSum / verseSpokenWordsEvaluated) * 10) / 10
        : 100;
      const vErrorsSnapshot = [...verseSpokenWordErrors];

      const recordPromise = recordSpokenVerse({
        sittingSessionId,
        bookId: book.id,
        bookName: book.name,
        chapter: initialChapter,
        verse: vRange.verse,
        totalChapterVerses: allChapterVerses.length || verses.length,
        translation: activeTranslation,
        wpm: vCadenceWpm,
        accuracy: vPronAcc,
        enunciation: vEnunAcc,
        charsTyped: vRange.charCount,
        wordsTyped: vRange.wordCount,
        mistakes: vErrorsSnapshot.length,
        durationMs: Math.round(vDurMs),
        completedAt: new Date().toISOString()
      });

      const badgeEl = container.querySelector('#telemetry-completed-badge');
      if (badgeEl) badgeEl.innerHTML = getProgressBadgeHtml();
      resetActiveVerseTelemetry();

      return {
        recordPromise,
        vWpm: vCadenceWpm,
        vCpm: vPronAcc,
        vAcc: vPronAcc,
        vEnunciation: vEnunAcc,
        vDurMs,
        vErrors: vErrorsSnapshot
      };
    }

    const vCpm = Math.round(vRange.charCount / vMins);
    const vWpm = Math.round((vRange.charCount / 5 / vMins) * 10) / 10;
    const vAcc = verseKeystrokes > 0
      ? Math.round((verseCorrectKeystrokes / verseKeystrokes) * 1000) / 10
      : 100;

    const recordPromise = recordCompletedVerse({
      sittingSessionId,
      bookId: book.id,
      bookName: book.name,
      chapter: initialChapter,
      verse: vRange.verse,
      totalChapterVerses: allChapterVerses.length || verses.length,
      translation: activeTranslation,
      wpm: vWpm,
      cpm: vCpm,
      accuracy: vAcc,
      charsTyped: vRange.charCount,
      wordsTyped: vRange.wordCount,
      mistakes: verseMistakes,
      durationMs: Math.round(vDurMs),
      completedAt: new Date().toISOString()
    });

    const badgeEl = container.querySelector('#telemetry-completed-badge');
    if (badgeEl) badgeEl.innerHTML = getProgressBadgeHtml();
    resetActiveVerseTelemetry();

    return { recordPromise, vWpm, vCpm, vAcc, vDurMs };
  }

  function renderSpeechErrorsReviewHtml(errorsArray, totalWordsCount) {
    if (!errorsArray || errorsArray.length === 0) {
      return `
        <div class="speech-review-banner is-perfect">
          <span class="speech-review-icon">✨</span>
          <div class="speech-review-text">
            <strong>Spotless Pronunciation!</strong>
            <span>All ${totalWordsCount} words were spoken clearly with zero mispronunciations.</span>
          </div>
        </div>
      `;
    }

    const itemsHtml = errorsArray.slice(0, 24).map(err => `
      <div class="speech-error-chip">
        ${!singleVerseMode ? `<span class="speech-err-verse">v.${err.verse}</span>` : ''}
        <span class="speech-err-expected">“${escapeHtml(err.expected)}”</span>
        <span class="speech-err-heard">heard <em>“${escapeHtml(err.spoken || 'unclear')}”</em></span>
      </div>
    `).join('');

    return `
      <div class="speech-review-banner has-errors">
        <div class="speech-review-header">
          <span class="speech-review-title">🗣️ Pronunciation Review (${errorsArray.length} ${errorsArray.length === 1 ? 'word' : 'words'} to review)</span>
          <span class="speech-review-hint">Words highlighted in red above had pronunciation differences:</span>
        </div>
        <div class="speech-error-chips-list">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  function renderSingleVerseSpeakEndCard({ cadenceWpm, pronAcc, enunAcc, durationMs, errors }) {
    const speakEndCard = container.querySelector('#speak-end-summary-card');
    if (!speakEndCard) return;
    const cadenceDesc = getCadenceDescriptor(cadenceWpm);
    const totalWords = wordsList.length || 1;

    speakEndCard.innerHTML = `
      <div class="speak-summary-card-inner">
        <div class="speak-summary-top-row">
          <div class="speak-summary-title-group">
            <span class="speak-summary-badge">🗣️ Verse ${targetSingleVerseNum || 1} Spoken</span>
            <span class="speak-cadence-pill ${cadenceDesc.badgeClass}">${Math.round(cadenceWpm)} WPM · ${cadenceDesc.label}</span>
          </div>
          <div class="speak-summary-kpis">
            <div class="speak-kpi-chip">
              <span class="speak-kpi-lbl">Cadence</span>
              <strong class="speak-kpi-val">${Math.round(cadenceWpm)} WPM</strong>
            </div>
            <div class="speak-kpi-chip">
              <span class="speak-kpi-lbl">Pronunciation</span>
              <strong class="speak-kpi-val">${pronAcc}%</strong>
            </div>
            <div class="speak-kpi-chip">
              <span class="speak-kpi-lbl">Enunciation</span>
              <strong class="speak-kpi-val">${enunAcc}%</strong>
            </div>
            <div class="speak-kpi-chip">
              <span class="speak-kpi-lbl">Time</span>
              <strong class="speak-kpi-val">${formatDuration(durationMs)}</strong>
            </div>
          </div>
        </div>

        ${renderSpeechErrorsReviewHtml(errors, totalWords)}

        <div class="speak-summary-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="speak-card-retry-btn">
            ↺ Speak Again
          </button>
          <span class="speak-auto-advance-note" id="speak-auto-advance-note">
            ${autoAdvance ? (errors.length > 0 ? 'Pausing briefly so you can review pronunciation...' : 'Auto-advancing to next verse...') : 'Press Enter or click Next Verse to continue'}
          </span>
          <button type="button" class="btn btn-primary btn-sm" id="speak-card-next-btn">
            ${(singleVerseMode && shuffleVerses) ? '🎲 Next Verse →' : 'Next Verse →'}
          </button>
        </div>
      </div>
    `;
    speakEndCard.hidden = false;

    const retryBtn = speakEndCard.querySelector('#speak-card-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        if (speechAutoAdvanceTimer) {
          clearTimeout(speechAutoAdvanceTimer);
          speechAutoAdvanceTimer = null;
        }
        restartTyping();
      });
    }
    const nextBtn = speakEndCard.querySelector('#speak-card-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (speechAutoAdvanceTimer) {
          clearTimeout(speechAutoAdvanceTimer);
          speechAutoAdvanceTimer = null;
        }
        navigateNextStep();
      });
    }
  }

  async function showCompletionModal(verseCompletionInfo = null) {
    isCompleted = true;
    clearTimer();
    stopSpeechRecognition();
    elapsedMs = startTime ? performance.now() - startTime : 1000;
    const minutes = Math.max(elapsedMs / 60000, 1 / 600);

    const isSpeak = activeMode === 'speak';
    let finalWpm = 0;
    let finalCpm = 0;
    let finalAcc = 100;
    let finalEnun = 100;

    if (isSpeak) {
      const totalEval = Math.max(1, spokenWordsEvaluated || wordsList.length);
      finalWpm = verseCompletionInfo && singleVerseMode
        ? verseCompletionInfo.vWpm
        : Math.round((totalEval / minutes) * 10) / 10;
      finalAcc = verseCompletionInfo && singleVerseMode
        ? verseCompletionInfo.vAcc
        : (spokenWordsEvaluated > 0 ? Math.round((spokenPronunciationSum / spokenWordsEvaluated) * 10) / 10 : 100);
      finalEnun = verseCompletionInfo && singleVerseMode && typeof verseCompletionInfo.vEnunciation === 'number'
        ? verseCompletionInfo.vEnunciation
        : (spokenWordsEvaluated > 0 ? Math.round((spokenEnunciationSum / spokenWordsEvaluated) * 10) / 10 : 100);
      finalCpm = finalAcc;
    } else {
      finalCpm = verseCompletionInfo && singleVerseMode
        ? verseCompletionInfo.vCpm
        : Math.round(correctKeystrokes / minutes);
      finalWpm = verseCompletionInfo && singleVerseMode
        ? verseCompletionInfo.vWpm
        : Math.round((correctKeystrokes / 5 / minutes) * 10) / 10;
      finalAcc = totalKeystrokes > 0
        ? Math.round((correctKeystrokes / totalKeystrokes) * 1000) / 10
        : 100;
    }

    if (progressFill) {
      progressFill.style.width = '100%';
    }

    if (isSpeak) {
      const cadenceDesc = getCadenceDescriptor(finalWpm);
      liveWpmEl.textContent = `${Math.round(finalWpm)} WPM${cadenceDesc.shortLabel ? ` · ${cadenceDesc.shortLabel}` : ''}`;
      liveCpmEl.textContent = `${finalAcc}%`;
      liveAccEl.textContent = `${finalEnun}%`;
      if (speakStatusPill) {
        speakStatusPill.textContent = spokenWordErrors.length === 0
          ? '✓ Passage spoken clearly!'
          : `✓ Complete · ${spokenWordErrors.length} ${spokenWordErrors.length === 1 ? 'word' : 'words'} to review`;
      }
    } else {
      liveWpmEl.textContent = finalWpm.toFixed(1);
      liveCpmEl.textContent = String(finalCpm);
      liveAccEl.textContent = `${finalAcc}%`;
    }
    liveTimeEl.textContent = formatDuration(elapsedMs);

    let res = null;
    if (verseCompletionInfo && verseCompletionInfo.recordPromise) {
      res = await verseCompletionInfo.recordPromise;
    }

    trackEvent(singleVerseMode ? 'complete_bible_verse' : 'complete_bible_chapter', {
      bookId: book.id,
      bookName: book.name,
      chapter: initialChapter,
      verse: singleVerseMode ? targetSingleVerseNum : null,
      translation: activeTranslation,
      mode: activeMode,
      wpm: finalWpm,
      cpm: finalCpm,
      accuracy: finalAcc,
      enunciation: isSpeak ? finalEnun : null
    });

    const badgeEl = container.querySelector('#telemetry-completed-badge');
    if (badgeEl) badgeEl.innerHTML = getProgressBadgeHtml();

    if (singleVerseMode) {
      if (isSpeak) {
        renderSingleVerseSpeakEndCard({
          cadenceWpm: finalWpm,
          pronAcc: finalAcc,
          enunAcc: finalEnun,
          durationMs: elapsedMs,
          errors: spokenWordErrors
        });
        if (advanceStepBtn) {
          advanceStepBtn.hidden = false;
          advanceStepBtn.classList.remove('btn-secondary');
          advanceStepBtn.classList.add('btn-primary', 'is-ready');
          advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
          advanceStepBtn.title = 'Verse complete! Click to advance (or press Enter)';
        }
        if (autoAdvance) {
          const delayMs = spokenWordErrors.length > 0 ? 3600 : 1400;
          speechAutoAdvanceTimer = setTimeout(() => {
            navigateNextStep();
          }, delayMs);
        }
        return;
      }

      if (autoAdvance) {
        navigateNextStep();
        return;
      }
      if (advanceStepBtn) {
        advanceStepBtn.hidden = false;
        advanceStepBtn.classList.remove('btn-secondary');
        advanceStepBtn.classList.add('btn-primary', 'is-ready');
        advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
        advanceStepBtn.title = 'Verse complete! Click to advance (or press Enter)';
      }
      return;
    }

    const stats = getGlobalTypingStats();
    const trObj = getTranslationByCode(activeTranslation);
    const totalChVerses = allChapterVerses.length || verses.length;
    const doneChVerses = completedVerseSet.size;

    const modalTitleEl = container.querySelector('#completion-modal-title');
    if (modalTitleEl) {
      if (singleVerseMode) {
        modalTitleEl.textContent = doneChVerses >= totalChVerses
          ? 'Verse & Full Chapter Completed!'
          : `Verse ${targetSingleVerseNum} Completed!`;
      } else {
        modalTitleEl.textContent = doneChVerses >= totalChVerses
          ? (isSpeak ? 'Chapter Spoken!' : 'Chapter Completed!')
          : (isSpeak ? 'Passage Spoken!' : 'Passage Completed!');
      }
    }

    container.querySelector('#completion-subtitle').textContent = singleVerseMode
      ? `${book.name} ${initialChapter}:${targetSingleVerseNum} (${trObj.shortName})`
      : `${book.name} ${initialChapter} (${trObj.shortName}) · ${doneChVerses}/${totalChVerses} Verses Complete`;

    const lblWpm = container.querySelector('#comp-lbl-wpm');
    const lblCpm = container.querySelector('#comp-lbl-cpm');
    const lblAcc = container.querySelector('#comp-lbl-acc');
    const lblChars = container.querySelector('#comp-lbl-chars');
    const speechErrorsBox = container.querySelector('#completion-speech-errors');

    if (isSpeak) {
      const cadenceDesc = getCadenceDescriptor(finalWpm);
      if (lblWpm) lblWpm.textContent = 'Cadence';
      if (lblCpm) lblCpm.textContent = 'Pronunciation';
      if (lblAcc) lblAcc.textContent = 'Enunciation';
      if (lblChars) lblChars.textContent = 'Words Spoken';

      container.querySelector('#comp-wpm').textContent = `${Math.round(finalWpm)} WPM`;
      container.querySelector('#comp-cpm').textContent = `${finalAcc}%`;
      container.querySelector('#comp-acc').textContent = `${finalEnun}%`;
      container.querySelector('#comp-verses').textContent = `${doneChVerses}/${totalChVerses}v`;
      container.querySelector('#comp-chars').textContent = (spokenWordsEvaluated || wordsList.length).toLocaleString();
      container.querySelector('#comp-time').textContent = formatDuration(elapsedMs);

      if (speechErrorsBox) {
        speechErrorsBox.hidden = false;
        speechErrorsBox.innerHTML = renderSpeechErrorsReviewHtml(spokenWordErrors, wordsList.length);
      }

      const badges = [];
      badges.push(`<span class="comp-highlight-pill ${cadenceDesc.badgeClass || 'is-emerald'}">🎙️ Cadence: ${cadenceDesc.label} (${Math.round(finalWpm)} WPM)</span>`);
      if (res?.justCompletedFullChapter) {
        badges.push(`<span class="comp-highlight-pill is-emerald">✨ Full Chapter Spoken (+1 Bible Reach)</span>`);
      }
      if (finalEnun >= 90 && finalAcc >= 95) {
        badges.push(`<span class="comp-highlight-pill is-lavender">🎯 Clear Enunciation &amp; Pronunciation</span>`);
      }
      container.querySelector('#completion-highlights').innerHTML = badges.join('');

      container.querySelector('#completion-reach-summary').innerHTML = `
        <div class="comp-reach-row">
          <span>Overall Reach: <strong>${stats.overallCompletedChapters}/${stats.totalBibleChapters} chapters</strong> · <strong>${stats.overallCompletedVerses.toLocaleString()} verses</strong></span>
          <span>Spoken Avg: <strong>${stats.avgSpeakCadenceWpm || Math.round(finalWpm)} WPM Cadence · ${stats.avgPronunciationAccuracy || finalAcc}% Pronunciation</strong></span>
        </div>
      `;
    } else {
      if (lblWpm) lblWpm.textContent = 'Speed (WPM)';
      if (lblCpm) lblCpm.textContent = 'Speed (CPM)';
      if (lblAcc) lblAcc.textContent = 'Accuracy';
      if (lblChars) lblChars.textContent = 'Characters';
      if (speechErrorsBox) {
        speechErrorsBox.hidden = true;
        speechErrorsBox.innerHTML = '';
      }

      container.querySelector('#comp-wpm').textContent = `${finalWpm} WPM`;
      container.querySelector('#comp-cpm').textContent = `${finalCpm} CPM`;
      container.querySelector('#comp-acc').textContent = `${finalAcc}%`;
      container.querySelector('#comp-verses').textContent = `${doneChVerses}/${totalChVerses}v`;
      container.querySelector('#comp-chars').textContent = correctKeystrokes.toLocaleString();
      container.querySelector('#comp-time').textContent = formatDuration(elapsedMs);

      const badges = [];
      if (res?.justCompletedFullChapter) {
        badges.push(`<span class="comp-highlight-pill is-emerald">✨ Full Chapter Completed (+1 Bible Reach)</span>`);
      } else if (res?.isFirstTimeVerseOverall) {
        badges.push(`<span class="comp-highlight-pill is-emerald">✓ Verse Saved (${doneChVerses}/${totalChVerses} in ${book.abbr} ${initialChapter})</span>`);
      }
      if (res?.isNewVersePersonalBest) {
        badges.push(`<span class="comp-highlight-pill is-lavender">🏆 New Personal Best Speed!</span>`);
      }
      container.querySelector('#completion-highlights').innerHTML = badges.join('');

      container.querySelector('#completion-reach-summary').innerHTML = `
        <div class="comp-reach-row">
          <span>Overall Reach: <strong>${stats.overallCompletedChapters}/${stats.totalBibleChapters} chapters</strong> · <strong>${stats.overallCompletedVerses.toLocaleString()} verses</strong></span>
          <span>All-Time Avg: <strong>${stats.avgWpm} WPM · ${stats.avgCpm} CPM</strong></span>
        </div>
      `;
    }

    const retryBtn = container.querySelector('#comp-retry-btn');
    if (retryBtn) {
      retryBtn.textContent = `↺ ${isSpeak ? 'Speak Again' : 'Type Again'}`;
    }

    const nextBtn = container.querySelector('#comp-next-btn');
    if (nextBtn) {
      if (singleVerseMode && targetSingleVerseNum) {
        if (shuffleVerses) {
          nextBtn.textContent = '🎲 Next Shuffled Verse →';
        } else {
          const maxV = allChapterVerses.length || targetSingleVerseNum;
          if (targetSingleVerseNum < maxV) {
            nextBtn.textContent = `Next Verse: ${book.name} ${initialChapter}:${targetSingleVerseNum + 1} →`;
          } else {
            nextBtn.textContent = `Next: ${nextChapterRef.bookName} ${nextChapterRef.chapter}:1 →`;
          }
        }
      } else {
        nextBtn.textContent = `Next Chapter: ${nextChapterRef.bookName} ${nextChapterRef.chapter} →`;
      }
    }

    completionBackdrop.hidden = false;
  }

  // ── Non-Blocking Speak Mode Engine (Web Speech API) ────────────
  function advanceSpokenWordNonBlocking(evalResult, spokenTokenStr) {
    if (isCompleted || currentWordIdx >= wordsList.length) return;

    const wObj = wordsList[currentWordIdx];
    const currentVIdx = wObj.vIdx;
    const currentVRange = verseRanges[currentVIdx];

    if (!startTime) {
      startTime = performance.now();
      timerInterval = setInterval(updateLiveMetrics, 250);
      trackEvent('start_speaking_session', {
        bookId: book.id,
        chapter: initialChapter,
        verse: targetSingleVerseNum || 1,
        mode: singleVerseMode ? 'single' : 'chapter',
        translation: activeTranslation
      });
    }
    if (!verseStartTime) {
      verseStartTime = performance.now();
    }

    const prevCursor = cursorIdx;
    spokenWordsEvaluated++;
    verseSpokenWordsEvaluated++;
    spokenPronunciationSum += evalResult.pronunciationScore;
    verseSpokenPronunciationSum += evalResult.pronunciationScore;
    spokenEnunciationSum += evalResult.enunciationScore;
    verseSpokenEnunciationSum += evalResult.enunciationScore;

    if (evalResult.matched) {
      spokenWordsCorrect++;
      verseSpokenWordsCorrect++;
      spokenWordStatusMap.set(wObj.wordIdx, 'correct');
      if (wObj.wordEl) {
        wObj.wordEl.classList.remove('is-speak-error', 'is-speak-active');
      }
    } else {
      mistakes++;
      verseMistakes++;
      spokenWordStatusMap.set(wObj.wordIdx, 'error');
      if (wObj.wordEl) {
        wObj.wordEl.classList.remove('is-speak-active');
        wObj.wordEl.classList.add('is-speak-error');
      }
      const errEntry = {
        wordIdx: wObj.wordIdx,
        verse: wObj.verse,
        expected: wObj.rawWord.replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '') || wObj.rawWord,
        spoken: spokenTokenStr || 'unclear'
      };
      spokenWordErrors.push(errEntry);
      verseSpokenWordErrors.push(errEntry);
    }

    // Check if this was the last word of the current verse
    if (wObj.isLastWordOfVerse && currentVRange) {
      const vCompletionInfo = completeSingleVerseNow(currentVRange);

      if (singleVerseMode) {
        currentWordIdx = wordsList.length;
        cursorIdx = targetChars.length;
        refreshAllCharClasses();
        updateCursorAndErrorClasses(prevCursor, 0);
        showCompletionModal(vCompletionInfo);
        return;
      }

      if (skipCompletedVerses) {
        const nextVIdx = currentVIdx + 1;
        if (nextVIdx >= verseRanges.length || completedVerseSet.has(verseRanges[nextVIdx].verse)) {
          const targetIncompleteVIdx = findNextIncompleteVerseIdx(nextVIdx, true);
          if (targetIncompleteVIdx === -1) {
            currentWordIdx = wordsList.length;
            cursorIdx = targetChars.length;
            refreshAllCharClasses();
            updateCursorAndErrorClasses(prevCursor, 0);
            showCompletionModal(vCompletionInfo);
            return;
          }
          const nextIncompleteVerse = verseRanges[targetIncompleteVIdx].verse;
          jumpToVerse(nextIncompleteVerse, { isSkipJump: true });
          updateLiveMetrics();
          return;
        }
      }

      if (currentWordIdx >= wordsList.length - 1) {
        currentWordIdx = wordsList.length;
        cursorIdx = targetChars.length;
        refreshAllCharClasses();
        updateCursorAndErrorClasses(prevCursor, 0);
        showCompletionModal(vCompletionInfo);
        return;
      }
    }

    currentWordIdx++;
    // Auto-skip any punctuation-only tokens that have no alphanumeric characters
    while (currentWordIdx < wordsList.length && !wordsList[currentWordIdx].cleanWord) {
      spokenWordStatusMap.set(wordsList[currentWordIdx].wordIdx, 'correct');
      if (wordsList[currentWordIdx].isLastWordOfVerse) break;
      currentWordIdx++;
    }

    if (currentWordIdx >= wordsList.length) {
      cursorIdx = targetChars.length;
      refreshAllCharClasses();
      updateCursorAndErrorClasses(prevCursor, 0);
      showCompletionModal();
      return;
    }

    cursorIdx = wordsList[currentWordIdx].startCharIdx;
    refreshAllCharClasses();
    updateCursorAndErrorClasses(prevCursor, 0);
    updateLiveMetrics();
  }

  function processSpeechRecognitionResults(event) {
    if (activeMode !== 'speak' || !micEnabled || isCompleted || wordsList.length === 0) return;

    if (speechInterimErrorTimer) {
      clearTimeout(speechInterimErrorTimer);
      speechInterimErrorTimer = null;
    }

    for (let rIdx = 0; rIdx < event.results.length; rIdx++) {
      if (isCompleted || currentWordIdx >= wordsList.length) break;

      const res = event.results[rIdx];
      const alt = res[0];
      if (!alt || !alt.transcript) continue;

      const isFinal = Boolean(res.isFinal);
      const conf = typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : 0.92;
      const rawTokens = alt.transcript
        .trim()
        .split(/\s+/)
        .map(t => normalizeSpokenWord(t))
        .filter(Boolean);

      const alreadyConsumed = speechProcessedMap.get(rIdx) || 0;
      let tIdx = alreadyConsumed;

      while (tIdx < rawTokens.length && currentWordIdx < wordsList.length && !isCompleted) {
        const spokenTok = rawTokens[tIdx];
        const hasMoreTokensAfter = tIdx < rawTokens.length - 1;
        const targetWordObj = wordsList[currentWordIdx];

        // Auto-pass punctuation-only token if needed
        if (!targetWordObj.cleanWord) {
          advanceSpokenWordNonBlocking(
            { matched: true, exact: true, similarity: 1, pronunciationScore: 100, enunciationScore: 100 },
            spokenTok
          );
          continue;
        }

        const evalCurr = evaluateSpokenWord(spokenTok, targetWordObj.cleanWord, conf);

        if (evalCurr.matched) {
          // Spoken word matches current expected word! Advance immediately.
          tIdx++;
          speechProcessedMap.set(rIdx, tIdx);
          advanceSpokenWordNonBlocking(evalCurr, spokenTok);
          continue;
        }

        // Current spoken token did NOT match targetWordObj.
        // If this is the very last token of an still-open interim utterance, wait briefly
        // in case the user is mid-syllable (e.g. "begin" -> "beginning") before advancing.
        if (!isFinal && !hasMoreTokensAfter) {
          const capturedRIdx = rIdx;
          const capturedTIdx = tIdx;
          const capturedWordIdx = currentWordIdx;
          const capturedSpokenTok = spokenTok;
          speechInterimErrorTimer = setTimeout(() => {
            if (
              activeMode === 'speak' &&
              micEnabled &&
              !isCompleted &&
              currentWordIdx === capturedWordIdx &&
              (speechProcessedMap.get(capturedRIdx) || 0) === capturedTIdx
            ) {
              speechProcessedMap.set(capturedRIdx, capturedTIdx + 1);
              const wNow = wordsList[currentWordIdx];
              if (wNow) {
                const ev = evaluateSpokenWord(capturedSpokenTok, wNow.cleanWord, conf);
                advanceSpokenWordNonBlocking(ev, capturedSpokenTok);
              }
            }
          }, 750);
          break;
        }

        // Either isFinal is true OR the user has already spoken subsequent word(s) after spokenTok!
        // Check 1-word lookahead within the same verse: did the user skip targetWordObj and say the next word?
        const nextWordObj = currentWordIdx + 1 < wordsList.length ? wordsList[currentWordIdx + 1] : null;
        if (
          nextWordObj &&
          nextWordObj.verse === targetWordObj.verse &&
          isSpokenWordMatch(spokenTok, nextWordObj.cleanWord)
        ) {
          // Mark targetWordObj as missed/skipped without consuming spokenTok yet, then match nextWordObj on next loop iteration!
          advanceSpokenWordNonBlocking(
            { matched: false, exact: false, similarity: 0, pronunciationScore: 0, enunciationScore: 35 },
            '(skipped)'
          );
          continue;
        }

        // Otherwise, targetWordObj was mispronounced as spokenTok. Record error and advance cursor non-blockingly!
        tIdx++;
        speechProcessedMap.set(rIdx, tIdx);
        advanceSpokenWordNonBlocking(evalCurr, spokenTok);
      }
    }
  }

  function startSpeechRecognition() {
    if (activeMode !== 'speak' || !micEnabled || isCompleted) return;
    if (!speechSupported) {
      updateSpeakMicUI();
      return;
    }
    if (speechRecognition) return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.lang = 'en-US';
      speechProcessedMap.clear();

      rec.onresult = (event) => {
        processSpeechRecognitionResults(event);
      };

      rec.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          micEnabled = false;
          stopSpeechRecognition();
          updateSpeakMicUI();
          if (speakStatusPill) {
            speakStatusPill.hidden = false;
            speakStatusPill.textContent = '⚠️ Microphone access denied — please allow mic permissions';
            speakStatusPill.classList.add('is-error');
          }
        }
      };

      rec.onend = () => {
        speechRecognition = null;
        if (activeMode === 'speak' && micEnabled && !isCompleted && document.body.contains(container)) {
          setTimeout(() => {
            if (activeMode === 'speak' && micEnabled && !isCompleted && document.body.contains(container)) {
              startSpeechRecognition();
            }
          }, 150);
        }
      };

      speechRecognition = rec;
      rec.start();
      updateSpeakMicUI();
    } catch (_) {
      speechRecognition = null;
    }
  }

  function normalizeTypedChar(ch) {
    if (ch === '\u2018' || ch === '\u2019' || ch === '\u02BC') return "'";
    if (ch === '\u201C' || ch === '\u201D') return '"';
    if (ch === '\u2013' || ch === '\u2014') return '-';
    if (ch === '\u00A0') return ' ';
    return ch;
  }

  function processBackspace(clearAll = false) {
    if (isCompleted || targetChars.length === 0 || activeMode !== 'type') return;
    if (errorBuffer.length === 0) return;

    const prevCursor = cursorIdx;
    const prevErrLen = errorBuffer.length;
    if (clearAll) {
      errorBuffer = [];
    } else {
      errorBuffer.pop();
    }
    updateCursorAndErrorClasses(prevCursor, prevErrLen);
  }

  function processTypedChar(rawChar) {
    if (isCompleted || targetChars.length === 0 || activeMode !== 'type') return;
    const ch = normalizeTypedChar(rawChar);
    if (!ch || ch.length !== 1) return;

    const currentVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
    const currentVRange = verseRanges[currentVIdx];

    // If the cursor just auto-jumped to a new verse after skipping completed verses,
    // ignore a reflexive trailing Space pressed within 550ms of the jump
    if (
      ch === ' ' &&
      currentVRange &&
      cursorIdx === currentVRange.startCharIdx &&
      performance.now() - lastSkipJumpTime < 550
    ) {
      return;
    }

    if (!startTime) {
      startTime = performance.now();
      timerInterval = setInterval(updateLiveMetrics, 200);
      trackEvent('start_typing_session', {
        bookId: book.id,
        chapter: initialChapter,
        verse: targetSingleVerseNum || 1,
        mode: singleVerseMode ? 'single' : 'chapter',
        translation: activeTranslation
      });
    }
    if (!verseStartTime) {
      verseStartTime = performance.now();
    }

    const prevCursor = cursorIdx;
    const prevErrLen = errorBuffer.length;
    totalKeystrokes++;
    verseKeystrokes++;

    const expected = targetChars[cursorIdx];
    if (errorBuffer.length === 0 && ch === expected) {
      correctKeystrokes++;
      verseCorrectKeystrokes++;

      // Check if the user just typed the final character of the current verse's words
      if (currentVRange && cursorIdx === currentVRange.wordEndIdx) {
        const vCompletionInfo = completeSingleVerseNow(currentVRange);

        // 1. If in Single-Verse Mode, we're done!
        if (singleVerseMode) {
          cursorIdx = targetChars.length;
          updateCursorAndErrorClasses(prevCursor, prevErrLen);
          showCompletionModal(vCompletionInfo);
          return;
        }

        // 2. In Full-Chapter Mode: if skipCompletedVerses is ON (default), check if we should skip completed verses
        if (skipCompletedVerses) {
          const nextVIdx = currentVIdx + 1;
          // If the immediate next verse is already completed (or we reached the end of the chapter),
          // jump directly to the next incomplete verse!
          if (nextVIdx >= verseRanges.length || completedVerseSet.has(verseRanges[nextVIdx].verse)) {
            const targetIncompleteVIdx = findNextIncompleteVerseIdx(nextVIdx, true);
            if (targetIncompleteVIdx === -1) {
              // Every verse in the chapter is now completed!
              cursorIdx = targetChars.length;
              refreshAllCharClasses();
              updateCursorAndErrorClasses(prevCursor, prevErrLen);
              showCompletionModal(vCompletionInfo);
              return;
            }
            const nextIncompleteVerse = verseRanges[targetIncompleteVIdx].verse;
            jumpToVerse(nextIncompleteVerse, {
              isSkipJump: true,
              statusMessage: `⏭️ Verse ${currentVRange.verse} saved! Jumped past completed verse(s) → <strong>Verse ${nextIncompleteVerse}</strong>.`
            });
            updateLiveMetrics();
            return;
          }
        }

        // 3. If this was the final verse of the chapter (and skipCompletedVerses didn't wrap around)
        if (cursorIdx >= targetChars.length - 1) {
          cursorIdx = targetChars.length;
          updateCursorAndErrorClasses(prevCursor, prevErrLen);
          showCompletionModal(vCompletionInfo);
          return;
        }
      }

      cursorIdx++;

      if (cursorIdx >= targetChars.length) {
        updateCursorAndErrorClasses(prevCursor, prevErrLen);
        showCompletionModal();
        return;
      }

      updateCursorAndErrorClasses(prevCursor, prevErrLen);
      updateLiveMetrics();
    } else {
      mistakes++;
      verseMistakes++;
      if (errorBuffer.length < 10) {
        errorBuffer.push(ch);
      }
      updateCursorAndErrorClasses(prevCursor, prevErrLen);
      updateLiveMetrics();
    }
  }

  function closeTopmostModal() {
    if (scopeSettingsBackdrop && !scopeSettingsBackdrop.hidden) {
      closeScopeSettingsModal();
      return true;
    }
    if (modeSettingsBackdrop && !modeSettingsBackdrop.hidden) {
      closeModeSettingsModal();
      return true;
    }
    if (modeSelectBackdrop && !modeSelectBackdrop.hidden) {
      closeModeSelectModal();
      return true;
    }
    if (actionsBackdrop && !actionsBackdrop.hidden) {
      closeActionsModal();
      return true;
    }
    if (bookmarkBackdrop && !bookmarkBackdrop.hidden) {
      closeBookmarkModal();
      return true;
    }
    return false;
  }

  function handleTypingKeydown(e) {
    if (e.key === 'Escape') {
      if (closeTopmostModal()) {
        e.preventDefault();
        return;
      }
      if (singleVerseMode && activeMode === 'draw') {
        return;
      }
      e.preventDefault();
      restartTyping();
      return;
    }

    if (singleVerseMode && activeMode === 'draw') {
      return;
    }

    if (isCompleted) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (speechAutoAdvanceTimer) {
          clearTimeout(speechAutoAdvanceTimer);
          speechAutoAdvanceTimer = null;
        }
        navigateNextStep();
      }
      return;
    }

    if (activeMode === 'speak') {
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      hiddenInput.value = '';
      processBackspace(e.altKey || e.ctrlKey || e.metaKey);
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key.length === 1) {
      e.preventDefault();
      hiddenInput.value = '';
      processTypedChar(e.key);
    }
  }

  hiddenInput.addEventListener('keydown', handleTypingKeydown);

  onWindowKeydown = (e) => {
    if (!document.body.contains(container)) {
      cleanup();
      return;
    }
    if (e.key === 'Escape' && isAnyModalOpen() && (!completionBackdrop || completionBackdrop.hidden)) {
      e.preventDefault();
      closeTopmostModal();
      return;
    }
    if (singleVerseMode && activeMode === 'draw') {
      return;
    }
    if (e.target === hiddenInput) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    if (document.body.classList.contains('browse-open') || isAnyModalOpen()) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'Enter' || e.key.length === 1) {
      if (activeMode === 'type') {
        focusTypingInput();
      }
      handleTypingKeydown(e);
    }
  };
  window.addEventListener('keydown', onWindowKeydown);

  // Allow scrolling the chapter card content when wheel/trackpad is used outside the card (e.g. gutters to left/right)
  onWindowWheel = (e) => {
    if (!document.body.contains(container)) {
      cleanup();
      return;
    }

    // In draw mode, the canvas is full height with no scrolling
    if (singleVerseMode && activeMode === 'draw') {
      return;
    }

    // If any modal or browse drawer is open, don't hijack scroll
    if (isAnyModalOpen() || document.body.classList.contains('browse-open')) {
      return;
    }

    // If wheel event originates from a scrollable dropdown or modal card, let it scroll naturally
    if (e.target && e.target.closest && (
      e.target.closest('.nav-dropdown-menu') ||
      e.target.closest('.typing-options-card') ||
      e.target.closest('.completion-modal-card')
    )) {
      return;
    }

    // If the mouse is already inside the passage scroll container, native browser scrolling handles it
    if (passageScroll && passageScroll.contains(e.target)) {
      return;
    }

    // Forward outside scroll to passage scroll
    if (passageScroll) {
      let delta = e.deltaY;
      if (e.deltaMode === 1) {
        delta *= 33; // DOM_DELTA_LINE
      } else if (e.deltaMode === 2) {
        delta *= window.innerHeight; // DOM_DELTA_PAGE
      }

      if (delta !== 0) {
        if (typeof passageScroll.scrollBy === 'function') {
          passageScroll.scrollBy({ top: delta, behavior: 'instant' });
        } else {
          passageScroll.scrollTop += delta;
        }
        e.preventDefault();
      }
    }
  };
  window.addEventListener('wheel', onWindowWheel, { passive: false });

  // Mobile virtual keyboard fallback via input event
  hiddenInput.addEventListener('input', (e) => {
    if ((singleVerseMode && activeMode === 'draw') || activeMode === 'speak') {
      hiddenInput.value = '';
      return;
    }
    if (isCompleted) {
      hiddenInput.value = '';
      return;
    }
    const val = hiddenInput.value;
    hiddenInput.value = '';
    if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteWordBackward') {
      processBackspace(e.inputType === 'deleteWordBackward');
      return;
    }
    if (val) {
      for (const ch of val) {
        processTypedChar(ch);
      }
    }
  });

  function focusTypingInput() {
    if ((singleVerseMode && activeMode === 'draw') || activeMode === 'speak') return;
    if (document.body.classList.contains('browse-open') || isAnyModalOpen()) return;
    hiddenInput.focus({ preventScroll: true });
    viewportWrapper.classList.add('is-focused');
    focusBanner.hidden = true;
  }

  hiddenInput.addEventListener('focus', () => {
    if ((singleVerseMode && activeMode === 'draw') || activeMode === 'speak') return;
    viewportWrapper.classList.add('is-focused');
    focusBanner.hidden = true;
  });

  hiddenInput.addEventListener('blur', () => {
    if ((singleVerseMode && activeMode === 'draw') || activeMode === 'speak') return;
    viewportWrapper.classList.remove('is-focused');
    if (!isCompleted && targetChars.length > 0 && !document.body.classList.contains('browse-open') && !isAnyModalOpen()) {
      focusBanner.hidden = false;
    }
  });

  viewportWrapper.addEventListener('click', () => {
    if ((singleVerseMode && activeMode === 'draw') || activeMode === 'speak') return;
    focusTypingInput();
  });

  // Completion modal buttons
  container.querySelector('#comp-retry-btn').addEventListener('click', () => {
    completionBackdrop.hidden = true;
    restartTyping();
  });

  const compOpenChapterBtn = container.querySelector('#comp-open-chapter-btn');
  if (compOpenChapterBtn) {
    compOpenChapterBtn.addEventListener('click', () => {
      completionBackdrop.hidden = true;
      setSingleVerseModePref(false);
      const targetChapterMode = activeMode === 'draw' ? 'type' : activeMode;
      navigate(`/${targetChapterMode}/${book.id}/${initialChapter}`);
    });
  }

  container.querySelector('#comp-next-btn').addEventListener('click', () => {
    completionBackdrop.hidden = true;
    navigateNextStep();
  });

  function triggerBackgroundPrefetches() {
    if (singleVerseMode) {
      if (shuffleVerses) {
        replenishRandomVersePreloads(activeTranslation, {
          bookId: book.id,
          chapter: initialChapter,
          verse: targetSingleVerseNum
        });
      } else if (nextChapterRef) {
        prefetchChapterVerses(activeTranslation, nextChapterRef.bookId, nextChapterRef.chapter);
      }
    } else if (nextChapterRef) {
      prefetchChapterVerses(activeTranslation, nextChapterRef.bookId, nextChapterRef.chapter);
    }
  }

  // ── 8. Fetch & Initialize Chapter Verses ───────────────────────
  async function loadAndRenderPassage() {
    clearTimer();
    const trObj = getTranslationByCode(activeTranslation);

    // Instant zero-delay render if already in synchronous cache
    const cached = getCachedChapterVerses(activeTranslation, book.id, initialChapter);
    if (cached && cached.length > 0) {
      buildPassageDOM(cached);
      triggerBackgroundPrefetches();
      return;
    }

    passageContent.innerHTML = `
      <div class="typing-loading-state">
        <div class="loading-spinner"></div>
        <p>Loading ${book.name} ${initialChapter}${singleVerseMode ? `:${targetSingleVerseNum}` : ''} (${trObj.shortName})...</p>
      </div>
    `;

    try {
      const loaded = await fetchChapterVerses(activeTranslation, book.id, initialChapter);
      if (!container.contains(passageContent)) return;
      buildPassageDOM(loaded);
      triggerBackgroundPrefetches();
    } catch (err) {
      if (!container.contains(passageContent)) return;
      passageContent.innerHTML = `
        <div class="typing-error-state">
          <p>⚠️ ${escapeHtml(err.message || 'Failed to load chapter text.')}</p>
          <button class="btn btn-primary btn-sm" id="retry-fetch-btn">Retry</button>
        </div>
      `;
      const retryBtn = passageContent.querySelector('#retry-fetch-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => loadAndRenderPassage());
      }
    }
  }

  loadAndRenderPassage();
}
