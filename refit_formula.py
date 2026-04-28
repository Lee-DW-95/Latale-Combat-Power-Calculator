"""
라테일 전투력 공식 재학습 스크립트
================================

SAMPLE_DATA.json에 새 데이터를 추가한 후 이 스크립트를 실행하면
새 파라미터를 도출하고 검증 결과를 보여줍니다.

실행 방법:
    python scripts/refit_formula.py

출력된 파라미터를 src/utils/battlePower.js의 PHYSICAL_PARAMS에 복사하세요.

요구사항:
    pip install numpy scipy
"""

import json
import os
import sys
import numpy as np
from scipy.optimize import minimize


def load_data():
    """SAMPLE_DATA.json 로드"""
    # 스크립트 위치에 관계없이 프로젝트 루트의 SAMPLE_DATA.json 찾기
    candidates = [
        'SAMPLE_DATA.json',
        '../SAMPLE_DATA.json',
        os.path.join(os.path.dirname(__file__), '..', 'SAMPLE_DATA.json'),
    ]
    for p in candidates:
        if os.path.exists(p):
            with open(p, 'r', encoding='utf-8') as f:
                return json.load(f)
    raise FileNotFoundError('SAMPLE_DATA.json을 찾을 수 없습니다.')


def model_rich(d, p):
    """V_RICH 모델"""
    base = (
        d['주스탯']
        + d['공격력'] * p[0]
        + d['고댐'] * p[1]
        + (d['최소뎀'] + d['최대뎀']) * p[2]
    )
    if base <= 0:
        return 0
    return (
        base
        * (1 + d['크댐'] / p[3])
        * (1 + (d['일몬지'] + d['보몬지']) / p[4])
        * (1 + d['근마효율'] * p[5])
        * p[6]
    )


def loss(p, dataset):
    """RMSE 손실 함수 (양수 제약)"""
    if any(x <= 0 for x in p):
        return 1e10
    err = 0
    for d in dataset:
        pred = model_rich(d, p)
        if pred <= 0:
            return 1e10
        err += ((pred - d['전투력']) / d['전투력']) ** 2
    return err


def optimize(dataset, n_starts=500):
    """다중 시작점으로 최적 파라미터 탐색"""
    best_loss = float('inf')
    best_params = None
    for s in range(n_starts):
        np.random.seed(s)
        x0 = [
            np.random.uniform(80, 200),       # K1
            np.random.uniform(0.01, 5),       # K2
            np.random.uniform(0.001, 1),      # K3
            np.random.uniform(20, 200),       # D_crit
            np.random.uniform(30, 300),       # D_dom
            np.random.uniform(0.001, 0.05),   # K_geunma
            np.random.uniform(1e-7, 1e-3),    # base
        ]
        r = minimize(
            loss,
            x0,
            args=(dataset,),
            method='Nelder-Mead',
            options={'maxiter': 20000, 'xatol': 1e-12},
        )
        if r.fun < best_loss:
            best_loss = r.fun
            best_params = r.x
    return best_params, best_loss


def print_results(params, dataset, label='물리'):
    """결과 출력"""
    rmse = np.sqrt(loss(params, dataset) / len(dataset)) * 100
    print(f'\n{"="*70}')
    print(f'{label} 직업 학습 결과 (데이터 {len(dataset)}개)')
    print(f'{"="*70}')
    print(f'\nRMSE: {rmse:.4f}%\n')

    print('JavaScript용 파라미터 (battlePower.js에 복사):')
    print('-' * 70)
    print('export const PHYSICAL_PARAMS = Object.freeze({')
    print(f'  K1: {params[0]:.6f},')
    print(f'  K2: {params[1]:.6f},')
    print(f'  K3: {params[2]:.6f},')
    print(f'  D_crit: {params[3]:.6f},')
    print(f'  D_dom: {params[4]:.6f},')
    print(f'  K_geunma: {params[5]:.8f},')
    print(f'  base: {params[6]:.12e},')
    print('});')

    print('\n검증 결과:')
    print('-' * 70)
    over_5 = 0
    for d in dataset:
        pred = model_rich(d, params)
        err = (pred - d['전투력']) / d['전투력'] * 100
        marker = '✓' if abs(err) < 2 else ('⚠' if abs(err) < 5 else '✗')
        if abs(err) >= 5:
            over_5 += 1
        print(
            f'  {marker} {d["name"]:25s}: 예측 {pred:>12,.0f}, 실제 {d["전투력"]:>10,}, 오차 {err:+7.2f}%'
        )

    print(f'\n5% 초과 오차: {over_5}/{len(dataset)}')
    if over_5 == 0:
        print('🎉 모든 데이터가 5% 이내 오차 - 매우 좋은 학습 결과!')
    elif over_5 / len(dataset) < 0.2:
        print('✅ 대부분 5% 이내 오차 - 양호한 학습 결과')
    else:
        print('⚠️ 5% 초과 오차가 많습니다. 데이터 품질 또는 모델 형태 검토 필요')


def main():
    print('라테일 전투력 공식 재학습')
    print('=' * 70)

    data = load_data()
    print(f'\n총 데이터: {len(data)}개')

    physical = [d for d in data if d['type'] == 'P']
    magic = [d for d in data if d['type'] == 'M']
    print(f'  - 물리: {len(physical)}개')
    print(f'  - 마법: {len(magic)}개')

    if len(physical) < 5:
        print('\n⚠️  물리 데이터가 5개 미만이라 학습이 불안정할 수 있습니다.')

    print('\n학습 시작... (수십 초 소요)')

    # 물리 학습
    params_p, _ = optimize(physical, n_starts=500)
    print_results(params_p, physical, '물리')

    # 마법은 데이터 충분할 때만 별도 학습
    if len(magic) >= 5:
        print('\n\n마법 직업 별도 학습 시작...')
        params_m, _ = optimize(magic, n_starts=500)
        print_results(params_m, magic, '마법')

        print('\n\n💡 마법 직업 데이터가 충분하므로 battlePower.js의 MAGIC_PARAMS를')
        print('   별도로 업데이트하는 것을 권장합니다.')
    else:
        print(f'\n\n📌 마법 데이터가 {len(magic)}개로 부족합니다. (5개 이상 권장)')
        print('   당분간 MAGIC_PARAMS는 PHYSICAL_PARAMS와 동일하게 유지하세요.')

    print('\n작업 완료. 위의 파라미터를 src/utils/battlePower.js에 복사하세요.')


if __name__ == '__main__':
    try:
        main()
    except FileNotFoundError as e:
        print(f'❌ {e}')
        sys.exit(1)
    except Exception as e:
        print(f'❌ 오류 발생: {e}')
        sys.exit(1)
