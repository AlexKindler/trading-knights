import {
  type User,
  type InsertUser,
  type Market,
  type Outcome,
  type StockMeta,
  type Trade,
  type Position,
  type Comment,
  type Report,
  type Resolution,
  type BalanceEvent,
  type MarketWithDetails,
  type LeaderboardEntry,
  type PortfolioSummary,
  type PositionWithDetails,
  type StockCandle,
  type MarketCandle,
  type Game,
  type PolymarketLink,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser & { id?: string }): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;

  // Email verification
  createVerificationToken(userId: string): Promise<string>;
  verifyToken(token: string): Promise<User | null>;

  // Password reset
  createPasswordResetToken(userId: string): Promise<string>;
  verifyPasswordResetToken(token: string): Promise<User | null>;
  markPasswordResetTokenUsed(token: string): Promise<void>;

  // Markets
  getMarkets(type?: string): Promise<MarketWithDetails[]>;
  getMarket(id: string): Promise<MarketWithDetails | undefined>;
  createMarket(market: Omit<Market, "id" | "createdAt">): Promise<Market>;
  updateMarket(id: string, updates: Partial<Market>): Promise<Market | undefined>;

  // Outcomes
  createOutcome(outcome: Omit<Outcome, "id">): Promise<Outcome>;
  getOutcomesByMarket(marketId: string): Promise<Outcome[]>;
  updateOutcome(id: string, updates: Partial<Outcome>): Promise<Outcome | undefined>;

  // Stock meta
  createStockMeta(stockMeta: Omit<StockMeta, "id">): Promise<StockMeta>;
  getStockMeta(marketId: string): Promise<StockMeta | undefined>;
  updateStockMeta(marketId: string, updates: Partial<StockMeta>): Promise<StockMeta | undefined>;

  // Trading
  createTrade(trade: Omit<Trade, "id" | "createdAt">): Promise<Trade>;
  getTradesByUser(userId: string): Promise<Trade[]>;

  // Positions
  getPosition(userId: string, marketId: string, outcomeId?: string): Promise<Position | undefined>;
  upsertPosition(position: Omit<Position, "id">): Promise<Position>;
  getPositionsByUser(userId: string): Promise<Position[]>;

  // Comments
  getCommentsByMarket(marketId: string): Promise<Comment[]>;
  createComment(comment: Omit<Comment, "id" | "createdAt" | "hiddenAt">): Promise<Comment>;

  // Reports
  createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report>;
  getReports(): Promise<Report[]>;
  updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined>;

  // Balance events
  logBalanceEvent(event: Omit<BalanceEvent, "id" | "createdAt">): Promise<BalanceEvent>;

  // Leaderboard
  getLeaderboard(timeFilter?: string): Promise<LeaderboardEntry[]>;

  // Portfolio
  getPortfolio(userId: string): Promise<PortfolioSummary>;

  // Stock Candles
  getStockCandles(marketId: string, limit?: number): Promise<StockCandle[]>;
  addStockCandle(candle: Omit<StockCandle, "id">): Promise<StockCandle>;
  updateLatestCandle(marketId: string, price: number, volume: number): Promise<void>;

  // Market Candles (for prediction markets)
  getMarketCandles(marketId: string, outcomeId: string, limit?: number): Promise<MarketCandle[]>;

  // Games
  createGame(game: Partial<Game>): Promise<Game>;
  getGame(id: string): Promise<Game | undefined>;
  getAllGames(): Promise<Game[]>;
  updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined>;
  deleteGame(id: string): Promise<boolean>;

  // Polymarket links
  createPolymarketLink(link: Omit<PolymarketLink, "id" | "lastSynced">): Promise<PolymarketLink>;
  getPolymarketLink(marketId: string): Promise<PolymarketLink | undefined>;
  getPolymarketMarkets(): Promise<MarketWithDetails[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private verificationTokens: Map<string, { userId: string; expiresAt: Date }> = new Map();
  private passwordResetTokens: Map<string, { userId: string; expiresAt: Date; used: boolean }> = new Map();
  private markets: Map<string, Market> = new Map();
  private outcomes: Map<string, Outcome> = new Map();
  private stockMetas: Map<string, StockMeta> = new Map();
  private trades: Map<string, Trade> = new Map();
  private positions: Map<string, Position> = new Map();
  private comments: Map<string, Comment> = new Map();
  private reports: Map<string, Report> = new Map();
  private balanceEvents: Map<string, BalanceEvent> = new Map();
  private stockCandles: Map<string, StockCandle[]> = new Map();
  private marketCandles: Map<string, MarketCandle[]> = new Map();
  private games: Map<string, Game> = new Map();
  private polymarketLinks: Map<string, PolymarketLink> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Create admin user
    const adminId = randomUUID();
    this.users.set(adminId, {
      id: adminId,
      email: "admin@menloschool.org",
      password: this.hashPassword("admin123"),
      displayName: "Admin",
      grade: "Faculty",
      role: "ADMIN",
      status: "VERIFIED",
      emailVerifiedAt: new Date(),
      balance: 10000,
      disclaimerAcceptedAt: new Date(),
      lastBankruptcyReset: null,
      hasMkAiAccess: false,
      createdAt: new Date(),
    });

    // Create demo student
    const studentId = randomUUID();
    this.users.set(studentId, {
      id: studentId,
      email: "student@menloschool.org",
      password: this.hashPassword("student123"),
      displayName: "Demo Student",
      grade: "Junior",
      role: "STUDENT",
      status: "VERIFIED",
      emailVerifiedAt: new Date(),
      balance: 1250,
      disclaimerAcceptedAt: new Date(),
      lastBankruptcyReset: null,
      hasMkAiAccess: false,
      createdAt: new Date(),
    });

    // Create more demo users for leaderboard
    const demoUsers = [
      { name: "Alex Chen", grade: "Senior", balance: 2340 },
      { name: "Jordan Smith", grade: "Junior", balance: 1890 },
      { name: "Taylor Kim", grade: "Sophomore", balance: 1650 },
      { name: "Casey Brown", grade: "Senior", balance: 1420 },
      { name: "Morgan Lee", grade: "Freshman", balance: 980 },
      { name: "Riley Wang", grade: "Junior", balance: 1780 },
      { name: "Sam Patel", grade: "Senior", balance: 2100 },
    ];

    demoUsers.forEach((u, i) => {
      const id = randomUUID();
      this.users.set(id, {
        id,
        email: `demo${i + 1}@menloschool.org`,
        password: this.hashPassword("demo123"),
        displayName: u.name,
        grade: u.grade,
        role: "STUDENT",
        status: "VERIFIED",
        emailVerifiedAt: new Date(),
        balance: u.balance,
        disclaimerAcceptedAt: new Date(),
        lastBankruptcyReset: null,
        hasMkAiAccess: false,
        createdAt: new Date(),
      });
    });

    // Create prediction markets
    const predictionMarkets = [
      {
        title: "Will the basketball team win the championship?",
        description: "This market resolves YES if the Menlo basketball team wins the state championship this season.",
        category: "Sports",
        closeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        resolutionRule: "Based on official game results",
      },
      {
        title: "Will the spring musical sell out opening night?",
        description: "Resolves YES if all tickets for opening night are sold before the show.",
        category: "Events",
        closeAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        resolutionRule: "Based on ticket sales records",
      },
      {
        title: "Will the average AP Calc score be above 4.0?",
        description: "This market resolves YES if the class average on the AP Calculus exam exceeds 4.0.",
        category: "Academics",
        closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        resolutionRule: "Based on College Board results",
      },
      {
        title: "Who will win student body president?",
        description: "Predict the outcome of the upcoming student body elections.",
        category: "Elections",
        closeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        resolutionRule: "Based on official election results",
      },
      {
        title: "Will Spirit Week have over 80% participation?",
        description: "Resolves YES if more than 80% of students participate in at least one Spirit Week event.",
        category: "Events",
        closeAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
        resolutionRule: "Based on attendance records",
      },
    ];

    predictionMarkets.forEach((m) => {
      const marketId = randomUUID();
      this.markets.set(marketId, {
        id: marketId,
        type: "PREDICTION",
        title: m.title,
        description: m.description,
        category: m.category,
        status: "OPEN",
        closeAt: m.closeAt,
        resolveAt: new Date(m.closeAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        resolutionRule: m.resolutionRule,
        createdBy: adminId,
        createdAt: new Date(),
      });

      // Create YES/NO outcomes
      const yesId = randomUUID();
      const noId = randomUUID();
      const yesPrice = 0.3 + Math.random() * 0.4;
      this.outcomes.set(yesId, {
        id: yesId,
        marketId,
        label: "YES",
        currentPrice: yesPrice,
      });
      this.outcomes.set(noId, {
        id: noId,
        marketId,
        label: "NO",
        currentPrice: 1 - yesPrice,
      });

      // Generate historical candle data for YES outcome
      const yesCandles: MarketCandle[] = [];
      const noCandles: MarketCandle[] = [];
      let currentYesPrice = yesPrice;
      const now = new Date();
      
      for (let i = 29; i >= 0; i--) {
        const candleDate = new Date(now);
        candleDate.setDate(candleDate.getDate() - i);
        candleDate.setHours(9, 30, 0, 0);
        
        const changePercent = (Math.random() - 0.5) * 0.08;
        const open = currentYesPrice;
        const close = Math.max(0.05, Math.min(0.95, currentYesPrice * (1 + changePercent)));
        const high = Math.min(0.98, Math.max(open, close) * (1 + Math.random() * 0.02));
        const low = Math.max(0.02, Math.min(open, close) * (1 - Math.random() * 0.02));
        const volume = Math.floor(50 + Math.random() * 500);
        
        yesCandles.push({
          id: randomUUID(),
          marketId,
          outcomeId: yesId,
          open,
          high,
          low,
          close,
          volume,
          timestamp: candleDate,
        });
        
        noCandles.push({
          id: randomUUID(),
          marketId,
          outcomeId: noId,
          open: 1 - open,
          high: 1 - low,
          low: 1 - high,
          close: 1 - close,
          volume,
          timestamp: candleDate,
        });
        
        currentYesPrice = close;
      }
      
      this.marketCandles.set(`${marketId}:${yesId}`, yesCandles);
      this.marketCandles.set(`${marketId}:${noId}`, noCandles);
    });

    // Create stock markets
    const stocks = [
      { ticker: "BIZ", name: "Business Club", category: "Clubs", price: 40, description: "Trade shares of the Menlo Business Club. Performance based on competition results and entrepreneurship initiatives." },
      { ticker: "FISH", name: "Fishing Club", category: "Clubs", price: 25, description: "Trade shares of the Menlo Fishing Club. Value based on catch rates and outdoor activity engagement." },
      { ticker: "GAME", name: "Gaming Club", category: "Clubs", price: 35, description: "Trade shares of the Menlo Gaming Club. Value based on tournament performance and esports engagement." },
      { ticker: "RUN", name: "Run Club", category: "Clubs", price: 30, description: "Trade shares of the Menlo Run Club. Performance based on race results and membership participation." },
    ];

    stocks.forEach((s) => {
      const marketId = randomUUID();
      this.markets.set(marketId, {
        id: marketId,
        type: "STOCK",
        title: s.name,
        description: s.description,
        category: s.category,
        status: "OPEN",
        closeAt: null,
        resolveAt: null,
        resolutionRule: null,
        createdBy: adminId,
        createdAt: new Date(),
      });

      const priceVariation = s.price * (0.9 + Math.random() * 0.2);
      this.stockMetas.set(marketId, {
        id: randomUUID(),
        marketId,
        ticker: s.ticker,
        initialPrice: s.price,
        currentPrice: priceVariation,
        floatSupply: 10000,
        virtualLiquidity: 100000,
      });

      // Generate historical candle data for this stock
      const candles: StockCandle[] = [];
      let currentPrice = s.price;
      const now = new Date();
      
      // Generate 30 days of candle data (one candle per day)
      for (let i = 29; i >= 0; i--) {
        const candleDate = new Date(now);
        candleDate.setDate(candleDate.getDate() - i);
        candleDate.setHours(9, 30, 0, 0);
        
        // Random walk for price movement
        const volatility = 0.08;
        const changePercent = (Math.random() - 0.5) * volatility;
        const open = currentPrice;
        const close = currentPrice * (1 + changePercent);
        const high = Math.max(open, close) * (1 + Math.random() * 0.03);
        const low = Math.min(open, close) * (1 - Math.random() * 0.03);
        const volume = Math.floor(100 + Math.random() * 900);
        
        candles.push({
          id: randomUUID(),
          marketId,
          open,
          high,
          low,
          close,
          volume,
          timestamp: candleDate,
        });
        
        currentPrice = close;
      }
      
      this.stockCandles.set(marketId, candles);
    });
  }

  private hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.email === email);
  }

  async createUser(user: InsertUser & { id?: string }): Promise<User> {
    const id = user.id || randomUUID();
    const newUser: User = {
      id,
      email: user.email,
      password: this.hashPassword(user.password),
      displayName: user.displayName,
      grade: user.grade || null,
      role: "STUDENT",
      status: "PENDING_VERIFICATION",
      emailVerifiedAt: null,
      balance: 0,
      disclaimerAcceptedAt: null,
      lastBankruptcyReset: null,
      hasMkAiAccess: false,
      createdAt: new Date(),
    };
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createVerificationToken(userId: string): Promise<string> {
    const token = randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    this.verificationTokens.set(tokenHash, {
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return token;
  }

  async verifyToken(token: string): Promise<User | null> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = this.verificationTokens.get(tokenHash);
    if (!record) return null;
    if (record.expiresAt < new Date()) {
      this.verificationTokens.delete(tokenHash);
      return null;
    }
    const user = await this.getUser(record.userId);
    if (!user) return null;

    // Update user to verified and credit starting balance
    const updatedUser = await this.updateUser(user.id, {
      status: "VERIFIED",
      emailVerifiedAt: new Date(),
      balance: 1000,
    });

    // Log balance event
    await this.logBalanceEvent({
      userId: user.id,
      type: "STARTING_CREDIT",
      amount: 1000,
      note: "Initial balance upon email verification",
    });

    this.verificationTokens.delete(tokenHash);
    return updatedUser || null;
  }

  async createPasswordResetToken(userId: string): Promise<string> {
    const token = randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    this.passwordResetTokens.set(tokenHash, {
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      used: false,
    });
    return token;
  }

  async verifyPasswordResetToken(token: string): Promise<User | null> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = this.passwordResetTokens.get(tokenHash);
    if (!record) return null;
    if (record.expiresAt < new Date() || record.used) {
      return null;
    }
    const user = await this.getUser(record.userId);
    return user || null;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const record = this.passwordResetTokens.get(tokenHash);
    if (record) {
      record.used = true;
      this.passwordResetTokens.set(tokenHash, record);
    }
  }

  async getMarkets(type?: string): Promise<MarketWithDetails[]> {
    const markets = Array.from(this.markets.values())
      .filter((m) => m.status !== "HIDDEN" && (!type || m.type === type))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Promise.all(markets.map((m) => this.enrichMarket(m)));
  }

  async getMarket(id: string): Promise<MarketWithDetails | undefined> {
    const market = this.markets.get(id);
    if (!market) return undefined;
    return this.enrichMarket(market);
  }

  private async enrichMarket(market: Market): Promise<MarketWithDetails> {
    const creator = await this.getUser(market.createdBy);
    const outcomes =
      market.type === "PREDICTION"
        ? await this.getOutcomesByMarket(market.id)
        : undefined;
    const stockMeta =
      market.type === "STOCK" ? await this.getStockMeta(market.id) : undefined;

    return {
      ...market,
      outcomes,
      stockMeta,
      creatorName: creator?.displayName,
    };
  }

  async createMarket(market: Omit<Market, "id" | "createdAt">): Promise<Market> {
    const id = randomUUID();
    const newMarket: Market = {
      ...market,
      id,
      createdAt: new Date(),
    };
    this.markets.set(id, newMarket);
    return newMarket;
  }

  async updateMarket(id: string, updates: Partial<Market>): Promise<Market | undefined> {
    const market = this.markets.get(id);
    if (!market) return undefined;
    const updated = { ...market, ...updates };
    this.markets.set(id, updated);
    return updated;
  }

  async createOutcome(outcome: Omit<Outcome, "id">): Promise<Outcome> {
    const id = randomUUID();
    const newOutcome: Outcome = { ...outcome, id };
    this.outcomes.set(id, newOutcome);
    return newOutcome;
  }

  async getOutcomesByMarket(marketId: string): Promise<Outcome[]> {
    return Array.from(this.outcomes.values()).filter((o) => o.marketId === marketId);
  }

  async updateOutcome(id: string, updates: Partial<Outcome>): Promise<Outcome | undefined> {
    const outcome = this.outcomes.get(id);
    if (!outcome) return undefined;
    const updated = { ...outcome, ...updates };
    this.outcomes.set(id, updated);
    return updated;
  }

  async createStockMeta(stockMeta: Omit<StockMeta, "id">): Promise<StockMeta> {
    const id = randomUUID();
    const newStockMeta: StockMeta = { ...stockMeta, id };
    this.stockMetas.set(stockMeta.marketId, newStockMeta);
    return newStockMeta;
  }

  async getStockMeta(marketId: string): Promise<StockMeta | undefined> {
    return this.stockMetas.get(marketId);
  }

  async updateStockMeta(marketId: string, updates: Partial<StockMeta>): Promise<StockMeta | undefined> {
    const stockMeta = this.stockMetas.get(marketId);
    if (!stockMeta) return undefined;
    const updated = { ...stockMeta, ...updates };
    this.stockMetas.set(marketId, updated);
    return updated;
  }

  async createTrade(trade: Omit<Trade, "id" | "createdAt">): Promise<Trade> {
    const id = randomUUID();
    const newTrade: Trade = { ...trade, id, createdAt: new Date() };
    this.trades.set(id, newTrade);
    return newTrade;
  }

  async getTradesByUser(userId: string): Promise<Trade[]> {
    return Array.from(this.trades.values())
      .filter((t) => t.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getPosition(userId: string, marketId: string, outcomeId?: string): Promise<Position | undefined> {
    const key = `${userId}-${marketId}-${outcomeId || "stock"}`;
    return this.positions.get(key);
  }

  async upsertPosition(position: Omit<Position, "id">): Promise<Position> {
    const key = `${position.userId}-${position.marketId}-${position.outcomeId || "stock"}`;
    const existing = this.positions.get(key);
    if (existing) {
      const updated: Position = {
        ...existing,
        qty: position.qty,
        avgCost: position.avgCost,
      };
      this.positions.set(key, updated);
      return updated;
    }
    const id = randomUUID();
    const newPosition: Position = { ...position, id };
    this.positions.set(key, newPosition);
    return newPosition;
  }

  async getPositionsByUser(userId: string): Promise<Position[]> {
    return Array.from(this.positions.values()).filter(
      (p) => p.userId === userId && p.qty > 0
    );
  }

  async getCommentsByMarket(marketId: string): Promise<Comment[]> {
    return Array.from(this.comments.values())
      .filter((c) => c.marketId === marketId && !c.hiddenAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createComment(comment: Omit<Comment, "id" | "createdAt" | "hiddenAt">): Promise<Comment> {
    const id = randomUUID();
    const newComment: Comment = { ...comment, id, createdAt: new Date(), hiddenAt: null };
    this.comments.set(id, newComment);
    return newComment;
  }

  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    const id = randomUUID();
    const newReport: Report = { ...report, id, status: "PENDING", createdAt: new Date() };
    this.reports.set(id, newReport);
    return newReport;
  }

  async getReports(): Promise<Report[]> {
    return Array.from(this.reports.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const report = this.reports.get(id);
    if (!report) return undefined;
    const updated = { ...report, ...updates };
    this.reports.set(id, updated);
    return updated;
  }

  async logBalanceEvent(event: Omit<BalanceEvent, "id" | "createdAt">): Promise<BalanceEvent> {
    const id = randomUUID();
    const newEvent: BalanceEvent = { ...event, id, createdAt: new Date() };
    this.balanceEvents.set(id, newEvent);
    return newEvent;
  }

  async getLeaderboard(timeFilter?: string): Promise<LeaderboardEntry[]> {
    const users = Array.from(this.users.values())
      .filter((u) => u.status === "VERIFIED" && u.role !== "ADMIN");

    const entries: LeaderboardEntry[] = await Promise.all(
      users.map(async (user) => {
        const positions = await this.getPositionsByUser(user.id);
        let positionsValue = 0;

        for (const pos of positions) {
          if (pos.outcomeId) {
            const outcome = this.outcomes.get(pos.outcomeId);
            if (outcome) {
              positionsValue += pos.qty * outcome.currentPrice;
            }
          } else {
            const stockMeta = this.stockMetas.get(pos.marketId);
            if (stockMeta) {
              positionsValue += pos.qty * stockMeta.currentPrice;
            }
          }
        }

        const totalValue = user.balance + positionsValue;
        const changePercent = ((totalValue - 1000) / 1000) * 100;

        return {
          rank: 0,
          userId: user.id,
          displayName: user.displayName,
          grade: user.grade || undefined,
          totalValue,
          cashBalance: user.balance,
          positionsValue,
          changePercent,
        };
      })
    );

    entries.sort((a, b) => b.totalValue - a.totalValue);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries;
  }

  async getPortfolio(userId: string): Promise<PortfolioSummary> {
    const user = await this.getUser(userId);
    if (!user) {
      return {
        totalValue: 0,
        cashBalance: 0,
        positionsValue: 0,
        totalPnL: 0,
        positions: [],
        recentTrades: [],
      };
    }

    const positions = await this.getPositionsByUser(userId);
    const trades = await this.getTradesByUser(userId);

    const enrichedPositions: PositionWithDetails[] = await Promise.all(
      positions.map(async (pos) => {
        const market = await this.getMarket(pos.marketId);
        let currentPrice = 0;
        let outcome: Outcome | undefined;
        let stockMeta: StockMeta | undefined;

        if (pos.outcomeId) {
          outcome = this.outcomes.get(pos.outcomeId);
          currentPrice = outcome?.currentPrice ?? 0;
        } else {
          stockMeta = this.stockMetas.get(pos.marketId);
          currentPrice = stockMeta?.currentPrice ?? 0;
        }

        const currentValue = pos.qty * currentPrice;
        const costBasis = pos.qty * pos.avgCost;
        const pnl = currentValue - costBasis;

        return {
          ...pos,
          market,
          outcome,
          stockMeta,
          currentValue,
          pnl,
        };
      })
    );

    const positionsValue = enrichedPositions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalValue = user.balance + positionsValue;
    const totalPnL = totalValue - 1000;

    return {
      totalValue,
      cashBalance: user.balance,
      positionsValue,
      totalPnL,
      positions: enrichedPositions,
      recentTrades: trades.slice(0, 20),
    };
  }

  async getStockCandles(marketId: string, limit: number = 100): Promise<StockCandle[]> {
    const candles = this.stockCandles.get(marketId) || [];
    return candles.slice(-limit).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async addStockCandle(candle: Omit<StockCandle, "id">): Promise<StockCandle> {
    const id = randomUUID();
    const newCandle: StockCandle = { ...candle, id };
    const candles = this.stockCandles.get(candle.marketId) || [];
    candles.push(newCandle);
    this.stockCandles.set(candle.marketId, candles);
    return newCandle;
  }

  async updateLatestCandle(marketId: string, price: number, volume: number): Promise<void> {
    const candles = this.stockCandles.get(marketId) || [];
    if (candles.length === 0) {
      // Create a new candle if none exists
      await this.addStockCandle({
        marketId,
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
        timestamp: new Date(),
      });
      return;
    }

    const lastCandle = candles[candles.length - 1];
    const now = new Date();
    const lastCandleTime = new Date(lastCandle.timestamp);
    
    // Check if we're still within the same trading period (same day for daily candles)
    const isSameDay = lastCandleTime.toDateString() === now.toDateString();

    if (isSameDay) {
      // Update existing candle
      lastCandle.close = price;
      lastCandle.high = Math.max(lastCandle.high, price);
      lastCandle.low = Math.min(lastCandle.low, price);
      lastCandle.volume += volume;
    } else {
      // Create a new candle for the new day
      await this.addStockCandle({
        marketId,
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
        timestamp: now,
      });
    }
  }

  async getMarketCandles(marketId: string, outcomeId: string, limit: number = 100): Promise<MarketCandle[]> {
    const key = `${marketId}:${outcomeId}`;
    const candles = this.marketCandles.get(key) || [];
    return candles.slice(-limit).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async createGame(game: Partial<Game>): Promise<Game> {
    const id = randomUUID();
    const newGame: Game = {
      id,
      sport: game.sport || "OTHER",
      opponent: game.opponent || "",
      isHome: game.isHome ?? true,
      gameDate: game.gameDate || new Date(),
      status: game.status || "UPCOMING",
      menloScore: game.menloScore ?? null,
      opponentScore: game.opponentScore ?? null,
      marketId: game.marketId ?? null,
      createdBy: game.createdBy || "",
      createdAt: new Date(),
    };
    this.games.set(id, newGame);
    return newGame;
  }

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async getAllGames(): Promise<Game[]> {
    return Array.from(this.games.values()).sort(
      (a, b) => new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()
    );
  }

  async updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined> {
    const game = this.games.get(id);
    if (!game) return undefined;
    const updated = { ...game, ...updates };
    this.games.set(id, updated);
    return updated;
  }

  async deleteGame(id: string): Promise<boolean> {
    return this.games.delete(id);
  }

  async createPolymarketLink(link: Omit<PolymarketLink, "id" | "lastSynced">): Promise<PolymarketLink> {
    const id = randomUUID();
    const newLink: PolymarketLink = {
      ...link,
      id,
      lastSynced: new Date(),
    };
    this.polymarketLinks.set(link.marketId, newLink);
    return newLink;
  }

  async getPolymarketLink(marketId: string): Promise<PolymarketLink | undefined> {
    return this.polymarketLinks.get(marketId);
  }

  async getPolymarketMarkets(): Promise<MarketWithDetails[]> {
    const polymarketMarketIds = new Set(
      Array.from(this.polymarketLinks.values()).map((link) => link.marketId)
    );
    
    const markets = Array.from(this.markets.values())
      .filter((m) => m.source === "POLYMARKET" || polymarketMarketIds.has(m.id))
      .filter((m) => m.status !== "HIDDEN")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return Promise.all(markets.map((m) => this.enrichMarket(m)));
  }
}

export const storage = new MemStorage();
