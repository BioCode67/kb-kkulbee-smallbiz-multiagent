"""
기업마당 지원사업 수집기 — 실제 공고를 받아 구조화합니다.

지금까지 정책자금 목록은 손으로 적은 열두 건이었습니다. 그럴듯해 보이지만
심사에서 "이 자료는 어디서 왔나요"라고 물으면 답할 것이 없습니다.

중소벤처기업부 기업마당(bizinfo.go.kr)은 정부·지자체의 지원사업 공고를 모아
공개합니다. 공식 API는 키가 필요하지만 목록과 상세 페이지는 열려 있으므로,
그것을 읽어 구조화합니다.

지켜야 할 것이 있습니다.

  · 정부 사이트를 두드리는 일이라 요청 사이에 반드시 쉽니다. 한 번 받은 것은
    캐시에 남겨 다시 받지 않습니다.
  · 받은 시각과 출처 주소를 함께 저장합니다. 나중에 "이 숫자 어디서 왔나"에
    답할 수 있어야 합니다.
  · 실패한 건은 조용히 건너뛰되 몇 건이 실패했는지 세어 둡니다.

실행:
    python -m app.services.bizinfo_ingest --pages 40
    python -m app.services.bizinfo_ingest --pages 5 --refresh    # 캐시 무시
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "app", "data")
CACHE_DIR = os.path.join(ROOT, ".cache", "bizinfo")
OUT = os.path.join(DATA_DIR, "bizinfo_programs.json")

BASE = "https://www.bizinfo.go.kr"
LIST = BASE + "/web/lay1/bbs/S1T122C128/AS/74/list.do"
DETAIL = BASE + "/sii/siia/selectSIIA200Detail.do"

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KB-KkulBee/0.1 (research)"}
DELAY = 0.45          # 요청 사이 쉬는 시간(초). 정부 사이트를 몰아붙이지 않습니다.
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# 소상공인과 관련 있는지 가늠하는 단서. 제목·본문 어디든 걸리면 표시해 둡니다.
SMALLBIZ_HINTS = [
    "소상공인", "자영업", "소기업", "창업", "점포", "상점", "골목상권", "전통시장",
    "청년몰", "소상공인시장진흥공단", "지역신용보증", "신용보증재단",
]
FINANCE_HINTS = ["자금", "융자", "대출", "보증", "이차보전", "금리", "출연"]


def _get(url: str, cache_key: str, refresh: bool = False) -> str:
    """받아 오되 캐시를 먼저 봅니다."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, cache_key + ".html")
    if not refresh and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read()

    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
        html = r.read().decode("utf-8", "ignore")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    time.sleep(DELAY)
    return html


def _text(html: str) -> str:
    """태그를 걷어내고 줄 단위로 정리합니다."""
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
    t = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{2,}", "\n", t).strip()


def parse_list(html: str) -> list[dict]:
    """목록 한 쪽에서 공고 항목을 뽑습니다."""
    tb = re.search(r"<tbody.*?</tbody>", html, re.S)
    if not tb:
        return []
    out = []
    for tr in re.findall(r"<tr.*?</tr>", tb.group(0), re.S):
        tds = re.findall(r"<td.*?</td>", tr, re.S)
        if len(tds) < 7:
            continue
        link = re.search(r'href\s*=\s*"([^"]+)"', tds[2])
        pid = re.search(r"pblancId=([A-Za-z0-9_]+)", link.group(1)) if link else None
        cells = [re.sub(r"\s+", " ", _text(td)).strip() for td in tds]
        if not pid:
            continue
        out.append({
            "pblanc_id": pid.group(1),
            "category": cells[1],
            "title": cells[2],
            "apply_period": cells[3],
            "ministry": cells[4],
            "agency": cells[5],
            "posted_at": cells[6],
        })
    return out


# 상세 본문에서 뽑아낼 마디들. 공고마다 표현이 조금씩 다릅니다.
SECTION_PATTERNS = [
    ("summary", r"사업개요\s*\n(.*?)(?=\n사업신청 방법|\n사업신청 사이트|\n문의처|$)"),
    ("how_to_apply", r"사업신청 방법\s*\n(.*?)(?=\n사업신청 사이트|\n문의처|$)"),
    ("apply_site", r"사업신청 사이트\s*\n(.*?)(?=\n문의처|$)"),
    ("contact", r"문의처\s*\n(.*?)(?=\n※|$)"),
]

AMOUNT = re.compile(r"(\d[\d,]*)\s*(억|천만|백만|만)\s*원")
RATE = re.compile(r"(?:금리|이율|이자)[^\d]{0,10}(\d+(?:\.\d+)?)\s*%")


def parse_detail(html: str) -> dict:
    """상세 페이지에서 본문 마디를 뽑습니다."""
    body = re.search(r'class="view_cont".*?(?=</section>|<footer)', html, re.S)
    text = _text(body.group(0) if body else html)

    out: dict = {"raw_text": text[:6000]}
    for key, pat in SECTION_PATTERNS:
        m = re.search(pat, text, re.S)
        out[key] = re.sub(r"\n{2,}", "\n", m.group(1)).strip()[:2500] if m else ""

    # 금액·금리는 본문에서 직접 읽습니다. 없으면 없는 대로 둡니다.
    mult = {"억": 100_000_000, "천만": 10_000_000, "백만": 1_000_000, "만": 10_000}
    amounts = [int(n.replace(",", "")) * mult[u] for n, u in AMOUNT.findall(text)]
    out["limit_krw"] = max(amounts) if amounts else None
    r = RATE.search(text)
    out["rate_pct"] = float(r.group(1)) if r else None
    return out


def tag(rec: dict) -> dict:
    """소상공인·금융 관련성을 표시합니다. 나중에 걸러 쓰기 위한 것입니다."""
    blob = f"{rec.get('title','')} {rec.get('summary','')} {rec.get('category','')}"
    rec["is_smallbiz"] = any(w in blob for w in SMALLBIZ_HINTS)
    rec["is_finance"] = any(w in blob for w in FINANCE_HINTS)
    region = re.match(r"\[([^\]]{2,10})\]", rec.get("title", ""))
    rec["region"] = region.group(1) if region else None
    return rec


def crawl(pages: int, refresh: bool = False) -> dict:
    seen: dict[str, dict] = {}
    failed = 0

    for page in range(1, pages + 1):
        q = urllib.parse.urlencode({"rows": 15, "cpage": page})
        try:
            html = _get(f"{LIST}?{q}", f"list_{page}", refresh)
        except Exception as e:  # noqa: BLE001
            print(f"  [{page}쪽] 목록 실패 — {str(e)[:60]}")
            failed += 1
            continue

        rows = parse_list(html)
        if not rows:
            print(f"  [{page}쪽] 비었습니다. 여기서 멈춥니다.")
            break

        for row in rows:
            pid = row["pblanc_id"]
            if pid in seen:
                continue
            url = f"{DETAIL}?pblancId={pid}"
            try:
                detail = parse_detail(_get(url, pid, refresh))
            except Exception:  # noqa: BLE001
                failed += 1
                continue
            rec = {**row, **detail, "source_url": url}
            seen[pid] = tag(rec)

        sb = sum(1 for r in seen.values() if r["is_smallbiz"])
        print(f"  [{page:2d}쪽] 누적 {len(seen):4d}건 · 소상공인 관련 {sb:3d}건")

    return {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "source": "중소벤처기업부 기업마당 (bizinfo.go.kr)",
        "note": ("공개된 목록·상세 페이지를 읽어 구조화한 것입니다. 실제 신청 조건은 "
                 "각 공고 원문과 수행기관 안내를 따라야 합니다."),
        "pages_crawled": pages,
        "failed": failed,
        "programs": list(seen.values()),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=40)
    ap.add_argument("--refresh", action="store_true", help="캐시를 무시하고 다시 받습니다")
    a = ap.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"기업마당 {a.pages}쪽 수집 (요청 간 {DELAY}초 대기)")
    doc = crawl(a.pages, a.refresh)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    progs = doc["programs"]
    sb = [p for p in progs if p["is_smallbiz"]]
    fin = [p for p in progs if p["is_finance"]]
    both = [p for p in progs if p["is_smallbiz"] and p["is_finance"]]
    with_amt = [p for p in progs if p.get("limit_krw")]

    print(f"\n[saved] {OUT}  ({os.path.getsize(OUT)/1e6:.2f} MB)")
    print(f"  전체 {len(progs):,}건 · 실패 {doc['failed']}건")
    print(f"  소상공인 관련 {len(sb):,}건 · 금융 관련 {len(fin):,}건 · 둘 다 {len(both):,}건")
    print(f"  금액이 적힌 공고 {len(with_amt):,}건")
    if both:
        print("\n  소상공인 금융 공고 예시:")
        for p in both[:5]:
            amt = f"{p['limit_krw']//10_000_000}천만원" if p.get("limit_krw") else "금액 미기재"
            print(f"    · {p['title'][:52]}  ({p['ministry']}, {amt})")


if __name__ == "__main__":
    main()
