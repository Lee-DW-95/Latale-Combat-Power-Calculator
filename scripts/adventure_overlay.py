"""
검출된 칸에 번호를 그려 넣은 오버레이 이미지 생성

칸 검출은 신뢰할 만하지만 '경로 순서'만 자동으로 못 정한다.
그래서 번호가 찍힌 그림을 사람이 보고 순서만 읽어 주면 된다.
읽은 순서는 adventure_order.json 에 칸 번호 나열로 적는다.

  python scripts/adventure_overlay.py 4 5 6      # 지도 4,5,6 오버레이 생성
"""

import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from adventure_extract import (   # noqa: E402
    analyze, load, load_templates, find_qcards, find_outs, find_next,
    find_digit_glyphs, group_numbers, classify_digits, assign_to_tiles,
)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.environ.get('ADV_OUT', HERE)


def mask_view(stage):
    """배경을 걷어내고 경로 윤곽선만 남긴 흑백 이미지."""
    import numpy as np
    from scipy import ndimage as ndi
    from adventure_extract import content_box, masks_at, _collect_at

    path = os.path.join(ROOT, 'public', 'assets', 'adventure', f'map-{stage:02d}.webp')
    im = load(path)
    y0, y1 = content_box(im)
    best = None
    for thr in (196, 206, 214, 222, 230, 238):
        tiles, _ = _collect_at(im, thr, y0, y1)
        if best is None or len(tiles) > best[0]:
            best = (len(tiles), thr)
    white, _ = masks_at(im, best[1], y0, y1)
    view = ndi.binary_closing(white, np.ones((5, 5)))
    dst = os.path.join(OUT, f'mk{stage:02d}.png')
    Image.fromarray((~view * 255).astype('uint8')).save(dst)
    return dst


def build(stage, scale=1.25):
    path = os.path.join(ROOT, 'public', 'assets', 'adventure', f'map-{stage:02d}.webp')
    im, tiles, _ = analyze(path, verbose=False)
    tpl = load_templates()

    mark = {}
    for i in assign_to_tiles(find_qcards(im), tiles):
        mark[i] = '?'
    for i in assign_to_tiles(find_outs(im), tiles):
        mark[i] = 'O'
    for i in assign_to_tiles(find_next(im), tiles):
        mark[i] = 'N'
    nums = {}
    for i, its in assign_to_tiles(
            classify_digits(group_numbers(find_digit_glyphs(im)), tpl), tiles).items():
        mark[i] = 'I'
        nums[i] = its[0]['value']

    img = Image.open(path).convert('RGB')
    d = ImageDraw.Draw(img)
    for i, t in enumerate(tiles):
        d.rectangle([t['x0'] + 4, t['y0'] + 4, t['x1'] - 4, t['y1'] - 4],
                    outline=(255, 0, 0), width=3)
        tag = f'{i}{mark.get(i, "")}'
        cx, cy = t['cx'], t['cy']
        d.rectangle([cx - 22, cy - 12, cx + 22, cy + 12], fill=(255, 255, 255))
        d.text((cx - 18, cy - 7), tag, fill=(200, 0, 0))
    img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
    dst = os.path.join(OUT, f'ov{stage:02d}.png')
    img.save(dst)

    # 윤곽선만 남긴 흑백 뷰 — 덩굴·석벽·스프라이트가 사라져 경로 구조가 그대로 보인다.
    # 칸이 이어졌는지 끊겼는지 판단할 때 이쪽이 훨씬 정확하다.
    mask_view(stage)

    info = {'stage': stage, 'tiles': len(tiles), 'marks': mark, 'nums': nums}
    print(f'지도{stage:>2}: 칸후보 {len(tiles)}개 → {dst}')
    print(f'   내용 {sorted((i, m) for i, m in mark.items())}')
    print(f'   +N   {sorted(nums.items())}')
    return info


if __name__ == '__main__':
    for a in sys.argv[1:]:
        build(int(a))
