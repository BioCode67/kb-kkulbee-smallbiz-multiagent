"""지역 필터 — "경산 사장님께 인천 공고를 내밀지 않는다" (실사용 제보로 추가).

시도명이 없는 질문("경산에서 카페")에서 지역 판독이 꺼지면 필터 전체가
꺼진다. 시군구→시도 매핑과 동음이의 방어를 함께 시험한다.
"""
from app.services import policy_search as ps
from app.services import region_map


def test_sigungu_resolves_to_sido():
    assert ps.region_of("경산에서 카페 하려는데 운영자금") == "경북"
    assert ps.region_of("목포 수산물 가게 지원사업 있나요") == "전남"
    assert ps.region_of("수원 헬스장 창업") == "경기"


def test_sido_still_wins():
    assert ps.region_of("서울 마포구 연남동") == "서울"
    assert ps.region_of("경북 경산시 대동") == "경북"


def test_homonyms_are_not_regions():
    # '고양이'의 '고양', '제품 양산'의 '양산', '진주 목걸이'의 '진주'
    assert region_map.sido_of("고양이 용품 가게 창업") is None
    assert region_map.sido_of("제품 양산 패키지 지원") is None
    assert region_map.sido_of("진주 목걸이 공방") is None
    # 접미가 붙으면 지역이 맞다
    assert region_map.sido_of("양산시 소상공인 지원") == "경남"
    assert ps.region_of("자금이 필요해요") is None


def test_title_scan_has_boundaries():
    # '발명특허대전'의 '대전'은 지역이 아니다
    assert "대전" not in region_map.sido_mentions("대한민국발명특허대전 출품 공고")
    assert region_map.sido_mentions("[대전ㆍ세종] 충청권 지원") >= {"대전", "세종"}


def test_search_excludes_other_regions():
    res = ps.search("경산에서 쓸 운영자금 대출 알아봐줘", k=8)
    assert res, "결과가 있어야 한다"
    for d in res:
        regs = d.get("regions") or []
        if regs:
            assert "경북" in regs, f"타지역 공고가 새어 나옴: {regs} {d['title'][:40]}"
