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
STATBL_INDEX_TS = "TT246323134644307"   # 소규모 상가 임대가격지수(시계열)
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


# ── 지역 경기 흐름 — 임대가격지수 시계열(2015~) ──────────────────────────
_IDX_CACHE = os.path.join(os.path.dirname(_CACHE_PATH), "rone_index_cache.json")
_idx_mem: dict = {}


def _fetch_index() -> dict | None:
    key = api_key()
    if not key:
        return None
    rows: list[dict] = []
    try:
        page = 1
        while page <= 12:
            r = httpx.get(BASE, params={
                "KEY": key, "Type": "json", "pIndex": page, "pSize": 1000,
                "STATBL_ID": STATBL_INDEX_TS, "DTACYCLE_CD": "QY"}, timeout=30)
            r.raise_for_status()
            body = r.json().get("SttsApiTblData")
            chunk = body[1].get("row", []) if body else []
            if not chunk:
                break
            rows += chunk
            page += 1
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return None
    series: dict[str, dict[str, float]] = {}
    for x in rows:
        full = x.get("CLS_FULLNM", "")
        if ">" in full:                      # 시도·전국 집계만
            continue
        v = x.get("DTA_VAL")
        if isinstance(v, (int, float)):
            series.setdefault(full, {})[x["WRTTIME_IDTFR_ID"]] = round(v, 2)
    if not series:
        return None
    quarters = sorted({q for s in series.values() for q in s})[-5:]
    regions = []
    for name, s in series.items():
        vals = [s.get(q) for q in quarters]
        yoy = None
        last_q = quarters[-1]
        prev_q = f"{int(last_q[:4]) - 1}{last_q[4:]}"
        if s.get(last_q) and s.get(prev_q):
            yoy = round((s[last_q] / s[prev_q] - 1) * 100, 2)
        regions.append({"name": name, "vals": vals, "yoy_pct": yoy})
    regions.sort(key=lambda r: (r["yoy_pct"] is None, -(r["yoy_pct"] or 0)))
    return {"quarters": [quarter_label(q) for q in quarters], "regions": regions}


def index_trend() -> dict | None:
    """시도별 소규모 상가 임대가격지수 — 최근 5분기와 전년동기 대비.

    임대가격지수는 그 지역 상권 경기의 체온계입니다. 오르는 동네는
    자리 경쟁이 붙고 있다는 뜻이고, 내리는 동네는 협상 여지가 있다는
    뜻입니다 — 해석은 화면에 이렇게만 적고 예측은 하지 않습니다.
    """
    now = time.time()
    with _lock:
        if _idx_mem.get("at", 0) > now - CACHE_TTL:
            return _idx_mem.get("data")
        try:
            with open(_IDX_CACHE, encoding="utf-8") as f:
                disk = json.load(f)
            if disk.get("at", 0) > now - CACHE_TTL:
                _idx_mem.update(disk)
                return disk.get("data")
        except (OSError, ValueError):
            pass
    data = _fetch_index()
    with _lock:
        _idx_mem.update({"at": now, "data": data})
        if data:
            try:
                with open(_IDX_CACHE, "w", encoding="utf-8") as f:
                    json.dump({"at": now, "data": data}, f, ensure_ascii=False)
            except OSError:
                pass
    return data
