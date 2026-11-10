<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api/client.js';

// ============================================================
// 캐릭터 변경 이력 — 관리자(users.admin) 전용. 전체 사용자의 생성·수정·삭제 기록을 최신순으로 본다.
//   서버 GET /admin/history 가 관리자만 허용하므로 탭을 숨기는 것과 별개로 서버에서 다시 막힌다.
//   수정 기록의 changes 는 {"stats.크댐": [전, 후], "awak_stones": [전 목록, 후 목록]} 형태 (backend/app/history.py).
// ============================================================

const PAGE = 50;
const FIELD_LABEL = {
  name: '이름',
  type: '유형',
  stats: '스탯',
  awak_stones: '각성석',
  memorials: '메모리얼',
  runeword: '룬워드',
  skill_configs: '스킬 설정',
  relics: '성물',
  damage_settings: '대미지 설정',
};
const ACTION = {
  create: { label: '생성', cls: 'text-cyan-700 dark:text-cyan-300 ring-cyan-300 dark:ring-cyan-700' },
  update: { label: '수정', cls: 'text-stone-600 dark:text-stone-300 ring-stone-300 dark:ring-stone-600' },
  delete: { label: '삭제', cls: 'text-orange-700 dark:text-orange-300 ring-orange-300 dark:ring-orange-700' },
};

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
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}:${p(k.getUTCSeconds())}`;
}

function fmtValue(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : String(v);
  if (typeof v === 'string') return v === '' ? '""' : v;
  if (typeof v === 'boolean') return v ? '켜짐' : '꺼짐';
  // 각성석 한 개 {options: [{stat, unit, value}]} → "주스탯 10% · 크댐 3%"
  if (Array.isArray(v?.options)) {
    const parts = v.options.filter((o) => o && o.stat).map((o) => `${o.stat} ${o.value ?? ''}${o.unit ?? ''}`);
    return parts.length ? parts.join(' · ') : '(빈 각성석)';
  }
  return JSON.stringify(v);
}

function fmtPath(path) {
  const [head, ...rest] = path.split('.');
  return [FIELD_LABEL[head] ?? head, ...rest].join(' · ');
}

// 수정 기록 → 화면 줄 목록. 목록 값(각성석·룬워드 등)은 바뀐 칸만 "N번" 으로 펼친다.
function updateLines(changes) {
  const lines = [];
  for (const [path, [before, after]] of Object.entries(changes || {})) {
    if (Array.isArray(before) && Array.isArray(after)) {
      const n = Math.max(before.length, after.length);
      for (let i = 0; i < n; i++) {
        if (JSON.stringify(before[i]) === JSON.stringify(after[i])) continue;
        lines.push({ path: `${fmtPath(path)} · ${i + 1}번`, before: before[i], after: after[i] });
      }
    } else {
      lines.push({ path: fmtPath(path), before, after });
    }
  }
  return lines;
}

// 생성·삭제 기록 → 그 시점 스냅샷 요약 줄.
function snapshotLines(snap) {
  const s = snap || {};
  const stats = s.stats || {};
  const pick = ['주스탯', '공격력', '크댐', '관통', '몬추'].filter((k) => stats[k] !== undefined);
  return [
    { path: '유형', value: s.type === 'M' ? '마법' : s.type === 'P' ? '물리' : s.type },
    ...pick.map((k) => ({ path: `스탯 · ${k}`, value: stats[k] })),
    { path: '스탯 항목 수', value: Object.keys(stats).length },
    { path: '각성석', value: `${(s.awak_stones || []).length}개` },
  ];
}

function summary(r) {
  if (r.action !== 'update') return r.action === 'create' ? '새 캐릭터' : '캐릭터 삭제';
  const keys = Object.keys(r.changes || {});
  const fields = [...new Set(keys.map((k) => FIELD_LABEL[k.split('.')[0]] ?? k.split('.')[0]))];
  return `${fields.join(', ')} · ${keys.length}건`;
}

const empty = computed(() => !loading.value && !error.value && rows.value.length === 0);
</script>

<template>
  <section class="space-y-3">
    <div>
      <h2 class="text-base font-bold text-stone-800 dark:text-stone-100">캐릭터 변경 이력</h2>
      <p class="text-xs text-stone-500 dark:text-stone-300">전체 사용자의 생성·수정·삭제 기록 (관리자 전용, 최신순). 11-10 이전은 일일 백업 비교로 복원한 하루 단위 기록</p>
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
      <li v-for="r in rows" :key="r.id">
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
            <span class="block truncate text-xs text-stone-500 dark:text-stone-300">
              <span
                v-if="r.source === 'backup'"
                class="mr-1 text-stone-400"
                title="일일 DB 백업끼리 비교해 복원한 기록 — 하루 안의 중간 변경은 빠지고 그날 최종 결과만 있다"
                >백업 복원 ·</span
              >{{ summary(r) }}
            </span>
          </span>
          <span class="shrink-0 text-right text-[11px] tabular-nums text-stone-500 dark:text-stone-300">{{ fmtTime(r.created_at) }}</span>
        </button>

        <div v-if="open.has(r.id)" class="space-y-1 px-3 pb-3 text-xs">
          <template v-if="r.action === 'update'">
            <div
              v-for="(l, i) in updateLines(r.changes)"
              :key="i"
              class="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 border-t border-stone-100 pt-1 dark:border-stone-800"
            >
              <span class="text-stone-500 dark:text-stone-300">{{ l.path }}</span>
              <span class="break-all tabular-nums">
                <span class="text-stone-400 line-through decoration-stone-300">{{ fmtValue(l.before) }}</span>
                <span class="mx-1 text-stone-400">→</span>
                <span class="font-semibold text-stone-800 dark:text-stone-100">{{ fmtValue(l.after) }}</span>
              </span>
            </div>
          </template>
          <template v-else>
            <div
              v-for="(l, i) in snapshotLines(r.changes)"
              :key="i"
              class="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 border-t border-stone-100 pt-1 dark:border-stone-800"
            >
              <span class="text-stone-500 dark:text-stone-300">{{ l.path }}</span>
              <span class="font-semibold tabular-nums text-stone-800 dark:text-stone-100">{{ fmtValue(l.value) }}</span>
            </div>
            <details class="pt-1">
              <summary class="cursor-pointer text-stone-500 dark:text-stone-300">전체 데이터</summary>
              <pre class="mt-1 max-h-64 overflow-auto rounded bg-stone-50 p-2 text-[11px] dark:bg-stone-900">{{ JSON.stringify(r.changes, null, 2) }}</pre>
            </details>
          </template>
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
