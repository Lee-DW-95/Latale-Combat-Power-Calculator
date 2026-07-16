# -*- coding: utf-8 -*-
# 탄성 LP 진단 — 제약별 위반량(BP)을 최소화해 어느 관측이 모델과 충돌하는지 본다.
import sys
import numpy as np
from scipy.optimize import linprog

sys.stdout.reconfigure(encoding='utf-8')
ATK_OFFSET = int(sys.argv[1]) if len(sys.argv) > 1 else 0
USE_J20 = sys.argv[2] if len(sys.argv) > 2 else 'both'  # none|gm|both

MON = 1101018 + 1096327
SLACK = 0.8

def mt(cd, mn, mx, zsum, pen, summon=False):
    dmg = min(mn, mx) + mx
    crit = (1 + cd * 148 / 10000) if summon else (1 + cd / 100)
    return crit * dmg * (1 + zsum / 200) * (1 + int(pen * 4) / 100)

def drow(S, A, G, g, m):
    return [c * m for c in (S, A, G + MON / 2, S * (g - 35) / 100)] + [0, 0, 0]

def srow(S, A, G, m):
    return [0, 0, 0, 0] + [c * m for c in (S, A, G + MON / 2)]

A_ub, b_ub, labels = [], [], []

def add_abs(row, V, tag):
    A_ub.append([-c for c in row]); b_ub.append(-V); labels.append(tag + ' >=V')
    A_ub.append(row); b_ub.append(V + 1 + SLACK); labels.append(tag + ' <=V+')

def add_delta(row1, V1, row2, V2, tag):
    diff = [a - b for a, b in zip(row1, row2)]
    dV = V1 - V2
    A_ub.append([-c for c in diff]); b_ub.append(-(dV - 1 - SLACK)); labels.append(tag + ' d>=')
    A_ub.append(diff); b_ub.append(dV + 1 + SLACK); labels.append(tag + ' d<=')

mag = [
    (8707409, 51450, 10156, 4476866, 5330536, 'm기준'),
    (8701189, 51450, 10156, 4475671, 5327676, 'm스탯-1k'),
    (8694969, 51450, 10156, 4474476, 5324815, 'm스탯-2k'),
    (8645209, 51450, 10156, 4464916, 5301930, 'm스탯-10k'),
    (8707409, 51406, 10156, 4474725, 5329962, 'm속-10'),
    (8707409, 51361, 10156, 4472534, 5329374, 'm속-20'),
    (8707409, 51316, 10156, 4470344, 5328787, 'm속-30'),
    (8707409, 51001, 10156, 4455012, 5324676, 'm속-100'),
    (8707409, 51450, 10141, 4470318, 5322715, 'm크-10'),
    (8707409, 51450, 10126, 4463771, 5314894, 'm크-20'),
    (8707409, 51450, 10112, 4457659, 5307594, 'm크-30'),
    (8707409, 51450, 10082, 4444564, 5291953, 'm크-50'),
    (8707409, 51450, 10009, 4412699, 5253891, 'm크-100'),
]
for S, A, cd, d, s, t in mag:
    add_abs(drow(S, A, 970783, 35, mt(cd, 8429, 8664, 130.5, 98)), d, t + '직')
    add_abs(srow(S, A, 970783, mt(cd, 8429, 8664, 130.5, 98, True)), s, t + '소')

phys = [
    (8633683, 33265, 9445, 3149768, 4440622, 'p기준'),
    (8627463, 33265, 9445, 3148710, 4438091, 'p스탯-1k'),
    (8621243, 33265, 9445, 3147653, 4435560, 'p스탯-2k'),
    (8571483, 33265, 9445, 3139192, 4415312, 'p스탯-10k'),
    (8633683, 33225, 9445, 3148045, 4440160, 'p무-10'),
    (8633683, 33186, 9445, 3146365, 4439710, 'p무-20'),
    (8633683, 33147, 9445, 3144685, 4439259, 'p무-30'),
    (8633683, 32873, 9445, 3132883, 4436095, 'p무-100'),
    (8633683, 33265, 9431, 3145148, 4434087, 'p크-10'),
    (8633683, 33265, 9417, 3140528, 4427552, 'p크-20'),
    (8633683, 33265, 9403, 3135908, 4421016, 'p크-30'),
    (8633683, 33265, 9374, 3126339, 4407478, 'p크-50'),
    (8633683, 33265, 9303, 3102909, 4374334, 'p크-100'),
]
for S, A, cd, d, s, t in phys:
    add_abs(drow(S, A + ATK_OFFSET, 842996, 35, mt(cd, 8349, 8127, 130.5, 98)), d, t + '직')
    add_abs(srow(S, A + ATK_OFFSET, 842996, mt(cd, 8349, 8127, 130.5, 98, True)), s, t + '소')

if USE_J20 != 'none':
    S20, A20, G20 = 8702091, 51450, 970783
    def j20d(g, zsum):
        return drow(S20, A20, G20, g, mt(10197, 8471, 8640, zsum, 97))
    def j20s(zsum):
        return srow(S20, A20, G20, mt(10197, 8471, 8640, zsum, 97, True))
    j20 = [
        (35, 130.5, 4461161, 5313338, 'j20기준'),
        (33, 130.5, 4436488, 5313338, 'j20근마33'),
        (31, 130.5, 4411815, 5313338, 'j20근마31'),
        (25, 130.5, 4337796, 5313338, 'j20근마25'),
        (35, 128.5, 4434164, 5281184, 'j20지배-1'),
        (35, 125.5, 4393670, 5232954, 'j20지배-2.5'),
    ]
    bg, bz, bd, bs, _ = j20[0]
    for g, z, d, s, t in j20[1:]:
        if USE_J20 == 'gm' and z != bz:
            continue
        add_delta(j20d(g, z), d, j20d(bg, bz), bd, t + '직')
        if s != bs:
            add_delta(j20s(z), s, j20s(bz), bs, t + '소')

A_ub = np.array(A_ub); b_ub = np.array(b_ub)
n_con = len(b_ub)
scale = np.array([1e-8, 1e-6, 1e-8, 1e-8, 1e-8, 1e-6, 1e-8])
A_s = A_ub * scale

# 탄성: A·x − e <= b, e>=0, min Σe
A_el = np.hstack([A_s, -np.eye(n_con)])
c = np.concatenate([np.zeros(7), np.ones(n_con)])
bounds = [(0, None)] * 7 + [(0, None)] * n_con
r = linprog(c, A_ub=A_el, b_ub=b_ub, bounds=bounds, method='highs')
print(f'ATK_OFFSET={ATK_OFFSET} j20={USE_J20}  총 위반량: {r.fun:.2f} BP')
e = r.x[7:]
viol = [(labels[i], e[i]) for i in range(n_con) if e[i] > 0.01]
viol.sort(key=lambda t: -t[1])
for tag, v in viol[:20]:
    print(f'  위반 {v:9.2f} BP  {tag}')
