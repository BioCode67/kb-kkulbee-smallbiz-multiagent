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


# 스몰토크("안녕", "넌 누구야", "뭘 해줄 수 있어")에도 LLM이 답해야
# 상담사답습니다. 다만 재료는 여전히 '실존 기능 목록'만 — 여기 없는
# 기능을 지어내면 안 되므로 목록 자체를 사실로 넘깁니다.
CAPABILITIES = """[꿀비 소개]
  이름 꿀비. KB AI Challenge 출품작. 소상공인 사장님을 돕는 멀티에이전트 AI 상담사.
[실제로 할 수 있는 것 — 이 목록 밖의 기능을 말하지 마라]
  · 입지 진단: 전국 점포 272만 개 실측으로 동네×업종 상권 점수와 근거(레이더·요인 분해)
  · 시군구 순위: "경산시 술집 어때?"처럼 물으면 그 안 행정동 전부를 재서 순위로
  · 기회 업종 레이더: 이 동네에 부족한 업종 찾기
  · 정책자금 매칭: 기업마당 실공고 900건 검색, 추천 이유·원문 링크 동봉
  · 자금 설계사: 필요 금액을 보조금→보증→융자로 설계, 월 상환액·이자 절감액 계산
  · 은행 공시 금리와 KB국민은행 공시 상품 안내(금융감독원 공시)
  · 권리 지키기: 분쟁 해결 4단계, 민원서 초안, 계약서 독소조항 검사(PDF 그대로 가능),
    가맹 브랜드 공시 조회(가맹점 수·평균매출), 권리 마감 D-day(골든타임)
  · 두 동네 비교, 찜한 공고 원문 자동 재확인(RPA), 상담 인쇄·캘린더 내보내기
[쓰는 법] 화면의 배너에서 갈래를 고르거나, 평소 말로 질문창에 물으면 된다.
[한계] 매출·폐업률·유동인구(서울 외)는 자료가 없어 다루지 않는다."""

SYSTEM_SMALL = """너는 한국의 소상공인 상담사 '꿀비'다. 사장님의 인사나
소개 요청에 따뜻하고 짧게 답한다. 존댓말(~습니다), 이모지 금지, 3~5문장.
[꿀비 소개]와 [실제로 할 수 있는 것] 목록에 있는 내용만 말하라 — 목록에
없는 기능이나 수치를 지어내지 마라. 마지막 문장은 사장님이 바로 던져볼
만한 예시 질문 하나로 끝내라."""


async def compose(question: str, state: dict, fallback: str) -> str:
    """사실을 문장으로. 실패하면 fallback을 그대로 돌려줍니다."""
    facts = _facts(state)
    if not facts.strip():
        # 갈래 없는 대화(인사·정체·사용법) — 기능 목록만 재료로 LLM 응대.
        # 이전에는 여기서 바로 fallback이라 "누구야?"에도 고정 안내문이
        # 나갔습니다(스몰토크에 답을 못 한다는 피드백의 원인).
        text = await llm.generate(
            f"사장님 말: {question}\n\n{CAPABILITIES}\n\n"
            f"위 내용만 근거로 자연스럽게 응대해 주세요.",
            SYSTEM_SMALL, max_tokens=400, temperature=0.6)
        if isinstance(text, str) and len(text.strip()) >= 20:
            return text.strip()
        return fallback

    text = await llm.generate(
        f"사장님 질문: {question}\n\n확인된 사실:\n{facts}\n\n"
        f"위 사실만 써서 사장님께 답해 주세요.",
        SYSTEM, max_tokens=900, temperature=0.5)

    if not isinstance(text, str) or len(text.strip()) < 20:
        return fallback
    return text.strip()
