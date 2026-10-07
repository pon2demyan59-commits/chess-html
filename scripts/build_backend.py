#!/usr/bin/env python3
"""Assemble the audited SQL in dependency order; does not contact the database."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
parts=['schema.sql','legacy-functions.sql','matchmaking.sql','online-presence.sql','secure-match.sql']
text='begin;\n'
for name in parts:
    source=(root/'db'/name).read_text()
    source=source.replace('\nbegin;\n','\n').replace('\ncommit;\n','\n')
    text+=f'\n-- {name}\n'+source+'\n'
text+='commit;\n'
out=root/'dist/backend-upgrade.sql'
out.parent.mkdir(exist_ok=True)
out.write_text(text)
print(out)
