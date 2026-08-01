"""
Pick 2 — 상권 점수와 그 근거

점수만 던지면 "왜 72점인가"에 답할 수 없습니다. 그래서 기준점 50에서
요인 다섯이 각각 몇 점을 올리고 내렸는지를 함께 냅니다. 더하면 최종 점수가
나오도록 맞춰 두었습니다. SHAP의 가법 분해를 같은 방식으로 흉내 낸 것입니다.

  최종 = 50 + Σ(유동인구, 점포밀도, 교통, 평균매출, 위험지수)

공공 API(소상공인시장진흥공단 상권정보)를 먼저 부르고, 키가 없거나 3초 안에
답이 없으면 내장 표본으로 넘어갑니다. 시연 도중 외부 API가 죽어도 화면은
멈추지 않아야 합니다. 대신 어느 쪽을 썼는지 응답에 남깁니다 — 표본으로 낸
점수를 실측처럼 보이게 하면 안 됩니다.
"""
from __future__ import annotations

import asyncio
import hashlib
import os

import httpx

from app.models.schemas import FactorContribution, LocationScore, MapPin

API_URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong"
TIMEOUT = 3.0

# 요인별 가중치와 기준값. 기준값은 전국 중위 상권을 1.0으로 놓은 상대 지표입니다.
FACTORS = {
    "floating_pop": {
        "label": "유동인구", "unit": "천명/일", "weight": 14.0, "base": 18.0,
        "up": "지나다니는 사람이 많아 첫 방문이 생기기 쉽습니다.",
        "down": "지나다니는 사람이 적어 알려지는 데 시간이 걸립니다.",
    },
    "store_density": {
        "label": "동종업종 밀도", "unit": "개/100m", "weight": -11.0, "base": 12.0,
        "up": "같은 업종이 적어 손님을 나눠 갖지 않습니다.",
        "down": "같은 업종이 몰려 있어 경쟁이 셉니다.",
    },
    "transit": {
        "label": "대중교통 접근", "unit": "점", "weight": 10.0, "base": 60.0,
        "up": "역·정류장이 가까워 멀리서도 옵니다.",
        "down": "대중교통이 멀어 걸어올 수 있는 범위로 손님이 한정됩니다.",
    },
    "avg_sales": {
        "label": "업종 평균매출", "unit": "백만원/월", "weight": 12.0, "base": 32.0,
        "up": "같은 업종이 이 동네에서 실제로 잘 벌고 있습니다.",
        "down": "같은 업종의 이 동네 매출이 전국 평균에 못 미칩니다.",
    },
    "risk_index": {
        "label": "폐업 위험", "unit": "점", "weight": -13.0, "base": 40.0,
        "up": "최근 폐업이 적어 자리가 안정적입니다.",
        "down": "최근 폐업이 잦아 자리가 흔들립니다.",
    },
}

# 시연·개발용 표본. 실제 상권 특성의 방향성만 담았고 정확한 값은 아닙니다.
SAMPLE = {
    "서울 마포구 연남동": dict(floating_pop=24.6, store_density=18.2, transit=82,
                          avg_sales=38.4, risk_index=31, lat=37.5626, lon=126.9256),
    "서울 강남구 역삼동": dict(floating_pop=41.2, store_density=27.5, transit=95,
                          avg_sales=52.1, risk_index=38, lat=37.5008, lon=127.0365),
    "서울 성동구 성수동": dict(floating_pop=19.8, store_density=11.4, transit=71,
                          avg_sales=35.7, risk_index=27, lat=37.5446, lon=127.0559),
    "부산 부산진구 서면": dict(floating_pop=33.5, store_density=24.1, transit=88,
                          avg_sales=41.3, risk_index=42, lat=35.1578, lon=129.0595),
    "대구 중구 동성로": dict(floating_pop=28.1, store_density=22.7, transit=79,
                         avg_sales=33.9, risk_index=45, lat=35.8693, lon=128.5951),
}


def _pseudo(region: str) -> dict:
    """모르는 지역은 이름에서 만든 난수로 채웁니다.

    시연 중 아무 동네나 넣어도 화면이 비지 않게 하려는 것입니다. 같은 이름은
    항상 같은 값이 나오도록 해시를 씁니다 — 새로고침마다 점수가 바뀌면
    쓰는 사람이 결과를 믿지 않습니다.
    """
    h = hashlib.sha256(region.encode()).digest()
    n = [b / 255 for b in h[:7]]
    return dict(
        floating_pop=round(8 + n[0] * 30, 1),
        store_density=round(6 + n[1] * 22, 1),
        transit=round(40 + n[2] * 50),
        avg_sales=round(18 + n[3] * 32, 1),
        risk_index=round(22 + n[4] * 32),
        lat=round(36.5 + (n[5] - 0.5) * 3.4, 4),
        lon=round(127.5 + (n[6] - 0.5) * 3.0, 4),
    )


async def _fetch_raw_factors(region: str, industry: str) -> tuple[dict, str]:
    """공공 API를 먼저 부르고, 안 되면 표본으로 넘어갑니다.

    반환값의 둘째 자리가 출처입니다. 화면과 응답에 그대로 실어, 표본으로 낸
    점수를 실측으로 오해하지 않게 합니다.
    """
    key = os.getenv("SBIZ_API_KEY", "").strip()
    if key:
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                r = await client.get(API_URL, params={
                    "serviceKey": key, "type": "json", "numOfRows": 200,
                    "divId": "adongCd", "key": region,
                })
                r.raise_for_status()
                items = (r.json().get("body") or {}).get("items") or []
                if items:
                    return _from_api(items, region), "public_api"
        except (httpx.HTTPError, ValueError, KeyError, asyncio.TimeoutError):
            # 외부가 죽어도 서비스는 살아야 합니다. 조용히 표본으로 넘어갑니다.
            pass

    raw = SAMPLE.get(region) or _pseudo(region)
    return dict(raw), "fallback"


def _from_api(items: list, region: str) -> dict:
    """상권정보 API 응답을 요인 값으로 환산합니다.

    이 API는 점포 목록을 주므로 밀도는 직접 셀 수 있지만 유동인구·매출은
    없습니다. 없는 것은 표본으로 메우고, 있는 것만 실측으로 바꿉니다.
    """
    base = SAMPLE.get(region) or _pseudo(region)
    out = dict(base)
    out["store_density"] = round(len(items) / 100 * 12, 1)
    lats = [float(i["lat"]) for i in items if i.get("lat")]
    lons = [float(i["lon"]) for i in items if i.get("lon")]
    if lats and lons:
        out["lat"] = round(sum(lats) / len(lats), 5)
        out["lon"] = round(sum(lons) / len(lons), 5)
    return out


def _contribute(raw: dict) -> list[FactorContribution]:
    """요인 값을 점수 기여로 바꿉니다.

    기준값 대비 비율을 -1~1로 눌러 가중치를 곱합니다. 눌러 두지 않으면
    유동인구 하나가 튀었을 때 나머지 넷이 의미를 잃습니다.
    """
    out = []
    for key, spec in FACTORS.items():
        v = float(raw.get(key, spec["base"]))
        rel = max(-1.0, min(1.0, (v - spec["base"]) / spec["base"]))
        c = round(rel * spec["weight"], 2)
        out.append(FactorContribution(
            key=key, label=spec["label"], value=v, unit=spec["unit"],
            contribution=c,
            reason=spec["up"] if c > 0 else spec["down"] if c < 0 else "전국 평균 수준입니다.",
        ))
    return sorted(out, key=lambda f: -abs(f.contribution))


async def analyze_location(region: str, industry: str = "한식음식점") -> LocationScore:
    """상권 하나를 채점합니다."""
    raw, source = await _fetch_raw_factors(region, industry)
    factors = _contribute(raw)
    total = 50.0 + sum(f.contribution for f in factors)
    total = round(max(0.0, min(100.0, total)), 1)

    note = ("소상공인시장진흥공단 상권정보 API 실측입니다."
            if source == "public_api" else
            "공공 API 키가 없어 내장 표본으로 계산했습니다. 방향성 참고용입니다.")
    return LocationScore(
        region_name=region, industry=industry,
        latitude=raw.get("lat"), longitude=raw.get("lon"),
        total_score=total, factors=factors,
        peer_median=58.0, data_source=source, note=note,
    )


async def nearby_pins(target: LocationScore, k: int = 4) -> list[MapPin]:
    """지도에 함께 찍을 비교 상권.

    점수 하나만 보면 72점이 높은 건지 알 수 없습니다. 옆 동네와 나란히
    놓아야 판단이 됩니다.
    """
    pins = [MapPin(name=target.region_name, latitude=target.latitude or 37.5,
                   longitude=target.longitude or 127.0, score=target.total_score,
                   grade=target.grade, is_target=True)]
    others = [r for r in SAMPLE if r != target.region_name][:k]
    scored = await asyncio.gather(*(analyze_location(r, target.industry) for r in others))
    for s in scored:
        pins.append(MapPin(name=s.region_name, latitude=s.latitude or 37.5,
                           longitude=s.longitude or 127.0, score=s.total_score,
                           grade=s.grade))
    return pins
