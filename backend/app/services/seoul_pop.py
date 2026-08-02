"""서울 생활인구 — "유동인구는 자료에 없다"던 칸을 서울부터 채웁니다.

서울시가 KT 통신데이터로 만든 「행정동 단위 서울 생활인구(내국인)」입니다.
특정 시각에 그 동네에 실제로 '있는' 사람 수라, 상권에서 말하는 유동인구의
사실상 표준입니다. 행정동 단위라 우리 색인과 그대로 맞물립니다.

**점수에는 넣지 않습니다.** 서울에만 있는 값을 점수에 넣으면 부산·대구와의
비교가 깨집니다. 카드에 실측으로 표기만 합니다 — 일평균과 시간대 곡선.
시간대가 핵심입니다: 카페엔 오전이, 술집엔 저녁이 중요한데, 하루 곡선이
그 동네가 언제 사는 동네인지 말해 줍니다.

키: data.seoul.go.kr → 인증키 신청(즉시) → SEOUL_API_KEY 환경변수.
없으면 이 모듈 전체가 조용히 빠집니다.

데이터는 3~5일 늦게 올라오므로 5일 전 날짜를 조회하고, 결과는 하루 단위로
파일에 캐시합니다 — 같은 동네를 매 요청마다 서울시 서버에 물을 이유가
없습니다.
"""
from __future__ import annotations

import json
import os
import threading
import time
from datetime import date, timedelta

import httpx

BASE = "http://openapi.seoul.go.kr:8088"
SERVICE = "SPOP_LOCAL_RESD_DONG"     # 내국인 생활인구
LAG_DAYS = 5                          # 이만큼 전 날짜가 안전하게 존재합니다
CACHE_TTL = 60 * 60 * 24

_CACHE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "data", "seoul_pop_cache.json")
_lock = threading.Lock()
_mem: dict = {}


def api_key() -> str:
    return os.getenv("SEOUL_API_KEY", "").strip()


def available() -> bool:
    return bool(api_key())


def parse_rows(rows: list[dict]) -> dict | None:
    """시간대 24행을 하루 요약으로 접습니다.

    돌려주는 것 — 일평균, 최고 시간대(사람이 가장 많은 때), 24시간 곡선.
    곡선은 0~1로 눌러 화면이 미니 막대로 바로 그릴 수 있게 합니다.
    """
    by_hour: dict[int, float] = {}
    for r in rows:
        try:
            h = int(str(r.get("TMZON_PD_SE", "")).strip())
            v = float(r.get("TOT_LVPOP_CO", 0))
        except (TypeError, ValueError):
            continue
        if 0 <= h <= 23 and v > 0:
            by_hour[h] = v
    if len(by_hour) < 12:                 # 반나절도 없으면 신뢰 불가
        return None

    curve = [by_hour.get(h, 0.0) for h in range(24)]
    peak_h = max(by_hour, key=lambda h: by_hour[h])
    avg = sum(by_hour.values()) / len(by_hour)
    top = max(curve) or 1.0
    return {
        "avg": round(avg),
        "peak_hour": peak_h,
        "peak": round(by_hour[peak_h]),
        "curve": [round(v / top, 3) for v in curve],
        "date": None,                     # 채워서 내보냄
        "source": "서울시 「행정동 단위 서울 생활인구(내국인)」 · KT 통신데이터",
    }


async def living_pop(dong_code: str) -> dict | None:
    """행정동 하나의 생활인구 요약. 서울 밖·키 없음·실패 → None."""
    if not available() or not dong_code.startswith("11"):
        return None

    day = (date.today() - timedelta(days=LAG_DAYS)).strftime("%Y%m%d")
    ck = f"{dong_code}:{day}"
    now = time.time()

    with _lock:
        if not _mem:
            try:
                with open(_CACHE, encoding="utf-8") as f:
                    _mem.update(json.load(f))
            except (OSError, ValueError):
                pass
        hit = _mem.get(ck)
        if hit and hit.get("at", 0) > now - CACHE_TTL:
            return hit.get("data")

    out = None
    try:
        # 서울 API의 위치 인자: /시작/끝/날짜/시간대/행정동코드.
        # 시간대를 비우고 하루 전체(24행)를 받습니다.
        url = f"{BASE}/{api_key()}/json/{SERVICE}/1/30/{day}/%20/{dong_code}"
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
            r.raise_for_status()
            body = r.json().get(SERVICE, {})
            rows = body.get("row", [])
        out = parse_rows(rows)
        if out:
            out["date"] = day
    except (httpx.HTTPError, ValueError, KeyError):
        out = None

    with _lock:
        _mem[ck] = {"at": now, "data": out}
        try:
            with open(_CACHE, "w", encoding="utf-8") as f:
                json.dump(_mem, f, ensure_ascii=False)
        except OSError:
            pass
    return out
