// Meditate Mode — Interactive Uplifting "Color by Numbers" SVG Artwork & Verse Canvas
export const TOTAL_MEDITATE_ART_TEMPLATES = 5;

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates an interactive SVG canvas featuring Scripture and color-by-numbers uplifting line art.
 * @param {number} templateIndex - 0 to 4
 * @param {string} verseText - The scripture text
 * @param {string} verseRef - E.g. "John 3:16"
 * @param {string} translation - E.g. "ESV"
 * @param {Record<string, string>} savedFills - Map of segmentId -> fill hex
 */
export function renderMeditateArtworkSvg(templateIndex, verseText, verseRef, translation = 'ESV', savedFills = {}) {
  const tIdx = Math.abs(Number(templateIndex) || 0) % TOTAL_MEDITATE_ART_TEMPLATES;

  switch (tIdx) {
    case 0:
      return renderMountainSunriseTemplate(verseText, verseRef, translation, savedFills);
    case 1:
      return renderLighthouseCoastTemplate(verseText, verseRef, translation, savedFills);
    case 2:
      return renderSongbirdBranchTemplate(verseText, verseRef, translation, savedFills);
    case 3:
      return renderSereneLakeTemplate(verseText, verseRef, translation, savedFills);
    case 4:
    default:
      return renderWildflowerMeadowTemplate(verseText, verseRef, translation, savedFills);
  }
}

function getFill(segId, savedFills, defaultFill = '#FFFFFF') {
  return savedFills[segId] || defaultFill;
}

// ── 1. Mountain Sunrise & Valley Pines Template ──────────────────
function renderMountainSunriseTemplate(verseText, verseRef, translation, savedFills) {
  return `
    <svg viewBox="0 0 1000 700" class="meditate-svg-art" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="med-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.18" />
        </filter>
      </defs>

      <!-- Background Frame / Canvas Base -->
      <rect x="0" y="0" width="1000" height="700" fill="#f8fafc" stroke="#1e293b" stroke-width="3" />

      <!-- SKY / SUN RAY QUADRANTS -->
      <polygon id="seg_sky_1" class="paint-segment" data-seg-id="seg_sky_1" data-seg-num="1"
        points="0,0 250,0 500,240 0,160"
        fill="${getFill('seg_sky_1', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_sky_2" class="paint-segment" data-seg-id="seg_sky_2" data-seg-num="2"
        points="250,0 500,0 500,240"
        fill="${getFill('seg_sky_2', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_sky_3" class="paint-segment" data-seg-id="seg_sky_3" data-seg-num="2"
        points="500,0 750,0 500,240"
        fill="${getFill('seg_sky_3', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_sky_4" class="paint-segment" data-seg-id="seg_sky_4" data-seg-num="1"
        points="750,0 1000,0 1000,160 500,240"
        fill="${getFill('seg_sky_4', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_sky_5" class="paint-segment" data-seg-id="seg_sky_5" data-seg-num="3"
        points="0,160 500,240 220,310 0,300"
        fill="${getFill('seg_sky_5', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_sky_6" class="paint-segment" data-seg-id="seg_sky_6" data-seg-num="3"
        points="1000,160 1000,300 780,310 500,240"
        fill="${getFill('seg_sky_6', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- RISING SUN -->
      <path id="seg_sun_core" class="paint-segment" data-seg-id="seg_sun_core" data-seg-num="4"
        d="M 410,240 A 90,90 0 0,1 590,240 Z"
        fill="${getFill('seg_sun_core', savedFills)}" stroke="#1e293b" stroke-width="2.5" />
      <path id="seg_sun_halo" class="paint-segment" data-seg-id="seg_sun_halo" data-seg-num="5"
        d="M 360,240 A 140,140 0 0,1 640,240 L 590,240 A 90,90 0 0,0 410,240 Z"
        fill="${getFill('seg_sun_halo', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- DISTANT MOUNTAIN PEAKS -->
      <!-- Left High Peak -->
      <polygon id="seg_mtn_left_lit" class="paint-segment" data-seg-id="seg_mtn_left_lit" data-seg-num="6"
        points="220,180 50,340 220,340"
        fill="${getFill('seg_mtn_left_lit', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_mtn_left_shade" class="paint-segment" data-seg-id="seg_mtn_left_shade" data-seg-num="7"
        points="220,180 220,340 380,340"
        fill="${getFill('seg_mtn_left_shade', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Center High Peak -->
      <polygon id="seg_mtn_center_lit" class="paint-segment" data-seg-id="seg_mtn_center_lit" data-seg-num="6"
        points="500,160 360,340 500,340"
        fill="${getFill('seg_mtn_center_lit', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_mtn_center_shade" class="paint-segment" data-seg-id="seg_mtn_center_shade" data-seg-num="7"
        points="500,160 500,340 640,340"
        fill="${getFill('seg_mtn_center_shade', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Right High Peak -->
      <polygon id="seg_mtn_right_lit" class="paint-segment" data-seg-id="seg_mtn_right_lit" data-seg-num="6"
        points="780,180 620,340 780,340"
        fill="${getFill('seg_mtn_right_lit', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_mtn_right_shade" class="paint-segment" data-seg-id="seg_mtn_right_shade" data-seg-num="7"
        points="780,180 780,340 950,340"
        fill="${getFill('seg_mtn_right_shade', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- SNOWCAPS -->
      <polygon id="seg_snow_center" class="paint-segment" data-seg-id="seg_snow_center" data-seg-num="10"
        points="500,160 460,210 480,205 500,215 520,205 540,210"
        fill="${getFill('seg_snow_center', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="seg_snow_left" class="paint-segment" data-seg-id="seg_snow_left" data-seg-num="10"
        points="220,180 170,230 195,225 220,235 245,225 270,230"
        fill="${getFill('seg_snow_left', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="seg_snow_right" class="paint-segment" data-seg-id="seg_snow_right" data-seg-num="10"
        points="780,180 730,230 755,225 780,235 805,225 830,230"
        fill="${getFill('seg_snow_right', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- MIDGROUND FOOTHILLS & ROLLING RIDGES -->
      <path id="seg_ridge_1" class="paint-segment" data-seg-id="seg_ridge_1" data-seg-num="8"
        d="M 0,300 Q 180,290 350,330 L 350,420 L 0,420 Z"
        fill="${getFill('seg_ridge_1', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_ridge_2" class="paint-segment" data-seg-id="seg_ridge_2" data-seg-num="8"
        d="M 1000,300 Q 820,290 650,330 L 650,420 L 1000,420 Z"
        fill="${getFill('seg_ridge_2', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_ridge_center" class="paint-segment" data-seg-id="seg_ridge_center" data-seg-num="3"
        d="M 350,330 Q 500,300 650,330 L 650,420 L 350,420 Z"
        fill="${getFill('seg_ridge_center', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- PINE TREE SILHOUETTES LEFT & RIGHT -->
      <polygon id="seg_tree_left_1" class="paint-segment" data-seg-id="seg_tree_left_1" data-seg-num="3"
        points="90,320 60,380 75,380 45,430 135,430 105,380 120,380"
        fill="${getFill('seg_tree_left_1', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="seg_tree_left_2" class="paint-segment" data-seg-id="seg_tree_left_2" data-seg-num="3"
        points="160,340 135,395 150,395 125,445 195,445 170,395 185,395"
        fill="${getFill('seg_tree_left_2', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="seg_tree_right_1" class="paint-segment" data-seg-id="seg_tree_right_1" data-seg-num="3"
        points="910,320 880,380 895,380 865,430 955,430 925,380 940,380"
        fill="${getFill('seg_tree_right_1', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="seg_tree_right_2" class="paint-segment" data-seg-id="seg_tree_right_2" data-seg-num="3"
        points="840,340 815,395 830,395 805,445 875,445 850,395 865,395"
        fill="${getFill('seg_tree_right_2', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- VALLEY LAKE & WATER REFLECTION -->
      <path id="seg_water_1" class="paint-segment" data-seg-id="seg_water_1" data-seg-num="1"
        d="M 0,420 Q 500,400 1000,420 L 1000,530 Q 500,510 0,530 Z"
        fill="${getFill('seg_water_1', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_water_2" class="paint-segment" data-seg-id="seg_water_2" data-seg-num="2"
        d="M 0,530 Q 500,510 1000,530 L 1000,700 L 0,700 Z"
        fill="${getFill('seg_water_2', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- SCRIPTURE SANCTUARY PLAQUE (Central Parchment Floating in Harmony) -->
      <g transform="translate(180, 430)" filter="url(#med-shadow)">
        <rect id="seg_verse_plaque" class="paint-segment" data-seg-id="seg_verse_plaque" data-seg-num="10"
          x="0" y="0" width="640" height="230" rx="16" ry="16"
          fill="${getFill('seg_verse_plaque', savedFills, '#ffffff')}"
          stroke="#1e293b" stroke-width="2.5" />
        <rect x="8" y="8" width="624" height="214" rx="12" ry="12"
          fill="none" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4,4" />

        <foreignObject x="24" y="16" width="592" height="198">
          <div xmlns="http://www.w3.org/1999/xhtml" class="meditate-verse-embed">
            <p class="meditate-verse-quote">“${escapeHtml(verseText)}”</p>
            <div class="meditate-verse-citation">
              <strong>${escapeHtml(verseRef)}</strong>
              <span class="meditate-tr-badge">${escapeHtml(translation)}</span>
            </div>
          </div>
        </foreignObject>
      </g>
    </svg>
  `;
}

// ── 2. Ocean Lighthouse on Coastal Cliff Template ────────────────
function renderLighthouseCoastTemplate(verseText, verseRef, translation, savedFills) {
  return `
    <svg viewBox="0 0 1000 700" class="meditate-svg-art" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="med-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.18" />
        </filter>
      </defs>

      <!-- Canvas Frame -->
      <rect x="0" y="0" width="1000" height="700" fill="#f8fafc" stroke="#1e293b" stroke-width="3" />

      <!-- SKY / EVENING CLOUDS -->
      <path id="seg_lh_sky_1" class="paint-segment" data-seg-id="seg_lh_sky_1" data-seg-num="1"
        d="M 0,0 L 1000,0 L 1000,180 Q 750,150 500,180 Q 250,150 0,180 Z"
        fill="${getFill('seg_lh_sky_1', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_lh_sky_2" class="paint-segment" data-seg-id="seg_lh_sky_2" data-seg-num="7"
        d="M 0,180 Q 250,150 500,180 Q 750,150 1000,180 L 1000,320 L 0,320 Z"
        fill="${getFill('seg_lh_sky_2', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- BEACON LIGHT RAYS -->
      <polygon id="seg_lh_beam_left" class="paint-segment" data-seg-id="seg_lh_beam_left" data-seg-num="4"
        points="220,135 0,30 0,110 220,145"
        fill="${getFill('seg_lh_beam_left', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="seg_lh_beam_right" class="paint-segment" data-seg-id="seg_lh_beam_right" data-seg-num="4"
        points="240,135 1000,50 1000,160 240,145"
        fill="${getFill('seg_lh_beam_right', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- OCEAN HORIZON & WAVES -->
      <path id="seg_lh_ocean_1" class="paint-segment" data-seg-id="seg_lh_ocean_1" data-seg-num="2"
        d="M 0,320 L 1000,320 L 1000,390 Q 750,370 500,400 Q 250,370 0,390 Z"
        fill="${getFill('seg_lh_ocean_1', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_lh_ocean_2" class="paint-segment" data-seg-id="seg_lh_ocean_2" data-seg-num="1"
        d="M 0,390 Q 250,370 500,400 Q 750,370 1000,390 L 1000,470 Q 500,450 0,480 Z"
        fill="${getFill('seg_lh_ocean_2', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_lh_ocean_3" class="paint-segment" data-seg-id="seg_lh_ocean_3" data-seg-num="2"
        d="M 0,480 Q 500,450 1000,470 L 1000,700 L 0,700 Z"
        fill="${getFill('seg_lh_ocean_3', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- COASTAL CLIFF & CRAGS -->
      <path id="seg_lh_cliff_top" class="paint-segment" data-seg-id="seg_lh_cliff_top" data-seg-num="3"
        d="M 120,380 Q 230,370 340,390 L 300,430 L 90,420 Z"
        fill="${getFill('seg_lh_cliff_top', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_lh_cliff_base" class="paint-segment" data-seg-id="seg_lh_cliff_base" data-seg-num="8"
        d="M 90,420 L 300,430 L 320,620 Q 200,640 60,600 Z"
        fill="${getFill('seg_lh_cliff_base', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- LIGHTHOUSE TOWER & LANTERN ROOM -->
      <polygon id="seg_lh_tier_3" class="paint-segment" data-seg-id="seg_lh_tier_3" data-seg-num="5"
        points="210,160 250,160 256,230 204,230"
        fill="${getFill('seg_lh_tier_3', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_lh_tier_2" class="paint-segment" data-seg-id="seg_lh_tier_2" data-seg-num="10"
        points="204,230 256,230 263,305 197,305"
        fill="${getFill('seg_lh_tier_2', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <polygon id="seg_lh_tier_1" class="paint-segment" data-seg-id="seg_lh_tier_1" data-seg-num="5"
        points="197,305 263,305 270,380 190,380"
        fill="${getFill('seg_lh_tier_1', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Lantern Room & Dome -->
      <path id="seg_lh_dome" class="paint-segment" data-seg-id="seg_lh_dome" data-seg-num="8"
        d="M 215,130 A 15,15 0 0,1 245,130 Z"
        fill="${getFill('seg_lh_dome', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <rect id="seg_lh_lamp" class="paint-segment" data-seg-id="seg_lh_lamp" data-seg-num="4"
        x="215" y="130" width="30" height="30"
        fill="${getFill('seg_lh_lamp', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- SCRIPTURE SANCTUARY CARD (Right Side Sea-Breeze Plaque) -->
      <g transform="translate(390, 180)" filter="url(#med-shadow)">
        <rect id="seg_verse_plaque_lh" class="paint-segment" data-seg-id="seg_verse_plaque_lh" data-seg-num="10"
          x="0" y="0" width="560" height="280" rx="16" ry="16"
          fill="${getFill('seg_verse_plaque_lh', savedFills, '#ffffff')}"
          stroke="#1e293b" stroke-width="2.5" />
        <rect x="8" y="8" width="544" height="264" rx="12" ry="12"
          fill="none" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4,4" />

        <foreignObject x="24" y="20" width="512" height="240">
          <div xmlns="http://www.w3.org/1999/xhtml" class="meditate-verse-embed">
            <p class="meditate-verse-quote">“${escapeHtml(verseText)}”</p>
            <div class="meditate-verse-citation">
              <strong>${escapeHtml(verseRef)}</strong>
              <span class="meditate-tr-badge">${escapeHtml(translation)}</span>
            </div>
          </div>
        </foreignObject>
      </g>
    </svg>
  `;
}

// ── 3. Gentle Songbird on Blooming Branch Template ──────────────
function renderSongbirdBranchTemplate(verseText, verseRef, translation, savedFills) {
  return `
    <svg viewBox="0 0 1000 700" class="meditate-svg-art" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="med-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.18" />
        </filter>
      </defs>

      <!-- Canvas Frame -->
      <rect x="0" y="0" width="1000" height="700" fill="#f8fafc" stroke="#1e293b" stroke-width="3" />

      <!-- BACKGROUND RADIANT RAYS -->
      <circle id="seg_sb_halo_1" class="paint-segment" data-seg-id="seg_sb_halo_1" data-seg-num="4"
        cx="500" cy="220" r="180"
        fill="${getFill('seg_sb_halo_1', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <circle id="seg_sb_halo_2" class="paint-segment" data-seg-id="seg_sb_halo_2" data-seg-num="5"
        cx="500" cy="220" r="260"
        fill="${getFill('seg_sb_halo_2', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- TREE BRANCH -->
      <path id="seg_sb_branch" class="paint-segment" data-seg-id="seg_sb_branch" data-seg-num="8"
        d="M 50,360 Q 250,330 450,320 Q 650,320 950,260 L 950,290 Q 650,350 450,350 Q 250,360 50,390 Z"
        fill="${getFill('seg_sb_branch', savedFills)}" stroke="#1e293b" stroke-width="2.4" />

      <!-- SONGBIRD -->
      <!-- Bird Body & Crown -->
      <path id="seg_sb_head" class="paint-segment" data-seg-id="seg_sb_head" data-seg-num="1"
        d="M 450,220 C 470,190 520,190 540,220 C 540,240 520,260 490,260 Z"
        fill="${getFill('seg_sb_head', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Beak -->
      <polygon id="seg_sb_beak" class="paint-segment" data-seg-id="seg_sb_beak" data-seg-num="4"
        points="540,215 565,225 540,230"
        fill="${getFill('seg_sb_beak', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <!-- Breast / Belly -->
      <path id="seg_sb_breast" class="paint-segment" data-seg-id="seg_sb_breast" data-seg-num="5"
        d="M 480,250 C 530,260 540,310 490,325 C 450,325 430,280 480,250 Z"
        fill="${getFill('seg_sb_breast', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Wing -->
      <path id="seg_sb_wing" class="paint-segment" data-seg-id="seg_sb_wing" data-seg-num="2"
        d="M 450,240 C 420,260 410,310 440,325 C 470,300 480,260 450,240 Z"
        fill="${getFill('seg_sb_wing', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Tail -->
      <polygon id="seg_sb_tail" class="paint-segment" data-seg-id="seg_sb_tail" data-seg-num="2"
        points="430,310 370,370 395,370 445,320"
        fill="${getFill('seg_sb_tail', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- BLOSSOMS & PETALS -->
      <!-- Left Blossom -->
      <circle id="seg_sb_fl_left_c" class="paint-segment" data-seg-id="seg_sb_fl_left_c" data-seg-num="4"
        cx="250" cy="330" r="14"
        fill="${getFill('seg_sb_fl_left_c', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_left_p1" class="paint-segment" data-seg-id="seg_sb_fl_left_p1" data-seg-num="6"
        d="M 250,316 C 240,285 260,285 250,316 Z"
        fill="${getFill('seg_sb_fl_left_p1', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_left_p2" class="paint-segment" data-seg-id="seg_sb_fl_left_p2" data-seg-num="6"
        d="M 264,330 C 295,320 295,340 264,330 Z"
        fill="${getFill('seg_sb_fl_left_p2', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_left_p3" class="paint-segment" data-seg-id="seg_sb_fl_left_p3" data-seg-num="6"
        d="M 236,330 C 205,320 205,340 236,330 Z"
        fill="${getFill('seg_sb_fl_left_p3', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_left_p4" class="paint-segment" data-seg-id="seg_sb_fl_left_p4" data-seg-num="6"
        d="M 250,344 C 240,375 260,375 250,344 Z"
        fill="${getFill('seg_sb_fl_left_p4', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- Right Blossom -->
      <circle id="seg_sb_fl_rt_c" class="paint-segment" data-seg-id="seg_sb_fl_rt_c" data-seg-num="4"
        cx="720" cy="285" r="14"
        fill="${getFill('seg_sb_fl_rt_c', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_rt_p1" class="paint-segment" data-seg-id="seg_sb_fl_rt_p1" data-seg-num="6"
        d="M 720,271 C 710,240 730,240 720,271 Z"
        fill="${getFill('seg_sb_fl_rt_p1', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_rt_p2" class="paint-segment" data-seg-id="seg_sb_fl_rt_p2" data-seg-num="6"
        d="M 734,285 C 765,275 765,295 734,285 Z"
        fill="${getFill('seg_sb_fl_rt_p2', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_rt_p3" class="paint-segment" data-seg-id="seg_sb_fl_rt_p3" data-seg-num="6"
        d="M 706,285 C 675,275 675,295 706,285 Z"
        fill="${getFill('seg_sb_fl_rt_p3', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_fl_rt_p4" class="paint-segment" data-seg-id="seg_sb_fl_rt_p4" data-seg-num="6"
        d="M 720,299 C 710,330 730,330 720,299 Z"
        fill="${getFill('seg_sb_fl_rt_p4', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- GREEN LEAVES -->
      <path id="seg_sb_leaf_1" class="paint-segment" data-seg-id="seg_sb_leaf_1" data-seg-num="3"
        d="M 320,330 C 340,300 370,310 360,340 C 340,350 320,345 320,330 Z"
        fill="${getFill('seg_sb_leaf_1', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_sb_leaf_2" class="paint-segment" data-seg-id="seg_sb_leaf_2" data-seg-num="3"
        d="M 620,300 C 640,270 670,280 660,310 C 640,320 620,315 620,300 Z"
        fill="${getFill('seg_sb_leaf_2', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- SCRIPTURE SANCTUARY RIBBON CARD (Lower Center) -->
      <g transform="translate(160, 440)" filter="url(#med-shadow)">
        <rect id="seg_verse_plaque_sb" class="paint-segment" data-seg-id="seg_verse_plaque_sb" data-seg-num="10"
          x="0" y="0" width="680" height="220" rx="16" ry="16"
          fill="${getFill('seg_verse_plaque_sb', savedFills, '#ffffff')}"
          stroke="#1e293b" stroke-width="2.5" />
        <rect x="8" y="8" width="664" height="204" rx="12" ry="12"
          fill="none" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4,4" />

        <foreignObject x="24" y="16" width="632" height="188">
          <div xmlns="http://www.w3.org/1999/xhtml" class="meditate-verse-embed">
            <p class="meditate-verse-quote">“${escapeHtml(verseText)}”</p>
            <div class="meditate-verse-citation">
              <strong>${escapeHtml(verseRef)}</strong>
              <span class="meditate-tr-badge">${escapeHtml(translation)}</span>
            </div>
          </div>
        </foreignObject>
      </g>
    </svg>
  `;
}

// ── 4. Serene Lake & Sailboat Template ───────────────────────────
function renderSereneLakeTemplate(verseText, verseRef, translation, savedFills) {
  return `
    <svg viewBox="0 0 1000 700" class="meditate-svg-art" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="med-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.18" />
        </filter>
      </defs>

      <rect x="0" y="0" width="1000" height="700" fill="#f8fafc" stroke="#1e293b" stroke-width="3" />

      <!-- EVENING TWILIGHT SKY -->
      <polygon id="seg_sl_sky" class="paint-segment" data-seg-id="seg_sl_sky" data-seg-num="7"
        points="0,0 1000,0 1000,280 0,280"
        fill="${getFill('seg_sl_sky', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- CRESCENT MOON & STARS -->
      <path id="seg_sl_moon" class="paint-segment" data-seg-id="seg_sl_moon" data-seg-num="4"
        d="M 160,80 A 40,40 0 1,0 200,120 A 30,30 0 1,1 160,80 Z"
        fill="${getFill('seg_sl_moon', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <polygon id="seg_sl_star1" class="paint-segment" data-seg-id="seg_sl_star1" data-seg-num="4"
        points="270,70 274,80 284,80 276,86 279,96 270,90 261,96 264,86 256,80 266,80"
        fill="${getFill('seg_sl_star1', savedFills)}" stroke="#1e293b" stroke-width="1.5" />
      <polygon id="seg_sl_star2" class="paint-segment" data-seg-id="seg_sl_star2" data-seg-num="4"
        points="380,100 384,110 394,110 386,116 389,126 380,120 371,126 374,116 366,110 376,110"
        fill="${getFill('seg_sl_star2', savedFills)}" stroke="#1e293b" stroke-width="1.5" />

      <!-- DISTANT HILLS & HORIZON -->
      <path id="seg_sl_hill_left" class="paint-segment" data-seg-id="seg_sl_hill_left" data-seg-num="2"
        d="M 0,280 Q 250,220 500,280 L 500,340 L 0,340 Z"
        fill="${getFill('seg_sl_hill_left', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_sl_hill_right" class="paint-segment" data-seg-id="seg_sl_hill_right" data-seg-num="8"
        d="M 500,280 Q 750,230 1000,280 L 1000,340 L 500,340 Z"
        fill="${getFill('seg_sl_hill_right', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- LAKE SURFACE & RIPPLES -->
      <path id="seg_sl_lake_1" class="paint-segment" data-seg-id="seg_sl_lake_1" data-seg-num="1"
        d="M 0,340 L 1000,340 L 1000,440 Q 500,420 0,440 Z"
        fill="${getFill('seg_sl_lake_1', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_sl_lake_2" class="paint-segment" data-seg-id="seg_sl_lake_2" data-seg-num="2"
        d="M 0,440 Q 500,420 1000,440 L 1000,700 L 0,700 Z"
        fill="${getFill('seg_sl_lake_2', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- PEACEFUL SAILBOAT -->
      <!-- Main Sail -->
      <polygon id="seg_sl_sail_main" class="paint-segment" data-seg-id="seg_sl_sail_main" data-seg-num="10"
        points="780,250 780,360 840,360"
        fill="${getFill('seg_sl_sail_main', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Jib Sail -->
      <polygon id="seg_sl_sail_jib" class="paint-segment" data-seg-id="seg_sl_sail_jib" data-seg-num="10"
        points="775,270 775,360 740,360"
        fill="${getFill('seg_sl_sail_jib', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Hull -->
      <polygon id="seg_sl_hull" class="paint-segment" data-seg-id="seg_sl_hull" data-seg-num="8"
        points="725,365 860,365 845,385 745,385"
        fill="${getFill('seg_sl_hull', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- SCRIPTURE SANCTUARY PLAQUE (Left / Center Float) -->
      <g transform="translate(120, 200)" filter="url(#med-shadow)">
        <rect id="seg_verse_plaque_sl" class="paint-segment" data-seg-id="seg_verse_plaque_sl" data-seg-num="10"
          x="0" y="0" width="560" height="260" rx="16" ry="16"
          fill="${getFill('seg_verse_plaque_sl', savedFills, '#ffffff')}"
          stroke="#1e293b" stroke-width="2.5" />
        <rect x="8" y="8" width="544" height="244" rx="12" ry="12"
          fill="none" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4,4" />

        <foreignObject x="24" y="20" width="512" height="220">
          <div xmlns="http://www.w3.org/1999/xhtml" class="meditate-verse-embed">
            <p class="meditate-verse-quote">“${escapeHtml(verseText)}”</p>
            <div class="meditate-verse-citation">
              <strong>${escapeHtml(verseRef)}</strong>
              <span class="meditate-tr-badge">${escapeHtml(translation)}</span>
            </div>
          </div>
        </foreignObject>
      </g>
    </svg>
  `;
}

// ── 5. Wildflower Meadow & Monarch Butterfly Template ────────────
function renderWildflowerMeadowTemplate(verseText, verseRef, translation, savedFills) {
  return `
    <svg viewBox="0 0 1000 700" class="meditate-svg-art" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="med-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.18" />
        </filter>
      </defs>

      <rect x="0" y="0" width="1000" height="700" fill="#f8fafc" stroke="#1e293b" stroke-width="3" />

      <!-- SUNNY SKY -->
      <polygon id="seg_wf_sky" class="paint-segment" data-seg-id="seg_wf_sky" data-seg-num="1"
        points="0,0 1000,0 1000,320 0,320"
        fill="${getFill('seg_wf_sky', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- RADIANT SUN -->
      <path id="seg_wf_sun" class="paint-segment" data-seg-id="seg_wf_sun" data-seg-num="4"
        d="M 0,0 L 160,0 A 160,160 0 0,1 0,160 Z"
        fill="${getFill('seg_wf_sun', savedFills)}" stroke="#1e293b" stroke-width="2.5" />

      <!-- ROLLING MEADOW HILLS -->
      <path id="seg_wf_hill_back" class="paint-segment" data-seg-id="seg_wf_hill_back" data-seg-num="3"
        d="M 0,320 Q 300,260 600,300 Q 800,330 1000,290 L 1000,420 L 0,420 Z"
        fill="${getFill('seg_wf_hill_back', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <path id="seg_wf_hill_fore" class="paint-segment" data-seg-id="seg_wf_hill_fore" data-seg-num="3"
        d="M 0,420 Q 400,380 700,430 Q 850,450 1000,410 L 1000,700 L 0,700 Z"
        fill="${getFill('seg_wf_hill_fore', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- BUTTERFLY (Top Right) -->
      <!-- Body -->
      <ellipse id="seg_wf_bf_body" class="paint-segment" data-seg-id="seg_wf_bf_body" data-seg-num="9"
        cx="820" cy="140" rx="6" ry="25"
        fill="${getFill('seg_wf_bf_body', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <!-- Upper Left Wing -->
      <path id="seg_wf_bf_wing_ul" class="paint-segment" data-seg-id="seg_wf_bf_wing_ul" data-seg-num="5"
        d="M 815,130 C 770,90 730,110 740,140 C 750,160 805,150 815,135 Z"
        fill="${getFill('seg_wf_bf_wing_ul', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Lower Left Wing -->
      <path id="seg_wf_bf_wing_ll" class="paint-segment" data-seg-id="seg_wf_bf_wing_ll" data-seg-num="4"
        d="M 815,140 C 770,160 760,190 780,200 C 800,200 815,170 815,145 Z"
        fill="${getFill('seg_wf_bf_wing_ll', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Upper Right Wing -->
      <path id="seg_wf_bf_wing_ur" class="paint-segment" data-seg-id="seg_wf_bf_wing_ur" data-seg-num="5"
        d="M 825,130 C 870,90 910,110 900,140 C 890,160 835,150 825,135 Z"
        fill="${getFill('seg_wf_bf_wing_ur', savedFills)}" stroke="#1e293b" stroke-width="2.2" />
      <!-- Lower Right Wing -->
      <path id="seg_wf_bf_wing_lr" class="paint-segment" data-seg-id="seg_wf_bf_wing_lr" data-seg-num="4"
        d="M 825,140 C 870,160 880,190 860,200 C 840,200 825,170 825,145 Z"
        fill="${getFill('seg_wf_bf_wing_lr', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- WILDFLOWERS (Left & Right Bottom) -->
      <!-- Flower 1 (Left Daisy) -->
      <circle id="seg_wf_fl1_c" class="paint-segment" data-seg-id="seg_wf_fl1_c" data-seg-num="4"
        cx="100" cy="540" r="14"
        fill="${getFill('seg_wf_fl1_c', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_wf_fl1_p1" class="paint-segment" data-seg-id="seg_wf_fl1_p1" data-seg-num="6"
        d="M 100,526 C 90,495 110,495 100,526 Z"
        fill="${getFill('seg_wf_fl1_p1', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_wf_fl1_p2" class="paint-segment" data-seg-id="seg_wf_fl1_p2" data-seg-num="6"
        d="M 114,540 C 145,530 145,550 114,540 Z"
        fill="${getFill('seg_wf_fl1_p2', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_wf_fl1_p3" class="paint-segment" data-seg-id="seg_wf_fl1_p3" data-seg-num="6"
        d="M 86,540 C 55,530 55,550 86,540 Z"
        fill="${getFill('seg_wf_fl1_p3', savedFills)}" stroke="#1e293b" stroke-width="2" />
      <path id="seg_wf_fl1_p4" class="paint-segment" data-seg-id="seg_wf_fl1_p4" data-seg-num="6"
        d="M 100,554 C 90,585 110,585 100,554 Z"
        fill="${getFill('seg_wf_fl1_p4', savedFills)}" stroke="#1e293b" stroke-width="2" />

      <!-- Flower 2 (Right Tulip) -->
      <path id="seg_wf_tulip" class="paint-segment" data-seg-id="seg_wf_tulip" data-seg-num="6"
        d="M 900,520 C 870,520 870,570 900,590 C 930,570 930,520 900,520 Z"
        fill="${getFill('seg_wf_tulip', savedFills)}" stroke="#1e293b" stroke-width="2.2" />

      <!-- SCRIPTURE SANCTUARY PLAQUE (Central Panel) -->
      <g transform="translate(180, 220)" filter="url(#med-shadow)">
        <rect id="seg_verse_plaque_wf" class="paint-segment" data-seg-id="seg_verse_plaque_wf" data-seg-num="10"
          x="0" y="0" width="640" height="250" rx="16" ry="16"
          fill="${getFill('seg_verse_plaque_wf', savedFills, '#ffffff')}"
          stroke="#1e293b" stroke-width="2.5" />
        <rect x="8" y="8" width="624" height="234" rx="12" ry="12"
          fill="none" stroke="#e2e8f0" stroke-width="1.2" stroke-dasharray="4,4" />

        <foreignObject x="24" y="20" width="592" height="210">
          <div xmlns="http://www.w3.org/1999/xhtml" class="meditate-verse-embed">
            <p class="meditate-verse-quote">“${escapeHtml(verseText)}”</p>
            <div class="meditate-verse-citation">
              <strong>${escapeHtml(verseRef)}</strong>
              <span class="meditate-tr-badge">${escapeHtml(translation)}</span>
            </div>
          </div>
        </foreignObject>
      </g>
    </svg>
  `;
}
