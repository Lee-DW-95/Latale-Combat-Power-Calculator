// T창 인식 템플릿 만들기 — 샘플 캡처에서 창 위치를 찾는 고정 라벨 이미지(좌 "크리티컬 확률", 우 "근력/마법력 효율")를 뽑는다.
//   node scripts/build_tchang_templates.mjs   → src/data/tchangTemplates.json
// 게임 UI 가 바뀌어 창을 못 찾게 되면 새 캡처를 tests/fixtures/tchang-sample.png 로 바꾸고 LAYOUT 좌표를 맞춘 뒤 다시 돌린다.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { LAYOUT, cutPatch, locatePanel } from '../src/utils/tchangOcr.js';

const png = PNG.sync.read(readFileSync('tests/fixtures/tchang-sample.png'));
const img = { width: png.width, height: png.height, data: png.data };
const patches = {
  L: { anchor: cutPatch(img, LAYOUT.L.anchor), check: cutPatch(img, LAYOUT.L.check) },
  R: { anchor: cutPatch(img, LAYOUT.R.anchor), check: cutPatch(img, LAYOUT.R.check) },
};
for (const side of ['L', 'R']) {
  const pos = locatePanel(img, side, patches);
  if (!pos || pos.dx !== 0 || pos.dy !== 0) throw new Error(`${side} 창 자기 검증 실패: ${JSON.stringify(pos)}`);
}
writeFileSync('src/data/tchangTemplates.json', JSON.stringify({ patches }));
console.log('src/data/tchangTemplates.json 저장 (라벨 이미지 4개)');
