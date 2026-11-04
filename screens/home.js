import {
  Auth,
  getGlobalTypingStats,
  getLocalStore,
  getPreferredTranslation,
  getChapterProgressSummary
} from '../api.js?v=20261104_v6';
import { getBookById, getNextChapterRef, getTranslationByCode } from '../bible-data.js?v=20261104_v6';
import { trackEvent } from '../analytics.js?v=20261104_v6';
import { navigate } from '../app.js?v=20261104_v6';

export { renderLandingScreen as renderHomeScreen };

const VERSE_OF_THE_DAY_POOL = [
  {
    bookId: 43,
    bookName: 'John',
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
    theme: 'Love & Eternal Life'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 23,
    verse: 1,
    text: 'The LORD is my shepherd; I shall not want.',
    theme: 'Provision & Peace'
  },
  {
    bookId: 45,
    bookName: 'Romans',
    chapter: 8,
    verse: 28,
    text: 'And we know that for those who love God all things work together for good, for those who are called according to his purpose.',
    theme: 'Hope & Purpose'
  },
  {
    bookId: 50,
    bookName: 'Philippians',
    chapter: 4,
    verse: 13,
    text: 'I can do all things through him who strengthens me.',
    theme: 'Strength & Faith'
  },
  {
    bookId: 20,
    bookName: 'Proverbs',
    chapter: 3,
    verse: 5,
    text: 'Trust in the LORD with all your heart, and do not lean on your own understanding.',
    theme: 'Wisdom & Trust'
  },
  {
    bookId: 1,
    bookName: 'Genesis',
    chapter: 1,
    verse: 1,
    text: 'In the beginning, God created the heavens and the earth.',
    theme: 'Creation & Origin'
  },
  {
    bookId: 23,
    bookName: 'Isaiah',
    chapter: 40,
    verse: 31,
    text: 'but they who wait for the LORD shall renew their strength; they shall mount up with wings like eagles; they shall run and not be weary; they shall walk and not faint.',
    theme: 'Renewal & Endurance'
  },
  {
    bookId: 6,
    bookName: 'Joshua',
    chapter: 1,
    verse: 9,
    text: 'Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the LORD your God is with you wherever you go.',
    theme: 'Courage & Presence'
  },
  {
    bookId: 40,
    bookName: 'Matthew',
    chapter: 11,
    verse: 28,
    text: 'Come to me, all who labor and are heavy laden, and I will give you rest.',
    theme: 'Rest & Comfort'
  },
  {
    bookId: 33,
    bookName: 'Micah',
    chapter: 6,
    verse: 8,
    text: 'He has told you, O man, what is good; and what does the LORD require of you but to do justice, and to love kindness, and to walk humbly with your God?',
    theme: 'Justice & Humility'
  },
  {
    bookId: 55,
    bookName: '2 Timothy',
    chapter: 1,
    verse: 7,
    text: 'for God gave us a spirit not of fear but of power and love and self-control.',
    theme: 'Confidence & Spirit'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 46,
    verse: 1,
    text: 'God is our refuge and strength, a very present help in trouble.',
    theme: 'Refuge & Deliverance'
  }
];

export function renderLandingScreen(container) {
  // Deterministic daily verse of the day based on day of the year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const votd = VERSE_OF_THE_DAY_POOL[dayOfYear % VERSE_OF_THE_DAY_POOL.length];

  container.innerHTML = `
    <div class="hero-wrapper">
      <div class="hero-badge">
        <span>✨</span>
        <span>66 Books · 1,189 Chapters · 31,103 Verses</span>
      </div>

      <h1 class="hero-title">bible</h1>
      <p class="hero-subtitle">
        Internalize Scripture at your keyboard. Type through any chapter or verse of the Bible, track your WPM &amp; CPM speed, and map your reach across all 1,189 chapters and 31,103 verses.
      </p>

      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" id="home-start-btn">
          <span>Start Typing</span>
          <span style="font-size: 1.15rem;">→</span>
        </button>
      </div>

      <!-- Single Verse of the Day Card (No Flipping) -->
      <div class="votd-card-wrapper">
        <div class="votd-card" id="votd-card" role="button" tabindex="0" title="Click to practice typing ${votd.bookName} ${votd.chapter}:${votd.verse}">
          <div class="votd-top-row">
            <span class="votd-tag">☀️ Verse of the Day · ${votd.theme}</span>
            <span class="votd-action-hint">Click card to type verse →</span>
          </div>

          <div class="votd-quote">
            <sup class="verse-num">${votd.verse}</sup>“${votd.text}”
          </div>

          <div class="votd-ref-row">
            <div class="votd-ref-info">
              <strong class="votd-ref-title">${votd.bookName} ${votd.chapter}:${votd.verse}</strong>
              <span class="votd-ref-sub">ESV · Tap below to practice this single verse or the full chapter</span>
            </div>

            <div class="votd-ctas">
              <a
                href="#/typing/${votd.bookId}/${votd.chapter}/${votd.verse}"
                class="btn btn-primary btn-sm"
                data-stop-card-nav="true"
                title="Practice only this single verse"
              >
                🎯 Type This Verse →
              </a>
              <a
                href="#/typing/${votd.bookId}/${votd.chapter}"
                class="btn btn-secondary btn-sm"
                data-stop-card-nav="true"
                title="Open and type the full chapter"
              >
                📖 Type Whole Chapter (${votd.bookName} ${votd.chapter}) →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const votdCard = container.querySelector('#votd-card');
  if (votdCard) {
    votdCard.addEventListener('click', (e) => {
      if (e.target.closest('[data-stop-card-nav="true"]') || e.target.closest('a')) return;
      trackEvent('votd_card_click', { ref: `${votd.bookName} ${votd.chapter}:${votd.verse}` });
      navigate(`#/typing/${votd.bookId}/${votd.chapter}/${votd.verse}`);
    });
    votdCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target === votdCard) {
        navigate(`#/typing/${votd.bookId}/${votd.chapter}/${votd.verse}`);
      }
    });
  }

  const startBtn = container.querySelector('#home-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      trackEvent('home_start_click', { authenticated: Auth.isAuthenticated() });
      navigate('#/typing');
    });
  }
}

/** Legacy route fallback — Hub removed per user request: redirect directly to typing */
export function renderHubScreen() {
  navigate('#/typing');
}
