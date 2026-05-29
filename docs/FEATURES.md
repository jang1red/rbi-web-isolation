# 기능 매핑 — Spector RBI 소개서 ↔ 본 MVP

## 구현 완료

| Spector 소개서 기능 | 구현 파일 | 상태 |
|---|---|---|
| Remote Browser 격리 실행 (컨테이너, 흔적 폐기) | `rbcloud-browser/`, `gateway/src/rbcloud.js wipeSession()` | ✅ |
| WebRTC 화면 스트리밍 | RBCloud Browser 기본 기능 (iframe embed) | ✅ |
| 세션 종료 시 흔적 폐기 (쿠키·캐시 클리어) | `POST /api/session/wipe` → CDP clearBrowserCookies/Cache | ✅ |
| 인포바 (격리 전용 주소창) | `frontend/src/components/Infobar.jsx` + `POST /api/session/navigate` | ✅ |
| 워터마크 (내부 유출 방지) | `frontend/src/components/Watermark.jsx` (사용자명·일시 토큰) | ✅ |
| 계정 시스템 / 사용자 인증 | `gateway/src/auth.js`, `routes/auth.routes.js` | ✅ |
| MFA (TOTP) | `otplib` 기반, `/api/auth/mfa/enroll+confirm` | ✅ |
| Zero-Trust 조건부 접근 (시간·네트워크) | `evaluateConditions()` in `auth.js` | ✅ |
| URL 허용/차단 정책 | `gateway/src/policy.js evaluateUrl()` | ✅ |
| 유해사이트 카테고리 | URL 정책 `category` 필드, 기본 시드 포함 | ✅ |
| Chromium Managed Policy 생성 (URLBlocklist 등) | `regenerateManagedPolicy()` → `policy.json` | ✅ |
| 파일 다운로드/업로드 통제 | `evaluateFile()`, 파일정책 API | ✅ |
| 클립보드 통제 (PC↔격리) | `DefaultClipboardSetting` 정책 + 프론트 이벤트 감사 | ✅ |
| 감사 로그 (상세 로그) | `gateway/src/audit.js`, `GET /api/admin/audit` | ✅ |
| 관리자 콘솔 (사용자·정책·설정·로그) | `frontend/src/pages/Admin.jsx` | ✅ |
| Docker/K8s 이식 | `docker-compose.yml`, `k8s/` | ✅ |
| 온프레미스 + 클라우드 혼합 | Compose(온프레미스) + K8s YAML(클라우드) | ✅ |

## 연동 지점 (Hook) — 운영 시 연결 필요

| 기능 | 연동 지점 | 상세 |
|---|---|---|
| **CDR 무해화 엔진** | `gateway/src/cdr.js` `CDR_ENGINE_URL` | 외부 REST CDR 서비스 URL 설정 시 자동 연동 |
| **AI 피싱/사이버스쿼팅 탐지** | `gateway/src/rbcloud.js` `Network.requestWillBeSent` hook | URL 요청 시 ML 모델 호출 지점 준비됨 |
| **바이러스/랜섬웨어 검사** | `cdr.js` CDR 엔진 호출 후 처리 | 백신 엔진 REST API 연동 |
| **화상회의 (Google Meet · MS Teams)** | RBCloud Browser WebRTC passthrough | RBCloud Browser 컨테이너에서 직접 실행 가능 |
| **온라인 증명서 발급/PDF 인쇄** | Chromium 관리정책 `AlwaysOpenPdfExternally: false` | 인포바 인쇄 버튼 UI 추가 필요 |
| **세션별 독립 컨테이너 (확장)** | `k8s/rbcloud-deployment.yaml` + 세션 오케스트레이터 | 사용자당 Pod 1개로 완전 격리 |
| **SIEM 연동** | `audit.js` — webhook / Kafka / syslog 전송 훅 | 감사 로그 외부 전송 |

## 소개서 성능 비교 (목표치)

| 지표 | Spector 소개서 | 본 MVP (RBCloud 기반) |
|---|---|---|
| 전체화면 반응시간 | 170~220ms | RBCloud Browser WebRTC 기준 ~150ms (LAN) |
| 서버당 동접 세션 | 750세션 (1GB LAN) | RBCloud Browser ~100세션 (추가 최적화 필요) |
| 스크립트 다운로드 여부 | 없음 (완전 격리) | ✅ CDP 레벨 격리 |
| 흔적 폐기 | 세션 종료 시 | ✅ wipeSession() |

> 대규모 동접(500+)이 필요하면 세션당 컨테이너 오케스트레이션 + 리소스 제한 튜닝이 필요합니다.
