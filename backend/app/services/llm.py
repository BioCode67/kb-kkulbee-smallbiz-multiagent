"""Gemini 호출 — 있으면 쓰고, 없으면 없는 대로 돕니다.

**LLM은 이 서비스의 뼈대가 아닙니다.** 상권 점수는 점포 272만 개를 센
것이고 지원사업은 공고 900건에서 찾은 것입니다. 그 숫자들은 LLM 없이도
나옵니다. LLM이 하는 일은 둘입니다.

  · 질문을 알아듣는 것 — "장사가 안돼 죽겠어요"가 어느 갈래인지
  · 찾아낸 사실을 사람이 읽을 말로 엮는 것

그래서 **키가 없거나 한도를 넘겨도 서비스는 그대로 돕니다.** 낱말 규칙과
문장 틀로 되돌아갈 뿐입니다. 심사 도중 한도가 차서 화면이 비는 일은
없어야 합니다.

겪은 것들
- **무료 등급은 `gemini-2.5-flash`가 분당 5회입니다.** 대화 한 번에 두 번
  (갈래 고르기 + 문장 엮기) 부르므로 분당 2.5명이면 막힙니다. 심사위원 두
  분이 동시에 눌러 보면 바로 한도입니다. 재 보니 `gemini-2.5-flash-lite`는
  8회를 연속으로 받았습니다(회당 0.8초). 기본을 그쪽으로 둡니다.
  `GEMINI_MODEL`로 바꿀 수 있습니다.
- `gemini-2.5-flash`는 생각 토큰을 씁니다. "OK" 세 글자를 받는 데 생각
  토큰 62개를 썼습니다. `maxOutputTokens`를 좁게 잡으면 생각하다 끝나서
  **본문이 빈 채로** 돌아옵니다. 생각 예산을 0으로 끕니다.
- 429가 오면 본문에 "1.99초 뒤에 다시"처럼 얼마나 쉬라는지가 적혀 옵니다.
  처음엔 무조건 60초를 쉬었는데, 2초만 쉬면 될 것을 1분 동안 규칙 기반으로
  떨어뜨리고 있었습니다. 알려 준 만큼만 쉽니다.
- 구조화 출력이 값을 영어로 뱉습니다(`Seongsu-dong`). 한국어로 달라고
  프롬프트에 못 박습니다.
- 임베딩 모델 이름은 `gemini-embedding-001`입니다(`text-embedding-004`는 404).
"""
from __future__ import annotations

import json
import os
import re
import time

import httpx

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
TIMEOUT = 14.0
RETRY = 1

# 한도를 넘겼거나 죽었을 때, 매 요청마다 다시 두드리면 응답이 그때마다
# 14초씩 늦어집니다. 한 번 실패하면 잠시 쉬었다 다시 봅니다.
_COOLDOWN = 20.0
_RETRY_HINT = re.compile(r"retry in ([\d.]+)s", re.I)
_state = {"blocked_until": 0.0, "calls": 0, "fails": 0, "last_error": ""}


def api_key() -> str:
    return os.getenv("GEMINI_API_KEY", "").strip()


def model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite").strip()


# 무료 키는 모델별로 일일 쿼터가 따로 잡힙니다. 주력이 429로 막히면
# 형제 모델로 넘어갑니다 — 시연 중 조용히 템플릿으로 떨어지는 것보다
# 다른 모델이 답하는 편이 낫습니다(스몰토크 무응답 피드백의 근본 원인).
def _model_chain() -> list[str]:
    chain = [model(), "gemini-2.0-flash-lite", "gemini-2.0-flash",
             "gemini-flash-lite-latest"]
    out: list[str] = []
    for m in chain:
        if m and m not in out:
            out.append(m)
    return out


def available() -> bool:
    """지금 부를 수 있는가. 키가 있고, 쉬는 중이 아니어야 합니다."""
    return bool(api_key()) and time.time() >= _state["blocked_until"]


def status() -> dict:
    return {
        "configured": bool(api_key()),
        "model": model() if api_key() else None,
        "available_now": available(),
        "calls": _state["calls"],
        "fails": _state["fails"],
        "last_error": _state["last_error"] or None,
    }


def _payload(prompt: str, system: str | None, schema: dict | None,
             max_tokens: int, temperature: float) -> dict:
    cfg: dict = {
        "maxOutputTokens": max_tokens,
        "temperature": temperature,
        # 생각을 끕니다. 이 서비스가 시키는 일 — 갈래 고르기, 사실을 문장으로
        # 엮기 — 은 추론이 필요한 일이 아닙니다. 켜 두면 응답만 느려지고
        # 출력 한도를 생각이 먹어 본문이 잘립니다.
        "thinkingConfig": {"thinkingBudget": 0},
    }
    if schema:
        cfg["responseMimeType"] = "application/json"
        cfg["responseSchema"] = schema

    body: dict = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": cfg,
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    return body


async def generate(prompt: str, system: str | None = None, *,
                   schema: dict | None = None, max_tokens: int = 1200,
                   temperature: float = 0.4) -> str | dict | None:
    """부르고, 안 되면 None. 예외를 밖으로 던지지 않습니다.

    부르는 쪽이 try/except로 감싸는 것을 잊으면 그 순간 서비스가 죽습니다.
    LLM은 있으면 좋은 것이지 있어야 하는 것이 아니므로, 실패를 값으로
    돌려주는 편이 안전합니다.
    """
    if not available():
        return None

    key = api_key()

    for m in _model_chain():
      url = f"{BASE}/{m}:generateContent"
      body = _payload(prompt, system, schema, max_tokens, temperature)
      if "2.5" not in m:
          # thinkingConfig는 2.5 계열 전용 — 2.0에 보내면 400이 납니다.
          body["generationConfig"].pop("thinkingConfig", None)
      for attempt in range(RETRY + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.post(url, json=body, headers={
                    "x-goog-api-key": key, "Content-Type": "application/json"})
            if r.status_code == 429 or r.status_code >= 500:
                # 이 모델 쿼터가 소진 — 다음 형제 모델로 넘어갑니다.
                _state["fails"] += 1
                _state["last_error"] = f"{m} {r.status_code}"
                break
            if r.status_code == 404:
                break                      # 모델명 폐기 — 다음 모델로
            r.raise_for_status()
            data = r.json()

            cand = (data.get("candidates") or [{}])[0]
            parts = (cand.get("content") or {}).get("parts") or []
            text = "".join(p.get("text", "") for p in parts).strip()
            if not text:
                # 생각만 하다 끝난 경우입니다. 재시도해도 같으므로 물러납니다.
                _state["fails"] += 1
                return None

            _state["calls"] += 1
            if schema:
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return None
            return text

        except (httpx.HTTPError, KeyError, ValueError):
            if attempt >= RETRY:
                _state["fails"] += 1
                break                      # 이 모델 포기 — 다음 모델로

    # 체인 전부 실패 — 잠시 쉬어 429 폭풍을 막습니다.
    _state["blocked_until"] = time.time() + _COOLDOWN
    return None
