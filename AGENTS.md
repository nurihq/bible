# Project Rules: Promises (Bible App)

## Mobile Verse of the Day Card (`screens/home.js`, `styles.css`)

Applies to paths matching:
- `screens/home.js`
- `styles.css`
- `meditate-art.js`

### Guidelines & Requirements:
1. **Mobile-Only Scope (`@media (max-width: 720px)`)**:
   - The custom "cute" design applies strictly to mobile screens. Desktop retains the full hero layout and desktop actions row.
2. **Tag Removal**:
   - The theme tag (e.g. `"Hope & Future"`, `votd-tag`) must NOT appear on mobile.
3. **Open Verse Action**:
   - On mobile, replace the text `"Open verse →"` with just the circle arrow button (`→`).
4. **Four Bottom Actions on Mobile**:
   - **Three Horizontal Dots (`⋯`)** on the bottom-left: Opens a popup menu containing:
     - `Mark Verse Read`
     - `Open Whole Ch.`
   - **Favourite (`❤️` / `🤍`)**: Toggles verse in favorites (`toggleVerseFavorite`).
   - **Bookmark ribbon icon**: Opens the bookmark modal to search or create/update a bookmark for today's verse (`toggleVerseBookmark` / `createBookmark`).
   - **Share button**:
     - Invokes native iOS / mobile `navigator.share` tray.
     - Generates and attaches a clean, uncurved card image (pure flat poster with background artwork, chapter & verse title, quote, and branding without rounded outer card edges).
     - Falls back gracefully to sharing verse text/link or clipboard copy.
5. **Procedural Background Image**:
   - Each verse renders an elegant, soft procedural background SVG artwork behind the card text on mobile (`generateArtBackgroundSvg(templateIdx)` in `meditate-art.js`), keyed deterministically to the verse reference.
