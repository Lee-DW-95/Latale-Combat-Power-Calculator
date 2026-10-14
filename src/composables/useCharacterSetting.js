// 캐릭터별 설정 동기화 — 활성 캐릭터가 있으면 캐릭터(v-model → App.vue 자동 저장 → 서버·브라우저 캐릭터 목록)에,
// 없으면 브라우저(localStorage)에 저장한다. 성물 발동 시뮬·대미지 탭 입력이 같이 쓴다.
//
//   model       : defineModel 로 받은 캐릭터 설정 ref (객체)
//   hasCharacter: () => boolean — 활성 캐릭터 여부
//   local       : { read() → 객체|null, write(obj), clear() } — 캐릭터가 없을 때의 브라우저 저장소
//   snapshot    : () => 객체 — 지금 화면 상태 (저장할 값)
//   apply       : (객체|null) => void — 불러온 값을 화면 상태에 반영 (null 이면 기본값)
//
// 캐릭터에 아직 값이 없고 브라우저에 예전 값이 남아 있으면 그 값을 캐릭터로 한 번 옮기고 브라우저 값은 지운다.
// (캐릭터마다 성물·입력이 다르므로, 예전 값은 처음 열린 캐릭터 하나에만 옮긴다.)
import { watch } from 'vue';

const isEmpty = (v) => !v || typeof v !== 'object' || Object.keys(v).length === 0;

export function useCharacterSetting({ model, hasCharacter, local, snapshot, apply }) {
  // 마지막으로 불러오거나 내보낸 상태 — 내가 보낸 값이 v-model 로 되돌아올 때 다시 불러오지 않게 비교한다
  let lastJson = '';

  watch(
    [hasCharacter, model],
    ([has, cfg]) => {
      let next = has ? cfg : local.read();
      if (has && isEmpty(next)) {
        const legacy = local.read();
        if (legacy) {
          next = legacy;
          local.clear();
          // 캐릭터 전환 직후엔 App.vue 가 자동 저장을 1틱 막으므로, 그 뒤에 내보내야 서버에 저장된다
          setTimeout(() => {
            if (hasCharacter()) model.value = JSON.parse(JSON.stringify(snapshot()));
          }, 0);
        }
      }
      if (JSON.stringify(next ?? null) === lastJson) return;
      apply(isEmpty(next) ? null : next);
      lastJson = JSON.stringify(snapshot());
    },
    { immediate: true },
  );

  watch(
    snapshot,
    (snap) => {
      const json = JSON.stringify(snap);
      if (json === lastJson) return;
      lastJson = json;
      if (hasCharacter()) model.value = JSON.parse(json);
      else local.write(JSON.parse(json));
    },
    { deep: true },
  );
}

/** 단일 키 localStorage 저장소 — 저장 불가 환경(시크릿 모드 등)에서는 조용히 무시한다 */
export function localJsonStore(key) {
  return {
    read() {
      try {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        return v && typeof v === 'object' ? v : null;
      } catch {
        return null;
      }
    },
    write(obj) {
      try {
        localStorage.setItem(key, JSON.stringify(obj));
      } catch {
        /* 저장 실패 무시 */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* 무시 */
      }
    },
  };
}
