/* ================================================================
   GLOBAL APPLICATION METADATA — FC Superstar
   Single source of truth for app name, version, and branding.
   ================================================================ */

import { version as PACKAGE_VERSION } from '../../../package.json';

export const APP_NAME = 'FC Superstar' as const;
export const APP_SHORT_NAME = 'FC Superstar' as const;
export const APP_VERSION: string = PACKAGE_VERSION || '1.0.0';
export const APP_DISPLAY_VERSION = `v${APP_VERSION}`;
export const APP_SLUG = 'fc-superstar' as const;
export const APP_ARENA_NAME = 'FC Superstar Arena' as const;
export const APP_DESCRIPTION =
  '나만의 드림팀 구성, 이적시장 영입, 3D 훈련장 육성, 실시간 경기 조작 축구 게임' as const;

export const APP_META = {
  name: APP_NAME,
  shortName: APP_SHORT_NAME,
  version: APP_VERSION,
  displayVersion: APP_DISPLAY_VERSION,
  slug: APP_SLUG,
  arenaName: APP_ARENA_NAME,
  description: APP_DESCRIPTION,
} as const;

export type AppMeta = typeof APP_META;

declare global {
  interface Window {
    __APP_META__?: AppMeta;
  }
}
