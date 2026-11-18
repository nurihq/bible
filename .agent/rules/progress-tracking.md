---
description: Rules for Typing Speed Progression chart, Speaking Cadence trend, and session metric calculations
globs: ["screens/progress.js", "api.js", "screens/typing.js"]
---

# Progress Tracking & Metric Charting Rules

Applies to paths matching:
- `screens/progress.js`
- `api.js`
- `screens/typing.js`

## Guidelines & Requirements

1. **Strict Activity Type Isolation**:
   - The app supports multiple distinct activity modes:
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
