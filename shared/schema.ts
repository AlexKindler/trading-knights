import { pgTable, text, varchar, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// User roles and status
export type UserRole = "STUDENT" | "ADMIN";
export type UserStatus = "PENDING_VERIFICATION" | "VERIFIED" | "SUSPENDED";
export type MarketType = "PREDICTION" | "STOCK";
export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED" | "HIDDEN";
export type TradeSide = "BUY" | "SELL";
export type BalanceEventType = "STARTING_CREDIT" | "BANKRUPTCY_RESET" | "ADMIN_ADJUST" | "TRADE";
export type ReportTargetType = "MARKET" | "COMMENT" | "USER";
export type ReportStatus = "PENDING" | "REVIEWED" | "DISMISSED";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  grade: text("grade"),
  role: text("role").notNull().default("STUDENT"),
  status: text("status").notNull().default("PENDING_VERIFICATION"),
  emailVerifiedAt: timestamp("email_verified_at"),
  balance: integer("balance").notNull().default(0),
  disclaimerAcceptedAt: timestamp("disclaimer_accepted_at"),
  lastBankruptcyReset: timestamp("last_bankruptcy_reset"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Email verification tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

// Markets (both prediction and stock)
export const markets = pgTable("markets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("OPEN"),
  closeAt: timestamp("close_at"),
  resolveAt: timestamp("resolve_at"),
  resolutionRule: text("resolution_rule"),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Outcomes (for prediction markets - YES/NO or multiple choice)
export const outcomes = pgTable("outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketId: varchar("market_id").notNull(),
  label: text("label").notNull(),
  currentPrice: real("current_price").notNull().default(0.5),
});

// Stock metadata (for stock markets)
export const stockMeta = pgTable("stock_meta", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketId: varchar("market_id").notNull().unique(),
  ticker: text("ticker").notNull().unique(),
  initialPrice: real("initial_price").notNull(),
  currentPrice: real("current_price").notNull(),
  floatSupply: integer("float_supply").notNull(),
  virtualLiquidity: real("virtual_liquidity").notNull().default(10000),
});

// Trades
export const trades = pgTable("trades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  marketId: varchar("market_id").notNull(),
  outcomeId: varchar("outcome_id"),
  side: text("side").notNull(),
  qty: integer("qty").notNull(),
  price: real("price").notNull(),
  total: real("total").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Positions
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  marketId: varchar("market_id").notNull(),
  outcomeId: varchar("outcome_id"),
  qty: integer("qty").notNull().default(0),
  avgCost: real("avg_cost").notNull().default(0),
});

// Price snapshots for charts
export const priceSnapshots = pgTable("price_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketId: varchar("market_id").notNull(),
  outcomeId: varchar("outcome_id"),
  price: real("price").notNull(),
  volume: integer("volume").notNull().default(0),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Comments
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  marketId: varchar("market_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  hiddenAt: timestamp("hidden_at"),
});

// Reports
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reporterId: varchar("reporter_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Resolutions (prediction markets)
export const resolutions = pgTable("resolutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketId: varchar("market_id").notNull().unique(),
  resolvedBy: varchar("resolved_by").notNull(),
  winningOutcomeId: varchar("winning_outcome_id").notNull(),
  note: text("note"),
  resolvedAt: timestamp("resolved_at").defaultNow().notNull(),
});

// Balance events log
export const balanceEvents = pgTable("balance_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  displayName: true,
  grade: true,
}).extend({
  email: z.string().email().refine((email) => email.endsWith("@menloschool.org"), {
    message: "Email must end with @menloschool.org",
  }),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(2, "Display name must be at least 2 characters"),
  grade: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const insertMarketSchema = createInsertSchema(markets).pick({
  type: true,
  title: true,
  description: true,
  category: true,
  closeAt: true,
  resolveAt: true,
  resolutionRule: true,
});

export const insertStockSchema = z.object({
  ticker: z.string().min(3).max(5).regex(/^[A-Z]+$/, "Ticker must be 3-5 uppercase letters"),
  name: z.string().min(2),
  description: z.string().min(10),
  category: z.string(),
  initialPrice: z.number().min(1).max(1000),
  floatSupply: z.number().min(100).max(1000000),
});

export const insertTradeSchema = z.object({
  marketId: z.string(),
  outcomeId: z.string().optional(),
  side: z.enum(["BUY", "SELL"]),
  qty: z.number().int().min(1).max(1000),
});

export const insertCommentSchema = z.object({
  marketId: z.string(),
  text: z.string().min(1).max(500),
});

export const insertReportSchema = z.object({
  targetType: z.enum(["MARKET", "COMMENT", "USER"]),
  targetId: z.string(),
  reason: z.string().min(10).max(500),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Market = typeof markets.$inferSelect;
export type Outcome = typeof outcomes.$inferSelect;
export type StockMeta = typeof stockMeta.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type Position = typeof positions.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Resolution = typeof resolutions.$inferSelect;
export type BalanceEvent = typeof balanceEvents.$inferSelect;
export type PriceSnapshot = typeof priceSnapshots.$inferSelect;

// Leaderboard types
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  grade?: string;
  totalValue: number;
  cashBalance: number;
  positionsValue: number;
  changePercent: number;
  isCurrentUser?: boolean;
}

// Market with outcomes/stock meta
export interface MarketWithDetails extends Market {
  outcomes?: Outcome[];
  stockMeta?: StockMeta;
  creatorName?: string;
}

// Portfolio summary
export interface PortfolioSummary {
  totalValue: number;
  cashBalance: number;
  positionsValue: number;
  totalPnL: number;
  positions: PositionWithDetails[];
  recentTrades: Trade[];
}

export interface PositionWithDetails extends Position {
  market?: Market;
  outcome?: Outcome;
  stockMeta?: StockMeta;
  currentValue: number;
  pnl: number;
}
