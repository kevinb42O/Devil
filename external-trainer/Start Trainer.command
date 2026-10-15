#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if ! command -v node >/dev/null; then
  print 'Node.js is required for the memory connection.'
  exit 1
fi
if ! node --input-type=module -e "await import('@playwright/test')" >/dev/null 2>&1; then
  npm install --omit=dev
fi
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
if [[ ! -f .venv/.trainer-ready ]] || ! cmp -s requirements.txt .venv/.trainer-requirements; then
  .venv/bin/python -m pip install -r requirements.txt
  cp requirements.txt .venv/.trainer-requirements
  touch .venv/.trainer-ready
fi
exec .venv/bin/python app.py "$@"
