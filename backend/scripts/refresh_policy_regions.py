"""색인 재구축 없이 docs.json의 regions만 다시 답니다.

지역 판독 규칙(read_region)이 좋아졌을 때 임베딩·토큰은 그대로 두고
지역 태그만 갱신하는 유지보수 도구입니다. 실행:

    cd backend && python -m scripts.refresh_policy_regions
"""
from __future__ import annotations

import json
from pathlib import Path

from scripts.build_policy_index import read_region

DOCS = Path(__file__).resolve().parent.parent / "app" / "data" / "policy_index" / "docs.json"


def main() -> None:
    docs = json.loads(DOCS.read_text(encoding="utf-8"))
    changed = []
    for d in docs:
        new = read_region(d.get("title", ""))
        old = d.get("regions") or []
        if new and not old:
            d["regions"] = new
            changed.append((d["title"][:44], new))
    DOCS.write_text(json.dumps(docs, ensure_ascii=False), encoding="utf-8")
    print(f"regions 새로 단 공고: {len(changed)}")
    for t, r in changed:
        print(f"  {r} {t}")


if __name__ == "__main__":
    main()
