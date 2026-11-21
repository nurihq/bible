---
description: Rules and automated test requirements for Home screen random verse carousel read-marking and swipe navigation
globs: ["screens/home.js", "api.js"]
---

# Home Screen Verse Carousel Read-Marking & Swipe Rules

Applies to paths matching:
- `screens/home.js`
- `api.js`

## Invariants

1. **Landing on a verse NEVER marks it as read**:
   - Rendering or landing on a verse card (`renderCard`) must only check `isVerseCompletedForUser(...)` and must never invoke `markVerseAsRead`.
2. **Forward navigation (`direction === 'next'`) marks the departing verse as read**:
   - Advancing forward via the right chevron (`#votd-carousel-next-btn`), `ArrowRight`, or dragging/swiping the card to the left (`deltaX < 0`) marks the departing verse (`departingVerse`) as read via `markVerseAsRead`.
   - The newly landed verse remains unread until the user advances forward past it (or explicitly clicks Mark Verse Read).
3. **Backward navigation (`direction === 'prev'`) NEVER marks read and NEVER unmarks**:
   - Navigating backward via the left chevron (`#votd-carousel-prev-btn`), `ArrowLeft`, or dragging/swiping the card to the right (`deltaX > 0`) must NOT call `markVerseAsRead` on the departing verse and must NOT unmark previously read verses.
4. **Single-Verse Isolation**:
   - Marking a verse as read on swipe or button must ONLY mark that specific verse as read.
   - It must NEVER mark the parent chapter as `isFullyRead` or `isFullyCompleted` unless every single verse in the chapter has truly been completed (`readCount >= totalVerses`).
   - Non-swiped verses in the same chapter must remain unread (`isVerseRead === false`).
   - Corrupted `isFullyRead` flags on partial chapters in local storage must self-heal cleanly.
5. **Automated Test Verification**:
   - Whenever modifying `screens/home.js` or `api.js`, run:
     ```bash
     node --test .agent/tests/home-carousel.test.mjs
     ```
   - All tests in `.agent/tests/home-carousel.test.mjs` must pass before committing or pushing.
