import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(new URL('../SAMPLE_DATA.json', import.meta.url), 'utf-8'));
const withSplit = data.filter((d) => d.직접타격 && d.소환타격 && d.근마효율 !== undefined);
console.log(`전체 ${data.length}건 중 직타+소타+근마효율 모두 보유: ${withSplit.length}건`);
for (const d of withSplit) {
  console.log(`  ${d.name.padEnd(25)} type=${d.type}  근마효율=${String(d.근마효율).padStart(3)}  종합=${d.전투력.toLocaleString().padStart(10)}  직=${d.직접타격.toLocaleString().padStart(10)}  소=${d.소환타격.toLocaleString().padStart(10)}`);
}
