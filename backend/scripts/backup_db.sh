#!/bin/bash
# latale.db 일일 백업 스크립트 (운영 VM: /home/ubuntu/latale/backend/scripts/backup_db.sh)
#
# - DB 는 SQLite WAL 모드라 파일 복사로는 -wal 에 쌓인 변경이 빠진다.
#   python3 sqlite3 의 backup() API 로 일관된 스냅샷을 뜬다 (서비스 중단 없음).
# - 산출물: backups/latale-YYYYmmdd-HHMM.db.gz
# - 30일 지난 .db.gz 는 삭제.
# - 어느 단계든 실패하면 non-zero exit (cron 로그에서 확인).
#
# cron 등록 (서버 시간대 Asia/Seoul, 매일 03:00):
#   0 3 * * * /home/ubuntu/latale/backend/scripts/backup_db.sh >> /home/ubuntu/latale/backend/backups/backup.log 2>&1

set -euo pipefail

BASE_DIR="${LATALE_BACKEND_DIR:-/home/ubuntu/latale/backend}"
DB_PATH="${BASE_DIR}/latale.db"
BACKUP_DIR="${BASE_DIR}/backups"
KEEP_DAYS=30

STAMP="$(date +%Y%m%d-%H%M)"
OUT="${BACKUP_DIR}/latale-${STAMP}.db"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [ ! -f "$DB_PATH" ]; then
  log "ERROR: DB 파일 없음: $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# 1) sqlite3 backup API 로 스냅샷 (읽기 전용으로 열어 원본에 쓰기 없음)
if ! python3 - "$DB_PATH" "$OUT" <<'PY'
import sqlite3, sys
src_path, dst_path = sys.argv[1], sys.argv[2]
src = sqlite3.connect(f"file:{src_path}?mode=ro", uri=True)
dst = sqlite3.connect(dst_path)
with dst:
    src.backup(dst)
dst.close()
src.close()
PY
then
  log "ERROR: backup() 실패: $OUT"
  rm -f "$OUT"
  exit 1
fi

# 2) 백업본 무결성 확인
if ! python3 - "$OUT" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
ok = con.execute("PRAGMA integrity_check").fetchone()[0]
con.close()
sys.exit(0 if ok == "ok" else 1)
PY
then
  log "ERROR: integrity_check 실패: $OUT"
  rm -f "$OUT"
  exit 1
fi

# 3) gzip (원본 .db 는 제거되고 .db.gz 만 남음)
gzip -f "$OUT"
log "OK: ${OUT}.gz ($(du -h "${OUT}.gz" | cut -f1))"

# 4) 30일 지난 백업 정리
find "$BACKUP_DIR" -maxdepth 1 -name 'latale-*.db.gz' -type f -mtime +"$KEEP_DAYS" -print -delete \
  | sed 's/^/[cleanup] deleted: /' || true

exit 0
