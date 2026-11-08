import {
  getAllFavorites,
  removeVerseFavorite,
  updateFavoriteComment,
  setActiveModePref
} from '../api.js?v=20261108_v23';
import { getBookById } from '../bible-data.js?v=20261108_v23';
import { trackEvent } from '../analytics.js?v=20261108_v23';
import { navigate } from '../router.js?v=20261108_v23';

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

export function renderFavoritesScreen(container) {
  let favorites = getAllFavorites();
  let searchQuery = '';
  let testamentFilter = 'ALL'; // 'ALL', 'OT', 'NT'
  let sortBy = 'newest'; // 'newest', 'notes', 'canonical', 'alpha'

  function getFilteredFavorites() {
    return favorites
      .filter((fav) => {
        const book = getBookById(fav.bookId);
        if (testamentFilter !== 'ALL') {
          if (book.testament !== testamentFilter) return false;
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const refMatch = (fav.verseRef || '').toLowerCase().includes(q);
          const textMatch = (fav.verseText || '').toLowerCase().includes(q);
          const bookMatch = (book.name || '').toLowerCase().includes(q);
          const trMatch = (fav.translation || '').toLowerCase().includes(q);
          const commentMatch = (fav.comment || '').toLowerCase().includes(q);
          if (!refMatch && !textMatch && !bookMatch && !trMatch && !commentMatch) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return (b.addedAt || '').localeCompare(a.addedAt || '');
        }
        if (sortBy === 'notes') {
          const hasA = Boolean(a.comment && a.comment.trim());
          const hasB = Boolean(b.comment && b.comment.trim());
          if (hasA !== hasB) return hasB ? 1 : -1;
          return (b.addedAt || '').localeCompare(a.addedAt || '');
        }
        if (sortBy === 'canonical') {
          if (a.bookId !== b.bookId) return a.bookId - b.bookId;
          if (a.chapter !== b.chapter) return a.chapter - b.chapter;
          return a.verse - b.verse;
        }
        if (sortBy === 'alpha') {
          return (a.verseRef || '').localeCompare(b.verseRef || '');
        }
        return 0;
      });
  }

  function render() {
    favorites = getAllFavorites();
    const filtered = getFilteredFavorites();
    const totalCount = favorites.length;

    container.innerHTML = `
      <div class="favorites-screen-container">
        <!-- Top Screen Header -->
        <div class="favorites-header">
          <div class="favorites-header-main">
            <h1 class="favorites-title">❤️ Favorited Verses</h1>
            <p class="favorites-subtitle">
              Your cherished collection of Scripture passages saved while reading, typing, speaking, and drawing.
            </p>
          </div>

          <div class="favorites-header-actions">
            ${totalCount > 0 ? `
              <button type="button" class="btn btn-primary btn-sm" id="favorites-random-btn" title="Pick a random favorited verse to type">
                🎲 Practice Random Favorite
              </button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-sm" id="favorites-open-typing-btn" title="Continue Promises practice">
              📖 Promises
            </button>
          </div>
        </div>

        <!-- Toolbar: Search & Filters -->
        <div class="favorites-toolbar">
          <div class="favorites-search-box">
            <span class="favorites-search-icon">🔍</span>
            <input
              type="text"
              id="favorites-search-input"
              class="favorites-search-input"
              placeholder="Search by verse reference (e.g. John 3:16) or text..."
              value="${escapeHtml(searchQuery)}"
              aria-label="Search favorites"
            />
            ${searchQuery ? `<button type="button" class="favorites-search-clear-btn" id="favorites-search-clear">✕</button>` : ''}
          </div>

          <div class="favorites-filters-wrapper">
            <div class="favorites-filter-group">
              <span class="favorites-filter-label">Testament:</span>
              <select class="favorites-filter-select" id="favorites-testament-filter" aria-label="Filter by testament">
                <option value="ALL" ${testamentFilter === 'ALL' ? 'selected' : ''}>All (${totalCount})</option>
                <option value="OT" ${testamentFilter === 'OT' ? 'selected' : ''}>Old Testament</option>
                <option value="NT" ${testamentFilter === 'NT' ? 'selected' : ''}>New Testament</option>
              </select>
            </div>

            <div class="favorites-filter-group">
              <span class="favorites-filter-label">Sort:</span>
              <select class="favorites-filter-select" id="favorites-sort-select" aria-label="Sort favorites">
                <option value="newest" ${sortBy === 'newest' ? 'selected' : ''}>Recently Added</option>
                <option value="notes" ${sortBy === 'notes' ? 'selected' : ''}>With Notes First</option>
                <option value="canonical" ${sortBy === 'canonical' ? 'selected' : ''}>Canonical Order</option>
                <option value="alpha" ${sortBy === 'alpha' ? 'selected' : ''}>Alphabetical</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Main Cards Grid or Empty State -->
        ${filtered.length === 0 ? renderEmptyStateHtml() : `
          <div class="favorites-grid" id="favorites-grid">
            ${filtered.map(fav => renderFavoriteCardHtml(fav)).join('')}
          </div>
        `}
      </div>
    `;

    attachEventListeners();
  }

  function renderEmptyStateHtml() {
    const isFiltered = searchQuery || testamentFilter !== 'ALL';
    if (isFiltered) {
      return `
        <div class="favorites-empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No matching favorited verses found</h3>
          <p>Try clearing your search query or selecting "All" in the testament filter above.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="favorites-reset-filter-btn">
            Clear Filters
          </button>
        </div>
      `;
    }

    return `
      <div class="favorites-empty-state">
        <div class="empty-icon">🤍</div>
        <h3>No Favorited Verses Yet</h3>
        <p>
          Save verses to this collection at any time!
          In <strong>Chapter Mode</strong>, hover over any verse and click the heart icon.
          In <strong>Single Verse Mode</strong>, tap the heart button in the top bar.
        </p>
        <button type="button" class="btn btn-primary btn-md" id="favorites-start-typing-btn">
          📖 Open Promises
        </button>
      </div>
    `;
  }

  function renderFavoriteCardHtml(fav) {
    const book = getBookById(fav.bookId);
    const verseRef = fav.verseRef || `${book.name} ${fav.chapter}:${fav.verse}`;
    const testamentBadge = book.testament === 'OT' ? 'Old Testament' : 'New Testament';
    const hasComment = Boolean(fav.comment && fav.comment.trim());

    return `
      <div class="favorite-card" data-key="${escapeHtml(fav.key)}" data-book="${fav.bookId}" data-chapter="${fav.chapter}" data-verse="${fav.verse}">
        <div class="favorite-card-header">
          <div class="favorite-card-title-group">
            <h3 class="favorite-card-ref">${escapeHtml(verseRef)}</h3>
            <div class="favorite-card-badges">
              <span class="favorite-pill favorite-pill-tr">${escapeHtml(fav.translation || 'ESV')}</span>
              <span class="favorite-pill favorite-pill-testament">${escapeHtml(testamentBadge)}</span>
            </div>
          </div>
          <button type="button" class="favorite-remove-btn" title="Remove from favorites" data-action="remove">
            ❤️
          </button>
        </div>

        <div class="favorite-card-body">
          <p class="favorite-card-text">“${escapeHtml(fav.verseText)}”</p>

          <!-- Reflection / Comment Section -->
          <div class="favorite-comment-container" data-container="comment">
            ${hasComment ? `
              <div class="favorite-comment-box" data-view="comment">
                <div class="favorite-comment-header">
                  <span class="favorite-comment-badge">💬 Note</span>
                  <div class="favorite-comment-actions">
                    <button type="button" class="favorite-comment-action-btn" data-action="edit-comment" title="Edit note">
                      ✏️ Edit
                    </button>
                    <button type="button" class="favorite-comment-action-btn favorite-comment-delete-btn" data-action="delete-comment" title="Delete note">
                      🗑️
                    </button>
                  </div>
                </div>
                <p class="favorite-comment-text">${escapeHtml(fav.comment)}</p>
                ${fav.commentUpdatedAt ? `
                  <div class="favorite-comment-date">Updated ${formatDate(fav.commentUpdatedAt)}</div>
                ` : ''}
              </div>
            ` : `
              <button type="button" class="favorite-add-comment-btn" data-action="add-comment" title="Add a personal reflection note">
                <span>💬 Add reflection or note...</span>
              </button>
            `}

            <div class="favorite-comment-editor" data-editor="comment" hidden>
              <textarea
                class="favorite-comment-textarea"
                placeholder="Write your reflections, prayer points, or notes for this verse..."
                rows="3"
                maxlength="1000"
              >${escapeHtml(fav.comment || '')}</textarea>
              <div class="favorite-comment-editor-footer">
                <span class="favorite-comment-char-count">${(fav.comment || '').length}/1000</span>
                <div class="favorite-comment-editor-btns">
                  <button type="button" class="btn btn-secondary btn-xs" data-action="cancel-comment">Cancel</button>
                  <button type="button" class="btn btn-primary btn-xs" data-action="save-comment">Save Note</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="favorite-card-footer">
          <div class="favorite-card-meta">
            ${fav.addedAt ? `<span class="favorite-meta-date">Saved ${formatDate(fav.addedAt)}</span>` : ''}
          </div>
          <div class="favorite-card-actions">
            <button type="button" class="btn btn-primary btn-sm favorite-type-btn" data-action="type" title="Type this verse in single verse mode">
              ⌨️ Type
            </button>
            <button type="button" class="btn btn-secondary btn-sm favorite-speak-btn" data-action="speak" title="Speak this verse aloud">
              🗣️ Speak
            </button>
            <button type="button" class="btn btn-secondary btn-sm favorite-meditate-btn" data-action="draw" title="Draw and color this verse">
              🎨 Draw
            </button>
            <button type="button" class="btn btn-secondary btn-sm favorite-copy-btn" data-action="copy" title="Copy verse text to clipboard">
              📋
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function attachEventListeners() {
    // Search input
    const searchInput = container.querySelector('#favorites-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        render();
      });
    }

    const clearBtn = container.querySelector('#favorites-search-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchQuery = '';
        render();
      });
    }

    // Testament filter
    const testFilter = container.querySelector('#favorites-testament-filter');
    if (testFilter) {
      testFilter.addEventListener('change', (e) => {
        testamentFilter = e.target.value;
        trackEvent('filter_favorites_testament', { testament: testamentFilter });
        render();
      });
    }

    // Sort select
    const sortSelect = container.querySelector('#favorites-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        sortBy = e.target.value;
        trackEvent('sort_favorites', { sortBy });
        render();
      });
    }

    // Reset filters
    const resetBtn = container.querySelector('#favorites-reset-filter-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        searchQuery = '';
        testamentFilter = 'ALL';
        render();
      });
    }

    // Start typing from empty state
    const startBtn = container.querySelector('#favorites-start-typing-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        navigate('/promises');
      });
    }

    const openTypingBtn = container.querySelector('#favorites-open-typing-btn');
    if (openTypingBtn) {
      openTypingBtn.addEventListener('click', () => {
        navigate('/promises');
      });
    }

    // Random favorite practice
    const randomBtn = container.querySelector('#favorites-random-btn');
    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        if (favorites.length === 0) return;
        const rand = favorites[Math.floor(Math.random() * favorites.length)];
        setActiveModePref('type');
        trackEvent('practice_random_favorite', { bookId: rand.bookId, chapter: rand.chapter, verse: rand.verse });
        navigate(`/type/${rand.bookId}/${rand.chapter}/${rand.verse}`);
      });
    }

    // Grid card click actions (Type, Speak, Draw, Remove, Copy)
    const grid = container.querySelector('#favorites-grid');
    if (grid) {
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const card = btn.closest('.favorite-card');
        if (!card) return;

        const bookId = Number(card.getAttribute('data-book'));
        const chapter = Number(card.getAttribute('data-chapter'));
        const verse = Number(card.getAttribute('data-verse'));
        const action = btn.getAttribute('data-action');

        if (action === 'type') {
          setActiveModePref('type');
          trackEvent('open_favorite_verse_type', { bookId, chapter, verse });
          navigate(`/type/${bookId}/${chapter}/${verse}`);
          return;
        }

        if (action === 'speak') {
          setActiveModePref('speak');
          trackEvent('open_favorite_verse_speak', { bookId, chapter, verse });
          navigate(`/speak/${bookId}/${chapter}/${verse}`);
          return;
        }

        if (action === 'draw' || action === 'meditate') {
          setActiveModePref('draw');
          trackEvent('open_favorite_verse_draw', { bookId, chapter, verse });
          navigate(`/draw/${bookId}/${chapter}/${verse}`);
          return;
        }

        if (action === 'copy') {
          const textEl = card.querySelector('.favorite-card-text');
          const refEl = card.querySelector('.favorite-card-ref');
          const text = textEl ? textEl.textContent.replace(/^[“"]|[”"]$/g, '') : '';
          const ref = refEl ? refEl.textContent : '';
          const fullCopy = `“${text}” — ${ref}`;
          trackEvent('copy_favorite_verse', { bookId, chapter, verse });
          navigator.clipboard.writeText(fullCopy).then(() => {
            const orig = btn.textContent;
            btn.textContent = '✓ Copied';
            setTimeout(() => {
              btn.textContent = orig;
            }, 1500);
          }).catch(() => {});
          return;
        }

        if (action === 'remove') {
          removeVerseFavorite(bookId, chapter, verse);
          trackEvent('remove_favorite_verse', { bookId, chapter, verse });
          render();
          return;
        }

        if (action === 'add-comment') {
          const containerEl = card.querySelector('[data-container="comment"]');
          if (!containerEl) return;
          const addBtn = containerEl.querySelector('[data-action="add-comment"]');
          const editor = containerEl.querySelector('[data-editor="comment"]');
          if (addBtn) addBtn.hidden = true;
          if (editor) {
            editor.hidden = false;
            const ta = editor.querySelector('.favorite-comment-textarea');
            if (ta) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          }
          return;
        }

        if (action === 'edit-comment') {
          const containerEl = card.querySelector('[data-container="comment"]');
          if (!containerEl) return;
          const box = containerEl.querySelector('[data-view="comment"]');
          const editor = containerEl.querySelector('[data-editor="comment"]');
          if (box) box.hidden = true;
          if (editor) {
            editor.hidden = false;
            const ta = editor.querySelector('.favorite-comment-textarea');
            if (ta) {
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          }
          return;
        }

        if (action === 'cancel-comment') {
          const containerEl = card.querySelector('[data-container="comment"]');
          if (!containerEl) return;
          const box = containerEl.querySelector('[data-view="comment"]');
          const addBtn = containerEl.querySelector('[data-action="add-comment"]');
          const editor = containerEl.querySelector('[data-editor="comment"]');
          if (editor) editor.hidden = true;
          if (box) box.hidden = false;
          if (addBtn) addBtn.hidden = false;
          return;
        }

        if (action === 'save-comment') {
          const containerEl = card.querySelector('[data-container="comment"]');
          if (!containerEl) return;
          const ta = containerEl.querySelector('.favorite-comment-textarea');
          const commentText = ta ? ta.value.trim() : '';
          updateFavoriteComment(bookId, chapter, verse, commentText);
          trackEvent('save_favorite_comment', { bookId, chapter, verse, hasComment: Boolean(commentText) });
          render();
          return;
        }

        if (action === 'delete-comment') {
          if (confirm('Delete this reflection note?')) {
            updateFavoriteComment(bookId, chapter, verse, '');
            trackEvent('delete_favorite_comment', { bookId, chapter, verse });
            render();
          }
          return;
        }
      });

      grid.addEventListener('input', (e) => {
        if (e.target.matches('.favorite-comment-textarea')) {
          const ta = e.target;
          const editor = ta.closest('.favorite-comment-editor');
          if (editor) {
            const countEl = editor.querySelector('.favorite-comment-char-count');
            if (countEl) countEl.textContent = `${ta.value.length}/1000`;
          }
        }
      });

      grid.addEventListener('keydown', (e) => {
        if (e.target.matches('.favorite-comment-textarea')) {
          if (e.key === 'Escape') {
            const card = e.target.closest('.favorite-card');
            const cancelBtn = card?.querySelector('[data-action="cancel-comment"]');
            if (cancelBtn) cancelBtn.click();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            const card = e.target.closest('.favorite-card');
            const saveBtn = card?.querySelector('[data-action="save-comment"]');
            if (saveBtn) saveBtn.click();
          }
        }
      });
    }
  }

  render();
}
