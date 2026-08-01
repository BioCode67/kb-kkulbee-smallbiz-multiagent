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

/**
 * 다섯 가지 도움 — 첫 화면의 선택 배너.
 *
 * 빈 입력창 하나만 두면 "무엇을 물어도 되는지"를 사용자가 알아내야 합니다.
 * 할 수 있는 일을 다섯 갈래로 펼쳐 두고, 하나를 고르면 그 갈래의 예시
 * 질문이 바뀝니다. 고르는 행위 자체가 서비스의 범위를 가르쳐 줍니다.
 */
const MODES = [
  {
    key: 'location', icon: 'pin', label: '입지 진단',
    desc: '이 자리, 괜찮을까',
    placeholder: '동네와 업종을 말씀해 주세요 — 예) 연남동 카페',
    samples: [
      '연남동에서 카페 열려는데 상권 어때?',
      '성수동 술집 자리 괜찮아?',
      '부전동에서 미용실 하려는데 경쟁 심해?',
    ],
  },
  {
    key: 'gap', icon: 'compass', label: '기회 업종',
    desc: '여기엔 뭐가 부족할까',
    placeholder: '동네를 말씀해 주세요 — 무엇이 비어 있는지 찾아봅니다',
    samples: [
      '연남동에 어떤 업종이 부족해?',
      '역삼동 상권에 빈 자리가 있을까?',
      '우리 동네에서 뭘 하면 좋을까? 제주시 연동이야',
    ],
  },
  {
    key: 'policy', icon: 'coin', label: '자금 찾기',
    desc: '정책자금·지원사업',
    placeholder: '상황을 그대로 말씀하세요 — 제도 이름은 몰라도 됩니다',
    samples: [
      '장사가 안돼서 운영자금이 급해요',
      '창업자금 5천만원 대출 알아보고 있어요',
      '가게 인테리어 고치는 데 지원되는 게 있나요?',
    ],
  },
  {
    key: 'protection', icon: 'shield', label: '권리 지키기',
    desc: '분쟁·부당한 일',
    placeholder: '겪으신 일을 말씀해 주세요 — 절차와 근거 규정을 찾아 드립니다',
    samples: [
      '대출 설명을 제대로 못 들었는데 이의제기 되나요?',
      '미리 갚는데 왜 수수료를 떼나요?',
      '연체됐는데 독촉 전화가 너무 심해요',
    ],
  },
  {
    key: 'all', icon: 'bee', label: '한 번에',
    desc: '자리도 돈도 같이',
    placeholder: '여러 가지를 한 문장에 물어보셔도 됩니다',
    samples: [
      '성수동 자리도 보고 자금도 같이 알아봐줘',
      '연남동에서 빵집 열 건데 상권이랑 지원사업 다 알려줘',
      '홍대에서 치킨집, 자리 경쟁이랑 창업자금 어때?',
    ],
  },
];

/** 배너 아이콘 — 이모지는 기기 글꼴에 따라 네모로 나오므로 SVG로 그립니다. */
function ModeIcon({ name, on }: { name: string; on: boolean }) {
  const c = on ? '#FFBC00' : 'rgba(255,255,255,.55)';
  const p = { fill: 'none', stroke: c, strokeWidth: 1.8,
              strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      {name === 'pin' && (<>
        <path {...p} d="M12 21s-6.5-5.4-6.5-10a6.5 6.5 0 1 1 13 0c0 4.6-6.5 10-6.5 10Z" />
        <circle {...p} cx="12" cy="10.5" r="2.4" />
      </>)}
      {name === 'compass' && (<>
        <circle {...p} cx="12" cy="12" r="8.5" />
        <path fill={c} d="m14.8 9.2-1.9 4.4-4.4 1.9 1.9-4.4z" />
      </>)}
      {name === 'coin' && (<>
        <circle {...p} cx="12" cy="12" r="8.5" />
        <path {...p} d="M12 7.5v9M9.2 9.8c.6-.9 1.6-1.4 2.8-1.4 1.7 0 2.9.8 2.9 2s-1 1.7-2.9 2.1c-1.9.4-2.9 1-2.9 2.1s1.2 2 2.9 2c1.2 0 2.2-.5 2.8-1.4" />
      </>)}
      {name === 'shield' && (<>
        <path {...p} d="M12 3.5 5 6v5.2c0 4.3 2.9 7.6 7 9.3 4.1-1.7 7-5 7-9.3V6Z" />
        <path {...p} d="m8.8 12 2.2 2.2 4.2-4.4" />
      </>)}
      {name === 'bee' && (<>
        <ellipse {...p} cx="12" cy="13.5" rx="5.2" ry="6" />
        <path {...p} d="M8.6 11.4h6.8M8.4 14h7.2M9 16.5h6M9.5 8.2 8 5.6M14.5 8.2 16 5.6" />
        <path {...p} d="M6.8 12.5C4.6 12 3.4 10.6 3.8 9.3c.4-1.2 2.2-1.4 3.9-.3M17.2 12.5c2.2-.5 3.4-1.9 3-3.2-.4-1.2-2.2-1.4-3.9-.3" />
      </>)}
    </svg>
  );
}

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
  const [mode, setMode] = useState(0);
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
              className="hero-glow flex min-h-[calc(100vh-3.5rem)] flex-col
                         items-center justify-center py-4"
            >
              {/* 배지 필 — 화면이 무엇인지 한 줄. 헤드라인보다 먼저 읽히는
                  가장 작은 활자입니다. */}
              <motion.span
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="mb-1 inline-flex items-center gap-1.5 rounded-full
                           border border-kb-yellow/[.25] bg-kb-yellow/[.07] px-3.5
                           py-1.5 text-[11.5px] font-medium text-kb-yellow/90"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-kb-yellow" />
                실측 자료로만 답하는 소상공인 AI 비서
              </motion.span>
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

              {/* ── 다섯 가지 도움 — 선택 배너 ── */}
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="mt-7 grid w-full max-w-[760px] grid-cols-5 gap-2"
              >
                {MODES.map((m, i) => {
                  const on = i === mode;
                  return (
                    <button
                      key={m.key}
                      onClick={() => setMode(i)}
                      aria-pressed={on}
                      className={`group flex flex-col items-center gap-1 rounded-2xl px-2
                                  pb-3 pt-3.5 ring-1 transition-all duration-200 ${
                        on
                          ? 'bg-kb-yellow/[.1] ring-kb-yellow/[.45] shadow-[0_10px_30px_-10px_rgba(255,188,0,.3)]'
                          : 'bg-white/[.025] ring-white/[.07] hover:-translate-y-0.5 hover:bg-white/[.05] hover:ring-white/[.14]'}`}
                    >
                      <span className={`transition-transform duration-200 ${
                        on ? 'scale-110' : 'group-hover:scale-105'}`}>
                        <ModeIcon name={m.icon} on={on} />
                      </span>
                      <span className={`text-[12.5px] font-bold ${
                        on ? 'text-kb-yellow' : 'text-white/[.78]'}`}>
                        {m.label}
                      </span>
                      <span className={`hidden text-[10.5px] sm:block ${
                        on ? 'text-white/60' : 'text-white/[.32]'}`}>
                        {m.desc}
                      </span>
                    </button>
                  );
                })}
              </motion.div>

              <motion.div
                layoutId="askbox" transition={SPRING}
                className="mt-4 w-full max-w-[760px]"
              >
                <AskBox value={input} onChange={setInput}
                        placeholder={MODES[mode].placeholder}
                        onSubmit={() => { ask(input); setInput(''); }} loading={loading} />
              </motion.div>

              {/* 고른 갈래의 예시 질문. 갈래를 바꾸면 예시도 바뀝니다 —
                  "이런 것도 물을 수 있구나"를 예시가 가르칩니다. */}
              <motion.div
                key={MODES[mode].key}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="mt-3 flex w-full max-w-[760px] flex-col gap-2"
              >
                {MODES[mode].samples.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    className="group flex items-center gap-2.5 rounded-xl bg-white/[.04]
                               px-4 py-2.5 text-left ring-1 ring-white/[.07] transition
                               hover:bg-kb-yellow/[.09] hover:ring-kb-yellow/[.3]"
                  >
                    <span className="text-[12px] text-kb-yellow/50 transition
                                     group-hover:text-kb-yellow">→</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug
                                     text-white/[.72] group-hover:text-white">
                      {q}
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
                    <Answer res={res} />
                    <BentoGrid cards={res.cards} />

                    {/* 다음 걸음 — 상담은 한 번의 답으로 끝나지 않습니다.
                        세션이 맥락을 기억하므로 누르기만 하면 이어집니다. */}
                    {res.suggestions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11.5px] text-white/35">이어서 물어보기</span>
                        {res.suggestions.map((q) => (
                          <button
                            key={q}
                            onClick={() => ask(q)}
                            className="rounded-full bg-kb-yellow/[.09] px-3.5 py-1.5
                                       text-[12.5px] text-kb-yellow/90 ring-1
                                       ring-kb-yellow/[.28] transition
                                       hover:bg-kb-yellow/[.18] hover:text-kb-yellow"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
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
function AskBox({ value, onChange, onSubmit, loading, placeholder }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void;
  loading: boolean; placeholder?: string;
}) {
  return (
    <div className="surface-3 flex items-center gap-2 p-2 transition
                    focus-within:ring-kb-yellow/[.45]">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSubmit(); }}
        placeholder={placeholder ?? '꿀비에게 물어보세요'}
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

/**
 * 기다리는 동안 무엇을 하고 있는지 보여 줍니다.
 *
 * 회색 상자를 깜빡이는 스켈레톤은 "곧 뭔가 나온다"는 것 말고는 아무것도
 * 말해 주지 않습니다. 이 서비스는 에이전트 넷이 실제로 순서대로 도는데,
 * 그 사실이 기다림의 이유가 됩니다. 2~3초가 '느리다'가 아니라 '자료를
 * 뒤지는 중'으로 읽힙니다.
 *
 * 진행 시각은 실제 소요 시간에 맞춰 두었습니다 — 규칙 라우팅 20ms,
 * 상권·자금 검색 수십 ms, 문장 생성이 대부분(1~3초)입니다.
 */
const STEPS = [
  { at: 0, label: '질문을 읽는 중', hint: '어느 갈래인지, 어느 동네·업종인지' },
  { at: 350, label: '실측 자료를 뒤지는 중', hint: '점포 272만 개 · 공고 900건' },
  { at: 1100, label: '근거를 정리하는 중', hint: '무엇이 그 결론을 만들었는지' },
  { at: 1900, label: '금소법 검사 중', hint: '나가는 문장은 예외 없이 거칩니다' },
];

function Thinking() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => setMs(performance.now() - t0), 120);
    return () => clearInterval(id);
  }, []);

  const done = STEPS.filter((s) => ms >= s.at).length;

  return (
    <div className="surface-1 mt-6 p-5">
      <ol className="space-y-3">
        {STEPS.map((s, i) => {
          const state = i < done - 1 ? 'done' : i === done - 1 ? 'now' : 'wait';
          return (
            <li key={s.label} className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center
                                rounded-full text-[10px] font-bold transition-colors ${
                state === 'done' ? 'bg-kb-yellow/20 text-kb-yellow'
                : state === 'now' ? 'bg-kb-yellow text-kb-ink'
                : 'bg-white/[.07] text-white/25'}`}>
                {state === 'done' ? '✓' : i + 1}
              </span>
              <div className="min-w-0">
                <p className={`text-[13px] font-medium transition-colors ${
                  state === 'wait' ? 'text-white/25' : 'text-white/85'}`}>
                  {s.label}
                  {state === 'now' && (
                    <span className="ml-1.5 inline-flex gap-0.5 align-middle">
                      {[0, 1, 2].map((d) => (
                        <i key={d}
                           className="h-1 w-1 animate-bounce rounded-full bg-kb-yellow"
                           style={{ animationDelay: `${d * 0.13}s` }} />
                      ))}
                    </span>
                  )}
                </p>
                <p className={`mt-0.5 text-[11px] transition-colors ${
                  state === 'wait' ? 'text-white/15' : 'text-white/40'}`}>
                  {s.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── 답 ────────────────────────────────────────────────────────────────── */
const INTENT_KO: Record<string, string> = { location: '상권', policy: '자금', protection: '권리', general: '안내' };

function Answer({ res }: { res: ChatResponse }) {
  const { answer: text, elapsed_ms: elapsed, understood } = res;
  const [body, ...notes] = text.split('\n\n· ');
  return (
    <div className="surface-2 p-5 sm:p-6">
      {/* 서버가 어떻게 알아들었는지. 조용히 틀린 답을 주는 것이 가장 나쁩니다 —
          "성수2가3동 · 요리 주점"이라고 보여 주면 잘못 알아들었을 때 바로
          바로잡을 수 있습니다. */}
      {(understood?.region || understood?.industry) && (
        <div className="mb-3.5 flex flex-wrap items-center gap-1.5 border-b
                        border-white/[.06] pb-3">
          <span className="text-[10.5px] text-white/30">이렇게 알아들었어요</span>
          {understood.region && (
            <span className="rounded-md bg-white/[.07] px-2 py-0.5 text-[11.5px]
                             font-medium text-white/75">📍 {understood.region}</span>
          )}
          {understood.industry && (
            <span className="rounded-md bg-white/[.07] px-2 py-0.5 text-[11.5px]
                             font-medium text-white/75">{understood.industry}</span>
          )}
          {(understood.intents ?? []).map((i) => (
            <span key={i} className="rounded-md bg-kb-yellow/[.12] px-2 py-0.5
                                     text-[11px] font-semibold text-kb-yellow/90">
              {INTENT_KO[i] ?? i}
            </span>
          ))}
        </div>
      )}
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

/* ── 어느 에이전트가 돌았는지 ──────────────────────────────────────────
 *
 * 멀티에이전트라고 적어 두는 것과, 어느 에이전트가 실제로 돌았는지 보여
 * 주는 것은 다릅니다. 질문마다 켜지는 갈래가 달라지므로 이 목록도 매번
 * 달라집니다 — 그 변화가 "정말 라우팅이 되는가"에 대한 답입니다.
 */
function AgentTrace({ res }: { res: ChatResponse }) {
  return (
    <div className="surface-1 mt-4 p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-white/[.4]">
        거쳐 간 에이전트
      </p>

      <ol className="relative mt-3 space-y-0">
        {/* 세로줄 — 순서대로 흘렀다는 것이 선 하나로 읽힙니다 */}
        <span aria-hidden
              className="absolute left-[9px] top-2 bottom-4 w-px bg-white/[.12]" />
        {res.agent_trace.map((a, i) => (
          <li key={`${a}-${i}`} className="relative flex items-center gap-2.5 py-1.5">
            <span className={`z-10 grid h-[19px] w-[19px] shrink-0 place-items-center
                              rounded-full text-[9.5px] font-bold ring-2 ring-kb-ink ${
              a === 'guardrail'
                ? 'bg-rose-400/25 text-rose-200'
                : 'bg-kb-yellow/25 text-kb-yellow'}`}>
              {i + 1}
            </span>
            <span className={`text-[12.5px] ${
              a === 'guardrail' ? 'text-rose-200/85' : 'text-white/[.75]'}`}>
              {AGENT_LABEL[a] ?? a}
            </span>
          </li>
        ))}
      </ol>

      {res.guardrail && (
        <p className={`mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2
                       text-[11px] leading-snug ${
          res.guardrail.passed
            ? 'bg-emerald-400/10 text-emerald-200/80'
            : 'bg-rose-400/10 text-rose-200/85'}`}>
          <span className="mt-px">{res.guardrail.passed ? '✓' : '!'}</span>
          {res.guardrail.passed
            ? '금소법 위반 표현 없음'
            : `단정 표현 ${res.guardrail.violations.length}건을 고쳐 내보냈습니다`}
        </p>
      )}

      <p className="mt-2.5 text-right text-[10px] text-white/25">
        {res.elapsed_ms}ms
      </p>
    </div>
  );
}
