<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import {
  calculateBattlePower,
  compareEquipment,
  createEmptyEquipment,
  createEmptyStats,
  EQUIP_KEYS,
} from './utils/battlePower.js';

import StatInputForm from './components/StatInputForm.vue';
import EfficiencyPanel from './components/EfficiencyPanel.vue';
import RelicActivePanel from './components/RelicActivePanel.vue';
import EquipmentCompare from './components/EquipmentCompare.vue';
import ResultDisplay from './components/ResultDisplay.vue';
import CharacterList from './components/CharacterList.vue';
import DarkModeToggle from './components/DarkModeToggle.vue';
import MemorialSimulator from './components/MemorialSimulator.vue';
import EnchantSimulator from './components/EnchantSimulator.vue';
// import DamagePredict from './components/DamagePredict.vue'; // 대미지 예측 탭 — DB 작업 보류로 일시 숨김
// import RelicSimulator from './components/RelicSimulator.vue'; // 기존 성물 환산기 (전용석/공용석 합산) — 보존, 추후 부활용
import AwakeningSimulator from './components/AwakeningSimulator.vue';
import RelicGachaSimulator from './components/RelicGachaSimulator.vue';
import AdventureView from './components/AdventureView.vue';
import AuthModal from './components/AuthModal.vue';
import MigrationModal from './components/MigrationModal.vue';
import { useAuth } from './composables/useAuth.js';
import { useCharacterStorage } from './composables/useCharacterStorage.js';

// ============================================================
// 인증 상태 + 모달 트리거
// ============================================================
const { isLoggedIn, nickname: authNickname, logout } = useAuth();
const authModalOpen = ref(false);
const authModalInitialStep = ref('login');

function openAuth(step = 'login') {
  authModalInitialStep.value = step;
  authModalOpen.value = true;
}

// ============================================================
// 캐릭터 영속화 — 활성 캐릭터의 stats / awak_stones 자동 동기화 & 자동 저장.
// ============================================================
const {
  activeCharacter,
  saveCharacter,
  getLocalCharacterPreview,
  migrateLocalToServer,
} = useCharacterStorage();

// ──── 마이그레이션 다이얼로그 (localStorage → 서버) ────
const migrationOpen = ref(false);
const migrationLocalChars = ref([]);

function checkMigration() {
  if (!isLoggedIn.value) return;
  const preview = getLocalCharacterPreview();
  if (preview.length > 0) {
    migrationLocalChars.value = preview;
    migrationOpen.value = true;
  }
}

// 새 로그인 / 회원가입 / 복구 직후, 그리고 새로고침 시 로그인 상태로 부활했을 때 모두 검사.
watch(isLoggedIn, (now) => {
  if (now) checkMigration();
});
// onMounted 대용 — script setup 평가 시점에서 isLoggedIn 이 true 면 1회 검사.
if (isLoggedIn.value) {
  // nextTick 으로 미루어 다른 컴포넌트 마운트 사이클과 분리.
  Promise.resolve().then(checkMigration);
}

async function onMigrationConfirm({ resolve, reject }) {
  try {
    const result = await migrateLocalToServer();
    resolve(result);
  } catch (err) {
    reject(err);
  }
}

// ============================================================
// 탭 상태
// ============================================================
const activeTab = ref('calc');

const TABS = [
  { id: 'calc', label: '🛡️ 전투력 계산', desc: '장비 교체 시 BP 변화 시뮬' },
  { id: 'memorial', label: '🎲 메모리얼 시뮬', desc: '목표 옵션 도달까지 시도 횟수' },
  { id: 'enchant', label: '🔨 인챈트 시뮬', desc: '장비 인챈트 / 특수장비 강화' },
  // { id: 'damage', label: '🎯 대미지 예측', desc: '스킬계수 + 캘리브레이션' }, // DB 작업 보류로 일시 숨김
  // { id: 'relic', label: '🌟 성물 환산', desc: '성물 레벨 + 전용석/공용석 합산' }, // 기존 환산기 — 임시 비활성
  { id: 'relicGacha', label: '🌟 성물 시뮬', desc: '신성의 돌 / 전용석 뽑기 시뮬' },
  { id: 'awakening', label: '💎 각성석 시뮬', desc: '(기간제) 상급 각성석 돌려보기' },
  { id: 'adventure', label: '🗺️ 어드벤처', desc: '어드벤처 단계별 버프 + 전체 지도' },
];

// ============================================================
// 전투력 계산 탭 상태 (기존)
// ============================================================
const stats = ref(createEmptyStats('P'));
const awakStones = ref([]); // 활성 캐릭터의 각성석 옵션 — EfficiencyPanel 과 v-model 양방향.
const oldEquip = ref(createEmptyEquipment());
const newEquip = ref(createEmptyEquipment());

const battlePower = computed(() => calculateBattlePower(stats.value));

const result = computed(() => {
  const hasAnyDiff = EQUIP_KEYS.some(
    (k) => Number(oldEquip.value[k] || 0) !== Number(newEquip.value[k] || 0)
  );
  if (!hasAnyDiff) return null;
  return compareEquipment(stats.value, oldEquip.value, newEquip.value);
});

function resetEquipment() {
  oldEquip.value = createEmptyEquipment();
  newEquip.value = createEmptyEquipment();
}

// ============================================================
// 활성 캐릭터 ↔ 작업영역 (stats / awakStones) 양방향 동기화 + 자동 저장
// ============================================================
// 활성 캐릭터 변경 시 작업영역을 그 캐릭터 데이터로 교체. 이 변경은 자동 저장
// 디바운스를 트리거해선 안 되므로 applying 플래그로 1틱 차단한다.
let applyingFromCharacter = false;

watch(
  activeCharacter,
  async (c) => {
    applyingFromCharacter = true;
    if (c) {
      stats.value = { ...createEmptyStats(c.stats?.type || 'P'), ...c.stats };
      awakStones.value = Array.isArray(c.awak_stones) ? [...c.awak_stones] : [];
    }
    await nextTick();
    applyingFromCharacter = false;
  },
  { immediate: true },
);

// 자동 저장 상태 — 헤더 인디케이터에 표시.
//   'idle'   : 변경 없음 (또는 활성 캐릭터 없음)
//   'pending': 변경 감지, 디바운스 대기 중
//   'saving' : 실제 API/localStorage 저장 진행
//   'saved'  : 마지막 저장 성공
//   'error'  : 마지막 저장 실패
const saveStatus = ref('idle');
const lastSavedAt = ref(null);
const saveError = ref('');

let saveTimer = null;
const SAVE_DEBOUNCE_MS = 2000;

watch(
  [stats, awakStones],
  () => {
    if (applyingFromCharacter) return;
    if (!activeCharacter.value) return; // 활성 캐릭터 없으면 자동 저장 X.
    saveStatus.value = 'pending';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const target = activeCharacter.value;
      if (!target) return;
      saveStatus.value = 'saving';
      saveError.value = '';
      try {
        await saveCharacter(target.name, stats.value, awakStones.value);
        saveStatus.value = 'saved';
        lastSavedAt.value = Date.now();
      } catch (err) {
        saveStatus.value = 'error';
        saveError.value = err?.message || '저장 실패';
      }
    }, SAVE_DEBOUNCE_MS);
  },
  { deep: true },
);

const savedTimeLabel = computed(() => {
  if (!lastSavedAt.value) return '';
  const d = new Date(lastSavedAt.value);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
});
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
              라테일 유틸리티
            </h1>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              전투력 계산 · 메모리얼 시뮬 (베타)
            </p>
          </div>
        </div>

        <!-- 우측: 저장 상태 + 인증 + 다크모드 -->
        <div class="flex items-center gap-2">
          <!-- 자동 저장 인디케이터 — 활성 캐릭터 있을 때만 노출 -->
          <span
            v-if="activeCharacter"
            :class="[
              'hidden sm:inline text-[11px] tabular-nums whitespace-nowrap',
              saveStatus === 'error'
                ? 'text-rose-600 dark:text-rose-400'
                : saveStatus === 'saving' || saveStatus === 'pending'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400',
            ]"
            :title="saveStatus === 'error' ? saveError : (lastSavedAt ? `마지막 저장 ${new Date(lastSavedAt).toLocaleString()}` : '')"
          >
            <template v-if="saveStatus === 'pending'">⏳ 변경됨</template>
            <template v-else-if="saveStatus === 'saving'">💾 저장 중...</template>
            <template v-else-if="saveStatus === 'saved'">💾 저장됨 {{ savedTimeLabel }}</template>
            <template v-else-if="saveStatus === 'error'">⚠ 저장 실패</template>
          </span>

          <template v-if="isLoggedIn">
            <span class="hidden sm:inline text-xs text-slate-600 dark:text-slate-300 max-w-[120px] truncate">
              👤 {{ authNickname }}
            </span>
            <button
              type="button"
              @click="logout"
              class="text-xs px-2 py-1 rounded ring-1 ring-slate-300 dark:ring-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              로그아웃
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              @click="openAuth('login')"
              class="text-xs px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition"
            >
              로그인
            </button>
          </template>
          <DarkModeToggle />
        </div>
      </div>

      <!-- 탭 네비 -->
      <nav class="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap',
            activeTab === tab.id
              ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
          ]"
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <!-- ───── 탭 1: 전투력 계산 ───── -->
      <template v-if="activeTab === 'calc'">
        <div
          class="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 ring-1 ring-indigo-200 dark:ring-indigo-800 px-4 py-3 text-sm text-indigo-800 dark:text-indigo-200"
        >
          <strong>ℹ️ 모델 정확도</strong> · 57건의 검증된 실측 T창 데이터 회귀분석 기반
          (물리 RMSE <strong>0.28%</strong> / 마법 RMSE <strong>0.13%</strong>, 모든 케이스 오차 1% 이내).
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <!-- 좌측: 입력 + 비교 + 결과 -->
          <div class="space-y-5">
            <StatInputForm v-model="stats" :battle-power="battlePower" />

            <EfficiencyPanel :stats="stats" v-model:awak-stones="awakStones" />

            <RelicActivePanel :stats="stats" />

            <EquipmentCompare
              :stats="stats"
              v-model:old-equip="oldEquip"
              v-model:new-equip="newEquip"
              @reset="resetEquipment"
            />

            <ResultDisplay :result="result" :type="stats.type" />
          </div>

          <!-- 우측: 캐릭터 -->
          <aside class="space-y-5">
            <CharacterList
              :current-stats="stats"
              :current-awak-stones="awakStones"
            />
          </aside>
        </div>
      </template>

      <!-- ───── 탭 2: 메모리얼 시뮬 ───── -->
      <template v-else-if="activeTab === 'memorial'">
        <MemorialSimulator />
      </template>

      <!-- ───── 탭 3: 인챈트 시뮬 ───── -->
      <template v-else-if="activeTab === 'enchant'">
        <EnchantSimulator />
      </template>

      <!-- ───── (보류) 탭 4: 대미지 예측 — DB 작업 후 복귀 예정 ───── -->
      <!--
      <template v-else-if="activeTab === 'damage'">
        <DamagePredict v-model:stats="stats" />
      </template>
      -->

      <!-- ───── (보류) 기존 성물 환산기 ───── -->
      <!--
      <template v-else-if="activeTab === 'relic'">
        <RelicSimulator />
      </template>
      -->

      <!-- ───── 탭 5: 성물 뽑기 시뮬 (신규) ───── -->
      <template v-else-if="activeTab === 'relicGacha'">
        <RelicGachaSimulator />
      </template>

      <!-- ───── 탭 6: 각성석 시뮬 ───── -->
      <template v-else-if="activeTab === 'awakening'">
        <AwakeningSimulator />
      </template>

      <!-- ───── 탭 7: 어드벤처 ───── -->
      <template v-else-if="activeTab === 'adventure'">
        <AdventureView />
      </template>

      <footer class="pt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        <p>비공식 팬 도구 · 라테일은 액토즈소프트(Actoz Soft)의 IP입니다.</p>
      </footer>
    </main>

    <AuthModal v-model="authModalOpen" :initial-step="authModalInitialStep" />
    <MigrationModal
      v-model="migrationOpen"
      :local-characters="migrationLocalChars"
      @confirm="onMigrationConfirm"
    />
  </div>
</template>
