#!/usr/bin/env bash
# ============================================================
#  RBI 웹 격리 — Linux 서버 자동 배포 스크립트
#
#  사용법:
#    ./deploy.sh                # 서버 내부 IP 자동 감지 (같은 내부망 접속용)
#    ./deploy.sh 203.0.113.10   # 접속에 사용할 IP 직접 지정 (외부/공인 IP)
#
#  본인 PC에서 접속할 "서버 주소"와 NAT IP가 일치해야 화면이 뜹니다.
# ============================================================
set -e
cd "$(dirname "$0")"

# ── 1. 접속 IP 결정 ─────────────────────────────────────────
if [ -n "$1" ]; then
  SERVER_IP="$1"
else
  SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [ -z "$SERVER_IP" ]; then
  echo "❌ 서버 IP를 감지하지 못했습니다. ./deploy.sh <IP> 형태로 지정하세요."
  exit 1
fi
echo "▶ 접속/NAT IP : $SERVER_IP"
echo "  (본인 PC에서 http://$SERVER_IP:8080 으로 접속하게 됩니다)"

# ── 2. Docker 확인 ─────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker가 없습니다. 먼저 설치하세요:  curl -fsSL https://get.docker.com | sudo sh"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose 플러그인이 없습니다. Docker 최신 버전을 설치하세요."
  exit 1
fi

# ── 3. .env 생성/갱신 ──────────────────────────────────────
[ -f .env ] || cp .env.example .env
# NAT IP 를 접속 IP 로
sed -i "s|^RBCLOUD_WEBRTC_NAT1TO1=.*|RBCLOUD_WEBRTC_NAT1TO1=$SERVER_IP|" .env
# JWT 시크릿이 기본값이면 랜덤으로 교체
if grep -q "CHANGE_ME" .env; then
  SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env
  echo "▶ JWT_SECRET 랜덤 생성 완료"
fi
echo "▶ .env 설정 완료 (RBCLOUD_WEBRTC_NAT1TO1=$SERVER_IP)"

# ── 4. 빌드 + 기동 (프론트엔드는 Docker 빌드에 포함됨 — Node 불필요) ──
echo "▶ 컨테이너 빌드 및 기동... (프론트엔드 빌드 포함, 수 분 소요)"
docker compose up -d --build

# ── 6. 방화벽 (ufw 있을 때) ────────────────────────────────
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 8080/tcp           >/dev/null 2>&1 || true
  sudo ufw allow 52001:52050/udp    >/dev/null 2>&1 || true
  sudo ufw allow 52001:52050/tcp    >/dev/null 2>&1 || true
  echo "▶ 방화벽(ufw) 포트 개방: 8080/tcp, 52001-52050/udp·tcp"
fi

echo ""
echo "============================================================"
echo " ✅ 배포 완료"
echo "   접속 주소 : http://$SERVER_IP:8080"
echo "   기본 계정 : admin / changeme  (첫 로그인 후 비밀번호 변경)"
echo ""
echo "   ※ 본인 PC에서 위 주소로 접속하세요."
echo "   ※ 접속이 안 되면: 같은 내부망인지, 공유기/클라우드 방화벽에서"
echo "      8080/TCP 와 52001-52050/UDP·TCP 가 열렸는지 확인하세요."
echo "============================================================"
