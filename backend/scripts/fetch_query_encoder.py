"""질의 임베딩 모델을 내려받습니다 — CPU에서 영원히 도는 쪽으로.

서버가 2026-08-13에 사라집니다. 그 뒤에도 검색이 살아 있으려면 런타임이
GPU에도, 외부 API 키에도 기대면 안 됩니다. 그래서 질의 임베딩은 int8로
양자화된 ONNX 모델을 CPU에서 돌립니다. 키도 한도도 없습니다.

모델은 `intfloat/multilingual-e5-small`입니다. 고른 이유가 셋입니다.

  · 한국어를 포함한 100개 언어로 학습됐고, 짧은 구어체 질문("장사가 안돼서
    돈이 급해요")과 공문서체 공고문("소상공인 경영안정자금 융자 지원") 사이의
    거리를 좁힐 수 있습니다. 이 간극이 BM25만으로는 안 메워집니다.
  · int8 양자화본이 118MB입니다. Render 무료 등급 512MB 안에 들어갑니다.
    fp32는 470MB라 그것만으로 한도를 넘습니다.
  · 384차원이라 900건 벡터가 1.4MB입니다. 저장소에 넣어도 부담이 없습니다.

파일은 `backend/models/`에 놓고 git에는 넣지 않습니다(118MB는 GitHub 한 파일
한도 100MB를 넘습니다). 배포 이미지를 만들 때 이 스크립트를 한 번 돌립니다.

실행:
    python -m scripts.fetch_query_encoder
"""
from __future__ import annotations

import os
import ssl
import sys
import urllib.request

REPO = "intfloat/multilingual-e5-small"
BASE = f"https://huggingface.co/{REPO}/resolve/main"

# 받을 것만 받습니다. fp32 본체(470MB)와 O4(235MB)는 건드리지 않습니다.
#
# tokenizer.json(17MB)이 아니라 sentencepiece 원본(5MB)을 받습니다.
# 배포를 앞두고 재 보니 tokenizer.json을 올리는 데 메모리 280MB가 들었고,
# 같은 일을 sentencepiece로 하면 70MB였습니다. 두 방식의 토큰 번호가
# 완전히 같은 것을 대조해 확인한 뒤 바꿨습니다.
FILES = {
    "model.onnx": ("onnx/model_qint8_avx512_vnni.onnx", 118_346_824),
    "sentencepiece.bpe.model": ("onnx/sentencepiece.bpe.model", 5_069_051),
    "config.json": ("onnx/config.json", 653),
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "models", "e5-small-onnx")

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def _download(url: str, path: str, expect: int) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "KB-KkulBee/0.1"})
    with urllib.request.urlopen(req, timeout=180, context=CTX) as r, open(path, "wb") as f:
        got = 0
        while chunk := r.read(1 << 20):
            f.write(chunk)
            got += len(chunk)
            if expect:
                pct = got * 100 // expect
                print(f"\r    {got/1e6:6.1f} / {expect/1e6:.1f} MB  {pct:3d}%", end="")
    print()


def main() -> int:
    os.makedirs(DEST, exist_ok=True)
    print(f"질의 인코더 내려받기 — {REPO}")
    print(f"  받는 곳 {DEST}")

    for local, (remote, size) in FILES.items():
        path = os.path.join(DEST, local)
        if os.path.exists(path) and (not size or abs(os.path.getsize(path) - size) < 1024):
            print(f"  [있음] {local}  ({os.path.getsize(path)/1e6:.1f} MB)")
            continue
        print(f"  [받는 중] {local}")
        try:
            _download(f"{BASE}/{remote}", path, size)
        except Exception as e:  # noqa: BLE001
            print(f"  [실패] {local} — {e}")
            print("  질의 인코더가 없으면 검색은 BM25만으로 돕니다(정확도는 떨어집니다).")
            return 1

    total = sum(os.path.getsize(os.path.join(DEST, f)) for f in FILES)
    print(f"\n끝났습니다. 합계 {total/1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
