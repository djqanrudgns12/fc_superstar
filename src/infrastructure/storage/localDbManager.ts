/* ================================================================
   LOCAL DATABASE MANAGER (3-Tier Local Persistence & Cache Orchestrator)

   Architecture:
     L1 — MemoryCache (Hot in-memory O(1) read cache, invalidated on mutation)
     L2 — IndexedDB   (Primary structured local DB, up to 500 history records)
     L3 — localStorage (Fast-boot synchronous snapshot & fallback, bounded 30 history records)

   Principles enforced:
     1. Local-First & Zero-Server Sovereignty
     2. Write-Through L1/L3 + Debounced Batch L2 + Lifecycle Flush
     3. Schema Versioning & Legacy Auto-Migration
     4. Canonical Integrity Checksum & Corruption Quarantine/Self-Healing
     5. Quota & Retention Governance
     6. JSON Backup Portability (Export / Import)
     7. GitHub Pages Origin Namespace Isolation
   ================================================================ */

import { APP_META } from '../../shared/config/appMeta';
import {
  APP_NAMESPACE,
  DB_SCHEMA_VERSION,
  RETENTION_POLICY,
  STORAGE_KEYS,
  type BackupExportFile,
  type PersistedGameData,
  type StorageEnvelope,
  type StorageHealthStatus,
} from './types';
import { MemoryCache } from './memoryCache';
import { IndexedDbAdapter } from './indexedDbAdapter';

/* ── Deterministic FNV-1a 32-bit Hash ── */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Canonical checksum invariant to IndexedDB keyPath ordering.
 * Covers club economy/roster/lineup, player stats, shop state, and history IDs.
 */
export function computePayloadChecksum(payload: PersistedGameData): string {
  const canonical = {
    team: {
      id: payload.team.id,
      name: payload.team.name,
      coins: payload.team.coins,
      acquisitionPoints: payload.team.acquisitionPoints,
      formation: payload.team.formation,
      wins: payload.team.wins,
      losses: payload.team.losses,
      draws: payload.team.draws,
      roster: [...payload.team.roster].sort(),
      lineup: payload.team.lineup.map((s) => `${s.position}:${s.playerId}:${s.x},${s.y}`),
    },
    players: [...payload.allPlayers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((p) => ({
        id: p.id,
        overall: p.overall,
        str: p.stats.strength,
        sta: p.stats.stamina,
      })),
    shop: [...payload.shopCatalog]
      .sort((a, b) => a.playerId.localeCompare(b.playerId))
      .map((e) => `${e.playerId}:${e.isSold ? 1 : 0}:${e.isAvailable ? 1 : 0}`),
    matches: [...payload.matchHistory]
      .map((m) => `${m.id}:${m.userScore}-${m.aiScore}:${m.result}`)
      .sort(),
    trainings: [...payload.trainingHistory]
      .map((t) => `${t.id}:${t.playerId}:${t.statBefore}->${t.statAfter}`)
      .sort(),
  };
  return fnv1aHex(JSON.stringify(canonical));
}

function isValidPersistedData(data: unknown): data is PersistedGameData {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as Record<string, unknown>;
  if (!candidate.team || typeof candidate.team !== 'object') return false;

  const team = candidate.team as Record<string, unknown>;
  if (
    typeof team.id !== 'string' ||
    typeof team.coins !== 'number' ||
    !Array.isArray(team.roster) ||
    !Array.isArray(team.lineup)
  ) {
    return false;
  }

  if (!Array.isArray(candidate.allPlayers) || candidate.allPlayers.length === 0) {
    return false;
  }

  return true;
}

function normalizePersistedData(
  raw: Partial<PersistedGameData>,
  maxMatches: number,
  maxTrainings: number
): PersistedGameData {
  return {
    team: raw.team!,
    allPlayers: raw.allPlayers || [],
    shopCatalog: raw.shopCatalog || [],
    matchHistory: (raw.matchHistory || []).slice(0, maxMatches),
    trainingHistory: (raw.trainingHistory || []).slice(0, maxTrainings),
  };
}

function createEnvelope(
  data: PersistedGameData,
  updatedAt: number,
  maxMatches: number,
  maxTrainings: number
): StorageEnvelope {
  const payload = normalizePersistedData(data, maxMatches, maxTrainings);
  return {
    namespace: APP_NAMESPACE,
    schemaVersion: DB_SCHEMA_VERSION,
    updatedAt,
    checksum: computePayloadChecksum(payload),
    payload,
  };
}

function verifyEnvelope(env: unknown): env is StorageEnvelope {
  if (!env || typeof env !== 'object') return false;
  const candidate = env as Partial<StorageEnvelope>;
  if (candidate.namespace !== APP_NAMESPACE) return false;
  if (typeof candidate.schemaVersion !== 'number') return false;
  if (typeof candidate.updatedAt !== 'number') return false;
  if (!isValidPersistedData(candidate.payload)) return false;

  const expected = computePayloadChecksum(candidate.payload);
  return candidate.checksum === expected;
}

export interface FastBootResult {
  data: PersistedGameData | null;
  source: 'snapshot' | 'legacy' | 'none';
  updatedAt: number | null;
}

export interface HydrationResult {
  shouldApply: boolean;
  data?: PersistedGameData;
  source: 'indexeddb' | 'snapshot-seeded-idb' | 'unchanged';
}

export class LocalDbManager {
  public readonly cache = new MemoryCache(160);
  private readonly idb = new IndexedDbAdapter();

  private pendingIdbEnvelope: StorageEnvelope | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSavedAt: number | null = null;
  private lastSnapshotBytes = 0;
  private lifecycleBound = false;

  private isLocalStorageAvailable(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const probe = `__${APP_NAMESPACE}_probe__`;
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  /** Quarantine corrupted snapshot before falling back */
  private quarantineCorrupted(raw: string): void {
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.CORRUPTED_BACKUP,
        JSON.stringify({ detectedAt: new Date().toISOString(), raw })
      );
    } catch {
      // Ignore quota failure during quarantine
    }
  }

  /**
   * L3 Fast-Boot Synchronous Read
   * Loads immediately on startup so UI renders with zero async delay.
   * Automatically migrates legacy 'soccer_manager_save' data.
   */
  public loadFastSnapshot(): FastBootResult {
    if (!this.isLocalStorageAvailable()) {
      return { data: null, source: 'none', updatedAt: null };
    }

    // 1. Try current v1 envelope snapshot
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.SNAPSHOT);
      if (raw) {
        this.lastSnapshotBytes = raw.length * 2;
        const parsed = JSON.parse(raw);
        if (verifyEnvelope(parsed)) {
          this.lastSavedAt = parsed.updatedAt;
          return {
            data: parsed.payload,
            source: 'snapshot',
            updatedAt: parsed.updatedAt,
          };
        }
        // Snapshot corrupted — quarantine and fall through to legacy or IndexedDB healing
        this.quarantineCorrupted(raw);
        window.localStorage.removeItem(STORAGE_KEYS.SNAPSHOT);
      }
    } catch {
      // Fall through to legacy check
    }

    // 2. Auto-migrate legacy key ('soccer_manager_save')
    try {
      const legacyRaw = window.localStorage.getItem(STORAGE_KEYS.LEGACY_SAVE);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (isValidPersistedData(parsed)) {
          const normalized = normalizePersistedData(
            parsed,
            RETENTION_POLICY.IDB_MAX_MATCHES,
            RETENTION_POLICY.IDB_MAX_TRAININGS
          );
          const now = Date.now();
          this.persist(normalized, now);
          window.localStorage.removeItem(STORAGE_KEYS.LEGACY_SAVE);
          return {
            data: normalized,
            source: 'legacy',
            updatedAt: now,
          };
        }
      }
    } catch {
      // Ignore malformed legacy save
    }

    return { data: null, source: 'none', updatedAt: null };
  }

  /**
   * L2 Async Reconciliation (Stale-While-Revalidate Hydration)
   * Compares L2 IndexedDB against current booted state:
   * - If L2 is newer OR holds richer history than L3 snapshot, returns L2 data to apply.
   * - If L2 is empty/older and we have valid in-memory data, seeds L2 automatically.
   */
  public async hydrateFromIndexedDB(
    currentData: PersistedGameData | null,
    currentUpdatedAt: number | null
  ): Promise<HydrationResult> {
    if (!this.idb.isSupported()) {
      return { shouldApply: false, source: 'unchanged' };
    }

    const idbEnv = await this.idb.loadEnvelope();
    const idbValid = idbEnv !== null && verifyEnvelope(idbEnv);

    if (idbValid && idbEnv) {
      const isNewer = currentUpdatedAt === null || idbEnv.updatedAt > currentUpdatedAt;
      const hasRicherHistory =
        currentData !== null &&
        (idbEnv.payload.matchHistory.length > currentData.matchHistory.length ||
          idbEnv.payload.trainingHistory.length > currentData.trainingHistory.length);

      if (!currentData || isNewer || hasRicherHistory) {
        this.lastSavedAt = idbEnv.updatedAt;
        // Self-heal L3 snapshot from authoritative L2 IndexedDB
        this.writeL3Snapshot(idbEnv.payload, idbEnv.updatedAt);
        this.cache.invalidateAll();
        return {
          shouldApply: true,
          data: idbEnv.payload,
          source: 'indexeddb',
        };
      }
    }

    // Seed or sync L2 from current L1/L3 state if L2 was empty or behind
    if (currentData) {
      const ts = currentUpdatedAt ?? Date.now();
      const idbEnvelope = createEnvelope(
        currentData,
        ts,
        RETENTION_POLICY.IDB_MAX_MATCHES,
        RETENTION_POLICY.IDB_MAX_TRAININGS
      );
      await this.idb.saveEnvelope(idbEnvelope);
      return { shouldApply: false, source: 'snapshot-seeded-idb' };
    }

    return { shouldApply: false, source: 'unchanged' };
  }

  private writeL3Snapshot(data: PersistedGameData, updatedAt: number): boolean {
    if (!this.isLocalStorageAvailable()) return false;

    const snapshotEnv = createEnvelope(
      data,
      updatedAt,
      RETENTION_POLICY.SNAPSHOT_MAX_MATCHES,
      RETENTION_POLICY.SNAPSHOT_MAX_TRAININGS
    );

    try {
      const serialized = JSON.stringify(snapshotEnv);
      window.localStorage.setItem(STORAGE_KEYS.SNAPSHOT, serialized);
      this.lastSnapshotBytes = serialized.length * 2;
      return true;
    } catch {
      // QuotaExceeded fallback: retry with minimal history (5 entries) so core team data is never lost
      try {
        const compactEnv = createEnvelope(data, updatedAt, 5, 5);
        const serialized = JSON.stringify(compactEnv);
        window.localStorage.setItem(STORAGE_KEYS.SNAPSHOT, serialized);
        this.lastSnapshotBytes = serialized.length * 2;
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Write-Through Persistence:
   * 1) Invalidate L1 MemoryCache
   * 2) Synchronous L3 localStorage snapshot (instant durability)
   * 3) Debounced L2 IndexedDB transaction (high-capacity structured DB)
   */
  public persist(data: PersistedGameData, timestamp = Date.now()): void {
    this.cache.invalidateAll();
    this.lastSavedAt = timestamp;

    // Step 1: L3 synchronous snapshot
    this.writeL3Snapshot(data, timestamp);

    // Step 2: Queue L2 IndexedDB batched write
    if (this.idb.isSupported()) {
      this.pendingIdbEnvelope = createEnvelope(
        data,
        timestamp,
        RETENTION_POLICY.IDB_MAX_MATCHES,
        RETENTION_POLICY.IDB_MAX_TRAININGS
      );

      if (this.flushTimer !== null) {
        clearTimeout(this.flushTimer);
      }

      this.flushTimer = setTimeout(() => {
        void this.flush();
      }, RETENTION_POLICY.IDB_WRITE_DEBOUNCE_MS);
    }
  }

  /** Immediately flushes any pending L2 IndexedDB write */
  public async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (!this.pendingIdbEnvelope) return;
    const envelope = this.pendingIdbEnvelope;
    this.pendingIdbEnvelope = null;

    await this.idb.saveEnvelope(envelope);
  }

  /** Bind browser lifecycle events so queued writes flush safely before tab close */
  public bindLifecycleHooks(): void {
    if (this.lifecycleBound || typeof window === 'undefined') return;
    this.lifecycleBound = true;

    const triggerFlush = () => {
      void this.flush();
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        triggerFlush();
      }
    });
    window.addEventListener('pagehide', triggerFlush);
    window.addEventListener('beforeunload', triggerFlush);
  }

  /** Export full local DB as a portable, checksum-verified JSON string */
  public exportBackupJson(data: PersistedGameData): string {
    const envelope = createEnvelope(
      data,
      Date.now(),
      RETENTION_POLICY.IDB_MAX_MATCHES,
      RETENTION_POLICY.IDB_MAX_TRAININGS
    );
    const backup: BackupExportFile = {
      format: 'fc-superstar-local-db-backup',
      appName: APP_META.name,
      appVersion: APP_META.version,
      exportedAt: new Date().toISOString(),
      envelope,
    };
    return JSON.stringify(backup, null, 2);
  }

  /** Validate & parse an imported JSON backup file */
  public parseBackupJson(rawJson: string): { ok: true; data: PersistedGameData } | { ok: false; error: string } {
    try {
      const parsed = JSON.parse(rawJson) as Partial<BackupExportFile> & Partial<StorageEnvelope>;

      // Case A: Standard BackupExportFile wrapper
      if (parsed.format === 'fc-superstar-local-db-backup' && parsed.envelope) {
        if (!verifyEnvelope(parsed.envelope)) {
          return { ok: false, error: '백업 파일 무결성(체크섬) 검증에 실패했습니다.' };
        }
        return { ok: true, data: parsed.envelope.payload };
      }

      // Case B: Raw StorageEnvelope
      if (verifyEnvelope(parsed)) {
        return { ok: true, data: parsed.payload };
      }

      // Case C: Legacy raw save JSON
      if (isValidPersistedData(parsed)) {
        return {
          ok: true,
          data: normalizePersistedData(
            parsed,
            RETENTION_POLICY.IDB_MAX_MATCHES,
            RETENTION_POLICY.IDB_MAX_TRAININGS
          ),
        };
      }

      return { ok: false, error: '지원하지 않는 백업 파일 형식입니다.' };
    } catch {
      return { ok: false, error: '올바른 JSON 파일이 아닙니다.' };
    }
  }

  /** Clear all local persistence tiers (L1, L2, L3, legacy) */
  public async resetAll(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingIdbEnvelope = null;
    this.cache.invalidateAll();
    this.cache.resetMetrics();
    this.lastSavedAt = null;
    this.lastSnapshotBytes = 0;

    if (this.isLocalStorageAvailable()) {
      window.localStorage.removeItem(STORAGE_KEYS.SNAPSHOT);
      window.localStorage.removeItem(STORAGE_KEYS.LEGACY_SAVE);
      window.localStorage.removeItem(STORAGE_KEYS.CORRUPTED_BACKUP);
    }

    await this.idb.clear();
  }

  /** Collect real-time storage & cache diagnostics for UI / debugging */
  public async getHealthStatus(currentData: PersistedGameData): Promise<StorageHealthStatus> {
    let quotaUsageBytes: number | null = null;
    let quotaLimitBytes: number | null = null;

    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      try {
        const estimate = await navigator.storage.estimate();
        quotaUsageBytes = estimate.usage ?? null;
        quotaLimitBytes = estimate.quota ?? null;
      } catch {
        // Ignore browser restriction
      }
    }

    return {
      appName: APP_META.name,
      appVersion: APP_META.version,
      schemaVersion: DB_SCHEMA_VERSION,
      indexedDbSupported: this.idb.isSupported(),
      indexedDbReady: this.idb.isReady(),
      localStorageAvailable: this.isLocalStorageAvailable(),
      lastSavedAt: this.lastSavedAt,
      snapshotBytes: this.lastSnapshotBytes,
      matchCount: currentData.matchHistory.length,
      trainingCount: currentData.trainingHistory.length,
      playerCount: currentData.allPlayers.length,
      cacheStats: this.cache.getStats(),
      quotaUsageBytes,
      quotaLimitBytes,
    };
  }
}

/** Singleton instance used across the app */
export const localDbManager = new LocalDbManager();
