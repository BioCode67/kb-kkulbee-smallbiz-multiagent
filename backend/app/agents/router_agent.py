"""질문을 알아듣는 자리 — LLM이 읽고, 없으면 낱말 규칙이 읽습니다.

낱말 규칙만으로는 못 잡는 것이 있습니다. "요즘 통 손님이 없어서 월세도
빠듯해요"에는 '자금'도 '대출'도 '상권'도 들어 있지 않습니다. 그런데 이 분께
필요한 것은 경영안정자금입니다.

그래서 LLM에게 갈래를 고르게 하되, **찾는 일은 여전히 우리가 합니다.**
LLM은 "이 질문은 자금 갈래이고 지역은 마포구 연남동, 업종은 카페"까지만
정하고, 실제 공고와 상권 숫자는 색인에서 나옵니다. LLM이 공고 이름을
지어내는 일이 구조적으로 불가능합니다.

키가 없으면 아래 낱말 규칙으로 돌아갑니다. 정확도는 떨어지지만 돕니다.
"""
from __future__ import annotations

from app.models.schemas import Intent
from app.services import llm

LOCATION_WORDS = ["상권", "입지", "자리", "위치", "동네", "어디", "점포", "개업",
                  "출점", "유동인구", "목", "임대", "가게 자리",
                  # "연남동이랑 광안2동 비교해줘" — 두 동네를 견주는 말은
                  # 상권 낱말이 없어도 입지 질문입니다 (비교 칩이 여기로 옵니다)
                  "비교"]
POLICY_WORDS = ["자금", "대출", "지원", "보증", "정책", "금리", "융자", "빌리",
                "바우처", "한도", "보조금", "돈",
                # 사장님은 제도 이름을 모르고 말합니다. LLM 없이도 이 정도는
                # 잡아야 "월세가 빠듯하다"는 말이 안내문으로 돌아오지 않습니다.
                "월세", "임대료", "월급", "인건비", "적자", "빠듯", "힘들",
                "어렵", "장사가 안", "손님이 없", "폐업", "접어야", "버거",
                # "손님이 너무 없어요"처럼 부사가 끼면 위 낱말이 안 걸립니다.
                # 실제 시험에서 안내문으로 빠진 것을 보고 변형을 넓혔습니다.
                "손님이 너무", "손님도 없", "장사가 너무", "매출이 없", "안 팔려"]
PROTECT_WORDS = ["분쟁", "민원", "불완전", "설명", "피해", "속았", "억울", "이의",
                 "취소", "연체", "중도상환", "약관", "용어", "무슨 뜻", "절차",
                 "환불", "사기", "서류", "구비", "준비물", "신청 방법", "어떻게 신청",
                 "절차가", "수수료", "꺾기", "강요", "추심", "독촉"]

SYSTEM = """너는 한국 소상공인 상담 서비스의 라우터다. 사장님의 질문을 읽고
어느 갈래로 보낼지, 그리고 지역·업종·필요 금액을 읽어 낸다.

갈래
- location : 어디에 열지, 이 자리가 어떤지, 상권·경쟁·유동
- policy   : 돈 문제 전부. 자금·대출·보증·지원사업·보조금, 그리고
             **돈이 부족하다는 하소연도 여기다.**
- protection : 계약·설명의무·분쟁·민원·환불·연체·약관·어려운 용어
- general  : 위 셋 중 어디에도 안 걸릴 때만

중요 — 사장님은 제도 이름을 모르고 말한다
"손님이 없어서 월세도 빠듯해요" → policy (경영안정자금이 필요한 상황이다)
"직원 월급 주기가 버거워요"     → policy
"가게 접어야 하나 고민이에요"   → policy (재기·폐업 지원이 있다)
"장사가 안된다"                 → policy
"여기 자리가 별로인가 싶어요"   → location
"연남동에서 카페 열려는데 자금은?" → location, policy 둘 다

규칙
- 지역은 사장님이 말한 그대로 한국어로 적는다. 영어로 옮기지 마라(Seongsu-dong 금지).
  없으면 빈 문자열.
- 업종도 한국어로. '카페', '한식', '치킨집'처럼 사장님이 쓴 말 그대로.
- 없는 것을 지어내지 마라. 질문에 없으면 빈 문자열이다."""

SCHEMA = {
    "type": "object",
    "properties": {
        "intents": {
            "type": "array",
            "items": {"type": "string",
                      "enum": ["location", "policy", "protection", "general"]},
        },
        "region": {"type": "string"},
        "industry": {"type": "string"},
        "amount_krw": {"type": "integer"},
        "situation": {"type": "string",
                      "description": "사장님이 처한 상황 한 줄 (한국어)"},
    },
    "required": ["intents"],
}


def _by_words(q: str) -> dict:
    """낱말 규칙. LLM이 없을 때, 또는 규칙이 확실할 때 씁니다.

    **순서가 뜻을 갖습니다.** 화면의 대표 갈래는 첫 번째 것으로 정해지고,
    답도 그 순서로 이어 붙습니다.

    소비자보호를 맨 앞에 둔 것은 그쪽 낱말이 더 구체적이기 때문입니다.
    "대출 설명을 제대로 안 해줬어요"에는 '대출'과 '설명'이 함께 있는데,
    이 분께 필요한 것은 지원사업 목록이 아니라 분쟁 절차입니다. 자금
    낱말은 어디에나 섞여 들어오므로 맨 뒤에 둡니다.
    """
    picked = []
    if any(w in q for w in PROTECT_WORDS):
        picked.append(Intent.PROTECTION.value)
    if any(w in q for w in LOCATION_WORDS):
        picked.append(Intent.LOCATION.value)
    if any(w in q for w in POLICY_WORDS):
        picked.append(Intent.POLICY.value)
    return {"intents": picked or [Intent.GENERAL.value], "by": "rules"}


async def route(question: str, region: str | None = None,
                industry: str | None = None) -> dict:
    """갈래와 조건을 읽습니다. 실패해도 예외 없이 규칙 결과를 돌려줍니다.

    **규칙이 확실하면 LLM을 부르지 않습니다.** 무료 등급은 분당 20회이고
    대화 한 번에 두 번(갈래 + 문장) 부르면 분당 열 분이 한도입니다. 그런데
    "연남동 카페 상권 어때?"처럼 낱말이 분명한 질문에까지 LLM을 쓸 이유가
    없습니다. 지역·업종도 색인에서 직접 찾을 수 있습니다.

    LLM은 규칙이 general로 떨어졌을 때 — 즉 무슨 말인지 모를 때 — 만
    부릅니다. 그 결과 대화 대부분이 LLM을 한 번만 쓰고, 같은 한도에서
    두 배를 받습니다.
    """
    from app.services import market_data

    fallback = _by_words(question)

    if fallback["intents"] != [Intent.GENERAL.value]:
        found_ind = market_data.find_industry(question)
        dong = market_data.find_dong(region or question)
        return {
            "intents": fallback["intents"],
            "region": region or (f"{dong['sido']} {dong['sgg']} {dong['dong']}"
                                 if dong else None),
            "industry": industry or (found_ind[1] if found_ind else None),
            "amount_krw": None,
            "situation": "",
            "by": "rules",
        }

    out = await llm.generate(
        f"사장님 질문: {question}", SYSTEM, schema=SCHEMA,
        max_tokens=400, temperature=0.1)

    if not isinstance(out, dict) or not out.get("intents"):
        return {**fallback, "region": region, "industry": industry}

    valid = {"location", "policy", "protection", "general"}
    intents = [i for i in out["intents"] if i in valid] or fallback["intents"]

    # 사용자가 화면에서 직접 고른 값이 LLM이 읽은 것보다 우선입니다.
    return {
        "intents": intents,
        "region": region or (out.get("region") or "").strip() or None,
        "industry": industry or (out.get("industry") or "").strip() or None,
        "amount_krw": out.get("amount_krw") or None,
        "situation": (out.get("situation") or "").strip(),
        "by": "llm",
    }
