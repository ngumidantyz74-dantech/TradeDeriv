import React, { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useAnalyser, type AnalyserSetupData } from '../AnalyserContext';

interface AnalyserChartProps {
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  setup: AnalyserSetupData | null;
  height?: number;
}

export const AnalyserChart: React.FC<AnalyserChartProps> = ({ candles, setup, height = 430 }) => {
  const { theme } = useAnalyser();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = theme === 'dark';
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#181C25' : '#FFFFFF' },
        textColor: isDark ? '#94A3B8' : '#475569',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: isDark ? '#2A2F3D' : '#E2E8F0' },
      timeScale: { borderColor: isDark ? '#2A2F3D' : '#E2E8F0', timeVisible: true, secondsVisible: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#00A878',
      downColor: '#FF444F',
      borderVisible: false,
      wickUpColor: '#00A878',
      wickDownColor: '#FF444F',
    });

    const formatted = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    if (formatted.length > 0) {
      series.setData(formatted);
      chart.timeScale().fitContent();
    }

    if (setup && setup.direction !== 'WAIT') {
      if (setup.entryPrice > 0) {
        series.createPriceLine({
          price: setup.entryPrice,
          color: '#1958B7',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `ENTRY ${setup.direction}`,
        });
      }
      if (setup.stopLoss > 0) {
        series.createPriceLine({
          price: setup.stopLoss,
          color: '#FF444F',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SL',
        });
      }
      if (setup.tp1 > 0) {
        series.createPriceLine({
          price: setup.tp1,
          color: '#00A878',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'TP1',
        });
      }
      if (setup.tp2 > 0) {
        series.createPriceLine({
          price: setup.tp2,
          color: '#00A878',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP2',
        });
      }
      if (setup.tp3 > 0) {
        series.createPriceLine({
          price: setup.tp3,
          color: '#10B981',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'TP3',
        });
      }
    }

    if (setup) {
      for (const s of (setup.supportLevels || []).slice(0, 2)) {
        series.createPriceLine({
          price: s,
          color: '#22C55E',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: false,
          title: 'Support',
        });
      }
      for (const r of (setup.resistanceLevels || []).slice(0, 2)) {
        series.createPriceLine({
          price: r,
          color: '#F59E0B',
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: false,
          title: 'Resistance',
        });
      }
    }

    chartRef.current = chart;
    const ro = new ResizeObserver((entries) => {
      if (entries[0] && chartRef.current) {
        chartRef.current.applyOptions({ width: entries[0].contentRect.width });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, setup, theme, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};
