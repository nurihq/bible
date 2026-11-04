import {
  Auth,
  getGlobalTypingStats,
  getLocalStore,
  getPreferredTranslation,
  getChapterProgressSummary,
  toggleChapterRead,
  toggleVerseRead
} from '../api.js?v=20261104_v21';
import { getBookById, getNextChapterRef, getTranslationByCode } from '../bible-data.js?v=20261104_v21';
import { trackEvent } from '../analytics.js?v=20261104_v21';
import { navigate } from '../app.js?v=20261104_v21';

export { renderLandingScreen as renderHomeScreen };

const VERSE_OF_THE_DAY_POOL = [
  {
    bookId: 24,
    bookName: 'Jeremiah',
    chapter: 29,
    verse: 11,
    text: 'For I know the plans I have for you, declares the LORD, plans for welfare and not for evil, to give you a future and a hope.',
    theme: 'Hope & Future'
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

  function getVotdStatus() {
    const chSum = getChapterProgressSummary(votd.bookId, votd.chapter);
    const vStat = chSum.record?.completedVerses?.[String(votd.verse)];
    const isVerseRead = Boolean(chSum.isFullyRead || vStat?.isRead);
    return { isVerseRead };
  }

  function renderCard() {
    const { isVerseRead } = getVotdStatus();

    container.innerHTML = `
      <div class="hero-wrapper">
        <div class="hero-badge">
          <span>✨</span>
          <span>66 Books · 1,189 Chapters · 31,103 Verses</span>
        </div>

        <h1 class="hero-title">bible</h1>
        <p class="hero-subtitle">
          Track your bible progress
        </p>

        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" id="home-start-btn">
            <span>Start Typing</span>
            <span style="font-size: 1.15rem;">→</span>
          </button>
        </div>

        <!-- Single Verse of the Day Card with Direct Read & Type Controls -->
        <div class="votd-card-wrapper">
          <div class="votd-card" id="votd-card" role="button" tabindex="0" title="Click to practice typing ${votd.bookName} ${votd.chapter}:${votd.verse}">
            <div class="votd-top-row">
              <div class="votd-ref-header">
                <strong class="votd-ref-title">${votd.bookName} ${votd.chapter}:${votd.verse}</strong>
                <span class="votd-ref-sub">ESV</span>
              </div>
              <span class="votd-action-hint">Type verse →</span>
            </div>

            <div class="votd-quote">
              “${votd.text}”
            </div>

            <div class="votd-bottom-row">
              <button
                type="button"
                class="btn ${isVerseRead ? 'btn-secondary is-read-active' : 'btn-secondary'} btn-sm votd-mark-btn"
                id="votd-mark-verse-btn"
                data-stop-card-nav="true"
                title="Mark verse ${votd.verse} as read to count toward your Bible completeness"
              >
                ${isVerseRead ? '✓ Verse Read' : '📖 Mark Verse Read'}
              </button>
              <a
                href="#/typing/${votd.bookId}/${votd.chapter}"
                class="btn btn-secondary btn-sm"
                data-stop-card-nav="true"
                title="Open and type the full chapter"
              >
                📖 Type Whole Ch.
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    const votdCard = container.querySelector('#votd-card');
    if (votdCard) {
      votdCard.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop-card-nav="true"]') || e.target.closest('a') || e.target.closest('button')) return;
        trackEvent('votd_card_click', { ref: `${votd.bookName} ${votd.chapter}:${votd.verse}` });
        navigate(`#/typing/${votd.bookId}/${votd.chapter}/${votd.verse}`);
      });
      votdCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === votdCard) {
          navigate(`#/typing/${votd.bookId}/${votd.chapter}/${votd.verse}`);
        }
      });
    }

    const markVerseBtn = container.querySelector('#votd-mark-verse-btn');
    if (markVerseBtn) {
      markVerseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowRead = toggleVerseRead(votd.bookId, votd.chapter, votd.verse);
        trackEvent('votd_mark_verse_read', { verse: `${votd.bookName} ${votd.chapter}:${votd.verse}`, nowRead });
        renderCard();
      });
    }

    const markChBtn = container.querySelector('#votd-mark-ch-btn');
    if (markChBtn) {
      markChBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowRead = toggleChapterRead(votd.bookId, votd.chapter);
        trackEvent('votd_mark_ch_read', { chapter: `${votd.bookName} ${votd.chapter}`, nowRead });
        renderCard();
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

  renderCard();
}

/** Legacy route fallback — Hub removed per user request: redirect directly to typing */
export function renderHubScreen() {
  navigate('#/typing');
}
