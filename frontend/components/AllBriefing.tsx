'use client';

/**
 * 한 번에 브리핑 — 동네와 업종만 고르면 세 에이전트가 동시에 움직입니다.
 *
 * '한 번에' 갈래는 꿀비의 크로스오버(입지×자금 동시 가동)가 주인공인데,
 * 페이지에는 질문창뿐이었습니다. 문장을 짓는 부담 없이 동네·업종 두 칸을
 * 채우면 질문이 완성되어 그대로 전송됩니다 — 실제 행정동·실제 업종만.
 */

import { useEffect, useRef, useState } from 'react';

export default function AllBriefing({ onAsk }: { onAsk: (q: string) => void }) {
  const [region, setRegion] = useState('');
  const [industry, setIndustry] = useState('');
  const [dongs, setDongs] = useState<string[]>([]);
  const [inds, setInds] = useState<string[]>([]);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/v1/industries')
      .then((r) => r.json())
      .then((d) => setInds((d.items ?? []).map((x: { name: string }) => x.name)))
      .catch(() => setInds([]));
  }, []);

  useEffect(() => {
    if (tRef.current) clearTimeout(tRef.current);
    if (region.trim().length < 2) { setDongs([]); return; }
    tRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/suggest?q=${encodeURIComponent(region.trim())}`);
        const d = await r.json();
        setDongs((d.dongs ?? []).map((x: { full: string }) => x.full).slice(0, 6));
      } catch { setDongs([]); }
    }, 220);
  }, [region]);

  const go = () => {
    if (!region.trim() || !industry.trim()) return;
    onAsk(`${region.trim()}에서 ${industry.trim()} 하려는데 자리랑 자금이랑 다 봐줘`);
  };

  return (
    <section className="mt-6 w-full max-w-[1240px] rounded-2xl border-2
                        border-violet-400/50 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(90,70,180,.3)]">
      <h2 className="font-display text-[24px] text-kb-ink">
        🐝 한 번에 브리핑 <span className="text-violet-700">— 두 칸이면 세 에이전트가 움직여요</span>
      </h2>
      <p className="mt-1 text-[14.5px] text-kb-ink/70">
        동네와 업종만 고르면 <b>입지 점수와 정책자금을 한 번에</b> 살펴 드려요.
        문장은 꿀비가 만들게요.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <input value={region} onChange={(e) => setRegion(e.target.value)}
          list="brief-dongs" placeholder="동네 — 예) 연남동"
          className="w-56 rounded-xl bg-kb-ink/[.04] px-4 py-2.5 text-[15px]
                     font-semibold text-kb-ink ring-1 ring-kb-ink/[.12]
                     placeholder:font-normal placeholder:text-kb-ink/40
                     focus:outline-none focus:ring-2 focus:ring-violet-400/60" />
        <datalist id="brief-dongs">
          {dongs.map((d) => <option key={d} value={d} />)}
        </datalist>
        <input value={industry} onChange={(e) => setIndustry(e.target.value)}
          list="brief-inds" placeholder="업종 — 예) 카페"
          onKeyDown={(e) => e.key === 'Enter' && go()}
          className="w-48 rounded-xl bg-kb-ink/[.04] px-4 py-2.5 text-[15px]
                     font-semibold text-kb-ink ring-1 ring-kb-ink/[.12]
                     placeholder:font-normal placeholder:text-kb-ink/40
                     focus:outline-none focus:ring-2 focus:ring-violet-400/60" />
        <datalist id="brief-inds">
          {inds.map((n) => <option key={n} value={n} />)}
        </datalist>
        <button onClick={go} disabled={!region.trim() || !industry.trim()}
          className="rounded-xl bg-violet-600 px-6 py-2.5 text-[15px] font-bold
                     text-white shadow-sm transition hover:brightness-105
                     disabled:opacity-40">
          한 번에 브리핑 받기
        </button>
      </div>
      <p className="mt-3 text-[12.5px] text-kb-ink/55">
        예: &ldquo;서울 마포구 연남동에서 카페 하려는데 자리랑 자금이랑 다
        봐줘&rdquo; — 이렇게 물은 것과 같아요.
      </p>
    </section>
  );
}
