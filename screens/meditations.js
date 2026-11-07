import {
  getAllMeditations,
  deleteVerseMeditation,
  setMeditateModePref,
  getPreferredTranslation
} from '../api.js?v=20261107_v1';
import {
  renderMeditateArtworkSvg,
  getArtworkTemplateName,
  MEDITATE_ART_THEME_NAMES,
  TOTAL_MEDITATE_ART_TEMPLATES
} from '../meditate-art.js?v=20261107_v1';
import { getBookById, getRandomVerseRef } from '../bible-data.js?v=20261107_v1';
import { trackEvent } from '../analytics.js?v=20261107_v1';
import { navigate } from '../app.js?v=20261107_v1';

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

export function renderMeditationsScreen(container) {
  let meditations = getAllMeditations();
  let searchQuery = '';
  let selectedTemplateFilter = 'ALL'; // 'ALL' or theme index 0..9

  function getFilteredMeditations() {
    return meditations.filter((m) => {
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
    const filtered = getFilteredMeditations();
    const totalCount = meditations.length;

    container.innerHTML = `
      <div class="meditations-screen-container">
        <!-- Top Screen Header -->
        <div class="meditations-header">
          <div class="meditations-header-main">
            <h1 class="meditations-title">🎨 Scripture Meditations</h1>
            <p class="meditations-subtitle">
              Reflect on God's Word through your colored Scripture artwork and contemplative verses.
            </p>
          </div>

          <div class="meditations-header-actions">
            <button type="button" class="btn btn-primary btn-sm" id="meditations-random-verse-btn" title="Pick a random verse to meditate on">
              🎲 Random Verse Meditation
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="meditations-open-typing-btn" title="Open Scripture typing in Meditate Mode">
              ✨ Start New Meditation
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
              aria-label="Search meditations"
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
            ${filtered.map(m => renderMeditationCardHtml(m)).join('')}
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
              ✏️ Continue Coloring in Meditate Mode →
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
          <h3>No matching meditations found</h3>
          <p>Try clearing your search query or choosing "All Artworks" in the filter above.</p>
          <button type="button" class="btn btn-secondary btn-sm" id="meditations-reset-filter-btn">
            Clear Filters
          </button>
        </div>
      `;
    }

    return `
      <div class="meditations-empty-state">
        <div class="empty-icon">🎨</div>
        <h3>No Scripture Meditations Saved Yet</h3>
        <p>
          In <strong>Single Verse Mode</strong>, turn on <strong>Meditate Mode</strong> to color uplifting color-by-numbers Scripture artwork.
          All your colored segments and chosen templates are saved here automatically.
        </p>
        <button type="button" class="btn btn-primary btn-md" id="meditations-start-now-btn">
          ✨ Color Your First Verse
        </button>
      </div>
    `;
  }

  function renderMeditationCardHtml(m) {
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
          <button type="button" class="btn btn-primary btn-sm meditation-open-btn" title="Open this verse in Meditate Mode">
            ✏️ Color
          </button>
          <button type="button" class="btn btn-secondary btn-sm meditation-expand-btn" title="View artwork full size">
            🔍 Expand
          </button>
          <button type="button" class="btn btn-secondary btn-sm meditation-delete-btn" title="Delete this saved meditation">
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
        setMeditateModePref(true);
        navigate('#/typing/1/1/1');
      });
    }

    // Random verse meditation button
    const randomVerseBtn = container.querySelector('#meditations-random-verse-btn');
    if (randomVerseBtn) {
      randomVerseBtn.addEventListener('click', () => {
        setMeditateModePref(true);
        const ref = getRandomVerseRef();
        trackEvent('meditate_random_verse', { bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse });
        navigate(`#/typing/${ref.bookId}/${ref.chapter}/${ref.verse}`);
      });
    }

    // Open typing in Meditate Mode
    const openTypingBtn = container.querySelector('#meditations-open-typing-btn');
    if (openTypingBtn) {
      openTypingBtn.addEventListener('click', () => {
        setMeditateModePref(true);
        navigate('#/typing/1/1/1');
      });
    }

    // Card Actions: Open, Expand, Delete
    const cards = container.querySelectorAll('.meditation-card');
    cards.forEach((card) => {
      const bookId = Number(card.getAttribute('data-book'));
      const chapter = Number(card.getAttribute('data-chapter'));
      const verse = Number(card.getAttribute('data-verse'));
      const medKey = card.getAttribute('data-key');
      const med = meditations.find(m => m.key === medKey || (m.bookId === bookId && m.chapter === chapter && m.verse === verse));

      // Open in Meditate Mode
      const openBtn = card.querySelector('.meditation-open-btn');
      if (openBtn) {
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          setMeditateModePref(true);
          navigate(`#/typing/${bookId}/${chapter}/${verse}`);
        });
      }

      // Expand modal
      const previewEl = card.querySelector('.meditation-card-preview');
      const expandBtn = card.querySelector('.meditation-expand-btn');
      const onExpand = (e) => {
        e.stopPropagation();
        if (med) openModal(med);
      };
      if (previewEl) previewEl.addEventListener('click', onExpand);
      if (expandBtn) expandBtn.addEventListener('click', onExpand);

      // Delete meditation
      const deleteBtn = card.querySelector('.meditation-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const confirmed = window.confirm(`Remove saved meditation artwork for ${med?.verseRef || 'this verse'}?`);
          if (confirmed) {
            deleteVerseMeditation(bookId, chapter, verse);
            meditations = getAllMeditations();
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
          textX: med.textX,
          textY: med.textY
        }
      );
    }

    if (modalOpenBtn) {
      modalOpenBtn.onclick = () => {
        setMeditateModePref(true);
        navigate(`#/typing/${med.bookId}/${med.chapter}/${med.verse}`);
      };
    }

    modalBackdrop.hidden = false;
  }

  // Listen for background updates to meditations
  const onMeditationsUpdated = () => {
    meditations = getAllMeditations();
    render();
  };
  window.addEventListener('bible:meditations-updated', onMeditationsUpdated);

  render();
}
