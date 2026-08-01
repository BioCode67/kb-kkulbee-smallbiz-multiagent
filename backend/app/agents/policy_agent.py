"""
Pick 3 — 정책자금·KB 상품 찾기

임베딩 검색을 붙일 자리지만, 지금은 키워드와 조건 매칭으로 갑니다. 이유가
둘입니다. 하나는 지원사업이 서른 개 남짓이라 의미 검색의 이득이 크지 않다는
것이고, 다른 하나는 심사에서 "왜 이걸 추천했나"에 답할 수 있어야 한다는
것입니다. 벡터 유사도 0.87은 근거가 되지 못합니다.

그래서 매칭 점수를 요소별로 쪼개 두고, 어느 조건이 몇 점을 보탰는지
match_reasons에 담아 내보냅니다. 화면이 그대로 보여 줍니다.

Supabase pgvector나 ChromaDB를 붙일 때는 embed() 자리만 갈아 끼우면 됩니다.
"""
from __future__ import annotations

import json
import os
import re

from app.models.schemas import PolicyMatch

DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "policies.json")


def _load() -> list[dict]:
    with open(DATA, encoding="utf-8") as f:
        return json.load(f)["programs"]


# 질문에서 상황을 읽어 내는 단서들
SIGNALS = {
    "창업": ["창업", "개업", "시작", "오픈", "신규"],
    "운영": ["운영", "운전", "재료비", "임대료", "인건비", "생활"],
    "시설": ["시설", "인테리어", "설비", "장비", "리모델링"],
    "위기": ["폐업", "어렵", "힘들", "연체", "적자", "위기", "재기"],
    "청년": ["청년", "20대", "30대"],
    "여성": ["여성", "여사장"],
    "저신용": ["신용", "저신용", "등급", "점수 낮"],
    "수출": ["수출", "해외", "온라인 진출"],
}

AMOUNT = re.compile(r"(\d[\d,]*)\s*(억|천만|백만|만)?\s*원?")


def _read_amount(text: str) -> int | None:
    """'5천만원', '3억' 같은 표현에서 금액을 읽습니다."""
    m = AMOUNT.search(text.replace(" ", ""))
    if not m:
        return None
    n = int(m.group(1).replace(",", ""))
    unit = m.group(2)
    mult = {"억": 100_000_000, "천만": 10_000_000, "백만": 1_000_000, "만": 10_000}.get(unit, 1)
    return n * mult


def _signals(text: str) -> set[str]:
    return {k for k, words in SIGNALS.items() if any(w in text for w in words)}


def match(question: str, region: str | None = None, industry: str | None = None,
          k: int = 4) -> list[PolicyMatch]:
    """질문과 조건에 맞는 지원사업을 고릅니다.

    점수는 네 갈래로 나눠 매깁니다 — 목적, 대상, 지역, 금액. 어느 갈래에서
    몇 점을 받았는지 이유로 남겨야 추천을 설명할 수 있습니다.
    """
    programs = _load()
    sig = _signals(question)
    want = _read_amount(question)
    out: list[PolicyMatch] = []

    for p in programs:
        score, reasons = 0.0, []

        hit = sig & set(p.get("purposes", []))
        if hit:
            score += 34 * min(len(hit), 2) / 2
            reasons.append(f"{'·'.join(sorted(hit))} 목적에 맞는 사업입니다")

        tags = set(p.get("target_tags", []))
        thit = sig & tags
        if thit:
            score += 22
            reasons.append(f"{'·'.join(sorted(thit))} 대상 우대가 있습니다")
        elif not tags:
            score += 10
            reasons.append("대상 제한이 없어 누구나 신청할 수 있습니다")

        pr = p.get("region")
        if pr is None:
            score += 12
            reasons.append("전국에서 신청할 수 있습니다")
        elif region and pr in region:
            score += 20
            reasons.append(f"{pr} 지역 사업이라 해당됩니다")
        else:
            continue          # 지역이 안 맞으면 아예 뺍니다

        if want and p.get("limit_krw"):
            if p["limit_krw"] >= want:
                score += 16
                reasons.append(f"필요하신 {want // 10_000_000}천만원을 한도 안에서 다룰 수 있습니다")
            else:
                score -= 8
                reasons.append(f"한도가 {p['limit_krw'] // 10_000_000}천만원이라 요청액에 못 미칩니다")

        if p.get("rate_pct") is not None and p["rate_pct"] <= 3.0:
            score += 8
            reasons.append(f"금리 {p['rate_pct']}%로 시중보다 낮습니다")

        if score <= 0:
            continue
        out.append(PolicyMatch(
            program_id=p["id"], name=p["name"], provider=p["provider"],
            category=p.get("category", "정책자금"),
            limit_krw=p.get("limit_krw"), rate_pct=p.get("rate_pct"),
            period_months=p.get("period_months"),
            eligibility=p.get("eligibility", []),
            required_docs=p.get("required_docs", []),
            match_score=round(min(score, 100.0), 1),
            match_reasons=reasons[:4],
            apply_url=p.get("apply_url", ""),
        ))

    return sorted(out, key=lambda m: -m.match_score)[:k]
