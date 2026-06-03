#!/bin/sh
# RBCloud 브랜딩 패치 — n.eko 웹 자산을 RBCloud로 교체
set -e
WEB=/var/www

echo "[RBCloud] 브랜딩 패치 시작..."

# 1) index.html — 타이틀 변경
sed -i 's|<title>n\.eko</title>|<title>RBCloud Browser</title>|g' "$WEB/index.html"

# 2) index.html — n.eko 홍보 문구 제거
sed -i 's|<p>A self hosted virtual browser.*</p>||g' "$WEB/index.html"

# 3) index.html — </head> 앞에 RBCloud CSS + JS 삽입 (★ 상대경로: iframe이 /rbcloud/ 하위라
#    절대경로 /css/ 는 게이트웨이 SPA로 빠져 MIME 에러 발생. 상대경로 css/ 로 /rbcloud/css/ 매핑)
sed -i 's|</head>|<link rel="stylesheet" href="css/rbcloud-override.css"><script defer src="js/rbcloud-init.js"></script></head>|g' "$WEB/index.html"

# 4) site.webmanifest — 이름/색상 변경
sed -i 's|"name": "n\.eko"|"name": "RBCloud Browser"|g'     "$WEB/site.webmanifest"
sed -i 's|"short_name": "n\.eko"|"short_name": "RBCloud"|g' "$WEB/site.webmanifest"
sed -i 's|"#19bd9c"|"#1a2940"|g'                            "$WEB/site.webmanifest"

# 5) JS 파일 내 노출 텍스트 치환
for f in "$WEB"/js/*.js; do
  sed -i 's/n\.eko/RBCloud Browser/g' "$f" 2>/dev/null || true
done

# ── neko member provider 를 noauth 로 강제 (로그인 화면 완전 제거) ──
# neko.yaml 에 provider:"multiuser" 가 하드코딩되어 환경변수를 무시하므로 파일을 직접 수정.
if [ -f /etc/neko/neko.yaml ]; then
  sed -i 's/provider: *"multiuser"/provider: "noauth"/g' /etc/neko/neko.yaml
  echo "[RBCloud] neko.yaml -> noauth provider 적용"
fi

# (CSS/JS 파일은 Dockerfile에서 직접 COPY됨)
echo "[RBCloud] 브랜딩 패치 완료"
