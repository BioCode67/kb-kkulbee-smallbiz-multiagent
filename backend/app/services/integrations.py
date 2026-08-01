"""외부 연동 한눈에 — 무엇이 연결됐고, 무엇을 꽂으면 무엇이 켜지는가.

키가 하나씩 나중에 도착합니다(finlife는 지금 심사 중입니다). 그때마다
코드를 뒤지며 "이 키를 어디에 넣지?"를 반복하지 않도록, 연동 하나가
레코드 하나로 정리되어 있습니다. 새 키가 오면 .env에 한 줄 넣고
/api/v1/integrations에서 켜졌는지 확인하면 끝입니다.

여기 있는 것은 상태 조회뿐입니다 — 실제 호출 코드는 각 서비스 모듈에
있습니다. 상태와 구현이 한 파일에 섞이면 상태 조회가 무거워집니다.
"""
from __future__ import annotations

import os


def _has(env: str) -> bool:
    return bool(os.getenv(env, "").strip())


def status() -> list[dict]:
    """연동 목록. 화면·문서·점검이 모두 이 하나를 봅니다."""
    return [
        {
            "key": "gemini",
            "name": "Google Gemini",
            "env": "GEMINI_API_KEY",
            "configured": _has("GEMINI_API_KEY"),
            "enables": "질문 이해(갈래·지역·업종)와 답변 문장 생성",
            "without": "낱말 규칙 + 문장 틀로 동일 기능 (품질만 다름)",
            "where": "app/services/llm.py",
        },
        {
            "key": "finlife",
            "name": "금융감독원 금융상품 한눈에",
            "env": "FINLIFE_API_KEY",
            "configured": _has("FINLIFE_API_KEY"),
            "enables": "융자·보증 답변에 은행권 공시 금리 비교 카드 (KB 강조)",
            "without": "카드가 조용히 빠짐 — 나머지 전부 정상",
            "where": "app/services/finlife.py",
            "apply": "finlife.fss.or.kr 하단 오픈API → 인증키 신청",
        },
        {
            "key": "kakao_map",
            "name": "카카오 지도 (JavaScript)",
            "env": "NEXT_PUBLIC_KAKAO_MAP_KEY",
            "configured": _has("NEXT_PUBLIC_KAKAO_MAP_KEY"),
            "enables": "국내 상세 지도 타일 (건물·지번 수준)",
            "without": "Leaflet + CARTO 타일 — 점포 좌표는 동일하게 찍힘",
            "where": "frontend/components/LocationMap.tsx",
            "apply": "developers.kakao.com → 앱 생성 → JavaScript 키 + 도메인 등록",
        },
        {
            "key": "bizinfo",
            "name": "기업마당 공고 (자체 수집)",
            "env": None,
            "configured": True,
            "enables": "정책자금 검색 900건 — 키 불필요, 색인 포함",
            "where": "app/services/policy_search.py",
        },
        {
            "key": "sbiz_store",
            "name": "상가(상권)정보 (자체 색인)",
            "env": None,
            "configured": True,
            "enables": "상권 점수·지도·기회업종 — 키 불필요, 색인 포함",
            "where": "app/services/market_data.py",
        },
    ]
