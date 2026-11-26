/* ================================================================
   GAME CONFIGURATION — Soccer Manager Game
   All tunable constants: pitch dimensions, match timing, economy, AI
   ================================================================ */

// ── Pitch Dimensions (world coordinates, spacious full-size arena) ──
export const PITCH_WIDTH = 1600;
export const PITCH_HEIGHT = 1000;
export const PITCH_HALF_W = PITCH_WIDTH / 2;   // 800
export const PITCH_HALF_H = PITCH_HEIGHT / 2;  // 500

// ── Goal Dimensions ──
export const GOAL_WIDTH = 124;         // width of the goal opening (along Y axis)
export const GOAL_DEPTH = 42;          // how far back the goal extends (along X axis)
export const GOAL_POST_THICKNESS = 6;  // visual thickness of posts

// Goal Y-range: centered on the pitch
export const GOAL_Y_MIN = PITCH_HALF_H - GOAL_WIDTH / 2;  // 438
export const GOAL_Y_MAX = PITCH_HALF_H + GOAL_WIDTH / 2;  // 562

// Goal X positions (left and right ends)
export const GOAL_LEFT_X = 0;
export const GOAL_RIGHT_X = PITCH_WIDTH;

// ── Penalty Area (18-yard box) ──
export const PENALTY_AREA_WIDTH = 240;    // depth into the field
export const PENALTY_AREA_HEIGHT = 560;   // width across the field
export const PENALTY_AREA_Y_MIN = PITCH_HALF_H - PENALTY_AREA_HEIGHT / 2;
export const PENALTY_AREA_Y_MAX = PITCH_HALF_H + PENALTY_AREA_HEIGHT / 2;

// ── Goal Area (6-yard box) ──
export const GOAL_AREA_WIDTH = 84;
export const GOAL_AREA_HEIGHT = 260;
export const GOAL_AREA_Y_MIN = PITCH_HALF_H - GOAL_AREA_HEIGHT / 2;
export const GOAL_AREA_Y_MAX = PITCH_HALF_H + GOAL_AREA_HEIGHT / 2;

// ── Center Circle ──
export const CENTER_CIRCLE_RADIUS = 130;

// ── Corner Arc ──
export const CORNER_ARC_RADIUS = 22;

// ── Penalty Spot ──
export const PENALTY_SPOT_DISTANCE = 165; // from goal line

// ── Player Dimensions ──
export const PLAYER_RADIUS = 14;
export const PLAYER_SPEED_BASE = 210;    // pixels per second (world coords)
export const PLAYER_SPRINT_MULTIPLIER = 1.38;
export const PLAYER_PRECISION_MULTIPLIER = 0.5;

// ── Ball ──
export const BALL_RADIUS = 8;
export const BALL_FRICTION = 0.986;       // multiplied each frame (60fps)
export const BALL_PASS_SPEED = 480;
export const BALL_SHOT_SPEED = 660;
export const BALL_DRIBBLE_OFFSET = 20;    // distance in front of dribbling player

// ── Match Timing ──
export const MATCH_DURATION_SECONDS = 180;    // 3 minutes real time
export const HALF_DURATION_SECONDS = 90;      // 1.5 minutes per half
export const GAME_MINUTES_PER_HALF = 45;      // 45 game minutes per half
/** 1 real second = 30 game seconds */
export const TIME_SCALE = GAME_MINUTES_PER_HALF * 60 / HALF_DURATION_SECONDS;

// ── Economy ──
export const STARTING_COINS = 1000;
export const WIN_REWARD = 200;
export const DRAW_REWARD = 50;
export const LOSS_REWARD = 0;

// ── Training ──
export const TRAINING_STAT_MAX = 85;
export const TRAINING_FULL_SUCCESS_BONUS = 2;
export const TRAINING_PARTIAL_BONUS = 1;
export const TRAINING_FAIL_BONUS = 0;
export const TRAINING_CONE_COUNT = 8;
export const TRAINING_TIME_LIMIT = 30;      // seconds
export const TRAINING_COLLECT_RADIUS = 30;  // outer cone rounding proximity

// ── AI Difficulty Profiles ──
export interface AIDifficultyProfile {
  speedMultiplier: number;
  shotAccuracy: number;       // 0-1
  passAccuracy: number;       // 0-1
  reactionDelayMs: number;    // ms before AI reacts to events
  pressureRadius: number;     // how aggressively AI chases ball
  goalkeeperDiveSpeed: number;
}

export const AI_PROFILES: Record<string, AIDifficultyProfile> = {
  easy: {
    speedMultiplier: 0.58,
    shotAccuracy: 0.28,
    passAccuracy: 0.50,
    reactionDelayMs: 650,
    pressureRadius: 170,
    goalkeeperDiveSpeed: 150,
  },
  normal: {
    speedMultiplier: 0.72,
    shotAccuracy: 0.45,
    passAccuracy: 0.68,
    reactionDelayMs: 380,
    pressureRadius: 220,
    goalkeeperDiveSpeed: 210,
  },
  hard: {
    speedMultiplier: 0.86,
    shotAccuracy: 0.65,
    passAccuracy: 0.82,
    reactionDelayMs: 180,
    pressureRadius: 280,
    goalkeeperDiveSpeed: 280,
  },
};

// ── Colors ──
export const COLORS = {
  pitchGreen: 0x3a7d44,
  pitchGreenLight: 0x44904f,
  pitchGreenDark: 0x2e6535,
  pitchSurround: 0x5a4e3a,
  lineWhite: 0xffffff,
  userTeam: 0x2c5f8a,
  aiTeam: 0x8a2c2c,
  accentGold: 0xb89b68,
  ballWhite: 0xffffff,
  shadow: 0x000000,
  crowdGray: 0x6b6055,
  ledBoard: 0x333333,
  coneOrange: 0xff8c00,
  coneCollected: 0x44aa44,
};

// ── Surrender ──
export const SURRENDER_GOAL_DIFF = 5;
export const SURRENDER_COOLDOWN_MS = 30000; // 30 seconds between prompts

// ── Isometric Conversion Constants ──
export const ISO_COS30 = 0.866;  // cos(30°)
export const ISO_SIN30 = 0.5;    // sin(30°)

// ── Camera ──
export const CAMERA_LERP = 0.08;
export const CAMERA_ZOOM = 0.9;

// ── Tackle ──
export const TACKLE_RANGE = 35;
export const TACKLE_LUNGE_SPEED = 400;
export const TACKLE_FOUL_CHANCE = 0.3;
export const TACKLE_COOLDOWN_MS = 1000;

// ── Kickoff / Set-piece delays ──
export const KICKOFF_DELAY_MS = 2000;
export const GOAL_CELEBRATION_MS = 2000;
export const HALFTIME_DELAY_MS = 3000;
