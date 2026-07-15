/**
 * 라테일 전투력 계산 모듈
 *
 * 현재 채택: V_BIG29 — 자료20 통제 실험(동일 마법캐릭 6캡처)으로 게임 실제 구조 3개를 "정확히" 확정.
 *   사용자가 근마효율(35/33/31/25)·지배력(-1.0/-2.5)만 조절한 전후 캡처 → 방정식 역산 결과:
 *     ① 지배력: m_dom = 1 + (일몬지+보몬지)/200  (D=200.000, 4개 스트림 × 3페어 오차 <0.007)
 *        = 일반/보스 지배력의 "평균 %" 적용. floor 없음.
 *     ② 크댐: m_crit = 1 + 크댐/100 — 표시 크댐%를 그대로 배수로. (물리/마법 양 패널 cross 기울기
 *        비율 1.143889 가 이 구조에서 오차 2e-6 으로 정확 성립)
 *     ③ 데미지: m_dmg = (min_cap+최대뎀) 순비례 — "1+" 없음. min>max 시 cap 규칙 실재 확인
 *        (cap 미적용이면 판별식이 음수 모순). 기존 D_dmg~1e-37 축퇴는 옵티마이저가 이 비례성을
 *        스스로 찾아냈던 것.
 *   기타 정확 검증: BP = floor((직+소)/2) 6/6, cross 완전 선형(마 직접 12,336.5/1%p 상수),
 *   지배력은 직·소 균일곱(기울기비 = 값비).
 *   구조 고정 후 잔여 파라미터만 재학습(scripts/refit_v25_exact_structure.mjs, 3000 restarts):
 *     마법 RMSE 0.208→0.096%/max 0.430→0.237%, 물리 0.264%/max 0.996%, 세이버 ΔBP -6735 vs -6742,
 *     자료20 cross Δ -123,412 vs 실측 -123,365 · 지배 Δ -73,916 vs -73,937.
 *
 * 이전 채택: V_BIG28 — 모순 데이터(카톡 근마 -1pp 페어) 제외 후 확실한 데이터만으로 재역산, cross 선형 확정.
 *   카톡 근마 페어는 역산 검증 결과 어떤 표시 스탯 가설(주스탯/근+마/g^p/공격력/크댐/고댐)로도 설명 불가한
 *   정확히 2.0배 모순(요구 스케일비 1.794 vs 주스탯비 0.898) → 신뢰 불가 데이터로 판정, 학습 제외 (사용자 결정).
 *   제외 후 재탐색(refit_v23, crit=linear xkatgm=1, 300 restarts)에서 cross 선형이 지수형을 전 지표에서 이김:
 *     powg(^Pexp): loss 0.02646, P 0.318%/max 0.878%, M 0.393%/max 0.904%
 *     lin ★:       loss 0.02612, P 0.255%/max 0.983%, M 0.208%/max 0.430%  ← 채택
 *   → V_BIG26 의 지수(Pexp≈1.2)는 모순 페어를 흡수하느라 휘었던 것. K_cross_exp 파라미터 제거,
 *     ab_d += floor(K_cross × 주스탯 × 근마효율% / 100) 순수 선형 복귀. 크댐 선형화(V_BIG27)는 유지.
 *   세이버 ΔBP -6751 vs 실측 -6742 (오차 9). 학습: 카톡 17페어(모순 1건 제외)+박햇님 15+SAMPLE 64건.
 *
 * 이전 채택: V_BIG27 — 구조 대탐색(scripts/refit_v23_structure_search.mjs)으로 크댐 배수 선형화.
 *   6개 구조 축(cross/crit/dmg/dom/mon/pen) 좌표 탐색 결과, 유일한 구조 개선 = 크댐 floor 제거:
 *     m_crit = 1 + floor(크댐/269.5×100)/100  →  1 + 크댐/119.211 (순수 선형)
 *   학습 loss 0.0383→0.0259 (-32%), 물리 RMSE 0.292→0.265%/max 0.842→0.785%, 마법 0.341→0.302%,
 *   카톡 페어 RMSE 0.189→0.094 (반토막), 세이버 ΔBP -6745 vs 실측 -6742.
 *   판별 실험: floor 유지+D=119 재시작 → loss 0.0415 악화. 즉 "작은 분모"가 아니라 "floor 제거"가 본질.
 *   기각된 구조: cross=공격력비례/선형(주스탯^1.2 유지), dmg 별도가중/floor%, dom 별도가중/floor%,
 *   mon 별도가중, pen 자유 — 전부 현행 구조가 승리 (가중치 1.0 수렴 or loss 악화).
 *
 * 이전 채택: V_BIG26 — 자료19(고스펙 물리 BP840만, 좌측창만·총BP-only) 추가 후 64건 재학습, mainpow 채택.
 *   4개 함수형 공정비교(P+M 종합 RMSE 합): wholebase 0.714 / mainlin 0.666 / mainlin_sq 0.440 / mainpow 0.633
 *   규칙상 mainlin_sq 가 합 최소였으나 ① 물리 max 0.885→1.307% 악화 ② 고스펙 물리 3건(자료17/18/19)
 *   오차 약 2배 악화 ③ K0_sq 부호 라운드별 요동(-1.9e-4→0→+2.2e-3) → 사용자 결정으로 균형형 mainpow 채택:
 *   물리 0.292%/max 0.842%, 마법 0.341%/max 0.789%, 세이버 ΔBP -6747 vs 실측 -6742, 2라운드 연속 학습 loss 최소.
 *   cross 가 근마효율^Pexp (Pexp≈1.145) 비선형이라 attackBaseFor 에 K_cross_exp 파라미터 도입.
 *
 * 이전 채택: V_BIG25 — 자료18 추가 63건, mainlin (물리 0.286%/마법 0.335%).
 * 이전 채택: V_BIG23 — 근마효율 cross-term 을 "근력/마법력 비례 직접타격 가산" 으로 재설계.
 *   게임 메커니즘(사용자 도메인): 근마효율 = "근력/마법력 효율" → 근력/마법력이 높을수록 직접타격이 오른다.
 *   기존 V_BIG21 의 "직접 attackBase 전체 균일곱" 폐기 → 주스탯 비례 가산으로 교체:
 *     ab_d += floor(K_cross × 주스탯 × 근마효율% / 100)   (직접 전용, 소환 무관).
 *   동일 파라미터수로 물리 RMSE 0.361%→0.290%, 물리 max 1.326%→0.840% 개선 (마법 0.326%).
 *   4개 함수형(균일곱/근력선형/+주스탯²/g거듭제곱) 을 Dcrit 고정(269.5, 비식별성 제거) 공정비교 후 근력선형 채택.
 *     멀티에이전트 적대검증: 무상관 3지표(loss/물리RMSE/물리max) 동시 호전 → 진짜 개선.
 *     g거듭제곱(mainpow)은 +1파라미터 loss 이득이 노이즈 수준이라 Occam 위반으로 기각.
 *   알려진 한계: 카톡 근마 단일페어 직타Δ 실측 -21746 = 전 형태 예측의 정확히 2.0배(양자화 앨리어싱 의심) → 단일점 제외.
 *   재학습 스크립트: scripts/refit_v22_geunma_mainstat.mjs (FORM 인자 wholebase|mainlin|mainlin_sq|mainpow)
 *
 * @see FORMULA_RESEARCH.md - 공식 도출 과정과 한계
 * @see SAMPLE_DATA.json - 검증용 데이터셋
 */

// ============================================================
// V_BIG2 모델 - 9 파라미터 (사용자 도메인 지식 기반)
//
// 게임 메커니즘:
//   - 근력/공격력/고댐 → attackBase (가산형 베이스 스탯)
//   - 크댐, 최소+최대뎀, 지배력, 근마, 관통 → 곱셈 항
//
// 검증된 페어 데이터 분석:
//   - 표시 (최소뎀+최대뎀) 변화율 ≈ 전투력 변화율 → 곱셈 항 확정
//   - 표시 크댐 변화율 ≈ 전투력 변화율 → 곱셈 항 확정
//   - 관통 98→99: 전투력 +0.81% (case2 페어로 측정)
//
// 입력 규칙:
//   - 무기공격력/속성력은 T창 표시값의 max값 사용
// ============================================================

// V_BIG3 학습 결과 (52건, 페어 비율 제약, RMSE 0.28%)
// 누적 정정 이력:
//   - case3/case4 공격력 OCR 정정(76025/76695 → 69242)으로 RMSE 0.94% → 0.32%
//   - 기존1 공격력 avg(73044.5) → max(73740) 정정으로 RMSE 0.32% → 0.29%
//   - 일몬추/보몬추 항 추가 (V_BIG3) — case2 페어 -100당 -12 BP, 고댐 -150당 -57 BP
//   - K_mon/K2 비율을 0.316(페어 비율)로 제약하여 학습 (페어 충실도 우선)
//   - 검호 데이터 1건 추가 (img27, BP 4,142,389) → 52건
//   - 근마효율 cross-term (K_cross × 근력 × 근마효율%) 도입 + SPLIT 4-param 동시 재학습
//     • 게임 메커니즘 가설(근마효율=직접타격 전용, 근력 비례)을 데이터로 검증·반영
//     • split 22건 학습 (P 20 + M 2): 직 RMSE 0.81%→0.52%, 소 0.66%→0.39%
//     • multiplierFor 의 구 K_geunma 균일 곱 항 제거됨
//
// D_pen은 case2/case3/case4 세 독립 페어에서 일관되게 ≈25로 도출됨 (게임 메커니즘:
// 관통은 모든 곱셈 항 이후 마지막에 적용되는 방어력 관통 옵션 → 곱셈 항으로 모델링).
// 옵티마이저는 1차원 자유도로 degenerate(D_pen → 0)에 빠지므로 고정 상수 사용.
//
// K_mon: 일몬추+보몬추 가중치, K2 × 0.316 = 고댐의 약 1/3 효과
//   (case2 페어 측정: 일몬추 -100=-12 BP, 고댐 -150=-57 BP → 비율 0.316)
// V_BIG19 (A+B 단계) — 자료6/9 lock + 주스탯² 비선형 항 추가.
//   사용자 자료 모두 ±0.07% 이내:
//     자료6 +0.004% (perfect)   자료9 +0.071%   자료10 +0.010%   자료11 -0.019%   자료12 +0.001%
//   SAMPLE P 56건 RMSE 0.375%, M 7건 0.224%.
//   K0_sq = -0.00961908 (주스탯² 음의 기여, diminishing returns 메커니즘 모델링).
// V_BIG18 자유 학습 — 기존 모델 가설 폐기 후 디테일 데이터(96건)만으로 처음부터 재학습.
//   사용 데이터: 카톡 18 페어 + 박햇님 15 페어 + SAMPLE 직타/소타 분리 26 + 총BP 37 + img24 12페어
//   박햇님 데이터의 "펫버프·길드유물 포함" 표기를 buff factor b_haet=1.04 로 동시 추정.
//
//   모델 후보 4가지 비교 결과:
//     A) DOM=lin CROSS=mult K0_sq=in:    P 0.386% M 0.610% 세이버Δ -6946 카톡Δ -10664
//     B) DOM=lin CROSS=K1add K0_sq=in:   P 0.566% M 0.682% 세이버Δ -6519 카톡Δ -11716
//   ★ C) DOM=lin CROSS=mult K0_sq=out:   P 0.556% M 0.434% 세이버Δ -6742 카톡Δ -10374  ← 채택
//     D) DOM=lin CROSS=K1add K0_sq=out:  P 1.409% M 1.204% 세이버Δ -6019 카톡Δ -10824
//
//   핵심 변경:
//     1) K0_sq 항 제거 — 자유 학습에서 K0가 K0_sq 보상하여 더 좋은 fit (모델 C가 A 대비 M 우수)
//     2) dominance mult 선형 유지 (v17 검증)
//     3) cross-term multiplicative 유지 (K1 가산형보다 우수)
//     4) D_crit 128 (이전 270) — 자유 학습에서 mult 식 전체가 재밸런싱됨
//     5) base 3.15e-45 (이전 4.79e-45) — D_crit ↓ 보상
//
//   검증: 세이버 ΔBP -6742 = 실측 완벽 일치. 박햇님 sensitivity 0.135% (직 0.009%/소 0.177%).
//   알려진 한계: 카톡 근마 페어 직타Δ ~-10K 이 실측 -21746 의 절반 (4 모델 모두 동일 한계)
//     → 카톡 페어가 시사하는 K_cross(0.53)와 세이버 페어(0.24)가 단일 K로 모순 (모델 구조적 한계).
export const PHYSICAL_PARAMS = Object.freeze({
  K0: 1.9961907003208934,  // 주스탯 가중치 (선형 항)
  K0_sq: 0,                // 주스탯² 항 미사용 (구조 보존용 0)
  K1: 2.0145134648881123e+2, // 공격력 가중치
  K2: 1.5063278121892985,  // 고댐 가중치
  K_mon: 7.006046610937611e-1, // 일몬추+보몬추 가중치
  D_crit: 100,             // 크댐 분모 — V_BIG29 정확 확정: 표시 크댐% 그대로 (1+크댐/100)
  D_dom: 200,              // 지배력 분모 — V_BIG29 정확 확정: 일반/보스 지배력 평균 % (1+(일+보)/200)
  K_cross: 9.363133078648934e-1, // 근마효율 가산 cross 계수 — ab_d += floor(K_cross×주스탯×근마효율%/100)
  D_pen: 25.0,             // 관통 분모 (고정, 1% floor 적용)
  base: 1.0660138875029545e-8, // 전체 보정 상수 (dmg 순비례 항의 정규화 포함)
});

// 마법 직업 파라미터 (V_BIG3 페어 제약, 5건 학습, RMSE 0.13%)
//
// PHYSICAL_PARAMS 대비 K1만 0.91% 상향 (146.221 → 147.549).
// 가설: 게임은 무기공격력에 avg(min+max 평균)를 쓰는데 우리는 max를 입력
//   → 물리 K1은 학습 과정에서 (avg/max ≈ 0.991) 비율을 흡수
//   → 마법 속성력은 단일값(=avg-effective)이라 K1을 max-input 비율만큼 역보정해야 정합
// 검증: 실측 캡처 avg/max 평균 0.987과 회귀 0.991이 0.4% 이내 일치.
//       데이터 추가에 따라 보정 비율은 안정적으로 1.009~1.012 범위에서 수렴.
export const MAGIC_PARAMS = Object.freeze({
  ...PHYSICAL_PARAMS,
  K1: 2.0328052536429615e+2, // 마법 속성력 전용 (K1_phys × MAGIC_K1_RATIO 1.00908) — V_BIG29
});

/**
 * @typedef {Object} CharacterStats
 * @property {'P'|'M'} type
 * @property {number} 주스탯
 * @property {number} 공격력
 * @property {number} 관통
 * @property {number} 크댐
 * @property {number} 최소뎀
 * @property {number} 최대뎀
 * @property {number} 고댐
 * @property {number} 일몬추
 * @property {number} 보몬추
 * @property {number} 일몬지
 * @property {number} 보몬지
 * @property {number} 근마효율
 */

/**
 * 게임 메커니즘: 수련의방 등의 버프로 최소뎀이 최대뎀을 넘는 경우,
 * 초과분은 실제 전투력에 반영되지 않으므로 cap 처리한다.
 *
 * @param {number} minDmg
 * @param {number} maxDmg
 * @returns {number} effective 최소뎀 (= min(minDmg, maxDmg))
 */
export function effectiveMinDmg(minDmg, maxDmg) {
  const mn = Number(minDmg || 0);
  const mx = Number(maxDmg || 0);
  return Math.min(mn, mx);
}

/**
 * 직접/소환 타격 BP 분리 — 22건 5-param 동시 학습 (P 20건 + M 2건).
 *
 *   모델: ab_d = (K0-u)·근력 + (K1+v)·공격력 + (K2-w)·고댐 + (K_mon-x)·추가댐
 *                  + K_cross·근력·(근마효율%/100)        ← 사용자 도메인 가설
 *         ab_s = (K0+u)·근력 + (K1-v)·공격력 + (K2+w)·고댐 + (K_mon+x)·추가댐
 *
 *   학습 손실: Σ((ab_d·M − 직타_실측)/직타_실측)² + Σ((ab_s·M − 소타_실측)/소타_실측)²
 *     → 직/소 RMSE 합 최소화. 종합 BP 는 평균이라 자동 fit.
 *
 *   9-param 학습 결과 (모델 3, 정제 데이터 51건 — 중복+수련의방 8건 제외):
 *     K0=1.4599 / K1=147.842 / K2=1.6736 / K_mon=0.2767
 *     K_cross=0.6412 / u=0.7776 / v=82.5776 / w=0.2461 / x=0.1233
 *     22건 RMSE: 종합 0.26%, 직 0.34%, 소 0.20%
 *     51건 종합 RMSE: 0.197% (베이스 0.245% 보다 0.05%p 더 좋음)
 *     59건 종합(수련의방 outlier 포함 평가): 0.34% 추정
 *
 *   K2 자동 정상화 — 데이터 품질 통찰:
 *     자료8(중복) + 수련의방 7건은 effectiveMinDmg cap 처리에도 K2 학습을 왜곡.
 *     정제 후 K2 가 1.28→1.67 (+25%) 자동 상승. K_mon 도 0.40→0.28 (-30%) 정상화.
 *
 *   K1 자동 보정 — 사용자 도메인 통찰:
 *     "근력↓ 공격력↑ 케이스에서 종합 BP 과소추정" → K1 가중치 부족 신호.
 *     9-param 재학습으로 K1 = 147.84 → 패턴 해소.
 *
 *   학습 손실 함수 — 균형 (split 22건 종합+직+소 + 추가 36건 종합):
 *     loss = mean( e_total² + e_d² + e_s²  [22건 split]  +  e_total²  [36건 split없음] )
 *     5-param 만 학습했을 땐 종합 BP 가 시프트했으나 9-param 풀 학습으로 일관 fit.
 *
 *   설계 결정 — 근마효율 cross-term 도입:
 *     게임 메커니즘 가설: 근마효율은 직접타격에만 영향, 근력에 비례 (근력 많은 유저
 *     ↑ 직접타격 메리트). 데이터로 검증 — 22건 split RMSE 가 균일 곱 모델보다 일관되게 좋음.
 *     이전엔 K_geunma 를 multiplierFor 에 균일 곱했으나 자료6 (직≈소) 같은 케이스에서
 *     ±0.85% 편차 발생 → cross-term + SPLIT 동시 학습으로 ±0.4% 이내로 수렴.
 *
 *   조건부 환산(백/근/상)만 직접 BP 에 곱 (직접타격 전용 옵션).
 *   마법 직업: K1_M (147.549) 사용 → β_d/β_s 자동 보정 (params.K1 ± v).
 */
// SPLIT 파라미터 — V_BIG29 (정확 구조 고정 후 동시 재학습)
const SPLIT_U =   1.0408500833713372; // 근력 split    (직접 = K0    - u, 소환 = K0    + u)
const SPLIT_V = 114.85601011467281;   // 공격력 split  (직접 = K1    + v, 소환 = K1    - v)
const SPLIT_W =   0.004788984396513097; // 고댐 split  (직접 = K2    - w, 소환 = K2    + w)
const SPLIT_X =   0.47243499623688756; // 추가댐 split (직접 = K_mon - x, 소환 = K_mon + x)

// 곱셈 항 M = critMult × dmgMult × dominanceMult × penMult × base
//   V_BIG29: 크댐(1+크댐/100)·데미지(순비례)·지배력(1+합/200)은 자료20 통제 실험으로 정확 확정 — floor 없음.
//   관통만 1% 단위 floor 유지 (기존 페어 근거, 추후 통제 페어로 재검증 예정).
//   근마효율은 attackBaseFor('direct') 의 cross-term 으로 들어가므로 여기 없음.
function multiplierFor(stats) {
  if (!stats) return 0;
  const params = stats.type === 'M' ? MAGIC_PARAMS : PHYSICAL_PARAMS;
  const maxDmg = Number(stats.최대뎀 || 0);
  const minDmg = effectiveMinDmg(stats.최소뎀, stats.최대뎀);
  // V_BIG29 정확 확정 (자료20 통제 실험): 크댐 배수 = 표시 크댐% 그대로 (D_crit=100, floor 없음).
  //   물리/마법 양 패널 cross 기울기 비율이 이 구조에서 오차 2e-6 으로 정확 성립.
  const critMultiplier =
    1 + Number(stats.크댐 || 0) / params.D_crit;
  // V_BIG29 정확 확정: 데미지 항은 (min_cap+최대뎀) 순비례 — "1+" 없음, 정규화는 base 가 흡수.
  //   물리 min>max 역전 시 cap 규칙 실재 확인 (cap 미적용이면 패널 판별식 음수 모순).
  const dmgMultiplier = minDmg + maxDmg;
  // V_BIG29 정확 확정: 지배력 = 일반/보스 지배력의 평균 % 적용 (D_dom=200.000, floor 없음).
  //   자료20 지배력 페어 4개 스트림 × 3페어 전부 D=200 오차 <0.007.
  const dominanceMultiplier =
    1 + (Number(stats.일몬지 || 0) + Number(stats.보몬지 || 0)) / params.D_dom;
  // 관통 boost 1% 단위 floor
  const penetrationMultiplier =
    1 + Math.floor(Number(stats.관통 || 0) / params.D_pen * 100) / 100;
  return (
    critMultiplier *
    dmgMultiplier *
    dominanceMultiplier *
    penetrationMultiplier *
    params.base
  );
}

// attackBase 계산 — mode: 'avg' | 'direct' | 'summon'
//   세 모드 모두 K0/K1/K2/K_mon 기반. direct/summon 은 (u, v, w, x) 만큼 4-param split 적용.
//   V_BIG23: direct 모드에 한해 근마효율 가산 보너스 ab_d += floor(K_cross × 주스탯 × 근마효율%/100).
//     게임 메커니즘 — 근마효율("근력/마법력 효율")은 근력/마법력에 비례해 직접타격만 올린다.
//     (구 V_BIG21 의 "직접 base 전체 균일곱" 폐기 — 공격력/고댐까지 싸잡아 증폭해 부정확했음.)
//   평균 = (direct + summon)/2 = avg.
function attackBaseFor(stats, mode = 'avg') {
  if (!stats) return 0;
  const params = stats.type === 'M' ? MAGIC_PARAMS : PHYSICAL_PARAMS;
  const 주스탯 = Number(stats.주스탯 || 0);
  const 공격력 = Number(stats.공격력 || 0);
  const 고댐 = Number(stats.고댐 || 0);
  const 추가댐 = Number(stats.일몬추 || 0) + Number(stats.보몬추 || 0);
  const 근마효율 = Number(stats.근마효율 || 0);

  let alpha = params.K0;
  let beta = params.K1;
  let gamma = params.K2;
  let delta = params.K_mon;
  if (mode === 'direct') {
    alpha -= SPLIT_U;
    beta += SPLIT_V;
    gamma -= SPLIT_W;
    delta -= SPLIT_X;
  } else if (mode === 'summon') {
    alpha += SPLIT_U;
    beta -= SPLIT_V;
    gamma += SPLIT_W;
    delta += SPLIT_X;
  }
  // V_BIG10: attackBase 각 항 floor (게임 truncate 일관 적용)
  // 주스탯² 항(K0_sq): V_BIG26(mainpow) 에서 미사용(=0) → floor(0)=0 무해. 구조 보존용으로 남김.
  let result = Math.floor(alpha * 주스탯)
             + Math.floor(beta * 공격력)
             + Math.floor(gamma * 고댐)
             + Math.floor(delta * 추가댐)
             + Math.floor((params.K0_sq || 0) * 주스탯 * 주스탯 / 1e7);
  if (mode === 'direct' && 근마효율 > 0) {
    // V_BIG23~: 근마효율 = "근력/마법력 효율" — 근력/마법력이 높을수록 직접타격이 오른다.
    //   직접 전용 가산 보너스, 주스탯(근력/마법력)에 선형 비례. 소환엔 미적용.
    //   V_BIG28: V_BIG26 의 거듭제곱 지수(K_cross_exp≈1.2)는 모순 페어(카톡 근마) 흡수용이었음이
    //   판별되어 제거 — 모순 페어 제외 재학습에서 순수 선형이 전 지표 우위.
    result = result + Math.floor(params.K_cross * 주스탯 * 근마효율 / 100);
  }
  return result;
}

/**
 * 전투력(BP) 계산 — 표시 BP = (직접 BP + 소환 BP) / 2.
 *   target: 'base' (조건부 환산 미반영, 게임 T창 표시값과 일치) |
 *           'normal' (일반 인던 가동률 환산) |
 *           'boss' (보스 인던 가동률 환산, 디폴트)
 *
 *   조건부 환산(백/근/상)은 직접타격에만 적용되므로 직접 BP × cond_mult, 소환 BP는 그대로.
 *   가동률 0 이면 cond_mult = 1 → 'base' 와 동일.
 */
export function calculateBattlePower(stats, target = 'boss') {
  if (!stats) return 0;
  const ab_d = attackBaseFor(stats, 'direct');
  const ab_s = attackBaseFor(stats, 'summon');
  if (ab_d <= 0 && ab_s <= 0) return 0;
  const M = multiplierFor(stats);
  const cond = target === 'base' ? 1 : expectedConditionalMultiplier(stats, target);
  // V_BIG10: 직타·소타 BP 각각 floor, 평균도 floor (게임 표시 BP 정수)
  const bp_direct = Math.floor(ab_d * M * cond);
  const bp_summon = Math.floor(ab_s * M);
  return Math.floor((bp_direct + bp_summon) / 2);
}

/**
 * 직접타격 BP — 백/근/상 가동률 환산 적용.
 */
export function calculateDirectBP(stats, target = 'boss') {
  if (!stats) return 0;
  const ab = attackBaseFor(stats, 'direct');
  if (ab <= 0) return 0;
  const M = multiplierFor(stats);
  const cond = target === 'base' ? 1 : expectedConditionalMultiplier(stats, target);
  return Math.floor(ab * M * cond);
}

/**
 * 소환타격 BP — 백/근/상 영향 없음 (직접타격 전용 옵션).
 *   target 인자는 시그니처 호환만 (실제 사용 안 됨).
 */
export function calculateSummonBP(stats /* , target */) {
  if (!stats) return 0;
  const ab = attackBaseFor(stats, 'summon');
  if (ab <= 0) return 0;
  return Math.floor(ab * multiplierFor(stats));
}

/**
 * 몬스터 타입별 분리 BP — 일반 / 보스 상대 전투력.
 *
 *   정의: 한쪽 몬스터 타입 항만 적용된 캐릭의 BP.
 *     일반 BP: 일몬추/지만 적용 (일=보로 가정 = 반대편을 일몬 값으로 대체)
 *     보스 BP: 보몬추/지만 적용 (반대편을 보몬 값으로 대체)
 *   → 일몬추=보몬추, 일몬지=보몬지 인 캐릭은 vs 일반 = vs 보스 = 종합 BP 자명 성립.
 *   → 비선형 항(K_mon × 합 × multiplier 등) 때문에 (일+보)/2 ≈ 종합 (정확한 동치 X).
 *
 *   백어택/근거리/상태이상 가동률은 monsterType과 일관 매핑.
 *
 * @param {CharacterStats} stats
 * @param {'normal'|'boss'} monsterType
 * @returns {number} 분리 BP (직접+소환 평균)
 */
export function calculateBPVsMonster(stats, monsterType) {
  if (!stats) return 0;
  const adjusted = { ...stats };
  if (monsterType === 'normal') {
    adjusted.보몬추 = Number(stats.일몬추 || 0);
    adjusted.보몬지 = Number(stats.일몬지 || 0);
  } else {
    adjusted.일몬추 = Number(stats.보몬추 || 0);
    adjusted.일몬지 = Number(stats.보몬지 || 0);
  }
  return calculateBattlePower(adjusted, monsterType);
}

/**
 * 몬스터 타입별 분리 직접타격 BP.
 */
export function calculateDirectBPVsMonster(stats, monsterType) {
  if (!stats) return 0;
  const adjusted = { ...stats };
  if (monsterType === 'normal') {
    adjusted.보몬추 = Number(stats.일몬추 || 0);
    adjusted.보몬지 = Number(stats.일몬지 || 0);
  } else {
    adjusted.일몬추 = Number(stats.보몬추 || 0);
    adjusted.일몬지 = Number(stats.보몬지 || 0);
  }
  return calculateDirectBP(adjusted, monsterType);
}

/**
 * 몬스터 타입별 분리 소환타격 BP.
 */
export function calculateSummonBPVsMonster(stats, monsterType) {
  if (!stats) return 0;
  const adjusted = { ...stats };
  if (monsterType === 'normal') {
    adjusted.보몬추 = Number(stats.일몬추 || 0);
    adjusted.보몬지 = Number(stats.일몬지 || 0);
  } else {
    adjusted.일몬추 = Number(stats.보몬추 || 0);
    adjusted.일몬지 = Number(stats.보몬지 || 0);
  }
  return calculateSummonBP(adjusted);
}

// ============================================================
// 조건부 대미지 환산 — 백어택/근거리/상태이상
//
// 출처: 라테일 스펙 분석기 3.4.1 엑셀의 B!P18 / B!P19 공식 그대로.
//   인던 일반:  대미지 ∝ (0.6 × (1 + 크댐%) + 백어택% + 근거리% + 상태이상%) × (1 + 일반지배력%)
//   인던 보스:  대미지 ∝ (0.3 × (1 + 크댐%) + 백어택% + 근거리% + 상태이상%) × (1 + 보스지배력%)
//
//   조건부 옵션 OFF 시 분자에서 해당 항이 빠지므로, ON/OFF 비교 시 곱셈 배율은:
//
//      multiplier = 1 + (활성 옵션들의 %합) / (D × (1 + 크댐/100))
//
//   D = 0.6 (일반) / 0.3 (보스).  지배력은 약분되어 영향 없음.
//
//   ⚠️ 단순 (1+x) 곱셈이 아닌 까닭: 분모가 크댐%에 비례하므로 endgame 캐릭(크댐 9000%+)일수록
//      백어택의 상대적 효과가 작아진다. 백어택 1000% 이라도 실제 곱셈 배율은 1.18~1.37배 수준.
//
//   단, 근거리/상태이상은 엑셀에 별도 공식이 없어 백어택과 동일한 메커니즘으로 가정 (사용자 확인).
// ============================================================
const TARGET_DENOM_BASE = Object.freeze({ normal: 0.6, boss: 0.3 });

function conditionalMultiplierCore(stats, activeMap, target) {
  const D = TARGET_DENOM_BASE[target] ?? TARGET_DENOM_BASE.normal;
  const crit = Number(stats?.크댐 || 0) / 100;
  const denom = D * (1 + crit);
  if (denom <= 0) return 1;

  let numerator = 0;
  if (activeMap.백어택) numerator += Number(stats?.백어택 || 0);
  if (activeMap.근거리) numerator += Number(stats?.근거리 || 0);
  if (activeMap.상태이상) numerator += Number(stats?.상태대미지 || 0);
  // numerator 도 % 값이라 100 으로 나눔
  return 1 + (numerator / 100) / denom;
}

// 활성 플래그 (stats.{옵션}활성) 기반 자동 multiplier — 시나리오 ON/OFF 보기용
//   target: 'normal' | 'boss' — 디폴트 'normal'
//   ⚠ 사용처: 사용자가 "지금 이 옵션이 적용되는 순간의 BP" 를 볼 때.
//   BP 자동 환산엔 expectedConditionalMultiplier (가동률 가중) 사용.
export function conditionalMultiplier(stats, target = 'normal') {
  return conditionalMultiplierCore(
    stats,
    {
      백어택: !!stats?.백어택활성,
      근거리: !!stats?.근거리활성,
      상태이상: !!stats?.상태대미지활성,
    },
    target,
  );
}

// 임의 활성 플래그 조합으로 multiplier 계산 (시나리오 매트릭스 best/worst 비교용)
//   activeMap = { 백어택: bool, 근거리: bool, 상태이상: bool }
export function conditionalMultiplierWith(stats, activeMap = {}, target = 'normal') {
  return conditionalMultiplierCore(stats, activeMap, target);
}

// ============================================================
// 기댓값(가동률 가중) 환산 — BP 자동 반영용
//
//   백어택/근거리/상태이상은 항상 적용되는 게 아니라 조건이 충족돼야 들어간다 (직타·자세·상태이상 부여).
//   따라서 평균 BP 는 옵션 % × 가동률 (P(조건 충족)) 의 기댓값이 된다.
//   대미지 분자가 옵션들에 대해 선형이므로 기댓값도 깔끔히 분해됨:
//
//      E[mult] = 1 + Σ ( 옵션% × 가동률 ) / (D × (1 + 크댐%))
//
//   가동률 = stats.{옵션}가동률 (% 단위, 0~100). 0 이면 그 옵션은 BP 영향 없음.
//   활성 플래그 = stats.{옵션}활성 (bool). false 면 가동률·옵션값에 관계없이 BP 영향 0 — UI 체크박스가 게이트.
//   소환타격 위주 캐릭은 0 입력 → 자연스레 환산 제외.
// ============================================================
export function expectedConditionalMultiplier(stats, target = 'normal') {
  const D = TARGET_DENOM_BASE[target] ?? TARGET_DENOM_BASE.normal;
  const crit = Number(stats?.크댐 || 0) / 100;
  const denom = D * (1 + crit);
  if (denom <= 0) return 1;

  const weighted = (val, up) =>
    (Number(val || 0) * Math.max(0, Math.min(100, Number(up || 0)))) / 100;

  const back = stats?.백어택활성 ? weighted(stats?.백어택, stats?.백어택가동률) : 0;
  const close = stats?.근거리활성 ? weighted(stats?.근거리, stats?.근거리가동률) : 0;
  const status = stats?.상태대미지활성 ? weighted(stats?.상태대미지, stats?.상태대미지가동률) : 0;

  const numerator = (back + close + status) / 100; // % → 소수
  return 1 + numerator / denom;
}

export const STAT_KEYS = Object.freeze([
  '주스탯', '공격력', '관통', '크댐', '최소뎀', '최대뎀',
  '고댐', '일몬추', '보몬추', '일몬지', '보몬지', '근마효율',
]);

/**
 * 장비 옵션 키 (총 18개)
 * - 가산형 12개: 표시값 그대로 합산
 * - % 옵션 6개: 캐릭터의 기본값(기본_*)에 비율을 곱해서 절대값으로 변환
 *
 * 게임 메커니즘 (사용자 도메인 지식):
 *   최종 스탯 = 기본값 × (1 + 모든_%옵션_합 / 100)
 *   부적 % 옵션 1개의 효과 = 기본값 × (해당% / 100)  ← 가산형 (multiplicative pool 아님)
 *   올스탯 = 모든 스탯에 더해짐 → 전투력 계산상 주스탯에 합산
 */
export const EQUIP_KEYS = Object.freeze([
  // 가산형 (절대값)
  '주스탯', '올스탯', '공격력', '관통',
  '크댐', '최소뎀', '최대뎀', '고댐',
  '일몬추', '보몬추', '일몬지', '보몬지',
  // % 옵션 (기본값 필요)
  '주스탯_퍼', '올스탯_퍼', '공격력_퍼',
  '크댐_퍼', '최소뎀_퍼', '최대뎀_퍼',
  '고댐_퍼', '일몬추_퍼', '보몬추_퍼',
]);

/**
 * 캐릭터의 누적%를 기본값과 표시값으로부터 자동 계산.
 *
 * 게임 메커니즘:
 *   표시값 = 기본값 × (1 + 누적%)
 *   누적% = (표시값 - 기본값) / 기본값
 *
 * @returns {number} 비율(소수). 예: 506% → 5.06
 */
export function pctPool(stats, displayKey, baseKey) {
  const display = Number(stats?.[displayKey] || 0);
  const base = Number(stats?.[baseKey] || 0);
  if (base <= 0) return 0;
  return (display - base) / base;
}

/**
 * 한 스탯에 대한 변화량 계산 (A 메커니즘).
 *
 * 공식:
 *   새 표시값 = (기본값 + 부적_가산) × (1 + 누적% + 부적%)
 *   변화량   = 새 표시값 - 표시값
 *
 * 폴백 (기본값 미입력 시): 표시값을 기본값으로 가정 (= 누적% 0). % 옵션도 반영되도록.
 *   누적%이 실제로 큰 캐릭은 과대평가될 수 있어 EquipmentCompare UI 가 행별 ⚠ 경고로 안내.
 *   가산만 반환하던 기존 폴백은 % 옵션을 완전히 버려 사용자에게 "변화 없음"으로 보였음.
 */
function applyEquipDelta(stats, displayKey, baseKey, addedFromEquip, addedPctFromEquip) {
  const base = Number(stats?.[baseKey] || 0);
  const display = Number(stats?.[displayKey] || 0);

  // 기본값/표시값 둘 다 0이면 % 옵션도 적용 불가 — 가산만
  if (base <= 0 && display <= 0) return addedFromEquip;

  // 기본값 미입력 시 표시값을 base 로 폴백 (누적% = 0 가정)
  const effectiveBase = base > 0 ? base : display;
  const currentPct = base > 0 ? (display - base) / base : 0;

  const newBase = effectiveBase + addedFromEquip;
  const newPct = currentPct + addedPctFromEquip / 100;
  const newDisplay = newBase * (1 + newPct);
  return newDisplay - display;
}

/**
 * 장비 옵션을 STAT_KEYS 기준 절대 변화량으로 변환.
 *
 * 게임 메커니즘 (사용자 도메인 지식, 검증된 패턴):
 *   - 표시값 = 기본값 × (1 + 누적%)
 *   - 부적 가산은 기본값에 합쳐지고, 부적 %는 누적%에 합쳐진 후 곱셈 적용
 *   - 따라서 같은 +500 부적이라도 누적 120%인 사람은 +600, 누적 110%인 사람은 +550
 *
 * @param {Object} stats - 캐릭터 스탯 (표시값 + 기본_* 필드)
 * @param {Object} equip - 장비 옵션 (EQUIP_KEYS)
 * @returns {Object} STAT_KEYS 각 키별 절대 변화량
 */
export function equipDelta(stats, equip) {
  const v = (k) => Number(equip?.[k] || 0);

  // 주스탯: 가산 = 주스탯+올스탯, % = 주스탯_퍼+올스탯_퍼
  const 주스탯_가산 = v('주스탯') + v('올스탯');
  const 주스탯_퍼총 = v('주스탯_퍼') + v('올스탯_퍼');

  return {
    주스탯: applyEquipDelta(stats, '주스탯', '기본_주스탯', 주스탯_가산, 주스탯_퍼총),
    공격력: applyEquipDelta(stats, '공격력', '기본_공격력', v('공격력'), v('공격력_퍼')),
    크댐:   applyEquipDelta(stats, '크댐',   '기본_크댐',   v('크댐'),   v('크댐_퍼')),
    최소뎀: applyEquipDelta(stats, '최소뎀', '기본_최소뎀', v('최소뎀'), v('최소뎀_퍼')),
    최대뎀: applyEquipDelta(stats, '최대뎀', '기본_최대뎀', v('최대뎀'), v('최대뎀_퍼')),
    고댐:   applyEquipDelta(stats, '고댐',   '기본_고댐',   v('고댐'),   v('고댐_퍼')),
    일몬추: applyEquipDelta(stats, '일몬추', '기본_일몬추', v('일몬추'), v('일몬추_퍼')),
    보몬추: applyEquipDelta(stats, '보몬추', '기본_보몬추', v('보몬추'), v('보몬추_퍼')),
    관통:   v('관통'),
    일몬지: v('일몬지'),
    보몬지: v('보몬지'),
    근마효율: 0,
  };
}

export function compareEquipment(currentStats, oldEquip, newEquip) {
  const oldDelta = equipDelta(currentStats, oldEquip);
  const newDelta = equipDelta(currentStats, newEquip);

  const newStats = { ...currentStats };
  for (const key of STAT_KEYS) {
    newStats[key] =
      (Number(currentStats[key]) || 0) - (oldDelta[key] || 0) + (newDelta[key] || 0);
  }

  const currentBP = calculateBattlePower(currentStats);
  const newBP = calculateBattlePower(newStats);
  const change = newBP - currentBP;

  const contributions = STAT_KEYS.map((key) => {
    const diff = (newDelta[key] || 0) - (oldDelta[key] || 0);

    if (diff === 0 || !Number.isFinite(diff)) {
      return { stat: key, diff: 0, impact: 0 };
    }

    const partialStats = {
      ...currentStats,
      [key]: (Number(currentStats[key]) || 0) + diff,
    };
    const partialBP = calculateBattlePower(partialStats);
    const impact = partialBP - currentBP;

    return { stat: key, diff, impact };
  }).filter((c) => c.diff !== 0);

  return {
    currentBP,
    newBP,
    change,
    changePercent: currentBP > 0 ? (change / currentBP) * 100 : 0,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
    contributions,
    newStats,
  };
}

export function statMarginalEffect(stats, statKey, delta = 1) {
  const baseBP = calculateBattlePower(stats);
  const modifiedStats = {
    ...stats,
    [statKey]: (Number(stats[statKey]) || 0) + delta,
  };
  const newBP = calculateBattlePower(modifiedStats);
  return newBP - baseBP;
}

/**
 * 옵션 동등 환산 솔버 — "이 ΔBP 를 내려면 스탯 X 옵션이 얼마 필요한가?"
 *
 *   deltaFn(amount) = 스탯 X 에 amount 옵션을 적용했을 때의 ΔBP (= BP(amount) - baseBP).
 *   amount 에 대해 단조 비감소(monotone non-decreasing)인 계단 함수를 가정한다.
 *
 *   ⚠ 단순 이분법이 실패하는 세 가지 게임 메커니즘을 모두 처리한다:
 *     1) floor 양자화 — 크댐/근마효율/고댐/지배력은 BP 식 내부 Math.floor 때문에
 *        ΔBP 가 계단 함수다. 임의의 목표값에 "정확히" 수렴하지 못하므로, 기존 코드는
 *        converged=false → '도달 불가' 로 잘못 표기했다 (예: 근력 +1% → 크댐 환산).
 *        → 가장 근접한 amount 를 돌려주고 approx:true 로 표시한다.
 *     2) 하드 캡 / 도메인 한계 — 관통(cap 99), 최소뎀(effectiveMinDmg 로 최대뎀까지만 효과)은
 *        amount 를 아무리 키워도 ΔBP 가 천장(ceiling)에 막힌다.
 *        → reachable:false + reachableDelta(천장값) 로 "진짜 도달 불가" 를 구분한다.
 *     3) 주스탯² 비선형 감쇠 — 주스탯은 K0_sq 음수항 때문에 극단값에서 BP 가 꺾인다.
 *        → 거대한 probe 로 overshoot 하지 않도록 ×WINDOW 배율로 점진 탐색한다.
 *
 *   양자화 평탄 구간과 진짜 캡의 구분 (핵심):
 *     +1 옵션이 floor 스텝을 못 넘겨 ΔBP 가 0 이어도 그건 캡이 아니다.
 *     amount 를 ×WINDOW(1024) 키워도 ΔBP 가 더 안 늘면 그때만 캡으로 판정한다.
 *
 * @param {(amount:number)=>number} deltaFn  amount → ΔBP (BP - baseBP)
 * @param {number} targetDelta  맞추려는 ΔBP (음수 = 옵션 차감 방향)
 * @returns {{amount:number, achieved:number, approx:boolean, coarse:boolean, reachable:true}
 *          | {amount:null, reachable:false, reachableDelta:number}}
 */
export function solveEquivalentAmount(deltaFn, targetDelta) {
  if (!Number.isFinite(targetDelta) || targetDelta === 0) {
    return { amount: 0, achieved: 0, approx: false, coarse: false, reachable: true };
  }
  const sgn = targetDelta > 0 ? 1 : -1;
  const WINDOW = 1024; // 양자화 평탄구간 vs 진짜 캡 판별 배율

  // 1) bracket 탐색 — 목표를 넘어서는 상한 hi 를 찾거나, 천장(캡)을 검출.
  let hi = sgn;
  let dAtHi = deltaFn(hi);
  let reached = false;
  for (let i = 0; i < 40; i++) {
    if (sgn * dAtHi >= sgn * targetDelta) { reached = true; break; }
    const hiBig = hi * WINDOW;
    const dBig = deltaFn(hiBig);
    // ×WINDOW 키워도 개선 없음 → 천장(하드캡/도메인 한계)
    if (sgn * dBig <= sgn * dAtHi + 1e-9) {
      return { amount: null, reachable: false, reachableDelta: dBig };
    }
    hi = hiBig;
    dAtHi = dBig;
    if (Math.abs(hi) > 1e15) {
      return { amount: null, reachable: false, reachableDelta: dAtHi };
    }
  }
  if (!reached) {
    return { amount: null, reachable: false, reachableDelta: dAtHi };
  }

  // 2) 이분법 — [0, hi] 구간에서 목표 ΔBP 교차점.
  let aLo = 0;
  let aHi = hi;
  let mid = 0;
  for (let i = 0; i < 100; i++) {
    mid = (aLo + aHi) / 2;
    const d = deltaFn(mid);
    if (sgn > 0) {
      if (d < targetDelta) aLo = mid; else aHi = mid;
    } else {
      if (d > targetDelta) aLo = mid; else aHi = mid;
    }
  }

  let amount = mid;
  let achieved = deltaFn(mid);
  // 0.5% 이내면 사실상 정확 (1 BP 단위 floor 오차는 정확으로 간주)
  const approx = Math.abs(achieved - targetDelta) > Math.abs(targetDelta) * 0.005;
  // coarse: 옵션 한 스텝이 목표보다 커서 절반도 못 채움 → 선형 비율로 근사 추정.
  let coarse = false;
  if (approx && Math.abs(achieved) < Math.abs(targetDelta) * 0.5) {
    const dHi = deltaFn(hi);
    if (dHi !== 0) {
      amount = (targetDelta * hi) / dHi;
      coarse = true;
    }
  }
  return { amount, achieved, approx, coarse, reachable: true };
}

export const STAT_LABELS = {
  P: {
    주스탯: '근력',
    공격력: '무기공격력',
    크댐: '크리티컬 데미지 (물리)',
    최소뎀: '최소 데미지 (물리)',
    최대뎀: '최대 데미지 (물리)',
    고댐: '고정 데미지 증가 (물리)',
  },
  M: {
    주스탯: '마법력',
    공격력: '속성력',
    크댐: '크리티컬 데미지 (마법)',
    최소뎀: '최소 데미지 (마법)',
    최대뎀: '최대 데미지 (마법)',
    고댐: '고정 데미지 증가 (마법)',
  },
  공통: {
    관통: '관통력',
    올스탯: '올스탯',
    일몬추: '일반 몬스터 추가 데미지',
    보몬추: '보스 몬스터 추가 데미지',
    일몬지: '일반 몬스터 지배력 (%)',
    보몬지: '보스 몬스터 지배력 (%)',
    근마효율: '근력/마법력 효율 (%)',
  },
};

/**
 * 스탯 키의 한국어 라벨을 반환.
 * "_퍼" 접미사가 붙은 % 옵션은 자동으로 "{기본 라벨} %" 형태로 반환.
 */
export function getStatLabel(type, statKey) {
  if (typeof statKey === 'string' && statKey.endsWith('_퍼')) {
    const baseKey = statKey.slice(0, -2);
    return `${getStatLabel(type, baseKey)} %`;
  }
  if (STAT_LABELS[type] && STAT_LABELS[type][statKey]) {
    return STAT_LABELS[type][statKey];
  }
  if (STAT_LABELS.공통[statKey]) {
    return STAT_LABELS.공통[statKey];
  }
  return statKey;
}

export function createEmptyStats(type = 'P') {
  return {
    type,
    // 표시값 (T창 능력치 세부정보)
    주스탯: 0,
    공격력: 0,
    관통: 0,
    크댐: 0,
    최소뎀: 0,
    최대뎀: 0,
    고댐: 0,
    일몬추: 0,
    보몬추: 0,
    일몬지: 0,
    보몬지: 0,
    근마효율: 0,
    // 기본값 (T창 추가 세부정보의 +값) — 장비 % 옵션 환산에 사용
    기본_주스탯: 0,
    기본_공격력: 0,
    기본_크댐: 0,
    기본_최소뎀: 0,
    기본_최대뎀: 0,
    기본_고댐: 0,
    기본_일몬추: 0,
    기본_보몬추: 0,
    // 조건부 대미지 환산 — 게임 T창 BP에는 미포함. 가동률 기반 기댓값으로 별도 환산.
    //   백어택/근거리/상태이상 % 값 + 가동률(0~100, 사용자가 직타비중 + 조건충족율 합산해 입력)
    //   가동률 0 = BP 영향 없음. 활성 플래그는 시나리오 매트릭스 'ON/OFF' 빠른 보기용.
    백어택: 0,           // %
    백어택활성: false,
    백어택가동률: 0,     // %  (0~100, BP 환산 기댓값에 사용)
    근거리: 0,
    근거리활성: false,
    근거리가동률: 0,
    상태대미지: 0,
    상태대미지활성: false,
    상태대미지가동률: 0,
  };
}

export function createEmptyEquipment() {
  return {
    // 가산형 12개
    주스탯: 0,
    올스탯: 0,
    공격력: 0,
    관통: 0,
    크댐: 0,
    최소뎀: 0,
    최대뎀: 0,
    고댐: 0,
    일몬추: 0,
    보몬추: 0,
    일몬지: 0,
    보몬지: 0,
    // % 옵션 9개 (백어택 등 조건부 옵션은 전투력 계산에 미반영이라 제외)
    주스탯_퍼: 0,
    올스탯_퍼: 0,
    공격력_퍼: 0,
    크댐_퍼: 0,
    최소뎀_퍼: 0,
    최대뎀_퍼: 0,
    고댐_퍼: 0,
    일몬추_퍼: 0,
    보몬추_퍼: 0,
  };
}
