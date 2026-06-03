# 자체 테스트 결과 (2026-06-03)

## 실행 환경
- Docker Desktop (Windows, WSL2 백엔드)
- `docker compose up -d --build` 로 전체 스택 기동
- 접속: `http://localhost:8080` (내부망 `http://172.16.102.151:8080`)
- 기본 계정: **admin / changeme** (비밀번호 변경 강제 제거됨 — 계속 사용 가능)

## 자동 검증 결과 (5/5 통과)

| # | 항목 | 결과 |
|---|---|---|
| 1 | 우리 앱 로그인 (admin/changeme) | ✅ `{"ok":true}` |
| 2 | 세션 컨테이너 noauth 적용 | ✅ neko.yaml `provider: "noauth"` |
| 3 | neko 익명 로그인 (인증 없이) | ✅ `/api/login` 빈 body → `200` |
| 4 | RBCloud 로고 (흰색 CLOUD) | ✅ `logo.800bec71.svg` 교체 확인 |
| 5 | WebRTC NAT 다중 IP | ✅ `127.0.0.1,172.16.102.151,61.105.6.100` |

## 해결한 핵심 문제들

### 1. 세션 격리 (사용자별 독립 컨테이너)
- 로그인 시 사용자 전용 neko 컨테이너 동적 생성 (`rbi-session-<id>`)
- 로그아웃 시 컨테이너 삭제 → 흔적 완전 폐기
- 검증: 4명 동시 로그인 → 각각 다른 컨테이너/UDP 포트(52001~52004)

### 2. WebRTC 무한 로딩
- **원인:** NAT IP가 공인 IP 하나만 설정 → localhost/내부망 브라우저가 화면 스트림 못 받음
- **해결:** NAT IP 3개(localhost+내부망+공인) 동시 지정 → 접속 위치별 자동 선택

### 3. neko 로그인 화면(고양이) 노출
- **원인:** `/etc/neko/neko.yaml` 에 `provider: "multiuser"` 하드코딩 → 환경변수 무시하고 로그인 강제
- **해결:** 빌드 시 neko.yaml 을 `noauth` 로 직접 수정 + NEKO_PASSWORD(v2 설정) 제거
- **효과:** neko 자체 인증 제거 (게이트웨이 JWT + 컨테이너 격리로 이미 보호)

### 4. 비밀번호 반복 변경 혼란
- **원인:** 로그인 시 비밀번호 변경 화면 강제 → 변경하면 changeme 무효화
- **해결:** 변경 강제 제거 (변경은 관리자 콘솔에서 선택적으로)

### 5. 브라우저 캐시로 로고 안 바뀜
- **해결:** 프록시/정적 응답에 `Cache-Control: no-store` (격리 리소스 비캐시 = RBI 철학에도 부합)

## 브라우저 최종 확인 (사용자 확인 필요)

> 자동 검증(API 레벨)은 모두 통과. 브라우저 UI 최종 확인만 남음:

1. **시크릿 창** (`Ctrl+Shift+N`)으로 캐시 배제 후 `http://localhost:8080`
2. **admin / changeme** 로그인
3. 기대 동작:
   - 비밀번호 변경 화면 ❌
   - neko 고양이 로그인 화면 ❌ (또는 0.5초 내 자동 통과)
   - 격리 브라우저 화면 + RBCloud 로고 ✅

## 알려진 미세 조정 항목 (선택)
- neko 헤더 좌상단의 "n.eko" 텍스트: noauth로 로그인 화면은 제거됨. 연결 후 헤더 텍스트가
  남으면 `rbcloud-browser/assets/rbcloud-override.css` 의 헤더 선택자를 실제 DOM에 맞게 조정.
  (헤드리스 DOM 덤프가 컨테이너에서 불안정해 실제 브라우저 DevTools로 클래스명 확인 권장)

## 운영 배포 시 체크리스트
- `.env` 의 `JWT_SECRET` 랜덤 값으로 교체
- `RBCLOUD_WEBRTC_NAT1TO1` 을 실제 서버 IP 로 (외부망은 공유기 포트포워딩: 8080/TCP, 52001-52050/UDP)
- `COOKIE_SECURE=true` (HTTPS 운영 시)
- 외부 CDR 엔진 연결 (`CDR_ENGINE_URL`)
