import { ATTENDANCE_THRESHOLD_PERCENT } from '@shikshya/shared';
import { useReducedMotion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const SKY = 'rgb(var(--primary))';
const INK = 'rgb(var(--foreground))';
const MUTED = 'rgb(var(--muted-foreground))';
const GRID = 'rgb(var(--border))';

const axisTick = { fontSize: 12, fill: MUTED };

interface TooltipPayload {
  active?: boolean;
  label?: string | number;
  payload?: { value?: number | null }[];
}

/** Value and label stay in text colours: the colour of a mark identifies it, not its words. */
function ChartTooltip({
  active,
  label,
  payload,
  format,
}: TooltipPayload & { format: (value: number) => string }) {
  const value = payload?.[0]?.value;
  if (!active || value === undefined || value === null) return null;
  return (
    <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lifted">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold">{format(value)}</p>
    </div>
  );
}

/** Every chart also offers its numbers as a table, for screen readers and exact values. */
function DataTableView({
  label,
  rows,
  valueHeader,
}: {
  label: string;
  rows: { name: string; value: ReactNode }[];
  valueHeader: string;
}) {
  return (
    <details className="group mt-2 text-sm">
      <summary className="cursor-pointer rounded-md text-primary-dark">View as table</summary>
      <div className="mt-2 max-h-56 animate-rise overflow-y-auto rounded-xl border">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-primary-soft">
            <tr>
              <th scope="col" className="px-3 py-1.5 font-semibold">
                {label}
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-semibold">
                {valueHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t">
                <td className="px-3 py-1.5">{row.name}</td>
                <td className="px-3 py-1.5 text-right">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TrendLineChart({
  data,
  ariaLabel,
  xHeader,
  valueHeader,
  yDomain,
  format,
  showAttendanceThreshold = false,
}: {
  data: { name: string; value: number | null }[];
  ariaLabel: string;
  xHeader: string;
  valueHeader: string;
  yDomain: [number, number];
  format: (value: number) => string;
  showAttendanceThreshold?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // React's ids contain colons, which a url(#...) reference cannot use.
  const fillId = `area-${useId().replace(/:/g, '')}`;
  return (
    <div>
      <div className="h-56" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SKY} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SKY} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="name"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              minTickGap={32}
            />
            <YAxis domain={yDomain} tick={axisTick} tickLine={false} axisLine={false} />
            {showAttendanceThreshold && (
              <ReferenceLine
                y={ATTENDANCE_THRESHOLD_PERCENT}
                stroke={INK}
                strokeDasharray="4 4"
                label={{
                  value: `${ATTENDANCE_THRESHOLD_PERCENT}% required`,
                  position: 'insideBottomRight',
                  fontSize: 11,
                  fill: MUTED,
                }}
              />
            )}
            <Tooltip content={<ChartTooltip format={format} />} cursor={{ stroke: GRID }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={SKY}
              strokeWidth={2}
              fill={`url(#${fillId})`}
              connectNulls
              dot={data.length <= 12 ? { r: 4, fill: SKY, strokeWidth: 0 } : false}
              activeDot={{ r: 5, stroke: 'rgb(var(--background))', strokeWidth: 2 }}
              isAnimationActive={!reduceMotion}
              animationDuration={1000}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <DataTableView
        label={xHeader}
        valueHeader={valueHeader}
        rows={data.map((d) => ({
          name: d.name,
          value: d.value === null ? 'No classes' : format(d.value),
        }))}
      />
    </div>
  );
}

export function CountBarChart({
  data,
  ariaLabel,
  xHeader,
  valueHeader,
  format = String,
  formatTick,
}: {
  data: { name: string; value: number }[];
  ariaLabel: string;
  xHeader: string;
  valueHeader: string;
  /** How a value reads in the tooltip and table. */
  format?: (value: number) => string;
  /** A shorter form for the axis, for large numbers. */
  formatTick?: (value: number) => string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div>
      <div className="h-56" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 12, right: 8, bottom: 0, left: formatTick ? -8 : -24 }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis
              allowDecimals={false}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatTick}
            />
            <Tooltip
              content={<ChartTooltip format={format} />}
              cursor={{ fill: 'rgb(var(--primary-soft))' }}
            />
            <Bar
              dataKey="value"
              fill={SKY}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={!reduceMotion}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTableView
        label={xHeader}
        valueHeader={valueHeader}
        rows={data.map((d) => ({ name: d.name, value: format(d.value) }))}
      />
    </div>
  );
}
