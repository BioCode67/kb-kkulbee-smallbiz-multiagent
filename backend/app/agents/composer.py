"""찾아낸 사실을 사람이 읽을 말로 엮습니다 — 사실은 절대 만들지 않고.

에이전트들이 내놓는 것은 숫자와 목록입니다. 그대로 이어 붙이면 "상권 점수는
60.8점입니다. 지원사업 4건을 찾았습니다."처럼 보고서 문장이 됩니다. 틀린
말은 아니지만, 장사가 안돼 답답한 사장님께 도움이 되는 말투는 아닙니다.

그래서 LLM에게 문장을 맡깁니다. 다만 **재료를 넘길 때 규칙이 있습니다.**

  · 우리가 찾은 사실만 넘깁니다. 공고 이름, 점포 수, 마감일 전부 색인에서
    나온 것입니다.
  · "여기 적힌 것 밖의 숫자·기관명·사업명을 쓰지 마라"를 명시합니다.
  · 그래도 지어낼 수 있으므로, 나간 문장은 **가드레일을 반드시 거칩니다**
    (workflow.py의 불변식). 금소법 검사가 마지막 관문입니다.

LLM이 없거나 실패하면 원래 문장을 그대로 씁니다. 화면이 비지 않습니다.
"""
from __future__ import annotations

from app.services import llm

SYSTEM = """너는 한국의 소상공인 사장님을 돕는 상담사 '꿀비'다.

말투
- 존댓말. 사장님을 '사장님'이라고 부른다.
- 짧고 분명하게. 한 문단은 두세 문장.
- 위로하는 말을 앞세우지 말고 도움이 되는 사실을 먼저 말한다.
- 이모지를 쓰지 않는다.

절대 규칙
- **아래 '확인된 사실'에 없는 숫자·기관명·사업명·날짜를 쓰지 마라.**
  기억나는 다른 지원사업이 있어도 쓰지 마라. 여기 있는 것만 쓴다.
- 금액과 조건은 반드시 "공고 기준"임을 밝힌다. 확정된 대출 조건이 아니다.
- 대출·투자를 권유하거나 수익을 약속하지 마라.
- 확인된 사실이 비어 있으면 없다고 말한다. 채워 넣지 마라.

분량: 3~5문장."""


def _facts(state: dict) -> str:
    """LLM에게 넘길 재료. 여기 없는 것은 쓰지 못하게 합니다."""
    lines: list[str] = []

    loc = state.get("location")
    if loc:
        lines.append(f"[상권] {loc.region_name} · {loc.industry}")
        lines.append(f"  점수 {loc.total_score}점(100점 만점, {loc.grade}등급). "
                     f"전국 행정동 3,450곳의 한가운데가 50점.")
        for f in loc.factors[:4]:
            lines.append(f"  · {f.label} {f.contribution:+.1f}점 — {f.reason}")
        lines.append("  유동인구·매출·폐업률은 자료에 없어 점수에 넣지 않음.")

    pol = state.get("policies") or []
    if pol:
        lines.append(f"[지원사업] 기업마당 공고 900건에서 {len(pol)}건 찾음")
        for p in pol[:3]:
            bits = [p.provider, p.category]
            if p.limit_krw:
                bits.append(f"{p.amount_basis or '금액'} {p.limit_krw:,}원")
            if p.rate_pct is not None:
                bits.append(f"금리 {p.rate_pct}%")
            bits.append(f"접수 {p.apply_period or '미기재'}")
            lines.append(f"  · 「{p.name}」 ({' / '.join(bits)})")
            if p.match_reasons:
                lines.append(f"    고른 이유: {p.match_reasons[0]}")
    elif "policy" in (state.get("intents") or []):
        lines.append("[지원사업] 조건에 맞는 공고를 찾지 못함")

    pack = state.get("protection")
    if pack:
        lines.append(f"[소비자보호] {pack.dispute_summary}")
        if pack.applicable_rules:
            lines.append(f"  근거 규정: {', '.join(pack.applicable_rules[:3])}")
        if pack.procedure:
            lines.append("  절차: " + " → ".join(s.title for s in pack.procedure))

    return "\n".join(lines)


async def compose(question: str, state: dict, fallback: str) -> str:
    """사실을 문장으로. 실패하면 fallback을 그대로 돌려줍니다."""
    facts = _facts(state)
    if not facts.strip():
        return fallback

    text = await llm.generate(
        f"사장님 질문: {question}\n\n확인된 사실:\n{facts}\n\n"
        f"위 사실만 써서 사장님께 답해 주세요.",
        SYSTEM, max_tokens=900, temperature=0.5)

    if not isinstance(text, str) or len(text.strip()) < 20:
        return fallback
    return text.strip()
