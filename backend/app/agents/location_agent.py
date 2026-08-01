"""Pick 2 — 상권 점수와 그 근거

**전에는 전부 지어낸 값이었습니다.** 동네 다섯 곳은 손으로 적었고, 나머지는
동네 이름을 해시해 만든 난수였습니다. 위경도까지 한반도 한가운데 무작위라
연남동을 물으면 충청도 어딘가에 점이 찍혔습니다. 그런데 화면에는 "유동인구
24.6천명/일"처럼 소수점 한 자리까지 나갔습니다. 실측처럼 보였습니다.

지금은 실제로 센 것만 씁니다.

  출처: 공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」 2026-03-31
        전국 점포 2,725,318개 · 행정동 3,450곳

점수는 기준점 50에서 요인 다섯이 올리고 내린 몫을 더한 것입니다. 요인마다
**전국 행정동 분포에서의 백분위**로 잽니다. "카페 204개"는 그 자체로 많은지
알 수 없고, 전국에서 몇 %에 드는지를 알아야 뜻이 생깁니다.

  최종 = 50 + Σ(상권 규모, 동종업종 경쟁, 업종 집적, 업종 다양성, 점포 밀집도)

**넣지 않은 것.** 유동인구·매출·폐업률·임대료는 이 자료에 없습니다. 추정해
채우면 다시 지어내는 것이므로 넣지 않고, 없다는 사실을 응답에 실어 화면이
그대로 보이게 합니다.
"""
from __future__ import annotations

from app.models.schemas import (
    FactorContribution, IndustryGap, LocationScore, MapPin,
)
from app.services import market_data

# 요인 다섯. 방향과 무게는 상권 분석의 통상적인 해석을 따릅니다.
#
# 무게를 학습으로 정하지 않은 것은 정답(그 자리에서 실제로 성공했는가)이
# 없기 때문입니다. 매출 자료가 있으면 회귀로 맞출 수 있지만 지금은 없습니다.
# 손으로 정한 무게라는 사실을 감추지 않고 화면에 적습니다.
FACTORS = {
    "market_size": {
        "label": "상권 규모", "unit": "개", "weight": 12.0,
        "up": "점포가 많이 모인 곳이라 사람이 이 동네를 목적지로 찾아옵니다.",
        "down": "점포가 적어 이 동네 자체를 찾아오는 사람은 많지 않습니다.",
    },
    "competition": {
        "label": "동종업종 경쟁", "unit": "개", "weight": -13.0,
        "up": "같은 업종이 적어 손님을 나눠 갖지 않습니다.",
        "down": "같은 업종이 몰려 있어 경쟁이 셉니다.",
    },
    "cluster": {
        "label": "같은 계열 집적", "unit": "%", "weight": 9.0,
        "up": "같은 계열 업종이 모여 있어 '그거 먹으러/사러 가는 동네'가 되어 있습니다.",
        "down": "같은 계열이 흩어져 있어 목적 방문을 기대하기 어렵습니다.",
    },
    "diversity": {
        "label": "업종 다양성", "unit": "", "weight": 6.0,
        "up": "여러 업종이 고루 섞인 생활 상권입니다. 오가는 이유가 많습니다.",
        "down": "몇몇 업종에 쏠려 있어 그 업종 손님만 오갑니다.",
    },
    "density": {
        "label": "점포 밀집도", "unit": "개/㎢", "weight": 10.0,
        "up": "좁은 범위에 점포가 붙어 있어 걸어서 여러 곳을 들릅니다.",
        "down": "점포가 흩어져 있어 걸어서 옮겨 다니기 어렵습니다.",
    },
    "infra": {
        "label": "생활 인프라", "unit": "종", "weight": 6.0,
        "up": "약국·편의점·의원 같은 생활 시설이 갖춰져 있어 평일에도 사람이 오가는 동네입니다.",
        "down": "생활 시설이 옅어 특정 시간대에만 사람이 몰리는 동네일 수 있습니다.",
    },
}

# 이 자료로는 못 재는 것들. 감추지 않고 그대로 내보냅니다.
NOT_MEASURED = [
    {"label": "유동인구", "why": "상가정보 자료에 없습니다. 통신·카드사 자료가 있어야 합니다."},
    {"label": "매출", "why": "점포별 매출은 공개되지 않습니다."},
    {"label": "폐업률", "why": "이 자료는 현재 영업 중인 점포만 담고 있어 폐업을 셀 수 없습니다."},
    {"label": "임대료", "why": "행정동 단위로 공개된 자료가 없습니다."},
]


def _top(p: float) -> str:
    """상위 몇 %인지 사람이 읽는 말로. '상위 0%'는 뜻이 통하지 않습니다."""
    t = (1.0 - p) * 100
    if t < 0.5:
        return "0.5% 안"
    if t < 10:
        return f"{t:.1f}%"
    return f"{t:.0f}%"


def _pct_factor(key: str, value: float, pct: float, note: str = "") -> FactorContribution:
    """백분위를 점수 기여로 바꿉니다.

    50%면 0점, 100%면 무게만큼, 0%면 무게만큼 반대로. 중간 동네가 기준점
    50점을 그대로 받도록 맞춰 둔 것입니다.
    """
    spec = FACTORS[key]
    rel = (pct - 0.5) * 2.0
    c = round(rel * spec["weight"], 2)
    return FactorContribution(
        key=key, label=spec["label"], value=round(value, 2), unit=spec["unit"],
        contribution=c,
        reason=(note or (spec["up"] if c > 0 else spec["down"] if c < 0
                         else "전국 중간 수준입니다.")),
    )


def analyze(region: str, industry: str | None = None) -> LocationScore | None:
    """상권 하나를 채점합니다. 자료에 없는 동네면 None입니다.

    없는 동네에 점수를 주지 않습니다. 예전에는 이름만 있으면 난수로
    채워 무엇이든 답했습니다. 답이 있는 것처럼 보이는 편이 아무것도 없는
    것보다 나빴습니다.
    """
    d = market_data.find_dong(region)
    if not d:
        return None

    nat = market_data._load()["nation"]
    ind = market_data.find_industry(industry)
    factors: list[FactorContribution] = []

    # 1. 상권 규모 — 동 안의 총 점포수
    p = market_data.percentile(nat["stores_dist"], d["stores"])
    factors.append(_pct_factor(
        "market_size", d["stores"], p,
        f"점포 {d['stores']:,}개로 전국 행정동 중 상위 {_top(p)}입니다."))

    # 2. 동종업종 경쟁 — 업종을 모르면 이 요인은 빼고 셉니다
    if ind:
        code, name = ind
        mine = d["small"].get(code, 0)
        dist = nat["small_dist"].get(code)
        if dist:
            p = market_data.percentile(dist, mine)
            # 백분위를 그대로 넘깁니다. 뒤집는 일은 무게(-13)가 합니다.
            # 여기서 한 번 더 뒤집었다가 "경쟁이 세다"면서 점수는 올라가는
            # 결과가 나왔습니다. 뒤집기는 한 군데서만 해야 합니다.
            factors.append(_pct_factor(
                "competition", mine, p,
                f"{name}이(가) {mine}개 있습니다. 같은 업종이 있는 전국 행정동 "
                f"{len(dist):,}곳 중 상위 {_top(p)}로 "
                f"{'경쟁이 센 편' if p > 0.6 else '경쟁이 덜한 편' if p < 0.4 else '중간'}입니다."))

        # 3. 같은 계열 집적 — 대분류(음식·소매 …) 비중이 전국 평균보다 높은가
        large = code[:2]
        share = d["large"].get(large, 0) / max(d["stores"], 1)
        nat_share = (sum(v for k, v in nat["small_national"].items() if k[:2] == large)
                     / max(sum(nat["small_national"].values()), 1))
        rel = share / nat_share if nat_share else 1.0
        p = min(1.0, max(0.0, 0.5 + (rel - 1.0) * 0.9))
        factors.append(_pct_factor(
            "cluster", share * 100, p,
            f"{nat['large_name'].get(large, large)} 계열이 이 동네 점포의 "
            f"{share*100:.0f}%입니다. 전국 평균 {nat_share*100:.0f}%의 {rel:.1f}배입니다."))

    # 4. 업종 다양성
    p = market_data.percentile(nat["diversity_dist"], d["diversity"])
    factors.append(_pct_factor("diversity", d["diversity"], p))

    # 5. 생활 인프라 — 약국·편의점·의원 밀도. Pick 2 명세가 부르는
    #    '생활 인프라'를 이미 가진 점포 자료로 셉니다.
    infra = market_data.infra_of(d["code"])
    if infra:
        factors.append(_pct_factor(
            "infra", infra["coverage"], infra["pct"],
            f"약국·편의점·의원 등 아홉 종 중 {infra['coverage']}종이 있습니다"
            + (f" (없는 것: {'·'.join(infra['missing'][:3])})."
               if infra["missing"] else " — 다 갖춰져 있습니다.")))

    # 6. 점포 밀집도
    if d.get("density"):
        p = market_data.percentile(nat["density_dist"], d["density"])
        factors.append(_pct_factor(
            "density", d["density"], p,
            f"점포가 있는 범위 {d['area_km2']:.2f}㎢에 {d['stores']:,}개 — "
            f"㎢당 {d['density']:,.0f}개입니다."))

    factors.sort(key=lambda f: -abs(f.contribution))
    total = round(max(0.0, min(100.0, 50.0 + sum(f.contribution for f in factors))), 1)

    name = f"{d['sido'].replace('특별시','').replace('광역시','')} {d['sgg']} {d['dong']}"
    ind_label = ind[1] if ind else "업종 미지정"
    return LocationScore(
        region_name=name.strip(), industry=ind_label,
        latitude=d["lat"], longitude=d["lon"],
        dong_code=d["code"],
        industry_code=ind[0] if ind else None,
        same_industry_count=(d["small"].get(ind[0], 0) if ind else None),
        total_score=total, factors=factors,
        gaps=[IndustryGap(**o) for o in market_data.opportunities(d["code"], 6)],
        crowded=[IndustryGap(**{k: v for k, v in o.items() if k != "gap"})
                 for o in market_data.saturated(d["code"], 4)],
        peer_median=50.0,
        data_source="public_api",
        note=("공공데이터포털 「소상공인시장진흥공단_상가(상권)정보」 2026-03-31 "
              f"실측입니다. 전국 점포 272만 개·행정동 3,450곳 기준 백분위로 "
              f"계산했습니다. 유동인구·매출·폐업률은 이 자료에 없어 "
              f"점수에 넣지 않았습니다."),
    )


async def analyze_location(region: str, industry: str = "한식음식점") -> LocationScore | None:
    """워크플로가 부르는 자리. 실제 계산은 동기라 그대로 넘깁니다."""
    return analyze(region, industry)


async def nearby_pins(target: LocationScore, k: int = 4) -> list[MapPin]:
    """지도에 함께 찍을 비교 상권.

    점수 하나만 보면 62점이 높은 건지 알 수 없습니다. 같은 시군구의
    다른 동네와 나란히 놓아야 판단이 됩니다.
    """
    if target is None or target.latitude is None:
        return []
    pins = [MapPin(name=target.region_name, latitude=target.latitude,
                   longitude=target.longitude, score=target.total_score,
                   grade=target.grade, is_target=True)]

    d = market_data.find_dong(target.region_name)
    if not d:
        return pins
    for nb in market_data.neighbors(d["code"], k):
        s = analyze(f"{nb['sido']} {nb['sgg']} {nb['dong']}", target.industry)
        if s and s.latitude:
            pins.append(MapPin(name=s.region_name, latitude=s.latitude,
                               longitude=s.longitude, score=s.total_score,
                               grade=s.grade))
    return pins


def index_meta() -> dict:
    m = market_data.meta()
    m["not_measured_detail"] = NOT_MEASURED
    m["weights_note"] = ("요인 무게는 상권 분석의 통상적 해석을 따라 손으로 정했습니다. "
                         "학습으로 맞추려면 '그 자리에서 실제로 성공했는가'라는 정답이 "
                         "있어야 하는데, 점포별 매출은 공개되지 않습니다.")
    return m
