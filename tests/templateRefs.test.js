/**
 * SFC 템플릿의 "정의되지 않은 참조" 회귀 방지 테스트.
 *
 * <script setup> 컴포넌트를 컴파일하면 템플릿의 식별자는 보통 `$setup.X` 로 묶인다.
 * setup 범위에 없는 이름만 `_ctx.X` 로 남아 렌더 시점에 터진다 —
 * 컴포넌트를 쪼갤 때 헬퍼 하나를 안 옮기면 정확히 이 형태가 되고, 빌드·린트는 통과한다.
 * (실제로 EnchantLookup 분리 때 rollPctClass 가 빠져 "수치조회" 결과가 렌더되지 않았다.)
 *
 * 그래서 모든 .vue 를 컴파일해 _ctx 참조가 남는지 검사한다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT_DIR = join(ROOT, 'src', 'components');

// 렌더 함수가 정상적으로 쓰는 인스턴스 프로퍼티 — 검출 대상에서 뺀다.
const ALLOWED = new Set(['$slots', '$attrs', '$props', '$emit', '$el', '$refs']);

let failed = 0;
const files = readdirSync(COMPONENT_DIR).filter((f) => f.endsWith('.vue'));

for (const file of files) {
  const source = readFileSync(join(COMPONENT_DIR, file), 'utf8');
  const { descriptor } = parse(source, { filename: file });
  if (!descriptor.template || !descriptor.scriptSetup) continue;

  // 바인딩 정보는 compileScript 가 만든다 — 이걸 넘겨야 setup 범위 이름이 $setup.X 로 묶인다.
  const script = compileScript(descriptor, { id: file });
  const { code } = compileTemplate({
    id: file,
    filename: file,
    source: descriptor.template.content,
    compilerOptions: { bindingMetadata: script.bindings, inline: false },
  });

  const missing = [...new Set([...code.matchAll(/_ctx\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))]
    .filter((name) => !ALLOWED.has(name));

  if (missing.length) {
    failed += 1;
    console.log(`✗ FAIL  ${file} — 템플릿이 쓰는데 setup 에 없는 이름: ${missing.join(', ')}`);
  }
}

console.log(`${failed ? '✗' : '✓'} 템플릿 참조 검사 — .vue ${files.length}개 중 문제 ${failed}개`);
if (failed) process.exit(1);
