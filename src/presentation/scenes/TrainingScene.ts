/* ================================================================
   TRUE 3D PERSPECTIVE TRAINING SCENE — Authentic Slalom Ball Dribbling
   Features:
   - Real 3D pinhole perspective stadium (grandstand, floodlights, raised turf, 3D vertical goals)
   - Independent 3D Soccer Ball Close-Control Dribble Physics (stride touches, sprint knock-ons, friction)
   - Cones are REAL 3D physical obstacles (never "eaten"/collected; hitting a cone deflects the ball!)
   - Slalom Dribble Gates beside each cone detect genuine ball dribbling around the cones
   ================================================================ */

import Phaser from 'phaser';
import {
  TRAINING_CONE_COUNT,
  TRAINING_TIME_LIMIT,
  TRAINING_STAT_MAX,
} from '../../infrastructure/config/game-config';
import { gameStore } from '../../infrastructure/stores/gameStore';
import {
  resolvePlayerVisualProfile,
  drawDetailedIsoPlayer,
  drawDetailedReferee,
  drawIndividualSpectator,
  fillFastBevelRect,
  fillFastEllipse,
  type PlayerVisualProfile,
} from './PlayerAppearance';
import type { TrainingType } from '../../shared/types/index';

export interface TrainingSceneData {
  playerId: string;
  playerName: string;
  trainingType: TrainingType;
  currentStat: number;
}

interface SlalomCone3D {
  index: number;
  wx: number;
  wy: number;
  gateSide: -1 | 1; // -1 = upper slalom lane, +1 = lower slalom lane
  passed: boolean;
  ballNetAngle: number;
  prevBallTheta: number;
  hasPrevTheta: boolean;
  wobbleCooldown: number;
  tiltAngle: number;
  tiltVel: number;
  coneContainer: Phaser.GameObjects.Container;
  gateGfx: Phaser.GameObjects.Graphics;
  gateLabel: Phaser.GameObjects.Text;
}

const WORLD_W = 1000;
const WORLD_H = 560;
const CONE_SOLID_PLAYER_R = 19;
const CONE_SOLID_BALL_R = 15;
const BALL_ORBIT_SWEEP_RAD = Math.PI * 0.58;

export class TrainingScene extends Phaser.Scene {
  private dataPayload!: TrainingSceneData;

  // Player 3D World State
  private playerWx = 65;
  private playerWy = WORLD_H / 2;
  private playerVx = 0;
  private playerVy = 0;
  private moveHeading = 0;
  private facingSign = 1;
  private playerAnimTimer = 0;
  private prevStrideSign = 1;

  // Independent Soccer Ball 3D World Physics State (with Magnus spin & 3D restitution)
  private ballWx = 86;
  private ballWy = WORLD_H / 2;
  private ballWz = 0;
  private ballVx = 0;
  private ballVy = 0;
  private ballVz = 0;
  private ballSpin = 0;
  private ballRollAngle = 0;
  private ballLooseStunMs = 0;
  private finishingShotActive = false;

  // 3D Visual Objects
  private envGfx!: Phaser.GameObjects.Graphics;
  private coachContainer!: Phaser.GameObjects.Container;
  private guidePathGfx!: Phaser.GameObjects.Graphics;
  private dribbleLinkGfx!: Phaser.GameObjects.Graphics;
  private playerContainer!: Phaser.GameObjects.Container;
  private playerBodyGfx!: Phaser.GameObjects.Graphics;
  private playerShadowGfx!: Phaser.GameObjects.Graphics;
  private playerJerseyNumText!: Phaser.GameObjects.Text;
  private playerNameTag!: Phaser.GameObjects.Text;
  private playerProfile!: PlayerVisualProfile;
  private ballContainer!: Phaser.GameObjects.Container;
  private ballGfx!: Phaser.GameObjects.Graphics;
  private ballShadowGfx!: Phaser.GameObjects.Graphics;

  private cones: SlalomCone3D[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private sprintKeyShift!: Phaser.Input.Keyboard.Key;
  private shootKeyE!: Phaser.Input.Keyboard.Key;

  private timeLeft = TRAINING_TIME_LIMIT;
  private timerText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private isFinished = false;
  private isStarted = false;
  private countdown = 3;
  private countdownText!: Phaser.GameObjects.Text;
  private passedCount = 0;

  constructor() {
    super({ key: 'TrainingScene' });
  }

  init(data?: TrainingSceneData) {
    const store = gameStore.getState();
    const fallbackPlayer = store.getOwnedPlayers()[0] || store.allPlayers[0];

    this.dataPayload = {
      playerId: data?.playerId || fallbackPlayer?.id || 'p_son',
      playerName: data?.playerName || fallbackPlayer?.name || '선수',
      trainingType: data?.trainingType || 'strength',
      currentStat: data?.currentStat ?? 70,
    };
    this.timeLeft = TRAINING_TIME_LIMIT;
    this.isFinished = false;
    this.isStarted = false;
    this.finishingShotActive = false;
    this.countdown = 3;
    this.passedCount = 0;
    this.cones = [];

    this.playerWx = 65;
    this.playerWy = WORLD_H / 2;
    this.playerVx = 0;
    this.playerVy = 0;
    this.moveHeading = 0;
    this.facingSign = 1;
    this.playerAnimTimer = 0;
    this.prevStrideSign = 1;

    this.ballWx = 86;
    this.ballWy = WORLD_H / 2;
    this.ballWz = 0;
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballVz = 0;
    this.ballSpin = 0;
    this.ballRollAngle = 0;
    this.ballLooseStunMs = 0;
  }

  private getViewScale(): number {
    return Math.min(this.scale.width / 1280, this.scale.height / 720);
  }

  /**
   * Real 3D Pinhole Perspective Projection (HiDPI & Aspect-Ratio Responsive):
   * Maps world (wx, wy, wz) -> screen (x, y, scale)
   */
  private project3D(wx: number, wy: number, wz = 0): { x: number; y: number; scale: number } {
    const { width, height } = this.scale;
    const vs = this.getViewScale();
    const t = wy / WORLD_H;
    const baseScale = Phaser.Math.Clamp(0.55 + 0.52 * t, 0.42, 1.22);
    const scale = baseScale * vs;
    const depthCurve = t >= 0 ? Math.pow(t, 1.14) : -Math.pow(-t, 0.92);
    const horizonTop = height * 0.285;
    const pitchScreenSpan = height * 0.618;
    const groundY = horizonTop + depthCurve * pitchScreenSpan;
    return {
      x: width / 2 + (wx - WORLD_W / 2) * scale * 1.10,
      y: groundY - wz * scale,
      scale,
    };
  }

  create() {
    const { width, height } = this.scale;
    const vs = this.getViewScale();

    const storePlayer = gameStore.getState().getPlayer(this.dataPayload.playerId);
    this.playerProfile = resolvePlayerVisualProfile(
      this.dataPayload.playerId,
      storePlayer?.position || 'ST'
    );

    // ── 1. Full 3D Stadium Training Ground (with individual spectators & sideline referee) ──
    this.envGfx = this.add.graphics().setDepth(1);
    this.draw3DTrainingComplex(this.envGfx, width, height);

    // Sideline Referee / Training Coach watching with whistle
    const coachProj = this.project3D(WORLD_W / 2, -6, 0);
    this.coachContainer = this.add.container(coachProj.x, coachProj.y)
      .setScale(coachProj.scale * 1.12)
      .setDepth(94);
    const coachGfx = this.add.graphics();
    drawDetailedReferee(coachGfx, 0, false, 'whistle', false, false);
    this.coachContainer.add(coachGfx);

    // ── 2. Ground Guide Layers ──
    this.guidePathGfx = this.add.graphics().setDepth(10);
    this.dribbleLinkGfx = this.add.graphics().setDepth(14);

    // ── 3. Top Header & HUD (Smooth Rounded Glassmorphic Pills, HiDPI scaled!) ──
    const headerBar = this.add.graphics().setDepth(2000);
    headerBar.fillStyle(0x131722, 0.88);
    headerBar.fillRoundedRect(width / 2 - 304 * vs, 12 * vs, 608 * vs, 44 * vs, 22 * vs);
    headerBar.lineStyle(1.5 * vs, 0xD4AF37, 0.72);
    headerBar.strokeRoundedRect(width / 2 - 304 * vs, 12 * vs, 608 * vs, 44 * vs, 22 * vs);

    const typeLabel = this.dataPayload.trainingType === 'strength' ? '힘(Strength) 훈련' : '심폐력(Stamina) 훈련';
    this.add.text(
      width / 2,
      34 * vs,
      `3D 콘 드리블 훈련장  ·  #${this.playerProfile.jerseyNumber} ${this.dataPayload.playerName} [${typeLabel}]`,
      {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '16px',
        color: '#FFFCF7',
        fontStyle: 'bold',
        resolution: 2,
      }
    ).setOrigin(0.5).setScale(vs).setDepth(2001);

    const hudPanel = this.add.graphics().setDepth(2000);
    hudPanel.fillStyle(0x131722, 0.86);
    hudPanel.fillRoundedRect(24 * vs, 66 * vs, 248 * vs, 68 * vs, 16 * vs);
    hudPanel.lineStyle(1.4 * vs, 0xD4AF37, 0.58);
    hudPanel.strokeRoundedRect(24 * vs, 66 * vs, 248 * vs, 68 * vs, 16 * vs);

    this.timerText = this.add.text(40 * vs, 77 * vs, `남은 시간  ${this.timeLeft}s`, {
      fontFamily: 'Pretendard, monospace',
      fontSize: '16px',
      color: '#FFFCF7',
      fontStyle: 'bold',
      resolution: 2,
    }).setScale(vs).setDepth(2001);

    this.countText = this.add.text(40 * vs, 104 * vs, `드리블 돌파  0 / ${TRAINING_CONE_COUNT}`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '16px',
      color: '#F2D68A',
      fontStyle: 'bold',
      resolution: 2,
    }).setScale(vs).setDepth(2001);

    // Bottom Controls Guide Pill
    const guideBar = this.add.graphics().setDepth(2000);
    guideBar.fillStyle(0x131722, 0.86);
    guideBar.fillRoundedRect(width / 2 - 360 * vs, height - 44 * vs, 720 * vs, 32 * vs, 16 * vs);
    guideBar.lineStyle(1.3 * vs, 0xD4AF37, 0.52);
    guideBar.strokeRoundedRect(width / 2 - 360 * vs, height - 44 * vs, 720 * vs, 32 * vs, 16 * vs);

    this.add.text(
      width / 2,
      height - 28 * vs,
      `W,A,S,D 드리블  ·  Shift 치고 달리기  ·  E 킥/슈팅  ·  ESC 나가기`,
      {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '12px',
        color: '#EFEFEF',
        fontStyle: 'bold',
        resolution: 2,
      }
    ).setOrigin(0.5).setScale(vs).setDepth(2001);

    this.statusText = this.add.text(width / 2, height / 2, '', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '20px',
      color: '#FFFCF7',
      align: 'center',
      resolution: 2,
    }).setOrigin(0.5).setScale(vs).setVisible(false).setDepth(3000);

    // ── 4. Keyboard Inputs ──
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasdKeys = this.input.keyboard.addKeys('W,A,S,D') as any;
      this.sprintKeyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.shootKeyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

      this.shootKeyE.on('down', () => {
        if (this.isStarted && !this.isFinished && !this.finishingShotActive) {
          const distBall = Phaser.Math.Distance.Between(this.playerWx, this.playerWy, this.ballWx, this.ballWy);
          if (distBall < 48 && this.passedCount >= TRAINING_CONE_COUNT) {
            this.triggerCelebrationGoalShot();
          } else if (distBall < 44) {
            // Forward tap kick with slight curve spin
            this.ballVx = Math.cos(this.moveHeading) * 335;
            this.ballVy = Math.sin(this.moveHeading) * 335;
            this.ballVz = 45;
            this.ballLooseStunMs = 180;
          }
        }
      });

      const esc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      esc.on('down', () => this.exitTraining());
    }

    // ── 5. Spawn Real 3D Slalom Obstacle Cones & Outer Dribble Gates ──
    const firstWx = 175;
    const lastWx = 845;
    const stepWx = (lastWx - firstWx) / Math.max(1, TRAINING_CONE_COUNT - 1);

    for (let i = 0; i < TRAINING_CONE_COUNT; i++) {
      const cwx = firstWx + i * stepWx;
      const cwy = WORLD_H / 2 + (i % 2 === 0 ? 18 : -18);
      const gateSide: -1 | 1 = i % 2 === 0 ? -1 : 1; // Alternate: pass ABOVE #1, BELOW #2, ABOVE #3...

      const gateGfx = this.add.graphics().setDepth(12);

      // Cone stays a real physical orange training pylon!
      const coneContainer = this.add.container(0, 0);
      const coneShadow = this.add.graphics();
      coneShadow.fillStyle(0x000000, 0.42);
      fillFastEllipse(coneShadow, 2, 5, 16, 6.5, 8);
      coneContainer.add(coneShadow);

      const coneGfx = this.add.graphics();
      this.draw3DConeObstacle(coneGfx);
      coneContainer.add(coneGfx);

      const proj = this.project3D(cwx, cwy, 0);
      coneContainer.setPosition(proj.x, proj.y);
      coneContainer.setScale(proj.scale);
      coneContainer.setDepth(100 + cwy);

      const gatePos = this.project3D(cwx, cwy + gateSide * 68, 8);
      const gateLabel = this.add.text(gatePos.x, gatePos.y, `${i + 1}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#FFD54F',
        backgroundColor: 'rgba(20,20,22,0.75)',
        padding: { x: 5, y: 1 },
        resolution: 2,
      }).setOrigin(0.5).setScale(gatePos.scale).setDepth(15);

      this.cones.push({
        index: i,
        wx: cwx,
        wy: cwy,
        gateSide,
        passed: false,
        ballNetAngle: 0,
        prevBallTheta: 0,
        hasPrevTheta: false,
        wobbleCooldown: 0,
        tiltAngle: 0,
        tiltVel: 0,
        coneContainer,
        gateGfx,
        gateLabel,
      });
    }

    this.drawSlalomGuidePath();
    this.renderDribbleGates();

    // ── 6. Spawn 3D Player (with Face & Jersey Number) & Independent 3D Soccer Ball ──
    this.playerContainer = this.add.container(0, 0);
    this.playerShadowGfx = this.add.graphics();
    this.playerShadowGfx.fillStyle(0x000000, 0.42);
    this.playerShadowGfx.fillEllipse(0, 4, 28, 12);
    this.playerContainer.add(this.playerShadowGfx);

    this.playerBodyGfx = this.add.graphics();
    drawDetailedIsoPlayer(this.playerBodyGfx, {
      primaryColor: 0x245484,
      accentTrim: 0xD4AF37,
      shortsColor: 0xF2EFE9,
      profile: this.playerProfile,
      animPhase: 0,
      isMoving: false,
      showFrontFace: true,
    });
    this.playerContainer.add(this.playerBodyGfx);

    this.playerJerseyNumText = this.add.text(-2.6, -16.8, `${this.playerProfile.jerseyNumber}`, {
      fontFamily: 'Pretendard, Impact, sans-serif',
      fontSize: '9.5px',
      fontStyle: 'bold',
      color: '#FFD54F',
      stroke: '#111114',
      strokeThickness: 2.2,
      resolution: 2,
    }).setOrigin(0.5);
    this.playerContainer.add(this.playerJerseyNumText);

    this.playerNameTag = this.add.text(0, -44, `#${this.playerProfile.jerseyNumber} ${this.dataPayload.playerName}`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      backgroundColor: 'rgba(20,20,22,0.8)',
      padding: { x: 5, y: 2 },
      resolution: 2,
    }).setOrigin(0.5);
    this.playerContainer.add(this.playerNameTag);

    this.ballShadowGfx = this.add.graphics();
    this.ballShadowGfx.fillStyle(0x000000, 0.42);
    this.ballShadowGfx.fillEllipse(0, 0, 17, 7.5);

    this.ballContainer = this.add.container(0, 0);
    this.ballGfx = this.add.graphics();
    this.draw3DSoccerBall(this.ballGfx);
    this.ballContainer.add(this.ballGfx);

    this.syncPlayerAndBall3D(0);

    // ── 7. Countdown ──
    this.countdownText = this.add.text(width / 2, height / 2 - 20 * vs, '3', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '68px',
      color: '#D4AF37',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
      resolution: 2,
    }).setOrigin(0.5).setScale(vs).setDepth(2500);

    const timerEvent = this.time.addEvent({
      delay: 750,
      repeat: 3,
      callback: () => {
        this.countdown--;
        if (this.countdown > 0) {
          this.countdownText.setText(`${this.countdown}`);
        } else if (this.countdown === 0) {
          this.countdownText.setText('DRIBBLE!');
        } else {
          this.countdownText.destroy();
          this.isStarted = true;
          this.startExerciseTimer();
          timerEvent.remove();
        }
      },
    });
  }

  private draw3DTrainingComplex(gfx: Phaser.GameObjects.Graphics, width: number, height: number) {
    const stadiumTime = gameStore.getState().stadiumTime;
    const isNoon = stadiumTime === 'noon';
    const isNight = stadiumTime === 'night';

    // Sky & atmospheric horizon matching selected stadium time (낮 / 정오 / 밤)
    const skyBase = isNoon ? 0x4A98E5 : (isNight ? 0x101824 : 0x4C7EB3);
    const skyMid = isNoon ? 0x7EC0F5 : (isNight ? 0x182538 : 0x7BA9D4);
    const skyHorizon = isNoon ? 0xB8E0FF : (isNight ? 0x21324A : 0xB8CFE3);

    gfx.fillStyle(skyBase, 1);
    gfx.fillRect(0, 0, width, height);
    gfx.fillStyle(skyMid, 1);
    gfx.fillRect(0, 0, width, 210);
    gfx.fillStyle(skyHorizon, isNight ? 0.55 : 0.72);
    gfx.fillRect(0, 125, width, 85);

    this.fillQuad3D(gfx, -160, -80, WORLD_W + 160, -80, WORLD_W + 180, WORLD_H + 55, -180, WORLD_H + 55, isNight ? 0x1E2026 : 0x2B2C2A, 1);

    // 3D Floodlight Pylons & Volumetric Light Cones (brighter at Night!)
    for (const tx of [80, 360, 640, 920]) {
      const base = this.project3D(tx, -65, 0);
      const top = this.project3D(tx, -65, 190);
      gfx.lineStyle(5, 0x3C434E, 1);
      gfx.lineBetween(base.x, base.y, top.x, top.y);
      gfx.fillStyle(0x1E2229, 1);
      gfx.fillRoundedRect(top.x - 18, top.y - 10, 36, 12, 2);
      gfx.fillStyle(isNight ? 0xFFF8DC : 0xE6E9EE, 0.98);
      gfx.fillRect(top.x - 15, top.y - 7, 30, 6);
      if (isNight) {
        gfx.fillStyle(0xFFF9E6, 0.075);
        gfx.beginPath();
        gfx.moveTo(top.x - 14, top.y);
        gfx.lineTo(top.x + 14, top.y);
        gfx.lineTo(base.x + 140, base.y + 220);
        gfx.lineTo(base.x - 140, base.y + 220);
        gfx.closePath();
        gfx.fillPath();
      }
    }

    // 3D North Grandstand
    const standLeftB = this.project3D(-60, -28, 0);
    const standRightB = this.project3D(WORLD_W + 60, -28, 0);
    const standRightT = this.project3D(WORLD_W + 60, -68, 72);
    const standLeftT = this.project3D(-60, -68, 72);
    gfx.fillStyle(0x23262E, 1);
    gfx.beginPath();
    gfx.moveTo(standLeftB.x, standLeftB.y);
    gfx.lineTo(standRightB.x, standRightB.y);
    gfx.lineTo(standRightT.x, standRightT.y);
    gfx.lineTo(standLeftT.x, standLeftT.y);
    gfx.closePath();
    gfx.fillPath();

    for (let r = 1; r <= 3; r++) {
      const pL = this.project3D(-50, -28 - r * 10, r * 16);
      const pR = this.project3D(WORLD_W + 50, -28 - r * 10, r * 16);
      gfx.lineStyle(2, r % 2 === 0 ? 0x3A4354 : 0xB89B68, 0.55);
      gfx.lineBetween(pL.x, pL.y, pR.x, pR.y);

      // Individual cheering stadium spectators in the North Stand!
      for (let wx = -20 + (r % 2) * 18; wx <= WORLD_W + 20; wx += 44) {
        const sp = this.project3D(wx, -28 - r * 10, r * 16 - 2);
        drawIndividualSpectator(gfx, sp.x, sp.y, sp.scale * 1.15, Math.floor(wx * 13 + r * 37));
      }
    }

    // 3D Far LED Board
    const ledBL = this.project3D(-25, -14, 0);
    const ledBR = this.project3D(WORLD_W + 25, -14, 0);
    const ledTR = this.project3D(WORLD_W + 25, -14, 24);
    const ledTL = this.project3D(-25, -14, 24);
    gfx.fillStyle(0x14161A, 1);
    gfx.beginPath();
    gfx.moveTo(ledBL.x, ledBL.y);
    gfx.lineTo(ledBR.x, ledBR.y);
    gfx.lineTo(ledTR.x, ledTR.y);
    gfx.lineTo(ledTL.x, ledTL.y);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(1.6, 0xD4AF37, 0.9);
    gfx.strokePath();

    // Raised 3D Turf Platform Curb
    this.fillQuad3D(gfx, -35, -12, WORLD_W + 35, -12, WORLD_W + 35, WORLD_H + 22, -35, WORLD_H + 22, 0x2B5930, 1);
    const curbTL = this.project3D(-35, WORLD_H + 22, 0);
    const curbTR = this.project3D(WORLD_W + 35, WORLD_H + 22, 0);
    const curbBR = this.project3D(WORLD_W + 35, WORLD_H + 22, -16);
    const curbBL = this.project3D(-35, WORLD_H + 22, -16);
    gfx.fillStyle(0x1D3B20, 1);
    gfx.beginPath();
    gfx.moveTo(curbTL.x, curbTL.y);
    gfx.lineTo(curbTR.x, curbTR.y);
    gfx.lineTo(curbBR.x, curbBR.y);
    gfx.lineTo(curbBL.x, curbBL.y);
    gfx.closePath();
    gfx.fillPath();

    // Foreshortened 3D Grass Stripes (adapted for 낮 / 정오 / 밤)
    const stripeDark = isNoon ? 0x42964B : (isNight ? 0x265E30 : 0x367C3F);
    const stripeLight = isNoon ? 0x4DA857 : (isNight ? 0x2D6D38 : 0x3F8E49);
    const stripes = 14;
    const stripeW = WORLD_W / stripes;
    for (let i = 0; i < stripes; i++) {
      const x0 = i * stripeW;
      const x1 = (i + 1) * stripeW;
      this.fillQuad3D(gfx, x0, 0, x1, 0, x1, WORLD_H, x0, WORLD_H, i % 2 === 0 ? stripeDark : stripeLight, 1);
    }

    // 3D Perspective Pitch Markings
    gfx.lineStyle(2.4, 0xFFFFFF, 0.88);
    this.strokeRect3D(gfx, 0, 0, WORLD_W, WORLD_H);
    this.drawLine3D(gfx, WORLD_W / 2, 0, WORLD_W / 2, WORLD_H);
    this.strokeCircle3D(gfx, WORLD_W / 2, WORLD_H / 2, 85, 40);
    this.strokeRect3D(gfx, 0, 130, 135, 300);
    this.strokeRect3D(gfx, WORLD_W - 135, 130, 135, 300);

    // 3D Vertical Goalframes
    this.draw3DGoalFrame(gfx, 0, true);
    this.draw3DGoalFrame(gfx, WORLD_W, false);
  }

  private fillQuad3D(
    gfx: Phaser.GameObjects.Graphics,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    x4: number, y4: number,
    color: number,
    alpha: number
  ) {
    const p1 = this.project3D(x1, y1, 0);
    const p2 = this.project3D(x2, y2, 0);
    const p3 = this.project3D(x3, y3, 0);
    const p4 = this.project3D(x4, y4, 0);
    gfx.fillStyle(color, alpha);
    gfx.fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    gfx.fillTriangle(p1.x, p1.y, p3.x, p3.y, p4.x, p4.y);
  }

  private drawLine3D(gfx: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, z1 = 0, z2 = 0) {
    const a = this.project3D(x1, y1, z1);
    const b = this.project3D(x2, y2, z2);
    gfx.lineBetween(a.x, a.y, b.x, b.y);
  }

  private strokeRect3D(gfx: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    const tl = this.project3D(x, y, 0);
    const tr = this.project3D(x + w, y, 0);
    const br = this.project3D(x + w, y + h, 0);
    const bl = this.project3D(x, y + h, 0);
    gfx.beginPath();
    gfx.moveTo(tl.x, tl.y);
    gfx.lineTo(tr.x, tr.y);
    gfx.lineTo(br.x, br.y);
    gfx.lineTo(bl.x, bl.y);
    gfx.closePath();
    gfx.strokePath();
  }

  private strokeCircle3D(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, segs = 36) {
    gfx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const p = this.project3D(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius, 0);
      if (i === 0) gfx.moveTo(p.x, p.y);
      else gfx.lineTo(p.x, p.y);
    }
    gfx.strokePath();
  }

  private draw3DGoalFrame(gfx: Phaser.GameObjects.Graphics, goalX: number, isLeft: boolean) {
    const depthX = isLeft ? -36 : 36;
    const yTop = WORLD_H / 2 - 70;
    const yBot = WORLD_H / 2 + 70;
    const goalH = 68;

    gfx.lineStyle(1, 0xE5E8EC, 0.35);
    for (let i = 0; i <= 6; i++) {
      const wy = Phaser.Math.Linear(yTop, yBot, i / 6);
      this.drawLine3D(gfx, goalX, wy, goalX + depthX, wy, goalH, goalH * 0.92);
      this.drawLine3D(gfx, goalX + depthX, wy, goalX + depthX, wy, 0, goalH * 0.92);
    }
    gfx.lineStyle(2, 0xCCCCCC, 0.7);
    this.drawLine3D(gfx, goalX, yTop, goalX + depthX, yTop, 0, 0);
    this.drawLine3D(gfx, goalX, yBot, goalX + depthX, yBot, 0, 0);
    this.drawLine3D(gfx, goalX + depthX, yTop, goalX + depthX, yBot, 0, 0);
    this.drawLine3D(gfx, goalX + depthX, yTop, goalX + depthX, yBot, goalH * 0.92, goalH * 0.92);
    this.drawLine3D(gfx, goalX, yTop, goalX + depthX, yTop, goalH, goalH * 0.92);
    this.drawLine3D(gfx, goalX, yBot, goalX + depthX, yBot, goalH, goalH * 0.92);

    gfx.lineStyle(4, 0xFFFFFF, 1);
    this.drawLine3D(gfx, goalX, yTop, goalX, yTop, 0, goalH);
    this.drawLine3D(gfx, goalX, yBot, goalX, yBot, 0, goalH);
    this.drawLine3D(gfx, goalX, yTop, goalX, yBot, goalH, goalH);
  }

  /**
   * Draws smooth S-slalom dribble guide curve around all 8 cones toward the right goal
   */
  private drawSlalomGuidePath() {
    this.guidePathGfx.clear();
    const startWx = 80;
    const endWx = 920;
    const steps = 120;

    for (let s = 0; s < steps; s += 2) {
      const wxA = Phaser.Math.Linear(startWx, endWx, s / steps);
      const wxB = Phaser.Math.Linear(startWx, endWx, (s + 1) / steps);
      const wyA = this.sampleSlalomWaveY(wxA);
      const wyB = this.sampleSlalomWaveY(wxB);
      const pA = this.project3D(wxA, wyA, 0);
      const pB = this.project3D(wxB, wyB, 0);

      this.guidePathGfx.lineStyle(2.4, 0xD4AF37, 0.38);
      this.guidePathGfx.lineBetween(pA.x, pA.y, pB.x, pB.y);
    }
  }

  private sampleSlalomWaveY(wx: number): number {
    const firstWx = 175;
    const lastWx = 845;
    const stepWx = (lastWx - firstWx) / Math.max(1, TRAINING_CONE_COUNT - 1);
    const phase = ((wx - firstWx) / stepWx) * Math.PI;
    return WORLD_H / 2 - Math.cos(phase) * 72;
  }

  /**
   * Draws Slalom Dribble Gate lanes beside each cone (cones themselves stay pure orange obstacles!)
   */
  private renderDribbleGates() {
    const nextIdx = this.cones.findIndex((c) => !c.passed);

    for (const cone of this.cones) {
      cone.gateGfx.clear();

      const yInner = cone.wy + cone.gateSide * 26;
      const yOuter = cone.wy + cone.gateSide * 105;
      const yMid = (yInner + yOuter) * 0.5;

      const pIn = this.project3D(cone.wx, yInner, 0);
      const pOut = this.project3D(cone.wx, yOuter, 0);

      if (cone.passed) {
        cone.gateGfx.lineStyle(3, 0x2ECC71, 0.75);
        cone.gateGfx.lineBetween(pIn.x, pIn.y, pOut.x, pOut.y);
        continue;
      }

      const isNext = cone.index === nextIdx;
      const lineColor = isNext ? 0xFFD54F : 0xB89B68;
      const alpha = isNext ? 0.92 : 0.38;

      // Dribble gate line on grass (between cone and outer lane)
      cone.gateGfx.lineStyle(isNext ? 3.5 : 2, lineColor, alpha);
      cone.gateGfx.lineBetween(pIn.x, pIn.y, pOut.x, pOut.y);

      // Forward chevron arrow in middle of dribble gate showing ball direction ->
      const c1 = this.project3D(cone.wx - 10, yMid - 10, 0);
      const cTip = this.project3D(cone.wx + 10, yMid, 0);
      const c2 = this.project3D(cone.wx - 10, yMid + 10, 0);
      cone.gateGfx.lineBetween(c1.x, c1.y, cTip.x, cTip.y);
      cone.gateGfx.lineBetween(c2.x, c2.y, cTip.x, cTip.y);
    }
  }

  /**
   * Draws an authentic 3D Orange Training Pylon Obstacle (never turns green like a coin!)
   */
  private draw3DConeObstacle(gfx: Phaser.GameObjects.Graphics) {
    gfx.clear();
    const baseColor = 0xFF7A00;
    const shadeColor = 0xC84B00;

    // 3D Base Flange
    gfx.fillStyle(shadeColor, 1);
    gfx.fillRoundedRect(-16, 0, 32, 9, 3);
    gfx.fillStyle(baseColor, 1);
    gfx.fillRoundedRect(-15, -2, 30, 7, 3);

    // Shaded Left & Lit Right Conical Faces
    gfx.fillStyle(shadeColor, 1);
    gfx.beginPath();
    gfx.moveTo(0, -32);
    gfx.lineTo(0, 2);
    gfx.lineTo(-12, 2);
    gfx.closePath();
    gfx.fillPath();

    gfx.fillStyle(baseColor, 1);
    gfx.beginPath();
    gfx.moveTo(0, -32);
    gfx.lineTo(12, 2);
    gfx.lineTo(0, 2);
    gfx.closePath();
    gfx.fillPath();

    // Reflective White Collar Stripe
    gfx.fillStyle(0xFFFFFF, 0.96);
    gfx.beginPath();
    gfx.moveTo(-7.5, -10);
    gfx.lineTo(7.5, -10);
    gfx.lineTo(5, -18);
    gfx.lineTo(-5, -18);
    gfx.closePath();
    gfx.fillPath();

    gfx.fillStyle(0xFFFFFF, 0.9);
    gfx.fillCircle(0, -31, 2.2);
  }

  private draw3DPlayerModel(
    gfx: Phaser.GameObjects.Graphics,
    primaryColor: number,
    accentTrim: number,
    shortsColor: number,
    skinTone: number,
    hairColor: number,
    bounceY: number
  ) {
    gfx.clear();
    const yOff = bounceY;

    gfx.fillStyle(accentTrim, 1);
    gfx.fillRect(-6, -4 + yOff, 4, 4);
    gfx.fillRect(2, -4 + yOff, 4, 4);
    gfx.fillStyle(0x1A1A1A, 1);
    gfx.fillRoundedRect(-7, -2 + yOff, 5, 3, 1);
    gfx.fillRoundedRect(2, -2 + yOff, 5, 3, 1);

    gfx.fillStyle(shortsColor, 1);
    gfx.fillRoundedRect(-6, -10 + yOff, 12, 7, 2);

    gfx.fillStyle(primaryColor, 1);
    gfx.fillRoundedRect(-7, -22 + yOff, 14, 13, 3);
    gfx.fillStyle(accentTrim, 0.9);
    gfx.fillRect(-7, -19 + yOff, 14, 2);
    gfx.fillStyle(accentTrim, 1);
    gfx.fillTriangle(-2, -22 + yOff, 2, -22 + yOff, 0, -18 + yOff);

    gfx.fillStyle(primaryColor, 1);
    gfx.fillRect(-9, -21 + yOff, 3, 8);
    gfx.fillRect(6, -21 + yOff, 3, 8);
    gfx.fillStyle(skinTone, 1);
    gfx.fillCircle(-8, -12 + yOff, 1.9);
    gfx.fillCircle(7, -12 + yOff, 1.9);

    gfx.fillStyle(skinTone, 1);
    gfx.fillRect(-2, -24 + yOff, 4, 3);
    gfx.fillCircle(0, -28 + yOff, 6.8);

    gfx.fillStyle(hairColor, 1);
    gfx.beginPath();
    gfx.arc(0, -29 + yOff, 6.8, Math.PI * 0.9, Math.PI * 2.1, false);
    gfx.closePath();
    gfx.fillPath();
    gfx.fillStyle(0x4A3828, 0.6);
    gfx.fillCircle(2, -32 + yOff, 2.5);
  }

  private draw3DSoccerBall(gfx: Phaser.GameObjects.Graphics) {
    gfx.clear();
    const radius = 8.5;

    gfx.fillStyle(0xF4F4F6, 1);
    gfx.fillCircle(0, 0, radius);
    gfx.lineStyle(1.3, 0x1A1A1A, 0.85);
    gfx.strokeCircle(0, 0, radius);

    gfx.fillStyle(0x1F2024, 0.9);
    gfx.fillCircle(-0.5, -0.5, 2.5);
    gfx.fillCircle(-3.6, 2.5, 1.5);
    gfx.fillCircle(3.6, 2.5, 1.5);
    gfx.fillCircle(3.3, -2.8, 1.4);

    gfx.fillStyle(0xFFFFFF, 0.95);
    gfx.fillCircle(-2.0, -2.4, 2.0);
  }

  private syncPlayerAndBall3D(bounceZ: number) {
    const isMoving = Math.hypot(this.playerVx, this.playerVy) > 14;
    const showFrontFace = Math.sin(this.moveHeading) >= -0.25 || !isMoving;
    const bounceY = isMoving ? -Math.abs(Math.sin(this.playerAnimTimer * 13)) * 2.4 : 0;

    drawDetailedIsoPlayer(this.playerBodyGfx, {
      primaryColor: 0x245484,
      accentTrim: 0xD4AF37,
      shortsColor: 0xF2EFE9,
      profile: this.playerProfile,
      animPhase: this.playerAnimTimer,
      isMoving,
      showFrontFace,
    });

    if (showFrontFace) {
      this.playerJerseyNumText.setPosition(-2.6, -16.8 + bounceY);
      this.playerJerseyNumText.setScale(this.facingSign * 0.78, 0.78);
    } else {
      this.playerJerseyNumText.setPosition(0, -17.6 + bounceY);
      this.playerJerseyNumText.setScale(this.facingSign * 1.05, 1.05);
    }

    const pProj = this.project3D(this.playerWx, this.playerWy, bounceZ);
    this.playerContainer.setPosition(pProj.x, pProj.y);
    this.playerContainer.setScale(this.facingSign * pProj.scale * 1.18, pProj.scale * 1.18);
    this.playerNameTag.setScale(this.facingSign, 1);
    this.playerContainer.setDepth(100 + this.playerWy);

    const bProj = this.project3D(this.ballWx, this.ballWy, this.ballWz);
    const bGround = this.project3D(this.ballWx, this.ballWy, 0);

    this.ballContainer.setPosition(bProj.x, bProj.y);
    this.ballContainer.setScale(bProj.scale);
    this.ballContainer.setDepth(100 + this.ballWy + 0.5);
    this.ballGfx.setRotation(this.ballRollAngle);

    this.ballShadowGfx.setPosition(bGround.x, bGround.y + 5 * bGround.scale);
    this.ballShadowGfx.setScale(bGround.scale * Math.max(0.5, 1 - this.ballWz / 140));
    this.ballShadowGfx.setDepth(100 + this.ballWy - 0.5);

    // Subtle close-control footwork ring under ball when player is actively dribbling it
    this.dribbleLinkGfx.clear();
    const distPB = Phaser.Math.Distance.Between(this.playerWx, this.playerWy, this.ballWx, this.ballWy);
    if (distPB < 48 && !this.finishingShotActive) {
      this.dribbleLinkGfx.lineStyle(1.6, 0xD4AF37, 0.55);
      this.dribbleLinkGfx.strokeEllipse(bGround.x, bGround.y + 4 * bGround.scale, 24 * bGround.scale, 10 * bGround.scale);
    }
  }

  private startExerciseTimer() {
    this.time.addEvent({
      delay: 1000,
      repeat: TRAINING_TIME_LIMIT - 1,
      callback: () => {
        if (this.isFinished || this.finishingShotActive) return;
        this.timeLeft--;
        this.timerText.setText(`남은 시간  ${this.timeLeft}s`);
        if (this.timeLeft <= 0) {
          this.finishExercise();
        }
      },
    });
  }

  override update(_time: number, delta: number) {
    if (!this.isStarted || this.isFinished) return;

    const dt = delta / 1000;

    if (this.finishingShotActive) {
      // Animate celebratory shot flying into the 3D right goal net!
      this.ballWx += this.ballVx * dt;
      this.ballWy += this.ballVy * dt;
      this.ballVz -= 520 * dt;
      this.ballWz = Math.max(0, this.ballWz + this.ballVz * dt);
      this.ballRollAngle += dt * 18;
      this.syncPlayerAndBall3D(0);
      return;
    }

    if (this.ballLooseStunMs > 0) {
      this.ballLooseStunMs = Math.max(0, this.ballLooseStunMs - delta);
    }

    // ── 1. Player Movement (with Acceleration Inertia) ──
    const isSprinting = Boolean(this.sprintKeyShift && this.sprintKeyShift.isDown);
    const baseSpeed = 225 * (isSprinting ? 1.36 : 1.0);
    const leftDown = this.wasdKeys.A.isDown || this.cursors.left.isDown;
    const rightDown = this.wasdKeys.D.isDown || this.cursors.right.isDown;
    const upDown = this.wasdKeys.W.isDown || this.cursors.up.isDown;
    const downDown = this.wasdKeys.S.isDown || this.cursors.down.isDown;

    const prevHeading = this.moveHeading;
    let ix = 0;
    let iy = 0;
    if (leftDown) ix -= 1;
    if (rightDown) ix += 1;
    if (upDown) iy -= 1;
    if (downDown) iy += 1;

    const isMoving = ix !== 0 || iy !== 0;

    if (isMoving) {
      const len = Math.sqrt(ix * ix + iy * iy);
      const targetVx = (ix / len) * baseSpeed;
      const targetVy = (iy / len) * baseSpeed;
      const accel = Math.min(1, 15 * dt);
      this.playerVx = Phaser.Math.Linear(this.playerVx, targetVx, accel);
      this.playerVy = Phaser.Math.Linear(this.playerVy, targetVy, accel);
      this.moveHeading = Math.atan2(this.playerVy, this.playerVx);
      if (ix !== 0) this.facingSign = Math.sign(ix);
      this.playerAnimTimer += dt;
    } else {
      const decel = Math.pow(0.06, dt);
      this.playerVx *= decel;
      this.playerVy *= decel;
    }

    this.playerWx = Phaser.Math.Clamp(this.playerWx + this.playerVx * dt, 24, WORLD_W - 24);
    this.playerWy = Phaser.Math.Clamp(this.playerWy + this.playerVy * dt, 24, WORLD_H - 24);

    // ── 2. Authentic Close-Control Ball Dribble & Aerodynamic / Turf Physics ──
    const distToBall = Phaser.Math.Distance.Between(this.playerWx, this.playerWy, this.ballWx, this.ballWy);
    if (distToBall <= 46 && this.ballLooseStunMs <= 0) {
      // Cutting sharply while dribbling imparts Magnus curve spin to the ball!
      const headingDelta = Phaser.Math.Angle.Wrap(this.moveHeading - prevHeading);
      if (Math.abs(headingDelta) > 0.001) {
        this.ballSpin = Phaser.Math.Clamp(this.ballSpin + headingDelta * 2.2, -3.5, 3.5);
      }

      const leadDist = isMoving ? (isSprinting ? 29 : 20) : 15;
      const targetBx = this.playerWx + Math.cos(this.moveHeading) * leadDist;
      const targetBy = this.playerWy + Math.sin(this.moveHeading) * (leadDist * 0.88);

      const controlTightness = isSprinting ? 7.2 : 10.8;
      this.ballVx = Phaser.Math.Linear(this.ballVx, (targetBx - this.ballWx) * controlTightness + this.playerVx * 0.90, 0.36);
      this.ballVy = Phaser.Math.Linear(this.ballVy, (targetBy - this.ballWy) * controlTightness + this.playerVy * 0.90, 0.36);

      // Rhythmic foot-touch kick impulse on each running stride!
      if (isMoving) {
        const strideWave = Math.sin(this.playerAnimTimer * 12);
        const strideSign = strideWave >= 0 ? 1 : -1;
        if (strideSign !== this.prevStrideSign) {
          this.prevStrideSign = strideSign;
          const tapPower = isSprinting ? 78 : 44;
          this.ballVx += Math.cos(this.moveHeading) * tapPower;
          this.ballVy += Math.sin(this.moveHeading) * tapPower;
          this.ballVz = isSprinting ? 56 : 30;
        }
      }
    } else {
      // Frame-rate independent air drag vs grass rolling resistance
      const dragFactor = this.ballWz > 2 ? Math.pow(0.68, dt) : Math.pow(0.28, dt);
      this.ballVx *= dragFactor;
      this.ballVy *= dragFactor;
    }

    // Apply Magnus Curve Force from ball spin
    if (Math.abs(this.ballSpin) > 0.02) {
      const mAx = -this.ballVy * this.ballSpin * 0.65;
      const mAy = this.ballVx * this.ballSpin * 0.65;
      this.ballVx += mAx * dt;
      this.ballVy += mAy * dt;
      this.ballSpin *= Math.pow(0.35, dt);
    }

    const prevBallWx = this.ballWx;
    this.ballWx = Phaser.Math.Clamp(this.ballWx + this.ballVx * dt, 22, WORLD_W - 18);
    this.ballWy = Phaser.Math.Clamp(this.ballWy + this.ballVy * dt, 22, WORLD_H - 22);

    // Ball 3D vertical gravity & grass bounce restitution
    if (this.ballWz > 0 || this.ballVz > 0) {
      this.ballVz -= 580 * dt;
      this.ballWz += this.ballVz * dt;
      if (this.ballWz <= 0) {
        this.ballWz = 0;
        if (Math.abs(this.ballVz) > 32) {
          this.ballVz = -this.ballVz * 0.48;
          this.ballVx *= 0.90;
          this.ballVy *= 0.90;
        } else {
          this.ballVz = 0;
        }
      }
    }

    const ballSpeed = Math.sqrt(this.ballVx * this.ballVx + this.ballVy * this.ballVy);
    this.ballRollAngle += (ballSpeed * dt) * 0.048;

    // ── 3. Physical Cone Obstacle Collisions, Hooke's Spring-Damper Cone Tilt & Slalom Gate Detection ──
    const playerInControl = Phaser.Math.Distance.Between(this.playerWx, this.playerWy, this.ballWx, this.ballWy) <= 58;

    for (const cone of this.cones) {
      if (cone.wobbleCooldown > 0) cone.wobbleCooldown -= delta;

      // Spring-damper physical oscillation for cone tilt angle
      if (Math.abs(cone.tiltAngle) > 0.05 || Math.abs(cone.tiltVel) > 0.05) {
        const springAccel = -145 * cone.tiltAngle - 11.5 * cone.tiltVel;
        cone.tiltVel += springAccel * dt;
        cone.tiltAngle += cone.tiltVel * dt;
        cone.coneContainer.setAngle(cone.tiltAngle);
      } else if (cone.tiltAngle !== 0) {
        cone.tiltAngle = 0;
        cone.tiltVel = 0;
        cone.coneContainer.setAngle(0);
      }

      // A) Player physical collision against cone (elastic impulse + cone tilt!)
      const pdx = this.playerWx - cone.wx;
      const pdy = this.playerWy - cone.wy;
      const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
      if (pDist < CONE_SOLID_PLAYER_R) {
        const nx = pDist > 0.01 ? pdx / pDist : 1;
        const ny = pDist > 0.01 ? pdy / pDist : 0;
        this.playerWx = cone.wx + nx * CONE_SOLID_PLAYER_R;
        this.playerWy = cone.wy + ny * CONE_SOLID_PLAYER_R;
        this.playerVx *= 0.55;
        this.playerVy *= 0.55;
        cone.tiltVel = (nx >= 0 ? -1 : 1) * 195;
        this.wobbleCone(cone, true);
      }

      // B) Soccer Ball physical collision against cone (3D elastic ricochet + spin + vertical pop!)
      const bdx = this.ballWx - cone.wx;
      const bdy = this.ballWy - cone.wy;
      const bDist = Math.sqrt(bdx * bdx + bdy * bdy);
      if (bDist < CONE_SOLID_BALL_R) {
        const nx = bDist > 0.01 ? bdx / bDist : 1;
        const ny = bDist > 0.01 ? bdy / bDist : 0;
        this.ballWx = cone.wx + nx * (CONE_SOLID_BALL_R + 2);
        this.ballWy = cone.wy + ny * (CONE_SOLID_BALL_R + 2);
        const dot = this.ballVx * nx + this.ballVy * ny;
        const reboundSpeed = Math.max(165, Math.abs(dot) * 0.85);
        this.ballVx = nx * reboundSpeed;
        this.ballVy = ny * reboundSpeed;
        this.ballVz = Math.max(this.ballVz, 68);
        this.ballSpin = (nx * ny) * 2.5;
        this.ballLooseStunMs = 220;
        cone.tiltVel = (nx >= 0 ? -1 : 1) * 220;
        this.wobbleCone(cone, true);
      }

      if (cone.passed || !playerInControl) continue;

      // C) Detect genuine Ball Dribble through the Slalom Gate OR curving around the cone!
      const crossedPlane =
        (prevBallWx <= cone.wx && this.ballWx >= cone.wx) ||
        (prevBallWx >= cone.wx && this.ballWx <= cone.wx) ||
        Math.abs(this.ballWx - cone.wx) < 16;

      const relY = (this.ballWy - cone.wy) * cone.gateSide;
      const throughAssignedGate = crossedPlane && relY >= 16 && relY <= 125;

      // Also track ball angular orbit so freestyle opposite-side slalom weaving works too!
      let orbitedAroundCone = false;
      if (bDist <= 130) {
        const theta = Math.atan2(this.ballWy - cone.wy, this.ballWx - cone.wx);
        if (cone.hasPrevTheta) {
          const dTheta = Phaser.Math.Angle.Wrap(theta - cone.prevBallTheta);
          if (Math.abs(dTheta) < 0.9) {
            cone.ballNetAngle += dTheta;
          }
        }
        cone.prevBallTheta = theta;
        cone.hasPrevTheta = true;
        orbitedAroundCone = Math.abs(cone.ballNetAngle) >= BALL_ORBIT_SWEEP_RAD;
      } else if (bDist > 150) {
        cone.hasPrevTheta = false;
        cone.ballNetAngle *= 0.92;
      }

      if (throughAssignedGate || orbitedAroundCone) {
        this.markGateDribbled(cone);
        if (this.finishingShotActive || this.isFinished) return;
      }
    }

    const bounceZ = isMoving ? Math.abs(Math.sin(this.playerAnimTimer * 14)) * 4 : 0;
    this.syncPlayerAndBall3D(bounceZ);
  }

  private wobbleCone(cone: SlalomCone3D, showWarn: boolean) {
    if (cone.wobbleCooldown > 0) return;
    cone.wobbleCooldown = 450;

    this.tweens.add({
      targets: cone.coneContainer,
      angle: { from: -16, to: 12 },
      duration: 95,
      yoyo: true,
      onComplete: () => cone.coneContainer.setAngle(0),
    });

    if (showWarn) {
      const warn = this.add.text(cone.coneContainer.x, cone.coneContainer.y - 46, '콘 충돌!', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#FF6B6B',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(2100);

      this.tweens.add({
        targets: warn,
        y: warn.y - 20,
        alpha: 0,
        duration: 550,
        onComplete: () => warn.destroy(),
      });
    }
  }

  private markGateDribbled(cone: SlalomCone3D) {
    cone.passed = true;
    cone.gateLabel.setText('✓');
    cone.gateLabel.setColor('#2ECC71');
    this.renderDribbleGates();

    const gatePos = this.project3D(cone.wx, cone.wy + cone.gateSide * 62, 16);
    const pop = this.add.text(gatePos.x, gatePos.y, '드리블 돌파!', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#2ECC71',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(2100);

    this.tweens.add({
      targets: pop,
      y: pop.y - 26,
      alpha: 0,
      duration: 700,
      onComplete: () => pop.destroy(),
    });

    this.passedCount++;
    this.countText.setText(`드리블 돌파  ${this.passedCount} / ${TRAINING_CONE_COUNT}`);

    if (this.passedCount >= TRAINING_CONE_COUNT) {
      this.triggerCelebrationGoalShot();
    }
  }

  private triggerCelebrationGoalShot() {
    if (this.finishingShotActive || this.isFinished) return;
    this.finishingShotActive = true;

    const goalX = WORLD_W + 18;
    const goalY = WORLD_H / 2;
    const dx = goalX - this.ballWx;
    const dy = goalY - this.ballWy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const shotSpeed = 560;

    this.ballVx = (dx / dist) * shotSpeed;
    this.ballVy = (dy / dist) * shotSpeed;
    this.ballVz = 165;

    const banner = this.add.text(this.scale.width / 2, 120, '완벽한 드리블 돌파 후 마무리 슛!', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#FFD54F',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(2600);

    this.time.delayedCall(650, () => {
      banner.destroy();
      this.finishExercise();
    });
  }

  private finishExercise() {
    if (this.isFinished) return;
    this.isFinished = true;

    let statGain = 0;
    if (this.passedCount >= TRAINING_CONE_COUNT) {
      statGain = 2;
    } else if (this.passedCount >= Math.ceil(TRAINING_CONE_COUNT / 2)) {
      statGain = 1;
    }

    const current = this.dataPayload.currentStat;
    const cap = TRAINING_STAT_MAX;
    const actualGain = Math.min(statGain, Math.max(0, cap - current));
    const newStat = current + actualGain;

    gameStore.getState().applyTrainingResult(this.dataPayload.playerId, this.dataPayload.trainingType, actualGain);
    gameStore.getState().recordTraining({
      id: `train_${Date.now()}`,
      playerId: this.dataPayload.playerId,
      type: this.dataPayload.trainingType,
      statBefore: current,
      statAfter: newStat,
      completedAt: new Date().toISOString(),
    });

    const typeLabel = this.dataPayload.trainingType === 'strength' ? '힘(Strength)' : '심폐력(Stamina)';
    this.showLuxuryResultCard(typeLabel, current, newStat, actualGain);
    this.input.once('pointerdown', () => this.exitTraining());
  }

  /**
   * Renders a soft-rounded, luxury Clubhouse result modal card instead of a sharp raw text box
   */
  private showLuxuryResultCard(typeLabel: string, before: number, after: number, gain: number) {
    const { width, height } = this.scale;
    const vs = this.getViewScale();
    const cx = width * 0.5;
    const cy = height * 0.5;
    const isSuccess = gain > 0;

    // Soft translucent vignette backdrop
    const scrim = this.add.graphics().setDepth(2990);
    scrim.fillStyle(0x0A0E17, 0.56);
    scrim.fillRect(0, 0, width, height);

    const card = this.add.container(cx, cy).setDepth(3000).setScale(0.92 * vs).setAlpha(0);
    const cardW = 440;
    const cardH = 266;
    const bg = this.add.graphics();

    // Soft outer ambient shadow + rounded luxury dark-glass card
    bg.fillStyle(0x000000, 0.34);
    bg.fillRoundedRect(-cardW * 0.5, -cardH * 0.5 + 8, cardW, cardH, 24);
    bg.fillStyle(0x161A24, 0.96);
    bg.fillRoundedRect(-cardW * 0.5, -cardH * 0.5, cardW, cardH, 24);
    bg.lineStyle(2, isSuccess ? 0xD4AF37 : 0x7A8294, 0.82);
    bg.strokeRoundedRect(-cardW * 0.5, -cardH * 0.5, cardW, cardH, 24);

    // Top circular crest badge (crisp geometric emblem, zero emojis)
    bg.fillStyle(isSuccess ? 0xD4AF37 : 0x4E5768, 0.18);
    bg.fillCircle(0, -86, 26);
    bg.lineStyle(1.8, isSuccess ? 0xE5C675 : 0x8F98AA, 0.85);
    bg.strokeCircle(0, -86, 26);
    // Clean check / star emblem inside circle
    bg.lineStyle(3, isSuccess ? 0xF3D98B : 0xC8D0DE, 1);
    if (isSuccess) {
      bg.lineBetween(-9, -85, -2, -78);
      bg.lineBetween(-2, -78, 10, -93);
    } else {
      bg.lineBetween(0, -96, 0, -85);
      bg.lineBetween(0, -85, 8, -81);
    }

    // Inner rounded stat summary panel
    bg.fillStyle(0x202636, 0.88);
    bg.fillRoundedRect(-186, -18, 372, 74, 16);
    bg.lineStyle(1, 0xD4AF37, 0.25);
    bg.strokeRoundedRect(-186, -18, 372, 74, 16);

    // Soft rounded CTA pill button at bottom
    bg.fillStyle(0xB89B68, 1);
    bg.fillRoundedRect(-130, 74, 260, 40, 20);
    card.add(bg);

    const titleTxt = this.add.text(0, -42, isSuccess ? '3D 콘 드리블 완주 성공!' : '훈련 종료', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '21px',
      fontStyle: 'bold',
      color: isSuccess ? '#F5DF9E' : '#EAECEF',
      resolution: 2,
    }).setOrigin(0.5);

    const courseTxt = this.add.text(0, 4, `드리블 돌파   ${this.passedCount} / ${TRAINING_CONE_COUNT} 코스`, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '14.5px',
      fontStyle: 'bold',
      color: '#D5DCE6',
      resolution: 2,
    }).setOrigin(0.5);

    const statLine = isSuccess
      ? `${typeLabel}   ${before}  →  ${after}  (+${gain})`
      : '스탯 변동 없음 (4코스 이상 돌파 시 +1)';
    const statTxt = this.add.text(0, 32, statLine, {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '15.5px',
      fontStyle: 'bold',
      color: isSuccess ? '#6EE7A8' : '#9AA4B4',
      resolution: 2,
    }).setOrigin(0.5);

    const ctaTxt = this.add.text(0, 94, '메뉴로 돌아가기  (ESC / 클릭)', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '13.5px',
      fontStyle: 'bold',
      color: '#171614',
      resolution: 2,
    }).setOrigin(0.5);

    card.add([titleTxt, courseTxt, statTxt, ctaTxt]);

    this.tweens.add({
      targets: card,
      scaleX: vs,
      scaleY: vs,
      alpha: 1,
      duration: 240,
      ease: 'Back.easeOut',
    });
  }

  private exitTraining() {
    const gameContainer = document.getElementById('game-container');
    const menuUI = document.getElementById('menu-ui');
    if (gameContainer) gameContainer.style.display = 'none';
    if (menuUI) menuUI.style.display = 'block';

    this.scene.stop('TrainingScene');
    gameStore.getState().navigate('training');
  }
}
