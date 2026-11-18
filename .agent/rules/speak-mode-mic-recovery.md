---
description: Rules for Speak Mode microphone permission handling, recovery without reload, and instant VOTD card navigation
globs: ["screens/typing.js", "screens/home.js", "styles.css"]
---

# Speak Mode Microphone Access & VOTD Instant Navigation Rules

Applies to paths matching:
- `screens/typing.js`
- `screens/home.js`
- `styles.css`

## Guidelines & Requirements

1. **Speak Mode Microphone Permission & Recovery Workflow**:
   - **Default Mic Off**: On entering Speak Mode, `micEnabled` must default to `false`. No microphone prompt should be requested automatically upon page load.
   - **User Gesture Prompt**: Access must only be requested when the user explicitly clicks the "Start" button (`#speak-mic-toggle-btn`).
   - **Dual-Layer Request Flow**:
     - Because `SpeechRecognition.start()` alone silently fails with `'not-allowed'` after a single dismissal without re-prompting, microphone access is requested via `navigator.mediaDevices.getUserMedia({ audio: true })`.
     - When granted, tracks are stopped immediately to release the audio session, and `SpeechRecognition.start()` is initiated.
   - **Zero-Refresh Recovery**:
     - If the user rejects or dismisses the permission prompt, or if the browser blocks access:
       1. `micEnabled` is set to `false` and the button resets cleanly to "Start".
       2. An elegant modal (`#mic-permission-backdrop`) appears explaining how to unblock microphone permissions via the address bar (Safari `aA` / Chrome `🔒` lock icon).
       3. The modal provides a **Try Again** button that re-invokes `enableAndStartSpeaking()`.
       4. Once unblocked in browser settings, clicking "Try Again" or "Start" immediately succeeds without requiring the user to reload the entire web page.

2. **Mobile Verse of the Day (VOTD) Instant Navigation**:
   - **Proactive Chapter Prefetching**:
     - Whenever the active VOTD verse is resolved, swiped, or preloaded in `screens/home.js`, `prefetchChapterVerses(activeTranslation, bookId, chapter)` must be called in the background.
     - When the user taps the card to enter the practice screen, `getCachedChapterVerses` returns the chapter instantly from memory cache with 0ms network latency.
   - **Eliminate Mobile Tap Delay**:
     - `.votd-card` must use `touch-action: manipulation` to prevent browser double-tap 300ms delay.
     - Clean mobile taps (`!isHorizontalDrag`, `!hasSwiped`, `elapsed < 350ms`, `movement < 10px`) on non-button elements trigger navigation immediately on `touchend` with a debounce guard (`justNavigatedOnTouch`) preventing duplicate click handlers.
