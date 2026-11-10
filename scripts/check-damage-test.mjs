#!/usr/bin/env node
// 원본 alfm201/damage-test 갱신 점검 — scripts/damage-test-sync.json 의 reviewedCommit 이후
// 커밋이 있는지, 계산기 버전(<title>)·게임 데이터 기준일(SKILL_DATA.source)이 바뀌었는지 본다.
//
//   node scripts/check-damage-test.mjs            사람이 읽는 요약 출력, 갱신 있으면 exit 2
//   GITHUB_OUTPUT 이 있으면 changed/head/title 을 기록하고, 요약 마크다운을 --out 파일에 쓴다.
//
// 의존성 없음 (Node 18+ fetch). GITHUB_TOKEN 이 있으면 API 한도를 늘리려고 붙인다.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'scripts/damage-test-sync.json'), 'utf8'));
const ours = JSON.parse(readFileSync(join(root, 'src/data/skillData.json'), 'utf8'));
const outIdx = process.argv.indexOf('--out');
const outFile = outIdx > 0 ? process.argv[outIdx + 1] : null;

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'damage-test-sync-check' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function api(path) {
  const res = await fetch(`https://api.github.com/repos/${cfg.repo}${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function upstreamMeta(ref) {
  const res = await fetch(`https://raw.githubusercontent.com/${cfg.repo}/${ref}/${cfg.file}`);
  if (!res.ok) throw new Error(`raw ${cfg.file}@${ref} → ${res.status}`);
  const html = await res.text();
  const version = html.match(/<title>[^<]*?(v\d+(?:\.\d+)*)[^<]*<\/title>/)?.[1] ?? '?';
  const dataSource = html.match(/const SKILL_DATA\s*=\s*\{"version":\d+,"source":"([^"]+)"/)?.[1] ?? '?';
  return { version, dataSource };
}

const cmp = await api(`/compare/${cfg.reviewedCommit}...${cfg.branch}`);
const head = cmp.commits.at(-1)?.sha ?? cfg.reviewedCommit;
const meta = await upstreamMeta(head);
const changed = cmp.ahead_by > 0;
const dataChanged = meta.dataSource !== '?' && meta.dataSource !== ours.source;

const lines = [];
lines.push(`원본 [${cfg.repo}](https://github.com/${cfg.repo}) 에 마지막 검토 이후 새 커밋이 **${cmp.ahead_by}건** 있다.`);
lines.push('');
lines.push('| 항목 | 우리 (검토 기준) | 원본 최신 |');
lines.push('|---|---|---|');
lines.push(`| 커밋 | \`${cfg.reviewedCommit.slice(0, 8)}\` | \`${head.slice(0, 8)}\` |`);
lines.push(`| 계산기 버전 | ${cfg.version} | ${meta.version} |`);
lines.push(`| 게임 데이터 (SKILL_DATA.source) | ${ours.source} | ${meta.dataSource}${dataChanged ? ' ⚠️ 변경' : ''} |`);
lines.push('');
lines.push('### 새 커밋');
for (const c of cmp.commits) {
  const date = c.commit.committer.date.slice(0, 10);
  const msg = c.commit.message.split('\n')[0];
  lines.push(`- [\`${c.sha.slice(0, 8)}\`](${c.html_url}) ${date} — ${msg}`);
}
lines.push('');
lines.push(`[변경 비교 보기](${cmp.html_url}) · 파일: ${cmp.files?.map((f) => `\`${f.filename}\``).join(', ') || '-'}`);
lines.push('');
lines.push('### 반영 절차');
lines.push('`docs/DAMAGE_FORMULA.md` §9-2·§10 참고. 게임 데이터가 바뀌었으면 `skillData.json` 교체 → 골든 재생성(원본 대조 하네스) → `npm test`.');
lines.push('반영(또는 반영 불필요 판정) 후 `scripts/damage-test-sync.json` 의 `reviewedCommit` 등을 갱신하고 §1 반영 이력 표에 한 줄 추가하면 이 이슈가 다음 점검 때 닫힌다.');
if (dataChanged) {
  lines.push('');
  lines.push('> ⚠️ 원본 `legacyVariants` 대응표는 직전 판 키만 옮겨 준다. 데이터 갱신을 두 번 이상 건너뛰면 사용자 저장분의 스킬 변형 선택이 기본값으로 풀리므로 이번 판을 먼저 반영할 것.');
}
const body = lines.join('\n');
const title = `원본 damage-test 갱신: ${meta.version} (데이터 ${meta.dataSource})`;

if (outFile) writeFileSync(outFile, body);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\nhead=${head}\ntitle=${title}\n`);
}

if (!changed) {
  console.log(`원본 갱신 없음 — ${cfg.version}, 데이터 ${ours.source}, 커밋 ${cfg.reviewedCommit.slice(0, 8)} 기준 최신.`);
} else {
  console.log(title + '\n\n' + body);
  if (!process.env.GITHUB_OUTPUT) process.exitCode = 2;
}
