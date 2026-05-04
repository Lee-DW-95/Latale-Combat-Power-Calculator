// 원본 latale.info/60 코드를 그대로 복붙 (표/유틸/rollOnce 그대로)
const LINES_DIST = [{k:1,p:0.40},{k:2,p:0.40},{k:3,p:0.15},{k:4,p:0.05}];
const STONE_DIST = [{name:"상급 보라빛 각성석", p:0.95}, {name:"상급 신비한 각성석", p:0.05}];

const PURPLE_TYPES = [
  {type:"근력/마법력", tiers:[{min:10,max:1125},{min:20,max:2250},{min:30,max:3375},{min:40,max:4500},{min:50,max:12500}]},
  {type:"행운", tiers:[{min:10,max:1125},{min:20,max:2250},{min:30,max:3375},{min:40,max:4500},{min:50,max:12500}]},
  {type:"체력", tiers:[{min:10,max:1125},{min:20,max:2250},{min:30,max:3375},{min:40,max:4500},{min:50,max:12500}]},
  {type:"최대 HP", tiers:[{min:20,max:3750},{min:40,max:7500},{min:60,max:11250},{min:80,max:15000},{min:100,max:25000}]},
  {type:"방어력/마법 저항력", tiers:[{min:10,max:750},{min:20,max:1500},{min:30,max:2250},{min:40,max:3000},{min:50,max:5000}]},
  {type:"물리/마법 고정 대미지", tiers:[{min:20,max:1500},{min:40,max:3000},{min:60,max:4500},{min:80,max:6000},{min:100,max:25000}]},
  {type:"물리/마법 대미지 감소", tiers:[{min:5,max:300},{min:10,max:600},{min:15,max:900},{min:20,max:1200},{min:25,max:2500}]},
  {type:"무기 공격력/속성력", tiers:[{min:1,max:22},{min:2,max:45},{min:3,max:67},{min:4,max:90},{min:5,max:250}]},
  {type:"근력/마법력 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"행운 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"체력 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"최대 HP %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"방어력/마법 저항력 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"물리/마법 고정 대미지 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"무기 공격력/속성력 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7}]},
  {type:"물리/마법 명중률", tiers:[{min:1,max:7},{min:1,max:15},{min:2,max:22},{min:2,max:30},{min:3,max:75}]},
  {type:"이동속도", tiers:[{min:1,max:7},{min:1,max:15},{min:2,max:22},{min:2,max:30},{min:3,max:75}]},
  {type:"물리/마법 최소대미지", tiers:[{min:1,max:10},{min:2,max:20},{min:3,max:32},{min:4,max:45},{min:5,max:125}]},
  {type:"물리/마법 최대대미지", tiers:[{min:1,max:10},{min:2,max:20},{min:3,max:32},{min:4,max:45},{min:5,max:125}]},
  {type:"물리/마법 크리티컬 대미지", tiers:[{min:1,max:10},{min:2,max:20},{min:3,max:32},{min:4,max:45},{min:5,max:125}]},
];
const MYSTIC_TYPES = [
  {type:"올스탯", tiers:[{min:10,max:1125},{min:20,max:2250},{min:30,max:3375},{min:40,max:4500},{min:50,max:12500}]},
  {type:"물리/마법 크리티컬 대미지", tiers:[{min:1,max:10},{min:2,max:20},{min:3,max:32},{min:4,max:45},{min:5,max:125}]},
  {type:"체력", tiers:[{min:10,max:1125},{min:20,max:2250},{min:30,max:3375},{min:40,max:4500},{min:50,max:12500}]},
  {type:"최대 HP", tiers:[{min:20,max:3750},{min:40,max:7500},{min:60,max:11250},{min:80,max:15000},{min:100,max:25000}]},
  {type:"방어력/마법 저항력", tiers:[{min:10,max:750},{min:20,max:1500},{min:30,max:2250},{min:40,max:3000},{min:50,max:5000}]},
  {type:"물리/마법 고정 대미지", tiers:[{min:20,max:1500},{min:40,max:3000},{min:60,max:4500},{min:80,max:6000},{min:100,max:25000}]},
  {type:"물리/마법 크리티컬 확률", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:2},{min:1,max:2},{min:1,max:2}]},
  {type:"무기 공격력/속성력", tiers:[{min:1,max:22},{min:2,max:45},{min:3,max:67},{min:4,max:90},{min:5,max:250}]},
  {type:"올스탯 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"행운 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"체력 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"최대 HP %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"방어력/마법 저항력 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7},{min:1,max:12}]},
  {type:"무기 공격력/속성력 %", tiers:[{min:1,max:2},{min:1,max:2},{min:1,max:2},{min:1,max:5},{min:1,max:7}]},
  {type:"물리/마법 명중률", tiers:[{min:1,max:7},{min:1,max:15},{min:2,max:22},{min:2,max:30},{min:3,max:75}]},
  {type:"이동속도", tiers:[{min:1,max:7},{min:1,max:15},{min:2,max:22},{min:2,max:30},{min:3,max:75}]},
  {type:"물리/마법 최소대미지", tiers:[{min:1,max:10},{min:2,max:20},{min:3,max:32},{min:4,max:45},{min:5,max:125}]},
  {type:"물리/마법 최대대미지", tiers:[{min:1,max:10},{min:2,max:20},{min:3,max:32},{min:4,max:45},{min:5,max:125}]},
  {type:"일반 몬스터 지배력", tiers:[{min:0.1,max:0.7},{min:0.1,max:1.5},{min:0.2,max:2.2},{min:0.2,max:3.0},{min:0.3,max:7.5}]},
  {type:"보스 몬스터 지배력", tiers:[{min:0.1,max:0.7},{min:0.1,max:1.5},{min:0.2,max:2.2},{min:0.2,max:3.0},{min:0.3,max:7.5}]},
];

const FORCE_PCT_SET = new Set([
  '물리/마법 최소대미지','물리/마법 최대대미지','물리/마법 크리티컬 대미지',
  '물리/마법 크리티컬 확률','물리/마법 명중률','이동속도',
  '일반 몬스터 지배력','보스 몬스터 지배력',
]);

function pickWeighted(arr){
  const r = Math.random();
  let acc = 0;
  for(let i=0;i<arr.length;i++){ acc += arr[i].p; if(r <= acc + 1e-12) return arr[i]; }
  return arr[arr.length-1];
}
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function hasDecimal(n){ return Math.abs(n - Math.round(n)) > 1e-9; }
function randVal(min,max){
  const dec = hasDecimal(min) || hasDecimal(max);
  if(dec){
    const A = Math.round(min*10), B = Math.round(max*10);
    return (A + Math.floor(Math.random()*(B-A+1)))/10;
  }
  if(min===max) return min;
  return min + Math.floor(Math.random()*(max-min+1));
}
function pickStoneName(){
  const r = Math.random();
  let acc = 0;
  for(let i=0;i<STONE_DIST.length;i++){ acc += STONE_DIST[i].p; if(r <= acc + 1e-12) return STONE_DIST[i].name; }
  return STONE_DIST[0].name;
}
function pickTypeIndex(len, used){
  const idxs = Array.from({length:len}, (_,i)=>i);
  shuffle(idxs);
  for(let i=0;i<idxs.length;i++){ if(!used.has(idxs[i])) return idxs[i]; }
  return -1;
}
function pickTier(tiers){ return tiers[Math.floor(Math.random()*tiers.length)]; }

function rollOnceOriginal(){
  const stone = pickStoneName();
  const table = (stone === '상급 보라빛 각성석') ? PURPLE_TYPES : MYSTIC_TYPES;
  const k = pickWeighted(LINES_DIST).k;
  const used = new Set();
  const lines = [];
  for(let i=0;i<k;i++){
    const ti = pickTypeIndex(table.length, used);
    if(ti === -1) break;
    used.add(ti);
    const t = table[ti];
    const tier = pickTier(t.tiers);
    const value = randVal(tier.min, tier.max);
    const trailing = /\s*%$/.test(t.type);
    const base = trailing ? t.type.replace(/\s*%$/, '') : t.type;
    const unit = (trailing || FORCE_PCT_SET.has(base)) ? '%' : '';
    lines.push({ displayLabel: unit ? `${base} ${unit}` : base, value });
  }
  return { stone, lines };
}

// ============================================================
// 우리 구현 import
// ============================================================
import { rollOnce as rollOnceOurs } from '../src/utils/awakeningSim.js';

function runMC(rollFn, target, value, N) {
  let success = 0;
  for (let i = 0; i < N; i++) {
    const card = rollFn();
    const hit = card.lines.find((l) => l.displayLabel === target && l.value >= value);
    if (hit) success++;
  }
  return success / N;
}

const N = 500_000;
const cases = [
  ['무기 공격력/속성력', 20],
  ['무기 공격력/속성력', 50],
  ['무기 공격력/속성력', 100],
  ['올스탯', 500],
  ['근력/마법력', 1000],
  ['물리/마법 크리티컬 대미지 %', 30],
  ['물리/마법 명중률 %', 30],
  ['이동속도 %', 30],
];

console.log(`MC N = ${N.toLocaleString()} per side\n`);
console.log('타깃                                | 원본 p      | 우리 p     | 비율 (우리/원본)');
console.log('-'.repeat(85));
for (const [tg, val] of cases) {
  const pO = runMC(rollOnceOriginal, tg, val, N);
  const pU = runMC(rollOnceOurs, tg, val, N);
  const ratio = pO === 0 ? 'N/A' : (pU / pO).toFixed(3);
  const fmt = (p) => (p < 1e-4 ? p.toExponential(3) : p.toFixed(6));
  console.log(`${(tg + ' ≥' + val).padEnd(36)} | ${fmt(pO).padEnd(11)} | ${fmt(pU).padEnd(11)} | ${ratio}`);
}
