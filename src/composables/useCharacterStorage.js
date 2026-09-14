// 캐릭터 영속화 — 로그인 시 백엔드 API, 비로그인 시 localStorage fallback.
// 인터페이스(characters, activeId, saveCharacter, deleteCharacter, selectCharacter)는
// 호출자(CharacterList 등)가 모드 차이를 의식하지 않도록 동일하게 유지한다.
// 단, saveCharacter/deleteCharacter 는 비동기로 변경 — 호출자는 await 권장.

import { computed, ref, watch } from 'vue';
import { createEmptyStats } from '../utils/battlePower.js';
import { api } from '../api/client.js';
import { useAuth } from './useAuth.js';

const LOCAL_STORAGE_KEY = 'latale.characters.v1';
const LOCAL_ACTIVE_KEY = 'latale.activeCharacterId.v1';

// 글로벌 상태 — 모듈 평가 시 1회 생성, useCharacterStorage() 호출 어디서나 공유.
const characters = ref([]);
const activeId = ref(null);
const isLoading = ref(false);
const lastError = ref(null);

// 낙관적 잠금 충돌 — 서버가 409 로 "다른 기기가 먼저 저장했다" 고 알린 상태.
//   { id, serverCharacter(프론트 형식), message } — App.vue 가 배너를 띄우고 사용자가 고르면 비운다.
//   자동 저장과 캐릭터 목록의 "저장" 양쪽에서 같은 경로로 들어오므로 모듈 전역에 둔다.
const conflict = ref(null);

// 활성 캐릭터 객체 — id 매칭. 없으면 null.
const activeCharacter = computed(
  () => characters.value.find((c) => c.id === activeId.value) || null,
);

const { isLoggedIn } = useAuth();

// ──── localStorage 영속 (비로그인 모드 전용) ────
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 서버 응답(`updated_at` 문자열, `awak_stones` 스네이크) 을 프론트 캐릭터 객체로 매핑.
function fromServerCharacter(c) {
  return {
    id: c.id,
    name: c.name,
    // stats 안에 type 이 포함돼 있으나, 백엔드 스키마는 별도 컬럼이라 응답에도 별도로 옴 — 무시.
    stats: c.stats || createEmptyStats(c.type || 'P'),
    awak_stones: Array.isArray(c.awak_stones) ? c.awak_stones : [],
    memorials: Array.isArray(c.memorials) ? c.memorials : [],
    runeword: Array.isArray(c.runeword) ? c.runeword : [],
    updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : Date.now(),
    // 서버가 준 updated_at 원문 — 저장 때 expected_updated_at 으로 그대로 돌려보내 낙관적 잠금에 쓴다.
    //   (ms 로 변환한 updatedAt 을 다시 문자열로 만들면 마이크로초·tz 표기가 달라질 수 있어 원문을 보관)
    serverUpdatedAt: c.updated_at || null,
  };
}

/** 409 응답이 낙관적 잠금 충돌인지 (이름 중복 409 와 구분 — detail 에 character 가 실려 온다) */
function conflictFrom(err) {
  const d = err?.body?.detail;
  if (err?.status !== 409 || !d || typeof d !== 'object' || !d.character) return null;
  return { serverCharacter: fromServerCharacter(d.character), message: d.message || err.message };
}

async function refreshFromServer() {
  isLoading.value = true;
  lastError.value = null;
  try {
    const list = await api.listCharacters();
    characters.value = list.map(fromServerCharacter);
  } catch (err) {
    lastError.value = err.message;
    characters.value = [];
  } finally {
    isLoading.value = false;
  }
}

// 로그인 상태 변경(로그인/로그아웃/세션 부활) 시 데이터 소스 자동 전환.
watch(
  isLoggedIn,
  async (now) => {
    activeId.value = null;
    if (now) {
      await refreshFromServer();
    } else {
      characters.value = loadFromLocalStorage();
      activeId.value = localStorage.getItem(LOCAL_ACTIVE_KEY) || null;
    }
  },
  { immediate: true },
);

// 비로그인 모드에서만 localStorage 자동 동기화. 서버 모드는 명시적 API 호출만 신뢰.
watch(
  characters,
  (val) => {
    if (!isLoggedIn.value) localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(val));
  },
  { deep: true },
);

watch(activeId, (val) => {
  if (isLoggedIn.value) return;
  if (val) localStorage.setItem(LOCAL_ACTIVE_KEY, val);
  else localStorage.removeItem(LOCAL_ACTIVE_KEY);
});

function makeLocalId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCharacterStorage() {
  // saveCharacter — 동일 이름 캐릭터가 있으면 갱신, 없으면 신규 생성.
  //   awakStones / memorials / runeword 인자가 null/undefined 면 기존 값 유지(있을 때) 또는 빈 배열(신규).
  //   opts.force: 낙관적 잠금을 건너뛰고 덮어쓴다 (충돌 배너에서 "내 변경으로 덮어쓰기" 를 골랐을 때).
  //   서버 모드에서 다른 기기가 먼저 저장해 409 가 오면 conflict 를 채우고 ConflictError 를 던진다.
  async function saveCharacter(name, stats, awakStones = null, memorials = null, runeword = null, opts = {}) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('캐릭터 이름을 입력해주세요.');

    const existing = characters.value.find((c) => c.name === trimmed);

    if (isLoggedIn.value) {
      const payload = {
        name: trimmed,
        type: stats.type || 'P',
        stats: { ...stats },
        awak_stones: awakStones ?? existing?.awak_stones ?? [],
        memorials: memorials ?? existing?.memorials ?? [],
        runeword: runeword ?? existing?.runeword ?? [],
      };
      if (existing) {
        // 내가 마지막으로 받은 서버 버전을 함께 보낸다 — 그 사이 다른 기기가 저장했으면 서버가 409.
        if (!opts.force && existing.serverUpdatedAt) payload.expected_updated_at = existing.serverUpdatedAt;
        let res;
        try {
          res = await api.updateCharacter(existing.id, payload);
        } catch (err) {
          const c = conflictFrom(err);
          if (c) {
            conflict.value = { id: existing.id, ...c };
            const e = new Error(c.message);
            e.conflict = true;
            e.serverCharacter = c.serverCharacter;
            throw e;
          }
          throw err;
        }
        Object.assign(existing, fromServerCharacter(res));
        activeId.value = existing.id;
        conflict.value = null;
        return existing;
      }
      const created = fromServerCharacter(await api.createCharacter(payload));
      characters.value = [created, ...characters.value];
      activeId.value = created.id;
      return created;
    }

    // 비로그인 — localStorage.
    if (existing) {
      existing.stats = { ...stats };
      if (awakStones !== null) existing.awak_stones = awakStones;
      if (memorials !== null) existing.memorials = memorials;
      if (runeword !== null) existing.runeword = runeword;
      existing.updatedAt = Date.now();
      activeId.value = existing.id;
      return existing;
    }
    const created = {
      id: makeLocalId(),
      name: trimmed,
      stats: { ...stats },
      awak_stones: awakStones ?? [],
      memorials: memorials ?? [],
      runeword: runeword ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    characters.value = [created, ...characters.value];
    activeId.value = created.id;
    return created;
  }

  // 충돌 배너에서 "서버 저장본 불러오기" — 목록의 캐릭터를 서버 버전으로 바꾼다.
  //   화면(작업영역) 반영은 App.vue 가 반환값으로 한다 (Object.assign 은 activeCharacter 참조가 안 바뀌어 watch 가 안 돈다).
  function adoptServerCharacter() {
    const c = conflict.value;
    if (!c) return null;
    const existing = characters.value.find((x) => x.id === c.id);
    if (existing) Object.assign(existing, c.serverCharacter);
    conflict.value = null;
    return existing || null;
  }

  function dismissConflict() {
    conflict.value = null;
  }

  async function deleteCharacter(id) {
    if (isLoggedIn.value) {
      await api.deleteCharacter(id);
    }
    characters.value = characters.value.filter((c) => c.id !== id);
    if (activeId.value === id) activeId.value = null;
  }

  function selectCharacter(id) {
    const found = characters.value.find((c) => c.id === id);
    if (found) {
      activeId.value = id;
      return found;
    }
    return null;
  }

  function loadDefault() {
    return createEmptyStats('P');
  }

  // ──── 마이그레이션 — localStorage → 서버 ────
  // 로그인 직후, 비로그인 시절에 만들어 둔 로컬 캐릭터를 서버 계정으로 일괄 업로드.
  // 이름 충돌 시 `_local`, `_local2` 접미사로 회피. 완료 후 로컬 키 정리.
  function getLocalCharacterPreview() {
    return loadFromLocalStorage().map((c) => ({
      name: c.name || '(이름 없음)',
      type: c.stats?.type || 'P',
    }));
  }

  async function migrateLocalToServer() {
    if (!isLoggedIn.value) return { migrated: 0, failed: 0 };
    const local = loadFromLocalStorage();
    if (local.length === 0) return { migrated: 0, failed: 0 };

    let migrated = 0;
    let failed = 0;
    for (const c of local) {
      try {
        let name = (c.name || '캐릭터').trim() || '캐릭터';
        let attempt = 1;
        // characters.value 는 첫 createCharacter 호출 후 즉시 push 되므로 충돌 검사가 누적된다.
        while (characters.value.find((s) => s.name === name)) {
          attempt += 1;
          name = `${c.name}_local${attempt > 2 ? attempt : ''}`;
        }
        const created = fromServerCharacter(
          await api.createCharacter({
            name,
            type: c.stats?.type || 'P',
            stats: c.stats || {},
            awak_stones: Array.isArray(c.awak_stones) ? c.awak_stones : [],
            memorials: Array.isArray(c.memorials) ? c.memorials : [],
            runeword: Array.isArray(c.runeword) ? c.runeword : [],
          }),
        );
        characters.value = [created, ...characters.value];
        migrated += 1;
      } catch {
        failed += 1;
      }
    }

    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LOCAL_ACTIVE_KEY);
    return { migrated, failed };
  }

  return {
    characters,
    activeId,
    activeCharacter,
    isLoading,
    lastError,
    conflict,
    saveCharacter,
    adoptServerCharacter,
    dismissConflict,
    deleteCharacter,
    selectCharacter,
    loadDefault,
    refreshFromServer,
    getLocalCharacterPreview,
    migrateLocalToServer,
  };
}
