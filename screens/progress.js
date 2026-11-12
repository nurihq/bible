import {
  BIBLE_BOOKS,
  getTranslationByCode
} from '../bible-data.js?v=20261112_v2';
import { getGlobalTypingStats, getChapterProgressSummary, getActiveModePref } from '../api.js?v=20261112_v2';
import { getCadenceDescriptor } from './typing.js?v=20261112_v2';
import { trackEvent } from '../analytics.js?v=20261112_v2';

function formatTotalDuration(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatDateShort(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return isoStr;
  }
}

function buildSpeedChartSVG(sessions, metric = 'wpm') {
  const filtered = metric === 'cadence'
    ? sessions.filter(s => s.activityType === 'spoken' && (Number(s.wpm) || 0) > 0)
    : sessions.filter(s => s.activityType !== 'read' && s.activityType !== 'spoken');
  const chronological = [...filtered].reverse().slice(-30);
  if (chronological.length === 0) {
    if (metric === 'cadence') {
      return `
        <div class="chart-empty-state">
          <p>Complete your first verse or chapter in <strong>Speak Mode</strong> to see your Speaking Cadence &amp; Clarity chart.</p>
          <a href="/speak" class="btn btn-primary btn-sm">🗣️ Start Speaking →</a>
        </div>
      `;
    }
    return `
      <div class="chart-empty-state">
        <p>Complete your first Bible verse or chapter to see your WPM &amp; CPM progression chart.</p>
        <a href="/type" class="btn btn-primary btn-sm">⌨️ Start Typing →</a>
      </div>
    `;
  }

  const width = 760;
  const height = 210;
  const padLeft = 46;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = chronological.map(s => (metric === 'cpm' ? Number(s.cpm) || 0 : Number(s.wpm) || 0));
  const minVal = Math.max(0, Math.floor(Math.min(...values) * 0.8));
  const maxVal = Math.max(minVal + 10, Math.ceil(Math.max(...values) * 1.12));

  const points = chronological.map((s, idx) => {
    const x = chronological.length === 1
      ? padLeft + plotW / 2
      : padLeft + (idx / (chronological.length - 1)) * plotW;
    const val = metric === 'cpm' ? Number(s.cpm) || 0 : Number(s.wpm) || 0;
    const y = padTop + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;
    return { x, y, val, session: s };
  });

  const polylinePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = points.length > 1
    ? `${points[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} ${polylinePoints} ${points[points.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)}`
    : '';

  const yTicks = [minVal, Math.round((minVal + maxVal) / 2), maxVal];
  const unitLabel = metric === 'cpm' ? 'CPM' : 'WPM';

  return `
    <div class="speed-chart-svg-wrap">
      <svg viewBox="0 0 ${width} ${height}" class="speed-chart-svg" role="img" aria-label="${unitLabel} Progression Chart">
        <defs>
          <linearGradient id="speedChartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.02"/>
          </linearGradient>
        </defs>

        <!-- Horizontal Grid Lines -->
        ${yTicks.map(t => {
          const y = padTop + plotH - ((t - minVal) / (maxVal - minVal || 1)) * plotH;
          return `
            <line x1="${padLeft}" y1="${y.toFixed(1)}" x2="${width - padRight}" y2="${y.toFixed(1)}" stroke="var(--border-color)" stroke-dasharray="3 3" stroke-width="1" />
            <text x="${padLeft - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="11">${t}</text>
          `;
        }).join('')}

        <!-- Shaded Area -->
        ${areaPoints ? `<polygon points="${areaPoints}" fill="url(#speedChartGrad)" />` : ''}

        <!-- Trend Line -->
        ${points.length > 1 ? `<polyline fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polylinePoints}" />` : ''}

        <!-- Data Nodes -->
        ${points.map((p, i) => `
          <g class="chart-node-group">
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="var(--bg-surface)" stroke="var(--primary)" stroke-width="2.5">
              <title>${p.session.bookName} ${p.session.chapter}${p.session.verseRange ? `:${p.session.verseRange}` : ''} (${p.session.translation}): ${p.val} ${unitLabel} · ${p.session.accuracy}% ${metric === 'cadence' ? `pronunciation · ${p.session.enunciation ?? p.session.accuracy}% enunciation` : 'acc'}</title>
            </circle>
            ${(i === 0 || i === points.length - 1 || points.length <= 8) ? `
              <text x="${p.x.toFixed(1)}" y="${(padTop + plotH + 18).toFixed(1)}" text-anchor="middle" fill="var(--text-muted)" font-size="10">
                ${p.session.bookName.slice(0, 3)} ${p.session.chapter}${p.session.verseNumber ? `:${p.session.verseNumber}` : ''}
              </text>
            ` : ''}
          </g>
        `).join('')}
      </svg>
    </div>
  `;
}

export function renderProgressScreen(container) {
  let activeChartMetric = 'wpm'; // 'wpm' | 'cpm' | 'cadence'
  let activeCoverageFilter = 'ALL'; // 'ALL' | 'TYPED' | 'SPEAK' | 'READ'
  let activeTranslationFilter = 'ALL';
  let showTranslationDrawer = false;
  let activeTestamentTab = 'ALL';
  let expandedBookIds = new Set();
  let initializedExpanded = false;

  function render() {
    const stats = getGlobalTypingStats();
    const isSpecificTr = activeTranslationFilter !== 'ALL';
    const activeMode = getActiveModePref() || 'type';
    const cadenceDesc = getCadenceDescriptor(stats.avgSpeakCadenceWpm);

    if (!initializedExpanded) {
      initializedExpanded = true;
      for (const b of BIBLE_BOOKS) {
        let hasProg = false;
        for (let c = 1; c <= b.chapters; c++) {
          const sum = getChapterProgressSummary(b.id, c, activeTranslationFilter);
          if (sum.isFullyCompleted || sum.isPartial) {
            hasProg = true;
            break;
          }
        }
        if (hasProg) expandedBookIds.add(b.id);
      }
      if (expandedBookIds.size === 0) {
        expandedBookIds.add(1); // Default Genesis expanded
      }
    }

    let filteredCompletedCount = 0;
    let filteredPartialCount = 0;
    let filteredVersesCount = 0;

    for (const b of BIBLE_BOOKS) {
      for (let c = 1; c <= b.chapters; c++) {
        const sum = getChapterProgressSummary(b.id, c, activeTranslationFilter);
        if (sum.isFullyCompleted) {
          filteredCompletedCount++;
          filteredVersesCount += Math.max(sum.completedVersesCount, sum.totalVerses);
        } else if (sum.isPartial) {
          filteredPartialCount++;
          filteredVersesCount += sum.completedVersesCount;
        }
      }
    }

    const translationBreakdownList = Object.values(stats.byTranslation).sort((a, b) => {
      if (b.completedChapters !== a.completedChapters) return b.completedChapters - a.completedChapters;
      if ((b.completedVerses || 0) !== (a.completedVerses || 0)) return (b.completedVerses || 0) - (a.completedVerses || 0);
      if (a.code === 'ESV') return -1;
      if (b.code === 'ESV') return 1;
      return a.code.localeCompare(b.code);
    });

    const visibleBooks = BIBLE_BOOKS.filter(b =>
      activeTestamentTab === 'ALL' ? true : b.testament === activeTestamentTab
    );

    container.innerHTML = `
      <div class="progress-screen-container">
        <div class="screen-header">
          <div class="screen-title-group">
            <div class="screen-lang-tag">
              <span>📊</span>
              <span>Scripture Completeness, Typing &amp; Speaking Cadence</span>
            </div>
            <h1 class="screen-title">Bible Reach &amp; Progress</h1>
            <p class="screen-subtitle">
              Track your journey through the whole Bible (read, typed, or spoken), your typing speed, and your speaking cadence &amp; clarity across all 66 books, 1,189 chapters, and 31,103 verses.
            </p>
          </div>
          <div class="screen-actions">
            <a href="/${activeMode}" class="btn btn-primary">
              ✨ Open Promises →
            </a>
          </div>
        </div>

        <!-- Top 4 KPI Summary Cards -->
        <div class="kpi-cards-grid">
          <!-- Card 1: Total Scripture Covered (Read, Typed, OR Spoken) -->
          <div class="kpi-card is-primary-kpi">
            <div class="kpi-card-top">
              <span class="kpi-label">Total Scripture Covered</span>
              <span class="kpi-icon">🌟</span>
            </div>
            <div class="kpi-value">${stats.overallCoveredChapters} <small>/ ${stats.totalBibleChapters} ch</small></div>
            <div class="kpi-sub">
              <strong>${stats.overallCoveredPercentage}%</strong> chapters · <strong>${stats.overallCoveredVerses.toLocaleString()}</strong> verses (${stats.overallCoveredVersesPercentage}%)
            </div>
            <div class="kpi-breakdown-row">
              <span class="kpi-badge is-read">📖 ${stats.overallReadChapters} read</span>
              <span class="kpi-badge is-done">⌨️ ${stats.overallTypedChapters} typed</span>
              <span class="kpi-badge is-spoken">🗣️ ${stats.overallSpokenChapters} spoken</span>
              ${stats.overallBothChapters > 0 ? `<span class="kpi-badge is-both">✨ ${stats.overallBothChapters} multi</span>` : ''}
            </div>
            <div class="kpi-mini-bar">
              <div class="kpi-mini-fill" style="width: ${Math.max(stats.overallCoveredChapters > 0 ? stats.overallCoveredPercentage : 0, 0)}%"></div>
            </div>
          </div>

          <!-- Card 2: Scripture Read -->
          <div class="kpi-card">
            <div class="kpi-card-top">
              <span class="kpi-label">Scripture Read</span>
              <span class="kpi-icon">📖</span>
            </div>
            <div class="kpi-value">${stats.overallReadChapters} <small>/ ${stats.totalBibleChapters} ch</small></div>
            <div class="kpi-sub">
              <strong>${stats.overallReadPercentage}%</strong> chapters · <strong>${stats.overallReadVerses.toLocaleString()}</strong> verses read (${stats.overallReadVersesPercentage}%)
            </div>
            <div class="kpi-note-text">
              Marked as read while studying on mobile or desktop
            </div>
          </div>

          <!-- Card 3: Scripture Typed -->
          <div class="kpi-card">
            <div class="kpi-card-top">
              <span class="kpi-label">Scripture Typed</span>
              <span class="kpi-icon">⌨️</span>
            </div>
            <div class="kpi-value">${stats.overallTypedChapters} <small>/ ${stats.totalBibleChapters} ch</small></div>
            <div class="kpi-sub">
              <strong>${stats.overallTypedPercentage}%</strong> chapters · <strong>${stats.overallTypedVerses.toLocaleString()}</strong> verses typed (${stats.overallTypedVersesPercentage}%)
            </div>
            <div class="kpi-note-text">
              ${stats.totalWordsTyped.toLocaleString()} words typed · Avg <strong>${stats.avgWpm} WPM</strong> (${stats.avgAccuracy}% acc)
            </div>
          </div>

          <!-- Card 4: Scripture Spoken -->
          <div class="kpi-card">
            <div class="kpi-card-top">
              <span class="kpi-label">Scripture Spoken</span>
              <span class="kpi-icon">🗣️</span>
            </div>
            <div class="kpi-value">${stats.overallSpokenChapters} <small>/ ${stats.totalBibleChapters} ch</small></div>
            <div class="kpi-sub">
              <strong>${stats.overallSpokenPercentage}%</strong> chapters · <strong>${stats.overallSpokenVerses.toLocaleString()}</strong> verses spoken (${stats.overallSpokenVersesPercentage}%)
            </div>
            <div class="kpi-note-text">
              ${stats.totalWordsSpoken.toLocaleString()} words spoken across ${stats.spokenSessionsCount} sessions
            </div>
          </div>
        </div>

        <!-- Speaking Cadence, Pronunciation & Enunciation Section -->
        <div class="section-card speaking-cadence-section-card">
          <div class="section-card-header">
            <div>
              <h2 class="section-card-title">🗣️ Speaking Cadence &amp; Clarity</h2>
              <p class="section-card-subtitle">
                Thoughtful scripture reading values clear enunciation and a steady, unhurried cadence (110–155 WPM) over rushing.
              </p>
            </div>
            <a href="/speak" class="btn btn-secondary btn-sm">🎙️ Practice Speak Mode →</a>
          </div>
          <div class="kpi-cards-grid speaking-kpi-grid">
            <div class="kpi-card">
              <div class="kpi-card-top">
                <span class="kpi-label">Speaking Cadence</span>
                <span class="kpi-icon">🎙️</span>
              </div>
              <div class="kpi-value">${stats.avgSpeakCadenceWpm > 0 ? `${stats.avgSpeakCadenceWpm} <small>WPM</small>` : `— <small>WPM</small>`}</div>
              <div class="kpi-sub">
                ${stats.avgSpeakCadenceWpm > 0
                  ? `<span class="kpi-badge ${cadenceDesc.badgeClass || 'is-emerald'}">${cadenceDesc.label}</span>`
                  : 'Ideal reading cadence: <strong>110–155 WPM</strong>'}
              </div>
              <div class="kpi-note-text">
                Measured for steady, natural scripture reading pace
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-card-top">
                <span class="kpi-label">Pronunciation Accuracy</span>
                <span class="kpi-icon">🎯</span>
              </div>
              <div class="kpi-value">${stats.spokenSessionsCount > 0 ? `${stats.avgPronunciationAccuracy}%` : '—'}</div>
              <div class="kpi-sub">
                <strong>${stats.totalWordsSpoken.toLocaleString()}</strong> total words spoken aloud
              </div>
              <div class="kpi-note-text">
                Percentage of words pronounced accurately without error
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-card-top">
                <span class="kpi-label">Enunciation &amp; Clarity</span>
                <span class="kpi-icon">✨</span>
              </div>
              <div class="kpi-value">${stats.spokenSessionsCount > 0 ? `${stats.avgEnunciation}%` : '—'}</div>
              <div class="kpi-sub">
                <strong>${formatTotalDuration(stats.totalSpeakDurationMs)}</strong> total speaking time
              </div>
              <div class="kpi-note-text">
                Vocal clarity &amp; word articulation score
              </div>
            </div>

            <div class="kpi-card">
              <div class="kpi-card-top">
                <span class="kpi-label">Typing Speed &amp; Accuracy</span>
                <span class="kpi-icon">⚡</span>
              </div>
              <div class="kpi-value">${stats.avgWpm} <small>WPM</small></div>
              <div class="kpi-sub">
                <strong>${stats.avgCpm} CPM</strong> avg · <strong>${stats.avgAccuracy}%</strong> acc · Best: <strong>${stats.bestWpm} WPM</strong>
              </div>
              <div class="kpi-note-text">
                ${formatTotalDuration(stats.totalDurationMs)} total typing time
              </div>
            </div>
          </div>
        </div>

        <!-- WPM, CPM & Speaking Cadence Chart Card -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h2 class="section-card-title">
                ${activeChartMetric === 'cadence' ? 'Speaking Cadence Trend (WPM)' : `Typing Speed Progression (${activeChartMetric.toUpperCase()})`}
              </h2>
              <p class="section-card-subtitle">
                ${activeChartMetric === 'cadence'
                  ? 'Your natural reading cadence (WPM) across recent spoken verses & chapters'
                  : 'Your typing speed across recent completed verses & chapters'}
              </p>
            </div>
            <div class="chart-toggle-pills">
              <button type="button" class="pill-toggle-btn ${activeChartMetric === 'wpm' ? 'active' : ''}" data-metric="wpm">Typing WPM</button>
              <button type="button" class="pill-toggle-btn ${activeChartMetric === 'cpm' ? 'active' : ''}" data-metric="cpm">Typing CPM</button>
              <button type="button" class="pill-toggle-btn ${activeChartMetric === 'cadence' ? 'active' : ''}" data-metric="cadence">Speaking Cadence</button>
            </div>
          </div>
          ${buildSpeedChartSVG(stats.sessions, activeChartMetric)}
        </div>

        <!-- Bible Completeness Matrix (Overall + Subtle Per-Translation Breakdown) -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h2 class="section-card-title">
                Bible Completeness Map
                ${isSpecificTr ? `<span class="filter-active-badge">${getTranslationByCode(activeTranslationFilter).shortName} Only</span>` : ''}
              </h2>
              <p class="section-card-subtitle">
                ${isSpecificTr
                  ? `Viewing progress in ${getTranslationByCode(activeTranslationFilter).name}: ${filteredCompletedCount}/${stats.totalBibleChapters} chapters full${filteredPartialCount > 0 ? `, ${filteredPartialCount} partial` : ''} (${filteredVersesCount.toLocaleString()} verses).`
                  : `Total Scripture covered: <strong>${stats.overallCoveredChapters}/${stats.totalBibleChapters} chapters</strong> (${stats.overallCoveredVerses.toLocaleString()} verses). Click any book to view chapters; click any chapter to open.`}
              </p>
            </div>

            <div class="reach-header-controls">
              <!-- Coverage Category Filter -->
              <div class="chart-toggle-pills" title="Filter map view by activity type">
                <button type="button" class="pill-toggle-btn ${activeCoverageFilter === 'ALL' ? 'active' : ''}" data-coverage-filter="ALL">All Covered (${stats.overallCoveredChapters})</button>
                <button type="button" class="pill-toggle-btn ${activeCoverageFilter === 'TYPED' ? 'active' : ''}" data-coverage-filter="TYPED">Typed (${stats.overallTypedChapters})</button>
                <button type="button" class="pill-toggle-btn ${activeCoverageFilter === 'SPEAK' ? 'active' : ''}" data-coverage-filter="SPEAK">Spoken (${stats.overallSpokenChapters})</button>
                <button type="button" class="pill-toggle-btn ${activeCoverageFilter === 'READ' ? 'active' : ''}" data-coverage-filter="READ">Read (${stats.overallReadChapters})</button>
              </div>

              <!-- Testament Tabs -->
              <div class="chart-toggle-pills">
                <button type="button" class="pill-toggle-btn ${activeTestamentTab === 'ALL' ? 'active' : ''}" data-testament-tab="ALL">All (66)</button>
                <button type="button" class="pill-toggle-btn ${activeTestamentTab === 'OT' ? 'active' : ''}" data-testament-tab="OT">OT (39)</button>
                <button type="button" class="pill-toggle-btn ${activeTestamentTab === 'NT' ? 'active' : ''}" data-testament-tab="NT">NT (27)</button>
              </div>

              <button type="button" class="btn btn-secondary btn-sm" id="toggle-expand-all-btn">
                ${expandedBookIds.size === visibleBooks.length ? 'Collapse All' : 'Expand All'}
              </button>

              <button type="button" class="btn btn-secondary btn-sm translation-breakdown-toggle" id="toggle-tr-breakdown-btn">
                <span>🌐 Versions: <strong>${isSpecificTr ? getTranslationByCode(activeTranslationFilter).shortName : 'All'}</strong></span>
                <span>${showTranslationDrawer ? '▴' : '▾'}</span>
              </button>
            </div>
          </div>

          <!-- Color Legend Bar -->
          <div class="completeness-legend-bar">
            <span class="legend-item"><i class="legend-swatch is-done"></i> <strong>Typed</strong></span>
            <span class="legend-item"><i class="legend-swatch is-spoken"></i> <strong>Spoken</strong></span>
            <span class="legend-item"><i class="legend-swatch is-read"></i> <strong>Read</strong></span>
            <span class="legend-item"><i class="legend-swatch is-both"></i> <strong>Multiple Modes</strong></span>
            <span class="legend-item"><i class="legend-swatch is-partial"></i> <strong>In Progress</strong></span>
          </div>

          <!-- Collapsible Per-Translation Completeness Drawer -->
          <div class="translation-breakdown-drawer" id="translation-breakdown-drawer" ${showTranslationDrawer ? '' : 'hidden'}>
            <div class="tr-drawer-top">
              <span class="tr-drawer-hint">
                Every verse and chapter you complete counts toward your <strong>Overall Completeness</strong>. Select a translation below to inspect your completeness within a specific translation:
              </span>
              ${isSpecificTr ? `
                <button type="button" class="btn btn-secondary btn-sm" id="reset-tr-filter-btn">
                  Reset to Overall (All Translations)
                </button>
              ` : ''}
            </div>
            <div class="tr-breakdown-pills-grid">
              <button
                type="button"
                class="tr-stat-pill ${activeTranslationFilter === 'ALL' ? 'active' : ''}"
                data-tr-filter="ALL"
              >
                <span class="tr-pill-code">All Translations (Overall)</span>
                <span class="tr-pill-count">${stats.overallCoveredChapters}/${stats.totalBibleChapters} ch · ${stats.overallCoveredVerses}v</span>
              </button>
              ${translationBreakdownList.map(t => `
                <button
                  type="button"
                  class="tr-stat-pill ${activeTranslationFilter === t.code ? 'active' : ''} ${(t.completedChapters > 0 || t.completedVerses > 0) ? 'has-progress' : ''}"
                  data-tr-filter="${t.code}"
                  title="${t.name}: ${t.completedChapters} full chapters, ${t.partialChapters || 0} partial chapters (${t.completedVerses || 0} verses)"
                >
                  <span class="tr-pill-code">${t.shortName}</span>
                  <span class="tr-pill-count">${t.completedChapters}/${stats.totalBibleChapters} ch${t.completedVerses > 0 ? ` · ${t.completedVerses}v` : ''}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <!-- 66-Book Completeness Grid -->
          <div class="books-reach-grid">
            ${visibleBooks.map(b => {
              let doneInBook = 0;
              let partialInBook = 0;
              let versesInBook = 0;
              for (let c = 1; c <= b.chapters; c++) {
                const sum = getChapterProgressSummary(b.id, c, activeTranslationFilter);
                if (activeCoverageFilter === 'TYPED') {
                  if (sum.isFullyTyped) {
                    doneInBook++;
                    versesInBook += sum.totalVerses;
                  } else if (sum.typedVersesCount > 0) {
                    partialInBook++;
                    versesInBook += sum.typedVersesCount;
                  }
                } else if (activeCoverageFilter === 'SPEAK') {
                  if (sum.isFullySpoken) {
                    doneInBook++;
                    versesInBook += sum.totalVerses;
                  } else if (sum.spokenVersesCount > 0) {
                    partialInBook++;
                    versesInBook += sum.spokenVersesCount;
                  }
                } else if (activeCoverageFilter === 'READ') {
                  if (sum.isFullyRead) {
                    doneInBook++;
                    versesInBook += sum.totalVerses;
                  } else if (sum.readVersesCount > 0) {
                    partialInBook++;
                    versesInBook += sum.readVersesCount;
                  }
                } else {
                  if (sum.isFullyCompleted) {
                    doneInBook++;
                    versesInBook += Math.max(sum.completedVersesCount, sum.totalVerses);
                  } else if (sum.isPartial) {
                    partialInBook++;
                    versesInBook += sum.completedVersesCount;
                  }
                }
              }
              const pct = Math.min(100, Math.round(((doneInBook + partialInBook * 0.4) / b.chapters) * 100));
              const isExpanded = expandedBookIds.has(b.id);
              const isComplete = doneInBook === b.chapters;
              const hasProgress = doneInBook > 0 || partialInBook > 0;

              const chapterCells = [];
              if (isExpanded) {
                for (let c = 1; c <= b.chapters; c++) {
                  const sum = getChapterProgressSummary(b.id, c, activeTranslationFilter);
                  const rec = sum.record;
                  const trs = rec ? Object.keys(rec.translations || {}).join(', ') : '';
                  let cellClass = '';
                  let cellTitle = `Open ${b.name} ${c}`;
                  let cellContent = `${c}`;

                  if (activeCoverageFilter === 'TYPED') {
                    if (sum.isFullyTyped) {
                      cellClass = 'is-done';
                      cellTitle = `${b.name} ${c} — Fully Typed (${sum.typedVersesCount}/${sum.totalVerses}v) · Best: ${sum.bestWpm} WPM`;
                    } else if (sum.typedVersesCount > 0) {
                      cellClass = 'is-partial';
                      cellTitle = `${b.name} ${c} — Partially Typed (${sum.typedVersesCount}/${sum.totalVerses}v)`;
                      cellContent = `${c}<sup style="font-size:0.55rem; margin-left:1px;">${sum.typedVersesCount}v</sup>`;
                    }
                  } else if (activeCoverageFilter === 'SPEAK') {
                    if (sum.isFullySpoken) {
                      cellClass = 'is-spoken';
                      cellTitle = `${b.name} ${c} — Fully Spoken (${sum.spokenVersesCount}/${sum.totalVerses}v)`;
                    } else if (sum.spokenVersesCount > 0) {
                      cellClass = 'is-partial';
                      cellTitle = `${b.name} ${c} — Partially Spoken (${sum.spokenVersesCount}/${sum.totalVerses}v)`;
                      cellContent = `${c}<sup style="font-size:0.55rem; margin-left:1px;">${sum.spokenVersesCount}v</sup>`;
                    }
                  } else if (activeCoverageFilter === 'READ') {
                    if (sum.isFullyRead) {
                      cellClass = 'is-read';
                      cellTitle = `${b.name} ${c} — Marked as Read (${sum.readVersesCount}/${sum.totalVerses}v)`;
                    } else if (sum.readVersesCount > 0) {
                      cellClass = 'is-partial';
                      cellTitle = `${b.name} ${c} — Partially Read (${sum.readVersesCount}/${sum.totalVerses}v)`;
                      cellContent = `${c}<sup style="font-size:0.55rem; margin-left:1px;">${sum.readVersesCount}v</sup>`;
                    }
                  } else {
                    if (sum.isBoth) {
                      cellClass = 'is-both';
                      cellTitle = `${b.name} ${c} — Completed in multiple modes (${sum.completedVersesCount}/${sum.totalVerses}v)`;
                    } else if (sum.isTypedOnly || (sum.isFullyTyped && !sum.isFullyRead && !sum.isFullySpoken)) {
                      cellClass = 'is-done';
                      cellTitle = `${b.name} ${c} — Typed (${sum.typedVersesCount}/${sum.totalVerses}v${trs ? ` in ${trs}` : ''}) · Best: ${sum.bestWpm} WPM`;
                    } else if (sum.isSpokenOnly || (sum.isFullySpoken && !sum.isFullyRead && !sum.isFullyTyped)) {
                      cellClass = 'is-spoken';
                      cellTitle = `${b.name} ${c} — Spoken (${sum.spokenVersesCount}/${sum.totalVerses}v)`;
                    } else if (sum.isReadOnly || (sum.isFullyRead && !sum.isFullyTyped && !sum.isFullySpoken)) {
                      cellClass = 'is-read';
                      cellTitle = `${b.name} ${c} — Marked as Read (${sum.readVersesCount}/${sum.totalVerses}v)`;
                    } else if (sum.isPartial) {
                      cellClass = 'is-partial';
                      const parts = [];
                      if (sum.readVersesCount > 0) parts.push(`${sum.readVersesCount} read`);
                      if (sum.typedVersesCount > 0) parts.push(`${sum.typedVersesCount} typed`);
                      if (sum.spokenVersesCount > 0) parts.push(`${sum.spokenVersesCount} spoken`);
                      cellTitle = `${b.name} ${c} — In Progress (${sum.completedVersesCount}/${sum.totalVerses || '?'}v: ${parts.join(', ')})`;
                      cellContent = `${c}<sup style="font-size:0.55rem; margin-left:1px;">${sum.completedVersesCount}v</sup>`;
                    }
                  }

                  chapterCells.push(`
                    <a
                      href="/${activeCoverageFilter === 'SPEAK' ? 'speak' : (activeMode === 'draw' ? 'type' : activeMode)}/${b.id}/${c}"
                      class="reach-ch-cell ${cellClass}"
                      title="${cellTitle}"
                    >
                      ${cellContent}
                    </a>
                  `);
                }
              }

              let bookCountLabel = `${doneInBook}/${b.chapters}`;
              if (partialInBook > 0) {
                bookCountLabel += ` (+${partialInBook}p)`;
              }
              if (versesInBook > 0) {
                bookCountLabel += ` · ${versesInBook}v`;
              }

              return `
                <div class="book-reach-card ${isComplete ? 'is-book-complete' : ''} ${hasProgress ? 'has-book-progress' : ''}">
                  <div class="book-reach-top" data-toggle-book="${b.id}" role="button" tabindex="0">
                    <div class="book-reach-title-row">
                      <strong>${b.name}</strong>
                      <span class="book-reach-count">${bookCountLabel} ${isExpanded ? '▴' : '▾'}</span>
                    </div>
                    <div class="book-reach-bar-track">
                      <div class="book-reach-bar-fill" style="width: ${pct}%"></div>
                    </div>
                  </div>
                  ${isExpanded ? `
                    <div class="book-reach-chapters-grid">
                      ${chapterCells.join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Historic Typing & Speaking Sessions Log -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h2 class="section-card-title">Historic Sessions (Typed &amp; Spoken)</h2>
              <p class="section-card-subtitle">
                Complete chronological log of every Bible chapter, partial sitting, and single verse you have typed or spoken
              </p>
            </div>
          </div>

          ${stats.sessions.length === 0 ? `
            <div class="chart-empty-state">
              <p>No completed verses or chapters recorded yet. Type or speak any verse or chapter to build your history!</p>
              <a href="/${activeMode}" class="btn btn-primary btn-sm">Open Promises →</a>
            </div>
          ` : `
            <div class="history-table-wrapper">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Passage &amp; Verses</th>
                    <th>Mode</th>
                    <th>Translation</th>
                    <th>Speed / Cadence</th>
                    <th>Detail</th>
                    <th>Accuracy / Clarity</th>
                    <th>Duration</th>
                    <th>Completed</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${stats.sessions.map(s => {
                    const isSpoken = s.activityType === 'spoken';
                    const isRead = s.activityType === 'read';
                    const modeRoute = isSpoken ? 'speak' : 'type';
                    const singleV = s.verseNumber || (s.versesTyped === 1 && /^\d+$/.test(String(s.verseRange || '')) ? Number(s.verseRange) : null);
                    const sCadence = isSpoken ? getCadenceDescriptor(s.wpm) : null;
                    return `
                      <tr>
                        <td>
                          <div class="hist-passage-cell">
                            <strong>${s.bookName} ${s.chapter}:${s.verseRange || `1-${s.versesTyped}`}</strong>
                            <span>${s.versesTyped === 1 ? '1 verse' : `${s.versesTyped} verses`} · ${(s.wordsTyped || 0).toLocaleString()} words</span>
                          </div>
                        </td>
                        <td>
                          <span class="kpi-badge ${isSpoken ? 'is-spoken' : (isRead ? 'is-read' : 'is-done')}">
                            ${isSpoken ? '🗣️ Spoken' : (isRead ? '📖 Read' : '⌨️ Typed')}
                          </span>
                        </td>
                        <td><span class="hist-tr-badge">${s.translation || 'ESV'}</span></td>
                        <td>
                          ${isSpoken
                            ? `<strong>${s.wpm || 0} WPM</strong>`
                            : `<strong>${s.wpm} WPM</strong>`}
                        </td>
                        <td>
                          ${isSpoken
                            ? `<span class="hist-cadence-note">${sCadence?.shortLabel || 'Cadence'}</span>`
                            : `${s.cpm} CPM`}
                        </td>
                        <td>
                          ${isSpoken
                            ? `${s.accuracy ?? 100}% pron · ${s.enunciation ?? s.accuracy ?? 100}% enun`
                            : `${s.accuracy ?? 100}%`}
                        </td>
                        <td>${formatTotalDuration(s.durationMs)}</td>
                        <td class="hist-date-cell">${formatDateShort(s.completedAt)}</td>
                        <td class="hist-action-cell" style="white-space: nowrap;">
                          ${singleV ? `
                            <a href="/${modeRoute}/${s.bookId}/${s.chapter}/${singleV}" class="btn btn-secondary btn-sm" title="Practice Verse ${singleV}">
                              🎯 v.${singleV}
                            </a>
                          ` : ''}
                          <a href="/${modeRoute}/${s.bookId}/${s.chapter}" class="btn btn-secondary btn-sm" title="Open ${s.bookName} ${s.chapter}">
                            📖 Ch. →
                          </a>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;

    // Bind events
    container.querySelectorAll('[data-metric]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeChartMetric = btn.getAttribute('data-metric');
        render();
      });
    });

    container.querySelectorAll('[data-coverage-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCoverageFilter = btn.getAttribute('data-coverage-filter');
        trackEvent('filter_coverage_category', { filter: activeCoverageFilter });
        render();
      });
    });

    container.querySelectorAll('[data-testament-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTestamentTab = btn.getAttribute('data-testament-tab');
        render();
      });
    });

    const toggleTrBtn = container.querySelector('#toggle-tr-breakdown-btn');
    if (toggleTrBtn) {
      toggleTrBtn.addEventListener('click', () => {
        showTranslationDrawer = !showTranslationDrawer;
        render();
      });
    }

    const resetTrBtn = container.querySelector('#reset-tr-filter-btn');
    if (resetTrBtn) {
      resetTrBtn.addEventListener('click', () => {
        activeTranslationFilter = 'ALL';
        render();
      });
    }

    container.querySelectorAll('[data-tr-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTranslationFilter = btn.getAttribute('data-tr-filter');
        trackEvent('filter_completeness_translation', { translation: activeTranslationFilter });
        render();
      });
    });

    const toggleExpandAllBtn = container.querySelector('#toggle-expand-all-btn');
    if (toggleExpandAllBtn) {
      toggleExpandAllBtn.addEventListener('click', () => {
        if (expandedBookIds.size === visibleBooks.length) {
          expandedBookIds.clear();
        } else {
          visibleBooks.forEach(b => expandedBookIds.add(b.id));
        }
        render();
      });
    }

    container.querySelectorAll('[data-toggle-book]').forEach(el => {
      el.addEventListener('click', () => {
        const bId = Number(el.getAttribute('data-toggle-book'));
        if (expandedBookIds.has(bId)) {
          expandedBookIds.delete(bId);
        } else {
          expandedBookIds.add(bId);
        }
        render();
      });
    });
  }

  render();
}
