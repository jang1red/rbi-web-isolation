"""
RBCloud 파비콘 + 터치아이콘 PNG 생성 스크립트
/var/www/ 의 n.eko 이미지 파일들을 RBCloud 브랜딩으로 교체합니다.
"""
import os, struct, zlib

OUT = "/var/www"

# ── 순수 Python으로 단색 PNG 생성 (Pillow 없이) ─────────────────────────
def make_png(w, h, pixels_rgba):
    """RGBA 픽셀 배열 → PNG 바이트"""
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    raw = b''
    for row in pixels_rgba:
        raw += b'\x00' + b''.join(struct.pack('4B', *p) for p in row)
    compressed = zlib.compress(raw, 9)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    # RGBA mode = color type 6
    ihdr = chunk(b'IHDR', struct.pack('>II', w, h) + bytes([8, 6, 0, 0, 0]))
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

def rbcloud_icon(size):
    """RBCloud 아이콘 픽셀 생성: 남색 배경 + 흰색 RB 텍스트 느낌"""
    # 남색 배경 (#1a2940), 'RB' 흰색 블록 표현
    BG   = (26, 41, 64, 255)   # #1a2940 (네이비)
    BLUE = (27, 77, 184, 255)  # #1B4DB8 (RBCloud 파란색)
    WHITE = (255, 255, 255, 255)

    pixels = [[BG] * size for _ in range(size)]
    m = size // 16  # 스케일 단위

    # 배경을 파란색 원형으로
    cx, cy, r = size//2, size//2, size//2 - 1
    for y in range(size):
        for x in range(size):
            if (x-cx)**2 + (y-cy)**2 <= r**2:
                pixels[y][x] = BLUE

    # 흰색 'R' 모양 (왼쪽)
    lx, ty = size//8, size//4
    bw, bh = size//4, size//2
    # R 세로 막대
    for y in range(ty, ty+bh):
        for x in range(lx, lx + max(2, m)):
            if 0 <= y < size and 0 <= x < size:
                pixels[y][x] = WHITE
    # R 상단 가로
    for x in range(lx, lx+bw):
        for y in range(ty, ty + max(2, m)):
            pixels[y][x] = WHITE
    # R 중간 가로
    mid = ty + bh//2
    for x in range(lx, lx+bw):
        for y in range(mid, mid + max(2, m)):
            pixels[y][x] = WHITE
    # R 다리
    for y in range(mid, ty+bh):
        rx = lx + bw - max(2, m) + (y - mid) * max(1, m//2) // max(1, bh//2 - 1) if bh > 2 else lx+bw
        for x in range(min(rx, size-1), min(rx + max(2, m), size)):
            pixels[y][x] = WHITE

    # 흰색 'B' 모양 (오른쪽)
    bx = lx + bw + max(2, m)
    for y in range(ty, ty+bh):
        for x in range(bx, bx + max(2, m)):
            if 0 <= y < size and 0 <= x < size:
                pixels[y][x] = WHITE
    for x in range(bx, bx + bw):
        for y in range(ty, ty + max(2, m)):
            if 0 <= y < size and 0 <= x < size:
                pixels[y][x] = WHITE
        for y in range(mid, mid + max(2, m)):
            if 0 <= y < size and 0 <= x < size:
                pixels[y][x] = WHITE
        for y in range(ty+bh - max(2, m), ty+bh):
            if 0 <= y < size and 0 <= x < size:
                pixels[y][x] = WHITE

    return pixels

# ── 파일 생성 ────────────────────────────────────────────────────────────
sizes = {
    "favicon-16x16.png":        16,
    "favicon-32x32.png":        32,
    "apple-touch-icon.png":     180,
    "android-chrome-192x192.png": 192,
    "android-chrome-512x512.png": 512,
    "mstile-144x144.png":       144,
    "mstile-150x150.png":       150,
    "mstile-70x70.png":         70,
    "mstile-310x310.png":       310,
}

for fname, sz in sizes.items():
    path = os.path.join(OUT, fname)
    pix = rbcloud_icon(sz)
    png = make_png(sz, sz, pix)
    with open(path, 'wb') as f:
        f.write(png)
    print(f"생성: {path} ({sz}x{sz})")

# mstile-310x150 (비정방형)
pix = rbcloud_icon(150)
png = make_png(310, 150, [row[:310] + [(26,41,64,255)]*(310-len(row[:310])) for row in pix])
with open(os.path.join(OUT, "mstile-310x150.png"), 'wb') as f:
    f.write(make_png(310, 150, [[( 26,41,64,255)]*310]*150))
print("생성: mstile-310x150.png")

print("\n[RBCloud] 파비콘 교체 완료")
