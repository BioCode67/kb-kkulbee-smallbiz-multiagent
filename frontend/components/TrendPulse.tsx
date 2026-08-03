'use client';

/**
 * 경기·트렌드 — 감(感)이 아니라 공시로 보는 흐름.
 *
 * ① 지역 경기: 한국부동산원 소규모 상가 임대가격지수 최근 5분기.
 *    지수가 오르는 지역은 상가 자리 경쟁이 붙고 있다는 신호입니다.
 * ② 업종 흐름: 공정거래위원회 가맹 통계 2개년 — 가맹점이 는 업종과
 *    준 업종. 예측은 하지 않고, 공시 숫자와 그 출처만 보여줍니다.
 */

import { useEffect, useState } from 'react';

interface EconRegion { name: string; vals: (number | null)[]; yoy_pct: number | null; }
interface Econ { ok: boolean; reason?: string; quarters?: string[];
                 regions?: EconRegion[]; note?: string; }
interface TrendItem { industry: string; stores: number; delta: number;
                      pct: number | null; opened: number; closed: number; }
interface Ind { ok: boolean; reason?: string; yr?: string; prev_yr?: string;
                rising?: TrendItem[]; falling?: TrendItem[]; note?: string; }

function Spark({ vals }: { vals: (number | null)[] }) {
  const v = vals.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) =>
    `${(i / (v.length - 1)) * 64},${20 - ((x - min) / span) * 16 - 2}`).join(' ');
  const up = v[v.length - 1] >= v[0];
  return (
    <svg width="64" height="20" viewBox="0 0 64 20" aria-hidden>
      <polyline points={pts} fill="none"
                stroke={up ? '#E09A00' : '#C04456'} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TrendPulse() {
  const [econ, setEcon] = useState<Econ | null>(null);
  const [ind, setInd] = useState<Ind | null>(null);

  useEffect(() => {
    fetch('/api/v1/econ-trend').then((r) => r.json()).then(setEcon)
      .catch(() => setEcon({ ok: false, reason: '지금 불러오지 못했습니다' }));
    fetch('/api/v1/industry-trend').then((r) => r.json()).then(setInd)
      .catch(() => setInd({ ok: false, reason: '지금 불러오지 못했습니다' }));
  }, []);

  return (
    <div className="w-full max-w-[1240px]">
      {/* ① 지역 경기 */}
      <section className="mt-6 rounded-2xl border-2 border-orange-400/50
                          bg-white p-6
                          shadow-[0_20px_50px_-20px_rgba(200,110,40,.3)]">
        <h2 className="font-display text-[24px] text-kb-ink">
          📈 지역 상가 경기 <span className="text-orange-700">— 임대가격지수 최근 5분기</span>
        </h2>
        <p className="mt-1 text-[14.5px] text-kb-ink/70">
          지수가 오르는 지역은 <b>상가 자리 경쟁이 붙고 있다</b>는 신호,
          내리는 지역은 임대 조건 협상 여지가 있다는 신호입니다.
        </p>
        {!econ && <p className="mt-4 text-[14px] text-kb-ink/55">공시를 불러오는 중입니다…</p>}
        {econ && !econ.ok && (
          <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                        text-kb-ink/70">{econ.reason}</p>
        )}
        {econ?.ok && (
          <>
            <p className="mt-3 text-[12.5px] font-semibold text-kb-ink/55">
              {econ.quarters?.[0]} → {econ.quarters?.[econ.quarters.length - 1]} ·
              전년 같은 분기 대비
            </p>
            <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {(econ.regions ?? []).map((r) => (
                <li key={r.name} className="flex items-center gap-3 text-[14.5px]">
                  <span className={`w-[52px] shrink-0 font-bold ${
                    r.name === '전국' ? 'text-kb-amber' : 'text-kb-ink/85'}`}>
                    {r.name}
                  </span>
                  <Spark vals={r.vals} />
                  <span className={`ml-auto font-bold
                                    [font-variant-numeric:tabular-nums] ${
                    r.yoy_pct == null ? 'text-kb-ink/40'
                      : r.yoy_pct >= 0 ? 'text-kb-amber' : 'text-rose-600'}`}>
                    {r.yoy_pct == null ? '—'
                      : `${r.yoy_pct > 0 ? '+' : ''}${r.yoy_pct}%`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2.5
                          text-[12.5px] leading-relaxed text-kb-ink/60">
              {econ.note}
            </p>
          </>
        )}
      </section>

      {/* ② 업종 흐름 */}
      <section className="mt-6 rounded-2xl border-2 border-orange-400/50
                          bg-white p-6
                          shadow-[0_20px_50px_-20px_rgba(200,110,40,.3)]">
        <h2 className="font-display text-[24px] text-kb-ink">
          🔥 업종 창업 흐름 <span className="text-orange-700">— 가맹점이 는 업종, 준 업종</span>
        </h2>
        <p className="mt-1 text-[14.5px] text-kb-ink/70">
          정보공개서에 신고된 가맹점 수를 두 해로 비교했습니다 — 광고가
          아니라 <b>공시가 말하는 흐름</b>입니다.
        </p>
        {!ind && <p className="mt-4 text-[14px] text-kb-ink/55">공시를 불러오는 중입니다…</p>}
        {ind && !ind.ok && (
          <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                        text-kb-ink/70">{ind.reason}</p>
        )}
        {ind?.ok && (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {([['🌱 늘어난 업종', ind.rising ?? [], 'text-emerald-700'],
                 ['🍂 줄어든 업종', ind.falling ?? [], 'text-rose-600'],
              ] as [string, TrendItem[], string][]).map(([title, rows, tone]) => (
                <div key={title} className="rounded-xl bg-kb-ink/[.03] p-4
                                            ring-1 ring-kb-ink/[.08]">
                  <p className="text-[15px] font-bold text-kb-ink">{title}</p>
                  <ul className="mt-2.5 space-y-2">
                    {rows.map((x) => (
                      <li key={x.industry}>
                        <div className="flex items-baseline gap-2 text-[14.5px]">
                          <span className="min-w-0 flex-1 truncate font-semibold
                                           text-kb-ink/88">{x.industry}</span>
                          <span className={`shrink-0 font-bold ${tone}
                                            [font-variant-numeric:tabular-nums]`}>
                            {x.delta > 0 ? '+' : ''}{x.delta.toLocaleString()}개
                            {x.pct != null && ` (${x.pct > 0 ? '+' : ''}${x.pct}%)`}
                          </span>
                        </div>
                        <p className="text-[12px] text-kb-ink/55">
                          가맹점 {x.stores.toLocaleString()}개 · 새로 열음{' '}
                          {x.opened.toLocaleString()} · 닫음 {x.closed.toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2.5
                          text-[12.5px] leading-relaxed text-kb-ink/60">
              {ind.note}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
