"""한국부동산원 R-ONE — 소규모 상가 임대료 (상업용부동산 임대동향조사).

"임대료는 자료가 없어 점수에 넣지 않았습니다"라고 적어 온 칸을 실측
공시로 일부 채웁니다. 단, 이 조사는 행정동이 아니라 부동산원이 정한
'조사 상권' 단위(전국 276곳)입니다 — 그래서 점수에는 여전히 넣지 않고,
같은 시도의 상권별 참고값으로만 보여줍니다. 단위: 천원/㎡(월세 환산).

발급: r-one.co.kr → 공개API → 인증키. RONE_API_KEY 환경변수.
표: 임대동향 지역별 임대료(2024년3분기~)_소규모 상가(T248223134698125)
— 소상공인 점포에 가장 가까운 유형입니다. 캐시 1일(분기 통계).
"""
from __future__ import annotations

import json
import os
import threading
import time

import httpx

BASE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
STATBL_SMALL_SHOP = "T248223134698125"
CACHE_TTL = 86400
_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "data", "rone_cache.json")
_mem: dict = {}
_lock = threading.Lock()

# 상권 자료의 시도 표기(짧은 이름)로 잇습니다. LocationScore.region_name의
# 첫 토큰은 특별시·광역시만 떼어낸 형태라 도(道)들은 여기서 줄입니다.
_SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
    "강원특별자치도": "강원", "강원도": "강원",
    "충청북도": "충북", "충청남도": "충남",
    "전북특별자치도": "전북", "전라북도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
}


def api_key() -> str:
    return os.getenv("RONE_API_KEY", "").strip()


def available() -> bool:
    return bool(api_key())


def sido_short(name: str) -> str:
    """'경상북도 경산시 동부동' → '경북', '서울 마포구 연남동' → '서울'."""
    head = (name or "").split()[0] if name else ""
    return _SIDO_SHORT.get(head, head[:2] if head else "")


def quarter_label(code: str) -> str:
    """'202602' → '2026년 2분기'."""
    return f"{code[:4]}년 {int(code[4:]):d}분기" if len(code) == 6 else code


def _fetch() -> dict | None:
    key = api_key()
    if not key:
        return None
    rows: list[dict] = []
    try:
        for page in (1, 2, 3):
            r = httpx.get(BASE, params={
                "KEY": key, "Type": "json", "pIndex": page, "pSize": 1000,
                "STATBL_ID": STATBL_SMALL_SHOP, "DTACYCLE_CD": "QY",
            }, timeout=30)
            r.raise_for_status()
            body = r.json().get("SttsApiTblData")
            if not body:
                return None
            chunk = body[1].get("row", [])
            rows += chunk
            if len(chunk) < 1000:
                break
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return None
    if not rows:
        return None

    latest = max(x["WRTTIME_IDTFR_ID"] for x in rows)
    lat = [x for x in rows if x["WRTTIME_IDTFR_ID"] == latest]
    sido: dict[str, float] = {}
    districts: dict[str, list[dict]] = {}
    national = None
    for x in lat:
        full = x.get("CLS_FULLNM", "")
        val = x.get("DTA_VAL")
        if not full or not isinstance(val, (int, float)):
            continue
        if full == "전국":
            national = round(val, 1)
        elif ">" not in full:
            sido[full] = round(val, 1)
        else:
            top = full.split(">")[0]
            districts.setdefault(top, []).append(
                {"name": full.split(">", 1)[1].replace(">", " · "),
                 "rent": round(val, 1)})
    for v in districts.values():
        v.sort(key=lambda d: -d["rent"])
    return {"quarter": quarter_label(latest), "national": national,
            "sido": sido, "districts": districts}


def _data() -> dict | None:
    now = time.time()
    with _lock:
        if _mem.get("at", 0) > now - CACHE_TTL:
            return _mem.get("data")
        try:
            with open(_CACHE_PATH, encoding="utf-8") as f:
                disk = json.load(f)
            if disk.get("at", 0) > now - CACHE_TTL:
                _mem.update(disk)
                return disk.get("data")
        except (OSError, ValueError):
            pass
    data = _fetch()
    with _lock:
        _mem.update({"at": now, "data": data})
        if data:
            try:
                with open(_CACHE_PATH, "w", encoding="utf-8") as f:
                    json.dump({"at": now, "data": data}, f, ensure_ascii=False)
            except OSError:
                pass
    return data


def rent_for(region_name: str) -> dict | None:
    """그 동네가 속한 시도의 소규모 상가 임대료 참고값. 없으면 None."""
    d = _data()
    if not d:
        return None
    s = sido_short(region_name)
    if s not in d["sido"]:
        return None
    rows = d["districts"].get(s, [])
    return {
        "quarter": d["quarter"], "unit": "천원/㎡",
        "sido": s, "sido_rent": d["sido"][s], "national": d["national"],
        "districts": rows[:5],
        "note": (f"한국부동산원 상업용부동산 임대동향조사({d['quarter']}) 소규모 "
                 "상가 공시입니다. 행정동이 아니라 조사 상권 단위의 참고값이라 "
                 "점수에는 넣지 않았습니다."),
    }
