# 이어서 작업하기 — KB-꿀비

> 대화를 새로 시작할 때 이 파일 내용을 그대로 붙여 넣으면 됩니다.
> 마지막 갱신: 2026-08-01

---

## 지금 무엇을 하고 있나

**2026 제8회 KB AI Challenge** 예선 제출용 소상공인 3D Multi-Agent 컨설팅 플랫폼
**KB-꿀비**를 만들고 있습니다. 팀명은 *꿀정보 모아주는 AI 비서: 꿀비*.

- 저장소 `https://github.com/BioCode67/kb-kkulbee-smallbiz-multiagent`
- 작업 폴더 `/workspace/kb-kkulbee`
- **제출 마감 2026-08-03**
- **이 서버는 2026-08-13까지만 씁니다.** 그 뒤에도 살아야 하는 것은 외부에 올려 두어야 합니다.

과제는 세 갈래를 엮은 것입니다.
- Pick 2 최적 입지 — 상권 점수와 요인별 기여
- Pick 3 소상공인 금융 — 정책자금·KB 상품 매칭
- Pick 4 소비자 보호 — 분쟁 절차, 쉬운 용어, 금소법 가드레일

---

## 어디까지 됐나

### 되어 있는 것

**백엔드** (`backend/`, FastAPI + LangGraph, 가상환경 `backend/.venv`)
- `app/models/schemas.py` — 모든 응답의 계약. `character_motion` 필수
- `app/agents/workflow.py` — LangGraph. 라우터가 여러 갈래를 **동시에** 켜고
  **가드레일이 예외 없이 마지막에** 돎
- `app/agents/location_agent.py` — 상권 점수
- `app/agents/policy_agent.py` — 지원사업 매칭
- `app/agents/guardrail_agent.py` — 금소법 검사·재작성, 용어 15개, 절차 4단계
- `app/main.py` — `/api/v1/chat`, `/health`, `/terms`, `/guardrail/check`

**프런트엔드** (`frontend/`, Next.js 15.5.22 + Tailwind + Framer Motion)
- 꿀비가 첫 화면에 260px로 서 있다가 답하면 왼쪽 132px로 물러남 (`layoutId`로 연결)
- `components/BeeCharacter.tsx` — SVG 마스코트. 표정이 동작 상태 따라 바뀜
- `components/BeeStage.tsx` — Spline 씬 + SVG 묶음, 말풍선
- `components/BentoGrid.tsx` — 서버가 정한 카드를 그림 (Generative UI)
- `components/LocationMap.tsx` — Leaflet
- `npm run build` 통과함

**실제 데이터**
- `backend/app/data/bizinfo_programs.json` (18MB) — 기업마당 실제 공고 **900건**
  (소상공인 관련 693 / 금융 269 / 둘 다 247 / 금액 적힌 것 288)
- 수집기 `backend/app/services/bizinfo_ingest.py`, 캐시 `backend/.cache/bizinfo/`

### 아직 흉내인 것 — 여기가 남은 일입니다

| 항목 | 실상 |
|---|---|
| **상권 점수** | 모델이 없음. 손으로 정한 가중치 × 기준값 대비 비율. **모르는 지역은 이름 해시로 만든 가짜 숫자** |
| **정책자금 검색** | RAG가 아님. 손으로 적은 12건(`policies.json`)에 키워드 매칭. **900건을 아직 안 씀** |
| **LLM** | 없음. 답은 f-string, 라우터는 키워드 포함 여부 |
| **저장** | `session_id`를 만들지만 아무 데도 저장 안 함 |
| **테스트** | 없음 |

---

## 다음에 할 일 (순서대로)

### 1. 정책자금을 진짜 검색으로 — 가장 급함

900건이 이미 있는데 안 쓰고 있습니다.

- `sentence-transformers` + `chromadb` 설치돼 있음 (`backend/.venv`)
- GPU로 문서 임베딩을 **미리 계산**해 파일로 남길 것.
  서버가 8/13에 사라지므로 런타임이 GPU에 기대면 안 됨
- 질의 임베딩은 **CPU에서 도는 작은 모델**(ONNX)로. 그러면 키도 한도도 없이
  영원히 돎. `onnxruntime`, `optimum[onnxruntime]` 설치돼 있음
- 후보: `intfloat/multilingual-e5-small`(가벼움) / `dragonkue/BGE-m3-ko`(정확)
- `policy_agent.py`를 벡터 검색으로 갈아 끼우되 **추천 이유는 계속 내보낼 것.**
  유사도 0.87은 근거가 못 됨

### 2. 상권 점수에서 가짜 걷어내기

- 공공데이터포털 상권정보 API 키가 있으면 실측으로. 없으면 **표본이라는 사실을
  화면에 명시**할 것 (이미 `data_source` 필드로 구분은 하고 있음)
- 이름 해시 난수(`_pseudo`)는 시연용임을 코드와 화면 양쪽에 밝힐 것
- SHAP을 진짜로 계산하려면 학습된 모델이 필요. 데이터를 못 구하면
  "가중치는 문헌 근거"라고 정직하게 적는 편이 나음

### 3. LLM 층 올리기

**Gemini 키는 확인 완료.** 사용자가 갖고 있으며 환경변수로 넘김.

```
GEMINI_API_KEY=...            # 저장소에 넣지 말 것
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBED_MODEL=gemini-embedding-001
```

호출 방법 — 헤더 `x-goog-api-key`, 엔드포인트
`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

확인된 것과 주의할 점
- 생성·구조화 출력(`responseSchema`) 모두 동작함
- **`gemini-2.5-flash`는 생각 토큰을 씀.** `maxOutputTokens`를 300으로 두니
  답이 잘려 나왔음. 넉넉히 주거나 thinking budget을 끌 것
- 구조화 출력이 값을 영어로 뱉었음(`Seongsu-dong`). 한국어로 달라고 명시할 것
- 임베딩 모델 이름은 `gemini-embedding-001` (`text-embedding-004`는 404)

**키가 없거나 한도를 넘겨도 서비스가 죽으면 안 됨.** LLM은 답을 자연스럽게
만드는 층으로 두고, 없으면 지금 템플릿으로 되돌아가게 할 것.

### 4. 배포 — 8/13 전에 반드시

Render 하나로 묶는 것을 권함(주소가 하나여야 심사에서 헷갈리지 않음).
임업 프로젝트에서 같은 방식으로 해봤고, 그때 겪은 것들:
- 무료 등급 512MB / CPU 0.1개. 모델을 미리 다 올리면 터짐 → 지연 적재
- xgboost류는 `nthread=1`로 묶어야 오히려 빠름
- **판본이 학습 환경과 어긋나면 배포는 성공하는데 예측값만 조용히 달라짐**
- 15분 놀면 잠들어 첫 접속이 40~60초. GitHub Actions로 10분마다 깨우면 됨

### 5. 그 밖에

- 세션 저장 (SQLite면 충분)
- 테스트 (가드레일 재작성, 라우팅 분기, 스키마 검증)
- 샘플 칩 이모지가 이 서버엔 폰트가 없어 네모로 보임 → SVG로 바꾸면 안전
- README (심사위원이 볼 실행 방법)

---

## 사용자가 말한 것

- **"기능 제대로 구현좀. 지금은 겉보기에만 있는듯"** — 맞는 지적이었음.
  껍데기를 실제로 도는 것으로 바꾸는 게 지금의 최우선
- **디자인이 마음에 안 든다** 했고, v0.dev에서 마음에 드는 템플릿을 못 찾음.
  템플릿 주소를 몇 군데 알려 드렸고 찾으시면 그에 맞춰 다시 만들기로 함.
  (spline.design/community, ui.aceternity.com, godly.website, dribbble 등)
- 방향 제안 중 **밝은 배경 + 노란 포인트 + 3D 마스코트**를 권했음.
  지금은 어두운 배경인데 소상공인 서비스엔 밝은 쪽이 맞을 수 있음
- **중간중간 커밋·푸시**를 계속 요청함
- 사용자는 **다른 컴퓨터**에서 대화 중. 화면을 보려면 터널이 필요함

---

## 서버에서 지금 도는 것

```bash
# 백엔드
cd /workspace/kb-kkulbee/backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 프런트엔드 (백엔드로 프록시함)
cd /workspace/kb-kkulbee/frontend
npx next start -p 3001

# 사용자가 다른 컴퓨터에서 보려면 (임시 터널, 세션 끝나면 죽음)
cloudflared tunnel --url http://127.0.0.1:3001
```

GPU: A6000 48GB × 2, 둘 다 유휴. CUDA 확인됨 (torch 2.6.0+cu124).

---

## 일하는 방식에 대해

- **한 단계 끝날 때마다 커밋·푸시.** 커밋 메시지에는 무엇을 왜 그렇게 했는지,
  막혔다면 무엇에 막혔는지 적을 것
- **지어내지 말 것.** 데이터가 없으면 없다고 화면과 코드 양쪽에 밝힐 것.
  표본으로 낸 숫자를 실측처럼 보이게 두면 심사에서 무너짐
- 값을 바꾸는 최적화를 할 때는 **바꾸기 전과 후가 같은지 먼저 재 볼 것**
