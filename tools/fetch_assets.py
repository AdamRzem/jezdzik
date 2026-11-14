#!/usr/bin/env python3
"""Fetch versioned local AR assets; run before building for an offline Pi."""

import argparse
import hashlib
import shutil
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_URL = (
    "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/"
    "709283e53fbd1183571e606f5cb37beae681336d/onnx/model_fp16.onnx"
)
MODEL_SHA = "2df6223f206b5164e21f664ace61dabeb9bb6a49b8b5a3e00510b4807d0f5b04"
OPENCV_URL = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js"
OPENCV_SHA = "bd0c3e6448043de04f6a64a12cb7b759f78c3ab8f7c35c9f2e0f71c88bb17103"


def download(url: str, target: Path, sha: str | None = None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and (not sha or hashlib.sha256(target.read_bytes()).hexdigest() == sha):
        print(f"Already present: {target.relative_to(ROOT)}")
        return
    temporary = target.with_suffix(target.suffix + ".part")
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "rover-ar-asset-setup/0.1"})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as stream:
            shutil.copyfileobj(response, stream)
        digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
        if sha and digest != sha:
            raise ValueError(f"SHA256 mismatch for {target.name}: {digest}")
        temporary.replace(target)
        print(f"Fetched {target.relative_to(ROOT)} (SHA256 {digest})")
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-model", action="store_true")
    parser.add_argument("--skip-opencv", action="store_true")
    args = parser.parse_args()
    runtime = ROOT / "node_modules/onnxruntime-web/dist"
    binaries = [*runtime.glob("ort-wasm-simd-threaded.jsep.*"), *runtime.glob("ort-wasm-simd-threaded.asyncify.*")]
    if not binaries:
        parser.exit(1, "Install npm dependencies before fetching assets.\n")
    destination = ROOT / "static/ort"
    destination.mkdir(parents=True, exist_ok=True)
    for source in binaries:
        shutil.copy2(source, destination / source.name)
        print(f"Copied matching ONNX Runtime binary: {source.name}")
    if not args.skip_opencv:
        download(OPENCV_URL, ROOT / "static/vendor/opencv.js", OPENCV_SHA)
    if not args.skip_model:
        download(MODEL_URL, ROOT / "static/models/depth-anything-v2-small-fp16.onnx", MODEL_SHA)


if __name__ == "__main__":
    main()
