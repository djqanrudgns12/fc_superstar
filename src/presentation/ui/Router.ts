import type { GameScreen } from '../../shared/types/index';
import { APP_META } from '../../shared/config/appMeta';
import { gameStore } from '../../infrastructure/stores/gameStore';

export type ScreenRenderer = (container: HTMLElement) => void;

export class Router {
  private screens = new Map<GameScreen, ScreenRenderer>();
  private container: HTMLElement;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;

    // Listen to store screen changes
    gameStore.subscribe((state, prevState) => {
      if (state.currentScreen !== prevState.currentScreen) {
        this.renderCurrentScreen(state.currentScreen);
      }
    });
  }

  public register(screen: GameScreen, renderer: ScreenRenderer) {
    this.screens.set(screen, renderer);
  }

  public navigate(screen: GameScreen) {
    gameStore.getState().navigate(screen);
  }

  public renderCurrentScreen(screen?: GameScreen) {
    const target = screen || gameStore.getState().currentScreen;
    const renderer = this.screens.get(target);

    // Make sure menu container is visible and game container is hidden when in menu screens
    const menuEl = document.getElementById('menu-ui');
    const gameEl = document.getElementById('game-container');

    if (menuEl) menuEl.style.display = 'block';
    if (gameEl) gameEl.style.display = 'none';

    this.container.innerHTML = '';
    if (renderer) {
      renderer(this.container);
    } else {
      this.container.innerHTML = `<div class="card"><p>Screen '${target}' not found.</p></div>`;
    }

    const globalFooter = document.createElement('footer');
    globalFooter.className = 'app-global-footer';
    globalFooter.setAttribute('aria-label', `${APP_META.name} ${APP_META.displayVersion}`);
    globalFooter.innerHTML = `
      <span class="app-global-footer-name">${APP_META.name}</span>
      <span class="app-global-footer-sep">·</span>
      <span class="app-global-footer-version num">${APP_META.displayVersion}</span>
    `;
    this.container.appendChild(globalFooter);
  }
}
