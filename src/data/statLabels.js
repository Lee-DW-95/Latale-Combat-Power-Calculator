/**
 * UI 라벨 / 단위 / 입력 step 정의
 */

// ============================================================
// T창 표시값 입력 (능력치 세부정보)
// ============================================================
export const STAT_FIELD_DEFS = [
  { key: '주스탯', step: 1, unit: '', tooltip: '근력(물리) 또는 마법력(마법)' },
  { key: '공격력', step: 1, unit: '', tooltip: '무기공격력(또는 속성력)의 최대값(max)' },
  { key: '관통', step: 1, unit: '%', tooltip: '관통력' },
  { key: '크댐', step: 1, unit: '', tooltip: '크리티컬 데미지 (본인 직업 영역값)' },
  { key: '최소뎀', step: 1, unit: '', tooltip: '최소 데미지 (수련의방 등에서 최대뎀을 초과하면 자동으로 최대뎀으로 cap)' },
  { key: '최대뎀', step: 1, unit: '', tooltip: '최대 데미지' },
  { key: '고댐', step: 1, unit: '', tooltip: '고정 데미지 증가' },
  { key: '일몬추', step: 1, unit: '', tooltip: '일반 몬스터 추가 데미지' },
  { key: '보몬추', step: 1, unit: '', tooltip: '보스 몬스터 추가 데미지' },
  { key: '일몬지', step: 0.1, unit: '%', tooltip: '일반 몬스터 지배력' },
  { key: '보몬지', step: 0.1, unit: '%', tooltip: '보스 몬스터 지배력' },
  { key: '근마효율', step: 1, unit: '%', tooltip: '근력/마법력 효율 (T창 추가 세부정보의 근력/마법력 효율 %)' },
];

// ============================================================
// T창 추가 세부정보 — 기본값 (장비 % 옵션 환산용)
// 추가 세부정보 패널의 우측 +값(녹색 숫자)이 기본값
// 예: "크리티컬 데미지 +6,595 (46%)" → 기본 크댐 = 6,595
//     검증: 6,595 × (1 + 0.46) = 9,628 ≈ 좌측 표시 크댐 ✓
// ============================================================
export const BASE_FIELD_DEFS = [
  { key: '기본_주스탯', label: '기본 근력/마법력', step: 1, tooltip: 'T창 추가 세부정보의 근력/마법력 +값 (예: +1,118,069)' },
  { key: '기본_공격력', label: '기본 무기공격력/속성력', step: 1, tooltip: '추가 세부정보의 무기공격력/속성력 +값 (max)' },
  { key: '기본_크댐', label: '기본 크리티컬 데미지', step: 1, tooltip: '추가 세부정보의 크리티컬 데미지 +값' },
  { key: '기본_최소뎀', label: '기본 최소 데미지', step: 1, tooltip: '추가 세부정보의 최소 데미지 +값' },
  { key: '기본_최대뎀', label: '기본 최대 데미지', step: 1, tooltip: '추가 세부정보의 최대 데미지 +값' },
  { key: '기본_고댐', label: '기본 고정 데미지 증가', step: 1, tooltip: '추가 세부정보의 고정 데미지 증가 +값' },
  { key: '기본_일몬추', label: '기본 일반 몬스터 추가 데미지', step: 1, tooltip: '추가 세부정보의 일반 몬스터 데미지 +값' },
  { key: '기본_보몬추', label: '기본 보스 몬스터 추가 데미지', step: 1, tooltip: '추가 세부정보의 보스 몬스터 데미지 +값' },
];

// ============================================================
// 장비 옵션 (총 18개)
// 부적/장비 한 부위에서 변경되는 옵션을 그대로 입력
// ============================================================
export const EQUIP_FIELD_DEFS = [
  // ───── 가산형 (절대값) ─────
  { key: '주스탯', group: '가산', step: 1, unit: '', tooltip: '근력 또는 마법력 가산' },
  { key: '올스탯', group: '가산', step: 1, unit: '', tooltip: '체력+행운+근력+마법력에 동시 가산 (전투력 계산상 주스탯에 합산)' },
  { key: '공격력', group: '가산', step: 1, unit: '', tooltip: '무기공격력/속성력 가산' },
  { key: '관통', group: '가산', step: 1, unit: '%', tooltip: '관통력' },
  { key: '크댐', group: '가산', step: 1, unit: '', tooltip: '크리티컬 데미지 가산' },
  { key: '최소뎀', group: '가산', step: 1, unit: '', tooltip: '최소 데미지 가산' },
  { key: '최대뎀', group: '가산', step: 1, unit: '', tooltip: '최대 데미지 가산' },
  { key: '고댐', group: '가산', step: 1, unit: '', tooltip: '고정 데미지 증가 가산' },
  { key: '일몬추', group: '가산', step: 1, unit: '', tooltip: '일반 몬스터 추가 데미지 가산' },
  { key: '보몬추', group: '가산', step: 1, unit: '', tooltip: '보스 몬스터 추가 데미지 가산' },
  { key: '일몬지', group: '가산', step: 0.1, unit: '%', tooltip: '일반 몬스터 지배력' },
  { key: '보몬지', group: '가산', step: 0.1, unit: '%', tooltip: '보스 몬스터 지배력' },
  // ───── % 옵션 (기본값에 비율 적용) ─────
  { key: '주스탯_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '근력/마법력 % — 기본 근력에 비율 적용' },
  { key: '올스탯_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '올스탯 % — 전투력 계산상 주스탯%와 동일하게 합산 처리' },
  { key: '공격력_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '무기공격력 % — 기본 무공에 비율 적용' },
  { key: '크댐_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '크리티컬 데미지 %' },
  { key: '최소뎀_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '최소 데미지 %' },
  { key: '최대뎀_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '최대 데미지 %' },
  { key: '고댐_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '고정 데미지 증가 %' },
  { key: '일몬추_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '일반 몬스터 추가 데미지 %' },
  { key: '보몬추_퍼', group: '퍼센트', step: 1, unit: '%', tooltip: '보스 몬스터 추가 데미지 %' },
];

// ============================================================
// 장비 옵션 통합 정의 (한 행 = 한 스탯, 가산/퍼센트 같이 표시)
// flatPctKey가 null이면 % 옵션 입력칸이 비활성화됨
// ============================================================
export const EQUIP_ROW_DEFS = [
  { key: '주스탯', addKey: '주스탯', pctKey: '주스탯_퍼', addStep: 1, addUnit: '' },
  { key: '올스탯', addKey: '올스탯', pctKey: '올스탯_퍼', addStep: 1, addUnit: '' },
  { key: '공격력', addKey: '공격력', pctKey: '공격력_퍼', addStep: 1, addUnit: '' },
  { key: '크댐',   addKey: '크댐',   pctKey: '크댐_퍼',   addStep: 1, addUnit: '' },
  { key: '최소뎀', addKey: '최소뎀', pctKey: '최소뎀_퍼', addStep: 1, addUnit: '' },
  { key: '최대뎀', addKey: '최대뎀', pctKey: '최대뎀_퍼', addStep: 1, addUnit: '' },
  { key: '고댐',   addKey: '고댐',   pctKey: '고댐_퍼',   addStep: 1, addUnit: '' },
  { key: '일몬추', addKey: '일몬추', pctKey: '일몬추_퍼', addStep: 1, addUnit: '' },
  { key: '보몬추', addKey: '보몬추', pctKey: '보몬추_퍼', addStep: 1, addUnit: '' },
  { key: '관통',   addKey: '관통',   pctKey: null, addStep: 1,   addUnit: '%' },
  { key: '일몬지', addKey: '일몬지', pctKey: null, addStep: 0.1, addUnit: '%' },
  { key: '보몬지', addKey: '보몬지', pctKey: null, addStep: 0.1, addUnit: '%' },
];

