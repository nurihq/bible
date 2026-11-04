import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  getBookById,
  getTranslationByCode,
  getNextChapterRef,
  getPrevChapterRef,
  searchBibleChapters,
  fetchChapterVerses
} from '../bible-data.js?v=20261104_v6';
import {
  getLocalStore,
  getPreferredTranslation,
  setPreferredTranslation,
  getSkipCompletedVersesPref,
  setSkipCompletedVersesPref,
  setLastSelectedChapter,
  recordCompletedVerse,
  recordCompletedChapter,
  getGlobalTypingStats,
  getChapterProgressSummary,
  isVerseCompletedInRecord
} from '../api.js?v=20261104_v6';
import { trackEvent } from '../analytics.js?v=20261104_v6';
import { navigate } from '../app.js?v=20261104_v6';

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

  setLastSelectedChapter(book.id, initialChapter, targetSingleVerseNum || requestedStartVerse || null);

  const prevChapterRef = getPrevChapterRef(book.id, initialChapter);
  const nextChapterRef = getNextChapterRef(book.id, initialChapter);
  const chapterKey = `${book.id}:${initialChapter}`;

  // Ensure window does not scroll while typing; typing card fills remaining viewport height
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

  // Cleanup any previous intervals/listeners when navigating away
  if (window.__bibleTypingCleanup) {
    window.__bibleTypingCleanup();
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  let onWindowKeydown = null;
  function cleanup() {
    clearTimer();
    document.body.classList.remove('typing-active-view');
    if (onWindowKeydown) {
      window.removeEventListener('keydown', onWindowKeydown);
      onWindowKeydown = null;
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
    const totalV = allChapterVerses.length || 0;
    const doneV = completedVerseSet.size;
    const latestRec = getLocalStore().chapters?.[chapterKey] || null;
    const trList = Object.keys(latestRec?.translations || {});
    const trText = trList.length > 0 ? ` (${trList.join(', ')})` : '';

    if (singleVerseMode && targetSingleVerseNum) {
      const vDone = completedVerseSet.has(targetSingleVerseNum);
      const vStat = latestRec?.completedVerses?.[String(targetSingleVerseNum)];
      if (vDone) {
        return `
          <span class="chapter-completed-pill" title="Verse ${targetSingleVerseNum} completed!">
            ✓ Verse ${targetSingleVerseNum} Completed${vStat?.bestWpm ? ` · Best ${vStat.bestWpm} WPM` : ''}
          </span>
        `;
      }
      return `
        <span class="chapter-partial-pill" title="Chapter progress: ${doneV}/${totalV || '?'} verses completed">
          🎯 Single Verse · Ch. Reach: ${doneV}/${totalV || '?'}v
        </span>
      `;
    }

    if (totalV > 0 && doneV >= totalV) {
      return `
        <span class="chapter-completed-pill" title="All ${totalV} verses in this chapter completed!">
          ✓ Completed (${totalV}/${totalV}v)${trText}${latestRec?.bestWpm ? ` · Best ${latestRec.bestWpm} WPM` : ''}
        </span>
      `;
    }

    if (doneV > 0) {
      const pct = totalV > 0 ? Math.round((doneV / totalV) * 100) : 0;
      return `
        <span class="chapter-partial-pill" title="${doneV} of ${totalV} verses completed (${pct}%)">
          ⏳ In Progress: ${doneV}/${totalV || '?'} verses (${pct}%)
        </span>
      `;
    }

    return '';
  }

  container.innerHTML = `
    <div class="typing-screen-container">
      <!-- Very short single line summary: Chapter Nav, Title, Progress Badge, Stats & Skip Toggle -->
      <div class="typing-summary-bar">
        <div class="summary-left">
          <button class="btn btn-secondary btn-sm summary-step-btn" id="prev-step-btn" title="Previous Chapter (${prevChapterRef.bookName} ${prevChapterRef.chapter})">‹</button>
          <div class="summary-heading">
            <h1 class="summary-title" id="telemetry-heading-title">
              ${singleVerseMode ? `${book.name} ${initialChapter}:${targetSingleVerseNum}` : `${book.name} ${initialChapter}`}
            </h1>
            <span class="summary-tr-tag" id="telemetry-translation-tag">${getTranslationByCode(activeTranslation).shortName}</span>
          </div>
          <button class="btn btn-secondary btn-sm summary-step-btn" id="next-step-btn" title="Next Chapter (${nextChapterRef.bookName} ${nextChapterRef.chapter})">›</button>
          <span id="telemetry-completed-badge">${getProgressBadgeHtml()}</span>
          ${singleVerseMode ? `
            <button type="button" class="btn btn-secondary btn-sm summary-action-btn" id="open-full-chapter-top-btn" title="Open the entire chapter (${book.name} ${initialChapter})">
              📖 Full Chapter (${book.abbr} ${initialChapter})
            </button>
          ` : `
            <button type="button" class="btn btn-secondary btn-sm summary-action-btn" id="focus-single-verse-top-btn" title="Practice only the currently active verse">
              🎯 Single Verse
            </button>
          `}
        </div>

        <div class="summary-right">
          ${!singleVerseMode ? `
            <button
              type="button"
              class="skip-completed-toggle-pill ${skipCompletedVerses ? 'is-on' : 'is-off'}"
              id="skip-completed-toggle-btn"
              title="When enabled (default), typing skips past already-completed verses to the next incomplete verse in this chapter."
            >
              <span>⏭️ Skip Done:</span>
              <strong id="skip-completed-state-label">${skipCompletedVerses ? 'ON' : 'OFF'}</strong>
            </button>
          ` : ''}

          <div class="summary-stat-box">
            <span class="stat-lbl">WPM</span>
            <span class="stat-num" id="live-wpm">0</span>
          </div>
          <div class="summary-stat-box">
            <span class="stat-lbl">CPM</span>
            <span class="stat-num" id="live-cpm">0</span>
          </div>
          <div class="summary-stat-box">
            <span class="stat-lbl">Acc</span>
            <span class="stat-num" id="live-acc">100%</span>
          </div>
          <div class="summary-stat-box">
            <span class="stat-lbl">Verse</span>
            <span class="stat-num" id="live-verse">-/-</span>
          </div>
          <div class="summary-stat-box">
            <span class="stat-lbl">Time</span>
            <span class="stat-num" id="live-time">0:00</span>
          </div>

          <button class="btn btn-secondary btn-sm summary-restart-btn" id="restart-chapter-btn" title="Restart passage (Esc)">
            ↺ Restart
          </button>
        </div>
      </div>

      <!-- Chapter / Verse Progress Bar -->
      <div class="typing-chapter-progress-track">
        <div class="typing-chapter-progress-fill" id="typing-chapter-progress-fill" style="width: 0%"></div>
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
    </div>
  `;

  // DOM Elements
  const prevStepBtn = container.querySelector('#prev-step-btn');
  const nextStepBtn = container.querySelector('#next-step-btn');
  const openFullChapterTopBtn = container.querySelector('#open-full-chapter-top-btn');
  const focusSingleVerseTopBtn = container.querySelector('#focus-single-verse-top-btn');
  const skipCompletedToggleBtn = container.querySelector('#skip-completed-toggle-btn');
  const skipCompletedStateLabel = container.querySelector('#skip-completed-state-label');
  const restartBtn = container.querySelector('#restart-chapter-btn');
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

  // ── 1. Skip Completed Verses Toggle ────────────────────────────
  if (skipCompletedToggleBtn) {
    skipCompletedToggleBtn.addEventListener('click', () => {
      skipCompletedVerses = !skipCompletedVerses;
      setSkipCompletedVersesPref(skipCompletedVerses);
      skipCompletedToggleBtn.classList.toggle('is-on', skipCompletedVerses);
      skipCompletedToggleBtn.classList.toggle('is-off', !skipCompletedVerses);
      if (skipCompletedStateLabel) {
        skipCompletedStateLabel.textContent = skipCompletedVerses ? 'ON' : 'OFF';
      }
      focusTypingInput();
    });
  }

  // ── 2. Single-Verse <-> Full-Chapter Navigation Controls ───────
  if (openFullChapterTopBtn) {
    openFullChapterTopBtn.addEventListener('click', () => {
      navigate(`#/typing/${book.id}/${initialChapter}?verse=${targetSingleVerseNum || 1}`);
    });
  }

  if (focusSingleVerseTopBtn) {
    focusSingleVerseTopBtn.addEventListener('click', () => {
      const currentVerseNum = charToVerseMap[Math.min(cursorIdx, Math.max(0, charToVerseMap.length - 1))] || 1;
      navigate(`#/typing/${book.id}/${initialChapter}/${currentVerseNum}`);
    });
  }

  // ── 3. Prev / Next Chapter Stepper & Restart Button ────────────
  function navigatePrevStep() {
    if (singleVerseMode && targetSingleVerseNum) {
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

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      buildPassageDOM(allChapterVerses);
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
    updateCursorAndErrorClasses(prevCursor, prevErrLen);

    if (options.statusMessage && telemetrySubStatusEl) {
      telemetrySubStatusEl.innerHTML = options.statusMessage;
    }

    focusTypingInput();
    return true;
  }

  function refreshAllCharClasses() {
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
        if (cIdx < cursorIdx || isVDone) {
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

    populateGranularitySelect();

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
          sup.className = `verse-num ${isVDone ? 'is-done' : ''}`;
          sup.setAttribute('aria-hidden', 'true');
          sup.textContent = isVDone ? `✓ ${v.verse}` : String(v.verse);
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

    for (let i = clearStart; i <= clearEnd; i++) {
      const el = charEls[i];
      if (!el) continue;
      el.classList.remove('is-current', 'is-error', 'is-error-caret');
      const vNum = charToVerseMap[i];
      if (i < cursorIdx || completedVerseSet.has(vNum)) {
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

    // Update progress bar
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
    populateGranularitySelect();
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

    progressFill.style.width = '100%';
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
        const maxV = allChapterVerses.length || targetSingleVerseNum;
        if (targetSingleVerseNum < maxV) {
          nextBtn.textContent = `Next Verse: ${book.name} ${initialChapter}:${targetSingleVerseNum + 1} →`;
        } else {
          nextBtn.textContent = `Next: ${nextChapterRef.bookName} ${nextChapterRef.chapter}:1 →`;
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
      buildPassageDOM(allChapterVerses);
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

  restartBtn.addEventListener('click', () => {
    if (allChapterVerses.length > 0) {
      trackEvent('restart_bible_chapter', { bookId: book.id, chapter: initialChapter, verse: targetSingleVerseNum });
      buildPassageDOM(allChapterVerses);
    }
  });

  // Completion modal buttons
  container.querySelector('#comp-retry-btn').addEventListener('click', () => {
    completionBackdrop.hidden = true;
    buildPassageDOM(allChapterVerses);
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
