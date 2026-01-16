import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockCandle } from "@shared/schema";

interface CandlestickChartProps {
  marketId: string;
}

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
  bodyTop: number;
  bodyBottom: number;
  bodyHeight: number;
  wickTop: number;
  wickBottom: number;
}

export function CandlestickChart({ marketId }: CandlestickChartProps) {
  const { data: candles, isLoading } = useQuery<StockCandle[]>({
    queryKey: ["/api/stocks", marketId, "candles"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!candles || candles.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No price history available
      </div>
    );
  }

  const chartData: CandleData[] = candles.map((candle) => {
    const isUp = candle.close >= candle.open;
    const bodyTop = Math.max(candle.open, candle.close);
    const bodyBottom = Math.min(candle.open, candle.close);
    
    return {
      date: new Date(candle.timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      isUp,
      bodyTop,
      bodyBottom,
      bodyHeight: Math.max(bodyTop - bodyBottom, 0.01),
      wickTop: candle.high,
      wickBottom: candle.low,
    };
  });

  const minPrice = Math.min(...chartData.map((d) => d.low)) * 0.98;
  const maxPrice = Math.max(...chartData.map((d) => d.high)) * 1.02;

  const CustomCandlestick = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (!payload) return null;

    const isUp = payload.isUp;
    const fillColor = isUp ? "#22c55e" : "#ef4444";
    const strokeColor = isUp ? "#16a34a" : "#dc2626";
    
    const candleWidth = Math.max(width * 0.8, 4);
    const wickWidth = 1.5;
    const xCenter = x + width / 2;
    
    const yScale = height / (maxPrice - minPrice);
    const candleBodyTop = y + (maxPrice - payload.bodyTop) * yScale;
    const candleBodyHeight = payload.bodyHeight * yScale;
    const wickTopY = y + (maxPrice - payload.high) * yScale;
    const wickBottomY = y + (maxPrice - payload.low) * yScale;

    return (
      <g>
        <line
          x1={xCenter}
          y1={wickTopY}
          x2={xCenter}
          y2={wickBottomY}
          stroke={strokeColor}
          strokeWidth={wickWidth}
        />
        <rect
          x={xCenter - candleWidth / 2}
          y={candleBodyTop}
          width={candleWidth}
          height={Math.max(candleBodyHeight, 2)}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={0.5}
          rx={1}
        />
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;
    
    const data = payload[0].payload;
    const isUp = data.close >= data.open;
    
    return (
      <div className="rounded-lg border bg-popover p-3 text-sm shadow-lg">
        <p className="font-medium text-foreground">{data.date}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
          <span className="text-muted-foreground">Open:</span>
          <span className="text-right">${data.open.toFixed(2)}</span>
          <span className="text-muted-foreground">High:</span>
          <span className="text-right">${data.high.toFixed(2)}</span>
          <span className="text-muted-foreground">Low:</span>
          <span className="text-right">${data.low.toFixed(2)}</span>
          <span className="text-muted-foreground">Close:</span>
          <span className={`text-right ${isUp ? "text-green-500" : "text-red-500"}`}>
            ${data.close.toFixed(2)}
          </span>
          <span className="text-muted-foreground">Volume:</span>
          <span className="text-right">{data.volume.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-64" data-testid="candlestick-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="bodyHeight"
            shape={<CustomCandlestick />}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
