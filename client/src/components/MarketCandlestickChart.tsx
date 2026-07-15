import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarketCandle } from "@shared/schema";

interface MarketCandlestickChartProps {
  marketId: string;
  outcomeId: string;
  outcomeLabel: string;
}

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
  // [low, high] range drives the recharts Bar so the custom shape receives a
  // rectangle spanning the full wick, mapped onto the shared price y-scale.
  range: [number, number];
}

export function MarketCandlestickChart({ marketId, outcomeId, outcomeLabel }: MarketCandlestickChartProps) {
  const { data: candles, isLoading } = useQuery<MarketCandle[]>({
    queryKey: ["/api/markets", marketId, "outcomes", outcomeId, "candles"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!candles || candles.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-muted-foreground">
        No price history available
      </div>
    );
  }

  const chartData: CandleData[] = candles.map((candle) => {
    const isUp = candle.close >= candle.open;

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
      range: [candle.low, candle.high],
    };
  });

  const minPrice = Math.min(...chartData.map((d) => d.low)) * 0.95;
  const maxPrice = Math.max(...chartData.map((d) => d.high)) * 1.05;

  const CustomCandlestick = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (!payload || width == null || height == null) return null;

    const { open, high, low, close } = payload as CandleData;
    const isUp = close >= open;
    const color = isUp ? "#22c55e" : "#ef4444";

    // recharts maps the [low, high] range bar onto the price axis:
    //   y            → pixel of `high`
    //   y + height   → pixel of `low`
    const span = high - low;
    const priceToY = (price: number) =>
      span > 0 ? y + ((high - price) / span) * height : y + height / 2;

    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);
    const bodyTopY = priceToY(bodyTop);
    const bodyHeightPx = Math.max(priceToY(bodyBottom) - bodyTopY, 1);

    const candleWidth = Math.max(width * 0.6, 3);
    const xCenter = x + width / 2;

    return (
      <g>
        <line
          x1={xCenter}
          y1={y}
          x2={xCenter}
          y2={y + height}
          stroke={color}
          strokeWidth={1}
        />
        <rect
          x={xCenter - candleWidth / 2}
          y={bodyTopY}
          width={candleWidth}
          height={bodyHeightPx}
          fill={color}
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
        <p className="font-medium text-foreground">{data.date} - {outcomeLabel}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
          <span className="text-muted-foreground">Open:</span>
          <span className="text-right">{(data.open * 100).toFixed(0)}¢</span>
          <span className="text-muted-foreground">High:</span>
          <span className="text-right">{(data.high * 100).toFixed(0)}¢</span>
          <span className="text-muted-foreground">Low:</span>
          <span className="text-right">{(data.low * 100).toFixed(0)}¢</span>
          <span className="text-muted-foreground">Close:</span>
          <span className={`text-right ${isUp ? "text-green-500" : "text-red-500"}`}>
            {(data.close * 100).toFixed(0)}¢
          </span>
          <span className="text-muted-foreground">Volume:</span>
          <span className="text-right">{data.volume.toLocaleString()}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="h-80" data-testid="market-candlestick-chart">
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
            tickFormatter={(v) => `${(v * 100).toFixed(0)}¢`}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="range"
            shape={<CustomCandlestick />}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
