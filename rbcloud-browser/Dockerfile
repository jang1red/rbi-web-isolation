# RBCloud Browser — 격리 브라우저 컨테이너 이미지
# - n.eko 웹 UI를 RBCloud 브랜딩으로 완전 교체 (로고·파비콘·타이틀·색상·자동 로그인)
# - 원격 디버깅 포트(CDP 9222) 활성화
# - Chromium Managed Policy 볼륨 마운트 지점 생성
FROM m1k1o/neko:chromium

# ── 브랜딩 자산 직접 배치 ────────────────────────────────────
COPY assets/rbcloud-override.css  /var/www/css/rbcloud-override.css
COPY assets/rbcloud-init.js       /var/www/js/rbcloud-init.js
# 메인 로고 SVG (로그인 화면 고양이 → RBCloud 로고 교체)
COPY assets/rbcloud-logo-main.svg /var/www/img/logo.800bec71.svg
# 파비콘 생성 스크립트 (순수 Python, Pillow 불필요)
COPY assets/gen-favicons.py       /tmp/gen-favicons.py
COPY assets/patch-branding.sh     /tmp/patch-branding.sh

# 파비콘 PNG 파일 생성 (n.eko 고양이 파비콘 → RBCloud 브랜드 아이콘)
RUN python3 /tmp/gen-favicons.py

# 브랜딩 패치 실행 (index.html 타이틀·링크 주입, manifest·JS 텍스트 치환)
# Windows(CRLF)에서 clone 되어도 깨지지 않도록 스크립트의 캐리지리턴(\r) 제거 후 실행
RUN sed -i 's/\r$//' /tmp/patch-branding.sh /tmp/gen-favicons.py 2>/dev/null; \
    chmod +x /tmp/patch-branding.sh && sh /tmp/patch-branding.sh

# ── 정책 디렉터리 ────────────────────────────────────────────
RUN mkdir -p /etc/chromium/policies/managed

# ── Chromium 플래그 ─────────────────────────────────────────
ENV NEKO_CHROMIUM_FLAGS="--remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --disable-session-crashed-bubble \
  --no-first-run \
  --disable-default-apps \
  --use-fake-ui-for-media-stream"
