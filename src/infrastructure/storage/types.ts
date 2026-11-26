/* ================================================================
   LOCAL DATABASE & CACHING TYPES / CONSTANTS
   Namespace-scoped to prevent origin collisions on GitHub Pages
   (https://<user>.github.io/<repo>/)
   ================================================================ */

import type {
  UserTeam,
  Player,
  ShopEntry,
  MatchRecord,
  TrainingSession,
  StadiumTimeOfDay,
} from '../../shared/types/index';

export const APP_NAMESPACE = 'fc_superstar';
export const DB_SCHEMA_VERSION = 1;

/** IndexedDB database name (origin-safe namespace) */
export const IDB_DATABASE_NAME = `${APP_NAMESPACE}_local_db`;
export const IDB_DATABASE_VERSION = 1;

/** localStorage keys */
export const STORAGE_KEYS = {
  /** Fast-boot L3 snapshot key */
  SNAPSHOT: `${APP_NAMESPACE}_snapshot_v1`,
  /** Legacy key from earlier version for zero-loss auto-migration */
  LEGACY_SAVE: 'soccer_manager_save',
  /** Quarantine key when corrupted data is detected */
  CORRUPTED_BACKUP: `${APP_NAMESPACE}_corrupted_backup`,
} as const;

/** Retention limits to enforce Storage Quota Governance */
export const RETENTION_POLICY = {
  /** Max match records kept in L3 localStorage fast-boot snapshot */
  SNAPSHOT_MAX_MATCHES: 30,
  /** Max training logs kept in L3 localStorage fast-boot snapshot */
  SNAPSHOT_MAX_TRAININGS: 30,
  /** Max match records retained in L2 IndexedDB */
  IDB_MAX_MATCHES: 500,
  /** Max training logs retained in L2 IndexedDB */
  IDB_MAX_TRAININGS: 500,
  /** Debounce interval (ms) for batching L2 IndexedDB writes */
  IDB_WRITE_DEBOUNCE_MS: 250,
} as const;

export interface PersistedGameData {
  team: UserTeam;
  allPlayers: Player[];
  shopCatalog: ShopEntry[];
  matchHistory: MatchRecord[];
  trainingHistory: TrainingSession[];
  stadiumTime?: StadiumTimeOfDay;
}

export interface StorageEnvelope {
  namespace: typeof APP_NAMESPACE;
  schemaVersion: number;
  updatedAt: number; // Unix epoch ms
  checksum: string;  // FNV-1a hex checksum of serialized payload
  payload: PersistedGameData;
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number; // 0-100
}

export interface StorageHealthStatus {
  appName: string;
  appVersion: string;
  schemaVersion: number;
  indexedDbSupported: boolean;
  indexedDbReady: boolean;
  localStorageAvailable: boolean;
  lastSavedAt: number | null;
  snapshotBytes: number;
  matchCount: number;
  trainingCount: number;
  playerCount: number;
  cacheStats: CacheStats;
  quotaUsageBytes: number | null;
  quotaLimitBytes: number | null;
}

export interface BackupExportFile {
  format: 'fc-superstar-local-db-backup';
  appName?: string;
  appVersion?: string;
  exportedAt: string;
  envelope: StorageEnvelope;
}
