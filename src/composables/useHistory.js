import { ref, watch } from 'vue';

const STORAGE_KEY = 'latale.history.v1';
const MAX_HISTORY = 10;

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

const history = ref(loadAll());

watch(
  history,
  (val) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
  },
  { deep: true }
);

function makeId() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useHistory() {
  function addEntry({ characterName, stats, oldEquip, newEquip, result }) {
    const entry = {
      id: makeId(),
      timestamp: Date.now(),
      characterName: characterName || '이름없음',
      stats,
      oldEquip,
      newEquip,
      result,
    };
    history.value = [entry, ...history.value].slice(0, MAX_HISTORY);
    return entry;
  }

  function deleteEntry(id) {
    history.value = history.value.filter((h) => h.id !== id);
  }

  function clearAll() {
    history.value = [];
  }

  return { history, addEntry, deleteEntry, clearAll };
}
