"""혜택 서랍 — 신청할 수 있는 지원 전체를 펼쳐 놓고 고르게 합니다.

검색(자금 설계·챗봇)은 질문에 맞는 몇 건을 **골라** 줍니다. 서랍은
반대입니다 — "뭐가 있는지 자체를 모르겠다"는 사장님께 900건 색인 전체를
펼쳐 놓고, 걸러 보기(자금 성격·분야·지역·접수 상태)와 줄 세우기(마감
임박·최신·한도·맞춤)를 쥐여 드립니다.

정직성 원칙
- 목록·개수·마감일은 전부 색인(docs.json) 값 그대로 — 지어내지 않습니다.
- 낱말 검색은 BM25 + 제목 부분일치만 씁니다. 임베딩 추측은 안 씁니다 —
  서랍은 고르는 도구라, 왜 걸렸는지 낱말이 눈에 보여야 합니다.
- '내 조건 맞춤'은 지역이 어긋나는 것과 중소·중견 전용을 뺄 뿐이며,
  남긴 것에는 왜 맞는지(지역·대상·낱말)를 한 줄씩 붙여 내보냅니다.
- 이미 끝났거나(closed) 기간을 읽지 못한(unknown) 공고는 '신청할 수
  있는 것'이 아니므로 서랍에 넣지 않습니다.
"""
from __future__ import annotations

from datetime import date

# 색인과 BM25는 검색 모듈의 것을 그대로 씁니다 — 따로 만들면 두 색인이
# 조용히 어긋납니다(적재도 한 번만 일어납니다).
from app.services.korean_text import tokenize
from app.services.policy_search import _bm25, _load, region_of

FUNDING_GROUPS: dict[str, tuple[str, ...]] = {
    "grant": ("보조금", "바우처"),          # 갚지 않는 돈
    "loan": ("융자", "이차보전", "보증"),   # 빌리는 돈·이자를 줄여 주는 것
    "edu": ("컨설팅·교육",),
    "etc": ("기타",),
}
_GROUP_OF = {ft: g for g, fts in FUNDING_GROUPS.items() for ft in fts}
CATEGORIES = ("금융", "창업", "경영", "내수", "수출", "기술", "인력", "기타")
STATUSES = ("open", "rolling", "upcoming")   # closed·unknown은 서랍 밖

_TITLE_BONUS = 6.0   # 제목에 검색어가 통째로 들어 있으면 낱말 점수보다 앞세웁니다


def _posted_ord(d: dict) -> int:
    try:
        return date.fromisoformat(d.get("posted_at") or "").toordinal()
    except ValueError:
        return 0


def _days(iso: str | None, today: date) -> int | None:
    try:
        return (date.fromisoformat(iso) - today).days if iso else None
    except ValueError:
        return None


def browse(q: str = "", funding: str | None = None, category: str | None = None,
           region: str | None = None, status: str | None = None,
           smallbiz: bool = False, fit_only: bool = False,
           my_region: str | None = None, my_industry: str | None = None,
           sort: str = "auto", offset: int = 0, limit: int = 20,
           today: date | None = None) -> dict:
    """서랍 한 번 열기 — 거른 목록 한 쪽과 조건별 개수를 돌려줍니다."""
    ix = _load()
    docs = ix["docs"]
    today = today or date.today()
    offset, limit = max(0, int(offset)), min(max(1, int(limit)), 50)

    # ── 1) 낱말 검색 — 후보와 점수 ──────────────────────────────────────
    q = (q or "").strip()[:80]
    scores: dict[int, float] = {}
    if q:
        bm, _hits, solid = _bm25(tokenize(q))
        ql = q.lower()
        title_hit = {i for i, d in enumerate(docs) if ql in d["title"].lower()}
        for i in solid | title_hit:
            scores[i] = bm.get(i, 0.0) + (_TITLE_BONUS if i in title_hit else 0.0)
        idxs: list[int] = list(scores)
    else:
        idxs = list(range(len(docs)))

    # ── 2) 프로필 — 시·도와 업종 낱말 ───────────────────────────────────
    user_sido = region_of(my_region)
    ind_hits: dict[str, set[int]] = {}
    for t in tokenize(my_industry or ""):
        if len(t) >= 2:
            ind_hits[t] = {i for i, _ in ix["postings"].get(t, [])}

    def region_ok(regions: list[str]) -> bool:
        # '대구ㆍ경북' 같은 묶음 표기가 있어 원소 일치가 아니라 포함으로 봅니다.
        return (not regions) or (user_sido is not None
                                 and any(user_sido in r for r in regions))

    # ── 3) 행 만들기 — 서랍의 바닥 조건(상태·지역·대상)까지 여기서 ──────
    rows: list[dict] = []
    for i in idxs:
        d = docs[i]
        st = d["open_status"]
        if st not in STATUSES:
            continue
        if region:
            if region == "전국":
                if d["regions"]:
                    continue
            elif not (not d["regions"]
                      or any(region in r for r in d["regions"])):
                continue
        sb = float(d.get("smallbiz_fit") or 0.0)
        if smallbiz and not (d.get("is_smallbiz") or sb >= 0.35):
            continue
        if fit_only:
            # 맞춤은 빼기 반, 이유 반 — 지역이 어긋나는 것과 중소·중견
            # 전용을 빼고, 남긴 이유를 아래 why로 답니다.
            if not region_ok(d["regions"]) or sb <= -0.35:
                continue

        fit, why = 0.0, []
        if my_region or my_industry:
            if d["regions"] and user_sido and any(user_sido in r for r in d["regions"]):
                fit += 2.0
                why.append(f"{'·'.join(d['regions'])} — 내 지역 사업입니다")
            elif not d["regions"]:
                fit += 0.6
                why.append("전국에서 신청할 수 있습니다")
            fit += 0.8 * sb
            if sb >= 0.35:
                why.append("소상공인·자영업자를 위한 사업입니다")
            elif sb <= -0.35:
                why.append("중소·중견기업 대상 — 자격을 먼저 확인하세요")
            for t, hit in ind_hits.items():
                if i in hit:
                    fit += 1.2
                    why.append(f"공고 본문에 '{t}'이(가) 그대로 나옵니다")
                    break

        end_left = _days(d.get("apply_end"), today)
        # 색인의 open_status는 수집일 기준입니다. 그 뒤로 마감이 지난
        # 공고는 '신청할 수 있는 것'이 아니므로 오늘 날짜로 다시 걸러냅니다.
        if st == "open" and end_left is not None and end_left < 0:
            continue
        rows.append({
            "id": d["id"], "title": d["title"], "url": d["source_url"],
            "category": d["category"],
            "funding_type": d.get("funding_type") or "기타",
            "group": _GROUP_OF.get(d.get("funding_type") or "기타", "etc"),
            "regions": d["regions"], "agency": d.get("agency") or d.get("ministry"),
            "posted_at": d.get("posted_at"),
            "apply_period_text": d.get("apply_period_text"),
            "apply_end": d.get("apply_end"), "open_status": st,
            "days_left": end_left if st == "open" else None,
            "start_in": _days(d.get("apply_start"), today) if st == "upcoming" else None,
            "amount_krw": d.get("amount_krw"), "rate_pct": d.get("rate_pct"),
            "smallbiz": bool(d.get("is_smallbiz")),
            "summary": " ".join((d.get("summary") or "").split())[:150],
            "fit": round(fit, 2), "why": why[:3],
            "_score": scores.get(i, 0.0), "_posted": _posted_ord(d),
        })

    # ── 4) 조건별 개수 — 자기 축만 빼고 센다(칩을 눌러도 0으로 안 죽게) ──
    def _pass(r: dict, skip: str) -> bool:
        return ((skip == "funding" or not funding or r["group"] == funding)
                and (skip == "category" or not category or r["category"] == category)
                and (skip == "status" or not status or r["open_status"] == status))

    counts = {
        "funding": {g: sum(1 for r in rows if _pass(r, "funding") and r["group"] == g)
                    for g in FUNDING_GROUPS},
        "category": {c: sum(1 for r in rows if _pass(r, "category") and r["category"] == c)
                     for c in CATEGORIES},
        "status": {s: sum(1 for r in rows if _pass(r, "status") and r["open_status"] == s)
                   for s in STATUSES},
    }

    rows = [r for r in rows if _pass(r, "")]

    # ── 5) 줄 세우기 ────────────────────────────────────────────────────
    def deadline_key(r: dict):
        # 마감 있는 접수 중 → 임박순, 곧 시작 → 시작 임박순, 상시 → 최신순
        if r["open_status"] == "open" and r["days_left"] is not None:
            return (0, r["days_left"], -r["_posted"])
        if r["open_status"] == "upcoming":
            return (1, r["start_in"] if r["start_in"] is not None else 9999, 0)
        return (2, -r["_posted"], 0)

    if sort == "auto":
        sort = ("relevance" if q else
                "fit" if (fit_only or my_region or my_industry) else "deadline")
    key = {
        "deadline": deadline_key,
        "newest": lambda r: (-r["_posted"], deadline_key(r)),
        "amount": lambda r: (0 if r["amount_krw"] else 1,
                             -(r["amount_krw"] or 0), deadline_key(r)),
        "fit": lambda r: (-r["fit"], deadline_key(r)),
        "relevance": lambda r: (-r["_score"], deadline_key(r)),
    }.get(sort)
    if key is None:
        key, sort = deadline_key, "deadline"
    rows.sort(key=key)

    total = len(rows)
    page = rows[offset:offset + limit]
    for r in page:
        r.pop("_score", None)
        r.pop("_posted", None)

    meta = ix["meta"]
    return {"ok": True, "total": total, "offset": offset, "limit": limit,
            "sort": sort, "items": page, "counts": counts,
            "index_total": len(docs), "my_sido": user_sido,
            "source": (f"{meta.get('source', '기업마당')} · "
                       f"{meta.get('built_for_date', '')} 기준 {len(docs)}건 색인"),
            "note": ("모든 항목은 공고 원문 링크가 근거입니다. 자격·한도·금리는 "
                     "공고와 심사 기준이 우선이니 원문을 꼭 확인하세요.")}
