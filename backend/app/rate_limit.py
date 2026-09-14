import warnings

from slowapi import Limiter
from slowapi.util import get_remote_address


# 단일 limiter 인스턴스 — main.py 에서 app.state 에 등록하고 라우터에서 import.
# slowapi 는 기본으로 cwd 의 .env 를 로케일 인코딩으로 읽는데(RATELIMIT_* 설정용 — 이 프로젝트는 안 씀),
# Windows(cp949) 에서 한국어 주석이 든 .env 를 만나면 import 자체가 깨진다. 파일을 읽지 않게 빈 경로를 준다.
with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # starlette Config 의 "Config file '' not found" 경고 무시
    limiter = Limiter(key_func=get_remote_address, config_filename="")
