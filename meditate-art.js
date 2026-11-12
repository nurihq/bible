// ══════════════════════════════════════════════════════════════════════════
// BIBLE — 1,000 PROCEDURAL SCRIPTURE MEDITATION COLOR-BY-NUMBERS ARTWORKS
// ══════════════════════════════════════════════════════════════════════════

export const TOTAL_MEDITATE_ART_TEMPLATES = 1000;

export const MEDITATE_ART_THEME_NAMES = [
  'Stained Glass Cathedral & Tracery',
  'Sacred Geometric Mandalas & Stars',
  'Mountain Sunrise & Alpine Glaciers',
  'Coastal Lighthouse & Ocean Breakers',
  'Celestial Heavens & Orbiting Stars',
  'Celtic Crosses & Knotwork Mosaics',
  'Eden Garden Florals & Botanicals',
  'Dove of Peace & Heavenly Halo',
  'Desert Sand Dunes & Oasis Palms',
  'River of Life & Water Lilies'
];

/**
 * Returns a descriptive title for any of the 1,000 artwork templates.
 */
export function getArtworkTemplateName(index) {
  const tIdx = Math.abs(Number(index) || 0) % TOTAL_MEDITATE_ART_TEMPLATES;
  const themeIdx = tIdx % MEDITATE_ART_THEME_NAMES.length;
  const theme = MEDITATE_ART_THEME_NAMES[themeIdx];
  const variant = Math.floor(tIdx / MEDITATE_ART_THEME_NAMES.length) + 1;
  return `${theme} · Design ${variant}`;
}

// Proxy-backed template names array supporting any index from 0 to 999
export const MEDITATE_ART_TEMPLATE_NAMES = new Proxy([], {
  get(target, prop) {
    if (prop === 'length') return TOTAL_MEDITATE_ART_TEMPLATES;
    if (typeof prop === 'string' && /^\d+$/.test(prop)) {
      return getArtworkTemplateName(Number(prop));
    }
    if (prop === 'map') {
      return (cb) => {
        // Provide theme categories for dropdown mapping
        return MEDITATE_ART_THEME_NAMES.map((name, idx) => cb(name, idx));
      };
    }
    return target[prop];
  }
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFill(segId, savedFills, defaultFill = '#FFFFFF') {
  return (savedFills && savedFills[segId]) ? savedFills[segId] : defaultFill;
}

// Deterministic Pseudo-Random Generator keyed on template seed
function createRng(seed) {
  let s = Math.abs(Number(seed) || 0) + 1;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Generates an interactive SVG canvas featuring color-by-numbers uplifting line art.
 * The scripture text is rendered with NO border plaque so it can be placed anywhere.
 */
export function renderMeditateArtworkSvg(templateIndex, verseText, verseRef, translation = 'ESV', savedFills = {}, textStyle = {}) {
  const tIdx = Math.abs(Number(templateIndex) || 0) % TOTAL_MEDITATE_ART_TEMPLATES;
  const themeIdx = tIdx % 10;
  const rng = createRng(tIdx * 17 + 31);

  let segmentsSvg = '';
  switch (themeIdx) {
    case 0:
      segmentsSvg = generateStainedGlassTemplate(tIdx, rng, savedFills);
      break;
    case 1:
      segmentsSvg = generateMandalaTemplate(tIdx, rng, savedFills);
      break;
    case 2:
      segmentsSvg = generateMountainSunriseTemplate(tIdx, rng, savedFills);
      break;
    case 3:
      segmentsSvg = generateLighthouseOceanTemplate(tIdx, rng, savedFills);
      break;
    case 4:
      segmentsSvg = generateCelestialHeavensTemplate(tIdx, rng, savedFills);
      break;
    case 5:
      segmentsSvg = generateCelticCrossTemplate(tIdx, rng, savedFills);
      break;
    case 6:
      segmentsSvg = generateEdenFloralTemplate(tIdx, rng, savedFills);
      break;
    case 7:
      segmentsSvg = generateDoveOfPeaceTemplate(tIdx, rng, savedFills);
      break;
    case 8:
      segmentsSvg = generateDesertDunesTemplate(tIdx, rng, savedFills);
      break;
    case 9:
    default:
      segmentsSvg = generateRiverOfLifeTemplate(tIdx, rng, savedFills);
      break;
  }

  // Scripture text position and typography (with NO border plaque)
  const posX = typeof textStyle?.textX === 'number' ? textStyle.textX : 50;
  const posY = typeof textStyle?.textY === 'number' ? textStyle.textY : 76;
  const fontFamily = textStyle?.fontFamily || "Arial, -apple-system, sans-serif";
  const fontSize = typeof textStyle?.fontSize === 'number' ? textStyle.fontSize : 20;
  const fontCase = textStyle?.fontCase === 'uppercase' ? 'uppercase' : 'none';
  const fontColor = textStyle?.fontColor || '';
  const boxWidth = typeof textStyle?.boxWidth === 'number' ? textStyle.boxWidth : 440;

  // Convert percentage (0..100) to SVG viewBox coordinates (1000 x 700)
  const svgX = Math.round((posX / 100) * 1000 - boxWidth / 2);
  const svgY = Math.round((posY / 100) * 700 - 70);

  return `
    <svg viewBox="0 0 1000 700" class="meditate-svg-art" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <defs>
        <filter id="med-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#ffffff" flood-opacity="0.85" />
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.25" />
        </filter>
      </defs>

      <!-- Canvas Base Frame -->
      <rect x="0" y="0" width="1000" height="700" fill="#f8fafc" />

      <!-- Coloring Segments Group -->
      <g class="meditate-segments-layer">
        ${segmentsSvg}
      </g>

      <!-- Scripture Text Overlay (NO border plaque — pure draggable typography) -->
      ${verseText ? `
        <foreignObject x="${Math.max(10, Math.min(990 - boxWidth, svgX))}" y="${Math.max(20, Math.min(520, svgY))}" width="${boxWidth}" height="400" style="overflow: visible; pointer-events: none;">
          <div xmlns="http://www.w3.org/1999/xhtml" class="meditate-verse-embed-noborder ${fontColor ? 'has-custom-color' : ''}" style="font-family: ${fontFamily}; font-size: ${fontSize}px; text-transform: ${fontCase}; ${fontColor ? `--meditate-font-color: ${fontColor}; color: ${fontColor};` : ''}">
            <p class="meditate-verse-quote-noborder">“${escapeHtml(verseText)}”</p>
            <div class="meditate-verse-citation-noborder">
              <strong>${escapeHtml(verseRef)}</strong>
              ${translation ? `<span class="meditate-tr-badge">${escapeHtml(translation)}</span>` : ''}
            </div>
          </div>
        </foreignObject>
      ` : ''}
    </svg>
  `;
}

/**
 * Returns filled SVG background artwork markup for cards and sharing posters.
 * Uses soft, elegant tints derived from the theme and palette for a gorgeous aesthetic.
 */
export function generateArtBackgroundSvg(templateIndex) {
  const tIdx = Math.abs(Number(templateIndex) || 0) % TOTAL_MEDITATE_ART_TEMPLATES;
  const themeIdx = tIdx % 10;
  const rng = createRng(tIdx * 17 + 31);

  // Soft harmonious palette per segment number (1..10)
  const palette = [
    '#e0f2fe', '#bae6fd', '#7dd3fc', '#fef08a', '#fed7aa',
    '#fbcfe8', '#e9d5ff', '#d6d3d1', '#cbd5e1', '#f1f5f9'
  ];
  const autoFills = new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'string') {
        let hash = 0;
        for (let i = 0; i < prop.length; i++) {
          hash = (hash * 31 + prop.charCodeAt(i)) & 0xffffffff;
        }
        return palette[Math.abs(hash) % palette.length];
      }
      return '#f1f5f9';
    }
  });

  let segmentsSvg = '';
  switch (themeIdx) {
    case 0: segmentsSvg = generateStainedGlassTemplate(tIdx, rng, autoFills); break;
    case 1: segmentsSvg = generateMandalaTemplate(tIdx, rng, autoFills); break;
    case 2: segmentsSvg = generateMountainSunriseTemplate(tIdx, rng, autoFills); break;
    case 3: segmentsSvg = generateLighthouseOceanTemplate(tIdx, rng, autoFills); break;
    case 4: segmentsSvg = generateCelestialHeavensTemplate(tIdx, rng, autoFills); break;
    case 5: segmentsSvg = generateCelticCrossTemplate(tIdx, rng, autoFills); break;
    case 6: segmentsSvg = generateEdenFloralTemplate(tIdx, rng, autoFills); break;
    case 7: segmentsSvg = generateDoveOfPeaceTemplate(tIdx, rng, autoFills); break;
    case 8: segmentsSvg = generateDesertDunesTemplate(tIdx, rng, autoFills); break;
    case 9:
    default:
      segmentsSvg = generateRiverOfLifeTemplate(tIdx, rng, autoFills); break;
  }

  return `
    <svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block;">
      <rect x="0" y="0" width="1000" height="700" fill="#f8fafc" />
      <g opacity="0.92">
        ${segmentsSvg}
      </g>
    </svg>
  `;
}

// ── Theme 0: Stained Glass Cathedral Windows & Gothic Tracery ───
function generateStainedGlassTemplate(tIdx, rng, savedFills) {
  const parts = [];
  const spokes = 8 + (tIdx % 5) * 2; // 8, 10, 12, 14, 16 spokes
  const cx = 500;
  const cy = 250;
  const outerR = 190;
  const midR = 120;
  const innerR = 55;

  // Center boss gemstone
  const centerId = `sg_center_${tIdx}`;
  parts.push(`
    <circle id="${centerId}" class="paint-segment" data-seg-id="${centerId}" data-seg-num="1"
      cx="${cx}" cy="${cy}" r="${innerR}"
      fill="${getFill(centerId, savedFills)}" stroke="#1e293b" stroke-width="2.5" />
  `);

  // Rosette petals (Inner ring and Outer ring)
  const angleStep = (Math.PI * 2) / spokes;
  for (let i = 0; i < spokes; i++) {
    const a1 = i * angleStep;
    const a2 = (i + 1) * angleStep;

    const x1_in = Math.round(cx + Math.cos(a1) * innerR);
    const y1_in = Math.round(cy + Math.sin(a1) * innerR);
    const x2_in = Math.round(cx + Math.cos(a2) * innerR);
    const y2_in = Math.round(cy + Math.sin(a2) * innerR);

    const x1_mid = Math.round(cx + Math.cos(a1) * midR);
    const y1_mid = Math.round(cy + Math.sin(a1) * midR);
    const x2_mid = Math.round(cx + Math.cos(a2) * midR);
    const y2_mid = Math.round(cy + Math.sin(a2) * midR);

    const x1_out = Math.round(cx + Math.cos(a1) * outerR);
    const y1_out = Math.round(cy + Math.sin(a1) * outerR);
    const x2_out = Math.round(cx + Math.cos(a2) * outerR);
    const y2_out = Math.round(cy + Math.sin(a2) * outerR);

    const innerPetalId = `sg_in_${tIdx}_${i}`;
    const outerPetalId = `sg_out_${tIdx}_${i}`;

    parts.push(`
      <polygon id="${innerPetalId}" class="paint-segment" data-seg-id="${innerPetalId}" data-seg-num="${(i % 8) + 2}"
        points="${x1_in},${y1_in} ${x1_mid},${y1_mid} ${x2_mid},${y2_mid} ${x2_in},${y2_in}"
        fill="${getFill(innerPetalId, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="${outerPetalId}" class="paint-segment" data-seg-id="${outerPetalId}" data-seg-num="${((i + 3) % 8) + 2}"
        points="${x1_mid},${y1_mid} ${x1_out},${y1_out} ${x2_out},${y2_out} ${x2_mid},${y2_mid}"
        fill="${getFill(outerPetalId, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  }

  // Gothic Arch Spandrels (top corners)
  const corners = [
    { id: `sg_spandrel_l_${tIdx}`, pts: '0,0 500,0 280,180 0,260', num: 7 },
    { id: `sg_spandrel_r_${tIdx}`, pts: '500,0 1000,0 1000,260 720,180', num: 7 },
    { id: `sg_side_l_${tIdx}`, pts: '0,260 280,180 200,450 0,450', num: 8 },
    { id: `sg_side_r_${tIdx}`, pts: '1000,260 720,180 800,450 1000,450', num: 8 }
  ];
  corners.forEach(c => {
    parts.push(`
      <polygon id="${c.id}" class="paint-segment" data-seg-id="${c.id}" data-seg-num="${c.num}"
        points="${c.pts}"
        fill="${getFill(c.id, savedFills)}" stroke="#1e293b" stroke-width="2.4" />
    `);
  });

  // Lower Lancet Columns (Vertical stained-glass pillars)
  const columns = 6;
  const colWidth = 1000 / columns;
  for (let c = 0; c < columns; c++) {
    const xLeft = Math.round(c * colWidth);
    const xRight = Math.round((c + 1) * colWidth);

    const topSegId = `sg_col_top_${tIdx}_${c}`;
    const botSegId = `sg_col_bot_${tIdx}_${c}`;

    parts.push(`
      <polygon id="${topSegId}" class="paint-segment" data-seg-id="${topSegId}" data-seg-num="${(c % 6) + 3}"
        points="${xLeft},450 ${xRight},450 ${xRight},570 ${xLeft},570"
        fill="${getFill(topSegId, savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="${botSegId}" class="paint-segment" data-seg-id="${botSegId}" data-seg-num="${((c + 2) % 6) + 3}"
        points="${xLeft},570 ${xRight},570 ${xRight},700 ${xLeft},700"
        fill="${getFill(botSegId, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  }

  return parts.join('\n');
}

// ── Theme 1: Sacred Geometric Mandalas & Starbursts ─────────────
function generateMandalaTemplate(tIdx, rng, savedFills) {
  const parts = [];
  const points = (tIdx % 3 === 0) ? 12 : (tIdx % 3 === 1 ? 8 : 16);
  const cx = 500;
  const cy = 350;
  const rad = 290;

  // Outer framing segments
  const outerQuadrantIds = [
    { id: `man_quad_1_${tIdx}`, pts: '0,0 500,0 500,100 200,200 0,350', num: 1 },
    { id: `man_quad_2_${tIdx}`, pts: '500,0 1000,0 1000,350 800,200 500,100', num: 1 },
    { id: `man_quad_3_${tIdx}`, pts: '0,350 200,500 500,600 500,700 0,700', num: 2 },
    { id: `man_quad_4_${tIdx}`, pts: '1000,350 800,500 500,600 500,700 1000,700', num: 2 }
  ];
  outerQuadrantIds.forEach(q => {
    parts.push(`
      <polygon id="${q.id}" class="paint-segment" data-seg-id="${q.id}" data-seg-num="${q.num}"
        points="${q.pts}"
        fill="${getFill(q.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Concentric Mandala Facet Rings
  const rings = [
    { rIn: 0, rOut: 50, num: 3, prefix: 'core' },
    { rIn: 50, rOut: 110, num: 4, prefix: 'ring1' },
    { rIn: 110, rOut: 180, num: 5, prefix: 'ring2' },
    { rIn: 180, rOut: 245, num: 6, prefix: 'ring3' },
    { rIn: 245, rOut: rad, num: 7, prefix: 'ring4' }
  ];

  rings.forEach((ring) => {
    const step = (Math.PI * 2) / points;
    for (let i = 0; i < points; i++) {
      const a1 = i * step;
      const a2 = (i + 1) * step;

      const x1 = Math.round(cx + Math.cos(a1) * ring.rOut);
      const y1 = Math.round(cy + Math.sin(a1) * ring.rOut);
      const x2 = Math.round(cx + Math.cos(a2) * ring.rOut);
      const y2 = Math.round(cy + Math.sin(a2) * ring.rOut);

      const id = `man_${ring.prefix}_${tIdx}_${i}`;

      if (ring.rIn === 0) {
        parts.push(`
          <polygon id="${id}" class="paint-segment" data-seg-id="${id}" data-seg-num="${(i % 4) + 1}"
            points="${cx},${cy} ${x1},${y1} ${x2},${y2}"
            fill="${getFill(id, savedFills)}" stroke="#1e293b" stroke-width="2" />
        `);
      } else {
        const x3 = Math.round(cx + Math.cos(a2) * ring.rIn);
        const y3 = Math.round(cy + Math.sin(a2) * ring.rIn);
        const x4 = Math.round(cx + Math.cos(a1) * ring.rIn);
        const y4 = Math.round(cy + Math.sin(a1) * ring.rIn);

        parts.push(`
          <polygon id="${id}" class="paint-segment" data-seg-id="${id}" data-seg-num="${((i + ring.num) % 8) + 1}"
            points="${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}"
            fill="${getFill(id, savedFills)}" stroke="#1e293b" stroke-width="2" />
        `);
      }
    }
  });

  return parts.join('\n');
}

// ── Theme 2: Mountain Sunrise & Alpine Glaciers ─────────────────
function generateMountainSunriseTemplate(tIdx, rng, savedFills) {
  const parts = [];
  const sunY = 220;
  const sunR = 85;

  // Sky Rays (10 rays)
  const rayPoints = [
    '0,0 200,0 500,220 0,140',
    '200,0 400,0 500,220',
    '400,0 600,0 500,220',
    '600,0 800,0 500,220',
    '800,0 1000,0 1000,140 500,220',
    '0,140 500,220 200,290 0,280',
    '1000,140 1000,280 800,290 500,220'
  ];
  rayPoints.forEach((pts, i) => {
    const id = `mtn_ray_${tIdx}_${i}`;
    parts.push(`
      <polygon id="${id}" class="paint-segment" data-seg-id="${id}" data-seg-num="${(i % 5) + 1}"
        points="${pts}"
        fill="${getFill(id, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  });

  // Rising Sun & Corona
  const sunId = `mtn_sun_${tIdx}`;
  const coronaId = `mtn_corona_${tIdx}`;
  parts.push(`
    <path id="${sunId}" class="paint-segment" data-seg-id="${sunId}" data-seg-num="4"
      d="M ${500 - sunR},${sunY} A ${sunR},${sunR} 0 0,1 ${500 + sunR},${sunY} Z"
      fill="${getFill(sunId, savedFills)}" stroke="#1e293b" stroke-width="2.5" />
    <path id="${coronaId}" class="paint-segment" data-seg-id="${coronaId}" data-seg-num="5"
      d="M ${500 - (sunR + 45)},${sunY} A ${sunR + 45},${sunR + 45} 0 0,1 ${500 + (sunR + 45)},${sunY} L ${500 + sunR},${sunY} A ${sunR},${sunR} 0 0,0 ${500 - sunR},${sunY} Z"
      fill="${getFill(coronaId, savedFills)}" stroke="#1e293b" stroke-width="2" />
  `);

  // High Mountain Peaks (Left, Center, Right)
  const peakSegments = [
    { id: `mtn_c_lit_${tIdx}`, pts: '500,140 340,320 500,320', num: 6 },
    { id: `mtn_c_shd_${tIdx}`, pts: '500,140 500,320 660,320', num: 7 },
    { id: `mtn_l_lit_${tIdx}`, pts: '200,170 40,330 200,330', num: 6 },
    { id: `mtn_l_shd_${tIdx}`, pts: '200,170 200,330 360,330', num: 7 },
    { id: `mtn_r_lit_${tIdx}`, pts: '800,170 640,330 800,330', num: 6 },
    { id: `mtn_r_shd_${tIdx}`, pts: '800,170 800,330 960,330', num: 7 },
    // Snowcaps
    { id: `mtn_sn_c_${tIdx}`, pts: '500,140 450,195 480,185 500,200 520,185 550,195', num: 10 },
    { id: `mtn_sn_l_${tIdx}`, pts: '200,170 150,225 180,215 200,230 220,215 250,225', num: 10 },
    { id: `mtn_sn_r_${tIdx}`, pts: '800,170 750,225 780,215 800,230 820,215 850,225', num: 10 }
  ];
  peakSegments.forEach(p => {
    parts.push(`
      <polygon id="${p.id}" class="paint-segment" data-seg-id="${p.id}" data-seg-num="${p.num}"
        points="${p.pts}"
        fill="${getFill(p.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Midground Foothills & Glacial Terrace (Rows of rolling hill segments)
  const hillRows = [
    { pts: '0,320 250,310 500,330 750,310 1000,320 1000,430 0,430', num: 8, id: `mtn_hill1_${tIdx}` },
    { pts: '0,430 300,420 600,440 1000,420 1000,530 0,530', num: 8, id: `mtn_hill2_${tIdx}` },
    { pts: '0,530 350,520 700,540 1000,520 1000,700 0,700', num: 9, id: `mtn_valley_${tIdx}` }
  ];
  hillRows.forEach(h => {
    parts.push(`
      <polygon id="${h.id}" class="paint-segment" data-seg-id="${h.id}" data-seg-num="${h.num}"
        points="${h.pts}"
        fill="${getFill(h.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Valley Pines & River Ribbons
  for (let tree = 0; tree < 6; tree++) {
    const tx = 100 + tree * 150;
    const ty = 460 + (tree % 2) * 40;
    const treeId = `mtn_tree_${tIdx}_${tree}`;
    parts.push(`
      <polygon id="${treeId}" class="paint-segment" data-seg-id="${treeId}" data-seg-num="3"
        points="${tx},${ty - 45} ${tx - 25},${ty + 15} ${tx + 25},${ty + 15}"
        fill="${getFill(treeId, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  }

  return parts.join('\n');
}

// ── Theme 3: Coastal Lighthouse & Ocean Breakers ────────────────
function generateLighthouseOceanTemplate(tIdx, rng, savedFills) {
  const parts = [];

  // Sky backdrop quadrants
  const skySegments = [
    { id: `lh_sky1_${tIdx}`, pts: '0,0 500,0 200,250 0,250', num: 1 },
    { id: `lh_sky2_${tIdx}`, pts: '500,0 1000,0 1000,250 200,250', num: 2 },
    // Beacon Light Beams
    { id: `lh_beam1_${tIdx}`, pts: '210,130 1000,40 1000,140 210,145', num: 4 },
    { id: `lh_beam2_${tIdx}`, pts: '210,145 1000,160 1000,260 210,160', num: 5 }
  ];
  skySegments.forEach(s => {
    parts.push(`
      <polygon id="${s.id}" class="paint-segment" data-seg-id="${s.id}" data-seg-num="${s.num}"
        points="${s.pts}"
        fill="${getFill(s.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Lighthouse Tower (Lantern, Dome, Balcony, 5 Striped Segments)
  const lhBaseX = 170;
  const lhTopX = 185;
  const lhW = 55;
  const lhTopW = 40;

  // Dome & Lantern
  parts.push(`
    <path id="lh_dome_${tIdx}" class="paint-segment" data-seg-id="lh_dome_${tIdx}" data-seg-num="6"
      d="M ${lhTopX},100 A 20,20 0 0,1 ${lhTopX + lhTopW},100 Z"
      fill="${getFill(`lh_dome_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    <rect id="lh_glass_${tIdx}" class="paint-segment" data-seg-id="lh_glass_${tIdx}" data-seg-num="4"
      x="${lhTopX}" y="100" width="${lhTopW}" height="35"
      fill="${getFill(`lh_glass_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    <polygon id="lh_railing_${tIdx}" class="paint-segment" data-seg-id="lh_railing_${tIdx}" data-seg-num="7"
      points="${lhTopX - 8},135 ${lhTopX + lhTopW + 8},135 ${lhTopX + lhTopW + 5},145 ${lhTopX - 5},145"
      fill="${getFill(`lh_railing_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2" />
  `);

  // Tower Horizontal Stripes
  for (let s = 0; s < 5; s++) {
    const y1 = 145 + s * 30;
    const y2 = y1 + 30;
    const x1_l = lhTopX - s * 2;
    const x1_r = lhTopX + lhTopW + s * 2;
    const x2_l = lhTopX - (s + 1) * 2;
    const x2_r = lhTopX + lhTopW + (s + 1) * 2;
    const stripeId = `lh_stripe_${tIdx}_${s}`;
    parts.push(`
      <polygon id="${stripeId}" class="paint-segment" data-seg-id="${stripeId}" data-seg-num="${(s % 2 === 0) ? 10 : 6}"
        points="${x1_l},${y1} ${x1_r},${y1} ${x2_r},${y2} ${x2_l},${y2}"
        fill="${getFill(stripeId, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  }

  // Rocky Sea Cliff (Strata segments under lighthouse)
  const cliffStrata = [
    { pts: '100,295 270,295 320,420 50,420', num: 8, id: `lh_cliff1_${tIdx}` },
    { pts: '50,420 320,420 360,540 0,540', num: 9, id: `lh_cliff2_${tIdx}` },
    { pts: '0,540 360,540 300,700 0,700', num: 8, id: `lh_cliff3_${tIdx}` }
  ];
  cliffStrata.forEach(c => {
    parts.push(`
      <polygon id="${c.id}" class="paint-segment" data-seg-id="${c.id}" data-seg-num="${c.num}"
        points="${c.pts}"
        fill="${getFill(c.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Rolling Ocean Wave Breakers (Curved wave ribbons)
  const waveLayers = [
    { d: 'M 270,295 C 400,280 600,310 750,295 C 880,280 940,300 1000,290 L 1000,370 C 850,380 650,350 500,375 C 380,390 340,370 300,360 Z', num: 3, id: `lh_wave1_${tIdx}` },
    { d: 'M 300,360 C 450,350 650,390 800,370 C 920,355 960,375 1000,365 L 1000,460 C 850,470 650,440 480,465 C 380,480 340,460 330,450 Z', num: 2, id: `lh_wave2_${tIdx}` },
    { d: 'M 330,450 C 480,440 680,480 820,460 C 940,445 980,465 1000,455 L 1000,560 C 850,570 650,540 450,570 C 370,580 350,560 340,550 Z', num: 3, id: `lh_wave3_${tIdx}` },
    { d: 'M 340,550 C 500,540 700,580 850,560 C 950,545 980,565 1000,555 L 1000,700 L 300,700 Z', num: 2, id: `lh_wave4_${tIdx}` }
  ];
  waveLayers.forEach(w => {
    parts.push(`
      <path id="${w.id}" class="paint-segment" data-seg-id="${w.id}" data-seg-num="${w.num}"
        d="${w.d}"
        fill="${getFill(w.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  return parts.join('\n');
}

// ── Theme 4: Celestial Heavens, Crescent Moon & Orbiting Stars ──
function generateCelestialHeavensTemplate(tIdx, rng, savedFills) {
  const parts = [];
  const cx = 500;
  const cy = 300;

  // Sky Quadrants
  const skyPillars = [
    { pts: '0,0 500,0 250,300 0,300', num: 1, id: `cel_sky1_${tIdx}` },
    { pts: '500,0 1000,0 1000,300 750,300', num: 2, id: `cel_sky2_${tIdx}` },
    { pts: '0,300 250,300 500,700 0,700', num: 3, id: `cel_sky3_${tIdx}` },
    { pts: '1000,300 750,300 500,700 1000,700', num: 3, id: `cel_sky4_${tIdx}` }
  ];
  skyPillars.forEach(s => {
    parts.push(`
      <polygon id="${s.id}" class="paint-segment" data-seg-id="${s.id}" data-seg-num="${s.num}"
        points="${s.pts}"
        fill="${getFill(s.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Central Ornate Crescent Moon
  const moonR = 170;
  const moonId = `cel_moon_${tIdx}`;
  const moonInnerId = `cel_moon_in_${tIdx}`;
  parts.push(`
    <path id="${moonId}" class="paint-segment" data-seg-id="${moonId}" data-seg-num="4"
      d="M ${cx},${cy - moonR} A ${moonR},${moonR} 0 1,1 ${cx},${cy + moonR} A ${moonR * 0.75},${moonR * 0.75} 0 0,0 ${cx},${cy - moonR} Z"
      fill="${getFill(moonId, savedFills)}" stroke="#1e293b" stroke-width="2.5" />
    <circle id="${moonInnerId}" class="paint-segment" data-seg-id="${moonInnerId}" data-seg-num="5"
      cx="${cx + 35}" cy="${cy}" r="${moonR * 0.5}"
      fill="${getFill(moonInnerId, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
  `);

  // Orbital Planetary Rings
  const ringAngles = 8;
  for (let r = 0; r < ringAngles; r++) {
    const rx = 280;
    const ry = 80;
    const a1 = (r * Math.PI * 2) / ringAngles;
    const a2 = ((r + 1) * Math.PI * 2) / ringAngles;
    const px1 = Math.round(cx + Math.cos(a1) * rx);
    const py1 = Math.round(cy + Math.sin(a1) * ry);
    const px2 = Math.round(cx + Math.cos(a2) * rx);
    const py2 = Math.round(cy + Math.sin(a2) * ry);
    const ringSegId = `cel_ring_${tIdx}_${r}`;
    parts.push(`
      <path id="${ringSegId}" class="paint-segment" data-seg-id="${ringSegId}" data-seg-num="${(r % 4) + 6}"
        d="M ${px1},${py1} Q ${cx},${cy} ${px2},${py2} L ${px2 + 6},${py2 + 6} Q ${cx},${cy + 8} ${px1 + 6},${py1 + 6} Z"
        fill="${getFill(ringSegId, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  }

  // Constellation 8-Point Stars
  const starPositions = [
    { x: 160, y: 120, r: 28 },
    { x: 840, y: 120, r: 28 },
    { x: 120, y: 480, r: 24 },
    { x: 880, y: 480, r: 24 }
  ];
  starPositions.forEach((st, i) => {
    const starId = `cel_star_${tIdx}_${i}`;
    const pts = [];
    for (let p = 0; p < 8; p++) {
      const radLen = (p % 2 === 0) ? st.r : st.r * 0.45;
      const ang = (p * Math.PI) / 4;
      pts.push(`${Math.round(st.x + Math.cos(ang) * radLen)},${Math.round(st.y + Math.sin(ang) * radLen)}`);
    }
    parts.push(`
      <polygon id="${starId}" class="paint-segment" data-seg-id="${starId}" data-seg-num="10"
        points="${pts.join(' ')}"
        fill="${getFill(starId, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  });

  return parts.join('\n');
}

// ── Theme 5: Celtic Cross & Woven Knotwork Mosaics ──────────────
function generateCelticCrossTemplate(tIdx, rng, savedFills) {
  const parts = [];
  const cx = 500;
  const cy = 350;

  // Background quadrant mosaics
  const cornerMats = [
    { pts: '0,0 400,0 350,220 0,220', num: 1, id: `celt_c1_${tIdx}` },
    { pts: '600,0 1000,0 1000,220 650,220', num: 1, id: `celt_c2_${tIdx}` },
    { pts: '0,480 350,480 400,700 0,700', num: 2, id: `celt_c3_${tIdx}` },
    { pts: '650,480 1000,480 1000,700 600,700', num: 2, id: `celt_c4_${tIdx}` }
  ];
  cornerMats.forEach(c => {
    parts.push(`
      <polygon id="${c.id}" class="paint-segment" data-seg-id="${c.id}" data-seg-num="${c.num}"
        points="${c.pts}"
        fill="${getFill(c.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Celtic Nimbus Ring (Circle woven behind cross arms)
  const ringR = 190;
  const ringThick = 45;
  const ringQuadrants = 8;
  for (let q = 0; q < ringQuadrants; q++) {
    const a1 = (q * Math.PI * 2) / ringQuadrants;
    const a2 = ((q + 1) * Math.PI * 2) / ringQuadrants;
    const p1 = `${Math.round(cx + Math.cos(a1) * (ringR - ringThick))},${Math.round(cy + Math.sin(a1) * (ringR - ringThick))}`;
    const p2 = `${Math.round(cx + Math.cos(a1) * ringR)},${Math.round(cy + Math.sin(a1) * ringR)}`;
    const p3 = `${Math.round(cx + Math.cos(a2) * ringR)},${Math.round(cy + Math.sin(a2) * ringR)}`;
    const p4 = `${Math.round(cx + Math.cos(a2) * (ringR - ringThick))},${Math.round(cy + Math.sin(a2) * (ringR - ringThick))}`;
    const qId = `celt_ring_${tIdx}_${q}`;
    parts.push(`
      <polygon id="${qId}" class="paint-segment" data-seg-id="${qId}" data-seg-num="${(q % 4) + 3}"
        points="${p1} ${p2} ${p3} ${p4}"
        fill="${getFill(qId, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  }

  // Cross Arms (Top, Bottom, Left, Right)
  const armW = 90;
  const arms = [
    { pts: `${cx - armW/2},40 ${cx + armW/2},40 ${cx + armW/2},${cy - armW/2} ${cx - armW/2},${cy - armW/2}`, num: 5, id: `celt_arm_t_${tIdx}` },
    { pts: `${cx - armW/2},${cy + armW/2} ${cx + armW/2},${cy + armW/2} ${cx + armW/2},660 ${cx - armW/2},660`, num: 6, id: `celt_arm_b_${tIdx}` },
    { pts: `100,${cy - armW/2} ${cx - armW/2},${cy - armW/2} ${cx - armW/2},${cy + armW/2} 100,${cy + armW/2}`, num: 5, id: `celt_arm_l_${tIdx}` },
    { pts: `${cx + armW/2},${cy - armW/2} 900,${cy - armW/2} 900,${cy + armW/2} ${cx + armW/2},${cy + armW/2}`, num: 6, id: `celt_arm_r_${tIdx}` }
  ];
  arms.forEach(a => {
    parts.push(`
      <polygon id="${a.id}" class="paint-segment" data-seg-id="${a.id}" data-seg-num="${a.num}"
        points="${a.pts}"
        fill="${getFill(a.id, savedFills)}" stroke="#1e293b" stroke-width="2.5" />
    `);
  });

  // Central Gemstone Boss & Insets
  const bossId = `celt_boss_${tIdx}`;
  parts.push(`
    <circle id="${bossId}" class="paint-segment" data-seg-id="${bossId}" data-seg-num="10"
      cx="${cx}" cy="${cy}" r="${armW * 0.6}"
      fill="${getFill(bossId, savedFills)}" stroke="#1e293b" stroke-width="3" />
  `);

  return parts.join('\n');
}

// ── Theme 6: Eden Garden Floral Tapestries & Botanicals ─────────
function generateEdenFloralTemplate(tIdx, rng, savedFills) {
  const parts = [];
  const cx = 500;
  const cy = 270;

  // Background trellis quadrants
  const trellis = [
    { pts: '0,0 500,0 300,200 0,300', num: 1, id: `ed_tr1_${tIdx}` },
    { pts: '500,0 1000,0 1000,300 700,200', num: 2, id: `ed_tr2_${tIdx}` },
    { pts: '0,300 300,450 500,700 0,700', num: 3, id: `ed_tr3_${tIdx}` },
    { pts: '1000,300 700,450 500,700 1000,700', num: 3, id: `ed_tr4_${tIdx}` }
  ];
  trellis.forEach(tr => {
    parts.push(`
      <polygon id="${tr.id}" class="paint-segment" data-seg-id="${tr.id}" data-seg-num="${tr.num}"
        points="${tr.pts}"
        fill="${getFill(tr.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Central Rose Blossom / Lotus Blossom (12 Petals + Center Core)
  const coreId = `ed_core_${tIdx}`;
  parts.push(`
    <circle id="${coreId}" class="paint-segment" data-seg-id="${coreId}" data-seg-num="4"
      cx="${cx}" cy="${cy}" r="38"
      fill="${getFill(coreId, savedFills)}" stroke="#1e293b" stroke-width="2.5" />
  `);

  const petals = 12;
  for (let p = 0; p < petals; p++) {
    const a = (p * Math.PI * 2) / petals;
    const rOuter = 135;
    const tipX = Math.round(cx + Math.cos(a) * rOuter);
    const tipY = Math.round(cy + Math.sin(a) * rOuter);
    const sideA1 = a - 0.28;
    const sideA2 = a + 0.28;
    const s1X = Math.round(cx + Math.cos(sideA1) * 75);
    const s1Y = Math.round(cy + Math.sin(sideA1) * 75);
    const s2X = Math.round(cx + Math.cos(sideA2) * 75);
    const s2Y = Math.round(cy + Math.sin(sideA2) * 75);

    const petalId = `ed_petal_${tIdx}_${p}`;
    parts.push(`
      <polygon id="${petalId}" class="paint-segment" data-seg-id="${petalId}" data-seg-num="${(p % 4) + 5}"
        points="${cx},${cy} ${s1X},${s1Y} ${tipX},${tipY} ${s2X},${s2Y}"
        fill="${getFill(petalId, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  }

  // Botanical Vine Leaves (Left & Right)
  const leafClusters = [
    { x: 180, y: 160, id: `ed_leaf_l1_${tIdx}` },
    { x: 260, y: 220, id: `ed_leaf_l2_${tIdx}` },
    { x: 820, y: 160, id: `ed_leaf_r1_${tIdx}` },
    { x: 740, y: 220, id: `ed_leaf_r2_${tIdx}` }
  ];
  leafClusters.forEach((lf, i) => {
    parts.push(`
      <path id="${lf.id}" class="paint-segment" data-seg-id="${lf.id}" data-seg-num="3"
        d="M ${lf.x},${lf.y} C ${lf.x - 35},${lf.y - 45} ${lf.x - 45},${lf.y + 35} ${lf.x},${lf.y + 50} C ${lf.x + 45},${lf.y + 35} ${lf.x + 35},${lf.y - 45} ${lf.x},${lf.y} Z"
        fill="${getFill(lf.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  return parts.join('\n');
}

// ── Theme 7: Descending Dove of Peace & Heavenly Halo ───────────
function generateDoveOfPeaceTemplate(tIdx, rng, savedFills) {
  const parts = [];
  const cx = 500;
  const cy = 240;

  // Heavenly Halo Rays
  const rayCount = 12;
  for (let r = 0; r < rayCount; r++) {
    const a1 = (r * Math.PI * 2) / rayCount;
    const a2 = ((r + 1) * Math.PI * 2) / rayCount;
    const r1 = 90;
    const r2 = 280;
    const x1 = Math.round(cx + Math.cos(a1) * r1);
    const y1 = Math.round(cy + Math.sin(a1) * r1);
    const x2 = Math.round(cx + Math.cos(a2) * r1);
    const y2 = Math.round(cy + Math.sin(a2) * r1);
    const x3 = Math.round(cx + Math.cos(a2) * r2);
    const y3 = Math.round(cy + Math.sin(a2) * r2);
    const x4 = Math.round(cx + Math.cos(a1) * r2);
    const y4 = Math.round(cy + Math.sin(a1) * r2);
    const rayId = `dove_ray_${tIdx}_${r}`;
    parts.push(`
      <polygon id="${rayId}" class="paint-segment" data-seg-id="${rayId}" data-seg-num="${(r % 4) + 1}"
        points="${x1},${y1} ${x4},${y4} ${x3},${y3} ${x2},${y2}"
        fill="${getFill(rayId, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  }

  // Dove Body, Head & Beak
  parts.push(`
    <path id="dove_body_${tIdx}" class="paint-segment" data-seg-id="dove_body_${tIdx}" data-seg-num="10"
      d="M ${cx},${cy - 50} C ${cx - 30},${cy - 10} ${cx - 35},${cy + 40} ${cx},${cy + 85} C ${cx + 35},${cy + 40} ${cx + 30},${cy - 10} ${cx},${cy - 50} Z"
      fill="${getFill(`dove_body_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2.5" />
    <circle id="dove_head_${tIdx}" class="paint-segment" data-seg-id="dove_head_${tIdx}" data-seg-num="10"
      cx="${cx}" cy="${cy - 75}" r="26"
      fill="${getFill(`dove_head_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2.5" />
    <polygon id="dove_beak_${tIdx}" class="paint-segment" data-seg-id="dove_beak_${tIdx}" data-seg-num="5"
      points="${cx},${cy - 85} ${cx - 8},${cy - 105} ${cx + 8},${cy - 105}"
      fill="${getFill(`dove_beak_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2" />
  `);

  // Outstretched Feathered Wings (Left & Right 5 Feathers each)
  for (let f = 0; f < 5; f++) {
    const flY = cy - 40 + f * 22;
    const flX = cx - 40 - f * 42;
    const lFeatherId = `dove_fl_${tIdx}_${f}`;
    parts.push(`
      <path id="${lFeatherId}" class="paint-segment" data-seg-id="${lFeatherId}" data-seg-num="${f + 5}"
        d="M ${cx - 25},${cy - 10} Q ${flX - 45},${flY - 45} ${flX - 85},${flY + 15} Q ${cx - 30},${cy + 30} ${cx - 25},${cy - 10} Z"
        fill="${getFill(lFeatherId, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);

    const frX = cx + 40 + f * 42;
    const rFeatherId = `dove_fr_${tIdx}_${f}`;
    parts.push(`
      <path id="${rFeatherId}" class="paint-segment" data-seg-id="${rFeatherId}" data-seg-num="${f + 5}"
        d="M ${cx + 25},${cy - 10} Q ${frX + 45},${flY - 45} ${frX + 85},${flY + 15} Q ${cx + 30},${cy + 30} ${cx + 25},${cy - 10} Z"
        fill="${getFill(rFeatherId, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  }

  // Heavenly Cloud Billows (Base)
  const clouds = [
    { d: 'M 0,520 C 150,470 300,560 450,510 C 600,470 750,550 1000,500 L 1000,700 L 0,700 Z', num: 2, id: `dove_cld1_${tIdx}` }
  ];
  clouds.forEach(c => {
    parts.push(`
      <path id="${c.id}" class="paint-segment" data-seg-id="${c.id}" data-seg-num="${c.num}"
        d="${c.d}"
        fill="${getFill(c.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  return parts.join('\n');
}

// ── Theme 8: Desert Sand Dunes & Oasis Palms under Starlight ────
function generateDesertDunesTemplate(tIdx, rng, savedFills) {
  const parts = [];

  // Starry Twilight Sky (Quadrants with Moon)
  const skyPlanes = [
    { pts: '0,0 500,0 350,220 0,220', num: 1, id: `des_sky1_${tIdx}` },
    { pts: '500,0 1000,0 1000,220 650,220', num: 2, id: `des_sky2_${tIdx}` }
  ];
  skyPlanes.forEach(s => {
    parts.push(`
      <polygon id="${s.id}" class="paint-segment" data-seg-id="${s.id}" data-seg-num="${s.num}"
        points="${s.pts}"
        fill="${getFill(s.id, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  });

  // Desert Crescent Moon
  parts.push(`
    <path id="des_moon_${tIdx}" class="paint-segment" data-seg-id="des_moon_${tIdx}" data-seg-num="4"
      d="M 820,80 A 35,35 0 1,1 820,150 A 25,25 0 0,0 820,80 Z"
      fill="${getFill(`des_moon_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2" />
  `);

  // Sweeping S-Curve Sand Dune Ridges
  const dunes = [
    { d: 'M 0,220 Q 250,180 500,230 Q 750,280 1000,210 L 1000,320 Q 700,380 400,310 Q 200,260 0,330 Z', num: 6, id: `des_dune1_${tIdx}` },
    { d: 'M 0,330 Q 300,280 600,350 Q 850,410 1000,320 L 1000,450 Q 700,500 350,420 Q 150,380 0,440 Z', num: 7, id: `des_dune2_${tIdx}` },
    { d: 'M 0,440 Q 350,400 700,470 Q 880,520 1000,450 L 1000,580 Q 650,640 300,550 L 0,590 Z', num: 6, id: `des_dune3_${tIdx}` },
    { d: 'M 0,590 Q 300,550 650,640 L 1000,580 L 1000,700 L 0,700 Z', num: 8, id: `des_oasis_ground_${tIdx}` }
  ];
  dunes.forEach(d => {
    parts.push(`
      <path id="${d.id}" class="paint-segment" data-seg-id="${d.id}" data-seg-num="${d.num}"
        d="${d.d}"
        fill="${getFill(d.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Oasis Date Palms (Pair on Left & Right)
  const palmCoords = [{ x: 180, y: 380 }, { x: 230, y: 390 }];
  palmCoords.forEach((p, idx) => {
    // Trunk
    parts.push(`
      <path id="des_trunk_${tIdx}_${idx}" class="paint-segment" data-seg-id="des_trunk_${tIdx}_${idx}" data-seg-num="9"
        d="M ${p.x - 6},${p.y} Q ${p.x - 18},${p.y - 70} ${p.x - 5},${p.y - 120} L ${p.x + 5},${p.y - 120} Q ${p.x - 8},${p.y - 70} ${p.x + 6},${p.y} Z"
        fill="${getFill(`des_trunk_${tIdx}_${idx}`, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
    // Fronds (6 per tree)
    for (let f = 0; f < 6; f++) {
      const ang = (f * Math.PI) / 3;
      const frX = Math.round(p.x - 5 + Math.cos(ang) * 45);
      const frY = Math.round(p.y - 120 + Math.sin(ang) * 35);
      const frondId = `des_frond_${tIdx}_${idx}_${f}`;
      parts.push(`
        <path id="${frondId}" class="paint-segment" data-seg-id="${frondId}" data-seg-num="3"
          d="M ${p.x - 5},${p.y - 120} Q ${p.x - 5 + Math.cos(ang) * 25},${p.y - 145} ${frX},${frY} Z"
          fill="${getFill(frondId, savedFills)}" stroke="#1e293b" stroke-width="2" />
      `);
    }
  });

  return parts.join('\n');
}

// ── Theme 9: River of Life Mosaic & Braided Water Lilies ────────
function generateRiverOfLifeTemplate(tIdx, rng, savedFills) {
  const parts = [];

  // Distant horizon mountain ranges
  const skyPlanes = [
    { pts: '0,0 500,0 350,180 0,220', num: 1, id: `riv_sky1_${tIdx}` },
    { pts: '500,0 1000,0 1000,220 650,180', num: 2, id: `riv_sky2_${tIdx}` },
    { pts: '0,220 350,180 500,200 650,180 1000,220 1000,320 0,320', num: 7, id: `riv_mtn_${tIdx}` }
  ];
  skyPlanes.forEach(s => {
    parts.push(`
      <polygon id="${s.id}" class="paint-segment" data-seg-id="${s.id}" data-seg-num="${s.num}"
        points="${s.pts}"
        fill="${getFill(s.id, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    `);
  });

  // Arched Stone Bridge across the river
  parts.push(`
    <polygon id="riv_bridge_span_${tIdx}" class="paint-segment" data-seg-id="riv_bridge_span_${tIdx}" data-seg-num="8"
      points="280,310 720,310 750,370 250,370"
      fill="${getFill(`riv_bridge_span_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2.2" />
    <path id="riv_bridge_arch_${tIdx}" class="paint-segment" data-seg-id="riv_bridge_arch_${tIdx}" data-seg-num="9"
      d="M 380,370 A 120,60 0 0,1 620,370 Z"
      fill="${getFill(`riv_bridge_arch_${tIdx}`, savedFills)}" stroke="#1e293b" stroke-width="2" />
  `);

  // Braided River Currents (6 flowing ribbons)
  const currents = [
    { d: 'M 380,370 Q 420,440 280,510 Q 180,570 0,620 L 0,700 L 220,700 Q 380,590 480,480 Q 520,410 450,370 Z', num: 3, id: `riv_flow1_${tIdx}` },
    { d: 'M 450,370 Q 520,410 480,480 Q 380,590 220,700 L 520,700 Q 640,580 580,470 Q 560,420 540,370 Z', num: 2, id: `riv_flow2_${tIdx}` },
    { d: 'M 540,370 Q 560,420 580,470 Q 640,580 520,700 L 820,700 Q 880,570 720,480 Q 640,420 620,370 Z', num: 3, id: `riv_flow3_${tIdx}` },
    { d: 'M 620,370 Q 640,420 720,480 Q 880,570 820,700 L 1000,700 L 1000,580 Q 850,500 750,370 Z', num: 2, id: `riv_flow4_${tIdx}` }
  ];
  currents.forEach(c => {
    parts.push(`
      <path id="${c.id}" class="paint-segment" data-seg-id="${c.id}" data-seg-num="${c.num}"
        d="${c.d}"
        fill="${getFill(c.id, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  });

  // Riverbank Stones & Water Lilies
  const lilies = [
    { cx: 200, cy: 590, r: 24, id: `riv_lily1_${tIdx}` },
    { cx: 780, cy: 580, r: 28, id: `riv_lily2_${tIdx}` }
  ];
  lilies.forEach(l => {
    parts.push(`
      <circle id="${l.id}" class="paint-segment" data-seg-id="${l.id}" data-seg-num="5"
        cx="${l.cx}" cy="${l.cy}" r="${l.r}"
        fill="${getFill(l.id, savedFills)}" stroke="#1e293b" stroke-width="2" />
    `);
  });

  return parts.join('\n');
}
