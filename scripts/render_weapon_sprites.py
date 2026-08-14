#!/usr/bin/env python3
"""Rasterize KayKit OBJ weapons into transparent PNG icons."""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OBJ_DIR = ROOT / "frontend/public/KayKit_FantasyWeaponsBits_1/Assets/obj"
OUT_DIR = ROOT / "frontend/public/sprites/weapons"

SIZE = 128
SS = 2  # supersample
CANVAS = SIZE * SS

MODELS = [
    "arrow_A",
    "arrow_B",
    "axe_A",
    "axe_B",
    "axe_C",
    "bow_A_withString",
    "bow_B_withString",
    "dagger_A",
    "dagger_B",
    "fistweapon_A",
    "fistweapon_B",
    "hammer_A",
    "hammer_B",
    "hammer_C",
    "halberd",
    "shield_A",
    "shield_B",
    "shield_C",
    "spear_A",
    "staff_A",
    "staff_B",
    "sword_A",
    "sword_B",
    "sword_C",
    "sword_D",
    "sword_E",
    "wand_A",
]


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


# KayKit-style gradient cells (light -> dark). UVs land on this atlas.
PALETTE = [
    ("#f2efe8", "#b7b0a3"),
    ("#e8dcc8", "#8c6b3d"),
    ("#d7b07a", "#6b4423"),
    ("#c08a4a", "#5a3216"),
    ("#a0673b", "#4a2814"),
    ("#8b5a2b", "#3d1f10"),
    ("#6b4423", "#2a1408"),
    ("#4a3422", "#1a0e08"),
    ("#e8eef4", "#7b8794"),
    ("#cfd6de", "#4b5563"),
    ("#9aa3ad", "#2f3540"),
    ("#6b7280", "#1f242c"),
    ("#f4d37a", "#b8860b"),
    ("#e6c35c", "#8a6a14"),
    ("#d4a84b", "#6b4e18"),
    ("#b87333", "#6b3f12"),
    ("#cd7f32", "#7a4a16"),
    ("#f0c888", "#a0673b"),
    ("#e0b089", "#8b5a2b"),
    ("#c4a574", "#5c4030"),
    ("#8a7a55", "#3f3424"),
    ("#6e6a63", "#2c2a28"),
    ("#d8d3cc", "#6e6a63"),
    ("#f5f0e6", "#c4b8a0"),
    ("#f87171", "#7f1d1d"),
    ("#fb7185", "#9f1239"),
    ("#f59e0b", "#9a3412"),
    ("#84cc16", "#3f6212"),
    ("#4ade80", "#14532d"),
    ("#2dd4bf", "#115e59"),
    ("#38bdf8", "#1e3a5f"),
    ("#818cf8", "#312e81"),
    ("#c084fc", "#581c87"),
    ("#f0abfc", "#86198f"),
    ("#fda4af", "#9f1239"),
    ("#94a3b8", "#334155"),
]


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def build_atlas(size: int = 512) -> list[int]:
    pixels = [0] * (size * size * 4)
    cols, rows = 6, 6
    cell_w = size / cols
    cell_h = size / rows
    for gy in range(rows):
        for gx in range(cols):
            light, dark = (hex_rgb(c) for c in PALETTE[(gy * cols + gx) % len(PALETTE)])
            x0 = int(gx * cell_w)
            y0 = int(gy * cell_h)
            x1 = int((gx + 1) * cell_w)
            y1 = int((gy + 1) * cell_h)
            for y in range(y0, y1):
                ty = (y - y0) / max(1, y1 - y0 - 1)
                for x in range(x0, x1):
                    tx = (x - x0) / max(1, x1 - x0 - 1)
                    # Horizontal material ramp + slight vertical darkening.
                    t = min(1.0, max(0.0, tx * 0.75 + ty * 0.25))
                    i = (y * size + x) * 4
                    pixels[i] = int(lerp(light[0], dark[0], t))
                    pixels[i + 1] = int(lerp(light[1], dark[1], t))
                    pixels[i + 2] = int(lerp(light[2], dark[2], t))
                    pixels[i + 3] = 255
    return pixels


ATLAS = build_atlas()
ATLAS_SIZE = 512


def sample_atlas(u: float, v: float) -> tuple[float, float, float]:
    u = min(0.999, max(0.0, u))
    v = min(0.999, max(0.0, 1.0 - v))  # OBJ V is bottom-up
    x = u * (ATLAS_SIZE - 1)
    y = v * (ATLAS_SIZE - 1)
    x0, y0 = int(x), int(y)
    x1 = min(ATLAS_SIZE - 1, x0 + 1)
    y1 = min(ATLAS_SIZE - 1, y0 + 1)
    tx, ty = x - x0, y - y0

    def pix(px: int, py: int) -> tuple[float, float, float]:
        i = (py * ATLAS_SIZE + px) * 4
        return ATLAS[i] / 255.0, ATLAS[i + 1] / 255.0, ATLAS[i + 2] / 255.0

    c00, c10, c01, c11 = pix(x0, y0), pix(x1, y0), pix(x0, y1), pix(x1, y1)
    return tuple(
        lerp(lerp(c00[i], c10[i], tx), lerp(c01[i], c11[i], tx), ty) for i in range(3)
    )


def rot_x(p, a):
    c, s = math.cos(a), math.sin(a)
    x, y, z = p
    return (x, y * c - z * s, y * s + z * c)


def rot_y(p, a):
    c, s = math.cos(a), math.sin(a)
    x, y, z = p
    return (x * c + z * s, y, -x * s + z * c)


def parse_obj(path: Path):
    verts, uvs, norms, faces = [], [], [], []
    with path.open() as f:
        for line in f:
            if line.startswith("v "):
                _, x, y, z = line.split()[:4]
                verts.append((float(x), float(y), float(z)))
            elif line.startswith("vt "):
                parts = line.split()
                uvs.append((float(parts[1]), float(parts[2])))
            elif line.startswith("vn "):
                _, x, y, z = line.split()[:4]
                n = (float(x), float(y), float(z))
                length = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
                norms.append((n[0] / length, n[1] / length, n[2] / length))
            elif line.startswith("f "):
                corners = []
                for bit in line.split()[1:]:
                    vi, ti, ni = (bit.split("/") + ["", ""])[:3]
                    corners.append((int(vi) - 1, int(ti) - 1 if ti else 0, int(ni) - 1 if ni else 0))
                for i in range(1, len(corners) - 1):
                    faces.append((corners[0], corners[i], corners[i + 1]))
    return verts, uvs, norms, faces


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + rgba[y * width * 4 : (y + 1) * width * 4] for y in range(height))
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def downsample(src: list[int], src_size: int, dst_size: int) -> bytes:
    factor = src_size // dst_size
    out = bytearray(dst_size * dst_size * 4)
    for y in range(dst_size):
        for x in range(dst_size):
            r = g = b = a = 0
            count = 0
            for oy in range(factor):
                for ox in range(factor):
                    i = ((y * factor + oy) * src_size + (x * factor + ox)) * 4
                    aa = src[i + 3]
                    if aa == 0:
                        continue
                    r += src[i] * aa
                    g += src[i + 1] * aa
                    b += src[i + 2] * aa
                    a += aa
                    count += 1
            di = (y * dst_size + x) * 4
            if a:
                out[di] = min(255, r // a)
                out[di + 1] = min(255, g // a)
                out[di + 2] = min(255, b // a)
                out[di + 3] = min(255, a // (factor * factor))
    return bytes(out)


def render_model(name: str) -> None:
    verts, uvs, norms, faces = parse_obj(OBJ_DIR / f"{name}.obj")
    if not faces:
        raise SystemExit(f"No faces in {name}")

    transformed = [rot_x(rot_y(v, math.radians(-38)), math.radians(22)) for v in verts]
    xs, ys, zs = zip(*transformed)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    span = max(max_x - min_x, max_y - min_y, 1e-6)
    margin = CANVAS * 0.12
    scale = (CANVAS - 2 * margin) / span
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2

    def project(p):
        x = (p[0] - cx) * scale + CANVAS / 2
        y = CANVAS / 2 - (p[1] - cy) * scale
        z = p[2]
        return x, y, z

    screen = [project(p) for p in transformed]
    n_xf = [rot_x(rot_y(n, math.radians(-38)), math.radians(22)) for n in norms] if norms else []

    pixels = [0] * (CANVAS * CANVAS * 4)
    zbuf = [float("-inf")] * (CANVAS * CANVAS)
    light = (-0.35, 0.85, 0.4)
    llen = math.sqrt(sum(c * c for c in light))
    light = tuple(c / llen for c in light)

    for a, b, c in faces:
        p0, p1, p2 = screen[a[0]], screen[b[0]], screen[c[0]]
        minx = max(0, int(min(p0[0], p1[0], p2[0])))
        maxx = min(CANVAS - 1, int(max(p0[0], p1[0], p2[0])))
        miny = max(0, int(min(p0[1], p1[1], p2[1])))
        maxy = min(CANVAS - 1, int(max(p0[1], p1[1], p2[1])))
        area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
        if abs(area) < 1e-6:
            continue
        uv0 = uvs[a[1]] if uvs else (0.5, 0.5)
        uv1 = uvs[b[1]] if uvs else (0.5, 0.5)
        uv2 = uvs[c[1]] if uvs else (0.5, 0.5)
        n0 = n_xf[a[2]] if n_xf else (0, 0, 1)
        n1 = n_xf[b[2]] if n_xf else (0, 0, 1)
        n2 = n_xf[c[2]] if n_xf else (0, 0, 1)

        for y in range(miny, maxy + 1):
            for x in range(minx, maxx + 1):
                w0 = (p1[0] - p0[0]) * (y - p0[1]) - (p1[1] - p0[1]) * (x - p0[0])
                w1 = (p2[0] - p1[0]) * (y - p1[1]) - (p2[1] - p1[1]) * (x - p1[0])
                w2 = (p0[0] - p2[0]) * (y - p2[1]) - (p0[1] - p2[1]) * (x - p2[0])
                if area < 0:
                    w0, w1, w2, area_s = -w0, -w1, -w2, -area
                else:
                    area_s = area
                if w0 < 0 or w1 < 0 or w2 < 0:
                    continue
                b0, b1, b2 = w1 / area_s, w2 / area_s, w0 / area_s
                z = b0 * p0[2] + b1 * p1[2] + b2 * p2[2]
                idx = y * CANVAS + x
                if z < zbuf[idx]:
                    continue
                zbuf[idx] = z
                u = b0 * uv0[0] + b1 * uv1[0] + b2 * uv2[0]
                v = b0 * uv0[1] + b1 * uv1[1] + b2 * uv2[1]
                cr, cg, cb = sample_atlas(u, v)
                nx = b0 * n0[0] + b1 * n1[0] + b2 * n2[0]
                ny = b0 * n0[1] + b1 * n1[1] + b2 * n2[1]
                nz = b0 * n0[2] + b1 * n1[2] + b2 * n2[2]
                nlen = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
                ndot = max(0.0, (nx * light[0] + ny * light[1] + nz * light[2]) / nlen)
                shade = 0.42 + 0.58 * ndot
                pi = idx * 4
                pixels[pi] = min(255, int(cr * shade * 255))
                pixels[pi + 1] = min(255, int(cg * shade * 255))
                pixels[pi + 2] = min(255, int(cb * shade * 255))
                pixels[pi + 3] = 255

    png = downsample(pixels, CANVAS, SIZE)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / f"{name}.png"
    write_png(dest, SIZE, SIZE, png)
    print(f"wrote {dest.relative_to(ROOT)}")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in MODELS:
        render_model(name)


if __name__ == "__main__":
    main()
