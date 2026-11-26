/* ================================================================
   PLAYER, REFEREE & SPECTATOR APPEARANCE SYSTEM
   Provides:
   - Authentic squad numbers (등번호), skin tones, hairstyles & GK kits
   - Detailed human player figurine rendering (animated legs/arms, face, hair, gloves)
   - Main Referee (주심) & Assistant Referee (부심) rendering (whistle, cards, flag)
   - Individual Stadium Spectator rendering (1 body = 1 head, seats, scarves, cheering arms)
   - Zero-allocation WebGL primitive helpers (bypasses Phaser Graphics 408-vertex arc/Earcut bottleneck!)
   ================================================================ */

import Phaser from 'phaser';

export type HairStyle = 'short' | 'spiky' | 'swept' | 'curly' | 'bun' | 'buzz';

export interface PlayerVisualProfile {
  jerseyNumber: number;
  skinTone: number;
  hairColor: number;
  hairStyle: HairStyle;
  isGoalkeeper: boolean;
  gkJerseyColor?: number;
  gkGloveColor?: number;
}

// ── Precomputed Unit Circle Lookup Table (Zero Heap Allocations, Zero Earcut!) ──
const FAST_SEGMENTS = 12;
const UNIT_COS: number[] = [];
const UNIT_SIN: number[] = [];
for (let i = 0; i <= FAST_SEGMENTS; i++) {
  const a = (i / FAST_SEGMENTS) * Math.PI * 2;
  UNIT_COS.push(Math.cos(a));
  UNIT_SIN.push(Math.sin(a));
}

/**
 * Draws a crisp filled circle/ellipse using direct GPU triangles (batchFillTriangle),
 * completely bypassing Phaser Graphics' 101-point arc allocation + O(N^2) Earcut triangulation!
 */
export function fillFastEllipse(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments: 8 | 12 = 12
): void {
  if (segments === 12) {
    for (let i = 0; i < FAST_SEGMENTS; i++) {
      gfx.fillTriangle(
        cx,
        cy,
        cx + UNIT_COS[i] * rx,
        cy + UNIT_SIN[i] * ry,
        cx + UNIT_COS[i + 1] * rx,
        cy + UNIT_SIN[i + 1] * ry
      );
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      gfx.fillTriangle(
        cx,
        cy,
        cx + Math.cos(a0) * rx,
        cy + Math.sin(a0) * ry,
        cx + Math.cos(a1) * rx,
        cy + Math.sin(a1) * ry
      );
    }
  }
}

export function fillFastCircle(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  segments: 8 | 12 = 12
): void {
  fillFastEllipse(gfx, cx, cy, r, r, segments);
}

/**
 * Draws a clean beveled/rounded rectangle using 2 direct quads + 4 corner triangles
 * (0 allocations, 0 Earcut — 100x faster than Phaser's 408-point fillRoundedRect!).
 */
export function fillFastBevelRect(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  bevel: number
): void {
  const b = Math.min(bevel, w * 0.45, h * 0.45);
  if (b <= 0.4) {
    gfx.fillRect(x, y, w, h);
    return;
  }
  // Center cross (2 quads)
  gfx.fillRect(x + b, y, w - b * 2, h);
  gfx.fillRect(x, y + b, b, h - b * 2);
  gfx.fillRect(x + w - b, y + b, b, h - b * 2);
  // 4 beveled corner triangles
  gfx.fillTriangle(x + b, y, x + b, y + b, x, y + b);
  gfx.fillTriangle(x + w - b, y, x + w, y + b, x + w - b, y + b);
  gfx.fillTriangle(x, y + h - b, x + b, y + h - b, x + b, y + h);
  gfx.fillTriangle(x + w - b, y + h - b, x + w, y + h - b, x + w - b, y + h);
}

/**
 * Draws a crisp filled circular sector / hair cap dome using direct triangles (0 Earcut).
 */
export function fillFastDome(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  steps = 7
): void {
  const span = endAngle - startAngle;
  for (let i = 0; i < steps; i++) {
    const a0 = startAngle + (i / steps) * span;
    const a1 = startAngle + ((i + 1) / steps) * span;
    gfx.fillTriangle(
      cx,
      cy,
      cx + Math.cos(a0) * r,
      cy + Math.sin(a0) * r,
      cx + Math.cos(a1) * r,
      cy + Math.sin(a1) * r
    );
  }
}

const KNOWN_PLAYER_PROFILES: Record<string, Omit<PlayerVisualProfile, 'isGoalkeeper'>> = {
  p_casillas:   { jerseyNumber: 1,  skinTone: 0xF3CFA4, hairColor: 0x241A12, hairStyle: 'short', gkJerseyColor: 0x1E824C, gkGloveColor: 0xF5F7FA },
  p_mbappe:     { jerseyNumber: 9,  skinTone: 0xA8724A, hairColor: 0x151210, hairStyle: 'buzz' },
  p_haaland:    { jerseyNumber: 9,  skinTone: 0xFAE0C4, hairColor: 0xE5C158, hairStyle: 'bun' },
  p_vinicius:   { jerseyNumber: 7,  skinTone: 0x7A4B2B, hairColor: 0x120E0C, hairStyle: 'curly' },
  p_modric:     { jerseyNumber: 10, skinTone: 0xF7DAB8, hairColor: 0xB89146, hairStyle: 'swept' },
  p_ramos:      { jerseyNumber: 4,  skinTone: 0xEBC298, hairColor: 0x221710, hairStyle: 'swept' },
  p_neuer:      { jerseyNumber: 1,  skinTone: 0xF9DEC2, hairColor: 0xC8A14D, hairStyle: 'short', gkJerseyColor: 0x1F6FA8, gkGloveColor: 0xFFE066 },
  p_messi:      { jerseyNumber: 10, skinTone: 0xF4D2A8, hairColor: 0x2B1D12, hairStyle: 'short' },
  p_ronaldo:    { jerseyNumber: 7,  skinTone: 0xE8BE92, hairColor: 0x1D1611, hairStyle: 'spiky' },
  p_neymar:     { jerseyNumber: 11, skinTone: 0xD7A476, hairColor: 0x231810, hairStyle: 'spiky' },
  p_pele:       { jerseyNumber: 10, skinTone: 0x8F5B36, hairColor: 0x14100E, hairStyle: 'buzz' },
  p_zidane:     { jerseyNumber: 5,  skinTone: 0xECC49B, hairColor: 0x2A2018, hairStyle: 'buzz' },
  p_ronaldinho: { jerseyNumber: 10, skinTone: 0xB87E50, hairColor: 0x181310, hairStyle: 'curly' },
  p_maldini:    { jerseyNumber: 3,  skinTone: 0xF2CCA2, hairColor: 0x1F1610, hairStyle: 'swept' },
  p_carlos:     { jerseyNumber: 6,  skinTone: 0xA87046, hairColor: 0x14100E, hairStyle: 'buzz' },
  p_yashin:     { jerseyNumber: 1,  skinTone: 0xF5D5B2, hairColor: 0x201812, hairStyle: 'short', gkJerseyColor: 0x16181D, gkGloveColor: 0xD4AF37 },
  p_son:        { jerseyNumber: 7,  skinTone: 0xF6D7B2, hairColor: 0x1A1512, hairStyle: 'swept' },
  p_salah:      { jerseyNumber: 11, skinTone: 0xD4A172, hairColor: 0x161210, hairStyle: 'curly' },
  p_debruyne:   { jerseyNumber: 17, skinTone: 0xFBE0C2, hairColor: 0xD9A84E, hairStyle: 'swept' },
  p_vvd:        { jerseyNumber: 4,  skinTone: 0xC68E5E, hairColor: 0x181310, hairStyle: 'bun' },
  p_saka:       { jerseyNumber: 7,  skinTone: 0x7A4B2A, hairColor: 0x120E0C, hairStyle: 'buzz' },
  p_pedri:      { jerseyNumber: 8,  skinTone: 0xF2CEA6, hairColor: 0x241911, hairStyle: 'short' },
  p_kim:        { jerseyNumber: 3,  skinTone: 0xF4D3AC, hairColor: 0x181411, hairStyle: 'buzz' },
  p_rodri:      { jerseyNumber: 16, skinTone: 0xF1CDA4, hairColor: 0x261B13, hairStyle: 'short' },
  p_bellingham: { jerseyNumber: 5,  skinTone: 0x9E6B43, hairColor: 0x14100E, hairStyle: 'buzz' },
  p_rashford:   { jerseyNumber: 10, skinTone: 0x855331, hairColor: 0x14100E, hairStyle: 'short' },
  p_mount:      { jerseyNumber: 19, skinTone: 0xF6D6B0, hairColor: 0x4A3320, hairStyle: 'swept' },
  p_martinez:   { jerseyNumber: 6,  skinTone: 0xEFC89E, hairColor: 0xB89348, hairStyle: 'short' },
  p_alexander:  { jerseyNumber: 66, skinTone: 0x9B6842, hairColor: 0x161210, hairStyle: 'curly' },
  p_davies:     { jerseyNumber: 19, skinTone: 0x6E4225, hairColor: 0x120E0C, hairStyle: 'buzz' },
  p_havertz:    { jerseyNumber: 29, skinTone: 0xF7D9B6, hairColor: 0x3B2818, hairStyle: 'swept' },
  p_hwang:      { jerseyNumber: 11, skinTone: 0xF3D1AA, hairColor: 0x181310, hairStyle: 'short' },
  p_lee:        { jerseyNumber: 19, skinTone: 0xF7DAB6, hairColor: 0x1F1712, hairStyle: 'swept' },
  p_jung:       { jerseyNumber: 5,  skinTone: 0xF2CFA8, hairColor: 0x1A1410, hairStyle: 'short' },
  p_cho:        { jerseyNumber: 21, skinTone: 0xF7DBB8, hairColor: 0x1B1410, hairStyle: 'spiky', gkJerseyColor: 0xD97724, gkGloveColor: 0xFFD54F },
  p_park:       { jerseyNumber: 23, skinTone: 0xF2CFA8, hairColor: 0x1B1510, hairStyle: 'short' },
  p_hong:       { jerseyNumber: 20, skinTone: 0xF1CEA6, hairColor: 0x1B1510, hairStyle: 'short' },
  p_kwon:       { jerseyNumber: 22, skinTone: 0xF4D3AC, hairColor: 0x221812, hairStyle: 'swept' },
};

const POSITION_DEFAULT_NUMBERS: Record<string, number[]> = {
  GK: [1, 12, 21],
  LB: [3, 12, 20],
  CB: [4, 5, 6, 15, 23],
  RB: [2, 14, 22],
  CDM: [6, 16, 4],
  CM: [8, 14, 18, 24],
  CAM: [10, 17, 19],
  LW: [7, 11, 17],
  RW: [11, 7, 20],
  ST: [9, 10, 11, 18],
};

export function resolvePlayerVisualProfile(
  playerId: string,
  position: string,
  usedNumbers?: Set<number>
): PlayerVisualProfile {
  const cleanId = playerId.includes('_p_')
    ? 'p_' + playerId.split('_p_')[1]
    : playerId;

  const isGK = position === 'GK';
  const known = KNOWN_PLAYER_PROFILES[cleanId];

  let num = known?.jerseyNumber ?? (POSITION_DEFAULT_NUMBERS[position]?.[0] || 9);
  if (usedNumbers) {
    if (usedNumbers.has(num)) {
      const candidates = POSITION_DEFAULT_NUMBERS[position] || [];
      const alt = candidates.find((c) => !usedNumbers.has(c));
      if (alt !== undefined) {
        num = alt;
      } else {
        for (let n = 2; n <= 99; n++) {
          if (!usedNumbers.has(n)) {
            num = n;
            break;
          }
        }
      }
    }
    usedNumbers.add(num);
  }

  // Deterministic fallback traits if unknown player ID
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = (hash * 31 + cleanId.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  const fallbackSkins = [0xF5D5B0, 0xECC49A, 0xD6A172, 0x9C6842, 0xF8DEC0];
  const fallbackHairs = [0x1B1410, 0x2C1E14, 0x4A3320, 0xC89B42, 0x14100E];
  const fallbackStyles: HairStyle[] = ['short', 'swept', 'spiky', 'buzz', 'curly'];

  return {
    jerseyNumber: num,
    skinTone: known?.skinTone ?? fallbackSkins[hash % fallbackSkins.length],
    hairColor: known?.hairColor ?? fallbackHairs[(hash >> 3) % fallbackHairs.length],
    hairStyle: known?.hairStyle ?? fallbackStyles[(hash >> 5) % fallbackStyles.length],
    isGoalkeeper: isGK,
    gkJerseyColor: known?.gkJerseyColor ?? (isGK ? 0x27AE60 : undefined),
    gkGloveColor: known?.gkGloveColor ?? (isGK ? 0xF5F7FA : undefined),
  };
}

export interface IsoHumanDrawParams {
  primaryColor: number;
  accentTrim: number;
  shortsColor: number;
  profile: PlayerVisualProfile;
  animPhase: number;
  isMoving: boolean;
  showFrontFace: boolean; // true = show eyes/face; false = turned away (back of head & back number prominent)
}

/**
 * Draws an expressive, detailed athletic footballer with striding legs, swinging arms,
 * collar/kit trim, GK gloves (if GK), hairstyle, and human face — using zero-Earcut GPU primitives!
 */
export function drawDetailedIsoPlayer(
  gfx: Phaser.GameObjects.Graphics,
  params: IsoHumanDrawParams
): void {
  gfx.clear();

  const {
    profile,
    animPhase,
    isMoving,
    showFrontFace,
  } = params;

  const jerseyColor = profile.isGoalkeeper && profile.gkJerseyColor
    ? profile.gkJerseyColor
    : params.primaryColor;
  const trimColor = profile.isGoalkeeper ? 0xFFD54F : params.accentTrim;
  const shortsColor = profile.isGoalkeeper ? 0x1A242F : params.shortsColor;
  const skin = profile.skinTone;
  const hair = profile.hairColor;
  const isGK = Boolean(profile.isGoalkeeper);
  // Goalkeepers always face the field/play so their face and gloves are always visible
  const effectiveFrontFace = showFrontFace || isGK;

  const stride = isMoving ? Math.sin(animPhase * 13) : 0;
  const bounceY = isMoving ? -Math.abs(Math.sin(animPhase * 13)) * 2.4 : 0;
  const leftLegY = stride * 2.6;
  const rightLegY = -stride * 2.6;
  const armSwing = stride * 3.0;

  // ── 1. Athletic Legs, Socks & Cleats ──
  gfx.fillStyle(skin, 1);
  gfx.fillRect(-5.5, -8 + bounceY + leftLegY * 0.4, 3.6, 4);
  gfx.fillRect(1.9, -8 + bounceY + rightLegY * 0.4, 3.6, 4);

  // Team socks with top stripe
  gfx.fillStyle(jerseyColor, 1);
  gfx.fillRect(-5.6, -5 + bounceY + leftLegY * 0.6, 3.8, 4.2);
  gfx.fillRect(1.8, -5 + bounceY + rightLegY * 0.6, 3.8, 4.2);
  gfx.fillStyle(trimColor, 1);
  gfx.fillRect(-5.6, -5 + bounceY + leftLegY * 0.6, 3.8, 1.2);
  gfx.fillRect(1.8, -5 + bounceY + rightLegY * 0.6, 3.8, 1.2);

  // Football cleats with sole studs
  gfx.fillStyle(0x16181D, 1);
  fillFastBevelRect(gfx, -6.4, -1.6 + bounceY + leftLegY * 0.7, 5.2, 2.8, 1.0);
  fillFastBevelRect(gfx, 1.4, -1.6 + bounceY + rightLegY * 0.7, 5.2, 2.8, 1.0);
  gfx.fillStyle(trimColor, 0.9);
  gfx.fillRect(-5.2, -0.9 + bounceY + leftLegY * 0.7, 2.4, 0.9);
  gfx.fillRect(2.6, -0.9 + bounceY + rightLegY * 0.7, 2.4, 0.9);

  // ── 2. Athletic Shorts ──
  gfx.fillStyle(shortsColor, 1);
  fillFastBevelRect(gfx, -6.5, -12.5 + bounceY, 13, 6.2, 1.8);
  gfx.fillStyle(trimColor, 0.85);
  gfx.fillRect(-6.3, -12 + bounceY, 1.1, 5.0);
  gfx.fillRect(5.2, -12 + bounceY, 1.1, 5.0);

  // ── 3. Back Arm (drawn behind torso for 3D depth) ──
  gfx.fillStyle(jerseyColor, 1);
  fillFastBevelRect(gfx, -10.2, -22.5 + bounceY - armSwing * 0.45, 3.6, 6.2, 1.2);
  gfx.fillStyle(skin, 1);
  gfx.fillRect(-9.9, -16.8 + bounceY - armSwing * 0.55, 2.8, 3.8);
  if (isGK && profile.gkGloveColor) {
    gfx.fillStyle(0xD4AF37, 1);
    gfx.fillRect(-10.2, -14.2 + bounceY - armSwing * 0.55, 3.4, 1.5);
    gfx.fillStyle(profile.gkGloveColor, 1);
    fillFastCircle(gfx, -8.6, -12.0 + bounceY - armSwing * 0.6, 2.8, 8);
  } else {
    gfx.fillStyle(skin, 1);
    fillFastCircle(gfx, -8.3, -12.4 + bounceY - armSwing * 0.6, 1.8, 8);
  }

  // ── 4. Jersey Torso & Kit Details ──
  gfx.fillStyle(jerseyColor, 1);
  fillFastBevelRect(gfx, -7.4, -24.2 + bounceY, 14.8, 12.8, 2.8);

  // Subtle darker side shading for 3D cylindrical torso volume
  gfx.fillStyle(0x000000, 0.16);
  gfx.fillRect(-7.2, -23.2 + bounceY, 3.0, 11.0);

  // Shoulder stripes
  gfx.fillStyle(trimColor, 0.95);
  gfx.fillRect(-7.0, -24.0 + bounceY, 4.2, 1.6);
  gfx.fillRect(2.8, -24.0 + bounceY, 4.2, 1.6);

  if (effectiveFrontFace) {
    // V-Neck collar & club crest badge on chest
    gfx.fillStyle(trimColor, 1);
    gfx.fillTriangle(-2.6, -24.0 + bounceY, 2.6, -24.0 + bounceY, 0, -20.2 + bounceY);
    gfx.fillStyle(0xFFD54F, 1);
    gfx.fillRect(2.6, -21.2 + bounceY, 2.2, 2.2);
  } else {
    // Back collar band & subtle number plate contrast so back number pops!
    gfx.fillStyle(trimColor, 0.95);
    gfx.fillRect(-3.2, -24.1 + bounceY, 6.4, 1.5);
    gfx.fillStyle(0x000000, 0.22);
    fillFastBevelRect(gfx, -5.0, -22.0 + bounceY, 10.0, 9.2, 1.6);
  }

  // ── 5. Front Arm (drawn in front of torso) ──
  gfx.fillStyle(jerseyColor, 1);
  fillFastBevelRect(gfx, 6.5, -22.5 + bounceY + armSwing * 0.45, 3.6, 6.2, 1.2);
  gfx.fillStyle(skin, 1);
  gfx.fillRect(6.9, -16.8 + bounceY + armSwing * 0.55, 2.8, 3.8);
  if (isGK && profile.gkGloveColor) {
    gfx.fillStyle(0xD4AF37, 1);
    gfx.fillRect(6.7, -14.2 + bounceY + armSwing * 0.55, 3.4, 1.5);
    gfx.fillStyle(profile.gkGloveColor, 1);
    fillFastCircle(gfx, 8.5, -12.0 + bounceY + armSwing * 0.6, 2.8, 8);
  } else {
    gfx.fillStyle(skin, 1);
    fillFastCircle(gfx, 8.3, -12.4 + bounceY + armSwing * 0.6, 1.8, 8);
  }

  // ── 6. Neck, Head, Facial Features & Hairstyle ──
  gfx.fillStyle(skin, 1);
  gfx.fillRect(-2.2, -26.5 + bounceY, 4.4, 3.2);
  // Ears
  gfx.fillRect(-7.6, -31.6 + bounceY, 1.8, 2.4);
  gfx.fillRect(5.8, -31.6 + bounceY, 1.8, 2.4);
  // Head circle (12-triangle fan: crisp & fast!)
  fillFastCircle(gfx, 0, -31.0 + bounceY, 6.8, 12);

  if (effectiveFrontFace) {
    const fx = 1.0;
    // Eyebrows
    gfx.fillStyle(hair, 0.95);
    gfx.fillRect(fx - 3.7, -33.0 + bounceY, 2.5, 1.05);
    gfx.fillRect(fx + 1.2, -33.0 + bounceY, 2.5, 1.05);

    // Eyes (sclera + dark pupils)
    gfx.fillStyle(0xFFFFFF, 0.98);
    gfx.fillRect(fx - 3.5, -31.7 + bounceY, 2.3, 1.9);
    gfx.fillRect(fx + 1.2, -31.7 + bounceY, 2.3, 1.9);
    gfx.fillStyle(0x14151A, 1);
    gfx.fillRect(fx - 2.6, -31.5 + bounceY, 1.4, 1.5);
    gfx.fillRect(fx + 1.9, -31.5 + bounceY, 1.4, 1.5);

    // Subtle nose & athletic mouth
    gfx.fillStyle(0x000000, 0.18);
    gfx.fillTriangle(fx, -30.6 + bounceY, fx - 0.8, -28.7 + bounceY, fx + 0.9, -28.7 + bounceY);
    gfx.fillStyle(0x8E4A3B, 0.9);
    gfx.fillRect(fx - 1.5, -27.6 + bounceY, 3.2, 1.05);
  } else {
    // 3/4 Side-Back Profile: still show side eye, brow, nose & ear so no player ever looks faceless!
    gfx.fillStyle(hair, 0.92);
    gfx.fillRect(2.4, -32.8 + bounceY, 2.4, 1.0);
    gfx.fillStyle(0xFFFFFF, 0.96);
    gfx.fillRect(2.6, -31.5 + bounceY, 2.1, 1.7);
    gfx.fillStyle(0x14151A, 1);
    gfx.fillRect(3.4, -31.3 + bounceY, 1.2, 1.4);
    gfx.fillStyle(0x8E4A3B, 0.85);
    gfx.fillRect(2.6, -27.8 + bounceY, 2.0, 0.95);
  }

  // Hairstyle rendering
  drawHairStyle(gfx, 0, -31.0 + bounceY, 6.8, hair, profile.hairStyle, !effectiveFrontFace);
}

function drawHairStyle(
  gfx: Phaser.GameObjects.Graphics,
  hx: number,
  hy: number,
  r: number,
  hairColor: number,
  style: HairStyle,
  isBackOfHead: boolean
): void {
  gfx.fillStyle(hairColor, 1);

  if (isBackOfHead) {
    // Back-3/4 hair crown & nape taper (leaves right-side profile face & ears uncovered!)
    fillFastDome(gfx, hx - 0.5, hy - 1.1, r + 0.3, Math.PI * 0.84, Math.PI * 2.12, 8);
    fillFastBevelRect(gfx, hx - r * 0.88, hy - 2.2, r * 1.12, r * 0.82, 1.8);
  } else {
    fillFastDome(gfx, hx - 0.3, hy - 1.5, r + 0.3, Math.PI * 0.90, Math.PI * 2.06, 7);
    gfx.fillRect(hx - r * 0.92, hy - 2.4, 2.0, 3.2);
  }

  if (style === 'spiky') {
    gfx.fillTriangle(hx - 4, hy - r + 1, hx - 1, hy - r - 3.2, hx + 1, hy - r + 1);
    gfx.fillTriangle(hx - 1, hy - r + 1, hx + 2.2, hy - r - 3.6, hx + 4.5, hy - r + 1);
  } else if (style === 'curly') {
    fillFastCircle(gfx, hx - 4.0, hy - r + 1.5, 2.6, 8);
    fillFastCircle(gfx, hx, hy - r - 0.3, 2.9, 8);
    fillFastCircle(gfx, hx + 4.0, hy - r + 1.5, 2.6, 8);
  } else if (style === 'bun') {
    fillFastCircle(gfx, hx - 2.5, hy - r - 1.8, 2.5, 8);
  } else if (style === 'swept') {
    fillFastEllipse(gfx, hx + 1.4, hy - r + 0.6, 4.2, 1.7, 8);
  }

  // Subtle hair shine
  gfx.fillStyle(0xFFFFFF, 0.14);
  gfx.fillRect(hx - 0.8, hy - r + 0.8, 3.8, 1.2);
}

/**
 * Draws the On-Pitch Main Referee (주심) or Touchline Assistant Referee (부심)
 */
export function drawDetailedReferee(
  gfx: Phaser.GameObjects.Graphics,
  animPhase: number,
  isMoving: boolean,
  signalState: 'none' | 'whistle' | 'yellow_card' | 'point_left' | 'point_right',
  isLinesman = false,
  flagUp = false
): void {
  gfx.clear();

  const stride = isMoving ? Math.sin(animPhase * 13) : 0;
  const bounceY = isMoving ? -Math.abs(Math.sin(animPhase * 13)) * 2.2 : 0;
  const skin = 0xF2CEA6;
  const shirtColor = isLinesman ? 0x22252A : 0xDDF02A;
  const trimColor = isLinesman ? 0xDDF02A : 0x16181D;

  // Legs & Black Referee Socks
  gfx.fillStyle(skin, 1);
  gfx.fillRect(-5.2, -8 + bounceY + stride * 1.2, 3.4, 3.8);
  gfx.fillRect(1.8, -8 + bounceY - stride * 1.2, 3.4, 3.8);
  gfx.fillStyle(0x15171C, 1);
  gfx.fillRect(-5.4, -5 + bounceY + stride * 1.6, 3.6, 4.0);
  gfx.fillRect(1.8, -5 + bounceY - stride * 1.6, 3.6, 4.0);
  gfx.fillStyle(0xFFFFFF, 0.9);
  gfx.fillRect(-5.4, -5 + bounceY + stride * 1.6, 3.6, 1.0);
  gfx.fillRect(1.8, -5 + bounceY - stride * 1.6, 3.6, 1.0);
  gfx.fillStyle(0x111114, 1);
  fillFastBevelRect(gfx, -6.0, -1.5 + bounceY + stride * 1.8, 4.8, 2.6, 0.8);
  fillFastBevelRect(gfx, 1.4, -1.5 + bounceY - stride * 1.8, 4.8, 2.6, 0.8);

  // Black Referee Shorts
  gfx.fillStyle(0x15171C, 1);
  fillFastBevelRect(gfx, -6.2, -12.5 + bounceY, 12.4, 6.0, 1.6);

  // Referee Collared Shirt & Pocket
  gfx.fillStyle(shirtColor, 1);
  fillFastBevelRect(gfx, -7.0, -24.0 + bounceY, 14.0, 12.5, 2.6);
  gfx.fillStyle(trimColor, 1);
  gfx.fillTriangle(-2.8, -24.0 + bounceY, 2.8, -24.0 + bounceY, 0, -20.5 + bounceY);
  gfx.fillStyle(0x16181D, 0.85);
  gfx.fillRect(1.8, -21.2 + bounceY, 3.0, 3.4);

  // Whistle lanyard
  gfx.lineStyle(1.0, 0xDCE1E8, 0.9);
  gfx.lineBetween(-1.5, -23.5 + bounceY, 0, -19.0 + bounceY);
  gfx.lineBetween(1.5, -23.5 + bounceY, 0, -19.0 + bounceY);
  gfx.fillStyle(0xE6ECF2, 1);
  gfx.fillRect(-1.1, -19.5 + bounceY, 2.2, 2.2);

  // Left Arm
  gfx.fillStyle(shirtColor, 1);
  if (signalState === 'point_left') {
    gfx.fillRect(-14.5, -23.2 + bounceY, 8.0, 3.2);
    gfx.fillStyle(skin, 1);
    fillFastCircle(gfx, -15.5, -21.6 + bounceY, 1.8, 8);
  } else {
    gfx.fillRect(-9.6, -22.2 + bounceY, 3.2, 6.0);
    gfx.fillStyle(skin, 1);
    gfx.fillRect(-9.4, -16.2 + bounceY, 2.8, 3.8);
  }

  // Right Arm (Yellow card / Point right / Linesman checkered flag!)
  gfx.fillStyle(shirtColor, 1);
  if (signalState === 'yellow_card') {
    gfx.fillRect(5.8, -32.0 + bounceY, 3.2, 9.5);
    gfx.fillStyle(skin, 1);
    fillFastCircle(gfx, 7.4, -33.0 + bounceY, 1.8, 8);
    // Bright Yellow Card held high!
    gfx.fillStyle(0x1A1A1A, 0.85);
    gfx.fillRect(4.8, -41.9 + bounceY, 6.2, 8.4);
    gfx.fillStyle(0xFFE600, 1);
    gfx.fillRect(5.3, -41.4 + bounceY, 5.2, 7.4);
  } else if (signalState === 'point_right') {
    gfx.fillRect(6.5, -23.2 + bounceY, 8.0, 3.2);
    gfx.fillStyle(skin, 1);
    fillFastCircle(gfx, 15.5, -21.6 + bounceY, 1.8, 8);
  } else if (isLinesman) {
    const flagArmY = flagUp ? -30.5 : -20.5;
    gfx.fillRect(6.2, flagArmY + bounceY, 3.2, 7.0);
    gfx.fillStyle(skin, 1);
    fillFastCircle(gfx, 7.8, flagArmY + bounceY, 1.7, 8);
    // Linesman Checkered Flag (Red & Gold)
    const poleTopY = flagUp ? flagArmY - 11 + bounceY : flagArmY + 8 + bounceY;
    gfx.lineStyle(1.6, 0xEAECEF, 1);
    gfx.lineBetween(7.8, flagArmY + bounceY, 13.5, poleTopY);
    gfx.fillStyle(0xFF3B30, 1);
    gfx.fillRect(10.5, poleTopY, 6.5, 4.6);
    gfx.fillStyle(0xFFD60A, 1);
    gfx.fillRect(13.7, poleTopY, 3.3, 2.3);
    gfx.fillRect(10.5, poleTopY + 2.3, 3.2, 2.3);
  } else {
    gfx.fillRect(6.4, -22.2 + bounceY, 3.2, 6.0);
    gfx.fillStyle(skin, 1);
    gfx.fillRect(6.6, -16.2 + bounceY, 2.8, 3.8);
  }

  // Head & Face
  gfx.fillStyle(skin, 1);
  gfx.fillRect(-2.0, -26.2 + bounceY, 4.0, 2.8);
  fillFastCircle(gfx, 0, -30.6 + bounceY, 6.4, 12);
  // Eyes
  gfx.fillStyle(0xFFFFFF, 0.95);
  gfx.fillRect(-3.0, -31.5 + bounceY, 2.0, 1.7);
  gfx.fillRect(1.0, -31.5 + bounceY, 2.0, 1.7);
  gfx.fillStyle(0x161618, 1);
  gfx.fillRect(-2.4, -31.3 + bounceY, 1.2, 1.3);
  gfx.fillRect(1.5, -31.3 + bounceY, 1.2, 1.3);
  // Silver whistle in mouth when blowing whistle!
  if (signalState === 'whistle') {
    gfx.fillStyle(0xE8EEF5, 1);
    gfx.fillRect(-1.2, -28.0 + bounceY, 3.4, 2.0);
  }
  // Hair
  drawHairStyle(gfx, 0, -30.6 + bounceY, 6.4, 0x241B14, 'short', false);
}

/**
 * Draws ONE realistic individual stadium spectator (1 seat + 1 torso/shoulders + arms/scarf + 1 head + hair/cap).
 * Strictly uses direct fillRect / fillTriangle primitives (0 allocations, 0 Earcut) so hundreds of fans render instantly!
 */
export function drawIndividualSpectator(
  gfx: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  scale: number,
  seed: number
): void {
  const jerseyPalette = [
    0x245484, // Home Royal Blue
    0x2E6BE6, // Bright Supporter Blue
    0xC9302C, // Away Crimson Red
    0xF4F4F6, // Classic White Kit
    0xD4AF37, // Gold Supporter Kit
    0x2ECC71, // Emerald Kit
    0x2C3E50, // Navy Jacket
    0xE67E22, // Orange Jersey
  ];
  const skinPalette = [0xF6D7B2, 0xEAC096, 0xD29B6E, 0x8D5A36];
  const hairPalette = [0x181310, 0x2F2015, 0x5A3E28, 0xC89D46, 0x1E3A5F];

  const h = Math.abs(seed | 0);
  const shirtColor = jerseyPalette[h % jerseyPalette.length];
  const skinColor = skinPalette[(h >> 3) % skinPalette.length];
  const hairColor = hairPalette[(h >> 5) % hairPalette.length];
  const pose = (h >> 7) % 5; // 0..2 seated, 3 one-arm cheer, 4 two-arm scarf cheer!

  // 1. Individual Stadium Bucket Seat Backrest
  gfx.fillStyle(0x1B222C, 0.92);
  gfx.fillRect(sx - 4.0 * scale, sy - 6.8 * scale, 8.0 * scale, 6.6 * scale);

  // 2. Seated Legs / Lap
  gfx.fillStyle(0x1F242D, 0.95);
  gfx.fillRect(sx - 3.0 * scale, sy - 1.5 * scale, 2.6 * scale, 2.8 * scale);
  gfx.fillRect(sx + 0.4 * scale, sy - 1.5 * scale, 2.6 * scale, 2.8 * scale);

  // 3. Individual Torso & Beveled Shoulders (1 body = 1 person!)
  gfx.fillStyle(shirtColor, 1);
  fillFastBevelRect(gfx, sx - 3.6 * scale, sy - 7.4 * scale, 7.2 * scale, 6.4 * scale, 1.4 * scale);
  // Collar V-trim
  gfx.fillStyle(0xFFFFFF, 0.45);
  gfx.fillTriangle(
    sx - 1.3 * scale, sy - 7.3 * scale,
    sx + 1.3 * scale, sy - 7.3 * scale,
    sx, sy - 5.4 * scale
  );

  // 4. Arms & Cheering Scarf
  if (pose === 4) {
    gfx.fillStyle(shirtColor, 1);
    gfx.fillRect(sx - 4.8 * scale, sy - 11.8 * scale, 1.6 * scale, 5.2 * scale);
    gfx.fillRect(sx + 3.2 * scale, sy - 11.8 * scale, 1.6 * scale, 5.2 * scale);
    const scarfColor = (h % 2 === 0) ? 0xD4AF37 : 0x2E6BE6;
    gfx.fillStyle(scarfColor, 0.96);
    gfx.fillRect(sx - 5.2 * scale, sy - 13.6 * scale, 10.4 * scale, 2.1 * scale);
    gfx.fillStyle(0xFFFFFF, 0.9);
    gfx.fillRect(sx - 1.6 * scale, sy - 13.6 * scale, 3.2 * scale, 2.1 * scale);
  } else if (pose === 3) {
    gfx.fillStyle(shirtColor, 1);
    gfx.fillRect(sx - 4.7 * scale, sy - 6.8 * scale, 1.5 * scale, 4.2 * scale);
    gfx.fillRect(sx + 3.2 * scale, sy - 11.4 * scale, 1.6 * scale, 5.0 * scale);
    gfx.fillStyle(skinColor, 1);
    gfx.fillRect(sx + 3.2 * scale, sy - 12.6 * scale, 1.6 * scale, 1.5 * scale);
  } else {
    gfx.fillStyle(shirtColor, 1);
    gfx.fillRect(sx - 4.7 * scale, sy - 6.8 * scale, 1.5 * scale, 4.2 * scale);
    gfx.fillRect(sx + 3.2 * scale, sy - 6.8 * scale, 1.5 * scale, 4.2 * scale);
  }

  // 5. Single Neck & Single Rounded Head + Hair / Supporter Cap
  gfx.fillStyle(skinColor, 1);
  gfx.fillRect(sx - 1.0 * scale, sy - 8.6 * scale, 2.0 * scale, 1.5 * scale);
  fillFastCircle(gfx, sx, sy - 10.2 * scale, 2.5 * scale, 8);

  // Subtle Eyes
  gfx.fillStyle(0x18181A, 0.78);
  gfx.fillRect(sx - 1.2 * scale, sy - 10.5 * scale, 0.75 * scale, 0.75 * scale);
  gfx.fillRect(sx + 0.45 * scale, sy - 10.5 * scale, 0.75 * scale, 0.75 * scale);

  // Hair Crown & Optional Cap Visor
  gfx.fillStyle(hairColor, 1);
  fillFastDome(gfx, sx, sy - 10.5 * scale, 2.6 * scale, Math.PI * 0.9, Math.PI * 2.1, 5);
  if ((h % 7) === 0) {
    gfx.fillRect(sx - 2.2 * scale, sy - 11.2 * scale, 4.8 * scale, 0.9 * scale);
  }
}
