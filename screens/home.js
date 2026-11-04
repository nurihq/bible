import { Auth, getGlobalTypingStats, getLocalStore, getPreferredTranslation } from '../api.js';
import { getBookById, getNextChapterRef, getTranslationByCode } from '../bible-data.js';
import { trackEvent } from '../analytics.js';
import { navigate } from '../app.js';

export function renderHomeScreen(container) {
  const user = Auth.getUser();
  const firstName = (user?.name || 'Friend').split(' ')[0];
  const stats = getGlobalTypingStats();
  const store = getLocalStore();
  const prefTr = getTranslationByCode(getPreferredTranslation());

  // Determine suggested chapter (next chapter after most recently typed, or last viewed, or Genesis 1)
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
            <span>Welcome back, ${firstName}</span>
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

  // Make the entire card clickable to go to #/typing unless clicking a specific sub-button
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
