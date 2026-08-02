'use client';

/**
 * What-If — "업종만 바꾸면 이 동네 점수는?"
 *
 * 점수를 보여 주고 끝나면 사장님이 할 수 있는 일이 없습니다. 점수 함수의
 * 입력 중 사장님이 실제로 고를 수 있는 변수(업종)를 역방향으로 훑어,
 * 같은 동네를 40개 업종으로 다시 잰 결과를 보여 줍니다 — 반사실
 * (counterfactual) 설명의 정직한 판. 배달 비중·영업시간 같은 자료에 없는
 * 변수는 다루지 않습니다.
 *
 * 펼칠 때만 계산합니다(서버 0.5초) — 안 볼 사람의 답변을 늦출 이유가 없습니다.
 */

import { useState } from 'react';
import type { LocationScore } from '@/lib/types';

interface Row {
  industry: string; score: number; delta: number;
  same_count: number | null; current: boolean;
}

export default function WhatIf({ loc }: { loc: LocationScore }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setOpen((v) => !v);
    if (rows || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/whatif?region=${encodeURIComponent(loc.region_name)}`
        + `&industry=${encodeURIComponent(loc.industry)}`);
      const d = await r.json();
      if (d.ok) { setRows(d.rows); setNote(d.note); }
    } catch {/* 없으면 접힌 채로 */} finally { setBusy(false); }
  };

  const ask = (ind: string) =>
    window.dispatchEvent(new CustomEvent('kkulbee:ask',
      { detail: `${loc.region_name}에서 ${ind} 하면 어때?` }));

  const max = rows ? Math.max(...rows.map((r) => r.score)) : 100;

  return (
    <section className="surface-1 print:hidden overflow-hidden">
      <button onClick={load}
        className="flex w-full items-center justify-between px-5 py-4 text-left">
        <div>
          <h3 className="font-display text-[18px] text-kb-ink">
            만약 업종을 바꾼다면 <span className="text-kb-amber">What-If</span>
          </h3>
          <p className="mt-0.5 text-[14px] text-kb-ink/60">
            같은 동네를 40개 업종으로 다시 재 봤어요 — 점수를 바꾸는 변수를 역계산
          </p>
        </div>
        <span className="text-[15px] text-kb-ink/40">
          {busy ? '재는 중…' : open ? '접기 ▲' : '돌려 보기 ▼'}
        </span>
      </button>

      {open && rows && (
        <div className="border-t border-kb-ink/[.07] px-5 pb-5 pt-3">
          <ul className="space-y-1">
            {rows.map((r) => (
              <li key={r.industry}>
                <button onClick={() => !r.current && ask(r.industry)}
                  className={`group flex w-full items-center gap-2.5 rounded-lg px-2
                              py-[5px] text-left transition ${r.current
                    ? 'bg-kb-yellow/[.14] ring-1 ring-kb-yellow/40'
                    : 'hover:bg-white/70'}`}>
                  <span className="w-[110px] shrink-0 truncate text-[14px]
                                   font-medium text-kb-ink/85">
                    {r.industry}{r.current && ' (지금)'}
                  </span>
                  <div className="relative h-[7px] flex-1 rounded-full bg-kb-ink/[.05]">
                    <div className={`absolute inset-y-0 left-0 rounded-full ${
                      r.current ? 'bg-kb-yellow' : 'bg-kb-amber/50'}`}
                         style={{ width: `${(r.score / max) * 100}%` }} />
                  </div>
                  <span className="w-[46px] shrink-0 text-right text-[14px] font-bold
                                   text-kb-ink [font-variant-numeric:tabular-nums]">
                    {r.score.toFixed(1)}
                  </span>
                  <span className={`w-[52px] shrink-0 text-right text-[13px] font-bold
                                    [font-variant-numeric:tabular-nums] ${
                    r.current ? 'text-kb-ink/35'
                      : r.delta > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {r.current ? '기준' : `${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-amber-400/[.08] px-2.5 py-2 text-[12.5px]
                        leading-relaxed text-amber-800">
            {note}
          </p>
        </div>
      )}
    </section>
  );
}
