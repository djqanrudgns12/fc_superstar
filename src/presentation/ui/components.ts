import type { Player, Grade, UserTeam } from '../../shared/types/index';
import { GRADE_RULES } from '../../infrastructure/stores/gameStore';

export const UI_SVGS = {
  coin: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" style="vertical-align:-2px;display:inline-block;flex-shrink:0;"><circle cx="10" cy="10" r="8" fill="rgba(184,155,104,0.22)" stroke="#B89B68" stroke-width="1.8"/><circle cx="10" cy="10" r="4.8" stroke="#B89B68" stroke-width="1.1" stroke-dasharray="2 1.5"/></svg>`,
  star: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" style="vertical-align:-2px;display:inline-block;flex-shrink:0;"><path d="M10 2.2l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.18l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.2z" fill="rgba(184,155,104,0.28)" stroke="#B89B68" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;flex-shrink:0;"><rect x="4.5" y="9" width="11" height="8" rx="2.2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>`,
  info: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="#B89B68" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;flex-shrink:0;"><circle cx="10" cy="10" r="7.5"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.4" r="0.8" fill="#B89B68" stroke="none"/></svg>`,
  bot: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;flex-shrink:0;"><rect x="3.5" y="6" width="13" height="10" rx="2.8"/><path d="M10 3v3"/><circle cx="7.5" cy="10.8" r="1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="10.8" r="1" fill="currentColor" stroke="none"/><path d="M7.5 13.5h5"/></svg>`,
  users: `<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;flex-shrink:0;"><circle cx="7.5" cy="7" r="2.6"/><path d="M2.8 15.8c0-2.3 2.1-3.8 4.7-3.8s4.7 1.5 4.7 3.8"/><circle cx="13.8" cy="7.5" r="2.1"/><path d="M13.5 12.2c2 .2 3.7 1.4 3.7 3.6"/></svg>`,
  pause: `<svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" style="vertical-align:-1.5px;display:inline-block;flex-shrink:0;"><rect x="4.5" y="3.5" width="3.8" height="13" rx="1.2"/><rect x="11.7" y="3.5" width="3.8" height="13" rx="1.2"/></svg>`,
};

export function formatCoins(amount: number): string {
  if (amount >= 999999) return '999,999+';
  return amount.toLocaleString('ko-KR');
}

export function createGradeBadge(grade: Grade): HTMLElement {
  const rule = GRADE_RULES[grade];
  const span = document.createElement('span');
  span.className = `grade-badge grade-${grade}`;
  span.textContent = `★ ${rule.label}`;
  return span;
}

export function createPlayerAvatar(player: Player): HTMLElement {
  const div = document.createElement('div');
  div.className = 'player-avatar';

  // Position-based background color
  const posColors: Record<string, string> = {
    GK: '#4A7C59',
    CB: '#2C5F8A',
    LB: '#2C5F8A',
    RB: '#2C5F8A',
    CDM: '#6B5B3E',
    CM: '#6B5B3E',
    CAM: '#8B6B3E',
    LW: '#8A2C2C',
    RW: '#8A2C2C',
    ST: '#8A2C2C',
  };

  div.style.backgroundColor = posColors[player.position] || '#403D38';
  div.textContent = player.position;
  return div;
}

export function createPlayerCard(
  player: Player,
  options?: {
    actionButtonText?: string;
    onAction?: () => void;
    isActionDisabled?: boolean;
    disabledReason?: string;
    showPrice?: boolean;
    isOwned?: boolean;
  }
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'player-card';

  const avatar = createPlayerAvatar(player);
  card.appendChild(avatar);

  const info = document.createElement('div');
  info.className = 'player-info';

  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.alignItems = 'center';
  topRow.style.gap = '8px';

  const name = document.createElement('div');
  name.className = 'player-name';
  name.textContent = player.name;
  topRow.appendChild(name);

  const badge = createGradeBadge(player.grade);
  topRow.appendChild(badge);
  info.appendChild(topRow);

  const meta = document.createElement('div');
  meta.className = 'player-meta';
  meta.innerHTML = `
    <span><strong>OVR ${player.overall}</strong></span>
    <span>•</span>
    <span>${player.position}</span>
    ${player.specialAbility ? `<span>•</span><span style="color:var(--color-accent);">${player.specialAbility}</span>` : ''}
  `;
  info.appendChild(meta);

  // Stats mini preview
  const statsMini = document.createElement('div');
  statsMini.className = 'player-stats-mini';
  statsMini.innerHTML = `
    <span>SPD ${player.stats.speed}</span>
    <span>SHT ${player.stats.shooting}</span>
    <span>PAS ${player.stats.passing}</span>
    <span>DRB ${player.stats.dribbling}</span>
    <span>DEF ${player.stats.defense}</span>
    <span>PHY ${player.stats.physical}</span>
  `;
  info.appendChild(statsMini);

  card.appendChild(info);

  // Right side: Price / Action button
  if (options?.actionButtonText) {
    const actionContainer = document.createElement('div');
    actionContainer.style.display = 'flex';
    actionContainer.style.flexDirection = 'column';
    actionContainer.style.alignItems = 'flex-end';
    actionContainer.style.gap = '4px';

    if (options.showPrice) {
      const priceText = document.createElement('div');
      priceText.style.fontSize = 'var(--font-size-xs)';
      priceText.style.fontWeight = '600';
      priceText.style.display = 'inline-flex';
      priceText.style.alignItems = 'center';
      priceText.style.gap = '4px';
      priceText.className = 'num';
      priceText.innerHTML = player.shopPrice !== null ? `${UI_SVGS.coin}<span>${formatCoins(player.shopPrice)}</span>` : '비매품';
      actionContainer.appendChild(priceText);
    }

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.padding = '6px 14px';
    btn.style.minHeight = '36px';
    btn.style.fontSize = 'var(--font-size-sm)';
    btn.textContent = options.actionButtonText;

    if (options.isActionDisabled) {
      btn.disabled = true;
      if (options.disabledReason) {
        btn.title = options.disabledReason;
      }
    } else if (options.onAction) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        options.onAction!();
      });
    }

    actionContainer.appendChild(btn);
    card.appendChild(actionContainer);
  } else if (options?.isOwned) {
    const ownedBadge = document.createElement('span');
    ownedBadge.style.fontSize = 'var(--font-size-xs)';
    ownedBadge.style.fontWeight = '600';
    ownedBadge.style.color = 'var(--color-text-muted)';
    ownedBadge.textContent = '보유 중';
    card.appendChild(ownedBadge);
  }

  return card;
}

export function createStatusBar(team: UserTeam): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'status-bar';

  bar.innerHTML = `
    <div class="status-item">
      ${UI_SVGS.coin}
      <span class="num" style="font-weight:700;">${formatCoins(team.coins)} 코인</span>
    </div>
    <div class="status-item">
      ${UI_SVGS.star}
      <span class="num">선수 획득도 <strong>${team.acquisitionPoints} / 10</strong></span>
    </div>
    <div class="status-item">
      <span class="num" style="color:var(--color-text-muted);">${team.wins}승 ${team.losses}패 ${team.draws}무</span>
    </div>
  `;

  return bar;
}

export function createSectionHeader(title: string, rightContent?: HTMLElement): HTMLElement {
  const header = document.createElement('div');
  header.className = 'section-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'section-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  if (rightContent) {
    header.appendChild(rightContent);
  }

  return header;
}

export function createBackButton(label = '돌아가기', onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'back-btn';
  btn.innerHTML = `<span>←</span><span>${label}</span>`;
  btn.addEventListener('click', onClick);
  return btn;
}

export function showToast(message: string, type: 'success' | 'warning' | 'danger' = 'success'): void {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}

export function createModal(
  title: string,
  bodyText: string,
  actions: { text: string; className?: string; onClick: () => void }[]
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const content = document.createElement('div');
  content.className = 'modal-content';

  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = title;
  content.appendChild(titleEl);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  bodyEl.textContent = bodyText;
  content.appendChild(bodyEl);

  const actionsEl = document.createElement('div');
  actionsEl.className = 'modal-actions';

  for (const act of actions) {
    const btn = document.createElement('button');
    btn.className = `btn ${act.className || 'btn-secondary'}`;
    btn.textContent = act.text;
    btn.addEventListener('click', () => {
      overlay.remove();
      act.onClick();
    });
    actionsEl.appendChild(btn);
  }

  content.appendChild(actionsEl);
  overlay.appendChild(content);
  return overlay;
}
