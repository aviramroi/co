#!/usr/bin/env python3
"""Download daily OHLC bars for a universe of tickers into one long-format parquet.

This is the piece that needs internet access to a market-data vendor. Run it on a
machine that can reach one, then feed the output to overnight_streak.py:

    pip install yfinance pandas pyarrow
    python fetch_prices.py --universe universe_top1000.csv --start 2021-08-24 --end 2026-08-24
    python overnight_streak.py --prices prices.parquet --universe universe_top1000.csv --out-dir results

Output schema: date, symbol, open, high, low, close, adj_close, volume.
`adj_close` must be split- and dividend-adjusted; the backtester uses the
adj_close/close ratio to adjust the open, so corporate actions never show up as
overnight moves.
"""

from __future__ import annotations

import argparse
import sys
import time

import pandas as pd


def read_universe(path: str, limit: int | None) -> list[str]:
    df = pd.read_csv(path)
    col = "symbol" if "symbol" in df.columns else df.columns[0]
    symbols = [str(s).strip().upper() for s in df[col].dropna() if str(s).strip()]
    return symbols[:limit] if limit else symbols


def fetch_yfinance(symbols: list[str], start: str, end: str, batch: int, pause: float) -> pd.DataFrame:
    import yfinance as yf

    frames: list[pd.DataFrame] = []
    for i in range(0, len(symbols), batch):
        chunk = symbols[i : i + batch]
        print(f"[{i + 1:>5}/{len(symbols)}] downloading {len(chunk)} symbols", file=sys.stderr)
        raw = yf.download(
            chunk,
            start=start,
            end=end,
            auto_adjust=False,  # keep raw OHLC *and* Adj Close
            actions=False,
            group_by="ticker",
            threads=True,
            progress=False,
        )
        if raw is None or raw.empty:
            print(f"  no data for batch starting {chunk[0]}", file=sys.stderr)
            continue
        for sym in chunk:
            try:
                part = raw[sym] if isinstance(raw.columns, pd.MultiIndex) else raw
            except KeyError:
                continue
            part = part.dropna(how="all").reset_index()
            if part.empty:
                continue
            part.columns = [str(c).strip().lower().replace(" ", "_") for c in part.columns]
            part = part.rename(columns={"adj_close": "adj_close", "index": "date"})
            part["symbol"] = sym
            frames.append(part)
        time.sleep(pause)

    if not frames:
        raise SystemExit("no data downloaded — check connectivity and the ticker list")

    df = pd.concat(frames, ignore_index=True)
    keep = ["date", "symbol", "open", "high", "low", "close", "adj_close", "volume"]
    for col in keep:
        if col not in df.columns:
            df[col] = pd.NA
    df = df[keep]
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None).dt.normalize()
    return df.dropna(subset=["date", "symbol", "open", "close"]).sort_values(["symbol", "date"])


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--universe", required=True, help="csv with a 'symbol' column")
    p.add_argument("--top", type=int, default=1000)
    p.add_argument("--start", required=True, help="YYYY-MM-DD")
    p.add_argument("--end", required=True, help="YYYY-MM-DD")
    p.add_argument("--out", default="prices.parquet")
    p.add_argument("--batch", type=int, default=50, help="symbols per request")
    p.add_argument("--pause", type=float, default=1.0, help="seconds between batches")
    args = p.parse_args(argv)

    symbols = read_universe(args.universe, args.top)
    df = fetch_yfinance(symbols, args.start, args.end, args.batch, args.pause)

    if args.out.endswith(".parquet"):
        df.to_parquet(args.out, index=False)
    else:
        df.to_csv(args.out, index=False)

    got = df["symbol"].nunique()
    print(
        f"wrote {len(df):,} rows for {got}/{len(symbols)} symbols "
        f"({df['date'].min().date()} .. {df['date'].max().date()}) -> {args.out}",
        file=sys.stderr,
    )
    if got < len(symbols):
        missing = sorted(set(symbols) - set(df["symbol"].unique()))
        print(f"missing {len(missing)}: {', '.join(missing[:20])}...", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
