"""골든타임 — 권리에는 마감일이 있습니다.

분쟁에서 지는 흔한 이유는 내용이 아니라 시기입니다. 청약철회는 14일,
위법계약 해지는 안 날부터 1년, 갱신요구는 만료 1개월 전까지 — 날짜가
지나면 같은 사실로도 결과가 달라집니다.

정직성 원칙
- 법에 기간이 명시된 것만 계산합니다. 판례로 갈리는 기간은 넣지 않습니다.
- 기산점(어느 날부터 세는지)이 사안마다 다를 수 있음을 항상 함께 냅니다.
- 법률 자문이 아니며, 무료 상담처를 항상 함께 냅니다.
"""
from __future__ import annotations

from datetime import date, timedelta


def _shift_months(d: date, months: int) -> date:
    """달력 기준 월 이동. 2/30처럼 없는 날짜는 그 달의 말일로 당깁니다."""
    y, m = divmod(d.year * 12 + (d.month - 1) + months, 12)
    m += 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(y, m, day)
        except ValueError:
            continue
    raise ValueError(d)


_NOTE = ("기간은 법 조문의 명시 기간으로 계산한 참고용이며, 기산점(어느 날부터 "
         "세는지)은 개별 사안에 따라 다를 수 있습니다. 법률 자문이 아닙니다. "
         "무료 상담: 금융감독원 1332 · 대한법률구조공단 132")


def _item(name: str, due: date, today: date, law: str, action: str) -> dict:
    days = (due - today).days
    return {"name": name, "due": due.isoformat(), "days_left": days,
            "status": ("expired" if days < 0 else
                       "closing" if days <= 14 else "open"),
            "law": law, "action": action}


def compute(kind: str, base_date: str, known_date: str | None = None,
            today: date | None = None) -> dict:
    today = today or date.today()
    try:
        base = date.fromisoformat(base_date)
        known = date.fromisoformat(known_date) if known_date else None
    except ValueError:
        return {"ok": False, "reason": "날짜를 2026-01-31 형식으로 넣어 주세요"}

    items: list[dict] = []
    if kind == "loan":
        items.append(_item(
            "청약철회권 (계약을 무르는 권리)",
            base + timedelta(days=14), today,
            "금융소비자보호법 제46조 — 대출성 상품은 계약서류를 받은 날부터 14일",
            "이 날까지 서면·전화·앱으로 철회를 통지하고 원금과 그동안의 이자를 "
            "돌려주면, 중도상환수수료 없이 계약이 없던 일이 됩니다."))
        items.append(_item(
            "위법계약 해지 요구 — 계약일 기준 상한",
            _shift_months(base, 60), today,
            "금융소비자보호법 제47조 — 계약일부터 5년 이내",
            "설명의무 위반·부당권유 등 법 위반으로 맺어진 계약은 수수료 없이 "
            "해지를 요구할 수 있습니다. 아래 '안 날 기준'과 둘 다 지나기 전에."))
        if known:
            items.append(_item(
                "위법계약 해지 요구 — 위반을 안 날 기준",
                _shift_months(known, 12), today,
                "금융소비자보호법 제47조 — 위반 사실을 안 날부터 1년",
                "위반을 알게 된 날부터 1년이 진짜 마감인 경우가 많습니다. "
                "설명서·녹취·문자 등 '언제 알았는지' 증거를 함께 준비하세요."))
    elif kind == "lease":
        renew_open = _shift_months(base, -6)
        items.append(_item(
            "계약갱신 요구 마감",
            _shift_months(base, -1), today,
            "상가건물 임대차보호법 제10조 제1항 — 만료 6개월 전부터 1개월 전까지",
            f"{renew_open.isoformat()}부터 이 날까지 내용증명으로 갱신을 요구하세요. "
            "최초 계약일부터 10년까지 보장됩니다. 하루라도 지나면 권리가 사라집니다."))
        items.append(_item(
            "권리금 회수 보호기간 종료",
            base, today,
            "상가건물 임대차보호법 제10조의4 — 만료 6개월 전부터 만료 시까지",
            f"{renew_open.isoformat()}부터 만료일까지가 새 임차인을 주선해 권리금을 "
            "회수할 수 있는 법적 보호기간입니다. 이 기간의 임대인 방해는 "
            "손해배상 대상입니다."))
    else:
        return {"ok": False, "reason": "kind는 loan 또는 lease"}

    items.sort(key=lambda x: x["due"])
    return {"ok": True, "today": today.isoformat(), "items": items,
            "expired_all": all(i["status"] == "expired" for i in items),
            "note": _NOTE}
