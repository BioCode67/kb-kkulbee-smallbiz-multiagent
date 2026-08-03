"""카카오 로컬 검색 — 지도에서 누른 자리 주변의 '실제 가게'.

점포 점(행안부 좌표)에는 상호명이 없습니다. 좌표만으로는 "점 하나가
가게 하나"까지가 한계였습니다. 사장님이 지도를 누르면 그 자리 주변을
카카오 로컬 검색으로 실시간 조회해 이름·업종·거리·카카오맵 링크를
보여줍니다 — 전부 카카오가 지금 서비스 중인 실데이터입니다.

키(KAKAO_REST_API_KEY)가 없으면 조용히 빠집니다. 캐시는 좌표를 소수
4자리(약 10m)로 접어 하루 동안 유지합니다 — 같은 골목을 연타할 때마다
카카오를 두드릴 이유가 없습니다.
"""
from __future__ import annotations

import os
import time

import httpx

BASE = "https://dapi.kakao.com/v2/local/search/keyword.json"
CACHE_TTL = 60 * 60 * 24
RADIUS = 350          # m — 걸어서 5분, '같은 골목' 감각의 반경입니다

_mem: dict = {}


def api_key() -> str:
    return os.getenv("KAKAO_REST_API_KEY", "").strip()


def available() -> bool:
    return bool(api_key())


async def nearby(lat: float, lng: float, query: str | None) -> dict | None:
    """클릭 지점 반경 350m의 가게 목록. 실패하면 None — 패널이 빠질 뿐입니다."""
    if not available():
        return None
    q = (query or "음식점").strip()[:20]
    ck = (round(lat, 4), round(lng, 4), q)
    now = time.time()
    hit = _mem.get(ck)
    if hit and hit["at"] > now - CACHE_TTL:
        return hit["data"]

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(BASE, params={
                "query": q, "x": lng, "y": lat,
                "radius": RADIUS, "sort": "distance", "size": 10,
            }, headers={"Authorization": f"KakaoAK {api_key()}"})
            r.raise_for_status()
            docs = r.json().get("documents", [])
    except (httpx.HTTPError, ValueError):
        return None

    places = [{
        "name": d.get("place_name", ""),
        # "음식점 > 카페 > 커피전문점" — 마지막 토막이 화면에 맞는 크기
        "category": (d.get("category_name") or "").split(">")[-1].strip(),
        "dist": int(d["distance"]) if str(d.get("distance", "")).isdigit() else None,
        "url": d.get("place_url", ""),
        "road": d.get("road_address_name", ""),
        "phone": d.get("phone", ""),
    } for d in docs if d.get("place_name")]

    data = {
        "ok": True, "query": q, "radius": RADIUS, "places": places,
        "note": "카카오 로컬 실시간 검색 결과입니다. 반경 350m, 가까운 순 최대 10곳.",
    } if places else None
    _mem[ck] = {"at": now, "data": data}
    return data
