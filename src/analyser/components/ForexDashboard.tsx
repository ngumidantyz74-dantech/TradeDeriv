import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAnalyser, type AnalyserSetupData } from '../AnalyserContext';
import { AnalyserChart } from './AnalyserChart';

const FOREX_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'];
const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export const ForexDashboard: React.FC = () => {
  const { notify } = useAnalyser();
  const [instrument, setInstrument] = useState('EURUSD');
  const [timeframe, setTimeframe] = useState('M15');
  const [setup, setSetup] = useState<AnalyserSetupData | null>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadForex = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ setup: AnalyserSetupData; candles: any[]; quote: any }>(
        `/api/analyser/forex?instrument=${encodeURIComponent(instrument)}&timeframe=${encodeURIComponent(timeframe)}&_t=${Date.now()}`,
        { skipAuth: true, cache: 'no-store' }
      );
      setSetup(res.setup);
      setCandles(res.candles || []);
      setQuote(res.quote || null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load Forex setup', 'error');
    } finally {
      setLoading(false);
    }
  }, [instrument, timeframe, notify]);

  useEffect(() => {
    loadForex();
  }, [loadForex]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Forex Major & Cross Desk ({instrument})</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
            <span>Bid: <strong className="text-[#FF444F]">{quote?.bid ?? '—'}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Ask: <strong className="text-[#00A878]">{quote?.ask ?? '—'}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Spread: <strong>{quote?.spread ?? setup?.spread ?? '—'}</strong></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white dark:bg-[#181C25] p-1 rounded-xl border border-slate-200 dark:border-[#2A2F3D]">
            {FOREX_PAIRS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInstrument(p)}
                className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold cursor-pointer ${
                  instrument === p ? 'bg-[#1958B7] text-white' : 'text-slate-500'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-white dark:bg-[#181C25] p-1 rounded-xl border border-slate-200 dark:border-[#2A2F3D]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold cursor-pointer ${
                  timeframe === tf ? 'bg-[#FF444F] text-white' : 'text-slate-500'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadForex}
            className="px-3.5 py-2 rounded-xl bg-[#151820] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2A2F3D] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold">{instrument} · {timeframe} Candlesticks + Structural Levels</span>
            <span className="font-mono tabular-nums text-slate-500">
              EMA20 {setup?.ema20 ?? '—'} · EMA50 {setup?.ema50 ?? '—'} · RSI(14) {setup?.rsi14 ?? '—'}
            </span>
          </div>
          <AnalyserChart candles={candles} setup={setup} height={430} />
        </div>

        <div className="xl:col-span-4 space-y-4">
          {setup && (
            <div className="bg-white dark:bg-[#181C25] rounded-2xl border border-slate-200 dark:border-[#2A2F3D] p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500">{setup.strategyName}</p>
                  <h2 className="font-display text-xl font-bold mt-0.5">
                    Direction:{' '}
                    <span
                      className={
                        setup.direction === 'BUY'
                          ? 'text-[#00A878]'
                          : setup.direction === 'SELL'
                            ? 'text-[#FF444F]'
                            : 'text-slate-400'
                      }
                    >
                      {setup.direction}
                    </span>
                  </h2>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <p className="text-lg font-bold">{setup.qualityScore}/100</p>
                  <p className="text-[11px] text-slate-400">{setup.lifecycleStatus}</p>
                </div>
              </div>

              {setup.blockedReason && (
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{setup.blockedReason}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums">
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">Entry</p>
                  <p className="font-bold">{setup.entryPrice}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">Stop Loss</p>
                  <p className="font-bold text-[#FF444F]">{setup.stopLoss || '—'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">TP1 / TP2 / TP3</p>
                  <p className="font-bold text-[#00A878]">{setup.tp1 || '—'} / {setup.tp2 || '—'} / {setup.tp3 || '—'}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F4F5F7] dark:bg-[#111319]">
                  <p className="text-[10px] text-slate-400">Risk/Reward</p>
                  <p className="font-bold">{setup.riskReward ? `${setup.riskReward}:1` : '—'}</p>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-[#2A2F3D]">
                <p className="font-bold">Support & Resistance Levels</p>
                <p className="font-mono tabular-nums text-[#00A878]">Support: {setup.supportLevels.join(', ') || '—'}</p>
                <p className="font-mono tabular-nums text-amber-500">Resistance: {setup.resistanceLevels.join(', ') || '—'}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
