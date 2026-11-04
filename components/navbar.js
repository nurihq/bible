import { Auth, getGlobalTypingStats } from '../api.js';
import { trackEvent } from '../analytics.js';
import { navigate } from '../app.js';

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

    // Automatically refresh top bar WPM/CPM averages when stats update
    window.addEventListener('bible:stats-updated', () => {
      if (this.currentContainer) {
        this.updateStatsPills(this.currentContainer);
      }
    });
  }

  getNavBackInfo(route) {
    const cleanRoute = (route || '').replace(/^#/, '');
    if (cleanRoute.startsWith('/typing') || cleanRoute.startsWith('/progress')) {
      return {
        label: 'Home',
        target: '#/'
      };
    }
    return null;
  }

  updateStatsPills(container) {
    const wpmEl = container.querySelector('#nav-avg-wpm-val');
    const cpmEl = container.querySelector('#nav-avg-cpm-val');
    const reachEl = container.querySelector('#nav-reach-val');
    if (!wpmEl && !cpmEl && !reachEl) return;

    const stats = getGlobalTypingStats();
    if (wpmEl) wpmEl.textContent = `${stats.avgWpm} WPM`;
    if (cpmEl) cpmEl.textContent = `${stats.avgCpm} CPM`;
    if (reachEl) reachEl.textContent = `${stats.overallCompletedChapters}/${stats.totalBibleChapters}`;
  }

  render(container, currentRoute) {
    this.currentContainer = container;
    this.currentRoute = currentRoute;

    const isAuthed = Auth.isAuthenticated();
    const user = Auth.getUser();
    const backInfo = this.getNavBackInfo(currentRoute);
    const cleanPath = (currentRoute || '').replace(/^#/, '') || '/';
    const isTypingActive = cleanPath === '/typing' || cleanPath.startsWith('/typing/');
    const isProgressActive = cleanPath === '/progress';
    const stats = isAuthed ? getGlobalTypingStats() : null;

    container.innerHTML = `
      <header class="navbar">
        <div class="nav-left">
          ${isAuthed && backInfo ? `
            <button class="nav-back-btn" id="nav-back-btn" data-target="${backInfo.target}">
              ← <span>${backInfo.label}</span>
            </button>
          ` : ''}

          <a href="${isAuthed ? '#/' : '#/signin'}" class="nav-brand" title="bible">
            <svg class="nav-home-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <span class="nav-brand-text">bible</span>
          </a>
        </div>

        ${isAuthed && stats ? `
          <div class="nav-center-stats">
            <a href="#/progress" class="nav-stat-pill" title="Average Words & Characters Per Minute (Click for full stats)">
              <span class="nav-stat-icon">⚡</span>
              <span class="nav-stat-label">Avg:</span>
              <strong id="nav-avg-wpm-val">${stats.avgWpm} WPM</strong>
              <span class="nav-stat-sep">·</span>
              <strong id="nav-avg-cpm-val">${stats.avgCpm} CPM</strong>
            </a>

            <a href="#/progress" class="nav-stat-pill nav-stat-pill-reach" title="Overall Bible Chapters Completed (${stats.overallPercentage}%)">
              <span class="nav-stat-icon">📖</span>
              <strong id="nav-reach-val">${stats.overallCompletedChapters}/${stats.totalBibleChapters}</strong>
              <span class="nav-stat-sub">ch</span>
            </a>
          </div>
        ` : ''}

        <div class="nav-right">
          ${isAuthed ? `
            <a href="#/typing" class="nav-about-btn ${isTypingActive ? 'active' : ''}" title="Bible Typing App">
              <span>⌨️</span>
              <span class="nav-about-text">Typing</span>
            </a>

            <a href="#/progress" class="nav-about-btn ${isProgressActive ? 'active' : ''}" title="Typing Progress & Bible Reach">
              <span>📊</span>
              <span class="nav-about-text">Progress</span>
            </a>
          ` : ''}

          <button class="icon-btn" id="theme-toggle-btn" title="${this.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}">
            ${this.theme === 'dark' ? '☀️' : '🌙'}
          </button>

          ${isAuthed ? `
            <div class="nav-user-chip" title="${user?.email || ''}">
              ${user?.picture ? `<img src="${user.picture}" alt="" class="nav-user-avatar" referrerpolicy="no-referrer" />` : ''}
              <span class="nav-user-name">${(user?.name || 'User').split(' ')[0]}</span>
            </div>
            <button class="btn-signout" id="nav-signout-btn">
              Sign Out
            </button>
          ` : ''}
        </div>
      </header>
    `;

    const backBtn = container.querySelector('#nav-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        const target = backBtn.getAttribute('data-target');
        trackEvent('nav_back_click', { target: target || 'history' });
        if (target) {
          navigate(target);
        } else {
          window.history.back();
        }
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
        trackEvent('sign_out');
        Auth.signOut();
        if (this.onSignOut) this.onSignOut();
        navigate('#/signin');
      });
    }
  }
}
