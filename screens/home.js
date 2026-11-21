import {
  Auth,
  getGlobalTypingStats,
  getLocalStore,
  getPreferredTranslation,
  getActiveModePref,
  getChapterProgressSummary,
  isVerseCovered,
  markVerseAsRead,
  toggleChapterRead,
  toggleVerseRead,
  isVerseFavorited,
  toggleVerseFavorite,
  isVerseBookmarked,
  getAllBookmarks,
  createBookmark,
  updateBookmarkLocation,
  findBookmarkByName
} from '../api.js?v=20261121_v20';
import {
  getBookById,
  getNextChapterRef,
  getTranslationByCode,
  getRandomVerseRef,
  getVerseRefByIndex,
  TOTAL_BIBLE_VERSES,
  fetchChapterVerses,
  getCachedChapterVerses,
  prefetchChapterVerses
} from '../bible-data.js?v=20261121_v20';
import { generateArtBackgroundSvg } from '../meditate-art.js?v=20261121_v20';
import { trackEvent } from '../analytics.js?v=20261121_v20';
import { navigate } from '../router.js?v=20261121_v20';

export { renderLandingScreen as renderHomeScreen };

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HOME_DAILY_VERSE_KEY = 'bible_home_daily_verse_v5';
const HOME_DAILY_HISTORY_KEY = 'bible_home_daily_history_v1';

function getDayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

function getTodayDateKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isVerseCompletedForUser(bookId, chapter, verseNum) {
  const chSum = getChapterProgressSummary(bookId, chapter);
  return isVerseCovered(chSum.record, verseNum);
}

function getStoredDailyVerse() {
  try {
    const raw = localStorage.getItem(HOME_DAILY_VERSE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveStoredDailyVerse(verseObj) {
  try {
    localStorage.setItem(HOME_DAILY_VERSE_KEY, JSON.stringify(verseObj));
  } catch {}
}

function getStoredDailyHistory() {
  try {
    const raw = localStorage.getItem(HOME_DAILY_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const todayKey = getTodayDateKey();
      if (parsed && parsed.dateKey === todayKey && Array.isArray(parsed.history) && parsed.history.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function saveStoredDailyHistory(history, currentIndex = 0) {
  try {
    const payload = {
      dateKey: getTodayDateKey(),
      currentIndex: Math.max(0, Math.min(currentIndex, history.length - 1)),
      history: history.slice(0, 50) // keep reasonable bound
    };
    localStorage.setItem(HOME_DAILY_HISTORY_KEY, JSON.stringify(payload));
  } catch {}
}

/**
 * Purely random Bible verse selection across the entire canon (no curated pools).
 */
export function pickRandomBibleVerse(excludeRef = null) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const ref = getRandomVerseRef(excludeRef);
    if (!excludeRef || ref.bookId !== excludeRef.bookId || ref.chapter !== excludeRef.chapter || ref.verse !== excludeRef.verse) {
      const book = getBookById(ref.bookId);
      return {
        bookId: ref.bookId,
        bookName: book ? book.name : `Book ${ref.bookId}`,
        chapter: ref.chapter,
        verse: ref.verse,
        text: '',
        theme: ''
      };
    }
  }
  const fallbackRef = getRandomVerseRef();
  const fallbackBook = getBookById(fallbackRef.bookId);
  return {
    bookId: fallbackRef.bookId,
    bookName: fallbackBook ? fallbackBook.name : `Book ${fallbackRef.bookId}`,
    chapter: fallbackRef.chapter,
    verse: fallbackRef.verse,
    text: '',
    theme: ''
  };
}

export function getSyncDailyVerse(activeTranslation = 'ESV') {
  const todayKey = getTodayDateKey();
  const dayNum = getDayNumber();
  const stored = getStoredDailyVerse();

  const isCurrentCompleted = stored && isVerseCompletedForUser(stored.bookId, stored.chapter, stored.verse);
  const isExpired = !stored || stored.dayNum !== dayNum || stored.dateKey !== todayKey;

  if (stored && !isExpired && !isCurrentCompleted) {
    return stored;
  }

  const fresh = pickRandomBibleVerse(stored ? { bookId: stored.bookId, chapter: stored.chapter, verse: stored.verse } : null);
  const result = {
    ...fresh,
    dayNum,
    dateKey: todayKey,
    translation: activeTranslation
  };
  saveStoredDailyVerse(result);
  return result;
}

export async function resolveDailyVerse(activeTranslation = 'ESV', forceNew = false) {
  const todayKey = getTodayDateKey();
  const dayNum = getDayNumber();
  let stored = getStoredDailyVerse();

  const isCurrentCompleted = stored && isVerseCompletedForUser(stored.bookId, stored.chapter, stored.verse);
  const isExpired = !stored || stored.dayNum !== dayNum || stored.dateKey !== todayKey;

  let selected = stored;

  if (forceNew || isExpired || isCurrentCompleted) {
    const fresh = pickRandomBibleVerse(stored ? { bookId: stored.bookId, chapter: stored.chapter, verse: stored.verse } : null);
    selected = {
      ...fresh,
      dayNum,
      dateKey: todayKey,
      translation: activeTranslation
    };
    saveStoredDailyVerse(selected);
  }

  // Fetch or retrieve actual text for the user's active translation
  try {
    const cached = getCachedChapterVerses(activeTranslation, selected.bookId, selected.chapter);
    if (cached && cached.length > 0) {
      const match = cached.find(v => Number(v.verse) === Number(selected.verse));
      if (match && match.text) {
        selected.text = match.text;
      }
    } else {
      const loaded = await fetchChapterVerses(activeTranslation, selected.bookId, selected.chapter);
      if (loaded && loaded.length > 0) {
        const match = loaded.find(v => Number(v.verse) === Number(selected.verse));
        if (match && match.text) {
          selected.text = match.text;
        }
      }
    }
  } catch (e) {
    // Keep fallback text if network unavailable
  }

  saveStoredDailyVerse(selected);
  return selected;
}

export async function populateVerseText(verseObj, activeTranslation = 'ESV') {
  if (!verseObj) return verseObj;
  try {
    const cached = getCachedChapterVerses(activeTranslation, verseObj.bookId, verseObj.chapter);
    if (cached && cached.length > 0) {
      const match = cached.find(v => Number(v.verse) === Number(verseObj.verse));
      if (match && match.text) {
        verseObj.text = match.text;
        return verseObj;
      }
    }
    const loaded = await fetchChapterVerses(activeTranslation, verseObj.bookId, verseObj.chapter);
    if (loaded && loaded.length > 0) {
      const match = loaded.find(v => Number(v.verse) === Number(verseObj.verse));
      if (match && match.text) {
        verseObj.text = match.text;
      }
    }
  } catch (e) {}
  return verseObj;
}

export function renderLandingScreen(container) {
  const mountTime = Date.now();
  const activeTranslation = getPreferredTranslation() || 'ESV';

  // Synchronously resolve initial random daily verse and restore today's history stack if present
  let initialVerse = getSyncDailyVerse(activeTranslation);
  const storedHistoryData = getStoredDailyHistory();

  let verseHistory = [initialVerse];
  let historyIndex = 0;

  if (storedHistoryData && storedHistoryData.history.length > 0) {
    verseHistory = storedHistoryData.history;
    historyIndex = Math.min(storedHistoryData.currentIndex || 0, verseHistory.length - 1);
  } else {
    saveStoredDailyHistory(verseHistory, historyIndex);
  }

  let isTransitioning = false;
  const getActiveVerse = () => verseHistory[historyIndex];

  function persistCurrentState() {
    const cur = verseHistory[historyIndex];
    if (cur) {
      saveStoredDailyVerse(cur);
      saveStoredDailyHistory(verseHistory, historyIndex);
    }
  }

  // Ensure a queue of upcoming random verses is always preloaded and ready instantly
  function ensurePreloadedVerses() {
    const needed = Math.max(0, (historyIndex + 3) - verseHistory.length);
    for (let i = 0; i < needed; i++) {
      const prevRef = verseHistory[verseHistory.length - 1];
      const newVerse = pickRandomBibleVerse(prevRef ? { bookId: prevRef.bookId, chapter: prevRef.chapter, verse: prevRef.verse } : null);
      newVerse.dayNum = getDayNumber();
      newVerse.dateKey = getTodayDateKey();
      newVerse.translation = activeTranslation;
      verseHistory.push(newVerse);
      if (newVerse.bookId && newVerse.chapter) {
        prefetchChapterVerses(activeTranslation, newVerse.bookId, newVerse.chapter);
      }
      populateVerseText(newVerse, activeTranslation).then(() => {
        // If current card is viewing this verse, update text
        if (verseHistory[historyIndex] === newVerse) {
          const quoteEl = container.querySelector('.votd-quote');
          if (quoteEl && newVerse.text) {
            quoteEl.textContent = `“${newVerse.text}”`;
          }
        }
        persistCurrentState();
      });
    }
  }
  ensurePreloadedVerses();

  // Background check to verify translation text & prefetch for current verse
  const curAtInit = getActiveVerse();
  if (curAtInit && curAtInit.bookId && curAtInit.chapter) {
    prefetchChapterVerses(activeTranslation, curAtInit.bookId, curAtInit.chapter);
  }
  if (curAtInit && !curAtInit.text) {
    populateVerseText(curAtInit, activeTranslation).then(() => {
      if (getActiveVerse() === curAtInit) {
        const quoteEl = container.querySelector('.votd-quote');
        if (quoteEl && curAtInit.text) {
          quoteEl.textContent = `“${curAtInit.text}”`;
        }
      }
      persistCurrentState();
    });
  }

  resolveDailyVerse(activeTranslation).then(verified => {
    if (verified && verified.bookId && verified.chapter) {
      prefetchChapterVerses(activeTranslation, verified.bookId, verified.chapter);
    }
    if (verified && historyIndex === 0 && (!verseHistory[0] || verseHistory[0].verse !== verified.verse || verseHistory[0].bookId !== verified.bookId)) {
      verseHistory[0] = verified;
      renderCard();
      persistCurrentState();
    }
    ensurePreloadedVerses();
  }).catch(() => {});

  async function navigateVerse(direction, animated = true) {
    if (isTransitioning) return;

    if (direction === 'prev') {
      if (historyIndex <= 0) return;
      isTransitioning = true;
      const cardEl = container.querySelector('#votd-card');
      if (cardEl && animated) {
        cardEl.classList.remove('is-dragging', 'is-snapping-back');
        cardEl.classList.add('swipe-dismiss-right');
      }
      const delay = animated ? 90 : 0;
      setTimeout(() => {
        historyIndex--;
        persistCurrentState();
        const cur = verseHistory[historyIndex];
        if (cur && cur.bookId && cur.chapter) {
          prefetchChapterVerses(activeTranslation, cur.bookId, cur.chapter);
        }
        renderCard('swipe-incoming-right');
        isTransitioning = false;
        if (!cur.text) {
          populateVerseText(cur, activeTranslation).then(() => {
            if (historyIndex < verseHistory.length && verseHistory[historyIndex] === cur) {
              const quoteEl = container.querySelector('.votd-quote');
              if (quoteEl && cur.text) {
                quoteEl.textContent = `“${cur.text}”`;
              }
              persistCurrentState();
            }
          });
        }
      }, delay);
    } else if (direction === 'next') {
      // Auto-mark departing verse as read only on forward ('next') swipe / carousel navigation
      const departingVerse = getActiveVerse();
      if (departingVerse && departingVerse.bookId && departingVerse.chapter && departingVerse.verse) {
        markVerseAsRead(departingVerse.bookId, departingVerse.chapter, departingVerse.verse, activeTranslation);
        trackEvent('votd_swipe_auto_mark_read', { verse: `${departingVerse.bookName} ${departingVerse.chapter}:${departingVerse.verse}`, direction });
      }

      isTransitioning = true;
      const cardEl = container.querySelector('#votd-card');
      if (cardEl && animated) {
        cardEl.classList.remove('is-dragging', 'is-snapping-back');
        cardEl.classList.add('swipe-dismiss-left');
      }
      const delay = animated ? 90 : 0;
      setTimeout(() => {
        historyIndex++;
        if (historyIndex >= verseHistory.length) {
          const prevRef = verseHistory[historyIndex - 1];
          const newRandom = pickRandomBibleVerse(prevRef ? { bookId: prevRef.bookId, chapter: prevRef.chapter, verse: prevRef.verse } : null);
          newRandom.dayNum = getDayNumber();
          newRandom.dateKey = getTodayDateKey();
          newRandom.translation = activeTranslation;
          verseHistory.push(newRandom);
        }

        persistCurrentState();
        const cur = verseHistory[historyIndex];
        if (cur && cur.bookId && cur.chapter) {
          prefetchChapterVerses(activeTranslation, cur.bookId, cur.chapter);
        }
        renderCard('swipe-incoming-left');
        isTransitioning = false;
        ensurePreloadedVerses();

        if (!cur.text) {
          populateVerseText(cur, activeTranslation).then(() => {
            if (historyIndex < verseHistory.length && verseHistory[historyIndex] === cur) {
              const quoteEl = container.querySelector('.votd-quote');
              if (quoteEl && cur.text) {
                quoteEl.textContent = `“${cur.text}”`;
              }
              persistCurrentState();
            }
          });
        }
      }, delay);
    }
  }

  function navigateToPracticeScreen(verse) {
    if (!verse || !verse.bookId || !verse.chapter || !verse.verse) return;
    const mode = getActiveModePref() || 'type';
    if (verse.text) {
      try {
        sessionStorage.setItem(`bible_single_verse_${verse.bookId}_${verse.chapter}_${verse.verse}`, verse.text);
      } catch (e) {}
    }
    trackEvent('votd_card_click', { ref: `${verse.bookName} ${verse.chapter}:${verse.verse}`, mode });
    navigate(`/${mode}/${verse.bookId}/${verse.chapter}/${verse.verse}`);
  }

  function renderCard(animClass = '') {
    // Clean up previous window / document listeners
    if (window.__bibleHomeCleanup) {
      window.__bibleHomeCleanup();
      window.__bibleHomeCleanup = null;
    }

    const currentVerse = getActiveVerse();
    if (currentVerse && currentVerse.bookId && currentVerse.chapter) {
      prefetchChapterVerses(activeTranslation, currentVerse.bookId, currentVerse.chapter);
    }
    const isCompleted = isVerseCompletedForUser(currentVerse.bookId, currentVerse.chapter, currentVerse.verse);
    const activeMode = getActiveModePref() || 'type';
    const isFav = isVerseFavorited(currentVerse.bookId, currentVerse.chapter, currentVerse.verse);
    const isBookmarked = isVerseBookmarked(currentVerse.bookId, currentVerse.chapter, currentVerse.verse);

    // Deterministic template index for background artwork based on verse reference
    const templateIdx = ((Number(currentVerse.bookId) * 31 + Number(currentVerse.chapter) * 7 + Number(currentVerse.verse)) % 1000 + 1000) % 1000;
    const bgSvg = generateArtBackgroundSvg(templateIdx);

    container.innerHTML = `
      <div class="hero-wrapper">
        <div class="hero-badge">
          <span>✨</span>
          <span>66 Books · 1,189 Chapters · 31,103 Verses</span>
        </div>

        <h1 class="hero-title">Promises to Creation</h1>
        <p class="hero-subtitle">
          Bible typing, speaking &amp; drawing practice with Scripture tracking
        </p>

        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" id="home-start-btn">
            <span>Explore Promises</span>
            <span style="font-size: 1.15rem;">→</span>
          </button>
        </div>

        <!-- Daily Verse Carousel Layout: Chevrons flanking the Card on Desktop -->
        <div class="votd-carousel-layout">
          <button
            type="button"
            class="votd-carousel-btn votd-carousel-prev"
            id="votd-carousel-prev-btn"
            aria-label="Previous verse"
            title="Previous verse"
            ${historyIndex <= 0 ? 'disabled' : ''}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div class="votd-card-wrapper">
            <div class="votd-card ${animClass}" id="votd-card" role="button" tabindex="0" title="Click to open ${escapeHtml(currentVerse.bookName)} ${currentVerse.chapter}:${currentVerse.verse}">
              <!-- Background Artwork Layer (Universal on Mobile & Desktop) -->
              <div class="votd-bg-art" aria-hidden="true">${bgSvg}</div>
              <div class="votd-card-content">
                <div class="votd-top-row">
                  <div class="votd-ref-header">
                    <strong class="votd-ref-title">${escapeHtml(currentVerse.bookName)} ${currentVerse.chapter}:${currentVerse.verse}</strong>
                    <span class="votd-ref-sub">${escapeHtml(activeTranslation)}</span>
                    ${currentVerse.theme ? `<span class="votd-tag">${escapeHtml(currentVerse.theme)}</span>` : ''}
                  </div>
                  <div class="votd-action-hint" id="votd-open-verse-btn" role="button" tabindex="0" title="Open verse in ${activeMode} mode" aria-label="Open verse">
                    <span class="votd-open-text">Open verse →</span>
                    <span class="votd-open-arrow">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </span>
                  </div>
                </div>

                <div class="votd-quote">
                  “${escapeHtml(currentVerse.text || 'Loading verse text...')}”
                </div>

                <!-- Universal 4-Action Bar: Fav, Bookmark, Share, 3-Dots Menu -->
                <div class="votd-mobile-actions-wrapper" data-stop-card-nav="true">
                  <div class="votd-mobile-actions">
                    <!-- 1. Favourite (Heart Outline) -->
                    <button
                      type="button"
                      class="votd-mobile-action-btn votd-fav-btn ${isFav ? 'is-favorited' : ''}"
                      id="votd-mobile-fav-btn"
                      title="${isFav ? 'Remove from favorites' : 'Save to favorites'}"
                      aria-label="${isFav ? 'Remove from favorites' : 'Save to favorites'}"
                    >
                      <svg class="votd-heart-icon" width="22" height="22" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    </button>

                    <!-- 2. Bookmark (Ribbon Outline) -->
                    <button
                      type="button"
                      class="votd-mobile-action-btn votd-bookmark-btn ${isBookmarked ? 'is-bookmarked' : ''}"
                      id="votd-mobile-bookmark-btn"
                      title="${isBookmarked ? 'Bookmark saved' : 'Add bookmark'}"
                      aria-label="${isBookmarked ? 'Bookmark saved' : 'Add bookmark'}"
                    >
                      <svg class="votd-bookmark-icon" width="21" height="21" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                      </svg>
                    </button>

                    <!-- 3. Share (Tray Outline) -->
                    <button
                      type="button"
                      class="votd-mobile-action-btn votd-share-btn"
                      id="votd-mobile-share-btn"
                      title="Share verse card"
                      aria-label="Share verse card"
                    >
                      <svg class="votd-share-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                      </svg>
                    </button>

                    <!-- 4. Ellipses (Three Horizontal Dots) -->
                    <div class="votd-dots-wrapper">
                      <button
                        type="button"
                        class="votd-mobile-action-btn votd-dots-btn"
                        id="votd-mobile-dots-btn"
                        aria-label="More actions"
                        title="More actions"
                        aria-haspopup="true"
                        aria-expanded="false"
                      >
                        <svg class="votd-dots-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="1.25" fill="currentColor"/>
                          <circle cx="19" cy="12" r="1.25" fill="currentColor"/>
                          <circle cx="5" cy="12" r="1.25" fill="currentColor"/>
                        </svg>
                      </button>
                      <!-- Three Horizontal Dots Dropdown Popover -->
                      <div class="votd-dots-menu" id="votd-dots-menu" hidden>
                        <button
                          type="button"
                          class="votd-dots-item ${isCompleted ? 'is-read' : ''}"
                          id="votd-mobile-mark-btn"
                        >
                          <span class="dots-item-icon">${isCompleted ? '✓' : '📖'}</span>
                          <span>${isCompleted ? 'Marked Read' : 'Mark Verse Read'}</span>
                        </button>
                        <a
                          href="/${activeMode}/${currentVerse.bookId}/${currentVerse.chapter}"
                          class="votd-dots-item"
                          id="votd-mobile-chapter-btn"
                        >
                          <span class="dots-item-icon">📜</span>
                          <span>Open Whole Ch.</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            class="votd-carousel-btn votd-carousel-next"
            id="votd-carousel-next-btn"
            aria-label="Next verse"
            title="Next verse"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        <!-- Bookmark Modal Backdrop -->
        <div class="typing-options-backdrop votd-bookmark-backdrop" id="votd-bookmark-backdrop" hidden>
          <div class="typing-options-card typing-bookmark-card" role="dialog" aria-modal="true" aria-labelledby="votd-bookmark-modal-title">
            <div class="typing-options-header">
              <div>
                <h2 class="typing-options-title" id="votd-bookmark-modal-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>Bookmark Verse
                </h2>
                <p class="bookmark-modal-subtitle" id="votd-bookmark-modal-subtitle">
                  ${escapeHtml(currentVerse.bookName)} ${currentVerse.chapter}:${currentVerse.verse} (${escapeHtml(activeTranslation)})
                </p>
              </div>
              <button type="button" class="options-close-btn" id="votd-bookmark-close-btn" aria-label="Close bookmarks">✕</button>
            </div>

            <div class="typing-options-body">
              <div class="bookmark-input-group">
                <input
                  type="text"
                  id="votd-bookmark-search-input"
                  class="bookmark-name-input"
                  placeholder="Search or enter bookmark name..."
                  autocomplete="off"
                  maxlength="60"
                />
                <button type="button" class="btn btn-primary btn-sm" id="votd-bookmark-save-btn">
                  Save
                </button>
              </div>
              <div class="bookmark-feedback-msg" id="votd-bookmark-feedback-msg" hidden></div>

              <div class="bookmark-recent-section">
                <div class="bookmark-section-header">
                  <span class="bookmark-section-title">Recent Bookmarks</span>
                  <a href="/bookmarks" class="bookmark-view-all-link">Manage All & History ›</a>
                </div>
                <div class="bookmark-recent-list" id="votd-bookmark-recent-list"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Hidden canvas for generating clean uncurved card share image -->
        <canvas id="votd-share-canvas" width="1200" height="900" style="display:none;"></canvas>
      </div>
    `;

    const votdCard = container.querySelector('#votd-card');
    let onMouseMove = null;
    let onMouseUp = null;
    if (votdCard) {
      let isCardDragging = false;
      let dragDetermined = false;
      let isHorizontalDrag = false;
      let hasSwiped = false;
      let justNavigatedOnTouch = false;
      let startX = 0;
      let startY = 0;
      let currentDeltaX = 0;
      let startTime = 0;

      // Mouse dragging state for desktop
      let isMouseDown = false;
      let mouseStartX = 0;
      let mouseDeltaX = 0;
      let mouseStartTime = 0;
      let hasMouseDragged = false;

      function resetCardPosition(animate = true) {
        if (animate) {
          votdCard.classList.remove('is-dragging');
          votdCard.classList.add('is-snapping-back');
          votdCard.style.transform = '';
          votdCard.style.opacity = '';
          setTimeout(() => {
            if (votdCard) {
              votdCard.classList.remove('is-snapping-back');
            }
          }, 280);
        } else {
          votdCard.classList.remove('is-dragging', 'is-snapping-back');
          votdCard.style.transform = '';
          votdCard.style.opacity = '';
        }
      }

      let touchBeganOnThisCard = false;

      // ── Touch Events (Mobile) ──
      votdCard.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || isTransitioning) return;
        const touch = e.touches[0];
        // Allow native edge-swipe back navigation in mobile browsers without card interference
        if (touch.clientX < 45) return;

        startX = touch.clientX;
        startY = touch.clientY;
        currentDeltaX = 0;
        startTime = Date.now();
        touchBeganOnThisCard = true;
        isCardDragging = true;
        dragDetermined = false;
        isHorizontalDrag = false;
        hasSwiped = false;
        votdCard.classList.remove('swipe-incoming-left', 'swipe-incoming-right', 'is-snapping-back');
      }, { passive: true });

      votdCard.addEventListener('touchmove', (e) => {
        if (!isCardDragging || e.touches.length !== 1 || isTransitioning) return;
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        // Determine axis intent once finger moves beyond 8px threshold
        if (!dragDetermined) {
          if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
            dragDetermined = true;
            isHorizontalDrag = Math.abs(diffX) >= Math.abs(diffY) * 1.15;
            if (isHorizontalDrag) {
              votdCard.classList.add('is-dragging');
            }
          }
        }

        if (isHorizontalDrag) {
          let effectiveDeltaX = diffX;
          if (diffX > 0 && historyIndex === 0) {
            effectiveDeltaX = Math.sign(diffX) * Math.pow(Math.abs(diffX), 0.72) * 2.2;
          }

          currentDeltaX = effectiveDeltaX;
          const rotationDeg = (effectiveDeltaX / window.innerWidth) * 12;
          const opacityVal = Math.max(0.35, 1 - (Math.abs(effectiveDeltaX) / (window.innerWidth * 1.15)));

          votdCard.style.transform = `translate3d(${effectiveDeltaX}px, 0, 0) rotate(${rotationDeg}deg)`;
          votdCard.style.opacity = opacityVal;

          if (Math.abs(effectiveDeltaX) > 15) {
            hasSwiped = true;
          }
        }
      }, { passive: true });

      const finishDrag = (e) => {
        if (!isCardDragging || !touchBeganOnThisCard) return;
        isCardDragging = false;
        const wasTouchOnCard = touchBeganOnThisCard;
        touchBeganOnThisCard = false;

        // Discard any gesture within 500ms of mounting or 600ms of popstate back navigation
        if (Date.now() - mountTime < 500 || Date.now() - (window.__bibleLastPopstateTime || 0) < 600) {
          resetCardPosition(false);
          return;
        }

        if (!isHorizontalDrag) {
          resetCardPosition(false);
          const elapsed = Date.now() - startTime;
          const touchEndTarget = e.target;
          if (!hasSwiped && elapsed < 350 && Math.abs(currentDeltaX) < 12 && wasTouchOnCard) {
            if (touchEndTarget && !touchEndTarget.closest('[data-stop-card-nav="true"]') && !touchEndTarget.closest('a')) {
              justNavigatedOnTouch = true;
              setTimeout(() => { justNavigatedOnTouch = false; }, 800);
              navigateToPracticeScreen(currentVerse);
              return;
            }
          }
          return;
        }

        const elapsed = Math.max(1, Date.now() - startTime);
        const velocity = Math.abs(currentDeltaX) / elapsed; // px per ms
        const cardWidth = votdCard.offsetWidth || 340;
        const threshold = cardWidth * 0.28;

        const isFlick = velocity > 0.48 && Math.abs(currentDeltaX) > 35;
        const isPastThreshold = Math.abs(currentDeltaX) >= threshold;

        if (isFlick || isPastThreshold) {
          if (currentDeltaX < 0) {
            trackEvent('votd_swipe_next', { from: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}` });
            navigateVerse('next', true);
          } else {
            if (historyIndex > 0) {
              trackEvent('votd_swipe_prev', { from: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}` });
              navigateVerse('prev', true);
            } else {
              resetCardPosition(true);
            }
          }
        } else {
          resetCardPosition(true);
        }
      };

      votdCard.addEventListener('touchend', finishDrag, { passive: true });
      votdCard.addEventListener('touchcancel', () => {
        isCardDragging = false;
        touchBeganOnThisCard = false;
        resetCardPosition(true);
      }, { passive: true });

      // ── Mouse Drag Events (Desktop) ──
      votdCard.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || isTransitioning) return;
        if (e.target.closest('[data-stop-card-nav="true"]') || e.target.closest('a') || e.target.closest('button')) return;
        isMouseDown = true;
        hasMouseDragged = false;
        mouseStartX = e.clientX;
        mouseDeltaX = 0;
        mouseStartTime = Date.now();
        votdCard.classList.remove('swipe-incoming-left', 'swipe-incoming-right', 'is-snapping-back');
      });

      onMouseMove = (e) => {
        if (!isMouseDown) return;
        const diffX = e.clientX - mouseStartX;
        if (!hasMouseDragged && Math.abs(diffX) > 8) {
          hasMouseDragged = true;
          votdCard.classList.add('is-dragging');
        }
        if (hasMouseDragged) {
          let effectiveDeltaX = diffX;
          if (diffX > 0 && historyIndex === 0) {
            effectiveDeltaX = Math.sign(diffX) * Math.pow(Math.abs(diffX), 0.72) * 2.2;
          }
          mouseDeltaX = effectiveDeltaX;
          const rotationDeg = (effectiveDeltaX / window.innerWidth) * 10;
          const opacityVal = Math.max(0.4, 1 - (Math.abs(effectiveDeltaX) / (window.innerWidth * 1.2)));
          votdCard.style.transform = `translate3d(${effectiveDeltaX}px, 0, 0) rotate(${rotationDeg}deg)`;
          votdCard.style.opacity = opacityVal;
        }
      };

      onMouseUp = (e) => {
        if (!isMouseDown) return;
        isMouseDown = false;
        if (!hasMouseDragged) {
          resetCardPosition(false);
          return;
        }
        const elapsed = Math.max(1, Date.now() - mouseStartTime);
        const velocity = Math.abs(mouseDeltaX) / elapsed;
        const cardWidth = votdCard.offsetWidth || 340;
        const threshold = cardWidth * 0.28;
        const isFlick = velocity > 0.45 && Math.abs(mouseDeltaX) > 35;
        const isPastThreshold = Math.abs(mouseDeltaX) >= threshold;

        if (isFlick || isPastThreshold) {
          if (mouseDeltaX < 0) {
            trackEvent('votd_swipe_next', { from: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`, input: 'mouse' });
            navigateVerse('next', true);
          } else {
            if (historyIndex > 0) {
              trackEvent('votd_swipe_prev', { from: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`, input: 'mouse' });
              navigateVerse('prev', true);
            } else {
              resetCardPosition(true);
            }
          }
        } else {
          resetCardPosition(true);
        }
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      // Card tap / click handler with 0ms delay
      votdCard.addEventListener('click', (e) => {
        // Discard phantom clicks from browser back navigation or immediately after page mount
        if (Date.now() - mountTime < 500 || Date.now() - (window.__bibleLastPopstateTime || 0) < 600) {
          return;
        }
        if (justNavigatedOnTouch) {
          justNavigatedOnTouch = false;
          return;
        }
        if (hasSwiped || hasMouseDragged) {
          hasSwiped = false;
          hasMouseDragged = false;
          return;
        }
        if (e.target.closest('[data-stop-card-nav="true"]') || e.target.closest('a')) return;
        navigateToPracticeScreen(currentVerse);
      });

      votdCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === votdCard) {
          navigateToPracticeScreen(currentVerse);
        }
      });

      const openVerseHint = container.querySelector('#votd-open-verse-btn');
      if (openVerseHint) {
        openVerseHint.addEventListener('click', (e) => {
          if (Date.now() - mountTime < 500 || Date.now() - (window.__bibleLastPopstateTime || 0) < 600) return;
          e.stopPropagation();
          navigateToPracticeScreen(currentVerse);
        });
      }
    }

    // ── Desktop Carousel Chevrons ──
    const prevBtn = container.querySelector('#votd-carousel-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (historyIndex > 0) {
          navigateVerse('prev', true);
        }
      });
    }

    const nextBtn = container.querySelector('#votd-carousel-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateVerse('next', true);
      });
    }

    // ── Keyboard Arrow Navigation ──
    const onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
      const backdrop = container.querySelector('#votd-bookmark-backdrop');
      if (backdrop && !backdrop.hidden) return;

      if (e.key === 'ArrowLeft') {
        if (historyIndex > 0) {
          navigateVerse('prev', true);
        }
      } else if (e.key === 'ArrowRight') {
        navigateVerse('next', true);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const startBtn = container.querySelector('#home-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        trackEvent('home_start_click', { authenticated: Auth.isAuthenticated() });
        navigate('/promises');
      });
    }

    // ── Three-Dots Popover Menu ──
    const dotsBtn = container.querySelector('#votd-mobile-dots-btn');
    const dotsMenu = container.querySelector('#votd-dots-menu');
    let onDocClick = null;
    if (dotsBtn && dotsMenu) {
      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dotsMenu.hidden;
        dotsMenu.hidden = isOpen;
        dotsBtn.setAttribute('aria-expanded', String(!isOpen));
      });

      onDocClick = (e) => {
        if (!dotsBtn.contains(e.target) && !dotsMenu.contains(e.target)) {
          dotsMenu.hidden = true;
          dotsBtn.setAttribute('aria-expanded', 'false');
        }
      };
      document.addEventListener('click', onDocClick);
    }

    // Register cleanup for this render pass
    window.__bibleHomeCleanup = () => {
      if (onMouseMove) window.removeEventListener('mousemove', onMouseMove);
      if (onMouseUp) window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      if (onDocClick) {
        document.removeEventListener('click', onDocClick);
      }
    };

    // Mark Read in Popover
    const mobileMarkBtn = container.querySelector('#votd-mobile-mark-btn');
    if (mobileMarkBtn) {
      mobileMarkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (dotsMenu) dotsMenu.hidden = true;
        markVerseAsRead(currentVerse.bookId, currentVerse.chapter, currentVerse.verse, activeTranslation);
        trackEvent('votd_mark_verse_read', { verse: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`, source: 'mobile_dots' });

        mobileMarkBtn.disabled = true;
        mobileMarkBtn.innerHTML = `<span class="dots-item-icon">✓</span><span>Marked Read!</span>`;

        setTimeout(async () => {
          const fresh = await resolveDailyVerse(activeTranslation, true);
          await populateVerseText(fresh, activeTranslation);
          verseHistory.push(fresh);
          historyIndex = verseHistory.length - 1;
          persistCurrentState();
          renderCard('swipe-incoming-left');
        }, 320);
      });
    }

    // Open Whole Chapter in Popover
    const mobileChBtn = container.querySelector('#votd-mobile-chapter-btn');
    if (mobileChBtn) {
      mobileChBtn.addEventListener('click', () => {
        if (dotsMenu) dotsMenu.hidden = true;
        trackEvent('votd_type_chapter_click', { bookId: currentVerse.bookId, chapter: currentVerse.chapter, source: 'mobile_dots' });
      });
    }

    // ── Mobile Favourite Action ──
    const mobileFavBtn = container.querySelector('#votd-mobile-fav-btn');
    if (mobileFavBtn) {
      mobileFavBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowFav = toggleVerseFavorite({
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          verseRef: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`,
          verseText: currentVerse.text,
          translation: activeTranslation
        });
        mobileFavBtn.classList.toggle('is-favorited', nowFav);
        mobileFavBtn.title = nowFav ? 'Remove from favorites' : 'Save to favorites';
        mobileFavBtn.setAttribute('aria-label', mobileFavBtn.title);
        trackEvent('toggle_verse_favorite', {
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          isFavorited: nowFav,
          mode: 'home_votd'
        });
      });
    }

    // ── Mobile Bookmark Action & Modal ──
    const mobileBookmarkBtn = container.querySelector('#votd-mobile-bookmark-btn');
    const bookmarkBackdrop = container.querySelector('#votd-bookmark-backdrop');
    const bookmarkCloseBtn = container.querySelector('#votd-bookmark-close-btn');
    const bookmarkSearchInput = container.querySelector('#votd-bookmark-search-input');
    const bookmarkSaveBtn = container.querySelector('#votd-bookmark-save-btn');
    const bookmarkFeedbackMsg = container.querySelector('#votd-bookmark-feedback-msg');
    const bookmarkRecentList = container.querySelector('#votd-bookmark-recent-list');

    function renderRecentBookmarks(filterText = '') {
      if (!bookmarkRecentList) return;
      const all = getAllBookmarks();
      const cleanFilter = filterText.trim().toLowerCase();
      let items = cleanFilter ? all.filter(b => (b.name || '').toLowerCase().includes(cleanFilter)).slice(0, 5) : all.slice(0, 5);

      if (items.length === 0) {
        bookmarkRecentList.innerHTML = `
          <div class="bookmark-empty-hint">
            ${cleanFilter ? `No match for "<strong>${escapeHtml(filterText)}</strong>". Click Save to create it!` : 'No bookmarks yet. Enter a name above to create one!'}
          </div>
        `;
        return;
      }

      bookmarkRecentList.innerHTML = items.map(bm => `
        <div class="bookmark-recent-item" data-id="${escapeHtml(bm.id)}" style="cursor:pointer;">
          <div class="bookmark-item-main">
            <span class="bookmark-item-name">${escapeHtml(bm.name)}</span>
            <span class="bookmark-item-ref">${escapeHtml(bm.verseRef || `${bm.bookId}:${bm.chapter}:${bm.verse || 1}`)}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-xs bookmark-update-here-btn" data-update-id="${escapeHtml(bm.id)}" title="Update to this verse">Update</button>
        </div>
      `).join('');

      bookmarkRecentList.querySelectorAll('.bookmark-update-here-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.getAttribute('data-update-id');
          updateBookmarkLocation(id, {
            bookId: currentVerse.bookId,
            chapter: currentVerse.chapter,
            verse: currentVerse.verse,
            verseRef: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`,
            verseText: currentVerse.text,
            translation: activeTranslation
          });
          if (bookmarkFeedbackMsg) {
            bookmarkFeedbackMsg.textContent = '✓ Updated bookmark location to today\'s verse!';
            bookmarkFeedbackMsg.hidden = false;
          }
          if (mobileBookmarkBtn) {
            mobileBookmarkBtn.classList.add('is-bookmarked');
          }
          renderRecentBookmarks(bookmarkSearchInput ? bookmarkSearchInput.value : '');
        });
      });
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

    function handleSaveBookmark() {
      if (!bookmarkSearchInput) return;
      const name = bookmarkSearchInput.value.trim();
      if (!name) {
        showBookmarkFeedback('Please enter a bookmark name.', true);
        bookmarkSearchInput.focus();
        return;
      }
      const vRef = `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`;
      const existing = findBookmarkByName(name);
      if (existing) {
        updateBookmarkLocation(existing.id, {
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          verseRef: vRef,
          verseText: currentVerse.text,
          translation: activeTranslation
        });
        showBookmarkFeedback(`✓ Updated existing bookmark "${existing.name}" to ${vRef}`);
      } else {
        createBookmark({
          name,
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          verseRef: vRef,
          verseText: currentVerse.text,
          translation: activeTranslation
        });
        showBookmarkFeedback(`✓ Created new bookmark "${name}" at ${vRef}`);
      }
      if (mobileBookmarkBtn) {
        mobileBookmarkBtn.classList.add('is-bookmarked');
      }
      renderRecentBookmarks(bookmarkSearchInput.value);
    }

    if (mobileBookmarkBtn) {
      mobileBookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (bookmarkBackdrop) {
          if (bookmarkSearchInput) bookmarkSearchInput.value = '';
          if (bookmarkFeedbackMsg) bookmarkFeedbackMsg.hidden = true;
          renderRecentBookmarks('');
          bookmarkBackdrop.hidden = false;
          setTimeout(() => {
            if (bookmarkSearchInput) bookmarkSearchInput.focus();
          }, 60);
        }
      });
    }

    if (bookmarkCloseBtn) {
      bookmarkCloseBtn.addEventListener('click', () => {
        if (bookmarkBackdrop) bookmarkBackdrop.hidden = true;
      });
    }
    if (bookmarkBackdrop) {
      bookmarkBackdrop.addEventListener('click', (e) => {
        if (e.target === bookmarkBackdrop) bookmarkBackdrop.hidden = true;
      });
    }
    if (bookmarkSaveBtn) {
      bookmarkSaveBtn.addEventListener('click', handleSaveBookmark);
    }
    if (bookmarkSearchInput) {
      bookmarkSearchInput.addEventListener('input', (e) => {
        renderRecentBookmarks(e.target.value);
      });
      bookmarkSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSaveBookmark();
        } else if (e.key === 'Escape') {
          if (bookmarkBackdrop) bookmarkBackdrop.hidden = true;
        }
      });
    }

    // ── Mobile Share Action (iOS Share Tray + Clean Image Card Generation) ──
    const mobileShareBtn = container.querySelector('#votd-mobile-share-btn');
    if (mobileShareBtn) {
      mobileShareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const shareTitle = `Promises — ${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`;
        const shareText = `“${currentVerse.text}” — ${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse} (${activeTranslation})`;
        const shareUrl = `${window.location.origin}/${activeMode}/${currentVerse.bookId}/${currentVerse.chapter}/${currentVerse.verse}`;

        // Attempt generating clean uncurved card image poster
        let imageFile = null;
        try {
          const canvas = container.querySelector('#votd-share-canvas');
          if (canvas) {
            const ctx = canvas.getContext('2d');
            const W = 1200;
            const H = 900;
            canvas.width = W;
            canvas.height = H;

            // 1. Draw Clean Flat Base Background
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, W, H);

            // 2. Render SVG background artwork to canvas full-bleed across entire card
            const blobSvg = new Blob([bgSvg], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(blobSvg);
            const img = new Image();
            await new Promise((resolve) => {
              img.onload = () => {
                // Same subtle opacity as the mobile VOTD card art layer
                ctx.globalAlpha = 0.28;
                ctx.drawImage(img, 0, 0, W, H);
                ctx.globalAlpha = 1.0;
                URL.revokeObjectURL(svgUrl);
                resolve();
              };
              img.onerror = () => {
                URL.revokeObjectURL(svgUrl);
                resolve();
              };
              img.src = svgUrl;
            });

            // 3. Header: Reference and Translation (Clean, modern matching the card header)
            const padX = 110;
            const topY = 130;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            // Reference title (e.g. John 3:16)
            ctx.fillStyle = '#0f172a';
            ctx.font = '700 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            const refTitle = `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`;
            ctx.fillText(refTitle, padX, topY);

            // Translation badge / subtitle (e.g. ESV)
            const refMetrics = ctx.measureText(refTitle);
            ctx.fillStyle = '#64748b';
            ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillText(activeTranslation, padX + refMetrics.width + 24, topY);

            // 4. Verse Quote Text (Word Wrapped with beautiful typography matching the card)
            ctx.fillStyle = '#0f172a';
            ctx.font = '400 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const maxTextWidth = W - padX * 2;
            const lineHeight = 68;
            const words = (currentVerse.text || '').split(' ');
            const lines = [];
            let currentLine = '“';
            for (let i = 0; i < words.length; i++) {
              const testLine = currentLine + (currentLine === '“' ? '' : ' ') + words[i];
              if (ctx.measureText(testLine + '”').width > maxTextWidth && currentLine !== '“') {
                lines.push(currentLine);
                currentLine = words[i];
              } else {
                currentLine = testLine;
              }
            }
            lines.push(currentLine + '”');

            // Vertically center the quote within the remaining card height
            const quoteStartY = topY + 70;
            for (let l = 0; l < lines.length; l++) {
              ctx.fillText(lines[l], padX, quoteStartY + l * lineHeight);
            }

            // Convert canvas to File blob
            const imageBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
            if (imageBlob) {
              imageFile = new File([imageBlob], `${currentVerse.bookName}-${currentVerse.chapter}-${currentVerse.verse}.png`, { type: 'image/png' });
            }
          }
        } catch (err) {
          // Graceful fallback to text/link share if canvas export fails
        }

        // Invoke native navigator.share (iOS Safari share tray)
        if (navigator.share) {
          try {
            if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
              // Share image file along with clean domain/verse URL
              await navigator.share({
                title: shareTitle,
                url: shareUrl,
                files: [imageFile]
              });
            } else {
              await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
              });
            }
            trackEvent('votd_share_success', { ref: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}` });
          } catch (shareErr) {
            // User cancelled or share aborted
          }
        } else {
          // Desktop or non-supporting browser fallback: copy link to clipboard
          try {
            await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
            mobileShareBtn.innerHTML = `
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            `;
            setTimeout(() => {
              if (mobileShareBtn) {
                mobileShareBtn.innerHTML = `
                  <svg class="votd-share-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                `;
              }
            }, 2000);
          } catch (clipErr) {
            // Copy failed
          }
        }
      });
    }
  }

  renderCard();
}

/** Legacy route fallback — Hub removed per user request: redirect directly to promises */
export function renderHubScreen() {
  navigate('/promises');
}
