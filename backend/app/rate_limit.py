from slowapi import Limiter
from slowapi.util import get_remote_address


# 단일 limiter 인스턴스 — main.py 에서 app.state 에 등록하고 라우터에서 import.
limiter = Limiter(key_func=get_remote_address)
