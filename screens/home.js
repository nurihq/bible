import { Auth, getGlobalTypingStats, getLocalStore, getPreferredTranslation } from '../api.js?v=20261104_v4';
import { getBookById, getNextChapterRef, getTranslationByCode } from '../bible-data.js?v=20261104_v4';
import { trackEvent } from '../analytics.js?v=20261104_v4';
import { navigate } from '../app.js?v=20261104_v4';

export { renderLandingScreen as renderHomeScreen };

export function renderLandingScreen(container) {
  const PREVIEW_CARDS = [
    {
      ref: 'Genesis 1:1',
      translation: 'ESV',
      verseNum: '1',
      frontText: 'In the beginning, God created the heavens and the earth.',
      backTitle: 'Chapter 1 · 31 Verses',
      backMeta: '798 words · ~4,120 chars · Law'
    },
    {
      ref: 'Psalm 23:1',
      translation: 'ESV',
      verseNum: '1',
      frontText: 'The LORD is my shepherd; I shall not want.',
      backTitle: 'Psalm 23 · 6 Verses',
      backMeta: '115 words · ~570 chars · Poetry'
    },
    {
      ref: 'John 1:1',
      translation: 'ESV',
      verseNum: '1',
      frontText: 'In the beginning was the Word, and the Word was with God...',
      backTitle: 'Chapter 1 · 51 Verses',
      backMeta: '1,032 words · ~5,180 chars · Gospels'
    }
  ];

  container.innerHTML = `
    <div class="hero-wrapper">
      <div class="hero-badge">
        <span>✨</span>
        <span>66 Books · 1,189 Chapters · 22 Translations</span>
      </div>

      <h1 class="hero-title">bible</h1>
      <p class="hero-subtitle">
        Internalize Scripture at your keyboard. Type through any chapter of the Bible, track your WPM &amp; CPM speed, and map your reach across all 1,189 chapters.
      </p>

      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" id="home-start-btn">
          <span>Start Typing</span>
          <span style="font-size: 1.15rem;">→</span>
        </button>
      </div>

      <!-- Interactive 3D Flippable Preview Cards -->
      <div class="hero-preview-cards" id="hero-cards-container">
        ${PREVIEW_CARDS.map((card, idx) => `
          <div class="home-card-stage" data-card-idx="${idx}" data-ref="${card.ref}" title="Click to flip">
            <div class="home-card-inner">
              <!-- Front Side: Verse Text Preview -->
              <div class="home-card-face home-card-front">
                <div class="home-card-top-tag">
                  <span>📖</span>
                  <span>${card.ref} (${card.translation})</span>
                </div>
                <div class="home-card-verse-preview">
                  <sup class="verse-num">${card.verseNum}</sup>${card.frontText}
                </div>
                <div class="home-card-hint">Tap to flip</div>
              </div>

              <!-- Back Side: Chapter Typing Info -->
              <div class="home-card-face home-card-back">
                <div class="home-card-top-tag">
                  <span>⌨️</span>
                  <span>Typing Specs</span>
                </div>
                <div class="home-card-word">${card.backTitle}</div>
                <div class="home-card-pronunciation">${card.backMeta}</div>
                <div class="home-card-hint">Tap to flip back</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.home-card-stage').forEach(stage => {
    stage.addEventListener('click', () => {
      stage.classList.toggle('is-flipped');
      trackEvent('home_card_flip', { ref: stage.getAttribute('data-ref') });
    });
  });

  const startBtn = container.querySelector('#home-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      trackEvent('home_start_click', { authenticated: Auth.isAuthenticated() });
      if (Auth.isAuthenticated()) {
        navigate('#/hub');
      } else {
        navigate('#/signin');
      }
    });
  }
}

export function renderHubScreen(container) {
  const user = Auth.getUser();
  const isAuthed = Auth.isAuthenticated();
  const firstName = isAuthed ? (user?.name || 'Friend').split(' ')[0] : null;
  const stats = getGlobalTypingStats();
  const store = getLocalStore();
  const prefTr = getTranslationByCode(getPreferredTranslation());

  let suggestedRef = { bookId: 1, bookName: 'Genesis', chapter: 1 };
  if (stats.sessions.length > 0) {
    const latest = stats.sessions[0];
    suggestedRef = getNextChapterRef(latest.bookId, latest.chapter);
  } else if (store.lastBookId && store.lastChapter) {
    const b = getBookById(store.lastBookId);
    suggestedRef = { bookId: b.id, bookName: b.name, chapter: store.lastChapter };
  }

  const latestSession = stats.sessions[0] || null;
  const fillWidth = stats.overallCompletedChapters > 0
    ? Math.max(stats.overallPercentage, 2)
    : 0;

  container.innerHTML = `
    <div class="hub-container">
      <div class="screen-header">
        <div class="screen-title-group">
          <div class="screen-lang-tag">
            <span>✨</span>
            <span>${firstName ? `Welcome back, ${firstName}` : 'Scripture Study Hub'}</span>
          </div>
          <h1 class="screen-title">Scripture Suite</h1>
          <p class="screen-subtitle">
            Select a tool below to study, internalize, and track your journey through the Bible.
          </p>
        </div>
      </div>

      <div class="hub-cards-grid">
        <!-- Feature 1: Bible Typing App Card -->
        <div class="hub-card" id="bible-typing-feature-card" role="button" tabindex="0">
          <div class="hub-card-top">
            <div class="hub-glyph" aria-hidden="true">⌨️</div>
            <div class="hub-meta">
              <div class="hub-tag">
                <span>📖</span>
                <span>66 Books · 1,189 Chapters · ${prefTr.shortName}</span>
              </div>
              <h2 class="hub-title">
                <a href="#/typing" class="hub-title-link">Bible Typing</a>
              </h2>
              <div class="hub-native">
                Type through any chapter of Scripture · Verse numbers visible, never typed
              </div>
            </div>
          </div>

          <p class="hub-desc">
            Search for any Bible book and chapter across 22 translations (defaulting to ESV) and type through the passage in strict accuracy mode. Tracks your WPM, CPM, completed chapters, and full Bible reach.
          </p>

          <div class="hub-subcards">
            <div class="hub-subitem">
              <div class="hub-subitem-info">
                <strong>Next Suggested Chapter: ${suggestedRef.bookName} ${suggestedRef.chapter} (${prefTr.shortName})</strong>
                <span>
                  ${latestSession
                    ? `Last completed: ${latestSession.bookName} ${latestSession.chapter} (${latestSession.translation}) · ${latestSession.wpm} WPM · ${latestSession.cpm} CPM`
                    : 'No chapters completed yet — start with Genesis 1 or search any chapter'}
                </span>
              </div>
              <div class="hub-subitem-links">
                <a href="#/typing/${suggestedRef.bookId}/${suggestedRef.chapter}" class="btn btn-primary btn-sm" data-stop-card-nav="true">
                  Type ${suggestedRef.bookName} ${suggestedRef.chapter} →
                </a>
              </div>
            </div>

            <div class="hub-subitem">
              <div class="hub-subitem-info">
                <strong>Typing Speed &amp; Bible Reach</strong>
                <span>
                  Avg: <strong>${stats.avgWpm} WPM</strong> (${stats.avgCpm} CPM) · Best: ${stats.bestWpm} WPM · ${stats.totalVersesTyped.toLocaleString()} verses typed
                </span>
              </div>
              <div class="hub-subitem-links">
                <a href="#/progress" class="btn btn-secondary btn-sm" data-stop-card-nav="true">
                  📊 Progress &amp; Stats
                </a>
              </div>
            </div>
          </div>

          <div class="hub-footer">
            <div class="hub-progress-info">
              <span>Overall Bible Reach (All Translations)</span>
              <span><strong>${stats.overallCompletedChapters} / ${stats.totalBibleChapters}</strong> chapters (${stats.overallPercentage}%)</span>
            </div>
            <div class="hub-progress-track">
              <div class="hub-progress-fill" style="width: ${fillWidth}%"></div>
            </div>
            <div class="hub-actions-row">
              <a href="#/progress" class="btn btn-secondary hub-action-btn" data-stop-card-nav="true">
                📊 Typing Progress &amp; Reach
              </a>
              <a href="#/typing" class="btn btn-primary hub-action-btn" data-stop-card-nav="true">
                ⌨️ Open Bible Typing →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const card = container.querySelector('#bible-typing-feature-card');
  if (card) {
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-stop-card-nav="true"]') || e.target.closest('a')) return;
      trackEvent('home_feature_card_click', { feature: 'bible_typing' });
      navigate('#/typing');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target === card) {
        navigate('#/typing');
      }
    });
  }
}
