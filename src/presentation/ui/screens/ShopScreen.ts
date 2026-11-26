import { gameStore } from '../../../infrastructure/stores/gameStore';
import {
  createBackButton,
  createSectionHeader,
  createPlayerCard,
  formatCoins,
  showToast,
  UI_SVGS,
} from '../components';

export function renderShopScreen(container: HTMLElement): void {
  const state = gameStore.getState();
  const team = state.team;
  let activeFilter: number | 'all' | 'hidden' = 'all';

  // Back Button & Header
  const backBtn = createBackButton('홈으로', () => gameStore.getState().navigate('home'));
  container.appendChild(backBtn);

  const coinEl = document.createElement('div');
  coinEl.className = 'num';
  coinEl.style.fontWeight = '700';
  coinEl.style.display = 'inline-flex';
  coinEl.style.alignItems = 'center';
  coinEl.style.gap = '5px';
  coinEl.innerHTML = `${UI_SVGS.coin}<span>${formatCoins(team.coins)} 코인</span>`;

  const header = createSectionHeader('이적시장 (선수 영입)', coinEl);
  container.appendChild(header);

  // Filter Chips
  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  const filterOptions: { label: string; value: number | 'all' | 'hidden' }[] = [
    { label: '전체', value: 'all' },
    { label: '★1', value: 1 },
    { label: '★2', value: 2 },
    { label: '★3', value: 3 },
    { label: '★4', value: 4 },
    { label: '★5', value: 5 },
    { label: '비매품', value: 'hidden' },
  ];

  for (const opt of filterOptions) {
    const chip = document.createElement('button');
    chip.className = `filter-chip ${opt.value === activeFilter ? 'active' : ''}`;
    chip.textContent = opt.label;
    chip.addEventListener('click', () => {
      activeFilter = opt.value;
      updateFilterUI();
      renderPlayerList();
    });
    filterBar.appendChild(chip);
  }
  container.appendChild(filterBar);

  function updateFilterUI() {
    filterBar.querySelectorAll('.filter-chip').forEach((c, idx) => {
      if (filterOptions[idx].value === activeFilter) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  }

  // Player List Container
  const listContainer = document.createElement('div');
  listContainer.className = 'scroll-list';
  container.appendChild(listContainer);

  // Acquisition Points Promo Banner
  const banner = document.createElement('div');
  banner.className = 'card';
  banner.style.marginTop = 'var(--space-4)';
  banner.style.display = 'flex';
  banner.style.justifyContent = 'space-between';
  banner.style.alignItems = 'center';
  banner.innerHTML = `
    <div>
      <div style="font-weight:700;font-size:var(--font-size-sm);">선수 획득도 교환소</div>
      <div style="display:inline-flex;align-items:center;gap:4px;font-size:var(--font-size-xs);color:var(--color-text-muted);">보유 획득도: ${UI_SVGS.star} <span class="num">${team.acquisitionPoints} / 10</span></div>
    </div>
    <button class="btn btn-secondary" id="btn-go-acq" style="font-size:var(--font-size-xs);padding:6px 12px;min-height:36px;">
      교환하기 →
    </button>
  `;
  banner.querySelector('#btn-go-acq')?.addEventListener('click', () => {
    gameStore.getState().navigate('acquisition');
  });
  container.appendChild(banner);

  function renderPlayerList() {
    listContainer.innerHTML = '';
    const currentTeam = gameStore.getState().team;

    let players = gameStore.getState().allPlayers;
    if (activeFilter === 'hidden') {
      players = players.filter((p) => p.isHidden);
    } else if (activeFilter !== 'all') {
      players = players.filter((p) => p.grade === activeFilter && !p.isHidden);
    }

    if (players.length === 0) {
      listContainer.innerHTML = '<p style="text-align:center;color:var(--color-text-muted);padding:24px;">조건에 맞는 선수가 없습니다.</p>';
      return;
    }

    for (const player of players) {
      const isOwned = currentTeam.roster.includes(player.id);
      const canAfford = player.shopPrice !== null && currentTeam.coins >= player.shopPrice;

      let btnText = '영입';
      let disabled = false;
      let disabledReason = '';

      if (isOwned) {
        btnText = '';
      } else if (player.isHidden) {
        btnText = '비매품';
        disabled = true;
        disabledReason = '선수 획득도 10개로만 교환할 수 있는 특별 선수입니다.';
      } else if (!canAfford) {
        disabled = true;
        disabledReason = '보유 코인이 부족합니다.';
      }

      const card = createPlayerCard(player, {
        showPrice: !isOwned && !player.isHidden,
        actionButtonText: isOwned ? undefined : btnText,
        isOwned,
        isActionDisabled: disabled,
        disabledReason,
        onAction: () => {
          const success = gameStore.getState().buyPlayer(player.id);
          if (success) {
            showToast(`${player.name} 선수를 영입했습니다!`, 'success');
            renderShopScreen(container);
          } else {
            showToast('영입에 실패했습니다.', 'danger');
          }
        },
      });

      listContainer.appendChild(card);
    }
  }

  renderPlayerList();
}
