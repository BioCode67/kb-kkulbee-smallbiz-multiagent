"""소상공인시장진흥공단 상권정보 Open API — 선택 연동 클라이언트.

기본 경로는 어디까지나 파일 색인입니다. 전국 점포 2,725,318개를 전량
동기화해 행정동 백분위·요인 분해까지 미리 계산해 두는 방식은 단건 조회
API로는 불가능하고, 키·네트워크 사정과 무관하게 시연 환경을 타지 않습니다.

이 모듈은 그 위의 **선택 확장**입니다 — `SBIZ_API_KEY`(공공데이터포털
발급)가 설정된 환경에서만 실시간 반경 조회로 최신 점포를 확인하고,
키가 없거나 호출이 실패하면 조용히 파일 색인으로 폴백합니다.
어떤 경우에도 이 모듈의 실패가 상담 흐름을 멈추지 않습니다.

    from app.services import sbiz_api
    live = sbiz_api.stores_in_radius(lat=37.5626, lng=126.9256, radius_m=500)
    if live is None:      # 키 없음/실패 → 호출자는 기존 파일 색인을 그대로 사용
        ...

API: 공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」 storeListInRadius
"""
from __future__ import annotations

import os
from typing import Any

import httpx

BASE_URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInRadius"
_TIMEOUT = 4.0  # 상담 흐름을 잡아 두지 않는다 — 늦으면 파일 색인이 답한다


def enabled() -> bool:
    """실시간 조회 사용 가능 여부 — 키가 있어야만 켜집니다."""
    return bool(os.getenv("SBIZ_API_KEY"))


def stores_in_radius(
    lat: float, lng: float, radius_m: int = 500, page: int = 1, rows: int = 100,
) -> list[dict[str, Any]] | None:
    """반경 내 점포 실시간 조회. 키 없음/오류/타임아웃이면 None (→ 파일 색인 폴백).

    반환 항목은 파일 색인과 같은 원천(상가정보)이라 필드 의미가 동일합니다.
    """
    key = os.getenv("SBIZ_API_KEY")
    if not key:
        return None
    try:
        r = httpx.get(
            BASE_URL,
            params={
                "serviceKey": key, "radius": radius_m, "cx": lng, "cy": lat,
                "pageNo": page, "numOfRows": rows, "type": "json",
            },
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        body = r.json().get("body", {})
        items = body.get("items", [])
        return items if isinstance(items, list) else None
    except Exception:
        # 원인 불문 폴백 — 실시간은 보너스이지 전제가 아니다
        return None
