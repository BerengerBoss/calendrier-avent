import React, { useState } from 'react';

export interface BarDatum {
  key: string;
  label: string; // x-axis label
  value: number;
  tooltip: string; // full hover text
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  /** Show one x label every N bars (auto when omitted). */
  labelEvery?: number;
  emptyText?: string;
  ariaLabel: string;
}

/** Single-series bar chart, HTML-only, with per-bar hover tooltip. */
export const BarChart: React.FC<BarChartProps> = ({
  data,
  height = 160,
  labelEvery,
  emptyText = 'Pas encore de données.',
  ariaLabel,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 12));

  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div
        className="flex items-center justify-center text-xs text-[#64748B] italic rounded-xl bg-[#F8FAFC] border border-dashed border-[#CBD5E1]"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  return (
    <div className="w-full" role="img" aria-label={ariaLabel}>
      <div className="relative flex" style={{ height }}>
        {/* y axis max */}
        <div className="w-8 shrink-0 flex flex-col justify-between text-[10px] text-[#94A3B8] font-semibold pr-1 text-right">
          <span>{max}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1 flex items-end gap-[2px] border-b border-[#CBD5E1]">
          {/* gridline at max */}
          <div className="absolute left-0 right-0 top-0 border-t border-dashed border-[#E2E8F0] pointer-events-none" />
          {data.map((d, i) => {
            const h = d.value === 0 ? 0 : Math.max(2, (d.value / max) * (height - 4));
            return (
              <div
                key={d.key}
                className="relative flex-1 h-full flex items-end cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((cur) => (cur === i ? null : cur))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={d.tooltip}
              >
                <div
                  className={`w-full rounded-t-[4px] transition-colors ${
                    hover === i ? 'bg-[#3F6212]' : 'bg-[#65A30D]'
                  }`}
                  style={{ height: h }}
                />
                {hover === i && (
                  <div
                    className={`absolute bottom-full mb-1.5 z-10 whitespace-nowrap rounded-lg bg-[#0F172A] text-white text-[11px] font-semibold px-2 py-1 shadow-md pointer-events-none ${
                      i < data.length / 2 ? 'left-0' : 'right-0'
                    }`}
                  >
                    {d.tooltip}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex pl-8 mt-1 gap-[2px]">
        {data.map((d, i) => (
          <div
            key={d.key}
            className="flex-1 text-center text-[10px] text-[#64748B] font-semibold overflow-visible whitespace-nowrap"
          >
            {i % every === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
};
