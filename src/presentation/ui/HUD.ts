import { APP_META } from '../../shared/config/appMeta';
import { gameStore } from '../../infrastructure/stores/gameStore';
import type { MatchRecord, MatchResult } from '../../shared/types/index';
import { createModal, UI_SVGS } from './components';

export class InGameHUD {
  private container: HTMLElement;
  private scoreEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private playerInfoEl!: HTMLElement;
  private surrenderModalEl: HTMLElement | null = null;
  private pauseModalEl: HTMLElement | null = null;

  private onPauseCallback?: () => void;
  private onResumeCallback?: () => void;
  private onSurrenderCallback?: () => void;
  private onQuitCallback?: () => void;

  constructor(containerId = 'game-hud') {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;
  }

  public init(callbacks: {
    onPause: () => void;
    onResume: () => void;
    onSurrender: () => void;
    onQuit: () => void;
  }) {
    this.onPauseCallback = callbacks.onPause;
    this.onResumeCallback = callbacks.onResume;
    this.onSurrenderCallback = callbacks.onSurrender;
    this.onQuitCallback = callbacks.onQuit;

    this.container.innerHTML = `
      <div class="hud-top-bar">
        <div class="hud-brand-badge" aria-label="${APP_META.name} ${APP_META.displayVersion}">
          <span class="hud-brand-name">${APP_META.name}</span>
          <span class="hud-brand-ver num">${APP_META.displayVersion}</span>
        </div>
        <span class="hud-team-name">${gameStore.getState().team.name}</span>
        <span class="hud-score num" id="hud-score">0 : 0</span>
        <span class="hud-team-name">AI FC</span>
        <span class="hud-timer num" id="hud-timer">00:00 [1H]</span>
        <button class="hud-pause-btn" id="btn-pause" style="display:inline-flex;align-items:center;gap:6px;">${UI_SVGS.pause}<span>일시정지</span></button>
      </div>

      <div class="hud-bottom-bar">
        <div class="hud-player-info" id="hud-player">
          선수: -
        </div>
        <div class="hud-controls" id="hud-controls-text">
          <span style="color:#B89B68;font-weight:700;">[조작 가이드]</span> W,A,S,D: 이동 | R: 패스 | E: 슛(차징) | Q: 태클 | C: GK다이빙 | X: 시점전환(하늘고정/3인칭) | 5점 선취 승리
        </div>
      </div>
    `;

    // Keep Match HUD hidden until an actual match starts (never show in Training Ground!)
    this.container.style.display = 'none';

    this.scoreEl = this.container.querySelector('#hud-score')!;
    this.timerEl = this.container.querySelector('#hud-timer')!;
    this.playerInfoEl = this.container.querySelector('#hud-player')!;

    this.container.querySelector('#btn-pause')?.addEventListener('click', () => {
      this.showPauseModal();
    });

    this.setupEventListeners();
  }

  public show() {
    this.container.style.display = 'block';
  }

  public hide() {
    this.container.style.display = 'none';
    if (this.surrenderModalEl) {
      this.surrenderModalEl.remove();
      this.surrenderModalEl = null;
    }
    if (this.pauseModalEl) {
      this.pauseModalEl.remove();
      this.pauseModalEl = null;
    }
  }

  private setupEventListeners() {
    window.addEventListener('app:start-match', ((e: CustomEvent) => {
      const isPvP = e.detail?.isPvP ?? false;
      this.show();
      this.setMode(isPvP);
    }) as EventListener);

    window.addEventListener('app:start-training', (() => {
      this.hide();
    }) as EventListener);

    window.addEventListener('game:score-update', ((e: CustomEvent) => {
      const { userScore, aiScore } = e.detail;
      this.updateScore(userScore, aiScore);
    }) as EventListener);

    window.addEventListener('game:time-update', ((e: CustomEvent) => {
      const { minutes, seconds, half } = e.detail;
      this.updateTimer(minutes, seconds, half);
    }) as EventListener);

    window.addEventListener('game:player-switch', ((e: CustomEvent) => {
      const { name, grade, position, playerNum, jerseyNumber } = e.detail;
      this.updatePlayerInfo(name, grade, position, playerNum, jerseyNumber);
    }) as EventListener);

    window.addEventListener('game:surrender-prompt', (() => {
      this.showSurrenderModal();
    }) as EventListener);

    window.addEventListener('game:match-end', ((e: CustomEvent) => {
      const { userScore, aiScore, result, events } = e.detail;
      this.handleMatchEnd(userScore, aiScore, result, events);
    }) as EventListener);
  }

  public updateScore(userScore: number, aiScore: number) {
    if (this.scoreEl) {
      this.scoreEl.textContent = `${userScore} : ${aiScore}`;
    }
  }

  public updateTimer(minutes: number, seconds: number, half: number) {
    if (this.timerEl) {
      const mStr = String(minutes).padStart(2, '0');
      const sStr = String(seconds).padStart(2, '0');
      this.timerEl.textContent = `${mStr}:${sStr} [${half}H]`;
    }
  }

  public setMode(isPvP: boolean) {
    const topBar = this.container.querySelector('.hud-top-bar');
    const controlsEl = this.container.querySelector('.hud-controls');
    if (topBar) {
      const names = topBar.querySelectorAll('.hud-team-name');
      if (names.length >= 2) {
        if (isPvP) {
          names[0].textContent = `1P: ${gameStore.getState().team.name}`;
          names[1].textContent = `2P: AI FC`;
        } else {
          names[0].textContent = gameStore.getState().team.name;
          names[1].textContent = 'AI FC';
        }
      }
    }

    if (controlsEl) {
      if (isPvP) {
        controlsEl.innerHTML = `
          <div style="color:#B89B68;font-weight:700;">[1P] WASD: 이동 | R: 패스 | E: 슛(차징) | Q: 태클 | C: GK다이빙 | X: 시점전환</div>
          <div style="color:#FF6B6B;font-weight:700;">[2P] 방향키: 이동 | 1: 패스 | 2: 슛(차징) | 3: 크로스 | 4: 스루패스 | 5: 태클 | Enter: 전환</div>
        `;
      } else {
        controlsEl.innerHTML = `
          <span style="color:#B89B68;font-weight:700;">[조작 가이드]</span> W,A,S,D: 이동 | R: 패스 | E: 슛(차징) | Q: 태클 | C: GK다이빙 | X: 시점전환(하늘고정/3인칭) | 5점 선취 승리
        `;
      }
    }
  }

  public updatePlayerInfo(
    name: string,
    grade: number,
    position: string,
    playerNum?: number,
    jerseyNumber?: number
  ) {
    if (this.playerInfoEl) {
      const pTag = playerNum === 2
        ? '<span style="color:#FF6B6B;font-weight:700;">[2P]</span>'
        : '<span style="color:#B89B68;font-weight:700;">[1P]</span>';
      const numBadge = jerseyNumber !== undefined
        ? `<span style="color:#FFD54F;font-weight:800;">#${jerseyNumber}</span> `
        : '';
      this.playerInfoEl.innerHTML = `
        ${pTag} <span style="color:var(--color-accent);font-weight:700;">★${grade}</span>
        ${numBadge}<strong>${name}</strong> [${position}]
      `;
    }
  }

  public showSurrenderModal() {
    if (this.surrenderModalEl) return;

    this.surrenderModalEl = createModal(
      '항복하시겠습니까?',
      '현재 5점 차 이상 크게 열세입니다.\n항복 시 즉시 게임에서 패배하며 메인 홈으로 이동합니다.',
      [
        {
          text: '아니오 (계속 경기)',
          className: 'btn-secondary',
          onClick: () => {
            this.surrenderModalEl = null;
          },
        },
        {
          text: '예 (항복하기)',
          className: 'btn-danger',
          onClick: () => {
            this.surrenderModalEl = null;
            if (this.onSurrenderCallback) this.onSurrenderCallback();
          },
        },
      ]
    );

    document.body.appendChild(this.surrenderModalEl);
  }

  public showPauseModal() {
    if (this.pauseModalEl) return;
    if (this.onPauseCallback) this.onPauseCallback();

    this.pauseModalEl = createModal(
      '경기 일시정지',
      `${APP_META.name} ${APP_META.displayVersion} — 경기를 계속 진행하거나 포기하고 나갈 수 있습니다.`,
      [
        {
          text: '경기 계속하기',
          className: 'btn-primary',
          onClick: () => {
            this.pauseModalEl = null;
            if (this.onResumeCallback) this.onResumeCallback();
          },
        },
        {
          text: '경기 나가기',
          className: 'btn-secondary',
          onClick: () => {
            this.pauseModalEl = null;
            if (this.onQuitCallback) this.onQuitCallback();
          },
        },
      ]
    );

    document.body.appendChild(this.pauseModalEl);
  }

  private handleMatchEnd(userScore: number, aiScore: number, result: MatchResult, events: any[]) {
    const record: MatchRecord = {
      id: `match_${Date.now()}`,
      date: new Date().toISOString(),
      userScore,
      aiScore,
      result,
      aiDifficulty: 'normal',
      duration: 180,
      events,
    };

    gameStore.getState().recordMatch(record);
    gameStore.getState().applyMatchRewards(result);

    this.hide();

    const gameContainer = document.getElementById('game-container');
    const menuUI = document.getElementById('menu-ui');
    if (gameContainer) gameContainer.style.display = 'none';
    if (menuUI) menuUI.style.display = 'block';

    gameStore.getState().navigate('matchResult');
  }

  public destroy() {
    this.container.innerHTML = '';
    if (this.surrenderModalEl) this.surrenderModalEl.remove();
    if (this.pauseModalEl) this.pauseModalEl.remove();
  }
}
