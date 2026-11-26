import Phaser from 'phaser';
import './presentation/styles/global.css';

import { gameStore } from './infrastructure/stores/gameStore';
import { Router } from './presentation/ui/Router';
import { renderHomeScreen } from './presentation/ui/screens/HomeScreen';
import { renderShopScreen } from './presentation/ui/screens/ShopScreen';
import { renderSquadScreen } from './presentation/ui/screens/SquadScreen';
import { renderFormationScreen } from './presentation/ui/screens/FormationScreen';
import { renderTrainingScreen } from './presentation/ui/screens/TrainingScreen';
import { renderMatchResultScreen } from './presentation/ui/screens/MatchResultScreen';
import { renderAcquisitionScreen } from './presentation/ui/screens/AcquisitionScreen';
import { InGameHUD } from './presentation/ui/HUD';

import { BootScene } from './presentation/scenes/BootScene';
import { MatchScene } from './presentation/scenes/MatchScene';
import { TrainingScene } from './presentation/scenes/TrainingScene';

// 1. Initialize Game Store
gameStore.getState().initialize();

// 2. Setup Router & Register Screens
const router = new Router('menu-ui');
router.register('home', renderHomeScreen);
router.register('shop', renderShopScreen);
router.register('squad', renderSquadScreen);
router.register('formation', renderFormationScreen);
router.register('training', renderTrainingScreen);
router.register('matchResult', renderMatchResultScreen);
router.register('acquisition', renderAcquisitionScreen);

// 3. Setup Crisp HiDPI Phaser Game (prevents blurry upscaling & aspect-ratio distortion)
function getHiDPICanvasSize(): { width: number; height: number } {
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
  const w = Math.max(960, Math.round((window.innerWidth || 1280) * dpr));
  const h = Math.max(540, Math.round((window.innerHeight || 720) * dpr));
  return { width: w, height: h };
}

const initialSize = getHiDPICanvasSize();

const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: initialSize.width,
  height: initialSize.height,
  backgroundColor: '#27382B',
  render: {
    antialias: true,
    antialiasGL: true,
    pixelArt: false,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.NONE,
  },
  scene: [BootScene, MatchScene, TrainingScene],
};

const game = new Phaser.Game(phaserConfig);

function syncGameHiDPISize() {
  const { width, height } = getHiDPICanvasSize();
  if (game.scale.width !== width || game.scale.height !== height) {
    game.scale.resize(width, height);
  }
}

window.addEventListener('resize', syncGameHiDPISize);

// 4. Setup HUD
const hud = new InGameHUD('game-hud');
hud.init({
  onPause: () => {
    const matchScene = game.scene.getScene('MatchScene') as MatchScene;
    if (matchScene && matchScene.scene.isActive()) {
      matchScene.setPaused(true);
    }
  },
  onResume: () => {
    const matchScene = game.scene.getScene('MatchScene') as MatchScene;
    if (matchScene && matchScene.scene.isActive()) {
      matchScene.setPaused(false);
    }
  },
  onSurrender: () => {
    const matchScene = game.scene.getScene('MatchScene') as MatchScene;
    if (matchScene && matchScene.scene.isActive()) {
      matchScene.handleMatchEnd('surrender');
    }
  },
  onQuit: () => {
    game.scene.stop('MatchScene');
    game.scene.stop('TrainingScene');
    hud.hide();

    const gameContainer = document.getElementById('game-container');
    const menuUI = document.getElementById('menu-ui');
    if (gameContainer) gameContainer.style.display = 'none';
    if (menuUI) menuUI.style.display = 'block';

    gameStore.getState().navigate('home');
  },
});

// 5. Custom Event Listeners for Game Transitions
window.addEventListener('app:start-match', ((e: CustomEvent) => {
  syncGameHiDPISize();
  hud.show();
  game.scene.stop('TrainingScene');
  game.scene.start('MatchScene', e.detail);
}) as EventListener);

window.addEventListener('app:start-training', ((e: CustomEvent) => {
  syncGameHiDPISize();
  hud.hide();
  game.scene.stop('MatchScene');
  game.scene.start('TrainingScene', e.detail);
}) as EventListener);

// 6. Initial Render (Fast-Boot from L3 Snapshot)
router.renderCurrentScreen('home');

// 7. Async L2 IndexedDB Reconciliation (Stale-While-Revalidate Hydration)
void gameStore.getState().hydrateFromLocalDb().then((updated) => {
  if (updated) {
    const gameContainer = document.getElementById('game-container');
    const isInMenu = !gameContainer || gameContainer.style.display === 'none';
    if (isInMenu) {
      router.renderCurrentScreen();
    }
  }
});

// 8. Register Production Service Worker for GitHub Pages Static Asset Caching
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // Service Worker unavailable or blocked — app works normally without it
    });
  });
}
