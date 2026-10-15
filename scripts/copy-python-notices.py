"""Copy installed direct-component notices without importing device libraries."""
from importlib.metadata import distribution
from pathlib import Path

target = Path(__file__).resolve().parent.parent / "apps" / "companion" / "licenses"
target.mkdir(parents=True, exist_ok=True)
for name in ("python-docx", "faster-whisper", "PyAutoGUI"):
    package = distribution(name)
    notices = [file for file in package.files or [] if "dist-info" in str(file) and "license" in file.name.lower()]
    if not notices:
        raise RuntimeError("Installed notice is missing for " + name)
    for index, notice in enumerate(notices):
        (target / (name + ("-" + str(index) if index else "") + ".txt")).write_bytes(Path(package.locate_file(notice)).read_bytes())
print("Direct Python component notices copied.")
