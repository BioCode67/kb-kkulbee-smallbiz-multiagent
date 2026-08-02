'use client';

/**
 * 내 찜 서랍 — 담아 둔 공고를 마감 가까운 순으로.
 *
 * D-day가 이 서랍의 존재 이유입니다. 공고는 검색으로 다시 찾을 수 있지만,
 * "그거 마감이 언제였더라"는 못 찾습니다. 마감 지난 것은 지웠다고 알려주고
 * 아래로 내립니다.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { dday, loadSaved, onSavedChange, removeSaved, type SavedProgram } from '@/lib/saved';

export default function SavedDrawer({ open, onClose }: {
  open: boolean; onClose: () => void;
}) {
  const [items, setItems] = useState<SavedProgram[]>([]);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  useEffect(() => {
    const load = () => setItems(loadSaved());
    load();
    return onSavedChange(load);
  }, [open]);

  // 마감 임박 순 — 날짜 없는 것(상시)은 뒤로, 지난 것은 맨 뒤로.
  const sorted = [...items].sort((a, b) => {
    const da = dday(a.deadline), db = dday(b.deadline);
    const ka = da == null ? 9000 : da < 0 ? 99000 + -da : da;
    const kb = db == null ? 9000 : db < 0 ? 99000 + -db : db;
    return ka - kb;
  });

  if (!host) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} onClick={onClose}
            className="fixed inset-0 z-[80] bg-kb-ink/30 backdrop-blur-[2px]" />
          <motion.aside
            initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[400px]
                       flex-col bg-kb-cream shadow-2xl ring-1 ring-kb-ink/[.12]"
          >
            <header className="flex items-center justify-between border-b
                               border-kb-ink/[.1] px-4 py-3.5">
              <p className="text-[15px] font-bold text-kb-ink">
                ⭐ 찜한 지원사업 <span className="text-kb-ink/40">{items.length}</span>
              </p>
              <button onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-lg text-kb-ink/50
                           hover:bg-kb-ink/[.06]">✕</button>
            </header>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
              {sorted.length === 0 && (
                <p className="py-10 text-center text-[13px] leading-relaxed text-kb-ink/45">
                  아직 담은 공고가 없어요.
                  <br />지원사업 카드의 ⭐를 눌러 담아 두세요 —
                  <br />마감 가까운 순으로 여기 모입니다.
                </p>
              )}
              {sorted.map((s) => {
                const d = dday(s.deadline);
                return (
                  <div key={s.id} className="surface-1 bg-white p-3.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold leading-snug text-kb-ink">
                          {s.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-kb-ink/45">
                          {s.provider} · {s.funding_type}
                        </p>
                      </div>
                      <button onClick={() => removeSaved(s.id)}
                        title="찜 해제"
                        className="shrink-0 text-[13px] text-kb-ink/30
                                   hover:text-rose-600">✕</button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px]
                                        font-bold ${
                        d == null ? 'bg-sky-500/[.12] text-sky-700'
                        : d < 0 ? 'bg-kb-ink/[.06] text-kb-ink/40 line-through'
                        : d <= 7 ? 'bg-rose-500/[.12] text-rose-700'
                        : 'bg-emerald-500/[.12] text-emerald-700'}`}>
                        {d == null ? s.apply_period || '상시'
                          : d < 0 ? '마감됨'
                          : d === 0 ? '오늘 마감!'
                          : `마감 D-${d}`}
                      </span>
                      <a href={s.url} target="_blank" rel="noreferrer"
                        className="text-[11.5px] font-semibold text-kb-amber
                                   hover:underline">
                        공고 원문 →
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            <footer className="border-t border-kb-ink/[.1] p-3 text-center
                               text-[10.5px] text-kb-ink/40">
              이 브라우저에만 저장됩니다 · 최대 50건
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    host,
  );
}
