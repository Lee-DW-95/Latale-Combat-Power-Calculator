<script setup>
import { ref } from 'vue';
import { useCharacterStorage } from '../composables/useCharacterStorage.js';
import { useAuth } from '../composables/useAuth.js';
import { buildSharePayload, encodeShare, shareUrlFor } from '../utils/shareLink.js';
import { calculateBattlePower } from '../utils/battlePower.js';
import { fmtRound } from '../utils/format.js';

// 목록에서 캐릭터별 전투력 확인 — 캐릭터 간 비교의 최소 단위.
function characterBP(c) {
  try {
    return calculateBattlePower(c.stats || {});
  } catch {
    return 0;
  }
}

function updatedLabel(c) {
  if (!c.updatedAt) return '';
  const d = new Date(c.updatedAt);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

const props = defineProps({
  currentStats: { type: Object, required: true },
  currentAwakStones: { type: Array, default: () => [] },
  currentMemorials: { type: Array, default: () => [] },
  currentRuneword: { type: Array, default: () => [] },
});

// ── 공유 링크 — 지금 화면의 캐릭터를 ?c=… 로 담아 클립보드에 복사 ──
const shareMsg = ref('');
async function onShare() {
  shareMsg.value = '';
  try {
    const active = characters.value.find((c) => c.id === activeId.value);
    const encoded = await encodeShare(
      buildSharePayload({
        name: active?.name || '',
        stats: props.currentStats,
        awakStones: props.currentAwakStones,
        memorials: props.currentMemorials,
        runeword: props.currentRuneword,
      }),
    );
    const url = shareUrlFor(encoded);
    await navigator.clipboard.writeText(url);
    shareMsg.value = `공유 링크를 복사했습니다 (${url.length.toLocaleString('ko-KR')}자). 받는 쪽은 로그인 없이 같은 캐릭터를 봅니다.`;
  } catch (err) {
    shareMsg.value = `링크 복사 실패: ${err?.message || '클립보드 접근 불가'}`;
  }
}

const {
  characters,
  activeId,
  saveCharacter,
  deleteCharacter,
  selectCharacter,
  exportCharacters,
  importCharacters,
} = useCharacterStorage();
const { isLoggedIn } = useAuth();

// ── JSON 내보내기 / 가져오기 ──
const fileInput = ref(null);
const ioMsg = ref('');

function onExport() {
  const data = exportCharacters();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `latale-characters-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  ioMsg.value = `${data.characters.length}개 캐릭터를 내보냈습니다.`;
}

async function onImportFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  ioMsg.value = '';
  errorMsg.value = '';
  try {
    const data = JSON.parse(await file.text());
    const r = await importCharacters(data);
    ioMsg.value = `가져오기 완료 — 새로 ${r.created}개, 덮어씀 ${r.updated}개${r.failed ? `, 실패 ${r.failed}개` : ''}`;
    if (r.errors.length) errorMsg.value = r.errors.slice(0, 3).join(' / ');
  } catch (err) {
    errorMsg.value = err?.message || '가져오기 실패';
  }
}

const newName = ref('');
const errorMsg = ref('');

async function onSave() {
  errorMsg.value = '';
  try {
    // saveCharacter 가 activeId 를 갱신 → App.vue 의 watch(activeCharacter) 가
    // stats/awakStones 동기화를 처리. 별도 emit 불필요.
    await saveCharacter(
      newName.value,
      props.currentStats,
      props.currentAwakStones,
      props.currentMemorials,
      props.currentRuneword,
    );
    newName.value = '';
  } catch (e) {
    errorMsg.value = e.message;
  }
}

function onSelect(id) {
  selectCharacter(id); // activeId 변경 → App.vue watch 가 stats/awakStones 동기화.
}

async function onDelete(id) {
  if (!confirm('이 캐릭터를 삭제하시겠습니까?')) return;
  try {
    await deleteCharacter(id);
  } catch (e) {
    errorMsg.value = e.message;
  }
}
</script>

<template>
  <section
    class="rounded-xl bg-white dark:bg-stone-800/60 ring-1 ring-stone-200 dark:ring-stone-700 p-5"
  >
    <!-- 제목은 아코디언 바가 담당 -->
    <div class="flex gap-2 mb-3">
      <input
        v-model="newName"
        type="text"
        placeholder="캐릭터 이름"
        @keyup.enter="onSave"
        class="flex-1 rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
      />
      <button
        type="button"
        @click="onSave"
        class="rounded-md bg-cyan-600 hover:bg-cyan-700 px-3 py-2 text-sm font-medium text-white transition"
      >
        저장
      </button>
    </div>
    <p v-if="errorMsg" class="text-xs text-rose-500 mb-2">{{ errorMsg }}</p>
    <p v-if="ioMsg" class="text-xs text-stone-500 dark:text-stone-400 mb-2">{{ ioMsg }}</p>
    <p v-if="shareMsg" class="text-xs text-stone-500 dark:text-stone-400 mb-2">{{ shareMsg }}</p>

    <ul v-if="characters.length > 0" class="space-y-1">
      <li
        v-for="c in characters"
        :key="c.id"
        :class="[
          'flex items-center justify-between rounded-md px-3 py-2 text-sm transition cursor-pointer',
          activeId === c.id
            ? 'bg-cyan-50 dark:bg-cyan-950/40 ring-1 ring-cyan-300 dark:ring-cyan-700'
            : 'bg-stone-50 dark:bg-stone-900/40 hover:bg-stone-100 dark:hover:bg-stone-700/50',
        ]"
        @click="onSelect(c.id)"
      >
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="font-medium text-stone-800 dark:text-stone-100 truncate">{{ c.name }}</span>
            <span
              :class="[
                'shrink-0 text-[10px] font-semibold px-1 py-px rounded',
                c.stats.type === 'M'
                  ? 'bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300'
                  : 'bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-300',
              ]"
            >
              {{ c.stats.type === 'M' ? '마법' : '물리' }}
            </span>
          </span>
          <span class="flex items-baseline gap-1.5 text-xs">
            <span class="font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
              {{ fmtRound(characterBP(c)) }}
            </span>
            <span v-if="updatedLabel(c)" class="text-[10px] text-stone-400 dark:text-stone-500">
              {{ updatedLabel(c) }}
            </span>
          </span>
        </span>
        <button
          type="button"
          @click.stop="onDelete(c.id)"
          class="ml-2 shrink-0 text-xs text-stone-400 hover:text-rose-500"
          title="삭제"
        >
          🗑
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-stone-500 dark:text-stone-400">
      저장된 캐릭터가 없습니다. 위에서 이름을 입력하고 저장하세요.
    </p>

    <!-- 저장 위치 안내 + 백업 -->
    <div class="mt-3 pt-3 border-t border-stone-100 dark:border-stone-700/70 flex items-start justify-between gap-3 flex-wrap">
      <p class="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400 min-w-0 flex-1">
        <template v-if="isLoggedIn">
          서버에 저장되어 다른 기기에서도 같은 캐릭터를 이어 씁니다.
        </template>
        <template v-else>
          지금은 <span class="text-stone-700 dark:text-stone-200">이 브라우저에만</span> 저장됩니다. 로그인하면 서버에 저장되어
          다른 기기에서도 이어 쓸 수 있고, 아래 파일로 백업·이동할 수도 있습니다.
        </template>
      </p>
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          @click="onShare"
          class="h-7 px-2.5 rounded-md text-[11px] ring-1 ring-cyan-300 dark:ring-cyan-700 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition"
          title="지금 화면의 캐릭터(스탯·각성석·메모리얼·룬워드)를 링크로 복사"
        >
          공유 링크
        </button>
        <button
          type="button"
          @click="onExport"
          :disabled="characters.length === 0"
          class="h-7 px-2.5 rounded-md text-[11px] ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-40 transition"
          title="모든 캐릭터를 JSON 파일로 내려받기"
        >
          내보내기
        </button>
        <button
          type="button"
          @click="fileInput?.click()"
          class="h-7 px-2.5 rounded-md text-[11px] ring-1 ring-stone-300 dark:ring-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition"
          title="내보낸 JSON 파일에서 캐릭터 불러오기 (같은 이름은 덮어씀)"
        >
          가져오기
        </button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onImportFile" />
      </div>
    </div>
  </section>
</template>
