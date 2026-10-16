#!/usr/bin/env bash
# 어드벤처 시뮬레이터(alfm201/adventure, 원작자 허락) 자체 호스팅 미러.
#
#   원본 저장소를 받아 모델 파일까지 채우고, 모델을 원작자 서버(Cloudflare — 다른 출처 요청은 403)
#   대신 같은 폴더에서 받도록 두 줄을 고친다. Caddy 가 /adventure/ 경로로 정적 서빙한다.
#
#   처음 설치·원본 업데이트 반영 모두 이 스크립트 한 번이면 된다 (멱등):
#     bash /home/ubuntu/latale/backend/scripts/adventure_mirror.sh
#
#   Caddyfile (latale-api.duckdns.org 블록 안, reverse_proxy 보다 위):
#     handle_path /adventure/* {
#         root * /srv/adventure
#         file_server
#     }
#     redir /adventure /adventure/
set -euo pipefail

DIR=/srv/adventure
REPO=https://github.com/alfm201/adventure.git
RELEASE=https://github.com/alfm201/adventure/releases/download

if [ ! -d "$DIR/.git" ]; then
  sudo mkdir -p "$DIR"
  sudo chown "$(id -u):$(id -g)" "$DIR"
  git clone --depth 1 "$REPO" "$DIR"
else
  # 지난번 패치를 되돌린 뒤 최신으로 — 패치는 아래에서 다시 적용한다.
  git -C "$DIR" checkout -- src/compute/vela/source.js src/compute/lyra/model.js
  git -C "$DIR" pull --ff-only
fi

# 모델 파일 — 저장소에는 없고(Git 제외) 릴리스에만 있다. 크기가 다를 때만 받는다.
fetch_model() {  # <릴리스 태그> <릴리스 파일명> <저장 경로>
  local tag=$1 name=$2 out=$DIR/$3
  local want
  want=$(curl -fsSL "https://api.github.com/repos/alfm201/adventure/releases/tags/$tag" |
    python3 -c "import json,sys; print(next(a['size'] for a in json.load(sys.stdin)['assets'] if a['name']=='$name'))")
  if [ -f "$out" ] && [ "$(stat -c %s "$out")" = "$want" ]; then
    echo "model ok: $3"
    return
  fi
  echo "downloading $tag/$name ($want bytes)"
  curl -fL --retry 3 -o "$out.part" "$RELEASE/$tag/$name"
  mv "$out.part" "$out"
}
fetch_model vela-v4.2 model.bin.gz public/models/vela-v4.2/model.bin.gz
fetch_model lyra-v1 lyra-v1.bin.gz public/models/lyra-v1/lyra-v1.bin.gz

# 모델을 같은 폴더에서 받도록 — MODEL_ORIGIN 이 비면 manifest 옆 파일을 쓴다(원본 로직).
sed -i 's|^export const MODEL_ORIGIN = .*|export const MODEL_ORIGIN = null; // self-hosted mirror: same folder as manifest|' \
  "$DIR/src/compute/vela/source.js"
sed -i "s|^export const PACKAGE_URL = .*|export const PACKAGE_URL = new URL('lyra-v1.bin.gz', ASSET_URL).href; // self-hosted mirror|" \
  "$DIR/src/compute/lyra/model.js"
grep -q "MODEL_ORIGIN = null" "$DIR/src/compute/vela/source.js"
grep -q "self-hosted mirror" "$DIR/src/compute/lyra/model.js"

# 원본은 모델 파일 무결성(SHA-256)을 스스로 검사한다 — 여기서도 미리 확인.
check_sha() {  # <경로> <기대 해시>
  local got
  got=$(sha256sum "$DIR/$1" | cut -d' ' -f1)
  [ "$got" = "$2" ] || { echo "SHA mismatch: $1"; exit 1; }
  echo "sha ok: $1"
}
check_sha public/models/vela-v4.2/model.bin.gz \
  "$(python3 -c "import json; print(json.load(open('$DIR/public/models/vela-v4.2/manifest.json'))['sha256'])")"
check_sha public/models/lyra-v1/lyra-v1.bin.gz \
  "$(grep -oE "PACKAGE_SHA256 = '[a-f0-9]{64}'" "$DIR/src/compute/lyra/model.js" | grep -oE '[a-f0-9]{64}')"

chmod -R a+rX "$DIR"
echo "mirror ready: $(git -C "$DIR" log -1 --format='%h %ad %s' --date=short)"
