#!/usr/bin/env python3
"""Extrai o texto dos PDFs de base para ficheiros .txt (fora do git).

Uso: python -I scripts/extract-sources.py [pasta_origem] [pasta_destino]
Requer pypdf (instalado num venv fora do repositório).
"""
import re
import sys
import unicodedata
from pathlib import Path

from pypdf import PdfReader

src = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Desktop/biblia").expanduser()
out = Path(sys.argv[2] if len(sys.argv) > 2 else "data/sources")
out.mkdir(parents=True, exist_ok=True)


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    s = s.replace("jornada-da-biblia", "jornada")
    return s


for pdf in sorted(src.glob("*.pdf")):
    reader = PdfReader(str(pdf))
    parts, chars = [], 0
    for n, page in enumerate(reader.pages, 1):
        text = (page.extract_text() or "").strip()
        chars += len(text)
        parts.append(f"=== página {n} ===\n{text}\n")
    if not chars:
        print(f"{pdf.name}: sem camada de texto, ignorado (ler como imagem)")
        continue
    target = out / f"{slug(pdf.stem)}.txt"
    target.write_text("\n".join(parts), encoding="utf-8")
    print(f"{pdf.name} -> {target} ({len(reader.pages)} páginas, {chars} caracteres)")
