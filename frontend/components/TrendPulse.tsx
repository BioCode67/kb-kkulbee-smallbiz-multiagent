'use client';

/**
 * 경기·트렌드 — 감(感)이 아니라 공시로 보는 흐름.
 *
 * 인포그래픽 다섯 상: ① 전국 헤드라인(지수 8분기·공실률·임대료)
 * ② 시도별 지수 변화 ③ 시도별 공실률 ④ 시도별 임대료
 * ⑤ 업종 흐름·뜨는 브랜드. 전부 부동산원·공정위 공시이며 예측은 없습니다.
 */

import { useEffect, useState } from 'react';

interface EconRegion { name: string; vals: (number | null)[]; yoy_pct: number | null; }
interface Depth1 { quarter: string; national: number | null;
                   sido: Record<string, number>; }
interface Econ {
  ok: boolean; reason?: string; quarters?: string[]; regions?: EconRegion[];
  vacancy?: Depth1 | null; rents?: Depth1 | null; note?: string;
}
interface TrendItem { industry: string; stores: number; delta: number;
                      pct: number | null; opened: number; closed: number; }
interface HotBrand { brand: string; industry: string; stores: number; delta: number; }
interface Ind { ok: boolean; reason?: string; yr?: string; prev_yr?: string;
                rising?: TrendItem[]; falling?: TrendItem[];
                hot_brands?: HotBrand[]; note?: string; }

function Line({ vals, w = 220, h = 56 }: { vals: (number | null)[]; w?: number; h?: number }) {
  const v = vals.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) =>
    `${(i / (v.length - 1)) * w},${h - 6 - ((x - min) / span) * (h - 14)}`);
  const up = v[v.length - 1] >= v[0];
  const c = up ? '#E09A00' : '#C04456';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(',')[0]}
              cy={pts[pts.length - 1].split(',')[1]} r="3.5" fill={c} />
    </svg>
  );
}

function Spark({ vals }: { vals: (number | null)[] }) {
  return <Line vals={vals} w={64} h={20} />;
}

/** 시도별 가로 막대 — 값 낮은/높은 것이 눈에 먼저 들어오게 정렬 */
function SidoBars({ d, unit, goodLow }: { d: Depth1; unit: string; goodLow?: boolean }) {
  const rows = Object.entries(d.sido).sort((a, b) =>
    goodLow ? a[1] - b[1] : b[1] - a[1]);
  const max = Math.max(...rows.map(([, v]) => v), 1);
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map(([name, v], i) => {
        const good = goodLow ? i < 3 : i < 3;
        return (
          <li key={name} className="flex items-center gap-2.5 text-[13.5px]">
            <span className="w-[42px] shrink-0 font-bold text-kb-ink/82">{name}</span>
            <div className="h-[9px] flex-1 rounded-full bg-kb-ink/[.05]">
              <div className={`h-full rounded-full ${good
                ? (goodLow ? 'bg-emerald-500/70' : 'bg-kb-yellow')
                : 'bg-kb-ink/[.18]'}`}
                   style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="w-[58px] shrink-0 text-right font-semibold
                             text-kb-ink/85 [font-variant-numeric:tabular-nums]">
              {v}{unit}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const CARD = `rounded-2xl border-2 border-orange-400/50 bg-white p-6
              shadow-[0_20px_50px_-20px_rgba(200,110,40,.3)]`;

export default function TrendPulse() {
  const [econ, setEcon] = useState<Econ | null>(null);
  const [ind, setInd] = useState<Ind | null>(null);

  useEffect(() => {
    fetch('/api/v1/econ-trend').then((r) => r.json()).then(setEcon)
      .catch(() => setEcon({ ok: false, reason: '지금 불러오지 못했습니다' }));
    fetch('/api/v1/industry-trend').then((r) => r.json()).then(setInd)
      .catch(() => setInd({ ok: false, reason: '지금 불러오지 못했습니다' }));
  }, []);

  const nat = econ?.ok ? econ.regions?.find((r) => r.name === '전국') : null;
  const natLast = nat?.vals.filter((x) => x != null).slice(-1)[0];

  return (
    <div className="w-full max-w-[1240px]">
      {/* ── ① 전국 헤드라인 ── */}
      <section className={`mt-6 ${CARD}`}>
        <h2 className="font-display text-[24px] text-kb-ink">
          전국 소규모 상가, 지금 <span className="text-orange-700">
            — {econ?.ok ? econ.quarters?.[econ.quarters.length - 1] : '공시 불러오는 중'}</span>
        </h2>
        {econ?.ok && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-kb-ink/[.03] p-4 ring-1 ring-kb-ink/[.08]">
              <p className="text-[12.5px] font-bold text-kb-ink/55">
                임대가격지수 · 최근 8분기
              </p>
              <div className="mt-1 flex items-end gap-3">
                <p className="text-[30px] font-extrabold leading-none text-kb-ink
                              [font-variant-numeric:tabular-nums]">
                  {natLast ?? '—'}
                </p>
                <p className={`pb-1 text-[13.5px] font-bold ${
                  (nat?.yoy_pct ?? 0) >= 0 ? 'text-kb-amber' : 'text-rose-600'}`}>
                  전년 대비 {nat?.yoy_pct != null
                    ? `${nat.yoy_pct > 0 ? '+' : ''}${nat.yoy_pct}%` : '—'}
                </p>
              </div>
              {nat && <div className="mt-2"><Line vals={nat.vals} /></div>}
            </div>
            <div className="rounded-xl bg-kb-ink/[.03] p-4 ring-1 ring-kb-ink/[.08]">
              <p className="text-[12.5px] font-bold text-kb-ink/55">
                공실률 — 비어 있는 상가
              </p>
              <p className="mt-1 text-[30px] font-extrabold leading-none text-kb-ink
                            [font-variant-numeric:tabular-nums]">
                {econ.vacancy?.national ?? '—'}
                <span className="text-[16px] font-bold text-kb-ink/55">%</span>
              </p>
              <p className="mt-2 text-[13px] leading-snug text-kb-ink/68">
                전국 소규모 상가 100곳 중 {econ.vacancy?.national != null
                  ? Math.round(econ.vacancy.national) : '—'}곳이 비어
                있습니다. 낮을수록 자리 구하기가 어렵다는 뜻입니다.
              </p>
            </div>
            <div className="rounded-xl bg-kb-ink/[.03] p-4 ring-1 ring-kb-ink/[.08]">
              <p className="text-[12.5px] font-bold text-kb-ink/55">
                임대료 — ㎡당 월세 환산
              </p>
              <p className="mt-1 text-[30px] font-extrabold leading-none text-kb-ink
                            [font-variant-numeric:tabular-nums]">
                {econ.rents?.national ?? '—'}
                <span className="text-[16px] font-bold text-kb-ink/55">천원</span>
              </p>
              <p className="mt-2 text-[13px] leading-snug text-kb-ink/68">
                33㎡(10평) 가게라면 전국 평균 월
                {econ.rents?.national != null
                  ? ` 약 ${Math.round(econ.rents.national * 33 / 10) * 10}만원`
                  : ' —'} 수준입니다.
              </p>
            </div>
          </div>
        )}
        {econ && !econ.ok && (
          <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                        text-kb-ink/70">{econ.reason}</p>
        )}
      </section>

      {econ?.ok && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* ── ② 시도별 지수 변화 ── */}
          <section className={CARD}>
            <h3 className="font-display text-[19px] text-kb-ink">
              어디가 달아오르나 <span className="text-orange-700">— 지수 전년 대비</span>
            </h3>
            <ul className="mt-3 space-y-1.5">
              {(econ.regions ?? []).filter((r) => r.name !== '전국').map((r) => (
                <li key={r.name} className="flex items-center gap-3 text-[14px]">
                  <span className="w-[42px] shrink-0 font-bold text-kb-ink/82">
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
          </section>

          {/* ── ③ 시도별 공실률 ── */}
          {econ.vacancy && (
            <section className={CARD}>
              <h3 className="font-display text-[19px] text-kb-ink">
                빈 상가가 적은 곳 <span className="text-orange-700">— 공실률</span>
              </h3>
              <p className="mt-1 text-[13px] text-kb-ink/68">
                초록이 낮은 쪽 — 자리 경쟁이 세다는 뜻이기도 합니다.
              </p>
              <SidoBars d={econ.vacancy} unit="%" goodLow />
            </section>
          )}

          {/* ── ④ 시도별 임대료 ── */}
          {econ.rents && (
            <section className={CARD}>
              <h3 className="font-display text-[19px] text-kb-ink">
                시도별 임대료 <span className="text-orange-700">— 천원/㎡</span>
              </h3>
              <p className="mt-1 text-[13px] text-kb-ink/68">
                같은 평수라도 지역에 따라 월세가 이만큼 다릅니다.
              </p>
              <SidoBars d={econ.rents} unit="" />
            </section>
          )}

          {/* ── ⑤ 뜨는 브랜드 ── */}
          {(ind?.hot_brands?.length ?? 0) > 0 && (
            <section className={CARD}>
              <h3 className="font-display text-[19px] text-kb-ink">
                1년 새 가장 많이 늘어난 브랜드
              </h3>
              <p className="mt-1 text-[13px] text-kb-ink/68">
                {ind!.prev_yr}→{ind!.yr}년 정보공개서 기준 가맹점 증가 수입니다.
              </p>
              <ul className="mt-3 space-y-2">
                {ind!.hot_brands!.map((h, i) => (
                  <li key={h.brand} className="flex items-baseline gap-2.5
                                               text-[14px]">
                    <span className="w-5 shrink-0 text-right font-black
                                     text-kb-amber">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold
                                     text-kb-ink/88">
                      {h.brand}
                      <span className="ml-1.5 text-[12px] font-normal
                                       text-kb-ink/55">{h.industry}</span>
                    </span>
                    <span className="shrink-0 font-bold text-emerald-700
                                     [font-variant-numeric:tabular-nums]">
                      +{h.delta.toLocaleString()}개
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── ⑥ 업종 흐름 ── */}
      <section className={`mt-5 ${CARD}`}>
        <h2 className="font-display text-[21px] text-kb-ink">
          업종 창업 흐름 <span className="text-orange-700">— 가맹점이 는 업종, 준 업종</span>
        </h2>
        {!ind && <p className="mt-4 text-[14px] text-kb-ink/55">공시를 불러오는 중입니다…</p>}
        {ind && !ind.ok && (
          <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                        text-kb-ink/70">{ind.reason}</p>
        )}
        {ind?.ok && (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {([['늘어난 업종', ind.rising ?? [], 'text-emerald-700'],
                 ['줄어든 업종', ind.falling ?? [], 'text-rose-600'],
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

      {econ?.note && (
        <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2.5 text-[12.5px]
                      leading-relaxed text-kb-ink/60">
          {econ.note}
        </p>
      )}
    </div>
  );
}
