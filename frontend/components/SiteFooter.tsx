/**
 * 푸터 — 신뢰 정보가 사는 곳.
 *
 * 화면 곳곳에 흩어져 있던 것들(어느 자료로 계산하는지, 무엇을 보장하지
 * 않는지, 코드가 어디 있는지)을 한 자리에 모읍니다. 서비스의 마지막
 * 문장은 광고가 아니라 고지여야 합니다.
 */

const DATA = [
  ['상권', '소상공인시장진흥공단 상가(상권)정보 2026-03 · 점포 272만 개'],
  ['지원사업', '중소벤처기업부 기업마당 공고 900건'],
  ['생활인구', '서울시 행정동 단위 생활인구(내국인) · KT 통신데이터'],
  ['금리', 'KB국민은행 공시 금리 (키 연결 시)'],
] as const;

export default function SiteFooter() {
  return (
    <footer className="print:hidden mt-20 border-t border-kb-ink/[.08]">
      <div className="mx-auto max-w-[1200px] px-5 py-10 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1.8fr]">
          <div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kkulbee.svg" alt="" width={20} height={23} />
              <span className="text-[14px] font-bold text-kb-ink">꿀비</span>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-kb-ink/55">
              소상공인 사장님의 입지·자금·권리를
              <br />실제 자료로 함께 살피는 AI 동료
            </p>
            <a href="https://github.com/BioCode67/kb-kkulbee-smallbiz-multiagent"
               target="_blank" rel="noreferrer"
               className="mt-3 inline-block text-[11.5px] font-semibold text-kb-amber
                          underline-offset-2 hover:underline">
              소스코드 (GitHub) →
            </a>
          </div>

          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-kb-ink/45">
              쓰는 자료
            </p>
            <dl className="mt-2 space-y-1">
              {DATA.map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[11.5px] leading-relaxed">
                  <dt className="w-14 shrink-0 font-semibold text-kb-ink/60">{k}</dt>
                  <dd className="text-kb-ink/50">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <p className="mt-8 border-t border-kb-ink/[.06] pt-4 text-[10.5px]
                      leading-relaxed text-kb-ink/40">
          모든 안내는 참고용이며 대출 승인·한도·금리를 보장하지 않습니다.
          매출·폐업률·임대료는 공개 자료에 없어 점수에 넣지 않았고, 생활인구는
          서울만 있어 참고로만 보여 드립니다. 모든 답변은 금융소비자보호법
          §19·§20·§21 표현 검사를 거쳐 나갑니다.
          <br />
          제8회 KB AI Challenge 출품작 · 글꼴 Pretendard·고운바탕 (SIL OFL) ·
          지도 © OpenStreetMap · CARTO
        </p>
      </div>
    </footer>
  );
}
