"""행정동 상권 실측 자료 — 찾고, 재고, 비교합니다.

`scripts/build_market_index.py`가 만들어 둔 색인을 읽습니다. 전국 점포
272만 개를 행정동 3,450곳으로 접어 둔 것이고, 원자료는 공공데이터포털
「소상공인시장진흥공단_상가(상권)정보」 2026-03-31판입니다.

여기서 다루는 숫자는 전부 실제로 센 것입니다. **없는 것은 만들지 않습니다.**
유동인구·매출·폐업률은 이 자료에 없으므로 점수에 들어가지 않고, 화면에도
없다고 적힙니다. 예전에는 동네 이름을 해시해 만든 난수를 "유동인구
24.6천명/일"로 내보내고 있었습니다.
"""
from __future__ import annotations

import json
import os
import re
import threading
from bisect import bisect_left

INDEX_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "market_index")

_lock = threading.Lock()
_ix: dict = {}


def _load() -> dict:
    if _ix:
        return _ix
    with _lock:
        if _ix:
            return _ix
        with open(os.path.join(INDEX_DIR, "dong.json"), encoding="utf-8") as f:
            dong = json.load(f)
        with open(os.path.join(INDEX_DIR, "nation.json"), encoding="utf-8") as f:
            nation = json.load(f)
        with open(os.path.join(INDEX_DIR, "meta.json"), encoding="utf-8") as f:
            meta = json.load(f)

        # 이름으로 찾기 위한 뒤집힌 표. 같은 동 이름이 여럿이라 목록으로 둡니다
        # — '중앙동'은 전국에 스물 몇 곳입니다.
        by_name: dict[str, list[str]] = {}
        for code, v in dong.items():
            by_name.setdefault(v["dong"], []).append(code)

        # 업종 이름 → 소분류코드. 긴 이름이 먼저 걸리게 정렬해 둡니다.
        by_industry = sorted(
            ((name, code) for code, name in nation["small_name"].items() if name),
            key=lambda x: -len(x[0]))

        _ix.update(dong=dong, nation=nation, meta=meta,
                   by_name=by_name, by_industry=by_industry)
    return _ix


def meta() -> dict:
    return dict(_load()["meta"])


def available() -> bool:
    return os.path.exists(os.path.join(INDEX_DIR, "dong.json"))


# ── 백분위 ────────────────────────────────────────────────────────────────
def percentile(sorted_values: list, v: float) -> float:
    """전국 분포에서 이 값이 어디쯤인지. 0~1.

    "카페 204개"는 그 자체로 많은지 적은지 알 수 없습니다. 전국 행정동 중
    몇 %에 드는지를 알아야 뜻이 생깁니다.
    """
    if not sorted_values:
        return 0.5
    return bisect_left(sorted_values, v) / len(sorted_values)


# ── 동네 찾기 ─────────────────────────────────────────────────────────────
_SIDO_ALIAS = {
    "서울": "서울특별시", "부산": "부산광역시", "대구": "대구광역시",
    "인천": "인천광역시", "광주": "광주광역시", "대전": "대전광역시",
    "울산": "울산광역시", "세종": "세종특별자치시", "경기": "경기도",
    "강원": "강원특별자치도", "충북": "충청북도", "충남": "충청남도",
    "전북": "전북특별자치도", "전남": "전라남도", "경북": "경상북도",
    "경남": "경상남도", "제주": "제주특별자치도",
}

# 실제로 그렇게 부르는 곳들. 행정동 이름과 다릅니다.
_PLACE_ALIAS = {
    "홍대": ("서울특별시", "마포구", "서교동"),
    "연트럴파크": ("서울특별시", "마포구", "연남동"),
    "가로수길": ("서울특별시", "강남구", "신사동"),
    "경리단길": ("서울특별시", "용산구", "이태원1동"),
    "샤로수길": ("서울특별시", "관악구", "낙성대동"),
    "서면": ("부산광역시", "부산진구", "부전1동"),
    "동성로": ("대구광역시", "중구", "동성로"),
    "구도심": None,
}

_DONG_RE = re.compile(r"([가-힣]+(?:\d+)?(?:동|읍|면|가))")


def find_dong(text: str) -> dict | None:
    """'서울 마포구 연남동', '연남동', '홍대'에서 행정동 하나를 찾습니다.

    같은 이름이 여럿이면 시도·시군구가 함께 적혔는지 보고 좁힙니다. 그래도
    여럿이면 점포가 가장 많은 곳을 고릅니다 — 사람들이 '중앙동'이라 하면
    대개 가장 큰 중앙동을 뜻하기 때문입니다. 무엇을 골랐는지는 결과에
    시군구까지 붙여 돌려주므로 화면에서 확인할 수 있습니다.
    """
    ix = _load()
    if not text:
        return None
    t = text.strip()

    for alias, target in _PLACE_ALIAS.items():
        if target and alias in t:
            sido, sgg, dong = target
            for code, v in ix["dong"].items():
                if v["sido"] == sido and v["sgg"] == sgg and v["dong"] == dong:
                    return {"code": code, **v, "matched_as": alias}

    cands: list[str] = []
    names = _DONG_RE.findall(t)
    for name in names:
        cands += ix["by_name"].get(name, [])

    # 사람들이 부르는 이름과 행정동 이름이 다른 경우가 많습니다. '성수동'은
    # 행정동으로 성수1가1동·성수2가3동 …으로 쪼개져 있고, '역삼동'은
    # 역삼1동·역삼2동입니다. 그대로 찾으면 없다고 나옵니다.
    # 뒤의 '동'을 떼고 앞머리가 같은 행정동을 모읍니다.
    if not cands:
        for name in names:
            stem = re.sub(r"(동|가)$", "", name)
            if len(stem) < 2:
                continue
            cands += [c for c, v in ix["dong"].items() if v["dong"].startswith(stem)]

    if not cands:
        # 동 이름이 없으면 시군구 단위로 — '마포구 어디가 좋을까'
        m = re.search(r"([가-힣]+(?:시|군|구))", t)
        if m:
            cands = [c for c, v in ix["dong"].items() if v["sgg"] == m.group(1)]
    if not cands:
        return None

    want_sido = next((full for short, full in _SIDO_ALIAS.items()
                      if short in t or full in t), None)
    want_sgg = next((m for m in re.findall(r"([가-힣]+(?:시|군|구))", t)), None)

    def rank(code: str) -> tuple:
        v = ix["dong"][code]
        return (v["sido"] == want_sido if want_sido else False,
                v["sgg"] == want_sgg if want_sgg else False,
                v["stores"])

    best = max(cands, key=rank)
    return {"code": best, **ix["dong"][best]}


# ── 업종 찾기 ─────────────────────────────────────────────────────────────
# 사장님이 쓰는 말과 통계 분류명이 다릅니다. 자주 쓰는 것만 이어 둡니다.
_INDUSTRY_ALIAS = {
    "카페": "I21201", "커피": "I21201", "커피숍": "I21201", "디저트": "I21201",
    "한식": "I20101", "한식음식점": "I20101", "백반": "I20101", "식당": "I20101",
    "치킨": "I21006", "치킨집": "I21006", "닭": "I21006",
    "분식": "I21007", "김밥": "I21007", "떡볶이": "I21007",
    "고깃집": "I20107", "삼겹살": "I20107", "돼지고기": "I20107",
    "술집": "I21104", "호프": "I21104", "포차": "I21104", "주점": "I21104",
    "미용실": "S20701", "헤어": "S20701", "미용": "S20701",
    "네일": "S20703", "피부관리": "S20702",
    "편의점": "G20405", "슈퍼": "G20404", "마트": "G20404",
    "옷가게": "G20905", "의류": "G20905",
    "학원": "P10501", "공부방": "P10501",
    "빵집": "I21101", "베이커리": "I21101", "제과": "I21101",
    "피자": "I21002", "햄버거": "I21001", "패스트푸드": "I21001",
    "중국집": "I20201", "중식": "I20201",
    "일식": "I20301", "초밥": "I20301", "japanese": "I20301",
    "세탁소": "S20801", "세탁": "S20801",
    "부동산": "L10203", "공인중개사": "L10203",
    "펜션": "I10103", "숙박": "I10103", "카페형숙소": "I10103",
    "꽃집": "G21901", "화원": "G21901",
    "약국": "G21301", "정육점": "G20508", "반찬": "G20509",
    "pc방": "R10307", "노래방": "R10310", "당구장": "R10311",
    "헬스장": "R10202", "필라테스": "R10202", "요가": "R10202",
    "자동차정비": "S20301", "카센터": "S20301",
    "안경": "G21501", "문구점": "G21801",
}


def find_industry(text: str | None) -> tuple[str, str] | None:
    """'카페', '한식음식점'에서 소분류코드를 찾습니다. (코드, 이름)"""
    if not text:
        return None
    ix = _load()
    t = text.strip().lower()

    for alias, code in _INDUSTRY_ALIAS.items():
        if alias in t:
            return code, ix["nation"]["small_name"].get(code, alias)
    for name, code in ix["by_industry"]:
        if name and (name in text or text in name):
            return code, name
    return None


def industry_choices(limit: int = 40) -> list[dict]:
    """화면의 업종 고르기에 쓸 목록. 전국 점포가 많은 순입니다."""
    ix = _load()
    nat = ix["nation"]
    top = sorted(nat["small_national"].items(), key=lambda x: -x[1])[:limit]
    return [{"code": c, "name": nat["small_name"].get(c, c), "national": n}
            for c, n in top if nat["small_name"].get(c)]


# ── 비교 상권 ─────────────────────────────────────────────────────────────
def neighbors(code: str, k: int = 4) -> list[dict]:
    """같은 시군구 안에서 점포가 많은 동네들. 옆 동네와 견줘야 판단이 됩니다."""
    ix = _load()
    me = ix["dong"].get(code)
    if not me:
        return []
    same = [dict(code=c, **v) for c, v in ix["dong"].items()
            if v["sgg"] == me["sgg"] and v["sido"] == me["sido"] and c != code]
    if len(same) < k:
        same += [dict(code=c, **v) for c, v in ix["dong"].items()
                 if v["sido"] == me["sido"] and v["sgg"] != me["sgg"]][:k * 3]
    return sorted(same, key=lambda v: -v["stores"])[:k]


# ── 점포 좌표 ─────────────────────────────────────────────────────────────
#
# 272만 개를 통째로 메모리에 올리면 무료 등급 512MB가 그 자리에서 끝납니다.
# 색인(행정동 → 파일 위치)만 올려 두고, 요청이 오면 그 동네 자리만 읽습니다.
# 한 동네가 평균 8KB라 디스크에서 바로 읽어도 1ms가 안 걸립니다.
_pts_lock = threading.Lock()
_pts: dict = {}


def _points_index() -> dict:
    if _pts:
        return _pts
    with _pts_lock:
        if _pts:
            return _pts
        path = os.path.join(INDEX_DIR, "points_index.json")
        if not os.path.exists(path):
            _pts["dong"] = {}
            return _pts
        with open(path, encoding="utf-8") as f:
            _pts.update(json.load(f))
        _pts["id_to_code"] = {v: k for k, v in _pts["industry_ids"].items()}
    return _pts


def store_points(dong_code: str, industry_code: str | None = None,
                 limit: int = 1200) -> dict:
    """한 행정동의 점포 좌표. 업종을 주면 그 업종만 골라 냅니다.

    limit을 두는 이유는 지도 때문입니다. 홍대 서교동은 점포가 8,872개인데
    그걸 다 찍으면 브라우저가 멈추고, 화면도 까맣게 덮여 아무것도 안 보입니다.
    """
    import struct

    ix = _points_index()
    slot = (ix.get("dong") or {}).get(dong_code)
    if not slot:
        return {"points": [], "total": 0, "shown": 0, "capped": False}

    start, count = slot
    want_id = ix["industry_ids"].get(industry_code) if industry_code else None

    path = os.path.join(INDEX_DIR, "points.bin")
    with open(path, "rb") as f:
        f.seek(start * 10)
        raw = f.read(count * 10)

    out: list[tuple[float, float]] = []
    total = 0
    for i in range(count):
        iid, la, lo = struct.unpack_from("<Hff", raw, i * 10)
        if want_id is not None and iid != want_id:
            continue
        total += 1
        if len(out) < limit:
            out.append((round(la, 6), round(lo, 6)))

    return {"points": out, "total": total, "shown": len(out),
            "capped": total > len(out)}


# ── 기회 업종 ─────────────────────────────────────────────────────────────
# 소상공인이 여는 업종의 대분류 — 음식 · 소매 · 수리/개인서비스.
# 나머지(과학기술·부동산·보건의료·시설관리)는 자격이나 자본이 다른 영역입니다.
_OPENABLE_LARGE = ("I2", "G2", "S2")

# 대분류가 맞아도 소상공인 얘기가 아닌 것들. 자격증·대형자본·B2B 쪽입니다.
_NOT_OPENABLE = (
    "주유소", "충전소", "자동차", "의료기기", "도매", "엔지니어링", "사료",
    "행정사", "중개", "임대업", "총포", "주류 도매", "농약", "비료", "석유",
    "건설", "철물", "산업용", "기계", "전자부품", "화학", "폐기물",
    "장례", "구내식당", "연료", "목욕탕", "사우나", "예식", "웨딩",
)


def _openable(code: str, name: str) -> bool:
    if code[:2] not in _OPENABLE_LARGE:
        return False
    return not any(w in name for w in _NOT_OPENABLE)


def opportunities(code: str, k: int = 6) -> list[dict]:
    """이 동네에 **비어 있는 업종**을 찾습니다.

    "카페가 204개라 경쟁이 세다"까지는 말했는데, 그럼 무엇을 하라는 것인지는
    답하지 않고 있었습니다. 입지 상담의 절반은 "여기서 뭘 하면 되나"입니다.

    재는 방법은 이렇습니다. 상권 규모가 비슷한 동네들이 어떤 업종을 몇 개씩
    갖고 있는지 보고, 이 동네가 그보다 적게 가진 업종을 찾습니다. 상권이
    크면 모든 업종이 많으므로, 절대 수가 아니라 **규모 대비 비율**로 봐야
    합니다.

    "부족하니 하면 된다"는 말은 아닙니다. 그 업종이 없는 데는 이유가 있을
    수 있습니다(임대료, 상권 성격, 배후 인구). 그래서 결과에 '전국 비슷한
    규모 동네 평균 대비 몇 곳'이라는 사실만 싣고 판단은 사장님께 맡깁니다.
    """
    ix = _load()
    me = ix["dong"].get(code)
    if not me:
        return []

    nat = ix["nation"]
    my_total = max(me["stores"], 1)

    # 규모가 비슷한 동네들(±35%)을 견줄 무리로 삼습니다.
    lo, hi = my_total * 0.65, my_total * 1.35
    peers = [v for v in ix["dong"].values() if lo <= v["stores"] <= hi]
    if len(peers) < 20:
        peers = list(ix["dong"].values())

    out = []
    for sm, nat_total in nat["small_national"].items():
        # 전국에 드문 업종은 '부족한' 것이 아니라 원래 없는 것입니다.
        if nat_total < 3000:
            continue
        name = nat["small_name"].get(sm)
        if not name:
            continue
        # 소상공인이 실제로 열 수 있는 업종만 봅니다.
        #
        # 거르지 않았더니 연남동에 '주유소·의료기기 소매·자동차 부품'이,
        # 부전동에 '행정사·가축 사료 소매·토목 엔지니어링'이 부족 업종으로
        # 나왔습니다. 통계적으로는 맞습니다 — 정말 없으니까요. 그런데
        # 카페를 알아보는 사장님께 주유소를 권하는 것은 답이 아닙니다.
        # 없는 데는 이유가 있는 업종들입니다.
        if not _openable(sm, name):
            continue

        mine = me["small"].get(sm, 0)
        peer_counts = [p["small"].get(sm, 0) for p in peers]
        expect = sum(peer_counts) / len(peer_counts)
        if expect < 1.5:
            continue

        gap = expect - mine
        if gap < 1.0:
            continue
        # 비율로도 확실히 적어야 합니다. 기대 8곳에 6곳은 '부족'이 아닙니다.
        if mine > expect * 0.6:
            continue

        out.append({
            "code": sm, "name": name,
            "here": mine, "expected": round(expect, 1),
            "gap": round(gap, 1),
            "ratio": round(mine / expect, 2) if expect else 0.0,
        })

    # **있긴 한데 적은 쪽을 먼저 보여 줍니다.**
    #
    # 비율만으로 줄 세웠더니 전부 '0곳'이 올라왔습니다. 통계적으로는 가장
    # 부족하지만, 아예 없는 업종은 대개 그 상권이 못 받쳐 주는 것입니다.
    # 반대로 **몇 곳 있으면서 기대보다 적은** 업종은 그 동네가 그 장사를
    # 받쳐 주면서 아직 안 찼다는 뜻입니다. 그쪽이 실제 기회입니다.
    out.sort(key=lambda x: (x["here"] == 0, x["ratio"], -x["gap"]))
    return out[:k]


def saturated(code: str, k: int = 4) -> list[dict]:
    """반대로 **이미 넘치는 업종**. 들어가면 바로 경쟁에 부딪히는 쪽입니다."""
    ix = _load()
    me = ix["dong"].get(code)
    if not me:
        return []
    nat = ix["nation"]
    my_total = max(me["stores"], 1)
    lo, hi = my_total * 0.65, my_total * 1.35
    peers = [v for v in ix["dong"].values() if lo <= v["stores"] <= hi]
    if len(peers) < 20:
        peers = list(ix["dong"].values())

    out = []
    for sm, cnt in me["small"].items():
        if cnt < 5 or nat["small_national"].get(sm, 0) < 3000:
            continue
        name = nat["small_name"].get(sm)
        if not name:
            continue
        peer_counts = [p["small"].get(sm, 0) for p in peers]
        expect = sum(peer_counts) / len(peer_counts)
        if expect < 1.5 or cnt < expect * 1.6:
            continue
        out.append({"code": sm, "name": name, "here": cnt,
                    "expected": round(expect, 1),
                    "ratio": round(cnt / expect, 2)})
    out.sort(key=lambda x: -x["ratio"])
    return out[:k]
