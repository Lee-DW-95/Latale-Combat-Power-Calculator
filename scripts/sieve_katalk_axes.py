# -*- coding: utf-8 -*-
# 카톡(전투력.txt) 고댐/몬추/근력/근마 델타 축을 통제 LP에 추가
import sys
from fractions import Fraction
import numpy as np
from scipy.optimize import linprog

sys.stdout.reconfigure(encoding='utf-8')
SLACK = float(sys.argv[1]) if len(sys.argv) > 1 else 0.8

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

def add_pair(row, dlo, dhi):
    A_ub.append([-c for c in row]); b_ub.append(-dlo)
    A_ub.append(row); b_ub.append(dhi)

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
    diff = [a - b for a, b in zip(j20d(g), j20d(35))]
    dV = d - 4461161
    add_pair(diff, dV - 1 - SLACK, dV + 1 + SLACK)

# ─── 카톡 델타 축 (근마 27, 관통 98) ───
Sk = 8112370
Mk = mt(9014, 8396, 8670, 150.8, 98)
Mks = mt(9014, 8396, 8670, 150.8, 98, True)
bd, bs = 4663530, 4894698
kat = [
    # 근력-2% 제외 — V_BIG30 판정 '신뢰 불가 프로브' (탄성 LP 위반 995 BP 재확인)
    # 근마-2pp 제외 — 미결 cross 긴장 (위반 13.75 BP = 0.063%, disp/raw 판정 대상)
    ('깡근력-1k',   5990, 0, 0, 0, bd - 4662510, bs - 4892104),
    ('고댐-1%',    0, 4461.55, 0, 0, bd - 4662921, bs - 4893369),
    ('깡고댐-1500', 0, 1500 * 789694 / 446155, 0, 0, bd - 4663167, bs - 4893907),
    ('일몬추-1%',  0, 0, 9990.64, 0, bd - 4662848, bs - 4893211),
    ('보몬추-1%',  0, 0, 10013.83, 0, bd - 4662847, bs - 4893207),
    ('일몬추-200', 0, 0, 200 * 1128458 / 999064, 0, bd - 4663514, bs - 4894664),
    ('보몬추-200', 0, 0, 200 * 1141576 / 1001383, 0, bd - 4663514, bs - 4894664),
]
for name, dS, dG, dM, dg, dd, ds in kat:
    rowd = [Mk * dS, 0, Mk * (dG + dM / 2), Mk * (dS * (27 - 35) / 100 + Sk * dg / 100), 0, 0, 0]
    add_pair(rowd, dd - 1 - SLACK, dd + 1 + SLACK)
    if ds is not None:
        rows_ = [0, 0, 0, 0, Mks * dS, 0, Mks * (dG + dM / 2)]
        add_pair(rows_, ds - 1 - SLACK, ds + 1 + SLACK)

A_ub = np.array(A_ub); b_ub = np.array(b_ub)
names = ['pEffd', 'pBd', 'pCd', 'pKc', 'pAs', 'pBs', 'pCs']
scale = np.array([1e-8, 1e-6, 1e-8, 1e-8, 1e-8, 1e-6, 1e-8])
A_s = A_ub * scale
lo, hi = {}, {}
for i, nm in enumerate(names):
    for sign, store in [(1, lo), (-1, hi)]:
        c = np.zeros(7); c[i] = sign
        r = linprog(c, A_ub=A_s, b_ub=b_ub, bounds=[(0, None)] * 7, method='highs')
        if not r.success:
            print(f'INFEASIBLE at {nm} (SLACK={SLACK}) — 카톡 델타와 통제 데이터 모순')
            sys.exit(0)
        store[nm] = r.fun * sign * scale[i]
lo['pAd'] = lo['pEffd'] - 0.35 * hi['pKc']
hi['pAd'] = hi['pEffd'] - 0.35 * lo['pKc']

print(f'=== 카톡 축 추가 (SLACK={SLACK}) — 정합 ✓ ===')
for nm in names + ['pAd']:
    mid = (hi[nm] + lo[nm]) / 2
    print(f'{nm:6s}: [{lo[nm]:.10e}, {hi[nm]:.10e}]  폭 {(hi[nm] - lo[nm]) / mid * 100:.4f}%')

def md(lo_v, hi_v, max_den=10 ** 7):
    ln, ld, rn, rd = 0, 1, 1, 0
    while True:
        m, d = ln + rn, ld + rd
        if d > max_den:
            return None
        v = m / d
        if v < lo_v:
            k = max(1, int((lo_v * ld - ln) / (rn - lo_v * rd)) if (rn - lo_v * rd) > 0 else 1)
            ln, ld = ln + k * rn, ld + k * rd
        elif v > hi_v:
            k = max(1, int((rn - hi_v * rd) / (hi_v * ld - ln)) if (hi_v * ld - ln) > 0 else 1)
            rn, rd = rn + k * ln, rd + k * ld
        else:
            return Fraction(m, d)

print()
for x, y in [('pCd', 'pKc'), ('pCs', 'pCd'), ('pBd', 'pKc'), ('pAd', 'pKc'),
             ('pAs', 'pAd'), ('pBd', 'pBs'), ('pCd', 'pAd'), ('pCs', 'pKc')]:
    rlo, rhi = lo[x] / hi[y], hi[x] / lo[y]
    f = md(rlo, rhi)
    print(f'{x}/{y}: [{rlo:.7f}, {rhi:.7f}] 폭 {(rhi - rlo) / rlo * 100:.4f}%  최소분모: {f} = {float(f):.7f}')
