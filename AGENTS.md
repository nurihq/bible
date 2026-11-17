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
     - Generates and attaches a clean card image matching the actual VOTD card aesthetic (full-bleed background artwork, reference header, translation, and quote typography with no white plaque or site branding footer).
     - Shares the image file together with the link to the verse/domain.
     - Falls back gracefully to sharing verse text/link or clipboard copy.
5. **Procedural Background Image**:
   - Each verse renders an elegant, soft procedural background SVG artwork behind the card text on mobile (`generateArtBackgroundSvg(templateIdx)` in `meditate-art.js`), keyed deterministically to the verse reference.
6. **Pure Random Verses (No Curated Pool)**:
   - Daily and home verses must strictly be chosen purely at random across the entire Bible canon (all 66 books and 31,102 verses) via `getRandomVerseRef()` in `bible-data.js`.
   - Never reintroduce curated verse pools, hardcoded highlight lists, or artificial theme filters for the verse of the day.
7. **Mobile-Only Interactive Card Drag & Swipe Physics**:
   - On mobile screens (`@media (max-width: 720px)` and touch screens), the verse card provides a tactile 1:1 finger-following drag experience:
     - **Interactive 1:1 Drag**: The entire `#votd-card` moves with the user's finger with dynamic rotation tilt, subtle opacity fade, and elastic rubber-band resistance when at the start of history.
     - **Swipe Left**: Flinging or dragging past the threshold dismisses the card offscreen to the left and smoothly slides in a fresh random Bible verse from the right.
     - **Swipe Right**: Flinging or dragging right dismisses the card offscreen to the right and smoothly slides back to the previous verse in the history stack.
     - **Snap-Back Physics**: Releasing below the threshold smoothly springs the card back into its centered home position with cubic-bezier easing.
     - **Daily Index & History Persistence**: Whenever the user swipes away to a new verse, that new verse becomes the active daily verse and the entire history stack is saved in local storage for the remainder of the day. Refreshing or reopening the app stays on the current verse, while still allowing the user to swipe back through all previous verses seen earlier that day.
     - Preserves vertical page scrolling, button clicks, and card taps without touch conflicts.
8. **Mobile Read-Only Mode Default**:
   - On mobile devices, the app defaults to read-only mode (`draw` mode / verse coloring view) instead of type mode when no preference has been explicitly set.
9. **Speak Mode On-Demand Microphone Prompt**:
   - In Speak Mode, the microphone must default to OFF (`micEnabled = false`).
   - The browser must only request/prompt for microphone access after the user explicitly clicks the "Start" button (`#speak-mic-toggle-btn`).
10. **Full-Height Mobile Tile**:
   - On mobile screens (`@media (max-width: 720px)`), the main practice viewport card tile (`.typing-viewport-wrapper` and `.typing-passage-scroll`) expands to fill the entire remaining vertical viewport height in all modes (Type, Speak, Draw).
