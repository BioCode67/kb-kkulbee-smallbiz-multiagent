'use client';

/**
 * 기회 업종 전용 도구 둘 — 입지 진단과 겹치지 않는 반대 방향.
 *
 * ① 빈 자리 동네 스카우트: 업종을 고르면 전국에서 "규모는 비슷한데
 *    이 업종만 유독 없는 동네"를 역탐색합니다. 입지 진단(동네→점수)의
 *    정반대(업종→동네)입니다.
 * ② 궁합 업종: 전국 3,450개 동의 실측 분포에서 이 업종과 '같이 다니는'
 *    업종을 상관으로 재고, 동네를 넣으면 "보통 같이 있는데 여긴 없다"
 *    까지 짚습니다.
 *
 * 둘 다 272만 점포 집계에서만 나옵니다 — 분포의 사실이지 수요 예측이
 * 아니며, 그 한계를 화면에 그대로 적습니다.
 */

import { useEffect, useRef, useState } from 'react';

const SIDOS = ['전국', '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '경기도',
  '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
  '경상북도', '경상남도', '제주특별자치도'];

interface SpotRow { code: string; name: string; stores: number;
                    actual: number; expected: number; gap: number; }
interface Spots { ok: boolean; reason?: string; industry?: string;
                  national?: number; rows?: SpotRow[]; note?: string; }
interface CompRow { code: string; industry: string; corr: number;
                    together_pct: number; }
interface Comps { ok: boolean; reason?: string; industry?: string;
                  top?: CompRow[]; note?: string;
                  here?: { name: string; counts: Record<string, number> } | null; }

export default function GapScout() {
  const [inds, setInds] = useState<{ code: string; name: string }[]>([]);
  const [ind, setInd] = useState('카페');
  const [sido, setSido] = useState('전국');
  const [region, setRegion] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [spots, setSpots] = useState<Spots | null>(null);
  const [comps, setComps] = useState<Comps | null>(null);
  const [busy, setBusy] = useState(false);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/v1/industries').then((r) => r.json())
      .then((d) => setInds(d.items ?? [])).catch(() => {});
  }, []);

  // 동네 자동완성 — 궁합 카드의 "여긴 있나" 확인용 (선택 입력)
  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (region.trim().length < 2) { setHints([]); return; }
    tRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/suggest?q=${encodeURIComponent(region.trim())}`);
        const d = await res.json();
        setHints((d.dongs ?? []).map((x: { full: string }) => x.full).slice(0, 5));
      } catch { setHints([]); }
    }, 220);
  }, [region]);

  const run = async () => {
    if (!ind.trim() || busy) return;
    setBusy(true);
    try {
      const s = new URLSearchParams({ industry: ind.trim() });
      if (sido !== '전국') s.set('sido', sido);
      const c = new URLSearchParams({ industry: ind.trim() });
      if (region.trim()) c.set('region', region.trim());
      const [rs, rc] = await Promise.all([
        fetch(`/api/v1/empty-spots?${s}`).then((r) => r.json()),
        fetch(`/api/v1/companions?${c}`).then((r) => r.json()),
      ]);
      setSpots(rs); setComps(rc);
    } catch { setSpots(null); setComps(null); } finally { setBusy(false); }
  };

  return (
    <section className="mt-5 w-full max-w-[1240px]">
      {/* 조작부 — 업종 하나로 두 도구가 같이 움직입니다 */}
      <div className="rounded-2xl border-2 border-emerald-400/50 bg-white p-6
                      shadow-[0_20px_50px_-20px_rgba(16,120,80,.3)]">
        <h2 className="font-display text-[24px] text-kb-ink">
          업종에서 시작하기 <span className="text-emerald-700">
            — 빈 자리 동네 · 궁합 업종</span>
        </h2>
        <p className="mt-1 text-[14.5px] text-kb-ink/70">
          위 레이더가 "이 동네엔 뭐가 비어 있나"라면, 여기는 반대입니다 —
          업종을 정하면 <b>어느 동네가 비어 있는지</b>, 그리고 <b>무엇과 같이
          다니는 업종인지</b>를 272만 점포 실측으로 찾아드립니다.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <select value={ind} onChange={(e) => setInd(e.target.value)}
            className="rounded-xl border border-kb-ink/[.16] bg-white px-3 py-2.5
                       text-[14.5px] text-kb-ink outline-none focus:border-emerald-500">
            {!inds.some((x) => x.name === ind) && <option value={ind}>{ind}</option>}
            {inds.map((x) => <option key={x.code} value={x.name}>{x.name}</option>)}
          </select>
          <select value={sido} onChange={(e) => setSido(e.target.value)}
            className="rounded-xl border border-kb-ink/[.16] bg-white px-3 py-2.5
                       text-[14.5px] text-kb-ink outline-none focus:border-emerald-500">
            {SIDOS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="relative">
            <input value={region} onChange={(e) => setRegion(e.target.value)}
              placeholder="내 동네 (선택) — 예) 연남동"
              className="w-[210px] rounded-xl border border-kb-ink/[.16] bg-white
                         px-3 py-2.5 text-[14.5px] text-kb-ink outline-none
                         placeholder:text-kb-ink/45 focus:border-emerald-500" />
            {hints.length > 0 && (
              <ul className="absolute left-0 top-[calc(100%+4px)] z-20 w-[260px]
                             overflow-hidden rounded-xl border border-kb-ink/[.12]
                             bg-white shadow-lg">
                {hints.map((h) => (
                  <li key={h}>
                    <button onClick={() => { setRegion(h); setHints([]); }}
                      className="w-full px-3 py-2 text-left text-[13.5px]
                                 text-kb-ink/85 transition hover:bg-emerald-50">
                      {h}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={run} disabled={busy}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-[14.5px]
                       font-bold text-white transition hover:brightness-110
                       disabled:opacity-60">
            {busy ? '찾는 중…' : '찾아보기'}
          </button>
        </div>

        {(spots || comps) && (
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
            {/* ① 빈 자리 동네 */}
            <div className="rounded-xl bg-emerald-50/60 p-5 ring-1 ring-emerald-200">
              <h3 className="text-[17px] font-bold text-kb-ink">
                빈 자리 동네 스카우트
                <span className="ml-1.5 text-[13.5px] font-medium text-kb-ink/60">
                  — 규모는 되는데 {spots?.industry ?? ''}만 없는 곳
                </span>
              </h3>
              {spots?.ok ? (
                <>
                  <ol className="mt-3 space-y-2">
                    {(spots.rows ?? []).slice(0, 8).map((r, i) => (
                      <li key={r.code}
                          className="flex items-baseline gap-2.5 rounded-lg
                                     bg-white px-3 py-2 text-[14px]">
                        <span className="w-4 shrink-0 text-right text-[12.5px]
                                         font-bold text-emerald-700">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold
                                         text-kb-ink/88">{r.name}</span>
                        <span className="shrink-0 text-[12.5px] text-kb-ink/62
                                         [font-variant-numeric:tabular-nums]">
                          전체 {r.stores.toLocaleString()} · 지금 {r.actual}곳
                          <b className="ml-1 text-emerald-700">
                            (보통 {Math.round(r.expected)}곳)
                          </b>
                        </span>
                      </li>
                    ))}
                  </ol>
                  {spots.note && (
                    <p className="mt-3 text-[12px] leading-relaxed text-kb-ink/58">
                      {spots.note}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-[13.5px] text-kb-ink/60">
                  {spots?.reason ?? '조건에 맞는 동네가 없습니다.'}
                </p>
              )}
            </div>

            {/* ② 궁합 업종 */}
            <div className="rounded-xl bg-emerald-50/60 p-5 ring-1 ring-emerald-200">
              <h3 className="text-[17px] font-bold text-kb-ink">
                궁합 업종
                <span className="ml-1.5 text-[13.5px] font-medium text-kb-ink/60">
                  — {comps?.industry ?? ''}와 같이 다니는 가게들
                </span>
              </h3>
              {comps?.ok ? (
                <>
                  <ul className="mt-3 space-y-2">
                    {(comps.top ?? []).map((t) => {
                      const here = comps.here?.counts?.[t.code];
                      return (
                        <li key={t.code}
                            className="rounded-lg bg-white px-3 py-2 text-[14px]">
                          <div className="flex items-baseline gap-2">
                            <span className="min-w-0 flex-1 truncate font-semibold
                                             text-kb-ink/88">{t.industry}</span>
                            <span className="shrink-0 text-[12.5px] text-kb-ink/62
                                             [font-variant-numeric:tabular-nums]">
                              함께 있는 동네 {t.together_pct}%
                            </span>
                            {comps.here && (
                              here === 0 ? (
                                <span className="shrink-0 rounded-md bg-amber-400/[.2]
                                                 px-1.5 py-0.5 text-[11.5px] font-bold
                                                 text-amber-800">
                                  여긴 없음
                                </span>
                              ) : (
                                <span className="shrink-0 text-[12px] text-kb-ink/55">
                                  여긴 {here}곳
                                </span>
                              )
                            )}
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full
                                          bg-kb-ink/[.06]">
                            <div className="h-full rounded-full bg-emerald-500"
                                 style={{ width:
                                   `${Math.min(100, Math.max(4, t.corr * 260))}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {comps.here && (
                    <p className="mt-2.5 text-[12.5px] text-kb-ink/62">
                      기준 동네: {comps.here.name} — "보통 같이 있는데 여긴
                      없다"면 곁들일 기회일 수 있습니다.
                    </p>
                  )}
                  {comps.note && (
                    <p className="mt-2 text-[12px] leading-relaxed text-kb-ink/58">
                      {comps.note}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-[13.5px] text-kb-ink/60">
                  {comps?.reason ?? '이 업종은 표본이 적어 재지 않습니다.'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
