import { APP_META } from '../../../shared/config/appMeta';
import { gameStore } from '../../../infrastructure/stores/gameStore';
import { formatCoins } from '../components';
import { resolvePlayerVisualProfile } from '../../scenes/PlayerAppearance';

/* ── Custom Crisp Vector SVG Icons (Replaces all system emojis) ── */
const HOME_SVGS = {
  crest: `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L4 5.5v6c0 5.25 3.4 10 8 11.5 4.6-1.5 8-6.25 8-11.5v-6L12 2z" fill="rgba(184,155,104,0.18)" stroke="#D4AF37"/>
      <polygon points="12,7.5 14.6,9.4 13.6,12.5 10.4,12.5 9.4,9.4" fill="#D4AF37" stroke="none"/>
      <path d="M12 5.2v2.3M16.5 8.5l-1.9.9M15.4 14.2l-1.8-1.7M8.6 14.2l1.8-1.7M7.5 8.5l1.9.9" stroke="#E5C88D" stroke-width="1.3"/>
    </svg>
  `,
  coin: `
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
      <circle cx="10" cy="10" r="8" fill="rgba(184,155,104,0.2)" stroke="#B89B68" stroke-width="1.8"/>
      <circle cx="10" cy="10" r="5" stroke="#B89B68" stroke-width="1.1" stroke-dasharray="2 1.5"/>
    </svg>
  `,
  star: `
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
      <path d="M10 2.2l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.18l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.2z" fill="rgba(184,155,104,0.28)" stroke="#B89B68" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `,
  kickoffPlay: `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9.5" stroke="rgba(255,252,247,0.7)"/>
      <polygon points="10,8.2 16.5,12 10,15.8" fill="currentColor" stroke="none"/>
    </svg>
  `,
  match: `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.2"/>
      <line x1="12" y1="4.5" x2="12" y2="19.5"/>
      <circle cx="12" cy="12" r="3.2"/>
      <path d="M2.5 9h3v6h-3M21.5 9h-3v6h3"/>
    </svg>
  `,
  training: `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 4l5.2 14.5H6.8L12 4z"/>
      <line x1="8.7" y1="13" x2="15.3" y2="13"/>
      <line x1="10" y1="9.2" x2="14" y2="9.2"/>
      <line x1="4.5" y1="18.5" x2="19.5" y2="18.5"/>
    </svg>
  `,
  shop: `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M16 3l4 4-4 4"/>
      <line x1="4" y1="7" x2="20" y2="7"/>
      <path d="M8 21l-4-4 4-4"/>
      <line x1="20" y1="17" x2="4" y2="17"/>
    </svg>
  `,
  squad: `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8.5 3.5L12 6l3.5-2.5 4.5 2.5-2 4.5-2.5-1V20h-7V9.5L6 10.5 4 6l4.5-2.5z"/>
      <line x1="10" y1="12.5" x2="14" y2="12.5"/>
    </svg>
  `,
  acquisition: `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/>
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>
      <line x1="12" y1="14" x2="12" y2="19"/>
      <line x1="8" y1="19" x2="16" y2="19"/>
    </svg>
  `,
  history: `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <line x1="4" y1="20" x2="20" y2="20"/>
      <rect x="6" y="12" width="3" height="8" rx="0.8"/>
      <rect x="11" y="8" width="3" height="12" rx="0.8"/>
      <rect x="16" y="4" width="3" height="16" rx="0.8"/>
    </svg>
  `,
  database: `
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="10" cy="4.8" rx="6.5" ry="2.6"/>
      <path d="M3.5 4.8v10.4c0 1.44 2.9 2.6 6.5 2.6s6.5-1.16 6.5-2.6V4.8"/>
      <path d="M3.5 10c0 1.44 2.9 2.6 6.5 2.6s6.5-1.16 6.5-2.6"/>
    </svg>
  `,
};

export function renderHomeScreen(container: HTMLElement): void {
  const state = gameStore.getState();
  const team = state.team;
  const teamOvr = state.getTeamOverall();
  const ownedPlayers = state.getOwnedPlayers();
  const totalMatches = team.wins + team.losses + team.draws;
  const winRate = totalMatches > 0 ? Math.round((team.wins / totalMatches) * 100) : 0;
  const apRatio = Math.min(100, Math.round((team.acquisitionPoints / 10) * 100));

  // Top 3 star players from roster to showcase on the Home dashboard
  const topStars = [...ownedPlayers]
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 3);

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'home-dashboard';

  // ── 1. Top Club Header & Resource Pill Bar ──
  const topHeader = document.createElement('header');
  topHeader.className = 'home-topbar';
  topHeader.innerHTML = `
    <div class="home-brand">
      <div class="home-crest">${HOME_SVGS.crest}</div>
      <div>
        <div class="home-brand-sub">OFFICIAL CLUBHOUSE</div>
        <div class="home-brand-title-row">
          <h1 class="home-brand-title">${APP_META.name}</h1>
          <span class="home-version-pill num">${APP_META.displayVersion}</span>
        </div>
      </div>
    </div>
    <div class="home-wallet">
      <div class="home-wallet-chip" title="보유 코인">
        <span class="home-wallet-icon">${HOME_SVGS.coin}</span>
        <span class="num">${formatCoins(team.coins)}</span>
      </div>
      <div class="home-wallet-chip home-wallet-ap" title="선수 획득도 (10 달성 시 영입 가능)">
        <span class="home-wallet-icon">${HOME_SVGS.star}</span>
        <span class="num">${team.acquisitionPoints}<small>/10</small></span>
      </div>
      <button type="button" class="home-wallet-chip" id="home-btn-local-db" title="로컬 DB & 캐시 관리 (백업/복원)" style="cursor:pointer;">
        <span class="home-wallet-icon">${HOME_SVGS.database}</span>
        <span>DB</span>
      </button>
    </div>
  `;
  wrapper.appendChild(topHeader);

  topHeader.querySelector('#home-btn-local-db')?.addEventListener('click', () => {
    void showLocalDbModal();
  });

  // ── 2. Hero Matchday Banner Card (Primary CTA -> 'formation') ──
  const heroCard = document.createElement('section');
  heroCard.className = 'home-hero-card';
  heroCard.innerHTML = `
    <div class="home-hero-PitchBg"></div>
    <div class="home-hero-top">
      <div>
        <span class="home-hero-badge">MATCH DAY LIVE</span>
        <h2 class="home-hero-club">${team.name}</h2>
        <div class="home-hero-meta">
          <span>포메이션 <strong>${team.formation}</strong></span>
          <span>•</span>
          <span>보유 선수 <strong>${team.roster.length}명</strong></span>
          <span>•</span>
          <span class="num">${team.wins}승 ${team.draws}무 ${team.losses}패 (승률 ${winRate}%)</span>
        </div>
      </div>
      <div class="home-ovr-emblem">
        <span class="home-ovr-label">TEAM OVR</span>
        <strong class="home-ovr-value num">${teamOvr}</strong>
      </div>
    </div>

    <div class="home-hero-stars">
      ${topStars
        .map((p) => {
          const prof = resolvePlayerVisualProfile(p.id, p.position);
          return `
            <div class="home-star-pill">
              <span class="home-star-num num">#${prof.jerseyNumber}</span>
              <span class="home-star-name">${p.name}</span>
              <span class="home-star-pos">${p.position}</span>
              <span class="home-star-ovr num">OVR ${p.overall}</span>
            </div>
          `;
        })
        .join('')}
    </div>

    <div class="home-hero-actions">
      <button class="btn btn-accent home-kickoff-btn" id="home-btn-kickoff">
        <span class="home-kickoff-left">
          ${HOME_SVGS.kickoffPlay}
          <span>경기 시작 (포메이션 & 킥오프)</span>
        </span>
        <span class="home-kickoff-arrow">→</span>
      </button>
    </div>
  `;
  wrapper.appendChild(heroCard);

  heroCard.querySelector('#home-btn-kickoff')?.addEventListener('click', () => {
    gameStore.getState().navigate('formation');
  });

  // ── 3. Main Menu Bento Grid (Preserves all 6 original menu actions, using SVG icons) ──
  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'home-section-label';
  sectionLabel.innerHTML = `
    <span>CLUB MANAGEMENT</span>
    <span class="home-section-hint">구단 운영 및 훈련 메뉴</span>
  `;
  wrapper.appendChild(sectionLabel);

  const bentoGrid = document.createElement('div');
  bentoGrid.className = 'home-bento-grid';

  const menuItems: {
    svg: string;
    label: string;
    desc: string;
    badge?: string;
    screen: 'formation' | 'shop' | 'training' | 'squad' | 'acquisition' | 'home';
    isHistoryModal?: boolean;
    accent?: boolean;
  }[] = [
    {
      svg: HOME_SVGS.match,
      label: '경기 시작',
      desc: '전술 배치 및 AI / 2P 대전',
      badge: team.formation,
      screen: 'formation',
      accent: true,
    },
    {
      svg: HOME_SVGS.training,
      label: '훈련장',
      desc: '3D 콘 드리블 및 능력치 강화',
      badge: '3D DRIBBLE',
      screen: 'training',
      accent: true,
    },
    {
      svg: HOME_SVGS.shop,
      label: '이적시장',
      desc: '스타 선수 영입 및 스카우트',
      badge: `${formatCoins(team.coins)} C`,
      screen: 'shop',
      accent: true,
    },
    {
      svg: HOME_SVGS.squad,
      label: '스쿼드',
      desc: '보유 선수 명단 및 상세 능력치',
      badge: `${team.roster.length}명`,
      screen: 'squad',
      accent: true,
    },
    {
      svg: HOME_SVGS.acquisition,
      label: '획득도 교환',
      desc: '승리 포인트로 레전드 영입',
      badge: `${team.acquisitionPoints} / 10`,
      screen: 'acquisition',
      accent: true,
    },
    {
      svg: HOME_SVGS.history,
      label: '전적 기록',
      desc: '최근 매치 결과 및 득점 기록',
      badge: `${totalMatches}경기`,
      screen: 'home',
      isHistoryModal: true,
      accent: true,
    },
  ];

  for (const item of menuItems) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `home-bento-card ${item.accent ? 'home-bento-accent' : ''}`;
    card.innerHTML = `
      <div class="home-bento-top">
        <span class="home-bento-icon">${item.svg}</span>
        ${item.badge ? `<span class="home-bento-badge num">${item.badge}</span>` : ''}
      </div>
      <div class="home-bento-body">
        <div class="home-bento-title">${item.label}</div>
        <div class="home-bento-desc">${item.desc}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      if (item.isHistoryModal) {
        showMatchHistoryModal();
      } else {
        gameStore.getState().navigate(item.screen);
      }
    });

    bentoGrid.appendChild(card);
  }
  wrapper.appendChild(bentoGrid);

  // ── 4. Acquisition Gauge & In-Game Controls Quick Strip ──
  const footerCard = document.createElement('div');
  footerCard.className = 'home-footer-card';
  footerCard.innerHTML = `
    <div class="home-ap-row">
      <div class="home-ap-header">
        <span class="home-ap-title">${HOME_SVGS.star}<span>레전드 영입 획득도 진행률</span></span>
        <strong class="num">${team.acquisitionPoints} / 10 PT ${team.acquisitionPoints >= 10 ? '(교환 가능!)' : ''}</strong>
      </div>
      <div class="home-ap-track">
        <div class="home-ap-fill" style="width:${apRatio}%;"></div>
      </div>
    </div>
    <div class="home-controls-strip">
      <span class="home-controls-tag">IN-GAME CONTROLS</span>
      <div class="home-controls-keys">
        <span><kbd>WASD</kbd> 이동</span>
        <span><kbd>R</kbd> 패스</span>
        <span><kbd>E</kbd> 슛(차징)</span>
        <span><kbd>Q</kbd> 태클</span>
        <span><kbd>C</kbd> GK다이빙</span>
        <span><kbd>X</kbd> 시점(하늘/3인칭)</span>
      </div>
    </div>
  `;
  wrapper.appendChild(footerCard);

  container.appendChild(wrapper);

  function showMatchHistoryModal() {
    const history = gameStore.getState().matchHistory;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    let contentHtml = '<div class="scroll-list" style="max-height:260px;margin-bottom:var(--space-4);">';
    if (history.length === 0) {
      contentHtml += '<p style="text-align:center;color:var(--color-text-muted);padding:24px 12px;">아직 치른 경기가 없습니다. 첫 경기를 시작해 보세요!</p>';
    } else {
      for (const m of history) {
        const resText = m.result === 'win' ? '승리' : m.result === 'loss' ? '패배' : m.result === 'surrender' ? '기권패' : '무승부';
        const resColor = m.result === 'win' ? 'var(--color-success)' : m.result === 'loss' || m.result === 'surrender' ? 'var(--color-danger)' : 'var(--color-text-muted)';
        contentHtml += `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--color-border-hairline);font-size:var(--font-size-sm);">
            <span style="color:var(--color-text-muted);">${new Date(m.date).toLocaleDateString()}</span>
            <span class="num" style="font-weight:800;font-size:var(--font-size-base);">${m.userScore} : ${m.aiScore}</span>
            <span style="font-weight:700;color:${resColor};">${resText}</span>
          </div>
        `;
      }
    }
    contentHtml += '</div>';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">전적 기록 (${team.wins}승 ${team.draws}무 ${team.losses}패)</div>
        ${contentHtml}
        <button class="btn btn-primary btn-block" id="close-history-modal">닫기</button>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#close-history-modal')?.addEventListener('click', () => modal.remove());
  }

  async function showLocalDbModal() {
    const status = await gameStore.getState().getStorageStatus();
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    const lastSavedText = status.lastSavedAt
      ? new Date(status.lastSavedAt).toLocaleString('ko-KR')
      : '기록 없음';
    const snapshotKb = (status.snapshotBytes / 1024).toFixed(1);
    const idbBadge = status.indexedDbReady
      ? '<span style="color:var(--color-success);font-weight:700;">활성 (IndexedDB)</span>'
      : status.indexedDbSupported
      ? '<span style="color:var(--color-warning);font-weight:700;">대기 중</span>'
      : '<span style="color:var(--color-danger);font-weight:700;">미지원 (L3 폴백)</span>';

    modal.innerHTML = `
      <div class="modal-content" style="max-width:420px;">
        <div class="modal-title">로컬 DB & 캐시 관리</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-bottom:var(--space-3);">
          모든 데이터는 이 브라우저의 로컬 저장소에만 보관됩니다.
        </div>
        <div style="background:var(--color-canvas);border:1px solid var(--color-border-hairline);border-radius:var(--radius-small);padding:12px;margin-bottom:var(--space-4);font-size:var(--font-size-sm);display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--color-text-muted);">앱 버전</span>
            <span class="num" style="font-weight:700;">${APP_META.name} ${APP_META.displayVersion}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--color-text-muted);">L2 영구 저장소</span>
            <span>${idbBadge}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--color-text-muted);">L3 고속 스냅샷</span>
            <span class="num">${status.localStorageAvailable ? `${snapshotKb} KB` : '비활성'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--color-text-muted);">L1 메모리 캐시 적중률</span>
            <span class="num">${status.cacheStats.hitRate}% (${status.cacheStats.hits}H / ${status.cacheStats.misses}M)</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--color-text-muted);">저장된 이력</span>
            <span class="num">경기 ${status.matchCount}건 · 훈련 ${status.trainingCount}건</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:var(--color-text-muted);">스키마 / 최근 저장</span>
            <span class="num">v${status.schemaVersion} · ${lastSavedText}</span>
          </div>
        </div>

        <div id="db-modal-feedback" style="display:none;font-size:var(--font-size-sm);padding:8px 10px;border-radius:8px;margin-bottom:var(--space-3);"></div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:var(--space-4);">
          <button class="btn btn-accent btn-block" id="btn-db-export">백업 파일 내보내기 (.json)</button>
          <button class="btn btn-secondary btn-block" id="btn-db-import">백업 파일 불러오기 (.json)</button>
          <input type="file" id="input-db-import" accept="application/json,.json" style="display:none;" />
          <button class="btn btn-danger btn-block" id="btn-db-reset">로컬 DB 초기화</button>
        </div>

        <button class="btn btn-primary btn-block" id="close-db-modal">닫기</button>
      </div>
    `;

    document.body.appendChild(modal);

    const feedbackEl = modal.querySelector('#db-modal-feedback') as HTMLDivElement;
    const showFeedback = (msg: string, isError = false) => {
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = isError ? 'rgba(168,68,68,0.12)' : 'rgba(63,114,82,0.12)';
      feedbackEl.style.color = isError ? 'var(--color-danger)' : 'var(--color-success)';
      feedbackEl.textContent = msg;
    };

    modal.querySelector('#btn-db-export')?.addEventListener('click', () => {
      const json = gameStore.getState().exportSaveData();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${APP_META.slug}-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback('로컬 DB 백업 파일이 다운로드되었습니다.');
    });

    const fileInput = modal.querySelector('#input-db-import') as HTMLInputElement;
    modal.querySelector('#btn-db-import')?.addEventListener('click', () => {
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const res = gameStore.getState().importSaveData(text);
        if (!res.ok) {
          showFeedback(res.error || '복원에 실패했습니다.', true);
          return;
        }
        modal.remove();
        renderHomeScreen(container);
      } catch {
        showFeedback('파일을 읽는 중 오류가 발생했습니다.', true);
      }
    });

    modal.querySelector('#btn-db-reset')?.addEventListener('click', async () => {
      const confirmed = window.confirm(
        '로컬 데이터베이스(선수, 코인, 경기/훈련 기록)를 모두 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.'
      );
      if (!confirmed) return;
      await gameStore.getState().resetSaveData();
      modal.remove();
      renderHomeScreen(container);
    });

    modal.querySelector('#close-db-modal')?.addEventListener('click', () => modal.remove());
  }
}
