---
description: Rules enforcing that the Actions modal only displays settings for the currently active mode
globs: ["screens/typing.js", "styles.css"]
---

# Actions Modal — Strict Per-Mode Settings Isolation

Applies to paths matching:
- `screens/typing.js`
- `styles.css`

## Invariants

1. **Current Mode Settings Only**:
   - The `⚡ Actions` modal (`#typing-actions-backdrop` / `#actions-mode-settings-host`) must **only** mount and display the mode settings panels for the currently active mode (`activeMode`) via `getModeSettingsPanelsForMode(activeMode)`:
     - **`type`**: `[#mode-settings-type-speak-body]` only. Never show `#mode-settings-speak-tuning` (Pronunciation strictness / Recognition timing), `#mode-settings-listen-tuning` (Narration voice / Playback speed), or `#mode-settings-draw-body`.
     - **`speak`**: `[#mode-settings-type-speak-body, #mode-settings-speak-tuning]` only.
     - **`listen`**: `[#mode-settings-type-speak-body, #mode-settings-listen-tuning]` only.
     - **`draw`**: `[#mode-settings-draw-body]` only.
2. **Never Override `[hidden]` in CSS**:
   - Inside `.typing-actions-card`, any `display: flex !important` rule on `.typing-options-body` or `.typing-option-row` must be scoped with `:not([hidden])`, and `.typing-actions-card [hidden]` must remain `display: none !important`.
