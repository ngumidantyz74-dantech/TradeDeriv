import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  AreaSeries,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../lib/api';
import type { CandleData, OrderRecord } from '../../types';

export type TemplateChartStyle = 'candles' | 'area' | 'line';

interface TemplateChartProps {
  symbol: string;
  granularity?: number; // 1 for tick stream, >=60 for OHLC candles
  chartStyle?: TemplateChartStyle;
  showControls?: boolean;
  onGranularityChange?: (g: number) => void;
  barriers?: {
    high?: number | null;
    low?: number | null;
    crossed?: boolean;
  };
  openOrders?: OrderRecord[];
  recentOrders?: OrderRecord[];
  heightClass?: string;
}

const CHART_TF_OPTIONS = [
  { label: '1t', g: 1 },
  { label: '1m', g: 60 },
  { label: '5m', g: 300 },
  { label: '15m', g: 900 },
  { label: '1h', g: 3600 },
];

function computeEma(candles: CandleData[], period = 20): Array<{ time: UTCTimestamp; value: number }> {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
  const out: Array<{ time: UTCTimestamp; value: number }> = [
    { time: candles[period - 1].time as UTCTimestamp, value: ema },
  ];
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    out.push({ time: candles[i].time as UTCTimestamp, value: ema });
  }
  return out;
}

export const TemplateChart: React.FC<TemplateChartProps> = ({
  symbol,
  granularity = 60,
  chartStyle,
  showControls = false,
  onGranularityChange,
  barriers,
  openOrders = [],
  recentOrders = [],
  heightClass = 'h-[320px] sm:h-[380px]',
}) => {
  const { ticks, theme } = useApp();
  const [internalStyle, setInternalStyle] = useState<TemplateChartStyle>(
    chartStyle ?? (granularity >= 60 ? 'candles' : 'area')
  );
  const [showEma, setShowEma] = useState(true);
  const [ohlcReadout, setOhlcReadout] = useState<CandleData | null>(null);
  const [feedSource, setFeedSource] = useState<string>('deriv_ws');

  const activeStyle: TemplateChartStyle = chartStyle ?? internalStyle;
  const effectiveSeriesMode: TemplateChartStyle =
    granularity < 60 && activeStyle === 'candles' ? 'area' : activeStyle;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const candlesDataRef = useRef<CandleData[]>([]);
  const lastPointRef = useRef<CandleData | null>(null);

  const liveTick = ticks[symbol];
  const pipSize = liveTick?.pipSize ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;

  useEffect(() => {
    if (!chartStyle) {
      setInternalStyle(granularity >= 60 ? 'candles' : 'area');
    }
  }, [granularity, chartStyle]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#111319' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(148,163,184,0.07)' : 'rgba(15,23,42,0.05)' },
        horzLines: { color: isDark ? 'rgba(148,163,184,0.07)' : 'rgba(15,23,42,0.05)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: isDark ? '#2A2F3D' : '#E2E8F0',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: isDark ? '#2A2F3D' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: granularity < 60,
        rightOffset: 6,
      },
      width: Math.max(200, el.clientWidth),
      height: Math.max(200, el.clientHeight),
    });

    const series =
      effectiveSeriesMode === 'candles'
        ? chart.addSeries(CandlestickSeries, {
            upColor: '#00A878',
            downColor: '#FF444F',
            borderUpColor: '#00A878',
            borderDownColor: '#FF444F',
            wickUpColor: '#00A878',
            wickDownColor: '#FF444F',
            priceFormat: { type: 'price', precision: decimals, minMove: pipSize },
          })
        : effectiveSeriesMode === 'line'
          ? chart.addSeries(LineSeries, {
              color: '#3B82F6',
              lineWidth: 2,
              priceFormat: { type: 'price', precision: decimals, minMove: pipSize },
            })
          : chart.addSeries(AreaSeries, {
              lineColor: '#FF444F',
              topColor: 'rgba(255, 68, 79, 0.22)',
              bottomColor: 'rgba(255, 68, 79, 0.01)',
              lineWidth: 2,
              priceFormat: { type: 'price', precision: decimals, minMove: pipSize },
            });

    const emaSeries = showEma
      ? chart.addSeries(LineSeries, {
          color: '#F59E0B',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        })
      : null;

    chartRef.current = chart;
    seriesRef.current = series;
    emaSeriesRef.current = emaSeries;
    markersPluginRef.current = createSeriesMarkers(series, []);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        if (lastPointRef.current) setOhlcReadout(lastPointRef.current);
        return;
      }
      const d = param.seriesData.get(series) as any;
      if (!d) return;
      if (typeof d.open === 'number') {
        setOhlcReadout({
          time: Number(param.time),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        });
      } else if (typeof d.value === 'number') {
        setOhlcReadout({
          time: Number(param.time),
          open: d.value,
          high: d.value,
          low: d.value,
          close: d.value,
        });
      }
    });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
          chart.resize(entry.contentRect.width, entry.contentRect.height);
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      priceLinesRef.current = [];
      markersPluginRef.current = null;
      emaSeriesRef.current = null;
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [theme, granularity, effectiveSeriesMode, showEma, decimals, pipSize]);

  // Load historical candles / ticks
  useEffect(() => {
    let active = true;
    lastPointRef.current = null;
    candlesDataRef.current = [];

    apiFetch<{ candles: CandleData[]; source?: string }>(
      `/api/market/candles?symbol=${encodeURIComponent(symbol)}&granularity=${granularity}&count=150`,
      { skipAuth: true }
    )
      .then((res) => {
        if (!active || !seriesRef.current) return;
        setFeedSource(res.source || 'deriv_ws');
        const raw = (res.candles || []).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close));
        if (raw.length === 0) return;

        const deduped = new Map<number, CandleData>();
        for (const c of raw) {
          deduped.set(c.time, c);
        }
        const sorted = Array.from(deduped.values()).sort((a, b) => a.time - b.time);
        candlesDataRef.current = sorted;

        if (effectiveSeriesMode === 'candles') {
          (seriesRef.current as ISeriesApi<'Candlestick'>).setData(
            sorted.map((c) => ({
              time: c.time as UTCTimestamp,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          );
        } else {
          (seriesRef.current as ISeriesApi<'Area'>).setData(
            sorted.map((c) => ({
              time: c.time as UTCTimestamp,
              value: c.close,
            }))
          );
        }

        if (emaSeriesRef.current) {
          emaSeriesRef.current.setData(computeEma(sorted, 20));
        }

        const tail = sorted[sorted.length - 1];
        lastPointRef.current = tail ? { ...tail } : null;
        if (tail) setOhlcReadout(tail);
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [symbol, granularity, effectiveSeriesMode, showEma]);

  // Real-time live tick stream updates
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !liveTick || !Number.isFinite(liveTick.quote)) return;

    const bucketSec =
      granularity >= 60 ? Math.floor(liveTick.epoch / granularity) * granularity : liveTick.epoch;

    const prev = lastPointRef.current;
    const nextTime = prev && bucketSec < prev.time ? prev.time : bucketSec;

    try {
      if (effectiveSeriesMode === 'candles') {
        const bar: CandleData =
          prev && prev.time === nextTime
            ? {
                time: nextTime,
                open: prev.open,
                high: Math.max(prev.high, liveTick.quote),
                low: Math.min(prev.low, liveTick.quote),
                close: liveTick.quote,
              }
            : {
                time: nextTime,
                open: prev ? prev.close : liveTick.quote,
                high: liveTick.quote,
                low: liveTick.quote,
                close: liveTick.quote,
              };
        lastPointRef.current = bar;
        setOhlcReadout(bar);
        (series as ISeriesApi<'Candlestick'>).update({
          ...bar,
          time: bar.time as UTCTimestamp,
        });
      } else {
        const pt: CandleData = {
          time: nextTime,
          open: liveTick.quote,
          high: liveTick.quote,
          low: liveTick.quote,
          close: liveTick.quote,
        };
        lastPointRef.current = pt;
        setOhlcReadout(pt);
        (series as ISeriesApi<'Area'>).update({
          time: nextTime as UTCTimestamp,
          value: liveTick.quote,
        });
      }
    } catch {
      // ignore monotonic edge cases
    }
  }, [liveTick, granularity, effectiveSeriesMode]);

  // Draw Accumulator Barriers, Open Order Entry / SL / TP Lines, and Manual + Bot Trade Markers
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    for (const pl of priceLinesRef.current) {
      try {
        series.removePriceLine(pl);
      } catch {
        // ignore
      }
    }
    priceLinesRef.current = [];

    const barrierColor = barriers?.crossed ? '#FF444F' : '#00A878';
    if (barriers?.high && Number.isFinite(barriers.high)) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: barriers.high,
          color: barrierColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'High Barrier',
        })
      );
    }
    if (barriers?.low && Number.isFinite(barriers.low)) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: barriers.low,
          color: barrierColor,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Low Barrier',
        })
      );
    }

    const relevantOpen = openOrders.filter((o) => o.status === 'OPEN' && o.symbol === symbol && o.entry_price);
    for (const o of relevantOpen.slice(0, 8)) {
      const isUp = ['CALL', 'CALLE', 'ACCU', 'BUY', 'MULTUP', 'DIGITOVER', 'DIGITEVEN', 'DIGITMATCH'].includes(
        String(o.contract_type || o.side || '').toUpperCase()
      );
      const prefix = o.source === 'bot' ? 'BOT' : 'ENTRY';
      priceLinesRef.current.push(
        series.createPriceLine({
          price: Number(o.entry_price),
          color: isUp ? '#00A878' : '#FF444F',
          lineWidth: 1,
          lineStyle: o.source === 'bot' ? LineStyle.Dotted : LineStyle.Solid,
          axisLabelVisible: true,
          title: `${prefix} ${o.contract_type || o.side}`,
        })
      );
      if (o.tp_price && Number.isFinite(Number(o.tp_price))) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: Number(o.tp_price),
            color: '#10B981',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'TP',
          })
        );
      }
      if (o.sl_price && Number.isFinite(Number(o.sl_price))) {
        priceLinesRef.current.push(
          series.createPriceLine({
            price: Number(o.sl_price),
            color: '#EF4444',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'SL',
          })
        );
      }
    }

    // Plot on-chart arrows for manual & bot executions within visible candle window
    if (markersPluginRef.current) {
      const allMarked = [...relevantOpen, ...recentOrders.filter((o) => o.symbol === symbol)].slice(0, 15);
      const markers: SeriesMarker<Time>[] = [];
      const seenIds = new Set<number>();
      for (const o of allMarked) {
        if (seenIds.has(o.id)) continue;
        seenIds.add(o.id);
        const tsMs = Date.parse(o.opened_at);
        if (!Number.isFinite(tsMs)) continue;
        const sec = Math.floor(tsMs / 1000);
        const aligned = granularity >= 60 ? Math.floor(sec / granularity) * granularity : sec;
        const isUp = ['CALL', 'CALLE', 'ACCU', 'BUY', 'MULTUP', 'DIGITOVER', 'DIGITEVEN', 'DIGITMATCH'].includes(
          String(o.contract_type || o.side || '').toUpperCase()
        );
        const isBot = o.source === 'bot';
        markers.push({
          time: aligned as UTCTimestamp,
          position: isUp ? 'belowBar' : 'aboveBar',
          color: isUp ? '#00A878' : '#FF444F',
          shape: isUp ? 'arrowUp' : 'arrowDown',
          text: `${isBot ? 'BOT ' : ''}${o.contract_type || o.side}`,
        });
      }
      markers.sort((a, b) => Number(a.time) - Number(b.time));
      try {
        markersPluginRef.current.setMarkers(markers);
      } catch {
        // ignore if markers fall outside initial empty series
      }
    }
  }, [barriers?.high, barriers?.low, barriers?.crossed, openOrders, recentOrders, symbol, granularity]);

  return (
    <div className="space-y-2">
      {/* Compact OHLC Readout & Chart Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2 font-mono-num text-slate-500">
          {ohlcReadout && (
            <>
              <span>
                O <strong className="text-[#0E1117] dark:text-white">{ohlcReadout.open.toFixed(decimals)}</strong>
              </span>
              <span>
                H <strong className="text-[#00A878]">{ohlcReadout.high.toFixed(decimals)}</strong>
              </span>
              <span>
                L <strong className="text-[#FF444F]">{ohlcReadout.low.toFixed(decimals)}</strong>
              </span>
              <span>
                C <strong className="text-[#0E1117] dark:text-white">{ohlcReadout.close.toFixed(decimals)}</strong>
              </span>
            </>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00A878]/10 text-[#00A878] font-semibold">
            {feedSource === 'deriv_ws' ? 'LIVE DERIV' : 'SYNC STREAM'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {showControls && onGranularityChange && (
            <div className="inline-flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-lg">
              {CHART_TF_OPTIONS.map((tf) => (
                <button
                  key={tf.g}
                  type="button"
                  onClick={() => onGranularityChange(tf.g)}
                  className={`px-2 py-0.5 rounded font-mono-num font-semibold cursor-pointer ${
                    granularity === tf.g
                      ? 'bg-white dark:bg-[#232734] text-[#0E1117] dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}

          {!chartStyle && (
            <div className="inline-flex items-center bg-[#F4F5F7] dark:bg-[#111319] p-0.5 rounded-lg">
              {(['candles', 'area', 'line'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setInternalStyle(mode);
                    if (mode === 'candles' && granularity < 60 && onGranularityChange) {
                      onGranularityChange(60);
                    }
                  }}
                  className={`px-2 py-0.5 rounded capitalize font-semibold cursor-pointer ${
                    effectiveSeriesMode === mode
                      ? 'bg-white dark:bg-[#232734] text-[#0E1117] dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowEma((v) => !v)}
            className={`px-2 py-0.5 rounded-lg font-semibold cursor-pointer border ${
              showEma
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                : 'border-slate-200 dark:border-[#2A2F3D] text-slate-400'
            }`}
          >
            EMA20
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#111319]`}
      />
    </div>
  );
};
