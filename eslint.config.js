// ESLint 9 flat config — eslint:recommended + vue/essential 수준으로 보수적으로 운용.
// 포맷 규칙은 Prettier 에 맡기고(eslint-config-prettier 로 충돌 규칙 해제) 린트는 실제 오류 위주.
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'backend/**', 'src-tauri/**', 'scripts/**', 'dev-dist/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // 미사용 변수는 오류(recommended 기본), `_` 접두어 인자와 catch 인자는 허용
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // 템플릿에서 하나의 루트 태그를 강제하지 않는다(Vue 3 fragment)
      'vue/multi-word-component-names': 'off',
    },
  },
  // 워커는 브라우저 워커 전역만
  {
    files: ['src/workers/**/*.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
  prettier,
];
