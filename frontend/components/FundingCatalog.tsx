'use client';

/**
 * 혜택 서랍 — 신청할 수 있는 지원 전체를 펼쳐 놓습니다.
 *
 * 자금 설계가 몇 건을 골라 준다면, 서랍은 "뭐가 있는지 자체를 모르겠다"에
 * 답합니다. 색인 900건 중 오늘 신청할 수 있는 것 전부를 검색·정렬·필터로
 * 직접 뒤져 보고, 내 가게(동네·업종)를 설정해 두면 지역이 어긋나는 것과
 * 중소·중견 전용을 뺀 '내 조건 맞춤'으로 좁혀 볼 수 있습니다.
 * 개수·마감일·한도는 전부 공고 색인 값 그대로 — 원문 링크가 근거입니다.
 */

import { useEffect, useRef, useState } from 'react';
import { isSaved, onSavedChange, toggleSaved } from '@/lib/saved';

interface Item {
  id: string; title: string; url: string; category: string;
  funding_type: string; group: 'grant' | 'loan' | 'edu' | 'etc';
  regions: string[]; agency: string | null; posted_at: string | null;
  apply_period_text: string | null; apply_end: string | null;
  open_status: 'open' | 'rolling' | 'upcoming';
  days_left: number | null; start_in: number | null;
  amount_krw: number | null; rate_pct: number | null;
  smallbiz: boolean; summary: string; fit: number; why: string[];
}
interface Catalog {
  ok: boolean; total: number; offset: number; limit: number; sort: string;
  items: Item[]; index_total: number; my_sido: string | null;
  counts: { funding: Record<string, number>; category: Record<string, number>;
            status: Record<string, number> };
  source: string; note: string;
}

const GROUPS = [
  ['grant', '주는 돈', 'bg-emerald-500/[.14] text-emerald-700 ring-emerald-500/30'],
  ['loan', '융자·보증', 'bg-sky-500/[.14] text-sky-700 ring-sky-500/30'],
  ['edu', '교육·컨설팅', 'bg-violet-500/[.14] text-violet-700 ring-violet-500/30'],
  ['etc', '그 밖', 'bg-kb-ink/[.07] text-kb-ink/70 ring-kb-ink/[.12]'],
] as const;
const CHIP_OF = Object.fromEntries(GROUPS.map(([k, , c]) => [k, c]));
const CATEGORIES = ['금융', '창업', '경영', '내수', '수출', '기술', '인력', '기타'];
const SIDO = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
              '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const STATUS = [['open', '접수 중'], ['rolling', '상시·수시'],
                ['upcoming', '접수 예정']] as const;
const SORTS = [['auto', '추천순 (검색·맞춤 반영)'], ['deadline', '마감 임박순'],
               ['newest', '최신 공고순'], ['amount', '한도 큰 순']] as const;

const won = (v: number) =>
  v >= 100_000_000 ? `${(v / 100_000_000).toFixed(v % 100_000_000 ? 1 : 0)}억원`
    : `${Math.round(v / 10_000).toLocaleString()}만원`;

function Dday({ it }: { it: Item }) {
  if (it.open_status === 'rolling') {
    return <span className="rounded-md bg-kb-ink/[.06] px-1.5 py-0.5 text-[11px]
                            font-bold text-kb-ink/60">상시·수시</span>;
  }
  if (it.open_status === 'upcoming') {
    return <span className="rounded-md bg-sky-500/[.12] px-1.5 py-0.5 text-[11px]
                            font-bold text-sky-700">
      {it.start_in != null && it.start_in > 0 ? `${it.start_in}일 뒤 시작` : '접수 예정'}
    </span>;
  }
  const d = it.days_left;
  if (d == null) return null;
  const tone = d <= 7 ? 'bg-rose-500/[.14] text-rose-700'
    : d <= 30 ? 'bg-amber-400/[.18] text-amber-800'
      : 'bg-kb-ink/[.06] text-kb-ink/62';
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${tone}`}>
    {d === 0 ? '오늘 마감' : `D-${d}`}
  </span>;
}

export default function FundingCatalog({ region, industry }: {
  region?: string | null; industry?: string | null;
}) {
  const hasProfile = Boolean(region || industry);
  const [q, setQ] = useState('');
  const [funding, setFunding] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [regionSel, setRegionSel] = useState('');
  const [fitOnly, setFitOnly] = useState(false);
  const [sort, setSort] = useState('auto');
  const [r, setR] = useState<Catalog | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);          // ☆ 갱신용
  const seq = useRef(0);

  useEffect(() => onSavedChange(() => bump((n) => n + 1)), []);

  const query = (offset: number) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (funding) p.set('funding', funding);
    if (category) p.set('category', category);
    if (status) p.set('status', status);
    if (regionSel) p.set('region', regionSel);
    if (fitOnly) p.set('fit_only', 'true');
    if (region) p.set('my_region', region);
    if (industry) p.set('my_industry', industry);
    p.set('sort', sort);
    p.set('offset', String(offset));
    p.set('limit', '20');
    return p;
  };

  const load = async (offset: number, append: boolean) => {
    const my = ++seq.current;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/catalog?${query(offset)}`);
      const j: Catalog = await res.json();
      if (my !== seq.current) return;     // 늦게 온 옛 응답은 버립니다
      setR(j);
      setItems((prev) => (append ? [...prev, ...j.items] : j.items));
    } catch { if (my === seq.current) setR(null); }
    finally { if (my === seq.current) setBusy(false); }
  };

  // 조건이 바뀌면 처음부터 다시 — 타이핑은 300ms 모아서 한 번만 묻습니다.
  useEffect(() => {
    const t = setTimeout(() => load(0, false), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, funding, category, status, regionSel, fitOnly, sort, region, industry]);

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-[12.5px] font-bold ring-1 transition ${
      on ? 'bg-kb-yellow/[.22] text-kb-amber ring-kb-yellow/60'
        : 'text-kb-ink/60 ring-kb-ink/[.13] hover:text-kb-ink'}`;

  return (
    <section id="funding-catalog"
             className="mt-8 w-full max-w-[1240px] rounded-2xl border-2
                        border-kb-yellow/40 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(224,144,0,.25)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] text-kb-ink">
            혜택 서랍 <span className="text-kb-amber">— 신청할 수 있는 것 전부</span>
          </h2>
          <p className="mt-1 text-[14.5px] text-kb-ink/70">
            지원사업 색인 <b>{r?.index_total ?? 900}건</b> 중 오늘 신청할 수 있는
            것을 전부 펼쳐 놓았습니다. 검색·정렬하고, 내 가게 조건으로 좁혀 보세요.
          </p>
        </div>
        {r && (
          <p className="text-[14px] font-bold text-kb-ink/70">
            이 조건으로 <span className="text-[22px] font-extrabold text-kb-amber
              [font-variant-numeric:tabular-nums]">{r.total}</span> 건
          </p>
        )}
      </div>

      {/* 검색 · 정렬 · 맞춤 */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="공고 검색 — 예: 스마트상점, 폐업, 배달, 온누리"
          className="min-w-[220px] flex-1 rounded-xl bg-kb-ink/[.03] px-4 py-2.5
                     text-[14.5px] text-kb-ink ring-1 ring-kb-ink/[.14]
                     placeholder:text-kb-ink/40 focus:outline-none
                     focus:ring-2 focus:ring-kb-yellow/70" />
        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="rounded-xl bg-kb-ink/[.03] px-3 py-2.5 text-[13.5px]
                     font-semibold text-kb-ink ring-1 ring-kb-ink/[.14]
                     focus:outline-none">
          {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={regionSel} onChange={(e) => setRegionSel(e.target.value)}
          className="rounded-xl bg-kb-ink/[.03] px-3 py-2.5 text-[13.5px]
                     font-semibold text-kb-ink ring-1 ring-kb-ink/[.14]
                     focus:outline-none">
          <option value="">모든 지역</option>
          <option value="전국">전국 공통만</option>
          {SIDO.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => hasProfile && setFitOnly((v) => !v)}
          disabled={!hasProfile}
          title={hasProfile ? '지역이 어긋나는 공고와 중소·중견 전용을 뺍니다'
            : "상단 '내 가게'에서 동네·업종을 설정하면 켤 수 있어요"}
          className={`rounded-xl px-4 py-2.5 text-[13.5px] font-bold ring-1
                      transition disabled:opacity-45 ${fitOnly
            ? 'bg-kb-yellow text-kb-ink ring-kb-yellow'
            : 'text-kb-ink/70 ring-kb-ink/[.15] hover:text-kb-ink'}`}>
          ✦ 내 조건 맞춤{fitOnly && r?.my_sido ? ` — ${r.my_sido}` : ''}
        </button>
      </div>
      {!hasProfile && (
        <p className="mt-2 text-[12.5px] text-kb-ink/55">
          상단 <b>내 가게</b>에 동네·업종을 넣어 두면, 지역이 어긋나는 공고를
          빼고 왜 맞는지까지 붙여 드립니다.
        </p>
      )}

      {/* 성격·분야·상태 칩 — 개수는 지금 조건에서 남는 것 기준 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setFunding('')} className={chip(!funding)}>전체</button>
        {GROUPS.map(([k, label]) => (
          <button key={k} onClick={() => setFunding(funding === k ? '' : k)}
                  className={chip(funding === k)}>
            {label} {r ? r.counts.funding[k] ?? 0 : ''}
          </button>
        ))}
        <span className="mx-1.5 h-4 w-px bg-kb-ink/[.12]" />
        {STATUS.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(status === k ? '' : k)}
                  className={chip(status === k)}>
            {label} {r ? r.counts.status[k] ?? 0 : ''}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(category === c ? '' : c)}
                  className={chip(category === c)}>
            {c} {r ? r.counts.category[c] ?? 0 : ''}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {r && items.length === 0 && !busy && (
        <p className="mt-5 rounded-xl bg-kb-ink/[.04] px-4 py-6 text-center
                      text-[14px] text-kb-ink/60">
          이 조건에 맞는 공고가 없습니다 — 검색어나 필터를 넓혀 보세요.
        </p>
      )}
      <ul className="mt-4 space-y-2.5">
        {items.map((it) => {
          const saved = isSaved(it.id);
          return (
            <li key={it.id} className="rounded-xl bg-kb-ink/[.03] p-3.5 ring-1
                                       ring-kb-ink/[.08] transition
                                       hover:bg-kb-yellow/[.06]">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold
                                  ring-1 ${CHIP_OF[it.group]}`}>
                  {it.funding_type}
                </span>
                <Dday it={it} />
                {it.smallbiz && (
                  <span className="rounded-md bg-kb-yellow/[.2] px-1.5 py-0.5
                                   text-[11px] font-bold text-kb-amber">
                    소상공인
                  </span>
                )}
                <a href={it.url} target="_blank" rel="noreferrer"
                   className="min-w-0 flex-1 truncate text-[14.5px] font-semibold
                              text-kb-ink hover:text-kb-amber hover:underline">
                  {it.title}
                </a>
                {it.amount_krw != null && (
                  <span className="text-[14px] font-extrabold text-kb-ink
                                   [font-variant-numeric:tabular-nums]">
                    ~{won(it.amount_krw)}
                  </span>
                )}
                <button onClick={() => toggleSaved({
                    id: it.id, name: it.title, provider: it.agency ?? '',
                    funding_type: it.funding_type, deadline: it.apply_end,
                    apply_period: it.apply_period_text ?? '', url: it.url })}
                  title={saved ? '찜 해제' : '찜해 두기 — ☆ 서랍에서 모아 봅니다'}
                  className={`text-[17px] leading-none transition ${saved
                    ? 'text-kb-amber' : 'text-kb-ink/30 hover:text-kb-amber'}`}>
                  {saved ? '★' : '☆'}
                </button>
              </div>
              <p className="mt-1.5 text-[12.5px] text-kb-ink/62">
                {it.agency}
                {' · '}{it.regions.length ? it.regions.join('·') : '전국'}
                {it.apply_period_text && <> · {it.apply_period_text}</>}
                {it.rate_pct != null && <> · 금리 {it.rate_pct}%</>}
                {' · '}{it.category}
              </p>
              {it.summary && (
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed
                              text-kb-ink/55">{it.summary}</p>
              )}
              {it.why.length > 0 && (
                <p className="mt-1.5 text-[12px] font-semibold text-kb-amber/90">
                  ✦ {it.why.join(' · ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* 더 보기 · 출처 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {r && items.length < r.total ? (
          <button onClick={() => load(items.length, true)} disabled={busy}
            className="rounded-xl px-5 py-2.5 text-[14px] font-bold text-kb-ink/72
                       ring-1 ring-kb-ink/[.15] transition hover:text-kb-ink
                       disabled:opacity-50">
            {busy ? '불러오는 중…' : `더 보기 (${items.length}/${r.total})`}
          </button>
        ) : <span />}
        {r && (
          <p className="text-[11.5px] text-kb-ink/50">{r.source} · {r.note}</p>
        )}
      </div>
    </section>
  );
}
