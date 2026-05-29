# RBCloud Browser — 격리 브라우저 컨테이너 이미지
# - 원격 디버깅 포트(CDP 9222) 활성화 → 게이트웨이가 URL 네비게이션·다운로드 이벤트 수신
# - Chromium Managed Policy 볼륨 마운트 지점 생성
# - 불필요한 UI 요소(주소창·북마크바) 숨김
FROM m1k1o/neko:chromium

# 관리 정책 디렉터리 생성 (docker-compose 에서 게이트웨이 data/policies 볼륨과 공유)
RUN mkdir -p /etc/chromium/policies/managed

# CDP, 자동화 플래그, 정책 활성화를 주입.
ENV NEKO_CHROMIUM_FLAGS="--remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
  --disable-session-crashed-bubble \
  --no-first-run \
  --disable-default-apps \
  --use-fake-ui-for-media-stream"
