import { db } from "./db";
import { stockSimProfiles, stockMeta, stockCandles, markets } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";

type PatternType = "UPTREND" | "DOWNTREND" | "VOLATILE" | "STABLE" | "CYCLICAL" | "RANDOM_WALK";

interface SimulationParams {
  patternType: PatternType;
  baseVolatility: number;
  drift: number;
  meanReversionSpeed: number;
  longTermMean: number;
  jumpFrequency: number;
  jumpMagnitude: number;
}

const PATTERN_CONFIGS: Record<PatternType, Partial<SimulationParams>> = {
  UPTREND: { drift: 0.0015, baseVolatility: 0.025, meanReversionSpeed: 0.02, jumpFrequency: 0.03, jumpMagnitude: 0.08 },
  DOWNTREND: { drift: -0.001, baseVolatility: 0.03, meanReversionSpeed: 0.02, jumpFrequency: 0.04, jumpMagnitude: 0.1 },
  VOLATILE: { drift: 0.0005, baseVolatility: 0.06, meanReversionSpeed: 0.05, jumpFrequency: 0.08, jumpMagnitude: 0.15 },
  STABLE: { drift: 0.0003, baseVolatility: 0.01, meanReversionSpeed: 0.15, jumpFrequency: 0.01, jumpMagnitude: 0.03 },
  CYCLICAL: { drift: 0, baseVolatility: 0.035, meanReversionSpeed: 0.12, jumpFrequency: 0.02, jumpMagnitude: 0.05 },
  RANDOM_WALK: { drift: 0.0002, baseVolatility: 0.03, meanReversionSpeed: 0.03, jumpFrequency: 0.03, jumpMagnitude: 0.07 },
};

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function simulateNextPrice(
  currentPrice: number,
  currentVolatility: number,
  params: SimulationParams,
  dayOfYear: number
): { price: number; volatility: number } {
  const { drift, baseVolatility, meanReversionSpeed, longTermMean, jumpFrequency, jumpMagnitude } = params;

  let cyclicalFactor = 0;
  if (params.patternType === "CYCLICAL") {
    cyclicalFactor = Math.sin((dayOfYear / 30) * Math.PI) * 0.002;
  }

  const volCluster = 0.85;
  const newVolatility = volCluster * currentVolatility + (1 - volCluster) * baseVolatility + Math.abs(gaussianRandom()) * 0.005;
  const cappedVolatility = Math.min(Math.max(newVolatility, baseVolatility * 0.3), baseVolatility * 3);

  const meanReversionPull = meanReversionSpeed * (longTermMean - currentPrice) / currentPrice;
  const randomShock = gaussianRandom() * cappedVolatility;
  const hasJump = Math.random() < jumpFrequency;
  const jumpEffect = hasJump ? (Math.random() > 0.5 ? 1 : -1) * jumpMagnitude * (0.5 + Math.random() * 0.5) : 0;

  const returnRate = drift + meanReversionPull + randomShock + jumpEffect + cyclicalFactor;
  let newPrice = currentPrice * (1 + returnRate);
  newPrice = Math.max(newPrice, 1);
  newPrice = Math.round(newPrice * 100) / 100;

  return { price: newPrice, volatility: cappedVolatility };
}

function generateOHLC(
  openPrice: number,
  closePrice: number,
  volatility: number
): { open: number; high: number; low: number; close: number; volume: number } {
  const range = Math.abs(closePrice - openPrice);
  const extraRange = range * (0.2 + Math.random() * 0.5) + volatility * openPrice * 0.5;
  
  const high = Math.max(openPrice, closePrice) + extraRange * Math.random();
  const low = Math.min(openPrice, closePrice) - extraRange * Math.random();

  const baseVolume = 1000 + Math.random() * 2000;
  const volumeMultiplier = 1 + volatility * 10 + (range / openPrice) * 20;
  const volume = Math.floor(baseVolume * volumeMultiplier);

  return {
    open: Math.round(openPrice * 100) / 100,
    high: Math.round(Math.max(high, openPrice, closePrice) * 100) / 100,
    low: Math.round(Math.max(Math.min(low, openPrice, closePrice), 1) * 100) / 100,
    close: Math.round(closePrice * 100) / 100,
    volume,
  };
}

export async function generateHistoricalCandles(marketId: string, initialPrice: number, patternType: PatternType, days: number = 180): Promise<void> {
  const existingCandles = await db.select().from(stockCandles).where(eq(stockCandles.marketId, marketId)).limit(1);
  if (existingCandles.length > 0) {
    return;
  }

  const config = PATTERN_CONFIGS[patternType];
  const params: SimulationParams = {
    patternType,
    baseVolatility: config.baseVolatility || 0.03,
    drift: config.drift || 0,
    meanReversionSpeed: config.meanReversionSpeed || 0.1,
    longTermMean: initialPrice,
    jumpFrequency: config.jumpFrequency || 0.03,
    jumpMagnitude: config.jumpMagnitude || 0.07,
  };

  let currentPrice = initialPrice * (0.7 + Math.random() * 0.6);
  let currentVolatility = params.baseVolatility;
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const candlesToInsert: Array<{
    id: string;
    marketId: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: Date;
  }> = [];

  for (let day = 0; day < days; day++) {
    const candleDate = new Date(startDate.getTime() + day * 24 * 60 * 60 * 1000);
    const dayOfYear = Math.floor((candleDate.getTime() - new Date(candleDate.getFullYear(), 0, 0).getTime()) / (24 * 60 * 60 * 1000));

    const openPrice = currentPrice;
    const { price: closePrice, volatility: newVolatility } = simulateNextPrice(currentPrice, currentVolatility, params, dayOfYear);
    currentPrice = closePrice;
    currentVolatility = newVolatility;

    const ohlc = generateOHLC(openPrice, closePrice, currentVolatility);

    candlesToInsert.push({
      id: randomUUID(),
      marketId,
      ...ohlc,
      timestamp: candleDate,
    });
  }

  if (candlesToInsert.length > 0) {
    for (let i = 0; i < candlesToInsert.length; i += 50) {
      const batch = candlesToInsert.slice(i, i + 50);
      await db.insert(stockCandles).values(batch);
    }
  }

  await db.update(stockMeta).set({ currentPrice }).where(eq(stockMeta.marketId, marketId));

  const existingProfile = await db.select().from(stockSimProfiles).where(eq(stockSimProfiles.marketId, marketId)).limit(1);
  if (existingProfile.length === 0) {
    await db.insert(stockSimProfiles).values({
      id: randomUUID(),
      marketId,
      patternType,
      baseVolatility: params.baseVolatility,
      drift: params.drift,
      meanReversionSpeed: params.meanReversionSpeed,
      longTermMean: params.longTermMean,
      jumpFrequency: params.jumpFrequency,
      jumpMagnitude: params.jumpMagnitude,
      lastPrice: currentPrice,
      lastVolatility: currentVolatility,
      lastUpdated: new Date(),
    });
  }
}

const VIBE_MARKET_ID = "200aaca8-b63f-416f-b2f1-d8dfc92cdb71";

export async function updateStockPrices(): Promise<void> {
  const profiles = await db.select().from(stockSimProfiles);
  
  const allStocks = await db.select().from(stockMeta);
  const highestNonVibePrice = Math.max(
    ...allStocks.filter(s => s.marketId !== VIBE_MARKET_ID).map(s => s.currentPrice)
  );
  
  for (const profile of profiles) {
    const isVibe = profile.marketId === VIBE_MARKET_ID;
    
    const params: SimulationParams = {
      patternType: profile.patternType as PatternType,
      baseVolatility: isVibe ? 0.015 : profile.baseVolatility,
      drift: isVibe ? 0.006 : profile.drift,
      meanReversionSpeed: profile.meanReversionSpeed,
      longTermMean: profile.longTermMean,
      jumpFrequency: isVibe ? 0.04 : profile.jumpFrequency,
      jumpMagnitude: isVibe ? 0.15 : profile.jumpMagnitude,
    };

    const now = new Date();
    const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / (24 * 60 * 60 * 1000));
    let { price: newPrice, volatility: newVolatility } = simulateNextPrice(profile.lastPrice, profile.lastVolatility, params, dayOfYear);
    
    if (isVibe) {
      const minVibePrice = highestNonVibePrice * 1.5;
      if (newPrice < minVibePrice) {
        newPrice = minVibePrice + (Math.random() * 10);
      }
      if (Math.random() < 0.3) {
        newPrice *= 1 + (Math.random() * 0.02);
      }
      newPrice = Math.round(newPrice * 100) / 100;
    }

    await db.update(stockSimProfiles).set({
      lastPrice: newPrice,
      lastVolatility: newVolatility,
      lastUpdated: now,
    }).where(eq(stockSimProfiles.id, profile.id));

    await db.update(stockMeta).set({ currentPrice: newPrice }).where(eq(stockMeta.marketId, profile.marketId));

    const lastCandle = await db.select().from(stockCandles)
      .where(eq(stockCandles.marketId, profile.marketId))
      .orderBy(desc(stockCandles.timestamp))
      .limit(1);

    if (lastCandle.length > 0) {
      const lastCandleDate = new Date(lastCandle[0].timestamp);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (lastCandleDate < todayStart) {
        const ohlc = generateOHLC(profile.lastPrice, newPrice, newVolatility);
        await db.insert(stockCandles).values({
          id: randomUUID(),
          marketId: profile.marketId,
          ...ohlc,
          timestamp: todayStart,
        });
      } else {
        const currentCandle = lastCandle[0];
        await db.update(stockCandles).set({
          high: Math.max(currentCandle.high, newPrice),
          low: Math.min(currentCandle.low, newPrice),
          close: newPrice,
          volume: currentCandle.volume + Math.floor(Math.random() * 100 + 50),
        }).where(eq(stockCandles.id, currentCandle.id));
      }
    }
  }
}

let simulationInterval: ReturnType<typeof setInterval> | null = null;

export function startStockSimulation(intervalMinutes: number = 5): void {
  if (simulationInterval) {
    clearInterval(simulationInterval);
  }

  console.log(`Starting stock price simulation (updates every ${intervalMinutes} minutes)`);
  
  updateStockPrices().catch(console.error);

  simulationInterval = setInterval(() => {
    updateStockPrices().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

export function stopStockSimulation(): void {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    console.log("Stock simulation stopped");
  }
}

export function assignPatternType(index: number): PatternType {
  const patterns: PatternType[] = ["UPTREND", "DOWNTREND", "VOLATILE", "STABLE", "CYCLICAL", "RANDOM_WALK"];
  return patterns[index % patterns.length];
}
