'use client';

/**
 * 소비자 보호 서랍 — 쉬운 용어 사전과 금소법 검사기.
 *
 * Pick 4의 두 기능은 답변 안에서만 나왔습니다. 분쟁 질문을 해야 용어가
 * 보이고, 가드레일은 위반이 있어야 흔적이 남습니다. 심사위원이 "정말
 * 되는가"를 확인하려면 **직접 눌러 볼 자리**가 있어야 합니다.
 *
 * 검사기는 실제 가드레일 그대로입니다(/api/v1/guardrail/check). 시연용
 * 흉내가 아니라, 모든 답변이 통과하는 바로 그 검사를 아무 문장에나
 * 돌려 볼 수 있게 연 것입니다.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { TermEntry } from '@/lib/types';

/* 단어 단위 LCS 디프 — 원문에서 지워진 말과 새로 들어온 말을 가릅니다.
   가드레일이 실제로 무엇을 지우고 무엇으로 바꿨는지를 '빨간 펜'으로
   보여 주는 것이 목적입니다. 시각화일 뿐 검사·재작성은 전부 서버 몫. */
type DiffTok = { w: string; k: 'same' | 'del' | 'add' };
function wordDiff(a: string, b: string): DiffTok[] {
  const A = a.split(/\s+/).filter(Boolean), B = b.split(/\s+/).filter(Boolean);
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffTok[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ w: A[i], k: 'same' }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ w: A[i], k: 'del' }); i++; }
    else { out.push({ w: B[j], k: 'add' }); j++; }
  }
  while (i < n) out.push({ w: A[i++], k: 'del' });
  while (j < m) out.push({ w: B[j++], k: 'add' });
  return out;
}

type Tab = 'terms' | 'check';

export default function ProtectionDrawer({ open, onClose }: {
  open: boolean; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('terms');
  const [terms, setTerms] = useState<TermEntry[]>([]);
  const [text, setText] = useState('사장님은 연 2%로 무조건 대출받으실 수 있습니다');
  const [result, setResult] = useState<{
    original?: string; safe: string;
    report: { passed: boolean; violations: string[] };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // 이 서랍은 backdrop-blur를 쓰는 상단바 '안'에서 렌더됩니다. backdrop-filter는
  // fixed 요소의 기준을 자기 자신으로 바꿔 버려서, h-full이 화면이 아니라
  // 56px짜리 상단바 높이가 됐습니다 — 서랍이 납작하게 눌린 원인. 포털로
  // body에 직접 그려 기준을 화면으로 되돌립니다.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);

  useEffect(() => {
    if (!open || terms.length) return;
    fetch('/api/v1/terms').then((r) => r.json()).then(setTerms).catch(() => {});
  }, [open, terms.length]);

  const check = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/v1/guardrail/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      setResult(await r.json());
    } catch { /* 서버가 없으면 조용히 */ } finally { setBusy(false); }
  };

  if (!host) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-kb-ink/30 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-[90] flex h-full w-full max-w-[420px]
                       flex-col bg-kb-cream shadow-2xl ring-1 ring-kb-ink/[.12]"
          >
            <header className="flex items-center gap-2 border-b border-kb-ink/[.1] p-4">
              <div className="flex flex-1 gap-1 rounded-xl bg-kb-ink/[.05] p-1">
                {([['terms', '쉬운 용어 사전'], ['check', '금소법 검사기']] as const)
                  .map(([k, label]) => (
                    <button key={k}
                      onClick={() => setTab(k)}
                      className={`flex-1 rounded-lg px-3 py-2 text-[14.5px] font-semibold
                                  transition ${tab === k
                        ? 'bg-kb-yellow text-kb-ink'
                        : 'text-kb-ink/65 hover:text-kb-ink'}`}>
                      {label}
                    </button>
                  ))}
              </div>
              <button onClick={onClose}
                      className="grid h-9 w-9 place-items-center rounded-lg text-kb-ink/60
                                 transition hover:bg-kb-ink/[.05] hover:text-kb-ink">
                ✕
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {tab === 'terms' ? (
                <ul className="space-y-3">
                  {terms.map((t) => (
                    <li key={t.term} className="surface-1 p-3.5">
                      <p className="text-[15.5px] font-bold text-kb-ink">{t.term}</p>
                      <p className="mt-1 text-[14.5px] leading-relaxed text-kb-amber">
                        {t.easy}
                      </p>
                      {t.detail && (
                        <p className="mt-1 text-[13.5px] leading-relaxed text-kb-ink/60">
                          {t.detail}
                        </p>
                      )}
                      {t.caution && (
                        <p className="mt-1.5 rounded-md bg-rose-400/[.08] px-2 py-1.5
                                      text-[13px] leading-snug text-rose-700">
                          ⚠ {t.caution}
                        </p>
                      )}
                    </li>
                  ))}
                  {!terms.length && (
                    <p className="py-8 text-center text-[14px] text-kb-ink/50">
                      불러오는 중…
                    </p>
                  )}
                </ul>
              ) : (
                <div className="space-y-4">
                  <p className="text-[14px] leading-relaxed text-kb-ink/60">
                    아무 문장이나 넣어 보세요. 꿀비의 모든 답변이 통과하는
                    <b className="text-kb-ink/80"> 바로 그 검사</b>를 그대로 돌립니다 —
                    시연용 흉내가 아닙니다.
                  </p>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl bg-kb-ink/[.05] p-3 text-[15px] text-kb-ink
                               ring-1 ring-kb-ink/[.14] placeholder:text-kb-ink/40
                               focus:outline-none focus:ring-kb-yellow/40"
                  />
                  <button onClick={check} disabled={busy}
                          className="w-full rounded-xl bg-kb-yellow py-2.5 text-[15px]
                                     font-bold text-kb-ink transition hover:brightness-105
                                     disabled:opacity-40">
                    {busy ? '검사 중…' : '금소법 검사 돌리기'}
                  </button>

                  {result && (
                    <div className="space-y-2.5">
                      <p className={`rounded-lg px-3 py-2 text-[14px] font-semibold ${
                        result.report.passed
                          ? 'bg-emerald-400/[.12] text-emerald-700'
                          : 'bg-rose-400/[.12] text-rose-700'}`}>
                        {result.report.passed
                          ? '✓ 위반 표현 없음 — 그대로 나갈 수 있는 문장입니다'
                          : `✕ 단정 표현 ${result.report.violations.length}건 — 고쳐서 내보냅니다`}
                      </p>
                      {!result.report.passed && (
                        <>
                          <ul className="space-y-1">
                            {result.report.violations.map((v, i) => (
                              <li key={i} className="text-[13.5px] text-rose-700">
                                · {v}
                              </li>
                            ))}
                          </ul>
                          <div className="surface-1 p-3">
                            <p className="text-[12.5px] font-bold uppercase tracking-wider
                                          text-kb-ink/50">빨간 펜 교정 — 지운 말과 바꾼 말</p>
                            <p className="mt-1.5 text-[14.5px] leading-[1.9] text-kb-ink/90">
                              {wordDiff(result.original ?? text,
                                        result.safe.split('\n')[0]).map((t, i) => (
                                t.k === 'del' ? (
                                  <motion.del key={i}
                                    initial={{ opacity: 0.9 }}
                                    animate={{ opacity: 0.55 }}
                                    transition={{ delay: 0.15 + i * 0.05 }}
                                    className="mx-0.5 rounded bg-rose-500/[.1] px-1
                                               text-rose-600 line-through decoration-rose-500
                                               decoration-2">
                                    {t.w}
                                  </motion.del>
                                ) : t.k === 'add' ? (
                                  <motion.mark key={i}
                                    initial={{ opacity: 0, y: 3 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 + i * 0.05 }}
                                    className="mx-0.5 rounded bg-emerald-400/[.18] px-1
                                               font-semibold text-emerald-800">
                                    {t.w}
                                  </motion.mark>
                                ) : (
                                  <span key={i} className="mx-0.5">{t.w}</span>
                                )
                              ))}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="border-t border-kb-ink/[.1] p-3 text-center text-[12.5px]
                               text-kb-ink/45">
              금융소비자보호법 §19(설명의무) · §20(불공정영업 금지) · §21(부당권유 금지)
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    host,
  );
}
