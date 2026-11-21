---
description: Rules and automated test requirements for Home screen random verse carousel read-marking and swipe navigation
globs: ["screens/home.js"]
---

# Home Screen Verse Carousel Read-Marking & Swipe Rules

Applies to paths matching:
- `screens/home.js`

## Invariants

1. **Landing on a verse NEVER marks it as read**:
   - Rendering or landing on a verse card (`renderCard`) must only check `isVerseCompletedForUser(...)` and must never invoke `markVerseAsRead`.
2. **Forward navigation (`direction === 'next'`) marks the departing verse as read**:
   - Advancing forward via the right chevron (`#votd-carousel-next-btn`), `ArrowRight`, or dragging/swiping the card to the left (`deltaX < 0`) marks the departing verse (`departingVerse`) as read via `markVerseAsRead`.
   - The newly landed verse remains unread until the user advances forward past it (or explicitly clicks Mark Verse Read).
3. **Backward navigation (`direction === 'prev'`) NEVER marks read and NEVER unmarks**:
   - Navigating backward via the left chevron (`#votd-carousel-prev-btn`), `ArrowLeft`, or dragging/swiping the card to the right (`deltaX > 0`) must NOT call `markVerseAsRead` on the departing verse and must NOT unmark previously read verses.
4. **Automated Test Verification**:
   - Whenever modifying `screens/home.js`, run:
     ```bash
     node --test .agent/tests/home-carousel.test.mjs
     ```
   - All 6 tests in `.agent/tests/home-carousel.test.mjs` must pass before committing or pushing.
