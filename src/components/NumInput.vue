<script setup>
// 콤마 포맷 숫자 입력 — type=number 의 두 가지 마찰 제거:
//   1) 값 0 이 "0"으로 표시돼 지우고 입력해야 하는 문제 → 0 이면 빈칸 + placeholder
//   2) 7자리 숫자 콤마 없이 검수 불가 → blur 상태에선 천단위 콤마 표시
// 포커스 중에는 raw 문자열로 편집하고, 확정 시 숫자만 emit 한다.
import { computed, ref } from 'vue';

const props = defineProps({
  modelValue: { type: [Number, String], default: 0 },
  step: { type: [Number, String], default: 1 },
  min: { type: [Number, String], default: undefined },
  max: { type: [Number, String], default: undefined },
  placeholder: { type: String, default: '0' },
});
const emit = defineEmits(['update:modelValue']);

const focused = ref(false);
const editing = ref(''); // 포커스 중의 raw 입력 문자열

const numeric = computed(() => {
  const n = Number(props.modelValue);
  return Number.isFinite(n) ? n : 0;
});

// blur 상태 표시값 — 0 은 빈칸(placeholder 노출), 그 외엔 콤마 포맷.
const display = computed(() => {
  if (focused.value) return editing.value;
  if (numeric.value === 0) return '';
  return numeric.value.toLocaleString('ko-KR');
});

function parse(raw) {
  const cleaned = String(raw).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null; // 편집 중 임시 상태 ("1e" 등) — emit 보류
  let v = n;
  if (props.min !== undefined && v < Number(props.min)) v = Number(props.min);
  if (props.max !== undefined && v > Number(props.max)) v = Number(props.max);
  return v;
}

function onFocus(e) {
  focused.value = true;
  editing.value = numeric.value === 0 ? '' : String(numeric.value);
  // 전체 선택 — 기존 값 교체 입력이 대부분인 사용 패턴이라 재타이핑 마찰 제거.
  requestAnimationFrame(() => e.target.select());
}

function onInput(e) {
  editing.value = e.target.value;
  const v = parse(e.target.value);
  if (v !== null) emit('update:modelValue', v);
}

function onBlur() {
  const v = parse(editing.value);
  emit('update:modelValue', v === null ? 0 : v);
  focused.value = false;
}
</script>

<template>
  <input
    type="text"
    inputmode="decimal"
    autocomplete="off"
    spellcheck="false"
    :value="display"
    :placeholder="placeholder"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
    @keyup.enter="$event.target.blur()"
  />
</template>
