"""금융감독원 「금융상품 한눈에」 — 은행권 대출 공시 금리.

정책자금이 융자·보증·이차보전이면 결국 은행 창구에서 실행됩니다. 그 자리에
"은행권 공시 금리가 지금 얼마쯤인가"를 함께 놓으면 사장님이 조건을 가늠할
수 있습니다. 공시는 금융사가 금감원에 신고한 값이라 우리가 지어낼 여지가
없습니다.

**정직하게 쓸 것 두 가지.**

  · 이 API에는 '소상공인 사업자대출' 카테고리가 없습니다. 개인신용·주담대·
    전세 위주입니다. 그래서 화면에는 반드시 "참고용 개인신용대출 공시 —
    사업자대출 조건과 다릅니다"라고 붙습니다.
  · 키가 없으면 이 카드는 조용히 빠집니다. 키를 기다리며 다른 화면이
    멈추면 안 됩니다.

발급: finlife.fss.or.kr → Open API 신청 → FINLIFE_API_KEY 환경변수.

캐시는 하루입니다. 공시는 월 단위로 갱신되므로 매 요청마다 부를 이유가
없고, 금감원 서버를 우리 트래픽으로 두드릴 이유는 더 없습니다.
"""
from __future__ import annotations

import json
import os
import threading
import time

import httpx

BASE = "https://finlife.fss.or.kr/finlifeapi"
# 020000 = 은행권. 저축은행은 030300.
BANK_GROUP = "020000"
CACHE_TTL = 60 * 60 * 24

_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                           "data", "finlife_cache.json")
_lock = threading.Lock()
_mem: dict = {}


def api_key() -> str:
    return os.getenv("FINLIFE_API_KEY", "").strip()


def available() -> bool:
    return bool(api_key())


async def _fetch_credit_loans() -> list[dict] | None:
    """개인신용대출 공시 전 페이지. 실패하면 None — 카드가 빠질 뿐입니다."""
    key = api_key()
    if not key:
        return None
    rows: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            page = 1
            while page <= 5:                       # 은행권은 보통 2~3쪽입니다
                r = await client.get(f"{BASE}/creditLoanProductsSearch.json", params={
                    "auth": key, "topFinGrpNo": BANK_GROUP, "pageNo": page})
                r.raise_for_status()
                body = r.json().get("result", {})
                base = {b["fin_co_no"]: b["kor_co_nm"]
                        for b in body.get("baseList", [])}
                for o in body.get("optionList", []):
                    # 유형 A(대출금리)만 — 기준금리·가산금리·가감조정금리를
                    # 섞어 최솟값을 취하면 우대조정치(0.x%)가 '평균 금리'처럼
                    # 나갑니다. 실키 연결 첫날 검증에서 잡은 버그입니다.
                    if o.get("crdt_lend_rate_type") != "A":
                        continue
                    rows.append({
                        "bank": base.get(o.get("fin_co_no"), ""),
                        "type": o.get("crdt_lend_rate_type_nm", ""),
                        # 신용점수 900점 초과 구간·평균 금리(%)
                        "rate_900": _f(o.get("crdt_grad_1")),
                        "rate_avg": _f(o.get("crdt_grad_avg")),
                    })
                if page >= int(body.get("max_page_no", 1)):
                    break
                page += 1
    except (httpx.HTTPError, ValueError, KeyError):
        return None
    return rows or None


def _f(v) -> float | None:
    try:
        x = float(v)
        return x if 0 < x < 30 else None
    except (TypeError, ValueError):
        return None


def summarize(rows: list[dict]) -> dict:
    """은행별로 접습니다 — 화면이 그릴 수 있는 크기로.

    한 은행이 금리 유형(대출·당좌 등)별로 여러 줄을 갖습니다. 은행마다
    평균 금리의 최솟값(가장 유리한 유형)을 쓰고, KB국민은행은 따로
    표시합니다 — KB 대회이고, 실행 창구로 안내하는 흐름이기 때문입니다.
    """
    by_bank: dict[str, list[float]] = {}
    for r in rows:
        if r["rate_avg"] is not None and r["bank"]:
            by_bank.setdefault(r["bank"], []).append(r["rate_avg"])

    banks = sorted(
        ({"bank": b, "rate_avg": round(min(v), 2)} for b, v in by_bank.items()),
        key=lambda x: x["rate_avg"])
    kb = next((b for b in banks if "국민" in b["bank"]), None)
    rates = [b["rate_avg"] for b in banks]
    return {
        "banks": banks[:8],
        "kb": kb,
        "low": min(rates) if rates else None,
        "high": max(rates) if rates else None,
        "n_banks": len(banks),
        "note": ("금융감독원 「금융상품 한눈에」 은행권 개인신용대출 공시(평균 금리, "
                 "은행별 최저 유형)입니다. 참고용이며 사업자대출 조건과 다릅니다."),
    }


async def bank_rates() -> dict | None:
    """카드에 실을 요약. 키가 없거나 실패하면 None — 카드가 빠집니다."""
    if not available():
        return None

    now = time.time()
    with _lock:
        if _mem.get("at", 0) > now - CACHE_TTL:
            return _mem.get("data")
        # 파일 캐시 — 재기동해도 하루 안이면 다시 안 부릅니다.
        try:
            with open(_CACHE_PATH, encoding="utf-8") as f:
                disk = json.load(f)
            if disk.get("at", 0) > now - CACHE_TTL:
                _mem.update(disk)
                return disk.get("data")
        except (OSError, ValueError):
            pass

    rows = await _fetch_credit_loans()
    data = summarize(rows) if rows else None
    with _lock:
        _mem.update(at=now, data=data)
        try:
            with open(_CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump({"at": now, "data": data}, f, ensure_ascii=False)
        except OSError:
            pass
    return data
