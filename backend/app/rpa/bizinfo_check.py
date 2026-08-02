"""기업마당 공고 원문을 지금 열어 사실만 뽑아 옵니다.

왜 필요한가 — 우리 색인의 900건은 수집일의 모습입니다. 공고는 그 뒤에도
바뀝니다: 마감 연장, 조기 마감(예산 소진), 서식 교체. 사장님이 서류를
들고 가기 전에 마지막으로 봐야 하는 것은 색인이 아니라 **오늘의 원문**
입니다. 이 모듈은 그 확인을 자동화합니다.

정직성 원칙 — 지어내지 않습니다.
  · 원문에서 못 찾은 항목은 None으로 내보냅니다 (추정해 채우지 않음)
  · 가져온 시각(checked_at)을 항상 함께 내보냅니다
  · bizinfo.go.kr 원문만 엽니다 — 아무 주소나 열어 주는 프록시가 되면
    SSRF 구멍이 됩니다 (호스트·경로를 화이트리스트로 잠금)

브라우저가 필요 없습니다. 기업마당 상세 페이지는 서버 렌더링이라 HTML
한 번이면 전부 나옵니다. 덕분에 Render 무료 등급(브라우저 없음)에서도
똑같이 돕니다.
"""
from __future__ import annotations

import html as html_mod
import re
import ssl
import urllib.request
from datetime import date, datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))

# 여기만 엽니다. 상세 페이지 경로 하나로 잠급니다.
ALLOWED_PREFIX = "https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do"

_UA = {"User-Agent": "Mozilla/5.0 (kkulbee notice-check)"}


def _clean(s: str) -> str:
    return html_mod.unescape(re.sub(r"<[^>]+>", " ", s)).strip()


def _dates(text: str) -> list[date]:
    out = []
    for y, m, d in re.findall(r"(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})", text):
        try:
            out.append(date(int(y), int(m), int(d)))
        except ValueError:
            pass
    return out


def parse_notice(html: str, today: date | None = None) -> dict:
    """상세 페이지 HTML에서 사실만 뽑습니다. 못 찾으면 None."""
    today = today or datetime.now(KST).date()
    flat = re.sub(r"\s+", " ", html)

    m = re.search(r"<h2[^>]*>(.{5,120}?)</h2>", flat)
    title = _clean(m.group(1)) if m else None

    # 신청기간 — <span class="s_title">신청기간</span> <div class="txt">…</div>
    period_text = None
    m = re.search(r'신청기간</span>\s*<div class="txt">(.{0,200}?)</div>', flat)
    if m:
        period_text = _clean(m.group(1)) or None

    # 기간에서 날짜를 읽어 오늘 기준 상태를 셈합니다. 날짜가 없으면(선착순 등)
    # 상태를 지어내지 않고 unknown으로 둡니다.
    status, days_left, deadline = "unknown", None, None
    if period_text:
        ds = _dates(period_text)
        if len(ds) >= 2:
            start, end = min(ds), max(ds)
            deadline = end.isoformat()
            if today < start:
                status = "upcoming"
            elif today > end:
                status = "closed"
            else:
                status = "open"
                days_left = (end - today).days
        elif any(w in period_text for w in ("선착순", "소진", "상시", "수시")):
            status = "rolling"

    # 첨부파일 — file_name + fileDown.do 짝
    attachments = []
    for name, fid, sn in re.findall(
        r'class="file_name">(.{1,160}?)</div>.{0,600}?'
        r'fileDown\.do\?atchFileId=([A-Z0-9_]+)&(?:amp;)?fileSn=(\d+)',
        flat,
    ):
        attachments.append({
            "name": _clean(name),
            "url": f"https://www.bizinfo.go.kr/cmm/fms/fileDown.do?atchFileId={fid}&fileSn={sn}",
        })

    # 출처 바로가기 — 신청이 실제로 이뤄지는 주관기관 페이지
    m = re.search(r'href="(https?://[^"]+)"[^>]*id="barogagi"', flat)
    apply_link = html_mod.unescape(m.group(1)) if m else None

    return {
        "title": title,
        "period_text": period_text,
        "deadline": deadline,
        "status": status,
        "days_left": days_left,
        "attachments": attachments,
        "apply_link": apply_link,
    }


def check_notice(url: str, timeout: float = 15.0) -> dict:
    """원문을 지금 열어 사실을 가져옵니다. 실패는 실패라고 말합니다."""
    if not url or not url.startswith(ALLOWED_PREFIX):
        return {"ok": False,
                "reason": "기업마당 공고 원문 주소만 확인할 수 있어요"}
    try:
        req = urllib.request.Request(url, headers=_UA)
        try:
            raw = urllib.request.urlopen(req, timeout=timeout).read()
        except ssl.SSLError:
            # 일부 공공 사이트는 중간 인증서를 안 내려 줍니다. 원문 확인은
            # 읽기 전용이고 개인정보를 보내지 않으므로 무검증으로 한 번 더.
            ctx = ssl._create_unverified_context()
            raw = urllib.request.urlopen(req, timeout=timeout, context=ctx).read()
        parsed = parse_notice(raw.decode("utf-8", errors="replace"))
        return {
            "ok": True,
            "checked_at": datetime.now(KST).isoformat(timespec="seconds"),
            "source": "기업마당 원문 (방금 조회)",
            "url": url,
            **parsed,
        }
    except Exception as e:  # noqa: BLE001 — 원인 그대로 사용자에게
        return {"ok": False, "reason": f"원문을 여는 데 실패했어요 — {type(e).__name__}"}
