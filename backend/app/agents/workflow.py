"""
LangGraph 오케스트레이션 — Router ▸ Location ▸ Policy ▸ Guardrail

에이전트를 늘어놓기만 하면 멀티에이전트가 되지 않습니다. 중요한 것은
누가 언제 도는지, 그리고 무엇을 근거로 그 순서가 정해지는지입니다.

이 그래프의 규칙은 하나입니다. **가드레일은 예외 없이 마지막에 돕니다.**
어느 경로로 왔든 사용자에게 나가는 문장은 반드시 금소법 검사를 거칩니다.
분기를 그래프로 그려 두면 이 불변식이 코드가 아니라 구조로 보장됩니다.

  router ─┬→ location ─┐
          ├→ policy ───┼→ guardrail → END
          └→ protection┘

한 질문이 여러 과제에 걸치는 경우가 실제로 많습니다("연남동에서 카페 열려는데
자금은 어떻게"). 그래서 라우터는 하나만 고르지 않고 필요한 갈래를 모두 켭니다.
"""
from __future__ import annotations

import time
import uuid

from langgraph.graph import END, StateGraph
from typing_extensions import Annotated, TypedDict

from app.agents import (
    composer,
    guardrail_agent,
    location_agent,
    policy_agent,
    router_agent,
)
from app.services import session_store
from app.models.schemas import (
    AgentKind,
    BentoCard,
    BentoCardKind,
    ChatRequest,
    ChatResponse,
    CharacterMotion,
    Intent,
)


def _merge(a: list, b: list) -> list:
    return (a or []) + (b or [])


def _pick(a: dict, b: dict) -> dict:
    """갈래별 문단을 각자 자기 칸에 담습니다.

    **처음에는 문자열 하나에 이어 붙였습니다.** 그런데 갈래들이 병렬로 돌아
    먼저 끝난 쪽이 앞에 붙습니다. 그래서 "대출 설명을 제대로 안 해줬어요"에
    분쟁 절차가 아니라 지원사업 목록이 먼저 나왔습니다. 대표 갈래는
    protection으로 제대로 잡혔는데 읽는 순서만 뒤집힌 것입니다.

    끝난 순서가 아니라 **갈래의 중요도 순서**로 읽혀야 합니다. 그래서
    갈래마다 칸을 따로 두고, 합치는 일은 다 끝난 뒤 한 곳에서 합니다.
    """
    return {**(a or {}), **(b or {})}


# 읽히는 순서. 라우터가 고른 순서와 같습니다 — 분쟁이 걸린 질문에는
# 분쟁 절차가 먼저 와야 합니다.
_ORDER = ("protection", "location", "policy", "general")


def _assemble(parts: dict) -> str:
    out = [parts[k].strip() for k in _ORDER if (parts.get(k) or "").strip()]
    return "\n\n".join(out)


# 밝은 쪽이 이깁니다. 좋은 소식이 하나라도 있으면 꿀비가 날아야 합니다.
_MOTION_RANK = {"thinking": 0, "explaining": 1, "fly_happy": 2}


def _brighter(a: str, b: str) -> str:
    if not a:
        return b
    if not b:
        return a
    return a if _MOTION_RANK.get(a, 0) >= _MOTION_RANK.get(b, 0) else b


class GraphState(TypedDict, total=False):
    request: ChatRequest
    intents: list[str]
    region: str | None
    industry: str | None
    routed_by: str
    carry: str
    composed_by: str
    parts: Annotated[dict, _pick]
    location: object
    pins: list
    policies: list
    protection: object
    guardrail: object
    safe_answer: str
    motion: Annotated[str, _brighter]
    trace: Annotated[list, _merge]


# ── 라우터 ────────────────────────────────────────────────────────────────
async def route(state: GraphState) -> GraphState:
    """어느 갈래를 켤지 정합니다. 여러 개가 동시에 켜질 수 있습니다.

    LLM이 읽고, 키가 없거나 실패하면 낱말 규칙으로 돌아갑니다. 규칙만으로는
    "요즘 통 손님이 없어서 월세도 빠듯해요"를 못 잡습니다 — '자금'도 '대출'도
    안 들어 있는데 필요한 것은 경영안정자금입니다.

    읽어 낸 지역·업종은 상태에 실어 각 갈래가 씁니다. 화면에서 직접 고른
    값이 있으면 그쪽이 우선입니다.
    """
    req = state["request"]
    # 직전 대화에서 지역·업종을 이어받습니다. "연남동 카페 상권 어때?" 다음에
    # "그럼 자금은?"이라고 하면 어느 동네인지가 그대로 살아 있어야 합니다.
    prev = session_store.context(req.session_id)
    r = await router_agent.route(req.message, req.region, req.industry)
    # 짧은 후속 질문은 그 자체로는 검색이 안 됩니다. "그럼 자금은?"에는
    # 업종도 지역도 없어 '자금'만 남고, 그러면 블록체인 API 개발자금 같은
    # 것이 1위로 올라옵니다. 사람은 앞말을 이어 듣습니다. 검색어에도
    # 직전 질문을 얹습니다.
    carry = ""
    if len(req.message.strip()) <= 16 and prev.get("turns"):
        carry = prev["turns"][-1]["question"]

    return {"intents": r["intents"],
            "region": r.get("region") or prev.get("region"),
            "industry": r.get("industry") or prev.get("industry"),
            "carry": carry,
            "routed_by": r.get("by", "rules"),
            "motion": CharacterMotion.THINKING.value,
            "trace": [AgentKind.ROUTER.value]}


# ── 각 갈래 ───────────────────────────────────────────────────────────────
async def run_location(state: GraphState) -> GraphState:
    req = state["request"]
    region = req.region or state.get("region") or req.message
    industry = req.industry or state.get("industry") or _guess_industry(req.message)

    score = await location_agent.analyze_location(region, industry)
    if score is None:
        # 자료에 없는 동네에 점수를 지어내지 않습니다. 예전에는 이름만 있으면
        # 난수로 채워 무엇이든 답했습니다.
        return {"parts": {"location": ("어느 동네인지 못 알아들었습니다. '서울 마포구 연남동'처럼 "
                           "시·군·구까지 적어 주시면 그 동네 점포 자료로 살펴보겠습니다.")},
                "motion": CharacterMotion.EXPLAINING.value,
                "trace": [AgentKind.LOCATION.value]}

    pins = await location_agent.nearby_pins(score)

    lead = (f"{score.region_name}의 {score.industry} 상권은 100점 만점에 "
            f"{score.total_score}점({score.grade}등급)입니다. ")
    top = score.factors[0] if score.factors else None
    if top:
        lead += f"가장 크게 작용한 것은 {top.label}({top.contribution:+.1f}점)입니다. {top.reason}"

    return {"parts": {"location": lead}, "location": score, "pins": pins,
            "motion": (CharacterMotion.FLY_HAPPY.value if score.total_score >= 60
                       else CharacterMotion.EXPLAINING.value),
            "trace": [AgentKind.LOCATION.value]}


def _won(v: int) -> str:
    if v >= 100_000_000:
        n = v / 100_000_000
        return f"{n:.0f}억원" if n == int(n) else f"{n:.1f}억원"
    if v >= 10_000_000:
        return f"{v // 10_000_000}천만원"
    return f"{v // 10_000:,}만원"


def run_policy(state: GraphState) -> GraphState:
    req = state["request"]
    region = req.region or state.get("region")
    industry = req.industry or state.get("industry")
    q = f"{state.get('carry', '')} {req.message}".strip()
    matches = policy_agent.match(q, region, industry)

    if not matches:
        # 못 찾았으면 못 찾았다고 합니다. 관련 없는 공고를 채워 넣으면
        # 사장님이 그것을 읽어 보는 데 시간을 씁니다.
        text = ("기업마당 공고 900건을 뒤졌는데 조건에 바로 맞는 것이 없었습니다. "
                "지역이나 업종, 필요하신 금액을 알려 주시면 다시 찾아보겠습니다.")
        return {"parts": {"policy": text}, "policies": [],
                "motion": CharacterMotion.EXPLAINING.value,
                "trace": [AgentKind.POLICY.value]}

    best = matches[0]
    bits = []
    if best.limit_krw:
        bits.append(f"{best.amount_basis or '금액'} {_won(best.limit_krw)}")
    if best.rate_pct is not None:
        bits.append(f"금리 {best.rate_pct}%")
    if best.open_status == "open" and best.apply_deadline:
        bits.append(f"{best.apply_deadline}까지 접수")
    elif best.apply_period:
        bits.append(f"접수 {best.apply_period}")

    detail = f" — {', '.join(bits)}" if bits else ""
    text = (f"기업마당 실제 공고에서 {len(matches)}건을 찾았습니다. "
            f"가장 가까운 것은 {best.provider}의 「{best.name}」입니다{detail}. "
            f"{best.match_reasons[0] if best.match_reasons else ''}")

    return {"parts": {"policy": text}, "policies": matches,
            "motion": CharacterMotion.FLY_HAPPY.value,
            "trace": [AgentKind.POLICY.value]}


def run_protection(state: GraphState) -> GraphState:
    q = state["request"].message
    pack = guardrail_agent.build_protection(q, q)
    text = (f"{pack.dispute_summary} 아래에 4단계 절차와 준비 서류를 정리했습니다. "
            f"근거 규정은 {', '.join(pack.applicable_rules[:2])}입니다.")
    return {"parts": {"protection": text}, "protection": pack,
            "motion": CharacterMotion.EXPLAINING.value,
            "trace": [AgentKind.PROTECTION.value]}


def run_general(state: GraphState) -> GraphState:
    text = ("소상공인 사장님을 위한 세 가지를 도와드립니다.\n"
            "· 어디에 열지 — 상권 점수와 그 근거\n"
            "· 자금을 어떻게 — 정책자금·KB 상품 매칭\n"
            "· 억울한 일이 생겼을 때 — 분쟁 절차와 서류\n"
            "예를 들어 “연남동에서 카페 열려는데 상권 어때?”처럼 물어봐 주세요.")
    return {"parts": {"general": text}, "motion": CharacterMotion.FLY_HAPPY.value,
            "trace": []}


async def run_guardrail(state: GraphState) -> GraphState:
    """마지막 관문. 여기를 거치지 않고 나가는 문장은 없습니다.

    **작성기를 여기 안에 둔 것은 순서 때문입니다.** LLM이 쓴 문장도 반드시
    금소법 검사를 거쳐야 합니다. 작성기를 별도 노드로 두고 가드레일과
    나란히 놓으면 둘이 동시에 돌아 검사받지 않은 문장이 나갈 수 있습니다.
    그래프에서 '가드레일이 마지막'이라는 불변식이 깨지는 것입니다.

    그래서 여기서 순서대로 합니다 — 엮고, 검사하고, 내보냅니다.

    answer는 이어 붙이는 채널이라 여기서 그냥 쓰면 원문 뒤에 수정본이
    따라붙습니다. 그래서 검사 결과를 따로 담고, 최종 조립은 run()에서
    이 값으로 갈아 끼웁니다.
    """
    raw = _assemble(state.get("parts") or {})
    text = await composer.compose(state["request"].message, dict(state), raw)
    composed = "llm" if text != raw else "template"

    safe, report = guardrail_agent.apply(text)
    return {"safe_answer": safe, "guardrail": report, "composed_by": composed,
            "trace": [AgentKind.GUARDRAIL.value]}


# ── 그래프 ────────────────────────────────────────────────────────────────
def _next(state: GraphState) -> list[str]:
    """라우터가 켠 갈래로 동시에 보냅니다."""
    got = state.get("intents", [])
    nodes = []
    if Intent.LOCATION.value in got:
        nodes.append("agent_location")
    if Intent.POLICY.value in got:
        nodes.append("agent_policy")
    if Intent.PROTECTION.value in got:
        nodes.append("agent_protection")
    return nodes or ["agent_general"]


# 노드 이름에 접두사를 붙입니다. LangGraph는 상태 키와 같은 이름의 노드를
# 허용하지 않는데, 상태에 location·policies·protection이 이미 있습니다.
NODES = ("agent_location", "agent_policy", "agent_protection", "agent_general")


def build_graph():
    g = StateGraph(GraphState)
    g.add_node("router", route)
    g.add_node("agent_location", run_location)
    g.add_node("agent_policy", run_policy)
    g.add_node("agent_protection", run_protection)
    g.add_node("agent_general", run_general)
    g.add_node("agent_guardrail", run_guardrail)

    g.set_entry_point("router")
    g.add_conditional_edges("router", _next, list(NODES))
    for n in NODES:
        g.add_edge(n, "agent_guardrail")
    g.add_edge("agent_guardrail", END)
    return g.compile()


GRAPH = build_graph()

def _guess_industry(text: str) -> str | None:
    """질문에서 업종을 읽습니다. 못 읽으면 None — 임의로 정하지 않습니다.

    예전에는 못 읽으면 '한식음식점'으로 두었습니다. 카페를 물은 분께 한식
    기준으로 잰 경쟁 강도를 보여 주는 셈이었습니다. 업종을 모르면 업종에
    딸린 요인(동종업종 경쟁, 같은 계열 집적)을 빼고 상권 자체만 잽니다.
    """
    from app.services import market_data

    found = market_data.find_industry(text)
    return found[1] if found else None


# ── 화면 카드 조립 (Generative UI) ────────────────────────────────────────
def _cards(state: GraphState) -> list[BentoCard]:
    """무엇을 그릴지 서버가 정합니다.

    질문에 따라 카드 구성이 달라지므로 화면은 kind만 보고 맞는 컴포넌트를
    고르면 됩니다. 화면에 분기 로직을 두면 새 카드를 늘릴 때마다 화면을
    고쳐야 합니다.
    """
    cards: list[BentoCard] = []
    loc = state.get("location")
    if loc:
        cards.append(BentoCard(
            id="score", kind=BentoCardKind.SCORE, title="상권 점수",
            subtitle=f"{loc.region_name} · {loc.industry}", span=2,
            accent="yellow" if loc.total_score >= 65 else "neutral",
            payload=loc.model_dump(mode="json")))
        cards.append(BentoCard(
            id="factors", kind=BentoCardKind.FACTORS, title="점수를 만든 요인",
            subtitle="기준 50점에서 각 요인이 올리고 내린 몫", span=4,
            accent="brown",
            payload={"base": loc.base_score,
                     "factors": [f.model_dump(mode="json") for f in loc.factors]}))
    if state.get("pins"):
        cards.append(BentoCard(
            id="map", kind=BentoCardKind.MAP, title="주변 상권 비교",
            subtitle="점수 하나만으로는 높은지 알 수 없습니다", span=3,
            payload={"pins": [p.model_dump(mode="json") for p in state["pins"]],
                     # 지도가 실제 점포를 불러올 수 있게 좌표 키를 함께 보냅니다.
                     "dong_code": getattr(loc, "dong_code", None),
                     "industry_code": getattr(loc, "industry_code", None),
                     "industry": getattr(loc, "industry", None),
                     "same_industry_count": getattr(loc, "same_industry_count", None)}))
    if state.get("policies"):
        cards.append(BentoCard(
            id="policy", kind=BentoCardKind.POLICY, title="맞는 지원사업",
            subtitle="추천 이유를 함께 적었습니다", span=3, accent="green",
            payload={"items": [p.model_dump(mode="json") for p in state["policies"]]}))
    pack = state.get("protection")
    if pack:
        cards.append(BentoCard(
            id="terms", kind=BentoCardKind.TERMS, title="어려운 말 풀이",
            subtitle="이 대화에 나온 용어만 골랐습니다", span=2,
            payload={"terms": [t.model_dump(mode="json") for t in pack.terms]}))
        cards.append(BentoCard(
            id="procedure", kind=BentoCardKind.PROCEDURE, title="분쟁 해결 4단계",
            subtitle="준비 서류와 걸리는 시간까지", span=4, accent="brown",
            payload={"steps": [s.model_dump(mode="json") for s in pack.procedure],
                     "rules": pack.applicable_rules,
                     "checklist": pack.document_checklist}))
    rep = state.get("guardrail")
    if rep and rep.violations:
        cards.append(BentoCard(
            id="notice", kind=BentoCardKind.NOTICE, title="표현을 고쳤습니다",
            subtitle="금융소비자보호법에 따라", span=2, accent="red",
            payload=rep.model_dump(mode="json")))
    return cards


async def run(req: ChatRequest) -> ChatResponse:
    t0 = time.perf_counter()
    state = await GRAPH.ainvoke({"request": req, "trace": []})

    intents = state.get("intents", [Intent.GENERAL.value])
    sid = req.session_id or uuid.uuid4().hex[:12]
    answer = state.get("safe_answer") or _assemble(state.get("parts") or {})

    # 이번 턴을 남깁니다. 다음 질문이 이 맥락을 이어받습니다.
    session_store.remember(
        sid, req.message, intents,
        state.get("region"), state.get("industry"), answer)

    return ChatResponse(
        session_id=sid,
        intent=Intent(intents[0]),
        answer=answer,
        character_motion=CharacterMotion(state.get("motion",
                                                   CharacterMotion.EXPLAINING.value)),
        cards=_cards(state),
        location=state.get("location"),
        pins=state.get("pins", []),
        policies=state.get("policies", []),
        protection=state.get("protection"),
        guardrail=state.get("guardrail"),
        agent_trace=[AgentKind(a) for a in state.get("trace", [])],
        elapsed_ms=int((time.perf_counter() - t0) * 1000),
    )
