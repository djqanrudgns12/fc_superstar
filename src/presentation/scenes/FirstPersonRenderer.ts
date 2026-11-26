/* ================================================================
   TRUE 3D FIRST-PERSON HUMAN EYE-LEVEL RENDERER
   Renders the entire stadium, grass stripes, pitch lines, 3D goals,
   teammates/opponents (faces when facing you, jersey back numbers when facing away),
   referees, 3D ball, and peripheral cleats/GK gloves from the controlled player's eyes!
   ================================================================ */

import Phaser from 'phaser';
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  PITCH_HALF_W,
  PITCH_HALF_H,
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
  PENALTY_SPOT_DISTANCE,
} from '../../infrastructure/config/game-config';
import {
  fillFastCircle,
  fillFastEllipse,
  fillFastBevelRect,
  fillFastDome,
  type PlayerVisualProfile,
} from './PlayerAppearance';

export interface FPActorView {
  id: string;
  name: string;
  team: 'user' | 'ai';
  position: string;
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  facingAngle: number;
  animTimer: number;
  profile: PlayerVisualProfile;
  isControlledP1: boolean;
}

export interface FPRefereeView {
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  animTimer: number;
  signalState: 'none' | 'whistle' | 'yellow_card' | 'point_left' | 'point_right';
  isLinesman?: boolean;
  flagUp?: boolean;
}

export interface FPTrainingConeView {
  index: number;
  wx: number;
  wy: number;
  gateSide: -1 | 1;
  passed: boolean;
  isNextTarget: boolean;
  tiltAngle?: number;
}

export interface FPRenderState {
  eyeWx: number;
  eyeWy: number;
  eyeWz: number;
  yaw: number;
  pitchDown: number;
  roll: number;
  stridePhase: number;
  isMoving: boolean;
  isSprinting: boolean;
  kickAnimMs: number;
  gkDiveAnimMs: number;
  isControlledGK: boolean;
  shotCharge: number;
  isChargingShot: boolean;
  ballWx: number;
  ballWy: number;
  ballWz: number;
  ballRollAngle: number;
  actors: FPActorView[];
  referees: FPRefereeView[];
  cones?: FPTrainingConeView[];
}

interface CamSpacePt {
  cx: number; // right (+)
  cy: number; // up (+)
  cz: number; // forward depth (+)
}

const NEAR_Z = 3.2;
const GOAL_CROSSBAR_Z = 48;

export class FirstPersonRenderer {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private hudOverlayGfx: Phaser.GameObjects.Graphics;
  private labelPool: Phaser.GameObjects.Text[] = [];
  private numberPool: Phaser.GameObjects.Text[] = [];
  private ballIndicatorText: Phaser.GameObjects.Text;
  private povBadgeText: Phaser.GameObjects.Text;

  // Cached camera trig per frame
  private eyeX = 0;
  private eyeY = 0;
  private eyeZ = 21.5;
  private cosYaw = 1;
  private sinYaw = 0;
  private cosPitch = 1;
  private sinPitch = 0;
  private screenW = 1280;
  private screenH = 720;
  private focal = 420;

  // Precomputed stadium stand spectator anchors in 3D world space
  private standSpectators: { wx: number; wy: number; wz: number; color: number; skin: number; scarf: boolean }[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Depth 1500 sits cleanly above world layers (0..900) and below HUD overlays (2000+)
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(1500).setVisible(false);
    this.gfx = scene.add.graphics();
    this.root.add(this.gfx);

    // Pre-allocate reusable crisp HiDPI text pools for 3D jersey numbers & floating name tags
    for (let i = 0; i < 26; i++) {
      const numTxt = scene.add.text(0, 0, '', {
        fontFamily: 'Pretendard, Impact, sans-serif',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#FFD54F',
        stroke: '#111114',
        strokeThickness: 3,
        resolution: 2,
      }).setOrigin(0.5).setVisible(false);
      this.numberPool.push(numTxt);
      this.root.add(numTxt);

      const lblTxt = scene.add.text(0, 0, '', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#FFFCF7',
        stroke: '#0E1118',
        strokeThickness: 3.5,
        resolution: 2,
      }).setOrigin(0.5).setVisible(false);
      this.labelPool.push(lblTxt);
      this.root.add(lblTxt);
    }

    // Smooth rounded glassmorphic pill backdrop layer for 1st-person HUD badges
    this.hudOverlayGfx = scene.add.graphics();
    this.root.add(this.hudOverlayGfx);

    this.ballIndicatorText = scene.add.text(0, 0, '', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '13.5px',
      fontStyle: 'bold',
      color: '#F5DF9E',
      resolution: 2,
    }).setOrigin(0.5).setVisible(false);
    this.root.add(this.ballIndicatorText);

    this.povBadgeText = scene.add.text(0, 0, '1인칭 선수 시점  ·  W/S 전후진  ·  A/D 시선 회전  ·  R 패스  ·  E 슛  ·  X 시점 전환', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#EFE5C8',
      resolution: 2,
    }).setOrigin(0.5);
    this.root.add(this.povBadgeText);

    this.init3DStandSpectators();
  }

  private init3DStandSpectators() {
    const palette = [0x245484, 0x2E6BE6, 0xC9302C, 0xF4F4F6, 0xD4AF37, 0x2ECC71, 0xE67E22];
    const skins = [0xF6D7B2, 0xEAC096, 0xD29B6E, 0x8D5A36];
    let idx = 0;

    // North & South grandstands
    for (let row = 0; row < 3; row++) {
      const wz = 22 + row * 24;
      const nWy = -82 - row * 34;
      const sWy = PITCH_HEIGHT + 82 + row * 34;
      for (let wx = -40; wx <= PITCH_WIDTH + 40; wx += 68) {
        this.standSpectators.push({
          wx: wx + (row % 2) * 28,
          wy: nWy,
          wz,
          color: palette[idx % palette.length],
          skin: skins[(idx >> 1) % skins.length],
          scarf: idx % 5 === 0,
        });
        idx++;
        this.standSpectators.push({
          wx: wx + ((row + 1) % 2) * 28,
          wy: sWy,
          wz,
          color: palette[idx % palette.length],
          skin: skins[(idx >> 1) % skins.length],
          scarf: idx % 6 === 0,
        });
        idx++;
      }
    }

    // West & East behind-goal stands
    for (let row = 0; row < 3; row++) {
      const wz = 22 + row * 24;
      const wWx = -82 - row * 34;
      const eWx = PITCH_WIDTH + 82 + row * 34;
      for (let wy = 0; wy <= PITCH_HEIGHT; wy += 64) {
        this.standSpectators.push({
          wx: wWx,
          wy: wy + (row % 2) * 24,
          wz,
          color: palette[idx % palette.length],
          skin: skins[(idx >> 1) % skins.length],
          scarf: idx % 5 === 0,
        });
        idx++;
        this.standSpectators.push({
          wx: eWx,
          wy: wy + ((row + 1) % 2) * 24,
          wz,
          color: palette[idx % palette.length],
          skin: skins[(idx >> 1) % skins.length],
          scarf: idx % 5 === 0,
        });
        idx++;
      }
    }
  }

  public setVisible(visible: boolean) {
    this.root.setVisible(visible);
    if (!visible) {
      this.gfx.clear();
      for (const t of this.labelPool) t.setVisible(false);
      for (const n of this.numberPool) n.setVisible(false);
      this.ballIndicatorText.setVisible(false);
    }
  }

  public destroy() {
    this.root.destroy(true);
  }

  private toCameraSpace(wx: number, wy: number, wz: number): CamSpacePt {
    const dx = wx - this.eyeX;
    const dy = wy - this.eyeY;
    const dz = wz - this.eyeZ;

    const horizFwd = dx * this.cosYaw + dy * this.sinYaw;
    const cx = -dx * this.sinYaw + dy * this.cosYaw;
    const cz = horizFwd * this.cosPitch - dz * this.sinPitch;
    const cy = horizFwd * this.sinPitch + dz * this.cosPitch;

    return { cx, cy, cz };
  }

  private projectCamPt(pt: CamSpacePt): { sx: number; sy: number; scale: number } {
    const invZ = this.focal / Math.max(NEAR_Z, pt.cz);
    return {
      sx: this.screenW * 0.5 + pt.cx * invZ,
      sy: this.screenH * 0.5 - pt.cy * invZ,
      scale: invZ,
    };
  }

  private clipAndFillPoly3D(pts: [number, number, number][], color: number, alpha = 1.0) {
    const camPts = pts.map(([x, y, z]) => this.toCameraSpace(x, y, z));
    const clipped: CamSpacePt[] = [];

    for (let i = 0; i < camPts.length; i++) {
      const a = camPts[i];
      const b = camPts[(i + 1) % camPts.length];
      const aIn = a.cz >= NEAR_Z;
      const bIn = b.cz >= NEAR_Z;

      if (aIn && bIn) {
        clipped.push(b);
      } else if (aIn && !bIn) {
        const t = (a.cz - NEAR_Z) / (a.cz - b.cz);
        clipped.push({
          cx: a.cx + (b.cx - a.cx) * t,
          cy: a.cy + (b.cy - a.cy) * t,
          cz: NEAR_Z,
        });
      } else if (!aIn && bIn) {
        const t = (NEAR_Z - a.cz) / (b.cz - a.cz);
        clipped.push({
          cx: a.cx + (b.cx - a.cx) * t,
          cy: a.cy + (b.cy - a.cy) * t,
          cz: NEAR_Z,
        });
        clipped.push(b);
      }
    }

    if (clipped.length < 3) return;

    this.gfx.fillStyle(color, alpha);
    const p0 = this.projectCamPt(clipped[0]);
    let prev = this.projectCamPt(clipped[1]);
    for (let i = 2; i < clipped.length; i++) {
      const curr = this.projectCamPt(clipped[i]);
      this.gfx.fillTriangle(p0.sx, p0.sy, prev.sx, prev.sy, curr.sx, curr.sy);
      prev = curr;
    }
  }

  private clipAndDrawLine3D(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    lineWidth: number,
    color: number,
    alpha = 1.0
  ) {
    let a = this.toCameraSpace(x1, y1, z1);
    let b = this.toCameraSpace(x2, y2, z2);

    if (a.cz < NEAR_Z && b.cz < NEAR_Z) return;
    if (a.cz < NEAR_Z) {
      const t = (NEAR_Z - a.cz) / (b.cz - a.cz);
      a = { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, cz: NEAR_Z };
    } else if (b.cz < NEAR_Z) {
      const t = (a.cz - NEAR_Z) / (a.cz - b.cz);
      b = { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, cz: NEAR_Z };
    }

    const pa = this.projectCamPt(a);
    const pb = this.projectCamPt(b);
    this.gfx.lineStyle(lineWidth, color, alpha);
    this.gfx.lineBetween(pa.sx, pa.sy, pb.sx, pb.sy);
  }

  private drawCircle3D(cx: number, cy: number, radius: number, segments: number, lineWidth: number, color: number) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      this.clipAndDrawLine3D(
        cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, 0.1,
        cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, 0.1,
        lineWidth,
        color,
        0.92
      );
    }
  }

  public render(state: FPRenderState) {
    this.screenW = this.scene.scale.width;
    this.screenH = this.scene.scale.height;
    const uiScale = Math.min(this.screenW / 1280, this.screenH / 720);
    this.focal = this.screenH * 0.56;

    this.eyeX = state.eyeWx;
    this.eyeY = state.eyeWy;
    this.eyeZ = state.eyeWz;
    this.cosYaw = Math.cos(state.yaw);
    this.sinYaw = Math.sin(state.yaw);
    this.cosPitch = Math.cos(state.pitchDown);
    this.sinPitch = Math.sin(state.pitchDown);

    this.gfx.clear();
    this.hudOverlayGfx.clear();
    for (const t of this.labelPool) t.setVisible(false);
    for (const n of this.numberPool) n.setVisible(false);

    // Position top POV hint pill neatly with smooth rounded glassmorphic capsule
    const isTrainingPov = Boolean(state.cones && state.cones.length > 0);
    const povText = isTrainingPov
      ? '1인칭 드리블 시점  ·  W/S 전후진  ·  A/D 시선 회전  ·  Shift 스프린트  ·  X 시점 전환'
      : '1인칭 선수 시점  ·  W/S 전후진  ·  A/D 시선 회전  ·  R 패스  ·  E 슛  ·  X 시점 전환';
    if (this.povBadgeText.text !== povText) {
      this.povBadgeText.setText(povText);
    }
    this.povBadgeText.setScale(uiScale);
    const povY = (isTrainingPov ? 76 : 58) * uiScale;
    this.povBadgeText.setPosition(this.screenW * 0.5, povY);
    const povW = this.povBadgeText.displayWidth + 30 * uiScale;
    const povH = this.povBadgeText.displayHeight + 14 * uiScale;
    this.hudOverlayGfx.fillStyle(0x131722, 0.84);
    this.hudOverlayGfx.fillRoundedRect(this.screenW * 0.5 - povW * 0.5, povY - povH * 0.5, povW, povH, povH * 0.5);
    this.hudOverlayGfx.lineStyle(1.3 * uiScale, 0xD4AF37, 0.55);
    this.hudOverlayGfx.strokeRoundedRect(this.screenW * 0.5 - povW * 0.5, povY - povH * 0.5, povW, povH, povH * 0.5);

    // ── 1. Night Stadium Sky & Smooth Layered Horizon Atmosphere ──
    const horizonY = this.screenH * 0.5 - Math.tan(state.pitchDown) * this.focal;
    this.gfx.fillStyle(0x0B1320, 1);
    this.gfx.fillRect(0, 0, this.screenW, Math.max(0, horizonY + 10));
    // Soft multi-band atmospheric gradient (eliminates sharp horizon rectangle seam)
    const skyBands: [number, number, number][] = [
      [185, 0x111E33, 0.36],
      [130, 0x162740, 0.44],
      [78, 0x1D3352, 0.42],
      [34, 0x264161, 0.35],
    ];
    for (const [bandH, col, alpha] of skyBands) {
      this.gfx.fillStyle(col, alpha);
      this.gfx.fillRect(0, Math.max(0, horizonY - bandH * uiScale), this.screenW, (bandH + 8) * uiScale);
    }
    // Ground base below horizon so no gaps ever appear outside stadium
    this.gfx.fillStyle(0x234227, 1);
    this.gfx.fillRect(0, Math.max(0, horizonY), this.screenW, this.screenH - Math.max(0, horizonY));

    // ── 2. 3D Stadium Floodlight Towers (Smooth Soft Circular Radial Halo) ──
    const corners: [number, number][] = [
      [-120, -120],
      [PITCH_WIDTH + 120, -120],
      [-120, PITCH_HEIGHT + 120],
      [PITCH_WIDTH + 120, PITCH_HEIGHT + 120],
    ];
    for (const [tx, ty] of corners) {
      this.clipAndDrawLine3D(tx, ty, 0, tx, ty, 280, 4.2 * uiScale, 0x3A4556, 1);
      const topCam = this.toCameraSpace(tx, ty, 285);
      if (topCam.cz > NEAR_Z) {
        const tp = this.projectCamPt(topCam);
        const lampR = Phaser.Math.Clamp((24 * this.focal) / topCam.cz, 5, 36);
        // Smooth radial circular glow layers (no sharp octagon polygon!)
        this.gfx.fillStyle(0xFFF6D6, 0.055);
        this.gfx.fillCircle(tp.sx, tp.sy, lampR * 3.1);
        this.gfx.fillStyle(0xFFF6D6, 0.10);
        this.gfx.fillCircle(tp.sx, tp.sy, lampR * 2.0);
        this.gfx.fillStyle(0xFFF9E6, 0.22);
        this.gfx.fillCircle(tp.sx, tp.sy, lampR * 1.25);
        // Sleek rounded LED stadium light bank
        this.gfx.fillStyle(0x262E3B, 0.95);
        this.gfx.fillRoundedRect(tp.sx - lampR * 1.05, tp.sy - lampR * 0.56, lampR * 2.1, lampR * 1.12, Math.max(2, lampR * 0.35));
        this.gfx.fillStyle(0xFFFDF4, 0.98);
        this.gfx.fillRoundedRect(tp.sx - lampR * 0.88, tp.sy - lampR * 0.38, lampR * 1.76, lampR * 0.76, Math.max(2, lampR * 0.24));
      }
    }

    // ── 3. 3D Stadium Grandstands & LED Ribbon Boards ──
    const pad = 55;
    // Outer pitch surround turf
    this.clipAndFillPoly3D(
      [[-pad, -pad, 0], [PITCH_WIDTH + pad, -pad, 0], [PITCH_WIDTH + pad, PITCH_HEIGHT + pad, 0], [-pad, PITCH_HEIGHT + pad, 0]],
      0x2B5430,
      1
    );

    // 4 Sloped 3D Grandstand Walls
    const standOut = 185;
    const standTopZ = 105;
    // North Stand
    this.clipAndFillPoly3D(
      [[-pad, -pad, 12], [PITCH_WIDTH + pad, -pad, 12], [PITCH_WIDTH + standOut, -standOut, standTopZ], [-standOut, -standOut, standTopZ]],
      0x222630,
      1
    );
    // South Stand
    this.clipAndFillPoly3D(
      [[PITCH_WIDTH + pad, PITCH_HEIGHT + pad, 12], [-pad, PITCH_HEIGHT + pad, 12], [-standOut, PITCH_HEIGHT + standOut, standTopZ], [PITCH_WIDTH + standOut, PITCH_HEIGHT + standOut, standTopZ]],
      0x222630,
      1
    );
    // West Stand
    this.clipAndFillPoly3D(
      [[-pad, PITCH_HEIGHT + pad, 12], [-pad, -pad, 12], [-standOut, -standOut, standTopZ], [-standOut, PITCH_HEIGHT + standOut, standTopZ]],
      0x1E222B,
      1
    );
    // East Stand
    this.clipAndFillPoly3D(
      [[PITCH_WIDTH + pad, -pad, 12], [PITCH_WIDTH + pad, PITCH_HEIGHT + pad, 12], [PITCH_WIDTH + standOut, PITCH_HEIGHT + standOut, standTopZ], [PITCH_WIDTH + standOut, -standOut, standTopZ]],
      0x1E222B,
      1
    );

    // 3D Spectators in Grandstands (visible in front of camera)
    for (const sp of this.standSpectators) {
      const c = this.toCameraSpace(sp.wx, sp.wy, sp.wz);
      if (c.cz <= 20 || c.cz > 2100) continue;
      const p = this.projectCamPt(c);
      if (p.sx < -20 || p.sx > this.screenW + 20 || p.sy < -20 || p.sy > this.screenH + 20) continue;
      const s = p.scale;
      const torsoW = Math.max(2.0, 9.5 * s);
      const torsoH = Math.max(2.0, 10.5 * s);
      const headR = Math.max(1.2, 3.4 * s);

      this.gfx.fillStyle(sp.color, 0.95);
      this.gfx.fillRect(p.sx - torsoW * 0.5, p.sy - torsoH, torsoW, torsoH);
      this.gfx.fillStyle(sp.skin, 1);
      fillFastCircle(this.gfx, p.sx, p.sy - torsoH - headR * 0.85, headR, 8);
      if (sp.scarf) {
        this.gfx.fillStyle(0xD4AF37, 0.92);
        this.gfx.fillRect(p.sx - torsoW * 0.7, p.sy - torsoH - headR * 2.3, torsoW * 1.4, Math.max(1.5, 2.8 * s));
      }
    }

    // 4 Touchline LED Adboards (wz = 0..13)
    const ledZ = 13;
    this.clipAndFillPoly3D([[-pad, -pad, 0], [PITCH_WIDTH + pad, -pad, 0], [PITCH_WIDTH + pad, -pad, ledZ], [-pad, -pad, ledZ]], 0x161920, 1);
    this.clipAndFillPoly3D([[PITCH_WIDTH + pad, PITCH_HEIGHT + pad, 0], [-pad, PITCH_HEIGHT + pad, 0], [-pad, PITCH_HEIGHT + pad, ledZ], [PITCH_WIDTH + pad, PITCH_HEIGHT + pad, ledZ]], 0x161920, 1);
    this.clipAndFillPoly3D([[-pad, PITCH_HEIGHT + pad, 0], [-pad, -pad, 0], [-pad, -pad, ledZ], [-pad, PITCH_HEIGHT + pad, ledZ]], 0x161920, 1);
    this.clipAndFillPoly3D([[PITCH_WIDTH + pad, -pad, 0], [PITCH_WIDTH + pad, PITCH_HEIGHT + pad, 0], [PITCH_WIDTH + pad, PITCH_HEIGHT + pad, ledZ], [PITCH_WIDTH + pad, -pad, ledZ]], 0x161920, 1);
    // Gold LED top trim
    this.clipAndDrawLine3D(-pad, -pad, ledZ, PITCH_WIDTH + pad, -pad, ledZ, 2 * uiScale, 0xD4AF37, 0.9);
    this.clipAndDrawLine3D(-pad, PITCH_HEIGHT + pad, ledZ, PITCH_WIDTH + pad, PITCH_HEIGHT + pad, ledZ, 2 * uiScale, 0xD4AF37, 0.9);
    this.clipAndDrawLine3D(-pad, -pad, ledZ, -pad, PITCH_HEIGHT + pad, ledZ, 2 * uiScale, 0xD4AF37, 0.9);
    this.clipAndDrawLine3D(PITCH_WIDTH + pad, -pad, ledZ, PITCH_WIDTH + pad, PITCH_HEIGHT + pad, ledZ, 2 * uiScale, 0xD4AF37, 0.9);

    // ── 4. 3D Mowed Grass Stripes ──
    const stripes = 16;
    const stripeW = PITCH_WIDTH / stripes;
    for (let i = 0; i < stripes; i++) {
      const x0 = i * stripeW;
      const x1 = (i + 1) * stripeW;
      const grassCol = i % 2 === 0 ? 0x367C3F : 0x3F8E49;
      this.clipAndFillPoly3D(
        [[x0, 0, 0], [x1, 0, 0], [x1, PITCH_HEIGHT, 0], [x0, PITCH_HEIGHT, 0]],
        grassCol,
        1
      );
    }

    // ── 5. Crisp 3D White Pitch Markings ──
    const lw = 2.4 * uiScale;
    const white = 0xFFFFFF;
    // Outer boundary
    this.clipAndDrawLine3D(0, 0, 0.1, PITCH_WIDTH, 0, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(PITCH_WIDTH, 0, 0.1, PITCH_WIDTH, PITCH_HEIGHT, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(PITCH_WIDTH, PITCH_HEIGHT, 0.1, 0, PITCH_HEIGHT, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(0, PITCH_HEIGHT, 0.1, 0, 0, 0.1, lw, white, 0.92);
    // Halfway line & Center circle
    this.clipAndDrawLine3D(PITCH_HALF_W, 0, 0.1, PITCH_HALF_W, PITCH_HEIGHT, 0.1, lw, white, 0.92);
    this.drawCircle3D(PITCH_HALF_W, PITCH_HALF_H, CENTER_CIRCLE_RADIUS, 36, lw, white);

    // Left Penalty & Goal Areas
    const pMaxY = PENALTY_AREA_Y_MIN + PENALTY_AREA_HEIGHT;
    const gMaxY = GOAL_AREA_Y_MIN + GOAL_AREA_HEIGHT;
    this.clipAndDrawLine3D(0, PENALTY_AREA_Y_MIN, 0.1, PENALTY_AREA_WIDTH, PENALTY_AREA_Y_MIN, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(PENALTY_AREA_WIDTH, PENALTY_AREA_Y_MIN, 0.1, PENALTY_AREA_WIDTH, pMaxY, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(PENALTY_AREA_WIDTH, pMaxY, 0.1, 0, pMaxY, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(0, GOAL_AREA_Y_MIN, 0.1, GOAL_AREA_WIDTH, GOAL_AREA_Y_MIN, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(GOAL_AREA_WIDTH, GOAL_AREA_Y_MIN, 0.1, GOAL_AREA_WIDTH, gMaxY, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(GOAL_AREA_WIDTH, gMaxY, 0.1, 0, gMaxY, 0.1, lw, white, 0.92);

    // Right Penalty & Goal Areas
    const rpX = PITCH_WIDTH - PENALTY_AREA_WIDTH;
    const rgX = PITCH_WIDTH - GOAL_AREA_WIDTH;
    this.clipAndDrawLine3D(PITCH_WIDTH, PENALTY_AREA_Y_MIN, 0.1, rpX, PENALTY_AREA_Y_MIN, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(rpX, PENALTY_AREA_Y_MIN, 0.1, rpX, pMaxY, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(rpX, pMaxY, 0.1, PITCH_WIDTH, pMaxY, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(PITCH_WIDTH, GOAL_AREA_Y_MIN, 0.1, rgX, GOAL_AREA_Y_MIN, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(rgX, GOAL_AREA_Y_MIN, 0.1, rgX, gMaxY, 0.1, lw, white, 0.92);
    this.clipAndDrawLine3D(rgX, gMaxY, 0.1, PITCH_WIDTH, gMaxY, 0.1, lw, white, 0.92);

    // Penalty spots
    this.drawCircle3D(PENALTY_SPOT_DISTANCE, PITCH_HALF_H, 3.5, 10, lw, white);
    this.drawCircle3D(PITCH_WIDTH - PENALTY_SPOT_DISTANCE, PITCH_HALF_H, 3.5, 10, lw, white);

    // ── 6. 3D Vertical Goalframes & Nets ──
    this.drawGoal3D(0, -GOAL_DEPTH, uiScale);
    this.drawGoal3D(PITCH_WIDTH, GOAL_DEPTH, uiScale);

    // ── 6b. Optional 3D Slalom Training Ground Gate Corridors & Guide Lines ──
    if (state.cones && state.cones.length > 0) {
      let prevGx = 80;
      let prevGy = PITCH_HALF_H;
      for (const cone of state.cones) {
        const gateY = cone.wy + cone.gateSide * 58;
        const gateCol = cone.passed ? 0x2ECC71 : (cone.isNextTarget ? 0x00E5FF : 0xFFD54F);
        // Slalom path line connecting gate corridors on grass
        this.clipAndDrawLine3D(prevGx, prevGy, 0.2, cone.wx, gateY, 0.2, 2.2 * uiScale, gateCol, cone.passed ? 0.55 : 0.72);
        // Gate corridor marker line from cone to outer gate post
        this.clipAndDrawLine3D(
          cone.wx,
          cone.wy + cone.gateSide * 18,
          0.25,
          cone.wx,
          cone.wy + cone.gateSide * 86,
          0.25,
          3.2 * uiScale,
          gateCol,
          0.88
        );
        this.drawCircle3D(cone.wx, gateY, 16, 12, 2.0 * uiScale, gateCol);
        prevGx = cone.wx;
        prevGy = gateY;
      }
    }

    // ── 7. Depth-Sorted 3D Players, Referees, Training Cones & Soccer Ball ──
    type RenderItem =
      | { kind: 'actor'; cz: number; actor: FPActorView }
      | { kind: 'ref'; cz: number; ref: FPRefereeView }
      | { kind: 'cone'; cz: number; cone: FPTrainingConeView }
      | { kind: 'ball'; cz: number };

    const items: RenderItem[] = [];

    for (const actor of state.actors) {
      if (actor.isControlledP1) continue; // We ARE this player!
      const c = this.toCameraSpace(actor.wx, actor.wy, 12);
      if (c.cz > NEAR_Z + 1.5) {
        items.push({ kind: 'actor', cz: c.cz, actor });
      }
    }

    for (const ref of state.referees) {
      const c = this.toCameraSpace(ref.wx, ref.wy, 12);
      if (c.cz > NEAR_Z + 1.5) {
        items.push({ kind: 'ref', cz: c.cz, ref });
      }
    }

    if (state.cones) {
      for (const cone of state.cones) {
        const c = this.toCameraSpace(cone.wx, cone.wy, 8);
        if (c.cz > NEAR_Z + 1.0) {
          items.push({ kind: 'cone', cz: c.cz, cone });
        }
      }
    }

    const ballCam = this.toCameraSpace(state.ballWx, state.ballWy, state.ballWz + 4.5);
    if (ballCam.cz > NEAR_Z) {
      items.push({ kind: 'ball', cz: ballCam.cz });
    }

    // Painter's algorithm: far -> near
    items.sort((a, b) => b.cz - a.cz);

    let labelIdx = 0;
    let numIdx = 0;

    for (const item of items) {
      if (item.kind === 'actor') {
        const used = this.drawActor3D(item.actor, labelIdx, numIdx, uiScale);
        if (used.usedLabel) labelIdx++;
        if (used.usedNumber) numIdx++;
      } else if (item.kind === 'ref') {
        const usedLbl = this.drawReferee3D(item.ref, labelIdx, uiScale);
        if (usedLbl) labelIdx++;
      } else if (item.kind === 'cone') {
        const usedLbl = this.drawCone3D(item.cone, labelIdx, uiScale);
        if (usedLbl) labelIdx++;
      } else {
        this.drawBall3D(state.ballWx, state.ballWy, state.ballWz, state.ballRollAngle);
      }
    }

    // ── 8. First-Person Peripheral Self-Body (Cleats / GK Gloves), Crosshair & Ball Compass ──
    this.drawFirstPersonHandsAndFeet(state, uiScale);
    this.drawCrosshairAndBallCompass(state, uiScale);
  }

  private drawGoal3D(goalX: number, depthOffset: number, uiScale: number) {
    const backX = goalX + depthOffset;
    const y0 = GOAL_Y_MIN;
    const y1 = GOAL_Y_MAX;
    const h = GOAL_CROSSBAR_Z;

    // Translucent net planes
    this.clipAndFillPoly3D([[backX, y0, 0], [backX, y1, 0], [backX, y1, h], [backX, y0, h]], 0xFFFFFF, 0.14);
    this.clipAndFillPoly3D([[goalX, y0, h], [backX, y0, h], [backX, y1, h], [goalX, y1, h]], 0xFFFFFF, 0.12);

    // Net mesh strands
    for (let i = 1; i <= 7; i++) {
      const y = Phaser.Math.Linear(y0, y1, i / 8);
      this.clipAndDrawLine3D(backX, y, 0, backX, y, h, 1.0 * uiScale, 0xE2E6EC, 0.36);
      this.clipAndDrawLine3D(goalX, y, h, backX, y, h, 1.0 * uiScale, 0xE2E6EC, 0.32);
    }
    for (let z = 1; z <= 4; z++) {
      const wz = (z / 5) * h;
      this.clipAndDrawLine3D(backX, y0, wz, backX, y1, wz, 1.0 * uiScale, 0xE2E6EC, 0.36);
      this.clipAndDrawLine3D(goalX, y0, wz, backX, y0, wz, 1.0 * uiScale, 0xE2E6EC, 0.32);
      this.clipAndDrawLine3D(goalX, y1, wz, backX, y1, wz, 1.0 * uiScale, 0xE2E6EC, 0.32);
    }

    // Back frame support bars
    this.clipAndDrawLine3D(goalX, y0, 0, backX, y0, 0, 2 * uiScale, 0xCCCCCC, 0.75);
    this.clipAndDrawLine3D(goalX, y1, 0, backX, y1, 0, 2 * uiScale, 0xCCCCCC, 0.75);
    this.clipAndDrawLine3D(backX, y0, 0, backX, y0, h, 2 * uiScale, 0xCCCCCC, 0.75);
    this.clipAndDrawLine3D(backX, y1, 0, backX, y1, h, 2 * uiScale, 0xCCCCCC, 0.75);
    this.clipAndDrawLine3D(backX, y0, h, backX, y1, h, 2 * uiScale, 0xCCCCCC, 0.75);

    // Thick white front posts & crossbar
    const postW = 4.5 * uiScale;
    this.clipAndDrawLine3D(goalX, y0, 0, goalX, y0, h, postW, 0xFFFFFF, 1);
    this.clipAndDrawLine3D(goalX, y1, 0, goalX, y1, h, postW, 0xFFFFFF, 1);
    this.clipAndDrawLine3D(goalX, y0, h, goalX, y1, h, postW, 0xFFFFFF, 1);
  }

  private drawActor3D(
    actor: FPActorView,
    labelIdx: number,
    numIdx: number,
    uiScale: number
  ): { usedLabel: boolean; usedNumber: boolean } {
    const footCam = this.toCameraSpace(actor.wx, actor.wy, 0);
    if (footCam.cz <= NEAR_Z) return { usedLabel: false, usedNumber: false };

    const fp = this.projectCamPt(footCam);
    if (fp.sx < -160 || fp.sx > this.screenW + 160) {
      return { usedLabel: false, usedNumber: false };
    }

    // Unified proportional scale `u` so body parts never squash or detach at any distance!
    const u = Phaser.Math.Clamp(fp.scale * 1.24, 0.50 * uiScale, 9.2 * uiScale);
    const cx = fp.sx;
    const speed = Math.hypot(actor.vx, actor.vy);
    const isMoving = speed > 12;
    const stride = isMoving ? Math.sin(actor.animTimer * 13) : 0;
    const bounce = isMoving ? Math.abs(Math.sin(actor.animTimer * 13)) * 1.15 * u : 0;
    const baseY = fp.sy - bounce;

    // Ground shadow
    this.gfx.fillStyle(0x000000, 0.38);
    fillFastEllipse(this.gfx, cx, fp.sy, 7.6 * u, 2.9 * u, 8);

    const isUser = actor.team === 'user';
    const prof = actor.profile;
    const isGK = Boolean(prof.isGoalkeeper || actor.position === 'GK');
    const jerseyCol = isGK && prof.gkJerseyColor
      ? prof.gkJerseyColor
      : (isUser ? 0x245484 : 0xBA2D2D);
    const trimCol = isGK ? 0xFFD54F : (isUser ? 0xD4AF37 : 0xF2F2F2);
    const shortsCol = isGK ? 0x1A242F : (isUser ? 0xF2EFE9 : 0x1E1E22);
    const gloveCol = prof.gkGloveColor || 0xF5F7FA;

    // Determine orientation relative to camera eye
    const toEyeX = this.eyeX - actor.wx;
    const toEyeY = this.eyeY - actor.wy;
    const toEyeLen = Math.hypot(toEyeX, toEyeY) || 1;
    const dirEyeX = toEyeX / toEyeLen;
    const dirEyeY = toEyeY / toEyeLen;
    const faceCos = Math.cos(actor.facingAngle);
    const faceSin = Math.sin(actor.facingAngle);
    const facingDot = faceCos * dirEyeX + faceSin * dirEyeY;
    // Lateral cross product tells us whether actor is looking slightly left or right on screen
    const facingCross = faceCos * (-this.sinYaw) + faceSin * this.cosYaw;

    // Goalkeepers ALWAYS face the ball/camera so they never lose their face!
    // Field players use 3 smooth orientations: 'front', 'side' (3/4 profile), or 'back'
    const viewMode: 'front' | 'side' | 'back' = isGK
      ? 'front'
      : (facingDot >= -0.22 ? 'front' : (facingDot >= -0.62 ? 'side' : 'back'));

    // ── 1. Symmetric Athletic Legs, Team Socks & Football Cleats ──
    const legSpread = (isGK ? 3.05 : 2.55) * u;
    const legW = 2.95 * u;
    const lShift = stride * 1.9 * u;
    const rShift = -stride * 1.9 * u;
    const lx = cx - legSpread;
    const rx = cx + legSpread;

    // Bare knees / lower thighs (7.0u .. 10.6u up)
    this.gfx.fillStyle(prof.skinTone, 1);
    fillFastBevelRect(this.gfx, lx - legW * 0.5, baseY - 10.6 * u + lShift * 0.35, legW, 4.0 * u, 0.7 * u);
    fillFastBevelRect(this.gfx, rx - legW * 0.5, baseY - 10.6 * u + rShift * 0.35, legW, 4.0 * u, 0.7 * u);

    // Team socks with turnover trim band (2.0u .. 7.2u up)
    this.gfx.fillStyle(jerseyCol, 1);
    fillFastBevelRect(this.gfx, lx - legW * 0.52, baseY - 7.1 * u + lShift * 0.55, legW * 1.04, 5.2 * u, 0.7 * u);
    fillFastBevelRect(this.gfx, rx - legW * 0.52, baseY - 7.1 * u + rShift * 0.55, legW * 1.04, 5.2 * u, 0.7 * u);
    this.gfx.fillStyle(trimCol, 0.95);
    this.gfx.fillRect(lx - legW * 0.52, baseY - 7.1 * u + lShift * 0.55, legW * 1.04, 1.15 * u);
    this.gfx.fillRect(rx - legW * 0.52, baseY - 7.1 * u + rShift * 0.55, legW * 1.04, 1.15 * u);

    // 3D Football Cleats with stud sole & accent stripe (0 .. 2.3u up)
    const bootW = 3.8 * u;
    const bootH = 2.25 * u;
    this.gfx.fillStyle(0x14161C, 1);
    fillFastBevelRect(this.gfx, lx - bootW * 0.52, baseY - bootH + lShift * 0.7, bootW, bootH, 0.8 * u);
    fillFastBevelRect(this.gfx, rx - bootW * 0.48, baseY - bootH + rShift * 0.7, bootW, bootH, 0.8 * u);
    this.gfx.fillStyle(trimCol, 0.9);
    this.gfx.fillRect(lx - bootW * 0.3, baseY - bootH * 0.58 + lShift * 0.7, bootW * 0.55, 0.65 * u);
    this.gfx.fillRect(rx - bootW * 0.25, baseY - bootH * 0.58 + rShift * 0.7, bootW * 0.55, 0.65 * u);

    // ── 2. Athletic Football Shorts (Split-leg cuffs + pelvis waist, 10.0u .. 15.8u up) ──
    const shortsTop = baseY - 15.8 * u;
    const shortsW = 10.6 * u;
    const shortsH = 4.2 * u;
    this.gfx.fillStyle(shortsCol, 1);
    // Waist / pelvis block
    fillFastBevelRect(this.gfx, cx - shortsW * 0.5, shortsTop, shortsW, shortsH, 1.4 * u);
    // Left & right split thigh cuffs so shorts look like real athletic shorts
    fillFastBevelRect(this.gfx, lx - legW * 0.68, shortsTop + 2.4 * u + lShift * 0.2, legW * 1.36, 3.3 * u, 0.9 * u);
    fillFastBevelRect(this.gfx, rx - legW * 0.68, shortsTop + 2.4 * u + rShift * 0.2, legW * 1.36, 3.3 * u, 0.9 * u);
    // Side trim stripes on shorts
    this.gfx.fillStyle(trimCol, 0.88);
    this.gfx.fillRect(cx - shortsW * 0.48, shortsTop + 0.5 * u, 0.95 * u, 4.6 * u);
    this.gfx.fillRect(cx + shortsW * 0.48 - 0.95 * u, shortsTop + 0.5 * u, 0.95 * u, 4.6 * u);

    // ── 3. Athletic Jersey Torso & Rounded Deltoid Shoulders (15.4u .. 26.2u up) ──
    const torsoW = 11.8 * u;
    const torsoH = 10.8 * u;
    const torsoTop = baseY - 26.2 * u;

    // Main jersey torso
    this.gfx.fillStyle(jerseyCol, 1);
    fillFastBevelRect(this.gfx, cx - torsoW * 0.5, torsoTop, torsoW, torsoH, 2.2 * u);

    // Rounded shoulder caps for natural human silhouette
    const shY = torsoTop + 1.9 * u;
    const shR = 2.15 * u;
    fillFastCircle(this.gfx, cx - torsoW * 0.46, shY, shR, 8);
    fillFastCircle(this.gfx, cx + torsoW * 0.46, shY, shR, 8);

    // Subtle 3D cylindrical torso shading
    this.gfx.fillStyle(0x000000, 0.15);
    this.gfx.fillRect(cx - torsoW * 0.48, torsoTop + 1.2 * u, torsoW * 0.22, torsoH - 2.0 * u);

    // Shoulder stripes
    this.gfx.fillStyle(trimCol, 0.95);
    this.gfx.fillRect(cx - torsoW * 0.48, torsoTop + 0.2 * u, torsoW * 0.30, 1.35 * u);
    this.gfx.fillRect(cx + torsoW * 0.18, torsoTop + 0.2 * u, torsoW * 0.30, 1.35 * u);

    // ── 4. Articulated Arms & Goalkeeper Ready Stance with Latex Gloves ──
    const armW = 2.65 * u;
    if (isGK) {
      // Goalkeeper Ready Stance: elbows out, forearms raised ready to parry, oversized GK gloves!
      const lElbX = cx - torsoW * 0.58;
      const rElbX = cx + torsoW * 0.58;
      const elbY = torsoTop + 4.4 * u;
      const lHandX = cx - torsoW * 0.72;
      const rHandX = cx + torsoW * 0.72;
      const handY = torsoTop + 2.8 * u - lShift * 0.25;

      // Long GK sleeves (upper arm + forearm)
      this.gfx.fillStyle(jerseyCol, 1);
      fillFastBevelRect(this.gfx, lElbX - armW * 0.5, torsoTop + 0.9 * u, armW, 4.6 * u, 1.0 * u);
      fillFastBevelRect(this.gfx, rElbX - armW * 0.5, torsoTop + 0.9 * u, armW, 4.6 * u, 1.0 * u);
      fillFastBevelRect(this.gfx, lHandX - armW * 0.45, handY, armW * 1.15, elbY - handY + 1.4 * u, 0.9 * u);
      fillFastBevelRect(this.gfx, rHandX - armW * 0.70, handY, armW * 1.15, elbY - handY + 1.4 * u, 0.9 * u);

      // Gold GK wrist straps
      this.gfx.fillStyle(0xD4AF37, 1);
      fillFastBevelRect(this.gfx, lHandX - 1.7 * u, handY - 0.4 * u, 3.4 * u, 1.5 * u, 0.5 * u);
      fillFastBevelRect(this.gfx, rHandX - 1.7 * u, handY - 0.4 * u, 3.4 * u, 1.5 * u, 0.5 * u);

      // Pro Latex Goalkeeper Gloves (palm + fingers)
      const gloveR = 2.65 * u;
      this.gfx.fillStyle(gloveCol, 1);
      fillFastCircle(this.gfx, lHandX, handY - 1.5 * u, gloveR, 12);
      fillFastCircle(this.gfx, rHandX, handY - 1.5 * u, gloveR, 12);
      this.gfx.fillStyle(0x1E242B, 0.35);
      fillFastCircle(this.gfx, lHandX + 0.4 * u, handY - 1.4 * u, gloveR * 0.55, 8);
      fillFastCircle(this.gfx, rHandX - 0.4 * u, handY - 1.4 * u, gloveR * 0.55, 8);
    } else {
      // Field Player Arms swinging naturally with stride
      const lArmSwing = -lShift * 0.45;
      const rArmSwing = -rShift * 0.45;
      const lArmX = cx - torsoW * 0.5 - armW * 0.72;
      const rArmX = cx + torsoW * 0.5 - armW * 0.28;

      // Upper short sleeves
      this.gfx.fillStyle(jerseyCol, 1);
      fillFastBevelRect(this.gfx, lArmX, torsoTop + 0.8 * u + lArmSwing * 0.4, armW, 4.4 * u, 0.9 * u);
      fillFastBevelRect(this.gfx, rArmX, torsoTop + 0.8 * u + rArmSwing * 0.4, armW, 4.4 * u, 0.9 * u);
      // Sleeve cuff trim
      this.gfx.fillStyle(trimCol, 0.9);
      this.gfx.fillRect(lArmX, torsoTop + 4.5 * u + lArmSwing * 0.4, armW, 0.75 * u);
      this.gfx.fillRect(rArmX, torsoTop + 4.5 * u + rArmSwing * 0.4, armW, 0.75 * u);

      // Toned forearms & rounded hands
      const foreW = armW * 0.84;
      const lForeY = torsoTop + 5.1 * u + lArmSwing;
      const rForeY = torsoTop + 5.1 * u + rArmSwing;
      this.gfx.fillStyle(prof.skinTone, 1);
      fillFastBevelRect(this.gfx, lArmX + (armW - foreW) * 0.5, lForeY, foreW, 4.1 * u, 0.7 * u);
      fillFastBevelRect(this.gfx, rArmX + (armW - foreW) * 0.5, rForeY, foreW, 4.1 * u, 0.7 * u);
      fillFastCircle(this.gfx, lArmX + armW * 0.5, lForeY + 4.3 * u, 1.25 * u, 8);
      fillFastCircle(this.gfx, rArmX + armW * 0.5, rForeY + 4.3 * u, 1.25 * u, 8);
    }

    // ── 5. Neck, Sculpted Head, Ears, Hairstyle & Always-Visible Human Face ──
    const headR = 4.65 * u;
    const headCy = baseY - 30.8 * u;

    // Neck + under-chin shadow
    this.gfx.fillStyle(prof.skinTone, 1);
    fillFastBevelRect(this.gfx, cx - 1.85 * u, torsoTop - 2.3 * u, 3.7 * u, 2.9 * u, 0.6 * u);
    this.gfx.fillStyle(0x000000, 0.18);
    this.gfx.fillRect(cx - 1.75 * u, torsoTop - 2.1 * u, 3.5 * u, 0.85 * u);

    // Left & Right Ears
    this.gfx.fillStyle(prof.skinTone, 1);
    fillFastCircle(this.gfx, cx - headR * 0.96, headCy + 0.25 * u, 1.15 * u, 8);
    fillFastCircle(this.gfx, cx + headR * 0.96, headCy + 0.25 * u, 1.15 * u, 8);

    // Sculpted Cranium + Natural Jawline / Chin
    fillFastCircle(this.gfx, cx, headCy, headR, 12);
    fillFastBevelRect(
      this.gfx,
      cx - headR * 0.70,
      headCy + headR * 0.12,
      headR * 1.40,
      headR * 0.90,
      1.7 * u
    );

    let usedNumber = false;

    if (viewMode === 'front' || viewMode === 'side') {
      // V-neck collar & club crest on front of jersey
      this.gfx.fillStyle(trimCol, 1);
      this.gfx.fillTriangle(cx - 2.4 * u, torsoTop, cx + 2.4 * u, torsoTop, cx, torsoTop + 3.1 * u);
      this.gfx.fillStyle(0xFFD54F, 1);
      this.gfx.fillRect(cx + 1.9 * u, torsoTop + 2.2 * u, 1.75 * u, 1.75 * u);

      // Subtle lateral shift of facial features when looking slightly left/right
      const faceShiftX = viewMode === 'side'
        ? (facingCross >= 0 ? 1.35 * u : -1.35 * u)
        : Phaser.Math.Clamp(facingCross * 0.85 * u, -0.95 * u, 0.95 * u);
      const fx = cx + faceShiftX;

      // Eyebrows (always visible at every distance!)
      const browW = 1.65 * u;
      const browH = Math.max(0.75, 0.72 * u);
      const browY = headCy - headR * 0.26;
      this.gfx.fillStyle(prof.hairColor, 0.95);
      this.gfx.fillRect(fx - headR * 0.56, browY, browW, browH);
      this.gfx.fillRect(fx + headR * 0.16, browY, browW, browH);

      // Eyes: Crisp white sclera + dark pupils + specular eye catchlight
      const eyeW = Math.max(1.1, 1.55 * u);
      const eyeH = Math.max(0.95, 1.30 * u);
      const eyeY = headCy - headR * 0.08;
      const lEyeX = fx - headR * 0.35;
      const rEyeX = fx + headR * 0.35;

      this.gfx.fillStyle(0xFFFFFF, 0.98);
      fillFastBevelRect(this.gfx, lEyeX - eyeW * 0.5, eyeY - eyeH * 0.5, eyeW, eyeH, 0.35 * u);
      fillFastBevelRect(this.gfx, rEyeX - eyeW * 0.5, eyeY - eyeH * 0.5, eyeW, eyeH, 0.35 * u);

      const pupilR = Math.max(0.55, 0.48 * u);
      this.gfx.fillStyle(0x12141A, 1);
      fillFastCircle(this.gfx, lEyeX + faceShiftX * 0.08, eyeY, pupilR, 8);
      fillFastCircle(this.gfx, rEyeX + faceShiftX * 0.08, eyeY, pupilR, 8);

      // Nose bridge & tip shadow
      this.gfx.fillStyle(0x000000, 0.18);
      this.gfx.fillTriangle(
        fx,
        headCy - 0.1 * u,
        fx - 0.65 * u,
        headCy + 1.35 * u,
        fx + 0.65 * u,
        headCy + 1.35 * u
      );

      // Athletic mouth
      const mouthW = 2.1 * u;
      const mouthH = Math.max(0.7, 0.68 * u);
      this.gfx.fillStyle(0x8E4A3B, 0.92);
      this.gfx.fillRect(fx - mouthW * 0.5, headCy + headR * 0.46, mouthW, mouthH);

      // Hairstyle on upper forehead/crown (never covering the eyes!)
      this.draw3DHairStyle(cx, headCy, headR, u, prof.hairColor, prof.hairStyle, false);

      // Front squad number on chest / stomach
      if (numIdx < this.numberPool.length && torsoH >= 7.5) {
        const numTxt = this.numberPool[numIdx];
        numTxt.setText(`${prof.jerseyNumber}`);
        numTxt.setColor(isGK ? '#FFD54F' : (isUser ? '#FFD54F' : '#FFFFFF'));
        numTxt.setPosition(cx, torsoTop + torsoH * 0.56);
        numTxt.setScale(Phaser.Math.Clamp((torsoH / 32) * 0.92, 0.26, 1.35));
        numTxt.setVisible(true);
        usedNumber = true;
      }
    } else {
      // True Back View: Back collar band + subtle number plate + natural back haircut (ears & neck stay skin-colored!)
      this.gfx.fillStyle(trimCol, 0.95);
      this.gfx.fillRect(cx - 2.6 * u, torsoTop + 0.1 * u, 5.2 * u, 1.15 * u);
      this.gfx.fillStyle(0x000000, 0.20);
      fillFastBevelRect(this.gfx, cx - 3.8 * u, torsoTop + 1.8 * u, 7.6 * u, 7.2 * u, 1.2 * u);

      this.draw3DHairStyle(cx, headCy, headR, u, prof.hairColor, prof.hairStyle, true);

      if (numIdx < this.numberPool.length && torsoH >= 6.5) {
        const numTxt = this.numberPool[numIdx];
        numTxt.setText(`${prof.jerseyNumber}`);
        numTxt.setColor(isUser ? '#FFD54F' : '#FFFFFF');
        numTxt.setPosition(cx, torsoTop + torsoH * 0.50);
        numTxt.setScale(Phaser.Math.Clamp((torsoH / 27) * 1.08, 0.28, 1.65));
        numTxt.setVisible(true);
        usedNumber = true;
      }
    }

    // Floating Name + Squad Number Tag above nearby/mid-range players & Goalkeepers
    let usedLabel = false;
    if (labelIdx < this.labelPool.length && (footCam.cz < 860 || isGK)) {
      const lbl = this.labelPool[labelIdx];
      lbl.setText(isGK ? `🧤 #${prof.jerseyNumber} ${actor.name}` : `#${prof.jerseyNumber} ${actor.name}`);
      lbl.setColor(isGK ? '#FFD54F' : (isUser ? '#90CAF9' : '#FF9E9E'));
      lbl.setPosition(cx, headCy - headR - 10 * uiScale);
      lbl.setScale(Phaser.Math.Clamp(uiScale * (250 / Math.max(150, footCam.cz)), 0.56 * uiScale, 1.05 * uiScale));
      lbl.setVisible(true);
      usedLabel = true;
    }

    return { usedLabel, usedNumber };
  }

  /**
   * Renders 3D player hair on the upper cranium (front view) or upper-back skull (back view)
   * without ever covering the face or turning the head into a solid black circle.
   */
  private draw3DHairStyle(
    cx: number,
    headCy: number,
    headR: number,
    u: number,
    hairColor: number,
    style: string,
    isBack: boolean
  ) {
    this.gfx.fillStyle(hairColor, 1);

    if (isBack) {
      // Upper cranium dome + tapered nape haircut (leaves ears, lower jaw & skin neck clearly visible!)
      fillFastDome(this.gfx, cx, headCy - headR * 0.14, headR * 1.03, Math.PI * 0.82, Math.PI * 2.18, 8);
      fillFastBevelRect(
        this.gfx,
        cx - headR * 0.78,
        headCy - headR * 0.22,
        headR * 1.56,
        headR * 0.70,
        1.5 * u
      );
    } else {
      // High forehead crown so eyebrows and eyes have full breathing room
      fillFastDome(this.gfx, cx, headCy - headR * 0.26, headR * 1.02, Math.PI * 0.92, Math.PI * 2.08, 7);
      // Sideburns / temple taper
      this.gfx.fillRect(cx - headR * 0.96, headCy - headR * 0.35, 1.15 * u, 2.1 * u);
      this.gfx.fillRect(cx + headR * 0.96 - 1.15 * u, headCy - headR * 0.35, 1.15 * u, 2.1 * u);
    }

    if (style === 'spiky') {
      this.gfx.fillTriangle(cx - 2.8 * u, headCy - headR * 0.85, cx - 0.8 * u, headCy - headR * 1.42, cx + 0.6 * u, headCy - headR * 0.85);
      this.gfx.fillTriangle(cx - 0.4 * u, headCy - headR * 0.85, cx + 1.6 * u, headCy - headR * 1.46, cx + 3.1 * u, headCy - headR * 0.85);
    } else if (style === 'curly') {
      fillFastCircle(this.gfx, cx - 2.6 * u, headCy - headR * 0.82, 1.75 * u, 8);
      fillFastCircle(this.gfx, cx, headCy - headR * 1.02, 1.95 * u, 8);
      fillFastCircle(this.gfx, cx + 2.6 * u, headCy - headR * 0.82, 1.75 * u, 8);
    } else if (style === 'bun') {
      fillFastCircle(this.gfx, cx, headCy - headR * 1.18, 1.85 * u, 8);
    } else if (style === 'swept') {
      fillFastEllipse(this.gfx, cx + 0.9 * u, headCy - headR * 0.88, 2.9 * u, 1.15 * u, 8);
    }

    // Subtle specular hair shine
    this.gfx.fillStyle(0xFFFFFF, 0.14);
    this.gfx.fillRect(cx - 1.4 * u, headCy - headR * 0.92, 2.8 * u, 0.75 * u);
  }

  private drawReferee3D(ref: FPRefereeView, labelIdx: number, uiScale: number): boolean {
    const footCam = this.toCameraSpace(ref.wx, ref.wy, 0);
    if (footCam.cz <= NEAR_Z) return false;
    const fp = this.projectCamPt(footCam);
    if (fp.sx < -120 || fp.sx > this.screenW + 120) return false;

    const u = Phaser.Math.Clamp(fp.scale * 1.22, 0.48 * uiScale, 8.8 * uiScale);
    const cx = fp.sx;
    const isMoving = Math.hypot(ref.vx, ref.vy) > 10;
    const stride = isMoving ? Math.sin(ref.animTimer * 13) : 0;
    const bounce = isMoving ? Math.abs(Math.sin(ref.animTimer * 13)) * 1.1 * u : 0;
    const baseY = fp.sy - bounce;

    this.gfx.fillStyle(0x000000, 0.36);
    fillFastEllipse(this.gfx, cx, fp.sy, 7.0 * u, 2.6 * u, 8);

    const shirtCol = ref.isLinesman ? 0x22252A : 0xDDF02A;
    const skin = 0xF2CEA6;
    const torsoW = 11.2 * u;
    const torsoH = 10.4 * u;
    const headR = 4.45 * u;
    const legSpread = 2.45 * u;
    const legW = 2.8 * u;

    // Legs, Black Referee Socks & Boots
    this.gfx.fillStyle(skin, 1);
    fillFastBevelRect(this.gfx, cx - legSpread - legW * 0.5, baseY - 10.2 * u + stride * 0.8 * u, legW, 3.6 * u, 0.6 * u);
    fillFastBevelRect(this.gfx, cx + legSpread - legW * 0.5, baseY - 10.2 * u - stride * 0.8 * u, legW, 3.6 * u, 0.6 * u);
    this.gfx.fillStyle(0x15171C, 1);
    fillFastBevelRect(this.gfx, cx - legSpread - legW * 0.52, baseY - 6.8 * u + stride * 0.9 * u, legW * 1.04, 6.8 * u, 0.7 * u);
    fillFastBevelRect(this.gfx, cx + legSpread - legW * 0.52, baseY - 6.8 * u - stride * 0.9 * u, legW * 1.04, 6.8 * u, 0.7 * u);

    // Black Referee Shorts
    const shortsTop = baseY - 15.2 * u;
    fillFastBevelRect(this.gfx, cx - torsoW * 0.45, shortsTop, torsoW * 0.9, 5.2 * u, 1.3 * u);

    // Neon Yellow / Black Referee Shirt & Collar
    const torsoTop = baseY - 25.4 * u;
    this.gfx.fillStyle(shirtCol, 1);
    fillFastBevelRect(this.gfx, cx - torsoW * 0.5, torsoTop, torsoW, torsoH, 2.0 * u);
    this.gfx.fillStyle(0x15171C, 1);
    this.gfx.fillTriangle(cx - 2.2 * u, torsoTop, cx + 2.2 * u, torsoTop, cx, torsoTop + 2.8 * u);
    this.gfx.fillRect(cx + 1.6 * u, torsoTop + 2.4 * u, 2.0 * u, 2.2 * u);

    // Articulated Referee Arms
    const armW = 2.5 * u;
    this.gfx.fillStyle(shirtCol, 1);
    fillFastBevelRect(this.gfx, cx - torsoW * 0.5 - armW * 0.7, torsoTop + 0.8 * u, armW, 4.2 * u, 0.8 * u);
    fillFastBevelRect(this.gfx, cx + torsoW * 0.5 - armW * 0.3, torsoTop + 0.8 * u, armW, 4.2 * u, 0.8 * u);
    this.gfx.fillStyle(skin, 1);
    fillFastBevelRect(this.gfx, cx - torsoW * 0.5 - armW * 0.6, torsoTop + 4.8 * u, armW * 0.82, 3.8 * u, 0.6 * u);
    fillFastBevelRect(this.gfx, cx + torsoW * 0.5 - armW * 0.2, torsoTop + 4.8 * u, armW * 0.82, 3.8 * u, 0.6 * u);

    // Yellow Card held overhead if foul called, or Linesman Checkered Flag!
    if (ref.signalState === 'yellow_card') {
      this.gfx.fillStyle(0xFFE600, 1);
      this.gfx.fillRect(cx + torsoW * 0.45, baseY - 36.5 * u, 4.5 * u, 6.8 * u);
    } else if (ref.isLinesman) {
      this.gfx.lineStyle(Math.max(1, 1.4 * u), 0xEAECEF, 1);
      this.gfx.lineBetween(cx + torsoW * 0.5, torsoTop + 3 * u, cx + torsoW * 1.15, torsoTop - 5 * u);
      this.gfx.fillStyle(0xFF3B30, 1);
      this.gfx.fillRect(cx + torsoW * 0.95, torsoTop - 6 * u, 5.2 * u, 3.8 * u);
      this.gfx.fillStyle(0xFFD54F, 1);
      this.gfx.fillRect(cx + torsoW * 0.95, torsoTop - 6 * u, 2.6 * u, 1.9 * u);
    }

    // Neck, Head, Face & Hair
    const headCy = baseY - 29.8 * u;
    this.gfx.fillStyle(skin, 1);
    fillFastBevelRect(this.gfx, cx - 1.7 * u, torsoTop - 2.1 * u, 3.4 * u, 2.6 * u, 0.5 * u);
    fillFastCircle(this.gfx, cx - headR * 0.95, headCy + 0.2 * u, 1.05 * u, 8);
    fillFastCircle(this.gfx, cx + headR * 0.95, headCy + 0.2 * u, 1.05 * u, 8);
    fillFastCircle(this.gfx, cx, headCy, headR, 12);

    // Referee Face (eyebrows, eyes, pupils, whistle/mouth)
    this.gfx.fillStyle(0x241B14, 0.95);
    this.gfx.fillRect(cx - headR * 0.52, headCy - headR * 0.25, 1.5 * u, 0.68 * u);
    this.gfx.fillRect(cx + headR * 0.16, headCy - headR * 0.25, 1.5 * u, 0.68 * u);
    this.gfx.fillStyle(0xFFFFFF, 0.98);
    this.gfx.fillRect(cx - headR * 0.46, headCy - headR * 0.10, 1.4 * u, 1.15 * u);
    this.gfx.fillRect(cx + headR * 0.14, headCy - headR * 0.10, 1.4 * u, 1.15 * u);
    this.gfx.fillStyle(0x14161C, 1);
    this.gfx.fillRect(cx - headR * 0.36, headCy - headR * 0.06, 0.85 * u, 0.85 * u);
    this.gfx.fillRect(cx + headR * 0.24, headCy - headR * 0.06, 0.85 * u, 0.85 * u);
    this.gfx.fillStyle(0xCFD8DC, 1);
    fillFastCircle(this.gfx, cx, headCy + headR * 0.44, 0.85 * u, 8);

    // Referee Haircut
    this.gfx.fillStyle(0x241B14, 1);
    fillFastDome(this.gfx, cx, headCy - headR * 0.26, headR * 1.02, Math.PI * 0.92, Math.PI * 2.08, 7);

    if (!ref.isLinesman && labelIdx < this.labelPool.length && footCam.cz < 680) {
      const lbl = this.labelPool[labelIdx];
      lbl.setText('주심');
      lbl.setColor('#E6F542');
      lbl.setPosition(cx, headCy - headR - 9 * uiScale);
      lbl.setScale(0.65 * uiScale);
      lbl.setVisible(true);
      return true;
    }
    return false;
  }

  /**
   * Renders a 3D Slalom Training Cone obstacle + Gate flag marker in 1st-person perspective
   */
  private drawCone3D(cone: FPTrainingConeView, labelIdx: number, uiScale: number): boolean {
    const baseCam = this.toCameraSpace(cone.wx, cone.wy, 0);
    if (baseCam.cz <= NEAR_Z) return false;
    const bp = this.projectCamPt(baseCam);
    if (bp.sx < -140 || bp.sx > this.screenW + 140) return false;

    const u = Phaser.Math.Clamp(bp.scale * 1.24, 0.50 * uiScale, 9.2 * uiScale);
    const cx = bp.sx;
    const baseY = bp.sy;
    const tiltShift = (cone.tiltAngle || 0) * 0.25 * u;

    // Ground shadow
    this.gfx.fillStyle(0x000000, 0.40);
    fillFastEllipse(this.gfx, cx + 0.8 * u, baseY + 0.8 * u, 7.2 * u, 2.7 * u, 8);

    // Weighted Orange Rubber Base Plate
    this.gfx.fillStyle(0xB8371D, 1);
    fillFastBevelRect(this.gfx, cx - 6.4 * u, baseY - 2.2 * u, 12.8 * u, 2.8 * u, 0.8 * u);
    this.gfx.fillStyle(0xE65C24, 1);
    fillFastBevelRect(this.gfx, cx - 5.8 * u, baseY - 2.6 * u, 11.6 * u, 2.2 * u, 0.7 * u);

    // 3D Tapered Traffic Cone Body
    const coneH = 17.5 * u;
    const topX = cx + tiltShift;
    const topY = baseY - coneH;
    this.gfx.fillStyle(0xF37022, 1);
    this.gfx.fillTriangle(cx - 4.8 * u, baseY - 1.6 * u, cx + 4.8 * u, baseY - 1.6 * u, topX + 1.5 * u, topY);
    this.gfx.fillTriangle(cx - 4.8 * u, baseY - 1.6 * u, topX + 1.5 * u, topY, topX - 1.5 * u, topY);

    // Left 3D highlight face
    this.gfx.fillStyle(0xFF944D, 0.65);
    this.gfx.fillTriangle(cx - 4.4 * u, baseY - 1.6 * u, cx - 0.5 * u, baseY - 1.6 * u, topX - 0.3 * u, topY);

    // White Reflective Safety Collar Stripe
    const stripeY1 = baseY - coneH * 0.66;
    const stripeY2 = baseY - coneH * 0.44;
    this.gfx.fillStyle(0xF5F7FA, 0.96);
    fillFastBevelRect(this.gfx, cx - 3.1 * u + tiltShift * 0.5, stripeY1, 6.2 * u, stripeY2 - stripeY1, 0.4 * u);

    // Rounded Tip Cap
    this.gfx.fillStyle(0xFF9F59, 1);
    fillFastCircle(this.gfx, topX, topY, 1.5 * u, 8);

    // Floating Slalom Gate Label (#1..#8 or ✓)
    if (labelIdx < this.labelPool.length && baseCam.cz < 780) {
      const gateCam = this.toCameraSpace(cone.wx, cone.wy + cone.gateSide * 54, 16);
      const gp = gateCam.cz > NEAR_Z ? this.projectCamPt(gateCam) : { sx: topX, sy: topY - 10 * uiScale };
      const lbl = this.labelPool[labelIdx];
      if (cone.passed) {
        lbl.setText(`✓ #${cone.index + 1} 돌파`);
        lbl.setColor('#2ECC71');
      } else if (cone.isNextTarget) {
        lbl.setText(`▶ #${cone.index + 1} 통과 구간`);
        lbl.setColor('#00E5FF');
      } else {
        lbl.setText(`#${cone.index + 1} 게이트`);
        lbl.setColor('#FFD54F');
      }
      lbl.setPosition(gp.sx, gp.sy);
      lbl.setScale(Phaser.Math.Clamp(uiScale * (240 / Math.max(140, baseCam.cz)), 0.55 * uiScale, 1.0 * uiScale));
      lbl.setVisible(true);
      return true;
    }
    return false;
  }

  private drawBall3D(ballWx: number, ballWy: number, ballWz: number, rollAngle: number) {
    const shadowCam = this.toCameraSpace(ballWx, ballWy, 0.1);
    if (shadowCam.cz > NEAR_Z) {
      const sp = this.projectCamPt(shadowCam);
      const shrink = Math.max(0.35, 1 - ballWz / 160);
      this.gfx.fillStyle(0x000000, 0.38 * shrink);
      fillFastEllipse(this.gfx, sp.sx, sp.sy, Math.max(1.5, 5.5 * sp.scale * shrink), Math.max(0.8, 2.1 * sp.scale * shrink), 8);
    }

    const ballCam = this.toCameraSpace(ballWx, ballWy, ballWz + 4.5);
    if (ballCam.cz <= NEAR_Z) return;

    const bp = this.projectCamPt(ballCam);
    const r = Phaser.Math.Clamp(4.8 * bp.scale, 3.0, 95);

    this.gfx.fillStyle(0x1A1A1E, 0.92);
    fillFastCircle(this.gfx, bp.sx, bp.sy, r + Math.max(0.8, r * 0.09), 12);
    this.gfx.fillStyle(0xF5F6F8, 1);
    fillFastCircle(this.gfx, bp.sx, bp.sy, r, 12);

    // Rotating 3D Pentagon Patches
    this.gfx.fillStyle(0x1E2026, 0.9);
    const ox = Math.cos(rollAngle) * r * 0.26;
    const oy = Math.sin(rollAngle) * r * 0.22;
    fillFastCircle(this.gfx, bp.sx + ox, bp.sy + oy, r * 0.27, 8);
    for (let k = 0; k < 4; k++) {
      const a = rollAngle + (k * Math.PI) / 2;
      fillFastCircle(this.gfx, bp.sx + Math.cos(a) * r * 0.62, bp.sy + Math.sin(a) * r * 0.56, r * 0.17, 8);
    }

    // Specular 3D shine
    this.gfx.fillStyle(0xFFFFFF, 0.88);
    fillFastCircle(this.gfx, bp.sx - r * 0.32, bp.sy - r * 0.34, r * 0.22, 8);
  }

  /**
   * Draws peripheral first-person boots (when sprinting/kicking) or Goalkeeper Gloves (when GK / diving)
   */
  private drawFirstPersonHandsAndFeet(state: FPRenderState, uiScale: number) {
    const cx = this.screenW * 0.5;
    const bottomY = this.screenH;

    if (state.isControlledGK || state.gkDiveAnimMs > 0) {
      const divePush = state.gkDiveAnimMs > 0 ? 45 * uiScale : 0;
      const bob = state.isMoving ? Math.sin(state.stridePhase * 12) * 8 * uiScale : 0;

      for (const side of [-1, 1]) {
        const gx = cx + side * (220 * uiScale - divePush * 0.5);
        const gy = bottomY - 75 * uiScale - divePush + side * bob;
        this.gfx.fillStyle(0x1E824C, 0.95);
        fillFastBevelRect(this.gfx, gx - 26 * uiScale, gy + 18 * uiScale, 52 * uiScale, 80 * uiScale, 10 * uiScale);
        this.gfx.fillStyle(0xD4AF37, 0.95);
        fillFastBevelRect(this.gfx, gx - 36 * uiScale, gy - 34 * uiScale, 72 * uiScale, 60 * uiScale, 14 * uiScale);
        this.gfx.fillStyle(0xF5F7FA, 0.98);
        fillFastBevelRect(this.gfx, gx - 33 * uiScale, gy - 31 * uiScale, 66 * uiScale, 54 * uiScale, 12 * uiScale);
      }
      return;
    }

    const kickRatio = state.kickAnimMs > 0 ? state.kickAnimMs / 220 : 0;
    if (state.isMoving || kickRatio > 0) {
      const leftSwing = Math.sin(state.stridePhase * 13);
      const rightSwing = kickRatio > 0 ? 1.35 * Math.sin(kickRatio * Math.PI) : -leftSwing;

      if (leftSwing > 0.15) {
        const ly = bottomY + 26 * uiScale - leftSwing * 52 * uiScale;
        const lx = cx - 95 * uiScale;
        this.gfx.fillStyle(0x245484, 0.92);
        fillFastBevelRect(this.gfx, lx - 20 * uiScale, ly + 14 * uiScale, 40 * uiScale, 50 * uiScale, 7 * uiScale);
        this.gfx.fillStyle(0xD4AF37, 0.9);
        fillFastEllipse(this.gfx, lx, ly, 23 * uiScale, 32 * uiScale, 12);
        this.gfx.fillStyle(0x16181D, 0.96);
        fillFastEllipse(this.gfx, lx, ly, 21 * uiScale, 29 * uiScale, 12);
      }

      if (rightSwing > 0.15) {
        const ry = bottomY + 26 * uiScale - rightSwing * (kickRatio > 0 ? 92 : 52) * uiScale;
        const rx = cx + (kickRatio > 0 ? 35 : 95) * uiScale;
        this.gfx.fillStyle(0x245484, 0.92);
        fillFastBevelRect(this.gfx, rx - 20 * uiScale, ry + 14 * uiScale, 40 * uiScale, 50 * uiScale, 7 * uiScale);
        this.gfx.fillStyle(0xD4AF37, 0.9);
        fillFastEllipse(this.gfx, rx, ry, 24 * uiScale, 34 * uiScale, 12);
        this.gfx.fillStyle(0x16181D, 0.96);
        fillFastEllipse(this.gfx, rx, ry, 22 * uiScale, 31 * uiScale, 12);
      }
    }
  }

  private drawCrosshairAndBallCompass(state: FPRenderState, uiScale: number) {
    const cx = this.screenW * 0.5;
    const cy = this.screenH * 0.44;

    // Subtle 1st-person center aim reticle & Shot Charge Power Ring
    this.gfx.lineStyle(1.6 * uiScale, 0xFFFFFF, 0.42);
    this.gfx.strokeCircle(cx, cy, 10 * uiScale);
    this.gfx.fillStyle(0xD4AF37, 0.75);
    this.gfx.fillCircle(cx, cy, 2.2 * uiScale);

    if (state.isChargingShot && state.shotCharge > 0) {
      const r = 26 * uiScale;
      const col = state.shotCharge > 0.75 ? 0xE74C3C : state.shotCharge > 0.4 ? 0xF1C40F : 0x2ECC71;
      this.gfx.lineStyle(5 * uiScale, 0x141418, 0.75);
      this.gfx.strokeCircle(cx, cy, r);
      this.gfx.lineStyle(4.5 * uiScale, col, 0.98);
      this.gfx.beginPath();
      this.gfx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.shotCharge, false);
      this.gfx.strokePath();
    }

    // Off-Screen Ball Direction Indicator (Smooth rounded glass pill, safely clamped inside viewport!)
    const angToBall = Phaser.Math.Angle.Wrap(
      Math.atan2(state.ballWy - state.eyeWy, state.ballWx - state.eyeWx) - state.yaw
    );
    const distBall = Math.hypot(state.ballWx - state.eyeWx, state.ballWy - state.eyeWy);

    if (Math.abs(angToBall) > 0.62 && distBall > 28) {
      this.ballIndicatorText.setVisible(true);
      this.ballIndicatorText.setScale(uiScale);

      let indText = '';
      let targetX = cx;
      let targetY = this.screenH * 0.52;

      if (Math.abs(angToBall) > 2.35) {
        indText = '▼  공이 뒤쪽에 있습니다 (A/D 회전)';
        targetX = cx;
        targetY = this.screenH - 76 * uiScale;
      } else if (angToBall < 0) {
        indText = '◀  공 방향 (A)';
        targetX = 110 * uiScale;
      } else {
        indText = '(D) 공 방향  ▶';
        targetX = this.screenW - 110 * uiScale;
      }

      if (this.ballIndicatorText.text !== indText) {
        this.ballIndicatorText.setText(indText);
      }

      const pillW = this.ballIndicatorText.displayWidth + 32 * uiScale;
      const pillH = this.ballIndicatorText.displayHeight + 16 * uiScale;
      const safeMargin = 22 * uiScale;
      const clampedX = Phaser.Math.Clamp(targetX, pillW * 0.5 + safeMargin, this.screenW - pillW * 0.5 - safeMargin);
      this.ballIndicatorText.setPosition(clampedX, targetY);

      this.hudOverlayGfx.fillStyle(0x131722, 0.88);
      this.hudOverlayGfx.fillRoundedRect(clampedX - pillW * 0.5, targetY - pillH * 0.5, pillW, pillH, pillH * 0.5);
      this.hudOverlayGfx.lineStyle(1.5 * uiScale, 0xD4AF37, 0.72);
      this.hudOverlayGfx.strokeRoundedRect(clampedX - pillW * 0.5, targetY - pillH * 0.5, pillW, pillH, pillH * 0.5);
    } else {
      this.ballIndicatorText.setVisible(false);
    }
  }
}
