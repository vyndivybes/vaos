"""Explicit installation. Fixed public artifacts, verified against publisher digests."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request

FILES = {
    "kokoro-v1.0.onnx": "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}

def install(destination):
    target = Path(destination).resolve()
    target.mkdir(parents=True, exist_ok=True)
    for name, expected in FILES.items():
        file = target / name
        if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            temporary = target / (name + ".download")
            try:
                url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/" + name
                with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
                if hashlib.sha256(temporary.read_bytes()).hexdigest() != expected:
                    raise ValueError("NEURAL_MODEL_INTEGRITY_FAILED")
                temporary.replace(file)
            finally:
                temporary.unlink(missing_ok=True)
    (target / "manifest.json").write_text(json.dumps(FILES, indent=2), encoding="utf-8")
    print("Verified public Kokoro v1.0 artifacts installed.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", required=True)
    install(parser.parse_args().destination)
