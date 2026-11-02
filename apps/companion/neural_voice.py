"""CPU neural voice. Fixed stock-voice blend, with no reference recordings or network."""
import hashlib
import json
from pathlib import Path
import wave


def verify_models(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    for filename in ("kokoro-v1.0.onnx", "voices-v1.0.bin"):
        file = directory / filename
        from setup_neural import FILES
        with file.open("rb") as source:
            checksum = hashlib.file_digest(source, "sha256").hexdigest()
        if manifest.get(filename) != checksum or FILES[filename] != checksum:
            raise ValueError("NEURAL_MODEL_INTEGRITY_FAILED")
    return directory


def synthesize(data):
    import numpy as np
    import onnxruntime as ort
    from kokoro_onnx import Kokoro
    text = data.get("text")
    if not isinstance(text, str) or not text.strip() or len(text) > 600:
        raise ValueError("NEURAL_TEXT_INVALID")
    directory = verify_models(data["model"])
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(directory / "kokoro-v1.0.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
    engine = Kokoro.from_session(session, str(directory / "voices-v1.0.bin"))
    # VAOS's own recipe, not an actor/character imitation or a trained new identity.
    style = 0.65 * engine.get_voice_style("bm_george") + 0.35 * engine.get_voice_style("bm_lewis")
    samples, rate = engine.create(text, voice=style, speed=0.96, lang="en-gb")
    samples = np.asarray(samples)
    if not samples.size or samples.size > rate * 120 or not np.isfinite(samples).all():
        raise ValueError("NEURAL_AUDIO_INVALID")
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(data["output"], "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm.tobytes())
    return {"profile": "vaos-cinematic-v1", "sampleRate": rate, "seconds": len(pcm) / rate}
