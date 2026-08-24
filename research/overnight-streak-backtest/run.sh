#!/usr/bin/env bash
# One-command backtest: download 5 years of prices for the top 1000 US names,
# then run the overnight gap-streak strategy over them.
#
#   ./run.sh                 # 1000 names, 5 years, streak 3, 10 bps round trip
#   TOP=200 ./run.sh         # quick smoke test on 200 names first
#   STREAK=2 COST=5 ./run.sh
set -euo pipefail

cd "$(dirname "$0")"

TOP="${TOP:-1000}"
STREAK="${STREAK:-3}"
COST="${COST:-10}"
YEARS="${YEARS:-5}"
END="${END:-$(python3 -c 'import datetime;print(datetime.date.today())')}"
START="${START:-$(python3 -c "
import datetime
e = datetime.date.fromisoformat('${END}')
try:
    print(e.replace(year=e.year - ${YEARS}))
except ValueError:  # 29 February
    print(e.replace(year=e.year - ${YEARS}, day=28))
")}"
PRICES="${PRICES:-prices_${TOP}_${START}_${END}.parquet}"
OUT="${OUT:-results/run_${START}_${END}_streak${STREAK}_cost${COST}}"

echo "universe : top ${TOP} US names by market cap"
echo "window   : ${START} .. ${END}"
echo "strategy : buy close after ${STREAK} consecutive gap-ups, sell next open"
echo "cost     : ${COST} bps round trip"
echo

if [ ! -f "${PRICES}" ]; then
  python3 fetch_prices.py \
    --universe universe_top1000.csv \
    --top "${TOP}" \
    --start "${START}" \
    --end "${END}" \
    --out "${PRICES}"
else
  echo "reusing existing ${PRICES} (delete it to re-download)"
fi

python3 overnight_streak.py \
  --prices "${PRICES}" \
  --universe universe_top1000.csv \
  --top "${TOP}" \
  --start "${START}" \
  --end "${END}" \
  --streak "${STREAK}" \
  --cost-bps "${COST}" \
  --out-dir "${OUT}"

echo
echo "report written to ${OUT}/report.md"
