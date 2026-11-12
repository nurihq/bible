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
   - On mobile, replace the text `"Open verse →"` with just the arrow outline icon (`→`), with no circular background or button border.
4. **Four Bottom Actions on Mobile**:
   - **Order**: `Favourite`, `Bookmark`, `Share`, `Ellipses (⋯)`.
   - **Even Spacing & Centered Width**: Actions are centered and evenly spaced across ~80% of the card width (no left/right splitting).
   - **No Dividing Line**: No border line or divider between the verse text and the bottom actions row.
   - **No Button Background/Box (Icon Outline Only)**: Actions must have no button container, background, or box border — only clean SVG icon outlines.
   - **Heart Outline Only**: The favourite heart icon must never be solid/filled — it must remain an outline (`fill="none"`), brightening/coloring the stroke when favorited.
   - **Ellipses (`⋯`)**: Opens a popup menu containing:
     - `Mark Verse Read`
     - `Open Whole Ch.`
   - **Share button**:
     - Invokes native iOS / mobile `navigator.share` tray.
     - Generates and attaches a clean, uncurved card image (pure flat poster with background artwork, chapter & verse title, quote, and branding without rounded outer card edges).
     - Falls back gracefully to sharing verse text/link or clipboard copy.
5. **Procedural Background Image**:
   - Each verse renders an elegant, soft procedural background SVG artwork behind the card text on mobile (`generateArtBackgroundSvg(templateIdx)` in `meditate-art.js`), keyed deterministically to the verse reference.
