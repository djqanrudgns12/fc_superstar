import { gameStore } from '../../../infrastructure/stores/gameStore';
import type { MatchRecord } from '../../../shared/types/index';
import { formatCoins, UI_SVGS } from '../components';

export function renderMatchResultScreen(container: HTMLElement, record?: MatchRecord): void {
  // If not passed directly, grab latest from match history
  const match = record || gameStore.getState().matchHistory[0];

  if (!match) {
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <p>경기 기록을 찾을 수 없습니다.</p>
        <button class="btn btn-primary" id="btn-back-home" style="margin-top:20px;">홈으로</button>
      </div>
    `;
    container.querySelector('#btn-back-home')?.addEventListener('click', () => {
      gameStore.getState().navigate('home');
    });
    return;
  }

  let title = '경기 종료';
  let titleColor = 'var(--color-text-primary)';
  let coinReward = 0;
  let pointReward = 0;

  if (match.result === 'win') {
    title = '승리!';
    titleColor = 'var(--color-success)';
    coinReward = 200;
    pointReward = 1;
  } else if (match.result === 'loss') {
    title = '패배';
    titleColor = 'var(--color-danger)';
  } else if (match.result === 'surrender') {
    title = '게임에 패배 (기권)';
    titleColor = 'var(--color-danger)';
  } else {
    title = '무승부';
    titleColor = 'var(--color-warning)';
    coinReward = 50;
  }

  container.innerHTML = `
    <div class="card" style="text-align:center;padding:var(--space-6) var(--space-4);">
      <h2 style="color:${titleColor};font-size:var(--font-size-2xl);margin-bottom:var(--space-2);">${title}</h2>
      
      <div style="font-size:3rem;font-weight:900;letter-spacing:-0.03em;margin:var(--space-3) 0;" class="num">
        ${match.userScore} : ${match.aiScore}
      </div>

      <div style="display:flex;justify-content:center;gap:var(--space-5);margin:var(--space-4) 0;padding:var(--space-3);background:var(--color-canvas);border-radius:var(--radius-small);">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);">획득 코인</div>
          <div style="display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:var(--font-size-md);" class="num">${UI_SVGS.coin}<span>+${formatCoins(coinReward)}</span></div>
        </div>
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);">선수 획득도</div>
          <div style="display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:var(--font-size-md);color:var(--color-accent);" class="num">${UI_SVGS.star}<span>+${pointReward}</span></div>
        </div>
      </div>

      <div style="margin:var(--space-4) 0;text-align:left;">
        <div style="font-weight:700;font-size:var(--font-size-sm);margin-bottom:var(--space-2);">경기 이벤트 타임라인</div>
        <div class="scroll-list" style="max-height:140px;">
          ${
            match.events.length === 0
              ? '<p style="color:var(--color-text-muted);font-size:var(--font-size-xs);text-align:center;">특이 이벤트 없음</p>'
              : match.events
                  .map(
                    (e) => `
                    <div style="display:flex;gap:8px;font-size:var(--font-size-xs);padding:4px 0;border-bottom:1px solid var(--color-border-hairline);">
                      <span class="num" style="color:var(--color-text-muted);">${e.minute}'</span>
                      <span>${e.description}</span>
                    </div>
                  `
                  )
                  .join('')
          }
        </div>
      </div>

      <button class="btn btn-primary btn-block" id="btn-return-home" style="margin-top:var(--space-4);">
        메인 홈 화면으로 돌아가기
      </button>
    </div>
  `;

  container.querySelector('#btn-return-home')?.addEventListener('click', () => {
    gameStore.getState().navigate('home');
  });
}
