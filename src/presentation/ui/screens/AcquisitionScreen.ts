import { gameStore } from '../../../infrastructure/stores/gameStore';
import {
  createBackButton,
  createSectionHeader,
  createPlayerCard,
  formatCoins,
  showToast,
  UI_SVGS,
} from '../components';

export function renderAcquisitionScreen(container: HTMLElement): void {
  const state = gameStore.getState();
  const team = state.team;
  const canExchange = team.acquisitionPoints >= 10;
  let activeTab: string = 'hidden';

  // Back Button
  const backBtn = createBackButton('홈으로', () => gameStore.getState().navigate('home'));
  container.appendChild(backBtn);

  // Header
  const header = createSectionHeader('선수 획득도 교환소');
  container.appendChild(header);

  // Status Card
  const statusCard = document.createElement('div');
  statusCard.className = 'card';
  statusCard.style.marginBottom = 'var(--space-4)';
  statusCard.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
      <div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);">보유 선수 획득도</div>
        <div style="display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-xl);font-weight:800;color:var(--color-accent);" class="num">${UI_SVGS.star}<span>${team.acquisitionPoints} / 10</span></div>
      </div>
      <div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);">보유 코인</div>
        <div style="display:inline-flex;align-items:center;gap:5px;font-size:var(--font-size-md);font-weight:700;" class="num">${UI_SVGS.coin}<span>${formatCoins(team.coins)}</span></div>
      </div>
    </div>
    <div style="display:flex;align-items:flex-start;gap:6px;font-size:var(--font-size-xs);color:var(--color-text-muted);border-top:1px solid var(--color-border-hairline);padding-top:8px;">
      ${UI_SVGS.info}
      <span><strong>교환 규칙:</strong> 획득도 10개 소모. 단, 1~2등급 선수 교환 시 밸런스를 위해 <strong>추가 1,000 코인</strong>이 함께 소모됩니다 (3~5등급은 무료).</span>
    </div>
  `;
  container.appendChild(statusCard);

  if (!canExchange) {
    const notice = document.createElement('div');
    notice.className = 'card';
    notice.style.textAlign = 'center';
    notice.style.padding = 'var(--space-5)';
    notice.innerHTML = `
      <div style="display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-lg);font-weight:700;margin-bottom:8px;">${UI_SVGS.lock}<span>획득도 부족</span></div>
      <p style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-bottom:16px;">
        선수를 교환하려면 선수 획득도가 10개 필요합니다.<br>
        (현재 ${10 - team.acquisitionPoints}개 더 필요)
      </p>
      <button class="btn btn-primary" id="btn-go-match">경기 뛰고 획득도 모으기 →</button>
    `;
    notice.querySelector('#btn-go-match')?.addEventListener('click', () => {
      gameStore.getState().navigate('formation');
    });
    container.appendChild(notice);
    return;
  }

  // Tabs for Hidden vs Normal
  const tabs = document.createElement('div');
  tabs.className = 'filter-bar';
  tabs.innerHTML = `
    <button class="filter-chip ${activeTab === 'hidden' ? 'active' : ''}" id="tab-hidden" style="gap:5px;">${UI_SVGS.lock}<span>비매품(히든) 선수</span></button>
    <button class="filter-chip ${activeTab === 'normal' ? 'active' : ''}" id="tab-normal">일반 선수 전체</button>
  `;

  tabs.querySelector('#tab-hidden')?.addEventListener('click', () => {
    activeTab = 'hidden';
    tabs.querySelector('#tab-hidden')?.classList.add('active');
    tabs.querySelector('#tab-normal')?.classList.remove('active');
    renderList();
  });

  tabs.querySelector('#tab-normal')?.addEventListener('click', () => {
    activeTab = 'normal';
    tabs.querySelector('#tab-normal')?.classList.add('active');
    tabs.querySelector('#tab-hidden')?.classList.remove('active');
    renderList();
  });

  container.appendChild(tabs);

  // Player List
  const listContainer = document.createElement('div');
  listContainer.className = 'scroll-list';
  container.appendChild(listContainer);

  function renderList() {
    listContainer.innerHTML = '';
    const all = gameStore.getState().allPlayers;
    const roster = gameStore.getState().team.roster;

    let targetPlayers = activeTab === 'hidden'
      ? all.filter((p) => p.isHidden && !roster.includes(p.id))
      : all.filter((p) => !p.isHidden && !roster.includes(p.id));

    if (targetPlayers.length === 0) {
      listContainer.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:24px;">교환 가능한 선수가 없습니다.</p>';
      return;
    }

    for (const player of targetPlayers) {
      const isHighGrade = player.grade === 1 || player.grade === 2;
      const canPayCoins = !isHighGrade || team.coins >= 1000;

      const card = createPlayerCard(player, {
        actionButtonText: isHighGrade ? '교환 (1,000코인)' : '교환 (무료)',
        isActionDisabled: !canPayCoins,
        disabledReason: isHighGrade && !canPayCoins ? '1~2등급 교환에 필요한 1,000 코인이 부족합니다.' : '',
        onAction: () => {
          const success = gameStore.getState().exchangeAcquisition(player.id);
          if (success) {
            showToast(`${player.name} 선수를 획득했습니다!`, 'success');
            renderAcquisitionScreen(container);
          } else {
            showToast('교환에 실패했습니다.', 'danger');
          }
        },
      });

      listContainer.appendChild(card);
    }
  }

  renderList();
}
