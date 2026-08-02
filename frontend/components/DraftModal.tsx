'use client';

/**
 * 민원서 초안 — 절차 안내의 끝단.
 *
 * 절차를 안내받아도 막상 "민원신청서"라는 백지 앞에서 사장님들은 멈춥니다.
 * 무엇을 어떤 순서로 적어야 하는지가 곧 장벽입니다. 겪은 일 문장 그대로를
 * 서버(/api/v1/draft)에 보내면 제출할 수 있는 꼴의 초안이 돌아옵니다.
 * 법조문은 서버 규칙이 정하고(LLM이 지어내지 못함), 생성문도 가드레일을
 * 거칩니다.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export default function DraftModal({ open, onClose, situation }: {
  open: boolean; onClose: () => void; situation: string;
}) {
  const [draft, setDraft] = useState<{
    draft: string; dispute_type: string; note: string; generated_by: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(true); setDraft(null);
    fetch('/api/v1/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ situation }),
    }).then((r) => r.json()).then(setDraft)
      .catch(() => {}).finally(() => setBusy(false));
  }, [open, situation]);

  const copy = () => {
    if (!draft) return;
    navigator.clipboard?.writeText(draft.draft).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }} onClick={onClose}
                      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-[2px]" />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: .97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: .98 }}
            className="fixed left-1/2 top-1/2 z-[90] max-h-[84vh] w-[min(680px,92vw)]
                       -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl
                       border border-white/[.12] bg-[#111113] shadow-2xl"
          >
            <header className="flex items-center justify-between border-b
                               border-white/[.08] px-5 py-4">
              <div>
                <p className="text-[15px] font-bold text-white">민원서 초안</p>
                {draft && (
                  <p className="mt-0.5 text-[11.5px] text-white/40">
                    {draft.dispute_type} ·
                    {draft.generated_by === 'llm' ? ' AI가 사실관계를 정리했습니다'
                                                  : ' 서식 뼈대입니다'}
                  </p>
                )}
              </div>
              <button onClick={onClose}
                      className="grid h-9 w-9 place-items-center rounded-lg
                                 text-white/50 hover:bg-white/[.07] hover:text-white">
                ✕
              </button>
            </header>

            <div className="max-h-[56vh] overflow-y-auto p-5">
              {busy && (
                <p className="py-10 text-center text-[13px] text-white/40">
                  겪으신 일을 서식에 앉히는 중…
                </p>
              )}
              {draft && (
                <pre className="whitespace-pre-wrap font-sans text-[13px]
                                leading-[1.8] text-white/85">{draft.draft}</pre>
              )}
            </div>

            {draft && (
              <footer className="space-y-2.5 border-t border-white/[.08] p-4">
                <p className="text-[11px] leading-relaxed text-amber-200/65">
                  {draft.note}
                </p>
                <button onClick={copy}
                        className="w-full rounded-xl bg-kb-yellow py-2.5 text-[13.5px]
                                   font-bold text-kb-ink hover:brightness-105">
                  {copied ? '복사됨 ✓' : '전체 복사'}
                </button>
              </footer>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
