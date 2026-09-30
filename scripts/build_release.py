#!/usr/bin/env python3
"""Build and validate a Yandex Games ZIP using only runtime files."""
from pathlib import Path
import hashlib
import re
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'dist/chess-yandex-release.zip'
files = [root / 'index.html']
for folder in ('assets', 'css', 'js', 'vendor'):
    files.extend(sorted((root / folder).rglob('*')))
files = [p for p in files if p.is_file()]
for p in files:
    name = p.relative_to(root).as_posix()
    if not name.isascii() or any(c.isspace() for c in name):
        raise SystemExit(f'Invalid archive path: {name}')
    if p.suffix.lower() in ('.map', '.zip', '.tmp', '.bak') or any(part.startswith('.') for part in p.relative_to(root).parts):
        raise SystemExit(f'Unexpected runtime file: {name}')
for source in [root / 'index.html', root / 'css/style.css']:
    text = source.read_text(encoding='utf-8')
    references = re.findall(r'(?:src|href)=[\"\']([^\"\']+)|url\([\"\']?([^\)\"\']+)', text)
    for match in references:
        ref = next(value for value in match if value)
        if ref.startswith(('/', '#', 'http:', 'https:', 'data:')):
            continue
        if not (source.parent / ref).is_file():
            raise SystemExit(f'Missing reference: {source.name}: {ref}')
total = sum(p.stat().st_size for p in files)
if total > 100_000_000:
    raise SystemExit('Runtime files exceed 100 MB before compression')
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for p in files:
        archive.write(p, p.relative_to(root).as_posix())
with zipfile.ZipFile(output) as archive:
    names = archive.namelist()
    assert [n for n in names if Path(n).name == 'index.html'] == ['index.html']
    assert archive.testzip() is None
print(f'{output}\nFiles: {len(files)}; uncompressed: {total} bytes; ZIP: {output.stat().st_size} bytes')
print(f'SHA256: {hashlib.sha256(output.read_bytes()).hexdigest()}')
