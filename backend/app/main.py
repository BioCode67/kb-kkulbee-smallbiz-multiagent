"""
KB-꿀비 API

화면이 부르는 곳은 사실상 /api/v1/chat 하나입니다. 질문 하나에 대해 어떤
에이전트를 거칠지, 어떤 카드를 그릴지, 3D 마스코트를 어떻게 움직일지가
모두 그 한 번의 응답에 담겨 나갑니다.
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents import guardrail_agent, workflow
from app.models.schemas import ChatRequest, ChatResponse, TermEntry

app = FastAPI(
    title="KB-꿀비 API",
    description="소상공인 올인원 3D Multi-Agent 컨설팅 플랫폼",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in
                   os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health() -> dict:
    """LLM이 지금 도는지도 함께 봅니다.

    키가 없거나 한도를 넘겨도 서비스는 돌아갑니다(규칙과 문장 틀로 물러섬).
    그래서 화면만 봐서는 LLM이 죽은 줄 모릅니다. 여기 숫자로 드러냅니다.
    """
    from app.services import llm

    return {
        "status": "ok",
        "agents": ["router", "location", "policy", "protection", "guardrail"],
        "llm": llm.status(),
    }


@app.get("/api/v1/sources")
def sources() -> dict:
    """이 서비스의 숫자가 어디서 왔는지.

    심사에서 가장 먼저 묻는 것이 출처입니다. 화면 어디서든 한 번에 볼 수
    있어야 하고, **재지 못한 것**도 같은 자리에 적혀 있어야 합니다.
    빠진 항목을 따로 찾아봐야 알 수 있게 두면 감춘 것이 됩니다.
    """
    from app.agents import location_agent, policy_agent

    out: dict = {}
    for key, fn in (("market", location_agent.index_meta),
                    ("policy", policy_agent.index_meta)):
        try:
            out[key] = fn()
        except Exception as e:  # noqa: BLE001 — 출처 조회가 서비스를 막으면 안 됩니다
            out[key] = {"error": str(e)[:120]}
    return out


@app.get("/api/v1/stores")
def stores(dong: str, industry: str | None = None, limit: int = 1200) -> dict:
    """한 행정동의 실제 점포 좌표.

    "카페가 204개 있습니다"까지는 집계값으로 말할 수 있지만, **그 204개가
    어디에 있는지**는 좌표가 있어야 보여 줄 수 있습니다. 골목 하나에 몰려
    있는 것과 동 전체에 흩어져 있는 것은 사장님께 전혀 다른 이야기입니다.

    272만 개를 메모리에 올리지 않습니다. 색인에서 그 동네 자리만 찾아
    파일에서 8KB쯤을 읽습니다.
    """
    from app.services import market_data

    return market_data.store_points(dong, industry, min(limit, 3000))


@app.get("/api/v1/integrations")
def integrations() -> dict:
    """외부 연동 상태. 키를 넣은 뒤 여기서 켜졌는지 확인합니다."""
    from app.services import integrations as integ

    return {"items": integ.status()}


@app.get("/api/v1/similar")
def similar(dong: str, k: int = 5) -> dict:
    """업종 구성이 닮은 동네. 2호점·확장 후보를 찾는 자입니다."""
    from app.services import market_data

    return {"items": market_data.similar_dongs(dong, min(k, 10))}


@app.get("/api/v1/industries")
def industries() -> dict:
    """화면의 업종 고르기 목록. 전국 점포가 많은 순입니다."""
    from app.services import market_data

    return {"items": market_data.industry_choices(40)}


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """질문 하나를 그래프에 태워 답과 화면 구성을 함께 돌려줍니다."""
    return await workflow.run(req)


@app.get("/api/v1/terms", response_model=list[TermEntry])
def terms() -> list[TermEntry]:
    """쉬운 용어 사전 전체 15항목."""
    return guardrail_agent.TERMS


@app.post("/api/v1/draft")
async def draft(payload: dict) -> dict:
    """분쟁 민원서 초안 — 겪은 일을 넣으면 제출할 수 있는 꼴로 만들어 줍니다.

    절차를 안내받아도 막상 "민원신청서"라는 백지 앞에서 사장님들은 멈춥니다.
    무엇을 어떤 순서로 적어야 하는지가 곧 장벽입니다. 겪은 일 문장 하나로
    금융회사 민원(1단계)과 금감원 분쟁조정(3단계)에 쓸 초안을 만듭니다.

    LLM이 있으면 사실관계를 다듬어 서식에 앉히고, 없으면 서식 뼈대에
    사장님 문장을 그대로 앉힙니다 — 어느 쪽이든 빈 화면보다는 낫습니다.
    생성문도 예외 없이 가드레일을 거칩니다.
    """
    from app.agents.guardrail_agent import DISPUTE_TYPES, apply
    from app.services import llm

    situation = str(payload.get("situation", "")).strip()[:1500]
    if not situation:
        return {"error": "겪으신 일을 한두 문장으로 적어 주세요."}

    # 유형·근거 규정은 규칙이 정합니다 — LLM이 법조문을 지어내면 안 됩니다.
    hits = [(sum(1 for w in sp["words"] if w in situation), name)
            for name, sp in DISPUTE_TYPES.items()]
    hits = [h for h in hits if h[0] > 0]
    dtype = max(hits)[1] if hits else "기타 금융 분쟁"
    rules = DISPUTE_TYPES.get(dtype, {}).get("rules", [])

    body = None
    out = await llm.generate(
        f"사장님이 겪은 일: {situation}\n분쟁 유형: {dtype}\n"
        f"근거 규정(이것만 인용): {', '.join(rules)}",
        system=(
            "너는 금융 민원서 작성을 돕는 조력자다. 아래 형식의 JSON으로만 답한다. "
            "값은 전부 한국어. 겪은 일에 없는 사실(날짜·금액·회사명)을 지어내지 말고, "
            "모르는 자리는 [날짜], [금액]처럼 대괄호 빈칸으로 남겨라. "
            "facts는 시간 순서의 사실 나열이며 각 항목은 한 문장이다."),
        schema={"type": "object", "properties": {
            "title": {"type": "string"},
            "facts": {"type": "array", "items": {"type": "string"}},
            "request": {"type": "string"}},
            "required": ["title", "facts", "request"]},
        max_tokens=800, temperature=0.3)
    if isinstance(out, dict) and out.get("facts"):
        body = out

    if body is None:
        # LLM 없이도 서식은 나갑니다 — 사장님 문장을 사실관계 첫 줄로.
        body = {"title": f"{dtype} 관련 민원 신청",
                "facts": [situation,
                          "[언제] [어느 지점/채널에서] 위와 같은 일이 있었습니다.",
                          "[관련 서류·녹취 등 증빙을 보관하고 있습니다.]"],
                "request": ("위 사실관계를 확인하시어 관련 법령에 따라 적절한 "
                            "조치를 요청드립니다.")}

    docs = ["신분증 사본", "계약서·상품설명서 사본", "관련 거래내역",
            "상담 녹취·문자 등 증빙(있는 경우)"]
    lines = [
        f"제목: {body['title']}",
        "",
        "수신: (1단계) 해당 금융회사 소비자보호부서",
        "      (3단계) 금융감독원 분쟁조정국 — 국번 없이 1332",
        "",
        "1. 신청 취지",
        f"   {body['request']}",
        "",
        "2. 사실 관계",
        *[f"   {i+1}) {f}" for i, f in enumerate(body["facts"][:6])],
        "",
        "3. 근거 규정",
        *([f"   · {r}" for r in rules] or ["   · 관련 법령 검토 요청"]),
        "",
        "4. 첨부 서류",
        *[f"   · {d}" for d in docs],
        "",
        "신청인: [성명]   연락처: [전화번호]   날짜: [YYYY-MM-DD]",
    ]
    text = "\n".join(lines)
    safe, report = apply(text)

    return {"dispute_type": dtype, "rules": rules, "draft": safe,
            "guardrail_passed": report.passed,
            "generated_by": "llm" if isinstance(out, dict) else "template",
            "note": ("초안입니다. 대괄호 빈칸을 채우고 사실과 다른 부분을 "
                     "고친 뒤 제출하세요. 법률 자문이 아닙니다.")}


@app.post("/api/v1/guardrail/check")
def guardrail_check(payload: dict) -> dict:
    """가드레일만 따로 시험해 볼 수 있는 자리.

    심사에서 "정말 막히는가"를 물으면 여기에 문장을 넣어 보여 주면 됩니다.
    """
    text = str(payload.get("text", ""))
    safe, report = guardrail_agent.apply(text)
    return {"original": text, "safe": safe, "report": report.model_dump(mode="json")}


@app.post("/api/v1/rpa/check")
def rpa_check(payload: dict) -> dict:
    """찜한 공고의 원문을 지금 열어 마감·첨부를 재확인합니다.

    색인은 수집 시점의 스냅샷입니다. 신청하러 가기 직전의 마지막 확인은
    오늘의 원문이어야 합니다 — 마감 연장·조기 마감·서식 교체는 색인이
    모릅니다. bizinfo.go.kr 상세 페이지만 엽니다(화이트리스트).
    """
    from app.rpa import check_notice
    return check_notice(str(payload.get("url", "")))


# ── 화면 서빙 ─────────────────────────────────────────────────────────────
#
# 배포본에서는 프런트엔드도 이 프로세스가 내보냅니다. 주소가 하나여야
# 심사에서 헷갈리지 않고, Node 프로세스를 따로 안 띄우므로 Render 무료
# 등급 512MB 안에 여유가 생깁니다.
#
# 개발 중에는 이 디렉터리가 없으므로 아래가 통째로 건너뜁니다. Next 개발
# 서버가 3000에서 따로 돕니다.
_WEB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")

if os.path.isdir(_WEB):
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    app.mount("/_next", StaticFiles(directory=os.path.join(_WEB, "_next")),
              name="next-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        """정적 파일이 있으면 그것을, 없으면 index.html을 돌려줍니다.

        /api로 시작하는 길은 위에서 이미 잡혔으므로 여기 오지 않습니다.
        경로 안에 '..'가 들어오면 거부합니다 — 이 자리를 통해 서버 파일을
        읽어 갈 수 있으면 안 됩니다.
        """
        if ".." in full_path:
            return FileResponse(os.path.join(_WEB, "index.html"))
        target = os.path.normpath(os.path.join(_WEB, full_path))
        if target.startswith(_WEB) and os.path.isfile(target):
            return FileResponse(target)
        html = os.path.join(_WEB, full_path.rstrip("/") + ".html")
        if os.path.isfile(html):
            return FileResponse(html)
        return FileResponse(os.path.join(_WEB, "index.html"))
