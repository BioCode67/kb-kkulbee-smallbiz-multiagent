"""정책자금 검색 — 낱말과 뜻, 둘 다로 찾습니다.

기업마당 공고 900건에서 사장님 질문에 맞는 것을 고릅니다. 두 갈래로 찾아
합칩니다.

  **BM25** — 낱말이 실제로 들어 있는지. "전통시장", "연남동", "스마트공장"
  처럼 그 낱말이어야만 하는 것을 놓치지 않습니다. 대신 "장사가 안돼요"와
  "경영안정자금"을 잇지 못합니다.

  **임베딩** — 뜻이 가까운지. 위의 간극을 메웁니다. 대신 "전통시장"과
  "전통주 시장"을 헷갈립니다.

둘의 약점이 서로 다르므로 합치면 각자보다 낫습니다. 점수를 더하지 않고
**순위를 섞습니다**(RRF). BM25 점수와 코사인 유사도는 단위가 달라서 더할 수
없습니다. 가중치를 손으로 맞춰 봐야 자료가 바뀌면 다시 틀어집니다.

그리고 **왜 골랐는지 반드시 남깁니다.** 유사도 0.87은 사장님에게 근거가
되지 못합니다. 어느 낱말이 걸렸는지, 지역이 맞는지, 접수 중인지 — 사람이
읽고 판단할 수 있는 것만 이유로 내보냅니다.
"""
from __future__ import annotations

import math
import os
import re
import threading
from collections import defaultdict
from datetime import date, datetime

import numpy as np

from app.services import query_encoder
from app.services.korean_text import tokenize

INDEX_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "data", "policy_index")

BM25_K1 = 1.2
BM25_B = 0.75
RRF_K = 60           # 순위 섞기 상수. 60은 원 논문 값이고 순위 차가 클 때 안정적입니다.
POOL = 60            # 각 갈래에서 가져올 후보 수

# 흔한 낱말 하나만 걸린 것은 후보로 치지 않습니다.
#
# IDF 1.2는 900건 중 대략 200건보다 드물게 나오는 낱말입니다. '지원사업'
# (600건 남짓, IDF 0.4)은 걸러지고 '인테리어'(5건, IDF 5.1)는 남습니다.
# 이 문턱이 없으면 아무 낱말이나 겹친 공고 예순 개가 후보로 들어와
# 순위 섞기를 오염시킵니다.
IDF_FLOOR = 1.2
DENSE_FLOOR = 0.12   # 중심화한 뒤의 코사인. 이보다 낮으면 내용이 닿지 않는 것입니다.
ANSWER_FLOOR = 0.20  # 이만큼도 안 닿으면 "못 찾았다"가 맞는 답입니다.

_lock = threading.Lock()
_idx: dict = {}


# ── 색인 적재 ─────────────────────────────────────────────────────────────
def _load() -> dict:
    """첫 검색 때 한 번만 올립니다. 기동을 막지 않습니다."""
    if _idx:
        return _idx
    with _lock:
        if _idx:
            return _idx
        import json

        with open(os.path.join(INDEX_DIR, "docs.json"), encoding="utf-8") as f:
            docs = json.load(f)
        with open(os.path.join(INDEX_DIR, "tokens.txt"), encoding="utf-8") as f:
            doc_tokens = [ln.split() for ln in f.read().splitlines()]
        with open(os.path.join(INDEX_DIR, "meta.json"), encoding="utf-8") as f:
            meta = json.load(f)

        # BM25 역색인. 900건이라 적재 때 만들어도 0.3초면 끝납니다.
        postings: dict[str, list[tuple[int, int]]] = defaultdict(list)
        lengths = np.zeros(len(docs), dtype=np.float32)
        for i, toks in enumerate(doc_tokens):
            lengths[i] = len(toks)
            tf: dict[str, int] = defaultdict(int)
            for t in toks:
                tf[t] += 1
            for t, n in tf.items():
                postings[t].append((i, n))

        n_docs = len(docs)
        avgdl = float(lengths.mean()) or 1.0
        idf = {t: math.log(1 + (n_docs - len(p) + 0.5) / (len(p) + 0.5))
               for t, p in postings.items()}

        vectors = owner = mu = None
        vp = os.path.join(INDEX_DIR, "vectors.npy")
        if os.path.exists(vp):
            vectors = np.load(vp)
            owner = np.load(os.path.join(INDEX_DIR, "owner.npy"))
            cp = os.path.join(INDEX_DIR, "center.npy")
            mu = np.load(cp) if os.path.exists(cp) else None

        _idx.update(docs=docs, postings=dict(postings), idf=idf, lengths=lengths,
                    avgdl=avgdl, vectors=vectors, owner=owner, center=mu, meta=meta)
    return _idx


def meta() -> dict:
    """색인이 무엇으로 언제 만들어졌는지. 화면 하단에 출처로 씁니다."""
    return dict(_load()["meta"])


# ── 갈래 1. BM25 ──────────────────────────────────────────────────────────
def _bm25(terms: list[str]) -> tuple[dict[int, float], dict[int, set[str]], set[int]]:
    """낱말이 실제로 들어 있는 공고를 셉니다.

    세 번째로 돌려주는 것은 '변별력 있는 낱말이 걸린 공고'입니다. 흔한
    낱말만 걸린 공고를 후보에서 빼는 데 씁니다.
    """
    ix = _load()
    scores: dict[int, float] = defaultdict(float)
    hits: dict[int, set[str]] = defaultdict(set)
    solid: set[int] = set()

    for t in set(terms):
        p = ix["postings"].get(t)
        if not p:
            continue
        w = ix["idf"][t]
        for doc, tf in p:
            dl = ix["lengths"][doc]
            denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / ix["avgdl"])
            scores[doc] += w * tf * (BM25_K1 + 1) / denom
            hits[doc].add(t)
            if w >= IDF_FLOOR:
                solid.add(doc)
    return scores, hits, solid


# ── 갈래 2. 임베딩 ────────────────────────────────────────────────────────
def _dense(question: str) -> dict[int, float]:
    """조각 단위로 재고 공고 단위로 접습니다.

    긴 공고는 여러 조각으로 나뉘어 있습니다. 조각 하나만 잘 맞아도 그 공고는
    관련이 있는 것이므로, 평균이 아니라 **가장 잘 맞는 조각**으로 셉니다.
    평균을 쓰면 긴 공고가 부당하게 손해를 봅니다.

    질의는 색인과 **같은 평균**으로 중심화합니다. 이 한 줄을 빼면 유사도가
    0.82~0.86에 몰려 순위가 잡음으로 정해집니다(색인 만들 때 잰 값입니다).
    """
    ix = _load()
    if ix["vectors"] is None:
        return {}
    q = query_encoder.encode_one(question)
    if q is None:
        return {}

    mu = ix.get("center")
    if mu is not None:
        q = q - float(q @ mu) * mu
        q = q / max(float(np.linalg.norm(q)), 1e-9)

    sim = ix["vectors"] @ q                       # (chunks,)
    best: dict[int, float] = {}
    owner = ix["owner"]
    for ci in np.argsort(-sim)[: POOL * 6]:
        d = int(owner[ci])
        s = float(sim[ci])
        if s > best.get(d, -2.0):
            best[d] = s
    return best


# ── 합치기 ────────────────────────────────────────────────────────────────
def _rrf(*ranked: list[int]) -> dict[int, float]:
    """순위를 섞습니다. 점수 단위가 달라도 순위는 비교할 수 있습니다."""
    out: dict[int, float] = defaultdict(float)
    for lst in ranked:
        for rank, doc in enumerate(lst):
            out[doc] += 1.0 / (RRF_K + rank + 1)
    return out


# ── 거르기 ────────────────────────────────────────────────────────────────
_SIDO = ["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종",
         "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]


def region_of(text: str | None) -> str | None:
    """'서울 마포구 연남동'에서 '서울'을 읽습니다."""
    if not text:
        return None
    for s in _SIDO:
        if s in text:
            return s
    # 광역시 축약형도 봅니다 — '서울특별시', '부산광역시'
    m = re.search(r"([가-힣]{2})(?:특별시|광역시|특별자치시|도|특별자치도)", text)
    return m.group(1) if m and m.group(1) in _SIDO else None


_MONEY_WORDS = ("자금", "대출", "융자", "보증", "금리", "빌리", "돈", "한도", "이자", "상환")


def _amount_wanted(q: str) -> int | None:
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만|만)\s*원?", q.replace(" ", ""))
    if not m:
        return None
    unit = {"억": 100_000_000, "천만": 10_000_000, "백만": 1_000_000, "만": 10_000}
    return int(float(m.group(1).replace(",", "")) * unit[m.group(2)])


# ── 검색 ──────────────────────────────────────────────────────────────────
def search(question: str, region: str | None = None, industry: str | None = None,
           k: int = 5, today: date | None = None) -> list[dict]:
    """질문에 맞는 공고를 고르고, 왜 골랐는지 함께 돌려줍니다."""
    ix = _load()
    docs = ix["docs"]
    today = today or date.today()

    q_full = " ".join(filter(None, [question, industry or ""]))
    terms = tokenize(q_full)

    bm, hits, solid = _bm25(terms)
    dn = _dense(q_full)

    # 근거가 있는 것만 후보로 올립니다. 흔한 낱말 하나로 걸린 공고와,
    # 내용이 닿지 않는 공고를 여기서 떨굽니다.
    bm_rank = [d for d, _ in sorted(bm.items(), key=lambda x: -x[1]) if d in solid][:POOL]
    dn_rank = [d for d, s in sorted(dn.items(), key=lambda x: -x[1])
               if s >= DENSE_FLOOR][:POOL]

    fused = _rrf(bm_rank, dn_rank)
    if not fused:
        return []

    # 어느 쪽으로도 충분히 닿지 않으면 빈손으로 돌아갑니다. 900건 중
    # 무엇이든 상위 다섯 개는 뽑히지만, 관련이 없으면 "못 찾았습니다"가
    # 맞는 답입니다. 억지로 채운 목록은 사장님의 시간을 뺏습니다.
    if not solid and max(dn.values(), default=0.0) < ANSWER_FLOOR:
        return []

    want = _amount_wanted(question)
    asks_money = any(w in question for w in _MONEY_WORDS)
    user_sido = region_of(region) or region_of(question)

    scored = []
    for doc_i, base in fused.items():
        d = docs[doc_i]

        # 지역이 어긋나면 뺍니다. 경북 사업을 서울 사장님께 권할 수 없습니다.
        if d["regions"] and user_sido and user_sido not in d["regions"]:
            continue
        # 이미 끝난 공고는 뺍니다.
        if d["open_status"] == "closed":
            continue

        # 관련도(RRF)와 적합도(사전확률)를 **곱합니다.**
        #
        # 처음에는 더했습니다. 그런데 RRF 점수는 0.008~0.033 사이에 있고
        # 보너스 하나가 0.004~0.006이라, 조건 서넛만 맞으면 관련도를 통째로
        # 덮어썼습니다. "소상공인 대상이고 전국이고 접수 중"이라는 이유만으로
        # 질문과 아무 상관없는 공고가 1위로 올라오는 구조였습니다.
        #
        # 곱하면 관련도가 낮은 것은 사전확률이 아무리 좋아도 낮게 남습니다.
        # 사전확률은 비슷비슷한 것들 사이의 순서를 정하는 데만 쓰입니다.
        prior = 1.0
        why: list[str] = []

        matched = sorted(hits.get(doc_i, set()), key=len, reverse=True)[:3]
        if matched:
            why.append(f"공고 본문에 '{' · '.join(matched)}'이(가) 그대로 나옵니다")
        elif doc_i in dn:
            why.append("낱말은 다르지만 내용이 질문과 가장 가깝습니다")

        # 소상공인 적합도 — 이 서비스를 쓰는 분이 소상공인이기 때문입니다.
        fit = float(d.get("smallbiz_fit", 0.0))
        prior *= 1.0 + 0.35 * fit
        if fit >= 0.35:
            why.append("소상공인·자영업자를 위한 사업입니다")
        elif fit <= -0.35:
            why.append("중소·중견기업 대상이라 조건을 먼저 확인하셔야 합니다")

        if d["regions"]:
            if user_sido and user_sido in d["regions"]:
                prior *= 1.20
                why.append(f"{'·'.join(d['regions'])} 지역 사업이라 해당됩니다")
        else:
            prior *= 1.05
            why.append("전국에서 신청할 수 있습니다")

        if asks_money and d["is_finance"]:
            prior *= 1.15
            why.append("자금·융자·보증에 해당하는 사업입니다")

        if d["open_status"] == "open" and d["apply_end"]:
            left = (datetime.strptime(d["apply_end"], "%Y-%m-%d").date() - today).days
            prior *= 1.10
            why.append(f"접수 중입니다 — {d['apply_end']}까지 {left}일 남았습니다")
        elif d["open_status"] == "rolling":
            prior *= 1.05
            why.append(f"접수기간이 '{d['apply_period_text']}'입니다")
        elif d["open_status"] == "upcoming":
            why.append(f"{d['apply_start']}부터 접수를 시작합니다")

        if want and d["amount_krw"]:
            if d["amount_krw"] >= want:
                prior *= 1.10
                why.append(f"한도가 {_won(d['amount_krw'])}이라 요청하신 "
                           f"{_won(want)}을 다룰 수 있습니다")
            else:
                prior *= 0.90
                why.append(f"한도가 {_won(d['amount_krw'])}이라 요청액에 못 미칩니다")

        if d["rate_pct"] is not None:
            why.append(f"공고에 적힌 금리는 {d['rate_pct']}%입니다")

        scored.append((base * prior, doc_i, why))

    scored.sort(key=lambda x: -x[0])

    # 근거가 약한 것은 아예 내보내지 않습니다. 900건 중 무엇이든 상위 다섯
    # 개는 나오지만, 관련이 없으면 "없습니다"가 맞는 답입니다. 억지로 채운
    # 목록은 사장님의 시간을 뺏고 서비스의 신뢰를 깎습니다.
    if scored:
        floor = scored[0][0] * 0.55
        scored = [x for x in scored if x[0] >= floor]

    top = scored[:k]
    if not top:
        return []

    hi = top[0][0] or 1.0
    out = []
    for s, doc_i, why in top:
        d = dict(docs[doc_i])
        d["match_score"] = round(min(100.0, 100.0 * s / hi), 1)
        d["match_reasons"] = why[:4]
        out.append(d)
    return out


def _won(v: int) -> str:
    if v >= 100_000_000:
        n = v / 100_000_000
        return f"{n:.0f}억원" if n == int(n) else f"{n:.1f}억원"
    if v >= 10_000_000:
        return f"{v // 10_000_000}천만원"
    return f"{v // 10_000:,}만원"
