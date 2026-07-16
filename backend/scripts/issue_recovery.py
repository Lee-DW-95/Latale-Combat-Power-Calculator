"""관리자용 복구코드 재발급 CLI.

비밀번호를 잊고 복구코드도 잃어버린 사용자를 위한 운영자 구제 수단.
비밀번호(pw_hash)는 건드리지 않는다 — 신규 복구코드만 발급하고,
사용자가 로그인 화면의 "비밀번호 복구" 플로우로 스스로 새 비밀번호를 설정한다.
(운영자가 사용자의 비밀번호를 아는 순간이 존재하지 않음)

사용법 (VM 에서):
    cd /home/ubuntu/latale/backend
    ../.venv/bin/python -m scripts.issue_recovery <닉네임>

⚠ 실행 전 반드시 본인 확인: 해당 계정에 저장된 캐릭터 이름/스탯 몇 개를
   물어봐서 실소유자인지 확인할 것 (닉네임 사칭 리셋 방지).
"""

import sys

# 패키지 루트(backend/)에서 `python -m scripts.issue_recovery` 로 실행되는 전제.
from app.auth import generate_recovery_code, hash_password
from app.db import SessionLocal
from app.models import Character, User


def main() -> int:
    if len(sys.argv) != 2:
        print("사용법: python -m scripts.issue_recovery <닉네임>")
        return 1

    nickname = sys.argv[1].strip()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.nickname == nickname).first()
        if user is None:
            print(f"✗ 닉네임 '{nickname}' 사용자를 찾을 수 없습니다.")
            return 1

        # 본인 확인용 참고 정보 — 사용자에게 물어봐서 대조.
        chars = db.query(Character).filter(Character.user_id == user.id).all()
        print(f"대상: id={user.id} nickname={user.nickname} 가입={user.created_at}")
        print(f"저장된 캐릭터 {len(chars)}개: {', '.join(c.name for c in chars) or '(없음)'}")

        answer = input("이 사용자에게 신규 복구코드를 발급할까요? [y/N] ").strip().lower()
        if answer != "y":
            print("취소했습니다.")
            return 0

        code = generate_recovery_code()
        user.recovery_hash = hash_password(code)
        db.commit()

        print("✓ 신규 복구코드 발급 완료 — 아래 코드를 사용자에게 전달하세요 (재조회 불가):")
        print(f"\n    {code}\n")
        print("사용자 안내: 로그인 창 → 비밀번호 복구 → 닉네임 + 이 코드 + 새 비밀번호 입력.")
        print("(복구 완료 시 새 복구코드가 자동 재발급되어 화면에 표시됩니다 — 다시 보관 안내)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
