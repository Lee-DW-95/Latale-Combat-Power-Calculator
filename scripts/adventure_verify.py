"""
수작업 판독한 어드벤처 칸 데이터 검산기

지도에서 눈으로 읽은 값을 adventure_maps.json 에 적어 넣으면,
이미지에서 자동 검출한 스프라이트 개수와 대조하고 검증식을 돌린다.

  검증식 1. 배수구 IN 칸번호 + 이동칸수 == OUT 칸번호
  검증식 2. 그 OUT 칸번호가 실제로 OUT 으로 판독된 칸인가
  대조    . ?카드 / OUT 개수가 이미지 자동 검출 결과와 일치하는가
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adventure_extract import load, find_qcards, find_outs   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def verify(stage, rec, im=None):
    errs, warns = [], []
    n = rec['squares']
    outs = {p['out'] for p in rec['portals']}

    for p in rec['portals']:
        if p['in'] + p['n'] != p['out']:
            errs.append(f"배수구 {p['in']}+{p['n']} != {p['out']}")
        if not (1 <= p['out'] <= n):
            errs.append(f"OUT {p['out']} 이 총 {n}칸을 벗어남")
        if p['in'] >= p['out']:
            errs.append(f"배수구 {p['in']} → {p['out']} 이 뒤로 감")
    for b in rec.get('bridges', []):
        if b['in'] + b['n'] != b['out']:
            errs.append(f"다리 {b['in']}+{b['n']} != {b['out']}")

    every = rec['q'] + list(outs) + rec.get('items', []) + rec.get('points', [])
    for s in every:
        if not (1 <= s <= n):
            errs.append(f"칸 번호 {s} 가 총 {n}칸을 벗어남')")
    dup = {s for s in every if every.count(s) > 1}
    if dup:
        errs.append(f'한 칸에 두 가지가 겹침: {sorted(dup)}')
    if rec.get('next') != n:
        warns.append(f"NEXT({rec.get('next')})가 마지막 칸({n})이 아님")

    if im is not None:
        nq, no = len(find_qcards(im)), len(find_outs(im))
        if nq != len(rec['q']):
            warns.append(f'?카드 판독 {len(rec["q"])}개 vs 이미지 검출 {nq}개')
        if no != len(outs):
            warns.append(f'OUT 판독 {len(outs)}개 vs 이미지 검출 {no}개')
    return errs, warns


def main():
    data = json.load(open(os.path.join(HERE, 'adventure_maps.json'), encoding='utf-8'))
    bad = 0
    for stage in sorted((k for k in data if k.isdigit()), key=int):
        rec = data[stage]
        path = os.path.join(ROOT, 'public', 'assets', 'adventure', f'map-{int(stage):02d}.webp')
        im = load(path) if os.path.exists(path) else None
        errs, warns = verify(stage, rec, im)
        mark = 'OK  ' if not errs else 'FAIL'
        if errs:
            bad += 1
        print(f"{mark} 지도{stage:>2}: {rec['squares']}칸 "
              f"? {len(rec['q'])}곳 배수구 {len(rec['portals'])} 다리 {len(rec.get('bridges', []))}")
        for e in errs:
            print('       ! ' + e)
        for w in warns:
            print('       ~ ' + w)
    total = len([k for k in data if k.isdigit()])
    print(f'\n판독 완료 {total}장 / 검증 실패 {bad}장')


if __name__ == '__main__':
    main()
