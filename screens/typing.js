import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  getBookById,
  getTranslationByCode,
  getNextChapterRef,
  getPrevChapterRef,
  searchBibleChapters,
  fetchChapterVerses
} from '../bible-data.js';
import {
  getLocalStore,
  getPreferredTranslation,
  setPreferredTranslation,
  setLastSelectedChapter,
  recordCompletedChapter,
  getGlobalTypingStats
} from '../api.js';
import { trackEvent } from '../analytics.js';
import { navigate } from '../app.js';

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
  let activeTranslation = getPreferredTranslation() || 'ESV';

  setLastSelectedChapter(book.id, initialChapter);

  const prevRef = getPrevChapterRef(book.id, initialChapter);
  const nextRef = getNextChapterRef(book.id, initialChapter);
  const chapterKey = `${book.id}:${initialChapter}`;
  const existingRecord = store.chapters?.[chapterKey] || null;

  // Active typing session state
  let verses = [];
  let targetChars = [];
  let charToVerseMap = [];
  let charEls = [];
  let cursorIdx = 0;
  let errorBuffer = [];
  let startTime = null;
  let elapsedMs = 0;
  let timerInterval = null;
  let totalKeystrokes = 0;
  let correctKeystrokes = 0;
  let mistakes = 0;
  let isCompleted = false;
  let isDrawerOpen = false;
  let drawerTestamentFilter = 'ALL';
  let drawerSelectedBookId = book.id;

  // Cleanup any previous intervals when navigating away
  if (window.__bibleTypingCleanup) {
    window.__bibleTypingCleanup();
  }

  function cleanup() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
  window.__bibleTypingCleanup = cleanup;

  function getCompletedTranslationsBadge(rec) {
    if (!rec) return '';
    const trList = Object.keys(rec.translations || {});
    const trText = trList.length > 0 ? ` (${trList.join(', ')})` : '';
    return `
      <span class="chapter-completed-pill" title="You have completed this chapter! Best speed: ${rec.bestWpm} WPM / ${rec.bestCpm} CPM">
        ✓ Completed${trText} · Best ${rec.bestWpm} WPM
      </span>
    `;
  }

  container.innerHTML = `
    <div class="typing-screen-container">
      <!-- Top Control Bar: Search, Browse Books, Chapter Nav, Translation Selector -->
      <div class="typing-controls-bar">
        <div class="typing-search-group">
          <div class="chapter-search-wrapper" id="chapter-search-wrapper">
            <span class="chapter-search-icon">🔍</span>
            <input
              type="text"
              class="chapter-search-input"
              id="chapter-search-input"
              placeholder="Search chapter (e.g. John 3, Psalm 23, Rom 8)..."
              autocomplete="off"
            />
            <div class="chapter-search-dropdown" id="chapter-search-dropdown" hidden></div>
          </div>

          <button class="btn btn-secondary btn-sm" id="toggle-book-drawer-btn" type="button">
            📚 Browse Books
          </button>
        </div>

        <div class="typing-nav-group">
          <div class="chapter-stepper">
            <button class="btn btn-secondary btn-sm chapter-step-btn" id="prev-chapter-btn" title="Previous: ${prevRef.bookName} ${prevRef.chapter}">
              ‹
            </button>
            <div class="current-chapter-pill" id="current-chapter-pill" title="Click to browse books & chapters">
              <span class="current-chapter-title">${book.name} ${initialChapter}</span>
              <span class="current-chapter-caret">▾</span>
            </div>
            <button class="btn btn-secondary btn-sm chapter-step-btn" id="next-chapter-btn" title="Next: ${nextRef.bookName} ${nextRef.chapter}">
              ›
            </button>
          </div>

          <div class="translation-select-wrapper" title="Select Bible Translation (Default: ESV)">
            <select class="translation-select" id="translation-select">
              ${BIBLE_TRANSLATIONS.map(t => `
                <option value="${t.code}" ${t.code === activeTranslation ? 'selected' : ''}>
                  ${t.shortName} — ${t.name}
                </option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- Collapsible 66-Book & Chapter Browser Drawer -->
      <div class="book-browser-drawer" id="book-browser-drawer" hidden>
        <div class="book-browser-header">
          <div class="book-browser-tabs">
            <button class="book-tab-btn active" data-testament="ALL">All 66 Books</button>
            <button class="book-tab-btn" data-testament="OT">Old Testament (39)</button>
            <button class="book-tab-btn" data-testament="NT">New Testament (27)</button>
          </div>
          <button class="btn btn-secondary btn-sm" id="close-book-drawer-btn">Close ✕</button>
        </div>
        <div class="book-browser-body">
          <div class="book-browser-books-list" id="book-browser-books-list"></div>
          <div class="book-browser-chapters-panel" id="book-browser-chapters-panel"></div>
        </div>
      </div>

      <!-- Chapter Header & Live Telemetry Bar -->
      <div class="typing-telemetry-card">
        <div class="telemetry-left">
          <div class="telemetry-chapter-heading">
            <h1 class="telemetry-title">${book.name} ${initialChapter}</h1>
            <span class="telemetry-translation-tag" id="telemetry-translation-tag">${getTranslationByCode(activeTranslation).shortName}</span>
            <span id="telemetry-completed-badge">${getCompletedTranslationsBadge(existingRecord)}</span>
          </div>
          <div class="telemetry-sub" id="telemetry-sub-status">
            Verse numbers are shown for reference — simply type the words of the passage.
          </div>
        </div>

        <div class="telemetry-metrics">
          <div class="telemetry-metric-box">
            <span class="metric-label">WPM</span>
            <span class="metric-value" id="live-wpm">0</span>
          </div>
          <div class="telemetry-metric-box">
            <span class="metric-label">CPM</span>
            <span class="metric-value" id="live-cpm">0</span>
          </div>
          <div class="telemetry-metric-box">
            <span class="metric-label">Accuracy</span>
            <span class="metric-value" id="live-acc">100%</span>
          </div>
          <div class="telemetry-metric-box">
            <span class="metric-label">Verse</span>
            <span class="metric-value" id="live-verse">-/-</span>
          </div>
          <div class="telemetry-metric-box">
            <span class="metric-label">Time</span>
            <span class="metric-value" id="live-time">0:00</span>
          </div>
          <button class="btn btn-secondary btn-sm" id="restart-chapter-btn" title="Restart Chapter (Esc)">
            ↺ Restart
          </button>
        </div>
      </div>

      <!-- Chapter Progress Bar -->
      <div class="typing-chapter-progress-track">
        <div class="typing-chapter-progress-fill" id="typing-chapter-progress-fill" style="width: 0%"></div>
      </div>

      <!-- Strict Backspace Error Banner (Only shown when an active mistake needs Backspace) -->
      <div class="typing-error-alert" id="typing-error-alert" hidden>
        <span>⌫ Mistyped character — press <strong>Backspace</strong> to fix before continuing</span>
      </div>

      <!-- Main Scripture Typing Viewport -->
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
          <span>⌨️ Click here or press any key to resume typing</span>
        </div>

        <div class="typing-passage-scroll" id="typing-passage-scroll">
          <div class="typing-passage-content" id="typing-passage-content">
            <div class="typing-loading-state">
              <div class="loading-spinner"></div>
              <p>Loading ${book.name} ${initialChapter} (${getTranslationByCode(activeTranslation).shortName})...</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Chapter Completion Modal / Celebration Overlay -->
      <div class="completion-modal-backdrop" id="completion-modal-backdrop" hidden>
        <div class="completion-modal-card">
          <div class="completion-badge-icon">🎉</div>
          <h2 class="completion-title">Chapter Completed!</h2>
          <p class="completion-subtitle" id="completion-subtitle">
            ${book.name} ${initialChapter} (${getTranslationByCode(activeTranslation).shortName})
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
              <span class="c-stat-label">Verses Typed</span>
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

          <div class="completion-actions">
            <button class="btn btn-secondary" id="comp-retry-btn">
              ↺ Type Again
            </button>
            <a href="#/progress" class="btn btn-secondary" id="comp-progress-btn">
              📊 View Progress
            </a>
            <button class="btn btn-primary" id="comp-next-btn">
              Next: ${nextRef.bookName} ${nextRef.chapter} →
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // DOM Elements
  const searchInput = container.querySelector('#chapter-search-input');
  const searchDropdown = container.querySelector('#chapter-search-dropdown');
  const toggleDrawerBtn = container.querySelector('#toggle-book-drawer-btn');
  const currentChapterPill = container.querySelector('#current-chapter-pill');
  const closeDrawerBtn = container.querySelector('#close-book-drawer-btn');
  const bookDrawer = container.querySelector('#book-browser-drawer');
  const booksListEl = container.querySelector('#book-browser-books-list');
  const chaptersPanelEl = container.querySelector('#book-browser-chapters-panel');
  const prevChapterBtn = container.querySelector('#prev-chapter-btn');
  const nextChapterBtn = container.querySelector('#next-chapter-btn');
  const translationSelect = container.querySelector('#translation-select');
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
  const completionBackdrop = container.querySelector('#completion-modal-backdrop');

  // ── 1. Book & Chapter Browser Drawer Rendering ─────────────────
  function renderBookDrawer() {
    const currentStore = getLocalStore();
    const chaptersMap = currentStore.chapters || {};
    const filteredBooks = BIBLE_BOOKS.filter(b =>
      drawerTestamentFilter === 'ALL' ? true : b.testament === drawerTestamentFilter
    );

    if (!filteredBooks.some(b => b.id === drawerSelectedBookId) && filteredBooks.length > 0) {
      drawerSelectedBookId = filteredBooks[0].id;
    }

    booksListEl.innerHTML = filteredBooks
      .map(b => {
        let doneCount = 0;
        for (let c = 1; c <= b.chapters; c++) {
          if (chaptersMap[`${b.id}:${c}`]) doneCount++;
        }
        const isAllDone = doneCount === b.chapters;
        const isSelected = b.id === drawerSelectedBookId;
        return `
          <button
            type="button"
            class="drawer-book-item ${isSelected ? 'active' : ''} ${isAllDone ? 'is-book-complete' : ''}"
            data-book-id="${b.id}"
          >
            <span class="drawer-book-name">${b.name}</span>
            <span class="drawer-book-progress">${doneCount > 0 ? `✓ ${doneCount}/${b.chapters}` : `${b.chapters}`}</span>
          </button>
        `;
      })
      .join('');

    const selBook = getBookById(drawerSelectedBookId);
    const chapterButtons = [];
    for (let c = 1; c <= selBook.chapters; c++) {
      const rec = chaptersMap[`${selBook.id}:${c}`];
      const isCurrent = selBook.id === book.id && c === initialChapter;
      const trs = rec ? Object.keys(rec.translations || {}).join(', ') : '';
      chapterButtons.push(`
        <button
          type="button"
          class="drawer-chapter-pill ${rec ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''}"
          data-book-id="${selBook.id}"
          data-chapter="${c}"
          title="${rec ? `Completed (${trs}) · Best: ${rec.bestWpm} WPM` : `${selBook.name} ${c}`}"
        >
          <span>${c}</span>
          ${rec ? `<span class="drawer-ch-check">✓</span>` : ''}
        </button>
      `);
    }

    chaptersPanelEl.innerHTML = `
      <div class="drawer-chapters-header">
        <strong>${selBook.name}</strong>
        <span>${selBook.category} · ${selBook.chapters} Chapters</span>
      </div>
      <div class="drawer-chapters-grid">
        ${chapterButtons.join('')}
      </div>
    `;

    booksListEl.querySelectorAll('.drawer-book-item').forEach(btn => {
      btn.addEventListener('click', () => {
        drawerSelectedBookId = Number(btn.getAttribute('data-book-id'));
        renderBookDrawer();
      });
    });

    chaptersPanelEl.querySelectorAll('.drawer-chapter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const bId = Number(btn.getAttribute('data-book-id'));
        const ch = Number(btn.getAttribute('data-chapter'));
        navigate(`#/typing/${bId}/${ch}`);
      });
    });
  }

  function toggleDrawer(forceState) {
    isDrawerOpen = typeof forceState === 'boolean' ? forceState : !isDrawerOpen;
    bookDrawer.hidden = !isDrawerOpen;
    if (isDrawerOpen) {
      renderBookDrawer();
    } else {
      focusTypingInput();
    }
  }

  toggleDrawerBtn.addEventListener('click', () => toggleDrawer());
  currentChapterPill.addEventListener('click', () => toggleDrawer());
  closeDrawerBtn.addEventListener('click', () => toggleDrawer(false));

  bookDrawer.querySelectorAll('.book-tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      bookDrawer.querySelectorAll('.book-tab-btn').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      drawerTestamentFilter = tab.getAttribute('data-testament');
      renderBookDrawer();
    });
  });

  // ── 2. Smart Search Input & Autocomplete ───────────────────────
  function renderSearchDropdown(query) {
    const results = searchBibleChapters(query, 10);
    if (results.length === 0) {
      searchDropdown.hidden = true;
      return;
    }

    const chaptersMap = getLocalStore().chapters || {};
    searchDropdown.innerHTML = results
      .map((r, idx) => {
        const rec = chaptersMap[`${r.bookId}:${r.chapter}`];
        return `
          <button
            type="button"
            class="search-result-item ${idx === 0 ? 'is-first' : ''}"
            data-book-id="${r.bookId}"
            data-chapter="${r.chapter}"
          >
            <div class="search-result-left">
              <strong>${r.label}</strong>
              <span class="search-result-cat">${r.testament} · ${r.category}</span>
            </div>
            <div class="search-result-right">
              ${rec ? `<span class="search-done-badge">✓ ${rec.bestWpm} WPM</span>` : `<span class="search-go-hint">Type →</span>`}
            </div>
          </button>
        `;
      })
      .join('');
    searchDropdown.hidden = false;

    searchDropdown.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const bId = item.getAttribute('data-book-id');
        const ch = item.getAttribute('data-chapter');
        searchDropdown.hidden = true;
        searchInput.value = '';
        navigate(`#/typing/${bId}/${ch}`);
      });
    });
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (!q) {
      searchDropdown.hidden = true;
      return;
    }
    renderSearchDropdown(q);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const results = searchBibleChapters(searchInput.value, 1);
      if (results.length > 0) {
        e.preventDefault();
        searchDropdown.hidden = true;
        searchInput.value = '';
        navigate(`#/typing/${results[0].bookId}/${results[0].chapter}`);
      }
    } else if (e.key === 'Escape') {
      searchDropdown.hidden = true;
      searchInput.blur();
      focusTypingInput();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) return;
    if (!e.target.closest('#chapter-search-wrapper')) {
      searchDropdown.hidden = true;
    }
  });

  // ── 3. Chapter Stepper & Translation Selector ──────────────────
  prevChapterBtn.addEventListener('click', () => {
    navigate(`#/typing/${prevRef.bookId}/${prevRef.chapter}`);
  });
  nextChapterBtn.addEventListener('click', () => {
    navigate(`#/typing/${nextRef.bookId}/${nextRef.chapter}`);
  });

  translationSelect.addEventListener('change', () => {
    activeTranslation = translationSelect.value;
    setPreferredTranslation(activeTranslation);
    const trObj = getTranslationByCode(activeTranslation);
    const tagEl = container.querySelector('#telemetry-translation-tag');
    if (tagEl) tagEl.textContent = trObj.shortName;
    trackEvent('change_bible_translation', { translation: activeTranslation });
    loadAndRenderPassage();
  });

  // ── 4. Passage DOM Builder & Typing Engine ─────────────────────
  function buildPassageDOM(loadedVerses) {
    verses = loadedVerses;
    targetChars = [];
    charToVerseMap = [];
    charEls = [];
    cursorIdx = 0;
    errorBuffer = [];
    startTime = null;
    elapsedMs = 0;
    totalKeystrokes = 0;
    correctKeystrokes = 0;
    mistakes = 0;
    isCompleted = false;
    cleanup();

    const fragment = document.createDocumentFragment();
    let globalCharIdx = 0;

    verses.forEach((v, vIdx) => {
      const verseBlock = document.createElement('span');
      verseBlock.className = 'verse-block';
      verseBlock.setAttribute('data-verse', String(v.verse));

      const words = v.text.split(' ').filter(w => w.length > 0);
      words.forEach((word, wIdx) => {
        const wordSpan = document.createElement('span');
        wordSpan.className = 't-word';

        // Attach visible (non-typed) verse number superscript right before the first word of the verse
        if (wIdx === 0) {
          const sup = document.createElement('sup');
          sup.className = 'verse-num';
          sup.setAttribute('aria-hidden', 'true');
          sup.textContent = String(v.verse);
          wordSpan.appendChild(sup);
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
          charEls.push(charSpan);
          globalCharIdx++;
        }

        verseBlock.appendChild(wordSpan);

        // Add separating space between words (and between verses, except after final word of final verse)
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
          charEls.push(spaceSpan);
          globalCharIdx++;
        }
      });

      fragment.appendChild(verseBlock);
    });

    passageContent.innerHTML = '';
    passageContent.appendChild(fragment);

    // Reset telemetry UI
    liveWpmEl.textContent = '0';
    liveCpmEl.textContent = '0';
    liveAccEl.textContent = '100%';
    liveVerseEl.textContent = verses.length > 0 ? `1/${verses.length}` : '0/0';
    liveTimeEl.textContent = '0:00';
    progressFill.style.width = '0%';
    errorAlert.hidden = true;
    completionBackdrop.hidden = true;
    passageScroll.scrollTop = 0;

    updateCursorAndErrorClasses(0, 0);
    focusTypingInput();
  }

  function updateLiveMetrics() {
    if (!startTime) return;
    elapsedMs = performance.now() - startTime;
    const minutes = Math.max(elapsedMs / 60000, 1 / 600); // minimum 0.1s guard

    const cpm = Math.round(cursorIdx / minutes);
    const wpm = Math.round((cursorIdx / 5 / minutes) * 10) / 10;
    const acc = totalKeystrokes > 0
      ? Math.round((correctKeystrokes / totalKeystrokes) * 1000) / 10
      : 100;

    liveWpmEl.textContent = wpm.toFixed(1);
    liveCpmEl.textContent = String(cpm);
    liveAccEl.textContent = `${acc}%`;
    liveTimeEl.textContent = formatDuration(elapsedMs);
  }

  function updateCursorAndErrorClasses(prevCursor, prevErrLen) {
    // Clear classes around previous cursor & error range
    const clearStart = Math.max(0, Math.min(prevCursor, cursorIdx) - 2);
    const clearEnd = Math.min(charEls.length - 1, Math.max(prevCursor + prevErrLen, cursorIdx + errorBuffer.length) + 2);

    for (let i = clearStart; i <= clearEnd; i++) {
      const el = charEls[i];
      if (!el) continue;
      el.classList.remove('is-current', 'is-error', 'is-error-caret');
      if (i < cursorIdx) {
        el.classList.add('is-correct');
      } else {
        el.classList.remove('is-correct');
      }
    }

    // Apply error classes for any active mistyped characters in errorBuffer
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
        charEls[cursorIdx].classList.add('is-current');
      }
    }

    // Highlight active verse block & update verse counter
    const currentVerseNum = charToVerseMap[Math.min(cursorIdx, charToVerseMap.length - 1)] || 1;
    liveVerseEl.textContent = `${currentVerseNum}/${verses.length}`;

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
    const pct = targetChars.length > 0 ? Math.min(100, (cursorIdx / targetChars.length) * 100) : 0;
    progressFill.style.width = `${pct.toFixed(1)}%`;

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

  async function handleChapterCompleted() {
    isCompleted = true;
    cleanup();
    elapsedMs = startTime ? performance.now() - startTime : 1000;
    const minutes = Math.max(elapsedMs / 60000, 1 / 600);
    const finalCpm = Math.round(targetChars.length / minutes);
    const finalWpm = Math.round((targetChars.length / 5 / minutes) * 10) / 10;
    const finalAcc = totalKeystrokes > 0
      ? Math.round((correctKeystrokes / totalKeystrokes) * 1000) / 10
      : 100;
    const wordsCount = targetChars.join('').trim().split(/\s+/).length;

    progressFill.style.width = '100%';
    liveWpmEl.textContent = finalWpm.toFixed(1);
    liveCpmEl.textContent = String(finalCpm);
    liveAccEl.textContent = `${finalAcc}%`;
    liveTimeEl.textContent = formatDuration(elapsedMs);

    const firstVerse = verses[0]?.verse || 1;
    const lastVerse = verses[verses.length - 1]?.verse || verses.length;

    const result = await recordCompletedChapter({
      bookId: book.id,
      bookName: book.name,
      chapter: initialChapter,
      translation: activeTranslation,
      wpm: finalWpm,
      cpm: finalCpm,
      accuracy: finalAcc,
      charsTyped: targetChars.length,
      wordsTyped: wordsCount,
      versesTyped: verses.length,
      verseRange: `${firstVerse}-${lastVerse}`,
      mistakes,
      durationMs: Math.round(elapsedMs),
      completedAt: new Date().toISOString()
    });

    trackEvent('complete_bible_chapter', {
      bookId: book.id,
      bookName: book.name,
      chapter: initialChapter,
      translation: activeTranslation,
      wpm: finalWpm,
      cpm: finalCpm,
      accuracy: finalAcc
    });

    // Update badge in header
    const badgeEl = container.querySelector('#telemetry-completed-badge');
    if (badgeEl) {
      badgeEl.innerHTML = getCompletedTranslationsBadge(result.chapterRecord);
    }

    // Populate Completion Modal
    const stats = getGlobalTypingStats();
    const trObj = getTranslationByCode(activeTranslation);
    container.querySelector('#completion-subtitle').textContent =
      `${book.name} ${initialChapter}:${firstVerse}–${lastVerse} (${trObj.shortName})`;
    container.querySelector('#comp-wpm').textContent = `${finalWpm} WPM`;
    container.querySelector('#comp-cpm').textContent = `${finalCpm} CPM`;
    container.querySelector('#comp-acc').textContent = `${finalAcc}%`;
    container.querySelector('#comp-verses').textContent = `${verses.length}`;
    container.querySelector('#comp-chars').textContent = targetChars.length.toLocaleString();
    container.querySelector('#comp-time').textContent = formatDuration(elapsedMs);

    const badges = [];
    if (result.isFirstTimeOverall) {
      badges.push(`<span class="comp-highlight-pill is-emerald">✨ New Chapter Unlocked (+1 Bible Reach)</span>`);
    } else if (result.isFirstTimeInTranslation) {
      badges.push(`<span class="comp-highlight-pill is-emerald">📖 First Completion in ${trObj.shortName}</span>`);
    }
    if (result.isNewPersonalBest) {
      badges.push(`<span class="comp-highlight-pill is-lavender">🏆 New Personal Best Speed!</span>`);
    }
    container.querySelector('#completion-highlights').innerHTML = badges.join('');

    container.querySelector('#completion-reach-summary').innerHTML = `
      <div class="comp-reach-row">
        <span>Overall Bible Reach: <strong>${stats.overallCompletedChapters} / ${stats.totalBibleChapters} chapters (${stats.overallPercentage}%)</strong></span>
        <span>All-Time Avg: <strong>${stats.avgWpm} WPM · ${stats.avgCpm} CPM</strong></span>
      </div>
    `;

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

    if (!startTime) {
      startTime = performance.now();
      timerInterval = setInterval(updateLiveMetrics, 200);
    }

    const prevCursor = cursorIdx;
    const prevErrLen = errorBuffer.length;
    totalKeystrokes++;

    // Strict mode: can only advance if errorBuffer is empty AND character matches targetChars[cursorIdx]
    const expected = targetChars[cursorIdx];
    if (errorBuffer.length === 0 && ch === expected) {
      correctKeystrokes++;
      cursorIdx++;

      if (cursorIdx >= targetChars.length) {
        updateCursorAndErrorClasses(prevCursor, prevErrLen);
        handleChapterCompleted();
        return;
      }

      updateCursorAndErrorClasses(prevCursor, prevErrLen);
      updateLiveMetrics();
    } else {
      // Mistyped character or typed while unfixed error exists -> push to errorBuffer
      mistakes++;
      if (errorBuffer.length < 10) {
        errorBuffer.push(ch);
      }
      updateCursorAndErrorClasses(prevCursor, prevErrLen);
      updateLiveMetrics();
    }
  }

  // Keyboard event listener on hidden input
  hiddenInput.addEventListener('keydown', (e) => {
    if (isCompleted) {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigate(`#/typing/${nextRef.bookId}/${nextRef.chapter}`);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      buildPassageDOM(verses);
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      hiddenInput.value = '';
      processBackspace(e.altKey || e.ctrlKey || e.metaKey);
      return;
    }

    // Ignore modifier shortcuts like Cmd+R, Cmd+C, etc.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key.length === 1) {
      e.preventDefault();
      hiddenInput.value = '';
      processTypedChar(e.key);
    }
  });

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
    if (isDrawerOpen || !completionBackdrop.hidden) return;
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
    if (!isCompleted && targetChars.length > 0 && !isDrawerOpen) {
      focusBanner.hidden = false;
    }
  });

  viewportWrapper.addEventListener('click', () => {
    focusTypingInput();
  });

  restartBtn.addEventListener('click', () => {
    if (verses.length > 0) {
      trackEvent('restart_bible_chapter', { bookId: book.id, chapter: initialChapter });
      buildPassageDOM(verses);
    }
  });

  // Completion modal buttons
  container.querySelector('#comp-retry-btn').addEventListener('click', () => {
    completionBackdrop.hidden = true;
    buildPassageDOM(verses);
  });

  container.querySelector('#comp-next-btn').addEventListener('click', () => {
    completionBackdrop.hidden = true;
    navigate(`#/typing/${nextRef.bookId}/${nextRef.chapter}`);
  });

  // ── 5. Fetch & Initialize Chapter Verses ───────────────────────
  async function loadAndRenderPassage() {
    cleanup();
    const trObj = getTranslationByCode(activeTranslation);
    passageContent.innerHTML = `
      <div class="typing-loading-state">
        <div class="loading-spinner"></div>
        <p>Loading ${book.name} ${initialChapter} (${trObj.shortName})...</p>
      </div>
    `;

    try {
      const loaded = await fetchChapterVerses(activeTranslation, book.id, initialChapter);
      // Guard if user navigated away while fetching
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
