/* ================================================================
   ISOMETRIC UTILITY MODULE
   Conversions, drawing helpers, baked GPU stadium texture, and depth-sorting.
   The game world is a 2D top-down pitch (1050 x 680).
   Rendering converts world coordinates to isometric screen coords.
   ================================================================ */

import Phaser from 'phaser';
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  PITCH_HALF_W,
  PITCH_HALF_H,
  ISO_COS30,
  ISO_SIN30,
  CENTER_CIRCLE_RADIUS,
  PENALTY_AREA_WIDTH,
  PENALTY_AREA_HEIGHT,
  PENALTY_AREA_Y_MIN,
  GOAL_AREA_WIDTH,
  GOAL_AREA_HEIGHT,
  GOAL_AREA_Y_MIN,
  GOAL_DEPTH,
  GOAL_Y_MIN,
  GOAL_Y_MAX,
  CORNER_ARC_RADIUS,
  PENALTY_SPOT_DISTANCE,
} from '../../infrastructure/config/game-config';
import { drawIndividualSpectator, fillFastCircle } from './PlayerAppearance';

// ── Coordinate Conversion ──

/**
 * Convert world (top-down 2D) coordinates to isometric screen coordinates.
 * We center the conversion so that the pitch center maps to screen (0,0).
 */
export function worldToIso(wx: number, wy: number): { x: number; y: number } {
  const cx = wx - PITCH_HALF_W;
  const cy = wy - PITCH_HALF_H;
  return {
    x: (cx - cy) * ISO_COS30,
    y: (cx + cy) * ISO_SIN30,
  };
}

/**
 * Convert isometric screen coordinates back to world (top-down 2D) coordinates.
 */
export function isoToWorld(ix: number, iy: number): { x: number; y: number } {
  const sum = iy / ISO_SIN30;
  const diff = ix / ISO_COS30;
  const cx = (sum + diff) / 2;
  const cy = (sum - diff) / 2;
  return {
    x: cx + PITCH_HALF_W,
    y: cy + PITCH_HALF_H,
  };
}

/**
 * Depth sort value from world Y coordinate.
 * Higher world-Y renders in front.
 */
export function depthFromWorld(wx: number, wy: number): number {
  return wy * 10 + wx * 0.01;
}

// ── Lightweight Native Canvas2D Adapter for Crisp Single-Quad Stadium Baking ──

function hexToRgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

class Canvas2DGraphicsAdapter {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  fillStyle(color: number, alpha = 1.0) {
    this.ctx.fillStyle = hexToRgba(color, alpha);
  }

  lineStyle(lineWidth: number, color: number, alpha = 1.0) {
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeStyle = hexToRgba(color, alpha);
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.ctx.fillRect(x, y, w, h);
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.closePath();
    this.ctx.fill();
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  beginPath() {
    this.ctx.beginPath();
  }

  moveTo(x: number, y: number) {
    this.ctx.moveTo(x, y);
  }

  lineTo(x: number, y: number) {
    this.ctx.lineTo(x, y);
  }

  closePath() {
    this.ctx.closePath();
  }

  fillPath() {
    this.ctx.fill();
  }

  strokePath() {
    this.ctx.stroke();
  }

  fillCircle(x: number, y: number, r: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  strokeCircle(x: number, y: number, r: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  arc(x: number, y: number, r: number, startAngle: number, endAngle: number, anticlockwise = false) {
    this.ctx.arc(x, y, r, startAngle, endAngle, anticlockwise);
  }
}

const BAKED_STADIUM_TEX_KEY = 'fc_superstar_baked_stadium_v3';
const STADIUM_LOGICAL_W = 3160;
const STADIUM_LOGICAL_H = 1880;

const BAKED_CITY_TEX_KEY = 'fc_superstar_baked_city_v1';
const CITY_LOGICAL_W = 3960;
const CITY_LOGICAL_H = 3160;

/**
 * Bakes both:
 * 1. The surrounding aerial stadium exterior & urban streetscape (plaza, 4-lane roads,
 *    crosswalks, sidewalks, cars & team bus, parking lot, fan park with fountain, and 3D buildings)
 * 2. The tiered World Cup Stadium itself (outer facade rim, grandstands, 430+ spectators,
 *    LED boards, jumbotron, striped turf, lines, and 3D goals)
 * ONCE onto hardware-antialiased Canvas textures (< 4096px GPU safe) for locked 60 FPS rendering!
 */
export function createBakedStadiumImage(scene: Phaser.Scene): Phaser.GameObjects.Image {
  if (!scene.textures.exists(BAKED_CITY_TEX_KEY)) {
    const cityCanvas = document.createElement('canvas');
    cityCanvas.width = CITY_LOGICAL_W;
    cityCanvas.height = CITY_LOGICAL_H;

    const cityCtx = cityCanvas.getContext('2d');
    if (cityCtx) {
      cityCtx.save();
      cityCtx.translate(CITY_LOGICAL_W * 0.5, CITY_LOGICAL_H * 0.5);
      const cityAdapter = new Canvas2DGraphicsAdapter(cityCtx) as unknown as Phaser.GameObjects.Graphics;
      drawAerialCityAndStadiumExterior(cityAdapter);
      cityCtx.restore();
    }

    scene.textures.addCanvas(BAKED_CITY_TEX_KEY, cityCanvas);
  }

  const cityImg = scene.add.image(0, 0, BAKED_CITY_TEX_KEY);
  cityImg.setDisplaySize(CITY_LOGICAL_W, CITY_LOGICAL_H);
  cityImg.setDepth(-1005);

  if (!scene.textures.exists(BAKED_STADIUM_TEX_KEY)) {
    const texScale = 1.28; // 4045 x 2406 (< 4096 WebGL universal limit, crisp & unclipped!)
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(STADIUM_LOGICAL_W * texScale);
    canvas.height = Math.round(STADIUM_LOGICAL_H * texScale);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.save();
      ctx.scale(texScale, texScale);
      ctx.translate(STADIUM_LOGICAL_W * 0.5, STADIUM_LOGICAL_H * 0.5);

      const adapter = new Canvas2DGraphicsAdapter(ctx) as unknown as Phaser.GameObjects.Graphics;
      drawIsoPitch(adapter);
      ctx.restore();
    }

    scene.textures.addCanvas(BAKED_STADIUM_TEX_KEY, canvas);
  }

  const stadiumImg = scene.add.image(0, 0, BAKED_STADIUM_TEX_KEY);
  stadiumImg.setDisplaySize(STADIUM_LOGICAL_W, STADIUM_LOGICAL_H);
  stadiumImg.setDepth(-1000);
  return stadiumImg;
}

// ── Drawing Helpers ──

function drawIsoLine(
  gfx: Phaser.GameObjects.Graphics,
  x1: number, y1: number,
  x2: number, y2: number
): void {
  const a = worldToIso(x1, y1);
  const b = worldToIso(x2, y2);
  gfx.lineBetween(a.x, a.y, b.x, b.y);
}

export function drawIsoRect(
  gfx: Phaser.GameObjects.Graphics,
  x: number, y: number,
  w: number, h: number,
  color: number,
  alpha: number = 1.0
): void {
  const tl = worldToIso(x, y);
  const tr = worldToIso(x + w, y);
  const br = worldToIso(x + w, y + h);
  const bl = worldToIso(x, y + h);

  gfx.fillStyle(color, alpha);
  gfx.beginPath();
  gfx.moveTo(tl.x, tl.y);
  gfx.lineTo(tr.x, tr.y);
  gfx.lineTo(br.x, br.y);
  gfx.lineTo(bl.x, bl.y);
  gfx.closePath();
  gfx.fillPath();
}

function strokeIsoRect(
  gfx: Phaser.GameObjects.Graphics,
  x: number, y: number,
  w: number, h: number,
  color: number,
  lineWidth: number = 2,
  alpha: number = 1.0
): void {
  const tl = worldToIso(x, y);
  const tr = worldToIso(x + w, y);
  const br = worldToIso(x + w, y + h);
  const bl = worldToIso(x, y + h);

  gfx.lineStyle(lineWidth, color, alpha);
  gfx.beginPath();
  gfx.moveTo(tl.x, tl.y);
  gfx.lineTo(tr.x, tr.y);
  gfx.lineTo(br.x, br.y);
  gfx.lineTo(bl.x, bl.y);
  gfx.closePath();
  gfx.strokePath();
}

function drawIsoCircle(
  gfx: Phaser.GameObjects.Graphics,
  centerX: number, centerY: number,
  radius: number,
  color: number,
  lineWidth: number = 2,
  segments: number = 48
): void {
  gfx.lineStyle(lineWidth, color, 1.0);
  gfx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const wx = centerX + Math.cos(angle) * radius;
    const wy = centerY + Math.sin(angle) * radius;
    const iso = worldToIso(wx, wy);
    if (i === 0) {
      gfx.moveTo(iso.x, iso.y);
    } else {
      gfx.lineTo(iso.x, iso.y);
    }
  }
  gfx.strokePath();
}

function drawIsoArc(
  gfx: Phaser.GameObjects.Graphics,
  centerX: number, centerY: number,
  radius: number,
  startAngle: number, endAngle: number,
  color: number,
  lineWidth: number = 2,
  segments: number = 16
): void {
  gfx.lineStyle(lineWidth, color, 1.0);
  gfx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + t * (endAngle - startAngle);
    const wx = centerX + Math.cos(angle) * radius;
    const wy = centerY + Math.sin(angle) * radius;
    const iso = worldToIso(wx, wy);
    if (i === 0) {
      gfx.moveTo(iso.x, iso.y);
    } else {
      gfx.lineTo(iso.x, iso.y);
    }
  }
  gfx.strokePath();
}

// ── Pitch & Stadium Grandstands Drawing ──

export interface PitchDrawConfig {
  surroundPadding?: number;
  ledBoardWidth?: number;
  crowdDepth?: number;
}

/**
 * Draws the complete World Cup Stadium:
 * - Multi-tiered 3D grandstand architecture
 * - Individual human spectators in stadium seats
 * - LED sponsor boards along all touchlines
 * - Striped pitch grass and white field markings
 * - 3D framed goal nets
 */
export function drawIsoPitch(
  gfx: Phaser.GameObjects.Graphics,
  config?: PitchDrawConfig
): Phaser.GameObjects.Graphics {
  const pad = config?.surroundPadding ?? 50;
  const ledW = config?.ledBoardWidth ?? 14;
  const crowdD = config?.crowdDepth ?? 150;

  // ── 0. Stadium Architectural Exterior Facade Rim & 4 Corner Floodlight Pylons ──
  drawStadiumExteriorRim(gfx, pad, crowdD);

  // ── 1. Stadium Grandstands Structure (Concrete Base) ──
  drawIsoRect(
    gfx,
    -pad - crowdD, -pad - crowdD,
    PITCH_WIDTH + (pad + crowdD) * 2, PITCH_HEIGHT + (pad + crowdD) * 2,
    0x2E2C28, 1.0
  );

  // ── 2. Tiered Stadium Stands & Crowds (Spectators in Rows) ──
  drawTieredCrowdGrandstands(gfx, pad, crowdD);

  // ── 3. Pitch Surround (Dark Grass / Sideline Warmup Area) ──
  drawIsoRect(
    gfx,
    -pad, -pad,
    PITCH_WIDTH + pad * 2, PITCH_HEIGHT + pad * 2,
    0x315C36, 1.0
  );

  // ── 4. Dynamic LED Sponsor Boards (Backlit with Neon Sponsor Accents) ──
  drawDynamicSponsorBoards(gfx, pad, ledW);

  // ── 4-2. Grand 3D Stadium Jumbotron Scoreboard (North Stand Center) ──
  drawStadiumScoreboard(gfx, pad, crowdD);

  // ── 5. Main Pitch Grass (Lush Green with Alternating Stripes) ──
  const stripeCount = 14;
  const stripeH = PITCH_HEIGHT / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const color = i % 2 === 0 ? 0x367A3F : 0x3E8B47;
    drawIsoRect(gfx, 0, i * stripeH, PITCH_WIDTH, stripeH, color, 1.0);
  }

  // ── 6. Pitch Markings (Crisp White Lines) ──
  const lineColor = 0xFFFFFF;
  const lineW = 2;

  // Touchlines
  strokeIsoRect(gfx, 0, 0, PITCH_WIDTH, PITCH_HEIGHT, lineColor, lineW);

  // Halfway line
  drawIsoLine(gfx, PITCH_HALF_W, 0, PITCH_HALF_W, PITCH_HEIGHT);

  // Center circle & center spot
  drawIsoCircle(gfx, PITCH_HALF_W, PITCH_HALF_H, CENTER_CIRCLE_RADIUS, lineColor, lineW);
  const centerIso = worldToIso(PITCH_HALF_W, PITCH_HALF_H);
  gfx.fillStyle(lineColor, 1.0);
  fillFastCircle(gfx, centerIso.x, centerIso.y, 3.5, 8);

  // Penalty areas
  strokeIsoRect(gfx, 0, PENALTY_AREA_Y_MIN, PENALTY_AREA_WIDTH, PENALTY_AREA_HEIGHT, lineColor, lineW);
  strokeIsoRect(gfx, 0, GOAL_AREA_Y_MIN, GOAL_AREA_WIDTH, GOAL_AREA_HEIGHT, lineColor, lineW);
  const lpSpot = worldToIso(PENALTY_SPOT_DISTANCE, PITCH_HALF_H);
  gfx.fillStyle(lineColor, 1.0);
  fillFastCircle(gfx, lpSpot.x, lpSpot.y, 3.5, 8);

  strokeIsoRect(gfx, PITCH_WIDTH - PENALTY_AREA_WIDTH, PENALTY_AREA_Y_MIN, PENALTY_AREA_WIDTH, PENALTY_AREA_HEIGHT, lineColor, lineW);
  strokeIsoRect(gfx, PITCH_WIDTH - GOAL_AREA_WIDTH, GOAL_AREA_Y_MIN, GOAL_AREA_WIDTH, GOAL_AREA_HEIGHT, lineColor, lineW);
  const rpSpot = worldToIso(PITCH_WIDTH - PENALTY_SPOT_DISTANCE, PITCH_HALF_H);
  gfx.fillStyle(lineColor, 1.0);
  fillFastCircle(gfx, rpSpot.x, rpSpot.y, 3.5, 8);

  // Corner arcs
  drawIsoArc(gfx, 0, 0, CORNER_ARC_RADIUS, 0, Math.PI / 2, lineColor, lineW);
  drawIsoArc(gfx, 0, PITCH_HEIGHT, CORNER_ARC_RADIUS, -Math.PI / 2, 0, lineColor, lineW);
  drawIsoArc(gfx, PITCH_WIDTH, 0, CORNER_ARC_RADIUS, Math.PI / 2, Math.PI, lineColor, lineW);
  drawIsoArc(gfx, PITCH_WIDTH, PITCH_HEIGHT, CORNER_ARC_RADIUS, Math.PI, Math.PI * 1.5, lineColor, lineW);

  // ── 7. 3D Goal Posts & Net Meshes ──
  draw3DGoal(gfx, 0, true);
  draw3DGoal(gfx, PITCH_WIDTH, false);

  return gfx;
}

/**
 * Draws tiered stadium grandstands populated with individual human spectators
 * (1 stadium seat + 1 torso/shoulders + cheering arms/scarves + 1 head/hair per fan)
 */
function drawTieredCrowdGrandstands(gfx: Phaser.GameObjects.Graphics, pad: number, crowdD: number) {
  const northTiers = 4;
  const tierDepth = crowdD / northTiers;

  // ── North Grandstand (Top side) ──
  for (let t = 0; t < northTiers; t++) {
    const tierY = -pad - crowdD + t * tierDepth;
    const tierColor = t % 2 === 0 ? 0x22252E : 0x2D313C;
    drawIsoRect(gfx, -pad - crowdD, tierY, PITCH_WIDTH + (pad + crowdD) * 2, tierDepth, tierColor, 1.0);
    strokeIsoRect(gfx, -pad - crowdD, tierY, PITCH_WIDTH + (pad + crowdD) * 2, tierDepth, 0x3F4554, 1.0, 0.55);

    const rowOffset = (t % 2) * 14;
    for (let x = -pad - crowdD + 28 + rowOffset; x < PITCH_WIDTH + pad + crowdD - 28; x += 34) {
      if (Math.abs(((x + 400) % 340) - 170) < 16) {
        const stepIso = worldToIso(x, tierY + tierDepth * 0.5);
        gfx.fillStyle(0xD4AF37, 0.45);
        gfx.fillRect(stepIso.x - 4, stepIso.y - 2, 8, 3);
        continue;
      }
      const fanIso = worldToIso(x, tierY + tierDepth * 0.55);
      const seed = Math.floor(x * 17 + t * 53 + 11);
      drawIndividualSpectator(gfx, fanIso.x, fanIso.y, 1.05, seed);
    }
  }

  // ── South Grandstand (Bottom side) ──
  for (let t = 0; t < northTiers; t++) {
    const tierY = PITCH_HEIGHT + pad + t * tierDepth;
    const tierColor = t % 2 === 0 ? 0x22252E : 0x2D313C;
    drawIsoRect(gfx, -pad - crowdD, tierY, PITCH_WIDTH + (pad + crowdD) * 2, tierDepth, tierColor, 1.0);
    strokeIsoRect(gfx, -pad - crowdD, tierY, PITCH_WIDTH + (pad + crowdD) * 2, tierDepth, 0x3F4554, 1.0, 0.55);

    const rowOffset = ((t + 1) % 2) * 14;
    for (let x = -pad - crowdD + 28 + rowOffset; x < PITCH_WIDTH + pad + crowdD - 28; x += 34) {
      if (Math.abs(((x + 400) % 340) - 170) < 16) continue;
      const fanIso = worldToIso(x, tierY + tierDepth * 0.55);
      const seed = Math.floor(x * 23 + t * 41 + 97);
      drawIndividualSpectator(gfx, fanIso.x, fanIso.y, 1.05, seed);
    }
  }

  // ── West & East Behind-Goal Grandstands ──
  const endTiers = 3;
  const endTierW = crowdD / endTiers;

  // West (Behind Left Goal)
  for (let t = 0; t < endTiers; t++) {
    const tierX = -pad - crowdD + t * endTierW;
    const tierColor = t % 2 === 0 ? 0x20232B : 0x2B2F3A;
    drawIsoRect(gfx, tierX, -pad, endTierW, PITCH_HEIGHT + pad * 2, tierColor, 1.0);

    const rowOffset = (t % 2) * 13;
    for (let y = -pad + 20 + rowOffset; y < PITCH_HEIGHT + pad - 20; y += 32) {
      if (Math.abs(y - PITCH_HALF_H) < 18) continue;
      const fanIso = worldToIso(tierX + endTierW * 0.5, y);
      const seed = Math.floor(y * 19 + t * 67 + 203);
      drawIndividualSpectator(gfx, fanIso.x, fanIso.y, 1.02, seed);
    }
  }

  // East (Behind Right Goal)
  for (let t = 0; t < endTiers; t++) {
    const tierX = PITCH_WIDTH + pad + t * endTierW;
    const tierColor = t % 2 === 0 ? 0x20232B : 0x2B2F3A;
    drawIsoRect(gfx, tierX, -pad, endTierW, PITCH_HEIGHT + pad * 2, tierColor, 1.0);

    const rowOffset = ((t + 1) % 2) * 13;
    for (let y = -pad + 20 + rowOffset; y < PITCH_HEIGHT + pad - 20; y += 32) {
      if (Math.abs(y - PITCH_HALF_H) < 18) continue;
      const fanIso = worldToIso(tierX + endTierW * 0.5, y);
      const seed = Math.floor(y * 29 + t * 37 + 509);
      drawIndividualSpectator(gfx, fanIso.x, fanIso.y, 1.02, seed);
    }
  }
}

/**
 * Draws high-tech dynamic LED sponsor ribbon boards with glowing brand panels along touchlines
 */
function drawDynamicSponsorBoards(gfx: Phaser.GameObjects.Graphics, pad: number, ledW: number) {
  const boardCasing = 0x141416;
  const boardFace = 0x1E2024;
  const borderLight = 0xD4AF37;

  // Top Touchline LED Board Slot
  drawIsoRect(gfx, -pad, -pad - ledW, PITCH_WIDTH + pad * 2, ledW, boardCasing, 1.0);
  drawIsoRect(gfx, -pad + 2, -pad - ledW + 2, PITCH_WIDTH + pad * 2 - 4, ledW - 4, boardFace, 1.0);
  strokeIsoRect(gfx, -pad + 2, -pad - ledW + 2, PITCH_WIDTH + pad * 2 - 4, ledW - 4, borderLight, 1.5, 0.85);

  const blockW = 120;
  for (let x = -pad + 15; x < PITCH_WIDTH + pad - blockW; x += blockW + 30) {
    const isGold = (Math.floor(x) % 2 === 0);
    const badgeColor = isGold ? 0xB89B68 : 0x2A629A;
    drawIsoRect(gfx, x, -pad - ledW + 4, blockW, ledW - 8, badgeColor, 0.9);
    drawIsoRect(gfx, x + 4, -pad - ledW + 6, blockW - 8, 2, 0xFFFFFF, 0.8);
  }

  // Bottom Touchline LED Board Slot (Fixed missing ledW - 4 height argument!)
  drawIsoRect(gfx, -pad, PITCH_HEIGHT + pad, PITCH_WIDTH + pad * 2, ledW, boardCasing, 1.0);
  drawIsoRect(gfx, -pad + 2, PITCH_HEIGHT + pad + 2, PITCH_WIDTH + pad * 2 - 4, ledW - 4, boardFace, 1.0);
  strokeIsoRect(gfx, -pad + 2, PITCH_HEIGHT + pad + 2, PITCH_WIDTH + pad * 2 - 4, ledW - 4, borderLight, 1.5, 0.85);

  for (let x = -pad + 25; x < PITCH_WIDTH + pad - blockW; x += blockW + 35) {
    const badgeColor = (Math.floor(x) % 3 === 0) ? 0xC0392B : 0x27AE60;
    drawIsoRect(gfx, x, PITCH_HEIGHT + pad + 4, blockW, ledW - 8, badgeColor, 0.9);
    drawIsoRect(gfx, x + 4, PITCH_HEIGHT + pad + 6, blockW - 8, 2, 0xFFFFFF, 0.8);
  }

  // Left Behind-Goal LED Board Slot
  drawIsoRect(gfx, -pad - ledW, -pad, ledW, PITCH_HEIGHT + pad * 2, boardCasing, 1.0);
  drawIsoRect(gfx, -pad - ledW + 2, -pad + 2, ledW - 4, PITCH_HEIGHT + pad * 2 - 4, boardFace, 1.0);
  strokeIsoRect(gfx, -pad - ledW + 2, -pad + 2, ledW - 4, PITCH_HEIGHT + pad * 2 - 4, borderLight, 1.5, 0.85);

  // Right Behind-Goal LED Board Slot
  drawIsoRect(gfx, PITCH_WIDTH + pad, -pad, ledW, PITCH_HEIGHT + pad * 2, boardCasing, 1.0);
  drawIsoRect(gfx, PITCH_WIDTH + pad + 2, -pad + 2, ledW - 4, PITCH_HEIGHT + pad * 2 - 4, boardFace, 1.0);
  strokeIsoRect(gfx, PITCH_WIDTH + pad + 2, -pad + 2, ledW - 4, PITCH_HEIGHT + pad * 2 - 4, borderLight, 1.5, 0.85);
}

/**
 * Draws the Grand 3D Stadium Jumbotron Electronic Scoreboard above the North Grandstand
 */
function drawStadiumScoreboard(gfx: Phaser.GameObjects.Graphics, pad: number, crowdD: number) {
  const boardCenterX = PITCH_HALF_W;
  const boardY = -pad - crowdD - 20;
  const boardW = 280;
  const boardH = 75;
  const leftX = boardCenterX - boardW / 2;

  const colW = 12;
  const colColor = 0x1E1E22;
  drawIsoRect(gfx, leftX + 25, boardY, colW, 40, colColor, 1.0);
  drawIsoRect(gfx, leftX + boardW - 37, boardY, colW, 40, colColor, 1.0);

  drawIsoRect(gfx, leftX, boardY, boardW, boardH, 0x111114, 1.0);
  strokeIsoRect(gfx, leftX, boardY, boardW, boardH, 0xB89B68, 2.5, 1.0);

  drawIsoRect(gfx, leftX + 6, boardY + 6, boardW - 12, boardH - 12, 0x0A0B0E, 0.98);

  drawIsoRect(gfx, leftX + 16, boardY + 10, boardW - 32, 16, 0x1F2430, 0.95);
  strokeIsoRect(gfx, leftX + 16, boardY + 10, boardW - 32, 16, 0x3A506B, 1.0, 0.8);

  const windowW = (boardW - 60) / 2;
  drawIsoRect(gfx, leftX + 16, boardY + 32, windowW, boardH - 42, 0x1A2A3A, 0.9);
  strokeIsoRect(gfx, leftX + 16, boardY + 32, windowW, boardH - 42, 0x4A90E2, 1.5, 0.9);

  drawIsoRect(gfx, leftX + 44 + windowW, boardY + 32, windowW, boardH - 42, 0x3A1A1A, 0.9);
  strokeIsoRect(gfx, leftX + 44 + windowW, boardY + 32, windowW, boardH - 42, 0xE74C3C, 1.5, 0.9);

  const isoTopCenter = worldToIso(boardCenterX, boardY);
  gfx.fillStyle(0xD4AF37, 1);
  fillFastCircle(gfx, isoTopCenter.x, isoTopCenter.y - 12, 5, 12);
  gfx.lineStyle(1.5, 0xFFFFFF, 0.9);
  gfx.strokeCircle(isoTopCenter.x, isoTopCenter.y - 12, 7);
}

/**
 * Draws a 3D goal frame with realistic net mesh and depth
 */
function draw3DGoal(
  gfx: Phaser.GameObjects.Graphics,
  goalX: number,
  isLeft: boolean
): void {
  const netDepth = isLeft ? -GOAL_DEPTH : GOAL_DEPTH;
  const postColor = 0xF5F5F5;
  const netLineColor = 0xCCCCCC;

  const tl = worldToIso(goalX, GOAL_Y_MIN);
  const tr = worldToIso(goalX + netDepth, GOAL_Y_MIN);
  const br = worldToIso(goalX + netDepth, GOAL_Y_MAX);
  const bl = worldToIso(goalX, GOAL_Y_MAX);

  gfx.fillStyle(0xFFFFFF, 0.22);
  gfx.beginPath();
  gfx.moveTo(tl.x, tl.y);
  gfx.lineTo(tr.x, tr.y);
  gfx.lineTo(br.x, br.y);
  gfx.lineTo(bl.x, bl.y);
  gfx.closePath();
  gfx.fillPath();

  gfx.lineStyle(1, netLineColor, 0.4);
  const gridSteps = 6;
  for (let i = 1; i < gridSteps; i++) {
    const ratio = i / gridSteps;
    const yTop = Phaser.Math.Linear(tl.y, tr.y, ratio);
    const xTop = Phaser.Math.Linear(tl.x, tr.x, ratio);
    const yBot = Phaser.Math.Linear(bl.y, br.y, ratio);
    const xBot = Phaser.Math.Linear(bl.x, br.x, ratio);
    gfx.lineBetween(xTop, yTop, xBot, yBot);
  }

  gfx.lineStyle(4, postColor, 1.0);
  gfx.lineBetween(tl.x, tl.y, tr.x, tr.y);
  gfx.lineBetween(bl.x, bl.y, br.x, br.y);
  gfx.lineBetween(tl.x, tl.y, bl.x, bl.y);
  gfx.lineStyle(2, postColor, 0.7);
  gfx.lineBetween(tr.x, tr.y, br.x, br.y);
}

// ── Goal Position Getters ──

export interface GoalPosition {
  x: number;
  centerY: number;
  yMin: number;
  yMax: number;
}

export function getGoalPositions(): { leftGoal: GoalPosition; rightGoal: GoalPosition } {
  return {
    leftGoal: {
      x: 0,
      centerY: PITCH_HALF_H,
      yMin: GOAL_Y_MIN,
      yMax: GOAL_Y_MAX,
    },
    rightGoal: {
      x: PITCH_WIDTH,
      centerY: PITCH_HALF_H,
      yMin: GOAL_Y_MIN,
      yMax: GOAL_Y_MAX,
    },
  };
}

// ================================================================
// AERIAL STADIUM EXTERIOR SHELL & SURROUNDING CITY STREETSCAPE
// ================================================================

/**
 * Draws the outer architectural concrete/metallic facade ring and 4 corner floodlight towers
 * around the stadium roof rim.
 */
function drawStadiumExteriorRim(gfx: Phaser.GameObjects.Graphics, pad: number, crowdD: number): void {
  const outerRim = 24;
  const minX = -pad - crowdD - outerRim;
  const minY = -pad - crowdD - outerRim;
  const fullW = PITCH_WIDTH + (pad + crowdD + outerRim) * 2;
  const fullH = PITCH_HEIGHT + (pad + crowdD + outerRim) * 2;

  // Outer sleek roof rim + metallic edge + gold architectural stripe
  drawIsoRect(gfx, minX, minY, fullW, fullH, 0xCFCBC2, 1.0);
  strokeIsoRect(gfx, minX, minY, fullW, fullH, 0x7A776E, 2.5, 0.95);
  strokeIsoRect(gfx, minX + 7, minY + 7, fullW - 14, fullH - 14, 0xB89B68, 1.8, 0.85);

  // Radial roof rib ribs around the stadium perimeter
  gfx.lineStyle(1.4, 0x9E9A90, 0.72);
  for (let x = minX + 55; x < minX + fullW - 35; x += 110) {
    drawIsoLine(gfx, x, minY + 2, x, minY + outerRim - 2);
    drawIsoLine(gfx, x, minY + fullH - outerRim + 2, x, minY + fullH - 2);
  }
  for (let y = minY + 55; y < minY + fullH - 35; y += 110) {
    drawIsoLine(gfx, minX + 2, y, minX + outerRim - 2, y);
    drawIsoLine(gfx, minX + fullW - outerRim + 2, y, minX + fullW - 2, y);
  }

  // 4 Corner Floodlight Tower Pylons
  const corners: [number, number][] = [
    [-218, -218],
    [PITCH_WIDTH + 218, -218],
    [-218, PITCH_HEIGHT + 218],
    [PITCH_WIDTH + 218, PITCH_HEIGHT + 218],
  ];
  for (const [cx, cy] of corners) {
    const p = worldToIso(cx, cy);
    // Soft aerial light bloom
    gfx.fillStyle(0xFFF6D6, 0.14);
    fillFastCircle(gfx, p.x, p.y - 4, 24, 12);
    // Pylon base & steel truss head
    gfx.fillStyle(0x262A34, 0.96);
    fillFastCircle(gfx, p.x, p.y, 10, 12);
    gfx.fillStyle(0xE6E4DC, 1);
    fillFastCircle(gfx, p.x, p.y - 4, 6.2, 12);
    gfx.lineStyle(1.6, 0xD4AF37, 0.9);
    gfx.strokeCircle(p.x, p.y - 4, 7.2);
  }
}

/**
 * Draws a flat top-down aerial 3D-extruded city building in isometric world space.
 */
function drawIsoBuilding3D(
  gfx: Phaser.GameObjects.Graphics,
  wx: number,
  wy: number,
  w: number,
  d: number,
  heightPx: number,
  roofColor: number,
  wallLeftColor: number,
  wallRightColor: number
): void {
  const tl = worldToIso(wx, wy);
  const tr = worldToIso(wx + w, wy);
  const br = worldToIso(wx + w, wy + d);
  const bl = worldToIso(wx, wy + d);

  // Soft South-East directional ground cast shadow
  const sx = heightPx * 0.45;
  const sy = heightPx * 0.25;
  gfx.fillStyle(0x111714, 0.30);
  gfx.beginPath();
  gfx.moveTo(tr.x, tr.y);
  gfx.lineTo(tr.x + sx, tr.y + sy);
  gfx.lineTo(br.x + sx, br.y + sy);
  gfx.lineTo(bl.x + sx, bl.y + sy);
  gfx.lineTo(bl.x, bl.y);
  gfx.lineTo(br.x, br.y);
  gfx.closePath();
  gfx.fillPath();

  // Left-front visible wall (bl -> br)
  gfx.fillStyle(wallLeftColor, 1);
  gfx.beginPath();
  gfx.moveTo(bl.x, bl.y);
  gfx.lineTo(br.x, br.y);
  gfx.lineTo(br.x, br.y - heightPx);
  gfx.lineTo(bl.x, bl.y - heightPx);
  gfx.closePath();
  gfx.fillPath();

  // Right-front visible wall (br -> tr)
  gfx.fillStyle(wallRightColor, 1);
  gfx.beginPath();
  gfx.moveTo(br.x, br.y);
  gfx.lineTo(tr.x, tr.y);
  gfx.lineTo(tr.x, tr.y - heightPx);
  gfx.lineTo(br.x, br.y - heightPx);
  gfx.closePath();
  gfx.fillPath();

  // Subtle horizontal floor bands on walls
  const floors = Math.max(1, Math.min(4, Math.floor(heightPx / 18)));
  gfx.lineStyle(1, 0x1A2029, 0.22);
  for (let f = 1; f <= floors; f++) {
    const dy = (f / (floors + 1)) * heightPx;
    gfx.lineBetween(bl.x, bl.y - dy, br.x, br.y - dy);
    gfx.lineBetween(br.x, br.y - dy, tr.x, tr.y - dy);
  }

  // Rooftop plane shifted upward by heightPx
  gfx.fillStyle(roofColor, 1);
  gfx.beginPath();
  gfx.moveTo(tl.x, tl.y - heightPx);
  gfx.lineTo(tr.x, tr.y - heightPx);
  gfx.lineTo(br.x, br.y - heightPx);
  gfx.lineTo(bl.x, bl.y - heightPx);
  gfx.closePath();
  gfx.fillPath();

  // Crisp parapet rim & interior roof terrace inset
  gfx.lineStyle(1.6, 0x22262E, 0.42);
  gfx.beginPath();
  gfx.moveTo(tl.x, tl.y - heightPx);
  gfx.lineTo(tr.x, tr.y - heightPx);
  gfx.lineTo(br.x, br.y - heightPx);
  gfx.lineTo(bl.x, bl.y - heightPx);
  gfx.closePath();
  gfx.strokePath();

  // Rooftop HVAC / skylight inset detail
  const inset = 0.22;
  const rtl = worldToIso(wx + w * inset, wy + d * inset);
  const rtr = worldToIso(wx + w * (1 - inset), wy + d * inset);
  const rbr = worldToIso(wx + w * (1 - inset), wy + d * (1 - inset));
  const rbl = worldToIso(wx + w * inset, wy + d * (1 - inset));
  gfx.fillStyle(0x161B22, 0.14);
  gfx.beginPath();
  gfx.moveTo(rtl.x, rtl.y - heightPx);
  gfx.lineTo(rtr.x, rtr.y - heightPx);
  gfx.lineTo(rbr.x, rbr.y - heightPx);
  gfx.lineTo(rbl.x, rbl.y - heightPx);
  gfx.closePath();
  gfx.fillPath();
}

/**
 * Draws an aerial street/park tree with ground shadow and layered sunlit foliage.
 */
function drawIsoTree(gfx: Phaser.GameObjects.Graphics, wx: number, wy: number, radius: number, seed: number): void {
  const p = worldToIso(wx, wy);
  const scaleVar = 0.9 + ((Math.abs(seed) % 5) * 0.05);
  const r = radius * scaleVar;

  // Offset ground shadow
  gfx.fillStyle(0x101712, 0.30);
  fillFastCircle(gfx, p.x + r * 0.45, p.y + r * 0.28, r * 0.96, 8);

  // Dark lower canopy
  gfx.fillStyle(0x214828, 1);
  fillFastCircle(gfx, p.x, p.y - r * 0.25, r, 12);

  // Mid emerald foliage
  gfx.fillStyle(seed % 2 === 0 ? 0x336C3B : 0x397542, 1);
  fillFastCircle(gfx, p.x - r * 0.10, p.y - r * 0.38, r * 0.80, 12);

  // Warm sunlit upper-left crown
  gfx.fillStyle(0x4E8E52, 0.92);
  fillFastCircle(gfx, p.x - r * 0.24, p.y - r * 0.50, r * 0.52, 8);
}

/**
 * Draws an aerial car or team bus aligned along either X or Y street lanes.
 */
function drawIsoVehicle(
  gfx: Phaser.GameObjects.Graphics,
  wx: number,
  wy: number,
  length: number,
  width: number,
  heading: 'x' | 'y',
  dirSign: 1 | -1,
  bodyColor: number,
  isBus: boolean = false
): void {
  const vx = heading === 'x' ? length : width;
  const vy = heading === 'y' ? length : width;
  const x0 = wx - vx * 0.5;
  const y0 = wy - vy * 0.5;

  // Ground shadow
  drawIsoRect(gfx, x0 + 3, y0 + 4, vx, vy, 0x0F1317, 0.42);

  // Lower vehicle chassis
  drawIsoRect(gfx, x0, y0, vx, vy, bodyColor, 1.0);
  strokeIsoRect(gfx, x0, y0, vx, vy, 0x161920, 1.2, 0.85);

  // Windshield & cabin roof shifted slightly up in screen Y
  const cabinMarginFront = isBus ? 0.14 : 0.24;
  const cabinMarginSide = 0.14;
  const cX = heading === 'x' ? x0 + vx * cabinMarginFront : x0 + vx * cabinMarginSide;
  const cY = heading === 'y' ? y0 + vy * cabinMarginFront : y0 + vy * cabinMarginSide;
  const cW = heading === 'x' ? vx * (1 - cabinMarginFront * 2) : vx * (1 - cabinMarginSide * 2);
  const cH = heading === 'y' ? vy * (1 - cabinMarginFront * 2) : vy * (1 - cabinMarginSide * 2);

  drawIsoRect(gfx, cX - 2, cY - 2, cW, cH, 0x89C4E8, 0.92);
  drawIsoRect(
    gfx,
    cX - 2 + (heading === 'x' ? cW * 0.18 : 2),
    cY - 2 + (heading === 'y' ? cH * 0.18 : 2),
    heading === 'x' ? cW * 0.64 : cW - 4,
    heading === 'y' ? cH * 0.64 : cH - 4,
    isBus ? 0xD4AF37 : bodyColor,
    0.96
  );

  // Subtle headlights & red taillights
  const frontPos = heading === 'x'
    ? worldToIso(wx + dirSign * (vx * 0.48), wy)
    : worldToIso(wx, wy + dirSign * (vy * 0.48));
  const rearPos = heading === 'x'
    ? worldToIso(wx - dirSign * (vx * 0.48), wy)
    : worldToIso(wx, wy - dirSign * (vy * 0.48));

  gfx.fillStyle(0xFFF5C8, 0.9);
  fillFastCircle(gfx, frontPos.x, frontPos.y - 1, 2.2, 8);
  gfx.fillStyle(0xE53935, 0.85);
  fillFastCircle(gfx, rearPos.x, rearPos.y - 1, 2.0, 8);
}

/**
 * Draws the stadium perimeter promenade, ring avenues, crosswalks, sidewalks,
 * parking lot, fan park with fountain, cars, team bus, trees, streetlights, and city buildings.
 */
function drawAerialCityAndStadiumExterior(gfx: Phaser.GameObjects.Graphics): void {
  // ── 1. Base Urban Park / District Ground ──
  gfx.fillStyle(0x27382B, 1);
  gfx.fillRect(-CITY_LOGICAL_W * 0.5, -CITY_LOGICAL_H * 0.5, CITY_LOGICAL_W, CITY_LOGICAL_H);

  // Subtle alternating manicured outer urban district lawn quads
  for (let gx = -1500; gx < 3100; gx += 480) {
    for (let gy = -1400; gy < 2400; gy += 480) {
      if ((Math.floor(gx / 480) + Math.floor(gy / 480)) % 2 === 0) {
        drawIsoRect(gfx, gx, gy, 480, 480, 0x2B3F30, 0.65);
      }
    }
  }

  // ── 2. Outer Sidewalk Borders + 4-Lane Ring Avenues ──
  const aveW = 150;
  const sideW = 52;
  const nRoadY = -610; // [-610 .. -460]
  const sRoadY = 1460; // [1460 .. 1610]
  const wRoadX = -610; // [-610 .. -460]
  const eRoadX = 2060; // [2060 .. 2210]

  // Outer sidewalk blocks flanking exterior roads
  drawIsoRect(gfx, -1650, nRoadY - sideW, 4900, sideW, 0x9E9B92, 1);
  drawIsoRect(gfx, -1650, sRoadY + aveW, 4900, sideW, 0x9E9B92, 1);
  drawIsoRect(gfx, wRoadX - sideW, -1550, sideW, 4100, 0x9E9B92, 1);
  drawIsoRect(gfx, eRoadX + aveW, -1550, sideW, 4100, 0x9E9B92, 1);

  // Inner continuous stadium block sidewalk
  drawIsoRect(gfx, -460, -460, 2520, 1920, 0xA8A49B, 1);
  strokeIsoRect(gfx, -460, -460, 2520, 1920, 0x6E6C66, 2.2, 0.9);

  // Asphalt road corridors (4 avenues around the stadium)
  drawIsoRect(gfx, -1650, nRoadY, 4900, aveW, 0x343942, 1);
  drawIsoRect(gfx, -1650, sRoadY, 4900, aveW, 0x343942, 1);
  drawIsoRect(gfx, wRoadX, -1550, aveW, 4100, 0x343942, 1);
  drawIsoRect(gfx, eRoadX, -1550, aveW, 4100, 0x343942, 1);

  // Subtle asphalt seam & curb lines
  strokeIsoRect(gfx, -1650, nRoadY, 4900, aveW, 0x5A606B, 1.5, 0.75);
  strokeIsoRect(gfx, -1650, sRoadY, 4900, aveW, 0x5A606B, 1.5, 0.75);
  strokeIsoRect(gfx, wRoadX, -1550, aveW, 4100, 0x5A606B, 1.5, 0.75);
  strokeIsoRect(gfx, eRoadX, -1550, aveW, 4100, 0x5A606B, 1.5, 0.75);

  // Helper to draw road lane markings avoiding intersections
  const xSegments: [number, number][] = [
    [-1600, wRoadX - 18],
    [wRoadX + aveW + 18, eRoadX - 18],
    [eRoadX + aveW + 18, 3200],
  ];
  const ySegments: [number, number][] = [
    [-1500, nRoadY - 18],
    [nRoadY + aveW + 18, sRoadY - 18],
    [sRoadY + aveW + 18, 2500],
  ];

  // Double yellow center lines + dashed white lane dividers on horizontal avenues
  for (const ry of [nRoadY, sRoadY]) {
    const midY = ry + aveW * 0.5;
    for (const [xStart, xEnd] of xSegments) {
      gfx.lineStyle(1.8, 0xD8A83E, 0.92);
      drawIsoLine(gfx, xStart, midY - 3, xEnd, midY - 3);
      drawIsoLine(gfx, xStart, midY + 3, xEnd, midY + 3);

      gfx.lineStyle(1.5, 0xE4E7EC, 0.62);
      for (let x = xStart + 25; x < xEnd - 35; x += 68) {
        drawIsoLine(gfx, x, midY - 38, x + 30, midY - 38);
        drawIsoLine(gfx, x, midY + 38, x + 30, midY + 38);
      }
    }
  }

  // Double yellow center lines + dashed white lane dividers on vertical avenues
  for (const rx of [wRoadX, eRoadX]) {
    const midX = rx + aveW * 0.5;
    for (const [yStart, yEnd] of ySegments) {
      gfx.lineStyle(1.8, 0xD8A83E, 0.92);
      drawIsoLine(gfx, midX - 3, yStart, midX - 3, yEnd);
      drawIsoLine(gfx, midX + 3, yStart, midX + 3, yEnd);

      gfx.lineStyle(1.5, 0xE4E7EC, 0.62);
      for (let y = yStart + 25; y < yEnd - 35; y += 68) {
        drawIsoLine(gfx, midX - 38, y, midX - 38, y + 30);
        drawIsoLine(gfx, midX + 38, y, midX + 38, y + 30);
      }
    }
  }

  // Zebra Crosswalks at all 4 intersections & all 4 Stadium Main Gate approaches
  const drawCrosswalkH = (cx: number, roadY: number) => {
    for (let s = -48; s <= 48; s += 16) {
      drawIsoRect(gfx, cx + s - 4, roadY + 10, 8, aveW - 20, 0xECEFF4, 0.85);
    }
  };
  const drawCrosswalkV = (roadX: number, cy: number) => {
    for (let s = -48; s <= 48; s += 16) {
      drawIsoRect(gfx, roadX + 10, cy + s - 4, aveW - 20, 8, 0xECEFF4, 0.85);
    }
  };

  for (const ix of [wRoadX, eRoadX]) {
    for (const iy of [nRoadY, sRoadY]) {
      drawCrosswalkH(ix - 30, iy);
      drawCrosswalkH(ix + aveW + 30, iy);
      drawCrosswalkV(ix, iy - 30);
      drawCrosswalkV(ix, iy + aveW + 30);
    }
  }
  // Main Stadium Entrance Crosswalks
  drawCrosswalkH(PITCH_HALF_W, nRoadY);
  drawCrosswalkH(PITCH_HALF_W, sRoadY);
  drawCrosswalkV(wRoadX, PITCH_HALF_H);
  drawCrosswalkV(eRoadX, PITCH_HALF_H);

  // ── 3. Stadium Concourse Plaza & Approach Gates ──
  drawIsoRect(gfx, -395, -395, 2390, 1790, 0x8F8C83, 1);
  drawIsoRect(gfx, -355, -355, 2310, 1710, 0x9F9B91, 1);
  strokeIsoRect(gfx, -395, -395, 2390, 1790, 0x6E6B62, 2.0, 0.85);

  // Paver grid lines across stadium concourse plaza
  gfx.lineStyle(1, 0x76736A, 0.28);
  for (let x = -340; x <= 1940; x += 120) {
    drawIsoLine(gfx, x, -395, x, 1395);
  }
  for (let y = -340; y <= 1340; y += 120) {
    drawIsoLine(gfx, -395, y, 1995, y);
  }

  // Wide fan entrance promenades from avenues straight into N/S/W/E stadium gates
  drawIsoRect(gfx, PITCH_HALF_W - 110, -460, 220, 240, 0xB8B3A8, 1);
  drawIsoRect(gfx, PITCH_HALF_W - 110, 1220, 220, 240, 0xB8B3A8, 1);
  drawIsoRect(gfx, -460, PITCH_HALF_H - 110, 240, 220, 0xB8B3A8, 1);
  drawIsoRect(gfx, 1820, PITCH_HALF_H - 110, 240, 220, 0xB8B3A8, 1);
  strokeIsoRect(gfx, PITCH_HALF_W - 110, -460, 220, 240, 0xB89B68, 1.5, 0.65);
  strokeIsoRect(gfx, PITCH_HALF_W - 110, 1220, 220, 240, 0xB89B68, 1.5, 0.65);
  strokeIsoRect(gfx, -460, PITCH_HALF_H - 110, 240, 220, 0xB89B68, 1.5, 0.65);
  strokeIsoRect(gfx, 1820, PITCH_HALF_H - 110, 240, 220, 0xB89B68, 1.5, 0.65);

  // Soft South-East drop shadow cast by the elevated stadium structure onto the plaza
  drawIsoRect(gfx, -185, -185, 2040, 1440, 0x121814, 0.34);

  // ── 4. West Stadium Parking Lots ──
  const drawParkingLot = (lx: number, ly: number, lw: number, lh: number) => {
    drawIsoRect(gfx, lx - 12, ly - 12, lw + 24, lh + 24, 0x8F8C83, 1);
    drawIsoRect(gfx, lx, ly, lw, lh, 0x3D424B, 1);
    strokeIsoRect(gfx, lx, ly, lw, lh, 0x626772, 1.8, 0.9);
    // White parking stalls (left column & right column with central driving lane)
    gfx.lineStyle(1.4, 0xE6E9EE, 0.65);
    for (let y = ly + 42; y <= ly + lh - 42; y += 52) {
      drawIsoLine(gfx, lx + 8, y, lx + 115, y);
      drawIsoLine(gfx, lx + lw - 115, y, lx + lw - 8, y);
    }
    // Entry apron onto West Ave
    drawIsoRect(gfx, lx + lw, ly + lh * 0.42, 75, 76, 0x3D424B, 1);
  };
  drawParkingLot(-1120, -370, 420, 670);
  drawParkingLot(-1120, 430, 420, 640);

  // ── 5. East Urban Fan Park & Circular Water Fountain ──
  drawIsoRect(gfx, 2310, 240, 560, 520, 0x325238, 1);
  drawIsoRect(gfx, 2550, 240, 80, 520, 0xB3AEA4, 0.95);
  drawIsoRect(gfx, 2262, PITCH_HALF_H - 40, 608, 80, 0xB3AEA4, 0.95);
  const fCenter = worldToIso(2590, PITCH_HALF_H);
  gfx.fillStyle(0xBAB5AB, 1);
  fillFastCircle(gfx, fCenter.x, fCenter.y, 72, 12);
  gfx.lineStyle(2, 0x7A776F, 0.8);
  gfx.strokeCircle(fCenter.x, fCenter.y, 72);
  gfx.fillStyle(0x4682B4, 1);
  fillFastCircle(gfx, fCenter.x, fCenter.y, 52, 12);
  gfx.fillStyle(0x6AA3D5, 0.9);
  fillFastCircle(gfx, fCenter.x, fCenter.y - 2, 34, 12);
  gfx.fillStyle(0xEAF6FF, 0.85);
  fillFastCircle(gfx, fCenter.x, fCenter.y - 4, 14, 12);
  gfx.lineStyle(1.4, 0xFFFFFF, 0.65);
  gfx.strokeCircle(fCenter.x, fCenter.y - 2, 24);

  // ── 6. Depth-Sorted 3D City Buildings, Kiosks, Trees, Vehicles & Streetlights ──
  const drawQueue: { sortKey: number; draw: () => void }[] = [];

  const queueBuilding = (
    wx: number, wy: number, w: number, d: number, h: number,
    roof: number, wallL: number, wallR: number
  ) => {
    drawQueue.push({
      sortKey: wx + wy + w + d,
      draw: () => drawIsoBuilding3D(gfx, wx, wy, w, d, h, roof, wallL, wallR),
    });
  };

  const queueTree = (wx: number, wy: number, r = 24, seed = Math.round(wx + wy)) => {
    drawQueue.push({
      sortKey: wx + wy + 8,
      draw: () => drawIsoTree(gfx, wx, wy, r, seed),
    });
  };

  const queueVehicle = (
    wx: number, wy: number, len: number, wid: number,
    heading: 'x' | 'y', dirSign: 1 | -1, col: number, isBus = false
  ) => {
    drawQueue.push({
      sortKey: wx + wy + 6,
      draw: () => drawIsoVehicle(gfx, wx, wy, len, wid, heading, dirSign, col, isBus),
    });
  };

  const queueLight = (wx: number, wy: number) => {
    drawQueue.push({
      sortKey: wx + wy + 4,
      draw: () => {
        const lp = worldToIso(wx, wy);
        gfx.fillStyle(0x464B54, 1);
        gfx.fillRect(lp.x - 1.5, lp.y - 16, 3, 16);
        gfx.fillStyle(0xFFE8A3, 0.28);
        fillFastCircle(gfx, lp.x, lp.y - 17, 9, 8);
        gfx.fillStyle(0xFFF5D1, 0.95);
        fillFastCircle(gfx, lp.x, lp.y - 17, 3, 8);
      },
    });
  };

  // Architectural muted palettes
  const C_SLATE: [number, number, number] = [0x586270, 0x3D444E, 0x30363F];
  const C_SAND: [number, number, number] = [0xB3A793, 0x8F8473, 0x756B5C];
  const C_CONCRETE: [number, number, number] = [0x99958B, 0x76736B, 0x5E5B54];
  const C_BRICK: [number, number, number] = [0x946051, 0x73493D, 0x5B382F];
  const C_GLASS: [number, number, number] = [0x4B6680, 0x33475B, 0x263646];

  // North Avenue Urban Row (wy < -690)
  queueBuilding(-360, -1040, 290, 310, 48, ...C_SLATE);
  queueBuilding(10, -1060, 320, 330, 56, ...C_SAND);
  queueBuilding(410, -1000, 260, 270, 34, ...C_CONCRETE);
  queueBuilding(920, -1030, 310, 300, 44, ...C_BRICK);
  queueBuilding(1310, -1060, 340, 330, 60, ...C_GLASS);
  queueBuilding(1720, -1000, 270, 270, 38, ...C_SAND);

  // North-West & North-East Outer Corners
  queueBuilding(-1090, -1040, 330, 310, 52, ...C_GLASS);
  queueBuilding(2320, -1040, 340, 310, 58, ...C_SLATE);

  // West Outer Row South of Parking Lot (wy = 1130..1410)
  queueBuilding(-1080, 1130, 340, 270, 42, ...C_BRICK);
  // West Outer Row North near intersection
  queueBuilding(-1080, -640, 330, 210, 36, ...C_CONCRETE);

  // East Outer Blocks Flanking Fan Park
  queueBuilding(2320, -340, 360, 480, 54, ...C_GLASS);
  queueBuilding(2320, 820, 340, 540, 46, ...C_SAND);
  queueBuilding(2750, -320, 280, 440, 42, ...C_SLATE);

  // South Avenue Urban Row (wy = 1695..2090)
  queueBuilding(-380, 1705, 310, 320, 46, ...C_BRICK);
  queueBuilding(10, 1705, 320, 290, 38, ...C_SAND);
  queueBuilding(420, 1715, 290, 340, 52, ...C_SLATE);
  queueBuilding(900, 1705, 330, 310, 42, ...C_CONCRETE);
  queueBuilding(1320, 1715, 320, 340, 58, ...C_GLASS);
  queueBuilding(1720, 1705, 270, 280, 36, ...C_BRICK);

  // South-West & South-East Outer Corners
  queueBuilding(-1080, 1705, 340, 320, 44, ...C_SAND);
  queueBuilding(2320, 1705, 340, 320, 50, ...C_CONCRETE);

  // Small Entrance Ticket Kiosks on South & East Stadium Plazas
  queueBuilding(645, 1295, 58, 42, 16, 0xD4AF37, 0x2A323D, 0x1E242C);
  queueBuilding(895, 1295, 58, 42, 16, 0xD4AF37, 0x2A323D, 0x1E242C);
  queueBuilding(1885, 625, 42, 58, 16, 0xD4AF37, 0x2A323D, 0x1E242C);

  // Parked Cars Inside West Parking Lots
  const lotCarColors = [0xC94038, 0xD8DCE2, 0x2F5586, 0x4A505A, 0xD4AF37, 0x3C7A57, 0x8D95A2];
  let lotIdx = 0;
  for (const baseLy of [-310, -195, -80, 95, 210, 495, 610, 725, 895, 1005]) {
    queueVehicle(-1055, baseLy, 52, 26, 'x', 1, lotCarColors[lotIdx++ % lotCarColors.length]);
    if (lotIdx % 2 === 0) {
      queueVehicle(-755, baseLy + 12, 52, 26, 'x', -1, lotCarColors[lotIdx++ % lotCarColors.length]);
    }
  }

  // Moving Traffic Along 4-Lane Avenues + Signature Team Bus!
  // North Ave traffic
  queueVehicle(-180, nRoadY + 112, 56, 26, 'x', 1, 0xD8DCE2);
  queueVehicle(260, nRoadY + 38, 56, 26, 'x', -1, 0x2E5B8E);
  queueVehicle(1160, nRoadY + 112, 56, 26, 'x', 1, 0xC94038);
  queueVehicle(1580, nRoadY + 38, 56, 26, 'x', -1, 0x525864);
  // South Ave traffic + FC Superstar Team Bus near South-West gate!
  queueVehicle(180, sRoadY + 36, 124, 34, 'x', 1, 0x1E3A5F, true);
  queueVehicle(-210, sRoadY + 112, 56, 26, 'x', -1, 0x3C7A57);
  queueVehicle(540, sRoadY + 38, 56, 26, 'x', 1, 0xE2C15A);
  queueVehicle(1280, sRoadY + 112, 56, 26, 'x', -1, 0xD8DCE2);
  queueVehicle(1660, sRoadY + 38, 56, 26, 'x', 1, 0xC94038);
  // West Ave traffic
  queueVehicle(wRoadX + 38, -220, 56, 26, 'y', 1, 0xD8DCE2);
  queueVehicle(wRoadX + 112, 160, 56, 26, 'y', -1, 0x2E5B8E);
  queueVehicle(wRoadX + 38, 860, 56, 26, 'y', 1, 0x525864);
  queueVehicle(wRoadX + 112, 1180, 56, 26, 'y', -1, 0xC94038);
  // East Ave traffic
  queueVehicle(eRoadX + 38, -160, 56, 26, 'y', 1, 0x3C7A57);
  queueVehicle(eRoadX + 112, 210, 56, 26, 'y', -1, 0xE2C15A);
  queueVehicle(eRoadX + 38, 920, 56, 26, 'y', 1, 0xD8DCE2);
  queueVehicle(eRoadX + 112, 1210, 56, 26, 'y', -1, 0x2E5B8E);

  // Inner & Outer Avenue Street Trees (skipping main entrance plazas & crosswalks)
  for (let x = -380; x <= 1980; x += 170) {
    if (Math.abs(x - PITCH_HALF_W) < 165) continue;
    queueTree(x, -430, 23, x * 13);
    queueTree(x, 1430, 23, x * 17 + 9);
    queueTree(x + 65, nRoadY - 26, 25, x * 19);
    queueTree(x + 65, sRoadY + aveW + 26, 25, x * 23);
  }
  for (let y = -320; y <= 1320; y += 165) {
    if (Math.abs(y - PITCH_HALF_H) < 155) continue;
    queueTree(-430, y, 23, y * 11);
    queueTree(2030, y, 23, y * 15 + 7);
    queueTree(eRoadX + aveW + 26, y + 55, 25, y * 21);
  }

  // Park & Corner Plaza Foliage Clusters
  for (const [px, py] of [
    [-330, -330], [-280, -330], [1920, -330], [-330, 1320], [1920, 1320],
    [2375, 295], [2440, 315], [2790, 310], [2780, 680], [2380, 690], [2460, 710],
  ]) {
    queueTree(px, py, 27, px + py * 3);
  }

  // Warm Curbside Streetlights along inner avenues
  for (let x = -280; x <= 1880; x += 360) {
    queueLight(x, -455);
    queueLight(x, 1455);
  }
  for (let y = -260; y <= 1260; y += 340) {
    queueLight(-455, y);
    queueLight(2055, y);
  }

  // Paint all 3D aerial objects back-to-front in isometric order!
  drawQueue.sort((a, b) => a.sortKey - b.sortKey);
  for (const item of drawQueue) {
    item.draw();
  }
}
