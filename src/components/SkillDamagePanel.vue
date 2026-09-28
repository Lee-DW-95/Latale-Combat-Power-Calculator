<script setup>
// 스킬 선택 대미지 — 직업 · 스킬 · 레벨 · 각성 · 특화석을 고르면 타격별 대미지를 낸다.
//   엔진: utils/skillEngine.js (원본 계산기 SkillEngine 과 정수 단위 일치 확인)
//   데이터: data/skillData.json (3.4MB) — 이 패널을 열 때만 내려받는다.
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { createSkillEngine, hitLabel, statText, variantLabel, cleanName, SKILL_GRADE_LABEL } from '../utils/skillEngine.js';
import { engineInputFromStats } from '../utils/damageInputs.js';
import { fmtRound as fmt } from '../utils/format.js';

const props = defineProps({
  stats: { type: Object, required: true },
  targetStats: { type: Object, required: true },
  targetType: { type: String, required: true },
  level: { type: Number, required: true },
  critRate: { type: Number, required: true },
  conditions: { type: Object, required: true },
  toz: { type: Boolean, default: false },
  survival: { type: Boolean, default: false }, // 생존본능 — 난수 최대 고정 표기
});

const STORAGE_KEY = 'latale.skillDamage.v1';

const engine = shallowRef(null);
const loadError = ref('');
import('../data/skillData.json')
  .then((m) => (engine.value = createSkillEngine(m.default)))
  .catch(() => (loadError.value = '스킬 데이터를 불러오지 못했습니다. 새로고침해 주세요.'));

// ── 선택 상태 (브라우저에 저장) ──
const state = reactive({ cls: 0, skillId: 0, configs: {}, noblesse: false, title: false });
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved === 'object') Object.assign(state, saved);
} catch {
  /* localStorage 불가 — 기본값 */
}
watch(
  state,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 저장 실패 무시 */
    }
  },
  { deep: true },
);

const classes = computed(() =>
  engine.value ? [...engine.value.data.classes].filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, 'ko')) : [],
);
const skills = computed(() => (engine.value && state.cls ? engine.value.skillsOf(state.cls) : []));

// 직업·스킬이 비었거나 목록에 없으면 첫 항목으로
watch(
  classes,
  (list) => {
    if (list.length && !list.some((c) => c.id === state.cls)) state.cls = list[0].id;
  },
  { immediate: true },
);
watch(
  skills,
  (list) => {
    if (list.length && !list.some((s) => s.id === state.skillId)) state.skillId = list[0].id;
  },
  { immediate: true },
);

/** 지금 스킬의 설정 — 스킬마다 따로 기억한다 */
const configKey = computed(() => `${state.cls}:${state.skillId}`);
watch(
  [engine, configKey],
  () => {
    const e = engine.value;
    if (e && e.data.skills[state.skillId] && !state.configs[configKey.value]) {
      state.configs[configKey.value] = e.defaultConfig(state.skillId);
    }
  },
  { immediate: true },
);
const config = computed(() => state.configs[configKey.value] || null);

const skill = computed(() => engine.value?.data.skills[state.skillId] || null);
const pages = computed(() =>
  engine.value && skill.value ? new Set(engine.value.awakenings(state.cls, state.skillId).map((a) => a.page)) : new Set(),
);
const awakeningName = (page) =>
  cleanName(engine.value?.awakenings(state.cls, state.skillId).find((a) => a.page === page)?.name || '').replace(/[【】]/g, '').trim();
const requiredPage = computed(() => (engine.value && skill.value ? engine.value.requiredPage(state.cls, state.skillId) : 0));
const stoneOptions = computed(() => (engine.value && skill.value ? engine.value.optionsFor(state.cls, state.skillId) : []));
const stonesBlocked = computed(() => requiredPage.value && config.value && !config.value[`aw${requiredPage.value}`]);

function stoneValue(slot) {
  const c = config.value?.stones?.[slot];
  return c ? `${c.type}:${c.number}` : '';
}
function setStone(slot, value) {
  const c = config.value;
  if (!c) return;
  if (!value) {
    c.stones[slot] = null;
  } else {
    const [type, number] = value.split(':').map(Number);
    const opt = stoneOptions.value.find((o) => o.type === type && o.number === number);
    const prev = c.stones[slot];
    const level = prev && opt?.levels.includes(prev.level) ? prev.level : opt?.levels.at(-1);
    c.stones[slot] = { type, number, level };
    // 특화석은 각성 스킬에 끼우는 것이라(데이터상 290개 전부 각성 필요) 고르면 해당 각성을 함께 켠다
    if (requiredPage.value) c[`aw${requiredPage.value}`] = true;
  }
  c.variant = '';
}
/** 특화석 이름 — 앞 번호("1. ")는 같은 이름의 돌을 구분하므로 남긴다 */
const stoneName = (o) => String(o.name).replace(/\\n/g, ' ').trim();
function stoneLevels(slot) {
  const c = config.value?.stones?.[slot];
  return c ? stoneOptions.value.find((o) => o.type === c.type && o.number === c.number)?.levels || [] : [];
}
/** 이미 다른 칸에 꽂힌 돌·두 번째 유니크는 고를 수 없다 */
function stoneDisabled(slot, opt) {
  const others = (config.value?.stones || []).filter((c, i) => c && i !== slot);
  return others.some((c) => c.type === opt.type && c.number === opt.number) || (opt.type === 2 && others.some((c) => c.type === 2));
}

function resetSkill() {
  if (!engine.value || !state.skillId) return;
  state.configs[`${state.cls}:${state.skillId}`] = engine.value.defaultConfig(state.skillId);
}

// ── 계산 ──
const channel = computed(() => (props.stats?.type === 'M' ? 'magic' : 'physical'));
const input = computed(() =>
  engineInputFromStats(props.stats, {
    targetStats: props.targetStats,
    targetType: /** @type {'normal'|'boss'} */ (props.targetType),
    level: props.level,
    conditions: props.conditions,
  }),
);
const result = computed(() => {
  const e = engine.value;
  if (!e || !config.value || !skill.value) return null;
  return e.calculate(state.cls, state.skillId, config.value, input.value, { noblesse: state.noblesse, title: state.title, toz: props.toz }, {
    channels: new Set([channel.value]),
  });
});

const p = computed(() => Math.min(1, Math.max(0, (Number(props.critRate) || 0) / 100)));
// 생존본능이면 난수 최대(맥댐 고정), 아니면 적분 평균(없으면 중앙값)
const avgOf = (r) => (props.survival ? r.max : (r.avg ?? r.mid));
const hits = computed(() =>
  (result.value?.rows || []).map((r, i) => ({
    ...r,
    label: hitLabel(r, i + 1),
    expected: r.unavailable ? null : avgOf(r.noncrit) * (1 - p.value) + avgOf(r.crit) * p.value,
  })),
);
// 타격 횟수 — 스킬 데이터에 타수가 없어 직접 입력받는다 (스킬 설정마다 기억, 기본 1회)
const countOf = (h) => Math.max(0, Number(config.value?.hitCounts?.[h.key] ?? 1) || 0);
function setCount(h, v) {
  if (!config.value) return;
  config.value.hitCounts = { ...(config.value.hitCounts || {}), [h.key]: Math.max(0, Math.round(Number(v) || 0)) };
}
const total = computed(() => {
  const list = hits.value.filter((h) => !h.unavailable);
  return {
    sum: list.reduce((a, h) => a + h.expected * countOf(h), 0),
    direct: list.filter((h) => h.kind === 'direct').reduce((a, h) => a + countOf(h), 0),
    summon: list.filter((h) => h.kind === 'summon').reduce((a, h) => a + countOf(h), 0),
  };
});
const unavailableCount = computed(() => hits.value.filter((h) => h.unavailable === 'channel').length);
const stoneEffects = computed(() => Object.entries(result.value?.stats || {}).map(([id, v]) => statText(id, v)));

const selectCls =
  'h-9 rounded-lg border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none';
const labelCls = 'text-[11px] font-medium tracking-wide text-stone-400 dark:text-stone-500 uppercase';
</script>

<template>
  <div class="space-y-3">
    <p v-if="loadError" class="text-sm text-orange-600 dark:text-orange-400">{{ loadError }}</p>
    <div
      v-else-if="!engine"
      class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-stone-50 dark:bg-stone-900/40 py-6 text-center text-sm text-stone-500 dark:text-stone-400"
    >
      스킬 데이터를 불러오는 중…
    </div>

    <template v-else>
      <!-- 스킬 설정 -->
      <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 p-3 sm:p-4 space-y-3">
        <div class="flex items-end gap-x-4 gap-y-3 flex-wrap">
          <label class="flex flex-col gap-1 flex-1 sm:flex-none min-w-[8rem]">
            <span :class="labelCls">직업</span>
            <select v-model.number="state.cls" :class="selectCls" class="w-full sm:w-auto">
              <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 min-w-0 w-full sm:w-auto">
            <span :class="labelCls">스킬</span>
            <select v-model.number="state.skillId" :class="selectCls" class="w-full max-w-full sm:w-auto sm:max-w-[16rem]">
              <option v-for="s in skills" :key="s.id" :value="s.id">
                {{ SKILL_GRADE_LABEL[s.grade] ? `[${SKILL_GRADE_LABEL[s.grade]}] ` : '' }}{{ cleanName(s.name) }}
              </option>
            </select>
          </label>
          <label v-if="config" class="flex flex-col gap-1 flex-1 sm:flex-none">
            <span :class="labelCls">스킬 레벨</span>
            <input
              v-model.number="config.level"
              type="number"
              min="1"
              inputmode="numeric"
              :class="selectCls"
              class="w-full sm:w-20 text-right tabular-nums"
            />
          </label>
          <div v-if="config && pages.size" class="flex flex-col gap-1">
            <span :class="labelCls">각성</span>
            <div class="flex items-center gap-3 h-9 text-sm">
              <label
                v-for="pg in [1, 2]"
                :key="pg"
                v-show="pages.has(pg)"
                class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300"
                :title="awakeningName(pg)"
              >
                <input
                  v-model="config[`aw${pg}`]"
                  type="checkbox"
                  class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500"
                  @change="config.variant = ''"
                />
                {{ awakeningName(pg) || `각성 ${pg}` }}
              </label>
            </div>
          </div>
          <label v-if="config && result && result.choices.length > 1" class="flex flex-col gap-1 min-w-0 w-full sm:w-auto">
            <span :class="labelCls">타격 동작</span>
            <select
              :value="result.variant?.key"
              :class="selectCls"
              class="w-full max-w-full sm:w-auto sm:max-w-[18rem]"
              @change="config.variant = $event.target.value"
            >
              <option v-for="v in result.choices" :key="v.key" :value="v.key">{{ variantLabel(v, result.level) }}</option>
            </select>
          </label>
          <button
            type="button"
            class="h-9 px-3 rounded-lg text-xs text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700/60"
            @click="resetSkill"
          >
            초기화
          </button>
        </div>

        <!-- 특화석 -->
        <div v-if="config && stoneOptions.length" class="space-y-1.5">
          <div class="flex items-baseline gap-2">
            <span :class="labelCls">특화석</span>
            <span class="text-[11px] text-stone-400 dark:text-stone-500">
              {{ awakeningName(requiredPage) || `각성 ${requiredPage}` }} 상태의 스킬에 끼웁니다
            </span>
            <button
              v-if="stonesBlocked"
              type="button"
              class="text-[11px] text-orange-600 dark:text-orange-400 underline underline-offset-2"
              @click="config[`aw${requiredPage}`] = true; config.variant = ''"
            >
              각성이 꺼져 있어 적용 안 됨 · 켜기
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2" :class="stonesBlocked ? 'opacity-50' : ''">
            <div v-for="slot in [0, 1, 2]" :key="slot" class="flex gap-1.5 min-w-0">
              <select
                :value="stoneValue(slot)"
                :class="selectCls"
                class="flex-1 min-w-0"
                @change="setStone(slot, $event.target.value)"
              >
                <option value="">— 비어 있음 —</option>
                <optgroup label="일반">
                  <option
                    v-for="o in stoneOptions.filter((x) => x.type === 1)"
                    :key="`1:${o.number}`"
                    :value="`1:${o.number}`"
                    :disabled="stoneDisabled(slot, o)"
                  >{{ stoneName(o) }}</option>
                </optgroup>
                <optgroup v-if="stoneOptions.some((x) => x.type === 2)" label="유니크 (1개까지)">
                  <option
                    v-for="o in stoneOptions.filter((x) => x.type === 2)"
                    :key="`2:${o.number}`"
                    :value="`2:${o.number}`"
                    :disabled="stoneDisabled(slot, o)"
                  >{{ stoneName(o) }}</option>
                </optgroup>
              </select>
              <select
                v-if="config.stones[slot]"
                v-model.number="config.stones[slot].level"
                :class="selectCls"
                class="w-20 px-2 tabular-nums"
                aria-label="특화석 레벨"
              >
                <option v-for="lv in stoneLevels(slot)" :key="lv" :value="lv">Lv{{ lv }}</option>
              </select>
            </div>
          </div>
          <p v-if="stoneEffects.length" class="text-xs text-stone-500 dark:text-stone-400">
            {{ stoneEffects.join(' · ') }}
          </p>
        </div>

        <!-- 버프 -->
        <div class="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
          <span :class="labelCls">버프</span>
          <label class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300" title="최종 최소·최대·크리티컬 대미지 각각 +1%p">
            <input v-model="state.noblesse" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 노블레스
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300" title="크리티컬 대미지 +200">
            <input v-model="state.title" type="checkbox" class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500" /> 타이틀 크리 +200
          </label>
          <label
            v-for="b in result?.localBuffs || []"
            :key="b.id"
            class="flex items-center gap-1.5 cursor-pointer text-stone-600 dark:text-stone-300"
            :title="Object.entries(b.values).map(([id, v]) => statText(id, v)).join(', ')"
          >
            <input
              type="checkbox"
              :checked="b.active"
              class="h-4 w-4 rounded border-stone-300 text-cyan-600 focus:ring-cyan-500"
              @change="config.localBuffs = { ...config.localBuffs, [b.id]: $event.target.checked }"
            />
            {{ cleanName(b.name) }}<span v-if="b.conditional" class="text-[11px] text-stone-400">(조건부)</span>
          </label>
        </div>
      </div>

      <!-- 결과 -->
      <div v-if="result && !result.level" class="text-sm text-stone-500 dark:text-stone-400">스킬 레벨을 1 이상으로 입력하세요.</div>
      <div
        v-else-if="result && !hits.length"
        class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 py-6 text-center text-sm text-stone-500 dark:text-stone-400"
      >
        이 설정에는 공격 타격이 없습니다 (지원·버프 동작).
      </div>
      <template v-else-if="result">
        <p class="text-xs text-stone-500 dark:text-stone-400">
          스킬 레벨 {{ result.level }}<span v-if="result.level !== config.level"> (특화석 +{{ result.level - config.level }})</span>
          · 크리 {{ critRate }}% 기대값<span v-if="survival"> · 생존본능(최대 고정)</span>
        </p>
        <div class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 border-l-4 border-cyan-500 px-4 py-3">
          <p :class="labelCls">총 누적 대미지 · 직타 {{ total.direct }}회 + 소환 {{ total.summon }}회</p>
          <p class="text-3xl font-semibold tracking-tight tabular-nums text-cyan-700 dark:text-cyan-300 leading-none mt-1">{{ fmt(total.sum) }}</p>
          <p class="text-[11px] text-stone-400 dark:text-stone-500 mt-1.5">
            스킬 데이터에는 타수가 없어 각 타격의 횟수를 직접 넣어야 합니다 (기본 1회). 인게임 대미지 로그 개수를 세어 넣으세요.
          </p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div
            v-for="h in hits"
            :key="h.key"
            class="rounded-xl ring-1 ring-stone-200 dark:ring-stone-700 bg-white dark:bg-stone-800/60 px-4 py-3"
            :class="h.unavailable ? 'opacity-60' : ''"
          >
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-sm font-medium text-stone-800 dark:text-stone-100">
                {{ h.label }}<span v-if="h.kind === 'summon'" class="text-stone-400 dark:text-stone-500 font-normal"> · {{ cleanName(h.name) }}</span>
              </p>
              <p class="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums shrink-0">
                {{ h.kind === 'direct' ? `계수 ${fmt(h.C)}` : `배율 ${fmt(h.S ?? 0)}% · 계수 ${fmt(h.SC ?? h.C)}` }}
              </p>
            </div>
            <p v-if="h.unavailable === 'channel'" class="text-xs text-stone-500 dark:text-stone-400 mt-1.5">
              {{ h.channel === 'physical' ? '물리' : '마법' }} 타격 — 지금 캐릭터는 {{ channel === 'physical' ? '물리' : '마법' }} 스탯만 있어 계산하지 않습니다.
            </p>
            <p v-else-if="h.unavailable" class="text-xs text-stone-500 dark:text-stone-400 mt-1.5">소환체 데이터가 없어 계산할 수 없습니다.</p>
            <template v-else>
              <p class="text-2xl font-semibold tracking-tight tabular-nums text-cyan-700 dark:text-cyan-300 mt-1">{{ fmt(h.expected) }}</p>
              <div class="grid grid-cols-2 gap-3 mt-1.5 text-xs tabular-nums">
                <div v-for="k in ['noncrit', 'crit']" :key="k">
                  <p class="text-stone-400 dark:text-stone-500">{{ k === 'crit' ? '크리' : '비크리' }} {{ survival ? '최대' : '평균' }}</p>
                  <p class="text-stone-800 dark:text-stone-100 font-medium">{{ fmt(avgOf(h[k])) }}</p>
                  <p class="text-stone-500 dark:text-stone-400">
                    <template v-if="survival">난수 미적용</template>
                    <template v-else>{{ fmt(h[k].min) }} ~ {{ fmt(h[k].max) }}</template>
                  </p>
                </div>
              </div>
              <p v-if="h.conditions?.length" class="text-[11px] text-stone-400 dark:text-stone-500 mt-1">조건 충족 시 발생하는 타격입니다.</p>
              <div class="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-stone-100 dark:border-stone-700/60 text-xs tabular-nums">
                <label class="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
                  타격 횟수
                  <input
                    :value="countOf(h)"
                    type="number"
                    min="0"
                    inputmode="numeric"
                    class="h-7 w-20 sm:w-16 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-2 text-right focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                    @input="setCount(h, $event.target.value)"
                  />
                  회
                </label>
                <span class="text-stone-600 dark:text-stone-300">합 {{ fmt(h.expected * countOf(h)) }}</span>
              </div>
            </template>
          </div>
        </div>
        <p v-if="unavailableCount" class="text-[11px] text-stone-400 dark:text-stone-500">
          반대 채널 타격 {{ unavailableCount }}개는 계산에서 뺐습니다 (팬텀메이지·쥬얼스타처럼 물리·마법이 섞인 스킬).
        </p>
      </template>
    </template>
  </div>
</template>
