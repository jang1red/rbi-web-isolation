# RBI 서버 배포 가이드 (Linux 서버 + 원격 접속)

서버를 **Linux 컴퓨터**에 두고, **본인 PC(Windows 등)에서 브라우저로 접속**하는 구성입니다.

```
[Linux 서버]  RBI 시스템 (Docker)  ──┐
                                     │  http://서버IP:8080
[본인 PC]     브라우저로 접속  ◀──────┘
```

> **가장 중요:** 본인 PC에서 접속할 **서버 주소**와 `.env`의 `RBCLOUD_WEBRTC_NAT1TO1`(WebRTC NAT IP)이 **반드시 일치**해야 화면(WebRTC)이 뜹니다. `deploy.sh`가 이를 자동으로 맞춰줍니다.

---

## 1단계 · Linux 서버 준비

- **Ubuntu 22.04 / 24.04 LTS** 권장 (가장 무난)
- 최소 사양: CPU 4코어 / RAM 8GB 이상 (동시 사용자 수에 따라 증가)
- 본인 PC와 **같은 네트워크(사무실/집 내부망)** 에 두면 설정이 가장 간단합니다.

## 2단계 · Docker 설치 (서버에서)

```bash
# Docker + compose 플러그인 한 번에 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # sudo 없이 docker 쓰기 (재로그인 필요)
newgrp docker                     # 또는 로그아웃 후 재접속
docker version                    # 설치 확인
```

## 3단계 · 코드 받기 (서버에서)

```bash
git clone https://github.com/jang1red/rbi-web-isolation
cd rbi-web-isolation
```

## 4단계 · 자동 배포

```bash
chmod +x deploy.sh

# (A) 본인 PC와 같은 내부망인 경우 — 서버 내부 IP 자동 감지
./deploy.sh

# (B) 외부/클라우드 서버라 공인 IP로 접속하는 경우 — IP 직접 지정
./deploy.sh 203.0.113.10
```

스크립트가 자동으로:
1. 접속 IP를 감지/설정 → `.env`의 `RBCLOUD_WEBRTC_NAT1TO1`
2. `JWT_SECRET` 랜덤 생성
3. 프론트엔드 빌드
4. `docker compose up -d --build`
5. 방화벽(ufw) 포트 개방

완료되면 접속 주소가 출력됩니다.

## 5단계 · 본인 PC에서 접속

브라우저에서:
```
http://서버IP:8080
```
- 기본 계정: **admin / changeme** (첫 로그인 후 변경)

---

## 네트워크별 설정 요약

| 상황 | 접속 주소 | `deploy.sh` 실행 | 추가 작업 |
|---|---|---|---|
| **같은 내부망** (서버·PC 둘 다 사무실/집) | `http://<서버 내부IP>:8080` | `./deploy.sh` | 없음 |
| **외부망/다른 건물** | `http://<공인IP>:8080` | `./deploy.sh <공인IP>` | 공유기 포트포워딩 (아래) |
| **클라우드 서버** (AWS/GCP 등) | `http://<공인IP>:8080` | `./deploy.sh <공인IP>` | 보안그룹 인바운드 오픈 (아래) |

### 외부 접속 시 열어야 할 포트
| 포트 | 프로토콜 | 용도 |
|---|---|---|
| 8080 | TCP | 웹 접속 (게이트웨이) |
| 52001–52050 | UDP + TCP | WebRTC 화면 스트림 (세션별) |

- **공유기:** 포트포워딩에서 위 포트를 서버 내부 IP로 전달
- **클라우드:** 보안그룹/방화벽 인바운드 규칙에 위 포트 추가

---

## 운영 명령어

```bash
docker compose ps                 # 상태 확인
docker compose logs -f gateway    # 게이트웨이 로그
docker compose restart            # 재시작
docker compose down               # 중지
docker compose up -d --build      # 코드 갱신 후 재배포

# 접속 IP가 바뀌면 .env 의 RBCLOUD_WEBRTC_NAT1TO1 수정 후
docker compose up -d --force-recreate
```

## 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 로그인 화면은 뜨는데 **화면이 무한 로딩** | NAT IP ≠ 접속 IP | `.env`의 `RBCLOUD_WEBRTC_NAT1TO1`을 **실제 접속하는 IP**로 맞춤 → `docker compose up -d --force-recreate` |
| 웹페이지 자체가 안 열림 | 8080 차단 | 방화벽/보안그룹/포트포워딩에서 8080/TCP 개방 |
| 화면만 안 나오고 끊김 | 52001–52050 차단 | UDP·TCP 포트 범위 개방 |

> Linux 서버는 Windows Docker Desktop과 달리 UDP 포트 매핑 이슈가 없어 WebRTC 연결이 더 안정적입니다.
