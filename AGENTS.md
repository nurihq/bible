# Project Rules: Promises (Bible App)

## Mobile Verse of the Day Card (`screens/home.js`, `styles.css`)

Applies to paths matching:
- `screens/home.js`
- `styles.css`
- `meditate-art.js`

### Guidelines & Requirements:
1. **Universal Card Features & Responsive Layout (`styles.css`, `screens/home.js`)**:
   - The card features (procedural SVG artwork, clean header with arrow hint, and cute 4-action bar: Favourite, Bookmark, Share, and 3-Dots menu) apply universally on both mobile and desktop screens.
   - On desktop (> 720px), the card is flanked by sleek circular carousel chevron buttons (`#votd-carousel-prev-btn`, `#votd-carousel-next-btn`) with support for mouse drag-to-swipe physics and left/right keyboard arrow navigation (`ArrowLeft` / `ArrowRight`).
   - On mobile (<= 720px), the carousel chevron buttons are hidden in favor of natural 1:1 touch swipe physics.
2. **Auto-Mark Verse as Read on Swipe**:
   - Whenever the user swipes away from a verse on mobile, clicks a carousel button on desktop, or advances via keyboard arrow, the departing verse is automatically marked as read via `markVerseAsRead(departingVerse.bookId, departingVerse.chapter, departingVerse.verse, activeTranslation)`.
3. **Open Verse Action & Zero-Delay Instant Navigation**:
   - Tapping or clicking the card anywhere (except on bottom action buttons) transitions immediately to the practice screen (`/type`, `/draw`, `/speak`, or `/listen`).
   - The single verse text is synchronously saved to `sessionStorage` (`bible_single_verse_${bookId}_${chapter}_${verse}`) prior to navigation, enabling `screens/typing.js` to render `buildPassageDOM` in 0ms without waiting for full chapter network requests or flashing a loading spinner.
   - `touch-action: manipulation` across `.votd-card-wrapper, .votd-card, .votd-card *` removes the 300ms mobile tap delay.
4. **Four Bottom Actions (Universal)**:
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
   - Each verse renders an elegant, soft procedural background SVG artwork behind the card text (`generateArtBackgroundSvg(templateIdx)` in `meditate-art.js`), keyed deterministically to the verse reference.
6. **Pure Random Verses (No Curated Pool)**:
   - Daily and home verses must strictly be chosen purely at random across the entire Bible canon (all 66 books and 31,102 verses) via `getRandomVerseRef()` in `bible-data.js`.
   - Never reintroduce curated verse pools, hardcoded highlight lists, or artificial theme filters for the verse of the day.
7. **Interactive Card Drag, Instant Tap & Swipe Physics**:
   - The verse card provides a tactile 1:1 drag experience on both touch (mobile) and mouse (desktop):
     - **Interactive 1:1 Drag**: The entire `#votd-card` moves with user input with dynamic rotation tilt, subtle opacity fade, and elastic rubber-band resistance when at the start of history.
     - **Swipe Left**: Flinging or dragging past the threshold dismisses the card offscreen to the left and smoothly slides in a fresh random Bible verse from the right.
     - **Swipe Right**: Flinging or dragging right dismisses the card offscreen to the right and smoothly slides back to the previous verse in the history stack.
     - **Snap-Back Physics**: Releasing below the threshold smoothly springs the card back into its centered home position with cubic-bezier easing.
     - **Daily Index & History Persistence**: Whenever the user swipes away to a new verse, that new verse becomes the active daily verse and the entire history stack is saved in local storage for the remainder of the day. Refreshing or reopening the app stays on the current verse, while still allowing the user to swipe back through all previous verses seen earlier that day.
8. **Mobile Read-Only Mode Default**:
   - On mobile devices, the app defaults to read-only mode (`draw` mode / verse coloring view) instead of type mode when no preference has been explicitly set.
9. **Speak Mode On-Demand Microphone Prompt & Zero-Reload Recovery**:
   - In Speak Mode, the microphone must default to OFF (`micEnabled = false`).
   - The browser must only request/prompt for microphone access after the user explicitly clicks the "Start" button (`#speak-mic-toggle-btn`).
   - Uses `navigator.mediaDevices.getUserMedia({ audio: true })` so that permission can be re-requested or recovered cleanly if previously dismissed.
   - If the user blocks or dismisses access, an elegant permission modal guides them to allow microphone access via the address bar (Safari `aA` / Chrome `🔒`) and provides a "Try Again" button that immediately resumes without refreshing the page.
10. **Full-Height Mobile Tile**:
   - On mobile screens (`@media (max-width: 720px)`), the main practice viewport card tile (`.typing-viewport-wrapper` and `.typing-passage-scroll`) expands to fill the entire remaining vertical viewport height in all modes (Type, Speak, Draw, Listen).
11. **Listen Mode (Web Speech API Text-to-Speech & Bible Completion Tracking)**:
   - **Modes**: The app supports 4 core practice modes across all routes: `Type`, `Draw`, `Speak`, and `Listen` (`/type`, `/draw`, `/speak`, `/listen`).
   - **Zero Cloud Costs**: Uses the standard browser Web Speech API (`window.speechSynthesis` / `SpeechSynthesisUtterance`), requiring zero external API keys and incurring zero hosting/cloud costs.
   - **Voice Selection**: Users can choose any available system or browser voice in Mode Settings (`#listen-voice-select`), populated dynamically via `speechSynthesis.getVoices()`.
   - **Playback Speed**: Configurable playback rate (0.75x, 1.0x, 1.25x, 1.5x) in Mode Settings.
   - **Live Word Highlighting**: Audio words are highlighted in real-time (`.t-word.is-listen-active`) using utterance boundary tracking.
   - **Bible Completion Tracking**: Once audio narration for a verse finishes, it is automatically recorded via `markVerseAsListened`. Listened verses are factored into `isVerseCovered`, counting toward overall chapter and Bible completion in the Progress section alongside Read, Typed, and Spoken.

## Typing Speed Progression & Metric Charting (`screens/progress.js`, `api.js`, `screens/typing.js`)

Applies to paths matching:
- `screens/progress.js`
- `api.js`
- `screens/typing.js`

### Guidelines & Requirements:
1. **Strict Activity Type Isolation**:
   - The app has multiple distinct activity modes:
     - `typed`: Actual keyboard typing sessions (`wpm > 0`, `cpm > 0`, `charsTyped > 0`).
     - `spoken`: Voice recitation in Speak Mode (`cadenceWpm`, `pronunciationAccuracy`, `enunciation`).
     - `listen`: Audio text-to-speech playback in Listen Mode (`SpeechSynthesisUtterance`). These sessions have `wpm = 0` and `cpm = 0`.
     - `read`: Verses marked read via checkbox or VOTD card. `wpm = 0`, `cpm = 0`.
     - `draw`: Meditation drawing/coloring. `wpm = 0`, `cpm = 0`.
2. **Typing Speed Progression Chart Rules (`buildSpeedChartSVG`)**:
   - **No Zero Values**: The Typing Speed Progression graph (`WPM` and `CPM`) must NEVER plot zero values. A zero WPM data point ruins the progression curve and is completely misleading.
   - **Filter Constraints**:
     - `metric === 'wpm'`: Must strictly filter for typing sessions (`s.activityType === 'typed'` or legacy sessions without activityType) WHERE `(Number(s.wpm) || 0) > 0`.
     - `metric === 'cpm'`: Must strictly filter for typing sessions WHERE `(Number(s.cpm) || 0) > 0`.
     - `metric === 'cadence'`: Must strictly filter for `s.activityType === 'spoken'` WHERE `(Number(s.wpm) || 0) > 0`.
     - Under NO circumstance may `listen`, `read`, or `draw` activities appear on the typing speed or speaking cadence charts.
3. **Typing Speed Aggregation (`getGlobalTypingStats`)**:
   - `avgWpm` must strictly average sessions where `wpm > 0`. Non-typing activities (`listen`, `read`) with 0 WPM must NEVER be included in the sum or denominator.
   - `avgCpm` must strictly average sessions where `cpm > 0`.
4. **Recent Sessions History Table**:
   - In the Recent Sessions history table, sessions with `activityType === 'listen'` or `activityType === 'read'` must display an em dash (`—`) for speed and accuracy rather than `0 WPM` or `0 CPM`.
5. **Local Storage Self-Healing**:
   - Any historical sessions in local storage or synced from cloud with `wpm === 0` must never pollute typing metrics or progression charts.

---

## Actions Modal — Strict Per-Mode Settings Isolation (`screens/typing.js`, `styles.css`)

1. **Current Mode Settings Only**:
   - Opening the `⚡ Actions` modal (`openActionsModal()`) must **only** display the mode settings belonging to the currently active mode (`activeMode`), via `getModeSettingsPanelsForMode(activeMode)`:
     - **`type` (Type Mode)**: Shows only Chapter Mode / Single Verse Mode scope selection (`#mode-settings-type-speak-body`). Must **never** display Speak tuning (`#mode-settings-speak-tuning`), Listen tuning (`#mode-settings-listen-tuning`), or Draw settings (`#mode-settings-draw-body`).
     - **`speak` (Speak Mode)**: Shows Chapter Mode / Single Verse Mode scope selection (`#mode-settings-type-speak-body`) + Pronunciation strictness & Recognition timing (`#mode-settings-speak-tuning`).
     - **`listen` (Listen Mode)**: Shows Chapter Mode / Single Verse Mode scope selection (`#mode-settings-type-speak-body`) + Narration voice & Playback speed (`#mode-settings-listen-tuning`).
     - **`draw` (Draw Mode)**: Shows only Draw settings (`#mode-settings-draw-body`).
2. **CSS `[hidden]` Protection**:
   - Never apply an unscoped `display: flex !important` rule to `.typing-options-body` or `.typing-option-row` inside `.typing-actions-card` without `:not([hidden])`. Any `[hidden]` panel or row inside `.typing-actions-card` must remain `display: none !important`.


