# bible 📖⌨️

A sleek Scripture study & typing suite modeled on `monogenesis`, featuring a full 66-book / 1,189-chapter Bible Typing game across 22 translations (defaulting to ESV), real-time WPM & CPM tracking, and cloud sync + automated daily S3 backups on the Nuri AWS account.

## Features

1. **Strict Google Sign-In Gate (`#/signin`)**
   - Protected by Google Identity Services OAuth 2.0 & AWS DynamoDB.
   - Entire application requires authentication.

2. **Home Dashboard (`#/`)**
   - Displays the **Bible Typing** feature card with live summary of your Overall Bible Reach (`X / 1,189 chapters`), Average WPM & CPM, and a one-click button to jump to your next suggested chapter.

3. **Top Navigation Bar with Live WPM & CPM Averages**
   - Displays real-time All-Time Average **WPM** & **CPM** (`⚡ X WPM · Y CPM`) and **Bible Reach** (`📖 X/1189 ch`) right in the sticky header.
   - Updates immediately upon completing any chapter.

4. **Bible Typing Game (`#/typing` & `#/typing/:bookId/:chapter`)**
   - **Smart Chapter Search**: Search any book and chapter (e.g. `John 3`, `Psalm 23`, `Rom 8`, `Gen 1`) or browse all 66 books via the interactive Book & Chapter Drawer.
   - **22 Bible Translations (Default: ESV)**: Supports `ESV`, `BSB`, `NLT`, `NASB`, `CSB17`, `LSB`, `NKJV`, `KJV`, `NET`, `WEB`, `RSV`, `NRSVCE`, `ASV`, `CEB`, `GNT`, `ERV`, `AMP`, `MSG`, `CJB`, `TLV`, `YLT`, and `GNV`.
   - **Visible Verse Numbers (Never Typed)**: Superscript verse badges (`1`, `2`, `3`...) are rendered inline for context while your cursor skips directly from verse text to verse text.
   - **Strict Backspace Mode**: Mistyped characters highlight in red and require pressing `Backspace` (`⌫`) before advancing.

5. **Typing Progress & Bible Completeness Page (`#/progress`)**
   - **Overall Completeness**: Tracks unique chapters completed across all 66 books (`1,189` chapters total; `929` OT, `260` NT) regardless of which translation you typed them in.
   - **Subtle Per-Translation Completeness Drawer**: Expand `"🌐 By Translation"` to inspect your completeness and filter the 66-book matrix for a specific translation (e.g. `ESV`).
   - **Speed Progression Chart**: Interactive SVG chart of your WPM and CPM across completed sessions.
   - **Historic Sessions & Verses Typed Log**: Chronological log of every chapter and verse range typed.

---

## Setup & Configuration Guide

### 1. Google Sign-In (OAuth 2.0) Setup
- **Console URL**: [Google Cloud Console → APIs & Credentials](https://console.cloud.google.com/apis/credentials)
- **Active Client ID**: `719377736713-fobtcss0udkkl5u930aifhe5318rlaf9.apps.googleusercontent.com` (in `config.js`)
- **Authorized JavaScript Origins**:
  - `https://nurihq.github.io` (covers GitHub Pages `https://nurihq.github.io/bible/`)
  - `http://localhost:8080` (for local development)
  - If you attach a custom domain later, add `https://your-custom-domain.com` under **Authorized JavaScript origins** in that OAuth 2.0 Web Client in Google Cloud Console.

### 2. Google Analytics 4 (GA4) Setup
- **Console URL**: [Google Analytics → Admin → Data Streams](https://analytics.google.com/)
- Currently configured in `index.html` and `config.js` (`GA_MEASUREMENT_ID`). If you want a separate GA4 property specifically for `bible`, create a new Web Data Stream in Google Analytics and paste the new `G-XXXXXXXXXX` ID into `config.js` and `index.html`.

### 3. AWS Backend & Backups (`NuriAdmin`)
- Backend code lives at `~/focus/hustle/websites/saas/bible/`.
- **DynamoDB Table**: `BibleApp` (`us-east-1`, Point-in-Time Recovery enabled, Deletion Protection enabled)
- **S3 Permanent Backup Bucket**: `s3://bible-backups-190550533323-us-east-1/backups/`
- **Automated Daily Backups**: EventBridge rule `bible-daily-backup` runs `bible-backup` Lambda daily at `02:00 UTC`.
- **Manual Backup / Restore**:
  ```bash
  cd ~/focus/hustle/websites/saas/bible
  ./scripts/backup-db.sh
  ./scripts/restore-db.sh backups/latest.json
  ```
