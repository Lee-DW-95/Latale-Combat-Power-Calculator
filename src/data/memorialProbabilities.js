/**
 * 라테일 메모리얼 확률 데이터
 *
 * 출처: latale.info/80 (공개 자료 참고)
 *
 * 각 옵션의 등장 확률은 누적 확률(≥X%) 형태로 공개되어 있음.
 * 이를 단계별 이산 확률로 변환:
 *   P(값=N) = P(≥N) - P(≥N+1)
 *   P(값=0, 안뜸) = 1 - P(≥최소값)
 *
 * 데이터 형식:
 *   { value: N, prob: 확률(0~1) }
 *
 * 시뮬 메커니즘:
 *   매 회마다 한 옵션이 결정됨 (값 또는 0=안뜸)
 *   사용자가 정한 목표값 도달까지 누적
 */

// ============================================================
// 헬퍼: 누적 확률 표 → 이산 분포로 변환
//   inputs: [{ value: 1, ge: 17.483 }, { value: 2, ge: 5.908 }, ...]
//   returns: [{ value: 0, prob: 0.82517 }, { value: 1, prob: 0.11575 }, ...]
// ============================================================
function discreteFromCumulative(cumulative) {
  const sorted = [...cumulative].sort((a, b) => a.value - b.value);
  const result = [];
  // 0 (안뜸): 1 - P(≥최소값)
  const minProb = sorted[0].ge / 100;
  result.push({ value: 0, prob: 1 - minProb });
  // 각 단계: P(=N) = P(≥N) - P(≥N+1)
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    const p = next ? (cur.ge - next.ge) / 100 : cur.ge / 100;
    result.push({ value: cur.value, prob: p });
  }
  return result;
}

// ============================================================
// 초엔팜 메모리얼 - 세트 (사용자 예시: 최종 크리 6% 도달)
// ============================================================
export const CHOENPAM_SET = {
  name: '초엔팜 메모리얼 - 세트',
  description: '메모리얼 1개를 끼면 세트 옵션 1개 등장. 같은 옵션이 여러 메모리얼에 누적.',
  options: {
    '무속/속성력 %': discreteFromCumulative([
      { value: 1, ge: 17.483 },
      { value: 2, ge: 5.908 },
      { value: 3, ge: 4.333 },
      { value: 4, ge: 2.739 },
      { value: 5, ge: 1.125 },
      { value: 6, ge: 0.901 },
      { value: 7, ge: 0.676 },
      { value: 8, ge: 0.451 },
      { value: 9, ge: 0.226 },
    ]),
    '최종 최소/최대 대미지': discreteFromCumulative([
      { value: 1, ge: 17.483 },
      { value: 2, ge: 5.023 },
      { value: 3, ge: 2.757 },
      { value: 4, ge: 0.451 },
    ]),
    '최종 크리티컬 대미지': discreteFromCumulative([
      { value: 1, ge: 16.103 },
      { value: 2, ge: 3.968 },
      { value: 3, ge: 2.166 },
      { value: 4, ge: 0.338 },
    ]),
  },
};

// ============================================================
// 초엔팜 메모리얼 - 일반
// ============================================================
export const CHOENPAM_NORMAL = {
  name: '초엔팜 메모리얼 - 일반',
  description: '메모리얼 1개를 끼면 일반 옵션 1개 등장. 절대값 가산.',
  options: {
    '무속/속성력 (+값)': discreteFromCumulative([
      { value: 6, ge: 8.585 },
      { value: 12, ge: 2.826 },
      { value: 18, ge: 1.068 },
      { value: 24, ge: 0.560 },
      { value: 30, ge: 0.409 },
      { value: 36, ge: 0.330 },
      { value: 42, ge: 0.251 },
      { value: 48, ge: 0.172 },
      { value: 54, ge: 0.092 },
      { value: 60, ge: 0.013 },
    ]),
    '최소/최대 대미지 %': discreteFromCumulative([
      { value: 8, ge: 1.234 },
      { value: 9, ge: 1.061 },
      { value: 10, ge: 0.888 },
      { value: 11, ge: 0.715 },
      { value: 12, ge: 0.542 },
      { value: 13, ge: 0.368 },
      { value: 14, ge: 0.332 },
      { value: 15, ge: 0.295 },
      { value: 16, ge: 0.258 },
      { value: 17, ge: 0.221 },
      { value: 18, ge: 0.184 },
      { value: 19, ge: 0.147 },
      { value: 20, ge: 0.111 },
      { value: 21, ge: 0.074 },
      { value: 22, ge: 0.037 },
    ]),
    '크리티컬 대미지 %': discreteFromCumulative([
      { value: 8, ge: 1.077 },
      { value: 9, ge: 0.914 },
      { value: 10, ge: 0.751 },
      { value: 11, ge: 0.589 },
      { value: 12, ge: 0.426 },
      { value: 13, ge: 0.263 },
      { value: 14, ge: 0.237 },
      { value: 15, ge: 0.211 },
      { value: 16, ge: 0.184 },
      { value: 17, ge: 0.158 },
      { value: 18, ge: 0.132 },
      { value: 19, ge: 0.105 },
      { value: 20, ge: 0.079 },
      { value: 21, ge: 0.053 },
      { value: 22, ge: 0.026 },
    ]),
  },
};

// ============================================================
// 레비 메모리얼 - 세트
// ============================================================
export const LEVI_SET = {
  name: '레비 메모리얼 - 세트',
  description: '레비 메모리얼 세트 효과 (1개당 1옵션 등장).',
  options: {
    '무속/속성력 %': discreteFromCumulative([
      { value: 1, ge: 17.483 },
      { value: 2, ge: 5.457 },
      { value: 3, ge: 3.287 },
      { value: 4, ge: 1.080 },
      { value: 5, ge: 0.721 },
      { value: 6, ge: 0.361 },
    ]),
    '최종 최소/최대 대미지': discreteFromCumulative([
      { value: 1, ge: 17.483 },
      { value: 2, ge: 3.968 },
      { value: 3, ge: 0.601 },
    ]),
    '최종 크리티컬 대미지': discreteFromCumulative([
      { value: 1, ge: 16.103 },
      { value: 2, ge: 3.125 },
      { value: 3, ge: 0.451 },
    ]),
  },
};

// ============================================================
// 레비 메모리얼 - 일반
// ============================================================
export const LEVI_NORMAL = {
  name: '레비 메모리얼 - 일반',
  options: {
    '무속/속성력 (+값)': discreteFromCumulative([
      { value: 4, ge: 10.144 },
      { value: 8, ge: 3.294 },
      { value: 12, ge: 1.192 },
      { value: 16, ge: 0.646 },
      { value: 20, ge: 0.445 },
      { value: 24, ge: 0.361 },
      { value: 28, ge: 0.276 },
      { value: 32, ge: 0.191 },
      { value: 36, ge: 0.106 },
      { value: 40, ge: 0.021 },
    ]),
    '최소/최대 대미지 %': discreteFromCumulative([
      { value: 4, ge: 4.771 },
      { value: 5, ge: 2.374 },
      { value: 6, ge: 1.226 },
      { value: 7, ge: 0.954 },
      { value: 8, ge: 0.681 },
      { value: 9, ge: 0.408 },
      { value: 10, ge: 0.350 },
      { value: 11, ge: 0.292 },
      { value: 12, ge: 0.233 },
      { value: 13, ge: 0.175 },
      { value: 14, ge: 0.117 },
      { value: 15, ge: 0.058 },
    ]),
    '크리티컬 대미지 %': discreteFromCumulative([
      { value: 4, ge: 4.571 },
      { value: 5, ge: 2.190 },
      { value: 6, ge: 1.060 },
      { value: 7, ge: 0.804 },
      { value: 8, ge: 0.548 },
      { value: 9, ge: 0.292 },
      { value: 10, ge: 0.250 },
      { value: 11, ge: 0.208 },
      { value: 12, ge: 0.167 },
      { value: 13, ge: 0.125 },
      { value: 14, ge: 0.083 },
      { value: 15, ge: 0.042 },
    ]),
  },
};

// ============================================================
// 무웬 메모리얼 - 일반
// ============================================================
export const MUWEN_NORMAL = {
  name: '무웬 메모리얼 - 일반',
  options: {
    '근력/마법력 (+값)': discreteFromCumulative([
      { value: 100, ge: 17.391 },
      { value: 200, ge: 8.672 },
      { value: 300, ge: 5.740 },
      { value: 400, ge: 2.827 },
      { value: 500, ge: 2.160 },
      { value: 600, ge: 1.514 },
      { value: 700, ge: 0.866 },
      { value: 800, ge: 0.753 },
      { value: 900, ge: 0.646 },
      { value: 1000, ge: 0.538 },
      { value: 1100, ge: 0.431 },
      { value: 1200, ge: 0.324 },
      { value: 1300, ge: 0.216 },
      { value: 1400, ge: 0.109 },
      { value: 1500, ge: 0.001 },
    ]),
    '올스탯 (+값)': discreteFromCumulative([
      { value: 100, ge: 13.610 },
      { value: 200, ge: 5.478 },
      { value: 300, ge: 2.645 },
      { value: 400, ge: 1.735 },
      { value: 500, ge: 0.821 },
      { value: 600, ge: 0.651 },
      { value: 700, ge: 0.489 },
      { value: 800, ge: 0.327 },
      { value: 900, ge: 0.164 },
      { value: 1000, ge: 0.002 },
    ]),
  },
};

// ============================================================
// 무웬 메모리얼 - 세트
// ============================================================
export const MUWEN_SET = {
  name: '무웬 메모리얼 - 세트',
  description: '근력/마법력% + 올스탯% 합 (옵션 통합)',
  options: {
    '근력/마법력 % + 올스탯 %': discreteFromCumulative([
      { value: 1, ge: 53.781 },
      { value: 2, ge: 33.248 },
      { value: 3, ge: 19.691 },
      { value: 4, ge: 11.602 },
      { value: 5, ge: 6.025 },
      { value: 6, ge: 3.164 },
      { value: 7, ge: 1.417 },
      { value: 8, ge: 0.674 },
      { value: 9, ge: 0.305 },
      { value: 10, ge: 0.134 },
      { value: 11, ge: 0.054 },
      { value: 12, ge: 0.022 },
      { value: 13, ge: 0.008 },
      { value: 14, ge: 0.003 },
      { value: 15, ge: 0.001 },
    ]),
  },
};

// ============================================================
// 흑월공주 메모리얼 - 일반
// ============================================================
export const HEUKWOL_NORMAL = {
  name: '흑월공주 메모리얼 - 일반',
  options: {
    '근력/마법력 (+값)': discreteFromCumulative([
      { value: 200, ge: 13.380 },
      { value: 400, ge: 6.142 },
      { value: 600, ge: 2.625 },
      { value: 800, ge: 1.818 },
      { value: 1000, ge: 1.021 },
      { value: 1200, ge: 0.716 },
      { value: 1400, ge: 0.580 },
      { value: 1600, ge: 0.444 },
      { value: 1800, ge: 0.308 },
      { value: 2000, ge: 0.171 },
      { value: 2200, ge: 0.035 },
    ]),
    '올스탯 (+값)': discreteFromCumulative([
      { value: 200, ge: 8.366 },
      { value: 400, ge: 2.744 },
      { value: 600, ge: 1.621 },
      { value: 800, ge: 0.720 },
      { value: 1000, ge: 0.515 },
      { value: 1200, ge: 0.309 },
      { value: 1400, ge: 0.104 },
    ]),
  },
};

// ============================================================
// 흑월공주 메모리얼 - 세트
// ============================================================
export const HEUKWOL_SET = {
  name: '흑월공주 메모리얼 - 세트',
  description: '근력/마법력% + 올스탯% 합',
  options: {
    '근력/마법력 % + 올스탯 %': discreteFromCumulative([
      { value: 1, ge: 53.781 },
      { value: 2, ge: 35.763 },
      { value: 3, ge: 26.394 },
      { value: 4, ge: 17.123 },
      { value: 5, ge: 11.567 },
      { value: 6, ge: 7.932 },
      { value: 7, ge: 4.706 },
      { value: 8, ge: 2.955 },
      { value: 9, ge: 1.849 },
      { value: 10, ge: 0.969 },
      { value: 11, ge: 0.565 },
      { value: 12, ge: 0.334 },
      { value: 13, ge: 0.184 },
      { value: 14, ge: 0.103 },
      { value: 15, ge: 0.057 },
      { value: 16, ge: 0.029 },
      { value: 17, ge: 0.015 },
      { value: 18, ge: 0.008 },
      { value: 19, ge: 0.004 },
      { value: 20, ge: 0.002 },
    ]),
  },
};

// ============================================================
// 모든 메모리얼 통합 export
// ============================================================
export const ALL_MEMORIALS = {
  CHOENPAM_SET,
  CHOENPAM_NORMAL,
  LEVI_SET,
  LEVI_NORMAL,
  MUWEN_NORMAL,
  MUWEN_SET,
  HEUKWOL_NORMAL,
  HEUKWOL_SET,
};
