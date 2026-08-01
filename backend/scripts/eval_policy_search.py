"""검색이 실제로 맞는 것을 찾는지 잽니다 — 눈으로 보고 "좋아 보인다" 하지 않기 위해.

검색은 고쳐도 나아졌는지 알기 어렵습니다. 질의 몇 개를 눈으로 보면 늘
그럴듯해 보이고, 고친 쪽이 나아 보이는 착각이 생깁니다. 그래서 숫자로
잽니다.

**정답을 어떻게 정했나.** 900건에 사람이 일일이 정답을 달 수는 없었습니다.
대신 질문마다 "관련 있는 공고라면 반드시 들어 있을 낱말"을 적었습니다.
느슨한 기준이라 실제 정확도보다 후하게 나올 수 있습니다. 그래도 **고치기
전과 후를 같은 자로 재는** 목적에는 충분합니다.

  P@1  1위가 관련 있는가
  P@3  상위 3개 중 관련 있는 비율
  MRR  첫 관련 공고가 몇 번째에 나오는가

실행:
    python -m scripts.eval_policy_search
    python -m scripts.eval_policy_search --show      # 결과까지 펼쳐 봅니다
"""
from __future__ import annotations

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services import policy_search as ps  # noqa: E402

# (질문, 지역, 관련 공고라면 제목에 걸릴 낱말, 걸리면 안 되는 낱말)
#
# 처음에는 기준을 느슨하게 잡았더니 P@1이 0.94로 나왔습니다. 들여다보니
# "배달앱 수수료"에 「IoT 보안인증 인증시험 **수수료** 지원」이 정답으로
# 세어지고 있었습니다. 낱말 하나가 겹쳤을 뿐인데 맞은 것이 된 것입니다.
#
# 그래서 두 가지를 바꿨습니다. 하나는 '지원·사업·기업'처럼 어디에나 있는
# 낱말을 정답 기준에서 빼는 것이고, 다른 하나는 **오답 낱말**을 함께 적어
# 명백히 다른 분야면 틀린 것으로 세는 것입니다. 후하게 나온 점수는
# 고칠 곳을 가려 버립니다.
CASES: list[tuple[str, str | None, str, str]] = [
    ("장사가 안돼서 급하게 운영자금이 필요해요", None,
     r"경영안정|운영자금|경영자금|긴급.*자금|위기.*소상공인|육성자금|진흥자금|정책자금.*융자", ""),
    ("가게 인테리어 고치는 비용 지원", None,
     r"시설개선|환경개선|점포|간판|인테리어|노후.*개선|재창업", r"수출|해외|바이어"),
    ("폐업하고 다시 시작하고 싶어요", None,
     r"재창업|재기|폐업|재도전|희망리턴", ""),
    ("직원 뽑으면 인건비 지원받을 수 있나요", None,
     r"인건비|신규채용|고용.*지원|일자리|대체인력", r"수출|해외"),
    ("전통시장에서 장사하는데 도움받을 만한게 있나요", None,
     r"전통시장|상점가|골목|상권|우수시장", ""),
    ("동네에서 카페 열려고 하는데 창업 지원금 있나요", None,
     r"소상공인|자영업|외식|음식|점포|카페|골목|상권|생활",
     r"스타트업|벤처|딥테크|기술창업|오픈이노베이션|R&D|방산"),
    ("온라인 쇼핑몰로 해외에 팔고 싶어요", None,
     r"해외|수출|이커머스|역직구|온라인.*(플랫폼|판매|입점)", ""),
    ("배달앱 수수료가 너무 비싼데 지원이 있나요", None,
     r"배달|공동배송|라이더|온라인.*판로|디지털.*전환|플랫폼.*소상공인", ""),
    ("음식점 위생이나 시설 기준 맞추는 데 지원되나요", None,
     r"외식|음식점|위생|식품|방지시설|환경개선", r"수출|해외"),
    ("스마트기기나 키오스크 들여놓는 지원사업", None,
     r"스마트|키오스크|무인|자동화|디지털.*(기기|전환|장비)", ""),
    ("청년이 창업할 때 받을 수 있는 자금", None,
     r"청년.*(자금|융자|대출|창업)|창업.*청년", r"경진대회|공모전|아이디어"),
    ("경영이 어려워서 컨설팅을 받고 싶어요", None,
     r"컨설팅|경영.*(진단|자문|개선|혁신)|멘토링", r"수출|해외|규제"),
    ("서울에서 소상공인이 받을 수 있는 지원", "서울",
     r"소상공인|자영업|점포|상권|골목", ""),
    ("부산에서 가게 하는데 지역 지원사업 알려주세요", "부산",
     r"소상공인|자영업|점포|상권|골목|경영안정", ""),
    ("신용이 낮아도 대출 받을 수 있는 정책자금", None,
     r"융자|대출|보증|정책자금|경영안정", ""),
    ("농산물이나 특산품을 판매할 판로를 찾고 있어요", None,
     r"판로|유통|박람회|입점|직거래|마케팅", ""),
]


def relevant(doc: dict, pattern: str, anti: str) -> bool:
    """정답 판정. 제목을 먼저 보고, 아니면 태그·요약까지 봅니다.

    본문 전체를 보면 거의 모든 공고가 걸립니다. 900건이 전부 정부 지원사업
    공고라 서로 쓰는 말이 비슷하기 때문입니다.
    """
    title = doc["title"]
    if anti and re.search(anti, title):
        return False
    if re.search(pattern, title):
        return True
    blob = f"{' '.join(doc['tags'])} {doc['summary'][:300]}"
    if anti and re.search(anti, blob):
        return False
    return re.search(pattern, blob) is not None


def run(show: bool = False, k: int = 3) -> dict:
    p1 = p3 = mrr = 0.0
    rows = []
    for q, region, pat, anti in CASES:
        res = ps.search(q, region=region, k=k)
        flags = [relevant(d, pat, anti) for d in res]

        hit1 = bool(flags and flags[0])
        p1 += hit1
        p3 += (sum(flags) / k) if res else 0.0
        rank = next((i + 1 for i, f in enumerate(flags) if f), 0)
        mrr += (1.0 / rank) if rank else 0.0

        rows.append((q, region, flags, res))
        mark = "○" if hit1 else "×"
        got = f"{sum(flags)}/{len(flags)}"
        print(f"  {mark} [{got}] {q[:38]:<38} {res[0]['title'][:40] if res else '결과 없음'}")
        if show:
            for f, d in zip(flags, res):
                print(f"        {'○' if f else '×'} {d['match_score']:5.1f} "
                      f"[{d['category']}] {d['title'][:52]}")
                for w in d["match_reasons"][:2]:
                    print(f"              · {w}")

    n = len(CASES)
    out = {"n": n, "P@1": round(p1 / n, 3), "P@3": round(p3 / n, 3),
           "MRR": round(mrr / n, 3)}
    print(f"\n  질의 {n}개 — P@1 {out['P@1']}  P@3 {out['P@3']}  MRR {out['MRR']}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args()
    m = ps.meta()
    print(f"색인 — 공고 {m.get('docs')}건 · 조각 {m.get('chunks')}개 · {m.get('doc_vectors')}")
    print(f"       변별폭 {m.get('centering', {}).get('spread_after')}\n")
    run(a.show)
    return 0


if __name__ == "__main__":
    sys.exit(main())
