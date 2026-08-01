"""Pick 3 — 정책자금·지원사업 찾기

중소벤처기업부 기업마당에서 받아 둔 **실제 공고 900건**에서 찾습니다.
검색은 `services/policy_search.py`가 하고, 이 파일은 그 결과를 화면 계약
(PolicyMatch)에 맞춰 옮기는 일만 합니다.

전에는 손으로 적은 열두 건에 낱말이 들어 있는지 보는 방식이었습니다.
데모로는 돌아갔지만 "이 목록은 어디서 왔습니까"에 답할 것이 없었고, 사장님이
실제로 신청할 수 있는 공고도 아니었습니다. 지금은 공고 번호와 원문 주소가
결과마다 함께 나갑니다.

추천 이유는 계속 내보냅니다. 유사도 0.87은 근거가 못 됩니다. 어느 낱말이
걸렸는지, 지역이 맞는지, 언제까지 접수하는지 — 사람이 읽고 판단할 수 있는
것만 이유로 씁니다.
"""
from __future__ import annotations

from app.models.schemas import PolicyMatch
from app.services import policy_search


def _to_match(d: dict) -> PolicyMatch:
    return PolicyMatch(
        program_id=d["id"],
        name=d["title"],
        provider=d.get("agency") or d.get("ministry") or "기업마당",
        category=d.get("category", "기타"),
        limit_krw=d.get("amount_krw"),
        amount_basis=d.get("amount_basis"),
        rate_pct=d.get("rate_pct"),
        regions=d.get("regions", []),
        apply_period=d.get("apply_period_text", ""),
        apply_deadline=d.get("apply_end"),
        open_status=d.get("open_status", "unknown"),
        summary=(d.get("summary") or "")[:400],
        match_score=d.get("match_score", 0.0),
        match_reasons=d.get("match_reasons", []),
        apply_url=d.get("apply_site") or d.get("source_url", ""),
        source_url=d.get("source_url", ""),
    )


def match(question: str, region: str | None = None, industry: str | None = None,
          k: int = 4) -> list[PolicyMatch]:
    """질문에 맞는 지원사업을 고릅니다. 없으면 빈 목록입니다.

    빈 목록을 돌려주는 경우가 실제로 있습니다. 900건 안에 답이 없으면
    억지로 채우지 않습니다 — 관련 없는 공고 넷을 보여 주는 것보다
    "못 찾았습니다"가 낫습니다.
    """
    return [_to_match(d) for d in policy_search.search(question, region, industry, k=k)]


def index_meta() -> dict:
    """색인이 무엇으로 언제 만들어졌는지. 화면 하단 출처 표기에 씁니다."""
    return policy_search.meta()
