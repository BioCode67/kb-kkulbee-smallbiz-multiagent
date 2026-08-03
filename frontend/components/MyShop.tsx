'use client';

/**
 * 내 가게 등록 — 한 번 알려주시면 매번 안 물어봅니다.
 *
 * 지금까지는 질문마다 "연남동에서 카페…"를 다시 말해야 했습니다. 상담소에
 * 갈 때마다 이름부터 다시 대는 셈입니다. 가게(동네·업종)를 한 번 등록하면
 * 이후 모든 질문에 자동으로 붙습니다 — "요즘 손님이 없어요"만 해도
 * 연남동 카페 기준으로 답이 옵니다.
 *
 * 저장은 이 브라우저(localStorage)에만 합니다. 서버로는 질문할 때
 * region/industry 필드로만 나가고, 계정도 개인정보도 없습니다.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface ShopProfile { region: string; industry: string }
const KEY = 'kkulbee:myshop';

export function loadShop(): ShopProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as ShopProfile : null;
  } catch { return null; }
}

export default function MyShop({ onChange }: {
  onChange: (p: ShopProfile | null) => void;
}) {
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState('');
  const [industry, setIndustry] = useState('');
  const [industries, setIndustries] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    const s = loadShop();
    setShop(s); onChange(s);
    if (s) { setRegion(s.region); setIndustry(s.industry); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open || industries.length) return;
    fetch('/api/v1/industries').then((r) => r.json())
      .then((d) => setIndustries((d.items ?? []).slice(0, 24))).catch(() => {});
  }, [open, industries.length]);

  const save = () => {
    const p = region.trim() ? { region: region.trim(), industry: industry.trim() } : null;
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
    setShop(p); onChange(p); setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-kb-ink/[.14]
                   bg-white px-3 py-1.5 text-[14px] font-semibold text-kb-ink/80
                   transition hover:border-kb-yellow hover:text-kb-ink"
        title="내 가게를 등록하면 매번 동네·업종을 말하지 않아도 됩니다"
      >
        {shop ? `${shop.region.split(' ').pop()}${shop.industry ? ` · ${shop.industry}` : ''}`
                 : '내 가게 등록'}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={{ opacity: 0 }} onClick={() => setOpen(false)}
              className="fixed inset-0 z-[80] bg-kb-ink/30 backdrop-blur-[2px]" />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: .97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="fixed left-1/2 top-1/2 z-[90] w-[min(440px,92vw)]
                         -translate-x-1/2 -translate-y-1/2 rounded-2xl border
                         border-kb-ink/[.12] bg-white p-5 shadow-2xl"
            >
              <p className="text-[18px] font-bold text-kb-ink">내 가게 등록</p>
              <p className="mt-1 text-[14px] leading-relaxed text-kb-ink/72">
                한 번 알려주시면 매번 동네·업종을 말하지 않아도 돼요.
                이 브라우저에만 저장되고, 개인정보는 받지 않습니다.
              </p>

              <label className="mt-4 block text-[13.5px] font-semibold text-kb-ink/78">
                가게가 있는(열려는) 동네
              </label>
              <input value={region} onChange={(e) => setRegion(e.target.value)}
                placeholder="예) 서울 마포구 연남동, 부산 서면"
                className="mt-1 w-full rounded-xl border border-kb-ink/[.14] bg-white
                           px-3 py-2.5 text-[15.5px] text-kb-ink
                           placeholder:text-kb-ink/50 focus:border-kb-yellow
                           focus:outline-none" />

              <label className="mt-3 block text-[13.5px] font-semibold text-kb-ink/78">
                업종
              </label>
              <input value={industry} onChange={(e) => setIndustry(e.target.value)}
                placeholder="예) 카페, 치킨집, 미용실"
                className="mt-1 w-full rounded-xl border border-kb-ink/[.14] bg-white
                           px-3 py-2.5 text-[15.5px] text-kb-ink
                           placeholder:text-kb-ink/50 focus:border-kb-yellow
                           focus:outline-none" />
              {industries.length > 0 && (
                <div className="mt-2 flex max-h-[76px] flex-wrap gap-1 overflow-y-auto">
                  {industries.map((i) => (
                    <button key={i.code} onClick={() => setIndustry(i.name)}
                      className="rounded-full border border-kb-ink/[.1] px-2 py-0.5
                                 text-[12.5px] text-kb-ink/78 hover:border-kb-yellow
                                 hover:text-kb-ink">
                      {i.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 flex gap-2">
                {shop && (
                  <button onClick={() => { setRegion(''); setIndustry(''); }}
                    className="rounded-xl border border-kb-ink/[.14] px-4 py-2.5
                               text-[15px] text-kb-ink/78 hover:text-kb-ink">
                    지우기
                  </button>
                )}
                <button onClick={save}
                  className="flex-1 rounded-xl bg-kb-yellow py-2.5 text-[15.5px]
                             font-bold text-kb-ink hover:brightness-105">
                  저장
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
