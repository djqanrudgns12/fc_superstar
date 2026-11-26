# ⚽ FC Superstar (v1.0.0)

**FC Superstar**는 '피파 온라인'의 재미(나만의 드림팀 구성, 이적시장 영입, 훈련장 육성, 실시간 경기 조작)를 싱글플레이어로 즐길 수 있는 웹/데스크톱 축구 게임입니다.

---

## 🌟 주요 특징 및 구현 내역

### 1. 경기 조작 및 시스템
- **2.5D 아이소메트릭 축구 경기장**: 월드컵 결승전 분위기의 대형 피치, 잔디 스트라이프, 관중석, 빈 LED 광고판 슬롯 구현.
- **카메라 공 자동 추적**: 부드러운 Lerp 알고리즘으로 볼의 움직임을 실시간 추적.
- **전 선수 직접 조작**: `Q` 키로 가장 가까운 선수로 즉시 전환.
- **정교한 인게임 액션**:
  - `W / A / S / D` 또는 `방향키`: 선수 이동
  - `J`: 패스 (가장 가까운 아군에게 정확히 패스)
  - `K`: 슈팅 (슈팅 스탯에 비례한 강도와 정확도로 상대 골대 조준)
  - `L`: 슬라이딩 태클 (돌진 태클, 파울 리스크 존재)
  - `Shift`: 스탠딩 태클 (가까운 상대의 공 가로채기)
  - `Space` (홀드): 정밀 드리블 (속도를 낮추고 볼 컨트롤 강화)
  - `Esc`: 일시정지 메뉴
- **심판 및 득점 시스템**: 공이 골라인 평면을 넘으면 정확히 득점 판정 및 킥오프 재개, 스로인/골킥 판정 지원.
- **3단계 AI 상대팀 (Easy / Normal / Hard)**: 난이도별 반응 속도, 패스/슛 성공률, 전방 압박 차등 적용.
- **항복(기권) 시스템**: 5점 차 이상 열세 시 화면에 항복 확인 모달 표시 (수락 시 즉시 패배 처리).

### 2. 구단 경영 & 경제 시스템 (CRUD & 밸런스)
- **선수 등급제 (1~5등급)**: 실존 유명 축구 선수(손흥민, 김민재, 메시, 호날두, 벨링엄, 살라 등) 데이터베이스 구축.
- **초기 스쿼드 11명 지급**: 2등급 2명 + 3등급 3명 + 4/5등급 무작위 6명 자동 구성.
- **이적시장(상점)**: 등급별 코인 가격 차등 및 영입 시스템.
- **선수 획득도 & 비매품(히든) 시스템**:
  - 경기 승리 시 `선수 획득도 +1` 적립.
  - 획득도 10개로 원하는 일반 선수 또는 상점 비매품 선수 1명 교환 가능.
  - 밸런스 패널티 규칙: 1~2등급 교환 시 `선수 획득도 10개 + 1,000 코인` 소모.
- **훈련장 시스템 (텅 빈 운동장 콘 드리블)**:
  - 20초 안에 10개의 콘을 통과하는 직접 조작 훈련 미니게임.
  - 훈련 결과에 따라 `힘(Strength)` 또는 `심폐력(Stamina)` 스탯 상승 (+1 ~ +2, 상한선 85).

### 3. Quiet Luxury 디자인 시스템
- Core 5-Token Palette (`#F5F0E8`, `#FFFCF7`, `#1B1A18`, `#403D38`, `#B89B68`)
- Pretendard 타이포그래피 + `tabular-nums` 숫자 정렬
- 에디토리얼 매거진 레이아웃 및 12px 라운딩

### 4. GitHub Pages 호스팅 & 3-Tier 로컬 DB / 캐싱 아키텍처
- **GitHub Pages 자동 배포**: `.github/workflows/deploy-pages.yml`을 통해 `main` 브랜치 푸시 시 자동 빌드·배포 (`public/.nojekyll`, `public/404.html`, 상대 경로 `base: './'`).
- **3-Tier 로컬 데이터베이스**:
  - **L1 MemoryCache**: O(1) 메모리 핫 캐시 및 변경 시 원자적 무효화
  - **L2 IndexedDB (`fc_superstar_local_db`)**: 정규화 스토어(`meta`, `team`, `players`, `shop`, `matches`, `trainings`) 기반 대용량 영구 저장 + 250ms 배치 쓰기 & 탭 종료 시 flush
  - **L3 localStorage (`fc_superstar_snapshot_v1`)**: 동기 즉시 부팅 스냅샷(최근 30건 상한), FNV-1a 무결성 체크섬, 기존 `soccer_manager_save` 무손실 자동 마이그레이션
  - **L4 Service Worker (`public/sw.js`)**: HTML Network-First + Vite 해시 번들(`phaser` 청크 분리) Cache-First
- **데이터 백업/복원 UI**: 홈 화면 우측 상단 `DB` 버튼에서 상태 확인, `.json` 내보내기/불러오기, 초기화 지원.
- 상세 원칙 문서: [docs/LOCAL_DB_AND_HOSTING_POLICY.md](./docs/LOCAL_DB_AND_HOSTING_POLICY.md)

---

## 🚀 실행 방법

### 웹 개발 서버 실행
```bash
npm install
npm run dev
```
브라우저에서 `http://localhost:5173/` 접속

### 프로덕션 빌드 (GitHub Pages 배포용)
```bash
npm run build
```
`dist/` 폴더의 결과물이 GitHub Actions(`.github/workflows/deploy-pages.yml`)를 통해 GitHub Pages에 자동 배포됩니다.

### Windows 데스크톱 앱 (.exe) 빌드
Tauri v2 설정이 `src-tauri/`에 포함되어 있습니다.
```bash
cargo install tauri-cli --version "^2.0.0"
npm run tauri build
```
`src-tauri/target/release/`에 `.exe` 실행 파일이 생성됩니다.
