import {
  getAllDrawings,
  deleteVerseDrawing,
  setActiveModePref,
  getPreferredTranslation
} from '../api.js?v=20261108_v16';
import {
  renderMeditateArtworkSvg,
  getArtworkTemplateName,
  MEDITATE_ART_THEME_NAMES,
  TOTAL_MEDITATE_ART_TEMPLATES
} from '../meditate-art.js?v=20261108_v16';
import { getBookById, getRandomVerseRef } from '../bible-data.js?v=20261108_v16';
import { trackEvent } from '../analytics.js?v=20261108_v16';
import { navigate } from '../router.js?v=20261108_v16';

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

export function renderDrawingsScreen(container) {
  let drawings = getAllDrawings();
  let searchQuery = '';
  let selectedTemplateFilter = 'ALL'; // 'ALL' or theme index 0..9

  function getFilteredDrawings() {
    return drawings.filter((m) => {
      if (selectedTemplateFilter !== 'ALL') {
        if (Number(m.templateIdx) % 10 !== Number(selectedTemplateFilter)) {
          return false;
        }
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const refMatch = (m.verseRef || '').toLowerCase().includes(q);
        const textMatch = (m.verseText || '').toLowerCase().includes(q);
        const trMatch = (m.translation || '').toLowerCase().includes(q);
        if (!refMatch && !textMatch && !trMatch) return false;
      }
      return true;
    });
  }

  function render() {
    const filtered = getFilteredDrawings();
    const totalCount = drawings.length;

    container.innerHTML = `
      <div class="meditations-screen-container">
        <!-- Top Screen Header -->
        <div class="meditations-header">
          <div class="meditations-header-main">
            <h1 class="meditations-title">🎨 Scripture Drawings</h1>
            <p class="meditations-subtitle">
              Reflect on God's Word through your colored Scripture artwork and contemplative verses.
            </p>
          </div>

          <div class="meditations-header-actions">
            <button type="button" class="btn btn-primary btn-sm" id="meditations-random-verse-btn" title="Pick a random verse to draw">
              🎲 Random Verse Drawing
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="meditations-open-typing-btn" title="Open Scripture promises in Draw Mode">
              ✨ Start New Drawing
            </button>
          </div>
        </div>

        <!-- Toolbar: Search & Template Filter -->
        <div class="meditations-toolbar">
          <div class="meditations-search-box">
            <span class="meditations-search-icon">🔍</span>
            <input
              type="text"
              id="meditations-search-input"
              class="meditations-search-input"
              placeholder="Search by verse reference (e.g. Isaiah 64:12) or scripture text..."
              value="${escapeHtml(searchQuery)}"
              aria-label="Search drawings"
            />
            ${searchQuery ? `<button type="button" class="meditations-search-clear-btn" id="meditations-search-clear">✕</button>` : ''}
          </div>

          <div class="meditations-filter-group">
            <span class="meditations-filter-label">Theme:</span>
            <select class="meditations-filter-select" id="meditations-template-filter" aria-label="Filter by artwork theme">
              <option value="ALL" ${selectedTemplateFilter === 'ALL' ? 'selected' : ''}>All Themes (${totalCount})</option>
              ${MEDITATE_ART_THEME_NAMES.map((name, idx) => `
                <option value="${idx}" ${String(selectedTemplateFilter) === String(idx) ? 'selected' : ''}>${name}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <!-- Main Gallery Grid or Empty State -->
        ${filtered.length === 0 ? renderEmptyStateHtml() : `
          <div class="meditations-grid" id="meditations-grid">
            ${filtered.map(m => renderDrawingCardHtml(m)).join('')}
          </div>
        `}
      </div>

      <!-- Expand View Fullscreen Modal Backdrop -->
      <div class="meditation-modal-backdrop" id="meditation-modal-backdrop" hidden>
        <div class="meditation-modal-card" role="dialog" aria-modal="true">
          <div class="meditation-modal-header">
            <div class="meditation-modal-title-group">
              <h2 class="meditation-modal-title" id="meditation-modal-ref"></h2>
              <span class="meditation-modal-tag" id="meditation-modal-template"></span>
            </div>
            <button type="button" class="options-close-btn" id="meditation-modal-close" aria-label="Close modal">✕</button>
          </div>

          <div class="meditation-modal-canvas-wrapper" id="meditation-modal-canvas-wrapper"></div>

          <div class="meditation-modal-footer">
            <button type="button" class="btn btn-secondary btn-sm" id="meditation-modal-close-btn">Close</button>
            <button type="button" class="btn btn-primary btn-sm" id="meditation-modal-open-btn">
              ✏️ Continue Coloring in Draw Mode →
            </button>
          </div>
        </div>
      </div>
    `;

    attachEventListeners();
  }

  function renderEmptyStateHtml() {
    const isFiltered = searchQuery || selectedTemplateFilter !== 'ALL';
    if (isFiltered) {
      return `
        <div class="meditations-empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No matching drawings found</h3>
          <p>Try clearing your search query or choosing "All Themes" in the filter above.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="meditations-reset-filter-btn">
            Clear Filters
          </button>
        </div>
      `;
    }

    return `
      <div class="meditations-empty-state">
        <div class="empty-icon">🎨</div>
        <h3>No Scripture Drawings Saved Yet</h3>
        <p>
          Switch to <strong>Draw Mode</strong> to color uplifting color-by-numbers Scripture artwork.
          All your colored segments and chosen templates are saved here automatically.
        </p>
        <button type="button" class="btn btn-primary btn-md" id="meditations-start-now-btn">
          ✨ Color Your First Verse
        </button>
      </div>
    `;
  }

  function renderDrawingCardHtml(m) {
    const templateName = getArtworkTemplateName(m.templateIdx);
    const coloredSegmentsCount = Object.keys(m.fills || {}).length;
    const svgHtml = renderMeditateArtworkSvg(
      m.templateIdx,
      m.verseText,
      m.verseRef,
      m.translation || 'ESV',
      m.fills || {},
      {
        fontFamily: m.fontFamily,
        fontSize: m.fontSize,
        fontCase: m.fontCase,
        fontColor: m.fontColor,
        boxWidth: m.boxWidth,
        textX: m.textX,
        textY: m.textY
      }
    );

    return `
      <div class="meditation-card" data-key="${escapeHtml(m.key)}" data-book="${m.bookId}" data-chapter="${m.chapter}" data-verse="${m.verse}">
        <!-- Preview Box -->
        <div class="meditation-card-preview" title="Click to view full size">
          <div class="meditation-card-svg-container">
            ${svgHtml}
          </div>
          <div class="meditation-card-overlay">
            <span class="meditation-card-expand-badge">🔍 View Full Size</span>
          </div>
        </div>

        <!-- Card Content Body -->
        <div class="meditation-card-body">
          <div class="meditation-card-header">
            <strong class="meditation-card-ref">${escapeHtml(m.verseRef)}</strong>
            <span class="meditation-card-tr">${escapeHtml(m.translation || 'ESV')}</span>
          </div>

          <p class="meditation-card-template-name">${escapeHtml(templateName)}</p>

          <div class="meditation-card-meta">
            <span class="meditation-meta-pill">🎨 ${coloredSegmentsCount} colored</span>
            ${m.updatedAt ? `<span class="meditation-meta-date">${formatDate(m.updatedAt)}</span>` : ''}
          </div>
        </div>

        <!-- Card Action Footer -->
        <div class="meditation-card-footer">
          <button type="button" class="btn btn-primary btn-sm meditation-open-btn" title="Open this verse in Draw Mode">
            ✏️ Color
          </button>
          <button type="button" class="btn btn-secondary btn-sm meditation-expand-btn" title="View artwork full size">
            🔍 Expand
          </button>
          <button type="button" class="btn btn-secondary btn-sm meditation-delete-btn" title="Delete this saved drawing">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  function attachEventListeners() {
    // Search input
    const searchInput = container.querySelector('#meditations-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        render();
      });
    }

    const clearBtn = container.querySelector('#meditations-search-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchQuery = '';
        render();
      });
    }

    // Template filter select
    const templateFilter = container.querySelector('#meditations-template-filter');
    if (templateFilter) {
      templateFilter.addEventListener('change', (e) => {
        selectedTemplateFilter = e.target.value;
        trackEvent('filter_drawings_theme', { filter: selectedTemplateFilter });
        render();
      });
    }

    // Reset filter button in empty state
    const resetFilterBtn = container.querySelector('#meditations-reset-filter-btn');
    if (resetFilterBtn) {
      resetFilterBtn.addEventListener('click', () => {
        searchQuery = '';
        selectedTemplateFilter = 'ALL';
        render();
      });
    }

    // Start now CTA in empty state
    const startNowBtn = container.querySelector('#meditations-start-now-btn');
    if (startNowBtn) {
      startNowBtn.addEventListener('click', () => {
        setActiveModePref('draw');
        navigate('/draw/1/1/1');
      });
    }

    // Random verse drawing button
    const randomVerseBtn = container.querySelector('#meditations-random-verse-btn');
    if (randomVerseBtn) {
      randomVerseBtn.addEventListener('click', () => {
        setActiveModePref('draw');
        const ref = getRandomVerseRef();
        trackEvent('draw_random_verse', { bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse });
        navigate(`/draw/${ref.bookId}/${ref.chapter}/${ref.verse}`);
      });
    }

    // Open in Draw Mode
    const openTypingBtn = container.querySelector('#meditations-open-typing-btn');
    if (openTypingBtn) {
      openTypingBtn.addEventListener('click', () => {
        setActiveModePref('draw');
        navigate('/draw/1/1/1');
      });
    }

    // Card Actions: Open, Expand, Delete
    const cards = container.querySelectorAll('.meditation-card');
    cards.forEach((card) => {
      const bookId = Number(card.getAttribute('data-book'));
      const chapter = Number(card.getAttribute('data-chapter'));
      const verse = Number(card.getAttribute('data-verse'));
      const medKey = card.getAttribute('data-key');
      const med = drawings.find(m => m.key === medKey || (m.bookId === bookId && m.chapter === chapter && m.verse === verse));

      // Open in Draw Mode
      const openBtn = card.querySelector('.meditation-open-btn');
      if (openBtn) {
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          trackEvent('open_saved_drawing', { bookId, chapter, verse, templateIdx: med?.templateIdx });
          setActiveModePref('draw');
          navigate(`/draw/${bookId}/${chapter}/${verse}`);
        });
      }

      // Expand modal
      const previewEl = card.querySelector('.meditation-card-preview');
      const expandBtn = card.querySelector('.meditation-expand-btn');
      const onExpand = (e) => {
        e.stopPropagation();
        if (med) {
          trackEvent('expand_drawing_modal', { bookId, chapter, verse, templateIdx: med?.templateIdx });
          openModal(med);
        }
      };
      if (previewEl) previewEl.addEventListener('click', onExpand);
      if (expandBtn) expandBtn.addEventListener('click', onExpand);

      // Delete drawing
      const deleteBtn = card.querySelector('.meditation-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const confirmed = window.confirm(`Remove saved drawing artwork for ${med?.verseRef || 'this verse'}?`);
          if (confirmed) {
            trackEvent('delete_saved_drawing', { bookId, chapter, verse, templateIdx: med?.templateIdx });
            deleteVerseDrawing(bookId, chapter, verse);
            drawings = getAllDrawings();
            render();
          }
        });
      }
    });

    // Modal listeners
    const modalBackdrop = container.querySelector('#meditation-modal-backdrop');
    const modalCloseX = container.querySelector('#meditation-modal-close');
    const modalCloseBtn = container.querySelector('#meditation-modal-close-btn');
    const closeModal = () => {
      if (modalBackdrop) modalBackdrop.hidden = true;
    };

    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
      });
    }
    if (modalCloseX) modalCloseX.addEventListener('click', closeModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  }

  function openModal(med) {
    const modalBackdrop = container.querySelector('#meditation-modal-backdrop');
    const modalRef = container.querySelector('#meditation-modal-ref');
    const modalTemplate = container.querySelector('#meditation-modal-template');
    const modalCanvasWrapper = container.querySelector('#meditation-modal-canvas-wrapper');
    const modalOpenBtn = container.querySelector('#meditation-modal-open-btn');

    if (!modalBackdrop) return;

    if (modalRef) modalRef.textContent = `${med.verseRef} (${med.translation || 'ESV'})`;
    if (modalTemplate) modalTemplate.textContent = getArtworkTemplateName(med.templateIdx);

    if (modalCanvasWrapper) {
      modalCanvasWrapper.innerHTML = renderMeditateArtworkSvg(
        med.templateIdx,
        med.verseText,
        med.verseRef,
        med.translation || 'ESV',
        med.fills || {},
        {
          fontFamily: med.fontFamily,
          fontSize: med.fontSize,
          fontCase: med.fontCase,
          fontColor: med.fontColor,
          boxWidth: med.boxWidth,
          textX: med.textX,
          textY: med.textY
        }
      );
    }

    if (modalOpenBtn) {
      modalOpenBtn.onclick = () => {
        trackEvent('edit_drawing_from_modal', { bookId: med.bookId, chapter: med.chapter, verse: med.verse });
        setActiveModePref('draw');
        navigate(`/draw/${med.bookId}/${med.chapter}/${med.verse}`);
      };
    }

    modalBackdrop.hidden = false;
  }

  // Clean up any prior drawings listeners
  if (window.__bibleDrawingsCleanup) {
    window.__bibleDrawingsCleanup();
  }

  // Listen for background updates only while this screen is active in the DOM
  const onDrawingsUpdated = () => {
    if (!document.body.contains(container) || !container.querySelector('.meditations-screen-container')) {
      window.removeEventListener('bible:drawings-updated', onDrawingsUpdated);
      return;
    }
    drawings = getAllDrawings();
    render();
  };

  window.addEventListener('bible:drawings-updated', onDrawingsUpdated);
  window.__bibleDrawingsCleanup = () => {
    window.removeEventListener('bible:drawings-updated', onDrawingsUpdated);
    window.__bibleDrawingsCleanup = null;
  };

  render();
}

export const renderMeditationsScreen = renderDrawingsScreen;
