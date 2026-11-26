/* ================================================================
   SHARED TYPE DEFINITIONS — Soccer Manager Game
   All domain types, interfaces, value objects in one place
   ================================================================ */

// ── Position & Formation ──
export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'LW' | 'RW' | 'ST';
export type FormationType = '4-4-2' | '4-3-3' | '3-5-2' | '4-2-3-1' | '5-3-2' | '3-4-3';
export type Grade = 1 | 2 | 3 | 4 | 5;
export type AIDifficulty = 'easy' | 'normal' | 'hard';
export type MatchResult = 'win' | 'loss' | 'draw' | 'surrender';
export type TrainingType = 'strength' | 'stamina';
export type GameScreen = 'home' | 'squad' | 'shop' | 'formation' | 'training' | 'matchResult' | 'acquisition';

// ── Player Stats ──
export interface PlayerStats {
  speed: number;       // 1-99
  shooting: number;    // 1-99
  passing: number;     // 1-99
  dribbling: number;   // 1-99
  defense: number;     // 1-99
  physical: number;    // 1-99
  strength: number;    // 1-99 (trainable)
  stamina: number;     // 1-99 (trainable)
  goalkeeping: number; // 1-99 (GK only)
}

// ── Player Entity ──
export interface Player {
  id: string;
  name: string;
  grade: Grade;
  position: Position;
  isHidden: boolean;
  shopPrice: number | null;   // null = 비매품
  stats: PlayerStats;
  specialAbility: string | null;
  specialAbilityDesc: string | null;
  overall: number;            // computed average
}

// ── Lineup Slot ──
export interface LineupSlot {
  playerId: string;
  position: Position;
  x: number;  // 0-100 normalized pitch x
  y: number;  // 0-100 normalized pitch y
}

// ── User Team ──
export interface UserTeam {
  id: string;
  name: string;
  coins: number;
  acquisitionPoints: number;
  roster: string[];           // player IDs
  formation: FormationType;
  lineup: LineupSlot[];
  wins: number;
  losses: number;
  draws: number;
}

// ── Match Record ──
export interface MatchEvent {
  type: 'goal' | 'foul' | 'save' | 'corner' | 'throwin';
  minute: number;
  playerId?: string;
  team: 'user' | 'ai';
  description: string;
}

export interface MatchRecord {
  id: string;
  date: string;
  userScore: number;
  aiScore: number;
  result: MatchResult;
  aiDifficulty: AIDifficulty;
  duration: number;
  events: MatchEvent[];
}

// ── Training Session ──
export interface TrainingSession {
  id: string;
  playerId: string;
  type: TrainingType;
  statBefore: number;
  statAfter: number;
  completedAt: string | null;
}

// ── Shop Catalog Entry ──
export interface ShopEntry {
  playerId: string;
  isAvailable: boolean;
  isSold: boolean;
  discountRate: number;
}

// ── Grade Rule ──
export interface GradeRule {
  grade: Grade;
  shopPriceRange: [number, number];
  acquisitionCoinCost: number;  // 1-2등급: 1000, 3-5등급: 0
  color: string;
  label: string;
  stars: number;
}

// ── Formation Template ──
export interface FormationTemplate {
  name: FormationType;
  positions: { position: Position; x: number; y: number }[];
}

// ── Game State ──
export interface GameState {
  team: UserTeam;
  allPlayers: Player[];
  shopCatalog: ShopEntry[];
  matchHistory: MatchRecord[];
  trainingHistory: TrainingSession[];
  currentScreen: GameScreen;
  isInitialized: boolean;
}

// ── Repository Interface (Port) ──
export interface IRepository<T> {
  getAll(): T[];
  getById(id: string): T | null;
  save(item: T): void;
  saveAll(items: T[]): void;
  delete(id: string): void;
  clear(): void;
}

// ── In-Game Player (runtime, not persisted) ──
export interface MatchPlayer {
  id: string;
  playerId: string;           // reference to Player entity
  team: 'user' | 'ai';
  position: Position;
  x: number;                  // world position
  y: number;
  vx: number;                 // velocity
  vy: number;
  hasBall: boolean;
  isControlled: boolean;      // currently controlled by user
  currentStamina: number;     // drains during match
  stats: PlayerStats;
  name: string;
  grade: Grade;
  sprite?: any;               // Phaser sprite reference
  shadow?: any;
  nameText?: any;
  highlightRing?: any;
}

// ── Ball (runtime) ──
export interface MatchBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: string | null;       // MatchPlayer id
  sprite?: any;
  shadow?: any;
}
