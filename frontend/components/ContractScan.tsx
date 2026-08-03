'use client';

/**
 * 계약서 신호등 — 지는 계약은 서명 전에 결정됩니다.
 *
 * 계약서 문구를 붙여넣으면 임대차·프랜차이즈에서 반복되는 독소조항
 * 10유형을 규칙으로 찾아, 걸린 문구를 빨간 펜으로 짚고 근거 법과
 * '서명 전 팁'을 붙입니다. 패턴이 실제 문장에 있어야만 알립니다.
 */

import { useCallback, useState } from 'react';

interface Finding {
  name: string; level: 'danger' | 'warn';
  snippet: string; matched: string; after: string;
  why: string; law: string; tip: string;
}
interface Scan {
  ok: boolean; reason?: string; danger: number; warn: number;
  findings: Finding[]; note: string; clean: boolean;
}

const SAMPLE = `제5조(권리금) 임차인은 본 계약과 관련하여 권리금을 일체 주장하지 않는다.
제7조(차임) 차임은 경제 사정 변동 시 임대인이 임의로 인상할 수 있다.
제9조(계약기간) 기간 만료 1개월 전까지 이의가 없으면 본 계약은 자동 연장된다.
제12조(원상복구) 임차인은 퇴거 시 임대인이 요구하는 일체의 원상복구를 이행한다.`;

export default function ContractScan() {
  const [text, setText] = useState('');
  const [r, setR] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);

  // 계약서 PDF를 그대로 받습니다 — 최신 pdf.js를 브라우저에서 돌려
  // 텍스트를 뽑으므로 파일이 서버로 올라가지 않습니다(계약서는 민감
  // 문서입니다). 스캔 이미지 PDF는 글자가 없어 정직하게 안내만 합니다.
  const [fileBusy, setFileBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const fromFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF 파일만 읽을 수 있습니다. 한글(.hwp)은 PDF로 저장해 주세요.');
      return;
    }
    setFileBusy(true);
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        text += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
      }
      const body = text.replace(/\s+/g, ' ').trim();
      if (body.length < 30) {
        alert('이 PDF에서 글자를 찾지 못했습니다 — 스캔 이미지본인 것 같습니다. 문구를 직접 붙여넣어 주세요.');
        return;
      }
      setText(body.slice(0, 20000));
      await run(body.slice(0, 20000));
    } catch {
      alert('PDF를 읽지 못했습니다. 문구를 직접 붙여넣어 주세요.');
    } finally { setFileBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (t?: string) => {
    const body = (t ?? text).trim();
    if (!body || busy) return;
    if (t) setText(t);
    setBusy(true);
    try {
      const res = await fetch('/api/v1/contract-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body }),
      });
      setR(await res.json());
    } catch { setR(null); } finally { setBusy(false); }
  };

  return (
    <section className="mt-8 w-full max-w-[1240px] rounded-2xl border-2
                        border-rose-300/70 bg-white p-6
                        shadow-[0_20px_50px_-20px_rgba(190,74,90,.35)]">
      <h2 className="font-display text-[24px] text-kb-ink">
        계약서 신호등 <span className="text-rose-600">— 서명하기 전에 확인하세요</span>
      </h2>
      <p className="mt-1 text-[14.5px] text-kb-ink/70">
        임대차·프랜차이즈 계약서 문구를 붙여넣으면, 사장님께 불리한 조항
        10유형을 찾아 <b>근거 법과 함께</b> 짚어 드립니다.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) fromFile(f);
        }}
        className={`mt-4 rounded-xl transition ${drag
          ? 'ring-2 ring-rose-400 bg-rose-500/[.04]' : ''}`}
      >
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
          placeholder={fileBusy
            ? 'PDF에서 계약 문구를 읽는 중입니다…'
            : '계약서 문구를 붙여넣거나, 계약서 PDF 파일을 이 칸에 끌어다 놓아 보세요'}
          className="w-full resize-y rounded-xl bg-kb-ink/[.03] p-4 text-[14.5px]
                     leading-relaxed text-kb-ink ring-1 ring-kb-ink/[.14]
                     placeholder:text-kb-ink/40 focus:outline-none
                     focus:ring-2 focus:ring-rose-300" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <button onClick={() => run()} disabled={busy || !text.trim()}
          className="rounded-xl bg-rose-500 px-6 py-2.5 text-[15px] font-bold
                     text-white shadow-sm transition hover:brightness-105
                     disabled:opacity-40">
          {busy ? '검사 중…' : '독소조항 검사하기'}
        </button>
        <label className="cursor-pointer rounded-xl px-4 py-2.5 text-[13.5px]
                          font-semibold text-kb-ink/62 ring-1 ring-kb-ink/[.14]
                          hover:text-kb-ink">
          PDF 파일로 검사
          <input type="file" accept=".pdf" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) fromFile(f);
              e.target.value = '';
            }} />
        </label>
        <button onClick={() => run(SAMPLE)}
          className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold
                     text-kb-ink/62 ring-1 ring-kb-ink/[.14] hover:text-kb-ink">
          예시 계약서로 해보기
        </button>
      </div>

      {r && !r.ok && (
        <p className="mt-4 rounded-xl bg-kb-ink/[.05] px-4 py-3 text-[14px]
                      text-kb-ink/70">{r.reason}</p>
      )}

      {r?.ok && (
        <div className="mt-5">
          <p className={`rounded-xl px-4 py-3 text-[15.5px] font-bold ${r.clean
            ? 'bg-emerald-500/[.12] text-emerald-700'
            : 'bg-rose-500/[.1] text-rose-700'}`}>
            {r.clean
              ? '✓ 등록된 위험 유형 10가지는 보이지 않습니다 — 그래도 서명 전 전문 상담을 권합니다'
              : `🚨 위험 ${r.danger}건 · ⚠️ 주의 ${r.warn}건 — 서명 전에 꼭 짚고 넘어가세요`}
          </p>

          <ul className="mt-3 space-y-3">
            {r.findings.map((f, i) => (
              <li key={i} className={`rounded-xl p-4 ring-1 ${f.level === 'danger'
                ? 'bg-rose-500/[.05] ring-rose-300/50'
                : 'bg-amber-400/[.08] ring-amber-400/40'}`}>
                <p className="text-[15.5px] font-bold text-kb-ink">
                  {f.level === 'danger' ? '🚨' : '⚠️'} {f.name}
                </p>
                <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[13.5px]
                              leading-relaxed text-kb-ink/80 ring-1 ring-kb-ink/[.08]">
                  {f.snippet}
                  <mark className="rounded bg-rose-500/[.15] px-1 font-bold
                                   text-rose-700 underline decoration-rose-400
                                   decoration-wavy underline-offset-4">
                    {f.matched}
                  </mark>
                  {f.after}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-kb-ink/85">
                  {f.why}
                </p>
                <p className="mt-1.5 text-[12.5px] text-kb-ink/60">근거: {f.law}</p>
                <p className="mt-2 rounded-lg bg-white/85 px-3 py-2 text-[13.5px]
                              font-medium text-kb-ink/85 ring-1 ring-kb-ink/[.06]">
                  {f.tip}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-3 rounded-lg bg-kb-ink/[.04] px-3 py-2.5 text-[12.5px]
                        leading-relaxed text-kb-ink/60">
            {r.note}
          </p>
        </div>
      )}
    </section>
  );
}
