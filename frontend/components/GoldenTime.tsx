'use client';

/**
 * 골든타임 — 권리에는 마감일이 있습니다.
 *
 * 분쟁에서 지는 흔한 이유는 내용이 아니라 시기입니다. 계약일·만료일을
 * 넣으면 청약철회 14일, 위법계약 해지 1년/5년, 갱신요구 만료 1개월 전
 * 같은 법정 기한을 D-day로 계산하고, 폰 캘린더(.ics)에 심어 줍니다.
 * 법에 기간이 명시된 것만 — 기산점 주의 문구를 항상 함께 냅니다.
 */

import { useEffect, useState } from 'react';

interface Item {
  name: string; due: string; days_left: number;
  status: 'open' | 'closing' | 'expired'; law: string; action: string;
}
interface Result {
  ok: boolean; reason?: string; today: string; items: Item[];
  expired_all: boolean; note: string;
}

const KINDS = [
  { key: 'loan', label: '대출·금융계약', base: '계약서류를 받은 날',
    known: '문제를 알게 된 날 (선택)' },
  { key: 'lease', label: '상가 임대차', base: '계약 만료일', known: null },
] as const;

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function downloadDeadlines(items: Item[]) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
                 'PRODID:-//kkulbee//golden-time//KO', 'CALSCALE:GREGORIAN'];
  items.filter((i) => i.status !== 'expired').forEach((i, n) => {
    lines.push(
      'BEGIN:VEVENT', `UID:goldentime-${n}-${i.due}@kkulbee`,
      `DTSTART;VALUE=DATE:${i.due.replace(/-/g, '')}`,
      `SUMMARY:${esc(`⏳ [권리 마감] ${i.name}`)}`,
      `DESCRIPTION:${esc(`${i.law}\n${i.action}\n— 꿀비 골든타임 계산기`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`내일 마감: ${i.name}`)}`,
      'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  const url = URL.createObjectURL(
    new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = '꿀비_권리_마감일.ics'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function GoldenTime() {
  const [kind, setKind] = useState<'loan' | 'lease'>('loan');
  const [base, setBase] = useState('');
  const [known, setKnown] = useState('');
  // 기본값은 오늘 — 빈 달력부터 채우게 하지 않습니다. "오늘 계약서를
  // 받았다면"이 가장 흔한 질문이고, 바꾸는 건 클릭 한 번입니다.
  useEffect(() => {
    setBase(new Date().toISOString().slice(0, 10));
  }, []);
  const [r, setR] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const K = KINDS.find((k) => k.key === kind)!;

  const run = async () => {
    if (!base || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/v1/golden-time', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, base_date: base, known_date: known || null }),
      });
      setR(await res.json());
    } catch { setR(null); } finally { setBusy(false); }
  };

  return (
    <section className="mt-6 w-full max-w-[1240px] rounded-2xl border-2
                        border-kb-yellow/60 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(224,144,0,.35)]">
      <h2 className="font-display text-[24px] text-kb-ink">
        ⏳ 골든타임 <span className="text-kb-amber">— 권리에는 마감일이 있습니다</span>
      </h2>
      <p className="mt-1 text-[14.5px] text-kb-ink/70">
        분쟁에서 지는 흔한 이유는 내용이 아니라 <b>시기</b>예요. 날짜를 넣으면
        법이 정한 기한을 D-day로 계산해 드립니다.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2.5">
        {KINDS.map((k) => (
          <button key={k.key}
            onClick={() => { setKind(k.key); setR(null); }}
            className={`rounded-full px-4 py-2 text-[14px] font-bold ring-1 transition ${
              kind === k.key
                ? 'bg-kb-yellow/[.2] text-kb-amber ring-kb-yellow/60'
                : 'text-kb-ink/62 ring-kb-ink/[.14] hover:text-kb-ink'}`}>
            {k.label}
          </button>
        ))}
        <label className="flex flex-col gap-1 text-[12px] font-bold text-kb-ink/55">
          {K.base}
          <input type="date" value={base} onChange={(e) => setBase(e.target.value)}
            className="rounded-xl bg-kb-ink/[.04] px-3 py-2 text-[14.5px] font-semibold
                       text-kb-ink ring-1 ring-kb-ink/[.12] focus:outline-none
                       focus:ring-2 focus:ring-kb-yellow/60" />
        </label>
        {K.known && (
          <label className="flex flex-col gap-1 text-[12px] font-bold text-kb-ink/55">
            {K.known}
            <input type="date" value={known} onChange={(e) => setKnown(e.target.value)}
              className="rounded-xl bg-kb-ink/[.04] px-3 py-2 text-[14.5px] font-semibold
                         text-kb-ink ring-1 ring-kb-ink/[.12] focus:outline-none
                         focus:ring-2 focus:ring-kb-yellow/60" />
          </label>
        )}
        <button onClick={run} disabled={busy || !base}
          className="rounded-xl bg-kb-yellow px-6 py-2.5 text-[15px] font-bold
                     text-kb-ink shadow-sm transition hover:brightness-105
                     disabled:opacity-40">
          {busy ? '계산 중…' : '남은 시간 계산'}
        </button>
      </div>

      {r && !r.ok && (
        <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                      text-kb-ink/70">{r.reason}</p>
      )}

      {r?.ok && (
        <div className="mt-5">
          {r.expired_all && (
            <p className="mb-3 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                          leading-relaxed text-kb-ink/80">
              계산된 기한은 모두 지났습니다. 그래도 끝은 아닐 수 있어요 —
              분쟁조정 신청이나 소멸시효(상사채권 5년)가 남아 있는 경우가
              있으니 금융감독원 1332 또는 법률구조공단 132에 문의해 보세요.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {r.items.map((i, n) => (
              <div key={n} className={`rounded-xl p-4 ring-1 ${
                i.status === 'expired' ? 'bg-kb-ink/[.03] ring-kb-ink/[.1] opacity-70'
                : i.status === 'closing' ? 'bg-rose-500/[.06] ring-rose-300/60'
                : 'bg-emerald-500/[.05] ring-emerald-500/30'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-bold leading-snug text-kb-ink">
                    {i.name}
                  </p>
                  <p className={`shrink-0 text-[24px] font-extrabold leading-none
                                 [font-variant-numeric:tabular-nums] ${
                    i.status === 'expired' ? 'text-kb-ink/45'
                    : i.status === 'closing' ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {i.status === 'expired' ? '경과' : `D-${i.days_left}`}
                  </p>
                </div>
                <p className="mt-1 text-[13px] font-semibold text-kb-ink/62">
                  {i.due}까지
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-kb-ink/85">
                  {i.action}
                </p>
                <p className="mt-1.5 text-[12px] text-kb-ink/55">근거: {i.law}</p>
              </div>
            ))}
          </div>
          {r.items.some((i) => i.status !== 'expired') && (
            <button onClick={() => downloadDeadlines(r.items)}
              className="mt-3 rounded-xl px-4 py-2.5 text-[13.5px] font-bold
                         text-kb-ink/78 ring-1 ring-kb-ink/[.16] transition
                         hover:bg-kb-ink/[.04] hover:text-kb-ink">
              📅 폰 캘린더에 심기 (.ics)
            </button>
          )}
          <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2.5 text-[12.5px]
                        leading-relaxed text-kb-ink/60">
            {r.note}
          </p>
        </div>
      )}
    </section>
  );
}
