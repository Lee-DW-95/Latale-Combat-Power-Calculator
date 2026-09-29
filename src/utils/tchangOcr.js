// @ts-check
/**
 * T창 캡처 인식 — 순수 함수 (DOM 없음). 브라우저는 canvas ImageData, 테스트는 raw RGBA 로 같은 코드를 쓴다.
 *
 * T창은 배치가 고정이라 "글자를 읽어 항목을 찾는" 대신 "정해진 자리의 숫자만" 읽는다.
 *   1) 창 위치: 창마다 고정 라벨 이미지(좌 "크리티컬 확률", 우 "근력/마법력 효율")를 캡처에서
 *      패턴 매칭(NCC)으로 찾고, 두 번째 라벨이 예상 자리에 있는지로 확인한다.
 *   2) 숫자 칸: 샘플 좌표(LAYOUT) + 창 위치로 칸을 자른다.
 *   3) 숫자 읽기: 칸을 확대·반전한 회색 이미지로 만들어(cellGray) 호출부가 OCR(Tesseract)에 넘긴다.
 *      확대 배율·대비를 바꿔 여러 번 읽고 다수결(vote)로 정한다.
 *      (게임 글자가 소수 픽셀 위치로 그려져 같은 숫자도 번짐이 달라, 자체 글자 템플릿은 일반화가 안 됐다)
 *   4) 형식(parseValue)·교차 검증(crossCheck)이 맞는 값만 채운다 — 틀리면 입력칸을 건드리지 않는다.
 *
 * 라벨 이미지는 src/data/tchangTemplates.json — scripts/build_tchang_templates.mjs 로 샘플 캡처에서 만든다.
 */

/** @typedef {{ width:number, height:number, data: Uint8ClampedArray|Uint8Array }} RGBAImage */
/** @typedef {{ w:number, h:number, px:number[] }} Patch */

// ── 샘플 캡처(684×576, 좌=능력치 세부정보, 우=추가 세부정보) 기준 좌표 ──
//   anchor/check = 창 위치를 찾는 고정 라벨 영역,  val = 숫자 칸 [x0, y0, x1, y1] (두 칸이면 물리·마법)
export const LAYOUT = {
  L: {
    title: '능력치 세부정보',
    anchor: [21, 262, 89, 273], // "크리티컬 확률"
    check: [21, 440, 89, 451], // "몬스터 지배력"
    rows: {
      전투력: { val: [[168, 54, 236, 69]], fmt: 'int' },
      근력: { val: [[80, 91, 138, 105]], fmt: 'int' },
      마법력: { val: [[80, 121, 138, 136]], fmt: 'int' },
      무기공격력: { val: [[238, 127, 330, 142]], fmt: 'range' },
      속성력: { val: [[238, 144, 330, 160]], fmt: 'int' },
      관통력: { val: [[160, 243, 224, 258], [250, 243, 317, 258]], fmt: 'int', max: 100, spaced: true },
      크댐: { val: [[160, 277, 224, 292], [250, 277, 317, 292]], fmt: 'int' },
      최소: { val: [[160, 293, 224, 308], [250, 293, 317, 308]], fmt: 'int' },
      최대: { val: [[160, 310, 224, 325], [250, 310, 317, 325]], fmt: 'int' },
      백어택: { val: [[160, 327, 224, 342], [250, 327, 317, 342]], fmt: 'int', spaced: true },
      고댐: { val: [[160, 343, 224, 358], [250, 343, 317, 358]], fmt: 'int' },
      추가: { val: [[160, 422, 224, 437], [250, 422, 317, 437]], fmt: 'int' },
      지배력: { val: [[160, 438, 224, 454], [250, 438, 317, 454]], fmt: 'dec', max: 1000 },
    },
  },
  R: {
    title: '추가 세부정보',
    anchor: [364, 379, 449, 391], // "근력/마법력 효율"
    check: [390, 66, 438, 79], // "직접 타격" — 기준 라벨과 멀어야(311px) 배율이 정확하다
    rows: {
      // T창 직접·소환 전투력 (물리·마법) — 입력칸은 없고, 읽은 값으로 계산한 전투력을 검산하는 데 쓴다
      직접: { val: [[505, 65, 570, 80], [610, 65, 672, 80]], fmt: 'int' },
      소환: { val: [[505, 83, 570, 98], [610, 83, 672, 98]], fmt: 'int' },
      근력: { val: [[500, 115, 568, 130]], fmt: 'plus' },
      마법력: { val: [[500, 135, 568, 150]], fmt: 'plus' },
      무기공격력: { val: [[478, 216, 574, 231]], fmt: 'range' },
      속성력: { val: [[500, 232, 568, 247]], fmt: 'plus' },
      일추: { val: [[500, 249, 568, 264]], fmt: 'plus' },
      보추: { val: [[500, 265, 568, 280]], fmt: 'plus' },
      크댐: { val: [[484, 311, 574, 326], [588, 311, 676, 326]], fmt: 'plusPct' },
      최소: { val: [[484, 328, 574, 343], [588, 328, 676, 343]], fmt: 'plusPct' },
      최대: { val: [[484, 344, 574, 359], [588, 344, 676, 359]], fmt: 'plusPct' },
      고댐: { val: [[484, 361, 574, 376], [588, 361, 676, 376]], fmt: 'plusPct' },
      효율: { val: [[538, 377, 574, 392], [640, 377, 676, 392]], fmt: 'pct', max: 300 },
      근거리: { val: [[550, 405, 586, 420]], fmt: 'int', spaced: true },
      상태: { val: [[550, 422, 586, 437]], fmt: 'int', spaced: true },
    },
  },
};

// ── 밝기 ──
/** 픽셀 밝기 = max(R,G,B) — 글자는 흰색·연두·노랑이라 채널 최댓값이 배경보다 확실히 높다 */
function lum(img, x, y) {
  const i = (y * img.width + x) * 4;
  return Math.max(img.data[i], img.data[i + 1], img.data[i + 2]);
}

/**
 * 샘플 영역 → 패치 (배율 s 로 축소·확대한 밝기 격자)
 * @param {RGBAImage} img
 */
export function cutPatch(img, [x0, y0, x1, y1]) {
  const w = x1 - x0;
  const h = y1 - y0;
  const px = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(lum(img, x0 + x, y0 + y));
  return { w, h, px };
}

const gridCache = new WeakMap();
/** 밝기 격자 (전체 이미지, 배율 step 으로 건너뛰며) — 같은 이미지는 한 번만 만든다 */
function lumGrid(img, step) {
  let m = gridCache.get(img);
  if (!m) gridCache.set(img, (m = new Map()));
  if (!m.has(step)) m.set(step, buildLumGrid(img, step));
  return m.get(step);
}
function buildLumGrid(img, step) {
  const w = Math.floor(img.width / step);
  const h = Math.floor(img.height / step);
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = lum(img, x * step, y * step);
  // 적분 영상 (합·제곱합) — 창 평균·분산을 O(1) 로
  const W1 = w + 1;
  const S = new Float64Array(W1 * (h + 1));
  const S2 = new Float64Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) {
    let r = 0;
    let r2 = 0;
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x];
      r += v;
      r2 += v * v;
      S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + r;
      S2[(y + 1) * W1 + x + 1] = S2[y * W1 + x + 1] + r2;
    }
  }
  return { w, h, g, S, S2 };
}

/** 패치 → 평균 0·분산 1 로 정규화 (배율 step 으로 건너뛰며) */
function normPatch(p, step, ox = 0, oy = 0) {
  const w = Math.floor((p.w - ox) / step);
  const h = Math.floor((p.h - oy) / step);
  const v = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) v[y * w + x] = p.px[(oy + y * step) * p.w + ox + x * step];
  let m = 0;
  for (const a of v) m += a;
  m /= v.length;
  let sd = 0;
  for (let i = 0; i < v.length; i++) {
    v[i] -= m;
    sd += v[i] * v[i];
  }
  sd = Math.sqrt(sd) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= sd;
  return { w, h, v };
}

/** 한 위치의 정규화 상호상관 (-1~1). 패치는 평균 0 이라 Σ(g−m)p = Σg·p, 분산은 적분 영상으로. */
function nccAt(G, P, ox, oy) {
  const n = P.w * P.h;
  const W1 = G.w + 1;
  const a = oy * W1 + ox;
  const b = oy * W1 + ox + P.w;
  const c = (oy + P.h) * W1 + ox;
  const d = (oy + P.h) * W1 + ox + P.w;
  const sum = G.S[d] - G.S[b] - G.S[c] + G.S[a];
  const sum2 = G.S2[d] - G.S2[b] - G.S2[c] + G.S2[a];
  const varSum = sum2 - (sum * sum) / n;
  if (varSum <= 1e-6 * n) return 0; // 단색 영역
  let num = 0;
  for (let y = 0; y < P.h; y++) {
    const row = (oy + y) * G.w + ox;
    const prow = y * P.w;
    for (let x = 0; x < P.w; x++) num += G.g[row + x] * P.v[prow + x];
  }
  return num / Math.sqrt(varSum);
}

/**
 * 패치 찾기 — 2배 성긴 격자로 전체를 훑고, 상위 후보 주변을 원래 해상도로 다듬는다.
 * @returns {{x:number, y:number, score:number}[]} 점수 높은 순 (서로 떨어진 후보)
 */
export function findPatch(img, patch, { top = 3, region = null } = {}) {
  const coarse = 2;
  const Gc = lumGrid(img, coarse);
  // 성긴 격자는 패치와 1px 어긋날 수 있어 패치 위상 4가지를 모두 대본다
  const phases = [0, 1].flatMap((oy) => [0, 1].map((ox) => ({ ox, oy, P: normPatch(patch, coarse, ox, oy) })));
  const Pc = phases[0].P;
  const [rx0, ry0, rx1, ry1] = region
    ? region.map((v) => Math.floor(v / coarse))
    : [0, 0, Gc.w, Gc.h];
  const cands = [];
  for (let y = Math.max(0, ry0); y <= Math.min(Gc.h - Pc.h, ry1); y++) {
    for (let x = Math.max(0, rx0); x <= Math.min(Gc.w - Pc.w, rx1); x++) {
      let s = -1;
      let ph = phases[0];
      for (const f of phases) {
        if (x + f.P.w > Gc.w || y + f.P.h > Gc.h) continue;
        const v = nccAt(Gc, f.P, x, y);
        if (v > s) {
          s = v;
          ph = f;
        }
      }
      if (s > 0.5) cands.push({ x: x * coarse - ph.ox, y: y * coarse - ph.oy, s });
    }
  }
  cands.sort((a, b) => b.s - a.s);
  const picked = [];
  for (const c of cands) {
    if (picked.length >= top * 5) break;
    if (picked.some((p) => Math.abs(p.x - c.x) < patch.w && Math.abs(p.y - c.y) < patch.h)) continue;
    picked.push(c);
  }
  const G = lumGrid(img, 1);
  const P = normPatch(patch, 1);
  const out = [];
  for (const c of picked) {
    let best = { x: 0, y: 0, score: -1 };
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 0 || y < 0 || x + P.w > G.w || y + P.h > G.h) continue;
        const s = nccAt(G, P, x, y);
        if (s > best.score) best = { x, y, score: s };
      }
    }
    out.push(best);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, top);
}

/** 원래 해상도로 작은 창 안을 전부 대 보고 가장 잘 맞는 자리 */
function bestInWindow(img, patch, x0, y0, x1, y1) {
  const G = lumGrid(img, 1);
  const P = normPatch(patch, 1);
  let best = { x: 0, y: 0, score: -1 };
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(G.h - P.h, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(G.w - P.w, Math.round(x1)); x++) {
      const sc = nccAt(G, P, x, y);
      if (sc > best.score) best = { x, y, score: sc };
    }
  }
  return best;
}

/** 창 위치 판정 기준 — 흐릿하거나 살짝 확대된 캡처(점수 0.63~0.9)도 받되, 두 라벨이 모두 맞아야 인정 */
const MATCH_MIN = 0.6;

/**
 * 창 위치 찾기 → 샘플 좌표를 캡처 좌표로 바꾸는 변환 { dx, dy, s, ox, oy } (못 찾으면 null)
 *   캡처 좌표 = (샘플 좌표 − 기준 라벨) × s + 찾은 기준 라벨.  s 는 두 라벨의 세로 간격 비 —
 *   캡처 도구가 이미지를 1~5% 늘리거나 줄여도 칸이 어긋나지 않게.
 * @param {RGBAImage} img
 * @param {'L'|'R'} side
 * @param {{ L:{anchor:Patch, check:Patch}, R:{anchor:Patch, check:Patch} }} patches
 */
export function locatePanel(img, side, patches) {
  const lay = LAYOUT[side];
  const p = patches[side];
  const gap = lay.check[1] - lay.anchor[1];
  for (const c of findPatch(img, p.anchor)) {
    if (c.score < MATCH_MIN) continue;
    // 두 번째 라벨은 예상 자리에서 배율 ±6% 범위 안에 있어야 한다
    const dxGap = lay.check[0] - lay.anchor[0];
    const cx = c.x + dxGap;
    const cy = c.y + gap;
    const v = bestInWindow(img, p.check, cx - 4 - Math.abs(dxGap) * 0.06, cy - Math.abs(gap) * 0.06, cx + 4 + Math.abs(dxGap) * 0.06, cy + Math.abs(gap) * 0.06);
    if (v.score < MATCH_MIN) continue;
    const s = (v.y - c.y) / gap;
    return { dx: c.x - lay.anchor[0], dy: c.y - lay.anchor[1], s, ox: c.x, oy: c.y, score: Math.min(c.score, v.score) };
  }
  return null;
}

/** 샘플 좌표 상자 → 캡처 좌표 상자 */
export function mapBox(side, pos, b) {
  const [ax, ay] = LAYOUT[side].anchor;
  return [pos.ox + (b[0] - ax) * pos.s, pos.oy + (b[1] - ay) * pos.s, pos.ox + (b[2] - ax) * pos.s, pos.oy + (b[3] - ay) * pos.s];
}

// ── 숫자 칸 → OCR 입력 이미지 ──

/**
 * 칸 잘라 k 배 bicubic(Catmull-Rom) 확대 → RGBA. 브라우저 캔버스 보간은 브라우저마다 달라서,
 * 조합을 찾은 시험 환경과 똑같은 결과가 나오도록 직접 계산한다.
 * @param {RGBAImage} img
 * @returns {{ data: Uint8ClampedArray, w: number, h: number }}
 */
export function cropUpscale(img, box, k) {
  const x0 = Math.max(0, Math.round(box[0]));
  const y0 = Math.max(0, Math.round(box[1]));
  const sw = Math.max(1, Math.min(img.width, Math.round(box[2])) - x0);
  const sh = Math.max(1, Math.min(img.height, Math.round(box[3])) - y0);
  const w = sw * k;
  const h = sh * k;
  const cub = (t) => {
    const a = Math.abs(t);
    if (a <= 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
    if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
    return 0;
  };
  const px = (x, y, c) => {
    const xx = Math.min(sw - 1, Math.max(0, x)) + x0;
    const yy = Math.min(sh - 1, Math.max(0, y)) + y0;
    return img.data[(yy * img.width + xx) * 4 + c];
  };
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / k - 0.5;
    const iy = Math.floor(fy);
    const wy = [cub(fy - (iy - 1)), cub(fy - iy), cub(fy - (iy + 1)), cub(fy - (iy + 2))];
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / k - 0.5;
      const ix = Math.floor(fx);
      const wx = [cub(fx - (ix - 1)), cub(fx - ix), cub(fx - (ix + 1)), cub(fx - (ix + 2))];
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let j = 0; j < 4; j++) {
          let row = 0;
          for (let i = 0; i < 4; i++) row += wx[i] * px(ix - 1 + i, iy - 1 + j, c);
          v += wy[j] * row;
        }
        out[(y * w + x) * 4 + c] = v;
      }
      out[(y * w + x) * 4 + 3] = 255;
    }
  }
  return { data: out, w, h };
}

/**
 * 확대된 칸 RGBA → OCR 용 회색 (검은 글자 / 흰 배경). 글자는 배경보다 밝으므로 밝기 = max(R,G,B) 를 반전한다.
 *   배경 = 칸 밝기 중앙값, off = 배경에서 얼마나 밝아야 글자로 볼지, gamma = 획 굵기 조절.
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @returns {Uint8ClampedArray} RGBA (회색)
 */
export function cellGray(rgba, w, h, off = 10, gamma = 1) {
  const n = w * h;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  const sorted = Array.from(v).sort((a, b) => a - b);
  const bg = sorted[Math.floor(n * 0.5)] ?? 0;
  const span = Math.max(20, 255 - bg - off);
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (v[i] - bg - off) / span));
    const g = Math.round(255 * (1 - t ** gamma));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * 회색 칸 → 글자 경계에 맞춰 자르기 (여백 = 확대 배율 × 2px). 짧은 숫자("98")가 넓은 빈 배경 속에 있으면
 * OCR 이 빈 결과를 내기 쉬워서 글자만 남긴다.
 * @param {Uint8ClampedArray} gray  cellGray 결과 (RGBA)
 */
export function trimGray(gray, w, h, k = 1) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[(y * w + x) * 4] < 128) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { data: gray, w, h };
  const m = Math.round(k * 2);
  x0 = Math.max(0, x0 - m);
  y0 = Math.max(0, y0 - m);
  x1 = Math.min(w - 1, x1 + m);
  y1 = Math.min(h - 1, y1 + m);
  const nw = x1 - x0 + 1;
  const nh = y1 - y0 + 1;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(gray.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * nw * 4);
  return { data: out, w: nw, h: nh };
}

/**
 * 선명화 (언샤프 마스크) — 흐릿하거나 확대·압축된 캡처에서 번진 획(7 의 윗가로획 등)을 되살린다.
 *   결과 = 원본 + amount × (원본 − 흐린 원본), 흐림은 반지름 r 상자 평균. 회색 RGBA 를 받아 회색 RGBA 로.
 * @param {Uint8ClampedArray} gray
 */
export function sharpenGray(gray, w, h, amount = 1, r = 2) {
  if (!amount) return gray;
  const n = w * h;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = gray[i * 4];
  const box = (src, dst, len, stride, count, step) => {
    for (let line = 0; line < count; line++) {
      const base = line * step;
      let acc = 0;
      let cnt = 0;
      for (let i = -r; i < len; i++) {
        if (i + r < len) {
          acc += src[base + (i + r) * stride];
          cnt += 1;
        }
        if (i - r - 1 >= 0) {
          acc -= src[base + (i - r - 1) * stride];
          cnt -= 1;
        }
        if (i >= 0) dst[base + i * stride] = acc / cnt;
      }
    }
  };
  const tmp = new Float32Array(n);
  const blur = new Float32Array(n);
  box(v, tmp, w, 1, h, w); // 가로
  box(tmp, blur, h, w, w, 1); // 세로
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, Math.min(255, Math.round(v[i] + amount * (v[i] - blur[i]))));
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** 게임 숫자 폰트의 글자 간격 (원본 픽셀) — 글자 5px + 사이 1px */
const DIGIT_PITCH = 6;

/**
 * 붙은 숫자 떼어 놓기 — "99" 처럼 두 글자가 가운데 열을 공유하면 OCR 이 "93" 으로 읽는다.
 * 글자 폭(6px 간격)으로 개수를 정하고, 균등 위치 근처의 가장 옅은 열에서 잘라 사이를 벌린다.
 * 쉼표가 없는 짧은 정수 칸(관통력·백어택 등)에만 쓴다.
 * @param {Uint8ClampedArray} gray  cellGray 결과 (RGBA)
 * @param {number} k  확대 배율
 */
export function spaceDigits(gray, w, h, k) {
  const ink = new Float32Array(w);
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = 255 - gray[(y * w + x) * 4];
      ink[x] += d;
      if (d > 127) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { data: gray, w, h };
  const bw = x1 - x0 + 1;
  const n = Math.max(1, Math.round((bw / k + 1) / DIGIT_PITCH));
  const cuts = [x0];
  for (let i = 1; i < n; i++) {
    const c = x0 + Math.round((bw * i) / n);
    let best = c;
    for (let x = Math.max(x0 + 1, c - k); x <= Math.min(x1 - 1, c + k); x++) if (ink[x] < ink[best]) best = x;
    cuts.push(best);
  }
  cuts.push(x1 + 1);
  const gap = 3 * k;
  const nw = bw + gap * (n + 1);
  const top = Math.max(0, y0 - 2 * k);
  const nh = Math.min(h, y1 + 2 * k + 1) - top;
  const out = new Uint8ClampedArray(nw * nh * 4).fill(255);
  let left = gap;
  for (let i = 0; i < n; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    for (let y = 0; y < nh; y++) {
      for (let x = a; x < b; x++) {
        const si = ((top + y) * w + x) * 4;
        const di = (y * nw + left + (x - a)) * 4;
        out[di] = gray[si];
        out[di + 1] = gray[si + 1];
        out[di + 2] = gray[si + 2];
      }
    }
    left += b - a + gap;
  }
  return { data: out, w: nw, h: nh };
}

/**
 * 한 칸을 여러 조건으로 읽는 조합 — [확대 배율, off, gamma, 선명화]. 앞 3개가 합의하면 나머지는 생략.
 * 캡처 5장(원본 2 · 흐린 캡처 3) × 108조합 격자 탐색(확대는 cropUpscale — 브라우저와 동일) 상위를
 * 선명화 유무가 섞이게 골랐다. 선명화는 흐린 캡처의 7→1 혼동을 줄인다. 2026-09-29.
 */
export const READ_VARIANTS = [
  [3, 0, 0.7, 1],
  [3, 10, 1, 0],
  [3, 0, 0.7, 2],
  [4, 10, 0.55, 1],
  [3, 10, 0.55, 0],
  [5, 0, 0.7, 2],
  [4, 0, 0.7, 0],
];

/** 짧은 정수 칸(spaceDigits 적용) 조합 — 같은 탐색 상위 (원본 8/8 · 흐림 10~11/12) */
export const READ_VARIANTS_SPACED = [
  [3, 10, 0.55, 0],
  [4, 10, 0.55, 2],
  [5, 10, 0.55, 1],
  [3, 0, 0.7, 1],
  [3, 10, 0.7, 0],
  [4, 20, 0.55, 0],
  [5, 10, 0.7, 2],
];

/** OCR 원문 정리 — 공백·쉼표·마침표 제거 (쉼표는 3자리 규칙, 소수점은 형식 규칙으로 복원) */
export const cleanOcr = (t) => String(t || '').replace(/[\s,.]/g, '');

/**
 * 다수결 — 형식에 맞는 읽기만 표로 센다
 * @param {string[]} texts cleanOcr 한 문자열들
 * @param {string} fmt
 * @param {number} [max] 값 상한 (관통력 100 등)
 * @returns {{ text:string, votes:number, total:number }|null}
 */
export function vote(texts, fmt, max = Infinity) {
  const tally = new Map();
  let total = 0;
  for (const t of texts) {
    const v = t ? parseValue(t, fmt) : null;
    if (v === null || (typeof v === 'number' && v > max)) continue; // 형식·범위 밖은 오인식
    total += 1;
    tally.set(t, (tally.get(t) || 0) + 1);
  }
  const best = [...tally].sort((a, b) => b[1] - a[1])[0];
  return best ? { text: best[0], votes: best[1], total } : null;
}

// ── 문자열 → 숫자 (형식이 맞을 때만) ──
//   해독 문자열에는 쉼표·마침표가 없다 (숫자와 + ~ / % 만). 쉼표는 3자리 묶음이 규칙이라 필요 없고,
//   지배력의 소수점은 "끝 한 자리가 소수" 규칙으로 복원한다.
const num = (s) => (/^\d{1,10}$/.test(s) ? Number(s) : null);

/** "+6718/46%" → 46 (교차 검증용) */
export function pctOf(text) {
  const m = cleanOcr(text).match(/\/(\d{1,3})%$/);
  return m ? Number(m[1]) : null;
}

/** 형식별 파싱. 형식이 어긋나면 null (자동 입력하지 않음). */
export function parseValue(text, fmt) {
  const t = cleanOcr(text);
  if (!t || t.includes('?')) return null;
  if (fmt === 'int') return num(t);
  if (fmt === 'dec') {
    const n = num(t);
    return n !== null && t.length >= 2 ? n / 10 : null;
  }
  if (fmt === 'plus') return t.startsWith('+') ? num(t.slice(1)) : null;
  if (fmt === 'plusPct') {
    const m = t.match(/^\+(\d+)\/(\d{1,3})%$/);
    return m ? Number(m[1]) : null;
  }
  if (fmt === 'pct') {
    const m = t.match(/^(\d{1,3})%$/);
    return m ? Number(m[1]) : null;
  }
  if (fmt === 'range') {
    const m = t.match(/^\+?(\d+)~\+?(\d+)$/);
    if (!m) return null;
    // 기본 무기공 폭이 15 미만이면 게임이 범위를 역순으로 표시한다 (예: 52,179 ~ 52,169) — 표시 순서 그대로
    const a = Number(m[1]);
    const b = Number(m[2]);
    return Math.abs(a - b) <= Math.max(a, b) * 0.1 ? [a, b] : null;
  }
  return null;
}

/**
 * 읽을 칸 목록 — 창 위치를 찾고 칸마다 이미지 좌표를 돌려준다 (읽기는 호출부 OCR)
 * @param {RGBAImage} img
 * @param {{ L:{anchor:Patch, check:Patch}, R:{anchor:Patch, check:Patch} }} patches
 * @param {'P'|'M'} type  물리면 두 칸 중 앞, 마법이면 뒤만 (한 칸짜리는 그대로)
 */
export function planCells(img, patches, type) {
  const panels = {};
  /** @type {{ key:string, side:'L'|'R', row:string, idx:number, fmt:string, max:number, spaced:boolean, box:number[] }[]} */
  const cells = [];
  for (const side of /** @type {const} */ (['L', 'R'])) {
    const pos = locatePanel(img, side, patches);
    panels[side] = pos;
    if (!pos) continue;
    for (const [row, def] of Object.entries(LAYOUT[side].rows)) {
      def.val.forEach((b, idx) => {
        // 물리/마법 두 칸짜리는 캐릭터 타입 쪽만 (몬스터 추가·지배력은 일반/보스라 둘 다)
        // 백어택·근마효율은 물리·마법 두 칸이 (거의) 같아서 둘 다 읽어 서로 확인한다 (sanityFlags)
        const twoTypeCols = def.val.length === 2 && !['추가', '지배력', '백어택', '효율'].includes(row);
        if (twoTypeCols && idx !== (type === 'M' ? 1 : 0)) return;
        if (side === 'L' && ((row === '근력' && type === 'M') || (row === '마법력' && type === 'P'))) return;
        if (side === 'R' && ((row === '근력' && type === 'M') || (row === '마법력' && type === 'P'))) return;
        if ((row === '속성력' && type === 'P') || (row === '무기공격력' && type === 'M')) return;
        cells.push({ key: `${side}.${row}#${idx}`, side, row, idx, fmt: def.fmt, max: def.max ?? Infinity, spaced: !!def.spaced, box: mapBox(side, pos, b) });
      });
    }
  }
  return { panels, cells };
}

/**
 * 교차 검증 — 오른쪽 창 "+기본값 / 누적%" 로 왼쪽 표시값을 다시 계산해 맞는지 본다.
 *   표시값 ≈ floor(기본 × (100 + %) / 100). % 가 반올림 표시라 ±1% 범위면 통과.
 * @param {Record<string, string>} texts  칸 key(planCells) → 원문
 * @param {'P'|'M'} type
 * @returns {Record<string, boolean>} 행 → 통과 여부 (검증할 수 없으면 없음)
 */
export function crossCheck(texts, type) {
  const col = type === 'M' ? 1 : 0;
  const out = {};
  for (const row of ['크댐', '최소', '최대', '고댐']) {
    const shown = parseValue(texts[`L.${row}#${col}`] ?? '', 'int');
    const rt = texts[`R.${row}#${col}`] ?? '';
    const base = parseValue(rt, 'plusPct');
    const pct = pctOf(rt);
    if (typeof shown !== 'number' || typeof base !== 'number' || pct === null) continue;
    const lo = Math.floor((base * (100 + pct - 1)) / 100);
    const hi = Math.ceil((base * (100 + pct + 1)) / 100);
    out[row] = shown >= lo && shown <= hi;
  }
  return out;
}

/**
 * 교차 검증 실패 행 바로잡기 — 칸마다 여러 번 읽은 후보 중 "표시값 ≈ 기본 × (100+%)/100" 이 맞는 짝을 고른다.
 *   표가 많은 후보부터 보고, 맞는 짝이 있으면 그 문자열로 바꾼다.
 * @param {Record<string, string[]>} reads  칸 key → 읽은 문자열들 (cleanOcr)
 * @param {Record<string, string>} texts    칸 key → 다수결 문자열 (고쳐서 돌려준다)
 * @param {'P'|'M'} type
 * @returns {string[]} 바로잡은 칸 key
 */
export function resolveCross(reads, texts, type) {
  const col = type === 'M' ? 1 : 0;
  const fixed = [];
  const ranked = (list, fmt) => {
    const tally = new Map();
    for (const t of list || []) if (t && parseValue(t, fmt) !== null) tally.set(t, (tally.get(t) || 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  };
  const before = crossCheck(texts, type);
  for (const row of ['크댐', '최소', '최대', '고댐']) {
    if (before[row] !== false) continue;
    const lk = `L.${row}#${col}`;
    const rk = `R.${row}#${col}`;
    // 1순위: 실제로 읽은 후보끼리, 2순위: 헷갈리기 쉬운 숫자 한 자리를 바꾼 후보까지
    const L1 = ranked(reads[lk], 'int');
    const R1 = ranked(reads[rk], 'plusPct');
    const L2 = [...L1, ...L1.flatMap(confusions).filter((t) => !L1.includes(t))];
    const R2 = [...R1, ...R1.flatMap(confusions).filter((t) => !R1.includes(t))];
    let done = false;
    for (const [LL, RR] of [[L1, R1], [L2, R2]]) {
      if (done) break;
      for (const lt of LL) {
        for (const rt of RR) {
          if (crossCheck({ [lk]: lt, [rk]: rt }, type)[row]) {
            if (texts[lk] !== lt) fixed.push(lk);
            if (texts[rk] !== rt) fixed.push(rk);
            texts[lk] = lt;
            texts[rk] = rt;
            done = true;
            break;
          }
        }
        if (done) break;
      }
    }
  }
  return fixed;
}

/**
 * 상식 검사 — 교차 검증으로 못 잡는 오인식을 "확인 필요" 로 표시할 칸 key 목록
 *   · 최소/최대 대미지: 두 값의 비가 0.7~1.3 을 벗어나면 둘 다 (흐린 7 을 1 로 읽는 경우)
 *   · 백어택: 물리·마법 두 칸이 3% 넘게 다르거나 한쪽을 못 읽으면 캐릭터 타입 쪽 (두 값은 보통 1 차이)
 *   · 근마효율: 물리·마법 두 칸이 다르거나 한쪽을 못 읽으면 캐릭터 타입 쪽 (두 값은 항상 같다)
 * @param {Record<string, any>} v  칸 key → parseValue 결과
 * @param {'P'|'M'} type
 */
export function sanityFlags(v, type) {
  const col = type === 'M' ? 1 : 0;
  const out = [];
  for (const side of ['L', 'R']) {
    const mn = v[`${side}.최소#${col}`];
    const mx = v[`${side}.최대#${col}`];
    if (typeof mn === 'number' && typeof mx === 'number' && mx > 0) {
      const r = mn / mx;
      if (r < 0.7 || r > 1.3) out.push(`${side}.최소#${col}`, `${side}.최대#${col}`);
    }
  }
  const bp = v['L.백어택#0'];
  const bm = v['L.백어택#1'];
  if (typeof bp !== 'number' || typeof bm !== 'number' || Math.abs(bp - bm) > Math.max(bp, bm) * 0.03) out.push(`L.백어택#${col}`);
  if (v['R.효율#0'] !== v['R.효율#1'] || typeof v['R.효율#0'] !== 'number') out.push(`R.효율#${col}`);
  return out;
}

/** 흐린 캡처에서 서로 헷갈리는 숫자 (7 의 윗획이 옅으면 1, 9 의 왼쪽 획이 옅으면 3 …) */
const CONFUSE = { 1: '7', 7: '1', 3: '98', 9: '3', 8: '063', 0: '8', 6: '85', 5: '6' };

/** 숫자 한 자리만 헷갈리는 숫자로 바꾼 후보들 (교차 검증 보정용) */
export function confusions(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    for (const alt of CONFUSE[text[i]] || '') out.push(text.slice(0, i) + alt + text.slice(i + 1));
  }
  return out;
}

/**
 * 인식 결과 → 우리 스탯 필드 (값을 못 읽은 항목은 빠진다)
 * @param {Record<string, any>} v  칸 key(planCells) → parseValue 결과
 * @param {'P'|'M'} type
 * @returns {Record<string, number>}
 */
export function toStats(v, type) {
  const c = type === 'M' ? 1 : 0;
  const out = {};
  const set = (key, val) => {
    if (typeof val === 'number' && Number.isFinite(val)) out[key] = val;
  };
  const range = (key, minKey, maxKey, midKey) => {
    const r = v[key];
    if (!Array.isArray(r)) return;
    if (minKey) set(minKey, r[0]);
    if (maxKey) set(maxKey, r[1]);
    set(midKey, (r[0] + r[1]) / 2);
  };
  set('실측전투력', v['L.전투력#0']);
  set('주스탯', type === 'M' ? v['L.마법력#0'] : v['L.근력#0']);
  if (type === 'M') set('공격력', v['L.속성력#0']);
  else range('L.무기공격력#0', '무기공표시min', '무기공표시max', '공격력');
  set('관통', v[`L.관통력#${c}`]);
  set('크댐', v[`L.크댐#${c}`]);
  set('최소뎀', v[`L.최소#${c}`]);
  set('최대뎀', v[`L.최대#${c}`]);
  set('백어택', v[`L.백어택#${c}`]);
  set('고댐', v[`L.고댐#${c}`]);
  set('일몬추', v['L.추가#0']);
  set('보몬추', v['L.추가#1']);
  set('일몬지', v['L.지배력#0']);
  set('보몬지', v['L.지배력#1']);
  set('기본_주스탯', type === 'M' ? v['R.마법력#0'] : v['R.근력#0']);
  if (type === 'M') set('기본_공격력', v['R.속성력#0']);
  else range('R.무기공격력#0', null, null, '기본_공격력');
  set('기본_일몬추', v['R.일추#0']);
  set('기본_보몬추', v['R.보추#0']);
  set('기본_크댐', v[`R.크댐#${c}`]);
  set('기본_최소뎀', v[`R.최소#${c}`]);
  set('기본_최대뎀', v[`R.최대#${c}`]);
  set('기본_고댐', v[`R.고댐#${c}`]);
  set('근마효율', v[`R.효율#${c}`]);
  set('근거리', v['R.근거리#0']);
  set('상태대미지', v['R.상태#0']);
  return out;
}

/** 칸 key → 입력 필드 이름 (확인 표·검증 표시에 씀) */
export const CELL_LABELS = {
  'L.전투력': '전투력 (실측)',
  'L.근력': '근력',
  'L.마법력': '마법력',
  'L.무기공격력': '무기공격력 범위',
  'L.속성력': '속성력',
  'L.관통력': '관통력',
  'L.크댐': '크리티컬 대미지',
  'L.최소': '최소 대미지',
  'L.최대': '최대 대미지',
  'L.백어택': '백어택 대미지',
  'L.고댐': '고정 대미지 증가',
  'L.추가': '몬스터 추가 대미지',
  'L.지배력': '몬스터 지배력',
  'R.직접': '직접 타격 전투력',
  'R.소환': '소환 타격 전투력',
  'R.근력': '기본 근력',
  'R.마법력': '기본 마법력',
  'R.무기공격력': '기본 무기공격력',
  'R.속성력': '기본 속성력',
  'R.일추': '기본 일반 몬스터 대미지',
  'R.보추': '기본 보스 몬스터 대미지',
  'R.크댐': '기본 크리티컬 대미지',
  'R.최소': '기본 최소 대미지',
  'R.최대': '기본 최대 대미지',
  'R.고댐': '기본 고정 대미지',
  'R.효율': '근력/마법력 효율',
  'R.근거리': '근거리 대미지',
  'R.상태': '상태이상 대미지',
};
