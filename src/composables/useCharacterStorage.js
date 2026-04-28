import { ref, watch } from 'vue';
import { createEmptyStats } from '../utils/battlePower.js';

const STORAGE_KEY = 'latale.characters.v1';
const ACTIVE_KEY = 'latale.activeCharacterId.v1';

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const characters = ref(loadAll());
const activeId = ref(localStorage.getItem(ACTIVE_KEY) || null);

watch(
  characters,
  (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
  },
  { deep: true }
);

watch(activeId, (val) => {
  if (val) localStorage.setItem(ACTIVE_KEY, val);
  else localStorage.removeItem(ACTIVE_KEY);
});

function makeId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCharacterStorage() {
  function saveCharacter(name, stats) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new Error('캐릭터 이름을 입력해주세요.');

    const existing = characters.value.find((c) => c.name === trimmed);
    if (existing) {
      existing.stats = { ...stats };
      existing.updatedAt = Date.now();
      activeId.value = existing.id;
      return existing;
    }

    const created = {
      id: makeId(),
      name: trimmed,
      stats: { ...stats },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    characters.value = [created, ...characters.value];
    activeId.value = created.id;
    return created;
  }

  function deleteCharacter(id) {
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

  return {
    characters,
    activeId,
    saveCharacter,
    deleteCharacter,
    selectCharacter,
    loadDefault,
  };
}
