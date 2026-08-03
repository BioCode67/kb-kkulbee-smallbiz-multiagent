"""핵심 동작이 실제로 도는지 — 외부 의존 없이 도는 시험들.

무엇을 시험하는가를 골랐습니다. 함수가 호출되는지가 아니라, **이 서비스가
약속한 것**이 지켜지는지입니다.

  · 가드레일 — 단정 표현이 정말 고쳐져 나가는가
  · 라우터(규칙) — 사장님 말투가 맞는 갈래로 가는가
  · 분쟁 판별 — 제도 용어 없이도 유형이 잡히는가
  · 자금 성격 — 융자가 보조금으로 둔갑하지 않는가
  · 동네 찾기 — 부르는 이름(성수동·홍대)이 행정동으로 가는가
  · 파생값 — 등급·방향이 점수에서 계산되는가 (한 번 조용히 깨졌던 자리)

LLM·네트워크는 부르지 않습니다. 시험이 외부에 기대면 CI에서 한도·장애로
깨지고, 깨지는 시험은 곧 무시됩니다.

실행:  cd backend && .venv/bin/python -m pytest tests/ -q
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# LLM이 켜져 있으면 라우터가 네트워크를 부릅니다. 시험은 규칙 경로만 봅니다.
os.environ.pop("GEMINI_API_KEY", None)


# ── 가드레일 ──────────────────────────────────────────────────────────────
class TestGuardrail:
    def test_확정_표현은_고쳐진다(self):
        from app.agents.guardrail_agent import apply

        safe, report = apply("사장님은 연 2.5%로 5천만원을 확실히 받으실 수 있습니다.")
        assert not report.passed
        assert report.rewritten
        assert "확실히" not in safe

    def test_안전한_문장은_그대로_나간다(self):
        from app.agents.guardrail_agent import apply

        text = "공고 기준 한도는 5천만원이며, 실제 조건은 심사 결과에 따라 달라집니다."
        safe, report = apply(text)
        assert report.passed
        assert safe.startswith(text)

    def test_고친_기록이_남는다(self):
        """무엇을 왜 고쳤는지가 응답에 남아야 심사에서 증명이 됩니다."""
        from app.agents.guardrail_agent import apply

        _, report = apply("무조건 승인됩니다. 지금 바로 대출받으세요.")
        assert report.violations
        assert report.original_excerpt

    def test_조사와_부정형_변형도_잡는다(self):
        """2차 시험이 찾은 구멍 — 조사를 끼우거나('원금이 보장'),
        접두어를 빼거나('수익이 보장'), 부정형으로 말해도('손해 볼 일
        없습니다') 단정은 단정입니다. 재발 방지."""
        from app.agents.guardrail_agent import apply

        for bad in ("원금이 보장되는 상품입니다",
                    "이 상품은 무조건 수익이 보장됩니다",
                    "손해 볼 일 없습니다"):
            _, report = apply(bad)
            assert not report.passed, bad


# ── 라우터 (규칙 경로) ────────────────────────────────────────────────────
class TestRouter:
    @pytest.mark.parametrize("q,expect", [
        ("연남동에서 카페 열려는데 상권 어때?", "location"),
        ("장사가 안돼서 운영자금이 급해요", "policy"),
        ("요즘 통 손님이 없어서 월세도 빠듯해요", "policy"),
        ("대출 설명을 제대로 안 해줬어요", "protection"),
        ("미리 갚는데 왜 수수료를 떼나요", "protection"),
        ("오늘 날씨 어때?", "general"),
    ])
    def test_말투가_맞는_갈래로_간다(self, q, expect):
        from app.agents.router_agent import _by_words

        assert _by_words(q)["intents"][0] == expect

    def test_복합_질문은_여러_갈래가_켜진다(self):
        from app.agents.router_agent import _by_words

        got = _by_words("성수동 자리도 보고 자금도 알아봐줘")["intents"]
        assert "location" in got and "policy" in got

    def test_분쟁이_자금보다_앞선다(self):
        """'대출'과 '설명'이 함께 있으면 분쟁 절차가 먼저 읽혀야 합니다."""
        from app.agents.router_agent import _by_words

        got = _by_words("대출 설명을 제대로 못 들었는데 이의제기 되나요")["intents"]
        assert got[0] == "protection"


# ── 분쟁 유형 판별 ────────────────────────────────────────────────────────
class TestDispute:
    @pytest.mark.parametrize("q,rule_part", [
        ("설명을 제대로 안 해줬어요", "제19조"),
        ("미리 갚는데 왜 수수료를 떼나요", "제20조"),
        ("독촉 전화가 너무 심해요", "추심"),
        ("대출해 준다면서 보험 가입을 강요했어요", "제21조"),
    ])
    def test_사장님_말로_유형이_잡힌다(self, q, rule_part):
        from app.agents.guardrail_agent import build_protection

        pack = build_protection(q, q)
        assert any(rule_part in r for r in pack.applicable_rules), pack.applicable_rules

    def test_모르면_지어내지_않는다(self):
        from app.agents.guardrail_agent import build_protection

        pack = build_protection("그냥 궁금해서요", "그냥 궁금해서요")
        assert "분쟁조정" in pack.dispute_summary


# ── 자금 성격 ─────────────────────────────────────────────────────────────
class TestFunding:
    def _read(self, title, support="", summary=""):
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))), "scripts"))
        from build_policy_index import read_funding

        return read_funding(title, support, summary)[0]

    def test_제목의_융자가_본문의_보증을_이긴다(self):
        """실제로 두 번 틀렸던 자리입니다 — 본문에 '보증서'가 스치면
        「○○자금 융자 계획」이 보증으로 둔갑했습니다."""
        assert self._read(
            "2026년 소상공인시장진흥자금 융자 계획 공고",
            summary="신청 시 보증서 발급이 필요할 수 있습니다 보증 보증") == "융자"

    def test_이차보전이_융자보다_먼저다(self):
        assert self._read("소상공인 이차보전 융자 지원") == "이차보전"

    def test_모르면_기타다(self):
        assert self._read("2026년 참여기업 모집") == "기타"


# ── 파생값 (조용히 깨졌던 자리) ───────────────────────────────────────────
class TestDerived:
    def test_등급은_점수에서_나온다(self):
        """pydantic 기본값이 검증을 건너뛰어 86.5점이 C로 나간 적이 있습니다."""
        from app.models.schemas import LocationScore

        assert LocationScore(region_name="x", total_score=92).grade == "S"
        assert LocationScore(region_name="x", total_score=60.8).grade == "B"
        assert LocationScore(region_name="x", total_score=30).grade == "D"

    def test_방향은_기여에서_나온다(self):
        from app.models.schemas import FactorContribution

        f = FactorContribution(key="k", label="l", value=1, contribution=-12.9)
        assert f.direction == "down"


# ── 동네·업종 찾기 ────────────────────────────────────────────────────────
class TestMarket:
    @pytest.mark.parametrize("q,sgg,dong_prefix", [
        ("서울 마포구 연남동", "마포구", "연남동"),
        ("성수동", "성동구", "성수"),      # 행정동은 성수1가1동 …으로 쪼개져 있음
        ("홍대", "마포구", "서교동"),       # 부르는 이름 ≠ 행정동 이름
        ("역삼동", "강남구", "역삼"),
    ])
    def test_부르는_이름이_행정동으로_간다(self, q, sgg, dong_prefix):
        from app.services import market_data

        d = market_data.find_dong(q)
        assert d and d["sgg"] == sgg and d["dong"].startswith(dong_prefix)

    def test_없는_동네는_None(self):
        from app.services import market_data

        assert market_data.find_dong("우주정거장") is None

    def test_업종_별칭(self):
        from app.services import market_data

        assert market_data.find_industry("치킨집")[0] == "I21006"
        assert market_data.find_industry("커피숍")[0] == "I21201"

    def test_점포_좌표는_행정동_경계_안에_있다(self):
        """이진 파일을 잘못 읽으면 좌표가 엉뚱한 곳을 가리킵니다.
        연남동 카페 204곳이 전부 연남동 근방(±3km)에 있어야 합니다."""
        from app.services import market_data

        d = market_data.find_dong("서울 마포구 연남동")
        pts = market_data.store_points(d["code"], "I21201")
        assert pts["total"] == d["small"]["I21201"]
        for la, lo in pts["points"]:
            assert abs(la - d["lat"]) < 0.03 and abs(lo - d["lon"]) < 0.03


# ── 검색 계약 ─────────────────────────────────────────────────────────────
class TestPolicySearch:
    def test_마감된_공고는_안_나온다(self):
        from app.services import policy_search

        for d in policy_search.search("소상공인 지원", k=10):
            assert d["open_status"] != "closed"

    def test_지역이_어긋나면_안_나온다(self):
        from app.services import policy_search

        for d in policy_search.search("소상공인 경영안정자금", region="서울", k=10):
            assert not d["regions"] or "서울" in d["regions"]

    def test_추천마다_이유가_붙는다(self):
        from app.services import policy_search

        res = policy_search.search("장사가 안돼서 운영자금이 급해요", k=5)
        assert res
        for d in res:
            assert d["match_reasons"]
            assert d["source_url"].startswith("https://www.bizinfo.go.kr")


# ── 자금 성격 제약 ────────────────────────────────────────────────────────
class TestFundingFilter:
    """제안 칩이 만든 문장("주는 지원금만")이 실제로 그렇게 검색되는가.

    칩을 만들어 놓고 검색이 성격을 모르면 칩이 거짓말이 됩니다 — 실제로
    "주는 지원금만 보여줘"에 융자·이차보전이 나오고 있었습니다.
    """

    def _types(self, q):
        import json

        from app.services import policy_search
        with open(os.path.join(os.path.dirname(os.path.dirname(
                os.path.abspath(__file__))), "app", "data", "policy_index",
                "docs.json"), encoding="utf-8") as f:
            by = {x["id"]: x for x in json.load(f)}
        return {by[r["id"]]["funding_type"]
                for r in policy_search.search(q, k=6)}

    def test_주는_돈만(self):
        got = self._types("갚는 돈 말고 그냥 주는 지원금만 보여줘")
        assert got and got <= {"보조금", "바우처"}, got

    def test_빌리는_쪽만(self):
        got = self._types("낮은 금리로 빌릴 수 있는 자금")
        assert got and got <= {"융자", "이차보전", "보증"}, got

    def test_제약_없으면_안_거른다(self):
        got = self._types("소상공인 지원사업 알려줘")
        assert len(got) >= 2, got


# ── finlife 요약 (키 없이, 고정 표본으로) ─────────────────────────────────
class TestFinlife:
    ROWS = [
        {"bank": "국민은행", "type": "대출금리", "rate_900": 4.2, "rate_avg": 5.1},
        {"bank": "국민은행", "type": "당좌대출", "rate_900": 5.0, "rate_avg": 6.2},
        {"bank": "가상은행", "type": "대출금리", "rate_900": 3.9, "rate_avg": 4.8},
        {"bank": "무명은행", "type": "대출금리", "rate_900": None, "rate_avg": None},
    ]

    def test_은행별_최저_유형으로_접힌다(self):
        from app.services.finlife import summarize

        out = summarize(self.ROWS)
        kb = out["kb"]
        assert kb and kb["rate_avg"] == 5.1          # 6.2가 아니라 유리한 유형
        assert out["low"] == 4.8 and out["n_banks"] == 2
        assert "사업자대출 조건과 다릅니다" in out["note"]

    def test_키가_없으면_카드가_빠진다(self):
        import asyncio

        from app.services import finlife
        os.environ.pop("FINLIFE_API_KEY", None)
        assert asyncio.run(finlife.bank_rates()) is None


# ── 서울 생활인구 파싱 (키 없이, 문서 형식 표본으로) ──────────────────────
class TestSeoulPop:
    def test_24시간이_요약된다(self):
        from app.services.seoul_pop import parse_rows

        rows = [{"TMZON_PD_SE": str(h),
                 "TOT_LVPOP_CO": str(10000 + (5000 if h == 13 else 0))}
                for h in range(24)]
        out = parse_rows(rows)
        assert out and out["peak_hour"] == 13
        assert out["curve"][13] == 1.0 and len(out["curve"]) == 24

    def test_반나절도_없으면_None(self):
        from app.services.seoul_pop import parse_rows

        assert parse_rows([{"TMZON_PD_SE": "9", "TOT_LVPOP_CO": "100"}]) is None

    def test_키_없으면_조용히_빠진다(self):
        import asyncio

        from app.services import seoul_pop
        os.environ.pop("SEOUL_API_KEY", None)
        assert asyncio.run(seoul_pop.living_pop("11440710")) is None


# ── RPA 원문 점검 ─────────────────────────────────────────────────────────
#
# 색인은 스냅샷이고 공고는 살아 움직입니다. 원문 재확인이 "지어내지 않는지"
# — 못 찾으면 None인지, 아무 주소나 열어 주지 않는지를 여기서 못박습니다.

from datetime import date as _date

from app.rpa.bizinfo_check import check_notice, parse_notice

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "bizinfo_notice.html")


def test_rpa_parse_extracts_facts():
    p = parse_notice(open(_FIXTURE, encoding="utf-8").read(),
                     today=_date(2026, 8, 2))
    assert "3D 프린팅" in p["title"]
    assert p["deadline"] == "2026-12-31"
    assert p["status"] == "open" and p["days_left"] == 151
    assert p["attachments"] and p["attachments"][0]["url"].startswith(
        "https://www.bizinfo.go.kr/cmm/fms/fileDown.do?")
    assert p["apply_link"] and "&amp;" not in p["apply_link"]


def test_rpa_parse_after_deadline_is_closed():
    p = parse_notice(open(_FIXTURE, encoding="utf-8").read(),
                     today=_date(2027, 1, 1))
    assert p["status"] == "closed" and p["days_left"] is None


def test_rpa_parse_never_fabricates():
    # 아무 정보도 없는 문서 — 전부 None/unknown이어야 합니다
    p = parse_notice("<html><body>빈 페이지</body></html>")
    assert p["title"] is None and p["period_text"] is None
    assert p["status"] == "unknown" and p["attachments"] == []


def test_rpa_refuses_non_bizinfo_url():
    # 화이트리스트 밖 — 내부망·타 사이트를 열어 주는 프록시가 되면 안 됩니다
    for bad in ("https://evil.example.com/x",
                "http://169.254.169.254/latest/meta-data",
                "https://www.bizinfo.go.kr.evil.com/sii/siia/selectSIIA200Detail.do",
                ""):
        r = check_notice(bad)
        assert r["ok"] is False and "reason" in r


# ── 두 동네 비교 감지 ─────────────────────────────────────────────────────

from app.agents.workflow import _detect_pair


def test_compare_detects_two_dongs():
    pair = _detect_pair("연남동이랑 성수동 카페 상권 비교해줘")
    assert pair is not None
    names = {p["dong"] for p in pair}
    assert "연남동" in names


def test_compare_needs_marker_and_two_regions():
    # 비교 낱말이 없으면 단일 분석으로 — 오탐이 더 나쁩니다
    assert _detect_pair("연남동 카페 상권 어때?") is None
    # 비교 낱말이 있어도 동네가 하나뿐이면 비교가 아닙니다
    assert _detect_pair("연남동 상권 다른 곳과 비교하면 어때?") is None


# ── 곧 마감 ───────────────────────────────────────────────────────────────

def test_closing_soon_shape_and_bounds():
    from app.main import closing_soon
    out = closing_soon(days=10)
    assert "items" in out
    for it in out["items"]:
        assert 0 <= it["days_left"] <= 10
        assert it["url"].startswith(
            "https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=")
    # 임박순 정렬 — 티커는 급한 것부터 흘러야 합니다
    lefts = [it["days_left"] for it in out["items"]]
    assert lefts == sorted(lefts)


# ── 업종 별칭이 뜻과 맞는지 — '빵집→유흥주점' 같은 사고의 재발 방지 ──

def test_industry_aliases_point_to_sane_names():
    from app.services import market_data as m
    ix = m._load()
    sn = ix["nation"]["small_name"]
    expect = {"빵집": "빵/도넛", "피자": "피자", "햄버거": "버거",
              "약국": "약국", "세탁소": "세탁소", "정육점": "정육점",
              "pc방": "PC방", "노래방": "노래방", "당구장": "당구장",
              "헬스장": "헬스장", "안경": "안경렌즈 소매업",
              "게스트하우스": "펜션"}
    for alias, name in expect.items():
        code = m._INDUSTRY_ALIAS[alias]
        assert sn.get(code) == name, f"{alias} → {sn.get(code)} (기대: {name})"


# ── 계약서 신호등 — 독소조항 탐지가 진짜 문구에만 반응하는지 ──

def test_contract_scan_finds_poison_clauses():
    from app.services.contract_scan import scan
    text = ("제5조 임차인은 권리금을 일체 주장하지 않는다. "
            "제7조 차임은 임대인이 임의로 인상할 수 있다. "
            "제9조 계약 만료 시 이의가 없으면 자동 연장된다.")
    r = scan(text)
    names = {f["name"] for f in r["findings"]}
    assert "권리금 포기 특약" in names
    assert "과도한 차임 인상 여지" in names
    assert "자동 연장·자동 갱신" in names
    assert r["danger"] >= 2


def test_contract_scan_clean_text_stays_clean():
    from app.services.contract_scan import scan
    r = scan("제1조 목적. 본 계약은 상호 신뢰를 바탕으로 성실히 이행한다. "
             "제2조 임대차 기간은 2년으로 한다.")
    assert r["ok"] and r["clean"] and r["findings"] == []


# ── 시군구 단위 질의 — '경북경산시 술집'이 general로 새지 않게 ──

def test_sgg_suffix_match_and_flag():
    """'경북경산시'처럼 시도가 붙은 한 토큰도 시군구로 풀려야 하고,
    동이 아니라 시군구로 맞았다는 표식이 남아야 순위 답변이 가능합니다."""
    from app.services.market_data import find_dong

    d = find_dong("경북경산시 술집")
    assert d and d.get("matched_sgg") == "경산시"
    # 진짜 동 이름이면 표식이 없어야 합니다
    d2 = find_dong("연남동 카페")
    assert d2 and not d2.get("matched_sgg")


def test_yeungnam_univ_alias():
    """영남대(경산시 대학로, 법정동 대동)는 행정동 동부동 관할 —
    하양읍(경산시 최대 상권)으로 잘못 가던 것의 재발 방지."""
    from app.services.market_data import find_dong

    d = find_dong("경북경산시 영남대 술집")
    assert d and d["sgg"] == "경산시" and d["dong"] == "동부동"


# ── 골든타임 — 권리 마감일 계산이 조문 기간과 일치하는지 ──

def test_golden_time_loan_deadlines():
    from datetime import date
    from app.services.golden_time import compute

    r = compute("loan", "2026-08-01", known_date="2026-08-01",
                today=date(2026, 8, 2))
    # 청약철회 14일: 8/1 + 14일 = 8/15, 오늘이 8/2면 13일 남음
    w = next(i for i in r["items"] if i["name"].startswith("청약철회권"))
    assert w["due"] == "2026-08-15" and w["days_left"] == 13
    # 안 날 1년(2027-08-01), 계약일 5년(2031-08-01)
    dues = {i["due"] for i in r["items"]}
    assert {"2027-08-01", "2031-08-01"} <= dues
    assert "법률 자문이 아닙니다" in r["note"]


def test_golden_time_lease_window_and_expiry():
    from datetime import date
    from app.services.golden_time import compute

    # 만료 2026-12-31 → 갱신요구 마감 11/30(1개월 전), 보호기간 종료 12/31
    r = compute("lease", "2026-12-31", today=date(2026, 8, 2))
    assert [i["due"] for i in r["items"]] == ["2026-11-30", "2026-12-31"]
    assert not r["expired_all"]
    # 이미 만료된 계약이면 전부 expired로 표시된다
    r = compute("lease", "2025-01-31", today=date(2026, 8, 2))
    assert r["expired_all"] and all(i["days_left"] < 0 for i in r["items"])


def test_empty_spots_shape_and_logic():
    """빈 자리 동네 — 뽑힌 동네는 전부 기대치의 35% 이하여야 합니다."""
    from app.services import market_data

    r = market_data.empty_spots("카페")
    assert r["ok"] and r["rows"]
    for row in r["rows"]:
        assert row["actual"] <= 0.35 * row["expected"] + 1e-6
        assert row["expected"] >= 4
    # 시도 필터가 실제로 거릅니다
    r2 = market_data.empty_spots("카페", sido="경상북도")
    assert all(x["name"].startswith("경상북도") for x in r2["rows"])


def test_companions_shape():
    """궁합 업종 — 상관은 [-1,1], 자기 자신은 빠져야 합니다."""
    from app.services import market_data

    c = market_data.companions("카페", dong_code=None)
    assert c["ok"] and c["top"]
    for t in c["top"]:
        assert -1 <= t["corr"] <= 1
        assert t["industry"] != "카페"
        assert 0 <= t["together_pct"] <= 100
