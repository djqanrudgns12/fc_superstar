import { gameStore } from '../../../infrastructure/stores/gameStore';
import {
  createBackButton,
  createSectionHeader,
  createPlayerCard,
  showToast,
} from '../components';

export function renderSquadScreen(container: HTMLElement): void {
  container.innerHTML = '';
  const state = gameStore.getState();
  const ownedPlayers = gameStore.getState().getOwnedPlayers();
  const teamOvr = gameStore.getState().getTeamOverall();
  const lineup = state.team.lineup;
  const lineupIds = new Set(lineup.map((s) => s.playerId).filter(Boolean));
  let inspectedPlayerId: string | null = null;

  // Back Button
  const backBtn = createBackButton('홈으로', () => gameStore.getState().navigate('home'));
  container.appendChild(backBtn);

  // Header
  const ovrEl = document.createElement('div');
  ovrEl.className = 'num';
  ovrEl.style.fontWeight = '700';
  ovrEl.style.color = 'var(--color-accent)';
  ovrEl.textContent = `팀 OVR ${teamOvr}`;

  const header = createSectionHeader(`스쿼드 (${ownedPlayers.length}명 보유 · 선발 ${lineupIds.size}/11)`, ovrEl);
  container.appendChild(header);

  // Quick Action
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--space-2)';
  btnRow.style.marginBottom = 'var(--space-4)';
  btnRow.innerHTML = `
    <button class="btn btn-primary" id="btn-to-formation" style="flex:1;">
      포메이션 & 포지션 설정 →
    </button>
  `;
  btnRow.querySelector('#btn-to-formation')?.addEventListener('click', () => {
    gameStore.getState().navigate('formation');
  });
  container.appendChild(btnRow);

  // Player List
  const listContainer = document.createElement('div');
  listContainer.className = 'scroll-list';
  listContainer.style.maxHeight = '65vh';
  container.appendChild(listContainer);

  function renderList() {
    listContainer.innerHTML = '';
    const currLineup = gameStore.getState().team.lineup;
    const currLineupIds = new Set(currLineup.map((s) => s.playerId).filter(Boolean));

    const sorted = [...ownedPlayers].sort((a, b) => {
      const aInLineup = currLineupIds.has(a.id) ? 1 : 0;
      const bInLineup = currLineupIds.has(b.id) ? 1 : 0;
      if (aInLineup !== bInLineup) return bInLineup - aInLineup;
      return b.overall - a.overall;
    });

    for (const player of sorted) {
      const slotIdx = currLineup.findIndex((s) => s.playerId === player.id);
      const isStarting = slotIdx !== -1;
      const card = createPlayerCard(player, {
        isOwned: true,
      });

      if (isStarting) {
        const assignedPos = currLineup[slotIdx].position;
        const startingBadge = document.createElement('span');
        startingBadge.style.fontSize = 'var(--font-size-xs)';
        startingBadge.style.fontWeight = '800';
        startingBadge.style.color = '#FFFCF7';
        startingBadge.style.background = '#403D38';
        startingBadge.style.padding = '2px 7px';
        startingBadge.style.borderRadius = 'var(--radius-small)';
        startingBadge.style.marginRight = '6px';
        startingBadge.textContent = `선택된 선수 (${assignedPos})`;
        card.querySelector('.player-info')?.prepend(startingBadge);

        card.style.cursor = 'pointer';
        if (inspectedPlayerId === player.id) {
          const actionBar = document.createElement('div');
          actionBar.style.marginTop = '8px';
          actionBar.style.paddingTop = '8px';
          actionBar.style.borderTop = '1px dashed var(--color-border-hairline)';
          actionBar.style.display = 'flex';
          actionBar.style.justifyContent = 'space-between';
          actionBar.style.alignItems = 'center';
          actionBar.innerHTML = `
            <span style="font-size:11px;color:var(--color-danger);font-weight:600;">현재 선발 배치된 선수입니다.</span>
            <button class="btn btn-danger btn-sm">선택 해제</button>
          `;
          actionBar.querySelector('button')?.addEventListener('click', (e) => {
            e.stopPropagation();
            gameStore.getState().removePlayerFromSlot(slotIdx);
            inspectedPlayerId = null;
            showToast(`${player.name} 선수가 선발에서 선택 해제되었습니다.`, 'success');
            renderSquadScreen(container);
          });
          card.querySelector('.player-info')?.appendChild(actionBar);
        }

        card.addEventListener('click', () => {
          inspectedPlayerId = inspectedPlayerId === player.id ? null : player.id;
          renderList();
        });
      }

      listContainer.appendChild(card);
    }
  }

  renderList();
}
