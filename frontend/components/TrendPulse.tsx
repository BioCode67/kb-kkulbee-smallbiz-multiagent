'use client';

/**
 * 경기·트렌드 — 감(感)이 아니라 공시로 보는 흐름.
 *
 * ① 지역 경기: 한국부동산원 소규모 상가 임대가격지수 최근 5분기.
 *    왼쪽은 고른 지역의 추이 차트(전국 비교선 포함), 오른쪽은 전 지역
 *    전년 대비 증감률 막대 — 화면을 채우는 큰 그림 두 개로 보여 주고,
 *    공시가 빠진 분기는 빈칸(—)으로 정직하게 남깁니다.
 * ② 업종 흐름: 공정거래위원회 가맹 통계 2개년 — 가맹점이 늘어난
 *    업종과 줄어든 업종. 예측은 하지 않고, 공시 숫자와 그 출처만
 *    보여줍니다.
 */

import { useEffect, useState } from 'react';

interface EconRegion { name: string; vals: (number | null)[]; yoy_pct: number | null; }
interface Econ { ok: boolean; reason?: string; quarters?: string[];
                 regions?: EconRegion[]; note?: string; }
interface TrendItem { industry: string; stores: number; delta: number;
                      pct: number | null; opened: number; closed: number; }
interface Ind { ok: boolean; reason?: string; yr?: string; prev_yr?: string;
                rising?: TrendItem[]; falling?: TrendItem[]; note?: string; }

// 상승·하락의 두 색 — 흰 카드 위 대비 3:1을 넘긴 앰버/로즈.
// 막대·선에만 칠하고, 글자는 잉크 토큰을 씁니다.
const UP = '#C68200';
const DOWN = '#C04456';
const NATION = '#8A7B6C';   // 전국 비교선 — 한 발 물러난 회갈색

/** '2025년 3분기' → \'25 3분기 — 좁은 눈금 칸용 줄임 표기. */
const shortQ = (q: string) => q.replace(/^20(\d{2})년 (\d)분기$/, "'$1 $2분기");

const fmtVal = (v: number | null | undefined) => (v == null ? '공시 없음' : String(v));

/** 눈금 간격 — 1·2·2.5·5 어림수로 3~5개가 나오게. */
function niceStep(span: number) {
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * mag + 1e-12) return m * mag;
  return 10 * mag;
}

/** 공시가 있는 분기끼리만 잇는 구간 목록 — 빈 분기에서 선을 끊습니다. */
function segments(vals: (number | null)[]) {
  const segs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  vals.forEach((v, i) => {
    if (v == null) { if (cur.length) segs.push(cur); cur = []; }
    else cur.push({ i, v });
  });
  if (cur.length) segs.push(cur);
  return segs;
}

/** 고른 지역의 5분기 추이 — 전국 비교선·호버 십자선·분기별 값 스트립. */
function TrendChart({ quarters, region, nation }:
  { quarters: string[]; region: EconRegion; nation: EconRegion | null }) {
  const [hov, setHov] = useState<number | null>(null);
  const n = quarters.length;
  const nums = [...region.vals, ...(nation?.vals ?? [])]
    .filter((x): x is number => x != null);

  if (!n || !region.vals.some((v) => v != null)) {
    return (
      <p className="mt-4 rounded-lg bg-kb-ink/[.04] px-3 py-6 text-center text-[13px]
                    text-kb-ink/55">
        이 지역 지수는 최근 5분기 공시가 아직 없습니다.
      </p>
    );
  }

  const W = 560, H = 240, PL = 46, PR = 24, PT = 16, PB = 30;
  let lo = Math.min(...nums), hi = Math.max(...nums);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15;
  lo -= pad; hi += pad;
  const x = (i: number) => (n === 1 ? (PL + W - PR) / 2 : PL + (i / (n - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);
  const step = niceStep(hi - lo);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) ticks.push(t);
  const fmtTick = (v: number) => (step < 1 ? v.toFixed(1) : String(Math.round(v)));
  const path = (pts: { i: number; v: number }[]) =>
    pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const regSegs = segments(region.vals);
  const natSegs = nation ? segments(nation.vals) : [];
  const regPts = regSegs.flat();
  const first = regPts[0], last = regPts[regPts.length - 1];
  const tipAlign = hov == null ? '-50%'
    : x(hov) / W < 0.22 ? '0%' : x(hov) / W > 0.78 ? '-100%' : '-50%';

  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
           aria-label={`${region.name} 임대가격지수 최근 ${n}분기 추이`}
           onPointerLeave={() => setHov(null)}>
        {/* 눈금 — 한 발 물러난 실선 헤어라인 */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)}
                  stroke="#38322A" strokeOpacity=".09" />
            <text x={PL - 8} y={y(t) + 3.5} textAnchor="end"
                  className="fill-kb-ink/50 text-[11px] [font-variant-numeric:tabular-nums]">
              {fmtTick(t)}
            </text>
          </g>
        ))}
        {quarters.map((q, i) => (
          <text key={q} x={x(i)} y={H - 10} textAnchor="middle"
                className="fill-kb-ink/55 text-[11px]">
            {shortQ(q)}
          </text>
        ))}
        {/* 호버 십자선 */}
        {hov != null && (
          <line x1={x(hov)} x2={x(hov)} y1={PT - 4} y2={H - PB}
                stroke="#38322A" strokeOpacity=".28" />
        )}
        {/* 전국 비교선(뒤) → 고른 지역(앞) */}
        {natSegs.map((s, k) => s.length > 1 && (
          <path key={`n${k}`} d={path(s)} fill="none" stroke={NATION}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {nation && segments(nation.vals).flat().map((p) => (
          <circle key={`np${p.i}`} cx={x(p.i)} cy={y(p.v)}
                  r={hov === p.i ? 4.5 : 3} fill={NATION} stroke="#fff" strokeWidth="2" />
        ))}
        {regSegs.map((s, k) => s.length > 1 && (
          <path key={`r${k}`} d={path(s)} fill="none" stroke={UP}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {regPts.map((p) => (
          <circle key={`rp${p.i}`} cx={x(p.i)} cy={y(p.v)}
                  r={hov === p.i ? 5.5 : 4.5} fill={UP} stroke="#fff" strokeWidth="2" />
        ))}
        {/* 끝값만 골라 적습니다 — 나머지는 눈금·값 스트립·툴팁의 몫 */}
        {first && last && (
          <>
            {first.i !== last.i && (
              <text x={x(first.i)} y={Math.max(y(first.v) - 11, 11)} textAnchor="middle"
                    className="fill-kb-ink/60 text-[11.5px] [font-variant-numeric:tabular-nums]">
                {first.v}
              </text>
            )}
            <text x={x(last.i)} y={Math.max(y(last.v) - 12, 11)} textAnchor="middle"
                  className="fill-kb-ink text-[12.5px] font-bold [font-variant-numeric:tabular-nums]">
              {last.v}
            </text>
          </>
        )}
        {/* 분기 단위 히트 영역 — 마우스도 키보드 초점도 같은 툴팁 */}
        {quarters.map((q, i) => {
          const x0 = i === 0 ? 0 : (x(i - 1) + x(i)) / 2;
          const x1 = i === n - 1 ? W : (x(i) + x(i + 1)) / 2;
          return (
            <rect key={`h${q}`} x={x0} y={0} width={x1 - x0} height={H}
                  fill="transparent" tabIndex={0} className="outline-none"
                  aria-label={`${q} — ${region.name} ${fmtVal(region.vals[i])}${
                    nation ? `, 전국 ${fmtVal(nation.vals[i])}` : ''}`}
                  onPointerEnter={() => setHov(i)}
                  onFocus={() => setHov(i)} onBlur={() => setHov(null)} />
          );
        })}
      </svg>
      {hov != null && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-lg bg-kb-ink/95
                        px-2.5 py-2 shadow-lg"
             style={{ left: `${(x(hov) / W) * 100}%`, transform: `translateX(${tipAlign})` }}>
          <p className="whitespace-nowrap text-[11px] font-semibold text-white/70">
            {quarters[hov]}
          </p>
          <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[13px]
                        font-bold text-white [font-variant-numeric:tabular-nums]">
            <svg width="14" height="4" aria-hidden>
              <line x1="0" y1="2" x2="14" y2="2" stroke={UP} strokeWidth="3" />
            </svg>
            {fmtVal(region.vals[hov])}
            <span className="text-[11px] font-medium text-white/75">{region.name}</span>
          </p>
          {nation && (
            <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[13px]
                          font-bold text-white [font-variant-numeric:tabular-nums]">
              <svg width="14" height="4" aria-hidden>
                <line x1="0" y1="2" x2="14" y2="2" stroke={NATION} strokeWidth="3" />
              </svg>
              {fmtVal(nation.vals[hov])}
              <span className="text-[11px] font-medium text-white/75">전국</span>
            </p>
          )}
        </div>
      )}
      {/* 분기별 값 스트립 — 그래프 없이도 숫자가 전부 읽히게 */}
      <div className="mt-2 grid grid-cols-5 gap-1 border-t border-kb-ink/10 pt-2">
        {quarters.map((q, i) => (
          <div key={q} className="text-center">
            <p className="text-[10.5px] text-kb-ink/50">{shortQ(q)}</p>
            <p className="text-[12.5px] font-semibold text-kb-ink/85
                          [font-variant-numeric:tabular-nums]">
              {region.vals[i] ?? '—'}
            </p>
          </div>
        ))}
      </div>
      {region.vals.some((v) => v == null) && (
        <p className="mt-2 text-[11.5px] text-kb-ink/50">
          빈칸(—)은 그 분기 공시가 없다는 뜻입니다 — 선도 거기서 끊어 그렸습니다.
        </p>
      )}
    </div>
  );
}

export default function TrendPulse() {
  const [econ, setEcon] = useState<Econ | null>(null);
  const [ind, setInd] = useState<Ind | null>(null);
  const [selName, setSelName] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/econ-trend').then((r) => r.json()).then(setEcon)
      .catch(() => setEcon({ ok: false, reason: '지금 불러오지 못했습니다' }));
    fetch('/api/v1/industry-trend').then((r) => r.json()).then(setInd)
      .catch(() => setInd({ ok: false, reason: '지금 불러오지 못했습니다' }));
  }, []);

  const regions = econ?.ok ? econ.regions ?? [] : [];
  const quarters = econ?.ok ? econ.quarters ?? [] : [];
  const nation = regions.find((r) => r.name === '전국') ?? null;
  const sel = regions.find((r) => r.name === selName) ?? nation ?? regions[0] ?? null;
  const yoyAbs = regions
    .map((r) => r.yoy_pct).filter((v): v is number => v != null).map(Math.abs);
  // 막대 반폭의 공통 눈금 — 0.5%p 어림수로 올림.
  const axisMax = yoyAbs.length ? Math.max(0.5, Math.ceil(Math.max(...yoyAbs) * 2) / 2) : 1;

  return (
    <div className="w-full max-w-[1240px]">
      {/* ① 지역 경기 */}
      <section className="mt-6 rounded-2xl border-2 border-orange-400/50
                          bg-white p-6
                          shadow-[0_20px_50px_-20px_rgba(200,110,40,.3)]">
        <h2 className="font-display text-[24px] text-kb-ink">
          지역 상가 경기 <span className="text-orange-700">— 임대가격지수 최근 5분기</span>
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
        {econ?.ok && sel && (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {/* 왼쪽 — 고른 지역의 추이를 크게 */}
              <div className="rounded-xl bg-kb-ink/[.03] p-4 ring-1 ring-kb-ink/[.08]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[15px] font-bold text-kb-ink">
                    {sel.name} — 지수 추이
                  </p>
                  <p className="text-[12.5px] font-medium text-kb-ink/55">
                    전년 같은 분기 대비{' '}
                    <span className={`text-[13px] font-bold
                                      [font-variant-numeric:tabular-nums] ${
                      sel.yoy_pct == null ? 'text-kb-ink/40'
                        : sel.yoy_pct >= 0 ? 'text-kb-amber' : 'text-rose-600'}`}>
                      {sel.yoy_pct == null ? '—'
                        : `${sel.yoy_pct > 0 ? '+' : ''}${sel.yoy_pct}%`}
                    </span>
                  </p>
                </div>
                {nation && sel.name !== nation.name && (
                  <div className="mt-2 flex items-center gap-4 text-[11.5px] text-kb-ink/65">
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="4" aria-hidden>
                        <line x1="0" y1="2" x2="14" y2="2" stroke={UP} strokeWidth="3" />
                      </svg>
                      {sel.name}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <svg width="14" height="4" aria-hidden>
                        <line x1="0" y1="2" x2="14" y2="2" stroke={NATION} strokeWidth="3" />
                      </svg>
                      전국
                    </span>
                  </div>
                )}
                <TrendChart quarters={quarters} region={sel}
                            nation={nation && sel.name !== nation.name ? nation : null} />
              </div>

              {/* 오른쪽 — 전 지역 증감률, 0 기준 좌우 막대 */}
              <div className="rounded-xl bg-kb-ink/[.03] p-4 ring-1 ring-kb-ink/[.08]">
                <p className="text-[15px] font-bold text-kb-ink">
                  지역별 증감률 <span className="font-medium text-kb-ink/55">
                    — 전년 같은 분기 대비</span>
                </p>
                <p className="mt-0.5 text-[12px] text-kb-ink/55">
                  지역을 누르면 추이 그래프가 그 지역으로 바뀝니다
                </p>
                <div className="mt-2 flex items-center gap-2 px-1.5 text-[10.5px]
                                text-kb-ink/45 [font-variant-numeric:tabular-nums]">
                  <span className="w-[46px] shrink-0" aria-hidden />
                  <span className="relative h-4 flex-1">
                    <span className="absolute left-0">-{axisMax}%</span>
                    <span className="absolute left-1/2 -translate-x-1/2">0</span>
                    <span className="absolute right-0">+{axisMax}%</span>
                  </span>
                  <span className="w-[68px] shrink-0" aria-hidden />
                </div>
                <ul>
                  {regions.map((r) => {
                    const active = sel.name === r.name;
                    const w = r.yoy_pct == null ? 0
                      : Math.min(Math.abs(r.yoy_pct) / axisMax, 1) * 50;
                    return (
                      <li key={r.name}>
                        <button type="button" onClick={() => setSelName(r.name)}
                                aria-pressed={active}
                                className={`flex h-[30px] w-full items-center gap-2
                                            rounded-lg px-1.5 text-left transition-colors ${
                                  active ? 'bg-kb-yellow/15 ring-1 ring-inset ring-kb-yellow/60'
                                         : 'hover:bg-kb-ink/[.05]'}`}>
                          <span className={`w-[46px] shrink-0 text-[13px] font-bold ${
                            r.name === '전국' ? 'text-kb-amber' : 'text-kb-ink/85'}`}>
                            {r.name}
                          </span>
                          <span className="relative h-full flex-1">
                            <span aria-hidden
                                  className="absolute inset-y-0 left-1/2 w-px bg-kb-ink/15" />
                            {r.yoy_pct != null && (
                              <span aria-hidden
                                    className="absolute top-1/2 h-[14px] -translate-y-1/2"
                                    style={r.yoy_pct >= 0
                                      ? { left: '50%', width: `max(2px, ${w}%)`,
                                          background: UP, borderRadius: '0 4px 4px 0' }
                                      : { right: '50%', width: `max(2px, ${w}%)`,
                                          background: DOWN, borderRadius: '4px 0 0 4px' }} />
                            )}
                          </span>
                          <span className={`w-[68px] shrink-0 text-right text-[13px] font-bold
                                            [font-variant-numeric:tabular-nums] ${
                            r.yoy_pct == null ? 'text-kb-ink/35'
                              : r.yoy_pct >= 0 ? 'text-kb-amber' : 'text-rose-600'}`}>
                            {r.yoy_pct == null ? '—'
                              : `${r.yoy_pct > 0 ? '+' : ''}${r.yoy_pct}%`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {regions.every((r) => r.yoy_pct == null) && (
                  <p className="mt-2 text-[11.5px] text-kb-ink/50">
                    전년 같은 분기 공시가 아직 없어 증감률은 비워 두었습니다.
                  </p>
                )}
              </div>
            </div>
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
          업종 창업 흐름 <span className="text-orange-700">— 가맹점이 늘어난 업종, 줄어든 업종</span>
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
    </div>
  );
}
