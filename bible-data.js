// Complete Canon Metadata (66 Books, 1,189 Chapters, ~31,100 Verses) & 22 Bible Translations
import { VERSE_COUNTS } from './verse-counts.js?v=20261108_v22';

export const TOTAL_BIBLE_CHAPTERS = 1189;
export const TOTAL_OT_CHAPTERS = 929;
export const TOTAL_NT_CHAPTERS = 260;
export const TOTAL_BIBLE_VERSES = VERSE_COUNTS.reduce((sum, book) => sum + book.reduce((a, b) => a + b, 0), 0);

export function getChapterVerseCount(bookId, chapter) {
  const book = VERSE_COUNTS[Number(bookId) - 1];
  return (book && book[Number(chapter) - 1]) || 0;
}

export function getBookVerseCount(bookId) {
  const book = VERSE_COUNTS[Number(bookId) - 1];
  return book ? book.reduce((a, b) => a + b, 0) : 0;
}

export function getVerseRefByIndex(targetIdx = 0) {
  const normIdx = ((Math.floor(Number(targetIdx) || 0) % TOTAL_BIBLE_VERSES) + TOTAL_BIBLE_VERSES) % TOTAL_BIBLE_VERSES;
  let curIdx = 0;
  for (let b = 0; b < VERSE_COUNTS.length; b++) {
    const bookVerses = VERSE_COUNTS[b];
    for (let c = 0; c < bookVerses.length; c++) {
      const count = bookVerses[c];
      if (normIdx < curIdx + count) {
        const bookId = b + 1;
        const chapter = c + 1;
        const verse = (normIdx - curIdx) + 1;
        return { bookId, chapter, verse };
      }
      curIdx += count;
    }
  }
  return { bookId: 43, chapter: 3, verse: 16 };
}

export function getRandomVerseRef(exclude = null) {
  for (let attempts = 0; attempts < 20; attempts++) {
    const targetIdx = Math.floor(Math.random() * TOTAL_BIBLE_VERSES);
    const ref = getVerseRefByIndex(targetIdx);
    if (!exclude || exclude.bookId !== ref.bookId || exclude.chapter !== ref.chapter || exclude.verse !== ref.verse) {
      return ref;
    }
  }
  return { bookId: 43, chapter: 3, verse: 16 };
}

export const BIBLE_TRANSLATIONS = [
  { code: 'ESV', name: 'English Standard Version', shortName: 'ESV', year: '2016', isDefault: true },
  { code: 'BSB', name: 'Berean Standard Bible', shortName: 'BSB', year: '2023' },
  { code: 'NLT', name: 'New Living Translation', shortName: 'NLT', year: '2015' },
  { code: 'NASB', name: 'New American Standard Bible', shortName: 'NASB', year: '1995' },
  { code: 'CSB17', name: 'Christian Standard Bible', shortName: 'CSB', year: '2017' },
  { code: 'LSB', name: 'Legacy Standard Bible', shortName: 'LSB', year: '2021' },
  { code: 'NKJV', name: 'New King James Version', shortName: 'NKJV', year: '1982' },
  { code: 'KJV', name: 'King James Version', shortName: 'KJV', year: '1769' },
  { code: 'NET', name: 'New English Translation', shortName: 'NET', year: '2007' },
  { code: 'WEB', name: 'World English Bible', shortName: 'WEB', year: '2020' },
  { code: 'RSV', name: 'Revised Standard Version', shortName: 'RSV', year: '1952' },
  { code: 'NRSVCE', name: 'New Revised Standard Version', shortName: 'NRSV', year: '1993' },
  { code: 'ASV', name: 'American Standard Version', shortName: 'ASV', year: '1901' },
  { code: 'CEB', name: 'Common English Bible', shortName: 'CEB', year: '2011' },
  { code: 'GNT', name: 'Good News Translation', shortName: 'GNT', year: '1992' },
  { code: 'ERV', name: 'Easy-to-Read Version', shortName: 'ERV', year: '2006' },
  { code: 'AMP', name: 'Amplified Bible', shortName: 'AMP', year: '2015' },
  { code: 'MSG', name: 'The Message', shortName: 'MSG', year: '2002' },
  { code: 'CJB', name: 'Complete Jewish Bible', shortName: 'CJB', year: '1998' },
  { code: 'TLV', name: 'Tree of Life Version', shortName: 'TLV', year: '2014' },
  { code: 'YLT', name: "Young's Literal Translation", shortName: 'YLT', year: '1898' },
  { code: 'GNV', name: 'Geneva Bible', shortName: 'GNV', year: '1599' }
];

export function getTranslationByCode(code) {
  const upper = (code || 'ESV').toUpperCase();
  return BIBLE_TRANSLATIONS.find(t => t.code === upper || t.shortName === upper) || BIBLE_TRANSLATIONS[0];
}

export const BIBLE_BOOKS = [
  // Old Testament (39 books, 929 chapters)
  { id: 1, name: 'Genesis', abbr: 'Gen', aliases: ['gen', 'ge', 'gn'], testament: 'OT', category: 'Law', chapters: 50 },
  { id: 2, name: 'Exodus', abbr: 'Exod', aliases: ['exo', 'ex', 'exod'], testament: 'OT', category: 'Law', chapters: 40 },
  { id: 3, name: 'Leviticus', abbr: 'Lev', aliases: ['lev', 'le', 'lv'], testament: 'OT', category: 'Law', chapters: 27 },
  { id: 4, name: 'Numbers', abbr: 'Num', aliases: ['num', 'nu', 'nm', 'nb'], testament: 'OT', category: 'Law', chapters: 36 },
  { id: 5, name: 'Deuteronomy', abbr: 'Deut', aliases: ['deut', 'de', 'dt'], testament: 'OT', category: 'Law', chapters: 34 },
  { id: 6, name: 'Joshua', abbr: 'Josh', aliases: ['josh', 'jos', 'jsh'], testament: 'OT', category: 'History', chapters: 24 },
  { id: 7, name: 'Judges', abbr: 'Judg', aliases: ['judg', 'jdg', 'jg', 'jdgs'], testament: 'OT', category: 'History', chapters: 21 },
  { id: 8, name: 'Ruth', abbr: 'Ruth', aliases: ['ruth', 'rth', 'ru'], testament: 'OT', category: 'History', chapters: 4 },
  { id: 9, name: '1 Samuel', abbr: '1 Sam', aliases: ['1sam', '1sa', '1s', '1 samuel', '1 sam', 'i samuel', 'i sam'], testament: 'OT', category: 'History', chapters: 31 },
  { id: 10, name: '2 Samuel', abbr: '2 Sam', aliases: ['2sam', '2sa', '2s', '2 samuel', '2 sam', 'ii samuel', 'ii sam'], testament: 'OT', category: 'History', chapters: 24 },
  { id: 11, name: '1 Kings', abbr: '1 Kgs', aliases: ['1kgs', '1ki', '1k', '1 kings', '1 kgs', 'i kings'], testament: 'OT', category: 'History', chapters: 22 },
  { id: 12, name: '2 Kings', abbr: '2 Kgs', aliases: ['2kgs', '2ki', '2k', '2 kings', '2 kgs', 'ii kings'], testament: 'OT', category: 'History', chapters: 25 },
  { id: 13, name: '1 Chronicles', abbr: '1 Chr', aliases: ['1chr', '1ch', '1 chronicles', '1 chr', 'i chronicles'], testament: 'OT', category: 'History', chapters: 29 },
  { id: 14, name: '2 Chronicles', abbr: '2 Chr', aliases: ['2chr', '2ch', '2 chronicles', '2 chr', 'ii chronicles'], testament: 'OT', category: 'History', chapters: 36 },
  { id: 15, name: 'Ezra', abbr: 'Ezra', aliases: ['ezra', 'ezr', 'ez'], testament: 'OT', category: 'History', chapters: 10 },
  { id: 16, name: 'Nehemiah', abbr: 'Neh', aliases: ['neh', 'ne'], testament: 'OT', category: 'History', chapters: 13 },
  { id: 17, name: 'Esther', abbr: 'Esth', aliases: ['esth', 'est', 'es'], testament: 'OT', category: 'History', chapters: 10 },
  { id: 18, name: 'Job', abbr: 'Job', aliases: ['job', 'jb'], testament: 'OT', category: 'Poetry', chapters: 42 },
  { id: 19, name: 'Psalms', abbr: 'Ps', aliases: ['ps', 'psa', 'psalm', 'psalms', 'pss'], testament: 'OT', category: 'Poetry', chapters: 150 },
  { id: 20, name: 'Proverbs', abbr: 'Prov', aliases: ['prov', 'pro', 'prv', 'pr'], testament: 'OT', category: 'Poetry', chapters: 31 },
  { id: 21, name: 'Ecclesiastes', abbr: 'Eccl', aliases: ['eccl', 'ecc', 'ec', 'qoh'], testament: 'OT', category: 'Poetry', chapters: 12 },
  { id: 22, name: 'Song of Solomon', abbr: 'Song', aliases: ['song', 'sos', 'so', 'canticles', 'song of songs', 'song of solomon'], testament: 'OT', category: 'Poetry', chapters: 8 },
  { id: 23, name: 'Isaiah', abbr: 'Isa', aliases: ['isa', 'is'], testament: 'OT', category: 'Major Prophets', chapters: 66 },
  { id: 24, name: 'Jeremiah', abbr: 'Jer', aliases: ['jer', 'je', 'jr'], testament: 'OT', category: 'Major Prophets', chapters: 52 },
  { id: 25, name: 'Lamentations', abbr: 'Lam', aliases: ['lam', 'la'], testament: 'OT', category: 'Major Prophets', chapters: 5 },
  { id: 26, name: 'Ezekiel', abbr: 'Ezek', aliases: ['ezek', 'eze', 'ezk'], testament: 'OT', category: 'Major Prophets', chapters: 48 },
  { id: 27, name: 'Daniel', abbr: 'Dan', aliases: ['dan', 'da', 'dn'], testament: 'OT', category: 'Major Prophets', chapters: 12 },
  { id: 28, name: ' Hosea'.trim(), abbr: 'Hos', aliases: ['hos', 'ho'], testament: 'OT', category: 'Minor Prophets', chapters: 14 },
  { id: 29, name: 'Joel', abbr: 'Joel', aliases: ['joel', 'joe', 'jl'], testament: 'OT', category: 'Minor Prophets', chapters: 3 },
  { id: 30, name: 'Amos', abbr: 'Amos', aliases: ['amos', 'am'], testament: 'OT', category: 'Minor Prophets', chapters: 9 },
  { id: 31, name: 'Obadiah', abbr: 'Obad', aliases: ['obad', 'ob'], testament: 'OT', category: 'Minor Prophets', chapters: 1 },
  { id: 32, name: 'Jonah', abbr: 'Jonah', aliases: ['jonah', 'jon', 'jnh'], testament: 'OT', category: 'Minor Prophets', chapters: 4 },
  { id: 33, name: 'Micah', abbr: 'Mic', aliases: ['mic', 'mc'], testament: 'OT', category: 'Minor Prophets', chapters: 7 },
  { id: 34, name: 'Nahum', abbr: 'Nah', aliases: ['nah', 'na'], testament: 'OT', category: 'Minor Prophets', chapters: 3 },
  { id: 35, name: 'Habakkuk', abbr: 'Hab', aliases: ['hab', 'hb'], testament: 'OT', category: 'Minor Prophets', chapters: 3 },
  { id: 36, name: 'Zephaniah', abbr: 'Zeph', aliases: ['zeph', 'zep', 'zp'], testament: 'OT', category: 'Minor Prophets', chapters: 3 },
  { id: 37, name: 'Haggai', abbr: 'Hag', aliases: ['hag', 'hg'], testament: 'OT', category: 'Minor Prophets', chapters: 2 },
  { id: 38, name: 'Zechariah', abbr: 'Zech', aliases: ['zech', 'zec', 'zc'], testament: 'OT', category: 'Minor Prophets', chapters: 14 },
  { id: 39, name: 'Malachi', abbr: 'Mal', aliases: ['mal', 'ml'], testament: 'OT', category: 'Minor Prophets', chapters: 4 },

  // New Testament (27 books, 260 chapters)
  { id: 40, name: 'Matthew', abbr: 'Matt', aliases: ['matt', 'mat', 'mt'], testament: 'NT', category: 'Gospels & Acts', chapters: 28 },
  { id: 41, name: 'Mark', abbr: 'Mark', aliases: ['mark', 'mrk', 'mk', 'mr'], testament: 'NT', category: 'Gospels & Acts', chapters: 16 },
  { id: 42, name: 'Luke', abbr: 'Luke', aliases: ['luke', 'luk', 'lk'], testament: 'NT', category: 'Gospels & Acts', chapters: 24 },
  { id: 43, name: 'John', abbr: 'John', aliases: ['john', 'jhn', 'jn'], testament: 'NT', category: 'Gospels & Acts', chapters: 21 },
  { id: 44, name: 'Acts', abbr: 'Acts', aliases: ['acts', 'act', 'ac'], testament: 'NT', category: 'Gospels & Acts', chapters: 28 },
  { id: 45, name: 'Romans', abbr: 'Rom', aliases: ['rom', 'ro', 'rm'], testament: 'NT', category: 'Pauline Epistles', chapters: 16 },
  { id: 46, name: '1 Corinthians', abbr: '1 Cor', aliases: ['1cor', '1co', '1 corinthians', '1 cor', 'i corinthians'], testament: 'NT', category: 'Pauline Epistles', chapters: 16 },
  { id: 47, name: '2 Corinthians', abbr: '2 Cor', aliases: ['2cor', '2co', '2 corinthians', '2 cor', 'ii corinthians'], testament: 'NT', category: 'Pauline Epistles', chapters: 13 },
  { id: 48, name: 'Galatians', abbr: 'Gal', aliases: ['gal', 'ga'], testament: 'NT', category: 'Pauline Epistles', chapters: 6 },
  { id: 49, name: 'Ephesians', abbr: 'Eph', aliases: ['eph', 'ep'], testament: 'NT', category: 'Pauline Epistles', chapters: 6 },
  { id: 50, name: 'Philippians', abbr: 'Phil', aliases: ['phil', 'php', 'pp'], testament: 'NT', category: 'Pauline Epistles', chapters: 4 },
  { id: 51, name: 'Colossians', abbr: 'Col', aliases: ['col', 'co'], testament: 'NT', category: 'Pauline Epistles', chapters: 4 },
  { id: 52, name: '1 Thessalonians', abbr: '1 Thess', aliases: ['1thess', '1th', '1 thessalonians', '1 thess'], testament: 'NT', category: 'Pauline Epistles', chapters: 5 },
  { id: 53, name: '2 Thessalonians', abbr: '2 Thess', aliases: ['2thess', '2th', '2 thessalonians', '2 thess'], testament: 'NT', category: 'Pauline Epistles', chapters: 3 },
  { id: 54, name: '1 Timothy', abbr: '1 Tim', aliases: ['1tim', '1ti', '1 timothy', '1 tim'], testament: 'NT', category: 'Pauline Epistles', chapters: 6 },
  { id: 55, name: '2 Timothy', abbr: '2 Tim', aliases: ['2tim', '2ti', '2 timothy', '2 tim'], testament: 'NT', category: 'Pauline Epistles', chapters: 4 },
  { id: 56, name: 'Titus', abbr: 'Titus', aliases: ['titus', 'tit', 'ti'], testament: 'NT', category: 'Pauline Epistles', chapters: 3 },
  { id: 57, name: 'Philemon', abbr: 'Phlm', aliases: ['phlm', 'phm', 'pm', 'philemon'], testament: 'NT', category: 'Pauline Epistles', chapters: 1 },
  { id: 58, name: 'Hebrews', abbr: 'Heb', aliases: ['heb', 'he'], testament: 'NT', category: 'General Epistles', chapters: 13 },
  { id: 59, name: 'James', abbr: 'Jas', aliases: ['jas', 'jm', 'james'], testament: 'NT', category: 'General Epistles', chapters: 5 },
  { id: 60, name: '1 Peter', abbr: '1 Pet', aliases: ['1pet', '1pe', '1pt', '1p', '1 peter', '1 pet'], testament: 'NT', category: 'General Epistles', chapters: 5 },
  { id: 61, name: '2 Peter', abbr: '2 Pet', aliases: ['2pet', '2pe', '2pt', '2p', '2 peter', '2 pet'], testament: 'NT', category: 'General Epistles', chapters: 3 },
  { id: 62, name: '1 John', abbr: '1 John', aliases: ['1john', '1jn', '1j', '1 john', '1 jn'], testament: 'NT', category: 'General Epistles', chapters: 5 },
  { id: 63, name: '2 John', abbr: '2 John', aliases: ['2john', '2jn', '2j', '2 john', '2 jn'], testament: 'NT', category: 'General Epistles', chapters: 1 },
  { id: 64, name: '3 John', abbr: '3 John', aliases: ['3john', '3jn', '3j', '3 john', '3 jn'], testament: 'NT', category: 'General Epistles', chapters: 1 },
  { id: 65, name: 'Jude', abbr: 'Jude', aliases: ['jude', 'jud', 'jd'], testament: 'NT', category: 'General Epistles', chapters: 1 },
  { id: 66, name: 'Revelation', abbr: 'Rev', aliases: ['rev', 're', 'apoc', 'revelations'], testament: 'NT', category: 'Prophecy', chapters: 22 }
];

export function getBookById(bookId) {
  const id = Number(bookId);
  return BIBLE_BOOKS.find(b => b.id === id) || BIBLE_BOOKS[0];
}

export function getNextChapterRef(bookId, chapter) {
  const book = getBookById(bookId);
  const ch = Number(chapter) || 1;
  if (ch < book.chapters) {
    return { bookId: book.id, bookName: book.name, chapter: ch + 1 };
  }
  const nextBook = BIBLE_BOOKS.find(b => b.id === book.id + 1) || BIBLE_BOOKS[0];
  return { bookId: nextBook.id, bookName: nextBook.name, chapter: 1 };
}

export function getPrevChapterRef(bookId, chapter) {
  const book = getBookById(bookId);
  const ch = Number(chapter) || 1;
  if (ch > 1) {
    return { bookId: book.id, bookName: book.name, chapter: ch - 1 };
  }
  const prevBook = BIBLE_BOOKS.find(b => b.id === book.id - 1) || BIBLE_BOOKS[BIBLE_BOOKS.length - 1];
  return { bookId: prevBook.id, bookName: prevBook.name, chapter: prevBook.chapters };
}

/**
 * Smart search for Bible chapters & verses (e.g. "Gen 1", "Prov 3:5", "Psalm 23:1", "1 Cor 13:4", "Romans 8")
 */
export function searchBibleChapters(rawQuery, maxResults = 12) {
  const q = (rawQuery || '').trim().toLowerCase();
  if (!q) return [];

  // Match optional leading number (1/2/3), book name, optional chapter, and optional :verse (or space verse)
  const match = q.match(/^([1-3]?\s*[a-z]+(?:\s+of\s+[a-z]+)?)\s*(?:(\d+)(?:\s*[:.]\s*(\d+)|\s+(\d+))?)?$/i);
  const results = [];

  if (match) {
    const bookPart = match[1].trim().replace(/\s+/g, ' ');
    const bookCompact = bookPart.replace(/\s+/g, '');
    const chapterNum = match[2] ? parseInt(match[2], 10) : null;
    const verseNumRaw = match[3] || match[4] || null;
    const verseNum = verseNumRaw ? parseInt(verseNumRaw, 10) : null;

    // Score matching books
    const matchedBooks = [];
    for (const book of BIBLE_BOOKS) {
      const nameLower = book.name.toLowerCase();
      const nameCompact = nameLower.replace(/\s+/g, '');
      const abbrLower = book.abbr.toLowerCase();

      let score = 0;
      if (nameLower === bookPart || nameCompact === bookCompact || book.aliases.includes(bookPart) || book.aliases.includes(bookCompact)) {
        score = 100;
      } else if (nameLower.startsWith(bookPart) || nameCompact.startsWith(bookCompact) || abbrLower.startsWith(bookPart)) {
        score = 80;
      } else if (book.aliases.some(a => a.startsWith(bookCompact))) {
        score = 70;
      } else if (nameLower.includes(bookPart)) {
        score = 50;
      }

      if (score > 0) {
        matchedBooks.push({ book, score });
      }
    }

    matchedBooks.sort((a, b) => b.score - a.score || a.book.id - b.book.id);

    for (const { book } of matchedBooks) {
      if (chapterNum !== null) {
        if (chapterNum >= 1 && chapterNum <= book.chapters) {
          if (verseNum !== null && verseNum >= 1) {
            // 1. Single-Verse Granularity option
            results.push({
              bookId: book.id,
              bookName: book.name,
              chapter: chapterNum,
              verse: verseNum,
              mode: 'verse',
              label: `${book.name} ${chapterNum}:${verseNum}`,
              subtitle: `Single Verse · ${book.testament} · ${book.category}`,
              category: book.category,
              testament: book.testament
            });
            // 2. Full Chapter starting at that verse option
            results.push({
              bookId: book.id,
              bookName: book.name,
              chapter: chapterNum,
              verse: verseNum,
              mode: 'chapter-at-verse',
              label: `${book.name} ${chapterNum} (Start at v. ${verseNum})`,
              subtitle: `Full Chapter starting at Verse ${verseNum}`,
              category: book.category,
              testament: book.testament
            });
          } else {
            results.push({
              bookId: book.id,
              bookName: book.name,
              chapter: chapterNum,
              verse: null,
              mode: 'chapter',
              label: `${book.name} ${chapterNum}`,
              subtitle: `${book.testament} · ${book.category}`,
              category: book.category,
              testament: book.testament
            });
          }
        }
        // Also suggest chapters starting with those digits when no specific verse was typed
        if (verseNum === null) {
          for (let c = 1; c <= book.chapters && results.length < maxResults; c++) {
            if (c !== chapterNum && String(c).startsWith(String(chapterNum))) {
              results.push({
                bookId: book.id,
                bookName: book.name,
                chapter: c,
                verse: null,
                mode: 'chapter',
                label: `${book.name} ${c}`,
                subtitle: `${book.testament} · ${book.category}`,
                category: book.category,
                testament: book.testament
              });
            }
          }
        }
      } else {
        // No chapter specified: show Chapter 1 plus next few chapters if single book matched
        const limitForBook = matchedBooks.length === 1 ? Math.min(book.chapters, maxResults) : 3;
        for (let c = 1; c <= Math.min(book.chapters, limitForBook) && results.length < maxResults; c++) {
          results.push({
            bookId: book.id,
            bookName: book.name,
            chapter: c,
            verse: null,
            mode: 'chapter',
            label: `${book.name} ${c}`,
            subtitle: `${book.testament} · ${book.category}`,
            category: book.category,
            testament: book.testament
          });
        }
      }
      if (results.length >= maxResults) break;
    }
  }

  return results.slice(0, maxResults);
}

/**
 * Clean & normalize raw verse text from API into standard keyboard-typable ASCII
 */
export function sanitizeVerseText(raw) {
  if (!raw) return '';
  let s = String(raw);

  // 1. Remove Strong's numbers <S>1234</S>
  s = s.replace(/<S>[\s\S]*?<\/S>/gi, '');

  // 2. Remove footnote/cross-ref superscripts <sup>...</sup>
  s = s.replace(/<sup>[\s\S]*?<\/sup>/gi, '');

  // 3. Remove bold inline headings at start of verses like <b>Creation</b><br/>
  s = s.replace(/<b>[\s\S]*?<\/b>\s*(?:<br\s*\/?>)?/gi, ' ');

  // 4. Replace <br> tags with spaces
  s = s.replace(/<br\s*\/?>/gi, ' ');

  // 5. Strip any remaining HTML tags
  s = s.replace(/<[^>]+>/g, '');

  // 6. Decode HTML entities
  const txt = document.createElement('textarea');
  txt.innerHTML = s;
  s = txt.value;

  // 7. Normalize smart quotes, apostrophes, dashes, ellipses to standard keyboard ASCII
  s = s
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u2014\u2015]/g, ' - ')
    .replace(/[\u2013\u2012\u2010\u2011]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');

  // 8. Remove stray spaces before punctuation caused by stripped tags
  s = s.replace(/\s+([,.;:?!])/g, '$1');

  // 9. Filter out any non-printable or non-ASCII characters that cannot be typed on a standard keyboard
  s = s.replace(/[^\x20-\x7E]/g, '');

  // 10. Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

const CHAPTER_CACHE_PREFIX = 'bible_ch_cache_v1_';
const inMemoryChapterCache = new Map();
const inFlightChapterPromises = new Map();

function safeStoreCache(key, verses) {
  const valueStr = JSON.stringify(verses);
  try {
    sessionStorage.setItem(key, valueStr);
  } catch (e) {}
  try {
    localStorage.setItem(key, valueStr);
  } catch (e) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CHAPTER_CACHE_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      for (let i = 0; i < Math.min(keysToRemove.length, 25); i++) {
        localStorage.removeItem(keysToRemove[i]);
      }
      localStorage.setItem(key, valueStr);
    } catch (e2) {}
  }
}

export function getCachedChapterVerses(translation = 'ESV', bookId = 1, chapter = 1) {
  const tr = getTranslationByCode(translation).code;
  const book = getBookById(bookId);
  const ch = Math.max(1, Math.min(Number(chapter) || 1, book.chapters));
  const cacheKey = `${CHAPTER_CACHE_PREFIX}${tr}_${book.id}_${ch}`;

  if (inMemoryChapterCache.has(cacheKey)) {
    return inMemoryChapterCache.get(cacheKey);
  }

  try {
    const cached = sessionStorage.getItem(cacheKey) || localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryChapterCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch (e) {}

  return null;
}

export async function fetchChapterVerses(translation = 'ESV', bookId = 1, chapter = 1) {
  const tr = getTranslationByCode(translation).code;
  const book = getBookById(bookId);
  const ch = Math.max(1, Math.min(Number(chapter) || 1, book.chapters));
  const cacheKey = `${CHAPTER_CACHE_PREFIX}${tr}_${book.id}_${ch}`;

  // 1. Check synchronous cache first
  const cached = getCachedChapterVerses(tr, book.id, ch);
  if (cached) {
    return cached;
  }

  // 2. Reuse in-flight request if already fetching this chapter
  if (inFlightChapterPromises.has(cacheKey)) {
    return inFlightChapterPromises.get(cacheKey);
  }

  const fetchPromise = (async () => {
    // Primary API: bolls.life (supports ESV, BSB, NLT, NASB, CSB17, LSB, NKJV, KJV, NET, WEB, RSV, etc.)
    try {
      const url = `https://bolls.life/get-text/${encodeURIComponent(tr)}/${book.id}/${ch}/`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const verses = data
          .map(v => ({
            verse: Number(v.verse),
            text: sanitizeVerseText(v.text)
          }))
          .filter(v => v.text.length > 0);

        if (verses.length > 0) {
          inMemoryChapterCache.set(cacheKey, verses);
          safeStoreCache(cacheKey, verses);
          return verses;
        }
      }
    } catch (primaryErr) {
      console.warn('Primary Bible API failed, trying fallback:', primaryErr);
    }

    // Fallback API: bible-api.com
    const fallbackTr = tr === 'KJV' ? 'kjv' : 'web';
    const fallbackUrl = `https://bible-api.com/${encodeURIComponent(book.name + ' ' + ch)}?translation=${fallbackTr}`;
    const fallbackRes = await fetch(fallbackUrl);
    if (!fallbackRes.ok) {
      throw new Error(`Unable to load ${book.name} ${ch} (${tr}). Please check your connection.`);
    }
    const fallbackData = await fallbackRes.json();
    const verses = (fallbackData.verses || [])
      .map(v => ({
        verse: Number(v.verse),
        text: sanitizeVerseText(v.text)
      }))
      .filter(v => v.text.length > 0);

    if (verses.length > 0) {
      inMemoryChapterCache.set(cacheKey, verses);
      safeStoreCache(cacheKey, verses);
    }

    return verses;
  })();

  inFlightChapterPromises.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightChapterPromises.delete(cacheKey);
  }
}

export function prefetchChapterVerses(translation = 'ESV', bookId = 1, chapter = 1) {
  return fetchChapterVerses(translation, bookId, chapter).catch((err) => {
    console.debug('Prefetch chapter verse failed silently:', err);
    return null;
  });
}

const PRELOAD_POOL_SIZE = 5;
let randomVersePreloadQueue = [];
let isReplenishingPreloads = false;

export function getNextPreloadedRandomVerse(translation = 'ESV', exclude = null) {
  let selected = null;
  while (randomVersePreloadQueue.length > 0) {
    const candidate = randomVersePreloadQueue.shift();
    if (exclude && candidate.bookId === exclude.bookId && candidate.chapter === exclude.chapter && candidate.verse === exclude.verse) {
      continue;
    }
    selected = candidate;
    break;
  }

  if (!selected) {
    selected = getRandomVerseRef(exclude);
  }

  // Replenish in background
  replenishRandomVersePreloads(translation, selected);
  return selected;
}

export async function replenishRandomVersePreloads(translation = 'ESV', exclude = null) {
  if (isReplenishingPreloads) return;
  isReplenishingPreloads = true;

  try {
    while (randomVersePreloadQueue.length < PRELOAD_POOL_SIZE) {
      let candidate = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        const ref = getRandomVerseRef(exclude);
        const inQueue = randomVersePreloadQueue.some(
          item => item.bookId === ref.bookId && item.chapter === ref.chapter && item.verse === ref.verse
        );
        if (!inQueue) {
          candidate = ref;
          break;
        }
      }
      if (!candidate) break;

      randomVersePreloadQueue.push(candidate);
      await prefetchChapterVerses(translation, candidate.bookId, candidate.chapter);
    }
  } finally {
    isReplenishingPreloads = false;
  }
}
