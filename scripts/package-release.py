#!/usr/bin/env python3
"""Create deterministic Chrome and Obsidian ZIPs from a verified build."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "builds"
DIST = ROOT / "dist"
PLAYER = ROOT / "obsidian-clipper-anything-player"


def add_file(archive: ZipFile, source: Path, name: str) -> None:
    info = ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
    info.compress_type = ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, source.read_bytes())


def main() -> None:
    package = json.loads((ROOT / "package.json").read_text())
    chrome_manifest = json.loads((DIST / "manifest.json").read_text())
    player_manifest = json.loads((PLAYER / "manifest.json").read_text())
    if chrome_manifest.get("manifest_version") != 3:
        raise SystemExit("Chrome dist/manifest.json is not Manifest V3")
    if chrome_manifest.get("version") != package["version"]:
        raise SystemExit("Chrome manifest and package versions differ")
    if player_manifest.get("id") != PLAYER.name:
        raise SystemExit("Obsidian plugin directory does not match manifest ID")
    required = ("manifest.json", "main.js", "styles.css", "youtube-player.js")
    if any(not (PLAYER / name).is_file() for name in required):
        raise SystemExit("Obsidian player package is missing a runtime file")
    BUILD.mkdir(exist_ok=True)
    chrome_zip = BUILD / f"obsidian-clipping-anything-{package['version']}-chrome.zip"
    with ZipFile(chrome_zip, "w") as archive:
        for source in sorted(DIST.rglob("*")):
            if source.is_file() and source.name != ".DS_Store":
                add_file(archive, source, source.relative_to(DIST).as_posix())
    player_zip = BUILD / f"obsidian-clipping-anything-player-{player_manifest['version']}.zip"
    with ZipFile(player_zip, "w") as archive:
        for name in required:
            add_file(archive, PLAYER / name, f"{PLAYER.name}/{name}")
    checksums = []
    for file in (chrome_zip, player_zip):
        checksums.append(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}")
    (BUILD / "SHA256SUMS").write_text("\n".join(checksums) + "\n")
    print("\n".join(checksums))


if __name__ == "__main__":
    main()
