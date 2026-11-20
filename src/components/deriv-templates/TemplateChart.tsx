import React, { useEffect, useRef } from 'react';
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../lib/api';
import type { CandleData, OrderRecord } from '../../types';

interface TemplateChartProps {
  symbol: string;
  granularity?: number; // 1 for tick/line stream, >=60 for candles
  barriers?: {
    high?: number | null;
    low?: number | null;
    crossed?: boolean;
  };
  openOrders?: OrderRecord[];
  heightClass?: string;
}

export const TemplateChart: React.FC<TemplateChartProps> = ({
  symbol,
  granularity = 1,
  barriers,
  openOrders = [],
  heightClass = 'h-[320px] sm:h-[380px]',
}) => {
  const { ticks, theme } = useApp();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const lastPointRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const liveTick = ticks[symbol];
  const pipSize = liveTick?.pipSize ?? 0.01;
  const decimals = pipSize < 0.0001 ? 5 : pipSize < 0.001 ? 4 : pipSize < 0.01 ? 3 : 2;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#111319' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(148,163,184,0.07)' : 'rgba(15,23,42,0.05)' },
        horzLines: { color: isDark ? 'rgba(148,163,184,0.07)' : 'rgba(15,23,42,0.05)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: isDark ? '#2A2F3D' : '#E2E8F0',
      },
      timeScale: {
        borderColor: isDark ? '#2A2F3D' : '#E2E8F0',
        timeVisible: true,
        secondsVisible: granularity < 60,
      },
      width: el.clientWidth,
      height: el.clientHeight,
    });

    const series =
      granularity >= 60
        ? chart.addSeries(CandlestickSeries, {
            upColor: '#00A878',
            downColor: '#FF444F',
            borderUpColor: '#00A878',
            borderDownColor: '#FF444F',
            wickUpColor: '#00A878',
            wickDownColor: '#FF444F',
            priceFormat: { type: 'price', precision: decimals, minMove: pipSize },
          })
        : chart.addSeries(AreaSeries, {
            lineColor: '#FF444F',
            topColor: 'rgba(255, 68, 79, 0.22)',
            bottomColor: 'rgba(255, 68, 79, 0.01)',
            lineWidth: 2,
            priceFormat: { type: 'price', precision: decimals, minMove: pipSize },
          });

    chartRef.current = chart;
    seriesRef.current = series;

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
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [theme, granularity, decimals, pipSize]);

  useEffect(() => {
    let active = true;
    lastPointRef.current = null;

    apiFetch<{ candles: CandleData[] }>(
      `/api/market/candles?symbol=${encodeURIComponent(symbol)}&granularity=${granularity}&count=100`,
      { skipAuth: true }
    )
      .then((res) => {
        if (!active || !seriesRef.current) return;
        const raw = (res.candles || []).filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close));
        if (raw.length === 0) return;

        // Deduplicate ascending timestamps
        const deduped = new Map<number, CandleData>();
        for (const c of raw) {
          deduped.set(c.time, c);
        }
        const sorted = Array.from(deduped.values()).sort((a, b) => a.time - b.time);

        if (granularity >= 60) {
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
        const tail = sorted[sorted.length - 1];
        lastPointRef.current = tail ? { ...tail } : null;
        chartRef.current?.timeScale().fitContent();
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [symbol, granularity]);

  // Real-time live tick stream updates
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !liveTick || !Number.isFinite(liveTick.quote)) return;

    const bucketSec =
      granularity >= 60
        ? Math.floor(liveTick.epoch / granularity) * granularity
        : liveTick.epoch;

    const prev = lastPointRef.current;
    const nextTime = prev && bucketSec < prev.time ? prev.time : bucketSec;

    try {
      if (granularity >= 60) {
        const bar =
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
        (series as ISeriesApi<'Candlestick'>).update({
          ...bar,
          time: bar.time as UTCTimestamp,
        });
      } else {
        lastPointRef.current = {
          time: nextTime,
          open: liveTick.quote,
          high: liveTick.quote,
          low: liveTick.quote,
          close: liveTick.quote,
        };
        (series as ISeriesApi<'Area'>).update({
          time: nextTime as UTCTimestamp,
          value: liveTick.quote,
        });
      }
    } catch {
      // ignore non-monotonic tick timing edge cases
    }
  }, [liveTick, granularity]);

  // Draw Accumulator Barriers & Open Contract Entry Lines
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

    for (const o of openOrders) {
      if (o.status !== 'OPEN' || o.symbol !== symbol || !o.entry_price) continue;
      const isUp = ['CALL', 'CALLE', 'ACCU', 'BUY', 'MULTUP'].includes(String(o.contract_type || '').toUpperCase());
      priceLinesRef.current.push(
        series.createPriceLine({
          price: Number(o.entry_price),
          color: isUp ? '#00A878' : '#FF444F',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `Entry ${o.contract_type}`,
        })
      );
    }
  }, [barriers?.high, barriers?.low, barriers?.crossed, openOrders, symbol]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 dark:border-[#2A2F3D] bg-white dark:bg-[#111319]`}
    />
  );
};
