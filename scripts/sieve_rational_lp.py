# -*- coding: utf-8 -*-
# v2: 자료20 마법 패널(동일 세션 내 델타)을 추가해 pKc 를 pAd 에서 분리.
# 변수: [pEffd(=pAd+0.35·pKc), pBd, pCd, pKc, pAs, pBs, pCs]
import sys
from fractions import Fraction
import numpy as np
from scipy.optimize import linprog

sys.stdout.reconfigure(encoding='utf-8')
ATK_OFFSET = int(sys.argv[1]) if len(sys.argv) > 1 else 0

MON = 1101018 + 1096327
SLACK = 0.8

def mt(cd, mn, mx, zsum, pen, summon=False):
    dmg = min(mn, mx) + mx
    crit = (1 + cd * 148 / 10000) if summon else (1 + cd / 100)
    return crit * dmg * (1 + zsum / 200) * (1 + int(pen * 4) / 100)

# 직접 L 계수행: [S, A, G+Mon/2, S*(g-35)/100] → (pEffd, pBd, pCd, pKc)
def drow(S, A, G, g, m):
    return [c * m for c in (S, A, G + MON / 2, S * (g - 35) / 100)] + [0, 0, 0]

def srow(S, A, G, m):
    return [0, 0, 0, 0] + [c * m for c in (S, A, G + MON / 2)]

A_ub, b_ub = [], []

def add_abs(row, V):
    A_ub.append([-c for c in row]); b_ub.append(-V)
    A_ub.append(row); b_ub.append(V + 1 + SLACK)

def add_delta(row1, V1, row2, V2):
    diff = [a - b for a, b in zip(row1, row2)]
    dV = V1 - V2
    A_ub.append([-c for c in diff]); b_ub.append(-(dV - 1 - SLACK))
    A_ub.append(diff); b_ub.append(dV + 1 + SLACK)

# ─── 자료21~23 (관통98, g=35) 절대 제약 ───
MGm = mt(10156, 8429, 8664, 130.5, 98)      # 마법 직접 (크댐 가변시 재계산)
mag = [
    (8707409, 51450, 10156, 4476866, 5330536),
    (8701189, 51450, 10156, 4475671, 5327676),
    (8694969, 51450, 10156, 4474476, 5324815),
    (8645209, 51450, 10156, 4464916, 5301930),
    (8707409, 51406, 10156, 4474725, 5329962),
    (8707409, 51361, 10156, 4472534, 5329374),
    (8707409, 51316, 10156, 4470344, 5328787),
    (8707409, 51001, 10156, 4455012, 5324676),
    (8707409, 51450, 10141, 4470318, 5322715),
    (8707409, 51450, 10126, 4463771, 5314894),
    (8707409, 51450, 10112, 4457659, 5307594),
    (8707409, 51450, 10082, 4444564, 5291953),
    (8707409, 51450, 10009, 4412699, 5253891),
]
for S, A, cd, d, s in mag:
    add_abs(drow(S, A, 970783, 35, mt(cd, 8429, 8664, 130.5, 98)), d)
    add_abs(srow(S, A, 970783, mt(cd, 8429, 8664, 130.5, 98, True)), s)

phys = [
    (8633683, 33265, 9445, 3149768, 4440622),
    (8627463, 33265, 9445, 3148710, 4438091),
    (8621243, 33265, 9445, 3147653, 4435560),
    (8571483, 33265, 9445, 3139192, 4415312),
    (8633683, 33225, 9445, 3148045, 4440160),
    (8633683, 33186, 9445, 3146365, 4439710),
    (8633683, 33147, 9445, 3144685, 4439259),
    (8633683, 32873, 9445, 3132883, 4436095),
    (8633683, 33265, 9431, 3145148, 4434087),
    (8633683, 33265, 9417, 3140528, 4427552),
    (8633683, 33265, 9403, 3135908, 4421016),
    (8633683, 33265, 9374, 3126339, 4407478),
    (8633683, 33265, 9303, 3102909, 4374334),
]
for S, A, cd, d, s in phys:
    add_abs(drow(S, A + ATK_OFFSET, 842996, 35, mt(cd, 8349, 8127, 130.5, 98)), d)
    add_abs(srow(S, A + ATK_OFFSET, 842996, mt(cd, 8349, 8127, 130.5, 98, True)), s)

# ─── 자료20 마법 패널 (관통97, 동일 세션 내 델타만 사용) ───
j20 = [
    # (g, zsum, 직접, 소환)
    (35, 130.5, 4461161, 5313338),
    (33, 130.5, 4436488, 5313338),
    (31, 130.5, 4411815, 5313338),
    (25, 130.5, 4337796, 5313338),
    (35, 128.5, 4434164, 5281184),
    (35, 125.5, 4393670, 5232954),
]
S20, A20, G20 = 8702091, 51450, 970783
def j20d(g, zsum):
    return drow(S20, A20, G20, g, mt(10197, 8471, 8640, zsum, 97))
def j20s(zsum):
    return srow(S20, A20, G20, mt(10197, 8471, 8640, zsum, 97, True))
base_g, base_z, base_d, base_s = j20[0]
for g, z, d, s in j20[1:]:
    if z != base_z:
        continue  # 지배력 델타 제외 — 자료20 세션 L레벨 충돌 (탄성 LP 진단: 10~26 BP 위반)
    add_delta(j20d(g, z), d, j20d(base_g, base_z), base_d)

A_ub = np.array(A_ub); b_ub = np.array(b_ub)
names = ['pEffd', 'pBd', 'pCd', 'pKc', 'pAs', 'pBs', 'pCs']
scale = np.array([1e-8, 1e-6, 1e-8, 1e-8, 1e-8, 1e-6, 1e-8])
A_s = A_ub * scale
bounds = [(0, None)] * 7

lo, hi = {}, {}
for i, nm in enumerate(names):
    for sign, store in [(1, lo), (-1, hi)]:
        c = np.zeros(7); c[i] = sign
        r = linprog(c, A_ub=A_s, b_ub=b_ub, bounds=bounds, method='highs')
        if not r.success:
            print(f'(ATK_OFFSET={ATK_OFFSET}) INFEASIBLE — 이 가정 기각 ({nm}: {r.message})')
            sys.exit(0)
        store[nm] = r.fun * sign * scale[i]

# pAd = pEffd − 0.35 pKc (구간 산술)
lo['pAd'] = lo['pEffd'] - 0.35 * hi['pKc']
hi['pAd'] = hi['pEffd'] - 0.35 * lo['pKc']

print(f'=== ATK_OFFSET={ATK_OFFSET} — 계수곱 허용 구간 ===')
for nm in names + ['pAd']:
    mid = (hi[nm] + lo[nm]) / 2
    w = (hi[nm] - lo[nm]) / mid * 100 if mid else float('inf')
    print(f'{nm:6s}: [{lo[nm]:.9e}, {hi[nm]:.9e}]  폭 {w:.4f}%')

def min_den_fraction(lo_v, hi_v, max_den=10 ** 7):
    # Stern-Brocot: [lo,hi] 구간 내 최소 분모 유리수
    if lo_v <= 0 or hi_v < lo_v:
        return None
    ln, ld, rn, rd = 0, 1, 1, 0
    for _ in range(10 ** 6):
        mn, md = ln + rn, ld + rd
        if md > max_den:
            return None
        v = mn / md
        if v < lo_v:
            k = int((lo_v * ld - ln) / (rn - lo_v * rd)) if (rn - lo_v * rd) > 0 else 1
            k = max(1, k)
            ln, ld = ln + k * rn, ld + k * rd
        elif v > hi_v:
            k = int((rn - hi_v * rd) / (hi_v * ld - ln)) if (hi_v * ld - ln) > 0 else 1
            k = max(1, k)
            rn, rd = rn + k * ln, rd + k * ld
        else:
            return Fraction(mn, md)
    return None

print('\n=== 비율 구간 + 최소분모 유리수 ===')
pairs = [('pAs', 'pAd'), ('pBd', 'pBs'), ('pCs', 'pCd'), ('pAd', 'pKc'),
         ('pBd', 'pKc'), ('pCd', 'pKc'), ('pAs', 'pKc'), ('pBs', 'pKc'),
         ('pCs', 'pKc'), ('pBd', 'pAd'), ('pCd', 'pAd')]
for x, y in pairs:
    if lo[y] <= 0:
        print(f'{x}/{y}: 분모 미확정')
        continue
    rlo, rhi = lo[x] / hi[y], hi[x] / lo[y]
    f = min_den_fraction(rlo, rhi)
    fs = f'{f} = {float(f):.7f}' if f else '(1e7 분모 내 없음)'
    print(f'{x}/{y}: [{rlo:.7f}, {rhi:.7f}] 폭 {(rhi - rlo) / rlo * 100:.4f}%  최소분모: {fs}')

print('\n=== 구조 가설 ===')
hyps = [('pCs/pCd = 37/25 (1.48)', 'pCs', 'pCd', 37 / 25),
        ('pAs/pAd = (37/25)^2', 'pAs', 'pAd', (37 / 25) ** 2),
        ('pBd/pBs = 11/2', 'pBd', 'pBs', 5.5),
        ('pAd/pKc = 1 (통합가설)', 'pAd', 'pKc', 1.0),
        ('pBd/pKc = 37^2/4', 'pBd', 'pKc', 342.25)]
for label, x, y, v in hyps:
    rlo, rhi = lo[x] / hi[y], hi[x] / lo[y]
    print(f'{label}: {"양립 ✓" if rlo <= v <= rhi else "기각 ✗"}  구간 [{rlo:.6f}, {rhi:.6f}]')
