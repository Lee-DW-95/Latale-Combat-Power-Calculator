"""일일 DB 백업끼리 비교해 character_history 를 과거로 채운다 (source='backup').

이력 기능(2026-11-10) 이전의 변경은 기록이 없으므로, backups/latale-YYYYmmdd-HHMM.db.gz 를 시간순으로
두 개씩 비교해 하루 단위 변경을 만든다. 하루 안의 중간 변경은 빠지고 그날 최종 결과만 남는다.

  시각: 캐릭터 updated_at 이 두 백업 사이에 있으면 그 값(=그 구간의 마지막 저장 시각), 아니면 뒤 백업 시각.
  생성: 뒤 백업에만 있는 (id, user_id) → 스냅샷 / 삭제: 앞 백업에만 있는 것 → 앞 스냅샷.
  지금 users 에 없는 user_id(탈퇴) 는 건너뛴다.

적용 시 기존 행(live)을 지웠다가 복원분 뒤에 다시 넣어 id 순서 = 시간 순서를 유지한다.
이미 넣은 source='backup' 행은 지우고 다시 만든다 (재실행 안전).

  python -m scripts.backfill_history --db latale.db --backups backups \
      --final /home/ubuntu/latale-pre-history.db --final-time "2026-11-10 13:15"      # 미리보기
  ... --apply                                                                         # 실제 기록
"""

import argparse
import gzip
import json
import re
import shutil
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.history import TRACKED_FIELDS, diff

KST = timezone(timedelta(hours=9))
JSON_FIELDS = {
    "stats": {}, "awak_stones": [], "memorials": [], "runeword": [],
    "skill_configs": {}, "relics": {}, "damage_settings": {},
}


def _parse_db_time(s: str | None) -> datetime | None:
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace(" ", "T"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def load_characters(path: Path) -> dict[tuple[int, int], dict]:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    cols = {r["name"] for r in con.execute("PRAGMA table_info(characters)")}
    out = {}
    for row in con.execute("SELECT * FROM characters"):
        snap = {}
        for f in TRACKED_FIELDS:
            if f not in cols:
                snap[f] = JSON_FIELDS.get(f)
            elif f in JSON_FIELDS:
                snap[f] = json.loads(row[f]) if row[f] else JSON_FIELDS[f]
            else:
                snap[f] = row[f]
        out[(row["id"], row["user_id"])] = {"snap": snap, "updated_at": _parse_db_time(row["updated_at"])}
    con.close()
    return out


def list_snapshots(backups: Path, final: Path | None, final_time: str | None, tmp: Path):
    snaps = []
    for gz in sorted(backups.glob("latale-*.db.gz")):
        m = re.match(r"latale-(\d{8})-(\d{4})\.db\.gz$", gz.name)
        if not m:
            continue
        at = datetime.strptime(m[1] + m[2], "%Y%m%d%H%M").replace(tzinfo=KST)
        dst = tmp / gz.name[:-3]
        with gzip.open(gz, "rb") as src, open(dst, "wb") as out:
            shutil.copyfileobj(src, out)
        snaps.append((at, dst))
    if final:
        at = datetime.strptime(final_time, "%Y-%m-%d %H:%M").replace(tzinfo=KST)
        snaps.append((at, final))
    return sorted(snaps)


def build_records(snaps, valid_users: set[int]) -> list[dict]:
    records = []
    prev_at, prev = snaps[0][0], load_characters(snaps[0][1])
    for at, path in snaps[1:]:
        cur = load_characters(path)

        def when(c):
            u = c["updated_at"]
            return u if u and prev_at < u <= at else at

        for key, c in cur.items():
            if key[1] not in valid_users:
                continue
            if key not in prev:
                records.append(dict(key=key, action="create", name=c["snap"]["name"], at=when(c), changes=c["snap"]))
            else:
                changes = diff(prev[key]["snap"], c["snap"])
                if changes:
                    records.append(dict(key=key, action="update", name=c["snap"]["name"], at=when(c), changes=changes))
        for key, p in prev.items():
            if key not in cur and key[1] in valid_users:
                records.append(dict(key=key, action="delete", name=p["snap"]["name"], at=at, changes=p["snap"]))
        prev_at, prev = at, cur
    records.sort(key=lambda r: r["at"])
    return records


def _db_time(dt: datetime) -> str:
    # SQLAlchemy 가 SQLite 에 쓰는 형식과 같게 — tz 없는 UTC.
    return dt.astimezone(timezone.utc).replace(tzinfo=None).isoformat(sep=" ")


def apply(db: Path, records: list[dict]) -> None:
    con = sqlite3.connect(db)
    con.row_factory = sqlite3.Row
    with con:
        live = [dict(r) for r in con.execute(
            "SELECT * FROM character_history WHERE source != 'backup' ORDER BY id")]
        con.execute("DELETE FROM character_history")
        for r in records:
            con.execute(
                "INSERT INTO character_history (character_id, user_id, character_name, action, changes, created_at, source)"
                " VALUES (?, ?, ?, ?, ?, ?, 'backup')",
                (r["key"][0], r["key"][1], r["name"], r["action"],
                 json.dumps(r["changes"], ensure_ascii=False), _db_time(r["at"])),
            )
        for r in live:
            con.execute(
                "INSERT INTO character_history (character_id, user_id, character_name, action, changes, created_at, source)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (r["character_id"], r["user_id"], r["character_name"], r["action"], r["changes"], r["created_at"], r["source"]),
            )
    con.close()
    print(f"기록함: 복원 {len(records)}건 + 기존 실시간 {len(live)}건 재삽입")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, required=True)
    ap.add_argument("--backups", type=Path, required=True)
    ap.add_argument("--since", help="이 날짜(YYYYMMDD) 이후 백업만 — 기본은 전부")
    ap.add_argument("--final", type=Path, help="이력 기능 시작 직전 스냅샷 (마지막 비교 대상)")
    ap.add_argument("--final-time", help="--final 의 시각, KST 'YYYY-MM-DD HH:MM'")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as td:
        snaps = list_snapshots(args.backups, args.final, args.final_time, Path(td))
        if args.since:
            since = datetime.strptime(args.since, "%Y%m%d").replace(tzinfo=KST)
            snaps = [s for s in snaps if s[0] >= since]
        con = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
        users = {r[0] for r in con.execute("SELECT id FROM users")}
        con.close()
        records = build_records(snaps, users)

    print(f"스냅샷 {len(snaps)}개: {snaps[0][0]:%m-%d %H:%M} ~ {snaps[-1][0]:%m-%d %H:%M} (KST)")
    by = {}
    for r in records:
        by[r["action"]] = by.get(r["action"], 0) + 1
    print(f"복원 기록 {len(records)}건 {by}")
    for r in records[-8:]:
        print(f"  {r['at'].astimezone(KST):%m-%d %H:%M} {r['action']:6} {r['name']}  {list(r['changes'])[:5]}")
    if args.apply:
        apply(args.db, records)
    else:
        print("(미리보기 — --apply 로 실제 기록)")


if __name__ == "__main__":
    main()
