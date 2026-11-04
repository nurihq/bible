import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  getBookById,
  getTranslationByCode,
  getNextChapterRef,
  getPrevChapterRef,
  searchBibleChapters,
  fetchChapterVerses,
  getRandomVerseRef
} from '../bible-data.js?v=20261104_v26';
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
  getSkipCelebrationModalPref,
  setSkipCelebrationModalPref,
  getShuffleVersesPref,
  setShuffleVersesPref,
  getAdvanceButtonPref,
  setAdvanceButtonPref,
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
  toggleVerseRead
} from '../api.js?v=20261104_v26';
import { trackEvent } from '../analytics.js?v=20261104_v26';
import { navigate } from '../app.js?v=20261104_v26';

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
  let skipCelebrationModal = getSkipCelebrationModalPref();
  let shuffleVerses = getShuffleVersesPref();
  let advanceButtonPref = getAdvanceButtonPref();

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

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  let onWindowKeydown = null;
  let onStatsUpdated = null;
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
            <button type="button" class="btn btn-secondary btn-sm advance-step-btn" id="advance-step-btn" title="Advance to next verse (or press Enter)" ${singleVerseMode && advanceButtonPref ? '' : 'hidden'}>
              ${(singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›'}
            </button>
            <span id="telemetry-completed-badge">${getProgressBadgeHtml()}</span>
          </div>

          <div class="summary-actions-group">
            <button type="button" class="btn btn-secondary btn-sm summary-action-btn typing-options-btn" id="typing-options-btn" title="Typing Options & Actions">
              ⚙️ Options
            </button>
          </div>
        </div>

        <!-- Line 2: Live Metrics / Telemetry (Toggled via Typing Options modal) -->
        <div class="summary-line summary-line-bottom" id="typing-summary-stats-line" ${showTypingStats ? '' : 'hidden'}>
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

        <div class="typing-passage-scroll" id="typing-passage-scroll">
          <div class="typing-passage-content" id="typing-passage-content">
            <div class="typing-loading-state">
              <div class="loading-spinner"></div>
              <p>Loading ${book.name} ${initialChapter}${singleVerseMode ? `:${targetSingleVerseNum}` : ''} (${getTranslationByCode(activeTranslation).shortName})...</p>
            </div>
          </div>
        </div>
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
              <a href="#/progress" class="btn btn-secondary" id="comp-progress-btn">
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

            <!-- Panel: Chapter Mode -->
            <div class="modal-tab-panel" id="panel-chapter-mode" ${singleVerseMode ? 'hidden' : ''} role="tabpanel">
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
            <div class="modal-tab-panel" id="panel-single-mode" ${singleVerseMode ? '' : 'hidden'} role="tabpanel">
              <!-- Toggle: Auto-Advance (Under Single Verse Mode) -->
              <label class="typing-option-row" for="toggle-skip-celebration-checkbox">
                <span class="option-title">Auto-Advance (Skip Popup)</span>
                <input type="checkbox" id="toggle-skip-celebration-checkbox" class="option-switch" ${skipCelebrationModal ? 'checked' : ''} />
              </label>

              <!-- Toggle: Wait for Advance Button -->
              <label class="typing-option-row" for="toggle-advance-btn-checkbox">
                <span class="option-title">Wait for Advance Button</span>
                <input type="checkbox" id="toggle-advance-btn-checkbox" class="option-switch" ${advanceButtonPref ? 'checked' : ''} />
              </label>

              <!-- Toggle: Shuffle Verses (Entire Bible) -->
              <label class="typing-option-row" id="toggle-shuffle-row" for="toggle-shuffle-checkbox">
                <span class="option-title">Shuffle Next Verses (Entire Bible)</span>
                <input type="checkbox" id="toggle-shuffle-checkbox" class="option-switch" ${shuffleVerses ? 'checked' : ''} />
              </label>

              <!-- Action: Mark Verse Read -->
              <div class="typing-option-row option-action-row" id="modal-mark-verse-row">
                <span class="option-title" id="modal-mark-verse-title">Verse ${targetSingleVerseNum || 1}</span>
                <button type="button" class="btn btn-secondary btn-sm mark-read-btn" id="modal-mark-verse-read-btn">
                  <span id="modal-mark-verse-read-label">📖 Mark Read</span>
                </button>
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
    </div>
  `;

  // DOM Elements
  const prevStepBtn = container.querySelector('#prev-step-btn');
  const nextStepBtn = container.querySelector('#next-step-btn');
  const advanceStepBtn = container.querySelector('#advance-step-btn');
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
  const toggleAdvanceBtnCheckbox = container.querySelector('#toggle-advance-btn-checkbox');
  const toggleSkipCelebrationCheckbox = container.querySelector('#toggle-skip-celebration-checkbox');
  const toggleStatsCheckbox = container.querySelector('#toggle-stats-checkbox');
  const toggleSkipDoneCheckbox = container.querySelector('#toggle-skip-done-checkbox');
  const modalMarkChBtn = container.querySelector('#modal-mark-ch-read-btn');
  const modalMarkVerseBtn = container.querySelector('#modal-mark-verse-read-btn');
  const modalRestartBtn = container.querySelector('#modal-restart-btn');
  const summaryStatsLine = container.querySelector('#typing-summary-stats-line');
  const hiddenInput = container.querySelector('#typing-hidden-input');
  const viewportWrapper = container.querySelector('#typing-viewport-wrapper');
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

    if (panelChapterMode) panelChapterMode.hidden = isSingle;
    if (panelSingleMode) panelSingleMode.hidden = !isSingle;

    updateReadButtons();
  }

  function selectMode(isSingle) {
    pendingSingleVerseSwitch = isSingle;
    setSingleVerseModePref(isSingle);
    setModalTab(isSingle);

    if (advanceStepBtn) {
      advanceStepBtn.hidden = !isSingle || !advanceButtonPref;
      advanceStepBtn.textContent = (isSingle && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
    }
  }

  function openOptionsModal() {
    pendingSingleVerseSwitch = null;
    setModalTab(singleVerseMode);

    if (toggleShuffleCheckbox) toggleShuffleCheckbox.checked = shuffleVerses;
    if (toggleAdvanceBtnCheckbox) toggleAdvanceBtnCheckbox.checked = advanceButtonPref;
    if (toggleSkipCelebrationCheckbox) toggleSkipCelebrationCheckbox.checked = skipCelebrationModal;
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
          const randRef = getRandomVerseRef({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum || 1 });
          navigate(`#/typing/${randRef.bookId}/${randRef.chapter}/${randRef.verse}`);
        } else {
          const curVIdx = charToVerseIdxMap[cursorIdx] ?? 0;
          const vNum = curVIdx >= 0 && verseRanges[curVIdx] ? verseRanges[curVIdx].verse : (targetSingleVerseNum || 1);
          navigate(`#/typing/${book.id}/${initialChapter}/${vNum}`);
        }
      } else {
        const vNum = targetSingleVerseNum || 1;
        navigate(`#/typing/${book.id}/${initialChapter}?verse=${vNum}`);
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
      if (advanceStepBtn) {
        advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
      }
    });
  }

  if (toggleAdvanceBtnCheckbox) {
    toggleAdvanceBtnCheckbox.addEventListener('change', () => {
      advanceButtonPref = toggleAdvanceBtnCheckbox.checked;
      setAdvanceButtonPref(advanceButtonPref);
      if (advanceStepBtn) {
        const isSingle = pendingSingleVerseSwitch !== null ? pendingSingleVerseSwitch : singleVerseMode;
        advanceStepBtn.hidden = !isSingle || !advanceButtonPref;
      }
    });
  }

  if (advanceStepBtn) {
    advanceStepBtn.addEventListener('click', () => {
      navigateNextStep();
    });
  }

  if (toggleSkipCelebrationCheckbox) {
    toggleSkipCelebrationCheckbox.addEventListener('change', () => {
      skipCelebrationModal = toggleSkipCelebrationCheckbox.checked;
      setSkipCelebrationModalPref(skipCelebrationModal);
    });
  }

  if (toggleStatsCheckbox) {
    toggleStatsCheckbox.addEventListener('change', () => {
      showTypingStats = toggleStatsCheckbox.checked;
      setShowTypingStatsPref(showTypingStats);
      if (summaryStatsLine) {
        summaryStatsLine.hidden = !showTypingStats;
      }
    });
  }

  if (toggleSkipDoneCheckbox) {
    toggleSkipDoneCheckbox.addEventListener('change', () => {
      skipCompletedVerses = toggleSkipDoneCheckbox.checked;
      setSkipCompletedVersesPref(skipCompletedVerses);
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

  // ── 3. Prev / Next Chapter Stepper & Restart Button ────────────
  function navigatePrevStep() {
    if (singleVerseMode && targetSingleVerseNum) {
      if (shuffleVerses) {
        const prev = popRandomVerseHistory();
        if (prev) {
          pushRandomVerseForward({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
          navigate(`#/typing/${prev.bookId}/${prev.chapter}/${prev.verse}`);
          return;
        }
      }
      if (targetSingleVerseNum > 1) {
        navigate(`#/typing/${book.id}/${initialChapter}/${targetSingleVerseNum - 1}`);
      } else {
        navigate(`#/typing/${prevChapterRef.bookId}/${prevChapterRef.chapter}/1`);
      }
    } else {
      navigate(`#/typing/${prevChapterRef.bookId}/${prevChapterRef.chapter}`);
    }
  }

  function navigateNextStep() {
    if (singleVerseMode && targetSingleVerseNum) {
      if (shuffleVerses) {
        const fwd = popRandomVerseForward();
        if (fwd) {
          pushRandomVerseHistory({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
          navigate(`#/typing/${fwd.bookId}/${fwd.chapter}/${fwd.verse}`);
          return;
        }

        pushRandomVerseHistory({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
        clearRandomVerseForward();

        // Always pick a random verse uniformly across the entire Bible (all 66 books, 31,102 verses)
        const nextRef = getRandomVerseRef({ bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
        navigate(`#/typing/${nextRef.bookId}/${nextRef.chapter}/${nextRef.verse}`);
        return;
      }

      const maxV = allChapterVerses.length || targetSingleVerseNum;
      if (targetSingleVerseNum < maxV) {
        navigate(`#/typing/${book.id}/${initialChapter}/${targetSingleVerseNum + 1}`);
      } else {
        navigate(`#/typing/${nextChapterRef.bookId}/${nextChapterRef.chapter}/1`);
      }
    } else {
      navigate(`#/typing/${nextChapterRef.bookId}/${nextChapterRef.chapter}`);
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

    if (singleVerseMode && advanceButtonPref) {
      if (advanceStepBtn) {
        advanceStepBtn.hidden = false;
        advanceStepBtn.classList.remove('btn-secondary');
        advanceStepBtn.classList.add('btn-primary', 'is-ready');
        advanceStepBtn.textContent = (singleVerseMode && shuffleVerses) ? '🎲 Advance ›' : 'Advance ›';
        advanceStepBtn.title = 'Verse complete! Click to advance (or press Enter)';
      }
      return;
    }

    if (singleVerseMode && skipCelebrationModal) {
      navigateNextStep();
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

  // Mobile virtual keyboard fallback via input event
  hiddenInput.addEventListener('input', (e) => {
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
    if (document.body.classList.contains('browse-open') || !completionBackdrop.hidden) return;
    hiddenInput.focus({ preventScroll: true });
    viewportWrapper.classList.add('is-focused');
    focusBanner.hidden = true;
  }

  hiddenInput.addEventListener('focus', () => {
    viewportWrapper.classList.add('is-focused');
    focusBanner.hidden = true;
  });

  hiddenInput.addEventListener('blur', () => {
    viewportWrapper.classList.remove('is-focused');
    if (!isCompleted && targetChars.length > 0 && !document.body.classList.contains('browse-open')) {
      focusBanner.hidden = false;
    }
  });

  viewportWrapper.addEventListener('click', () => {
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
      navigate(`#/typing/${book.id}/${initialChapter}`);
    });
  }

  container.querySelector('#comp-next-btn').addEventListener('click', () => {
    completionBackdrop.hidden = true;
    navigateNextStep();
  });

  // ── 8. Fetch & Initialize Chapter Verses ───────────────────────
  async function loadAndRenderPassage() {
    clearTimer();
    const trObj = getTranslationByCode(activeTranslation);
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
