import {
  BIBLE_BOOKS,
  getTranslationByCode
} from '../bible-data.js?v=20261104_v6';
import { getGlobalTypingStats, getChapterProgressSummary } from '../api.js?v=20261104_v6';
import { trackEvent } from '../analytics.js?v=20261104_v6';

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
  const chronological = [...sessions].reverse().slice(-30);
  if (chronological.length === 0) {
    return `
      <div class="chart-empty-state">
        <p>Complete your first Bible verse or chapter to see your WPM &amp; CPM speed progression chart.</p>
        <a href="#/typing" class="btn btn-primary btn-sm">Start Typing →</a>
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
              <title>${p.session.bookName} ${p.session.chapter}${p.session.verseRange ? `:${p.session.verseRange}` : ''} (${p.session.translation}): ${p.val} ${unitLabel} · ${p.session.accuracy}% acc</title>
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
  let activeChartMetric = 'wpm';
  let activeTranslationFilter = 'ALL';
  let showTranslationDrawer = false;
  let activeTestamentTab = 'ALL';
  let expandedBookIds = new Set();
  let initializedExpanded = false;

  function render() {
    const stats = getGlobalTypingStats();
    const isSpecificTr = activeTranslationFilter !== 'ALL';

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
    const filteredPct = Math.round((filteredCompletedCount / stats.totalBibleChapters) * 1000) / 10;

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
              <span>Analytics &amp; Scripture Reach</span>
            </div>
            <h1 class="screen-title">Typing Progress &amp; Bible Completeness</h1>
            <p class="screen-subtitle">
              Track your average WPM &amp; CPM speed, completed &amp; partial chapters, and verse-level reach across all 66 books and 1,189 chapters.
            </p>
          </div>
          <div class="screen-actions">
            <a href="#/typing" class="btn btn-primary">
              ⌨️ Continue Typing →
            </a>
          </div>
        </div>

        <!-- Top KPI Summary Cards -->
        <div class="kpi-cards-grid">
          <div class="kpi-card">
            <div class="kpi-card-top">
              <span class="kpi-label">Chapters Completed</span>
              <span class="kpi-icon">📖</span>
            </div>
            <div class="kpi-value">${stats.overallCompletedChapters} <small>/ ${stats.totalBibleChapters}</small></div>
            <div class="kpi-sub">
              <strong>${stats.overallPercentage}%</strong> full${stats.partialChaptersCount > 0 ? ` · <strong>+${stats.partialChaptersCount}</strong> partial` : ''} · OT: ${stats.otCompletedChapters} · NT: ${stats.ntCompletedChapters}
            </div>
            <div class="kpi-mini-bar">
              <div class="kpi-mini-fill" style="width: ${Math.max(stats.overallCompletedChapters > 0 ? stats.overallPercentage : 0, 0)}%"></div>
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-top">
              <span class="kpi-label">Verse-Level Reach</span>
              <span class="kpi-icon">📜</span>
            </div>
            <div class="kpi-value">${stats.overallCompletedVerses.toLocaleString()} <small>/ ${stats.totalBibleVerses.toLocaleString()}</small></div>
            <div class="kpi-sub">
              <strong>${stats.overallVersesPercentage}%</strong> of Bible verses · ${stats.totalWordsTyped.toLocaleString()} words typed
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-top">
              <span class="kpi-label">Average Speed</span>
              <span class="kpi-icon">⚡</span>
            </div>
            <div class="kpi-value">${stats.avgWpm} <small>WPM</small></div>
            <div class="kpi-sub">
              <strong>${stats.avgCpm} CPM</strong> avg · Best: <strong>${stats.bestWpm} WPM</strong> (${stats.bestCpm} CPM)
            </div>
          </div>

          <div class="kpi-card">
            <div class="kpi-card-top">
              <span class="kpi-label">Accuracy &amp; Time</span>
              <span class="kpi-icon">🎯</span>
            </div>
            <div class="kpi-value">${stats.avgAccuracy}%</div>
            <div class="kpi-sub">
              ${stats.sessionsCount} sessions · ${formatTotalDuration(stats.totalDurationMs)} total time
            </div>
          </div>
        </div>

        <!-- WPM & CPM Progression Chart Card -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h2 class="section-card-title">Speed Progression (${activeChartMetric.toUpperCase()})</h2>
              <p class="section-card-subtitle">Your typing speed across recent completed verses &amp; chapters</p>
            </div>
            <div class="chart-toggle-pills">
              <button type="button" class="pill-toggle-btn ${activeChartMetric === 'wpm' ? 'active' : ''}" data-metric="wpm">WPM</button>
              <button type="button" class="pill-toggle-btn ${activeChartMetric === 'cpm' ? 'active' : ''}" data-metric="cpm">CPM</button>
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
                  : `Overall completeness across all translations (${stats.overallCompletedChapters}/${stats.totalBibleChapters} full chapters${stats.partialChaptersCount > 0 ? `, +${stats.partialChaptersCount} partial chapters` : ''}, ${stats.overallCompletedVerses.toLocaleString()} verses). Click any book to expand its chapters; clicking a partial chapter resumes at the next incomplete verse.`}
              </p>
            </div>

            <div class="reach-header-controls">
              <div class="chart-toggle-pills">
                <button type="button" class="pill-toggle-btn ${activeTestamentTab === 'ALL' ? 'active' : ''}" data-testament-tab="ALL">All (66)</button>
                <button type="button" class="pill-toggle-btn ${activeTestamentTab === 'OT' ? 'active' : ''}" data-testament-tab="OT">OT (39)</button>
                <button type="button" class="pill-toggle-btn ${activeTestamentTab === 'NT' ? 'active' : ''}" data-testament-tab="NT">NT (27)</button>
              </div>

              <button type="button" class="btn btn-secondary btn-sm" id="toggle-expand-all-btn">
                ${expandedBookIds.size === visibleBooks.length ? 'Collapse All Books' : 'Expand All Books'}
              </button>

              <button type="button" class="btn btn-secondary btn-sm translation-breakdown-toggle" id="toggle-tr-breakdown-btn">
                <span>🌐 By Translation: <strong>${isSpecificTr ? getTranslationByCode(activeTranslationFilter).shortName : 'All (Overall)'}</strong></span>
                <span>${showTranslationDrawer ? '▴' : '▾'}</span>
              </button>
            </div>
          </div>

          <!-- Collapsible Per-Translation Completeness Drawer -->
          <div class="translation-breakdown-drawer" id="translation-breakdown-drawer" ${showTranslationDrawer ? '' : 'hidden'}>
            <div class="tr-drawer-top">
              <span class="tr-drawer-hint">
                Every verse and chapter you type counts toward your <strong>Overall Completeness</strong>. Select a translation below to inspect your completeness within a specific translation:
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
                <span class="tr-pill-count">${stats.overallCompletedChapters}/${stats.totalBibleChapters} ch · ${stats.overallCompletedVerses}v</span>
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
                if (sum.isFullyCompleted) {
                  doneInBook++;
                  versesInBook += Math.max(sum.completedVersesCount, sum.totalVerses);
                } else if (sum.isPartial) {
                  partialInBook++;
                  versesInBook += sum.completedVersesCount;
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
                  let cellTitle = `Type ${b.name} ${c}`;
                  let cellContent = `${c}`;

                  if (sum.isFullyCompleted) {
                    cellClass = 'is-done';
                    cellTitle = `${b.name} ${c} — Completed (${sum.completedVersesCount}/${sum.totalVerses || sum.completedVersesCount}v in ${trs}) · Best: ${sum.bestWpm} WPM`;
                  } else if (sum.isPartial) {
                    cellClass = 'is-partial';
                    cellTitle = `${b.name} ${c} — Partial (${sum.completedVersesCount}/${sum.totalVerses || '?'} verses completed: v. ${sum.completedVerseNums.join(', ')}) — Click to resume at next incomplete verse`;
                    cellContent = `${c}<sup style="font-size:0.55rem; margin-left:1px;">${sum.completedVersesCount}v</sup>`;
                  }

                  chapterCells.push(`
                    <a
                      href="#/typing/${b.id}/${c}"
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

        <!-- Historic Typing Sessions & Verses Typed Log -->
        <div class="section-card">
          <div class="section-card-header">
            <div>
              <h2 class="section-card-title">Historic Sessions &amp; Verses Typed</h2>
              <p class="section-card-subtitle">
                Complete chronological log of every Bible chapter, partial sitting, and single verse you have typed
              </p>
            </div>
          </div>

          ${stats.sessions.length === 0 ? `
            <div class="chart-empty-state">
              <p>No completed verses or chapters recorded yet. Type any verse or chapter to build your history!</p>
              <a href="#/typing" class="btn btn-primary btn-sm">Open Bible Typing →</a>
            </div>
          ` : `
            <div class="history-table-wrapper">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Passage &amp; Verses</th>
                    <th>Translation</th>
                    <th>WPM</th>
                    <th>CPM</th>
                    <th>Accuracy</th>
                    <th>Duration</th>
                    <th>Completed</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${stats.sessions.map(s => {
                    const singleV = s.verseNumber || (s.versesTyped === 1 && /^\d+$/.test(String(s.verseRange || '')) ? Number(s.verseRange) : null);
                    return `
                      <tr>
                        <td>
                          <div class="hist-passage-cell">
                            <strong>${s.bookName} ${s.chapter}:${s.verseRange || `1-${s.versesTyped}`}</strong>
                            <span>${s.versesTyped === 1 ? '1 verse' : `${s.versesTyped} verses`} · ${(s.wordsTyped || 0).toLocaleString()} words</span>
                          </div>
                        </td>
                        <td><span class="hist-tr-badge">${s.translation || 'ESV'}</span></td>
                        <td><strong>${s.wpm} WPM</strong></td>
                        <td>${s.cpm} CPM</td>
                        <td>${s.accuracy ?? 100}%</td>
                        <td>${formatTotalDuration(s.durationMs)}</td>
                        <td class="hist-date-cell">${formatDateShort(s.completedAt)}</td>
                        <td class="hist-action-cell" style="white-space: nowrap;">
                          ${singleV ? `
                            <a href="#/typing/${s.bookId}/${s.chapter}/${singleV}" class="btn btn-secondary btn-sm" title="Practice only Verse ${singleV}">
                              🎯 v.${singleV}
                            </a>
                          ` : ''}
                          <a href="#/typing/${s.bookId}/${s.chapter}" class="btn btn-secondary btn-sm" title="Open ${s.bookName} ${s.chapter}">
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
