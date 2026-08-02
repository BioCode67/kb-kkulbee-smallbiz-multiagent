'use client';

/**
 * 꿀비 플로팅 챗봇 — 어디서든 우하단 꿀비를 누르면 바로 대화.
 *
 * 결과 화면을 한참 내려 보다가 질문이 떠오르면, 지금은 맨 위 입력창까지
 * 올라가야 합니다. 챗봇 버튼은 그 거리를 없앱니다 — 스크롤 위치와 무관하게
 * 꿀비가 따라다니고, 누르면 말풍선 대화창이 열립니다.
 *
 * 별도 백엔드가 아닙니다. 본 화면과 같은 대화(history·세션)를 다른 창으로
 * 볼 뿐이라, 챗봇에서 물은 것이 본 화면 카드로도 쌓입니다. 창에는 글만
 * 간결히 보여주고 "자세히"를 누르면 본문의 그 답으로 스크롤합니다.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ChatResponse } from '@/lib/types';

interface Props {
  history: { q: string; res: ChatResponse }[];
  loading: boolean;
  onAsk: (q: string) => void;
  hidden?: boolean;
}

export default function BeeChatbot({ history, loading, onAsk, hidden }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 새 말이 오면 아래로 — 대화창의 기본 예의입니다.
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [history.length, loading, open]);

  const send = () => {
    const q = text.trim();
    if (!q || loading) return;
    onAsk(q); setText('');
  };

  const last = history[history.length - 1]?.res;

  if (hidden) return null;
  return (
    <>
      {/* 떠 있는 꿀비 버튼 */}
      <motion.button
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((v) => !v)}
        aria-label="꿀비와 대화하기"
        className="print:hidden fixed bottom-5 right-5 z-[70] grid h-16 w-16 place-items-center
                   rounded-full bg-kb-yellow shadow-[0_10px_30px_-8px_rgba(255,188,0,.6)]
                   ring-4 ring-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kkulbee.svg" alt="" width={38} height={43}
             className={open ? 'opacity-40' : ''} />
        {!open && history.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 w-5 place-items-center
                           rounded-full bg-kb-ink text-[10px] font-bold text-white">
            {history.length}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            className="fixed bottom-24 right-5 z-[70] flex h-[min(560px,72vh)]
                       w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden
                       rounded-2xl border border-kb-ink/[.14] bg-white shadow-2xl"
          >
            <header className="flex items-center gap-2.5 border-b border-kb-ink/[.08]
                               bg-kb-yellow/[.12] px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kkulbee.svg" alt="" width={22} height={25} />
              <div className="flex-1">
                <p className="text-[13.5px] font-bold text-kb-ink">꿀비</p>
                <p className="text-[10.5px] text-kb-ink/50">
                  {loading ? '생각하는 중…' : '무엇이든 물어보세요'}
                </p>
              </div>
              <button onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-kb-ink/50
                           hover:bg-kb-ink/[.06]">✕</button>
            </header>

            <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
              {history.length === 0 && (
                <div className="rounded-2xl rounded-tl-md bg-kb-ink/[.05] px-3.5 py-2.5
                                text-[13px] leading-relaxed text-kb-ink/85">
                  안녕하세요 사장님! 동네 이야기도, 지원금도, 억울한 일도 —
                  편하게 물어보세요. 예) &ldquo;장사가 안돼서 돈이 급해요&rdquo;
                </div>
              )}
              {history.map(({ q, res: r }, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-kb-yellow/[.25]
                                  px-3.5 py-2 text-[13px] text-kb-ink">{q}</p>
                  </div>
                  <div className="max-w-[92%] rounded-2xl rounded-tl-md bg-kb-ink/[.05]
                                  px-3.5 py-2.5">
                    <p className="whitespace-pre-line text-[13px] leading-relaxed
                                  text-kb-ink/85">
                      {r.answer.split('\n\n·')[0].slice(0, 400)}
                      {r.answer.length > 400 ? '…' : ''}
                    </p>
                    {r.cards.length > 0 && (
                      <button
                        onClick={() => {
                          setOpen(false);
                          document.querySelectorAll('section')[0]
                            ?.closest('main')
                            ?.querySelectorAll('.space-y-10 > div')[i]
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="mt-1.5 text-[11.5px] font-semibold text-kb-amber
                                   hover:underline">
                        지도·표로 자세히 보기 →
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-1 px-2">
                  {[0, 1, 2].map((d) => (
                    <span key={d}
                      className="h-2 w-2 animate-bounce rounded-full bg-kb-yellow"
                      style={{ animationDelay: `${d * 0.13}s` }} />
                  ))}
                </div>
              )}
              {last && !loading && last.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {last.suggestions.slice(0, 2).map((sq) => (
                    <button key={sq} onClick={() => onAsk(sq)}
                      className="rounded-full border border-kb-yellow/50 px-2.5 py-1
                                 text-[11.5px] text-kb-amber hover:bg-kb-yellow/[.12]">
                      {sq}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <footer className="flex gap-2 border-t border-kb-ink/[.08] p-2.5">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
                }}
                placeholder="꿀비에게 물어보세요"
                className="min-w-0 flex-1 rounded-xl border border-kb-ink/[.12] px-3
                           py-2.5 text-[13px] text-kb-ink placeholder:text-kb-ink/35
                           focus:border-kb-yellow focus:outline-none"
              />
              <button onClick={send} disabled={loading || !text.trim()}
                className="rounded-xl bg-kb-yellow px-4 text-[13px] font-bold
                           text-kb-ink disabled:opacity-40">
                전송
              </button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
