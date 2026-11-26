import { gameStore } from '../../../infrastructure/stores/gameStore';
import type { Player, TrainingType } from '../../../shared/types/index';
import { createBackButton, createSectionHeader, showToast } from '../components';

const TRAINING_SVGS = {
  cone: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5L5.2 16h9.6L10 2.5z" fill="rgba(184,155,104,0.2)" stroke="#B89B68"/><path d="M7.5 10h5M3.5 16h13" stroke="#B89B68"/></svg>`,
  strength: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8v4M5.5 6.5v7M14.5 6.5v7M17 8v4M5.5 10h9"/></svg>`,
  stamina: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10.5h3.2l2.1-5 3.1 9 2.1-4h4.5"/></svg>`,
  chevron: `<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 7.5L10 12l4.5-4.5"/></svg>`,
  check: `<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>`,
};

function getPosPillClass(pos: string): string {
  if (pos === 'GK') return 'pos-gk';
  if (pos === 'CB' || pos === 'LB' || pos === 'RB') return 'pos-df';
  if (pos === 'CDM' || pos === 'CM' || pos === 'CAM') return 'pos-mf';
  return 'pos-fw';
}

export function renderTrainingScreen(container: HTMLElement): void {
  const owned = gameStore.getState().getOwnedPlayers();
  let selectedPlayer: Player = owned[0];
  let selectedType: TrainingType = 'strength';

  // Back Button
  const backBtn = createBackButton('홈으로', () => gameStore.getState().navigate('home'));
  container.appendChild(backBtn);

  // Header
  const header = createSectionHeader('훈련장 (스탯 강화)');
  container.appendChild(header);

  // Description Card
  const descCard = document.createElement('div');
  descCard.className = 'card';
  descCard.style.marginBottom = 'var(--space-4)';
  descCard.innerHTML = `
    <div style="display:flex;align-items:center;gap:7px;font-weight:700;margin-bottom:6px;color:var(--color-text-primary);">
      ${TRAINING_SVGS.cone}
      <span>3D 입체 구장 콘 지그재그 드리블 훈련</span>
    </div>
    <div style="font-size:var(--font-size-sm);color:var(--color-text-muted);line-height:1.55;">
      콘은 장애물입니다! 콘에 부딪히지 않고 발로 공을 직접 컨트롤하며 8개의 콘 사이 슬라럼 게이트를 지그재그로 드리블 돌파하세요.<br>
      30초 내 8코스 완주 시 스탯 <strong style="color:var(--color-accent);">+2</strong>, 4코스 이상 돌파 시 <strong style="color:var(--color-accent);">+1</strong> 증가 (최대 85 제한).
    </div>
  `;
  container.appendChild(descCard);

  // Player Selector (Custom Soft-Rounded Luxury Dropdown — replaces sharp native <select>)
  const playerSelectCard = document.createElement('div');
  playerSelectCard.className = 'card';
  playerSelectCard.style.marginBottom = 'var(--space-4)';
  playerSelectCard.style.position = 'relative';
  playerSelectCard.style.zIndex = '20';

  playerSelectCard.innerHTML = `
    <label style="font-weight:700;font-size:var(--font-size-sm);display:block;margin-bottom:var(--space-2);color:var(--color-text-primary);">
      훈련 대상 선수 선택
    </label>
    <div class="luxury-select" id="luxury-player-select">
      <button type="button" class="luxury-select-trigger" id="luxury-select-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="luxury-select-main" id="luxury-select-current"></span>
        <span class="luxury-select-chevron">${TRAINING_SVGS.chevron}</span>
      </button>
      <div class="luxury-select-menu" id="luxury-select-menu" role="listbox"></div>
    </div>
  `;

  const dropdownRoot = playerSelectCard.querySelector('#luxury-player-select') as HTMLElement;
  const triggerBtn = playerSelectCard.querySelector('#luxury-select-trigger') as HTMLButtonElement;
  const currentDisplay = playerSelectCard.querySelector('#luxury-select-current') as HTMLElement;
  const menuEl = playerSelectCard.querySelector('#luxury-select-menu') as HTMLElement;

  function renderDropdown() {
    currentDisplay.innerHTML = `
      <span class="luxury-pos-pill ${getPosPillClass(selectedPlayer.position)}">${selectedPlayer.position}</span>
      <span class="luxury-select-name">${selectedPlayer.name}</span>
      <span class="luxury-select-stats num">힘 ${selectedPlayer.stats.strength} · 심폐력 ${selectedPlayer.stats.stamina}</span>
    `;

    menuEl.innerHTML = owned
      .map((p) => {
        const isSel = p.id === selectedPlayer.id;
        return `
          <button type="button" class="luxury-select-option ${isSel ? 'selected' : ''}" data-pid="${p.id}" role="option" aria-selected="${isSel}">
            <span style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span class="luxury-select-check">${isSel ? TRAINING_SVGS.check : ''}</span>
              <span class="luxury-pos-pill ${getPosPillClass(p.position)}">${p.position}</span>
              <span class="luxury-select-name">${p.name}</span>
            </span>
            <span class="luxury-stat-tag num">힘 ${p.stats.strength} · 심폐력 ${p.stats.stamina}</span>
          </button>
        `;
      })
      .join('');

    menuEl.querySelectorAll('.luxury-select-option').forEach((optBtn) => {
      optBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = (optBtn as HTMLElement).dataset.pid;
        const found = owned.find((p) => p.id === pid);
        if (found) {
          selectedPlayer = found;
          closeDropdown();
          renderDropdown();
          updateStatsDisplay();
        }
      });
    });
  }

  function closeDropdown() {
    dropdownRoot.classList.remove('open');
    triggerBtn.setAttribute('aria-expanded', 'false');
  }

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = !dropdownRoot.classList.contains('open');
    dropdownRoot.classList.toggle('open', willOpen);
    triggerBtn.setAttribute('aria-expanded', String(willOpen));
  });

  const onOutsideClick = (e: MouseEvent) => {
    if (!dropdownRoot.isConnected) {
      document.removeEventListener('click', onOutsideClick);
      return;
    }
    if (!dropdownRoot.contains(e.target as Node)) {
      closeDropdown();
    }
  };
  document.addEventListener('click', onOutsideClick);

  renderDropdown();
  container.appendChild(playerSelectCard);

  // Training Type Chips
  const typeCard = document.createElement('div');
  typeCard.className = 'card';
  typeCard.style.marginBottom = 'var(--space-4)';
  typeCard.innerHTML = `
    <label style="font-weight:700;font-size:var(--font-size-sm);display:block;margin-bottom:var(--space-2);">
      훈련 항목 선택
    </label>
    <div class="filter-bar" style="margin-bottom:0;" id="type-chips">
      <button class="filter-chip active" data-type="strength">
        <span class="training-chip-icon">${TRAINING_SVGS.strength}</span>힘 (Strength)
      </button>
      <button class="filter-chip" data-type="stamina">
        <span class="training-chip-icon">${TRAINING_SVGS.stamina}</span>심폐력 (Stamina)
      </button>
    </div>
    <div id="stat-preview" style="margin-top:var(--space-3);font-size:var(--font-size-sm);font-weight:600;color:var(--color-accent);"></div>
  `;

  typeCard.querySelectorAll('#type-chips .filter-chip').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      typeCard.querySelectorAll('#type-chips .filter-chip').forEach((b) => b.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      selectedType = (e.currentTarget as HTMLElement).dataset.type as TrainingType;
      updateStatsDisplay();
    });
  });
  container.appendChild(typeCard);

  function updateStatsDisplay() {
    const preview = typeCard.querySelector('#stat-preview');
    if (!preview) return;
    const current = selectedType === 'strength' ? selectedPlayer.stats.strength : selectedPlayer.stats.stamina;
    if (current >= 85) {
      preview.innerHTML = `현재 스탯: ${current} / 85 <span style="color:var(--color-danger);">(최대치 도달 — 강화 불가)</span>`;
    } else {
      preview.innerHTML = `현재 스탯: ${current} / 85 (훈련 가능)`;
    }
  }
  updateStatsDisplay();

  // Start Training Button
  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn-primary btn-block';
  startBtn.textContent = '훈련 시작하기 →';
  startBtn.addEventListener('click', () => {
    const current = selectedType === 'strength' ? selectedPlayer.stats.strength : selectedPlayer.stats.stamina;
    if (current >= 85) {
      showToast('이미 최대 스탯치(85)에 도달했습니다.', 'warning');
      return;
    }

    // Launch Training Scene
    const menuEl = document.getElementById('menu-ui');
    const gameEl = document.getElementById('game-container');
    if (menuEl) menuEl.style.display = 'none';
    if (gameEl) gameEl.style.display = 'block';

    window.dispatchEvent(
      new CustomEvent('app:start-training', {
        detail: {
          playerId: selectedPlayer.id,
          playerName: selectedPlayer.name,
          trainingType: selectedType,
          currentStat: current,
        },
      })
    );
  });
  container.appendChild(startBtn);

  // Training History
  const history = gameStore.getState().trainingHistory;
  if (history.length > 0) {
    const histSection = document.createElement('div');
    histSection.style.marginTop = 'var(--space-5)';
    histSection.innerHTML = `
      <div style="font-weight:700;font-size:var(--font-size-sm);margin-bottom:var(--space-2);">최근 훈련 기록</div>
      <div class="scroll-list" style="max-height:160px;">
        ${history.slice(0, 5).map((h) => {
          const p = gameStore.getState().getPlayer(h.playerId);
          const typeStr = h.type === 'strength' ? '힘' : '심폐력';
          return `
            <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--color-border-hairline);font-size:var(--font-size-xs);">
              <span>${p?.name || '선수'} [${typeStr}]</span>
              <span class="num">${h.statBefore} → ${h.statAfter} (+${h.statAfter - h.statBefore})</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.appendChild(histSection);
  }
}
