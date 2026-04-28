import { ref, watchEffect } from 'vue';

const STORAGE_KEY = 'latale.darkMode.v1';

function initialMode() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

const mode = ref(initialMode());

watchEffect(() => {
  const root = document.documentElement;
  if (mode.value === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  localStorage.setItem(STORAGE_KEY, mode.value);
});

export function useDarkMode() {
  function toggle() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark';
  }
  return { mode, toggle };
}
