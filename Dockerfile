# KB-꿀비 배포 이미지 — 화면과 API를 한 주소에서 내보냅니다.
#
# 다단계로 짓습니다. 1단계에서 Next를 정적 파일로 뽑고, 2단계 파이썬 이미지에
# 그 결과만 얹습니다. node_modules(수백 MB)는 최종 이미지에 남지 않습니다.
#
# Render 무료 등급이 512MB입니다. 실측으로 맞춰 둔 것들:
#   · Node 프로세스를 안 띄웁니다 — 화면은 정적 파일, FastAPI가 서빙
#   · 질의 인코더 토크나이저를 sentencepiece로 (tokenizers 280MB → 70MB)
#   · onnxruntime 메모리 아레나 끔 (200MB → 9MB)
#   합쳐서 요청 처리 중 354MB.

# ── 1단계. 화면 ───────────────────────────────────────────────────────────
FROM node:20-slim AS web

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
# STATIC_EXPORT=1이면 next.config.mjs가 output:'export'로 바뀝니다.
ENV STATIC_EXPORT=1
# 카카오 지도 JS 키 — NEXT_PUBLIC_*은 빌드 때 정적 파일에 박히므로
# 런타임 env로는 늦습니다. Render가 빌드 시 env를 ARG처럼 넘겨 줍니다.
# 없으면 빈 값 → Leaflet 지도로 폴백 (기능 동일).
ARG NEXT_PUBLIC_KAKAO_MAP_KEY=
ENV NEXT_PUBLIC_KAKAO_MAP_KEY=${NEXT_PUBLIC_KAKAO_MAP_KEY}
RUN npm run build


# ── 2단계. 질의 인코더 ────────────────────────────────────────────────────
# 118MB라 저장소에 넣을 수 없습니다(GitHub 한 파일 한도 100MB). 이미지를
# 지을 때 받습니다. 받기에 실패해도 빌드를 세우지 않습니다 — 인코더가 없으면
# 검색이 BM25만으로 물러설 뿐 서비스는 뜹니다.
FROM python:3.11-slim AS encoder

WORKDIR /app
COPY backend/scripts/fetch_query_encoder.py ./scripts/
# mkdir을 먼저 합니다. 받기에 실패했을 때 || 로 RUN은 넘어가지만 디렉터리가
# 없으면 아래 COPY --from=encoder 에서 빌드가 통째로 죽습니다. 인코더는
# 없어도 되는 것(검색이 BM25로 물러섬)이라 빌드를 세울 이유가 없습니다.
RUN mkdir -p /app/models \
    && (python -m scripts.fetch_query_encoder || echo "인코더 없이 진행합니다")


# ── 3단계. 서비스 ─────────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/scripts ./scripts

COPY --from=encoder /app/models ./models
COPY --from=web /build/out ./web

EXPOSE 8000

# 일꾼 하나. 512MB 안에서 두 개를 띄우면 색인이 두 벌 올라갑니다.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
