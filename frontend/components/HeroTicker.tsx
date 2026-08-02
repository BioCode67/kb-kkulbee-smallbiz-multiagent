'use client';

/**
 * 곧 마감 티커 — 묻기 전에도 움직이는 실데이터.
 *
 * "비어 보인다"는 화면에 장식을 더하는 대신, 지금 진짜로 흐르고 있는
 * 것(마감 임박 공고)을 흘려보냅니다. 놓친 마감은 돌아오지 않습니다.
 * 3.5초마다 다음 공고로 넘어가고, 누르면 기업마당 원문이 열립니다.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Item { title: string; deadline: string; days_left: number; url: string }

export default function HeroTicker() {
  const [items, setItems] = useState<Item[]>([]);
  const [i, setI] = useState(0);

  useEffect(() => {
    fetch('/api/v1/closing-soon')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.items?.length && setItems(d.items))
      .catch(() => {/* 티커가 없어도 화면은 완전합니다 */});
  }, []);

  useEffect(() => {
    if (items.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 3500);
    return () => clearInterval(t);
  }, [items.length]);

  if (!items.length) return null;
  const cur = items[i];

  return (
    <motion.a
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
      href={cur.url} target="_blank" rel="noreferrer"
      className="mt-5 flex max-w-full items-center gap-2.5 rounded-full border
                 border-kb-ink/[.1] bg-white/75 py-2 pl-3 pr-4 backdrop-blur-sm
                 transition hover:border-kb-amber/40"
      title="기업마당 공고 원문 열기"
    >
      <span className="shrink-0 rounded-full bg-rose-500/[.12] px-2 py-0.5
                       text-[12.5px] font-bold text-rose-700">
        ⏰ 곧 마감
      </span>
      {/* absolute 자식만 있으면 폭이 0으로 접힙니다 — 폭을 명시합니다 */}
      <span className="relative h-[18px] w-[150px] overflow-hidden sm:w-[340px]">
        <AnimatePresence mode="wait">
          <motion.span
            key={cur.url}
            initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.25 }}
            className="absolute inset-0 truncate text-[14.5px] text-kb-ink/88"
          >
            {cur.title}
          </motion.span>
        </AnimatePresence>
      </span>
      <b className="shrink-0 text-[14px] text-rose-700
                    [font-variant-numeric:tabular-nums]">
        {cur.days_left === 0 ? '오늘 마감' : `D-${cur.days_left}`}
      </b>
    </motion.a>
  );
}
