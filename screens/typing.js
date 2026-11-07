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
} from '../bible-data.js?v=20261107_v3';
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
  getGlobalTypingStats,
  getChapterProgressSummary,
  isVerseCompletedInRecord,
  isVerseRead,
  isVerseTyped,
  toggleChapterRead,
  toggleVerseRead,
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
} from '../api.js?v=20261107_v7';
import {
  renderMeditateArtworkSvg,
  TOTAL_MEDITATE_ART_TEMPLATES
} from '../meditate-art.js?v=20261107_v7';
import { trackEvent } from '../analytics.js?v=20261107_v7';
import { navigate } from '../router.js?v=20261107_v7';

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

export function renderTypingScreen(container, params = {}) {
  const store = getLocalStore();
  const initialBookId = Number(params.bookId) || store.lastBookId || 1;
  const book = getBookById(initialBookId);
  const initialChapter = Math.max(1, Math.min(Number(params.chapter) || store.lastChapter || 1, book.chapters));
  const singleVerseMode = Boolean(params.singleVerseMode && params.verse);
  const targetSingleVerseNum = singleVerseMode ? Math.max(1, Number(params.verse) || 1) : null;
  const requestedStartVerse = !singleVerseMode && params.startVerse ? Math.max(1, Number(params.startVerse)) : null;

  let activeTranslation = getPreferredTranslation() || 'ESV';
  let skipCompletedVerses = getSkipCompletedVersesPref();
  let showTypingStats = getShowTypingStatsPref();
  let autoAdvance = getAutoAdvancePref();
  let shuffleVerses = getShuffleVersesPref();
  let meditateMode = getMeditateModePref();
  let meditatePalette = getMeditatePalettePref();
  let activePaletteIndex = 0;
  let currentArtworkTemplateIdx = Math.abs((book.id * 31 + initialChapter * 7 + (targetSingleVerseNum || 1))) % TOTAL_MEDITATE_ART_TEMPLATES;

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

  // Active typing session state
  let allChapterVerses = []; // Full chapter verses from API
  let verses = []; // Verses rendered in viewport (either all chapter verses or 1 verse in singleVerseMode)
  let verseRanges = []; // [{ verse, vIdx, startCharIdx, wordEndIdx, endCharIdx, charCount, wordCount, verseBlockEl, supEl }]
  let targetChars = [];
  let charToVerseMap = [];
  let charToVerseIdxMap = [];
  let charEls = [];
  let completedVerseSet = new Set(); // Set of verse numbers completed in this chapter
  let sittingTypedVersesSet = new Set(); // Set of verse numbers typed during this sitting

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
  let sittingSessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let lastTrackedCursorVerse = null;

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  let onWindowKeydown = null;
  let onStatsUpdated = null;
  let onFavoritesUpdated = null;
  let onBookmarksUpdated = null;
  let onWindowWheel = null;
  function cleanup() {
    clearTimer();
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
    const doneV = summary.completedVersesCount;
    const trText = activeTranslation ? ` · ${getTranslationByCode(activeTranslation).shortName}` : '';

    if (singleVerseMode && targetSingleVerseNum) {
      const vRec = summary.record?.completedVerses?.[String(targetSingleVerseNum)];
      const vIsRead = Boolean(summary.isFullyRead || vRec?.isRead);
      const vIsTyped = Boolean(summary.isFullyTyped || vRec?.isTyped || (vRec?.count && vRec.count > 0));
      if (vIsRead && vIsTyped) {
        return `
          <span class="chapter-completed-pill is-both" title="Verse ${targetSingleVerseNum} read and typed!">
            ✓ Verse ${targetSingleVerseNum} Read &amp; Typed${vRec?.bestWpm ? ` · Best ${vRec.bestWpm} WPM` : ''}
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
      return `
        <span class="chapter-completed-pill is-both" title="All ${totalV} verses read and typed!">
          ✓ Read &amp; Typed (${totalV}/${totalV}v)${trText}${summary.bestWpm ? ` · Best ${summary.bestWpm} WPM` : ''}
        </span>
      `;
    }

    if (summary.isTypedOnly || (summary.isFullyTyped && !summary.isFullyRead)) {
      return `
        <span class="chapter-completed-pill is-done" title="All ${totalV} verses typed!">
          ✓ Typed (${totalV}/${totalV}v)${trText}${summary.bestWpm ? ` · Best ${summary.bestWpm} WPM` : ''}
        </span>
      `;
    }

    if (summary.isReadOnly || (summary.isFullyRead && !summary.isFullyTyped)) {
      return `
        <span class="chapter-completed-pill is-read" title="All ${totalV} verses marked as read!">
          📖 Read (${totalV}/${totalV}v)
        </span>
      `;
    }

    return '';
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
            <button type="button" class="btn btn-secondary btn-sm advance-step-btn" id="advance-step-btn" title="Advance to next verse (or press Enter)" ${singleVerseMode && !autoAdvance && !meditateMode ? '' : 'hidden'}>
              ${(singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›'}
            </button>
            <button type="button" class="btn btn-secondary btn-sm meditate-mark-read-btn" id="meditate-mark-read-btn" title="Mark this verse as read" ${singleVerseMode && meditateMode ? '' : 'hidden'}>
              <span id="meditate-mark-read-label">📖 Mark Read</span>
            </button>
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
              title="Open and read the full chapter (${escapeHtml(book.name)} ${initialChapter})"
              ${singleVerseMode ? '' : 'hidden'}
            >
              📖 Read Full Chapter
            </button>
            <button type="button" class="btn btn-secondary btn-sm summary-action-btn typing-options-btn" id="typing-options-btn" title="Typing Options & Actions">
              ⚙️ Options
            </button>
          </div>
        </div>

        <!-- Line 2: Live Metrics / Telemetry (Toggled via Typing Options modal) -->
        <div class="summary-line summary-line-bottom" id="typing-summary-stats-line" ${(showTypingStats && !(singleVerseMode && meditateMode)) ? '' : 'hidden'}>
          <div class="summary-metrics-group">
            <div class="summary-stat-box">
              <span class="stat-lbl">WPM</span>
              <span class="stat-num" id="live-wpm">0</span>
            </div>
            <div class="summary-stat-divider">·</div>
            <div class="summary-stat-box">
              <span class="stat-lbl">CPM</span>
              <span class="stat-num" id="live-cpm">0</span>
            </div>
            <div class="summary-stat-divider">·</div>
            <div class="summary-stat-box">
              <span class="stat-lbl">Accuracy</span>
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

      <!-- Strict Backspace Error Banner (Only shown when an active mistake needs Backspace) -->
      <div class="typing-error-alert" id="typing-error-alert" hidden>
        <span>⌫ Mistyped character — press <strong>Backspace</strong> to fix before continuing</span>
      </div>

      <!-- Main Scripture Typing Viewport (fills remaining viewport height) -->
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
          <span>⌨️ Click any verse or press any key to resume typing</span>
        </div>

        <div class="typing-passage-scroll" id="typing-passage-scroll" ${singleVerseMode && meditateMode ? 'hidden' : ''}>
          <div class="typing-passage-content" id="typing-passage-content">
            <div class="typing-loading-state">
              <div class="loading-spinner"></div>
              <p>Loading ${book.name} ${initialChapter}${singleVerseMode ? `:${targetSingleVerseNum}` : ''} (${getTranslationByCode(activeTranslation).shortName})...</p>
            </div>
          </div>
        </div>

        <!-- Meditate Mode Interactive Artwork & Verse Canvas (Full Height, No Scroll) -->
        <div class="meditate-canvas-wrapper" id="meditate-canvas-wrapper" ${singleVerseMode && meditateMode ? '' : 'hidden'}></div>
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

          <div class="completion-stats-grid">
            <div class="completion-stat-item">
              <span class="c-stat-label">Speed (WPM)</span>
              <span class="c-stat-val" id="comp-wpm">0</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label">Speed (CPM)</span>
              <span class="c-stat-val" id="comp-cpm">0</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label">Accuracy</span>
              <span class="c-stat-val" id="comp-acc">100%</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label">Chapter Reach</span>
              <span class="c-stat-val" id="comp-verses">0</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label">Characters</span>
              <span class="c-stat-val" id="comp-chars">0</span>
            </div>
            <div class="completion-stat-item">
              <span class="c-stat-label">Duration</span>
              <span class="c-stat-val" id="comp-time">0:00</span>
            </div>
          </div>

          <div class="completion-reach-summary" id="completion-reach-summary"></div>

          <div class="completion-actions" id="completion-actions">
            <button class="btn btn-secondary" id="comp-retry-btn">
              ↺ Type Again
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

      <!-- Typing Options Modal Backdrop -->
      <div class="typing-options-backdrop" id="typing-options-backdrop" hidden>
        <div class="typing-options-card" role="dialog" aria-modal="true" aria-labelledby="typing-options-title">
          <div class="typing-options-header">
            <h2 class="typing-options-title" id="typing-options-title">⚙️ Typing Options</h2>
            <button type="button" class="options-close-btn" id="options-close-btn" aria-label="Close options">✕</button>
          </div>

          <div class="typing-options-body">
            <!-- Mode Tabs: Chapter Mode vs Single Verse Mode -->
            <div class="modal-mode-tabs" role="tablist" aria-label="Typing Mode">
              <button type="button" class="modal-mode-tab ${!singleVerseMode ? 'active' : ''}" id="tab-btn-chapter" role="tab" aria-selected="${!singleVerseMode}">
                Chapter Mode
              </button>
              <button type="button" class="modal-mode-tab ${singleVerseMode ? 'active' : ''}" id="tab-btn-single" role="tab" aria-selected="${singleVerseMode}">
                Single Verse Mode
              </button>
            </div>

            <!-- Mode Panels Wrapper (fixed height to prevent layout jumps) -->
            <div class="modal-tab-panels-wrapper">
              <!-- Panel: Chapter Mode -->
              <div class="modal-tab-panel ${!singleVerseMode ? 'active' : ''}" id="panel-chapter-mode" role="tabpanel">
                <!-- Toggle: Skip Completed Verses (Only configurable under Chapter Mode) -->
                <label class="typing-option-row" for="toggle-skip-done-checkbox">
                  <span class="option-title">Skip Completed Verses</span>
                  <input type="checkbox" id="toggle-skip-done-checkbox" class="option-switch" ${skipCompletedVerses ? 'checked' : ''} />
                </label>

                <!-- Action: Mark Chapter Read -->
                <div class="typing-option-row option-action-row" id="modal-mark-ch-row">
                  <span class="option-title">${book.name} ${initialChapter}</span>
                  <button type="button" class="btn btn-secondary btn-sm mark-read-btn" id="modal-mark-ch-read-btn">
                    <span id="modal-mark-ch-read-label">📖 Mark Read</span>
                  </button>
                </div>
              </div>

              <!-- Panel: Single Verse Mode -->
              <div class="modal-tab-panel ${singleVerseMode ? 'active' : ''}" id="panel-single-mode" role="tabpanel">
                <!-- Toggle: Auto-Advance (Under Single Verse Mode) -->
                <label class="typing-option-row" for="toggle-auto-advance-checkbox">
                  <span class="option-title">Auto-Advance</span>
                  <input type="checkbox" id="toggle-auto-advance-checkbox" class="option-switch" ${autoAdvance ? 'checked' : ''} />
                </label>

                <!-- Toggle: Shuffle Verses (Entire Bible) -->
                <label class="typing-option-row" id="toggle-shuffle-row" for="toggle-shuffle-checkbox">
                  <span class="option-title">Shuffle Next Verses (Entire Bible)</span>
                  <input type="checkbox" id="toggle-shuffle-checkbox" class="option-switch" ${shuffleVerses ? 'checked' : ''} />
                </label>

                <!-- Toggle: Meditate Mode (Coloring Canvas) -->
                <label class="typing-option-row" id="toggle-meditate-mode-row" for="toggle-meditate-mode-checkbox">
                  <span class="option-title">Meditate Mode (Coloring Canvas)</span>
                  <input type="checkbox" id="toggle-meditate-mode-checkbox" class="option-switch" ${meditateMode ? 'checked' : ''} />
                </label>

                <!-- Action: Mark Verse Read -->
                <div class="typing-option-row option-action-row" id="modal-mark-verse-row">
                  <span class="option-title" id="modal-mark-verse-title">Verse ${targetSingleVerseNum || 1}</span>
                  <button type="button" class="btn btn-secondary btn-sm mark-read-btn" id="modal-mark-verse-read-btn">
                    <span id="modal-mark-verse-read-label">📖 Mark Read</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="typing-options-section-divider">
              <span>General</span>
            </div>

            <!-- Toggle: Live Stats Bar -->
            <label class="typing-option-row" for="toggle-stats-checkbox">
              <span class="option-title">Show Live Stats Bar</span>
              <input type="checkbox" id="toggle-stats-checkbox" class="option-switch" ${showTypingStats ? 'checked' : ''} />
            </label>

            <!-- Action: Restart Passage -->
            <div class="typing-option-row option-action-row">
              <span class="option-title">Cursor Position</span>
              <button type="button" class="btn btn-secondary btn-sm" id="modal-restart-btn">↺ Reset to Start</button>
            </div>
          </div>

          <div class="typing-options-footer">
            <button type="button" class="btn btn-primary btn-sm" id="options-done-btn">Done</button>
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
  const optionsBtn = container.querySelector('#typing-options-btn');
  const optionsBackdrop = container.querySelector('#typing-options-backdrop');
  const optionsCloseBtn = container.querySelector('#options-close-btn');
  const optionsDoneBtn = container.querySelector('#options-done-btn');
  const tabBtnChapter = container.querySelector('#tab-btn-chapter');
  const tabBtnSingle = container.querySelector('#tab-btn-single');
  const panelChapterMode = container.querySelector('#panel-chapter-mode');
  const panelSingleMode = container.querySelector('#panel-single-mode');
  const toggleShuffleRow = container.querySelector('#toggle-shuffle-row');
  const toggleShuffleCheckbox = container.querySelector('#toggle-shuffle-checkbox');
  const toggleAutoAdvanceCheckbox = container.querySelector('#toggle-auto-advance-checkbox');
  const toggleMeditateCheckbox = container.querySelector('#toggle-meditate-mode-checkbox');
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
  const passageScroll = container.querySelector('#typing-passage-scroll');
  const passageContent = container.querySelector('#typing-passage-content');
  const errorAlert = container.querySelector('#typing-error-alert');
  const progressFill = container.querySelector('#typing-chapter-progress-fill');
  const liveWpmEl = container.querySelector('#live-wpm');
  const liveCpmEl = container.querySelector('#live-cpm');
  const liveAccEl = container.querySelector('#live-acc');
  const liveVerseEl = container.querySelector('#live-verse');
  const liveTimeEl = container.querySelector('#live-time');
  const telemetrySubStatusEl = null; // integrated into compact badges and modals
  const completionBackdrop = container.querySelector('#completion-modal-backdrop');

  let pendingSingleVerseSwitch = null;

  // ── 1. Typing Options Modal Controls ───────────────────────────
  function setModalTab(isSingle) {
    if (tabBtnChapter) {
      tabBtnChapter.classList.toggle('active', !isSingle);
      tabBtnChapter.setAttribute('aria-selected', String(!isSingle));
    }
    if (tabBtnSingle) {
      tabBtnSingle.classList.toggle('active', isSingle);
      tabBtnSingle.setAttribute('aria-selected', String(isSingle));
    }

    if (panelChapterMode) {
      panelChapterMode.classList.toggle('active', !isSingle);
      panelChapterMode.removeAttribute('hidden');
    }
    if (panelSingleMode) {
      panelSingleMode.classList.toggle('active', isSingle);
      panelSingleMode.removeAttribute('hidden');
    }

    updateReadButtons();
  }

  function selectMode(isSingle) {
    pendingSingleVerseSwitch = isSingle;
    setSingleVerseModePref(isSingle);
    setModalTab(isSingle);

    if (advanceStepBtn) {
      advanceStepBtn.hidden = !isSingle || autoAdvance;
      advanceStepBtn.textContent = (isSingle && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
    }
  }

  function openOptionsModal() {
    pendingSingleVerseSwitch = null;
    setModalTab(singleVerseMode);

    if (toggleShuffleCheckbox) toggleShuffleCheckbox.checked = shuffleVerses;
    if (toggleAutoAdvanceCheckbox) toggleAutoAdvanceCheckbox.checked = autoAdvance;
    if (toggleMeditateCheckbox) toggleMeditateCheckbox.checked = meditateMode;
    if (toggleStatsCheckbox) toggleStatsCheckbox.checked = showTypingStats;
    if (toggleSkipDoneCheckbox) toggleSkipDoneCheckbox.checked = skipCompletedVerses;
    updateReadButtons();
    if (optionsBackdrop) optionsBackdrop.hidden = false;
  }

  function closeOptionsModal() {
    if (optionsBackdrop) optionsBackdrop.hidden = true;
    if (pendingSingleVerseSwitch !== null && pendingSingleVerseSwitch !== singleVerseMode) {
      const isSingle = pendingSingleVerseSwitch;
      pendingSingleVerseSwitch = null;
      if (isSingle) {
        if (shuffleVerses) {
          const randRef = getNextPreloadedRandomVerse(activeTranslation, { bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum || 1 });
          navigate(`/typing/${randRef.bookId}/${randRef.chapter}/${randRef.verse}`);
        } else {
          const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
          const vNum = curVIdx >= 0 && verseRanges[curVIdx] ? verseRanges[curVIdx].verse : (targetSingleVerseNum || 1);
          navigate(`/typing/${book.id}/${initialChapter}/${vNum}`);
        }
      } else {
        const vNum = targetSingleVerseNum || 1;
        navigate(`/typing/${book.id}/${initialChapter}?verse=${vNum}`);
      }
      return;
    }
    focusTypingInput();
  }

  if (optionsBtn) {
    optionsBtn.addEventListener('click', () => {
      openOptionsModal();
    });
  }

  if (optionsCloseBtn) {
    optionsCloseBtn.addEventListener('click', () => {
      closeOptionsModal();
    });
  }

  if (optionsDoneBtn) {
    optionsDoneBtn.addEventListener('click', () => {
      closeOptionsModal();
    });
  }

  if (optionsBackdrop) {
    optionsBackdrop.addEventListener('click', (e) => {
      if (e.target === optionsBackdrop) {
        closeOptionsModal();
      }
    });
  }

  if (tabBtnChapter) {
    tabBtnChapter.addEventListener('click', () => {
      selectMode(false);
    });
  }

  if (tabBtnSingle) {
    tabBtnSingle.addEventListener('click', () => {
      selectMode(true);
    });
  }

  if (toggleShuffleCheckbox) {
    toggleShuffleCheckbox.addEventListener('change', () => {
      shuffleVerses = toggleShuffleCheckbox.checked;
      setShuffleVersesPref(shuffleVerses);
      trackEvent('toggle_shuffle', { enabled: shuffleVerses });
      if (advanceStepBtn) {
        advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
      }
    });
  }

  if (toggleAutoAdvanceCheckbox) {
    toggleAutoAdvanceCheckbox.addEventListener('change', () => {
      autoAdvance = toggleAutoAdvanceCheckbox.checked;
      setAutoAdvancePref(autoAdvance);
      trackEvent('toggle_auto_advance', { enabled: autoAdvance });
      if (advanceStepBtn) {
        const isSingle = pendingSingleVerseSwitch !== null ? pendingSingleVerseSwitch : singleVerseMode;
        advanceStepBtn.hidden = !isSingle || autoAdvance;
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
        summaryStatsLine.hidden = !showTypingStats;
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

  if (toggleMeditateCheckbox) {
    toggleMeditateCheckbox.addEventListener('change', () => {
      meditateMode = toggleMeditateCheckbox.checked;
      setMeditateModePref(meditateMode);
      trackEvent('toggle_meditate_mode', { enabled: meditateMode });
      applyMeditateModeState();
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
    });
  }

  if (meditateMarkReadBtn) {
    meditateMarkReadBtn.addEventListener('click', () => {
      const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
      const vNum = (singleVerseMode && targetSingleVerseNum)
        ? targetSingleVerseNum
        : ((curVIdx >= 0 && verseRanges[curVIdx]) ? verseRanges[curVIdx].verse : (targetSingleVerseNum || 1));
      toggleVerseRead(book.id, initialChapter, vNum, activeTranslation);
      trackEvent('toggle_verse_read_meditate', { bookId: book.id, chapter: initialChapter, verse: vNum });
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
      trackEvent('single_verse_read_full_chapter_click', {
        bookId: book.id,
        chapter: initialChapter,
        verse: vNum
      });
      navigate(`/typing/${book.id}/${initialChapter}?verse=${vNum}`);
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
          navigate(`/typing/${prev.bookId}/${prev.chapter}/${prev.verse}`);
          return;
        }
      }
      if (targetSingleVerseNum > 1) {
        navigate(`/typing/${book.id}/${initialChapter}/${targetSingleVerseNum - 1}`);
      } else {
        navigate(`/typing/${prevChapterRef.bookId}/${prevChapterRef.chapter}/1`);
      }
    } else {
      navigate(`/typing/${prevChapterRef.bookId}/${prevChapterRef.chapter}`);
    }
  }

  function navigateNextStep() {
    if (singleVerseMode && targetSingleVerseNum) {
      if (shuffleVerses) {
        const fwd = popRandomVerseForward();
        if (fwd) {
          pushRandomVerseHistory({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
          navigate(`/typing/${fwd.bookId}/${fwd.chapter}/${fwd.verse}`);
          return;
        }

        pushRandomVerseHistory({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
        clearRandomVerseForward();

        // Use preloaded random verse for instantaneous transition
        const nextRef = getNextPreloadedRandomVerse(activeTranslation, { bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
        navigate(`/typing/${nextRef.bookId}/${nextRef.chapter}/${nextRef.verse}`);
        return;
      }

      const maxV = allChapterVerses.length || targetSingleVerseNum;
      if (targetSingleVerseNum < maxV) {
        navigate(`/typing/${book.id}/${initialChapter}/${targetSingleVerseNum + 1}`);
      } else {
        navigate(`/typing/${nextChapterRef.bookId}/${nextChapterRef.chapter}/1`);
      }
    } else {
      navigate(`/typing/${nextChapterRef.bookId}/${nextChapterRef.chapter}`);
    }
  }

  if (prevStepBtn) prevStepBtn.addEventListener('click', navigatePrevStep);
  if (nextStepBtn) nextStepBtn.addEventListener('click', navigateNextStep);

  function restartTyping() {
    clearTimer();
    startTime = null;
    elapsedMs = 0;
    totalKeystrokes = 0;
    correctKeystrokes = 0;
    mistakes = 0;
    errorBuffer = [];
    isCompleted = false;
    resetActiveVerseTelemetry();

    if (liveWpmEl) liveWpmEl.textContent = '0';
    if (liveCpmEl) liveCpmEl.textContent = '0';
    if (liveAccEl) liveAccEl.textContent = '100%';
    if (liveTimeEl) liveTimeEl.textContent = '0:00';
    if (errorAlert) errorAlert.hidden = true;
    if (completionBackdrop) completionBackdrop.hidden = true;
    if (viewportWrapper) viewportWrapper.classList.remove('has-active-error');
    if (advanceStepBtn) {
      advanceStepBtn.hidden = !singleVerseMode || autoAdvance;
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
    focusTypingInput();
  }

  if (modalRestartBtn) {
    modalRestartBtn.addEventListener('click', () => {
      closeOptionsModal();
      trackEvent('restart_bible_chapter', { bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
      restartTyping();
    });
  }

  // ── 6. Jump to Verse & Find Next Incomplete Verse Helpers ──────
  function resetActiveVerseTelemetry() {
    verseStartTime = null;
    verseKeystrokes = 0;
    verseCorrectKeystrokes = 0;
    verseMistakes = 0;
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

    const prevCursor = cursorIdx;
    const prevErrLen = errorBuffer.length;
    errorBuffer = [];
    cursorIdx = vRange.startCharIdx;
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

    focusTypingInput();
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
        el.classList.remove('is-current', 'is-error', 'is-error-caret');
        if (isVDone) {
          el.classList.add('is-correct');
        } else if (vr === currentVR && cIdx < cursorIdx) {
          el.classList.add('is-correct');
        } else {
          el.classList.remove('is-correct');
        }
      }
    }
  }

  // ── 7. Passage DOM Builder & Typing Engine ─────────────────────
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
    cursorIdx = 0;
    errorBuffer = [];
    startTime = null;
    elapsedMs = 0;
    totalKeystrokes = 0;
    correctKeystrokes = 0;
    mistakes = 0;
    isCompleted = false;
    sittingTypedVersesSet = new Set();
    sittingSessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    resetActiveVerseTelemetry();
    clearTimer();

    function updateVerseSup(supEl, vNum) {
      if (!supEl) return;
      const summary = getChapterProgressSummary(book.id, initialChapter, activeTranslation);
      const vRec = summary.record?.completedVerses?.[String(vNum)];
      const isVRead = Boolean(summary.isFullyRead || vRec?.isRead);
      const isVTyped = Boolean(summary.isFullyTyped || vRec?.isTyped || (vRec?.count && vRec.count > 0));
      let cls = 'verse-num';
      let txt = String(vNum);
      let tip = `Verse ${vNum}`;
      if (isVRead && isVTyped) {
        cls += ' is-both';
        txt = `✓ ${vNum}`;
        tip = `Verse ${vNum} — Read & Typed! Click to toggle read status.`;
      } else if (isVTyped) {
        cls += ' is-done';
        txt = `✓ ${vNum}`;
        tip = `Verse ${vNum} — Typed in typing engine. Click to toggle read status.`;
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

    const fragment = document.createDocumentFragment();
    let globalCharIdx = 0;

    verses.forEach((v, vIdx) => {
      const isVDone = completedVerseSet.has(v.verse);
      const verseBlock = document.createElement('span');
      verseBlock.className = `verse-block ${isVDone ? 'is-verse-completed' : ''}`;
      verseBlock.setAttribute('data-verse', String(v.verse));
      verseBlock.title = singleVerseMode
        ? `${book.name} ${initialChapter}:${v.verse}`
        : `Verse ${v.verse}${isVDone ? ' (✓ Completed)' : ''} — Click to start typing at Verse ${v.verse}`;

      const startCharIdx = globalCharIdx;
      let supElement = null;

      const words = v.text.split(' ').filter(w => w.length > 0);
      words.forEach((word, wIdx) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 't-word';

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
          charEls.push(charSpan);
          globalCharIdx++;
        }

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
          charEls.push(spaceSpan);
          globalCharIdx++;
        }
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
            statusMessage: `📍 Jumped to <strong>${book.name} ${initialChapter}:${v.verse}</strong> — start typing, or click <strong>🎯 Single Verse</strong> to isolate v. ${v.verse}.`
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
    liveWpmEl.textContent = '0';
    liveCpmEl.textContent = '0';
    liveAccEl.textContent = '100%';
    liveTimeEl.textContent = '0:00';
    errorAlert.hidden = true;
    completionBackdrop.hidden = true;
    passageScroll.scrollTop = 0;

    jumpToVerse(initialTargetVerseNum, {
      statusMessage: initialSkipNotice || (singleVerseMode
        ? `Single-verse mode — type Verse ${targetSingleVerseNum}, or click "Open Entire Chapter" to view all ${allChapterVerses.length} verses.`
        : `Click any verse in the chapter to start typing from that verse. Completed verses are remembered automatically.`)
    });

    applyMeditateModeState();
  }

  // ── Meditate Mode (Coloring Canvas & Verse Sanctuary) ─────────
  function applyMeditateModeState() {
    const isMeditate = Boolean(singleVerseMode && meditateMode);

    if (viewportWrapper) {
      viewportWrapper.classList.toggle('is-meditate-active', isMeditate);
    }

    if (advanceStepBtn) {
      advanceStepBtn.hidden = isMeditate || !singleVerseMode || autoAdvance;
    }

    if (meditateMarkReadBtn) {
      meditateMarkReadBtn.hidden = !isMeditate;
    }

    if (summaryStatsLine) {
      summaryStatsLine.hidden = isMeditate || !showTypingStats;
    }

    if (focusBanner && isMeditate) {
      focusBanner.hidden = true;
    }

    if (errorAlert && isMeditate) {
      errorAlert.hidden = true;
    }

    if (isMeditate) {
      if (passageScroll) passageScroll.hidden = true;
      if (meditateCanvasWrapper) {
        meditateCanvasWrapper.hidden = false;
        renderMeditateModeCanvas();
      }
    } else {
      if (passageScroll) passageScroll.hidden = false;
      if (meditateCanvasWrapper) {
        meditateCanvasWrapper.hidden = true;
      }
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
      el.classList.remove('is-current', 'is-error', 'is-error-caret');
      const vNum = charToVerseMap[i];
      const isVDone = completedVerseSet.has(vNum);
      if (isVDone) {
        el.classList.add('is-correct');
      } else if (currentVR && i >= currentVR.startCharIdx && i < cursorIdx) {
        el.classList.add('is-correct');
      } else {
        el.classList.remove('is-correct');
      }
    }

    if (errorBuffer.length > 0) {
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
    const vCpm = Math.round(vRange.charCount / vMins);
    const vWpm = Math.round((vRange.charCount / 5 / vMins) * 10) / 10;
    const vAcc = verseKeystrokes > 0
      ? Math.round((verseCorrectKeystrokes / verseKeystrokes) * 1000) / 10
      : 100;

    completedVerseSet.add(vRange.verse);
    sittingTypedVersesSet.add(vRange.verse);

    if (vRange.verseBlockEl) {
      vRange.verseBlockEl.classList.add('is-verse-completed');
    }
    if (vRange.supEl) {
      vRange.supEl.classList.add('is-done');
      vRange.supEl.textContent = `✓ ${vRange.verse}`;
    }

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

  async function showCompletionModal(verseCompletionInfo = null) {
    isCompleted = true;
    clearTimer();
    elapsedMs = startTime ? performance.now() - startTime : 1000;
    const minutes = Math.max(elapsedMs / 60000, 1 / 600);
    const finalCpm = verseCompletionInfo && singleVerseMode
      ? verseCompletionInfo.vCpm
      : Math.round(correctKeystrokes / minutes);
    const finalWpm = verseCompletionInfo && singleVerseMode
      ? verseCompletionInfo.vWpm
      : Math.round((correctKeystrokes / 5 / minutes) * 10) / 10;
    const finalAcc = totalKeystrokes > 0
      ? Math.round((correctKeystrokes / totalKeystrokes) * 1000) / 10
      : 100;

    if (progressFill) {
      progressFill.style.width = '100%';
    }
    liveWpmEl.textContent = finalWpm.toFixed(1);
    liveCpmEl.textContent = String(finalCpm);
    liveAccEl.textContent = `${finalAcc}%`;
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
      wpm: finalWpm,
      cpm: finalCpm,
      accuracy: finalAcc
    });

    const badgeEl = container.querySelector('#telemetry-completed-badge');
    if (badgeEl) badgeEl.innerHTML = getProgressBadgeHtml();

    if (singleVerseMode) {
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
          ? 'Chapter Completed!'
          : 'Passage Completed!';
      }
    }

    container.querySelector('#completion-subtitle').textContent = singleVerseMode
      ? `${book.name} ${initialChapter}:${targetSingleVerseNum} (${trObj.shortName})`
      : `${book.name} ${initialChapter} (${trObj.shortName}) · ${doneChVerses}/${totalChVerses} Verses Complete`;

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

  function normalizeTypedChar(ch) {
    if (ch === '\u2018' || ch === '\u2019' || ch === '\u02BC') return "'";
    if (ch === '\u201C' || ch === '\u201D') return '"';
    if (ch === '\u2013' || ch === '\u2014') return '-';
    if (ch === '\u00A0') return ' ';
    return ch;
  }

  function processBackspace(clearAll = false) {
    if (isCompleted || targetChars.length === 0) return;
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
    if (isCompleted || targetChars.length === 0) return;
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
              statusMessage: `⏭️ Verse ${currentVRange.verse} saved! Skipped completed verse(s) → jumped to <strong>Verse ${nextIncompleteVerse}</strong>.`
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

  function handleTypingKeydown(e) {
    if (singleVerseMode && meditateMode) {
      if (e.key === 'Escape' && optionsBackdrop && !optionsBackdrop.hidden) {
        e.preventDefault();
        closeOptionsModal();
      }
      return;
    }

    if (isCompleted) {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigateNextStep();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      if (optionsBackdrop && !optionsBackdrop.hidden) {
        closeOptionsModal();
        return;
      }
      restartTyping();
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
    if (singleVerseMode && meditateMode) {
      if (e.key === 'Escape' && optionsBackdrop && !optionsBackdrop.hidden) {
        e.preventDefault();
        closeOptionsModal();
      }
      return;
    }
    if (e.target === hiddenInput) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
    if (document.body.classList.contains('browse-open')) {
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace' || e.key === 'Escape' || e.key === 'Enter' || e.key.length === 1) {
      focusTypingInput();
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

    // In meditate mode, the canvas is full height with no scrolling
    if (singleVerseMode && meditateMode) {
      return;
    }

    // If options modal, completion modal, or browse drawer is open, don't hijack scroll
    const optionsBackdrop = container.querySelector('#typing-options-backdrop');
    if (
      (completionBackdrop && !completionBackdrop.hidden) ||
      (optionsBackdrop && !optionsBackdrop.hidden) ||
      document.body.classList.contains('browse-open')
    ) {
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
    if (singleVerseMode && meditateMode) {
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
    if (singleVerseMode && meditateMode) return;
    if (document.body.classList.contains('browse-open') || !completionBackdrop.hidden) return;
    hiddenInput.focus({ preventScroll: true });
    viewportWrapper.classList.add('is-focused');
    focusBanner.hidden = true;
  }

  hiddenInput.addEventListener('focus', () => {
    if (singleVerseMode && meditateMode) return;
    viewportWrapper.classList.add('is-focused');
    focusBanner.hidden = true;
  });

  hiddenInput.addEventListener('blur', () => {
    if (singleVerseMode && meditateMode) return;
    viewportWrapper.classList.remove('is-focused');
    if (!isCompleted && targetChars.length > 0 && !document.body.classList.contains('browse-open')) {
      focusBanner.hidden = false;
    }
  });

  viewportWrapper.addEventListener('click', () => {
    if (singleVerseMode && meditateMode) return;
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
      navigate(`/typing/${book.id}/${initialChapter}`);
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
