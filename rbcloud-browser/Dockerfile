# RBCloud Browser — 격리 브라우저 컨테이너 이미지
# - n.eko 웹 UI를 RBCloud 브랜딩으로 패치 (로고·타이틀·자동 로그인·색상)
# - 원격 디버깅 포트(CDP 9222) 활성화
# - Chromium Managed Policy 볼륨 마운트 지점 생성
FROM m1k1o/neko:chromium

# ── 브랜딩 자산 직접 배치 ────────────────────────────────────
# CSS/JS는 n.eko 웹 서버 정적 경로에 직접 COPY
COPY assets/rbcloud-override.css /var/www/css/rbcloud-override.css
COPY assets/rbcloud-init.js      /var/www/js/rbcloud-init.js
COPY assets/rbcloud-logo.svg     /tmp/rbcloud-logo.svg
COPY assets/patch-branding.sh    /tmp/patch-branding.sh

# 브랜딩 패치 실행 (index.html 타이틀·링크 주입, manifest·JS 텍스트 치환)
RUN chmod +x /tmp/patch-branding.sh && sh /tmp/patch-branding.sh

# ── 정책 디렉터리 ────────────────────────────────────────────
RUN mkdir -p /etc/chromium/policies/managed

# ── Chromium 플래그 ─────────────────────────────────────────
ENV NEKO_CHROMIUM_FLAGS="--remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --disable-session-crashed-bubble \
  --no-first-run \
  --disable-default-apps \
  --use-fake-ui-for-media-stream"
