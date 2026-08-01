"""기업마당 900건을 검색 가능한 색인으로 — 한 번 돌리고 파일로 남깁니다.

지금까지 정책자금 추천은 손으로 적은 12건에 낱말이 들어 있는지 보는 것이었습니다.
실제 공고 900건을 받아 두고도 쓰지 않고 있었습니다. 이 스크립트가 그 간극을
메웁니다.

만드는 것은 셋입니다.

  docs.json     공고 900건을 검색에 쓸 형태로 정리한 것. raw_text의 군더더기를
                걷어내고, 접수기간·금액·지역을 읽어 냅니다.
  tokens.txt    BM25용 낱말. 한 줄이 공고 하나입니다.
  vectors.npy   임베딩. 공고 하나가 여러 조각으로 나뉘므로 조각 수만큼 있습니다.

**왜 미리 만들어 두는가.** 서버가 2026-08-13에 사라집니다. 그때 GPU도 같이
사라집니다. 런타임이 GPU에 기대고 있으면 그날 서비스가 죽습니다. 무거운 일은
지금 여기서 끝내고, 배포본은 파일을 읽어 내적만 하게 둡니다.

**왜 두 벌을 재 보는가.** 문서는 GPU에서 fp32로, 질의는 CPU에서 int8로 잽니다.
서로 다른 정밀도의 벡터를 같은 공간에서 비교하는 셈이라, 그래도 되는지 재
보지 않고 넘어갈 수 없습니다. 두 방식으로 각각 색인을 만들어 같은 질문에
같은 순위가 나오는지 세어 보고, 그 숫자를 meta.json에 적어 둡니다.

실행:
    python -m scripts.build_policy_index
    python -m scripts.build_policy_index --no-gpu     # int8로만
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.korean_text import tokenize  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app", "data", "bizinfo_programs.json")
OUT_DIR = os.path.join(ROOT, "app", "data", "policy_index")

MODEL = "intfloat/multilingual-e5-small"
CHUNK_CHARS = 700          # e5의 512토큰에 한국어로 대략 들어맞는 길이
CHUNK_OVERLAP = 120
MAX_CHUNKS = 4             # 공고 하나가 색인을 독차지하지 못하게 막습니다


# ── 본문 손질 ─────────────────────────────────────────────────────────────
_HASHTAG = re.compile(r"#\s*([^\s#]{2,20})")
_WS = re.compile(r"[ \t]*\n[ \t]*")

# 모든 공고에 똑같이 들어가는 상투구. 남겨 두면 서로 비슷해 보입니다.
_BOILER = [
    "본 지원사업에 대한 문의", "해시태그 목록", "첨부파일", "본문출력파일",
    "바로보기", "다운로드", "온라인신청 바로가기", "목록", "인쇄",
]


def clean(text: str) -> str:
    t = _WS.sub("\n", text or "")
    lines = []
    for ln in t.split("\n"):
        s = ln.strip()
        if not s or len(s) < 2:
            continue
        if any(b in s for b in _BOILER):
            continue
        lines.append(s)
    return "\n".join(lines)


# 기업마당 공고는 사업개요 안에 ☞로 시작하는 줄을 둡니다. 관례상 첫 줄이
# '누가 신청할 수 있는지', 둘째 줄이 '무엇을 얼마나 주는지'입니다.
# 900건 전부에 있고 총 1,800줄입니다. 이걸 안 쓰고 자격·지원내용 칸을
# 빈 채로 내보내고 있었습니다.
#
# '지원대상' 같은 머리말로 찾으려 해 봤지만 189건뿐이었고, 그나마 대부분이
# "지원대상 공고문 참조"라 쓸모가 없었습니다. ☞ 쪽이 실제 내용을 담습니다.
_BULLET = re.compile(r"☞\s*(.+)")


def bullets(summary: str) -> list[str]:
    out = []
    for line in (summary or "").split("\n"):
        m = _BULLET.search(line)
        if not m:
            continue
        t = m.group(1).strip(" -·\t")
        if len(t) >= 6:
            out.append(t[:220])
    return out[:4]


def hashtags(raw: str) -> list[str]:
    """공고에 달린 해시태그. 작성자가 직접 고른 낱말이라 제목보다 정확할 때가 있습니다."""
    seen, out = set(), []
    for h in _HASHTAG.findall(raw or ""):
        h = h.strip()
        if h and h not in seen and len(h) <= 20:
            seen.add(h)
            out.append(h)
    return out[:30]


# ── 접수기간 ──────────────────────────────────────────────────────────────
_PERIOD = re.compile(r"(\d{4})-(\d{2})-(\d{2})\s*~\s*(\d{4})-(\d{2})-(\d{2})")

# 날짜가 안 적힌 표현들. "예산 소진시까지"가 223건으로 가장 많습니다.
_ALWAYS = ("상시", "예산 소진", "선착순", "소진시", "수시")
_CLOSED_WORDS = ("모집 완료", "모집 마감")


def read_period(s: str) -> tuple[str | None, str | None, str]:
    """접수기간을 읽습니다. 못 읽으면 못 읽었다고 표시합니다.

    900건 중 385건이 날짜가 아닌 말로 적혀 있습니다. 그것을 억지로 날짜로
    바꾸면 "마감됐는데 열려 있다고 나오는" 사고가 납니다. 모르는 것은
    모른다고 두고 화면에 원문을 그대로 보여 줍니다.
    """
    s = (s or "").strip()
    m = _PERIOD.search(s)
    if m:
        a = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        b = f"{m.group(4)}-{m.group(5)}-{m.group(6)}"
        return a, b, "dated"
    if any(w in s for w in _CLOSED_WORDS):
        return None, None, "closed"
    if any(w in s for w in _ALWAYS):
        return None, None, "rolling"
    return None, None, "unknown"


def open_status(start: str | None, end: str | None, kind: str, today: date) -> str:
    if kind != "dated":
        return kind                       # rolling / closed / unknown
    if end and datetime.strptime(end, "%Y-%m-%d").date() < today:
        return "closed"
    if start and datetime.strptime(start, "%Y-%m-%d").date() > today:
        return "upcoming"
    return "open"


# ── 금액 ──────────────────────────────────────────────────────────────────
_UNIT = {"억": 100_000_000, "천만": 10_000_000, "백만": 1_000_000, "만": 10_000}
_AMOUNT = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(억|천만|백만|만)\s*원")

# 이 말이 금액 가까이 있으면 "임가 하나가 받을 수 있는 한도"일 가능성이 높습니다.
_LIMIT_CUE = ("한도", "최대", "이내", "까지", "당", "업체당", "기업당", "1개사", "개사당")
# 이쪽이면 사업 전체 예산입니다. 신청자가 받는 돈이 아닙니다.
_BUDGET_CUE = ("총사업비", "총 사업비", "사업규모", "예산", "총액", "규모는", "출연금")


def read_amount(text: str) -> tuple[int | None, str | None]:
    """금액을 읽되 **그것이 무엇인지** 함께 남깁니다.

    기존 수집기는 본문에서 찾은 금액 중 가장 큰 것을 limit_krw에 넣었습니다.
    그래서 "총사업비 4,000억원"이 한도로 둔갑했습니다. 화면에는 '한도'라고
    적혀 나가므로 사장님이 4,000억을 빌릴 수 있다고 읽습니다.

    앞뒤 30자를 보고 한도인지 예산인지 가릅니다. 어느 쪽인지 모르면
    금액을 내보내지 않습니다. 틀린 숫자보다 빈칸이 낫습니다.
    """
    best: tuple[int, str] | None = None
    for m in _AMOUNT.finditer(text or ""):
        try:
            n = float(m.group(1).replace(",", ""))
        except ValueError:
            continue
        val = int(n * _UNIT[m.group(2)])
        lo, hi = max(0, m.start() - 30), min(len(text), m.end() + 30)
        around = text[lo:hi]
        if any(c in around for c in _BUDGET_CUE):
            continue
        if any(c in around for c in _LIMIT_CUE):
            if best is None or val > best[0]:
                best = (val, "한도")
    if best is None:
        return None, None
    # 개인 한도가 100억을 넘는 지원사업은 없습니다. 잘못 읽은 것입니다.
    if best[0] > 10_000_000_000:
        return None, None
    return best[0], best[1]


_RATE = re.compile(r"(?:금리|이율|이자|대출금리)[^\d%]{0,12}(\d+(?:\.\d+)?)\s*%")


def read_rate(text: str) -> float | None:
    m = _RATE.search(text or "")
    if not m:
        return None
    v = float(m.group(1))
    return v if 0 < v < 20 else None


# ── 지역 ──────────────────────────────────────────────────────────────────
REGION_ALIAS = {
    "전남광주": ["전남", "광주"], "대전세종": ["대전", "세종"],
    "서울": ["서울"], "경기": ["경기"], "인천": ["인천"], "부산": ["부산"],
    "대구": ["대구"], "울산": ["울산"], "세종": ["세종"], "강원": ["강원"],
    "충북": ["충북"], "충남": ["충남"], "전북": ["전북"], "전남": ["전남"],
    "경북": ["경북"], "경남": ["경남"], "제주": ["제주"], "광주": ["광주"],
    "대전": ["대전"],
}


def read_region(title: str) -> list[str]:
    """제목 앞머리의 [경북] 같은 표시. 없으면 전국 사업으로 봅니다."""
    m = re.match(r"\[([^\]]{2,10})\]", title or "")
    if not m:
        return []
    return REGION_ALIAS.get(m.group(1).strip(), [m.group(1).strip()])


# ── 소상공인 적합도 ───────────────────────────────────────────────────────
#
# 900건 중 소상공인에게 실제로 쓸모 있는 것은 일부입니다. 나머지는 중소·중견
# 기업의 연구개발·설비·수출 공고입니다. 그런데 둘이 쓰는 말이 겹칩니다.
# "지원", "자금", "창업"은 양쪽에 다 나옵니다.
#
# 수집기의 is_smallbiz는 '창업'이라는 낱말 하나에도 참이 되어 900건 중
# 693건이 참이었습니다. 사실상 아무것도 안 거른 것입니다. 그래서 정도를
# 재는 쪽으로 바꿉니다. 참/거짓이 아니라 -1에서 1 사이의 값입니다.
#
# 이 값으로 **거르지는 않습니다.** 순위를 미는 데만 씁니다. 동네 카페
# 사장님께 반도체 R&D 공고를 1순위로 보여 주지 않으면서도, 정말 그것을
# 찾는 분이 물으면 나오게 두기 위해서입니다.
_SB_STRONG = [
    "소상공인", "자영업", "점포", "상점가", "골목상권", "골목상점", "전통시장",
    "소상공인시장진흥공단", "신용보증재단", "상인회", "소상공인연합회",
    "외식업", "음식점", "이·미용", "미용실", "세탁", "편의점", "카페",
    "생활밀착", "1인 사업자", "동네",
]
_SB_WEAK = ["창업", "경영안정", "판로", "상권", "가게", "업소", "소규모", "영세"]
_SB_NOT = [
    "연구개발", "R&D", "기술개발", "시제품", "특허", "지식재산", "벤처투자",
    "스타트업", "딥테크", "중견기업", "실증", "컨소시엄", "기술이전",
    "스마트공장", "방산", "반도체", "바이오", "소재부품장비", "제조혁신",
    "대학", "연구소", "사업화", "고도화",
]


def smallbiz_fit(doc_text: str, title: str) -> float:
    """소상공인 쪽에 얼마나 가까운 공고인가. -1에서 1 사이.

    제목에 나온 단서를 본문보다 세게 봅니다. 공고 제목은 작성자가 무엇에
    대한 사업인지 압축해 적은 것이라, 본문 어딘가에 스친 낱말보다 믿을
    만합니다.
    """
    blob = doc_text[:2500]

    def count(words, text, cap):
        return min(sum(1 for w in words if w in text), cap)

    s = (2.0 * count(_SB_STRONG, title, 2) + 1.0 * count(_SB_STRONG, blob, 3)
         + 0.5 * count(_SB_WEAK, title, 2) + 0.25 * count(_SB_WEAK, blob, 3))
    n = 1.5 * count(_SB_NOT, title, 2) + 0.75 * count(_SB_NOT, blob, 4)

    raw = (s - n) / 6.0
    return round(max(-1.0, min(1.0, raw)), 3)


# ── 문서 만들기 ───────────────────────────────────────────────────────────
def build_docs(raw: list[dict], today: date) -> list[dict]:
    docs = []
    for r in raw:
        summary = clean(r.get("summary", ""))[:1800]
        how = clean(r.get("how_to_apply", ""))[:500]
        tags = hashtags(r.get("raw_text", ""))
        bl = bullets(r.get("summary", ""))
        start, end, kind = read_period(r.get("apply_period", ""))
        amount, basis = read_amount(r.get("raw_text", ""))
        regions = read_region(r.get("title", ""))

        title = re.sub(r"^\[[^\]]{2,10}\]\s*", "", r.get("title", "")).strip()

        # 검색에 태울 본문. 제목·분야·기관·태그를 앞에 두어 짧은 질의가
        # 걸릴 확률을 높입니다.
        body = "\n".join(filter(None, [
            title,
            f"{r.get('category','')} 분야",
            f"{r.get('ministry','')} {r.get('agency','')}",
            " ".join(tags),
            summary,
            how,
        ]))

        docs.append({
            "id": r["pblanc_id"],
            "title": title,
            "category": r.get("category", "기타"),
            "ministry": r.get("ministry", ""),
            "agency": r.get("agency", ""),
            "regions": regions,
            "posted_at": r.get("posted_at", ""),
            "apply_period_text": r.get("apply_period", ""),
            "apply_start": start,
            "apply_end": end,
            "open_status": open_status(start, end, kind, today),
            "summary": summary[:900],
            "how_to_apply": how,
            "apply_site": r.get("apply_site", ""),
            "contact": (r.get("contact", "") or "")[:300],
            "source_url": r.get("source_url", ""),
            "is_smallbiz": bool(r.get("is_smallbiz")),
            "is_finance": bool(r.get("is_finance")),
            "smallbiz_fit": smallbiz_fit(body, title),
            "amount_krw": amount,
            "amount_basis": basis,
            "rate_pct": read_rate(r.get("raw_text", "")),
            "tags": tags,
            # 첫 줄이 대상, 둘째 줄부터가 지원내용입니다. 규칙이 어긋나는
            # 공고도 있으므로 '공고가 이렇게 적었다'는 뜻으로만 씁니다.
            "eligibility": bl[:1],
            "support": bl[1:3],
            "text": body,
        })
    return docs


def chunks_of(doc: dict) -> list[str]:
    """긴 공고를 조각냅니다. 제목을 조각마다 붙여 홀로도 뜻이 통하게 둡니다.

    e5는 512토큰까지만 봅니다. 자르지 않으면 공고 뒷부분 — 지원 내용과
    자격 요건이 대개 거기 있습니다 — 이 통째로 색인에서 빠집니다.
    """
    head = f"{doc['title']} ({doc['category']})"
    body = doc["text"]
    if len(body) <= CHUNK_CHARS:
        return [body]
    out, i = [], 0
    while i < len(body) and len(out) < MAX_CHUNKS:
        piece = body[i: i + CHUNK_CHARS]
        out.append(piece if i == 0 else f"{head}\n{piece}")
        i += CHUNK_CHARS - CHUNK_OVERLAP
    return out


# ── 임베딩 ────────────────────────────────────────────────────────────────
def embed_gpu(texts: list[str]) -> np.ndarray:
    import torch
    from sentence_transformers import SentenceTransformer

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"  GPU 임베딩 — {MODEL} on {dev}")
    m = SentenceTransformer(MODEL, device=dev)
    v = m.encode([f"passage: {t}" for t in texts], batch_size=64,
                 normalize_embeddings=True, show_progress_bar=True,
                 convert_to_numpy=True)
    return v.astype(np.float32)


def embed_onnx(texts: list[str]) -> np.ndarray | None:
    from app.services import query_encoder as qe

    if not qe.available():
        return None
    print("  int8 ONNX 임베딩 (CPU)")
    out = []
    for i in range(0, len(texts), 32):
        v = qe.encode(texts[i: i + 32], kind="passage")
        if v is None:
            return None
        out.append(v)
        if i % 320 == 0:
            print(f"\r    {i}/{len(texts)}", end="")
    print()
    return np.vstack(out)


# ── 두 벌이 같은 순위를 내는지 ────────────────────────────────────────────
PROBE = [
    "장사가 안돼서 급하게 운영자금이 필요해요",
    "연남동에 카페를 새로 열려고 하는데 창업 지원금이 있나요",
    "폐업하고 다시 시작하려는데 도와주는 사업이 있을까요",
    "온라인 쇼핑몰로 해외에 팔고 싶어요",
    "가게 인테리어 고치는 데 보태 주는 지원이 있나요",
    "직원 뽑으면 인건비를 지원받을 수 있나요",
    "신용등급이 낮아도 받을 수 있는 대출",
    "청년 창업자한테 주는 지원사업",
    "전통시장 상인 지원",
    "스마트공장 설비 도입 자금",
]


def center(vectors: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """벡터 뭉치에서 '모두가 공유하는 방향'을 빼냅니다.

    e5로 잰 공고 3,326개의 코사인 유사도가 0.82~0.86 사이에 다 몰려 있었습니다.
    폭이 0.035입니다. 이래서는 순위가 사실상 잡음으로 정해집니다. 실제로
    "장사가 안돼서 운영자금이 필요해요"에 「IP투자연계 지식재산평가」가
    1위로 나왔습니다.

    임베딩 공간이 한쪽으로 쏠려 있기 때문입니다(anisotropy). 모든 벡터가
    공통으로 갖는 성분 — 여기서는 '정부 지원사업 공고체' 자체 — 이 유사도의
    대부분을 차지하고, 정작 내용의 차이는 나머지 좁은 폭에 눌려 있습니다.

    평균 방향을 빼고 다시 정규화하면 그 공통 성분이 사라집니다. 폭이
    0.225로 벌어지고, 같은 질문에 「소상공인 경영안정자금」이 1위가 됩니다.

    질의도 **같은 평균**으로 빼야 합니다. 한쪽만 빼면 두 벡터가 다른 공간에
    놓입니다. 그래서 평균을 파일로 남겨 런타임에 넘깁니다.
    """
    mu = vectors.mean(axis=0)
    mu /= np.linalg.norm(mu)
    out = vectors - (vectors @ mu)[:, None] * mu
    out /= np.clip(np.linalg.norm(out, axis=1, keepdims=True), 1e-9, None)
    return out.astype(np.float32), mu.astype(np.float32)


def spread(vectors: np.ndarray, mu: np.ndarray | None = None) -> float:
    """색인이 얼마나 변별력이 있는지 한 숫자로 — 1등과 중간값의 거리.

    질의도 문서와 같은 처리를 거쳐야 합니다. 중심화한 색인에 날것의 질의를
    대면 두 벡터가 다른 공간에 놓여 숫자가 뜻을 잃습니다.
    """
    from app.services import query_encoder as qe

    q = qe.encode(PROBE, kind="query")
    if q is None:
        return 0.0
    if mu is not None:
        q = q - (q @ mu)[:, None] * mu
        q /= np.clip(np.linalg.norm(q, axis=1, keepdims=True), 1e-9, None)
    sim = q @ vectors.T
    return round(float(np.mean(sim.max(axis=1) - np.median(sim, axis=1))), 4)


def agreement(a: np.ndarray, b: np.ndarray, owner: np.ndarray, k: int = 10) -> dict:
    """같은 질문에 두 색인이 같은 공고를 고르는지 셉니다.

    질의는 배포본과 같은 조건 — int8 CPU — 으로 한 번만 만듭니다. 문서
    쪽만 fp32와 int8로 갈아 끼워 순위를 비교합니다. 우리가 알고 싶은 것은
    '문서를 어느 정밀도로 재 두어야 하는가'이기 때문입니다.
    """
    from app.services import query_encoder as qe

    q = qe.encode(PROBE, kind="query")
    if q is None:
        return {"error": "질의 인코더 없음"}

    def topk(mat):
        sim = q @ mat.T                                   # (Q, chunks)
        best = {}
        for qi in range(sim.shape[0]):
            per_doc: dict[int, float] = {}
            for ci, s in enumerate(sim[qi]):
                d = int(owner[ci])
                if s > per_doc.get(d, -2):
                    per_doc[d] = float(s)
            best[qi] = [d for d, _ in sorted(per_doc.items(), key=lambda x: -x[1])[:k]]
        return best

    ta, tb = topk(a), topk(b)
    overlap = [len(set(ta[i]) & set(tb[i])) / k for i in ta]
    same_top1 = sum(1 for i in ta if ta[i][0] == tb[i][0]) / len(ta)
    return {
        "probe_queries": len(PROBE),
        "top10_overlap_mean": round(float(np.mean(overlap)), 3),
        "top1_same": round(same_top1, 3),
    }


def _save(docs: list[dict], texts: list[str], vectors: np.ndarray, owner: np.ndarray,
          mu: np.ndarray, src: dict, report: dict, centering: dict,
          today: date, chosen: str) -> None:
    """색인 다섯 벌을 파일로 남깁니다. 런타임이 읽는 것은 이것뿐입니다."""
    os.makedirs(OUT_DIR, exist_ok=True)
    np.save(os.path.join(OUT_DIR, "center.npy"), mu)
    np.save(os.path.join(OUT_DIR, "vectors.npy"), vectors)
    np.save(os.path.join(OUT_DIR, "owner.npy"), owner)
    with open(os.path.join(OUT_DIR, "docs.json"), "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False)
    with open(os.path.join(OUT_DIR, "tokens.txt"), "w", encoding="utf-8") as f:
        for d in docs:
            f.write(" ".join(tokenize(d["text"])) + "\n")

    st: dict[str, int] = {}
    for d in docs:
        st[d["open_status"]] = st.get(d["open_status"], 0) + 1

    meta = {
        "built_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "built_for_date": today.isoformat(),
        "source": src.get("source"),
        "collected_at": src.get("collected_at"),
        "model": MODEL,
        "doc_vectors": chosen,
        "query_vectors": "int8(ONNX) — CPU",
        "precision_check": report,
        "centering": centering,
        "docs": len(docs),
        "chunks": len(texts),
        "dim": int(vectors.shape[1]),
        "open_status": st,
        "with_amount": sum(1 for d in docs if d["amount_krw"]),
        "with_rate": sum(1 for d in docs if d["rate_pct"]),
        "smallbiz_positive": sum(1 for d in docs if d["smallbiz_fit"] > 0.2),
        "finance": sum(1 for d in docs if d["is_finance"]),
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    size = sum(os.path.getsize(os.path.join(OUT_DIR, n)) for n in os.listdir(OUT_DIR))
    print(f"\n[saved] {OUT_DIR}  ({size/1e6:.2f} MB)")
    print(f"  접수 상태 — {st}")
    print(f"  한도 {meta['with_amount']}건 · 금리 {meta['with_rate']}건 · "
          f"소상공인 적합 {meta['smallbiz_positive']}건")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-gpu", action="store_true")
    ap.add_argument("--reuse-vectors", action="store_true",
                    help="임베딩은 그대로 두고 본문·낱말만 다시 만듭니다. "
                         "불용어나 금액 읽는 규칙만 손봤을 때 씁니다.")
    a = ap.parse_args()

    today = date.today()
    with open(SRC, encoding="utf-8") as f:
        src = json.load(f)
    raw = src["programs"]
    print(f"기업마당 {len(raw)}건 → 색인")

    docs = build_docs(raw, today)

    texts, owner = [], []
    for i, d in enumerate(docs):
        for c in chunks_of(d):
            texts.append(c)
            owner.append(i)
    owner_arr = np.array(owner, dtype=np.int32)
    print(f"  조각 {len(texts)}개 (공고당 평균 {len(texts)/len(docs):.1f})")

    reuse = None
    if a.reuse_vectors:
        vp = os.path.join(OUT_DIR, "vectors.npy")
        cp = os.path.join(OUT_DIR, "center.npy")
        if os.path.exists(vp) and os.path.exists(cp):
            reuse = np.load(vp)
            if reuse.shape[0] != len(texts):
                print(f"  [무시] 조각 수가 달라졌습니다 "
                      f"({reuse.shape[0]} → {len(texts)}). 다시 계산합니다.")
                reuse = None
    if reuse is not None:
        print("  임베딩은 그대로 씁니다 (--reuse-vectors)")
        mu = np.load(os.path.join(OUT_DIR, "center.npy"))
        # 앞서 잰 값을 그대로 물려줍니다. 벡터를 안 건드렸으니 여전히 맞는
        # 숫자인데, 빈칸으로 두면 "잰 적 없음"과 구별되지 않습니다.
        prev = {}
        mp = os.path.join(OUT_DIR, "meta.json")
        if os.path.exists(mp):
            with open(mp, encoding="utf-8") as f:
                prev = json.load(f)
        _save(docs, texts, reuse, owner_arr, mu, src,
              prev.get("precision_check", {}), prev.get("centering", {}),
              today, prev.get("doc_vectors", "int8(ONNX)"))
        return 0

    v_onnx = embed_onnx(texts)
    v_gpu = None if a.no_gpu else embed_gpu(texts)

    report = {}
    if v_gpu is not None and v_onnx is not None:
        report = agreement(v_gpu, v_onnx, owner_arr)
        print(f"\n  fp32 문서색인 vs int8 문서색인 — "
              f"상위10 겹침 {report.get('top10_overlap_mean')} · "
              f"1위 일치 {report.get('top1_same')}")

    # 배포본의 질의는 int8입니다. 문서도 int8로 두면 같은 저울을 씁니다.
    # 겹침이 충분히 높으면 fp32(더 정확한 쪽)를 쓰고, 아니면 저울을 맞춥니다.
    use_gpu = v_gpu is not None and report.get("top10_overlap_mean", 0) >= 0.8
    vectors = v_gpu if use_gpu else (v_onnx if v_onnx is not None else v_gpu)
    chosen = "fp32(GPU)" if use_gpu else "int8(ONNX)"
    print(f"  고른 것 — {chosen}")

    before = spread(vectors)
    vectors, mu = center(vectors)
    after = spread(vectors, mu)
    print(f"  평균 중심화 — 변별폭 {before} → {after}")

    _save(docs, texts, vectors, owner_arr, mu, src, report,
          {"spread_before": before, "spread_after": after}, today, chosen)
    return 0


if __name__ == "__main__":
    sys.exit(main())
