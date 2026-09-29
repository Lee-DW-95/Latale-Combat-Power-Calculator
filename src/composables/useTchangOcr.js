// T창 캡처 인식 — 브라우저 쪽 (이미지 디코딩·확대·OCR 호출). 판단 로직은 utils/tchangOcr.js 순수 함수.
//   Tesseract.js 와 영어 숫자 데이터는 처음 쓸 때만 CDN 에서 받는다 (약 2~3MB, 이후 브라우저 캐시).
//   이미지는 브라우저 밖으로 나가지 않는다.
import { ref, shallowRef } from 'vue';
import {
  planCells,
  cellGray,
  READ_VARIANTS,
  READ_VARIANTS_SPACED,
  spaceDigits,
  cropUpscale,
  sharpenGray,
  cleanOcr,
  vote,
  parseValue,
  crossCheck,
  resolveCross,
  sanityFlags,
  toStats,
} from '../utils/tchangOcr.js';
import templates from '../data/tchangTemplates.json';

let workerPromise = null;
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const w = await createWorker('eng', 1);
      await w.setParameters({
        tessedit_pageseg_mode: /** @type {any} */ ('7'), // 한 줄
        tessedit_char_whitelist: '0123456789,.+~/%',
      });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Blob(붙여넣기·파일) → ImageData */
async function decode(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
  ctx.drawImage(bmp, 0, 0);
  return { canvas: c, data: ctx.getImageData(0, 0, c.width, c.height) };
}

/** 칸을 k 배 확대 → OCR 용 회색 캔버스 (여백 30px). 확대·전처리는 순수 함수라 시험 환경과 같은 결과. */
function cellCanvas(img, box, k, off, gamma, sharpen, spaced = false) {
  const up = cropUpscale(img, box, k);
  let gray = sharpenGray(cellGray(up.data, up.w, up.h, off, gamma), up.w, up.h, sharpen, Math.max(1, Math.round(k / 2)));
  let gw = up.w;
  let gh = up.h;
  if (spaced) ({ data: gray, w: gw, h: gh } = spaceDigits(gray, gw, gh, k));
  const out = document.createElement('canvas');
  out.width = gw + 60;
  out.height = gh + 60;
  const octx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, out.width, out.height);
  octx.putImageData(new ImageData(new Uint8ClampedArray(gray), gw, gh), 30, 30);
  return out;
}

/** 확인 표에 보여 줄 칸 미리보기 (원본 3배) */
function cellPreview(src, box) {
  const [x0, y0, x1, y1] = box.map(Math.round);
  const c = document.createElement('canvas');
  c.width = (x1 - x0) * 3;
  c.height = (y1 - y0) * 3;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
  return c.toDataURL();
}

export function useTchangOcr() {
  const status = ref('idle'); // idle | loading | reading | done | error
  const message = ref('');
  const progress = ref(0);
  /** @type {import('vue').ShallowRef<null | { rows: any[], stats: Record<string, number>, checks: Record<string, boolean>, panels: any, shownBP: { direct: number[], summon: number[] } }>} */
  const result = shallowRef(null);

  /**
   * @param {Blob} blob
   * @param {'P'|'M'} type
   */
  async function recognize(blob, type) {
    result.value = null;
    progress.value = 0;
    try {
      status.value = 'reading';
      message.value = '창 위치 찾는 중…';
      const { canvas, data } = await decode(blob);
      const plan = planCells(data, templates.patches, type);
      if (!plan.panels.L && !plan.panels.R) {
        throw new Error('T창(능력치 세부정보 / 추가 세부정보)을 찾지 못했습니다. 두 창이 잘리지 않게, 크기 조절 없이 캡처해 주세요.');
      }
      status.value = 'loading';
      message.value = '숫자 인식 엔진 준비 중… (처음 한 번만 몇 초 걸립니다)';
      const worker = await getWorker();
      status.value = 'reading';
      const texts = {};
      /** @type {Record<string, string[]>} */
      const reads = {};
      const variantsOf = (c) => (c.spaced ? READ_VARIANTS_SPACED : READ_VARIANTS);
      /** 칸 하나 읽기 — from 번째 조합부터 (early 면 앞 3번 합의 시 멈춤) */
      const readCell = async (c, from, early) => {
        const list = (reads[c.key] ||= []);
        const vs = variantsOf(c);
        for (let n = from; n < vs.length; n++) {
          const [k, off, gamma, sharpen] = vs[n];
          const { data: d } = await worker.recognize(cellCanvas(data, c.box, k, off, gamma, sharpen, c.spaced));
          list.push(cleanOcr(d.text));
          const v = vote(list, c.fmt, c.max);
          if (early && list.length >= 3 && v && v.votes >= 3) break; // 앞 3번이 같으면 확정
        }
      };
      let i = 0;
      for (const c of plan.cells) {
        message.value = `숫자 읽는 중… ${i + 1}/${plan.cells.length}`;
        await readCell(c, 0, true);
        texts[c.key] = vote(reads[c.key], c.fmt, c.max)?.text ?? '';
        i += 1;
        progress.value = i / plan.cells.length;
      }
      // 교차 검증 실패 행 — 남은 조합으로 더 읽고, 표시값·기본값·% 가 맞는 후보 짝으로 바로잡는다
      const failing = Object.entries(crossCheck(texts, type)).filter(([, ok]) => !ok).map(([row]) => row);
      if (failing.length) {
        message.value = '서로 안 맞는 값 다시 읽는 중…';
        for (const c of plan.cells) {
          if (!failing.includes(c.row)) continue;
          await readCell(c, reads[c.key].length, false);
        }
      }
      const fixed = resolveCross(reads, texts, type);
      const values = {};
      for (const c of plan.cells) values[c.key] = texts[c.key] ? parseValue(texts[c.key], c.fmt) : null;
      const suspect = sanityFlags(values, type);
      const rows = [];
      for (const c of plan.cells) {
        const v = vote(reads[c.key], c.fmt, c.max);
        const text = texts[c.key];
        const agree = (reads[c.key] || []).filter((t) => t === text).length;
        rows.push({ ...c, text, value: values[c.key], votes: fixed.includes(c.key) ? 3 : agree, total: fixed.includes(c.key) ? 3 : v?.total ?? 0, fixed: fixed.includes(c.key), suspect: suspect.includes(c.key), tries: reads[c.key].length, preview: cellPreview(canvas, c.box) });
      }
      const checks = crossCheck(texts, type);
      const col = type === 'M' ? 1 : 0;
      /** T창 직접·소환 전투력 — 확인 표에서 계산값과 대조 */
      // T창 직접·소환 전투력 — 읽은 후보 전부 (검산은 후보 중 하나라도 계산값과 맞는지로 본다)
      const cands = (key) => [...new Set((reads[key] || []).map((t) => parseValue(t, 'int')).filter((n) => typeof n === 'number' && n > 0))];
      const shownBP = { direct: cands(`R.직접#${col}`), summon: cands(`R.소환#${col}`) };
      result.value = { rows, stats: toStats(values, type), checks, panels: plan.panels, shownBP };
      status.value = 'done';
      message.value = '';
    } catch (e) {
      status.value = 'error';
      message.value = e?.message || '인식에 실패했습니다.';
    }
  }

  return { status, message, progress, result, recognize };
}
