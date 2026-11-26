/* ================================================================
   L2 INDEXEDDB LOCAL DATABASE ADAPTER
   Structured, high-capacity browser database for durable persistence.
   Stores normalized object stores: meta, team, players, shop, matches, trainings.
   ================================================================ */

import type {
  UserTeam,
  Player,
  ShopEntry,
  MatchRecord,
  TrainingSession,
} from '../../shared/types/index';
import {
  APP_NAMESPACE,
  IDB_DATABASE_NAME,
  IDB_DATABASE_VERSION,
  RETENTION_POLICY,
  type PersistedGameData,
  type StorageEnvelope,
} from './types';

const STORES = {
  META: 'meta',
  TEAM: 'team',
  PLAYERS: 'players',
  SHOP: 'shop',
  MATCHES: 'matches',
  TRAININGS: 'trainings',
} as const;

interface MetaRecord {
  key: 'db_meta';
  namespace: typeof APP_NAMESPACE;
  schemaVersion: number;
  updatedAt: number;
  checksum: string;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbAdapter {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private ready = false;

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  }

  public isReady(): boolean {
    return this.ready;
  }

  private open(): Promise<IDBDatabase | null> {
    if (!this.isSupported()) {
      return Promise.resolve(null);
    }
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = window.indexedDB.open(IDB_DATABASE_NAME, IDB_DATABASE_VERSION);

        req.onupgradeneeded = () => {
          const db = req.result;

          if (!db.objectStoreNames.contains(STORES.META)) {
            db.createObjectStore(STORES.META, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORES.TEAM)) {
            db.createObjectStore(STORES.TEAM, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORES.PLAYERS)) {
            const playerStore = db.createObjectStore(STORES.PLAYERS, { keyPath: 'id' });
            playerStore.createIndex('grade', 'grade', { unique: false });
            playerStore.createIndex('position', 'position', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.SHOP)) {
            db.createObjectStore(STORES.SHOP, { keyPath: 'playerId' });
          }
          if (!db.objectStoreNames.contains(STORES.MATCHES)) {
            const matchStore = db.createObjectStore(STORES.MATCHES, { keyPath: 'id' });
            matchStore.createIndex('date', 'date', { unique: false });
          }
          if (!db.objectStoreNames.contains(STORES.TRAININGS)) {
            const trainingStore = db.createObjectStore(STORES.TRAININGS, { keyPath: 'id' });
            trainingStore.createIndex('playerId', 'playerId', { unique: false });
            trainingStore.createIndex('completedAt', 'completedAt', { unique: false });
          }
        };

        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
            this.ready = false;
          };
          this.ready = true;
          resolve(db);
        };

        req.onerror = () => {
          this.ready = false;
          resolve(null);
        };

        req.onblocked = () => {
          this.ready = false;
          resolve(null);
        };
      } catch {
        this.ready = false;
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async saveEnvelope(envelope: StorageEnvelope): Promise<boolean> {
    const db = await this.open();
    if (!db) return false;

    const { payload } = envelope;
    const boundedMatches = payload.matchHistory.slice(0, RETENTION_POLICY.IDB_MAX_MATCHES);
    const boundedTrainings = payload.trainingHistory.slice(0, RETENTION_POLICY.IDB_MAX_TRAININGS);

    const storeNames = [
      STORES.META,
      STORES.TEAM,
      STORES.PLAYERS,
      STORES.SHOP,
      STORES.MATCHES,
      STORES.TRAININGS,
    ];

    try {
      const tx = db.transaction(storeNames, 'readwrite');

      const metaStore = tx.objectStore(STORES.META);
      const metaRecord: MetaRecord = {
        key: 'db_meta',
        namespace: envelope.namespace,
        schemaVersion: envelope.schemaVersion,
        updatedAt: envelope.updatedAt,
        checksum: envelope.checksum,
      };
      metaStore.put(metaRecord);

      const teamStore = tx.objectStore(STORES.TEAM);
      teamStore.clear();
      teamStore.put(payload.team);

      const playerStore = tx.objectStore(STORES.PLAYERS);
      playerStore.clear();
      for (const player of payload.allPlayers) {
        playerStore.put(player);
      }

      const shopStore = tx.objectStore(STORES.SHOP);
      shopStore.clear();
      for (const entry of payload.shopCatalog) {
        shopStore.put(entry);
      }

      const matchStore = tx.objectStore(STORES.MATCHES);
      matchStore.clear();
      for (const match of boundedMatches) {
        matchStore.put(match);
      }

      const trainingStore = tx.objectStore(STORES.TRAININGS);
      trainingStore.clear();
      for (const session of boundedTrainings) {
        trainingStore.put(session);
      }

      await transactionDone(tx);
      return true;
    } catch {
      return false;
    }
  }

  public async loadEnvelope(): Promise<StorageEnvelope | null> {
    const db = await this.open();
    if (!db) return null;

    const storeNames = [
      STORES.META,
      STORES.TEAM,
      STORES.PLAYERS,
      STORES.SHOP,
      STORES.MATCHES,
      STORES.TRAININGS,
    ];

    try {
      const tx = db.transaction(storeNames, 'readonly');
      const [meta, teams, players, shop, matches, trainings] = await Promise.all([
        requestToPromise<MetaRecord | undefined>(tx.objectStore(STORES.META).get('db_meta')),
        requestToPromise<UserTeam[]>(tx.objectStore(STORES.TEAM).getAll()),
        requestToPromise<Player[]>(tx.objectStore(STORES.PLAYERS).getAll()),
        requestToPromise<ShopEntry[]>(tx.objectStore(STORES.SHOP).getAll()),
        requestToPromise<MatchRecord[]>(tx.objectStore(STORES.MATCHES).getAll()),
        requestToPromise<TrainingSession[]>(tx.objectStore(STORES.TRAININGS).getAll()),
      ]);

      if (!meta || !teams.length || !players.length) {
        return null;
      }

      // Sort history descending (most recent first)
      matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      trainings.sort(
        (a, b) =>
          new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime()
      );

      const payload: PersistedGameData = {
        team: teams[0],
        allPlayers: players,
        shopCatalog: shop,
        matchHistory: matches,
        trainingHistory: trainings,
      };

      return {
        namespace: meta.namespace,
        schemaVersion: meta.schemaVersion,
        updatedAt: meta.updatedAt,
        checksum: meta.checksum,
        payload,
      };
    } catch {
      return null;
    }
  }

  public async clear(): Promise<void> {
    const db = await this.open();
    if (!db) return;

    const storeNames = [
      STORES.META,
      STORES.TEAM,
      STORES.PLAYERS,
      STORES.SHOP,
      STORES.MATCHES,
      STORES.TRAININGS,
    ];

    try {
      const tx = db.transaction(storeNames, 'readwrite');
      for (const name of storeNames) {
        tx.objectStore(name).clear();
      }
      await transactionDone(tx);
    } catch {
      // Ignore cleanup errors
    }
  }
}
