// 각성석 데이터 헬퍼 — App.vue 와 EfficiencyPanel.vue 양쪽에서 공유.

// 신규 각성석 1개 — 같은 각성석 내 옵션 중복 금지 전제로 서로 다른 4종 기본값.
export function makeEmptyAwakStone() {
  return {
    options: [
      { stat: '크댐',   unit: 'raw', value: '' },
      { stat: '최대뎀', unit: 'raw', value: '' },
      { stat: '공격력', unit: 'pct', value: '' },
      { stat: '공격력', unit: 'raw', value: '' },
    ],
  };
}
