/* ================================================================
   GAME STORE — Zustand Vanilla Store
   Central state management for the entire application.
   Uses Zustand 5 vanilla store (no React dependency).
   ================================================================ */

import { createStore } from 'zustand/vanilla';
import {
  localDbManager,
  type PersistedGameData,
  type StorageHealthStatus,
} from '../storage/index';
import type {
  GameState,
  GameScreen,
  Player,
  UserTeam,
  ShopEntry,
  MatchRecord,
  TrainingSession,
  FormationType,
  LineupSlot,
  Grade,
  PlayerStats,
  AIDifficulty,
  MatchResult,
  TrainingType,
  StadiumTimeOfDay,
} from '../../shared/types/index';

/* ── Formation Templates ── */
export const FORMATION_TEMPLATES: Record<FormationType, { position: string; x: number; y: number }[]> = {
  '4-4-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 15, y: 72 },
    { position: 'CB', x: 38, y: 75 },
    { position: 'CB', x: 62, y: 75 },
    { position: 'RB', x: 85, y: 72 },
    { position: 'LW', x: 15, y: 45 },
    { position: 'CM', x: 38, y: 50 },
    { position: 'CM', x: 62, y: 50 },
    { position: 'RW', x: 85, y: 45 },
    { position: 'ST', x: 38, y: 22 },
    { position: 'ST', x: 62, y: 22 },
  ],
  '4-3-3': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 15, y: 72 },
    { position: 'CB', x: 38, y: 75 },
    { position: 'CB', x: 62, y: 75 },
    { position: 'RB', x: 85, y: 72 },
    { position: 'CDM', x: 50, y: 55 },
    { position: 'CM', x: 30, y: 48 },
    { position: 'CM', x: 70, y: 48 },
    { position: 'LW', x: 20, y: 25 },
    { position: 'ST', x: 50, y: 18 },
    { position: 'RW', x: 80, y: 25 },
  ],
  '3-5-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'CB', x: 25, y: 75 },
    { position: 'CB', x: 50, y: 78 },
    { position: 'CB', x: 75, y: 75 },
    { position: 'LW', x: 10, y: 50 },
    { position: 'CM', x: 35, y: 52 },
    { position: 'CDM', x: 50, y: 58 },
    { position: 'CM', x: 65, y: 52 },
    { position: 'RW', x: 90, y: 50 },
    { position: 'ST', x: 38, y: 22 },
    { position: 'ST', x: 62, y: 22 },
  ],
  '4-2-3-1': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 15, y: 72 },
    { position: 'CB', x: 38, y: 75 },
    { position: 'CB', x: 62, y: 75 },
    { position: 'RB', x: 85, y: 72 },
    { position: 'CDM', x: 38, y: 55 },
    { position: 'CDM', x: 62, y: 55 },
    { position: 'LW', x: 20, y: 38 },
    { position: 'CAM', x: 50, y: 35 },
    { position: 'RW', x: 80, y: 38 },
    { position: 'ST', x: 50, y: 18 },
  ],
  '5-3-2': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'LB', x: 10, y: 68 },
    { position: 'CB', x: 30, y: 75 },
    { position: 'CB', x: 50, y: 78 },
    { position: 'CB', x: 70, y: 75 },
    { position: 'RB', x: 90, y: 68 },
    { position: 'CM', x: 30, y: 48 },
    { position: 'CM', x: 50, y: 52 },
    { position: 'CM', x: 70, y: 48 },
    { position: 'ST', x: 38, y: 22 },
    { position: 'ST', x: 62, y: 22 },
  ],
  '3-4-3': [
    { position: 'GK', x: 50, y: 92 },
    { position: 'CB', x: 25, y: 75 },
    { position: 'CB', x: 50, y: 78 },
    { position: 'CB', x: 75, y: 75 },
    { position: 'LW', x: 15, y: 50 },
    { position: 'CM', x: 38, y: 52 },
    { position: 'CM', x: 62, y: 52 },
    { position: 'RW', x: 85, y: 50 },
    { position: 'LW', x: 20, y: 25 },
    { position: 'ST', x: 50, y: 18 },
    { position: 'RW', x: 80, y: 25 },
  ],
};

/* ── Grade Rules ── */
export const GRADE_RULES: Record<Grade, { label: string; stars: number; acquisitionCoinCost: number; color: string }> = {
  1: { label: '1등급', stars: 5, acquisitionCoinCost: 1000, color: '#B89B68' },
  2: { label: '2등급', stars: 4, acquisitionCoinCost: 1000, color: '#8B8B8B' },
  3: { label: '3등급', stars: 3, acquisitionCoinCost: 0, color: '#403D38' },
  4: { label: '4등급', stars: 2, acquisitionCoinCost: 0, color: '#8C8579' },
  5: { label: '5등급', stars: 1, acquisitionCoinCost: 0, color: '#C5C0B8' },
};

/* ── Compute overall rating for a player ── */
function computeOverall(stats: PlayerStats, position: string): number {
  if (position === 'GK') {
    return Math.round(
      stats.goalkeeping * 0.35 +
      stats.physical * 0.15 +
      stats.speed * 0.1 +
      stats.passing * 0.15 +
      stats.defense * 0.15 +
      stats.stamina * 0.05 +
      stats.strength * 0.05
    );
  }
  return Math.round(
    stats.speed * 0.15 +
    stats.shooting * 0.15 +
    stats.passing * 0.15 +
    stats.dribbling * 0.15 +
    stats.defense * 0.15 +
    stats.physical * 0.1 +
    stats.strength * 0.075 +
    stats.stamina * 0.075
  );
}

/* ── All Players Database ── */
function createAllPlayers(): Player[] {
  const players: Omit<Player, 'overall'>[] = [
    // Grade 1 — Legendary (Shop Superstars & Hidden Legends)
    {
      id: 'p_casillas', name: '이케르 카시야스', grade: 1 as Grade, position: 'GK' as const,
      isHidden: false, shopPrice: 950,
      stats: { speed: 78, shooting: 20, passing: 72, dribbling: 45, defense: 40, physical: 85, strength: 80, stamina: 85, goalkeeping: 98 },
      specialAbility: '성 카시야스 기적의 반사신경', specialAbilityDesc: 'C키 다이빙 시 90% 확률로 어떠한 강슛도 슈퍼 세이브',
    },
    {
      id: 'p_mbappe', name: '킬리안 음바페', grade: 1 as Grade, position: 'LW' as const,
      isHidden: false, shopPrice: 1150,
      stats: { speed: 97, shooting: 91, passing: 82, dribbling: 93, defense: 38, physical: 78, strength: 76, stamina: 86, goalkeeping: 10 },
      specialAbility: '치타 스프린트', specialAbilityDesc: '폭발적인 가속으로 측면 스프린트 속도 +15%',
    },
    {
      id: 'p_haaland', name: '엘링 홀란', grade: 1 as Grade, position: 'ST' as const,
      isHidden: false, shopPrice: 1150,
      stats: { speed: 90, shooting: 96, passing: 72, dribbling: 82, defense: 45, physical: 93, strength: 94, stamina: 85, goalkeeping: 10 },
      specialAbility: '로켓 슈팅', specialAbilityDesc: '괴물 같은 파워로 시속 140km 대포알 슈팅 속도 +20%',
    },
    {
      id: 'p_vinicius', name: '비니시우스', grade: 1 as Grade, position: 'LW' as const,
      isHidden: false, shopPrice: 1050,
      stats: { speed: 95, shooting: 86, passing: 83, dribbling: 95, defense: 34, physical: 70, strength: 68, stamina: 84, goalkeeping: 10 },
      specialAbility: '컷인 마스터', specialAbilityDesc: '측면 돌파 후 안쪽 감아차기 바나나 킥 정확도 +15%',
    },
    {
      id: 'p_modric', name: '루카 모드리치', grade: 1 as Grade, position: 'CM' as const,
      isHidden: false, shopPrice: 1000,
      stats: { speed: 78, shooting: 82, passing: 96, dribbling: 92, defense: 74, physical: 68, strength: 64, stamina: 88, goalkeeping: 10 },
      specialAbility: '비전 패스', specialAbilityDesc: '경기장을 꿰뚫는 아웃프런트 스루패스 성공률 +25%',
    },
    {
      id: 'p_ramos', name: '세르히오 라모스', grade: 1 as Grade, position: 'CB' as const,
      isHidden: false, shopPrice: 1000,
      stats: { speed: 82, shooting: 70, passing: 80, dribbling: 74, defense: 95, physical: 92, strength: 90, stamina: 84, goalkeeping: 10 },
      specialAbility: '괴물 태클', specialAbilityDesc: '결정적인 순간 철벽 클린 태클 성공률 +20%',
    },
    {
      id: 'p_neuer', name: '마누엘 노이어', grade: 1 as Grade, position: 'GK' as const,
      isHidden: false, shopPrice: 980,
      stats: { speed: 74, shooting: 25, passing: 86, dribbling: 52, defense: 48, physical: 88, strength: 84, stamina: 84, goalkeeping: 96 },
      specialAbility: '스위퍼 키퍼 세이브', specialAbilityDesc: '스위퍼 키퍼 반사신경으로 결정적 슈팅 슈퍼 다이빙 선방',
    },
    // Grade 1 — Non-Purchasable Hidden Legends (Acquisition Points Exchange Only)
    {
      id: 'p_messi', name: '리오넬 메시', grade: 1 as Grade, position: 'RW' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 88, shooting: 93, passing: 92, dribbling: 96, defense: 38, physical: 65, strength: 60, stamina: 72, goalkeeping: 10 },
      specialAbility: '신의 드리블', specialAbilityDesc: '드리블 시 수비수를 50% 높은 확률로 제침',
    },
    {
      id: 'p_ronaldo', name: 'C.호날두', grade: 1 as Grade, position: 'ST' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 85, shooting: 95, passing: 82, dribbling: 88, defense: 35, physical: 78, strength: 78, stamina: 80, goalkeeping: 10 },
      specialAbility: '에어리얼 킹', specialAbilityDesc: '헤딩 슛 성공률 +30%',
    },
    {
      id: 'p_neymar', name: '네이마르', grade: 1 as Grade, position: 'LW' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 90, shooting: 85, passing: 87, dribbling: 94, defense: 32, physical: 58, strength: 55, stamina: 68, goalkeeping: 10 },
      specialAbility: '스킬 무브', specialAbilityDesc: '드리블 중 파울 유도 확률 +20%',
    },
    {
      id: 'p_pele', name: '펠레', grade: 1 as Grade, position: 'ST' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 94, shooting: 97, passing: 91, dribbling: 96, defense: 48, physical: 82, strength: 80, stamina: 90, goalkeeping: 10 },
      specialAbility: '양발잡이', specialAbilityDesc: '축구 황제의 완벽한 양발 피니시 — 구석을 찌르는 정밀 슈팅',
    },
    {
      id: 'p_zidane', name: '지네딘 지단', grade: 1 as Grade, position: 'CAM' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 84, shooting: 90, passing: 96, dribbling: 97, defense: 66, physical: 85, strength: 84, stamina: 86, goalkeeping: 10 },
      specialAbility: '볼 키핑', specialAbilityDesc: '마르세유 턴과 완벽한 탈압박 — 압박 하 볼 로스트 대폭 감소',
    },
    {
      id: 'p_ronaldinho', name: '호나우지뉴', grade: 1 as Grade, position: 'LW' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 92, shooting: 89, passing: 92, dribbling: 98, defense: 38, physical: 76, strength: 74, stamina: 82, goalkeeping: 10 },
      specialAbility: '신의 드리블', specialAbilityDesc: '외계인의 플립플랩 개인기 — 드리블 시 수비수 돌파 확률 대폭 상승',
    },
    {
      id: 'p_maldini', name: '파올로 말디니', grade: 1 as Grade, position: 'CB' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 88, shooting: 58, passing: 84, dribbling: 76, defense: 98, physical: 91, strength: 88, stamina: 90, goalkeeping: 10 },
      specialAbility: '에어리얼 월', specialAbilityDesc: '역사상 최고의 수비수 — 태클 및 공중볼·몸싸움 압도적 우위',
    },
    {
      id: 'p_carlos', name: '호베르투 카를루스', grade: 1 as Grade, position: 'LB' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 96, shooting: 94, passing: 88, dribbling: 85, defense: 86, physical: 88, strength: 92, stamina: 92, goalkeeping: 10 },
      specialAbility: '로켓 슈팅', specialAbilityDesc: 'UFO 프리킥의 전설 — 시속 140km 대포알 왼발 로켓 슈팅',
    },
    {
      id: 'p_yashin', name: '레프 야신', grade: 1 as Grade, position: 'GK' as const,
      isHidden: true, shopPrice: null,
      stats: { speed: 76, shooting: 20, passing: 78, dribbling: 45, defense: 45, physical: 88, strength: 86, stamina: 88, goalkeeping: 99 },
      specialAbility: '거미손 레전드', specialAbilityDesc: '발롱도르 수상 골키퍼 — 모든 각도의 강슛을 막아내는 전설의 반사신경',
    },
    // Grade 2 — Star Players
    {
      id: 'p_son', name: '손흥민', grade: 2 as Grade, position: 'LW' as const,
      isHidden: false, shopPrice: 800,
      stats: { speed: 88, shooting: 89, passing: 80, dribbling: 86, defense: 42, physical: 69, strength: 65, stamina: 78, goalkeeping: 10 },
      specialAbility: '양발잡이', specialAbilityDesc: '약한 발 슛 정확도 감소 없음',
    },
    {
      id: 'p_salah', name: 'M.살라', grade: 2 as Grade, position: 'RW' as const,
      isHidden: false, shopPrice: 850,
      stats: { speed: 92, shooting: 87, passing: 78, dribbling: 90, defense: 40, physical: 72, strength: 68, stamina: 82, goalkeeping: 10 },
      specialAbility: '컷인 마스터', specialAbilityDesc: '안쪽 컷인 후 슈팅 정확도 +15%',
    },
    {
      id: 'p_debruyne', name: '더브라위너', grade: 2 as Grade, position: 'CAM' as const,
      isHidden: false, shopPrice: 900,
      stats: { speed: 76, shooting: 86, passing: 94, dribbling: 84, defense: 55, physical: 74, strength: 70, stamina: 80, goalkeeping: 10 },
      specialAbility: '비전 패스', specialAbilityDesc: '스루패스 성공률 +25%',
    },
    {
      id: 'p_vvd', name: '반다이크', grade: 2 as Grade, position: 'CB' as const,
      isHidden: false, shopPrice: 750,
      stats: { speed: 72, shooting: 50, passing: 70, dribbling: 55, defense: 92, physical: 88, strength: 85, stamina: 78, goalkeeping: 10 },
      specialAbility: '에어리얼 월', specialAbilityDesc: '공중볼 경합 승률 +30%',
    },
    // Grade 3 — Solid Players
    {
      id: 'p_saka', name: 'B.사카', grade: 3 as Grade, position: 'RW' as const,
      isHidden: false, shopPrice: 500,
      stats: { speed: 84, shooting: 78, passing: 80, dribbling: 85, defense: 55, physical: 65, strength: 60, stamina: 76, goalkeeping: 10 },
      specialAbility: '돌파형 윙어', specialAbilityDesc: '사이드 돌파 시 속도 +5%',
    },
    {
      id: 'p_pedri', name: '페드리', grade: 3 as Grade, position: 'CM' as const,
      isHidden: false, shopPrice: 550,
      stats: { speed: 75, shooting: 70, passing: 86, dribbling: 88, defense: 65, physical: 60, strength: 55, stamina: 82, goalkeeping: 10 },
      specialAbility: '볼 키핑', specialAbilityDesc: '압박 하에서 볼 로스트 확률 -15%',
    },
    {
      id: 'p_kim', name: '김민재', grade: 3 as Grade, position: 'CB' as const,
      isHidden: false, shopPrice: 480,
      stats: { speed: 78, shooting: 40, passing: 62, dribbling: 50, defense: 88, physical: 85, strength: 82, stamina: 80, goalkeeping: 10 },
      specialAbility: '괴물 태클', specialAbilityDesc: '태클 성공률 +20%',
    },
    {
      id: 'p_rodri', name: '로드리', grade: 3 as Grade, position: 'CDM' as const,
      isHidden: false, shopPrice: 520,
      stats: { speed: 68, shooting: 72, passing: 82, dribbling: 72, defense: 85, physical: 82, strength: 80, stamina: 84, goalkeeping: 10 },
      specialAbility: '인터셉터', specialAbilityDesc: '패스 가로채기 확률 +20%',
    },
    {
      id: 'p_bellingham', name: '벨링엄', grade: 3 as Grade, position: 'CM' as const,
      isHidden: false, shopPrice: 580,
      stats: { speed: 78, shooting: 80, passing: 78, dribbling: 82, defense: 68, physical: 78, strength: 75, stamina: 85, goalkeeping: 10 },
      specialAbility: '박스 투 박스', specialAbilityDesc: '경기 전체 체력 소모 -10%',
    },
    // Grade 4 — Role Players
    {
      id: 'p_rashford', name: '래시포드', grade: 4 as Grade, position: 'LW' as const,
      isHidden: false, shopPrice: 320,
      stats: { speed: 88, shooting: 75, passing: 68, dribbling: 80, defense: 38, physical: 70, strength: 65, stamina: 72, goalkeeping: 10 },
      specialAbility: '로켓 슈팅', specialAbilityDesc: '강력한 중거리 슈팅 속도 +20%',
    },
    {
      id: 'p_mount', name: 'M.마운트', grade: 4 as Grade, position: 'CAM' as const,
      isHidden: false, shopPrice: 300,
      stats: { speed: 72, shooting: 72, passing: 78, dribbling: 76, defense: 60, physical: 65, strength: 62, stamina: 78, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_martinez', name: '리산드로', grade: 4 as Grade, position: 'CB' as const,
      isHidden: false, shopPrice: 280,
      stats: { speed: 70, shooting: 38, passing: 60, dribbling: 48, defense: 82, physical: 80, strength: 78, stamina: 76, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_alexander', name: 'T.아놀드', grade: 4 as Grade, position: 'RB' as const,
      isHidden: false, shopPrice: 350,
      stats: { speed: 72, shooting: 65, passing: 88, dribbling: 72, defense: 70, physical: 68, strength: 65, stamina: 75, goalkeeping: 10 },
      specialAbility: '황금 크로스', specialAbilityDesc: '크로스 궤적 정확도 +35%',
    },
    {
      id: 'p_davies', name: '알폰소', grade: 4 as Grade, position: 'LB' as const,
      isHidden: false, shopPrice: 310,
      stats: { speed: 92, shooting: 55, passing: 72, dribbling: 78, defense: 72, physical: 72, strength: 68, stamina: 80, goalkeeping: 10 },
      specialAbility: '치타 스프린트', specialAbilityDesc: '측면 스프린트 속도 +15%',
    },
    {
      id: 'p_havertz', name: '하베르츠', grade: 4 as Grade, position: 'ST' as const,
      isHidden: false, shopPrice: 330,
      stats: { speed: 72, shooting: 78, passing: 75, dribbling: 78, defense: 45, physical: 72, strength: 70, stamina: 74, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    // Grade 5 — Bench Players
    {
      id: 'p_hwang', name: '황희찬', grade: 5 as Grade, position: 'ST' as const,
      isHidden: false, shopPrice: 180,
      stats: { speed: 82, shooting: 70, passing: 62, dribbling: 72, defense: 38, physical: 68, strength: 65, stamina: 75, goalkeeping: 10 },
      specialAbility: '황소 돌파', specialAbilityDesc: '드리블 중 태클 저항 확률 +50%',
    },
    {
      id: 'p_lee', name: '이강인', grade: 5 as Grade, position: 'CAM' as const,
      isHidden: false, shopPrice: 200,
      stats: { speed: 70, shooting: 72, passing: 80, dribbling: 82, defense: 35, physical: 55, strength: 52, stamina: 70, goalkeeping: 10 },
      specialAbility: '택배 킬패스', specialAbilityDesc: '스루패스 정확도 +30% 및 탈압박',
    },
    {
      id: 'p_jung', name: '정우영', grade: 5 as Grade, position: 'CM' as const,
      isHidden: false, shopPrice: 150,
      stats: { speed: 72, shooting: 60, passing: 72, dribbling: 68, defense: 60, physical: 65, strength: 62, stamina: 72, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_cho', name: '조현우', grade: 5 as Grade, position: 'GK' as const,
      isHidden: false, shopPrice: 160,
      stats: { speed: 50, shooting: 20, passing: 55, dribbling: 30, defense: 30, physical: 65, strength: 62, stamina: 70, goalkeeping: 78 },
      specialAbility: '빛현우 슈퍼세이브', specialAbilityDesc: '골문 실점 위기 시 70% 확률로 슈퍼 다이빙 선방',
    },
    {
      id: 'p_park', name: '박지수', grade: 5 as Grade, position: 'CB' as const,
      isHidden: false, shopPrice: 140,
      stats: { speed: 65, shooting: 30, passing: 55, dribbling: 42, defense: 75, physical: 74, strength: 72, stamina: 70, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_hong', name: '김진수', grade: 5 as Grade, position: 'LB' as const,
      isHidden: false, shopPrice: 130,
      stats: { speed: 78, shooting: 40, passing: 65, dribbling: 62, defense: 70, physical: 68, strength: 65, stamina: 74, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_kwon', name: '권창훈', grade: 5 as Grade, position: 'RW' as const,
      isHidden: false, shopPrice: 170,
      stats: { speed: 80, shooting: 68, passing: 70, dribbling: 74, defense: 42, physical: 62, strength: 58, stamina: 72, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_na', name: '나상호', grade: 5 as Grade, position: 'LW' as const,
      isHidden: false, shopPrice: 160,
      stats: { speed: 82, shooting: 72, passing: 65, dribbling: 76, defense: 35, physical: 60, strength: 58, stamina: 70, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_kim_y', name: '김영권', grade: 5 as Grade, position: 'CB' as const,
      isHidden: false, shopPrice: 120,
      stats: { speed: 58, shooting: 35, passing: 58, dribbling: 40, defense: 78, physical: 76, strength: 74, stamina: 68, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_song', name: '송민규', grade: 5 as Grade, position: 'ST' as const,
      isHidden: false, shopPrice: 150,
      stats: { speed: 78, shooting: 72, passing: 58, dribbling: 70, defense: 30, physical: 64, strength: 60, stamina: 72, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_kang', name: '강성진', grade: 5 as Grade, position: 'RB' as const,
      isHidden: false, shopPrice: 120,
      stats: { speed: 75, shooting: 40, passing: 62, dribbling: 58, defense: 72, physical: 70, strength: 67, stamina: 73, goalkeeping: 10 },
      specialAbility: null, specialAbilityDesc: null,
    },
    {
      id: 'p_gk2', name: '김승규', grade: 4 as Grade, position: 'GK' as const,
      isHidden: false, shopPrice: 260,
      stats: { speed: 48, shooting: 18, passing: 52, dribbling: 28, defense: 28, physical: 68, strength: 65, stamina: 72, goalkeeping: 82 },
      specialAbility: null, specialAbilityDesc: null,
    },
  ];

  return players.map((p) => ({
    ...p,
    overall: computeOverall(p.stats, p.position),
  }));
}

/* ── Generate initial squad: 2xGrade2 + 3xGrade3 + 6xRandom Grade4/5 ── */
function generateInitialRoster(allPlayers: Player[]): string[] {
  const roster: string[] = [];

  // 2x Grade 2 (non-hidden)
  const grade2 = allPlayers.filter((p) => p.grade === 2 && !p.isHidden);
  const picked2 = grade2.slice(0, 2);
  picked2.forEach((p) => roster.push(p.id));

  // 3x Grade 3
  const grade3 = allPlayers.filter((p) => p.grade === 3 && !p.isHidden);
  const picked3 = grade3.slice(0, 3);
  picked3.forEach((p) => roster.push(p.id));

  // 6x random from Grade 4/5
  const grade45 = allPlayers.filter((p) => (p.grade === 4 || p.grade === 5) && !p.isHidden);
  // Ensure we have balanced positions — pick Casillas as legendary GK first!
  const casillas = allPlayers.find((p) => p.id === 'p_casillas');
  if (casillas) {
    roster.push(casillas.id);
  } else {
    const gk = grade45.find((p) => p.position === 'GK');
    if (gk) roster.push(gk.id);
  }

  const remaining = grade45.filter((p) => !roster.includes(p.id));
  // Shuffle remaining
  const shuffled = remaining.sort(() => Math.random() - 0.5);
  const needed = 11 - roster.length;
  shuffled.slice(0, needed).forEach((p) => roster.push(p.id));

  return roster;
}

/* ── Generate default lineup based on formation ── */
function generateDefaultLineup(roster: string[], allPlayers: Player[], formation: FormationType): LineupSlot[] {
  const template = FORMATION_TEMPLATES[formation];
  const rosterPlayers = roster.map((id) => allPlayers.find((p) => p.id === id)!).filter(Boolean);
  const assigned = new Set<string>();
  const lineup: LineupSlot[] = [];

  for (const slot of template) {
    // Find best match for position
    const candidate = rosterPlayers.find(
      (p) => p.position === slot.position && !assigned.has(p.id)
    );
    if (candidate) {
      assigned.add(candidate.id);
      lineup.push({ playerId: candidate.id, position: slot.position as any, x: slot.x, y: slot.y });
    }
  }

  // Fill remaining slots with any unassigned players
  for (const slot of template) {
    if (lineup.find((l) => l.x === slot.x && l.y === slot.y)) continue;
    const available = rosterPlayers.find((p) => !assigned.has(p.id));
    if (available) {
      assigned.add(available.id);
      lineup.push({ playerId: available.id, position: slot.position as any, x: slot.x, y: slot.y });
    }
  }

  return lineup;
}

/* ── Generate shop catalog ── */
function generateShopCatalog(allPlayers: Player[]): ShopEntry[] {
  return allPlayers.map((p) => ({
    playerId: p.id,
    isAvailable: !p.isHidden,
    isSold: false,
    discountRate: 0,
  }));
}

/* ── Store Actions Interface ── */
export interface GameActions {
  initialize: () => void;
  hydrateFromLocalDb: () => Promise<boolean>;
  navigate: (screen: GameScreen) => void;
  buyPlayer: (playerId: string) => boolean;
  exchangeAcquisition: (playerId: string) => boolean;
  setFormation: (formation: FormationType) => void;
  setLineup: (lineup: LineupSlot[]) => void;
  assignPlayerToSlot: (slotIndex: number, playerId: string) => boolean;
  removePlayerFromSlot: (slotIndex: number) => void;
  recordMatch: (record: MatchRecord) => void;
  applyMatchRewards: (result: MatchResult) => void;
  recordTraining: (session: TrainingSession) => void;
  applyTrainingResult: (playerId: string, type: TrainingType, gain: number) => void;
  setStadiumTime: (time: StadiumTimeOfDay) => void;
  getPlayer: (playerId: string) => Player | undefined;
  getOwnedPlayers: () => Player[];
  getTeamOverall: () => number;
  exportSaveData: () => string;
  importSaveData: (rawJson: string) => { ok: boolean; error?: string };
  resetSaveData: () => Promise<void>;
  getStorageStatus: () => Promise<StorageHealthStatus>;
}

export type GameStore = GameState & GameActions;

/* ── Persistence helpers (3-Tier Local DB & Cache) ── */
let bootedSnapshotTimestamp: number | null = null;
let bootedFromStorage = false;

function extractPersistedData(state: GameState): PersistedGameData {
  return {
    team: state.team,
    matchHistory: state.matchHistory,
    trainingHistory: state.trainingHistory,
    allPlayers: state.allPlayers,
    shopCatalog: state.shopCatalog,
    stadiumTime: state.stadiumTime,
  };
}

function saveToStorage(state: GameState): void {
  localDbManager.persist(extractPersistedData(state));
}

function reconcileSavedState(saved: PersistedGameData): PersistedGameData {
  const freshPlayers = createAllPlayers();
  const existingIds = new Set(saved.allPlayers.map((p) => p.id));
  const mergedPlayers: Player[] = [...saved.allPlayers];
  for (const fp of freshPlayers) {
    if (!existingIds.has(fp.id)) {
      mergedPlayers.push(fp);
    }
  }

  // Ensure legendary GK Casillas is present in roster and deduplicate roster IDs
  const roster = Array.from(new Set([...saved.team.roster]));
  if (!roster.includes('p_casillas')) {
    roster.push('p_casillas');
  }

  const rawLineup = (saved.team.lineup || []).map((slot) => ({ ...slot }));
  // Strictly prevent duplicate playerIds across slots
  const usedInLineup = new Set<string>();
  const lineup: LineupSlot[] = rawLineup.map((slot) => {
    const pid = slot.playerId || '';
    if (pid && roster.includes(pid) && !usedInLineup.has(pid)) {
      usedInLineup.add(pid);
      return { ...slot, playerId: pid };
    }
    return { ...slot, playerId: '' };
  });

  const updatedTeam: UserTeam = {
    ...saved.team,
    roster,
    lineup,
  };

  const baseCatalog: ShopEntry[] =
    saved.shopCatalog && saved.shopCatalog.length > 0
      ? [...saved.shopCatalog]
      : generateShopCatalog(mergedPlayers);
  const catalogIds = new Set(baseCatalog.map((e) => e.playerId));
  for (const fp of freshPlayers) {
    if (!catalogIds.has(fp.id)) {
      baseCatalog.push({
        playerId: fp.id,
        isAvailable: !fp.isHidden,
        isSold: roster.includes(fp.id),
        discountRate: 0,
      });
    }
  }

  const validTime: StadiumTimeOfDay =
    saved.stadiumTime === 'day' || saved.stadiumTime === 'noon' || saved.stadiumTime === 'night'
      ? saved.stadiumTime
      : 'day';

  return {
    team: updatedTeam,
    allPlayers: mergedPlayers,
    shopCatalog: baseCatalog,
    matchHistory: saved.matchHistory || [],
    trainingHistory: saved.trainingHistory || [],
    stadiumTime: validTime,
  };
}

function buildFreshGameData(): PersistedGameData {
  const allPlayers = createAllPlayers();
  const roster = generateInitialRoster(allPlayers);
  const formation: FormationType = '4-4-2';
  const lineup = generateDefaultLineup(roster, allPlayers, formation);
  const shopCatalog = generateShopCatalog(allPlayers);

  for (const entry of shopCatalog) {
    if (roster.includes(entry.playerId)) {
      entry.isSold = true;
    }
  }

  const team: UserTeam = {
    id: 'user_team',
    name: 'MY TEAM',
    coins: 1000,
    acquisitionPoints: 0,
    roster,
    formation,
    lineup,
    wins: 0,
    losses: 0,
    draws: 0,
  };

  return {
    team,
    allPlayers,
    shopCatalog,
    matchHistory: [],
    trainingHistory: [],
    stadiumTime: 'day',
  };
}

/* ── Create the Store ── */
export const gameStore = createStore<GameStore>((set, get) => ({
  // Initial state
  team: {
    id: 'user_team',
    name: 'MY TEAM',
    coins: 1000,
    acquisitionPoints: 0,
    roster: [],
    formation: '4-4-2' as FormationType,
    lineup: [],
    wins: 0,
    losses: 0,
    draws: 0,
  },
  allPlayers: [],
  shopCatalog: [],
  matchHistory: [],
  trainingHistory: [],
  stadiumTime: 'day' as StadiumTimeOfDay,
  currentScreen: 'home' as GameScreen,
  isInitialized: false,

  /* ── Initialize game: fast-boot from L3 snapshot or generate fresh ── */
  initialize: () => {
    localDbManager.bindLifecycleHooks();
    const fastBoot = localDbManager.loadFastSnapshot();
    bootedSnapshotTimestamp = fastBoot.updatedAt;

    if (fastBoot.data && fastBoot.data.team && fastBoot.data.allPlayers.length > 0) {
      bootedFromStorage = true;
      const reconciled = reconcileSavedState(fastBoot.data);
      localDbManager.cache.invalidateAll();
      set({
        ...reconciled,
        isInitialized: true,
      });
      // Re-persist only when schema/master-data reconciliation changed counts or migrated legacy save
      if (
        fastBoot.source === 'legacy' ||
        reconciled.allPlayers.length !== fastBoot.data.allPlayers.length ||
        reconciled.team.roster.length !== fastBoot.data.team.roster.length
      ) {
        saveToStorage(get());
      }
      return;
    }

    bootedFromStorage = false;
    const fresh = buildFreshGameData();
    localDbManager.cache.invalidateAll();
    set({ ...fresh, isInitialized: true });
    saveToStorage(get());
  },

  /* ── Async L2 IndexedDB Reconciliation (Stale-While-Revalidate) ── */
  hydrateFromLocalDb: async () => {
    const state = get();
    const currentData = bootedFromStorage ? extractPersistedData(state) : null;
    const result = await localDbManager.hydrateFromIndexedDB(
      currentData,
      bootedSnapshotTimestamp
    );

    if (result.shouldApply && result.data) {
      const reconciled = reconcileSavedState(result.data);
      localDbManager.cache.invalidateAll();
      set({
        ...reconciled,
        isInitialized: true,
      });
      bootedFromStorage = true;
      return true;
    }

    // If L2 had nothing and we booted fresh, ensure L2 is seeded with fresh game
    if (!bootedFromStorage) {
      await localDbManager.flush();
    }
    return false;
  },

  /* ── Screen navigation ── */
  navigate: (screen: GameScreen) => {
    set({ currentScreen: screen });
  },

  /* ── Stadium Lighting / Time of Day Setting ── */
  setStadiumTime: (time: StadiumTimeOfDay) => {
    set({ stadiumTime: time });
    saveToStorage(get());
  },

  /* ── Buy a player from shop ── */
  buyPlayer: (playerId: string) => {
    const state = get();
    const player = state.allPlayers.find((p) => p.id === playerId);
    if (!player || player.isHidden || player.shopPrice === null) return false;
    if (state.team.roster.includes(playerId)) return false;
    if (state.team.coins < player.shopPrice) return false;

    const newTeam = {
      ...state.team,
      coins: state.team.coins - player.shopPrice,
      roster: [...state.team.roster, playerId],
    };
    const newCatalog = state.shopCatalog.map((e) =>
      e.playerId === playerId ? { ...e, isSold: true } : e
    );

    set({ team: newTeam, shopCatalog: newCatalog });
    saveToStorage(get());
    return true;
  },

  /* ── Exchange acquisition points for a player ── */
  exchangeAcquisition: (playerId: string) => {
    const state = get();
    if (state.team.acquisitionPoints < 10) return false;
    if (state.team.roster.includes(playerId)) return false;

    const player = state.allPlayers.find((p) => p.id === playerId);
    if (!player) return false;

    const coinCost = GRADE_RULES[player.grade].acquisitionCoinCost;
    if (state.team.coins < coinCost) return false;

    const newTeam = {
      ...state.team,
      acquisitionPoints: state.team.acquisitionPoints - 10,
      coins: state.team.coins - coinCost,
      roster: [...state.team.roster, playerId],
    };
    const newCatalog = state.shopCatalog.map((e) =>
      e.playerId === playerId ? { ...e, isSold: true } : e
    );

    set({ team: newTeam, shopCatalog: newCatalog });
    saveToStorage(get());
    return true;
  },

  /* ── Formation management ── */
  setFormation: (formation: FormationType) => {
    const state = get();
    const template = FORMATION_TEMPLATES[formation];
    // Rebuild lineup — preserve assignments without ever duplicating a playerId
    const currentLineup = state.team.lineup;
    const usedIds = new Set<string>();
    const newLineup: LineupSlot[] = template.map((slot, i) => {
      const existing = currentLineup[i];
      if (
        existing &&
        existing.playerId &&
        state.team.roster.includes(existing.playerId) &&
        !usedIds.has(existing.playerId)
      ) {
        usedIds.add(existing.playerId);
        return { playerId: existing.playerId, position: slot.position as any, x: slot.x, y: slot.y };
      }
      return { playerId: '', position: slot.position as any, x: slot.x, y: slot.y };
    });

    set({ team: { ...state.team, formation, lineup: newLineup } });
    saveToStorage(get());
  },

  setLineup: (lineup: LineupSlot[]) => {
    const state = get();
    set({ team: { ...state.team, lineup } });
    saveToStorage(get());
  },

  assignPlayerToSlot: (slotIndex: number, playerId: string) => {
    const state = get();
    const lineup = [...state.team.lineup];
    if (slotIndex < 0 || slotIndex >= lineup.length) return false;

    // Locked rule: Cannot assign a player who is ALREADY selected in any slot,
    // and cannot overwrite an occupied slot without unselecting first!
    const alreadySelected = lineup.some((s) => s.playerId === playerId);
    if (alreadySelected) {
      return false;
    }
    if (lineup[slotIndex].playerId) {
      return false;
    }

    lineup[slotIndex] = { ...lineup[slotIndex], playerId };
    set({ team: { ...state.team, lineup } });
    saveToStorage(get());
    return true;
  },

  removePlayerFromSlot: (slotIndex: number) => {
    const state = get();
    const lineup = [...state.team.lineup];
    if (slotIndex >= 0 && slotIndex < lineup.length) {
      lineup[slotIndex] = { ...lineup[slotIndex], playerId: '' };
    }
    set({ team: { ...state.team, lineup } });
    saveToStorage(get());
  },

  /* ── Match results ── */
  recordMatch: (record: MatchRecord) => {
    const state = get();
    set({ matchHistory: [record, ...state.matchHistory] });
    saveToStorage(get());
  },

  applyMatchRewards: (result: MatchResult) => {
    const state = get();
    let coins = 0;
    let ap = 0;
    let wins = state.team.wins;
    let losses = state.team.losses;
    let draws = state.team.draws;

    switch (result) {
      case 'win':
        coins = 200;
        ap = 1;
        wins++;
        break;
      case 'draw':
        coins = 50;
        draws++;
        break;
      case 'loss':
        losses++;
        break;
      case 'surrender':
        losses++;
        break;
    }

    set({
      team: {
        ...state.team,
        coins: state.team.coins + coins,
        acquisitionPoints: state.team.acquisitionPoints + ap,
        wins,
        losses,
        draws,
      },
    });
    saveToStorage(get());
  },

  /* ── Training ── */
  recordTraining: (session: TrainingSession) => {
    const state = get();
    set({ trainingHistory: [session, ...state.trainingHistory] });
    saveToStorage(get());
  },

  applyTrainingResult: (playerId: string, type: TrainingType, gain: number) => {
    const state = get();
    const CAP = 85;
    const newPlayers = state.allPlayers.map((p) => {
      if (p.id !== playerId) return p;
      const newStats = { ...p.stats };
      if (type === 'strength') {
        newStats.strength = Math.min(CAP, newStats.strength + gain);
      } else {
        newStats.stamina = Math.min(CAP, newStats.stamina + gain);
      }
      return { ...p, stats: newStats, overall: computeOverall(newStats, p.position) };
    });
    set({ allPlayers: newPlayers });
    saveToStorage(get());
  },

  /* ── Helpers (L1 MemoryCache Read-Through) ── */
  getPlayer: (playerId: string) => {
    const playerMap = localDbManager.cache.getOrCompute<Map<string, Player>>(
      'players:byId',
      () => new Map(get().allPlayers.map((p) => [p.id, p]))
    );
    return playerMap.get(playerId);
  },

  getOwnedPlayers: () => {
    return localDbManager.cache.getOrCompute<Player[]>('team:ownedPlayers', () => {
      const state = get();
      const playerMap = localDbManager.cache.getOrCompute<Map<string, Player>>(
        'players:byId',
        () => new Map(state.allPlayers.map((p) => [p.id, p]))
      );
      return state.team.roster
        .map((id) => playerMap.get(id))
        .filter((p): p is Player => Boolean(p));
    });
  },

  getTeamOverall: () => {
    return localDbManager.cache.getOrCompute<number>('team:overall', () => {
      const state = get();
      const playerMap = localDbManager.cache.getOrCompute<Map<string, Player>>(
        'players:byId',
        () => new Map(state.allPlayers.map((p) => [p.id, p]))
      );
      const lineupPlayerIds = state.team.lineup
        .filter((s) => s.playerId)
        .map((s) => s.playerId);
      if (lineupPlayerIds.length === 0) return 0;
      const ratings = lineupPlayerIds
        .map((id) => playerMap.get(id))
        .filter((p): p is Player => Boolean(p))
        .map((p) => p.overall);
      if (ratings.length === 0) return 0;
      return Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);
    });
  },

  /* ── Local DB Backup / Restore / Reset / Health ── */
  exportSaveData: () => {
    return localDbManager.exportBackupJson(extractPersistedData(get()));
  },

  importSaveData: (rawJson: string) => {
    const parsed = localDbManager.parseBackupJson(rawJson);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    const reconciled = reconcileSavedState(parsed.data);
    localDbManager.cache.invalidateAll();
    set({
      ...reconciled,
      isInitialized: true,
    });
    saveToStorage(get());
    void localDbManager.flush();
    return { ok: true };
  },

  resetSaveData: async () => {
    await localDbManager.resetAll();
    const fresh = buildFreshGameData();
    set({
      ...fresh,
      currentScreen: 'home',
      isInitialized: true,
    });
    saveToStorage(get());
    await localDbManager.flush();
  },

  getStorageStatus: () => {
    return localDbManager.getHealthStatus(extractPersistedData(get()));
  },
}));
