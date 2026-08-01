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
