"""
라테일 어드벤처 지도 이미지 → 칸 데이터 자동 추출

파이프라인
  1. 흰색 테두리 마스크 생성
  2. 가로 밴드(타일 행) 검출 — 폭이 넓은 수평 흰선 쌍
  3. 밴드별 격자(피치·위상) 적합 + 좌우 범위 검출 → 가로 타일 목록
  4. 밴드 사이 간격의 세로 연결 타일 검출
  5. 인접 그래프 구성 → 단일 사슬 추적으로 칸 번호 확정
  6. 타일별 스프라이트 분류(?카드 / 파이프 / NEXT 등)

검증식: IN칸번호 + 표기된 N == OUT칸번호
"""

import sys
import json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


# ─────────────────────────── 기본 유틸 ───────────────────────────

def load(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.int16)
    return im


def white_mask(im):
    """관대한 흰색 마스크 — 범위/구분선 검출용."""
    mx = im.max(2)
    mn = im.min(2)
    return (mn > 195) & ((mx - mn) < 45)


def white_strict(im):
    """엄격한 흰색 마스크 — 밴드 경계선 검출용(배경 노이즈 억제)."""
    mx = im.max(2)
    mn = im.min(2)
    return (mn > 215) & ((mx - mn) < 30)


def close1d(a, k):
    return ndi.binary_erosion(ndi.binary_dilation(a, np.ones(k)), np.ones(k))


def runs_of(mask1d, min_len=1, join=0):
    """True 구간을 (start, end) 리스트로. join 이하 간격은 이어붙임."""
    xs = np.where(mask1d)[0]
    if len(xs) == 0:
        return []
    out = [[xs[0], xs[0]]]
    for x in xs[1:]:
        if x - out[-1][1] <= join + 1:
            out[-1][1] = x
        else:
            out.append([x, x])
    return [(int(a), int(b)) for a, b in out if b - a + 1 >= min_len]


def content_box(im):
    """상하 레터박스(검은 띠)와 좌우 여백 제거용 유효 y 범위."""
    dark = im.max(2) < 30
    rowdark = dark.mean(1)
    h = im.shape[0]
    y0 = 0
    while y0 < h and rowdark[y0] > 0.9:
        y0 += 1
    y1 = h - 1
    while y1 > y0 and rowdark[y1] > 0.9:
        y1 -= 1
    return y0, y1 + 1


# ─────────────────────── 1) 가로 밴드 검출 ───────────────────────

def find_bands(white, y0, y1, min_h=70, max_h=105):
    prof = white[y0:y1].mean(1)
    lines = runs_of(prof > 0.20, join=2)
    ys = [ (a + b) / 2 + y0 for a, b in lines ]

    bands = []
    i = 0
    while i < len(ys) - 1:
        h = ys[i + 1] - ys[i]
        if min_h <= h <= max_h:
            bands.append((int(round(ys[i])), int(round(ys[i + 1]))))
            i += 2          # 이 두 선은 한 밴드의 위/아래
        else:
            i += 1
    return bands


# ─────────────────── 2) 밴드별 격자 + 범위 ───────────────────

def band_separators(white, top, bot):
    """밴드 하단 깨끗한 영역에서 세로 구분선 후보 x 좌표."""
    h = bot - top
    a = top + int(h * 0.55)
    b = top + int(h * 0.97)
    cp = white[a:b].mean(0)
    cands = []
    for s, e in runs_of(cp > 0.5, join=4):
        cands.append((s + e) / 2)
    return cands


def fit_lattice(cands, pitch_range=(100, 126)):
    """후보 x들을 가장 잘 설명하는 (pitch, phase)를 격자 적합."""
    if len(cands) < 2:
        return None
    best = None
    for p10 in range(pitch_range[0] * 2, pitch_range[1] * 2 + 1):
        p = p10 / 2.0
        for ph10 in range(0, int(p * 2)):
            ph = ph10 / 2.0
            score = 0.0
            for c in cands:
                d = abs(((c - ph) % p))
                d = min(d, p - d)
                if d < 5:
                    score += (5 - d) / 5.0
            if best is None or score > best[0]:
                best = (score, p, ph)
    return best[1], best[2], best[0]


def band_extent(white, top, bot, k=110):
    tl = close1d(white[max(0, top - 4):top + 7].any(0), k)
    bl = close1d(white[max(0, bot - 6):bot + 5].any(0), k)
    return runs_of(tl & bl, min_len=60, join=8)


def band_tiles(white, top, bot, band_idx=None):
    cands = band_separators(white, top, bot)
    fit = fit_lattice(cands)
    if fit is None:
        return [], None
    pitch, phase, _ = fit
    spans = band_extent(white, top, bot)
    tiles = []
    W = white.shape[1]
    kmin = int(-phase // pitch) - 1
    kmax = int((W - phase) // pitch) + 1
    for k in range(kmin, kmax + 1):
        x0 = phase + k * pitch
        cx = x0 + pitch / 2
        if not (0 <= cx < W):
            continue
        # 격자 칸 중심이 어떤 범위 안에 들어오면 타일로 인정
        for s, e in spans:
            if s - pitch * 0.22 <= cx <= e + pitch * 0.22:
                tiles.append({'cx': cx, 'cy': (top + bot) / 2,
                              'x0': x0, 'x1': x0 + pitch,
                              'y0': top, 'y1': bot, 'pitch': pitch,
                              'band': band_idx})
                break
    return tiles, pitch


# ────────────────── 3) 세로 연결 타일 검출 ──────────────────

def find_connectors(white, bands, band_tiles_list, min_gap=60, v_pitch=130):
    """밴드 사이 간격의 세로 연결 타일.

    제안: 위/아래 밴드에 x축으로 정렬된 타일 쌍이 있는 곳
    검증: 제안된 기둥의 좌·우 경계 위치에 실제 세로 흰선이 존재
    → 배경(집·나무)에 생기는 허위 기둥을 걸러낸다.
    """
    conns = []
    warns = []
    for i in range(len(bands) - 1):
        gtop, gbot = bands[i][1], bands[i + 1][0]
        gap = gbot - gtop
        if gap < min_gap:
            continue
        a, b = gtop + 6, gbot - 6
        if b - a < 20:
            continue
        strip = white[a:b]
        # 스프라이트(파이프·텍스트)에 가린 세로선을 세로 방향 닫기로 복원
        sc = ndi.binary_closing(strip, np.ones((41, 1)))
        vlines = [ (s + e) / 2 for s, e in runs_of(sc.mean(0) > 0.55, join=4) ]

        above, pa = band_tiles_list[i]
        below, pb = band_tiles_list[i + 1]
        pitch = pa or pb or 115

        for ta in above:
            for tb in below:
                if abs(ta['cx'] - tb['cx']) > 0.4 * pitch:
                    continue
                cx = (ta['cx'] + tb['cx']) / 2
                # 좌·우 경계에 세로 흰선 증거가 모두 있어야 인정
                ok = 0
                for edge in (cx - pitch / 2, cx + pitch / 2):
                    if any(abs(v - edge) <= 26 for v in vlines):
                        ok += 1
                if ok < 2:
                    continue
                n = max(1, int(round(gap / v_pitch)))
                if abs(gap / v_pitch - n) > 0.35:
                    warns.append(f'세로 기둥 칸수 불확실 x={int(cx)} gap={gap} → {n}칸으로 가정')
                for t in range(n):
                    yy0 = gtop + gap * t / n
                    yy1 = gtop + gap * (t + 1) / n
                    conns.append({'cx': cx, 'cy': (yy0 + yy1) / 2,
                                  'x0': cx - pitch / 2, 'x1': cx + pitch / 2,
                                  'y0': yy0, 'y1': yy1, 'pitch': pitch,
                                  'band': None})
    return conns, warns


def perimeter_score(white, t):
    """타일 테두리에 흰 윤곽선이 얼마나 있는지 — 허위 타일 판별용."""
    H, W = white.shape
    x0, x1 = int(t['x0']), int(t['x1'])
    y0, y1 = int(t['y0']), int(t['y1'])

    def hband(a, b):
        r = white[max(0, a):min(H, b), max(0, x0 + 8):min(W, x1 - 8)]
        return r.any(0).mean() if r.size else 0.0

    def vband(a, b):
        r = white[max(0, y0 + 8):min(H, y1 - 8), max(0, a):min(W, b)]
        return r.any(1).mean() if r.size else 0.0

    return hband(y0 - 5, y0 + 6) + hband(y1 - 6, y1 + 5) \
         + vband(x0 - 5, x0 + 6) + vband(x1 - 6, x1 + 5)


# ────────────────── 4) 인접 그래프 → 경로 사슬 ──────────────────

def swap_tile(t):
    """전치 좌표계에서 찾은 칸을 원래 좌표계로 되돌린다."""
    return {'cx': t['cy'], 'cy': t['cx'],
            'x0': t['y0'], 'x1': t['y1'],
            'y0': t['x0'], 'y1': t['x1'],
            'pitch': t['pitch'], 'band': t['band'], 'axis': 'V'}


def collect_runs(white, strict, y0, y1, axis):
    """한 방향의 직선 구간 칸 + 그 사이를 잇는 연결 기둥."""
    bands = find_bands(strict, y0, y1)
    bt = [band_tiles(white, t, b, i) for i, (t, b) in enumerate(bands)]
    tiles = [t for tl, _ in bt for t in tl]
    conns, warns = find_connectors(white, bands, bt)

    for t in tiles:
        t['axis'] = axis
    for c in conns:
        c['axis'] = axis
    return tiles + conns, bands, warns


def _overlap_frac(a, b):
    ix = max(0, min(a['x1'], b['x1']) - max(a['x0'], b['x0']))
    iy = max(0, min(a['y1'], b['y1']) - max(a['y0'], b['y0']))
    inter = ix * iy
    if inter <= 0:
        return 0.0
    aa = (a['x1'] - a['x0']) * (a['y1'] - a['y0'])
    bb = (b['x1'] - b['x0']) * (b['y1'] - b['y0'])
    return inter / max(1.0, min(aa, bb))


def merge_tiles(*groups):
    """가로 검출과 세로 검출 결과 병합.

    두 방향에서 같은 칸을 잡거나, 위상이 어긋나 반 칸씩 겹친 후보가 생긴다.
    면적이 40% 넘게 겹치면 같은 칸으로 보고 먼저 잡힌 쪽을 남긴다.
    """
    out = []
    for g in groups:
        for t in g:
            if not any(_overlap_frac(o, t) > 0.40 for o in out):
                out.append(t)
    return out


def edge_closed(white, lo, hi, horiz):
    """앞선 칸의 바깥 테두리가 그 지점에 그려져 있는지.

    테두리가 있으면 경로는 거기서 끝난 것 — 두 칸은 서로 다른 구간이다.
    테두리가 끊겨 있으면 경로가 그 지점에서 꺾여 이어진다.
    """
    H, W = white.shape
    if horiz:
        w0, w1 = int(max(lo['y0'], hi['y0'])), int(min(lo['y1'], hi['y1']))
        pad = max(6, int((w1 - w0) * 0.25))
        seg = white[max(0, w0 + pad):min(H, w1 - pad),
                    max(0, int(lo['x1']) - 6):min(W, int(lo['x1']) + 7)]
        prof = seg.mean(0) if seg.size else np.array([])
    else:
        w0, w1 = int(max(lo['x0'], hi['x0'])), int(min(lo['x1'], hi['x1']))
        pad = max(6, int((w1 - w0) * 0.25))
        seg = white[max(0, int(lo['y1']) - 6):min(H, int(lo['y1']) + 7),
                    max(0, w0 + pad):min(W, w1 - pad)]
        prof = seg.mean(1) if seg.size else np.array([])
    return bool(prof.size) and float(prof.max()) > 0.5


def boundary_link(white, a, b):
    """두 이웃 칸이 경로상 이어져 있는지 판정.

    상자가 맞닿아 있으면 같은 직선 구간(또는 기둥과의 이음매) — 연결.
    상자가 떨어져 있으면 나란히 지나가는 다른 구간이다. 이때는 경계의
    흰 테두리가 한 줄로 붙어 있으면(꺾이는 지점) 연결, 두 줄 사이로
    배경이 비쳐 보이면(각자의 바깥 테두리) 연결이 아니다.
    """
    H, W = white.shape
    horiz = abs(a['cx'] - b['cx']) > abs(a['cy'] - b['cy'])
    lo, hi = (a, b) if (a['cx'] < b['cx'] if horiz else a['cy'] < b['cy']) else (b, a)

    if horiz:
        box_gap = hi['x0'] - lo['x1']
        w0, w1 = int(max(a['y0'], b['y0'])), int(min(a['y1'], b['y1']))
    else:
        box_gap = hi['y0'] - lo['y1']
        w0, w1 = int(max(a['x0'], b['x0'])), int(min(a['x1'], b['x1']))
    if box_gap <= 14:
        return True

    pad = max(6, int((w1 - w0) * 0.25))
    if horiz:
        seg = white[max(0, w0 + pad):min(H, w1 - pad),
                    max(0, int(lo['x1']) - 20):min(W, int(hi['x0']) + 20)]
        prof = seg.mean(0) if seg.size else np.array([])
    else:
        seg = white[max(0, int(lo['y1']) - 20):min(H, int(hi['y0']) + 20),
                    max(0, w0 + pad):min(W, w1 - pad)]
        prof = seg.mean(1) if seg.size else np.array([])
    if prof.size == 0:
        return False
    rs = runs_of(prof > 0.30)
    if not rs:
        return False
    return (rs[-1][0] - rs[0][1]) <= 8


def build_graph(tiles, white=None):
    n = len(tiles)
    adj = [[] for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            a, b = tiles[i], tiles[j]
            dx = abs(a['cx'] - b['cx'])
            dy = abs(a['cy'] - b['cy'])
            p = (a['pitch'] + b['pitch']) / 2
            neighbor = (dy < 0.5 * p and 0.55 * p < dx < 1.45 * p) or \
                       (dx < 0.5 * p and 0.55 * p < dy < 1.45 * p)
            if neighbor and (white is None or boundary_link(white, a, b)):
                adj[i].append(j)
                adj[j].append(i)
    return adj


def connected_components(adj):
    seen, comps = set(), []
    for s in range(len(adj)):
        if s in seen:
            continue
        stack, comp = [s], []
        seen.add(s)
        while stack:
            u = stack.pop()
            comp.append(u)
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        comps.append(comp)
    return comps


def walk(adj, start):
    order, seen, cur = [start], {start}, start
    while True:
        nxt = [k for k in adj[cur] if k not in seen]
        if not nxt:
            return order
        cur = nxt[0]
        seen.add(cur)
        order.append(cur)


def prune_to_chain(tiles, white, max_removed=8):
    """허위 칸을 제거해 단일 사슬로 정리.

    1) 테두리 근거가 빈약한 후보 사전 탈락 (하늘·배경 오검출)
    2) 가장 큰 연결 성분만 유지
    3) 갈래(차수 3 이상)나 여분 끝점은 근거가 약한 것부터 잘라낸다
    """
    idx = [i for i in range(len(tiles))
           if tiles[i].get('band') is None or perimeter_score(white, tiles[i]) >= 1.30]
    removed = [i for i in range(len(tiles)) if i not in set(idx)]

    for _ in range(max_removed + 1):
        sub = [tiles[i] for i in idx]
        if not sub:
            return None, removed, '칸 없음'
        adj = build_graph(sub, white)
        comps = connected_components(adj)
        comps.sort(key=len, reverse=True)
        if len(comps) > 1:
            keep = set(comps[0])
            removed += [idx[i] for i in range(len(idx)) if i not in keep]
            idx = [idx[i] for i in sorted(keep)]
            continue

        deg3 = [i for i in range(len(sub)) if len(adj[i]) > 2]
        if deg3:
            bad = min(deg3, key=lambda i: perimeter_score(white, sub[i]))
            removed.append(idx[bad])
            idx = [v for k, v in enumerate(idx) if k != bad]
            continue

        ends = [i for i in range(len(sub)) if len(adj[i]) == 1]
        if len(ends) > 2:
            worst = min(ends, key=lambda i: perimeter_score(white, sub[i]))
            removed.append(idx[worst])
            idx = [v for k, v in enumerate(idx) if k != worst]
            continue
        if len(ends) < 2:
            return None, removed, f'끝점 {len(ends)}개 (닫힌 고리 의심)'
        order = walk(adj, ends[0])
        if len(order) != len(sub):
            return None, removed, '사슬이 전체를 덮지 못함'
        return [idx[i] for i in order], removed, None
    return None, removed, '정리 실패(허위 칸 과다)'


def masks_at(im, thr, y0, y1):
    mx, mn = im.max(2), im.min(2)
    strict = (mn > thr) & ((mx - mn) < 30)
    white = (mn > thr - 20) & ((mx - mn) < 45)
    for m in (strict, white):
        m[:y0] = False
        m[y1:] = False
    return white, strict


def _collect_at(im, thr, y0, y1):
    white, strict = masks_at(im, thr, y0, y1)
    h_tiles, hbands, hw = collect_runs(white, strict, y0, y1, 'H')
    v_raw, vbands, vw = collect_runs(white.T, strict.T, 0, white.shape[1], 'V')
    v_tiles = [swap_tile(t) for t in v_raw]
    return merge_tiles(h_tiles, v_tiles), (white, hbands, vbands, hw + vw,
                                           len(h_tiles), len(v_tiles))


def analyze(path, verbose=True):
    im = load(path)
    y0, y1 = content_box(im)

    # 지도마다 배경 밝기가 크게 달라(잔디 vs 석벽) 고정 임계값으로는 윤곽선이 안 잡힌다.
    # 여러 임계값으로 훑어 칸이 가장 많이 잡히는 값을 고른다.
    best = None
    for thr in (196, 206, 214, 222, 230, 238):
        tiles, meta = _collect_at(im, thr, y0, y1)
        if best is None or len(tiles) > len(best[0]):
            best = (tiles, meta, thr)
    tiles, (white, hbands, vbands, warns, nh, nv), thr = best

    order, removed, err = prune_to_chain(tiles, white)

    if verbose:
        print(f'== {path}')
        print(f'   가로구간 {hbands}')
        print(f'   세로구간 {vbands}')
        print(f'   임계값 {thr} · 후보 {len(tiles)}칸 (가로계 {nh} + 세로계 {nv} 병합), '
              f'제거 {len(removed)}칸')
        for w in warns:
            print(f'   [경고] {w}')
        if err:
            print(f'   사슬 추적 실패: {err}')
        else:
            print(f'   확정 {len(order)}칸')
            print('   좌표:', [(int(tiles[i]["cx"]), int(tiles[i]["cy"])) for i in order])
    return im, tiles, order


# ────────────────── 5) 칸 내용 분류 ──────────────────

def _blobs(mask, closing=None):
    if closing is not None:
        mask = ndi.binary_closing(mask, np.ones(closing))
    lab, n = ndi.label(mask)
    out = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        if sl is None:
            continue
        area = int((lab[sl] == i + 1).sum())
        w = sl[1].stop - sl[1].start
        h = sl[0].stop - sl[0].start
        out.append({'area': area, 'w': w, 'h': h,
                    'cx': (sl[1].start + sl[1].stop) / 2,
                    'cy': (sl[0].start + sl[0].stop) / 2,
                    'x0': sl[1].start, 'x1': sl[1].stop,
                    'y0': sl[0].start, 'y1': sl[0].stop,
                    'mask': (lab[sl] == i + 1)})
    return out


def find_qcards(im):
    """? 행운카드 — 금색 테두리 카드 스프라이트."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    m = (r > 195) & (g > 140) & (g < 225) & (b < 110)
    return [x for x in _blobs(m, (5, 5))
            if 46 <= x['w'] <= 64 and 30 <= x['h'] <= 60 and 190 <= x['area'] <= 340]


def find_outs(im):
    """OUT 파이프 — 하늘색 'OUT' 글자."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    m = (b > 190) & (b - r > 55) & (g > 110) & (g < 215)
    return [x for x in _blobs(m, (5, 5))
            if 40 <= x['w'] <= 56 and 21 <= x['h'] <= 34 and 360 <= x['area'] <= 680]


def find_next(im):
    """NEXT 표지판 — 가로로 긴 금색 글자 덩어리."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    m = (r > 195) & (g > 140) & (g < 225) & (b < 110)
    return [x for x in _blobs(m, (5, 5))
            if 55 <= x['w'] <= 90 and 20 <= x['h'] <= 42 and x['area'] > 500]


DIGIT_H = (36, 46)
DIGIT_W = (14, 42)


def find_digit_glyphs(im):
    """블로그가 적어 넣은 '+N' 숫자의 개별 글자."""
    r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
    m = (r > 232) & (g > 232) & (b > 232)
    out = []
    for x in _blobs(m):
        if not (DIGIT_H[0] <= x['h'] <= DIGIT_H[1]):
            continue
        if not (DIGIT_W[0] <= x['w'] <= DIGIT_W[1]):
            continue
        if x['area'] < 330 or x['area'] / (x['w'] * x['h']) < 0.42:
            continue
        out.append(x)
    return out


def group_numbers(glyphs, max_gap=28):
    """같은 줄에 이어 붙은 글자들을 하나의 숫자로 묶는다."""
    gs = sorted(glyphs, key=lambda t: (round(t['cy'] / 25), t['cx']))
    groups = []
    for gl in gs:
        if groups:
            last = groups[-1][-1]
            if abs(gl['cy'] - last['cy']) < 22 and 0 < gl['x0'] - last['x1'] < max_gap:
                groups[-1].append(gl)
                continue
        groups.append([gl])
    return groups


def norm_glyph(g, size=(20, 28)):
    """글자 비트맵을 고정 크기로 정규화 — 템플릿 대조용."""
    a = np.asarray(Image.fromarray((g['mask'] * 255).astype(np.uint8))
                   .resize(size, Image.BILINEAR)).astype(float) / 255.0
    return a


def classify_digits(groups, templates):
    """숫자 그룹 → 정수값. 템플릿에 없는 글자는 None 으로 표시."""
    out = []
    for grp in groups:
        digits = []
        for gl in grp:
            v = norm_glyph(gl)
            best, bs = None, -1
            for d, tl in templates.items():
                for t in tl:
                    s = float((v * t).sum() / (np.sqrt((v * v).sum() * (t * t).sum()) + 1e-9))
                    if s > bs:
                        bs, best = s, d
            digits.append(best if bs > 0.86 else None)
        val = None
        if digits and all(d is not None for d in digits):
            val = int(''.join(str(d) for d in digits))
        out.append({'value': val, 'digits': digits,
                    'cx': float(np.mean([g['cx'] for g in grp])),
                    'cy': float(np.mean([g['cy'] for g in grp])),
                    'glyphs': grp})
    return out


def assign(items, tiles, order, max_frac=0.75):
    """스프라이트를 가장 가까운 칸에 배정 → 칸 번호(1-base) 반환."""
    res = {}
    for it in items:
        best, bd = None, 1e9
        for rank, ti in enumerate(order):
            t = tiles[ti]
            d = ((it['cx'] - t['cx']) ** 2 + ((it['cy'] - t['cy']) * 0.85) ** 2) ** 0.5
            if d < bd:
                bd, best = d, rank + 1
        if best is not None and bd <= tiles[order[best - 1]]['pitch'] * max_frac:
            res.setdefault(best, []).append(it)
    return res


# ────────────────── 6) 맵 1장 → 최종 레코드 ──────────────────

def global_lattice(tiles):
    """모든 칸을 하나의 전역 격자(피치·위상)에 맞춘다.

    밴드마다 적합된 피치가 조금씩 달라서 그대로 쓰면 행/열이 어긋난다.
    전체 중앙값 피치를 쓰고, 위상은 잔차 제곱합이 최소가 되는 값을 고른다.
    """
    pitch = float(np.median([t['pitch'] for t in tiles])) if tiles else 115.0

    def best_phase(vals):
        best, bs = 0.0, None
        for ph in np.arange(0, pitch, 0.5):
            r = [(v - ph) / pitch for v in vals]
            e = sum((x - round(x)) ** 2 for x in r)
            if bs is None or e < bs:
                bs, best = e, ph
        return best

    px = best_phase([t['cx'] for t in tiles])
    py = best_phase([t['cy'] for t in tiles])
    return pitch, px, py


def assign_to_tiles(items, tiles, max_frac=0.75):
    res = {}
    for it in items:
        best, bd = None, 1e9
        for i, t in enumerate(tiles):
            d = ((it['cx'] - t['cx']) ** 2 + ((it['cy'] - t['cy']) * 0.85) ** 2) ** 0.5
            if d < bd:
                bd, best = d, i
        if best is not None and bd <= tiles[best]['pitch'] * max_frac:
            res.setdefault(best, []).append(it)
    return res


def schematic(im, tiles, templates=None):
    """칸 배치를 ASCII 도식으로 — 경로 순서는 사람이 읽고 판단한다.

      #  빈 칸   ?  행운카드   O  OUT 배수구   I  IN/포탈(+N)
      N  NEXT    S  시작(캐릭터)            .  칸 없음
    """
    templates = templates if templates is not None else load_templates()
    pitch, px, py = global_lattice(tiles)
    cell = {}
    for t in tiles:
        c = int(round((t['cx'] - px) / pitch))
        r = int(round((t['cy'] - py) / pitch))
        cell[(r, c)] = '#'

    def rc(it):
        return (int(round((it['cy'] - py) / pitch)), int(round((it['cx'] - px) / pitch)))

    for it in find_qcards(im):
        if rc(it) in cell:
            cell[rc(it)] = '?'
    for it in find_outs(im):
        if rc(it) in cell:
            cell[rc(it)] = 'O'
    for it in find_next(im):
        if rc(it) in cell:
            cell[rc(it)] = 'N'
    labels = {}
    for it in classify_digits(group_numbers(find_digit_glyphs(im)), templates):
        k = rc(it)
        if k in cell:
            cell[k] = 'I'
            labels[k] = it['value']

    rs = [r for r, _ in cell]
    cs = [c for _, c in cell]
    r0, r1, c0, c1 = min(rs), max(rs), min(cs), max(cs)
    lines = ['     ' + ''.join(str(c % 10) for c in range(c0, c1 + 1))]
    for r in range(r0, r1 + 1):
        lines.append(f'  {r - r0:2d} ' + ''.join(cell.get((r, c), '.') for c in range(c0, c1 + 1)))
    if labels:
        lines.append('  +N: ' + ', '.join(
            f'({r - r0},{c - c0})=+{v}' for (r, c), v in sorted(labels.items())))
    return '\n'.join(lines)


def load_templates(path='scripts/adventure_digits.json'):
    import os
    if not os.path.exists(path):
        return {}
    raw = json.load(open(path))
    return {k: [np.array(t) for t in v] for k, v in raw.items()}


def run_map(path, templates=None, verbose=False):
    templates = templates if templates is not None else load_templates()
    im, tiles, order = analyze(path, verbose=verbose)
    rec = {'file': path, 'ok': False, 'errors': [], 'warns': []}
    if not order:
        rec['errors'].append('경로 사슬 추적 실패')
        return rec, tiles, order

    # 시작/끝 방향 결정 — NEXT 표지판이 있는 쪽이 마지막 칸
    nx = find_next(im)
    if nx:
        a = assign(nx, tiles, order)
        ranks = sorted(a.keys())
        if ranks and ranks[0] < len(order) / 2:
            order = order[::-1]
    else:
        rec['warns'].append('NEXT 표지판 미검출 — 좌하단 시작 가정')
        if tiles[order[0]]['cy'] < tiles[order[-1]]['cy']:
            order = order[::-1]

    n = len(order)
    q = sorted(assign(find_qcards(im), tiles, order).keys())
    outs = sorted(assign(find_outs(im), tiles, order).keys())
    nums = assign(classify_digits(group_numbers(find_digit_glyphs(im)), templates),
                  tiles, order)

    portals, unknown = [], []
    for sq, items in sorted(nums.items()):
        v = items[0]['value']
        if v is None:
            unknown.append({'square': sq, 'glyphs': items[0]['glyphs']})
        else:
            portals.append({'in': sq, 'n': v, 'out': sq + v})

    rec.update({'squares': n, 'q': q, 'outs': outs,
                'portals': [{'in': p['in'], 'n': p['n'], 'out': p['out']} for p in portals]})

    # ── 검증식: IN + N == OUT, 그리고 IN/OUT 개수 일치 ──
    outset = set(outs)
    for p in portals:
        if p['out'] not in outset:
            rec['errors'].append(f"검증실패 {p['in']}+{p['n']}={p['out']} 자리에 OUT 없음")
    if len(portals) + len(unknown) != len(outs):
        rec['errors'].append(f'IN {len(portals)+len(unknown)}개 vs OUT {len(outs)}개 불일치')
    if unknown:
        rec['errors'].append(f'숫자 판독 실패 {len(unknown)}건 (칸 {[u["square"] for u in unknown]})')
    rec['unknown'] = unknown
    rec['ok'] = not rec['errors']
    return rec, tiles, order


if __name__ == '__main__':
    tpl = load_templates()
    for p in sys.argv[1:]:
        rec, _, _ = run_map(p, tpl, verbose=('-v' in sys.argv))
        mark = 'OK  ' if rec['ok'] else 'FAIL'
        print(f"{mark} {p}: {rec.get('squares')}칸 ?={rec.get('q')} "
              f"OUT={rec.get('outs')} 포탈={[(x['in'],x['n'],x['out']) for x in rec.get('portals',[])]}")
        for e in rec['errors']:
            print('     ! ' + e)
        for w in rec['warns']:
            print('     ~ ' + w)
