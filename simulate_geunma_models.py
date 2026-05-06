"""
근마효율 메커니즘 가설 검증 — 시뮬레이션 (코드 미반영, 결과만 측정)

세 가지 모델로 종합/직접/소환 BP RMSE 비교:
  모델 0: 베이스라인 (현 V_BIG3) — K_geunma 가 multiplier 항으로 직/소 양쪽 균일 곱
  모델 1: K_geunma 를 직접 BP 에만 적용 — 단순 직접 전용 분리. K_geunma_d 재학습
  모델 2: Cross-term — 근력 × 근마효율 % 항을 직접 attackBase 에 추가. K_geunma 항 제거. K_cross 학습
          (사용자 도메인 가설: 근마효율 효과는 근력에 비례)

실행: python simulate_geunma_models.py
"""

import json
import os
import sys

import numpy as np
from scipy.optimize import minimize

# ────────────────────────────────────────────────────────────────────
# 현 battlePower.js V_BIG3 파라미터
# ────────────────────────────────────────────────────────────────────
PHYS = dict(
    K0=1.48838356, K1=146.221296, K2=1.28057007, K_mon=0.404390549,
    D_crit=226.209973, D_dmg=1.94551489e-34, D_dom=188.920615,
    K_geunma=1.01531112e-3, D_pen=25.0, base=6.18437351e-42,
)
MAGIC = {**PHYS, 'K1': 147.548700}

SPLIT_U = 0.62744   # 근력 split   (직접 = K0    - u, 소환 = K0    + u)
SPLIT_V = 84.3042   # 공격력 split (직접 = K1    + v, 소환 = K1    - v)
SPLIT_W = 0.88663   # 고댐 split   (직접 = K2    - w, 소환 = K2    + w)
SPLIT_X = 0.15750   # 추가댐 split (직접 = K_mon - x, 소환 = K_mon + x)


def params_for(s):
    return MAGIC if s.get('type') == 'M' else PHYS


def attack_base(s, mode='avg', split=None):
    p = params_for(s)
    a, b, c, d = p['K0'], p['K1'], p['K2'], p['K_mon']
    u, v, w, x = split if split else (SPLIT_U, SPLIT_V, SPLIT_W, SPLIT_X)
    if mode == 'direct':
        a -= u; b += v; c -= w; d -= x
    elif mode == 'summon':
        a += u; b -= v; c += w; d += x
    추가댐 = s['일몬추'] + s['보몬추']
    return a * s['주스탯'] + b * s['공격력'] + c * s['고댐'] + d * 추가댐


def multiplier_no_geunma(s):
    """K_geunma 항 제외한 multiplier (직/소 공통)."""
    p = params_for(s)
    min_dmg = min(s['최소뎀'], s['최대뎀'])
    crit = 1 + s['크댐'] / p['D_crit']
    dmg = 1 + (min_dmg + s['최대뎀']) / p['D_dmg']
    dom = 1 + (s['일몬지'] + s['보몬지']) / p['D_dom']
    pen = 1 + s['관통'] / p['D_pen']
    return crit * dmg * dom * pen * p['base']


# ────────────────────────────────────────────────────────────────────
# 모델 0 — 베이스라인 (V_BIG3): K_geunma 균일 곱
# ────────────────────────────────────────────────────────────────────
def model0_bp(s):
    p = params_for(s)
    G = 1 + s['근마효율'] * p['K_geunma']
    M = multiplier_no_geunma(s) * G
    bp_d = attack_base(s, 'direct') * M
    bp_s = attack_base(s, 'summon') * M
    return (bp_d + bp_s) / 2, bp_d, bp_s


# ────────────────────────────────────────────────────────────────────
# 모델 1 — K_geunma 직접 전용 (cross-term 없음)
# ────────────────────────────────────────────────────────────────────
def model1_bp(s, K_g_direct, split=None):
    G = 1 + s['근마효율'] * K_g_direct
    M = multiplier_no_geunma(s)
    bp_d = attack_base(s, 'direct', split) * M * G
    bp_s = attack_base(s, 'summon', split) * M
    return (bp_d + bp_s) / 2, bp_d, bp_s


# ────────────────────────────────────────────────────────────────────
# 모델 2 — Cross-term (근력 × 근마효율%)
#   직접 attackBase 에 K_cross · 근력 · (근마효율/100) 추가, K_geunma 항 제거
# ────────────────────────────────────────────────────────────────────
def model2_bp(s, K_cross, split=None):
    M = multiplier_no_geunma(s)
    cross = K_cross * s['주스탯'] * (s['근마효율'] / 100.0)
    bp_d = (attack_base(s, 'direct', split) + cross) * M
    bp_s = attack_base(s, 'summon', split) * M
    return (bp_d + bp_s) / 2, bp_d, bp_s


# ────────────────────────────────────────────────────────────────────
# 모델 1·2 의 SPLIT 동시 재학습 버전
#   균형 손실: Σ(종합² + 직² + 소²)
#     ⚠ 이전 버전은 "직² + 소²" 만 최적화 → 종합 BP fit 시프트로 RMSE 0.33%→0.46% 악화
#     균형 손실로 종합 BP / split 둘 다 챙김
# ────────────────────────────────────────────────────────────────────
def train_with_split(model_fn, samples, x0_geunma, all_for_total=None):
    """5-param 학습: (K_geunma_or_cross, u, v, w, x). 종합+직+소 RMSE² 합 최소화.
    all_for_total: split 없지만 종합 BP 만 학습에 추가할 데이터 (일반화 강화용)."""
    extra = list(all_for_total) if all_for_total else []
    def loss(x):
        K_g, u, v, w, x_split = x
        e = []
        for s in samples:
            bp_total, bp_d, bp_s = model_fn(s, K_g, split=(u, v, w, x_split))
            e.append((bp_total - s['전투력']) / s['전투력'])
            e.append((bp_d - s['직접타격']) / s['직접타격'])
            e.append((bp_s - s['소환타격']) / s['소환타격'])
        for s in extra:
            bp_total, _, _ = model_fn(s, K_g, split=(u, v, w, x_split))
            e.append((bp_total - s['전투력']) / s['전투력'])
        return float(np.mean(np.array(e) ** 2))

    best = None
    for seed in range(50):
        rng = np.random.default_rng(seed)
        start = [
            x0_geunma * float(rng.uniform(0.3, 3.0)),
            SPLIT_U * float(rng.uniform(0.3, 2.5)),
            SPLIT_V * float(rng.uniform(0.3, 2.5)),
            SPLIT_W * float(rng.uniform(0.3, 2.5)),
            SPLIT_X * float(rng.uniform(0.3, 2.5)),
        ]
        r = minimize(loss, start, method='Nelder-Mead',
                     options={'xatol': 1e-12, 'fatol': 1e-15, 'maxiter': 50000})
        if best is None or r.fun < best.fun:
            best = r
    return best.x, best.fun


def evaluate_with_split(model_fn, K_g, split, samples):
    err_total = [(model_fn(s, K_g, split=split)[0] - s['전투력']) / s['전투력'] for s in samples]
    err_d = [(model_fn(s, K_g, split=split)[1] - s['직접타격']) / s['직접타격'] for s in samples]
    err_s = [(model_fn(s, K_g, split=split)[2] - s['소환타격']) / s['소환타격'] for s in samples]
    return rmse_pct(err_total), rmse_pct(err_d), rmse_pct(err_s)


# ────────────────────────────────────────────────────────────────────
# 학습 — 종합 BP RMSE 손실 함수
# ────────────────────────────────────────────────────────────────────
def train(model_fn, samples, x0):
    def loss(x):
        e = []
        for s in samples:
            bp, _, _ = model_fn(s, x[0])
            e.append((bp - s['전투력']) / s['전투력'])
        return float(np.mean(np.array(e) ** 2))
    best = None
    for seed in range(30):
        rng = np.random.default_rng(seed)
        scale = max(abs(x0), 1e-12)
        start = [x0 * float(rng.uniform(0.2, 5.0))]
        r = minimize(loss, start, method='Nelder-Mead',
                     options={'xatol': 1e-14, 'fatol': 1e-16, 'maxiter': 20000})
        if best is None or r.fun < best.fun:
            best = r
    return best.x[0], best.fun


def rmse_pct(errs):
    return float(np.sqrt(np.mean(np.array(errs) ** 2))) * 100.0


def evaluate(model_fn, args, all_samples, split_samples):
    err_total = [(model_fn(s, *args)[0] - s['전투력']) / s['전투력'] for s in all_samples]
    err_d = [(model_fn(s, *args)[1] - s['직접타격']) / s['직접타격'] for s in split_samples]
    err_s = [(model_fn(s, *args)[2] - s['소환타격']) / s['소환타격'] for s in split_samples]
    return rmse_pct(err_total), rmse_pct(err_d), rmse_pct(err_s)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'SAMPLE_DATA.json'), 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 근마효율>0 + 직접타격/소환타격 실측 모두 보유한 데이터만
    valid = [s for s in data
             if s.get('근마효율', 0) > 0
             and s.get('직접타격')
             and s.get('소환타격')]

    print('=' * 70)
    print(f'데이터: 근마효율>0 + 직타/소타 모두 보유 {len(valid)}건')
    print(f'  물리(P) {sum(1 for s in valid if s.get("type") == "P")}건, '
          f'마법(M) {sum(1 for s in valid if s.get("type") == "M")}건')
    print(f'  근마효율 분포: min={min(s["근마효율"] for s in valid)} '
          f'max={max(s["근마효율"] for s in valid)} '
          f'평균={sum(s["근마효율"] for s in valid)/len(valid):.1f}')
    print('=' * 70)

    # 종합 BP RMSE 학습/평가에 사용할 데이터셋 (= valid 통일)
    train_set = valid
    eval_set = valid

    # ── 모델 0 (베이스라인)
    r0 = evaluate(model0_bp, (), eval_set, eval_set)
    print(f'\n모델 0 (베이스라인 V_BIG3 — K_geunma 균일 곱)')
    print(f'  종합 RMSE: {r0[0]:.3f}%   직접 RMSE: {r0[1]:.3f}%   소환 RMSE: {r0[2]:.3f}%')

    # ── 모델 1 (K_geunma 직접 전용 재학습)
    K_g_d, _ = train(model1_bp, train_set, x0=PHYS['K_geunma'])
    r1 = evaluate(model1_bp, (K_g_d,), eval_set, eval_set)
    print(f'\n모델 1 (K_geunma 직접 전용 — K_geunma_d = {K_g_d:.6e})')
    print(f'  종합 RMSE: {r1[0]:.3f}%   직접 RMSE: {r1[1]:.3f}%   소환 RMSE: {r1[2]:.3f}%')
    print(f'  배율 (모델0 K_geunma 대비): ×{K_g_d / PHYS["K_geunma"]:.3f}')

    # ── 모델 2 (Cross-term: 근력 × 근마효율)
    # K_cross 초기값 대략 추정: K_geunma·근마효율 ≈ K_cross·근력·근마효율/100
    # → K_cross ≈ K_geunma · 100 / 근력 ≈ 1e-3 · 100 / 5e6 = 2e-8
    K_c, _ = train(model2_bp, train_set, x0=2e-8)
    r2 = evaluate(model2_bp, (K_c,), eval_set, eval_set)
    print(f'\n모델 2 (Cross-term 근력×근마효율% — K_cross = {K_c:.6e})')
    print(f'  종합 RMSE: {r2[0]:.3f}%   직접 RMSE: {r2[1]:.3f}%   소환 RMSE: {r2[2]:.3f}%')

    # 종합 BP 만 추가 학습할 데이터 (split 없지만 근마효율>0 인 케이스)
    extra_for_total = [s for s in data
                       if s.get('근마효율', 0) > 0
                       and not (s.get('직접타격') and s.get('소환타격'))]
    print(f'\n→ 종합 BP 추가 학습 셋: {len(extra_for_total)} 건 (split 없음, 근마효율>0)')
    print(f'  학습 신호 총합: split {len(train_set)}건×3 + total {len(extra_for_total)}건×1')

    # 54건 전체 종합 BP 평가 (회귀 테스트와 동일)
    full_total_set = [s for s in data if s.get('type') == 'P'] + [s for s in data if s.get('type') == 'M']

    # ── 모델 1+ (K_geunma 직접 전용 + SPLIT 동시 재학습)
    print('\n[학습 중] 모델 1+ (K_geunma 직접 전용 + SPLIT 4 재학습 — 균형 손실)...')
    x_1plus, _ = train_with_split(model1_bp, train_set, x0_geunma=PHYS['K_geunma'],
                                   all_for_total=extra_for_total)
    K_g1p, u1, v1, w1, x1 = x_1plus
    r1p = evaluate_with_split(model1_bp, K_g1p, (u1, v1, w1, x1), eval_set)
    err_full_1 = [(model1_bp(s, K_g1p, split=(u1, v1, w1, x1))[0] - s['전투력']) / s['전투력']
                   for s in full_total_set]
    rmse_full_1 = rmse_pct(err_full_1)
    print(f'모델 1+ — K_geunma_d={K_g1p:.4e}, u={u1:.4f}, v={v1:.4f}, w={w1:.4f}, x={x1:.4f}')
    print(f'  22건 — 종합 {r1p[0]:.3f}%  직 {r1p[1]:.3f}%  소 {r1p[2]:.3f}%  |  59건 종합 {rmse_full_1:.3f}%')

    # ── 모델 2+ (Cross-term + SPLIT 동시 재학습)
    print('\n[학습 중] 모델 2+ (Cross-term + SPLIT 4 재학습 — 균형 손실)...')
    x_2plus, _ = train_with_split(model2_bp, train_set, x0_geunma=2e-8,
                                   all_for_total=extra_for_total)
    K_c2p, u2, v2, w2, x2 = x_2plus
    r2p = evaluate_with_split(model2_bp, K_c2p, (u2, v2, w2, x2), eval_set)
    err_full_2 = [(model2_bp(s, K_c2p, split=(u2, v2, w2, x2))[0] - s['전투력']) / s['전투력']
                   for s in full_total_set]
    rmse_full_2 = rmse_pct(err_full_2)
    print(f'모델 2+ — K_cross={K_c2p:.4e}, u={u2:.4f}, v={v2:.4f}, w={w2:.4f}, x={x2:.4f}')
    print(f'  22건 — 종합 {r2p[0]:.3f}%  직 {r2p[1]:.3f}%  소 {r2p[2]:.3f}%  |  59건 종합 {rmse_full_2:.3f}%')

    # 모델 0 의 59건 종합 RMSE도 같이 비교
    err_full_0 = [(model0_bp(s)[0] - s['전투력']) / s['전투력'] for s in full_total_set]
    rmse_full_0 = rmse_pct(err_full_0)
    print(f'\n[참고] 모델 0 (베이스) 59건 종합 RMSE: {rmse_full_0:.3f}%')

    # ── 비교 표
    print('\n' + '=' * 70)
    print('비교 (RMSE %, 낮을수록 좋음)')
    print('=' * 70)
    print(f'{"":28s} {"종합":>8s} {"직접":>8s} {"소환":>8s}')
    print('-' * 70)
    print(f'{"모델 0 (베이스)":28s} {r0[0]:>7.3f}% {r0[1]:>7.3f}% {r0[2]:>7.3f}%')
    print(f'{"모델 1 (직접전용, K만)":28s} {r1[0]:>7.3f}% {r1[1]:>7.3f}% {r1[2]:>7.3f}%')
    print(f'{"모델 2 (cross, K만)":28s} {r2[0]:>7.3f}% {r2[1]:>7.3f}% {r2[2]:>7.3f}%')
    print(f'{"모델 1+ (직접전용 + SPLIT)":28s} {r1p[0]:>7.3f}% {r1p[1]:>7.3f}% {r1p[2]:>7.3f}%')
    print(f'{"모델 2+ (cross + SPLIT)":28s} {r2p[0]:>7.3f}% {r2p[1]:>7.3f}% {r2p[2]:>7.3f}%')
    print('-' * 70)
    print(f'{"Δ 모델1+ - 0":28s} {r1p[0]-r0[0]:>+7.3f}% {r1p[1]-r0[1]:>+7.3f}% {r1p[2]-r0[2]:>+7.3f}%')
    print(f'{"Δ 모델2+ - 0":28s} {r2p[0]-r0[0]:>+7.3f}% {r2p[1]-r0[1]:>+7.3f}% {r2p[2]-r0[2]:>+7.3f}%')
    print()
    print('해석:')
    print('  모델1·2 의 RMSE 가 모델0 보다 낮으면 → 사용자 가설(근마효율=직접 전용) 데이터 정합 ↑')
    print('  RMSE 가 비슷하면 → 데이터로는 구분 불가 (두 메커니즘 모두 표현 가능)')
    print('  RMSE 가 높으면  → 가설과 데이터 불일치, 또는 다른 메커니즘 필요')


if __name__ == '__main__':
    try:
        main()
    except FileNotFoundError as e:
        print(f'❌ {e}')
        sys.exit(1)
