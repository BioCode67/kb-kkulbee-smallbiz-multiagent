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


@app.post("/api/v1/guardrail/check")
def guardrail_check(payload: dict) -> dict:
    """가드레일만 따로 시험해 볼 수 있는 자리.

    심사에서 "정말 막히는가"를 물으면 여기에 문장을 넣어 보여 주면 됩니다.
    """
    text = str(payload.get("text", ""))
    safe, report = guardrail_agent.apply(text)
    return {"original": text, "safe": safe, "report": report.model_dump(mode="json")}


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
