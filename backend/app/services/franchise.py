"""공정거래위원회 가맹사업 통계 — 브랜드 실측 조회.

프랜차이즈 창업 상담에서 가장 필요한 숫자는 광고가 아니라 공시입니다:
이 브랜드 가맹점이 몇 개인지, 1년 새 몇 곳이 문 열고 몇 곳이 계약을
접었는지, 가맹점 연평균 매출이 얼마인지 — 전부 정보공개서 기반으로
공정위에 신고된 값입니다(FftcBrandFrcsStatsService).

브랜드명 서버 필터가 없어 최신 연도 전체(약 1.2만 브랜드)를 하루 캐시로
받아 로컬에서 찾습니다. 키: DATA_GO_KR_API_KEY(공공데이터포털, 디코딩).
평균매출(avrgSlsAmt) 단위는 공시 기준 천원입니다.
"""
from __future__ import annotations

import json
import os
import threading
import time

import httpx

BASE = ("https://apis.data.go.kr/1130000/"
        "FftcBrandFrcsStatsService/getBrandFrcsStats")
CACHE_TTL = 86400
_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "data", "franchise_cache.json")
_mem: dict = {}
_trend_mem: dict = {}
_lock = threading.Lock()


def api_key() -> str:
    return os.getenv("DATA_GO_KR_API_KEY", "").strip()


def available() -> bool:
    return bool(api_key())


def _fetch_year(yr: str) -> list[dict] | None:
    """한 해치 전체 브랜드 통계. 실패하면 None."""
    key = api_key()
    if not key:
        return None
    rows: list[dict] = []
    try:
        r = httpx.get(BASE, params={
            "serviceKey": key, "pageNo": 1, "numOfRows": 1,
            "resultType": "json", "yr": yr}, timeout=20)
        r.raise_for_status()
        total = int(r.json().get("totalCount") or 0)
        if total == 0:
            return None
        page = 1
        while len(rows) < total and page <= 15:
            r = httpx.get(BASE, params={
                "serviceKey": key, "pageNo": page, "numOfRows": 1000,
                "resultType": "json", "yr": yr}, timeout=30)
            r.raise_for_status()
            chunk = r.json().get("items", [])
            if not chunk:
                break
            rows += chunk
            page += 1
    except (httpx.HTTPError, ValueError, KeyError):
        return None
    return rows or None


def _fetch() -> dict | None:
    key = api_key()
    if not key:
        return None
    rows: list[dict] = []
    yr_used = None
    try:
        for yr in [str(time.gmtime().tm_year), str(time.gmtime().tm_year - 1)]:
            r = httpx.get(BASE, params={
                "serviceKey": key, "pageNo": 1, "numOfRows": 1,
                "resultType": "json", "yr": yr}, timeout=20)
            r.raise_for_status()
            total = int(r.json().get("totalCount") or 0)
            if total > 0:
                yr_used = yr
                break
        if not yr_used:
            return None
        page = 1
        while len(rows) < total and page <= 15:
            r = httpx.get(BASE, params={
                "serviceKey": key, "pageNo": page, "numOfRows": 1000,
                "resultType": "json", "yr": yr_used}, timeout=30)
            r.raise_for_status()
            chunk = r.json().get("items", [])
            if not chunk:
                break
            rows += chunk
            page += 1
    except (httpx.HTTPError, ValueError, KeyError):
        return None
    if not rows:
        return None
    return {"yr": yr_used, "rows": rows}


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


def _norm(s: str) -> str:
    return "".join((s or "").lower().split())


def search(brand: str, k: int = 5) -> dict:
    """브랜드명 부분 일치 검색 — 공시 그대로, 요약 가공만."""
    if not available():
        return {"ok": False, "reason": "공정위 가맹 통계 키가 아직 연결되지 않았습니다"}
    q = _norm(brand)
    if len(q) < 2:
        return {"ok": False, "reason": "브랜드 이름을 두 글자 이상 넣어 주세요"}
    d = _data()
    if not d:
        return {"ok": False, "reason": "공정위 가맹 통계를 지금 불러오지 못했습니다"}

    def chunks(s: str) -> list[str]:
        return [s[i:i + 2] for i in range(0, len(s) - 1, 2)] or [s]

    def match(nm: str) -> bool:
        if q in nm or nm in q:
            return True
        # '메가커피'는 공시명이 '메가엠지씨커피'입니다 — 두 글자 토막이
        # 전부 들어 있으면 같은 브랜드로 봅니다(부르는 이름과 공시명의 차이).
        return len(q) >= 4 and all(c in nm for c in chunks(q))

    hits = []
    for r in d["rows"]:
        nm = _norm(r.get("brandNm", ""))
        if match(nm):
            closed = int(r.get("ctrtEndCnt") or 0) + int(r.get("ctrtCncltnCnt") or 0)
            hits.append({
            "brand": r.get("brandNm"), "corp": r.get("corpNm"),
            "industry": f"{r.get('indutyLclasNm','')}·{r.get('indutyMlsfcNm','')}",
            "stores": int(r.get("frcsCnt") or 0),
            "opened": int(r.get("newFrcsRgsCnt") or 0),
            "closed": closed,
            "avg_sales_krw": int(r.get("avrgSlsAmt") or 0) * 1000,
            })
    hits.sort(key=lambda x: -x["stores"])
    return {"ok": True, "yr": d["yr"], "items": hits[:k],
            "note": (f"공정거래위원회 가맹사업 통계({d['yr']}년, 정보공개서 기반 "
                     "공시)입니다. '닫은 가맹점'은 계약 종료+해지 합계이며, "
                     "평균매출은 가맹점 연평균(공시 단위 환산)입니다.")}


def industry_trend(k: int = 6) -> dict:
    """업종별 창업 흐름 — 최신 연도와 전년의 가맹점 수를 공시로 비교.

    '요즘 무엇이 뜨나'를 감(感)이 아니라 정보공개서 합계로 봅니다.
    브랜드 1.2만 개를 중분류 업종으로 접어, 가맹점 수가 는 업종과 준
    업종을 나란히 놓습니다. 개점·폐점(계약 종료+해지)도 함께.
    """
    if not available():
        return {"ok": False, "reason": "공정위 가맹 통계 키가 아직 연결되지 않았습니다"}
    d = _data()
    if not d:
        return {"ok": False, "reason": "공정위 가맹 통계를 지금 불러오지 못했습니다"}
    now_t = time.time()
    with _lock:
        if _trend_mem.get("at", 0) > now_t - CACHE_TTL:
            return _trend_mem["data"]
    prev_yr = str(int(d["yr"]) - 1)
    prev = _fetch_year(prev_yr)
    if not prev:
        return {"ok": False, "reason": f"{prev_yr}년 공시를 불러오지 못했습니다"}

    def agg(rows):
        out: dict[str, dict] = {}
        for r in rows:
            ind = f"{r.get('indutyLclasNm','')}·{r.get('indutyMlsfcNm','')}"
            o = out.setdefault(ind, {"stores": 0, "opened": 0, "closed": 0,
                                     "brands": 0})
            o["stores"] += int(r.get("frcsCnt") or 0)
            o["opened"] += int(r.get("newFrcsRgsCnt") or 0)
            o["closed"] += (int(r.get("ctrtEndCnt") or 0)
                            + int(r.get("ctrtCncltnCnt") or 0))
            o["brands"] += 1
        return out

    now, before = agg(d["rows"]), agg(prev)
    items = []
    for ind, o in now.items():
        b = before.get(ind, {}).get("stores", 0)
        if o["stores"] < 300 and b < 300:      # 표본이 너무 작은 업종 제외
            continue
        items.append({"industry": ind, "stores": o["stores"],
                      "delta": o["stores"] - b,
                      "pct": round((o["stores"] / b - 1) * 100, 1) if b else None,
                      "opened": o["opened"], "closed": o["closed"],
                      "brands": o["brands"]})
    # 1년 새 ±80%가 넘는 급변은 분류 개편(브랜드 이동)일 가능성이 높아
    # 트렌드로 읽으면 오독입니다 — 제외하고 그 사실을 각주에 남깁니다.
    items = [x for x in items if x["pct"] is not None and abs(x["pct"]) <= 65]
    items.sort(key=lambda x: -(x["delta"]))
    result = {"ok": True, "yr": d["yr"], "prev_yr": prev_yr,
            "rising": items[:k],
            "falling": sorted(items, key=lambda x: x["delta"])[:k],
            "note": (f"공정거래위원회 가맹사업 통계 — {prev_yr}→{d['yr']}년 "
                     "정보공개서 기반 가맹점 수 증감입니다. 가맹(프랜차이즈) "
                     "시장 기준이며 독립 점포는 없습니다. 1년 새 ±65%를 넘는 "
                     "급변 업종은 분류 개편 가능성이 있어 뺐습니다.")}
    with _lock:
        _trend_mem.update({"at": now_t, "data": result})
    return result
