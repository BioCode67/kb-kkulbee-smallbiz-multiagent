'use client';

/**
 * 꿀비 — 소상공인 사장님 곁의 AI 비서
 *
 * 화면이 두 국면으로 움직입니다.
 *
 *   ① 처음 — 꿀비가 화면 한가운데 크게 서서 말을 겁니다. 무엇을 물어도 되는지
 *            이 아이가 직접 알려 줍니다. 대시보드를 먼저 보여 주면 사장님은
 *            어디부터 봐야 할지 모릅니다.
 *   ② 답한 뒤 — 꿀비가 왼쪽으로 물러나 작아지고, 결과가 자리를 넓게 씁니다.
 *            사라지지는 않습니다. 스크롤을 내려도 따라오며 계속 말을 겁니다.
 *
 * 두 국면 사이를 레이아웃 애니메이션으로 잇습니다. 화면이 갈아 끼워지는 게
 * 아니라 꿀비가 걸어서 옮겨 가는 것처럼 보여야 합니다.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import BentoGrid from '@/components/BentoGrid';
import BeeStage from '@/components/BeeStage';
import TopBar from '@/components/TopBar';
import type { CharacterMotion, ChatResponse } from '@/lib/types';

const SAMPLES = [
  { icon: '📍', text: '연남동에서 카페 열려는데 상권 어때?', hint: '입지' },
  { icon: '💰', text: '창업자금 5천만원 대출 알아보고 있어요', hint: '자금' },
  { icon: '🛡️', text: '대출 설명을 제대로 못 들었는데 이의제기 되나요?', hint: '권리' },
  { icon: '🐝', text: '성수동 자리도 보고 자금도 같이 알아봐줘', hint: '한번에' },
];

const AGENT_LABEL: Record<string, string> = {
  router: '길잡이', location: '상권 분석', policy: '자금 매칭',
  protection: '소비자 보호', guardrail: '금소법 검사',
};

const GREETING = '안녕하세요 사장님! 무엇이 궁금하세요?';

export default function Page() {
  const [input, setInput] = useState('');
  const [res, setRes] = useState<ChatResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mood, setMood] = useState<CharacterMotion>('fly_happy');
  const [speech, setSpeech] = useState(GREETING);
  const resultRef = useRef<HTMLDivElement>(null);

  const hero = !res && !loading;

  const ask = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    setLoading(true);
    setError('');
    setMood('thinking');
    setSpeech('잠깐만요, 자료를 살펴볼게요…');
    try {
      const r = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, session_id: res?.session_id ?? null }),
      });
      if (!r.ok) throw new Error(`서버가 ${r.status}로 응답했습니다`);
      const data: ChatResponse = await r.json();
      setRes(data);
      setMood(data.character_motion);
      setSpeech(summarize(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결하지 못했습니다');
      setMood('explaining');
      setSpeech('앗, 서버에 닿질 않네요.');
    } finally {
      setLoading(false);
    }
  }, [loading, res?.session_id]);

  useEffect(() => {
    if (res && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [res]);

  return (
    <LayoutGroup>
      <TopBar />
      <main className="mx-auto min-h-screen max-w-[1240px] px-5 pb-24 lg:px-8">
        {/* ── ① 히어로 — 꿀비가 화면을 차지합니다 ── */}
        <AnimatePresence mode="wait">
          {hero && (
            <motion.section
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center
                         justify-center py-4"
            >
              {/* 꿀비가 먼저 눈에 들어와야 합니다. 캔버스 안에서 실제 몸이
                  차지하는 넓이가 6할쯤이라, 보이는 크기를 맞추려면 320은
                  되어야 합니다. 260이면 제목에 눌려 장식처럼 보였습니다. */}
              <motion.div layoutId="bee" transition={SPRING} className="-mb-2">
                <BeeStage motion={mood} size={296} speech={speech} />
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="text-center text-[32px] font-extrabold leading-[1.18]
                           tracking-[-.02em] text-white sm:text-[44px]"
              >
                어디에 열지, 자금은 어떻게,<br />
                <span className="text-kb-yellow">억울한 일이 생기면 어떻게.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.22 }}
                className="mt-3.5 max-w-[58ch] text-center text-[14.5px] leading-[1.7]
                           text-white/[.62]"
              >
                제도 이름을 몰라도 괜찮습니다. 처한 상황을 그대로 말씀하시면
                실제 자료에서 찾아 드리고, 무엇이 그 결론을 만들었는지까지 보여 드려요.
              </motion.p>

              <motion.div
                layoutId="askbox" transition={SPRING}
                className="mt-7 w-full max-w-[660px]"
              >
                <AskBox value={input} onChange={setInput}
                        onSubmit={() => { ask(input); setInput(''); }} loading={loading} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.34 }}
                className="mt-4 grid w-full max-w-[660px] grid-cols-1 gap-2.5 sm:grid-cols-2"
              >
                {SAMPLES.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => ask(s.text)}
                    className="group flex items-center gap-3 rounded-xl bg-white/[.05] px-4
                               py-3.5 text-left ring-1 ring-white/[.10] transition
                               hover:-translate-y-px hover:bg-kb-yellow/[.12]
                               hover:ring-kb-yellow/[.35]"
                  >
                    <span className="text-[17px]">{s.icon}</span>
                    {/* 잘라 내지 않습니다. "…이의" 로 끝나면 무엇을 묻는
                        예시인지 알 수 없어 눌러 볼 이유가 사라집니다. */}
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-white/[.8]
                                     group-hover:text-white">
                      {s.text}
                    </span>
                    <span className="shrink-0 rounded-md bg-white/[.06] px-1.5 py-0.5
                                     text-[10px] font-bold text-white/[.4]
                                     group-hover:bg-kb-yellow/20 group-hover:text-kb-yellow">
                      {s.hint}
                    </span>
                  </button>
                ))}
              </motion.div>

              {/* 신뢰 띠 — 'Pick 2·3·4' 같은 대회 용어를 적어 두었었는데,
                  사장님께는 아무 뜻이 없고 심사위원께는 이미 아는 말입니다.
                  대신 이 서비스가 무엇을 딛고 서 있는지를 숫자로 놓습니다. */}
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.42 }}
                className="mt-7 grid w-full max-w-[660px] grid-cols-3 gap-px overflow-hidden
                           rounded-2xl bg-white/[.07] ring-1 ring-white/[.08]"
              >
                {[
                  ['272만', '전국 점포 실측', '소상공인시장진흥공단'],
                  ['900건', '정부 지원사업 공고', '중소벤처기업부 기업마당'],
                  ['3,450', '행정동 백분위 비교', '전국 어디든'],
                ].map(([n, l, s2]) => (
                  <div key={l} className="bg-kb-ink/60 px-3 py-4 text-center">
                    <p className="text-[19px] font-extrabold tracking-tight text-kb-yellow">{n}</p>
                    <p className="mt-1 text-[11.5px] font-medium text-white/[.72]">{l}</p>
                    <p className="mt-0.5 text-[10px] text-white/[.32]">{s2}</p>
                  </div>
                ))}
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── ② 결과 — 꿀비가 옆으로 물러나 동행합니다 ── */}
        {!hero && (
          <div className="grid gap-6 pt-6 lg:grid-cols-[272px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-[4.5rem] lg:self-start">
              <div className="surface-2 flex flex-col items-center px-4 pb-5 pt-4">
                <motion.div layoutId="bee" transition={SPRING}>
                  <BeeStage motion={mood} size={132} speech={speech} />
                </motion.div>
                <button
                  onClick={() => { setRes(null); setMood('fly_happy'); setSpeech(GREETING); }}
                  className="mt-4 w-full rounded-lg bg-white/[.06] py-2 text-[11.5px]
                             text-white/[.55] transition hover:bg-white/[.11] hover:text-white"
                >
                  처음으로
                </button>
              </div>

              {res && <AgentTrace res={res} />}
            </aside>

            <section className="min-w-0">
              <motion.div layoutId="askbox" transition={SPRING}>
                <AskBox value={input} onChange={setInput}
                        onSubmit={() => { ask(input); setInput(''); }} loading={loading} />
              </motion.div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 ring-1 ring-rose-400/25"
                  >
                    <p className="text-[12.5px] text-rose-200">{error}</p>
                    <p className="mt-1 text-[11.5px] text-rose-200/60">
                      백엔드를 먼저 실행하세요 —{' '}
                      <code className="font-mono">uvicorn app.main:app --port 8000</code>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {loading && <Thinking />}

              <div ref={resultRef}>
                {res && !loading && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="mt-6 space-y-5"
                  >
                    <Answer text={res.answer} elapsed={res.elapsed_ms} />
                    <BentoGrid cards={res.cards} />
                  </motion.div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </LayoutGroup>
  );
}

const SPRING = { type: 'spring' as const, stiffness: 220, damping: 26 };

/** 꿀비가 말풍선에 띄울 한 줄. 길면 말풍선이 화면을 잡아먹습니다. */
function summarize(d: ChatResponse): string {
  if (d.location) {
    const g = d.location.grade;
    return g === 'S' || g === 'A'
      ? `${d.location.total_score}점이면 좋은 자리예요!`
      : `${d.location.total_score}점이에요. 아래에서 이유를 볼까요?`;
  }
  if (d.policies.length) return `맞는 지원사업 ${d.policies.length}건을 찾았어요!`;
  if (d.protection) return '절차를 4단계로 정리해 뒀어요.';
  return '이렇게 도와드릴 수 있어요.';
}

/* ── 입력 ──────────────────────────────────────────────────────────────── */
function AskBox({ value, onChange, onSubmit, loading }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; loading: boolean;
}) {
  return (
    <div className="surface-3 flex items-center gap-2 p-2 transition
                    focus-within:ring-kb-yellow/[.45]">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmit(); }}
        placeholder="꿀비에게 물어보세요"
        disabled={loading}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[14.5px] text-white
                   placeholder:text-white/[.38] focus:outline-none disabled:opacity-50"
      />
      <button
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="shrink-0 rounded-xl bg-kb-yellow px-5 py-3 text-[13.5px] font-bold
                   text-kb-ink transition hover:brightness-105 active:translate-y-px
                   disabled:cursor-not-allowed disabled:opacity-[.35]"
      >
        {loading ? '생각 중…' : '물어보기'}
      </button>
    </div>
  );
}

function Thinking() {
  return (
    <div className="mt-6 space-y-3">
      <div className="glass h-[84px] animate-pulse" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="glass h-[176px] animate-pulse" />
        <div className="glass h-[176px] animate-pulse md:col-span-2" />
      </div>
    </div>
  );
}

/* ── 답 ────────────────────────────────────────────────────────────────── */
function Answer({ text, elapsed }: { text: string; elapsed: number }) {
  const [body, ...notes] = text.split('\n\n· ');
  return (
    <div className="surface-2 p-5 sm:p-6">
      <div className="space-y-2.5">
        {body.split('\n').filter(Boolean).map((line, i) => (
          <p key={i} className="text-[14.5px] leading-[1.8] text-white/[.9]">{line}</p>
        ))}
      </div>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-white/[.07] pt-3">
          {notes.map((n, i) => (
            <li key={i} className="text-[11px] leading-relaxed text-white/[.35]">· {n}</li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-right text-[10.5px] text-white/[.25]">
        {elapsed}ms 만에 답했어요
      </p>
    </div>
  );
}

/* ── 어느 에이전트가 돌았는지 ──────────────────────────────────────────── */
function AgentTrace({ res }: { res: ChatResponse }) {
  return (
    <div className="surface-1 mt-4 p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/[.4]">
        거쳐 간 에이전트
      </p>
      <ol className="mt-2.5 space-y-1.5">
        {res.agent_trace.map((a, i) => (
          <li key={`${a}-${i}`} className="flex items-center gap-2 text-[12px]">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full
                             bg-kb-yellow/20 text-[9px] font-bold text-kb-yellow">
              {i + 1}
            </span>
            <span className={a === 'guardrail' ? 'text-rose-200/80' : 'text-white/[.65]'}>
              {AGENT_LABEL[a] ?? a}
            </span>
          </li>
        ))}
      </ol>
      {res.guardrail && (
        <p className={`mt-3 rounded-lg px-2.5 py-2 text-[11px] leading-snug ${
          res.guardrail.passed
            ? 'bg-emerald-400/10 text-emerald-200/75'
            : 'bg-rose-400/10 text-rose-200/80'}`}>
          {res.guardrail.passed
            ? '금소법 위반 표현 없음'
            : `단정 표현 ${res.guardrail.violations.length}건을 고쳐 내보냈습니다`}
        </p>
      )}
    </div>
  );
}
