<script setup>
import { computed, onMounted, ref, shallowRef } from 'vue';
import { api } from '../api/client.js';
import { describeChanges, summarize } from '../utils/historyFormat.js';
import { ACTIVE_RELICS } from '../utils/relicActive.js';
import { RUNES } from '../data/runeWordData.js';
import { MONSTER_PRESETS } from '../data/monsterPresets.js';
import { ALL_MEMORIALS } from '../data/memorialProbabilities.js';
import { cleanName, createSkillEngine } from '../utils/skillEngine.js';

// ============================================================
// 캐릭터 변경 이력 — 관리자(users.admin) 전용. 전체 사용자의 생성·수정·삭제 기록을 최신순으로 본다.
//   서버 GET /admin/history 가 관리자만 허용하므로 탭을 숨기는 것과 별개로 서버에서 다시 막힌다.
//   changes → 읽는 문장 변환은 utils/historyFormat.js. 스킬·특화석 이름은 skillData.json 을 늦게 불러와 채운다.
// ============================================================

const PAGE = 50;
const ACTION = {
  create: { label: '생성', cls: 'text-cyan-700 dark:text-cyan-300 ring-cyan-300 dark:ring-cyan-700' },
  update: { label: '수정', cls: 'text-stone-600 dark:text-stone-300 ring-stone-300 dark:ring-stone-600' },
  delete: { label: '삭제', cls: 'text-orange-700 dark:text-orange-300 ring-orange-300 dark:ring-orange-700' },
};

// ── 이름 사전 ──
const relicNames = Object.fromEntries(ACTIVE_RELICS.map((r) => [r.key, r.name]));
const runeNames = Object.fromEntries(RUNES.map((r) => [r.id, r.name]));
const presetNames = Object.fromEntries(MONSTER_PRESETS.map((p) => [p.id, p.label]));
const skill = shallowRef(null); // { data, engine } — 스킬 설정 변경이 있을 때만 내려받는다

const ctx = computed(() => {
  const s = skill.value;
  const split = (key) => String(key).split(':').map(Number);
  return {
    relicName: (k) => relicNames[k],
    runeName: (id) => runeNames[id],
    presetName: (id) => presetNames[id],
    memorialName: (k) => ALL_MEMORIALS[k]?.name,
    skillName: (key) => {
      const [, id] = split(key);
      return s ? cleanName(s.data.skills[id]?.name) || null : null;
    },
    stoneName: (key, stone) => {
      if (!s) return null;
      const [cls, id] = split(key);
      const opt = s.engine.optionsFor(cls, id).find((o) => o.type === stone.type && o.number === stone.number);
      return opt ? cleanName(opt.name) : null;
    },
  };
});

function ensureSkillData(list) {
  if (skill.value || !list.some((r) => JSON.stringify(r.changes).includes('skill_configs'))) return;
  import('../data/skillData.json')
    .then((m) => {
      const data = m.default || m;
      skill.value = { data, engine: createSkillEngine(data) };
    })
    .catch(() => {
      /* 이름 없이 번호로 보여 준다 */
    });
}

// ── 목록 ──
const rows = ref([]);
const loading = ref(false);
const error = ref('');
const hasMore = ref(false);
const query = ref('');
const open = ref(new Set());

async function load({ append = false } = {}) {
  loading.value = true;
  error.value = '';
  try {
    const before = append ? rows.value.at(-1)?.id : undefined;
    const page = await api.adminHistory({ limit: PAGE, beforeId: before, q: query.value.trim() });
    rows.value = append ? rows.value.concat(page) : page;
    hasMore.value = page.length === PAGE;
    if (!append) open.value = new Set();
    ensureSkillData(page);
  } catch (e) {
    error.value = e.message || '이력을 불러오지 못했습니다.';
  } finally {
    loading.value = false;
  }
}
onMounted(() => load());

function toggle(id) {
  const next = new Set(open.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  open.value = next;
}

// SQLite 가 tz 없는 UTC 문자열로 돌려주므로 Z 를 붙여 KST 로 표시한다.
function fmtTime(s) {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  const p = (n) => String(n).padStart(2, '0');
  const k = new Date(d.getTime() + 9 * 3600e3);
  return `${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

const view = computed(() =>
  rows.value.map((r) => ({
    ...r,
    summary: summarize(r, ctx.value),
    groups: open.value.has(r.id) ? describeChanges(r, ctx.value) : [],
  })),
);
const empty = computed(() => !loading.value && !error.value && rows.value.length === 0);
</script>

<template>
  <section class="space-y-3">
    <div>
      <h2 class="text-base font-bold text-stone-800 dark:text-stone-100">캐릭터 변경 이력</h2>
      <p class="text-xs text-stone-500 dark:text-stone-300">전체 사용자의 생성·수정·삭제 기록, 최신순. 11-10 이전은 일일 백업 비교로 복원한 하루 단위 기록</p>
    </div>

    <form class="flex gap-2" @submit.prevent="load()">
      <input
        v-model="query"
        type="search"
        placeholder="닉네임 또는 캐릭터명"
        class="min-w-0 flex-1 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-stone-200 focus:outline-none focus:ring-cyan-500 dark:bg-stone-800 dark:ring-stone-700"
      />
      <button
        type="submit"
        :disabled="loading"
        class="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
      >
        조회
      </button>
    </form>

    <p v-if="error" class="text-sm text-orange-700 dark:text-orange-300">{{ error }}</p>
    <p v-if="empty" class="py-6 text-center text-sm text-stone-500 dark:text-stone-300">기록이 없습니다.</p>

    <ul class="divide-y divide-stone-200 rounded-lg ring-1 ring-stone-200 dark:divide-stone-700 dark:ring-stone-700">
      <li v-for="r in view" :key="r.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-50 dark:hover:bg-stone-800/60"
          :aria-expanded="open.has(r.id)"
          @click="toggle(r.id)"
        >
          <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1" :class="ACTION[r.action]?.cls">
            {{ ACTION[r.action]?.label ?? r.action }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
              {{ r.nickname }} <span class="font-normal text-stone-400">/</span> {{ r.character_name }}
            </span>
            <span class="block truncate text-xs text-stone-500 dark:text-stone-300">{{ r.summary }}</span>
          </span>
          <span class="shrink-0 text-right text-[11px] leading-tight tabular-nums text-stone-500 dark:text-stone-300">
            {{ fmtTime(r.created_at) }}
            <span
              v-if="r.source === 'backup'"
              class="block text-stone-400"
              title="일일 DB 백업끼리 비교해 복원한 기록 — 하루 안의 중간 변경은 빠지고 그날 최종 결과만 있다"
              >백업 복원</span
            >
          </span>
        </button>

        <div v-if="open.has(r.id)" class="space-y-3 px-3 pb-3 pt-1">
          <p v-if="!r.groups.length" class="text-xs text-stone-500 dark:text-stone-300">
            저장된 값은 그대로이고 화면 설정(미리보기 토글 등)만 바뀌었습니다.
          </p>

          <component
            :is="g.initial || (r.action !== 'update' && g.field !== 'stats' && g.field !== 'type') ? 'details' : 'div'"
            v-for="g in r.groups"
            :key="g.field"
            class="group"
          >
            <component
              :is="g.initial || (r.action !== 'update' && g.field !== 'stats' && g.field !== 'type') ? 'summary' : 'h3'"
              class="mb-1 cursor-pointer text-[11px] font-semibold tracking-wide text-stone-500 dark:text-stone-300"
            >
              {{ g.title }}
              <span class="font-normal text-stone-400">· {{ g.initial ? `처음 저장 ${g.lines.length}개` : `${g.lines.length}개` }}</span>
            </component>
            <dl class="divide-y divide-stone-100 text-xs dark:divide-stone-800">
              <div v-for="(l, i) in g.lines" :key="i" class="grid grid-cols-[minmax(6rem,9rem)_1fr] gap-x-3 py-1">
                <dt class="text-stone-500 dark:text-stone-300">{{ l.label }}</dt>
                <dd class="min-w-0 break-words tabular-nums">
                  <template v-if="r.action === 'update' && !g.initial">
                    <span class="text-stone-400">{{ l.before }}</span>
                    <span class="mx-1 text-stone-400">→</span>
                    <span class="font-semibold text-stone-800 dark:text-stone-100">{{ l.after }}</span>
                  </template>
                  <span v-else class="font-semibold text-stone-800 dark:text-stone-100">{{ l.after }}</span>
                </dd>
              </div>
            </dl>
          </component>
        </div>
      </li>
    </ul>

    <div v-if="hasMore" class="text-center">
      <button
        type="button"
        :disabled="loading"
        class="rounded-full px-4 py-1.5 text-xs font-semibold text-stone-600 ring-1 ring-stone-300 hover:ring-cyan-400 disabled:opacity-50 dark:text-stone-300 dark:ring-stone-600"
        @click="load({ append: true })"
      >
        더 보기
      </button>
    </div>
    <p v-if="loading" class="text-center text-xs text-stone-500 dark:text-stone-300">불러오는 중…</p>
  </section>
</template>
