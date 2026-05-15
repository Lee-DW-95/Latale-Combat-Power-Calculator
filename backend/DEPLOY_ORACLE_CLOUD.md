# Phase 3 — Oracle Cloud + DuckDNS + Caddy 배포 매뉴얼

`backend/` FastAPI 를 Oracle Cloud Always Free ARM VM 에 24/7 가동 + HTTPS 자동 발급(Let's Encrypt) + Vercel 프론트와 연결까지의 전체 절차서.

> 전제 — `stock_analyzer` 가 동일 VM 에 이미 systemd 로 가동 중이라고 가정. SSH 키 / VM IP / sudo 권한 / 기본 `apt` 환경은 이미 준비돼 있다는 전제.

---

## 0. 준비물 체크리스트

- [ ] Oracle Cloud Console 접근 권한
- [ ] VM 공인 IP (OCI Console → Compute → Instances → Public IP Address)
- [ ] SSH private key (`stock_analyzer` 배포 시 사용한 키)
- [ ] DuckDNS GitHub 로그인 완료 ✅
- [ ] GitHub 레포 `Lee-DW-95/Latale-Combat-Power-Calculator` 의 `backend/` 코드가 main 에 푸시된 상태
- [ ] Vercel 프로젝트 `latale-calculator` 관리 권한

---

## Step 1 — DuckDNS 서브도메인 발급 + IP 등록

**🌐 웹 작업** — https://www.duckdns.org/domains

1. domains 페이지에서 `domain` 입력란에 **`latale-api`** 입력 → **`add domain`** 클릭
2. 생성된 행의 **`current ip`** 칸에 Oracle VM 공인 IP 입력
3. 우측 **`update ip`** 클릭

발급된 호스트네임: **`latale-api.duckdns.org`**

해당 페이지의 **`token`** 값(상단)도 메모해 두면 좋음 — 자동 IP 갱신 스크립트(선택)에서 사용.

**검증** (Windows PowerShell — 로컬):
```powershell
nslookup latale-api.duckdns.org
# Address 가 Oracle VM 공인 IP 와 일치해야 함
```

전파에 1~2분 걸릴 수 있음.

---

## Step 2 — VM SSH 접속

```powershell
ssh -i <your-private-key.pem> ubuntu@<oracle-vm-public-ip>
```

이후 모든 명령은 **VM 안 ubuntu 계정** 기준.

---

## Step 3 — 백엔드 코드 배포 (git clone)

레포지토리 전체를 ubuntu 홈 디렉토리 `~/latale/` 로 클론 (`~/stock_analyzer` 와 같은 부모 — 일관성, sudo 불필요).

```bash
cd ~
git clone https://github.com/Lee-DW-95/Latale-Combat-Power-Calculator.git latale
cd latale/backend
ls
```

`requirements.txt`, `app/`, `README.md` 등이 보이면 성공.

---

## Step 4 — Python venv + 의존성 설치

```bash
# Python 3.10+ 확인 (Ubuntu 22.04 기본 3.10)
python3 --version

# venv 생성 + 활성화
python3 -m venv .venv
source .venv/bin/activate

# pip 업그레이드
pip install --upgrade pip

# 의존성 설치 (ARM 환경에선 1~3분 소요)
pip install -r requirements.txt
```

**검증:**
```bash
python -c "from app.main import app; print(app.title, app.version)"
# Latale Calculator API 0.1.0
```

---

## Step 5 — `.env` 설정

```bash
cp .env.example .env

# JWT 서명 키 생성 — 출력값 복사
python -c "import secrets; print(secrets.token_urlsafe(48))"

# .env 편집
nano .env
```

다음 4 줄을 본인 환경에 맞게 수정:

```env
DATABASE_URL=sqlite:///./latale.db
JWT_SECRET=<위_단계에서_생성한_긴_랜덤_문자열>
JWT_EXPIRE_SECONDS=604800
CORS_ORIGINS=https://latale-calculator.vercel.app
BCRYPT_ROUNDS=12
```

저장: `Ctrl + X` → `Y` → `Enter`

**검증** — 수동 실행으로 정상 기동 여부만 확인:
```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

다른 SSH 세션을 새로 열거나, 같은 VM 안에서:
```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

OK 확인 후 처음 SSH 창에서 `Ctrl + C` 로 중지.

---

## Step 6 — systemd 서비스 등록 (24/7 자동 가동)

```bash
sudo nano /etc/systemd/system/latale-api.service
```

내용:

```ini
[Unit]
Description=Latale Calculator API (FastAPI + uvicorn)
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/latale/backend
EnvironmentFile=/home/ubuntu/latale/backend/.env
ExecStart=/home/ubuntu/latale/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

> `--host 127.0.0.1` — 외부 직접 접근 차단. Caddy 가 reverse-proxy 한다.
> `--workers 1` — SQLite 단일 파일 + WAL 모드 전제. 동시성 더 필요해지면 Postgres 로 이전 후 늘릴 것.

활성화 + 시작:

```bash
sudo systemctl daemon-reload
sudo systemctl enable latale-api
sudo systemctl start latale-api
sudo systemctl status latale-api
```

상태가 **`active (running)`** 으로 보여야 정상.

**검증:**
```bash
curl http://localhost:8000/health
# {"status":"ok"}

# 로그 모니터링 (Ctrl+C 로 종료)
sudo journalctl -u latale-api -f
```

---

## Step 7 — Caddy 설치 + HTTPS 자동 발급

### 7.1 Caddy 설치 (Ubuntu)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

설치 직후 Caddy 가 자동으로 systemd 서비스로 등록 + 기동됨.

### 7.2 Caddyfile 작성

```bash
sudo nano /etc/caddy/Caddyfile
```

기본 내용 전부 지우고 아래로 교체 (또는 본인 도메인 블록만 추가):

```caddy
latale-api.duckdns.org {
    reverse_proxy localhost:8000
    encode gzip

    # CORS 는 FastAPI 가 처리 — 여기서 추가 헤더 불필요.
    # Caddy 가 자동으로 Let's Encrypt 인증서 발급/갱신.
}
```

저장 후:
```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

> **첫 SSL 발급은 30~60초** 소요. 발급 진행은 로그로 확인:
> ```bash
> sudo journalctl -u caddy -f
> ```
> `obtain certificate` → `certificate obtained successfully` 메시지가 보이면 완료.

---

## Step 8 — 방화벽 / OCI 보안 규칙

Caddy 가 정상 동작하려면 외부에서 80/443 이 열려 있어야 한다. Oracle Cloud 는 **2 단계 방화벽** 이라 둘 다 열어야 함.

### 8.1 OCI Security List (필수)

**🌐 웹 작업** — OCI Console.

1. **Networking** → **Virtual Cloud Networks** → 사용 중인 VCN 클릭
2. 좌측 메뉴 **Security Lists** → **Default Security List** 클릭
3. **Add Ingress Rules** 클릭, 다음 2 개 규칙 추가:

   | Source CIDR | IP Protocol | Source Port | Destination Port |
   |---|---|---|---|
   | `0.0.0.0/0` | TCP | (비움) | `80` |
   | `0.0.0.0/0` | TCP | (비움) | `443` |

   - 80 은 Let's Encrypt 갱신(HTTP-01 challenge) 용 — 필수
   - 443 은 실제 HTTPS

### 8.2 VM 내부 방화벽 (iptables/ufw)

Oracle Ubuntu 는 기본적으로 `iptables` 가 보수적으로 설정돼 있다.

```bash
# 현재 규칙 확인
sudo iptables -L INPUT --line-numbers

# 80, 443 허용 규칙이 없으면 추가 (REJECT 규칙 *위에* 삽입)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT

# 영구 저장
sudo netfilter-persistent save
```

> `-I INPUT 6` 의 숫자는 REJECT 규칙 위치에 따라 다름 — `iptables -L INPUT --line-numbers` 출력에서 `REJECT` 라인 *바로 위* 라인 번호 선택.

`ufw` 를 쓰는 환경이라면:
```bash
sudo ufw status
# active 상태면:
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 8.3 외부 접근 검증

**Windows PowerShell (로컬):**
```powershell
curl https://latale-api.duckdns.org/health
# {"status":"ok"}
```

브라우저로 https://latale-api.duckdns.org/docs 접속 → FastAPI Swagger UI 가 보이면 완벽.

**자물쇠 아이콘 + 정상 인증서** 확인 — Let's Encrypt 가 발급한 인증서가 보여야 함.

---

## Step 9 — Vercel 환경변수 설정 + 재배포

**🌐 웹 작업** — https://vercel.com/dashboard

1. **`latale-calculator`** 프로젝트 클릭
2. **Settings** → **Environment Variables**
3. **Add New** 클릭:
   - **Key**: `VITE_API_BASE`
   - **Value**: `https://latale-api.duckdns.org`
   - **Environment**: Production / Preview / Development **모두 체크**
4. **Save**

재배포:
- 좌측 **Deployments** → 최신 deployment 우측 **`...`** 메뉴 → **Redeploy**
- 또는 로컬에서 빈 커밋:
  ```powershell
  git commit --allow-empty -m "trigger redeploy with VITE_API_BASE"
  git push
  ```

빌드 완료 후 (1~2분), Vercel 의 빌드 로그에 `VITE_API_BASE` 가 정상 주입됐는지 확인 (`Environment variables loaded: VITE_API_BASE`).

---

## Step 10 — 통합 검증 (브라우저)

https://latale-calculator.vercel.app 접속.

### 시나리오 체크리스트
- [ ] 헤더 **"로그인"** 버튼 노출 (비로그인 상태)
- [ ] 클릭 → 모달 → **"회원가입"** 전환
- [ ] 닉네임/비번 입력 → 회원가입 → **복구코드 발급 화면**
- [ ] 메모 체크 → 시작하기 → 헤더에 `👤 닉네임`
- [ ] 캐릭터 1개 저장 → stats 변경 → 헤더에 `💾 저장됨 HH:MM`
- [ ] 새로고침 → 데이터 유지

### 브라우저 콘솔 (F12) 확인

| 에러 메시지 | 원인 | 해결 |
|---|---|---|
| `CORS … blocked` | CORS_ORIGINS 누락 | `.env` 의 `CORS_ORIGINS` 에 Vercel 도메인 추가 → `sudo systemctl restart latale-api` |
| `Mixed Content` | VITE_API_BASE 가 http:// | Vercel 환경변수를 `https://` 로 수정 후 재배포 |
| `Failed to fetch` / `ERR_CONNECTION_REFUSED` | Caddy 미가동 또는 포트 미개방 | `sudo systemctl status caddy` + Step 8 방화벽 재확인 |
| `404 Not Found` (백엔드 경로) | systemd 미가동 | `sudo systemctl status latale-api` |

---

## 트러블슈팅

### `sudo systemctl status latale-api` 가 `failed` 인 경우

```bash
sudo journalctl -u latale-api -n 50 --no-pager
```

흔한 원인:
- `.env` 의 JWT_SECRET 미설정 → pydantic-settings 에러
- venv 경로 오타 (`/home/ubuntu/latale/backend/.venv/bin/uvicorn`)
- 의존성 미설치 (`pip install -r requirements.txt` 다시)

### Caddy 가 인증서 발급 실패

```bash
sudo journalctl -u caddy -n 100 --no-pager
```

흔한 원인:
- 80 포트가 닫혀 있음 → Let's Encrypt 가 HTTP-01 challenge 수행 불가
- DNS A 레코드가 VM IP 와 일치 안 함 (DuckDNS update 누락)
- 같은 VM 에서 80 포트를 다른 프로세스가 점유 (예: nginx, apache2 미사용 종료)

```bash
sudo ss -tlnp | grep ':80'
# caddy 외 프로세스가 있으면 중지/제거
```

### `429 Too Many Requests`

slowapi rate limit (분당 5~10회) 에 걸린 상태. 1분 기다리거나 IP 단위로 제한이라 다른 네트워크에서 시도.

운영에서 제약이 너무 강하면 `backend/app/routers/auth.py` 의 `@limiter.limit("5/minute")` 값을 조정.

### SQLite 잠금 에러

WAL 모드라 거의 발생 안 하지만, 동시 PUT 폭주 시 `database is locked` 가능. uvicorn `--workers 1` 유지 + 클라이언트 debounce 2초로 회피 중.

---

## 일상 운영

### 코드 업데이트 배포

로컬에서 push 후:

```bash
ssh ubuntu@<vm-ip> 'cd /home/ubuntu/latale && git pull && cd backend && .venv/bin/pip install -r requirements.txt && sudo systemctl restart latale-api'
```

(의존성 변경이 없으면 `pip install` 생략 가능)

### 로그 모니터링

```bash
# 백엔드 실시간 로그
sudo journalctl -u latale-api -f

# Caddy 로그 (인증서 갱신 등)
sudo journalctl -u caddy -f

# 최근 100줄
sudo journalctl -u latale-api -n 100 --no-pager
```

### DB 백업

수동 즉시:
```bash
mkdir -p /home/ubuntu/latale/backend/backups
sqlite3 /home/ubuntu/latale/backend/latale.db ".backup /home/ubuntu/latale/backend/backups/latale-$(date +%Y%m%d).db"
```

cron 자동 (매일 03:00):
```bash
crontab -e
# 마지막 줄에 추가:
0 3 * * * sqlite3 /home/ubuntu/latale/backend/latale.db ".backup /home/ubuntu/latale/backend/backups/latale-$(date +\%Y\%m\%d).db" && find /home/ubuntu/latale/backend/backups -name 'latale-*.db' -mtime +30 -delete
```

30일 지난 백업은 자동 삭제.

### 백업 파일을 로컬로 복사

```powershell
# Windows 로컬에서
scp -i <your-key.pem> ubuntu@<vm-ip>:/home/ubuntu/latale/backend/backups/latale-YYYYMMDD.db .
```

### DuckDNS IP 자동 갱신 (선택)

Oracle ARM VM 은 IP 가 거의 안 바뀌지만, 만일을 대비해 cron 으로 IP 동기화:

```bash
mkdir -p ~/duckdns
nano ~/duckdns/duck.sh
```

내용 (`<TOKEN>` 은 https://www.duckdns.org/domains 상단의 token):
```bash
#!/bin/bash
echo url="https://www.duckdns.org/update?domains=latale-api&token=<TOKEN>&ip=" \
  | curl -k -o ~/duckdns/duck.log -K -
```

```bash
chmod 700 ~/duckdns/duck.sh
crontab -e
# 추가:
*/5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
```

---

## 부록 — 디렉토리/포트/서비스 요약

| 항목 | 값 |
|---|---|
| 백엔드 코드 | `/home/ubuntu/latale/backend/` |
| Python venv | `/home/ubuntu/latale/backend/.venv/` |
| SQLite DB | `/home/ubuntu/latale/backend/latale.db` |
| 백업 디렉토리 | `/home/ubuntu/latale/backend/backups/` |
| 환경변수 파일 | `/home/ubuntu/latale/backend/.env` |
| systemd 서비스 | `latale-api.service` |
| Caddyfile | `/etc/caddy/Caddyfile` |
| 내부 포트 | `127.0.0.1:8000` (uvicorn) |
| 외부 포트 | `443` (Caddy → 8000) |
| 외부 도메인 | `https://latale-api.duckdns.org` |
| 프론트 | `https://latale-calculator.vercel.app` |

---

## 부록 — 롤백 절차

문제 발생 시 신속 롤백:

```bash
# 직전 커밋으로 되돌리기
cd /home/ubuntu/latale
git log --oneline -5
git checkout <이전_커밋_해시>
sudo systemctl restart latale-api
```

또는 systemd 서비스만 일시 중지:
```bash
sudo systemctl stop latale-api
# 프론트는 백엔드 없이 비로그인 모드로 fallback (localStorage) 동작
```
