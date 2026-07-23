# 샤로수길 샵앤링크 빙고투어 — 프로젝트 상태 문서

> 이 문서는 AI 어시스턴트(Claude)와의 작업 내역 복원용입니다.
> 대화 컨텍스트가 소실되어도 이 문서만으로 프로젝트 전체 구조와 규칙을 파악할 수 있도록 유지합니다.
> **코드 수정 시 이 문서도 함께 업데이트할 것.**

최종 업데이트: 2026-07-22

---

## 1. 인프라 / 배포

| 항목 | 값 |
|---|---|
| GitHub 리포 | `haildrop99-cyber/shopnlink-prototype` (main 브랜치, public) |
| 배포 | Cloudflare Pages 프로젝트 `shopnlink-prototype`, GitHub main 푸시 시 자동 배포 |
| Cloudflare 계정 ID | `3ef47cb0ee96d478c6e9311ed86e91a8` (haildrop99@gmail.com) |
| 서비스 URL | https://theglowsynrgy.org (커스텀 도메인, CNAME @ → shopnlink-prototype.pages.dev, Proxied) |
| 보조 URL | https://shopnlink-prototype.pages.dev |
| 관리자 페이지 | `/admin.html` — 접속 키는 Pages 환경변수 `ADMIN_KEY` (Secret). 코드 폴백값: `sharo-glow-7392` |
| D1 데이터베이스 | 이름 `shopnlink-db`, ID `f572cbe1-3f92-4a65-b21b-5f603db5650c`, APAC |
| Pages 바인딩 | D1: 변수명 `DB` → shopnlink-db / Secret: `ADMIN_KEY` |
| 참고 | 도메인의 이전 CNAME은 Railway(zi0w7ozq.up.railway.app) → 교체됨. `_railway-verify` TXT 레코드 잔존 |

배포 방법: 파일 수정 → GitHub main에 커밋(웹 업로드 가능) → 자동 배포 (~30초).
바인딩/환경변수 변경 시엔 Deployments에서 Retry deployment 필요.

## 2. 파일 구성 (리포 루트)

- `index.html` — 참여자용 모바일 웹 전체 (단일 파일: CSS+HTML+JS)
- `admin.html` — 관리자 대시보드 (로그인 → 통계/참여자/이용기록, CSV 다운로드, 수정/삭제)
- `_worker.js` — Cloudflare Pages Worker. `/api/*` 처리 + 나머지는 정적 서빙(env.ASSETS)
- `PROJECT_STATE.md` — 본 문서

## 3. 디자인 시스템

- 폰트: Pretendard (jsdelivr CDN)
- 컬러: 마젠타 `#A62C96` / 딥마젠타 `#7A1E6C` / 핑크 `#F6DFF3` / 연핑크 `#FBF1FA` / 배경 `#F7EFF6` / 잉크 `#241B22` / 그레이 `#8B7F89` / 라인 `#EBDDE9` / 클로버그린 `#3E8E4F` / 골드 `#F5B301` / 카카오 `#FEE500`
- 레이아웃: `#phone` max-width 420px 중앙 정렬, 반응형(clamp/svh/dvh, ≤390px 미디어쿼리)
- 원본 기획: PDF "2026 샤로수길 로컬브랜드 핵심점포 샵앤링크 사업 기획안" + PPT "샤로수길 샵가능_레이아웃_250722" (CustomX Studio)

## 4. 사용자 플로우 (index.html 화면 순서)

1. `#landing` 랜딩 — 히어로(샵앤링크 빙고투어, 2026.08.10–09.11, 샤로수길 전구역), **시크릿 배너 "🎁 한 줄만 완성해도 숨겨진 시크릿 경품 OPEN!"**, 게임소개 STEP1-3, 럭키드로우 상품(1등 iPad/2등 인스탁스 2명/3등 배민5만 5명/4등 커피 50명/완주굿즈 3구 키캡), CTA "샵앤링크 참여하기"
2. `#privacy` 개인정보 — 동의체크(필수)+이름/전화/주소, **주소 아래 안내: "경품은 주 1회 일괄 발송… 오입력 시 재발송 불가"**, `registerUser()` → API 등록 + localStorage 저장 → saveinfo로
3. `#saveinfo` 진행상황 저장 안내(신규) — "현재 기기에 자동 저장, 같은 기기·브라우저 재접속 시 이어하기" + 경고("기록 삭제/다른 기기 접속 시 불러오기 불가, 카톡 채널로 복구 요청") → course로
4. `#course` 코스 선택 — 큐레이션 3종(혼밥/퇴사/데이트). **자율선택(free)은 display:none 숨김** (1~2주 후 재오픈 예정, 코드 유지)
5. `#bingo` 빙고 — 3×3판(프레임형, 이모지 아이콘+흑백처리), 참여업체 13곳 리스트, 쿠폰 바텀시트(바코드), 진행상황 3박스, 응모권 배지

### 빙고/응모 규칙 (확정)
- **스탬프 = 매장 코드 인증 방식**: 쿠폰 화면에서 직원이 해당 매장의 6자리 코드(영문+숫자, 대소문자 무시) 입력 → `POST /api/redeem`으로 서버 검증 → 성공 시에만 쿠폰 발행+스탬프. 코드는 D1 `stores` 테이블에만 존재(클라이언트 미노출). 오입력 재시도 제한 없음
- 빙고 라인 8개(가로3+세로3+대각2), **한 줄 완성당 응모권 1장, 전체 최대 8장** (`pendingTickets=Math.min(newly, 8-tickets)`)
- **다량 응모권 연출**: 여러 줄 동시 완성 시 티켓 스택으로 표시("남은 응모권 N장" + 뒤에 겹친 카드), **한 장씩 응모하기 → "샤로록 접수" → 다음 티켓** 반복 (사행성/도파민 연출)
- 마지막 티켓 응모 후: 3→2→1 카운트다운("행운이 찾아가는 중…") → **시크릿 경품 도착(🎁 CLICK)** → "축하합니다! 완성한 빙고 한 줄이 실물 키캡으로 전환되었습니다! (주 1회 일괄 발송)"
- **시크릿 경품(실물 키캡)은 최초 빙고 완성 시 1회만 지급** — `keycapGiven` 플래그(localStorage 저장). 이후 줄 완성 시엔 응모권만 지급되고 카운트다운 후 종료
- 3×3 전체 완성: "빙고 완성!! 샤로수길 전문가 인정" 도장 연출 → 티켓 플로우
- 효과: 클리커 사운드(WebAudio 880Hz triangle), 이모지 컨페티

### 진행상황 저장 (localStorage + 서버 동기화)
- `snl_user` = {name, phone, address} / `snl_state` = {mode, board, stamped, doneLines, tickets, keycapGiven}
- `saveState()`가 localStorage 저장 + 800ms 디바운스로 `POST /api/state` 서버 저장(users.state 컬럼)
- 같은 기기 재접속: `restoreSession()` — 유저 있으면 폼 프리필, 상태 있으면 **바로 빙고판 복원**
- **다른 기기 이어하기**: 같은 전화번호로 재등록 → `/api/register` 응답의 state를 복원 → 저장안내 페이지의 시작 버튼(`afterSaveInfo()`)이 빙고판으로 직행
- 코스 재선택 보호: 진행 중(스탬프≥1) 상태에서 `startBingo()` 호출 시 confirm — 취소하면 이어하기

### 공통 UI
- 카톡 문의 플로팅 버튼(전 화면, 우하단 노란색): 현재 임시 URL `https://kakaobusiness.gitbook.io/main` → 실제 채널 URL 나오면 교체
- PROTOTYPE 태그(우상단) — 정식 오픈 시 제거

## 5. 참여 업체 13곳 (STORES 객체 키)

kiko 살롱드키코(1만원 이상 10% 할인·기획서 확정) / embro 엠브로돈가스 / chili 칠리향도삭면 / eunh 은행골 / yoon 에프터팜윤약국 / star 스타버스코인노래방 / wink 윙크렌즈스토어 / holly 할리스 / remem 서울리멤버치과 / barun 바른삼성정형외과 / theone 서울대입구더원내과 / mira 연세미라클의원 / junco 준코
※ 살롱드키코 외 혜택은 예시값 — 실제 혜택 확정 시 교체 필요.
큐레이션 코스 배치: `COURSES.solo/quit/date` (각 9개 키 배열)

## 6. 백엔드 (_worker.js + D1)

### DB 스키마
```sql
users  (phone TEXT PK, name, address, created_at, last_seen, state)  -- KST(+9h) 저장, state=게임진행 JSON
events (id INTEGER PK AI, phone, type, store, detail, created_at)
-- type: register | stamp | bingo_line | ticket | bingo_all | keycap
stores (key TEXT PK, name, cat, cond, coupon_name, emoji, image, code)
-- image: base64 dataURL(240px jpeg) 또는 '' / code: 6자리 인증코드(대문자)
```
전화번호가 유저 키 — 같은 번호 재등록 시 upsert(이름/주소 갱신), 기록 합산.
stores는 시드 완료(13곳, 초기 랜덤 코드). index.html의 STORES 객체는 폴백이며 로드 시 `/api/stores`로 덮어씀.

### API
- `GET /api/stores` — 업체 목록 공개(코드 제외: key,name,cat,cond,coupon_name,emoji,image)
- `POST /api/redeem` {phone, storeKey, code} — 코드 검증(대소문자 무시), 성공 시 stamp 이벤트 서버 기록('코드인증') 후 {ok:true}
- `POST /api/register` {name, phone, address} — 응답에 기존 state 포함(기기 간 이어하기)
- `POST /api/state` {phone, state} — 진행상황 서버 저장 (20KB 제한)
- `POST /api/event` {phone, type, store?, detail?} — redeem 성공 시 클라이언트는 stamp 이벤트 중복 전송 안 함(stamp(idx,true))
- 관리자(헤더 `x-admin-key` 필요):
  - `GET /api/admin/login` — 키 검증
  - `GET /api/admin/data` — users(스탬프/응모권/빙고줄 집계), events(최근 500), totals
  - `GET /api/admin/stores` — 코드 포함 업체 목록
  - `POST /api/admin/store/update` {key, name?, cond?, coupon_name?, image?, code?} — code는 6자리 강제
  - `POST /api/admin/user/update` {phone, name, address}
  - `POST /api/admin/user/delete` {phone} — 이용기록 포함 삭제

### admin.html 기능
로그인(세션 저장) / 통계 5종 / 참여자·이용기록·**업체 관리** 탭 / 이름·전화 검색 / 10초 자동 갱신 / CSV 다운로드(BOM 포함) / 참여자 수정(prompt)·삭제
업체 관리: 업체별 카드 — 발행 쿠폰명·조건 문구·인증 코드(🎲 랜덤생성)·이미지 업로드(캔버스 240px 리사이즈→base64) 저장 → 참여자 웹 즉시 반영

## 7. 운영 결정사항 기록

- 문자 발송: 시스템 구축 안 함 — 운영측이 관리자 DB(CSV)로 직접 발송
- 용량: Cloudflare 무료 플랜 (Workers 요청 10만/일, D1 쓰기 10만/일) — 부족 시 $5 플랜
- 응모권 규칙: "1줄=1장, 최대 8장" 유지 (클라이언트의 "2줄=2장"은 누적 표현이었음)
- 빙고판: 1안(큐레이션)만 우선 오픈

## 8. 미결/대기 항목

- [ ] 카카오톡 실제 채널 URL 교체 (`index.html`의 `#kakao-btn` href)
- [ ] 업체별 실제 혜택 정보 확정 → STORES 교체
- [ ] 디자이너 에셋 반영 (아이콘 13종·키비주얼·티켓·도장 등 — 디자인 가이드 문서 별도 전달됨. UI는 기기별 틀어짐 없게 반응형 우선)
- [ ] 자율선택(2안) 재오픈 (course 화면 display:none 해제)
- [ ] ADMIN_KEY 변경 권장 (대화에 노출됨: 현재 값 앞글자 Sharo…)
- [ ] 정식 오픈 시 PROTOTYPE 태그 제거
