'use client';

/**
 * 갈래 페이지 하단 보강 — 미리 보는 실제 화면·사용 팁·데이터 출처.
 *
 * "페이지가 아래로 좀 더 길게, 정보나 사진이 몇 개 더"라는 피드백.
 * 사진은 스톡이 아니라 이 서비스의 실제 화면 캡처이고, 팁은 실존
 * 기능의 사용법이며, 출처는 실제로 쓰는 공시·실측 데이터입니다.
 */

interface Shot { src: string; cap: string; }
interface Extra { shots: Shot[]; tips: string[]; sources: [string, string][]; }

const EXTRAS: Record<string, Extra> = {
  location: {
    shots: [
      { src: '/shots/map.jpg', cap: '실제 경쟁 점포가 주황 점으로 — 몰린 골목이 보입니다' },
      { src: '/shots/radar.jpg', cap: '점수의 근거 — 전국 평균 대비 레이더와 요인 분해' },
      { src: '/shots/compare.jpg', cap: '두 동네 비교 — 같은 자로 잰 줄다리기 승부표' },
    ],
    tips: [
      '동네 이름만 말해도 됩니다 — "경산시 술집"처럼 시·군·구로 물으면 그 안 동네 전부를 재서 순위로 답합니다',
      '지도 카드의 ▶ 지도 투어를 누르면 꿀비가 경쟁 점포 위를 직접 날며 해설합니다',
      '답변 옆 글라스박스에서 이 답이 만들어진 실측 과정을 그대로 볼 수 있습니다',
    ],
    sources: [
      ['소상공인시장진흥공단 상가(상권)정보', '전국 점포 2,725,318개 실측 좌표'],
      ['서울시 열린데이터광장', '행정동 단위 생활인구(서울)'],
      ['한국부동산원 R-ONE', '소규모 상가 임대료·임대가격지수(분기 공시)'],
    ],
  },
  gap: {
    shots: [
      { src: '/shots/gapradar.jpg', cap: '점수는 높은데 같은 가게가 적으면 — 빈 자리 배지' },
      { src: '/shots/tour.jpg', cap: '후보 동네는 지도 투어로 골목까지 확인' },
    ],
    tips: [
      '"빈 자리 찾기"는 주요 업종을 전국 백분위 같은 자로 전부 다시 재서 고릅니다',
      '결과의 업종을 눌러 그 업종 기준 상권 점수로 바로 이어볼 수 있습니다',
      '경기·트렌드 갈래의 업종 창업 흐름과 함께 보면 수요 쪽 감이 잡힙니다',
    ],
    sources: [
      ['소상공인시장진흥공단 상가(상권)정보', '행정동 3,450곳 × 업종 247종 구성'],
      ['공정거래위원회 가맹사업 통계', '업종별 가맹점 증감(2개년)'],
    ],
  },
  policy: {
    shots: [
      { src: '/shots/plan.jpg', cap: '조달 설계 — 그냥 받는 돈부터 쌓고, 이자 절감액까지' },
      { src: '/shots/rates.jpg', cap: '은행권 공시 금리와 KB 상품 — 금융감독원 공시 그대로' },
    ],
    tips: [
      '제도 이름을 몰라도 됩니다 — "장사가 안돼서 운영자금이 급해요"처럼 상황을 그대로',
      '공고 카드의 ☆을 누르면 찜 서랍에 모이고, 마감이 다가오면 원문을 자동 재확인합니다',
      '모든 추천에는 왜 골랐는지와 공고 원문 링크가 붙습니다 — 확인하고 신청하세요',
    ],
    sources: [
      ['중소벤처기업부 기업마당', '실제 접수 중 공고 900건'],
      ['금융감독원 금융상품 한눈에', '은행권 공시 금리·KB국민은행 공시 상품'],
    ],
  },
  protection: {
    shots: [
      { src: '/shots/contract.jpg', cap: '계약서 PDF를 끌어다 놓으면 — 독소조항 빨간 펜' },
      { src: '/shots/franchise.jpg', cap: '가맹 브랜드 실측 — 가맹점 수·개폐점·평균매출 공시' },
      { src: '/shots/goldentime.jpg', cap: '권리에는 마감일이 있습니다 — D-day와 근거 조문' },
    ],
    tips: [
      '계약서 파일은 서버로 올라가지 않습니다 — 브라우저 안에서만 읽습니다',
      '프랜차이즈 상담이라면 브랜드 공시부터 확인하세요 — 본사 홍보물과 다를 수 있습니다',
      '분쟁 답변의 "민원서 초안 만들기"로 제출 가능한 문서 틀을 바로 받을 수 있습니다',
    ],
    sources: [
      ['상가건물 임대차보호법·가맹사업법', '독소조항 판정과 골든타임 계산의 근거 조문'],
      ['공정거래위원회 가맹사업 통계', '정보공개서 기반 브랜드 공시'],
      ['금융소비자보호법 §19·20·21', '모든 답변이 통과하는 가드레일'],
    ],
  },
  trend: {
    shots: [
      { src: '/shots/radar.jpg', cap: '지역을 정했다면 — 입지 진단에서 근거까지' },
      { src: '/shots/gapradar.jpg', cap: '업종을 정했다면 — 기회 업종에서 빈 자리 확인' },
    ],
    tips: [
      '임대가격지수는 예측이 아니라 신호입니다 — 오르면 자리 경쟁, 내리면 협상 여지',
      '업종 흐름은 가맹(프랜차이즈) 공시 기준입니다 — 독립 점포는 포함되지 않습니다',
      '뜨는 업종을 찾았다면 기회 업종 갈래에서 우리 동네에 비어 있는지 확인해 보세요',
    ],
    sources: [
      ['한국부동산원 R-ONE', '소규모 상가 임대가격지수 분기 시계열'],
      ['공정거래위원회 가맹사업 통계', '업종별 가맹점 수 2개년 비교'],
    ],
  },
  all: {
    shots: [
      { src: '/shots/chat.jpg', cap: '답을 받은 뒤에도 — 하단 대화창으로 이어 묻기' },
      { src: '/shots/glassbox.jpg', cap: '글라스박스 — 어느 에이전트가 몇 ms에 무엇을 봤는지' },
    ],
    tips: [
      '한 질문에 여러 갈래가 동시에 켜집니다 — "성수동에 빵집 열건데 자금이랑 상권 다 봐줘"',
      '꿀비는 직전 상담을 기억합니다 — "그럼 자금은?"처럼 짧게 이어 물어도 됩니다',
      '📄 저장을 누르면 상담 전체가 창구에 들고 갈 리포트로 인쇄됩니다',
    ],
    sources: [
      ['LangGraph 멀티에이전트', '라우터 → 갈래 병렬 → 금소법 가드레일(마지막 관문)'],
      ['글라스박스', '모든 답의 노드별 실측 처리 로그 공개'],
    ],
  },
};

export default function ModeExtras({ k }: { k: string }) {
  const x = EXTRAS[k];
  if (!x) return null;
  return (
    <div className="mt-10 w-full max-w-[1240px]">
      <p className="text-[13px] font-bold uppercase tracking-wider text-kb-ink/55">
        미리 보는 실제 화면
      </p>
      <div className={`mt-3 grid gap-4 ${x.shots.length >= 3
        ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {x.shots.map((s) => (
          <figure key={s.src} className="overflow-hidden rounded-2xl border
                                         border-kb-ink/[.1] bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt={s.cap} loading="lazy"
                 className="max-h-[300px] w-full object-cover object-top" />
            <figcaption className="px-3.5 py-2.5 text-[13px] leading-snug
                                   text-kb-ink/72">
              {s.cap}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-kb-ink/[.1] bg-white/80 p-5">
          <p className="text-[15px] font-bold text-kb-ink">💡 이렇게 써보세요</p>
          <ul className="mt-2.5 space-y-2">
            {x.tips.map((t) => (
              <li key={t} className="flex gap-2 text-[14px] leading-relaxed
                                     text-kb-ink/78">
                <span className="text-kb-yellow">✦</span>{t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-kb-ink/[.1] bg-white/80 p-5">
          <p className="text-[15px] font-bold text-kb-ink">📚 이 갈래가 쓰는 데이터</p>
          <ul className="mt-2.5 space-y-2">
            {x.sources.map(([name, what]) => (
              <li key={name} className="text-[13.5px] leading-snug">
                <b className="text-kb-ink/85">{name}</b>
                <span className="text-kb-ink/62"> — {what}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
