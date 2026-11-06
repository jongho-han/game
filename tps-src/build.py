#!/usr/bin/env python3
"""tps-src의 공통 엔진을 각 게임 파일에 합쳐 독립 실행 HTML을 만든다. 사용법: python3 build.py"""
from pathlib import Path

src = Path(__file__).parent
core = {n: (src / f"core.{n}").read_text(encoding="utf-8") for n in ("css", "html", "js")}
for name in ("mech", "cover", "chase"):
    f = src / f"{name}.html"
    if not f.exists():
        continue
    out = (
        f.read_text(encoding="utf-8")
        .replace("/*CORECSS*/", core["css"])
        .replace("<!--COREHTML-->", core["html"])
        .replace("/*COREJS*/", core["js"])
    )
    dest = src.parent / f"tps-{name}" / "index.html"
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(out, encoding="utf-8")
    print("built", dest)
