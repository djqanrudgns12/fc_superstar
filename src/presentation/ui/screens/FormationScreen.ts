import { gameStore } from '../../../infrastructure/stores/gameStore';
import type { FormationType, AIDifficulty, Player } from '../../../shared/types/index';
import { createBackButton, createSectionHeader, showToast, UI_SVGS } from '../components';

export function renderFormationScreen(container: HTMLElement): void {
  container.innerHTML = '';
  const state = gameStore.getState();
  let currentFormation = state.team.formation;
  let selectedDifficulty: AIDifficulty = 'normal';

  // Back Button
  const backBtn = createBackButton('홈으로', () => gameStore.getState().navigate('home'));
  container.appendChild(backBtn);

  // Header
  const header = createSectionHeader('포메이션 및 경기 준비');
  container.appendChild(header);

  // Formation Selector Chips
  const formations: FormationType[] = ['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '5-3-2', '3-4-3'];
  const formChips = document.createElement('div');
  formChips.className = 'filter-bar';
  formChips.style.marginBottom = 'var(--space-3)';

  for (const f of formations) {
    const chip = document.createElement('button');
    chip.className = `filter-chip ${f === currentFormation ? 'active' : ''}`;
    chip.textContent = f;
    chip.addEventListener('click', () => {
      currentFormation = f;
      gameStore.getState().setFormation(f);
      renderFormationScreen(container);
    });
    formChips.appendChild(chip);
  }
  container.appendChild(formChips);

  const lineup = gameStore.getState().team.lineup;
  const allPlayers = gameStore.getState().allPlayers;
  const assignedCount = lineup.filter((s) => Boolean(s.playerId)).length;
  const emptyPositions = lineup.filter((s) => !s.playerId).map((s) => s.position);

  // Lineup Status Banner (prevents forgetting an empty slot)
  const statusBanner = document.createElement('div');
  statusBanner.className = 'card';
  statusBanner.style.marginBottom = 'var(--space-3)';
  statusBanner.style.padding = '10px 14px';
  statusBanner.style.display = 'flex';
  statusBanner.style.justifyContent = 'space-between';
  statusBanner.style.alignItems = 'center';
  statusBanner.style.borderColor = assignedCount === 11 ? 'rgba(61,122,82,0.5)' : 'rgba(184,118,46,0.7)';
  statusBanner.innerHTML = `
    <div style="font-size:var(--font-size-xs);font-weight:700;">
      선발 배치 현황: <span class="num" style="color:${assignedCount === 11 ? 'var(--color-success)' : 'var(--color-warning)'};">${assignedCount} / 11명</span>
      ${emptyPositions.length > 0 ? `<span style="color:var(--color-danger);margin-left:8px;">(미배치 포지션: ${emptyPositions.join(', ')})</span>` : '<span style="color:var(--color-success);margin-left:8px;">(전원 배치 완료)</span>'}
    </div>
    <div style="font-size:11px;color:var(--color-text-muted);">
      선택된 선수는 클릭 후 <strong>[선택 해제]</strong>를 눌러야 변경 가능합니다
    </div>
  `;
  container.appendChild(statusBanner);

  // Pitch representation
  const pitch = document.createElement('div');
  pitch.className = 'formation-pitch';

  lineup.forEach((slot, index) => {
    const player = allPlayers.find((p) => p.id === slot.playerId);
    const slotEl = document.createElement('div');
    slotEl.className = `formation-slot ${player ? '' : 'empty'}`;
    slotEl.style.left = `${slot.x}%`;
    // Keep top/bottom nodes comfortably inside the pitch border with their nameplate below
    const clampedY = Math.min(89, Math.max(13, slot.y));
    slotEl.style.top = `${clampedY}%`;

    // Harmonized Clubhouse tactical position colors
    const posColors: Record<string, string> = {
      GK: '#3F7252',
      CB: '#345A7A',
      LB: '#345A7A',
      RB: '#345A7A',
      CDM: '#7A6542',
      CM: '#7A6542',
      CAM: '#917445',
      LW: '#9A3F3F',
      RW: '#9A3F3F',
      ST: '#9A3F3F',
    };
    const tokenBg = posColors[slot.position] || '#403D38';
    const checkSvg = `<svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="#161A24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3l2.3 2.3 4.7-5"/></svg>`;

    if (player) {
      slotEl.innerHTML = `
        <div class="formation-slot-circle" style="background:${tokenBg};">
          <span>${slot.position}</span>
          <span class="formation-slot-dot" title="선택된 선수">${checkSvg}</span>
        </div>
        <div class="formation-slot-label">
          <span>${player.name}</span>
          <span class="formation-slot-ovr num">${player.overall}</span>
        </div>
      `;
      slotEl.title = `[선택된 선수] ${player.name} (${slot.position}, OVR ${player.overall}) — 클릭하여 확인 또는 선택 해제`;
    } else {
      slotEl.innerHTML = `
        <div class="formation-slot-circle">+</div>
        <div class="formation-slot-label">빈 슬롯 · ${slot.position}</div>
      `;
      slotEl.title = `빈 슬롯 (${slot.position}) — 클릭하여 선수 배치`;
    }

    slotEl.addEventListener('click', () => {
      showSlotAssignModal(index, slot.position);
    });

    pitch.appendChild(slotEl);
  });
  container.appendChild(pitch);

  // Mode & Difficulty Selector
  let isPvPMode = false;

  const modeCard = document.createElement('div');
  modeCard.className = 'card';
  modeCard.style.marginBottom = 'var(--space-4)';
  modeCard.innerHTML = `
    <div style="font-weight:700;font-size:var(--font-size-sm);margin-bottom:var(--space-2);">경기 모드 선택 (5점 선취 승리)</div>
    <div class="filter-bar" style="margin-bottom:var(--space-3);" id="mode-chips">
      <button class="filter-chip active" data-mode="1p" style="gap:5px;">${UI_SVGS.bot}<span>1인용 (vs AI)</span></button>
      <button class="filter-chip" data-mode="2p" style="gap:5px;">${UI_SVGS.users}<span>2인용 (1P vs 2P 대전)</span></button>
    </div>

    <div id="p1-diff-container">
      <div style="font-weight:600;font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:var(--space-2);">AI 난이도</div>
      <div class="filter-bar" style="margin-bottom:0;" id="diff-chips">
        <button class="filter-chip" data-diff="easy">쉬움 (Easy)</button>
        <button class="filter-chip active" data-diff="normal">보통 (Normal)</button>
        <button class="filter-chip" data-diff="hard">어려움 (Hard)</button>
      </div>
    </div>

    <div id="p2-guide-container" style="display:none;background:var(--color-canvas);padding:var(--space-3);border-radius:var(--radius-small);font-size:var(--font-size-xs);">
      <div style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:var(--color-accent);margin-bottom:4px;">${UI_SVGS.users}<span>2인용 로컬 조작 안내</span></div>
      <div style="margin-bottom:2px;">• <strong>1P</strong>: [WASD] 이동 | [R] 패스 | [E] 슛 | [Q] 태클 | [C] GK다이빙 | [X] 시점전환</div>
      <div>• <strong>2P</strong>: [방향키] 이동 | [1] 패스 | [2] 슛 | [3] 크로스 | [4] 스루패스 | [5] 태클 | [Enter] 전환</div>
    </div>
  `;

  modeCard.querySelectorAll('#mode-chips .filter-chip').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      modeCard.querySelectorAll('#mode-chips .filter-chip').forEach((b) => b.classList.remove('active'));
      const target = e.currentTarget as HTMLElement;
      target.classList.add('active');
      isPvPMode = target.dataset.mode === '2p';

      const diffContainer = modeCard.querySelector('#p1-diff-container') as HTMLElement;
      const p2Container = modeCard.querySelector('#p2-guide-container') as HTMLElement;
      if (isPvPMode) {
        if (diffContainer) diffContainer.style.display = 'none';
        if (p2Container) p2Container.style.display = 'block';
      } else {
        if (diffContainer) diffContainer.style.display = 'block';
        if (p2Container) p2Container.style.display = 'none';
      }
    });
  });

  modeCard.querySelectorAll('#diff-chips .filter-chip').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      modeCard.querySelectorAll('#diff-chips .filter-chip').forEach((b) => b.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      selectedDifficulty = (e.currentTarget as HTMLElement).dataset.diff as AIDifficulty;
    });
  });
  container.appendChild(modeCard);

  // Start Match Button
  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn-accent btn-block';
  startBtn.style.fontSize = 'var(--font-size-md)';
  startBtn.style.padding = 'var(--space-4)';
  startBtn.textContent = '경기 시작 (KICK OFF) →';

  startBtn.addEventListener('click', () => {
    startMatch(selectedDifficulty, isPvPMode);
  });
  container.appendChild(startBtn);

  function showSlotAssignModal(slotIndex: number, requiredPos: string) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);

    // Track which already-selected player the user clicked to reveal its [선택 해제] button
    let inspectedPlayerId: string | null = null;

    function renderModalContent() {
      const latestState = gameStore.getState();
      const owned = latestState.getOwnedPlayers();
      const currentLineup = latestState.team.lineup;
      const currentSlot = currentLineup[slotIndex];
      const currentSlotPlayer = currentSlot?.playerId
        ? owned.find((p) => p.id === currentSlot.playerId) || null
        : null;

      // Sort: unassigned matching position first, then unassigned others, then already-selected players
      const sortedOwned = [...owned].sort((a, b) => {
        const aAssigned = currentLineup.some((s) => s.playerId === a.id) ? 1 : 0;
        const bAssigned = currentLineup.some((s) => s.playerId === b.id) ? 1 : 0;
        if (aAssigned !== bAssigned) return aAssigned - bAssigned;
        const aPosMatch = a.position === requiredPos ? 1 : 0;
        const bPosMatch = b.position === requiredPos ? 1 : 0;
        if (aPosMatch !== bPosMatch) return bPosMatch - aPosMatch;
        return b.overall - a.overall;
      });

      const currentSlotBoxHtml = currentSlotPlayer
        ? `
          <div style="background:rgba(184,155,104,0.12);border:1.5px solid rgba(184,155,104,0.45);border-radius:14px;padding:12px 14px;margin-bottom:var(--space-3);">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <div>
                <span style="display:inline-block;background:var(--color-accent);color:#FFFCF7;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;margin-right:6px;">선택된 선수</span>
                <strong>${currentSlotPlayer.name}</strong>
                <span class="num" style="font-size:12px;color:var(--color-text-muted);margin-left:4px;">OVR ${currentSlotPlayer.overall} (${currentSlotPlayer.position})</span>
              </div>
              <button class="btn btn-danger btn-sm" id="btn-unassign-current-slot" style="white-space:nowrap;">
                선택 해제
              </button>
            </div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px;">
              ※ 현재 이 포지션(${requiredPos})에 배치된 선수입니다. 다른 선수로 변경하려면 먼저 <strong>[선택 해제]</strong> 버튼을 눌러주세요.
            </div>
          </div>
        `
        : `
          <div style="background:rgba(63,114,82,0.10);border:1.5px dashed rgba(63,114,82,0.45);border-radius:14px;padding:10px 14px;margin-bottom:var(--space-3);font-size:12px;color:var(--color-success);font-weight:600;">
            현재 [${requiredPos}] 슬롯이 비어 있습니다. 아래에서 [선택 가능] 선수를 클릭해 배치하세요.
          </div>
        `;

      let optionsHtml = '<div class="scroll-list" style="max-height:280px;margin-bottom:var(--space-4);">';
      for (const p of sortedOwned) {
        const assignedIdx = currentLineup.findIndex((s) => s.playerId === p.id);
        const isAlreadySelected = assignedIdx !== -1;
        const assignedPos = isAlreadySelected ? currentLineup[assignedIdx].position : '';
        const isInspected = inspectedPlayerId === p.id;

        if (isAlreadySelected) {
          optionsHtml += `
            <div class="player-card" data-pid="${p.id}" data-selected="true" data-slot-idx="${assignedIdx}"
                 style="cursor:pointer;padding:10px 12px;opacity:0.9;background:var(--color-canvas);border-radius:14px;border:1.5px solid ${isInspected ? 'var(--color-danger)' : 'var(--color-border-hairline)'};">
              <div class="player-info" style="width:100%;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <div>
                    <span style="display:inline-block;background:#403D38;color:#FFFCF7;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;margin-right:6px;">
                      선택된 선수 (${assignedPos})
                    </span>
                    <strong>${p.name}</strong>
                  </div>
                  <span class="num" style="font-size:12px;color:var(--color-text-muted);">OVR ${p.overall} (${p.position})</span>
                </div>
                ${
                  isInspected
                    ? `
                      <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--color-border-hairline);display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span style="font-size:11px;color:var(--color-danger);font-weight:600;">
                          선택 해제 버튼을 눌러야 이 선수를 다시 선택할 수 있습니다.
                        </span>
                        <button class="btn btn-danger btn-sm btn-unassign-player" data-unassign-idx="${assignedIdx}" style="white-space:nowrap;">
                          선택 해제
                        </button>
                      </div>
                    `
                    : `
                      <div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">
                        이미 선택된 선수입니다 (클릭하여 <strong>[선택 해제]</strong> 버튼 열기)
                      </div>
                    `
                }
              </div>
            </div>
          `;
        } else {
          const isRecPos = p.position === requiredPos;
          optionsHtml += `
            <div class="player-card" data-pid="${p.id}" data-selected="false"
                 style="cursor:${currentSlotPlayer ? 'not-allowed' : 'pointer'};padding:10px 12px;border-radius:14px;border:1.5px solid ${isRecPos ? 'var(--color-accent)' : 'var(--color-border-hairline)'};">
              <div class="player-info" style="width:100%;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <div>
                    <span style="display:inline-block;background:rgba(63,114,82,0.14);color:var(--color-success);border:1px solid rgba(63,114,82,0.45);font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;margin-right:6px;">
                      선택 가능${isRecPos ? ' · 추천' : ''}
                    </span>
                    <strong>${p.name}</strong>
                  </div>
                  <span class="num" style="font-weight:700;">OVR ${p.overall} (${p.position})</span>
                </div>
              </div>
            </div>
          `;
        }
      }
      optionsHtml += '</div>';

      modal.innerHTML = `
        <div class="modal-content" style="max-width:440px;">
          <div class="modal-title">포지션 선수 배치 [${requiredPos}]</div>
          ${currentSlotBoxHtml}
          ${optionsHtml}
          <button class="btn btn-secondary btn-block" id="modal-cancel">닫기</button>
        </div>
      `;

      // Unassign current slot button
      modal.querySelector('#btn-unassign-current-slot')?.addEventListener('click', (e) => {
        e.stopPropagation();
        gameStore.getState().removePlayerFromSlot(slotIndex);
        showToast(`${currentSlotPlayer?.name || '선수'} 선택이 해제되었습니다. 이제 선수를 배치할 수 있습니다.`, 'success');
        renderModalContent();
        renderFormationScreen(container);
      });

      // Unassign any clicked already-selected player in the list
      modal.querySelectorAll('.btn-unassign-player').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number((btn as HTMLElement).dataset.unassignIdx);
          if (!Number.isNaN(idx)) {
            const releasedId = currentLineup[idx]?.playerId;
            const releasedPlayer = owned.find((pl) => pl.id === releasedId);
            gameStore.getState().removePlayerFromSlot(idx);
            inspectedPlayerId = null;
            showToast(`${releasedPlayer?.name || '선수'} 선택이 해제되었습니다.`, 'success');
            renderModalContent();
            renderFormationScreen(container);
          }
        });
      });

      // Player card click handling
      modal.querySelectorAll('.player-card').forEach((el) => {
        el.addEventListener('click', () => {
          const cardEl = el as HTMLElement;
          const pid = cardEl.dataset.pid;
          const isSelected = cardEl.dataset.selected === 'true';
          if (!pid) return;

          if (isSelected) {
            // Do NOT allow direct selection of an already-selected player!
            // Instead, toggle/open the [선택 해제] button for that player.
            inspectedPlayerId = inspectedPlayerId === pid ? null : pid;
            showToast('이미 선택된 선수입니다. [선택 해제] 버튼을 눌러야 선택할 수 있습니다.', 'warning');
            renderModalContent();
            return;
          }

          // If current slot still has a player, require clicking [선택 해제] first!
          if (currentSlotPlayer) {
            showToast(`현재 [${requiredPos}] 슬롯의 ${currentSlotPlayer.name} 선수를 먼저 [선택 해제] 해주세요.`, 'warning');
            return;
          }

          const ok = gameStore.getState().assignPlayerToSlot(slotIndex, pid);
          if (ok) {
            modal.remove();
            renderFormationScreen(container);
          } else {
            showToast('이미 선택된 선수이거나 슬롯이 비어 있지 않습니다. 먼저 [선택 해제]를 눌러주세요.', 'warning');
          }
        });
      });

      modal.querySelector('#modal-cancel')?.addEventListener('click', () => modal.remove());
    }

    renderModalContent();
  }

  function startMatch(diff: AIDifficulty, isPvP: boolean = false) {
    const currentLineup = gameStore.getState().team.lineup;
    const userPlayers = gameStore.getState().getOwnedPlayers();
    const allPlayers = gameStore.getState().allPlayers;

    // Validate 11 players assigned
    const validCount = currentLineup.filter((s) => s.playerId).length;
    if (validCount < 11) {
      showToast('11명의 선발 선수를 모두 배치해야 합니다.', 'warning');
      return;
    }

    // AI/2P lineup: pick 11 non-user players balanced by selected difficulty
    const userIds = new Set(gameStore.getState().team.roster);
    const nonUserVisible = allPlayers.filter((p) => !userIds.has(p.id) && !p.isHidden);
    const preferredPool = diff === 'hard'
      ? nonUserVisible
      : nonUserVisible.filter((p) => p.grade >= (diff === 'easy' ? 3 : 2));
    const fallbackPool = nonUserVisible.filter((p) => !preferredPool.includes(p));
    const aiPlayers = [...preferredPool, ...fallbackPool].slice(0, 11);

    const aiLineup = currentLineup.map((s, i) => ({
      playerId: aiPlayers[i]?.id || s.playerId,
      position: s.position,
      x: s.x,
      y: s.y,
    }));

    // Trigger match transition
    const menuEl = document.getElementById('menu-ui');
    const gameEl = document.getElementById('game-container');
    if (menuEl) menuEl.style.display = 'none';
    if (gameEl) gameEl.style.display = 'block';

    window.dispatchEvent(
      new CustomEvent('app:start-match', {
        detail: {
          userPlayers,
          aiPlayers,
          userLineup: currentLineup,
          aiLineup,
          difficulty: diff,
          isPvP,
        },
      })
    );
  }
}
