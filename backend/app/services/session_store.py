"""대화를 기억합니다 — 후속 질문이 통해야 상담입니다.

지금까지 `session_id`를 만들기만 하고 아무 데도 저장하지 않았습니다. 그래서
사장님이 "연남동 카페 상권 어때?"를 묻고 이어서 "그럼 자금은?"이라고 하면
어느 동네인지, 무슨 업종인지가 통째로 사라졌습니다. 매번 처음부터 다시
말해야 하는 것은 상담이 아니라 검색창입니다.

**SQLite를 씁니다.** 파일 하나면 되고, 별도 서버가 필요 없고, Render 무료
등급에서 프로세스가 하나라 잠금 경합도 없습니다. 대화 몇천 건에 몇 MB입니다.

**개인정보를 담지 않습니다.** 질문 원문과 그때 읽어 낸 지역·업종만 남깁니다.
사장님 이름도, 사업자번호도, 연락처도 받지 않으므로 저장할 것이 없습니다.
오래된 것은 스스로 지웁니다 — 상담 맥락이 한 달 뒤에도 필요할 이유가 없습니다.
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time

DB_PATH = os.environ.get(
    "KKULBEE_DB",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 "data", "sessions.db"))

# 이보다 오래된 대화는 지웁니다. 상담 맥락의 유효기간입니다.
TTL_SECONDS = 60 * 60 * 24 * 14

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _db() -> sqlite3.Connection | None:
    """연결을 한 번만 엽니다. 열지 못하면 None — 저장을 못 해도 답은 나가야 합니다."""
    global _conn
    if _conn is not None:
        return _conn
    with _lock:
        if _conn is not None:
            return _conn
        try:
            os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
            c = sqlite3.connect(DB_PATH, check_same_thread=False)
            c.execute("PRAGMA journal_mode=WAL")
            c.execute("""
                CREATE TABLE IF NOT EXISTS turns (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT    NOT NULL,
                    at         REAL    NOT NULL,
                    question   TEXT    NOT NULL,
                    intents    TEXT    NOT NULL DEFAULT '',
                    region     TEXT,
                    industry   TEXT,
                    answer     TEXT    NOT NULL DEFAULT ''
                )""")
            c.execute("CREATE INDEX IF NOT EXISTS ix_turns_sid ON turns(session_id, id)")
            c.commit()
            _conn = c
        except Exception:  # noqa: BLE001 — 저장이 안 돼도 서비스는 돌아야 합니다
            return None
    return _conn


def remember(session_id: str, question: str, intents: list[str],
             region: str | None, industry: str | None, answer: str) -> None:
    c = _db()
    if c is None:
        return
    try:
        with _lock:
            c.execute(
                "INSERT INTO turns(session_id, at, question, intents, region, "
                "industry, answer) VALUES (?,?,?,?,?,?,?)",
                (session_id, time.time(), question[:2000], ",".join(intents),
                 region, industry, answer[:4000]))
            c.execute("DELETE FROM turns WHERE at < ?", (time.time() - TTL_SECONDS,))
            c.commit()
    except Exception:  # noqa: BLE001
        pass


def context(session_id: str | None, limit: int = 4) -> dict:
    """직전 대화에서 이어받을 것을 꺼냅니다.

    지역·업종은 **가장 최근에 실제로 잡힌 값**을 씁니다. 세 턴 전에 연남동을
    말했고 그 뒤로 지역 얘기가 없었다면 여전히 연남동입니다. 사람이 대화하는
    방식이 그렇습니다.
    """
    out: dict = {"region": None, "industry": None, "turns": []}
    if not session_id:
        return out
    c = _db()
    if c is None:
        return out
    try:
        with _lock:
            rows = c.execute(
                "SELECT question, intents, region, industry, answer FROM turns "
                "WHERE session_id=? ORDER BY id DESC LIMIT ?",
                (session_id, limit)).fetchall()
    except Exception:  # noqa: BLE001
        return out

    for q, intents, region, industry, answer in rows:
        if out["region"] is None and region:
            out["region"] = region
        if out["industry"] is None and industry:
            out["industry"] = industry
        out["turns"].append({"question": q, "intents": intents.split(",") if intents else [],
                             "answer": answer})
    out["turns"].reverse()          # 오래된 것부터 읽히게
    return out


def stats() -> dict:
    c = _db()
    if c is None:
        return {"available": False}
    try:
        with _lock:
            n, s = c.execute(
                "SELECT COUNT(*), COUNT(DISTINCT session_id) FROM turns").fetchone()
        return {"available": True, "turns": n, "sessions": s,
                "path": os.path.basename(DB_PATH)}
    except Exception:  # noqa: BLE001
        return {"available": False}
