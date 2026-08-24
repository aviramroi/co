# Overnight gap-streak backtest

Backtest of this rule:

> After a stock has gapped up (open > previous close) on **3 consecutive days**,
> buy it at that day's close and sell it at the next morning's open.

Each trade holds exactly one overnight session. The engine is fully parameterised
(streak length, long/short, signal type, costs, universe), runs 1,000 symbols over
5 years in about 4 seconds, and ships with tests.

## Status: the engine is done, the data is not

This repository's sessions run behind an egress allowlist that permits GitHub,
PyPI and npm only. Every market-data host — Yahoo Finance, Stooq, Nasdaq,
Polygon, Tiingo, Alpha Vantage, FMP, Twelve Data, EODHD, Alpaca, Kaggle,
Hugging Face — returns a proxy 403. So **no historical prices could be
downloaded here and no real-data results are published in this directory.**
Anything you see in `results/` from a `--synthetic` run is generated data, and
is labelled as such.

`universe_top1000.csv` *is* real: the 1,000 largest US-listed companies by market
cap as of 2026-08-24, taken from the daily Nasdaq screener snapshot published by
[zyhe16/top-us-stock-tickers](https://github.com/zyhe16/top-us-stock-tickers)
(the full 5,412-name snapshot is kept in `us_tickers_snapshot.csv`).

## Running it

```bash
pip install pandas numpy pyarrow yfinance

# 1. download prices (needs access to a market-data vendor)
python fetch_prices.py --universe universe_top1000.csv \
    --start 2021-08-24 --end 2026-08-24 --out prices.parquet

# 2. run the backtest
python overnight_streak.py --prices prices.parquet \
    --universe universe_top1000.csv --streak 3 --cost-bps 10 --out-dir results
```

Without any data at all, the engine still runs end to end on generated prices:

```bash
python overnight_streak.py --synthetic --top 1000
python test_overnight_streak.py     # 11 tests
```

`--prices` accepts a long-format parquet/csv (`date, symbol, open, high, low,
close, adj_close, volume`) or a directory of per-symbol csv files in Yahoo's
export format, so any vendor works as long as you can shape it that way.

## What the engine does

- **Adjusts prices properly.** The open is scaled by the vendor's
  `adj_close / close` ratio, so splits and dividends can never appear as an
  overnight move. (An overnight holder buys before the ex-date close and so is a
  holder of record: dividend-adjusted returns are the right convention here.)
- **Has no look-ahead.** The gaps that build the streak are all observed at or
  before the open of the entry day; entry uses that day's close and exit uses the
  next open. A test asserts that changing prices after the exit cannot change a
  trade's result.
- **Charges costs.** `--cost-bps` is charged once per trade (one round trip:
  MOC buy + MOO sell). This matters more than anything else in the model — see
  below.
- **Rejects bad prints.** Overnight moves beyond `--max-abs-move` (default 50%)
  are discarded and counted in the diagnostics rather than booked as returns.
- **Reports benchmarks**: equal-weight buy-and-hold, "hold everything every
  night" (the unconditional overnight return), and the intraday complement — so
  you can see whether the streak filter adds anything over just being long
  overnight.
- **Sweeps** streak length 1-5 against 0/5/10/20 bps of cost, and reports a
  t-statistic on daily returns so a positive backtest can be judged against
  noise.

## The arithmetic that decides this strategy

Independent of what the data eventually says, the structure of the rule fixes
the hurdle it must clear:

- A 3-gap-up streak is roughly a 1-in-8 event, so on a 1,000-name universe the
  strategy is in about 125 names *every night* — it is a near-continuously
  invested, extremely high-turnover portfolio, not an occasional trade.
- Every trade pays a full round trip. At 10 bps round trip the strategy pays
  about 10 bps per night, roughly **25% per year in costs**.
- The unconditional overnight return of US large caps has historically been on
  the order of a few basis points per night. So the streak filter has to more
  than *triple* the normal overnight return just to cover a 10 bps round trip.

The sweep table exists to test exactly that: if the gross (0 bps) column is not
comfortably above your real trading cost, the strategy is a cost-transfer
mechanism regardless of how good the gross numbers look.

## Files

| File | What it is |
| --- | --- |
| `overnight_streak.py` | Engine + CLI (signals, portfolio, stats, benchmarks, sweeps) |
| `fetch_prices.py` | Downloads OHLC bars into the parquet the engine expects |
| `test_overnight_streak.py` | 11 tests: streak logic, costs, no look-ahead, split handling, planted-edge recovery |
| `universe_top1000.csv` | Top 1,000 US names by market cap, 2026-08-24 |
| `us_tickers_snapshot.csv` | Full 5,412-name Nasdaq screener snapshot |

## Known biases to keep in mind when reading results

- **Survivorship.** The universe is today's top 1,000, so it excludes companies
  that were delisted or shrank out of the top 1,000 during the window. Pass a
  point-in-time membership list to `--universe` if you need this removed.
- **Execution.** MOC and MOO fills are assumed at the printed auction prices with
  no market impact. Real impact on 125 simultaneous names is not modelled beyond
  the flat `--cost-bps`.
- **Shorting.** `--side short` assumes borrow is available and free.
- **No risk-free rate** is earned on nights with no signal.
