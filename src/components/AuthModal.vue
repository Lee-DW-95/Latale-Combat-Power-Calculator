<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useAuth } from '../composables/useAuth.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  initialStep: { type: String, default: 'login' }, // 'login' | 'register' | 'recover'
});
const emit = defineEmits(['update:modelValue', 'success']);

const { register, login, recover } = useAuth();

// step: 'login' | 'register' | 'recover' | 'show-recovery-code'
const step = ref(props.initialStep);
const nickname = ref('');
const password = ref('');
const passwordConfirm = ref('');
const recoveryCode = ref('');
const newPassword = ref('');
const error = ref('');
const loading = ref(false);

// 회원가입 성공 후 보여줄 복구코드 + "메모했음" 확인 체크
const issuedRecoveryCode = ref('');
const acknowledged = ref(false);
const copied = ref(false);

const nicknameInputRef = ref(null);

function reset() {
  step.value = props.initialStep;
  nickname.value = '';
  password.value = '';
  passwordConfirm.value = '';
  recoveryCode.value = '';
  newPassword.value = '';
  error.value = '';
  loading.value = false;
  issuedRecoveryCode.value = '';
  acknowledged.value = false;
  copied.value = false;
}

// 모달 열릴 때 입력 초기화 + 첫 필드 포커스. 닫힐 때도 초기화.
watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      reset();
      await nextTick();
      nicknameInputRef.value?.focus();
    } else {
      reset();
    }
  },
);

// 복구코드 표시 중에는 ESC/배경 클릭으로 닫지 못하게 — 사용자가 메모를 강제로 인지하도록.
const canDismiss = computed(() => step.value !== 'show-recovery-code');

function close() {
  if (!canDismiss.value) return;
  emit('update:modelValue', false);
}

function onBackdrop(e) {
  if (e.target === e.currentTarget) close();
}

function onKeydown(e) {
  if (e.key === 'Escape') close();
}

function switchStep(next) {
  step.value = next;
  error.value = '';
  password.value = '';
  passwordConfirm.value = '';
  recoveryCode.value = '';
  newPassword.value = '';
}

async function submitLogin() {
  error.value = '';
  if (!nickname.value.trim() || !password.value) {
    error.value = '닉네임과 비밀번호를 입력하세요.';
    return;
  }
  loading.value = true;
  try {
    await login(nickname.value, password.value);
    emit('success', { kind: 'login' });
    emit('update:modelValue', false);
  } catch (err) {
    error.value = err.message || '로그인 실패';
  } finally {
    loading.value = false;
  }
}

async function submitRegister() {
  error.value = '';
  const nick = nickname.value.trim();
  if (nick.length < 2) {
    error.value = '닉네임은 2자 이상이어야 합니다.';
    return;
  }
  if (password.value.length < 8) {
    error.value = '비밀번호는 8자 이상이어야 합니다.';
    return;
  }
  if (password.value !== passwordConfirm.value) {
    error.value = '비밀번호 확인이 일치하지 않습니다.';
    return;
  }
  loading.value = true;
  try {
    const res = await register(nick, password.value);
    issuedRecoveryCode.value = res.recovery_code;
    step.value = 'show-recovery-code';
  } catch (err) {
    error.value = err.message || '회원가입 실패';
  } finally {
    loading.value = false;
  }
}

async function submitRecover() {
  error.value = '';
  if (!nickname.value.trim() || !recoveryCode.value.trim()) {
    error.value = '닉네임과 복구코드를 입력하세요.';
    return;
  }
  if (newPassword.value.length < 8) {
    error.value = '새 비밀번호는 8자 이상이어야 합니다.';
    return;
  }
  loading.value = true;
  try {
    await recover(nickname.value, recoveryCode.value, newPassword.value);
    emit('success', { kind: 'recover' });
    emit('update:modelValue', false);
  } catch (err) {
    error.value = err.message || '복구 실패';
  } finally {
    loading.value = false;
  }
}

async function copyRecoveryCode() {
  try {
    await navigator.clipboard.writeText(issuedRecoveryCode.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // clipboard API 차단 환경(http origin 등) — 사용자가 직접 드래그 복사.
  }
}

function finishRecoveryCodeStep() {
  if (!acknowledged.value) return;
  emit('success', { kind: 'register' });
  emit('update:modelValue', false);
}

const title = computed(() =>
  step.value === 'login'
    ? '로그인'
    : step.value === 'register'
    ? '회원가입'
    : step.value === 'recover'
    ? '비밀번호 복구'
    : '🔑 복구코드 발급',
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click="onBackdrop"
      @keydown="onKeydown"
      tabindex="-1"
    >
      <div
        class="w-full max-w-md rounded-2xl bg-white dark:bg-stone-800 shadow-xl ring-1 ring-stone-200 dark:ring-stone-700 p-6"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-stone-800 dark:text-stone-100">{{ title }}</h2>
          <button
            v-if="canDismiss"
            type="button"
            @click="close"
            class="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <!-- ───── 로그인 ───── -->
        <form v-if="step === 'login'" @submit.prevent="submitLogin" class="space-y-3">
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">닉네임</span>
            <input
              ref="nicknameInputRef"
              v-model="nickname"
              type="text"
              autocomplete="username"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">비밀번호</span>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <p v-if="error" class="text-xs text-rose-600 dark:text-rose-400">{{ error }}</p>
          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 text-sm transition disabled:opacity-50"
          >
            {{ loading ? '...' : '로그인' }}
          </button>
          <div class="flex justify-between text-xs pt-1">
            <button type="button" @click="switchStep('register')" class="text-cyan-600 dark:text-cyan-400 hover:underline">
              회원가입
            </button>
            <button type="button" @click="switchStep('recover')" class="text-stone-500 dark:text-stone-400 hover:underline">
              비밀번호 잊었어요
            </button>
          </div>
        </form>

        <!-- ───── 회원가입 ───── -->
        <form v-else-if="step === 'register'" @submit.prevent="submitRegister" class="space-y-3">
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">닉네임 <span class="text-stone-400 text-xs">(2~20자, 고유)</span></span>
            <input
              ref="nicknameInputRef"
              v-model="nickname"
              type="text"
              maxlength="20"
              autocomplete="username"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">비밀번호 <span class="text-stone-400 text-xs">(8자 이상)</span></span>
            <input
              v-model="password"
              type="password"
              autocomplete="new-password"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">비밀번호 확인</span>
            <input
              v-model="passwordConfirm"
              type="password"
              autocomplete="new-password"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <p class="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
            ⓘ 이메일을 받지 않습니다. 비밀번호 분실 시 회원가입 직후 발급되는 <strong>복구코드</strong>로만 복구 가능합니다.
          </p>
          <p v-if="error" class="text-xs text-rose-600 dark:text-rose-400">{{ error }}</p>
          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 text-sm transition disabled:opacity-50"
          >
            {{ loading ? '...' : '회원가입' }}
          </button>
          <div class="text-xs pt-1">
            <button type="button" @click="switchStep('login')" class="text-cyan-600 dark:text-cyan-400 hover:underline">
              ← 로그인으로 돌아가기
            </button>
          </div>
        </form>

        <!-- ───── 비밀번호 복구 ───── -->
        <form v-else-if="step === 'recover'" @submit.prevent="submitRecover" class="space-y-3">
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">닉네임</span>
            <input
              ref="nicknameInputRef"
              v-model="nickname"
              type="text"
              autocomplete="username"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">복구코드</span>
            <input
              v-model="recoveryCode"
              type="text"
              spellcheck="false"
              autocapitalize="off"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm font-mono tabular-nums focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <label class="block">
            <span class="text-sm text-stone-700 dark:text-stone-300">새 비밀번호 <span class="text-stone-400 text-xs">(8자 이상)</span></span>
            <input
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              class="mt-1 w-full rounded-md border-0 ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 px-3 py-2 text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </label>
          <p class="text-[11px] text-stone-500 dark:text-stone-400 leading-snug">
            ⓘ 복구코드는 <strong>1회용</strong>입니다. 사용 후엔 새 복구코드 발급이 필요합니다.
          </p>
          <p v-if="error" class="text-xs text-rose-600 dark:text-rose-400">{{ error }}</p>
          <button
            type="submit"
            :disabled="loading"
            class="w-full rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 text-sm transition disabled:opacity-50"
          >
            {{ loading ? '...' : '비밀번호 재설정' }}
          </button>
          <div class="text-xs pt-1">
            <button type="button" @click="switchStep('login')" class="text-cyan-600 dark:text-cyan-400 hover:underline">
              ← 로그인으로 돌아가기
            </button>
          </div>
        </form>

        <!-- ───── 복구코드 표시 (회원가입 직후, 강제 인지) ───── -->
        <div v-else-if="step === 'show-recovery-code'" class="space-y-3">
          <p class="text-sm text-stone-700 dark:text-stone-300">
            회원가입이 완료됐습니다. 아래 <strong>복구코드</strong>를 안전한 곳에 저장해 주세요.
          </p>
          <div class="rounded-lg bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-300 dark:ring-amber-700 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200 leading-snug">
            ⚠ 이 코드는 <strong>지금 한 번만 표시</strong>됩니다. 잃어버리면 계정 복구가 불가능합니다.
          </div>
          <div class="flex items-stretch gap-2">
            <code class="flex-1 break-all rounded-md bg-stone-100 dark:bg-stone-900 px-3 py-2 font-mono text-sm text-stone-900 dark:text-stone-100 select-all">
              {{ issuedRecoveryCode }}
            </code>
            <button
              type="button"
              @click="copyRecoveryCode"
              class="rounded-md px-3 text-xs font-semibold bg-cyan-600 hover:bg-cyan-700 text-white transition whitespace-nowrap"
            >
              {{ copied ? '복사됨' : '복사' }}
            </button>
          </div>
          <label class="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300 pt-2">
            <input v-model="acknowledged" type="checkbox" class="mt-0.5 rounded" />
            <span>복구코드를 안전한 곳에 저장했습니다.</span>
          </label>
          <button
            type="button"
            @click="finishRecoveryCodeStep"
            :disabled="!acknowledged"
            class="w-full rounded-md bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
