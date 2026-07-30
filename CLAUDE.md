# 프로젝트 명세: KB-꿀비 (KB-KkulBee)
2026 제8회 KB AI Challenge 예선 제출용 소상공인 올인원 3D Multi-Agent 컨설팅 플랫폼

## 1. 기본 정보
- **팀명**: 꿀정보 모아주는 AI 비서: 꿀비 (줄임/마스코트: 꿀비)
- **과제 유형**: [Pick No.3 소상공인 지원] + [Pick No.2 최적 입지] Cross-Over (+ [Pick No.4 소비자보호 Guardrail])

## 2. 기술 스택
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, @splinetool/react-spline, Leaflet.js
- **Backend**: FastAPI, Python 3.11+, LangGraph, LangChain
- **DB/Vector**: Supabase (PostgreSQL + pgvector) / ChromaDB (A6000 GPU 연동)

## 3. 핵심 규칙 & Guardrails
- FastAPI /api/v1/chat 응답 시 3D 모션 상태값 character_motion('fly_happy'|'thinking'|'explaining')을 반드시 포함할 것.
- 금융소비자보호법 준수를 위해 대출 확정 단정 문구 금지 및 추천 사유(XAI)와 KB 공식 신청 링크를 함께 반환할 것.
