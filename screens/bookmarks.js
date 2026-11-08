import {
  getAllBookmarks,
  createBookmark,
  updateBookmarkLocation,
  renameBookmark,
  deleteBookmark,
  restoreBookmarkHistory,
  deleteBookmarkHistoryEntry,
  setActiveModePref,
  getPreferredTranslation
} from '../api.js?v=20261108_v22';
import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  getBookById
} from '../bible-data.js?v=20261108_v22';
import { trackEvent } from '../analytics.js?v=20261108_v22';
import { navigate } from '../router.js?v=20261108_v22';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    return '';
  }
}

function formatRelativeTime(isoStr) {
  if (!isoStr) return '';
  try {
    const diffMs = Date.now() - new Date(isoStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(isoStr);
  } catch (e) {
    return '';
  }
}

export function renderBookmarksScreen(container) {
  let bookmarks = getAllBookmarks();
  let searchQuery = '';
  let sortBy = 'updated'; // 'updated', 'name', 'canonical', 'created'
  let editingBookmarkId = null;
  let expandedHistoryIds = new Set();
  let activeModalMode = null; // null, 'create', 'edit-location'
  let targetModalBookmarkId = null;

  function getFilteredBookmarks() {
    return bookmarks
      .filter((bm) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        const nameMatch = (bm.name || '').toLowerCase().includes(q);
        const refMatch = (bm.verseRef || '').toLowerCase().includes(q);
        const textMatch = (bm.verseText || '').toLowerCase().includes(q);
        const book = getBookById(bm.bookId);
        const bookMatch = (book?.name || '').toLowerCase().includes(q);
        const trMatch = (bm.translation || '').toLowerCase().includes(q);
        return nameMatch || refMatch || textMatch || bookMatch || trMatch;
      })
      .sort((a, b) => {
        if (sortBy === 'updated') {
          return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
        }
        if (sortBy === 'name') {
          return (a.name || '').localeCompare(b.name || '');
        }
        if (sortBy === 'canonical') {
          if (a.bookId !== b.bookId) return a.bookId - b.bookId;
          if (a.chapter !== b.chapter) return a.chapter - b.chapter;
          return (a.verse || 1) - (b.verse || 1);
        }
        if (sortBy === 'created') {
          return (b.createdAt || '').localeCompare(a.createdAt || '');
        }
        return 0;
      });
  }

  function render() {
    bookmarks = getAllBookmarks();
    const filtered = getFilteredBookmarks();
    const totalCount = bookmarks.length;

    container.innerHTML = `
      <div class="bookmarks-screen-container">
        <!-- Top Screen Header -->
        <div class="bookmarks-header">
          <div class="bookmarks-header-main">
            <h1 class="bookmarks-title">
              <svg class="bookmark-screen-title-icon" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -3px; color: var(--primary); margin-right: 6px;">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>Scripture Bookmarks
            </h1>
            <p class="bookmarks-subtitle">
              Custom markers that remember your place across the Bible. Jump right back into reading, typing, speaking, or drawing anytime, and see complete verse history.
            </p>
          </div>

          <div class="bookmarks-header-actions">
            <button type="button" class="btn btn-primary btn-sm" id="bookmarks-add-btn">
              + New Bookmark
            </button>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="bookmarks-toolbar">
          <div class="bookmarks-search-box">
            <span class="bookmarks-search-icon">🔍</span>
            <input
              type="text"
              id="bookmarks-search-input"
              class="bookmarks-search-input"
              placeholder="Search bookmarks by name, passage, or text..."
              value="${escapeHtml(searchQuery)}"
            />
            ${searchQuery ? `
              <button type="button" class="bookmarks-search-clear" id="bookmarks-search-clear" aria-label="Clear search">✕</button>
            ` : ''}
          </div>

          <div class="bookmarks-sort-group">
            <label for="bookmarks-sort-select" class="bookmarks-sort-lbl">Sort by:</label>
            <select id="bookmarks-sort-select" class="bookmarks-sort-select">
              <option value="updated" ${sortBy === 'updated' ? 'selected' : ''}>Recently Updated</option>
              <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Name (A–Z)</option>
              <option value="canonical" ${sortBy === 'canonical' ? 'selected' : ''}>Canonical Order</option>
              <option value="created" ${sortBy === 'created' ? 'selected' : ''}>Date Created</option>
            </select>
          </div>
        </div>

        <!-- Bookmarks Count Summary -->
        <div class="bookmarks-meta-bar">
          <span class="bookmarks-count-text">
            ${searchQuery
              ? `Showing <strong>${filtered.length}</strong> of <strong>${totalCount}</strong> bookmarks matching "${escapeHtml(searchQuery)}"`
              : `<strong>${totalCount}</strong> saved bookmark${totalCount === 1 ? '' : 's'}`
            }
          </span>
        </div>

        <!-- Main Bookmarks Content -->
        ${totalCount === 0 ? `
          <div class="bookmarks-empty-state">
            <div class="bookmarks-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h2 class="bookmarks-empty-title">No Bookmarks Saved Yet</h2>
            <p class="bookmarks-empty-desc">
              Bookmarks help you keep track of where you are in personal reading plans, study topics, or daily devotionals.
              Click the bookmark ribbon icon next to favourite while practicing, or create one below!
            </p>
            <div class="bookmarks-empty-actions">
              <button type="button" class="btn btn-primary" id="empty-add-bookmark-btn">
                + Create Your First Bookmark
              </button>
              <a href="/promises" class="btn btn-secondary">
                Open Promises
              </a>
            </div>
          </div>
        ` : filtered.length === 0 ? `
          <div class="bookmarks-no-results">
            <p>No bookmarks match your search query: "<strong>${escapeHtml(searchQuery)}</strong>"</p>
            <button type="button" class="btn btn-secondary btn-sm" id="reset-search-btn">Clear Search</button>
          </div>
        ` : `
          <div class="bookmarks-grid">
            ${filtered.map(bm => renderBookmarkCardHtml(bm)).join('')}
          </div>
        `}
      </div>

      <!-- Add/Edit Location Modal Backdrop -->
      <div class="typing-options-backdrop bookmarks-modal-backdrop" id="bookmarks-location-modal-backdrop" hidden>
        <div class="typing-options-card bookmarks-location-card" role="dialog" aria-modal="true" aria-labelledby="bm-location-modal-title">
          <div class="typing-options-header">
            <div>
              <h2 class="typing-options-title" id="bm-location-modal-title">
                ${activeModalMode === 'create' ? '+ New Scripture Bookmark' : 'Update Bookmark Location'}
              </h2>
              <p class="bookmark-modal-subtitle" id="bm-location-modal-subtitle">
                ${activeModalMode === 'create' ? 'Set up a named bookmark to save your reading spot' : 'Select a new verse. Previous location will be saved in history.'}
              </p>
            </div>
            <button type="button" class="options-close-btn" id="bm-location-close-btn" aria-label="Close">✕</button>
          </div>

          <div class="typing-options-body">
            <form id="bm-location-form" class="bookmarks-modal-form">
              ${activeModalMode === 'create' ? `
                <div class="bm-form-row">
                  <label for="bm-form-name" class="bm-form-label">Bookmark Name</label>
                  <input
                    type="text"
                    id="bm-form-name"
                    class="bm-form-input"
                    placeholder="e.g., Morning Reading, Romans Study, Devotional"
                    required
                    maxlength="60"
                  />
                </div>
              ` : ''}

              <div class="bm-form-row">
                <label for="bm-form-book" class="bm-form-label">Bible Book</label>
                <select id="bm-form-book" class="bm-form-select">
                  ${BIBLE_BOOKS.map(b => `<option value="${b.id}">${b.name} (${b.testament})</option>`).join('')}
                </select>
              </div>

              <div class="bm-form-grid-2">
                <div class="bm-form-row">
                  <label for="bm-form-chapter" class="bm-form-label">Chapter</label>
                  <input
                    type="number"
                    id="bm-form-chapter"
                    class="bm-form-input"
                    min="1"
                    value="1"
                    required
                  />
                </div>
                <div class="bm-form-row">
                  <label for="bm-form-verse" class="bm-form-label">Verse</label>
                  <input
                    type="number"
                    id="bm-form-verse"
                    class="bm-form-input"
                    min="1"
                    value="1"
                    required
                  />
                </div>
              </div>

              <div class="bm-form-row">
                <label for="bm-form-translation" class="bm-form-label">Translation</label>
                <select id="bm-form-translation" class="bm-form-select">
                  ${BIBLE_TRANSLATIONS.map(t => `<option value="${t.code}">${t.name} (${t.code})</option>`).join('')}
                </select>
              </div>

              <div class="bm-form-actions">
                <button type="button" class="btn btn-secondary" id="bm-form-cancel-btn">Cancel</button>
                <button type="submit" class="btn btn-primary" id="bm-form-submit-btn">
                  ${activeModalMode === 'create' ? 'Create Bookmark' : 'Update Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function renderBookmarkCardHtml(bm) {
    const isEditingName = editingBookmarkId === bm.id;
    const isHistoryExpanded = expandedHistoryIds.has(bm.id);
    const book = getBookById(bm.bookId) || { name: 'Unknown', id: bm.bookId };
    const currentRefStr = bm.verseRef || `${book.name} ${bm.chapter}:${bm.verse || 1}`;
    const historyList = Array.isArray(bm.history) ? bm.history : [];
    const historyCount = historyList.length;

    return `
      <div class="bookmark-card" data-id="${escapeHtml(bm.id)}">
        <!-- Card Header: Name & Actions -->
        <div class="bookmark-card-header">
          <div class="bookmark-card-title-group">
            <span class="bookmark-badge-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary); vertical-align: -2px;">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </span>
            ${isEditingName ? `
              <div class="bookmark-rename-inline">
                <input
                  type="text"
                  class="bookmark-rename-input"
                  value="${escapeHtml(bm.name)}"
                  maxlength="60"
                  id="rename-input-${escapeHtml(bm.id)}"
                />
                <button type="button" class="btn btn-primary btn-xs bm-rename-save-btn" title="Save name">✓</button>
                <button type="button" class="btn btn-secondary btn-xs bm-rename-cancel-btn" title="Cancel">✕</button>
              </div>
            ` : `
              <div class="bookmark-name-display-wrap">
                <h3 class="bookmark-card-name" title="${escapeHtml(bm.name)}">${escapeHtml(bm.name)}</h3>
                <button type="button" class="bookmark-edit-name-btn" title="Rename bookmark" data-id="${escapeHtml(bm.id)}">✏️</button>
              </div>
            `}
          </div>

          <div class="bookmark-card-top-meta">
            <span class="bookmark-relative-time" title="${formatDate(bm.updatedAt || bm.createdAt)}">
              Updated ${formatRelativeTime(bm.updatedAt || bm.createdAt)}
            </span>
            <button
              type="button"
              class="bookmark-card-delete-btn"
              title="Delete bookmark"
              data-id="${escapeHtml(bm.id)}"
              data-name="${escapeHtml(bm.name)}"
            >
              🗑️
            </button>
          </div>
        </div>

        <!-- Current Location Display -->
        <div class="bookmark-current-location-box">
          <div class="bookmark-loc-top">
            <div class="bookmark-ref-badge">
              <span class="bookmark-ref-title">${escapeHtml(currentRefStr)}</span>
              <span class="bookmark-tr-pill">${escapeHtml(bm.translation || 'ESV')}</span>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-xs bookmark-change-loc-btn"
              data-id="${escapeHtml(bm.id)}"
              title="Move bookmark to another chapter or verse"
            >
              📍 Change Verse
            </button>
          </div>

          ${bm.verseText ? `
            <p class="bookmark-verse-preview">"${escapeHtml(bm.verseText)}"</p>
          ` : ''}

          <!-- Jump / Practice Actions -->
          <div class="bookmark-jump-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm bookmark-type-btn"
              data-id="${escapeHtml(bm.id)}"
              data-book="${bm.bookId}"
              data-ch="${bm.chapter}"
              data-vr="${bm.verse || 1}"
            >
              ⌨️ Type
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm bookmark-speak-btn"
              data-id="${escapeHtml(bm.id)}"
              data-book="${bm.bookId}"
              data-ch="${bm.chapter}"
              data-vr="${bm.verse || 1}"
            >
              🗣️ Speak
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm bookmark-chapter-btn"
              data-id="${escapeHtml(bm.id)}"
              data-book="${bm.bookId}"
              data-ch="${bm.chapter}"
              data-vr="${bm.verse || 1}"
            >
              📖 Chapter
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm bookmark-meditate-btn"
              data-id="${escapeHtml(bm.id)}"
              data-book="${bm.bookId}"
              data-ch="${bm.chapter}"
              data-vr="${bm.verse || 1}"
            >
              🎨 Draw
            </button>
          </div>
        </div>

        <!-- History Section -->
        <div class="bookmark-history-section">
          <div
            class="bookmark-history-toggle ${historyCount > 0 ? 'is-expandable' : 'is-empty'}"
            data-id="${escapeHtml(bm.id)}"
            role="button"
            tabindex="0"
          >
            <span class="bookmark-history-toggle-lbl">
              📜 History ${historyCount > 0 ? `(${historyCount} past checkpoint${historyCount === 1 ? '' : 's'})` : '(0 checkpoints)'}
            </span>
            ${historyCount > 0 ? `
              <span class="bookmark-history-arrow">${isHistoryExpanded ? '▲' : '▼'}</span>
            ` : ''}
          </div>

          ${(historyCount > 0 && isHistoryExpanded) ? `
            <div class="bookmark-history-list">
              ${historyList.map((h, hIdx) => {
                const hBook = getBookById(h.bookId) || { name: 'Book', id: h.bookId };
                const hRefStr = h.verseRef || `${hBook.name} ${h.chapter}:${h.verse || 1}`;
                return `
                  <div class="bookmark-history-item">
                    <div class="bm-history-info">
                      <div class="bm-history-ref-row">
                        <strong class="bm-history-ref">${escapeHtml(hRefStr)}</strong>
                        <span class="bm-history-time">${formatRelativeTime(h.timestamp)}</span>
                      </div>
                      ${h.verseText ? `<p class="bm-history-snippet">"${escapeHtml(h.verseText)}"</p>` : ''}
                    </div>
                    <div class="bm-history-actions">
                      <button
                        type="button"
                        class="btn btn-secondary btn-xs bm-hist-jump-btn"
                        title="Jump and type this verse"
                        data-book="${h.bookId}"
                        data-ch="${h.chapter}"
                        data-vr="${h.verse || 1}"
                      >
                        ▶ Type
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary btn-xs bm-hist-restore-btn"
                        title="Restore bookmark to this verse"
                        data-id="${escapeHtml(bm.id)}"
                        data-hidx="${hIdx}"
                      >
                        ↺ Restore
                      </button>
                      <button
                        type="button"
                        class="bm-hist-del-btn"
                        title="Remove from history"
                        data-id="${escapeHtml(bm.id)}"
                        data-hidx="${hIdx}"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : (historyCount === 0 && isHistoryExpanded) ? `
            <p class="bookmark-history-empty-hint">
              When you update this bookmark to a new verse, past verses are automatically saved here in history!
            </p>
          ` : ''}
        </div>
      </div>
    `;
  }

  function bindEvents() {
    // Search input
    const searchInput = container.querySelector('#bookmarks-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        render();
        const freshInput = container.querySelector('#bookmarks-search-input');
        if (freshInput) {
          freshInput.focus();
          freshInput.setSelectionRange(freshInput.value.length, freshInput.value.length);
        }
      });
    }

    const searchClear = container.querySelector('#bookmarks-search-clear');
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchQuery = '';
        render();
      });
    }

    const resetSearchBtn = container.querySelector('#reset-search-btn');
    if (resetSearchBtn) {
      resetSearchBtn.addEventListener('click', () => {
        searchQuery = '';
        render();
      });
    }

    // Sort selector
    const sortSelect = container.querySelector('#bookmarks-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        trackEvent('sort_bookmarks', { sortBy });
        render();
      });
    }

    // Add bookmark buttons
    const addBtn = container.querySelector('#bookmarks-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        openLocationModal('create');
      });
    }

    const emptyAddBtn = container.querySelector('#empty-add-bookmark-btn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => {
        openLocationModal('create');
      });
    }

    // Inline Rename Buttons
    container.querySelectorAll('.bookmark-edit-name-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        editingBookmarkId = btn.getAttribute('data-id');
        render();
        const input = container.querySelector(`#rename-input-${editingBookmarkId}`);
        if (input) {
          input.focus();
          input.select();
        }
      });
    });

    container.querySelectorAll('.bm-rename-cancel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        editingBookmarkId = null;
        render();
      });
    });

    container.querySelectorAll('.bm-rename-save-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.bookmark-card');
        const id = card?.getAttribute('data-id');
        const input = card?.querySelector('.bookmark-rename-input');
        if (id && input && input.value.trim()) {
          renameBookmark(id, input.value.trim());
          trackEvent('rename_bookmark', { id });
        }
        editingBookmarkId = null;
        render();
      });
    });

    // Delete bookmark buttons
    container.querySelectorAll('.bookmark-card-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        if (confirm(`Are you sure you want to delete the bookmark "${name}"?`)) {
          deleteBookmark(id);
          trackEvent('delete_bookmark', { id });
          render();
        }
      });
    });

    // Jump to typing verse
    container.querySelectorAll('.bookmark-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookId = Number(btn.getAttribute('data-book'));
        const ch = Number(btn.getAttribute('data-ch'));
        const vr = Number(btn.getAttribute('data-vr'));
        setActiveModePref('type');
        trackEvent('jump_bookmark_type', { bookId, chapter: ch, verse: vr });
        navigate(`/type/${bookId}/${ch}/${vr}`);
      });
    });

    // Jump to speaking verse
    container.querySelectorAll('.bookmark-speak-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookId = Number(btn.getAttribute('data-book'));
        const ch = Number(btn.getAttribute('data-ch'));
        const vr = Number(btn.getAttribute('data-vr'));
        setActiveModePref('speak');
        trackEvent('jump_bookmark_speak', { bookId, chapter: ch, verse: vr });
        navigate(`/speak/${bookId}/${ch}/${vr}`);
      });
    });

    // Jump to full chapter
    container.querySelectorAll('.bookmark-chapter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookId = Number(btn.getAttribute('data-book'));
        const ch = Number(btn.getAttribute('data-ch'));
        const vr = Number(btn.getAttribute('data-vr'));
        setActiveModePref('type');
        trackEvent('jump_bookmark_chapter', { bookId, chapter: ch, verse: vr });
        navigate(`/type/${bookId}/${ch}?verse=${vr}`);
      });
    });

    // Draw on bookmark verse
    container.querySelectorAll('.bookmark-meditate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookId = Number(btn.getAttribute('data-book'));
        const ch = Number(btn.getAttribute('data-ch'));
        const vr = Number(btn.getAttribute('data-vr'));
        setActiveModePref('draw');
        trackEvent('jump_bookmark_draw', { bookId, chapter: ch, verse: vr });
        navigate(`/draw/${bookId}/${ch}/${vr}`);
      });
    });

    // Change location button on card
    container.querySelectorAll('.bookmark-change-loc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openLocationModal('edit-location', id);
      });
    });

    // History Accordion Toggle
    container.querySelectorAll('.bookmark-history-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const id = toggle.getAttribute('data-id');
        if (expandedHistoryIds.has(id)) {
          expandedHistoryIds.delete(id);
        } else {
          expandedHistoryIds.add(id);
        }
        render();
      });
    });

    // History Jump Button
    container.querySelectorAll('.bm-hist-jump-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookId = Number(btn.getAttribute('data-book'));
        const ch = Number(btn.getAttribute('data-ch'));
        const vr = Number(btn.getAttribute('data-vr'));
        setActiveModePref('type');
        trackEvent('jump_bookmark_history', { bookId, chapter: ch, verse: vr });
        navigate(`/type/${bookId}/${ch}/${vr}`);
      });
    });

    // History Restore Button
    container.querySelectorAll('.bm-hist-restore-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const hIdx = Number(btn.getAttribute('data-hidx'));
        restoreBookmarkHistory(id, hIdx);
        trackEvent('restore_bookmark_history', { id, hIdx });
        render();
      });
    });

    // History Delete Entry Button
    container.querySelectorAll('.bm-hist-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const hIdx = Number(btn.getAttribute('data-hidx'));
        deleteBookmarkHistoryEntry(id, hIdx);
        trackEvent('delete_bookmark_history_entry', { id, hIdx });
        render();
      });
    });

    // Location Modal Events
    const modalBackdrop = container.querySelector('#bookmarks-location-modal-backdrop');
    const modalCloseBtn = container.querySelector('#bm-location-close-btn');
    const modalCancelBtn = container.querySelector('#bm-form-cancel-btn');
    const modalForm = container.querySelector('#bm-location-form');

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeLocationModal);
    }
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', closeLocationModal);
    }
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeLocationModal();
      });
    }

    if (modalForm) {
      modalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const bookId = Number(container.querySelector('#bm-form-book')?.value || 1);
        const chapter = Number(container.querySelector('#bm-form-chapter')?.value || 1);
        const verse = Number(container.querySelector('#bm-form-verse')?.value || 1);
        const translation = container.querySelector('#bm-form-translation')?.value || 'ESV';
        const book = getBookById(bookId);
        const verseRef = `${book.name} ${chapter}:${verse}`;

        if (activeModalMode === 'create') {
          const nameInput = container.querySelector('#bm-form-name');
          const name = nameInput ? nameInput.value.trim() : 'Bookmark';
          if (!name) return;
          createBookmark({
            name,
            bookId,
            chapter,
            verse,
            verseRef,
            verseText: '',
            translation
          });
          trackEvent('create_bookmark', { name, bookId, chapter, verse });
        } else if (activeModalMode === 'edit-location' && targetModalBookmarkId) {
          updateBookmarkLocation(targetModalBookmarkId, {
            bookId,
            chapter,
            verse,
            verseRef,
            verseText: '',
            translation
          });
          trackEvent('update_bookmark_location', { id: targetModalBookmarkId, bookId, chapter, verse });
        }
        closeLocationModal();
        render();
      });
    }
  }

  function openLocationModal(mode, bookmarkId = null) {
    activeModalMode = mode;
    targetModalBookmarkId = bookmarkId;
    const modalBackdrop = container.querySelector('#bookmarks-location-modal-backdrop');
    if (!modalBackdrop) return;

    modalBackdrop.hidden = false;
    const titleEl = container.querySelector('#bm-location-modal-title');
    const submitBtn = container.querySelector('#bm-form-submit-btn');

    if (mode === 'create') {
      if (titleEl) titleEl.textContent = '+ New Scripture Bookmark';
      if (submitBtn) submitBtn.textContent = 'Create Bookmark';
      const nameInput = container.querySelector('#bm-form-name');
      if (nameInput) {
        nameInput.value = '';
        nameInput.focus();
      }
    } else {
      const bm = bookmarks.find(b => b.id === bookmarkId);
      if (titleEl && bm) titleEl.textContent = `Update "${bm.name}"`;
      if (submitBtn) submitBtn.textContent = 'Update Location';

      if (bm) {
        const bookSelect = container.querySelector('#bm-form-book');
        const chInput = container.querySelector('#bm-form-chapter');
        const vrInput = container.querySelector('#bm-form-verse');
        const trSelect = container.querySelector('#bm-form-translation');
        if (bookSelect) bookSelect.value = String(bm.bookId);
        if (chInput) chInput.value = String(bm.chapter);
        if (vrInput) vrInput.value = String(bm.verse || 1);
        if (trSelect) trSelect.value = String(bm.translation || 'ESV');
      }
    }
  }

  function closeLocationModal() {
    const modalBackdrop = container.querySelector('#bookmarks-location-modal-backdrop');
    if (modalBackdrop) modalBackdrop.hidden = true;
    activeModalMode = null;
    targetModalBookmarkId = null;
  }

  render();
}
