# -*- coding: utf-8 -*-
# 유력 유리수 등식(37²/4, (37/25)², 37/25)을 제약으로 고정하고
# 시스템 정합성 + 나머지 비율의 조임 구간을 본다.
import sys
from fractions import Fraction
import numpy as np
from scipy.optimize import linprog

sys.stdout.reconfigure(encoding='utf-8')
SLACK = float(sys.argv[1]) if len(sys.argv) > 1 else 0.8
HYP = sys.argv[2] if len(sys.argv) > 2 else 'all'  # none|b|all

MON = 1101018 + 1096327

def mt(cd, mn, mx, zsum, pen, summon=False):
    dmg = min(mn, mx) + mx
    crit = (1 + cd * 148 / 10000) if summon else (1 + cd / 100)
    return crit * dmg * (1 + zsum / 200) * (1 + int(pen * 4) / 100)

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

mag = [
    (8707409, 51450, 10156, 4476866, 5330536), (8701189, 51450, 10156, 4475671, 5327676),
    (8694969, 51450, 10156, 4474476, 5324815), (8645209, 51450, 10156, 4464916, 5301930),
    (8707409, 51406, 10156, 4474725, 5329962), (8707409, 51361, 10156, 4472534, 5329374),
    (8707409, 51316, 10156, 4470344, 5328787), (8707409, 51001, 10156, 4455012, 5324676),
    (8707409, 51450, 10141, 4470318, 5322715), (8707409, 51450, 10126, 4463771, 5314894),
    (8707409, 51450, 10112, 4457659, 5307594), (8707409, 51450, 10082, 4444564, 5291953),
    (8707409, 51450, 10009, 4412699, 5253891),
]
for S, A, cd, d, s in mag:
    add_abs(drow(S, A, 970783, 35, mt(cd, 8429, 8664, 130.5, 98)), d)
    add_abs(srow(S, A, 970783, mt(cd, 8429, 8664, 130.5, 98, True)), s)

phys = [
    (8633683, 33265, 9445, 3149768, 4440622), (8627463, 33265, 9445, 3148710, 4438091),
    (8621243, 33265, 9445, 3147653, 4435560), (8571483, 33265, 9445, 3139192, 4415312),
    (8633683, 33225, 9445, 3148045, 4440160), (8633683, 33186, 9445, 3146365, 4439710),
    (8633683, 33147, 9445, 3144685, 4439259), (8633683, 32873, 9445, 3132883, 4436095),
    (8633683, 33265, 9431, 3145148, 4434087), (8633683, 33265, 9417, 3140528, 4427552),
    (8633683, 33265, 9403, 3135908, 4421016), (8633683, 33265, 9374, 3126339, 4407478),
    (8633683, 33265, 9303, 3102909, 4374334),
]
for S, A, cd, d, s in phys:
    add_abs(drow(S, A, 842996, 35, mt(cd, 8349, 8127, 130.5, 98)), d)
    add_abs(srow(S, A, 842996, mt(cd, 8349, 8127, 130.5, 98, True)), s)

S20, A20, G20 = 8702091, 51450, 970783
def j20d(g):
    return drow(S20, A20, G20, g, mt(10197, 8471, 8640, 130.5, 97))
for g, d in [(33, 4436488), (31, 4411815), (25, 4337796)]:
    add_delta(j20d(g), d, j20d(35), 4461161)

A_ub = np.array(A_ub); b_ub = np.array(b_ub)
names = ['pEffd', 'pBd', 'pCd', 'pKc', 'pAs', 'pBs', 'pCs']
scale = np.array([1e-8, 1e-6, 1e-8, 1e-8, 1e-8, 1e-6, 1e-8])
A_s = A_ub * scale

# 등식 가설 (스케일 적용 주의): 변수 순서 [pEffd,pBd,pCd,pKc,pAs,pBs,pCs]
A_eq, b_eq = [], []
def eq(coefs):
    A_eq.append([c * s for c, s in zip(coefs, scale)]); b_eq.append(0.0)

if HYP in ('b', 'all'):
    eq([0, 1, 0, -1369 / 4, 0, 0, 0])          # pBd = 1369/4 × pKc
if HYP == 'all':
    # pAs = (37/25)² × pAd = (37/25)²×(pEffd − 0.35 pKc)
    r = (37 / 25) ** 2
    eq([-r, 0, 0, 0.35 * r, 1, 0, 0])
    eq([0, 0, -37 / 25, 0, 0, 0, 1])           # pCs = 37/25 × pCd

A_eq_np = np.array(A_eq) if A_eq else None
b_eq_np = np.array(b_eq) if A_eq else None
bounds = [(0, None)] * 7

lo, hi = {}, {}
for i, nm in enumerate(names):
    for sign, store in [(1, lo), (-1, hi)]:
        c = np.zeros(7); c[i] = sign
        r = linprog(c, A_ub=A_s, b_ub=b_ub, A_eq=A_eq_np, b_eq=b_eq_np, bounds=bounds, method='highs')
        if not r.success:
            print(f'INFEASIBLE (SLACK={SLACK}, HYP={HYP}) — 가설 조합 기각')
            sys.exit(0)
        store[nm] = r.fun * sign * scale[i]

lo['pAd'] = lo['pEffd'] - 0.35 * hi['pKc']
hi['pAd'] = hi['pEffd'] - 0.35 * lo['pKc']

print(f'=== SLACK={SLACK}, HYP={HYP} — 정합 ✓ ===')
for nm in names + ['pAd']:
    mid = (hi[nm] + lo[nm]) / 2
    print(f'{nm:6s}: [{lo[nm]:.10e}, {hi[nm]:.10e}]  폭 {(hi[nm]-lo[nm])/mid*100:.4f}%')

def min_den(lo_v, hi_v, max_den=10 ** 7):
    ln, ld, rn, rd = 0, 1, 1, 0
    while True:
        mn_, md_ = ln + rn, ld + rd
        if md_ > max_den:
            return None
        v = mn_ / md_
        if v < lo_v:
            k = max(1, int((lo_v * ld - ln) / (rn - lo_v * rd)) if (rn - lo_v * rd) > 0 else 1)
            ln, ld = ln + k * rn, ld + k * rd
        elif v > hi_v:
            k = max(1, int((rn - hi_v * rd) / (hi_v * ld - ln)) if (hi_v * ld - ln) > 0 else 1)
            rn, rd = rn + k * ln, rd + k * ld
        else:
            return Fraction(mn_, md_)

print('\n=== 잔여 비율 조임 구간 ===')
for x, y in [('pAd', 'pKc'), ('pBs', 'pKc'), ('pCd', 'pKc'), ('pBd', 'pBs'), ('pAs', 'pKc'), ('pCs', 'pKc')]:
    rlo, rhi = lo[x] / hi[y], hi[x] / lo[y]
    f = min_den(rlo, rhi)
    print(f'{x}/{y}: [{rlo:.8f}, {rhi:.8f}] 폭 {(rhi-rlo)/rlo*100:.4f}%  최소분모: {f} = {float(f):.8f}' if f else f'{x}/{y}: [{rlo:.8f}, {rhi:.8f}] (유리수 없음)')
