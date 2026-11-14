#!/usr/bin/env python3
"""Generate the app icons as PNGs without any image library."""
import math, struct, zlib


def sd_circle(px, py, cx, cy, r):
    return math.hypot(px - cx, py - cy) - r


def sd_round_rect(px, py, cx, cy, hw, hh, r):
    dx = abs(px - cx) - (hw - r)
    dy = abs(py - cy) - (hh - r)
    return math.hypot(max(dx, 0.0), max(dy, 0.0)) + min(max(dx, dy), 0.0) - r


def sd_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = 0.0 if (vx * vx + vy * vy) == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
    return math.hypot(wx - t * vx, wy - t * vy)


def sd_polygon(px, py, pts):
    d = min(sd_segment(px, py, pts[i][0], pts[i][1], pts[(i + 1) % len(pts)][0], pts[(i + 1) % len(pts)][1])
            for i in range(len(pts)))
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return -d if inside else d


BODY = [(0.432, 0.360), (0.568, 0.360), (0.612, 0.500), (0.678, 0.648),
        (0.322, 0.648), (0.388, 0.500)]


def pawn_sdf(x, y):
    d = sd_circle(x, y, 0.5, 0.283, 0.104)
    d = min(d, sd_polygon(x, y, BODY))
    d = min(d, sd_round_rect(x, y, 0.5, 0.672, 0.212, 0.032, 0.026))
    d = min(d, sd_round_rect(x, y, 0.5, 0.729, 0.258, 0.033, 0.030))
    return d


def lerp(a, b, t):
    return a + (b - a) * t


def pixel(x, y, maskable=False):
    """Return RGBA tuple for unit coordinates (x, y)."""
    # Rounded tile
    radius = 0.235
    tile = sd_round_rect(x, y, 0.5, 0.5, 0.5, 0.5, radius)
    tile_alpha = max(0.0, min(1.0, 0.5 - tile / 0.008))

    scale = 0.72 if maskable else 1.0
    if maskable:
        # pawn art shrunk around the center for safe-zone cropping
        x = (x - 0.5) / scale + 0.5
        y = (y - 0.5) / scale + 0.5

    # background gradient
    t = max(0.0, min(1.0, y))
    r = lerp(30, 12, t)
    g = lerp(35, 14, t)
    b = lerp(48, 19, t)

    # warm glow behind the piece
    glow = max(0.0, 1.0 - math.hypot(x - 0.5, y - 0.46) / 0.62)
    glow = glow ** 2
    r += 34 * glow
    g += 22 * glow
    b += 4 * glow

    # soft checker pattern (very subtle)
    in_board = 0.0
    cx, cy = int(x * 8), int(y * 8)
    if 0 <= cx < 8 and 0 <= cy < 8 and (cx + cy) % 2 == 0:
        in_board = 1.0
    r += 9 * in_board
    g += 11 * in_board
    b += 14 * in_board

    # drop shadow
    d_shadow = pawn_sdf(x - 0.006, y - 0.020)
    if d_shadow < 0.02:
        k = max(0.0, 1.0 - max(d_shadow, 0.0) / 0.02)
        k = k * k * 0.55
        r *= (1 - k)
        g *= (1 - k)
        b *= (1 - k)

    # pawn body
    d = pawn_sdf(x, y)
    if d < 0.006:
        edge = max(0.0, min(1.0, (d + 0.006) / 0.012))
        # cream -> outline colour blend
        pr = lerp(210, 250, edge)
        pg = lerp(196, 244, edge)
        pb = lerp(172, 228, edge)
        r, g, b = pr, pg, pb

    return (int(max(0, min(255, r))), int(max(0, min(255, g))), int(max(0, min(255, b))),
            int(round(255 * tile_alpha)))


def write_png(path, size, maskable=False, samples=3):
    rows = []
    step = 1.0 / (size * samples)
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(samples):
                for sx in range(samples):
                    x = (px * samples + sx + 0.5) * step
                    y = (py * samples + sy + 0.5) * step
                    pr, pg, pb, pa = pixel(x, y, maskable)
                    acc[0] += pr * pa
                    acc[1] += pg * pa
                    acc[2] += pb * pa
                    acc[3] += pa
            n = samples * samples
            a = acc[3] / n
            if a > 0:
                row += bytes((int(acc[0] / acc[3]), int(acc[1] / acc[3]), int(acc[2] / acc[3]), int(round(a))))
            else:
                row += bytes((0, 0, 0, 0))
        rows.append(bytes(row))

    raw = b''.join(rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print('wrote', path, size)


if __name__ == '__main__':
    write_png('icon-192.png', 192, samples=3)
    write_png('icon-512.png', 512, samples=2)
    write_png('icon-maskable-512.png', 512, maskable=True, samples=2)
    write_png('apple-touch-icon.png', 180, samples=3)
