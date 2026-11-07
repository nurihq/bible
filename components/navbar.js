import {
  Auth,
  getLocalStore,
  getPreferredTranslation,
  setPreferredTranslation,
  getChapterProgressSummary,
  getAllMeditations,
  getAllFavorites
} from '../api.js?v=20261107_v1';
import {
  BIBLE_BOOKS,
  BIBLE_TRANSLATIONS,
  getBookById,
  getChapterVerseCount,
  searchBibleChapters
} from '../bible-data.js?v=20261107_v1';
import { trackEvent } from '../analytics.js?v=20261107_v1';
import { navigate } from '../app.js?v=20261107_v1';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class Navbar {
  constructor(onThemeChange, onSignOut) {
    this.onThemeChange = onThemeChange;
    this.onSignOut = onSignOut;
    this.theme =
      localStorage.getItem('bible_theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', this.theme);
    this.currentContainer = null;
    this.currentRoute = '#/';

    // Browse drawer state
    this.drawerOpen = false;
    this.drawerTestament = 'ALL';
    this.drawerBookId = 1;
    // Re-render immediately when authentication state changes
    window.addEventListener('bible:auth-changed', () => {
      if (this.currentContainer) {
        this.render(this.currentContainer, this.currentRoute || window.location.hash);
      }
    });

    window.addEventListener('bible:favorites-updated', () => {
      const badge = document.querySelector('#nav-menu-favorites-btn .nav-item-badge');
      if (badge) {
        badge.textContent = String(getAllFavorites().length);
      }
    });

    // Cmd/Ctrl+K focuses the search bar from anywhere
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const input = document.getElementById('nav-search-input');
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
      }
    });

    // Close search dropdown when clicking elsewhere
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('nav-search-dropdown');
      if (dropdown && !e.target.closest('#nav-search-wrapper')) {
        dropdown.hidden = true;
      }
    });
  }

  getNavBackInfo(route) {
    const cleanRoute = (route || '').replace(/^#/, '');
    if (cleanRoute === '/signin') {
      return { label: 'Home', target: '#/' };
    }
    return null;
  }

  /** Current passage derived from the route (falls back to last opened chapter) */
  getCurrentPassage(cleanPath) {
    const m = (cleanPath || '').match(/^\/typing\/(\d+)\/(\d+)(?:\/(\d+))?/);
    if (m) {
      return { bookId: Number(m[1]), chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : null };
    }
    const store = getLocalStore();
    return { bookId: store.lastBookId || 1, chapter: store.lastChapter || 1, verse: null };
  }

  closeDrawer() {
    this.drawerOpen = false;
    document.body.classList.remove('browse-open');
    const drawerRoot = document.getElementById('browse-drawer-root');
    if (drawerRoot) drawerRoot.hidden = true;
    const btn = document.getElementById('nav-browse-btn');
    if (btn) btn.classList.remove('is-open');
  }

  openDrawer() {
    const passage = this.getCurrentPassage((this.currentRoute || '').replace(/^#/, ''));
    this.drawerBookId = passage.bookId;
    this.drawerChapter = passage.chapter;
    this.drawerOpen = true;
    document.body.classList.add('browse-open');

    const header = document.querySelector('.navbar');
    const top = header ? Math.round(header.getBoundingClientRect().bottom) : 64;
    document.documentElement.style.setProperty('--browse-top', `${top}px`);

    const drawerRoot = document.getElementById('browse-drawer-root');
    if (drawerRoot) drawerRoot.hidden = false;
    const btn = document.getElementById('nav-browse-btn');
    if (btn) btn.classList.add('is-open');
    const dropdown = document.getElementById('nav-search-dropdown');
    if (dropdown) dropdown.hidden = true;
    this.renderDrawer();
  }

  toggleDrawer() {
    if (this.drawerOpen) this.closeDrawer();
    else this.openDrawer();
  }

  renderDrawer() {
    const root = document.getElementById('browse-drawer-root');
    if (!root) return;

    const passage = this.getCurrentPassage((this.currentRoute || '').replace(/^#/, ''));
    const filteredBooks = BIBLE_BOOKS.filter(b =>
      this.drawerTestament === 'ALL' ? true : b.testament === this.drawerTestament
    );
    if (!filteredBooks.some(b => b.id === this.drawerBookId) && filteredBooks.length > 0) {
      this.drawerBookId = filteredBooks[0].id;
      this.drawerChapter = 1;
    }

    const selBook = getBookById(this.drawerBookId);
    if (this.drawerChapter > selBook.chapters) this.drawerChapter = 1;

    const booksHtml = filteredBooks.map(b => {
      let done = 0;
      let partial = 0;
      for (let c = 1; c <= b.chapters; c++) {
        const s = getChapterProgressSummary(b.id, c, 'ALL');
        if (s.isFullyCompleted) done++;
        else if (s.isPartial) partial++;
      }
      let badge = `${b.chapters}`;
      if (done > 0 && partial > 0) badge = `✓ ${done}/${b.chapters} +${partial}p`;
      else if (done > 0) badge = `✓ ${done}/${b.chapters}`;
      else if (partial > 0) badge = `⏳ ${partial}/${b.chapters}`;
      return `
        <button type="button" class="drawer-book-item ${b.id === this.drawerBookId ? 'active' : ''} ${done === b.chapters ? 'is-book-complete' : ''}" data-book-id="${b.id}">
          <span class="drawer-book-name">${b.name}</span>
          <span class="drawer-book-progress">${badge}</span>
        </button>`;
    }).join('');

    const chapterBtns = [];
    for (let c = 1; c <= selBook.chapters; c++) {
      const s = getChapterProgressSummary(selBook.id, c, 'ALL');
      const isCurrent = selBook.id === passage.bookId && c === passage.chapter;
      const pct = s.totalVerses > 0 ? Math.min(100, Math.round((s.completedVersesCount / s.totalVerses) * 100)) : 0;
      let cls = '';
      if (s.isBoth) cls = 'is-both is-completed';
      else if (s.isFullyTyped) cls = 'is-completed';
      else if (s.isFullyRead) cls = 'is-read';
      else if (s.isPartial) cls = 'is-partial';

      const title = s.isBoth
        ? `${selBook.name} ${c} — Read & Typed (${s.totalVerses}/${s.totalVerses} verses)`
        : (s.isFullyTyped
          ? `${selBook.name} ${c} — Typed (${s.totalVerses}/${s.totalVerses} verses)`
          : (s.isFullyRead
            ? `${selBook.name} ${c} — Read (${s.totalVerses}/${s.totalVerses} verses)`
            : (s.isPartial
              ? `${selBook.name} ${c} — ${s.completedVersesCount}/${s.totalVerses} verses`
              : `${selBook.name} ${c} — ${s.totalVerses} verses`)));

      chapterBtns.push(`
        <button type="button" class="drawer-chapter-pill ${cls} ${isCurrent ? 'is-current' : ''} ${c === this.drawerChapter ? 'is-drawer-selected' : ''}"
          data-chapter="${c}" title="${title}">
          <span>${c}</span>
          <span class="drawer-ch-bar"><i style="width:${s.isFullyCompleted ? 100 : pct}%"></i></span>
        </button>`);
    }

    const chSum = getChapterProgressSummary(selBook.id, this.drawerChapter, 'ALL');
    const verseCount = getChapterVerseCount(selBook.id, this.drawerChapter) || chSum.totalVerses;
    const verseBtns = [];
    for (let v = 1; v <= verseCount; v++) {
      const vRec = chSum.record?.completedVerses?.[String(v)];
      const vIsRead = Boolean(chSum.isFullyRead || vRec?.isRead);
      const vIsTyped = Boolean(chSum.isFullyTyped || vRec?.isTyped || (vRec?.count && vRec.count > 0));
      let vCls = '';
      let vBadge = '';
      if (vIsRead && vIsTyped) {
        vCls = 'is-both';
        vBadge = '<span class="drawer-v-check">✓</span>';
      } else if (vIsTyped) {
        vCls = 'is-completed';
        vBadge = '<span class="drawer-v-check">✓</span>';
      } else if (vIsRead) {
        vCls = 'is-read';
        vBadge = '<span class="drawer-v-check">📖</span>';
      }

      verseBtns.push(`
        <button type="button" class="drawer-verse-pill ${vCls}" data-verse="${v}"
          title="Type only ${selBook.name} ${this.drawerChapter}:${v}${vIsRead && vIsTyped ? ' (Read & Typed)' : vIsTyped ? ' (Typed)' : vIsRead ? ' (Read)' : ''}">
          ${v}${vBadge}
        </button>`);
    }

    root.innerHTML = `
      <div class="browse-drawer-backdrop" id="browse-drawer-backdrop"></div>
      <div class="browse-drawer" role="dialog" aria-label="Browse books, chapters and verses">
        <div class="book-browser-header">
          <div class="book-browser-tabs">
            <button class="book-tab-btn ${this.drawerTestament === 'ALL' ? 'active' : ''}" data-testament="ALL">All 66</button>
            <button class="book-tab-btn ${this.drawerTestament === 'OT' ? 'active' : ''}" data-testament="OT">Old Testament</button>
            <button class="book-tab-btn ${this.drawerTestament === 'NT' ? 'active' : ''}" data-testament="NT">New Testament</button>
          </div>
          <button class="btn btn-secondary btn-sm" id="close-browse-drawer-btn">Close ✕</button>
        </div>
        <div class="book-browser-body">
          <div class="book-browser-books-list">${booksHtml}</div>
          <div class="book-browser-chapters-panel">
            <div class="drawer-chapters-header">
              <strong>${selBook.name}</strong>
              <span>${selBook.category} · ${selBook.chapters} chapters — pick a chapter, then a verse or the whole chapter</span>
            </div>
            <div class="drawer-chapters-grid">${chapterBtns.join('')}</div>
            <div class="drawer-verses-section">
              <div class="drawer-verses-header">
                <span><strong>${selBook.name} ${this.drawerChapter}</strong> · ${verseCount} verses${chSum.completedVersesCount > 0 ? ` · ${chSum.isFullyCompleted ? verseCount : chSum.completedVersesCount} done` : ''} — click a verse to type just that verse</span>
                <button type="button" class="btn btn-primary btn-sm" id="drawer-open-chapter-btn">📖 Open entire ${selBook.name} ${this.drawerChapter} →</button>
              </div>
              <div class="drawer-verses-grid">${verseBtns.join('')}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    root.querySelector('#browse-drawer-backdrop').addEventListener('click', () => this.closeDrawer());
    root.querySelector('#close-browse-drawer-btn').addEventListener('click', () => this.closeDrawer());

    root.querySelectorAll('.book-tab-btn').forEach(tab => {
      tab.addEventListener('click', () => {
        this.drawerTestament = tab.getAttribute('data-testament');
        this.renderDrawer();
      });
    });

    root.querySelectorAll('.drawer-book-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.drawerBookId = Number(btn.getAttribute('data-book-id'));
        this.drawerChapter = 1;
        this.renderDrawer();
      });
    });

    root.querySelectorAll('.drawer-chapter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.drawerChapter = Number(btn.getAttribute('data-chapter'));
        this.renderDrawer();
      });
      btn.addEventListener('dblclick', () => {
        const ch = Number(btn.getAttribute('data-chapter'));
        trackEvent('drawer_select_chapter', { bookId: selBook.id, chapter: ch });
        this.closeDrawer();
        navigate(`#/typing/${selBook.id}/${ch}`);
      });
    });

    root.querySelectorAll('.drawer-verse-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = Number(btn.getAttribute('data-verse'));
        trackEvent('drawer_select_verse', { bookId: selBook.id, chapter: this.drawerChapter, verse: v });
        this.closeDrawer();
        navigate(`#/typing/${selBook.id}/${this.drawerChapter}/${v}`);
      });
    });

    root.querySelector('#drawer-open-chapter-btn').addEventListener('click', () => {
      trackEvent('drawer_open_chapter', { bookId: selBook.id, chapter: this.drawerChapter });
      this.closeDrawer();
      navigate(`#/typing/${selBook.id}/${this.drawerChapter}`);
    });

    // Keep the selected chapter in view
    const selectedPill = root.querySelector('.drawer-chapter-pill.is-drawer-selected');
    if (selectedPill && selectedPill.scrollIntoView) {
      selectedPill.scrollIntoView({ block: 'nearest' });
    }
  }

  navigateToSearchResult(r) {
    const input = document.getElementById('nav-search-input');
    const dropdown = document.getElementById('nav-search-dropdown');
    if (dropdown) dropdown.hidden = true;
    if (input) {
      input.value = '';
      input.blur();
    }
    trackEvent('bible_search_select', { label: r.label, mode: r.mode || 'chapter' });
    if (r.mode === 'verse' && r.verse) {
      navigate(`#/typing/${r.bookId}/${r.chapter}/${r.verse}`);
    } else if (r.mode === 'chapter-at-verse' && r.verse) {
      navigate(`#/typing/${r.bookId}/${r.chapter}?verse=${r.verse}`);
    } else {
      navigate(`#/typing/${r.bookId}/${r.chapter}`);
    }
  }

  renderSearchDropdown(query) {
    const dropdown = document.getElementById('nav-search-dropdown');
    if (!dropdown) return;
    const results = searchBibleChapters(query, 10);
    if (results.length === 0) {
      dropdown.hidden = true;
      return;
    }

    dropdown.innerHTML = results.map((r, idx) => {
      const sum = getChapterProgressSummary(r.bookId, r.chapter, 'ALL');
      let badge = `<span class="search-go-hint">${r.mode === 'verse' ? 'Single verse →' : 'Type →'}</span>`;
      if (r.mode === 'verse' && r.verse) {
        if (sum.isFullyCompleted || sum.completedVerseNums.includes(Number(r.verse))) {
          badge = '<span class="search-done-badge">✓ Verse done</span>';
        }
      } else if (sum.isFullyCompleted) {
        badge = `<span class="search-done-badge">✓ ${sum.totalVerses}/${sum.totalVerses}v</span>`;
      } else if (sum.isPartial) {
        badge = `<span class="search-partial-badge">⏳ ${sum.completedVersesCount}/${sum.totalVerses}v</span>`;
      }
      return `
        <button type="button" class="search-result-item ${idx === 0 ? 'is-first' : ''}" data-res-idx="${idx}">
          <div class="search-result-left">
            <strong>${escapeHtml(r.label)}</strong>
            <span class="search-result-cat">${escapeHtml(r.subtitle || `${r.testament} · ${r.category}`)}</span>
          </div>
          <div class="search-result-right">${badge}</div>
        </button>`;
    }).join('');
    dropdown.hidden = false;

    dropdown.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const r = results[Number(item.getAttribute('data-res-idx'))];
        if (r) this.navigateToSearchResult(r);
      });
    });
  }

  render(container, currentRoute) {
    this.currentContainer = container;
    this.currentRoute = currentRoute;
    this.closeDrawer();

    const isAuthed = Auth.isAuthenticated();
    const user = Auth.getUser();
    const backInfo = this.getNavBackInfo(currentRoute);
    const cleanPath = (currentRoute || '').replace(/^#/, '') || '/';
    const isHomeScreen = cleanPath === '/' || cleanPath === '';
    const isSignInScreen = cleanPath === '/signin';
    const isTypingActive = cleanPath === '/typing' || cleanPath.startsWith('/typing/');
    const isProgressActive = cleanPath === '/progress';
    const isMeditationsActive = cleanPath === '/meditations';
    const isFavoritesActive = cleanPath === '/favorites';
    const allMeds = getAllMeditations();
    const meditationCount = allMeds.length;
    const allFavs = getAllFavorites();
    const favoritesCount = allFavs.length;
    const showUnauthBanner = !isAuthed && !isHomeScreen && !isSignInScreen;
    const showTools = !isHomeScreen && !isSignInScreen;

    const passage = this.getCurrentPassage(cleanPath);
    const passageBook = getBookById(passage.bookId);
    const browseLabel = `${passageBook.name} ${passage.chapter}${passage.verse ? `:${passage.verse}` : ''}`;
    const activeTr = getPreferredTranslation();

    container.innerHTML = `
      <header class="navbar">
        <div class="nav-left">
          ${backInfo ? `
            <button class="nav-back-btn" id="nav-back-btn" data-target="${backInfo.target}">
              ← <span>${backInfo.label}</span>
            </button>
          ` : ''}

          <a href="#/" class="nav-brand" title="bible">
            <svg class="nav-home-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span class="nav-brand-text">bible</span>
          </a>
        </div>

        ${showTools ? `
          <div class="nav-center-tools">
            <div class="nav-search-wrapper" id="nav-search-wrapper">
              <span class="nav-search-icon">🔍</span>
              <input
                type="text"
                class="nav-search-input"
                id="nav-search-input"
                placeholder="Search e.g. Psalm 23, Prov 3:5, Rom 8"
                autocomplete="off"
                aria-label="Search for a chapter or verse"
              />
              <div class="chapter-search-dropdown" id="nav-search-dropdown" hidden></div>
            </div>

            <button type="button" class="nav-browse-btn" id="nav-browse-btn" title="Browse books, chapters &amp; verses">
              <span>📚</span>
              <span class="nav-browse-label">${escapeHtml(browseLabel)}</span>
              <span class="nav-browse-caret">▾</span>
            </button>

            <select class="nav-translation-select" id="nav-translation-select" title="Bible translation (default ESV)" aria-label="Bible translation">
              ${BIBLE_TRANSLATIONS.map(t => `
                <option value="${t.code}" ${t.code === activeTr ? 'selected' : ''}>${t.shortName}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        <div class="nav-right">
          ${!isHomeScreen && !isSignInScreen ? `
            <a href="#/typing" class="nav-about-btn ${isTypingActive ? 'active' : ''}" title="Bible Typing">
              <span>⌨️</span>
              <span class="nav-about-text">Typing</span>
            </a>

            <a href="#/progress" class="nav-about-btn ${isProgressActive ? 'active' : ''}" title="Typing Progress &amp; Bible Reach">
              <span>📊</span>
              <span class="nav-about-text">Progress</span>
            </a>
          ` : ''}

          <button class="icon-btn" id="theme-toggle-btn" title="${this.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}">
            ${this.theme === 'dark' ? '☀️' : '🌙'}
          </button>

          <!-- User Profile Avatar & Dropdown Menu -->
          <div class="nav-profile-menu-container" id="nav-profile-menu-container">
            <button
              type="button"
              class="nav-user-chip nav-user-chip-btn ${!isAuthed ? 'nav-guest-chip' : ''}"
              id="nav-profile-dropdown-btn"
              title="${isAuthed ? `Account & Meditations (${escapeHtml(user?.email || '')})` : 'Menu & Meditations'}"
              aria-haspopup="true"
              aria-expanded="false"
            >
              ${isAuthed && user?.picture
                ? `<img src="${escapeHtml(user.picture)}" alt="" class="nav-user-avatar" referrerpolicy="no-referrer" />`
                : `<span class="nav-user-avatar-fallback">${isAuthed ? escapeHtml((user?.name || user?.email || 'U').charAt(0).toUpperCase()) : '👤'}</span>`
              }
              <span class="nav-user-name">${escapeHtml(isAuthed ? (user?.name || 'User').split(' ')[0] : 'Menu')}</span>
              <span class="nav-profile-caret">▾</span>
            </button>

            <div class="nav-profile-dropdown" id="nav-profile-dropdown" hidden>
              <div class="nav-profile-dropdown-header">
                <div class="nav-profile-dropdown-avatar">
                  ${isAuthed && user?.picture
                    ? `<img src="${escapeHtml(user.picture)}" alt="" referrerpolicy="no-referrer" />`
                    : `<span>${isAuthed ? escapeHtml((user?.name || user?.email || 'U').charAt(0).toUpperCase()) : '👤'}</span>`
                  }
                </div>
                <div class="nav-profile-dropdown-info">
                  <strong class="nav-profile-dropdown-name">${escapeHtml(isAuthed ? (user?.name || 'User') : 'Guest User')}</strong>
                  <span class="nav-profile-dropdown-email">${escapeHtml(isAuthed ? (user?.email || '') : 'Not signed in')}</span>
                </div>
              </div>

              <div class="nav-profile-dropdown-divider"></div>

              <div class="nav-profile-dropdown-menu">
                <a href="#/favorites" class="nav-profile-dropdown-item ${isFavoritesActive ? 'active' : ''}" id="nav-menu-favorites-btn">
                  <span class="nav-item-icon">❤️</span>
                  <span class="nav-item-title">Favorites</span>
                  <span class="nav-item-badge">${favoritesCount}</span>
                </a>

                <a href="#/meditations" class="nav-profile-dropdown-item ${isMeditationsActive ? 'active' : ''}" id="nav-menu-meditations-btn">
                  <span class="nav-item-icon">🎨</span>
                  <span class="nav-item-title">Meditations</span>
                  <span class="nav-item-badge">${meditationCount}</span>
                </a>
              </div>

              <div class="nav-profile-dropdown-divider"></div>

              <div class="nav-profile-dropdown-footer">
                ${isAuthed ? `
                  <button type="button" class="nav-profile-dropdown-item is-signout" id="nav-signout-btn">
                    <span class="nav-item-icon">🚪</span>
                    <span class="nav-item-title">Sign Out</span>
                  </button>
                ` : `
                  <a href="#/signin" class="btn btn-primary btn-sm" style="width: 100%; justify-content: center; text-decoration: none;">
                    Sign In
                  </a>
                `}
              </div>
            </div>
          </div>
        </div>
      </header>
      ${showUnauthBanner ? `
        <div class="unauth-warning-banner" role="alert">
          <div class="unauth-warning-content">
            <span class="unauth-warning-icon">⚠️</span>
            <span class="unauth-warning-text">
              <strong>You are not signed in.</strong> Any completed chapters, verses, or typing stats you record are not synced to your account and will be lost.
            </span>
          </div>
          <a href="#/signin" class="unauth-warning-cta">Sign In to Save →</a>
        </div>
      ` : ''}
      <div id="browse-drawer-root" hidden></div>
    `;

    // Back button
    const backBtn = container.querySelector('#nav-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const target = backBtn.getAttribute('data-target');
        trackEvent('nav_back_click', { target: target || 'history' });
        if (target) navigate(target);
        else window.history.back();
      });
    }

    // Search bar
    const searchInput = container.querySelector('#nav-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim();
        const dropdown = container.querySelector('#nav-search-dropdown');
        if (!q) {
          if (dropdown) dropdown.hidden = true;
          return;
        }
        this.renderSearchDropdown(q);
      });
      searchInput.addEventListener('focus', () => {
        if (this.drawerOpen) this.closeDrawer();
        const q = searchInput.value.trim();
        if (q) this.renderSearchDropdown(q);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const results = searchBibleChapters(searchInput.value, 1);
          if (results.length > 0) {
            e.preventDefault();
            this.navigateToSearchResult(results[0]);
          }
        } else if (e.key === 'Escape') {
          const dropdown = container.querySelector('#nav-search-dropdown');
          if (dropdown) dropdown.hidden = true;
          searchInput.blur();
        }
      });
    }

    // Single combined browse control (books → chapters → verses)
    const browseBtn = container.querySelector('#nav-browse-btn');
    if (browseBtn) {
      browseBtn.addEventListener('click', () => this.toggleDrawer());
    }

    // Translation selector
    const trSelect = container.querySelector('#nav-translation-select');
    if (trSelect) {
      trSelect.addEventListener('change', () => {
        setPreferredTranslation(trSelect.value);
        trackEvent('change_bible_translation', { translation: trSelect.value });
        trSelect.blur();
      });
    }

    const themeBtn = container.querySelector('#theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', this.theme);
        localStorage.setItem('bible_theme', this.theme);
        themeBtn.textContent = this.theme === 'dark' ? '☀️' : '🌙';
        trackEvent('theme_change', { theme: this.theme });
        if (this.onThemeChange) this.onThemeChange(this.theme);
      });
    }

    const signOutBtn = container.querySelector('#nav-signout-btn');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        const dropdown = container.querySelector('#nav-profile-dropdown');
        if (dropdown) dropdown.hidden = true;
        trackEvent('sign_out');
        Auth.signOut();
        if (this.onSignOut) this.onSignOut();
        navigate('#/');
      });
    }

    // Profile Dropdown Menu interaction
    const profileBtn = container.querySelector('#nav-profile-dropdown-btn');
    const profileDropdown = container.querySelector('#nav-profile-dropdown');
    if (profileBtn && profileDropdown) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.drawerOpen) this.closeDrawer();
        const willOpen = profileDropdown.hidden;
        profileDropdown.hidden = !willOpen;
        profileBtn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) {
          trackEvent('open_profile_dropdown');
        }
      });

      profileDropdown.addEventListener('click', (e) => {
        const linkOrBtn = e.target.closest('a, button');
        if (linkOrBtn && linkOrBtn.id !== 'nav-profile-dropdown-btn') {
          profileDropdown.hidden = true;
          profileBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Close profile dropdown when clicking outside
    if (!this._profileDocListenerAttached) {
      this._profileDocListenerAttached = true;
      document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('nav-profile-dropdown');
        const menuWrapper = document.getElementById('nav-profile-menu-container');
        if (dropdown && !dropdown.hidden && (!menuWrapper || !menuWrapper.contains(e.target))) {
          dropdown.hidden = true;
          const btn = document.getElementById('nav-profile-dropdown-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          const dropdown = document.getElementById('nav-profile-dropdown');
          if (dropdown && !dropdown.hidden) {
            dropdown.hidden = true;
            const btn = document.getElementById('nav-profile-dropdown-btn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    }
  }
}
