'use client';

/**
 * 기회 업종 레이더 — "이 동네엔 뭐가 비어 있나".
 *
 * 동네 이름만 넣으면 주요 업종을 같은 자(전국 백분위)로 전부 다시 재서,
 * 점수는 높은데 같은 업종 점포가 적은 곳 — '빈 자리'를 찾아 줍니다.
 * 수요·임대료는 자료에 없으므로 넣지 않았다고 화면에 명시합니다.
 */

import { useEffect, useRef, useState } from 'react';

interface Row {
  industry: string; score: number; delta: number;
  same_count: number; current: boolean;
}
interface Radar {
  ok: boolean; reason?: string; region: string;
  rows: Row[]; note: string;
}

export default function GapRadar() {
  const [q, setQ] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [r, setR] = useState<Radar | null>(null);
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 실제 행정동 자동완성 — 있지도 않은 동네 이름으로 헛걸음하지 않게
  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (q.trim().length < 2) { setHints([]); return; }
    tRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/suggest?q=${encodeURIComponent(q.trim())}`);
        const d = await res.json();
        setHints((d.dongs ?? []).map((x: { full: string }) => x.full).slice(0, 6));
      } catch { setHints([]); }
    }, 220);
  }, [q]);

  const run = async (name?: string) => {
    const region = (name ?? q).trim();
    if (!region || busy) return;
    if (name) setQ(name);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/whatif?region=${encodeURIComponent(region)}`);
      setR(await res.json());
    } catch { setR(null); } finally { setBusy(false); }
  };

  return (
    <section className="mt-6 w-full max-w-[1240px] rounded-2xl border-2
                        border-emerald-400/50 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(16,120,80,.3)]">
      <h2 className="font-display text-[24px] text-kb-ink">
        기회 업종 레이더 <span className="text-emerald-700">— 이 동네엔 뭐가 비어 있나</span>
      </h2>
      <p className="mt-1 text-[14.5px] text-kb-ink/70">
        주요 업종을 전국 백분위 같은 자로 전부 다시 재서, <b>점수는 높은데
        같은 가게가 적은 자리</b>를 찾아 드립니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          list="gap-dongs" placeholder="동네 이름 — 예) 연남동"
          className="w-64 rounded-xl bg-kb-ink/[.04] px-4 py-2.5 text-[15px]
                     font-semibold text-kb-ink ring-1 ring-kb-ink/[.12]
                     placeholder:font-normal placeholder:text-kb-ink/40
                     focus:outline-none focus:ring-2 focus:ring-emerald-400/60" />
        <datalist id="gap-dongs">
          {hints.map((h) => <option key={h} value={h} />)}
        </datalist>
        <button onClick={() => run()} disabled={busy || !q.trim()}
          className="rounded-xl bg-emerald-600 px-6 py-2.5 text-[15px] font-bold
                     text-white shadow-sm transition hover:brightness-105
                     disabled:opacity-40">
          {busy ? '재는 중…' : '빈 자리 찾기'}
        </button>
      </div>

      {r && !r.ok && (
        <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                      text-kb-ink/70">{r.reason}</p>
      )}

      {r?.ok && (
        <div className="mt-5">
          <p className="text-[14px] font-semibold text-kb-ink/70">
            {r.region} — 입지 점수 상위 업종 (같은 업종 점포 수와 함께)
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {r.rows.filter((x) => !x.current).slice(0, 9).map((x, i) => {
              const empty = x.same_count <= 3;
              return (
                <div key={x.industry} className={`rounded-xl p-3.5 ring-1 ${empty
                  ? 'bg-emerald-500/[.07] ring-emerald-500/40'
                  : 'bg-kb-ink/[.03] ring-kb-ink/[.09]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-bold leading-snug text-kb-ink">
                      {i + 1}. {x.industry}
                    </p>
                    {empty && (
                      <span className="shrink-0 rounded-full bg-emerald-600 px-2
                                       py-0.5 text-[11px] font-bold text-white">
                        빈 자리
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[13px] text-kb-ink/70">
                    입지 점수 <b className="text-[15px] text-kb-ink
                                [font-variant-numeric:tabular-nums]">{x.score}</b>점
                    · 같은 업종 지금 <b className={empty ? 'text-emerald-700' : ''}>
                    {x.same_count}곳</b>
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2.5 text-[12.5px]
                        leading-relaxed text-kb-ink/60">
            {r.note}
          </p>
        </div>
      )}
    </section>
  );
}
