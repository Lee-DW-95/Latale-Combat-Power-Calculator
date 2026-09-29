<script setup>
// T창 캡처 → 입력칸 자동 채우기. 붙여넣기(Ctrl+V)·파일 선택·끌어다 놓기.
//   읽은 값은 바로 넣지 않고 확인 표(캡처 조각 · 인식값 · 현재값)를 보여 준 뒤 "적용" 으로 넣는다.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useTchangOcr } from '../composables/useTchangOcr.js';
import { fmt } from '../utils/format.js';
import { calculateDirectBP, calculateSummonBP } from '../utils/battlePower.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  stats: { type: Object, required: true },
  /** 열면서 바로 읽을 이미지 (페이지에서 Ctrl+V 로 연 경우) */
  initialBlob: { type: Object, default: null },
});
const emit = defineEmits(['update:modelValue', 'apply']);

const { status, message, progress, result, recognize } = useTchangOcr();
const dragOver = ref(false);
const fileInput = ref(null);
const picked = ref({});
/** 확인 표에서 직접 고친 값 */
const edits = ref({});

const type = computed(() => (props.stats?.type === 'M' ? 'M' : 'P'));
const busy = computed(() => status.value === 'loading' || status.value === 'reading');

/** 입력 필드 → 이름 · 출처 칸 */
const FIELDS = [
  ['실측전투력', '전투력 (실측)', 'L.전투력#0'],
  ['주스탯', '근력/마법력', null],
  ['무기공표시min', '무기공격력 최소', 'L.무기공격력#0'],
  ['무기공표시max', '무기공격력 최대', 'L.무기공격력#0'],
  ['공격력', '무기공격력(중간)/속성력', null],
  ['관통', '관통력', 'L.관통력'],
  ['크댐', '크리티컬 대미지', 'L.크댐'],
  ['최소뎀', '최소 대미지', 'L.최소'],
  ['최대뎀', '최대 대미지', 'L.최대'],
  ['백어택', '백어택 대미지', 'L.백어택'],
  ['고댐', '고정 대미지 증가', 'L.고댐'],
  ['일몬추', '일반 몬스터 추가', 'L.추가#0'],
  ['보몬추', '보스 몬스터 추가', 'L.추가#1'],
  ['일몬지', '일반 몬스터 지배력', 'L.지배력#0'],
  ['보몬지', '보스 몬스터 지배력', 'L.지배력#1'],
  ['근마효율', '근력/마법력 효율', 'R.효율'],
  ['기본_주스탯', '기본 근력/마법력', null],
  ['기본_공격력', '기본 무기공격력/속성력', null],
  ['기본_크댐', '기본 크리티컬 대미지', 'R.크댐'],
  ['기본_최소뎀', '기본 최소 대미지', 'R.최소'],
  ['기본_최대뎀', '기본 최대 대미지', 'R.최대'],
  ['기본_고댐', '기본 고정 대미지', 'R.고댐'],
  ['기본_일몬추', '기본 일반 몬스터 대미지', 'R.일추#0'],
  ['기본_보몬추', '기본 보스 몬스터 대미지', 'R.보추#0'],
  ['근거리', '근거리 대미지', 'R.근거리#0'],
  ['상태대미지', '상태이상 대미지', 'R.상태#0'],
];

/** 출처 칸 key — 타입에 따라 달라지는 것 채우기 */
function sourceKey(key, src) {
  const col = type.value === 'M' ? 1 : 0;
  if (key === '주스탯') return type.value === 'M' ? 'L.마법력#0' : 'L.근력#0';
  if (key === '기본_주스탯') return type.value === 'M' ? 'R.마법력#0' : 'R.근력#0';
  if (key === '공격력') return type.value === 'M' ? 'L.속성력#0' : 'L.무기공격력#0';
  if (key === '기본_공격력') return type.value === 'M' ? 'R.속성력#0' : 'R.무기공격력#0';
  if (src && !src.includes('#')) return `${src}#${col}`;
  return src;
}

const CROSS = { 크댐: '크댐', 기본_크댐: '크댐', 최소뎀: '최소', 기본_최소뎀: '최소', 최대뎀: '최대', 기본_최대뎀: '최대', 고댐: '고댐', 기본_고댐: '고댐' };

const rows = computed(() => {
  const r = result.value;
  if (!r) return [];
  const cells = Object.fromEntries(r.rows.map((c) => [c.key, c]));
  return FIELDS.filter(([k]) => r.stats[k] !== undefined).map(([k, label, src]) => {
    const cell = cells[sourceKey(k, src)];
    const cross = CROSS[k] ? r.checks[CROSS[k]] : undefined;
    // 3번 이상 같게 읽고, 읽은 것 중 70% 이상이 같은 값이어야 확신 (아니면 기본 해제)
    const weak = !cell || cell.suspect || cell.votes < 3 || cell.votes / Math.max(1, cell.total) < 0.7;
    return {
      key: k,
      label,
      value: r.stats[k],
      current: Number(props.stats?.[k]) || 0,
      preview: cell?.preview,
      weak,
      crossFail: cross === false,
      crossOk: cross === true,
      suspect: !!cell?.suspect,
      fixed: !!cell?.fixed,
    };
  });
});
const missing = computed(() => {
  const r = result.value;
  if (!r) return [];
  return FIELDS.filter(([k]) => r.stats[k] === undefined && !(type.value === 'M' && k.startsWith('무기공표시'))).map(([, l]) => l);
});

watch(rows, (list) => {
  picked.value = Object.fromEntries(list.map((r) => [r.key, !r.weak && !r.crossFail]));
  edits.value = {};
});

/**
 * 전투력 검산 — 읽은 값(직접 고친 값 포함, 못 읽은 항목은 현재값)으로 계산한 직접·소환 전투력이
 * T창에서 읽은 전투력 후보 중 하나와 0.15% 이내로 맞는지. 공식은 직접·소환 모두 0.1% 이내라
 * 크게 어긋나면 읽은 값 중 틀린 것이 있다는 신호다.
 */
const bpCheck = computed(() => {
  const shown = result.value?.shownBP;
  if (!shown?.direct?.length || !shown?.summon?.length) return null;
  const merged = { ...props.stats };
  for (const r of rows.value) merged[r.key] = edits.value[r.key] ?? r.value;
  const d = calculateDirectBP(merged, 'base');
  const s = calculateSummonBP(merged);
  if (!d || !s) return null;
  const nearest = (calc, list) => list.map((v) => (calc / v - 1) * 100).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  const ed = nearest(d, shown.direct);
  const es = nearest(s, shown.summon);
  if (Math.abs(ed) > 20 || Math.abs(es) > 20) return null; // T창 전투력 숫자를 엉뚱하게 읽음 → 검산 불가
  return { ed, es, ok: Math.abs(ed) <= 0.15 && Math.abs(es) <= 0.15 };
});
const pctText = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 0.1 ? 3 : 2)}%`;

function close() {
  emit('update:modelValue', false);
}
/** 인식값 직접 수정 — 쉼표 무시, 숫자면 체크 */
function edit(key, raw) {
  const n = Number(String(raw).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n)) return;
  edits.value = { ...edits.value, [key]: n };
  picked.value = { ...picked.value, [key]: true };
}
function apply() {
  const patch = {};
  for (const r of rows.value) if (picked.value[r.key]) patch[r.key] = edits.value[r.key] ?? r.value;
  emit('apply', patch);
  close();
}

async function take(blob) {
  if (!blob || !blob.type?.startsWith('image/')) return;
  await recognize(blob, type.value);
}
function onPaste(e) {
  const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  take(item.getAsFile());
}
function onDrop(e) {
  dragOver.value = false;
  take(e.dataTransfer?.files?.[0]);
}
function onFile(e) {
  take(e.target.files?.[0]);
  e.target.value = '';
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      window.addEventListener('paste', onPaste);
      if (!busy.value) status.value = 'idle';
      if (props.initialBlob) take(props.initialBlob);
    } else {
      window.removeEventListener('paste', onPaste);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => window.removeEventListener('paste', onPaste));

const fmtVal = (v) => (Number.isInteger(v) ? fmt(v) : v.toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="!busy && close()"
    >
      <div
        class="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-stone-800 shadow-xl ring-1 ring-stone-200 dark:ring-stone-700"
        role="dialog"
        aria-modal="true"
        aria-label="T창 캡처로 채우기"
      >
        <div class="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 class="text-base font-semibold text-stone-900 dark:text-stone-50">T창 캡처로 채우기</h2>
            <p class="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              능력치 세부정보 + 추가 세부정보 두 창을 캡처해 <kbd class="px-1 rounded ring-1 ring-stone-300 dark:ring-stone-600">Ctrl</kbd>+<kbd class="px-1 rounded ring-1 ring-stone-300 dark:ring-stone-600">V</kbd>.
              {{ type === 'M' ? '마법' : '물리' }} 기준으로 읽습니다.
            </p>
          </div>
          <button type="button" class="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-lg leading-none" :disabled="busy" @click="close">✕</button>
        </div>

        <div class="px-5 pb-4 overflow-y-auto flex-1 space-y-3">
          <!-- 입력 영역 -->
          <div
            v-if="status === 'idle' || status === 'error'"
            class="rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition"
            :class="dragOver ? 'border-cyan-500 bg-cyan-50/60 dark:bg-cyan-900/20' : 'border-stone-300 dark:border-stone-600'"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
          >
            <p class="text-stone-600 dark:text-stone-300">캡처를 붙여넣거나 여기로 끌어다 놓으세요</p>
            <button
              type="button"
              class="mt-3 text-xs px-3 py-1.5 rounded-lg ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700"
              @click="fileInput?.click()"
            >
              이미지 파일 선택
            </button>
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFile" />
            <p v-if="status === 'error'" class="mt-3 text-xs text-orange-600 dark:text-orange-400">{{ message }}</p>
            <p class="mt-3 text-[11px] text-stone-400 dark:text-stone-500">이미지는 브라우저 안에서만 처리되고 서버로 보내지 않습니다.</p>
          </div>

          <!-- 진행 -->
          <div v-else-if="busy" class="py-8 text-center">
            <p class="text-sm text-stone-600 dark:text-stone-300">{{ message }}</p>
            <div class="mt-3 mx-auto max-w-xs h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
              <div class="h-full bg-cyan-500 transition-all" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
            </div>
          </div>

          <!-- 확인 표 -->
          <template v-else-if="status === 'done' && result">
            <p class="text-xs text-stone-500 dark:text-stone-400">
              {{ rows.length }}개 읽음.
              <span v-if="rows.some((r) => r.weak || r.crossFail)" class="text-orange-600 dark:text-orange-400">주황색 항목은 캡처와 비교해 확인하세요 (기본 해제). 틀린 값은 칸을 눌러 바로 고칠 수 있습니다.</span>
              <span v-if="!result.panels.L" class="block text-orange-600 dark:text-orange-400">능력치 세부정보 창을 찾지 못했습니다.</span>
              <span v-if="!result.panels.R" class="block text-orange-600 dark:text-orange-400">추가 세부정보 창을 찾지 못했습니다.</span>
            </p>
            <div
              v-if="bpCheck"
              class="rounded-lg px-3 py-2 text-xs ring-1"
              :class="bpCheck.ok
                ? 'bg-cyan-50/60 dark:bg-cyan-900/10 ring-cyan-200 dark:ring-cyan-800 text-cyan-800 dark:text-cyan-200'
                : 'bg-orange-50/70 dark:bg-orange-900/10 ring-orange-200 dark:ring-orange-800 text-orange-700 dark:text-orange-300'"
            >
              <template v-if="bpCheck.ok">전투력 검산 통과 — 읽은 값으로 계산한 직접·소환 전투력이 T창과 맞습니다 ({{ pctText(bpCheck.ed) }} · {{ pctText(bpCheck.es) }}).</template>
              <template v-else>전투력 검산 불일치 — 직접 {{ pctText(bpCheck.ed) }} · 소환 {{ pctText(bpCheck.es) }}. 읽은 값 중 틀린 것이 있을 수 있으니 캡처와 비교해 주세요 (고치면 다시 계산됩니다).</template>
            </div>
            <table class="w-full text-xs tabular-nums">
              <thead>
                <tr class="text-left text-[11px] text-stone-400 dark:text-stone-500">
                  <th class="py-1 pr-2 font-medium w-6"></th>
                  <th class="py-1 pr-2 font-medium">항목</th>
                  <th class="py-1 pr-2 font-medium">캡처</th>
                  <th class="py-1 pr-2 font-medium text-right">인식값</th>
                  <th class="py-1 font-medium text-right">현재값</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in rows"
                  :key="r.key"
                  class="border-t border-stone-100 dark:border-stone-700/60"
                  :class="r.weak || r.crossFail ? 'bg-orange-50/60 dark:bg-orange-900/10' : ''"
                >
                  <td class="py-1 pr-2"><input v-model="picked[r.key]" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /></td>
                  <td class="py-1 pr-2 text-stone-700 dark:text-stone-200">
                    {{ r.label }}
                    <span v-if="r.crossFail" class="block text-[10px] text-orange-600 dark:text-orange-400">표시값·기본값이 서로 안 맞음</span>
                    <span v-else-if="r.suspect" class="block text-[10px] text-orange-600 dark:text-orange-400">값이 어색함 (최소·최대 / 물리·마법 차이)</span>
                    <span v-else-if="r.weak" class="block text-[10px] text-orange-600 dark:text-orange-400">인식이 흔들림</span>
                    <span v-else-if="r.fixed" class="block text-[10px] text-cyan-700 dark:text-cyan-400">표시값·기본값 대조로 보정</span>
                  </td>
                  <td class="py-1 pr-2"><img v-if="r.preview" :src="r.preview" alt="" class="h-6 max-w-[140px] object-contain object-left rounded bg-stone-800" /></td>
                  <td class="py-1 pr-2 text-right">
                    <input
                      :value="fmtVal(edits[r.key] ?? r.value)"
                      inputmode="decimal"
                      class="w-28 rounded-md border-0 ring-1 bg-transparent px-2 py-0.5 text-right font-medium tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                      :class="[
                        r.weak || r.crossFail ? 'ring-orange-300 dark:ring-orange-700' : 'ring-transparent hover:ring-stone-300 dark:hover:ring-stone-600',
                        (edits[r.key] ?? r.value) !== r.current ? 'text-cyan-700 dark:text-cyan-300' : 'text-stone-800 dark:text-stone-100',
                      ]"
                      :aria-label="`${r.label} 인식값`"
                      @change="edit(r.key, $event.target.value)"
                    />
                  </td>
                  <td class="py-1 text-right text-stone-400 dark:text-stone-500">{{ r.current ? fmtVal(r.current) : '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="missing.length" class="text-[11px] text-stone-400 dark:text-stone-500">읽지 못한 항목: {{ missing.join(', ') }}</p>
          </template>
        </div>

        <div v-if="status === 'done' && result" class="flex items-center justify-end gap-2 px-5 py-3 border-t border-stone-100 dark:border-stone-700">
          <button type="button" class="text-xs px-3 py-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-100" @click="status = 'idle'">다시 붙여넣기</button>
          <button type="button" class="text-xs px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold" @click="apply">
            선택한 {{ Object.values(picked).filter(Boolean).length }}개 적용
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
