<script setup>
import { computed, ref, watch } from 'vue';
import {
  calculateBattlePower,
  compareEquipment,
  createEmptyEquipment,
  createEmptyStats,
  EQUIP_KEYS,
} from './utils/battlePower.js';
import { useHistory } from './composables/useHistory.js';

import StatInputForm from './components/StatInputForm.vue';
import EquipmentCompare from './components/EquipmentCompare.vue';
import ResultDisplay from './components/ResultDisplay.vue';
import CharacterList from './components/CharacterList.vue';
import HistoryPanel from './components/HistoryPanel.vue';
import DarkModeToggle from './components/DarkModeToggle.vue';

const stats = ref(createEmptyStats('P'));
const slot = ref('무기');
const oldEquip = ref(createEmptyEquipment());
const newEquip = ref(createEmptyEquipment());
const characterName = ref('');
const contributeOptIn = ref(false); // Phase 2 활성화 예정

const battlePower = computed(() => calculateBattlePower(stats.value));

const result = computed(() => {
  const hasAnyDiff = EQUIP_KEYS.some(
    (k) => Number(oldEquip.value[k] || 0) !== Number(newEquip.value[k] || 0)
  );
  if (!hasAnyDiff) return null;
  return compareEquipment(stats.value, oldEquip.value, newEquip.value);
});

const { addEntry } = useHistory();

let lastLoggedResultKey = '';
watch(result, (val) => {
  if (!val) return;
  // 동일 결과 중복 기록 방지: 변경된 입력의 fingerprint
  const fp = `${val.currentBP}|${val.newBP}|${slot.value}|${JSON.stringify(oldEquip.value)}|${JSON.stringify(newEquip.value)}`;
  if (fp === lastLoggedResultKey) return;
  lastLoggedResultKey = fp;
  addEntry({
    characterName: characterName.value || '이름없음',
    slot: slot.value,
    stats: { ...stats.value },
    oldEquip: { ...oldEquip.value },
    newEquip: { ...newEquip.value },
    result: {
      currentBP: val.currentBP,
      newBP: val.newBP,
      change: val.change,
      changePercent: val.changePercent,
      direction: val.direction,
      contributions: val.contributions,
    },
  });
});

function loadStatsFromCharacter(loaded) {
  stats.value = { ...createEmptyStats(loaded.type || 'P'), ...loaded };
}

function resetEquipment() {
  oldEquip.value = createEmptyEquipment();
  newEquip.value = createEmptyEquipment();
}

function restoreFromHistory(entry) {
  stats.value = { ...createEmptyStats(entry.stats.type || 'P'), ...entry.stats };
  oldEquip.value = { ...createEmptyEquipment(), ...entry.oldEquip };
  newEquip.value = { ...createEmptyEquipment(), ...entry.newEquip };
  slot.value = entry.slot || '무기';
  characterName.value = entry.characterName === '이름없음' ? '' : entry.characterName;
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100">
    <header
      class="sticky top-0 z-10 backdrop-blur bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img
            src="/assets/latale/logo-latale.png"
            alt="LaTale"
            class="h-10 sm:h-12 w-auto select-none"
            draggable="false"
          />
          <div class="border-l border-slate-300 dark:border-slate-600 pl-3">
            <h1 class="text-base sm:text-lg font-extrabold text-indigo-700 dark:text-indigo-300 leading-tight">
              전투력 비교 시뮬레이터
            </h1>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              장비 교체 시 전투력 변화를 미리 확인 (베타)
            </p>
          </div>
        </div>
        <DarkModeToggle />
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <!-- 베타 안내 -->
      <div
        class="rounded-xl bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
      >
        <strong>⚠️ 베타 버전</strong> · 물리 직업 정확도 95~98%, 마법 직업 85~95%.
        일부 스탯(추가 데미지·관통)의 효과는 추정치이며 실제와 차이날 수 있습니다.
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <!-- 좌측: 입력 + 비교 + 결과 -->
        <div class="space-y-5">
          <StatInputForm v-model="stats" :battle-power="battlePower" />

          <EquipmentCompare
            v-model:stats="stats"
            v-model:slot="slot"
            v-model:old-equip="oldEquip"
            v-model:new-equip="newEquip"
            @reset="resetEquipment"
          />

          <ResultDisplay :result="result" :type="stats.type" />

          <!-- 익명 데이터 기여 (Phase 2 비활성) -->
          <section
            class="rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-4"
          >
            <label class="flex items-start gap-3 cursor-not-allowed opacity-60">
              <input
                type="checkbox"
                v-model="contributeOptIn"
                disabled
                class="mt-1 rounded"
              />
              <span class="text-sm">
                <span class="block font-medium text-slate-700 dark:text-slate-200">
                  내 T창 정보를 익명으로 기여하기 (Phase 2 예정)
                </span>
                <span class="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  데이터가 누적될수록 공식 정확도가 개선됩니다. 개인정보는 수집하지 않습니다.
                </span>
              </span>
            </label>
          </section>
        </div>

        <!-- 우측: 캐릭터 + 히스토리 -->
        <aside class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              현재 캐릭터 이름 (히스토리용)
            </label>
            <input
              v-model="characterName"
              type="text"
              placeholder="예: 메인캐릭"
              class="w-full rounded-md border-0 ring-1 ring-slate-300 dark:ring-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <CharacterList :current-stats="stats" @load="loadStatsFromCharacter" />
          <HistoryPanel @restore="restoreFromHistory" />
        </aside>
      </div>

      <footer class="pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
        <p>
          전투력 공식은 51개의 실제 T창 데이터(관통 페어 3쌍 포함)를 회귀분석하여 도출했습니다 · RMSE 0.94% · 관통 1당 약 +0.81%
        </p>
        <p class="mt-1">
          데이터 부족으로 일부 직업/스탯에서 오차가 있을 수 있습니다. 사용자 데이터 기여로 개선될 예정입니다.
        </p>
      </footer>
    </main>
  </div>
</template>
