"""Explicit voice-model setup, never called by startup or an audio request."""
import argparse
from pathlib import Path
from faster_whisper import download_model

parser = argparse.ArgumentParser()
parser.add_argument("--destination", required=True)
args = parser.parse_args()
target = Path(args.destination).resolve()
target.mkdir(parents=True, exist_ok=True)
download_model("tiny.en", output_dir=str(target))
print("Local tiny.en model installed:", target)
