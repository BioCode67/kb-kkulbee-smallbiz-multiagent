'use client';

/**
 * 지금 검색창에서는 — 구글 트렌드 공식 임베드.
 *
 * 검색 관심도를 우리가 수집·가공하면 그 순간부터 날조 위험이 생깁니다.
 * 그래서 구글이 직접 그려 주는 공식 위젯을 그대로 답니다 — 수치도 차트도
 * 구글 것이고, 우리는 어떤 검색어 묶음을 나란히 볼지(칩)만 고릅니다.
 *
 * 위젯이 못 뜨는 환경(차단기·오프라인)에서는 안내 문구로 물러납니다.
 */

import { useEffect, useRef, useState } from 'react';

const SETS = [
  { key: 'life', label: '창업 vs 폐업', kws: ['창업', '폐업'] },
  { key: 'food', label: '먹거리 창업',
    kws: ['카페 창업', '빵집 창업', '치킨집 창업', '분식집 창업'] },
  { key: 'self', label: '무인·셀프 아이템',
    kws: ['무인점포', '스터디카페', '셀프사진관', '코인세탁소'] },
] as const;

type TrendsNS = {
  embed: {
    renderExploreWidgetTo: (el: HTMLElement, type: string,
                            query: object, opts: object) => void;
  };
};

let loaderPromise: Promise<TrendsNS> | null = null;
function loadEmbed(): Promise<TrendsNS> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { trends?: TrendsNS };
    if (w.trends?.embed) { resolve(w.trends); return; }
    const s = document.createElement('script');
    s.src = 'https://ssl.gstatic.com/trends_nrtr/2051_RC11/embed_loader.js';
    s.onerror = () => reject(new Error('trends loader fail'));
    s.onload = () => {
      const t = (window as unknown as { trends?: TrendsNS }).trends;
      if (t?.embed) resolve(t); else reject(new Error('trends missing'));
    };
    document.head.appendChild(s);
  });
  return loaderPromise;
}

export default function SearchTrends() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [set, setSet] = useState<(typeof SETS)[number]>(SETS[0]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let disposed = false;
    (async () => {
      let trends: TrendsNS;
      try { trends = await loadEmbed(); }
      catch { if (!disposed) setFailed(true); return; }
      const el = boxRef.current;
      if (disposed || !el) return;
      el.innerHTML = '';
      try {
        trends.embed.renderExploreWidgetTo(el, 'TIMESERIES', {
          comparisonItem: set.kws.map((k) => ({
            keyword: k, geo: 'KR', time: 'today 12-m' })),
          category: 0, property: '',
        }, {
          exploreQuery:
            `date=today%2012-m&geo=KR&q=${encodeURIComponent(set.kws.join(','))}`,
          guestPath: 'https://trends.google.com:443/trends/embed/',
        });
      } catch { setFailed(true); }
    })();
    return () => { disposed = true; };
  }, [set]);

  return (
    <section className="mt-5 rounded-2xl border-2 border-kb-yellow/50 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(224,144,0,.3)]">
      <h2 className="font-display text-[24px] text-kb-ink">
        지금 검색창에서는 <span className="text-orange-700">— 구글 트렌드</span>
      </h2>
      <p className="mt-1 text-[13.5px] text-kb-ink/70">
        대한민국 최근 12개월 검색 관심도입니다. 구글이 직접 그리는 공식
        위젯이라 수치를 가공하지 않습니다 — 저희는 나란히 볼 검색어 묶음만
        고릅니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SETS.map((s) => (
          <button key={s.key} onClick={() => setSet(s)}
            className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold
                        transition ${s.key === set.key
              ? 'bg-kb-yellow text-kb-ink'
              : 'bg-kb-ink/[.05] text-kb-ink/72 hover:bg-kb-ink/[.09]'}`}>
            {s.label}
          </button>
        ))}
      </div>
      {failed ? (
        <p className="mt-4 rounded-xl bg-kb-ink/[.04] px-4 py-3 text-[13.5px]
                      text-kb-ink/65">
          구글 트렌드 위젯을 불러오지 못했습니다. 네트워크나 차단 프로그램에
          따라 다를 수 있습니다 —
          <a className="ml-1 underline" target="_blank" rel="noreferrer"
             href={`https://trends.google.co.kr/trends/explore?date=today%2012-m&geo=KR&q=${encodeURIComponent(set.kws.join(','))}`}>
            구글 트렌드에서 직접 보기
          </a>
        </p>
      ) : (
        <div ref={boxRef} className="mt-4 min-h-[300px] overflow-hidden rounded-xl" />
      )}
      <p className="mt-3 text-[12px] text-kb-ink/55">
        출처: Google Trends (실시간 임베드) · 관심도는 검색량의 상대 지수(0~100)이며
        매출·점포 수와는 다른 지표입니다. 차트가 안 보이는 네트워크라면
        <a className="ml-1 underline" target="_blank" rel="noreferrer"
           href={`https://trends.google.co.kr/trends/explore?date=today%2012-m&geo=KR&q=${encodeURIComponent(set.kws.join(','))}`}>
          구글 트렌드에서 직접 보기
        </a>
      </p>
    </section>
  );
}
