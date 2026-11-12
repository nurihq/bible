import {
  Auth,
  getGlobalTypingStats,
  getLocalStore,
  getPreferredTranslation,
  getActiveModePref,
  getChapterProgressSummary,
  isVerseCovered,
  markVerseAsRead,
  toggleChapterRead,
  toggleVerseRead,
  isVerseFavorited,
  toggleVerseFavorite,
  isVerseBookmarked,
  getAllBookmarks,
  createBookmark,
  updateBookmarkLocation,
  findBookmarkByName
} from '../api.js?v=20261112_v4';
import {
  getBookById,
  getNextChapterRef,
  getTranslationByCode,
  getRandomVerseRef,
  getVerseRefByIndex,
  TOTAL_BIBLE_VERSES,
  fetchChapterVerses,
  getCachedChapterVerses,
  prefetchChapterVerses
} from '../bible-data.js?v=20261112_v4';
import { generateArtBackgroundSvg } from '../meditate-art.js?v=20261112_v4';
import { trackEvent } from '../analytics.js?v=20261112_v4';
import { navigate } from '../router.js?v=20261112_v4';

export { renderLandingScreen as renderHomeScreen };

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HOME_DAILY_VERSE_KEY = 'bible_home_daily_verse_v3';

const DAILY_VERSE_POOL = [
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
  },
  {
    bookId: 43,
    bookName: 'John',
    chapter: 3,
    verse: 16,
    text: 'For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.',
    theme: 'Salvation & Love'
  },
  {
    bookId: 20,
    bookName: 'Proverbs',
    chapter: 4,
    verse: 23,
    text: 'Keep your heart with all vigilance, for from it flow the springs of life.',
    theme: 'Wisdom & Vigilance'
  },
  {
    bookId: 23,
    bookName: 'Isaiah',
    chapter: 41,
    verse: 10,
    text: 'fear not, for I am with you; be not dismayed, for I am your God; I will strengthen you, I will help you, I will uphold you with my righteous right hand.',
    theme: 'Encouragement & Strength'
  },
  {
    bookId: 45,
    bookName: 'Romans',
    chapter: 12,
    verse: 2,
    text: 'Do not be conformed to this world, but be transformed by the renewal of your mind, that by testing you may discern what is the will of God, what is good and acceptable and perfect.',
    theme: 'Renewal & Discernment'
  },
  {
    bookId: 48,
    bookName: 'Galatians',
    chapter: 5,
    verse: 22,
    text: 'But the fruit of the Spirit is love, joy, peace, patience, kindness, goodness, faithfulness, gentleness, self-control; against such things there is no law.',
    theme: 'Fruit of the Spirit'
  },
  {
    bookId: 49,
    bookName: 'Ephesians',
    chapter: 2,
    verse: 8,
    text: 'For by grace you have been saved through faith. And this is not your own doing; it is the gift of God.',
    theme: 'Grace & Faith'
  },
  {
    bookId: 50,
    bookName: 'Philippians',
    chapter: 4,
    verse: 6,
    text: 'do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God.',
    theme: 'Peace & Prayer'
  },
  {
    bookId: 58,
    bookName: 'Hebrews',
    chapter: 11,
    verse: 1,
    text: 'Now faith is the assurance of things hoped for, the conviction of things not seen.',
    theme: 'Faith'
  },
  {
    bookId: 46,
    bookName: '1 Corinthians',
    chapter: 13,
    verse: 4,
    text: 'Love is patient and kind; love does not envy or boast; it is not arrogant or rude.',
    theme: 'Love'
  },
  {
    bookId: 46,
    bookName: '1 Corinthians',
    chapter: 13,
    verse: 13,
    text: 'So now faith, hope, and love abide, these three; but the greatest of these is love.',
    theme: 'The Greatest Gift'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 119,
    verse: 105,
    text: 'Your word is a lamp to my feet and a light to my path.',
    theme: 'God’s Word'
  },
  {
    bookId: 40,
    bookName: 'Matthew',
    chapter: 6,
    verse: 33,
    text: 'But seek first the kingdom of God and his righteousness, and all these things will be added to you.',
    theme: 'Kingdom Priorities'
  },
  {
    bookId: 60,
    bookName: '1 Peter',
    chapter: 5,
    verse: 7,
    text: 'casting all your anxieties on him, because he cares for you.',
    theme: 'Care & Peace'
  },
  {
    bookId: 45,
    bookName: 'Romans',
    chapter: 8,
    verse: 38,
    text: 'For I am sure that neither death nor life, nor angels nor rulers, nor things present nor things to come, nor powers, nor height nor depth, nor anything else in all creation, will be able to separate us from the love of God in Christ Jesus our Lord.',
    theme: 'Inseparable Love'
  },
  {
    bookId: 59,
    bookName: 'James',
    chapter: 1,
    verse: 5,
    text: 'If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.',
    theme: 'Asking for Wisdom'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 121,
    verse: 1,
    text: 'I lift up my eyes to the hills. From where does my help come? My help comes from the LORD, who made heaven and earth.',
    theme: 'Help from the Lord'
  },
  {
    bookId: 23,
    bookName: 'Isaiah',
    chapter: 53,
    verse: 5,
    text: 'But he was pierced for our transgressions; he was crushed for our iniquities; upon him was the chastisement that brought us peace, and with his wounds we are healed.',
    theme: 'Atonement & Healing'
  },
  {
    bookId: 43,
    bookName: 'John',
    chapter: 14,
    verse: 6,
    text: 'Jesus said to him, “I am the way, and the truth, and the life. No one comes to the Father except through me.”',
    theme: 'The Way & Truth'
  },
  {
    bookId: 43,
    bookName: 'John',
    chapter: 14,
    verse: 27,
    text: 'Peace I leave with you; my peace I give to you. Not as the world gives do I give to you. Let not your hearts be troubled, neither let them be afraid.',
    theme: 'True Peace'
  },
  {
    bookId: 43,
    bookName: 'John',
    chapter: 1,
    verse: 1,
    text: 'In the beginning was the Word, and the Word was with God, and the Word was God.',
    theme: 'The Living Word'
  },
  {
    bookId: 40,
    bookName: 'Matthew',
    chapter: 28,
    verse: 19,
    text: 'Go therefore and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit.',
    theme: 'The Great Commission'
  },
  {
    bookId: 25,
    bookName: 'Lamentations',
    chapter: 3,
    verse: 22,
    text: 'The steadfast love of the LORD never ceases; his mercies never come to an end; they are new every morning; great is your faithfulness.',
    theme: 'Faithfulness & Mercy'
  },
  {
    bookId: 36,
    bookName: 'Zephaniah',
    chapter: 3,
    verse: 17,
    text: 'The LORD your God is in your midst, a mighty one who will save; he will rejoice over you with gladness; he will quiet you by his love; he will exult over you with loud singing.',
    theme: 'God Rejoicing'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 139,
    verse: 14,
    text: 'I praise you, for I am fearfully and wonderfully made. Wonderful are your works; my soul knows it very well.',
    theme: 'Wonderfully Made'
  },
  {
    bookId: 5,
    bookName: 'Deuteronomy',
    chapter: 31,
    verse: 6,
    text: 'Be strong and courageous. Do not fear or be in dread of them, for it is the LORD your God who goes with you. He will not leave you or forsake you.',
    theme: 'Courage & Presence'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 27,
    verse: 1,
    text: 'The LORD is my light and my salvation; whom shall I fear? The LORD is the stronghold of my life; of whom shall I be afraid?',
    theme: 'Light & Salvation'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 34,
    verse: 8,
    text: 'Oh, taste and see that the LORD is good! Blessed is the man who takes refuge in him!',
    theme: 'Taste & See'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 37,
    verse: 4,
    text: 'Delight yourself in the LORD, and he will give you the desires of your heart.',
    theme: 'Delight in God'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 46,
    verse: 10,
    text: '“Be still, and know that I am God. I will be exalted among the nations, I will be exalted in the earth!”',
    theme: 'Be Still'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 91,
    verse: 1,
    text: 'He who dwells in the shelter of the Most High will abide in the shadow of the Almighty.',
    theme: 'Protection'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 103,
    verse: 2,
    text: 'Bless the LORD, O my soul, and forget not all his benefits, who forgives all your iniquity, who heals all your diseases.',
    theme: 'Blessing the Lord'
  },
  {
    bookId: 19,
    bookName: 'Psalms',
    chapter: 118,
    verse: 24,
    text: 'This is the day that the LORD has made; let us rejoice and be glad in it.',
    theme: 'Rejoice Today'
  },
  {
    bookId: 20,
    bookName: 'Proverbs',
    chapter: 16,
    verse: 3,
    text: 'Commit your work to the LORD, and your plans will be established.',
    theme: 'Committing Your Work'
  },
  {
    bookId: 20,
    bookName: 'Proverbs',
    chapter: 18,
    verse: 10,
    text: 'The name of the LORD is a strong tower; the righteous man runs into it and is safe.',
    theme: 'Strong Tower'
  },
  {
    bookId: 23,
    bookName: 'Isaiah',
    chapter: 9,
    verse: 6,
    text: 'For to us a child is born, to us a son is given; and the government shall be upon his shoulder, and his name shall be called Wonderful Counselor, Mighty God, Everlasting Father, Prince of Peace.',
    theme: 'Prince of Peace'
  },
  {
    bookId: 23,
    bookName: 'Isaiah',
    chapter: 26,
    verse: 3,
    text: 'You keep him in perfect peace whose mind is stayed on you, because he trusts in you.',
    theme: 'Perfect Peace'
  },
  {
    bookId: 23,
    bookName: 'Isaiah',
    chapter: 43,
    verse: 2,
    text: 'When you pass through the waters, I will be with you; and through the rivers, they shall not overwhelm you; when you walk through fire you shall not be burned, and the flame shall not consume you.',
    theme: 'God with Us'
  },
  {
    bookId: 40,
    bookName: 'Matthew',
    chapter: 5,
    verse: 14,
    text: '“You are the light of the world. A city set on a hill cannot be hidden.”',
    theme: 'Light of the World'
  },
  {
    bookId: 40,
    bookName: 'Matthew',
    chapter: 5,
    verse: 16,
    text: 'In the same way, let your light shine before others, so that they may see your good works and give glory to your Father who is in heaven.',
    theme: 'Shining Light'
  },
  {
    bookId: 41,
    bookName: 'Mark',
    chapter: 10,
    verse: 27,
    text: 'Jesus looked at them and said, “With man it is impossible, but not with God. For all things are possible with God.”',
    theme: 'All Things Possible'
  },
  {
    bookId: 42,
    bookName: 'Luke',
    chapter: 1,
    verse: 37,
    text: 'For nothing will be impossible with God.',
    theme: 'God’s Power'
  },
  {
    bookId: 43,
    bookName: 'John',
    chapter: 8,
    verse: 12,
    text: 'Again Jesus spoke to them, saying, “I am the light of the world. Whoever follows me will not walk in darkness, but will have the light of life.”',
    theme: 'Light of Life'
  },
  {
    bookId: 43,
    bookName: 'John',
    chapter: 10,
    verse: 10,
    text: 'The thief comes only to steal and kill and destroy. I came that they may have life and have it abundantly.',
    theme: 'Abundant Life'
  },
  {
    bookId: 43,
    bookName: 'John',
    chapter: 15,
    verse: 5,
    text: 'I am the vine; you are the branches. Whoever abides in me and I in him, he it is that bears much fruit, for apart from me you can do nothing.',
    theme: 'Abiding in Christ'
  },
  {
    bookId: 45,
    bookName: 'Romans',
    chapter: 1,
    verse: 16,
    text: 'For I am not ashamed of the gospel, for it is the power of God for salvation to everyone who believes, to the Jew first and also to the Greek.',
    theme: 'The Gospel'
  },
  {
    bookId: 45,
    bookName: 'Romans',
    chapter: 5,
    verse: 8,
    text: 'but God shows his love for us in that while we were still sinners, Christ died for us.',
    theme: 'God’s Love Demonstrated'
  },
  {
    bookId: 45,
    bookName: 'Romans',
    chapter: 8,
    verse: 31,
    text: 'What then shall we say to these things? If God is for us, who can be against us?',
    theme: 'God Is For Us'
  },
  {
    bookId: 47,
    bookName: '2 Corinthians',
    chapter: 5,
    verse: 17,
    text: 'Therefore, if anyone is in Christ, he is a new creation. The old has passed away; behold, the new has come.',
    theme: 'New Creation'
  },
  {
    bookId: 47,
    bookName: '2 Corinthians',
    chapter: 12,
    verse: 9,
    text: 'But he said to me, “My grace is sufficient for you, for my power is made perfect in weakness.” Therefore I will boast all the more gladly of my weaknesses, so that the power of Christ may rest upon me.',
    theme: 'Grace Sufficient'
  },
  {
    bookId: 48,
    bookName: 'Galatians',
    chapter: 2,
    verse: 20,
    text: 'I have been crucified with Christ. It is no longer I who live, but Christ who lives in me. And the life I now live in the flesh I live by faith in the Son of God, who loved me and gave himself for me.',
    theme: 'Christ in Me'
  },
  {
    bookId: 49,
    bookName: 'Ephesians',
    chapter: 6,
    verse: 10,
    text: 'Finally, be strong in the Lord and in the strength of his might. Put on the whole armor of God.',
    theme: 'Armor of God'
  },
  {
    bookId: 51,
    bookName: 'Colossians',
    chapter: 3,
    verse: 12,
    text: 'Put on then, as God’s chosen ones, holy and beloved, compassionate hearts, kindness, humility, meekness, and patience.',
    theme: 'Compassion & Kindness'
  },
  {
    bookId: 51,
    bookName: 'Colossians',
    chapter: 3,
    verse: 23,
    text: 'Whatever you do, work heartily, as for the Lord and not for men.',
    theme: 'Hearty Service'
  },
  {
    bookId: 52,
    bookName: '1 Thessalonians',
    chapter: 5,
    verse: 16,
    text: 'Rejoice always, pray without ceasing, give thanks in all circumstances; for this is the will of God in Christ Jesus for you.',
    theme: 'Rejoicing & Thanksgiving'
  },
  {
    bookId: 58,
    bookName: 'Hebrews',
    chapter: 4,
    verse: 12,
    text: 'For the word of God is living and active, sharper than any two-edged sword, piercing to the division of soul and of spirit, of joints and of marrow, and discerning the thoughts and intentions of the heart.',
    theme: 'The Living Word'
  },
  {
    bookId: 58,
    bookName: 'Hebrews',
    chapter: 12,
    verse: 2,
    text: 'looking to Jesus, the founder and perfecter of our faith, who for the joy that was set before him endured the cross, despising the shame, and is seated at the right hand of the throne of God.',
    theme: 'Looking to Jesus'
  },
  {
    bookId: 66,
    bookName: 'Revelation',
    chapter: 21,
    verse: 4,
    text: 'He will wipe away every tear from their eyes, and death shall be no more, neither shall there be mourning, nor crying, nor pain anymore, for the former things have passed away.',
    theme: 'Eternal Hope'
  }
];

function getDayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

function getTodayDateKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isVerseCompletedForUser(bookId, chapter, verseNum) {
  const chSum = getChapterProgressSummary(bookId, chapter);
  return isVerseCovered(chSum.record, verseNum);
}

function getStoredDailyVerse() {
  try {
    const raw = localStorage.getItem(HOME_DAILY_VERSE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveStoredDailyVerse(verseObj) {
  try {
    localStorage.setItem(HOME_DAILY_VERSE_KEY, JSON.stringify(verseObj));
  } catch {}
}

/**
 * Deterministically picks the daily verse for the given day number.
 * Defaults to the exact same verse across all devices and users for that day.
 * Only if the user has already read or typed it (or if excluded) does it deterministically
 * scan forward to the next unread verse for that user.
 */
function pickFreshDailyVerse(excludeRef = null) {
  const dayNum = getDayNumber();
  const poolLen = DAILY_VERSE_POOL.length;
  const baseIndex = ((dayNum % poolLen) + poolLen) % poolLen;

  // 1. Scan curated pool starting from today's deterministic baseIndex
  for (let offset = 0; offset < poolLen; offset++) {
    const candidate = DAILY_VERSE_POOL[(baseIndex + offset) % poolLen];
    const isExcluded = excludeRef &&
      candidate.bookId === excludeRef.bookId &&
      candidate.chapter === excludeRef.chapter &&
      candidate.verse === excludeRef.verse;

    if (!isExcluded && !isVerseCompletedForUser(candidate.bookId, candidate.chapter, candidate.verse)) {
      return candidate;
    }
  }

  // 2. If user completed all curated pool verses, deterministically scan the full Bible canon
  const totalVerses = TOTAL_BIBLE_VERSES || 31102;
  const stride = 7919; // Prime coprime to ~31,102 for uniform canonical dispersion
  const baseBibleIdx = Math.abs(dayNum * stride) % totalVerses;

  for (let offset = 0; offset < totalVerses; offset++) {
    const idx = (baseBibleIdx + offset) % totalVerses;
    const ref = getVerseRefByIndex(idx);
    const isExcluded = excludeRef &&
      ref.bookId === excludeRef.bookId &&
      ref.chapter === excludeRef.chapter &&
      ref.verse === excludeRef.verse;

    if (!isExcluded && !isVerseCompletedForUser(ref.bookId, ref.chapter, ref.verse)) {
      const book = getBookById(ref.bookId);
      return {
        bookId: ref.bookId,
        bookName: book ? book.name : `Book ${ref.bookId}`,
        chapter: ref.chapter,
        verse: ref.verse,
        text: '',
        theme: 'Scripture'
      };
    }
  }

  return DAILY_VERSE_POOL[baseIndex];
}

function getSyncDailyVerse(activeTranslation = 'ESV') {
  const todayKey = getTodayDateKey();
  const dayNum = getDayNumber();
  const stored = getStoredDailyVerse();

  const isCurrentCompleted = stored && isVerseCompletedForUser(stored.bookId, stored.chapter, stored.verse);
  const isExpired = !stored || stored.dayNum !== dayNum || stored.dateKey !== todayKey;

  if (stored && !isExpired && !isCurrentCompleted) {
    return stored;
  }

  const fresh = pickFreshDailyVerse(stored ? { bookId: stored.bookId, chapter: stored.chapter, verse: stored.verse } : null);
  const result = {
    ...fresh,
    dayNum,
    dateKey: todayKey,
    translation: activeTranslation
  };
  saveStoredDailyVerse(result);
  return result;
}

async function resolveDailyVerse(activeTranslation = 'ESV', forceNew = false) {
  const todayKey = getTodayDateKey();
  const dayNum = getDayNumber();
  let stored = getStoredDailyVerse();

  const isCurrentCompleted = stored && isVerseCompletedForUser(stored.bookId, stored.chapter, stored.verse);
  const isExpired = !stored || stored.dayNum !== dayNum || stored.dateKey !== todayKey;

  let selected = stored;

  if (forceNew || isExpired || isCurrentCompleted) {
    const fresh = pickFreshDailyVerse(stored ? { bookId: stored.bookId, chapter: stored.chapter, verse: stored.verse } : null);
    selected = {
      ...fresh,
      dayNum,
      dateKey: todayKey,
      translation: activeTranslation
    };
    saveStoredDailyVerse(selected);
  }

  // Fetch or retrieve actual text for the user's active translation
  try {
    const cached = getCachedChapterVerses(activeTranslation, selected.bookId, selected.chapter);
    if (cached && cached.length > 0) {
      const match = cached.find(v => Number(v.verse) === Number(selected.verse));
      if (match && match.text) {
        selected.text = match.text;
      }
    } else {
      const loaded = await fetchChapterVerses(activeTranslation, selected.bookId, selected.chapter);
      if (loaded && loaded.length > 0) {
        const match = loaded.find(v => Number(v.verse) === Number(selected.verse));
        if (match && match.text) {
          selected.text = match.text;
        }
      }
    }
  } catch (e) {
    // Keep fallback text if network unavailable
  }

  saveStoredDailyVerse(selected);
  return selected;
}

export function renderLandingScreen(container) {
  const activeTranslation = getPreferredTranslation() || 'ESV';

  // Synchronously resolve current valid daily verse
  let currentVerse = getSyncDailyVerse(activeTranslation);

  // Background check to verify translation text & prefetch
  resolveDailyVerse(activeTranslation).then(verified => {
    if (verified && (verified.text !== currentVerse.text || verified.verse !== currentVerse.verse || verified.bookId !== currentVerse.bookId)) {
      currentVerse = verified;
      renderCard();
    }
  }).catch(() => {});

  function renderCard() {
    const isCompleted = isVerseCompletedForUser(currentVerse.bookId, currentVerse.chapter, currentVerse.verse);
    const activeMode = getActiveModePref() || 'type';
    const isFav = isVerseFavorited(currentVerse.bookId, currentVerse.chapter, currentVerse.verse);
    const isBookmarked = isVerseBookmarked(currentVerse.bookId, currentVerse.chapter, currentVerse.verse);

    // Deterministic template index for background artwork based on verse reference
    const templateIdx = ((Number(currentVerse.bookId) * 31 + Number(currentVerse.chapter) * 7 + Number(currentVerse.verse)) % 1000 + 1000) % 1000;
    const bgSvg = generateArtBackgroundSvg(templateIdx);

    container.innerHTML = `
      <div class="hero-wrapper">
        <div class="hero-badge">
          <span>✨</span>
          <span>66 Books · 1,189 Chapters · 31,103 Verses</span>
        </div>

        <h1 class="hero-title">Promises to Creation</h1>
        <p class="hero-subtitle">
          Bible typing, speaking &amp; drawing practice with Scripture tracking
        </p>

        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" id="home-start-btn">
            <span>Explore Promises</span>
            <span style="font-size: 1.15rem;">→</span>
          </button>
        </div>

        <!-- Daily Random Verse Card with Direct Read & Type Controls -->
        <div class="votd-card-wrapper">
          <div class="votd-card" id="votd-card" role="button" tabindex="0" title="Click to open ${escapeHtml(currentVerse.bookName)} ${currentVerse.chapter}:${currentVerse.verse}">
            <!-- Background Artwork (Mobile-Only Art Layer) -->
            <div class="votd-bg-art" aria-hidden="true">${bgSvg}</div>
            <div class="votd-card-content">
              <div class="votd-top-row">
                <div class="votd-ref-header">
                  <strong class="votd-ref-title">${escapeHtml(currentVerse.bookName)} ${currentVerse.chapter}:${currentVerse.verse}</strong>
                  <span class="votd-ref-sub">${escapeHtml(activeTranslation)}</span>
                  ${currentVerse.theme ? `<span class="votd-tag">${escapeHtml(currentVerse.theme)}</span>` : ''}
                </div>
                <button type="button" class="votd-action-hint" id="votd-open-verse-btn" title="Open verse in ${activeMode} mode" aria-label="Open verse">
                  <span class="votd-open-text">Open verse →</span>
                  <span class="votd-open-arrow">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </span>
                </button>
              </div>

              <div class="votd-quote">
                “${escapeHtml(currentVerse.text || 'Loading verse text...')}”
              </div>

              <!-- Desktop Bottom Actions (Unchanged) -->
              <div class="votd-bottom-row desktop-only-votd">
                <button
                  type="button"
                  class="btn ${isCompleted ? 'btn-secondary is-read-active' : 'btn-secondary'} btn-sm votd-mark-btn"
                  id="votd-mark-verse-btn"
                  data-stop-card-nav="true"
                  title="Mark verse ${currentVerse.verse} as read and load a new daily verse"
                >
                  ${isCompleted ? '✓ Marked Read' : '📖 Mark Verse Read'}
                </button>
                <a
                  href="/${activeMode}/${currentVerse.bookId}/${currentVerse.chapter}"
                  class="btn btn-secondary btn-sm"
                  id="votd-type-chapter-btn"
                  data-stop-card-nav="true"
                  title="Open the full chapter"
                >
                  📖 Open Whole Ch.
                </a>
              </div>

              <!-- Mobile Bottom Actions (Cute 4-Action Bar: Fav, Bookmark, Share, 3-Dots) -->
              <div class="votd-mobile-actions-wrapper mobile-only-votd" data-stop-card-nav="true">
                <div class="votd-mobile-actions">
                  <!-- 1. Favourite (Heart Outline) -->
                  <button
                    type="button"
                    class="votd-mobile-action-btn votd-fav-btn ${isFav ? 'is-favorited' : ''}"
                    id="votd-mobile-fav-btn"
                    title="${isFav ? 'Remove from favorites' : 'Save to favorites'}"
                    aria-label="${isFav ? 'Remove from favorites' : 'Save to favorites'}"
                  >
                    <svg class="votd-heart-icon" width="22" height="22" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>

                  <!-- 2. Bookmark (Ribbon Outline) -->
                  <button
                    type="button"
                    class="votd-mobile-action-btn votd-bookmark-btn ${isBookmarked ? 'is-bookmarked' : ''}"
                    id="votd-mobile-bookmark-btn"
                    title="${isBookmarked ? 'Bookmark saved' : 'Add bookmark'}"
                    aria-label="${isBookmarked ? 'Bookmark saved' : 'Add bookmark'}"
                  >
                    <svg class="votd-bookmark-icon" width="21" height="21" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                    </svg>
                  </button>

                  <!-- 3. Share (Tray Outline) -->
                  <button
                    type="button"
                    class="votd-mobile-action-btn votd-share-btn"
                    id="votd-mobile-share-btn"
                    title="Share verse card"
                    aria-label="Share verse card"
                  >
                    <svg class="votd-share-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/>
                      <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </button>

                  <!-- 4. Ellipses (Three Horizontal Dots) -->
                  <div class="votd-dots-wrapper">
                    <button
                      type="button"
                      class="votd-mobile-action-btn votd-dots-btn"
                      id="votd-mobile-dots-btn"
                      aria-label="More actions"
                      title="More actions"
                      aria-haspopup="true"
                      aria-expanded="false"
                    >
                      <svg class="votd-dots-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="1.25" fill="currentColor"/>
                        <circle cx="19" cy="12" r="1.25" fill="currentColor"/>
                        <circle cx="5" cy="12" r="1.25" fill="currentColor"/>
                      </svg>
                    </button>
                    <!-- Three Horizontal Dots Dropdown Popover -->
                    <div class="votd-dots-menu" id="votd-dots-menu" hidden>
                      <button
                        type="button"
                        class="votd-dots-item ${isCompleted ? 'is-read' : ''}"
                        id="votd-mobile-mark-btn"
                      >
                        <span class="dots-item-icon">${isCompleted ? '✓' : '📖'}</span>
                        <span>${isCompleted ? 'Marked Read' : 'Mark Verse Read'}</span>
                      </button>
                      <a
                        href="/${activeMode}/${currentVerse.bookId}/${currentVerse.chapter}"
                        class="votd-dots-item"
                        id="votd-mobile-chapter-btn"
                      >
                        <span class="dots-item-icon">📜</span>
                        <span>Open Whole Ch.</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bookmark Modal Backdrop for Mobile Home Card -->
        <div class="typing-options-backdrop votd-bookmark-backdrop" id="votd-bookmark-backdrop" hidden>
          <div class="typing-options-card typing-bookmark-card" role="dialog" aria-modal="true" aria-labelledby="votd-bookmark-modal-title">
            <div class="typing-options-header">
              <div>
                <h2 class="typing-options-title" id="votd-bookmark-modal-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px; margin-right: 4px;">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>Bookmark Verse
                </h2>
                <p class="bookmark-modal-subtitle" id="votd-bookmark-modal-subtitle">
                  ${escapeHtml(currentVerse.bookName)} ${currentVerse.chapter}:${currentVerse.verse} (${escapeHtml(activeTranslation)})
                </p>
              </div>
              <button type="button" class="options-close-btn" id="votd-bookmark-close-btn" aria-label="Close bookmarks">✕</button>
            </div>

            <div class="typing-options-body">
              <div class="bookmark-input-group">
                <input
                  type="text"
                  id="votd-bookmark-search-input"
                  class="bookmark-name-input"
                  placeholder="Search or enter bookmark name..."
                  autocomplete="off"
                  maxlength="60"
                />
                <button type="button" class="btn btn-primary btn-sm" id="votd-bookmark-save-btn">
                  Save
                </button>
              </div>
              <div class="bookmark-feedback-msg" id="votd-bookmark-feedback-msg" hidden></div>

              <div class="bookmark-recent-section">
                <div class="bookmark-section-header">
                  <span class="bookmark-section-title">Recent Bookmarks</span>
                  <a href="/bookmarks" class="bookmark-view-all-link">Manage All & History ›</a>
                </div>
                <div class="bookmark-recent-list" id="votd-bookmark-recent-list"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Hidden canvas for generating clean uncurved card share image -->
        <canvas id="votd-share-canvas" width="1200" height="900" style="display:none;"></canvas>
      </div>
    `;

    const votdCard = container.querySelector('#votd-card');
    if (votdCard) {
      votdCard.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop-card-nav="true"]') || e.target.closest('a') || e.target.closest('button')) return;
        trackEvent('votd_card_click', { ref: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}` });
        const mode = getActiveModePref() || 'type';
        navigate(`/${mode}/${currentVerse.bookId}/${currentVerse.chapter}/${currentVerse.verse}`);
      });
      votdCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target === votdCard) {
          const mode = getActiveModePref() || 'type';
          navigate(`/${mode}/${currentVerse.bookId}/${currentVerse.chapter}/${currentVerse.verse}`);
        }
      });
    }

    const markVerseBtn = container.querySelector('#votd-mark-verse-btn');
    if (markVerseBtn) {
      markVerseBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        markVerseAsRead(currentVerse.bookId, currentVerse.chapter, currentVerse.verse, activeTranslation);
        trackEvent('votd_mark_verse_read', { verse: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}` });

        markVerseBtn.disabled = true;
        markVerseBtn.textContent = '✓ Marked Read!';
        markVerseBtn.classList.add('is-read-active');

        // Immediately rotate to a new unread/untyped verse for the user
        setTimeout(async () => {
          const fresh = await resolveDailyVerse(activeTranslation, true);
          currentVerse = fresh;
          renderCard();
        }, 320);
      });
    }

    const typeChBtn = container.querySelector('#votd-type-chapter-btn');
    if (typeChBtn) {
      typeChBtn.addEventListener('click', () => {
        trackEvent('votd_type_chapter_click', { bookId: currentVerse.bookId, chapter: currentVerse.chapter });
      });
    }

    const startBtn = container.querySelector('#home-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        trackEvent('home_start_click', { authenticated: Auth.isAuthenticated() });
        navigate('/promises');
      });
    }

    // ── Mobile Three-Dots Popover Menu ──
    const dotsBtn = container.querySelector('#votd-mobile-dots-btn');
    const dotsMenu = container.querySelector('#votd-dots-menu');
    if (dotsBtn && dotsMenu) {
      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !dotsMenu.hidden;
        dotsMenu.hidden = isOpen;
        dotsBtn.setAttribute('aria-expanded', String(!isOpen));
      });

      const onDocClick = (e) => {
        if (!dotsBtn.contains(e.target) && !dotsMenu.contains(e.target)) {
          dotsMenu.hidden = true;
          dotsBtn.setAttribute('aria-expanded', 'false');
        }
      };
      document.addEventListener('click', onDocClick);
    }

    // Mobile Mark Read in Popover
    const mobileMarkBtn = container.querySelector('#votd-mobile-mark-btn');
    if (mobileMarkBtn) {
      mobileMarkBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (dotsMenu) dotsMenu.hidden = true;
        markVerseAsRead(currentVerse.bookId, currentVerse.chapter, currentVerse.verse, activeTranslation);
        trackEvent('votd_mark_verse_read', { verse: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`, source: 'mobile_dots' });

        mobileMarkBtn.disabled = true;
        mobileMarkBtn.innerHTML = `<span class="dots-item-icon">✓</span><span>Marked Read!</span>`;

        setTimeout(async () => {
          const fresh = await resolveDailyVerse(activeTranslation, true);
          currentVerse = fresh;
          renderCard();
        }, 320);
      });
    }

    // Mobile Open Whole Chapter in Popover
    const mobileChBtn = container.querySelector('#votd-mobile-chapter-btn');
    if (mobileChBtn) {
      mobileChBtn.addEventListener('click', () => {
        if (dotsMenu) dotsMenu.hidden = true;
        trackEvent('votd_type_chapter_click', { bookId: currentVerse.bookId, chapter: currentVerse.chapter, source: 'mobile_dots' });
      });
    }

    // ── Mobile Favourite Action ──
    const mobileFavBtn = container.querySelector('#votd-mobile-fav-btn');
    if (mobileFavBtn) {
      mobileFavBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowFav = toggleVerseFavorite({
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          verseRef: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`,
          verseText: currentVerse.text,
          translation: activeTranslation
        });
        mobileFavBtn.classList.toggle('is-favorited', nowFav);
        mobileFavBtn.title = nowFav ? 'Remove from favorites' : 'Save to favorites';
        mobileFavBtn.setAttribute('aria-label', mobileFavBtn.title);
        trackEvent('toggle_verse_favorite', {
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          isFavorited: nowFav,
          mode: 'home_votd'
        });
      });
    }

    // ── Mobile Bookmark Action & Modal ──
    const mobileBookmarkBtn = container.querySelector('#votd-mobile-bookmark-btn');
    const bookmarkBackdrop = container.querySelector('#votd-bookmark-backdrop');
    const bookmarkCloseBtn = container.querySelector('#votd-bookmark-close-btn');
    const bookmarkSearchInput = container.querySelector('#votd-bookmark-search-input');
    const bookmarkSaveBtn = container.querySelector('#votd-bookmark-save-btn');
    const bookmarkFeedbackMsg = container.querySelector('#votd-bookmark-feedback-msg');
    const bookmarkRecentList = container.querySelector('#votd-bookmark-recent-list');

    function renderRecentBookmarks(filterText = '') {
      if (!bookmarkRecentList) return;
      const all = getAllBookmarks();
      const cleanFilter = filterText.trim().toLowerCase();
      let items = cleanFilter ? all.filter(b => (b.name || '').toLowerCase().includes(cleanFilter)).slice(0, 5) : all.slice(0, 5);

      if (items.length === 0) {
        bookmarkRecentList.innerHTML = `
          <div class="bookmark-empty-hint">
            ${cleanFilter ? `No match for "<strong>${escapeHtml(filterText)}</strong>". Click Save to create it!` : 'No bookmarks yet. Enter a name above to create one!'}
          </div>
        `;
        return;
      }

      bookmarkRecentList.innerHTML = items.map(bm => `
        <div class="bookmark-recent-item" data-id="${escapeHtml(bm.id)}" style="cursor:pointer;">
          <div class="bookmark-item-main">
            <span class="bookmark-item-name">${escapeHtml(bm.name)}</span>
            <span class="bookmark-item-ref">${escapeHtml(bm.verseRef || `${bm.bookId}:${bm.chapter}:${bm.verse || 1}`)}</span>
          </div>
          <button type="button" class="btn btn-secondary btn-xs bookmark-update-here-btn" data-update-id="${escapeHtml(bm.id)}" title="Update to this verse">Update</button>
        </div>
      `).join('');

      bookmarkRecentList.querySelectorAll('.bookmark-update-here-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const id = btn.getAttribute('data-update-id');
          updateBookmarkLocation(id, {
            bookId: currentVerse.bookId,
            chapter: currentVerse.chapter,
            verse: currentVerse.verse,
            verseRef: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`,
            verseText: currentVerse.text,
            translation: activeTranslation
          });
          if (bookmarkFeedbackMsg) {
            bookmarkFeedbackMsg.textContent = '✓ Updated bookmark location to today\'s verse!';
            bookmarkFeedbackMsg.hidden = false;
          }
          if (mobileBookmarkBtn) {
            mobileBookmarkBtn.classList.add('is-bookmarked');
          }
          renderRecentBookmarks(bookmarkSearchInput ? bookmarkSearchInput.value : '');
        });
      });
    }

    function showBookmarkFeedback(msg, isError = false) {
      if (!bookmarkFeedbackMsg) return;
      bookmarkFeedbackMsg.textContent = msg;
      bookmarkFeedbackMsg.classList.toggle('is-error', isError);
      bookmarkFeedbackMsg.hidden = false;
      setTimeout(() => {
        if (bookmarkFeedbackMsg) bookmarkFeedbackMsg.hidden = true;
      }, 4000);
    }

    function handleSaveBookmark() {
      if (!bookmarkSearchInput) return;
      const name = bookmarkSearchInput.value.trim();
      if (!name) {
        showBookmarkFeedback('Please enter a bookmark name.', true);
        bookmarkSearchInput.focus();
        return;
      }
      const vRef = `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`;
      const existing = findBookmarkByName(name);
      if (existing) {
        updateBookmarkLocation(existing.id, {
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          verseRef: vRef,
          verseText: currentVerse.text,
          translation: activeTranslation
        });
        showBookmarkFeedback(`✓ Updated existing bookmark "${existing.name}" to ${vRef}`);
      } else {
        createBookmark({
          name,
          bookId: currentVerse.bookId,
          chapter: currentVerse.chapter,
          verse: currentVerse.verse,
          verseRef: vRef,
          verseText: currentVerse.text,
          translation: activeTranslation
        });
        showBookmarkFeedback(`✓ Created new bookmark "${name}" at ${vRef}`);
      }
      if (mobileBookmarkBtn) {
        mobileBookmarkBtn.classList.add('is-bookmarked');
      }
      renderRecentBookmarks(bookmarkSearchInput.value);
    }

    if (mobileBookmarkBtn) {
      mobileBookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (bookmarkBackdrop) {
          if (bookmarkSearchInput) bookmarkSearchInput.value = '';
          if (bookmarkFeedbackMsg) bookmarkFeedbackMsg.hidden = true;
          renderRecentBookmarks('');
          bookmarkBackdrop.hidden = false;
          setTimeout(() => {
            if (bookmarkSearchInput) bookmarkSearchInput.focus();
          }, 60);
        }
      });
    }

    if (bookmarkCloseBtn) {
      bookmarkCloseBtn.addEventListener('click', () => {
        if (bookmarkBackdrop) bookmarkBackdrop.hidden = true;
      });
    }
    if (bookmarkBackdrop) {
      bookmarkBackdrop.addEventListener('click', (e) => {
        if (e.target === bookmarkBackdrop) bookmarkBackdrop.hidden = true;
      });
    }
    if (bookmarkSaveBtn) {
      bookmarkSaveBtn.addEventListener('click', handleSaveBookmark);
    }
    if (bookmarkSearchInput) {
      bookmarkSearchInput.addEventListener('input', (e) => {
        renderRecentBookmarks(e.target.value);
      });
      bookmarkSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSaveBookmark();
        } else if (e.key === 'Escape') {
          if (bookmarkBackdrop) bookmarkBackdrop.hidden = true;
        }
      });
    }

    // ── Mobile Share Action (iOS Share Tray + Clean Image Card Generation) ──
    const mobileShareBtn = container.querySelector('#votd-mobile-share-btn');
    if (mobileShareBtn) {
      mobileShareBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const shareTitle = `Promises — ${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}`;
        const shareText = `“${currentVerse.text}” — ${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse} (${activeTranslation})`;
        const shareUrl = `${window.location.origin}/${activeMode}/${currentVerse.bookId}/${currentVerse.chapter}/${currentVerse.verse}`;

        // Attempt generating clean uncurved card image poster
        let imageFile = null;
        try {
          const canvas = container.querySelector('#votd-share-canvas');
          if (canvas) {
            const ctx = canvas.getContext('2d');
            const W = 1200;
            const H = 900;
            canvas.width = W;
            canvas.height = H;

            // 1. Draw Clean Flat Background
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, W, H);

            // 2. Render SVG background artwork to canvas
            const blobSvg = new Blob([bgSvg], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(blobSvg);
            const img = new Image();
            await new Promise((resolve) => {
              img.onload = () => {
                ctx.globalAlpha = 0.55;
                ctx.drawImage(img, 0, 0, W, H);
                ctx.globalAlpha = 1.0;
                URL.revokeObjectURL(svgUrl);
                resolve();
              };
              img.onerror = () => {
                URL.revokeObjectURL(svgUrl);
                resolve();
              };
              img.src = svgUrl;
            });

            // 3. Draw Clean Center Plaque with soft shadow (no rounded card outer edges)
            const pad = 80;
            const boxW = W - pad * 2;
            const boxH = H - pad * 2;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
            ctx.fillRect(pad, pad, boxW, boxH);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2;
            ctx.strokeRect(pad, pad, boxW, boxH);

            // 4. Header: Reference & Translation
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const refTitle = `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}  ·  ${activeTranslation}`;
            ctx.fillText(refTitle, W / 2, pad + 60);

            // 5. Verse Quote Text (Word Wrapped)
            ctx.font = 'italic 38px Georgia, serif';
            ctx.fillStyle = '#0f172a';
            const maxTextWidth = boxW - 120;
            const lineHeight = 58;
            const words = (currentVerse.text || '').split(' ');
            const lines = [];
            let currentLine = '“';
            for (let i = 0; i < words.length; i++) {
              const testLine = currentLine + (currentLine === '“' ? '' : ' ') + words[i];
              if (ctx.measureText(testLine + '”').width > maxTextWidth && currentLine !== '“') {
                lines.push(currentLine);
                currentLine = words[i];
              } else {
                currentLine = testLine;
              }
            }
            lines.push(currentLine + '”');

            const totalTextHeight = lines.length * lineHeight;
            let startY = (H / 2) - (totalTextHeight / 2) + 20;
            for (let l = 0; l < lines.length; l++) {
              ctx.fillText(lines[l], W / 2, startY + l * lineHeight);
            }

            // 6. Footer: App branding and domain
            ctx.font = '600 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText('Promises to Creation  ·  promisestocreation.org', W / 2, pad + boxH - 65);

            // Convert canvas to File blob
            const imageBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
            if (imageBlob) {
              imageFile = new File([imageBlob], `promises-${currentVerse.bookName}-${currentVerse.chapter}-${currentVerse.verse}.png`, { type: 'image/png' });
            }
          }
        } catch (err) {
          // Graceful fallback to text/link share if canvas export fails
        }

        // Invoke native navigator.share (iOS Safari share tray)
        if (navigator.share) {
          try {
            if (imageFile && navigator.canShare && navigator.canShare({ files: [imageFile] })) {
              await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl,
                files: [imageFile]
              });
            } else {
              await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
              });
            }
            trackEvent('votd_share_success', { ref: `${currentVerse.bookName} ${currentVerse.chapter}:${currentVerse.verse}` });
          } catch (shareErr) {
            // User cancelled or share aborted
          }
        } else {
          // Desktop or non-supporting browser fallback: copy link to clipboard
          try {
            await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
            mobileShareBtn.innerHTML = `
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            `;
            setTimeout(() => {
              if (mobileShareBtn) {
                mobileShareBtn.innerHTML = `
                  <svg class="votd-share-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                `;
              }
            }, 2000);
          } catch (clipErr) {
            // Copy failed
          }
        }
      });
    }
  }

  renderCard();
}

/** Legacy route fallback — Hub removed per user request: redirect directly to promises */
export function renderHubScreen() {
  navigate('/promises');
}
