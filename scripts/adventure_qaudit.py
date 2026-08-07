"""
? 행운카드 전수 재검출 — 누락 감사용

기존 find_qcards 는 금색 '?' 글자의 색·크기 범위로 찾는다. 배경이 밝거나
카드가 캐릭터에 가리면 놓친다(실제로 map-48·51 은 0개로 나왔다).

여기서는 카드 스프라이트 통째를 템플릿으로 놓고 정규화 상호상관(NCC)으로 훑는다.
카드는 게임 UI 에셋이라 지도마다 픽셀이 거의 동일해서 상관계수가 매우 높게 나온다.

  python scripts/adventure_qaudit.py          # 56장 전부
  python scripts/adventure_qaudit.py 40 41    # 특정 지도만
"""

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# map-40 좌상단의 ? 카드 — 가림 없이 온전하게 그려져 있어 템플릿으로 적합하다
TPL_SRC = ('map-40', 53, 35, 103, 112)
THRESH = 0.62      # 이 값 이상이면 카드로 본다
MIN_GAP = 30       # 이보다 가까운 피크는 같은 카드로 묶는다


def gray(path):
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)
    return im[:, :, 0] * .299 + im[:, :, 1] * .587 + im[:, :, 2] * .114


def template():
    name, x0, y0, x1, y1 = TPL_SRC
    g = gray(os.path.join(ROOT, 'public', 'assets', 'adventure', f'{name}.webp'))
    return g[y0:y1, x0:x1]


def ncc(img, tpl):
    """정규화 상호상관 지도. 결과[y, x] 는 템플릿 좌상단이 (x, y) 일 때의 상관계수."""
    t = tpl - tpl.mean()
    tn = np.sqrt((t * t).sum())
    th, tw = tpl.shape

    num = fftconvolve(img, t[::-1, ::-1], mode='valid')

    ones = np.ones((th, tw))
    s1 = fftconvolve(img, ones, mode='valid')
    s2 = fftconvolve(img * img, ones, mode='valid')
    n = th * tw
    var = s2 - s1 * s1 / n
    var[var < 1e-9] = 1e-9
    return num / (np.sqrt(var) * tn)


def peaks(score, thresh=THRESH, gap=MIN_GAP):
    """임계값을 넘는 지역 최대점만 남긴다."""
    mx = ndi.maximum_filter(score, size=gap)
    ys, xs = np.nonzero((score >= thresh) & (score == mx))
    out = sorted(zip(score[ys, xs], xs, ys), reverse=True)

    kept = []
    for s, x, y in out:
        if any(abs(x - kx) < gap and abs(y - ky) < gap for _, kx, ky in kept):
            continue
        kept.append((s, x, y))
    return kept


def run(stages):
    tpl = template()
    th, tw = tpl.shape
    rec = json.load(open(os.path.join(HERE, 'adventure_maps.json'), encoding='utf-8'))

    report = {}
    for st in stages:
        img = gray(os.path.join(ROOT, 'public', 'assets', 'adventure', f'map-{st:02d}.webp'))
        found = peaks(ncc(img, tpl))
        # 템플릿 좌상단 → 카드 중심
        cards = sorted(((int(x + tw / 2), int(y + th / 2), round(float(s), 3))
                        for s, x, y in found), key=lambda c: (c[1], c[0]))
        n, r = len(cards), len(rec[str(st)]['q'])
        report[st] = {'cards': cards, 'ncc': n, 'rec': r}
        flag = '' if n == r else f'  <<< {n - r:+d}'
        print(f'map-{st:02d}  NCC {n:>2}  기록 {r:>2}{flag}')
        if n != r:
            print('        ', [(x, y, s) for x, y, s in cards])
    bad = [st for st, v in report.items() if v['ncc'] != v['rec']]
    print()
    print(f'불일치 {len(bad)}장: {bad}')
    json.dump(report, open(os.path.join(HERE, 'adventure_qaudit.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    return report


if __name__ == '__main__':
    args = [int(a) for a in sys.argv[1:]] or list(range(1, 57))
    run(args)
