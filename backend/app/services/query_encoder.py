"""질의를 벡터로 — CPU에서, 키 없이, 한도 없이.

`intfloat/multilingual-e5-small`의 int8 ONNX 판본을 onnxruntime으로 돌립니다.
torch를 부르지 않습니다. 배포 이미지에 torch(2GB 남짓)를 넣지 않아도 되고,
Render 무료 등급 512MB 안에서 버틸 수 있는 이유가 이것입니다.

주의할 점 둘.

  · **접두사가 모델의 일부입니다.** e5 계열은 질의에 `query: `, 문서에
    `passage: `를 붙여 학습됐습니다. 빼먹으면 조용히 나빠집니다. 값이 안
    틀리고 순위만 어긋나므로 눈으로는 안 보입니다.
  · **스레드를 1로 묶습니다.** Render 무료 등급의 CPU 지분은 0.1개입니다.
    호스트가 보고하는 코어 수만큼 스레드를 띄우면 서로 나눠 갖느라 오히려
    느려집니다. 임업 프로젝트에서 같은 것에 데었습니다(67초 → 8초).

모델 파일이 없으면 조용히 없는 대로 둡니다. 검색 쪽이 BM25만으로 물러섭니다.
"""
from __future__ import annotations

import os
import threading

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_DIR = os.environ.get("KKULBEE_ENCODER_DIR", os.path.join(ROOT, "models", "e5-small-onnx"))

MAX_TOKENS = 192          # 질의는 짧습니다. 길이를 묶어 두면 CPU에서 안정적입니다.
DIM = 384

_lock = threading.Lock()
_state: dict = {"tried": False, "session": None, "tokenizer": None, "inputs": ()}


def available() -> bool:
    """모델 파일이 자리에 있는지. 실제 적재는 첫 호출까지 미룹니다."""
    return os.path.exists(os.path.join(MODEL_DIR, "model.onnx"))


def _load():
    """지연 적재. 첫 검색 요청 때 한 번만 올립니다."""
    if _state["session"] is not None or _state["tried"]:
        return _state["session"]
    with _lock:
        if _state["tried"]:
            return _state["session"]
        _state["tried"] = True
        if not available():
            return None
        try:
            import onnxruntime as ort
            from tokenizers import Tokenizer

            opt = ort.SessionOptions()
            opt.intra_op_num_threads = 1
            opt.inter_op_num_threads = 1
            opt.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            sess = ort.InferenceSession(
                os.path.join(MODEL_DIR, "model.onnx"),
                sess_options=opt,
                providers=["CPUExecutionProvider"],
            )
            tok = Tokenizer.from_file(os.path.join(MODEL_DIR, "tokenizer.json"))
            tok.enable_truncation(max_length=MAX_TOKENS)
            tok.enable_padding(length=None, pad_id=1, pad_token="<pad>")

            _state["session"] = sess
            _state["tokenizer"] = tok
            _state["inputs"] = tuple(i.name for i in sess.get_inputs())
        except Exception:  # noqa: BLE001 — 인코더가 없어도 서비스는 떠야 합니다
            _state["session"] = None
    return _state["session"]


def encode(texts: list[str], kind: str = "query") -> np.ndarray | None:
    """문장들을 L2 정규화된 벡터로. 모델이 없으면 None입니다.

    kind는 'query'나 'passage'입니다. e5의 접두사가 여기서 붙습니다.
    """
    sess = _load()
    if sess is None or not texts:
        return None

    tok = _state["tokenizer"]
    prefix = "query: " if kind == "query" else "passage: "
    encs = tok.encode_batch([prefix + t for t in texts])

    ids = np.array([e.ids for e in encs], dtype=np.int64)
    mask = np.array([e.attention_mask for e in encs], dtype=np.int64)

    feed = {"input_ids": ids, "attention_mask": mask}
    if "token_type_ids" in _state["inputs"]:
        feed["token_type_ids"] = np.zeros_like(ids)
    feed = {k: v for k, v in feed.items() if k in _state["inputs"]}

    hidden = sess.run(None, feed)[0]                       # (B, T, 384)

    # 평균 풀링 — 패딩 자리는 빼고 셉니다. 그냥 mean을 쓰면 패딩이 벡터를
    # 원점 쪽으로 끌어당겨 짧은 질의일수록 크게 어긋납니다.
    m = mask[..., None].astype(np.float32)
    vec = (hidden * m).sum(axis=1) / np.clip(m.sum(axis=1), 1e-9, None)

    norm = np.linalg.norm(vec, axis=1, keepdims=True)
    return (vec / np.clip(norm, 1e-9, None)).astype(np.float32)


def encode_one(text: str) -> np.ndarray | None:
    v = encode([text], kind="query")
    return None if v is None else v[0]
