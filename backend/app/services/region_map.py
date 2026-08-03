"""시군구 이름 → 시도 약칭.

"경산에서 카페 하려는데" — 여기엔 '경북'이 없습니다. 시도만 보는 지역
판독은 이런 질문에서 조용히 꺼졌고, 꺼진 필터는 인천·전남 공고를
경산 사장님께 그대로 내밀었습니다(실사용 제보로 발견).

시군구 목록을 따로 적어 관리하면 곧 어긋납니다. 이미 저장소에 있는
상권 색인(행정동 3,450곳)에 시도·시군구가 전부 들어 있으므로 거기서
한 번 만들어 씁니다. 이름이 여러 시도에 있는 것(고성·강서 등)은
확신할 수 없으니 매핑에서 뺍니다 — 틀린 지역 필터는 없는 것보다 나쁩니다.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_DONG_JSON = Path(__file__).resolve().parent.parent / "data" / "market_index" / "dong.json"

# '울산광역시' → '울산' 같은 축약. 특별자치도 개편 이름도 함께.
_SIDO_SHORT = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기",
    "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북",
    "충청남도": "충남", "전라북도": "전북", "전북특별자치도": "전북",
    "전라남도": "전남", "경상북도": "경북", "경상남도": "경남",
    "제주도": "제주", "제주특별자치도": "제주",
}

# 시군구 이름 뒤에 와도 지역 언급으로 읽을 수 있는 글자.
# '고양이 용품'의 '고양'처럼 낱말 일부를 지역으로 오독하지 않기 위한 허용 목록.
_AFTER_OK = set("시군구읍면동에의은는가랑쪽권근상지내서")

# 일반 명사와 겹치는 지명 — '제품 양산', '상주 인력', '진주 목걸이'.
# 이런 이름은 '양산시'처럼 행정 접미가 붙었을 때만 지역으로 읽습니다.
# '광주'는 광주광역시와 경기 광주시가 겹쳐 접미 없이는 판정하지 않습니다.
_NEEDS_SUFFIX = {"양산", "상주", "구미", "광명", "부여", "보은", "진주",
                 "영동", "광주", "김제", "예천", "청도", "영주", "군위"}


def _strip_suffix(name: str) -> str:
    return re.sub(r"(시|군|구)$", "", name)


@lru_cache(maxsize=1)
def sigungu_map() -> dict[str, str]:
    """시군구 기본이름 → 시도 약칭. 모호한 이름(여러 시도)은 제외."""
    try:
        dong = json.loads(_DONG_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {}
    seen: dict[str, set[str]] = {}
    for rec in dong.values():
        sido = _SIDO_SHORT.get(rec.get("sido", ""))
        sgg = rec.get("sgg", "") or ""
        if not sido or not sgg:
            continue
        names = {sgg, _strip_suffix(sgg)}
        # '수원시팔달구' 같은 결합형이면 앞의 시 이름도 넣습니다.
        m = re.match(r"(.+?시)(.+?구)$", sgg)
        if m:
            names |= {m.group(1), _strip_suffix(m.group(1))}
        for n in names:
            if len(n) >= 2:
                seen.setdefault(n, set()).add(sido)
    return {n: s.pop() for n, s in seen.items() if len(s) == 1}


@lru_cache(maxsize=1)
def _keys_by_len() -> list[str]:
    return sorted(sigungu_map(), key=len, reverse=True)


_SIDO_SHORTS = sorted(set(_SIDO_SHORT.values()))


def sido_mentions(text: str | None) -> set[str]:
    """경계를 확인하며 시도명 언급을 모읍니다 — '발명특허대전'의 '대전'은 제외."""
    out: set[str] = set()
    if not text:
        return out
    for name in _SIDO_SHORTS:
        for m in re.finditer(name, text):
            i, j = m.start(), m.end()
            if i > 0 and re.match(r"[가-힣]", text[i - 1]):
                continue
            if j < len(text) and re.match(r"[가-힣]", text[j]) and text[j] not in _AFTER_OK:
                continue
            out.add(name)
            break
    return out


def sido_of(text: str | None) -> str | None:
    """문장 속 시군구 언급에서 시도 약칭을 읽습니다. 확신 없으면 None."""
    if not text:
        return None
    mp = sigungu_map()
    for key in _keys_by_len():
        for m in re.finditer(re.escape(key), text):
            i, j = m.start(), m.end()
            if i > 0 and re.match(r"[가-힣]", text[i - 1]):
                continue  # '대구미술'의 '구미' 같은 낱말 중간
            if j < len(text) and re.match(r"[가-힣]", text[j]) and text[j] not in _AFTER_OK:
                continue  # '고양이'의 '고양' 같은 오독
            if key in _NEEDS_SUFFIX and not (j < len(text) and text[j] in "시군"):
                continue  # '제품 양산'의 '양산' 같은 동음이의
            return mp[key]
    return None
