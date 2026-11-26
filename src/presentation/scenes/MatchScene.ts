import Phaser from 'phaser';
import { APP_META } from '../../shared/config/appMeta';
import {
  PITCH_WIDTH,
  PITCH_HEIGHT,
  PITCH_HALF_W,
  PITCH_HALF_H,
  BALL_RADIUS,
  BALL_FRICTION,
  BALL_PASS_SPEED,
  BALL_SHOT_SPEED,
  BALL_DRIBBLE_OFFSET,
  HALF_DURATION_SECONDS,
  TIME_SCALE,
  AI_PROFILES,
  COLORS,
  SURRENDER_GOAL_DIFF,
  SURRENDER_COOLDOWN_MS,
  CAMERA_LERP,
  CAMERA_ZOOM,
  TACKLE_RANGE,
  TACKLE_LUNGE_SPEED,
  TACKLE_FOUL_CHANCE,
  TACKLE_COOLDOWN_MS,
  GOAL_Y_MIN,
  GOAL_Y_MAX,
  GOAL_AREA_WIDTH,
  PENALTY_AREA_WIDTH,
  CENTER_CIRCLE_RADIUS,
} from '../../infrastructure/config/game-config';
import { worldToIso, depthFromWorld, createBakedStadiumImage } from './IsoUtils';
import {
  resolvePlayerVisualProfile,
  drawDetailedIsoPlayer,
  drawDetailedReferee,
  fillFastCircle,
  fillFastEllipse,
  fillFastBevelRect,
  type PlayerVisualProfile,
} from './PlayerAppearance';
import type { Player, AIDifficulty, MatchResult, MatchEvent } from '../../shared/types/index';
import { gameStore } from '../../infrastructure/stores/gameStore';

export interface MatchSceneInitData {
  userPlayers: Player[];
  aiPlayers: Player[];
  userLineup: { playerId: string; position: string; x: number; y: number }[];
  aiLineup: { playerId: string; position: string; x: number; y: number }[];
  difficulty: AIDifficulty;
  isPvP?: boolean;
}

interface MatchActor {
  id: string;
  name: string;
  team: 'user' | 'ai';
  position: string;
  grade: number;
  stats: any;
  specialAbility: string | null;
  specialAbilityDesc: string | null;
  skillCooldown: number;
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  facingAngle: number;
  profile: PlayerVisualProfile;
  baseWx: number;
  baseWy: number;
  isControlled: boolean;
  hasBall: boolean;
  tackleCooldown: number;
  animTimer: number;
  container: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Graphics;
  bodyGfx: Phaser.GameObjects.Graphics;
  jerseyNumText: Phaser.GameObjects.Text;
  ring: Phaser.GameObjects.Graphics;
  gaugeGfx: Phaser.GameObjects.Graphics;
  tagText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
}

interface RefereeActor {
  wx: number;
  wy: number;
  vx: number;
  vy: number;
  animTimer: number;
  signalState: 'none' | 'whistle' | 'yellow_card' | 'point_left' | 'point_right';
  signalTimerMs: number;
  isLinesman: boolean;
  flagUp: boolean;
  container: Phaser.GameObjects.Container;
  bodyGfx: Phaser.GameObjects.Graphics;
}

export class MatchScene extends Phaser.Scene {
  private initData!: MatchSceneInitData;
  private isPvPMode = false;
  private actors: MatchActor[] = [];

  // Controlled actors
  private controlledActorP1: MatchActor | null = null;
  private controlledActorP2: MatchActor | null = null;

  // Performance: throttle AI & radar updates
  private aiUpdateAccumulator = 0;
  private radarUpdateAccumulator = 0;

  // Ball
  private ballWx = PITCH_HALF_W;
  private ballWy = PITCH_HALF_H;
  private ballWz = 0; // World elevation height (0 = ground)
  private ballVx = 0;
  private ballVy = 0;
  private ballVz = 0; // Vertical velocity (positive = rising)
  private ballOwner: MatchActor | null = null;
  private ballGfx!: Phaser.GameObjects.Graphics;
  private ballShadow!: Phaser.GameObjects.Graphics;

  // Last touch & kick cooldown tracking for reliable ball pickup & Goal/Own-Goal detection
  private lastTouchActor: MatchActor | null = null;
  private lastKickActor: MatchActor | null = null;
  private lastKickCooldownMs = 0;
  private possessionShieldMs = 0;

  // Shot Charging (1P & 2P)
  private isChargingShotP1 = false;
  private shotChargeP1 = 0; // 0 to 1
  private isChargingShotP2 = false;
  private shotChargeP2 = 0; // 0 to 1

  // Radar / Minimap
  private radarGfx!: Phaser.GameObjects.Graphics;

  // ── Camera View Mode ──
  // 0: Fixed Sky View (하늘 고정 뷰 - default)
  // 1: 3rd-Person Follow View (3인칭 추적 뷰 - press X)
  private cameraViewMode: 0 | 1 = 0;

  // Isometric World Layer (Baked Single-Quad GPU Stadium Texture)
  private stadiumImage!: Phaser.GameObjects.Image;
  private jumbotronTitleText!: Phaser.GameObjects.Text;
  private fpYaw = 0;
  private fpKickAnimMs = 0;
  private fpGkDiveMs = 0;
  private ballRollAngle = 0;
  private ballSpin = 0;
  private postHitCooldownMs = 0;

  // Guaranteed Set-Piece / Kickoff Phase Progression State
  private phaseResumeTimerMs = 0;
  private phaseResumeWallDeadline = 0;
  private phaseResumeCallback: (() => void) | null = null;
  private refereeMsgHideEvent: Phaser.Time.TimerEvent | null = null;

  // On-Pitch Main Referee & 2 Touchline Assistant Referees
  private mainReferee!: RefereeActor;
  private linesmen: RefereeActor[] = [];

  // ── 1P User Controls ──
  // Movement: W, A, S, D
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  // Actions: R (Pass), E (Shoot/Charge), Q (Tackle), C (GK Dive), X (Camera Switch)
  private p1Keys!: {
    R: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    C: Phaser.Input.Keyboard.Key;
    X: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    TAB: Phaser.Input.Keyboard.Key;
  };

  // ── 2P Controls (PvP Mode) ──
  private p2PassKey1!: Phaser.Input.Keyboard.Key;
  private p2PassKeyNum1!: Phaser.Input.Keyboard.Key;
  private p2ShootKey2!: Phaser.Input.Keyboard.Key;
  private p2ShootKeyNum2!: Phaser.Input.Keyboard.Key;
  private p2CrossKey3!: Phaser.Input.Keyboard.Key;
  private p2CrossKeyNum3!: Phaser.Input.Keyboard.Key;
  private p2ThroughKey4!: Phaser.Input.Keyboard.Key;
  private p2ThroughKeyNum4!: Phaser.Input.Keyboard.Key;
  private p2TackleKey5!: Phaser.Input.Keyboard.Key;
  private p2TackleKeyNum5!: Phaser.Input.Keyboard.Key;
  private p2SwitchKey0!: Phaser.Input.Keyboard.Key;
  private p2SwitchKeyNum0!: Phaser.Input.Keyboard.Key;
  private p2SwitchKeyEnter!: Phaser.Input.Keyboard.Key;
  private p2SprintKeyShift!: Phaser.Input.Keyboard.Key;

  // Match State
  private userScore = 0;
  private aiScore = 0;
  private currentHalf = 1;
  private elapsedRealSeconds = 0;
  private isMatchRunning = false;
  private isPaused = false;
  private lastSurrenderPrompt = 0;
  private matchEvents: MatchEvent[] = [];
  private refereeMsgContainer!: Phaser.GameObjects.Container;
  private refereeMsgBg!: Phaser.GameObjects.Graphics;
  private refereeMessageText!: Phaser.GameObjects.Text;

  // Skill Activation Banner UI (Fixed to Camera Viewport)
  private skillBannerContainer!: Phaser.GameObjects.Container;
  private skillBannerText!: Phaser.GameObjects.Text;

  // Stadium Jumbotron Display Objects (In-World 3D Grandstand Scoreboard)
  private jumbotronScoreText!: Phaser.GameObjects.Text;
  private jumbotronTimerText!: Phaser.GameObjects.Text;

  // Viewport Fixed Top Scoreboard Widget (Always clearly visible in-game)
  private hudScoreText!: Phaser.GameObjects.Text;
  private hudTimerText!: Phaser.GameObjects.Text;
  private hudPeriodText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'MatchScene' });
  }

  init(data?: MatchSceneInitData) {
    const store = gameStore.getState();
    const fallbackPlayers = store.allPlayers;
    const fallbackUserPlayers = store.getOwnedPlayers();
    const fallbackLineup = store.team.lineup;

    this.initData = {
      userPlayers: data?.userPlayers || fallbackUserPlayers,
      aiPlayers: data?.aiPlayers || fallbackPlayers.slice(0, 11),
      userLineup: data?.userLineup || fallbackLineup,
      aiLineup: data?.aiLineup || fallbackLineup,
      difficulty: data?.difficulty || 'normal',
      isPvP: data?.isPvP ?? false,
    };

    this.isPvPMode = this.initData.isPvP ?? false;
    this.userScore = 0;
    this.aiScore = 0;
    this.currentHalf = 1;
    this.elapsedRealSeconds = 0;
    this.isMatchRunning = false;
    this.isPaused = false;
    this.lastSurrenderPrompt = 0;
    this.matchEvents = [];
    this.actors = [];
    this.controlledActorP1 = null;
    this.controlledActorP2 = null;
    this.ballOwner = null;
    this.ballWz = 0;
    this.ballVz = 0;
    this.lastTouchActor = null;
    this.lastKickActor = null;
    this.lastKickCooldownMs = 0;
    this.possessionShieldMs = 0;
    this.cameraViewMode = 0;
    this.fpYaw = 0;
    this.fpKickAnimMs = 0;
    this.fpGkDiveMs = 0;
    this.ballRollAngle = 0;
    this.linesmen = [];
    this.shotChargeP1 = 0;
    this.isChargingShotP1 = false;
    this.shotChargeP2 = 0;
    this.isChargingShotP2 = false;
    this.phaseResumeTimerMs = 0;
    this.phaseResumeWallDeadline = 0;
    this.phaseResumeCallback = null;
    this.refereeMsgHideEvent = null;
    if (this.time) {
      this.time.paused = false;
      this.time.timeScale = 1;
    }
  }

  private getViewScale(): number {
    return Math.min(this.scale.width / 1280, this.scale.height / 720);
  }

  create() {
    const uiScale = this.getViewScale();

    // 1. Baked Single-Quad GPU Stadium & Pitch (0 per-frame CPU tessellation -> locked 60 FPS!)
    this.stadiumImage = createBakedStadiumImage(this);

    // 2. Ball & Shadow (with fast zero-Earcut 3D sphere depth & specular highlight)
    this.ballShadow = this.add.graphics();
    this.ballShadow.fillStyle(COLORS.shadow, 0.42);
    fillFastEllipse(this.ballShadow, 0, 0, 8, 3.5, 8);

    this.ballGfx = this.add.graphics();
    this.draw3DSoccerBall(this.ballGfx);

    // 3. Spawn Detailed Players (with faces, hairstyles, GK kits & jersey numbers)
    this.spawnTeam('user', this.initData.userLineup, this.initData.userPlayers);
    this.spawnTeam('ai', this.initData.aiLineup, this.initData.aiPlayers);

    // 3-2. Spawn Main Referee (주심) & 2 Assistant Referees (부심)
    this.spawnReferees();

    // Initial controlled player for 1P
    const userField = this.actors.filter((a) => a.team === 'user' && a.position !== 'GK');
    this.setControlledActorP1(userField[0] || this.actors[0]);

    // Initial controlled player for 2P (if PvP mode)
    if (this.isPvPMode) {
      const aiField = this.actors.filter((a) => a.team === 'ai' && a.position !== 'GK');
      this.setControlledActorP2(aiField[0] || this.actors[this.actors.length - 1]);
    }

    // 4. Setup Inputs (with Shot Power Charging)
    this.setupInputs();

    // 5. Radar / Minimap Graphic (Fixed to Camera Viewport)
    this.radarGfx = this.add.graphics().setScrollFactor(0).setDepth(3000);

    // 6. Referee Announcement Pill (Smooth Rounded Glassmorphic Capsule, Fixed to Viewport)
    this.refereeMsgContainer = this.add.container(this.scale.width / 2, 118 * uiScale)
      .setScale(uiScale)
      .setScrollFactor(0)
      .setDepth(4000)
      .setVisible(false);
    this.refereeMsgBg = this.add.graphics();
    this.refereeMsgContainer.add(this.refereeMsgBg);

    this.refereeMessageText = this.add.text(0, 0, '', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '24px',
      color: '#F5DF9E',
      fontStyle: 'bold',
      align: 'center',
      resolution: 2,
    }).setOrigin(0.5);
    this.refereeMsgContainer.add(this.refereeMessageText);

    // 6-2. Player Special Ability Activation Banner (Smooth Rounded Gold Capsule)
    this.skillBannerContainer = this.add.container(this.scale.width / 2, 76 * uiScale)
      .setScale(uiScale)
      .setScrollFactor(0)
      .setDepth(4500)
      .setVisible(false);
    const bannerBg = this.add.graphics();
    bannerBg.fillStyle(0x131722, 0.92);
    bannerBg.fillRoundedRect(-195, -21, 390, 42, 21);
    bannerBg.lineStyle(1.8, 0xD4AF37, 0.85);
    bannerBg.strokeRoundedRect(-195, -21, 390, 42, 21);
    this.skillBannerContainer.add(bannerBg);

    this.skillBannerText = this.add.text(0, 0, '', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '14px',
      color: '#FFFCF7',
      fontStyle: 'bold',
      align: 'center',
      resolution: 2,
    }).setOrigin(0.5);
    this.skillBannerContainer.add(this.skillBannerText);

    // 6-3. In-World Grand Stadium Jumbotron (Positioned on the North Grandstand)
    const jumbotronIso = worldToIso(PITCH_HALF_W, -220);
    this.jumbotronTitleText = this.add.text(jumbotronIso.x, jumbotronIso.y - 25, APP_META.arenaName.toUpperCase(), {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '12px',
      color: '#B89B68',
      fontStyle: 'bold',
      resolution: 2,
    }).setOrigin(0.5).setDepth(15);

    this.jumbotronScoreText = this.add.text(jumbotronIso.x, jumbotronIso.y + 4, '0  -  0', {
      fontFamily: 'Pretendard, monospace',
      fontSize: '26px',
      color: '#FFFFFF',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5).setDepth(16);

    this.jumbotronTimerText = this.add.text(jumbotronIso.x, jumbotronIso.y + 24, '00:00 [1H]', {
      fontFamily: 'Pretendard, sans-serif',
      fontSize: '11px',
      color: '#4CD964',
      fontStyle: 'bold',
      resolution: 2,
    }).setOrigin(0.5).setDepth(16);

    // Keep viewport layout crisp on window resize
    const onResize = () => {
      if (!this.scene.isActive()) return;
      const s = this.getViewScale();
      this.refereeMsgContainer.setPosition(this.scale.width / 2, 118 * s).setScale(s);
      this.skillBannerContainer.setPosition(this.scale.width / 2, 76 * s).setScale(s);
      this.updateCameraInstant();
      this.renderRadar();
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
    });

    // 7. Camera Setup (Default: Fixed Sky View scaled cleanly for HiDPI)
    this.updateCameraInstant();

    // 8. Start Kickoff Sequence
    this.startKickoff('user');

    // Emit initial status
    this.emitEvent('score-update', { userScore: 0, aiScore: 0 });
    this.emitEvent('time-update', { minutes: 0, seconds: 0, half: 1 });
  }

  private setupInputs() {
    if (!this.input.keyboard) return;

    // ── 1P Movement: W, A, S, D & Arrow Keys ──
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasdKeys = this.input.keyboard.addKeys('W,A,S,D') as any;

    // ── 1P Dedicated Actions: R(Pass), E(Shoot/Charge), Q(Tackle), C(GK Dive), X(Camera Switch) ──
    this.p1Keys = {
      R: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      E: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      Q: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      C: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      X: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      SHIFT: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      TAB: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
    };

    // ── 1P Key Events ──
    // [R]: Pass (also immediately starts play if pressed during user's set-piece/kickoff!)
    this.p1Keys.R.on('down', () => {
      if (!this.isMatchRunning && this.ballOwner && this.ballOwner.team === 'user') {
        this.flushPendingPhaseResume();
      }
      if (this.controlledActorP1 && this.ballOwner === this.controlledActorP1) {
        this.handleP1Pass();
      } else {
        this.switchControlledPlayerP1();
      }
    });

    // [E]: Shoot (Hold to charge power, release to shoot)
    this.p1Keys.E.on('down', () => {
      if (!this.isMatchRunning && this.ballOwner && this.ballOwner.team === 'user') {
        this.flushPendingPhaseResume();
      }
      if (this.controlledActorP1 && this.ballOwner === this.controlledActorP1) {
        this.isChargingShotP1 = true;
        this.shotChargeP1 = 0;
      } else {
        this.handleP1StandingTackle();
      }
    });
    this.p1Keys.E.on('up', () => {
      if (this.isChargingShotP1) {
        this.isChargingShotP1 = false;
        this.executeP1Shoot(Math.max(0.2, this.shotChargeP1));
        this.shotChargeP1 = 0;
      }
    });

    // [Q]: Tackle
    this.p1Keys.Q.on('down', () => {
      this.handleP1Tackle();
    });

    // [C]: Goalkeeper Dive
    this.p1Keys.C.on('down', () => {
      this.handleGoalkeeperDive('user');
    });

    // [X]: Camera View Switch (하늘 고정 뷰 -> 3인칭 추적 뷰 -> 1인칭 밀착 뷰 -> 반복)
    this.p1Keys.X.on('down', () => {
      this.toggleCameraViewMode();
    });

    // [Space]: Slide Tackle
    this.p1Keys.SPACE.on('down', () => {
      this.handleP1SlideTackle();
    });

    // [Tab]: Switch Controlled Player
    this.p1Keys.TAB.on('down', (e: any) => {
      if (e && e.preventDefault) e.preventDefault();
      this.switchControlledPlayerP1();
    });

    // ── 2P Keys (PvP Mode) ──
    this.p2PassKey1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.p2PassKeyNum1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE);
    this.p2ShootKey2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.p2ShootKeyNum2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO);
    this.p2CrossKey3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
    this.p2CrossKeyNum3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE);
    this.p2ThroughKey4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR);
    this.p2ThroughKeyNum4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR);
    this.p2TackleKey5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);
    this.p2TackleKeyNum5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE);
    this.p2SwitchKey0 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ZERO);
    this.p2SwitchKeyNum0 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO);
    this.p2SwitchKeyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.p2SprintKeyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    const onP2Pass = () => { if (this.isPvPMode) this.handleP2Pass(); };
    const onP2Cross = () => { if (this.isPvPMode) this.handleP2Cross(); };
    const onP2Through = () => { if (this.isPvPMode) this.handleP2ThroughPass(); };
    const onP2Tackle = () => { if (this.isPvPMode) this.handleP2Tackle(); };
    const onP2Switch = () => { if (this.isPvPMode) this.switchControlledPlayerP2(); };

    this.p2PassKey1.on('down', onP2Pass);
    this.p2PassKeyNum1.on('down', onP2Pass);
    this.p2CrossKey3.on('down', onP2Cross);
    this.p2CrossKeyNum3.on('down', onP2Cross);
    this.p2ThroughKey4.on('down', onP2Through);
    this.p2ThroughKeyNum4.on('down', onP2Through);
    this.p2TackleKey5.on('down', onP2Tackle);
    this.p2TackleKeyNum5.on('down', onP2Tackle);
    this.p2SwitchKey0.on('down', onP2Switch);
    this.p2SwitchKeyNum0.on('down', onP2Switch);
    this.p2SwitchKeyEnter.on('down', onP2Switch);

    // 2P Shot Charging (2 or Numpad 2)
    const onP2ShootDown = () => {
      if (this.isPvPMode && this.controlledActorP2 && this.ballOwner === this.controlledActorP2) {
        this.isChargingShotP2 = true;
        this.shotChargeP2 = 0;
      }
    };
    const onP2ShootUp = () => {
      if (this.isPvPMode && this.isChargingShotP2) {
        this.isChargingShotP2 = false;
        this.executeP2Shoot(Math.max(0.2, this.shotChargeP2));
        this.shotChargeP2 = 0;
      }
    };

    this.p2ShootKey2.on('down', onP2ShootDown);
    this.p2ShootKeyNum2.on('down', onP2ShootDown);
    this.p2ShootKey2.on('up', onP2ShootUp);
    this.p2ShootKeyNum2.on('up', onP2ShootUp);
  }

  /**
   * Spawns detailed human football players with faces, hairstyles, GK gloves, and jersey back numbers
   */
  private spawnTeam(
    team: 'user' | 'ai',
    lineup: { playerId: string; position: string; x: number; y: number }[],
    players: Player[]
  ) {
    const isUser = team === 'user';
    const primaryColor = isUser ? 0x245484 : 0xBA2D2D;
    const accentTrim = isUser ? 0xD4AF37 : 0xEFEFEF;
    const shortsColor = isUser ? 0xF2EFE9 : 0x1E1E22;
    const usedNumbers = new Set<number>();

    for (let i = 0; i < lineup.length; i++) {
      const slot = lineup[i];
      const player = players.find((p) => p.id === slot.playerId) || players[i % players.length];
      if (!player) continue;

      const profile = resolvePlayerVisualProfile(player.id, slot.position, usedNumbers);

      let wx: number;
      let wy: number;
      if (slot.position === 'GK') {
        wx = isUser ? 34 : PITCH_WIDTH - 34;
        wy = PITCH_HALF_H;
      } else {
        const forwardRatio = Phaser.Math.Clamp((100 - slot.y) / 100, 0.08, 0.90);
        wx = forwardRatio * (PITCH_WIDTH * 0.47);
        if (!isUser) {
          wx = PITCH_WIDTH - wx;
        }
        wy = 70 + (slot.x / 100) * (PITCH_HEIGHT - 140);
        if (!isUser) {
          wy = PITCH_HEIGHT - wy;
        }
      }

      const container = this.add.container(0, 0);
      container.setScale(1.16, 1.16);

      // 1. Realistic 3D Ground Cast Shadow (Zero-Earcut Fast Ellipse)
      const shadow = this.add.graphics();
      shadow.fillStyle(COLORS.shadow, 0.42);
      fillFastEllipse(shadow, 0, 4, 11, 5, 8);
      container.add(shadow);

      // 2. Detailed Human Model Graphics (face, hairstyle, limbs, GK gloves)
      const bodyGfx = this.add.graphics();
      drawDetailedIsoPlayer(bodyGfx, {
        primaryColor,
        accentTrim,
        shortsColor,
        profile,
        animPhase: 0,
        isMoving: false,
        showFrontFace: true,
      });
      container.add(bodyGfx);

      // 2-2. Crisp Jersey Squad Number printed directly onto shirt!
      const jerseyNumText = this.add.text(0, -17.5, `${profile.jerseyNumber}`, {
        fontFamily: 'Pretendard, Impact, sans-serif',
        fontSize: '9px',
        fontStyle: 'bold',
        color: isUser ? '#FFD54F' : '#FFFFFF',
        stroke: '#111114',
        strokeThickness: 2.2,
        resolution: 2,
      }).setOrigin(0.5);
      container.add(jerseyNumText);

      // 3. Highlight Ring
      const ring = this.add.graphics();
      ring.lineStyle(2.8, isUser ? COLORS.accentGold : 0xff3b30, 1);
      ring.strokeCircle(0, 2, 17);
      ring.setVisible(false);
      container.add(ring);

      // 4. Shot Gauge Bar (Above head)
      const gaugeGfx = this.add.graphics();
      gaugeGfx.setVisible(false);
      container.add(gaugeGfx);

      // 5. Player Tag ([1P] / [2P])
      const tagText = this.add.text(0, -54, isUser ? '1P' : '2P', {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: isUser ? '#B89B68' : '#FF6B6B',
        backgroundColor: 'rgba(27,26,24,0.9)',
        padding: { x: 4, y: 1 },
        resolution: 2,
      }).setOrigin(0.5);
      tagText.setVisible(false);
      container.add(tagText);

      // 6. Crisp HiDPI Squad Number + Name Badge
      const nameText = this.add.text(0, -42, `#${profile.jerseyNumber} ${player.name}`, {
        fontFamily: 'Pretendard, sans-serif',
        fontSize: '10.5px',
        fontStyle: 'bold',
        color: '#FFFCF7',
        backgroundColor: 'rgba(20,20,24,0.74)',
        padding: { x: 4, y: 1 },
        resolution: 2,
      }).setOrigin(0.5);
      container.add(nameText);

      const actor: MatchActor = {
        id: `${team}_${i}_${player.id}`,
        name: player.name,
        team,
        position: slot.position,
        grade: player.grade,
        stats: player.stats,
        specialAbility: player.specialAbility,
        specialAbilityDesc: player.specialAbilityDesc,
        skillCooldown: 0,
        wx,
        wy,
        vx: 0,
        vy: 0,
        facingAngle: isUser ? 0 : Math.PI,
        profile,
        baseWx: wx,
        baseWy: wy,
        isControlled: false,
        hasBall: false,
        tackleCooldown: 0,
        animTimer: Math.random() * 10,
        container,
        shadow,
        bodyGfx,
        jerseyNumText,
        ring,
        gaugeGfx,
        tagText,
        nameText,
      };

      this.actors.push(actor);
    }
  }

  /**
   * Spawns Main On-Pitch Referee (주심) & 2 Touchline Assistant Referees (부심)
   */
  private spawnReferees() {
    const createRef = (wx: number, wy: number, isLinesman: boolean): RefereeActor => {
      const container = this.add.container(0, 0);
      container.setScale(1.14, 1.14);

      const shadow = this.add.graphics();
      shadow.fillStyle(COLORS.shadow, 0.38);
      fillFastEllipse(shadow, 0, 4, 10, 4.5, 8);
      container.add(shadow);

      const bodyGfx = this.add.graphics();
      drawDetailedReferee(bodyGfx, 0, false, 'none', isLinesman, false);
      container.add(bodyGfx);

      if (!isLinesman) {
        const refTag = this.add.text(0, -41, '주심', {
          fontFamily: 'Pretendard, sans-serif',
          fontSize: '9.5px',
          fontStyle: 'bold',
          color: '#E6F542',
          backgroundColor: 'rgba(20,20,24,0.72)',
          padding: { x: 4, y: 1 },
          resolution: 2,
        }).setOrigin(0.5);
        container.add(refTag);
      }

      return {
        wx,
        wy,
        vx: 0,
        vy: 0,
        animTimer: 0,
        signalState: 'none',
        signalTimerMs: 0,
        isLinesman,
        flagUp: false,
        container,
        bodyGfx,
      };
    };

    this.mainReferee = createRef(PITCH_HALF_W - 65, PITCH_HALF_H - 95, false);
    this.linesmen = [
      createRef(PITCH_HALF_W - 120, -18, true),
      createRef(PITCH_HALF_W + 120, PITCH_HEIGHT + 18, true),
    ];
  }

  private setRefereeSignal(
    state: 'none' | 'whistle' | 'yellow_card' | 'point_left' | 'point_right',
    durationMs = 1500,
    raiseLinesmanFlags = false
  ) {
    if (!this.mainReferee) return;
    this.mainReferee.signalState = state;
    this.mainReferee.signalTimerMs = durationMs;
    for (const lm of this.linesmen) {
      lm.flagUp = raiseLinesmanFlags;
      lm.signalTimerMs = raiseLinesmanFlags ? durationMs : 0;
    }
  }

  /**
   * Draws a stylized 3D soccer ball with realistic volume, specular shine, and pentagon pattern
   * using zero-Earcut GPU triangles
   */
  private draw3DSoccerBall(gfx: Phaser.GameObjects.Graphics) {
    gfx.clear();

    gfx.fillStyle(0x1A1A1A, 0.9);
    fillFastCircle(gfx, 0, 0, BALL_RADIUS + 0.9, 12);

    gfx.fillStyle(0xF4F4F6, 1);
    fillFastCircle(gfx, 0, 0, BALL_RADIUS, 12);

    gfx.fillStyle(0x1F2024, 0.9);
    fillFastCircle(gfx, -0.5, -0.5, 2.2, 8);
    fillFastCircle(gfx, -3.2, 2.2, 1.4, 8);
    fillFastCircle(gfx, 3.2, 2.2, 1.4, 8);
    fillFastCircle(gfx, 3.0, -2.5, 1.3, 8);

    gfx.fillStyle(0xFFFFFF, 0.95);
    fillFastCircle(gfx, -1.8, -2.2, 1.7, 8);
  }

  private setControlledActorP1(actor: MatchActor) {
    if (this.controlledActorP1) {
      this.controlledActorP1.isControlled = false;
      this.controlledActorP1.ring.setVisible(false);
      this.controlledActorP1.tagText.setVisible(false);
      this.controlledActorP1.gaugeGfx.setVisible(false);
    }
    this.controlledActorP1 = actor;
    actor.isControlled = true;
    actor.ring.setVisible(true);
    actor.tagText.setVisible(true);

    this.emitEvent('player-switch', {
      name: actor.name,
      grade: actor.grade,
      position: actor.position,
      playerNum: 1,
      jerseyNumber: actor.profile.jerseyNumber,
    });
  }

  private setControlledActorP2(actor: MatchActor) {
    if (this.controlledActorP2) {
      this.controlledActorP2.isControlled = false;
      this.controlledActorP2.ring.setVisible(false);
      this.controlledActorP2.tagText.setVisible(false);
      this.controlledActorP2.gaugeGfx.setVisible(false);
    }
    this.controlledActorP2 = actor;
    actor.isControlled = true;
    actor.ring.setVisible(true);
    actor.tagText.setVisible(true);

    this.emitEvent('player-switch', {
      name: actor.name,
      grade: actor.grade,
      position: actor.position,
      playerNum: 2,
      jerseyNumber: actor.profile.jerseyNumber,
    });
  }

  private switchControlledPlayerP1() {
    const userField = this.actors.filter((a) => a.team === 'user');
    let closest: MatchActor | null = null;
    let minDist = Infinity;

    for (const actor of userField) {
      if (actor === this.controlledActorP1) continue;
      const dist = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
      if (dist < minDist) {
        minDist = dist;
        closest = actor;
      }
    }

    if (closest) {
      this.setControlledActorP1(closest);
    }
  }

  private switchControlledPlayerP2() {
    const aiField = this.actors.filter((a) => a.team === 'ai');
    let closest: MatchActor | null = null;
    let minDist = Infinity;

    for (const actor of aiField) {
      if (actor === this.controlledActorP2) continue;
      const dist = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
      if (dist < minDist) {
        minDist = dist;
        closest = actor;
      }
    }

    if (closest) {
      this.setControlledActorP2(closest);
    }
  }

  private startKickoff(team: 'user' | 'ai') {
    this.isMatchRunning = false;
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballVz = 0;
    this.ballWx = PITCH_HALF_W;
    this.ballWy = PITCH_HALF_H;
    this.ballWz = 0;
    this.ballOwner = null;
    this.lastKickActor = null;
    this.lastKickCooldownMs = 0;

    for (const a of this.actors) {
      a.wx = a.baseWx;
      a.wy = a.baseWy;
      a.vx = 0;
      a.vy = 0;
      a.hasBall = false;
    }

    // Push opposing players outside the center circle so kickoff is never swarmed
    for (const a of this.actors) {
      if (a.team !== team) {
        const dx = a.wx - PITCH_HALF_W;
        const dy = a.wy - PITCH_HALF_H;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < CENTER_CIRCLE_RADIUS + 30) {
          const pushDir = a.team === 'user' ? -1 : 1;
          a.wx = PITCH_HALF_W + pushDir * (CENTER_CIRCLE_RADIUS + 40);
        }
      }
    }

    const kickers = this.actors.filter((a) => a.team === team && a.position !== 'GK');
    // Prefer striker or forwardmost player as kickoff taker
    kickers.sort((a, b) => (team === 'user' ? b.baseWx - a.baseWx : a.baseWx - b.baseWx));
    const kicker = kickers[0];
    if (kicker) {
      kicker.wx = PITCH_HALF_W + (team === 'user' ? -12 : 12);
      kicker.wy = PITCH_HALF_H;
      // Directly grant ball possession so our team's kickoff immediately holds the ball!
      this.takePossession(kicker);
    }

    if (this.mainReferee) {
      this.mainReferee.wx = PITCH_HALF_W - 45;
      this.mainReferee.wy = PITCH_HALF_H - 95;
      this.mainReferee.vx = 0;
      this.mainReferee.vy = 0;
      this.setRefereeSignal('whistle', 1400, false);
    }

    const msg = team === 'user'
      ? (this.isPvPMode ? '1P 킥오프!' : '주심 휘슬 — 우리 팀 킥오프!')
      : (this.isPvPMode ? '2P 킥오프!' : '주심 휘슬 — 상대 팀 킥오프!');

    this.showRefereeMessage(msg, 1200, () => {
      if (kicker && !this.ballOwner) {
        this.takePossession(kicker);
      }
      this.possessionShieldMs = 700;
      this.isMatchRunning = true;
    });
  }

  private flushPendingPhaseResume() {
    if (!this.phaseResumeCallback) return;
    const cb = this.phaseResumeCallback;
    this.phaseResumeCallback = null;
    this.phaseResumeTimerMs = 0;
    this.phaseResumeWallDeadline = 0;
    if (this.refereeMsgHideEvent) {
      this.refereeMsgHideEvent.remove(false);
      this.refereeMsgHideEvent = null;
    }
    this.refereeMsgContainer.setVisible(false);
    cb();
  }

  private showRefereeMessage(msg: string, duration = 1800, onDone?: () => void) {
    this.refereeMessageText.setText(msg);
    const padX = 28;
    const padY = 14;
    const bw = Math.max(220, this.refereeMessageText.width + padX * 2);
    const bh = this.refereeMessageText.height + padY * 2;
    this.refereeMsgBg.clear();
    this.refereeMsgBg.fillStyle(0x131722, 0.90);
    this.refereeMsgBg.fillRoundedRect(-bw * 0.5, -bh * 0.5, bw, bh, bh * 0.5);
    this.refereeMsgBg.lineStyle(1.8, 0xD4AF37, 0.78);
    this.refereeMsgBg.strokeRoundedRect(-bw * 0.5, -bh * 0.5, bw, bh, bh * 0.5);
    this.refereeMsgContainer.setVisible(true);

    if (this.refereeMsgHideEvent) {
      this.refereeMsgHideEvent.remove(false);
      this.refereeMsgHideEvent = null;
    }

    if (onDone) {
      // Driven directly by update() + wall-clock safety so kickoff/set-pieces NEVER get stuck!
      this.phaseResumeTimerMs = duration;
      this.phaseResumeWallDeadline = performance.now() + duration + 200;
      this.phaseResumeCallback = onDone;
    } else {
      this.refereeMsgHideEvent = this.time.delayedCall(duration, () => {
        this.refereeMsgHideEvent = null;
        if (!this.phaseResumeCallback) {
          this.refereeMsgContainer.setVisible(false);
        }
      });
    }
  }

  public showSkillBanner(text: string) {
    if (!this.skillBannerContainer || !this.skillBannerText) return;
    this.skillBannerText.setText(text);
    this.skillBannerContainer.setVisible(true);
    this.skillBannerContainer.setAlpha(1);
    this.tweens.killTweensOf(this.skillBannerContainer);
    this.tweens.add({
      targets: this.skillBannerContainer,
      scaleX: { from: 0.85, to: 1.05 },
      scaleY: { from: 0.85, to: 1.05 },
      duration: 160,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(1600, () => {
          this.tweens.add({
            targets: this.skillBannerContainer,
            alpha: 0,
            duration: 250,
            onComplete: () => this.skillBannerContainer.setVisible(false),
          });
        });
      },
    });
  }

  // ── 1P Actions ──
  private handleP1Pass() {
    if (!this.controlledActorP1 || this.ballOwner !== this.controlledActorP1) return;
    const actor = this.controlledActorP1;
    this.lastTouchActor = actor;
    this.fpKickAnimMs = 220;

    const teammates = this.actors.filter((a) => a.team === 'user' && a !== actor);
    let bestTarget: MatchActor | null = null;
    let maxScore = -Infinity;

    const aimDirX = actor.vx !== 0 || actor.vy !== 0 ? Math.cos(actor.facingAngle) : 1;
    const aimDirY = actor.vx !== 0 || actor.vy !== 0 ? Math.sin(actor.facingAngle) : 0;

    for (const tm of teammates) {
      const dx = tm.wx - actor.wx;
      const dy = tm.wy - actor.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 25 || dist > 920) continue;

      const alignment = (dx * aimDirX + dy * aimDirY) / dist;
      const score = alignment * 100 - dist * 0.07;
      if (score > maxScore) {
        maxScore = score;
        bestTarget = tm;
      }
    }

    // Special Ability: 비전 패스 / 택배 킬패스
    let passSpeed = BALL_PASS_SPEED;
    if (actor.specialAbility === '비전 패스' || actor.specialAbility === '택배 킬패스') {
      passSpeed *= 1.35;
      this.showSkillBanner(`[SKILL] ${actor.name} — ${actor.specialAbility}! 칼날 킬패스!`);
    }

    this.releaseBall();
    if (bestTarget) {
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, bestTarget.wx, bestTarget.wy);
      this.ballVx = Math.cos(angle) * passSpeed;
      this.ballVy = Math.sin(angle) * passSpeed;
      this.time.delayedCall(150, () => {
        if (bestTarget) this.setControlledActorP1(bestTarget);
      });
    } else {
      this.ballVx = aimDirX * passSpeed;
      this.ballVy = aimDirY * passSpeed;
    }
  }

  // FIFA Online W-Key Through Pass (침투 스루패스)
  private handleP1ThroughPass() {
    if (!this.controlledActorP1 || this.ballOwner !== this.controlledActorP1) return;
    const actor = this.controlledActorP1;
    this.lastTouchActor = actor;

    const teammates = this.actors.filter((a) => a.team === 'user' && a !== actor && a.position !== 'GK');
    let bestTarget: MatchActor | null = null;
    let maxScore = -Infinity;

    for (const tm of teammates) {
      const dx = tm.wx - actor.wx;
      if (dx < 30) continue;
      const dy = tm.wy - actor.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 40 || dist > 820) continue;

      const score = dx * 1.6 - Math.abs(dy) * 0.7;
      if (score > maxScore) {
        maxScore = score;
        bestTarget = tm;
      }
    }

    let speed = BALL_PASS_SPEED * 1.28;
    if (actor.specialAbility === '비전 패스' || actor.specialAbility === '택배 킬패스') {
      speed *= 1.35;
      this.showSkillBanner(`[SKILL] ${actor.name} — ${actor.specialAbility}! 수비벽을 허무는 킬패스!`);
    }

    this.releaseBall();
    if (bestTarget) {
      const leadX = bestTarget.wx + (bestTarget.vx !== 0 ? Math.sign(bestTarget.vx) * 65 : 60);
      const leadY = bestTarget.wy + bestTarget.vy * 0.25;
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, leadX, leadY);
      this.ballVx = Math.cos(angle) * speed;
      this.ballVy = Math.sin(angle) * speed;
      this.time.delayedCall(160, () => {
        if (bestTarget) this.setControlledActorP1(bestTarget);
      });
    } else {
      this.ballVx = speed;
      this.ballVy = 0;
    }
  }

  private executeP1Shoot(powerRatio: number) {
    if (!this.controlledActorP1 || this.ballOwner !== this.controlledActorP1) return;
    const actor = this.controlledActorP1;
    this.lastTouchActor = actor;
    this.fpKickAnimMs = 220;
    this.releaseBall();

    const goalX = PITCH_WIDTH;
    let goalY = Phaser.Math.Between(GOAL_Y_MIN + 10, GOAL_Y_MAX - 10);

    const shotStat = (actor.stats.shooting || 70) / 100;
    let speed = BALL_SHOT_SPEED * (0.65 + powerRatio * 0.7) * (0.8 + shotStat * 0.35);
    let verticalBoost = 90 + powerRatio * 210;

    // Special Ability Check: 슈팅 스킬
    if (actor.specialAbility === '로켓 슈팅') {
      speed *= 1.35;
      this.showSkillBanner(`[SKILL] ${actor.name} — 로켓 슈팅! 시속 140km 대포알 슛!`);
    } else if (actor.specialAbility === '에어리얼 킹') {
      speed *= 1.25;
      verticalBoost *= 1.4;
      this.showSkillBanner(`[SKILL] ${actor.name} — 에어리얼 킹! 압도적 타점 슈팅!`);
    } else if (actor.specialAbility === '양발잡이') {
      speed *= 1.2;
      goalY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2 + (Math.random() > 0.5 ? 24 : -24);
      this.showSkillBanner(`[SKILL] ${actor.name} — 양발잡이! 구석을 찌르는 완벽한 슛!`);
    } else if (actor.specialAbility === '컷인 마스터') {
      speed *= 1.25;
      goalY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2 + (actor.wy > PITCH_HALF_H ? -26 : 26);
      this.showSkillBanner(`[SKILL] ${actor.name} — 컷인 마스터! 예술적 바나나 킥!`);
    }

    const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, goalX, goalY);

    this.ballVx = Math.cos(angle) * speed;
    this.ballVy = Math.sin(angle) * speed;
    this.ballVz = verticalBoost;

    // Induce aerodynamic Magnus spin (amplified for curve specialists or angled shots)
    const latSign = actor.wy > PITCH_HALF_H ? 1 : -1;
    if (actor.specialAbility === '컷인 마스터') {
      this.ballSpin = latSign * 2.25;
    } else if (actor.specialAbility === '양발잡이') {
      this.ballSpin = latSign * 1.45;
    } else {
      this.ballSpin = Phaser.Math.Clamp((actor.vy / 180) * 1.15, -1.35, 1.35);
    }
  }

  private handleP1Cross() {
    if (!this.controlledActorP1 || this.ballOwner !== this.controlledActorP1) return;
    const actor = this.controlledActorP1;
    this.lastTouchActor = actor;
    this.releaseBall();
    this.ballSpin = (actor.wy < PITCH_HALF_H ? 1 : -1) * (actor.specialAbility === '황금 크로스' ? 2.1 : 1.3);

    const teammates = this.actors.filter((a) => a.team === 'user' && a !== actor && a.position !== 'GK');
    let bestTarget: MatchActor | null = null;
    let minTargetDist = Infinity;

    for (const tm of teammates) {
      const _dx = tm.wx - (PITCH_WIDTH - 120), _dy = tm.wy - PITCH_HALF_H;
      const distToBox = Math.sqrt(_dx * _dx + _dy * _dy);
      // Special target bonus for ST
      const priorityBonus = tm.position === 'ST' ? -50 : 0;
      if (distToBox + priorityBonus < minTargetDist) {
        minTargetDist = distToBox + priorityBonus;
        bestTarget = tm;
      }
    }

    // Special Ability: 황금 크로스
    let crossSpeed = 440;
    this.ballVz = 330;
    if (actor.specialAbility === '황금 크로스') {
      this.ballVz = 360;
      crossSpeed = 470;
      this.showSkillBanner(`[SKILL] ${actor.name} — 황금 크로스! 자로 잰 듯한 택배 배달!`);
    }

    if (bestTarget) {
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, bestTarget.wx, bestTarget.wy);
      this.ballVx = Math.cos(angle) * crossSpeed;
      this.ballVy = Math.sin(angle) * crossSpeed;
      this.time.delayedCall(150, () => {
        if (bestTarget) this.setControlledActorP1(bestTarget);
      });
    } else {
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, PITCH_WIDTH - 120, PITCH_HALF_H);
      this.ballVx = Math.cos(angle) * crossSpeed;
      this.ballVy = Math.sin(angle) * crossSpeed;
    }
  }

  private handleP1Tackle() {
    if (!this.controlledActorP1) return;
    const actor = this.controlledActorP1;
    if (this.ballOwner === actor) {
      this.handleP1ThroughPass();
      return;
    }
    const speed = Math.sqrt(actor.vx * actor.vx + actor.vy * actor.vy);
    if (speed > 60) {
      this.handleP1SlideTackle();
    } else {
      this.handleP1StandingTackle();
    }
  }

  private handleGoalkeeperDive(team: 'user' | 'ai') {
    if (team === 'user') {
      this.fpGkDiveMs = 420;
    }
    const gk = this.actors.find((a) => a.team === team && a.position === 'GK');
    if (!gk) return;

    const dx = this.ballWx - gk.wx;
    const dy = this.ballWy - gk.wy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // GK lunges towards ball trajectory
    const isCasillas = gk.specialAbility === '성 카시야스 기적의 반사신경' || gk.name.includes('카시야스');
    const isEliteGK = isCasillas || gk.specialAbility === '스위퍼 키퍼 세이브' || gk.specialAbility === '거미손 레전드';
    const diveSpeed = isEliteGK ? 540 : 400;

    if (dist > 2) {
      gk.vx = (dx / dist) * diveSpeed;
      gk.vy = (dy / dist) * diveSpeed;
    }

    // Dynamic Dive Tilt & Ground Slide Animation
    this.tweens.killTweensOf(gk.container);
    this.tweens.add({
      targets: gk.container,
      angle: dx >= 0 ? 32 : -32,
      duration: 220,
      yoyo: true,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        gk.container.setAngle(0);
      },
    });

    // Save Resolution
    const maxSaveDist = isEliteGK ? 160 : 100;
    if (dist < maxSaveDist && !this.ballOwner) {
      const saveChance = isEliteGK ? 0.94 : 0.78;
      if (Math.random() < saveChance) {
        if (isEliteGK) {
          this.showSkillBanner(`[GK] ${gk.name} — ${gk.specialAbility || '성 카시야스 기적의 반사신경'}! 환상적인 다이빙 슈퍼세이브!`);
        } else {
          this.showSkillBanner(`[GK] ${gk.name} — 전광석화 다이빙 슈퍼세이브!`);
        }

        this.lastTouchActor = gk;
        if (dist < 48 && this.ballWz < 55) {
          // Clean catch
          this.takePossession(gk);
        } else {
          // Parry / punch ball away safely from user goal
          const clearDir = team === 'user' ? 1 : -1;
          this.ballVx = clearDir * (280 + Math.random() * 100);
          this.ballVy = (Math.random() - 0.5) * 260;
          this.ballVz = 100 + Math.random() * 60;
        }
        return;
      }
    }

    if (isCasillas) {
      this.showSkillBanner(`[GK] ${gk.name} — 성 카시야스 다이빙 세이브 태세!`);
    } else {
      this.showSkillBanner(`[GK] ${gk.name} — 골키퍼 다이빙!`);
    }
  }

  private handleP1SlideTackle() {
    if (!this.controlledActorP1 || this.ballOwner === this.controlledActorP1) return;
    const actor = this.controlledActorP1;
    if (actor.tackleCooldown > 0) return;

    actor.tackleCooldown = TACKLE_COOLDOWN_MS;
    const facingX = actor.vx !== 0 ? Math.sign(actor.vx) : 1;
    actor.vx = facingX * TACKLE_LUNGE_SPEED;

    // Defender Special Ability
    let reach = TACKLE_RANGE;
    let foulChance = TACKLE_FOUL_CHANCE;
    if (actor.specialAbility === '괴물 태클' || actor.specialAbility === '에어리얼 월') {
      reach += 18;
      foulChance *= 0.35;
      this.showSkillBanner(`[SKILL] ${actor.name} — ${actor.specialAbility}! 철벽 클린 태클!`);
    }

    const distBall = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
    if (distBall < reach) {
      // Attacker Dribble Resistance Check: 황소 돌파 / 신의 드리블
      if (this.ballOwner && (this.ballOwner.specialAbility === '황소 돌파' || this.ballOwner.specialAbility === '신의 드리블')) {
        if (Math.random() < 0.65) {
          this.showSkillBanner(`[SKILL] ${this.ballOwner.name} — ${this.ballOwner.specialAbility}! 태클을 튕겨내고 돌파!`);
          actor.vx = -facingX * 120; // 수비수가 튕겨나감
          return;
        }
      }

      this.lastTouchActor = actor;
      if (Math.random() < foulChance && this.ballOwner && this.ballOwner.team === 'ai') {
        this.callFoul('user', actor);
      } else {
        this.takePossession(actor);
      }
    }
  }

  private handleP1StandingTackle() {
    if (!this.controlledActorP1 || this.ballOwner === this.controlledActorP1) return;
    const actor = this.controlledActorP1;
    if (actor.tackleCooldown > 0) return;

    actor.tackleCooldown = 600;
    let reach = TACKLE_RANGE;
    if (actor.specialAbility === '괴물 태클' || actor.specialAbility === '에어리얼 월') {
      reach += 15;
    }

    const distBall = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
    if (distBall < reach) {
      if (this.ballOwner && (this.ballOwner.specialAbility === '황소 돌파' || this.ballOwner.specialAbility === '신의 드리블')) {
        if (Math.random() < 0.6) {
          this.showSkillBanner(`[SKILL] ${this.ballOwner.name} — ${this.ballOwner.specialAbility}! 몸싸움 압승!`);
          return;
        }
      }
      this.lastTouchActor = actor;
      this.takePossession(actor);
    }
  }

  // ── 2P Actions ──
  private handleP2Pass() {
    if (!this.controlledActorP2 || this.ballOwner !== this.controlledActorP2) return;
    const actor = this.controlledActorP2;
    this.lastTouchActor = actor;

    const teammates = this.actors.filter((a) => a.team === 'ai' && a !== actor);
    let bestTarget: MatchActor | null = null;
    let maxScore = -Infinity;
    const facingX = actor.vx !== 0 ? Math.sign(actor.vx) : -1;

    for (const tm of teammates) {
      const dx = tm.wx - actor.wx;
      const dy = tm.wy - actor.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 30 || dist > 880) continue;

      const forwardness = (dx * facingX) / dist;
      const score = forwardness * 100 - dist * 0.07;
      if (score > maxScore) {
        maxScore = score;
        bestTarget = tm;
      }
    }

    let passSpeed = BALL_PASS_SPEED;
    if (actor.specialAbility === '비전 패스' || actor.specialAbility === '택배 킬패스') {
      passSpeed *= 1.35;
      this.showSkillBanner(`[SKILL] 2P ${actor.name} — ${actor.specialAbility}! 칼날 킬패스!`);
    }

    this.releaseBall();
    if (bestTarget) {
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, bestTarget.wx, bestTarget.wy);
      this.ballVx = Math.cos(angle) * passSpeed;
      this.ballVy = Math.sin(angle) * passSpeed;
      this.time.delayedCall(150, () => {
        if (bestTarget) this.setControlledActorP2(bestTarget);
      });
    } else {
      this.ballVx = facingX * passSpeed;
      this.ballVy = 0;
    }
  }

  // 2P FIFA Online Style Through Pass
  private handleP2ThroughPass() {
    if (!this.controlledActorP2 || this.ballOwner !== this.controlledActorP2) return;
    const actor = this.controlledActorP2;
    this.lastTouchActor = actor;

    const teammates = this.actors.filter((a) => a.team === 'ai' && a !== actor && a.position !== 'GK');
    let bestTarget: MatchActor | null = null;
    let maxScore = -Infinity;

    for (const tm of teammates) {
      const dx = actor.wx - tm.wx;
      if (dx < 30) continue;
      const dy = tm.wy - actor.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 40 || dist > 480) continue;

      const score = dx * 1.6 - Math.abs(dy) * 0.7;
      if (score > maxScore) {
        maxScore = score;
        bestTarget = tm;
      }
    }

    let speed = BALL_PASS_SPEED * 1.28;
    if (actor.specialAbility === '비전 패스' || actor.specialAbility === '택배 킬패스') {
      speed *= 1.35;
      this.showSkillBanner(`[SKILL] 2P ${actor.name} — ${actor.specialAbility}! 스루패스 찔러주기!`);
    }

    this.releaseBall();
    if (bestTarget) {
      const leadX = bestTarget.wx + (bestTarget.vx !== 0 ? Math.sign(bestTarget.vx) * 65 : -60);
      const leadY = bestTarget.wy + bestTarget.vy * 0.25;
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, leadX, leadY);
      this.ballVx = Math.cos(angle) * speed;
      this.ballVy = Math.sin(angle) * speed;
      this.time.delayedCall(160, () => {
        if (bestTarget) this.setControlledActorP2(bestTarget);
      });
    } else {
      this.ballVx = -speed;
      this.ballVy = 0;
    }
  }

  private executeP2Shoot(powerRatio: number) {
    if (!this.controlledActorP2 || this.ballOwner !== this.controlledActorP2) return;
    const actor = this.controlledActorP2;
    this.lastTouchActor = actor;
    this.releaseBall();

    const goalX = 0;
    let goalY = Phaser.Math.Between(GOAL_Y_MIN + 10, GOAL_Y_MAX - 10);

    const shotStat = (actor.stats.shooting || 70) / 100;
    let speed = BALL_SHOT_SPEED * (0.65 + powerRatio * 0.7) * (0.8 + shotStat * 0.35);
    let verticalBoost = 90 + powerRatio * 210;

    if (actor.specialAbility === '로켓 슈팅') {
      speed *= 1.35;
      this.showSkillBanner(`[SKILL] 2P ${actor.name} — 로켓 슈팅! 대포알 슛!`);
    } else if (actor.specialAbility === '에어리얼 킹') {
      speed *= 1.25;
      verticalBoost *= 1.4;
      this.showSkillBanner(`[SKILL] 2P ${actor.name} — 에어리얼 킹! 압도적 타점!`);
    } else if (actor.specialAbility === '양발잡이') {
      speed *= 1.2;
      goalY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2 + (Math.random() > 0.5 ? 24 : -24);
      this.showSkillBanner(`[SKILL] 2P ${actor.name} — 양발잡이! 정밀 슛!`);
    }

    const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, goalX, goalY);
    this.ballVx = Math.cos(angle) * speed;
    this.ballVy = Math.sin(angle) * speed;
    this.ballVz = verticalBoost;
  }

  private handleP2Cross() {
    if (!this.controlledActorP2 || this.ballOwner !== this.controlledActorP2) return;
    const actor = this.controlledActorP2;
    this.lastTouchActor = actor;
    this.releaseBall();

    const teammates = this.actors.filter((a) => a.team === 'ai' && a !== actor && a.position !== 'GK');
    let bestTarget: MatchActor | null = null;
    let minTargetDist = Infinity;

    for (const tm of teammates) {
      const _dx = tm.wx - 120, _dy = tm.wy - PITCH_HALF_H;
      const distToBox = Math.sqrt(_dx * _dx + _dy * _dy);
      const priorityBonus = tm.position === 'ST' ? -50 : 0;
      if (distToBox + priorityBonus < minTargetDist) {
        minTargetDist = distToBox + priorityBonus;
        bestTarget = tm;
      }
    }

    let crossSpeed = 440;
    this.ballVz = 330;
    if (actor.specialAbility === '황금 크로스') {
      this.ballVz = 360;
      crossSpeed = 470;
      this.showSkillBanner(`[SKILL] 2P ${actor.name} — 황금 크로스! 자로 잰 듯한 택배 배달!`);
    }

    if (bestTarget) {
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, bestTarget.wx, bestTarget.wy);
      this.ballVx = Math.cos(angle) * crossSpeed;
      this.ballVy = Math.sin(angle) * crossSpeed;
      this.time.delayedCall(150, () => {
        if (bestTarget) this.setControlledActorP2(bestTarget);
      });
    } else {
      const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, 120, PITCH_HALF_H);
      this.ballVx = Math.cos(angle) * crossSpeed;
      this.ballVy = Math.sin(angle) * crossSpeed;
    }
  }

  private handleP2Tackle() {
    if (!this.controlledActorP2 || this.ballOwner === this.controlledActorP2) return;
    const actor = this.controlledActorP2;
    if (actor.tackleCooldown > 0) return;

    actor.tackleCooldown = TACKLE_COOLDOWN_MS;
    const facingX = actor.vx !== 0 ? Math.sign(actor.vx) : -1;
    actor.vx = facingX * TACKLE_LUNGE_SPEED;

    let reach = TACKLE_RANGE;
    let foulChance = TACKLE_FOUL_CHANCE;
    if (actor.specialAbility === '괴물 태클' || actor.specialAbility === '에어리얼 월') {
      reach += 18;
      foulChance *= 0.35;
      this.showSkillBanner(`[SKILL] 2P ${actor.name} — ${actor.specialAbility}! 철벽 태클!`);
    }

    const distBall = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
    if (distBall < reach) {
      if (this.ballOwner && (this.ballOwner.specialAbility === '황소 돌파' || this.ballOwner.specialAbility === '신의 드리블')) {
        if (Math.random() < 0.65) {
          this.showSkillBanner(`[SKILL] ${this.ballOwner.name} — ${this.ballOwner.specialAbility}! 태클을 튕겨내고 돌파!`);
          actor.vx = -facingX * 120;
          return;
        }
      }

      this.lastTouchActor = actor;
      if (Math.random() < foulChance && this.ballOwner && this.ballOwner.team === 'user') {
        this.callFoul('ai', actor);
      } else {
        this.takePossession(actor);
      }
    }
  }

  private takePossession(actor: MatchActor) {
    if (this.ballOwner) {
      this.ballOwner.hasBall = false;
    }
    this.ballOwner = actor;
    this.lastTouchActor = actor;
    this.possessionShieldMs = 500;
    actor.hasBall = true;
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballVz = 0;
    this.ballWz = 0;

    const facingX = actor.vx !== 0 ? Math.sign(actor.vx) : actor.team === 'user' ? 1 : -1;
    this.ballWx = actor.wx + facingX * BALL_DRIBBLE_OFFSET;
    this.ballWy = actor.wy + 4;

    if (actor.team === 'user') {
      this.setControlledActorP1(actor);
    } else if (this.isPvPMode) {
      this.setControlledActorP2(actor);
    }
  }

  private releaseBall() {
    if (this.ballOwner) {
      this.lastKickActor = this.ballOwner;
      this.lastKickCooldownMs = 260;
      this.ballOwner.hasBall = false;
      this.ballOwner = null;
    }
  }

  private callFoul(foulTeam: 'user' | 'ai', actor: MatchActor) {
    this.isMatchRunning = false;
    this.releaseBall();
    const fkTeam: 'user' | 'ai' = foulTeam === 'user' ? 'ai' : 'user';
    this.ballWx = Phaser.Math.Clamp(this.ballWx, 60, PITCH_WIDTH - 60);
    this.ballWy = Phaser.Math.Clamp(this.ballWy, 50, PITCH_HEIGHT - 50);
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballVz = 0;
    this.ballWz = 0;

    // Push fouling team away from free kick spot & give ball to awarded team
    let kicker: MatchActor | null = null;
    let minD = Infinity;
    for (const a of this.actors) {
      a.vx = 0;
      a.vy = 0;
      const d = Phaser.Math.Distance.Between(a.wx, a.wy, this.ballWx, this.ballWy);
      if (a.team === fkTeam && a.position !== 'GK' && d < minD) {
        minD = d;
        kicker = a;
      } else if (a.team !== fkTeam && d < 140) {
        const ang = Phaser.Math.Angle.Between(this.ballWx, this.ballWy, a.wx, a.wy);
        a.wx = Phaser.Math.Clamp(this.ballWx + Math.cos(ang) * 150, 25, PITCH_WIDTH - 25);
        a.wy = Phaser.Math.Clamp(this.ballWy + Math.sin(ang) * 150, 25, PITCH_HEIGHT - 25);
      }
    }
    if (kicker) {
      kicker.wx = this.ballWx + (fkTeam === 'user' ? -10 : 10);
      kicker.wy = this.ballWy;
      this.takePossession(kicker);
    }

    // Main Referee rushes near foul spot and raises a Yellow Card!
    if (this.mainReferee) {
      this.mainReferee.wx = Phaser.Math.Clamp(this.ballWx - 28, 40, PITCH_WIDTH - 40);
      this.mainReferee.wy = Phaser.Math.Clamp(this.ballWy - 42, 40, PITCH_HEIGHT - 40);
      this.mainReferee.vx = 0;
      this.mainReferee.vy = 0;
      this.setRefereeSignal('yellow_card', 2200, true);
    }

    const msg = fkTeam === 'user'
      ? `[경고] 주심 휘슬! (${actor.name} 경고) 우리 팀 프리킥!`
      : `[경고] 주심 휘슬! (${actor.name} 경고) 상대 팀 프리킥!`;
    this.showRefereeMessage(msg, 1200, () => {
      if (kicker && !this.ballOwner) {
        this.takePossession(kicker);
      }
      this.possessionShieldMs = 650;
      this.isMatchRunning = true;
    });

    this.matchEvents.push({
      type: 'foul',
      minute: Math.floor((this.elapsedRealSeconds / HALF_DURATION_SECONDS) * 45),
      team: foulTeam,
      description: `${actor.name} 파울`,
    });
  }

  // ── Main Update Loop ──
  override update(_time: number, delta: number) {
    if (this.isPaused) {
      if (this.phaseResumeCallback) {
        this.phaseResumeWallDeadline = performance.now() + Math.max(100, this.phaseResumeTimerMs);
      }
      return;
    }

    // 0. Guaranteed Kickoff / Set-Piece Progression (delta + wall-clock fallback + quick WASD start)
    if (this.phaseResumeCallback) {
      this.phaseResumeTimerMs -= delta;
      const movePressed = Boolean(
        this.wasdKeys &&
        (this.wasdKeys.W.isDown || this.wasdKeys.A.isDown || this.wasdKeys.S.isDown || this.wasdKeys.D.isDown ||
         this.cursors?.up?.isDown || this.cursors?.down?.isDown || this.cursors?.left?.isDown || this.cursors?.right?.isDown)
      );
      const canQuickStart = Boolean(
        movePressed &&
        this.ballOwner &&
        this.ballOwner.team === 'user' &&
        this.phaseResumeTimerMs < 850
      );

      if (this.phaseResumeTimerMs <= 0 || performance.now() >= this.phaseResumeWallDeadline || canQuickStart) {
        this.flushPendingPhaseResume();
      }
    }

    if (this.fpKickAnimMs > 0) this.fpKickAnimMs = Math.max(0, this.fpKickAnimMs - delta);
    if (this.fpGkDiveMs > 0) this.fpGkDiveMs = Math.max(0, this.fpGkDiveMs - delta);

    // 1. Update Match Timer
    if (this.isMatchRunning) {
      this.elapsedRealSeconds += delta / 1000;
      const gameMinutes = Math.min(
        90,
        Math.floor((this.elapsedRealSeconds / HALF_DURATION_SECONDS) * 45) + (this.currentHalf === 2 ? 45 : 0)
      );
      const gameSeconds = Math.floor(((this.elapsedRealSeconds * TIME_SCALE) % 60));

      this.emitEvent('time-update', {
        minutes: gameMinutes,
        seconds: gameSeconds,
        half: this.currentHalf,
      });

      // Update Stadium Jumbotron Scoreboard
      if (this.jumbotronScoreText) {
        this.jumbotronScoreText.setText(`${this.userScore}  -  ${this.aiScore}`);
        const mStr = String(gameMinutes).padStart(2, '0');
        const sStr = String(gameSeconds).padStart(2, '0');
        this.jumbotronTimerText.setText(`${mStr}:${sStr} [${this.currentHalf}H]`);
      }

      if (this.elapsedRealSeconds >= HALF_DURATION_SECONDS) {
        if (this.currentHalf === 1) {
          this.handleHalftime();
        } else {
          this.handleMatchEnd('normal');
          return;
        }
      }

      // Surrender check: 5 goals deficit
      if (
        !this.isPvPMode &&
        this.aiScore - this.userScore >= SURRENDER_GOAL_DIFF &&
        Date.now() - this.lastSurrenderPrompt > SURRENDER_COOLDOWN_MS
      ) {
        this.lastSurrenderPrompt = Date.now();
        this.emitEvent('surrender-prompt', {});
      }
    }

    // 2. Shot Charging
    this.updateShotCharging(delta);

    // 3. Controlled Players Movement
    if (this.isMatchRunning) {
      if (this.controlledActorP1) {
        this.updateControlledPlayerP1(delta);
      }
      if (this.isPvPMode && this.controlledActorP2) {
        this.updateControlledPlayerP2(delta);
      }
    }

    // 4. Tactical AI, Player-to-Player Body Collision Physics & Referee Positioning Updates
    if (this.isMatchRunning) {
      this.aiUpdateAccumulator += delta;
      if (this.aiUpdateAccumulator >= 100) {
        this.updateTacticalAI(this.aiUpdateAccumulator);
        this.aiUpdateAccumulator = 0;
      }
      this.updateNPCMovement(delta);
      this.resolvePlayerBodyPhysics(delta);
    }
    this.updateReferees(delta);

    // 5. Ball Physics & Possession
    this.updateBall(delta);

    // 6. Goal Line & Boundary Checks (with Own Goal Detection)
    if (this.isMatchRunning) {
      this.checkBoundaries();
    }

    // 7. Camera Follow
    this.updateCamera();

    // 8. Render Positions, 3D Running Bounce & Depth Sort
    this.renderEntities(delta);

    // 9. Update Radar Minimap — throttled to ~5Hz
    this.radarUpdateAccumulator += delta;
    if (this.radarUpdateAccumulator >= 200) {
      this.renderRadar();
      this.radarUpdateAccumulator = 0;
    }
  }

  private updateShotCharging(delta: number) {
    // 1P Shot Charging
    if (this.isChargingShotP1 && this.controlledActorP1) {
      this.shotChargeP1 = Math.min(1.0, this.shotChargeP1 + (delta / 550));
      this.drawShotGauge(this.controlledActorP1.gaugeGfx, this.shotChargeP1);
      if (this.shotChargeP1 >= 1.0) {
        this.isChargingShotP1 = false;
        this.executeP1Shoot(1.0);
        this.shotChargeP1 = 0;
        this.controlledActorP1.gaugeGfx.setVisible(false);
      }
    } else if (this.controlledActorP1) {
      this.controlledActorP1.gaugeGfx.setVisible(false);
    }

    // 2P Shot Charging
    if (this.isChargingShotP2 && this.controlledActorP2) {
      this.shotChargeP2 = Math.min(1.0, this.shotChargeP2 + (delta / 550));
      this.drawShotGauge(this.controlledActorP2.gaugeGfx, this.shotChargeP2);
      if (this.shotChargeP2 >= 1.0) {
        this.isChargingShotP2 = false;
        this.executeP2Shoot(1.0);
        this.shotChargeP2 = 0;
        this.controlledActorP2.gaugeGfx.setVisible(false);
      }
    } else if (this.controlledActorP2) {
      this.controlledActorP2.gaugeGfx.setVisible(false);
    }
  }

  private drawShotGauge(gfx: Phaser.GameObjects.Graphics, ratio: number) {
    gfx.clear();
    gfx.setVisible(true);

    const w = 32;
    const h = 5;
    const x = -w / 2;
    const y = -48;

    gfx.fillStyle(0x1B1A18, 0.85);
    gfx.fillRect(x, y, w, h);

    let color = 0x4A7C59;
    if (ratio > 0.75) color = 0xD9534F;
    else if (ratio > 0.4) color = 0xF0AD4E;

    gfx.fillStyle(color, 1);
    gfx.fillRect(x + 1, y + 1, Math.max(2, (w - 2) * ratio), h - 2);
  }

  private updateControlledPlayerP1(delta: number) {
    const actor = this.controlledActorP1!;
    let vx = 0;
    let vy = 0;
    const speedStat = (actor.stats.speed || 75) / 100;
    const gradeBonus = 1.0 - (actor.grade - 1) * 0.025;
    let speed = 200 * (0.74 + speedStat * 0.34) * gradeBonus;
    if (actor.hasBall) {
      speed *= 0.94;
    }

    // Sprint Boost: Shift key
    const isSprinting = this.p1Keys.SHIFT.isDown;
    if (isSprinting) {
      if (actor.specialAbility === '치타 스프린트') {
        speed *= 1.50;
      } else {
        speed *= 1.34;
      }
    }

    // Directional Input: Standard 8-way screen/pitch directional movement (Sky / 3rd-Person)
    const dt = delta / 1000;
    const allowArrows = !this.isPvPMode;
    const leftDown = this.wasdKeys.A.isDown || (allowArrows && this.cursors.left.isDown);
    const rightDown = this.wasdKeys.D.isDown || (allowArrows && this.cursors.right.isDown);
    const upDown = this.wasdKeys.W.isDown || (allowArrows && this.cursors.up.isDown);
    const downDown = this.wasdKeys.S.isDown || (allowArrows && this.cursors.down.isDown);

    if (leftDown) vx -= 1;
    if (rightDown) vx += 1;
    if (upDown) vy -= 1;
    if (downDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      actor.vx = (vx / len) * speed;
      actor.vy = (vy / len) * speed;
      actor.facingAngle = Math.atan2(actor.vy, actor.vx);
    } else {
      actor.vx *= 0.8;
      actor.vy *= 0.8;
    }

    actor.wx += actor.vx * dt;
    actor.wy += actor.vy * dt;

    actor.wx = Phaser.Math.Clamp(actor.wx, 15, PITCH_WIDTH - 15);
    actor.wy = Phaser.Math.Clamp(actor.wy, 15, PITCH_HEIGHT - 15);

    if (actor.tackleCooldown > 0) {
      actor.tackleCooldown -= delta;
    }

    // Close body-check challenge when running directly into opponent ball carrier
    if (this.ballOwner && this.ballOwner.team === 'ai' && this.possessionShieldMs <= 0 && actor.tackleCooldown <= 0) {
      const distCarrier = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballOwner.wx, this.ballOwner.wy);
      if (distCarrier < 20) {
        actor.tackleCooldown = 450;
        this.takePossession(actor);
      }
    }
  }

  private updateControlledPlayerP2(delta: number) {
    const actor = this.controlledActorP2!;
    let vx = 0;
    let vy = 0;
    const speedStat = (actor.stats.speed || 75) / 100;
    const gradeBonus = 1.0 - (actor.grade - 1) * 0.025;
    let speed = 200 * (0.74 + speedStat * 0.34) * gradeBonus;
    if (actor.hasBall) {
      speed *= 0.94;
    }

    // 2P Sprint
    if (this.p2SprintKeyShift.isDown) {
      speed *= 1.34;
    }

    if (this.cursors.left.isDown) vx -= 1;
    if (this.cursors.right.isDown) vx += 1;
    if (this.cursors.up.isDown) vy -= 1;
    if (this.cursors.down.isDown) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.sqrt(vx * vx + vy * vy);
      actor.vx = (vx / len) * speed;
      actor.vy = (vy / len) * speed;
    } else {
      actor.vx *= 0.8;
      actor.vy *= 0.8;
    }

    actor.wx += actor.vx * (delta / 1000);
    actor.wy += actor.vy * (delta / 1000);

    actor.wx = Phaser.Math.Clamp(actor.wx, 15, PITCH_WIDTH - 15);
    actor.wy = Phaser.Math.Clamp(actor.wy, 15, PITCH_HEIGHT - 15);

    if (actor.tackleCooldown > 0) {
      actor.tackleCooldown -= delta;
    }
  }

  /**
   * Tactical Zonal AI Strategy Calculator — Runs at 10Hz to save CPU
   */
  private updateTacticalAI(delta: number) {
    const diffProfile = AI_PROFILES[this.initData.difficulty] || AI_PROFILES.normal;

    // 1. Identify closest non-human presser for each team
    let closestUserPresser: MatchActor | null = null;
    let minUserDist = Infinity;
    let closestAIPresser: MatchActor | null = null;
    let minAIDist = Infinity;

    for (const actor of this.actors) {
      if (actor.position === 'GK') continue;
      if (actor === this.controlledActorP1) continue;
      if (this.isPvPMode && actor === this.controlledActorP2) continue;
      const d = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
      if (actor.team === 'user' && d < minUserDist) {
        minUserDist = d;
        closestUserPresser = actor;
      } else if (actor.team === 'ai' && d < minAIDist) {
        minAIDist = d;
        closestAIPresser = actor;
      }
    }

    // 2. Set velocities for each non-human actor
    for (const actor of this.actors) {
      if (actor === this.controlledActorP1) continue;
      if (this.isPvPMode && actor === this.controlledActorP2) continue;

      if (actor.tackleCooldown > 0) actor.tackleCooldown -= delta;

      const isUserTeam = actor.team === 'user';
      const isGK = actor.position === 'GK';

      // ── Goalkeeper AI ──
      if (isGK) {
        // If AI/NPC GK is holding the ball, distribute it forward to a teammate!
        if (actor.hasBall) {
          const mates = this.actors.filter((m) => m.team === actor.team && m !== actor);
          const target = mates[Math.floor(Math.random() * mates.length)];
          this.releaseBall();
          if (target) {
            const ang = Phaser.Math.Angle.Between(actor.wx, actor.wy, target.wx, target.wy);
            this.ballVx = Math.cos(ang) * BALL_PASS_SPEED;
            this.ballVy = Math.sin(ang) * BALL_PASS_SPEED;
          } else {
            this.ballVx = (isUserTeam ? 1 : -1) * BALL_PASS_SPEED;
            this.ballVy = 0;
          }
          continue;
        }

        const goalCenterX = isUserTeam ? 30 : PITCH_WIDTH - 30;
        const targetY = Phaser.Math.Clamp(this.ballWy, GOAL_Y_MIN + 14, GOAL_Y_MAX - 14);
        const dy = targetY - actor.wy;
        actor.vx = (goalCenterX - actor.wx) * 3.5;
        actor.vy = dy * 4.0;

        // Special Ability: 카시야스 / 노이어 / 야신 / 빛현우 슈퍼세이브 (GK Super Save)
        const ballSpeed = Math.sqrt(this.ballVx * this.ballVx + this.ballVy * this.ballVy);
        const distToBall = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
        const isCasillas = actor.specialAbility === '성 카시야스 기적의 반사신경' || actor.name.includes('카시야스');
        const isEliteGK = isCasillas || actor.specialAbility === '스위퍼 키퍼 세이브' || actor.specialAbility === '거미손 레전드';

        if ((isEliteGK || actor.specialAbility === '빛현우 슈퍼세이브') && ballSpeed > 240 && distToBall < (isEliteGK ? 150 : 115) && !this.ballOwner) {
          const saveChance = isEliteGK ? 0.94 : 0.75;
          if (Math.random() < saveChance) {
            if (isEliteGK) {
              this.showSkillBanner(`[GK] ${actor.name} — ${actor.specialAbility || '성 카시야스 기적의 반사신경'}! 환상적인 다이빙 슈퍼세이브!`);
            } else {
              this.showSkillBanner(`[GK] ${actor.name} — 빛현우 슈퍼세이브! 기적의 다이빙 선방!`);
            }
            // Parry ball away from goal!
            this.ballVx = (isUserTeam ? 1 : -1) * (240 + Math.random() * 140);
            this.ballVy = (Math.random() - 0.5) * 280;
            this.ballVz = 120;
            this.lastTouchActor = actor;
            continue;
          }
        }

        // Standard GK Catch/Parry if close
        if (!this.ballOwner && this.ballWz < 50 && distToBall < 30 && (actor !== this.lastKickActor || this.lastKickCooldownMs <= 0)) {
          this.takePossession(actor);
        }
        continue;
      }

      // ── Ball Carrier AI (Opponent AI toned down speed) ──
      if (actor.hasBall) {
        if (!isUserTeam && this.isPvPMode) {
          this.setControlledActorP2(actor);
          continue;
        }

        const targetGoalX = isUserTeam ? PITCH_WIDTH : 0;
        const targetGoalY = PITCH_HALF_H;
        const dx = targetGoalX - actor.wx;
        const dy = targetGoalY - actor.wy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const carrierSpeed = isUserTeam ? 165 : 142 * diffProfile.speedMultiplier;
        actor.vx = (dx / dist) * carrierSpeed;
        actor.vy = (dy / dist) * carrierSpeed;

        // Occasional AI pass to open forward teammate
        if (!isUserTeam && Math.random() < 0.06 * diffProfile.passAccuracy) {
          const aiMates = this.actors.filter((m) => m.team === 'ai' && m !== actor && m.position !== 'GK' && m.wx < actor.wx - 40);
          if (aiMates.length > 0) {
            const mate = aiMates[Math.floor(Math.random() * aiMates.length)];
            this.releaseBall();
            const pAng = Phaser.Math.Angle.Between(actor.wx, actor.wy, mate.wx, mate.wy);
            this.ballVx = Math.cos(pAng) * (BALL_PASS_SPEED * 0.9);
            this.ballVy = Math.sin(pAng) * (BALL_PASS_SPEED * 0.9);
            continue;
          }
        }

        // Shooting decision near penalty box
        if ((!isUserTeam && actor.wx < 340) || (isUserTeam && actor.wx > PITCH_WIDTH - 340)) {
          if (Math.random() < 0.045 * diffProfile.shotAccuracy) {
            this.releaseBall();
            this.lastTouchActor = actor;
            const aimY = PITCH_HALF_H + (Math.random() - 0.5) * 80;
            const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, targetGoalX, aimY);
            this.ballVx = Math.cos(angle) * (BALL_SHOT_SPEED * 0.88);
            this.ballVy = Math.sin(angle) * (BALL_SHOT_SPEED * 0.88);
            this.ballVz = 100 + Math.random() * 130;
          }
        }
        continue;
      }

      // ── Outfield Support & Defending ──
      const opponentHasBall = Boolean(this.ballOwner && this.ballOwner.team !== actor.team);
      const isDesignatedPresser = (!isUserTeam && actor === closestAIPresser && (!this.ballOwner || opponentHasBall)) ||
                                  (isUserTeam && actor === closestUserPresser && !this.ballOwner);

      if (isDesignatedPresser) {
        const angle = Phaser.Math.Angle.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
        const pressSpeed = isUserTeam ? 165 : 148 * diffProfile.speedMultiplier;
        actor.vx = Math.cos(angle) * pressSpeed;
        actor.vy = Math.sin(angle) * pressSpeed;

        const distToBall = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
        if (!this.ballOwner && distToBall < 22 && this.ballWz < 30 && (actor !== this.lastKickActor || this.lastKickCooldownMs <= 0)) {
          this.takePossession(actor);
        } else if (opponentHasBall && !isUserTeam && distToBall < 18 && this.possessionShieldMs <= 0 && actor.tackleCooldown <= 0) {
          actor.tackleCooldown = 1400;
          if (Math.random() < 0.22 * diffProfile.speedMultiplier) {
            this.takePossession(actor);
          }
        }
      } else {
        const shiftX = (this.ballWx - PITCH_HALF_W) * 0.34;
        const shiftY = (this.ballWy - PITCH_HALF_H) * 0.24;

        let targetX = actor.baseWx + shiftX;
        let targetY = actor.baseWy + shiftY;

        // Attacking Support Run: Sprint into open space
        const ourTeamHasBall = this.ballOwner && this.ballOwner.team === actor.team;
        if (ourTeamHasBall && (actor.position === 'ST' || actor.position === 'LW' || actor.position === 'RW' || actor.position === 'CAM')) {
          targetX += (isUserTeam ? 140 : -140);
        }

        const dx = targetX - actor.wx;
        const dy = targetY - actor.wy;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);
        const maxFollowSpeed = isUserTeam ? 160 : 130 * diffProfile.speedMultiplier;

        if (distToTarget > 18) {
          actor.vx = (dx / distToTarget) * maxFollowSpeed;
          actor.vy = (dy / distToTarget) * maxFollowSpeed;
        } else {
          actor.vx *= 0.6;
          actor.vy *= 0.6;
        }

        // Anti-Clumping Boids Repulsion Force (Spacious spread on larger pitch)
        for (const other of this.actors) {
          if (other === actor || other.team !== actor.team) continue;
          const odx = actor.wx - other.wx;
          const ody = actor.wy - other.wy;
          const distSq = odx * odx + ody * ody;
          if (distSq < 5625 && distSq > 1) {
            const dist = Math.sqrt(distSq);
            const repulseFactor = (75 - dist) / 75;
            actor.vx += (odx / dist) * 95 * repulseFactor;
            actor.vy += (ody / dist) * 95 * repulseFactor;
          }
        }
      }
    }
  }

  /**
   * Smooth 60FPS Physics Integrator for All NPC Characters
   * Ensures players never freeze or stutter on screen!
   */
  private updateNPCMovement(delta: number) {
    const dt = delta / 1000;
    for (const actor of this.actors) {
      if (actor === this.controlledActorP1) continue;
      if (this.isPvPMode && actor === this.controlledActorP2) continue;

      actor.wx += actor.vx * dt;
      actor.wy += actor.vy * dt;
      actor.wx = Phaser.Math.Clamp(actor.wx, 15, PITCH_WIDTH - 15);
      actor.wy = Phaser.Math.Clamp(actor.wy, 15, PITCH_HEIGHT - 15);
      if (actor.position === 'GK') {
        actor.facingAngle = Phaser.Math.Angle.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
      } else if (Math.hypot(actor.vx, actor.vy) > 10) {
        actor.facingAngle = Math.atan2(actor.vy, actor.vx);
      }
    }
  }

  /**
   * Intelligent On-Pitch Referee (주심) & Touchline Assistant Referees (부심) Movement
   */
  private updateReferees(delta: number) {
    if (!this.mainReferee) return;
    const dt = delta / 1000;

    if (this.mainReferee.signalTimerMs > 0) {
      this.mainReferee.signalTimerMs = Math.max(0, this.mainReferee.signalTimerMs - delta);
      if (this.mainReferee.signalTimerMs === 0) {
        this.mainReferee.signalState = 'none';
      }
    }

    if (this.isMatchRunning) {
      // Main referee tracks play along a realistic diagonal corridor ~115px from the ball
      const offsetX = this.ballWx > PITCH_HALF_W ? -105 : 105;
      const offsetY = this.ballWy > PITCH_HALF_H ? -95 : 95;
      const targetWx = Phaser.Math.Clamp(this.ballWx + offsetX, 80, PITCH_WIDTH - 80);
      const targetWy = Phaser.Math.Clamp(this.ballWy + offsetY, 65, PITCH_HEIGHT - 65);

      const dx = targetWx - this.mainReferee.wx;
      const dy = targetWy - this.mainReferee.wy;
      const d = Math.hypot(dx, dy);

      if (d > 16) {
        const refSpeed = Math.min(185, d * 2.2);
        this.mainReferee.vx = (dx / d) * refSpeed;
        this.mainReferee.vy = (dy / d) * refSpeed;
      } else {
        this.mainReferee.vx *= 0.75;
        this.mainReferee.vy *= 0.75;
      }

      // Step out of the ball's direct path so referee never blocks play
      const dBall = Phaser.Math.Distance.Between(this.mainReferee.wx, this.mainReferee.wy, this.ballWx, this.ballWy);
      if (dBall < 48 && dBall > 0.1) {
        const pushAng = Phaser.Math.Angle.Between(this.ballWx, this.ballWy, this.mainReferee.wx, this.mainReferee.wy);
        this.mainReferee.vx += Math.cos(pushAng) * 140;
        this.mainReferee.vy += Math.sin(pushAng) * 140;
      }

      this.mainReferee.wx = Phaser.Math.Clamp(this.mainReferee.wx + this.mainReferee.vx * dt, 40, PITCH_WIDTH - 40);
      this.mainReferee.wy = Phaser.Math.Clamp(this.mainReferee.wy + this.mainReferee.vy * dt, 35, PITCH_HEIGHT - 35);
    } else {
      this.mainReferee.vx *= 0.7;
      this.mainReferee.vy *= 0.7;
    }

    // 2 Assistant Referees patrol top & bottom touchlines tracking the play
    for (let i = 0; i < this.linesmen.length; i++) {
      const lm = this.linesmen[i];
      if (lm.signalTimerMs > 0) {
        lm.signalTimerMs = Math.max(0, lm.signalTimerMs - delta);
        if (lm.signalTimerMs === 0) lm.flagUp = false;
      }
      if (this.isMatchRunning) {
        const targetX = i === 0
          ? Phaser.Math.Clamp(this.ballWx, 60, PITCH_HALF_W + 120)
          : Phaser.Math.Clamp(this.ballWx, PITCH_HALF_W - 120, PITCH_WIDTH - 60);
        const dx = targetX - lm.wx;
        lm.vx = Math.abs(dx) > 10 ? Phaser.Math.Clamp(dx * 2.5, -170, 170) : 0;
        lm.wx += lm.vx * dt;
      } else {
        lm.vx = 0;
      }
    }
  }

  /**
   * 60FPS Player-to-Player Physical Body Collisions & Shoulder-to-Shoulder Momentum Challenges
   * Resolves body overlap using each player's Physical & Strength stats (mass),
   * and triggers physical ball dislodging when a strong defender body-checks a carrier!
   */
  private resolvePlayerBodyPhysics(delta: number) {
    const dt = delta / 1000;
    const MIN_BODY_DIST = 16.5;
    const n = this.actors.length;

    for (let i = 0; i < n; i++) {
      const a = this.actors[i];
      const massA =
        50 +
        ((a.stats.physical || 70) * 0.38 + (a.stats.strength || 70) * 0.48) *
          (a.specialAbility === '황소 돌파' || a.specialAbility === '에어리얼 월' ? 1.38 : 1.0);

      for (let j = i + 1; j < n; j++) {
        const b = this.actors[j];
        const dx = b.wx - a.wx;
        const dy = b.wy - a.wy;
        const distSq = dx * dx + dy * dy;
        if (distSq >= MIN_BODY_DIST * MIN_BODY_DIST || distSq < 0.001) continue;

        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = MIN_BODY_DIST - dist;

        const massB =
          50 +
          ((b.stats.physical || 70) * 0.38 + (b.stats.strength || 70) * 0.48) *
            (b.specialAbility === '황소 돌파' || b.specialAbility === '에어리얼 월' ? 1.38 : 1.0);
        const totalMass = massA + massB;
        const ratioA = massB / totalMass;
        const ratioB = massA / totalMass;

        // Positional separation weighted by inverse physical mass
        a.wx = Phaser.Math.Clamp(a.wx - nx * overlap * ratioA * 0.85, 15, PITCH_WIDTH - 15);
        a.wy = Phaser.Math.Clamp(a.wy - ny * overlap * ratioA * 0.85, 15, PITCH_HEIGHT - 15);
        b.wx = Phaser.Math.Clamp(b.wx + nx * overlap * ratioB * 0.85, 15, PITCH_WIDTH - 15);
        b.wy = Phaser.Math.Clamp(b.wy + ny * overlap * ratioB * 0.85, 15, PITCH_HEIGHT - 15);

        // Relative velocity impulse along collision normal
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal < 0) {
          const restitution = a.team !== b.team ? 0.42 : 0.18;
          const jImpulse = -(1 + restitution) * velAlongNormal;
          a.vx -= nx * jImpulse * ratioA;
          a.vy -= ny * jImpulse * ratioA;
          b.vx += nx * jImpulse * ratioB;
          b.vy += ny * jImpulse * ratioB;
        }

        // Shoulder-to-shoulder physical challenge on the ball carrier!
        if (a.team !== b.team && this.possessionShieldMs <= 0 && (this.ballOwner === a || this.ballOwner === b)) {
          const carrier = this.ballOwner === a ? a : b;
          const challenger = carrier === a ? b : a;
          const carrierMass = carrier === a ? massA : massB;
          const challengerMass = challenger === a ? massA : massB;
          const carrierBalance =
            carrierMass + (carrier.stats.dribbling || 70) * 0.42 + (carrier.specialAbility === '볼 키핑' ? 28 : 0);
          const challengerForce =
            challengerMass + (challenger.stats.defense || 70) * 0.38 + Math.hypot(challenger.vx, challenger.vy) * 0.08;

          if (challenger.tackleCooldown <= 0 && challengerForce > carrierBalance * 1.12) {
            challenger.tackleCooldown = 900;
            this.takePossession(challenger);
          } else if (challenger.tackleCooldown <= 0 && challengerForce > carrierBalance * 0.96 && dt > 0) {
            // Heavy shoulder clash pops the ball slightly loose!
            challenger.tackleCooldown = 750;
            const popAng = Math.atan2(carrier.wy - challenger.wy, carrier.wx - challenger.wx);
            this.releaseBall();
            this.ballVx = Math.cos(popAng) * 145 + carrier.vx * 0.5;
            this.ballVy = Math.sin(popAng) * 145 + carrier.vy * 0.5;
            this.ballVz = 38;
          }
        }
      }
    }
  }

  private updateBall(delta: number) {
    if (this.lastKickCooldownMs > 0) {
      this.lastKickCooldownMs = Math.max(0, this.lastKickCooldownMs - delta);
    }
    if (this.possessionShieldMs > 0) {
      this.possessionShieldMs = Math.max(0, this.possessionShieldMs - delta);
    }
    if (this.postHitCooldownMs > 0) {
      this.postHitCooldownMs = Math.max(0, this.postHitCooldownMs - delta);
    }

    if (!this.isMatchRunning && !this.ballOwner) {
      this.ballVx = 0;
      this.ballVy = 0;
      this.ballVz = 0;
      this.ballSpin = 0;
      return;
    }

    const dt = delta / 1000;

    if (this.ballOwner) {
      const carrier = this.ballOwner;
      const carrierSpeed = Math.hypot(carrier.vx, carrier.vy);
      const isMoving = carrierSpeed > 14;
      const dribbleAng = isMoving ? carrier.facingAngle : (carrier.team === 'user' ? 0 : Math.PI);

      // Rhythmic stride foot-touch lead & micro turf bounce while dribbling
      const stridePulse = isMoving ? Math.max(0, Math.sin(carrier.animTimer * 13)) : 0;
      const leadDist = BALL_DRIBBLE_OFFSET + stridePulse * 6.5;

      const targetBx = carrier.wx + Math.cos(dribbleAng) * leadDist;
      const targetBy = carrier.wy + Math.sin(dribbleAng) * leadDist;
      const springFollow = Math.min(1, 22 * dt);

      this.ballWx = Phaser.Math.Linear(this.ballWx, targetBx, springFollow);
      this.ballWy = Phaser.Math.Linear(this.ballWy, targetBy, springFollow);
      this.ballWz = isMoving ? stridePulse * 2.6 : 0;
      this.ballVx = carrier.vx;
      this.ballVy = carrier.vy;
      this.ballVz = 0;
      this.ballSpin = 0;
      this.lastTouchActor = carrier;
      this.ballRollAngle += carrierSpeed * dt * 0.052;
    } else {
      // 1) Aerodynamic Magnus Effect Curve Force (Spin perpendicular to velocity)
      if (Math.abs(this.ballSpin) > 0.02) {
        const magAx = -this.ballVy * this.ballSpin * 0.72;
        const magAy = this.ballVx * this.ballSpin * 0.72;
        this.ballVx += magAx * dt;
        this.ballVy += magAy * dt;
        this.ballSpin *= Math.pow(0.42, dt);
      }

      // 2) Integrate position & apply height-dependent Air Drag vs. Turf Rolling Resistance
      this.ballWx += this.ballVx * dt;
      this.ballWy += this.ballVy * dt;
      const dragFactor = this.ballWz > 2.5 ? Math.pow(0.68, dt) : Math.pow(0.26, dt);
      this.ballVx *= dragFactor;
      this.ballVy *= dragFactor;
      const ballSpeed = Math.hypot(this.ballVx, this.ballVy);
      this.ballRollAngle += ballSpeed * dt * 0.048;

      // 3) 3D Vertical Physics (Gravity & Multi-Bounce Restitution on Pitch Grass)
      if (this.ballWz > 0 || this.ballVz > 0) {
        this.ballVz -= 680 * dt;
        this.ballWz += this.ballVz * dt;

        if (this.ballWz <= 0) {
          this.ballWz = 0;
          if (Math.abs(this.ballVz) > 36) {
            this.ballVz = -this.ballVz * 0.52; // Turf restitution
            this.ballVx *= 0.87;
            this.ballVy *= 0.87;
            this.ballSpin *= 0.72;
          } else {
            this.ballVz = 0;
          }
        }
      } else {
        this.ballWz = 0;
        this.ballVz = 0;
      }

      // 4) 60FPS Loose Ball Pickup & High-Velocity Shot Body Deflection / Blocking Physics!
      if (this.isMatchRunning && this.ballWz < 38) {
        // A) High-speed shot body deflection off opposing field defenders (realistic shot blocking!)
        if (ballSpeed > 430 && this.lastTouchActor) {
          for (const actor of this.actors) {
            if (actor === this.lastKickActor && this.lastKickCooldownMs > 0) continue;
            if (actor.team === this.lastTouchActor.team || actor.position === 'GK') continue;
            const d = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
            if (d <= 15.5 && this.ballWz < 34) {
              const nx = (this.ballWx - actor.wx) / (d || 1);
              const ny = (this.ballWy - actor.wy) / (d || 1);
              this.ballWx = actor.wx + nx * 17;
              this.ballWy = actor.wy + ny * 17;
              this.ballVx = nx * ballSpeed * 0.46 + actor.vx * 0.3;
              this.ballVy = ny * ballSpeed * 0.46 + actor.vy * 0.3;
              this.ballVz = Math.max(this.ballVz, 82);
              this.ballSpin = (nx - ny) * 1.4;
              this.lastKickActor = actor;
              this.lastKickCooldownMs = 220;
              this.lastTouchActor = actor;
              return;
            }
          }
        }

        // B) Priority check for human-controlled players so user never walks over a ball without picking it up
        const humanControllers = [this.controlledActorP1, this.isPvPMode ? this.controlledActorP2 : null].filter(Boolean) as MatchActor[];
        for (const hc of humanControllers) {
          if (hc === this.lastKickActor && this.lastKickCooldownMs > 0) continue;
          const d = Phaser.Math.Distance.Between(hc.wx, hc.wy, this.ballWx, this.ballWy);
          if (d <= 28) {
            this.takePossession(hc);
            return;
          }
        }

        // C) Check all other players on the pitch
        let closestPickup: MatchActor | null = null;
        let closestDist = Infinity;
        for (const actor of this.actors) {
          if (actor === this.lastKickActor && this.lastKickCooldownMs > 0) continue;
          const d = Phaser.Math.Distance.Between(actor.wx, actor.wy, this.ballWx, this.ballWy);
          const pickupRadius = actor.position === 'GK' ? 28 : (actor.team === 'user' ? 24 : 20);
          if (d <= pickupRadius && d < closestDist) {
            closestDist = d;
            closestPickup = actor;
          }
        }
        if (closestPickup) {
          this.takePossession(closestPickup);
          return;
        }
      }
    }
  }

  /**
   * 3D Goalpost & Crossbar Metallic Ricochet Physics + Accurate Goal & Own Goal (자책골) Detection
   */
  private checkBoundaries() {
    // ── 0. 3D Goalpost & Crossbar Elastic Ricochet Check (Left Goal x=0, Right Goal x=PITCH_WIDTH) ──
    if (!this.ballOwner && this.postHitCooldownMs <= 0) {
      const goalXs = [0, PITCH_WIDTH];
      const postYs = [GOAL_Y_MIN, GOAL_Y_MAX];

      for (const gx of goalXs) {
        if (Math.abs(this.ballWx - gx) <= 9.5) {
          // 1) Check Left & Right Vertical Goalposts (0 <= ballWz <= 55)
          for (const py of postYs) {
            const distPost = Math.hypot(this.ballWx - gx, this.ballWy - py);
            if (distPost <= 8.2 && this.ballWz <= 55) {
              const nx = (this.ballWx - gx) / (distPost || 1);
              const ny = (this.ballWy - py) / (distPost || 1);
              const dot = this.ballVx * nx + this.ballVy * ny;
              this.ballVx = (this.ballVx - 2 * dot * nx) * 0.78;
              this.ballVy = (this.ballVy - 2 * dot * ny) * 0.78;
              if (gx === 0 && this.ballVx < 60) this.ballVx = Math.abs(this.ballVx) + 95;
              if (gx === PITCH_WIDTH && this.ballVx > -60) this.ballVx = -Math.abs(this.ballVx) - 95;
              this.ballWx = gx === 0 ? 9.5 : PITCH_WIDTH - 9.5;
              this.ballVz = Math.max(this.ballVz, 65);
              this.postHitCooldownMs = 320;
              this.cameras.main.shake(110, 0.004);
              this.showSkillBanner('[POST] 골포스트 강타!! (GOALPOST!)');
              return;
            }
          }

          // 2) Check Horizontal Crossbar (GOAL_Y_MIN <= ballWy <= GOAL_Y_MAX, 48 <= ballWz <= 58)
          if (this.ballWy >= GOAL_Y_MIN && this.ballWy <= GOAL_Y_MAX && this.ballWz >= 48 && this.ballWz <= 58) {
            this.ballVx = -this.ballVx * 0.68;
            if (gx === 0 && this.ballVx < 70) this.ballVx = 120;
            if (gx === PITCH_WIDTH && this.ballVx > -70) this.ballVx = -120;
            this.ballWx = gx === 0 ? 9.5 : PITCH_WIDTH - 9.5;
            this.ballVz = Math.abs(this.ballVz) * 0.65 + 105;
            this.ballWz = 58.5;
            this.postHitCooldownMs = 320;
            this.cameras.main.shake(110, 0.004);
            this.showSkillBanner('[POST] 크로스바 강타!! (CROSSBAR!)');
            return;
          }
        }
      }
    }
    // ── Left Goal (User's goal) ──
    if (this.ballWx <= 0) {
      if (this.ballWy >= GOAL_Y_MIN && this.ballWy <= GOAL_Y_MAX) {
        if (this.ballWz < 55) {
          const isOwnGoal = Boolean(this.lastTouchActor && this.lastTouchActor.team === 'user');
          this.handleLeftGoal(isOwnGoal);
          return;
        } else {
          // Ball flew over crossbar
          this.handleOut('left');
          return;
        }
      } else {
        this.handleOut('left');
        return;
      }
    }

    // ── Right Goal (AI/2P's goal) ──
    if (this.ballWx >= PITCH_WIDTH) {
      if (this.ballWy >= GOAL_Y_MIN && this.ballWy <= GOAL_Y_MAX) {
        if (this.ballWz < 55) {
          const isOwnGoal = Boolean(this.lastTouchActor && this.lastTouchActor.team === 'ai');
          this.handleRightGoal(isOwnGoal);
          return;
        } else {
          // Ball flew over crossbar
          this.handleOut('right');
          return;
        }
      } else {
        this.handleOut('right');
        return;
      }
    }

    // Touchline
    if (this.ballWy < 0 || this.ballWy > PITCH_HEIGHT) {
      this.handleThrowIn();
    }
  }

  private handleLeftGoal(isOwnGoal: boolean) {
    this.isMatchRunning = false;
    this.releaseBall();
    // Rest ball safely inside the goal net — prevents flying out of arena!
    this.ballVx = 0; this.ballVy = 0; this.ballVz = 0; this.ballWz = 0;
    this.ballWx = -12; this.ballWy = Phaser.Math.Clamp(this.ballWy, GOAL_Y_MIN + 8, GOAL_Y_MAX - 8);
    this.aiScore++;

    let msg = '';
    const scorerName = this.lastTouchActor ? this.lastTouchActor.name : '상대팀';

    if (isOwnGoal) {
      msg = `[자책골] ${scorerName} 자책골 (Own Goal)!`;
    } else {
      msg = this.isPvPMode ? `2P 득점! (${scorerName})` : `상대 팀 득점 (${scorerName})!`;
    }

    this.emitEvent('score-update', {
      userScore: this.userScore,
      aiScore: this.aiScore,
    });

    this.matchEvents.push({
      type: 'goal',
      minute: Math.floor((this.elapsedRealSeconds / HALF_DURATION_SECONDS) * 45),
      team: 'ai',
      description: isOwnGoal ? `${scorerName} 자책골` : `${scorerName} 득점`,
    });

    // ── Left Goal (User's goal) ──
    if (this.aiScore >= 5) {
      const endMsg = this.isPvPMode ? '5점 선취! 2P 승리!' : '5점 선취! 상대팀 승리!';
      this.setRefereeSignal('whistle', 2400, true);
      this.showRefereeMessage(endMsg, 2400, () => {
        this.handleMatchEnd('5goal_limit');
      });
      return;
    }

    this.setRefereeSignal('point_right', 2200, true);
    this.showRefereeMessage(msg, 2200, () => {
      this.startKickoff('user');
    });
  }

  private handleRightGoal(isOwnGoal: boolean) {
    this.isMatchRunning = false;
    this.releaseBall();
    // Rest ball safely inside the goal net — prevents flying out of arena!
    this.ballVx = 0; this.ballVy = 0; this.ballVz = 0; this.ballWz = 0;
    this.ballWx = PITCH_WIDTH + 12; this.ballWy = Phaser.Math.Clamp(this.ballWy, GOAL_Y_MIN + 8, GOAL_Y_MAX - 8);
    this.userScore++;

    let msg = '';
    const scorerName = this.lastTouchActor ? this.lastTouchActor.name : '우리팀';

    if (isOwnGoal) {
      msg = `상대 팀 자책골 (${scorerName})!`;
    } else {
      msg = this.isPvPMode ? `1P 득점! (${scorerName})` : `골! ${scorerName} 득점!`;
    }

    this.emitEvent('score-update', {
      userScore: this.userScore,
      aiScore: this.aiScore,
    });

    this.matchEvents.push({
      type: 'goal',
      minute: Math.floor((this.elapsedRealSeconds / HALF_DURATION_SECONDS) * 45),
      team: 'user',
      description: isOwnGoal ? `상대 팀 자책골 (${scorerName})` : `${scorerName} 득점`,
    });

    // 5-Goal First-to-Win Rule (5점 선취 즉시 승리)
    if (this.userScore >= 5) {
      const endMsg = this.isPvPMode ? '5점 선취! 1P 승리!' : '5점 선취! 우리 팀 승리!';
      this.setRefereeSignal('whistle', 2400, true);
      this.showRefereeMessage(endMsg, 2400, () => {
        this.handleMatchEnd('5goal_limit');
      });
      return;
    }

    this.setRefereeSignal('point_left', 2400, true);
    this.showRefereeMessage(msg, 2400, () => {
      this.startKickoff('ai');
    });
  }

  private handleOut(side: 'left' | 'right') {
    this.isMatchRunning = false;
    const lastTeam = this.lastTouchActor?.team;
    this.releaseBall();
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballVz = 0;
    this.ballWz = 0;

    let awardedTeam: 'user' | 'ai';
    let label: string;

    if (side === 'left') {
      if (lastTeam === 'user') {
        awardedTeam = 'ai';
        label = '상대 팀 코너킥!';
        this.ballWx = 42;
        this.ballWy = this.ballWy < PITCH_HALF_H ? 42 : PITCH_HEIGHT - 42;
      } else {
        awardedTeam = 'user';
        label = '우리 팀 골킥!';
        this.ballWx = GOAL_AREA_WIDTH + 24;
        this.ballWy = PITCH_HALF_H;
      }
    } else {
      if (lastTeam === 'ai') {
        awardedTeam = 'user';
        label = '우리 팀 코너킥!';
        this.ballWx = PITCH_WIDTH - 42;
        this.ballWy = this.ballWy < PITCH_HALF_H ? 42 : PITCH_HEIGHT - 42;
      } else {
        awardedTeam = 'ai';
        label = '상대 팀 골킥!';
        this.ballWx = PITCH_WIDTH - GOAL_AREA_WIDTH - 24;
        this.ballWy = PITCH_HALF_H;
      }
    }

    let taker: MatchActor | null = null;
    let minD = Infinity;
    for (const a of this.actors) {
      a.vx = 0;
      a.vy = 0;
      const d = Phaser.Math.Distance.Between(a.wx, a.wy, this.ballWx, this.ballWy);
      if (a.team === awardedTeam && a.position !== 'GK' && d < minD) {
        minD = d;
        taker = a;
      } else if (a.team !== awardedTeam) {
        if (label.includes('골킥')) {
          if (awardedTeam === 'user' && a.wx < PENALTY_AREA_WIDTH + 60) {
            a.wx = PENALTY_AREA_WIDTH + 75;
          } else if (awardedTeam === 'ai' && a.wx > PITCH_WIDTH - PENALTY_AREA_WIDTH - 60) {
            a.wx = PITCH_WIDTH - PENALTY_AREA_WIDTH - 75;
          }
        } else if (d < 130) {
          const ang = Phaser.Math.Angle.Between(this.ballWx, this.ballWy, a.wx, a.wy);
          a.wx = Phaser.Math.Clamp(this.ballWx + Math.cos(ang) * 140, 25, PITCH_WIDTH - 25);
          a.wy = Phaser.Math.Clamp(this.ballWy + Math.sin(ang) * 140, 25, PITCH_HEIGHT - 25);
        }
      }
    }

    if (taker) {
      taker.wx = this.ballWx + (awardedTeam === 'user' ? -8 : 8);
      taker.wy = this.ballWy;
      this.takePossession(taker);
    }

    this.setRefereeSignal(awardedTeam === 'user' ? 'point_right' : 'point_left', 1300, true);
    this.showRefereeMessage(`${label}`, 1100, () => {
      if (taker && !this.ballOwner) {
        this.takePossession(taker);
      }
      this.possessionShieldMs = 650;
      this.isMatchRunning = true;
    });
  }

  private handleThrowIn() {
    this.isMatchRunning = false;
    const lastTeam = this.lastTouchActor?.team;
    const throwTeam: 'user' | 'ai' = lastTeam === 'user' ? 'ai' : 'user';
    this.releaseBall();
    this.ballVx = 0;
    this.ballVy = 0;
    this.ballVz = 0;
    this.ballWz = 0;
    this.ballWx = Phaser.Math.Clamp(this.ballWx, 45, PITCH_WIDTH - 45);
    this.ballWy = this.ballWy <= 0 ? 30 : PITCH_HEIGHT - 30;

    let thrower: MatchActor | null = null;
    let minD = Infinity;
    for (const a of this.actors) {
      a.vx = 0;
      a.vy = 0;
      const d = Phaser.Math.Distance.Between(a.wx, a.wy, this.ballWx, this.ballWy);
      if (a.team === throwTeam && a.position !== 'GK' && d < minD) {
        minD = d;
        thrower = a;
      } else if (a.team !== throwTeam && d < 120) {
        const ang = Phaser.Math.Angle.Between(this.ballWx, this.ballWy, a.wx, a.wy);
        a.wx = Phaser.Math.Clamp(this.ballWx + Math.cos(ang) * 130, 25, PITCH_WIDTH - 25);
        a.wy = Phaser.Math.Clamp(this.ballWy + Math.sin(ang) * 130, 40, PITCH_HEIGHT - 40);
      }
    }

    if (thrower) {
      thrower.wx = this.ballWx;
      thrower.wy = this.ballWy;
      this.takePossession(thrower);
    }

    this.setRefereeSignal(throwTeam === 'user' ? 'point_right' : 'point_left', 1200, true);
    const msg = throwTeam === 'user' ? '우리 팀 스로인!' : '상대 팀 스로인!';
    this.showRefereeMessage(msg, 1000, () => {
      if (thrower && !this.ballOwner) {
        this.takePossession(thrower);
      }
      this.possessionShieldMs = 650;
      this.isMatchRunning = true;
    });
  }

  private handleHalftime() {
    this.isMatchRunning = false;
    this.currentHalf = 2;
    this.elapsedRealSeconds = 0;
    this.setRefereeSignal('whistle', 2500, false);
    this.showRefereeMessage('전반전 종료 — 하프타임', 2500, () => {
      this.startKickoff('ai');
    });
  }

  public handleMatchEnd(reason: 'normal' | 'surrender' | '5goal_limit') {
    this.isMatchRunning = false;
    let result: MatchResult = 'draw';
    if (reason === 'surrender') {
      result = 'surrender';
    } else if (this.userScore > this.aiScore) {
      result = 'win';
    } else if (this.userScore < this.aiScore) {
      result = 'loss';
    }

    this.emitEvent('match-end', {
      userScore: this.userScore,
      aiScore: this.aiScore,
      result,
      events: this.matchEvents,
      isPvP: this.isPvPMode,
    });
  }

  public toggleCameraViewMode() {
    // Toggles strictly between 0 (하늘 고정 뷰) and 1 (3인칭 추적 뷰) — 1st-person removed!
    this.cameraViewMode = (this.cameraViewMode === 0 ? 1 : 0) as 0 | 1;
    const vs = this.getViewScale();

    if (this.cameraViewMode === 0) {
      this.cameras.main.setZoom(0.52 * vs);
      this.showRefereeMessage('[시점] 하늘 고정 뷰 (Sky View)', 1300);
    } else {
      this.cameras.main.setZoom(0.98 * vs);
      this.showRefereeMessage('[시점] 3인칭 추적 뷰 (3rd-Person)', 1300);
    }
    this.renderRadar();
  }

  private updateCamera() {
    const vs = this.getViewScale();
    if (this.cameraViewMode === 0) {
      this.cameras.main.setZoom(0.52 * vs);
      const targetX = -this.scale.width / 2;
      const targetY = -this.scale.height / 2;
      this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetX, 0.14);
      this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetY, 0.14);
    } else {
      this.cameras.main.setZoom(0.98 * vs);
      const focus = this.controlledActorP1 || { wx: this.ballWx, wy: this.ballWy };
      const iso = worldToIso(focus.wx, focus.wy);
      const targetX = iso.x - this.scale.width / 2;
      const targetY = iso.y - this.scale.height / 2;
      this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, targetX, CAMERA_LERP);
      this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, targetY, CAMERA_LERP);
    }
  }

  private updateCameraInstant() {
    const vs = this.getViewScale();
    if (this.cameraViewMode === 0) {
      this.cameras.main.setZoom(0.52 * vs);
      this.cameras.main.scrollX = -this.scale.width / 2;
      this.cameras.main.scrollY = -this.scale.height / 2;
    } else {
      this.cameras.main.setZoom(0.98 * vs);
      const focus = this.controlledActorP1 || { wx: this.ballWx, wy: this.ballWy };
      const iso = worldToIso(focus.wx, focus.wy);
      this.cameras.main.scrollX = iso.x - this.scale.width / 2;
      this.cameras.main.scrollY = iso.y - this.scale.height / 2;
    }
  }

  /**
   * Renders Detailed Isometric Players (faces + jersey numbers) & Referees (Modes 0 & 1)
   */
  private renderEntities(delta: number) {
    const dt = delta / 1000;

    // Advance animation timers for all players & referees
    for (const actor of this.actors) {
      if (Math.hypot(actor.vx, actor.vy) > 12) {
        actor.animTimer += dt;
      }
    }
    if (this.mainReferee && Math.hypot(this.mainReferee.vx, this.mainReferee.vy) > 10) {
      this.mainReferee.animTimer += dt;
    }
    for (const lm of this.linesmen) {
      if (Math.abs(lm.vx) > 8) lm.animTimer += dt;
    }

    // ── Modes 0 & 1: Crisp Detailed Isometric Rendering ──
    for (const actor of this.actors) {
      const speed = Math.hypot(actor.vx, actor.vy);
      const isMoving = speed > 12;

      // Goalkeepers always face the pitch/play; field players show front face unless sprinting away toward back-top
      const isoViewDot = Math.cos(actor.facingAngle) + Math.sin(actor.facingAngle);
      const isGK = actor.position === 'GK';
      const showFrontFace = isGK ? true : (isoViewDot >= -0.62 || !isMoving);
      const bounceY = isMoving ? -Math.abs(Math.sin(actor.animTimer * 13)) * 2.4 : 0;

      const stateKey = `${Math.round(actor.animTimer * 10)}_${isMoving ? 1 : 0}_${showFrontFace ? 1 : 0}`;
      if ((actor as any)._lastDrawKey !== stateKey) {
        const primaryColor = actor.team === 'user' ? 0x245484 : 0xBA2D2D;
        const accentTrim = actor.team === 'user' ? 0xD4AF37 : 0xEFEFEF;
        const shortsColor = actor.team === 'user' ? 0xF2EFE9 : 0x1E1E22;

        drawDetailedIsoPlayer(actor.bodyGfx, {
          primaryColor,
          accentTrim,
          shortsColor,
          profile: actor.profile,
          animPhase: actor.animTimer,
          isMoving,
          showFrontFace,
        });
        (actor as any)._lastDrawKey = stateKey;
      }

      // Position jersey number prominently on back when turned away, or neat chest number when facing front
      if (showFrontFace) {
        actor.jerseyNumText.setPosition(-2.6, -16.8 + bounceY);
        actor.jerseyNumText.setScale(0.76);
        actor.jerseyNumText.setAlpha(0.92);
      } else {
        actor.jerseyNumText.setPosition(0, -17.6 + bounceY);
        actor.jerseyNumText.setScale(1.05);
        actor.jerseyNumText.setAlpha(1.0);
      }

      // Horizontal screen facing (isoX = cx - cy); Goalkeepers always orient toward pitch center
      const isoDirX = Math.cos(actor.facingAngle) - Math.sin(actor.facingAngle);
      const dir = isGK
        ? (actor.wx < PITCH_HALF_W ? 1 : -1)
        : (isoDirX >= -0.05 ? 1 : -1);
      actor.container.setScale(dir * 1.16, 1.16);
      actor.nameText.setScale(dir, 1);
      actor.tagText.setScale(dir, 1);
      actor.jerseyNumText.setScale(dir * Math.abs(actor.jerseyNumText.scaleX), Math.abs(actor.jerseyNumText.scaleY));

      const iso = worldToIso(actor.wx, actor.wy);
      actor.container.setPosition(iso.x, iso.y);
      actor.container.setDepth(depthFromWorld(actor.wx, actor.wy));
    }

    // Render Main Referee & 2 Touchline Assistant Referees (cached per animation/signal frame!)
    const allRefs = this.mainReferee ? [this.mainReferee, ...this.linesmen] : this.linesmen;
    for (const ref of allRefs) {
      const refMoving = Math.hypot(ref.vx, ref.vy) > 10;
      const refKey = `${Math.round(ref.animTimer * 10)}_${refMoving ? 1 : 0}_${ref.signalState}_${ref.flagUp ? 1 : 0}`;
      if ((ref as any)._lastRefKey !== refKey) {
        drawDetailedReferee(ref.bodyGfx, ref.animTimer, refMoving, ref.signalState, ref.isLinesman, ref.flagUp);
        (ref as any)._lastRefKey = refKey;
      }
      const refIso = worldToIso(ref.wx, ref.wy);
      ref.container.setPosition(refIso.x, refIso.y);
      ref.container.setDepth(depthFromWorld(ref.wx, ref.wy));
    }

    // 3D Ball Position with elevation & dynamic ground shadow
    const ballIso = worldToIso(this.ballWx, this.ballWy);
    const screenBallY = ballIso.y - this.ballWz * 0.9;
    this.ballGfx.setPosition(ballIso.x, screenBallY);
    this.ballGfx.setRotation(this.ballRollAngle);
    this.ballGfx.setDepth(depthFromWorld(this.ballWx, this.ballWy) + 15);

    this.ballShadow.setPosition(ballIso.x, ballIso.y + 7);
    this.ballShadow.setDepth(depthFromWorld(this.ballWx, this.ballWy) - 1);

    const heightRatio = Math.min(1.0, this.ballWz / 180);
    const shadowScale = Math.max(0.35, 1.0 - heightRatio * 0.65);
    const shadowAlpha = Math.max(0.12, 0.42 * (1.0 - heightRatio * 0.7));
    this.ballShadow.setScale(shadowScale, shadowScale * 0.65);
    this.ballShadow.setAlpha(shadowAlpha);
  }

  /**
   * Crisp HiDPI Radar Minimap Overlay (shows Players, Referee, Ball & 1st-Person FOV Cone!)
   */
  private renderRadar() {
    this.radarGfx.clear();

    const s = this.getViewScale();
    const rw = 162 * s;
    const rh = 102 * s;
    const rx = this.scale.width - rw - 20 * s;
    const ry = 56 * s;

    // Pitch backdrop (fast beveled rect, zero Earcut)
    this.radarGfx.fillStyle(0xB89B68, 0.88);
    fillFastBevelRect(this.radarGfx, rx - 1.6 * s, ry - 1.6 * s, rw + 3.2 * s, rh + 3.2 * s, 6 * s);
    this.radarGfx.fillStyle(0x16181C, 0.88);
    fillFastBevelRect(this.radarGfx, rx, ry, rw, rh, 5 * s);

    // Halfway line & Center circle
    this.radarGfx.lineStyle(1 * s, 0xffffff, 0.35);
    this.radarGfx.lineBetween(rx + rw / 2, ry, rx + rw / 2, ry + rh);
    this.radarGfx.strokeCircle(rx + rw / 2, ry + rh / 2, 14 * s);

    // Goal boxes
    this.radarGfx.strokeRect(rx, ry + rh * 0.28, 22 * s, rh * 0.44);
    this.radarGfx.strokeRect(rx + rw - 22 * s, ry + rh * 0.28, 22 * s, rh * 0.44);

    // Main Referee dot (Neon Yellow)
    if (this.mainReferee) {
      const refX = rx + (this.mainReferee.wx / PITCH_WIDTH) * rw;
      const refY = ry + (this.mainReferee.wy / PITCH_HEIGHT) * rh;
      this.radarGfx.fillStyle(0xE6F542, 0.95);
      fillFastCircle(this.radarGfx, refX, refY, 2.3 * s, 8);
    }

    // Players dots
    for (const actor of this.actors) {
      const px = rx + (actor.wx / PITCH_WIDTH) * rw;
      const py = ry + (actor.wy / PITCH_HEIGHT) * rh;

      if (actor.isControlled) {
        this.radarGfx.fillStyle(0xD4AF37, 0.95);
        fillFastCircle(this.radarGfx, px, py, 5.0 * s, 8);
      }

      this.radarGfx.fillStyle(actor.team === 'user' ? 0x4A90E2 : 0xE74C3C, 1);
      fillFastCircle(this.radarGfx, px, py, 2.8 * s, 8);
    }

    // Ball dot
    const bx = rx + (this.ballWx / PITCH_WIDTH) * rw;
    const by = ry + (this.ballWy / PITCH_HEIGHT) * rh;
    this.radarGfx.fillStyle(0xffffff, 1);
    fillFastCircle(this.radarGfx, bx, by, 3.2 * s, 8);
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
  }

  private emitEvent(eventName: string, data: any) {
    window.dispatchEvent(new CustomEvent(`game:${eventName}`, { detail: data }));
  }
}
