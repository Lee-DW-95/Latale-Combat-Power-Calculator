"""
구간별 판독 결과를 하나로 병합

병렬 판독은 구간마다 별도 파일(adventure_maps_<시작>_<끝>.json)에 쓴다.
이 스크립트가 그것들을 adventure_maps.json 으로 합치고 충돌을 잡아낸다.

  python scripts/adventure_merge.py          # 병합 미리보기
  python scripts/adventure_merge.py --write  # 실제 병합
"""

import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(HERE, 'adventure_maps.json')


def main(write=False):
    base = json.load(open(BASE, encoding='utf-8'))
    parts = sorted(glob.glob(os.path.join(HERE, 'adventure_maps_*_*.json')))

    added, clashed = [], []
    for path in parts:
        data = json.load(open(path, encoding='utf-8'))
        for k, rec in data.items():
            if not k.isdigit():
                continue
            if k in base:
                # 같은 지도를 두 곳에서 판독했다면 값이 같은지 확인
                if json.dumps(base[k], sort_keys=True) != json.dumps(rec, sort_keys=True):
                    clashed.append((k, os.path.basename(path)))
                continue
            base[k] = rec
            added.append((int(k), os.path.basename(path)))

    for k, src in sorted(added):
        print(f'  + 지도{k:>2}  ({src})')
    for k, src in clashed:
        print(f'  ! 지도{k} 가 이미 있고 값이 다름 — {src} 는 무시함')

    have = sorted(int(k) for k in base if k.isdigit())
    missing = [n for n in range(1, 57) if n not in have]
    print(f'\n총 {len(have)}장 / 미판독 {len(missing)}장: {missing}')

    if write:
        json.dump(base, open(BASE, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f'\n{BASE} 갱신 완료')
    else:
        print('\n(미리보기 — 실제로 쓰려면 --write)')


if __name__ == '__main__':
    main('--write' in sys.argv)
