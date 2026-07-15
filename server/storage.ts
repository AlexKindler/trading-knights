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
  users,
  markets,
  outcomes,
  stockMeta as stockMetaTable,
  trades,
  positions,
  comments,
  reports,
  balanceEvents,
  stockCandles,
  marketCandles,
  games,
  polymarketLinks,
  emailVerificationTokens,
  passwordResetTokens,
  resolutions,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { db } from "./db";
import { eq, and, desc, sql, ne, isNull } from "drizzle-orm";
import { maybeAdvanceStockPrices } from "./stockSimulator";

/**
 * Error thrown by trade/resolution transactions. routes.ts maps these to HTTP 400.
 * Any other thrown error is treated as a 500.
 */
export type TradeErrorCode =
  | "INVALID_QTY"
  | "MARKET_CLOSED"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_SHARES"
  | "OUTCOME_NOT_FOUND"
  | "STOCK_NOT_FOUND";

export class TradeError extends Error {
  code: TradeErrorCode;
  constructor(code: TradeErrorCode, message?: string) {
    super(message || code);
    this.name = "TradeError";
    this.code = code;
  }
}

export interface ExecuteTradeInput {
  userId: string;
  marketId: string;
  outcomeId: string | null;
  side: "BUY" | "SELL";
  qty: number;
}

export interface ExecuteTradeResult {
  trade: Trade;
  user: User;
  executedPrice: number;
  priceAfter: number;
}

// Round money to whole cents.
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// Round a probability/price to 4 decimals.
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function clampProb(p: number): number {
  return Math.max(0.01, Math.min(0.99, p));
}

// AMM tuning. Impact scales with quantity so large orders move the price more.
const TAKER_FEE = 0.005; // 0.5% taker fee on every fill
const PREDICTION_IMPACT_PER_SHARE = 0.0008; // probability units per share
const PREDICTION_MAX_IMPACT = 0.45;
const STOCK_IMPACT_PER_SHARE = 0.0005; // fraction of price per share
const STOCK_MAX_IMPACT = 0.25;

// In-memory throttle so maybeTickStockPrices() is cheap when called on every
// read. The DB-level elapsed-time gate is the real correctness guard; this just
// avoids re-querying sim profiles more than once a minute on a warm instance.
let lastStockTickCheckAt = 0;

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
    // Placeholder creator id for seeded markets. No password-bearing account is
    // created here — admin access is granted only at registration (routes.ts).
    const adminId = randomUUID();

    // Create prediction markets - Club-based and school events
    const predictionMarkets = [
      // Club Performance Markets
      { title: "Will Menlo Robotics win at VEX States?", description: "Resolves YES if Menlo Robotics Club places 1st at the VEX State Championship.", category: "Clubs", closeAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official VEX competition results" },
      { title: "Will Drama Club's spring show sell out?", description: "Resolves YES if all tickets for Drama Club's spring production are sold.", category: "Clubs", closeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), resolutionRule: "Based on ticket sales records" },
      { title: "Will Model UN win Best Delegation?", description: "Resolves YES if Menlo Model UN wins Best Delegation at the next major conference.", category: "Clubs", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official MUN awards" },
      { title: "Will Parliamentary Debate reach nationals?", description: "Resolves YES if Menlo's debate team qualifies for the national tournament.", category: "Clubs", closeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), resolutionRule: "Based on qualification results" },
      { title: "Will DECA advance to ICDC?", description: "Resolves YES if any Menlo DECA member qualifies for the International Career Development Conference.", category: "Clubs", closeAt: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), resolutionRule: "Based on DECA competition results" },
      { title: "Will Engineering Club finish their go-kart?", description: "Resolves YES if Engineering Club completes their electric go-kart project this semester.", category: "Clubs", closeAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), resolutionRule: "Based on club announcement" },
      { title: "Will TEDx Menlo have 200+ attendees?", description: "Resolves YES if TEDx Menlo event has over 200 attendees.", category: "Clubs", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on event attendance records" },
      { title: "Will Beekeeping harvest 50+ lbs of honey?", description: "Resolves YES if the Beekeeping Club harvests more than 50 pounds of honey this season.", category: "Clubs", closeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), resolutionRule: "Based on harvest records" },
      { title: "Will Girls Who Code host a hackathon?", description: "Resolves YES if Girls Who Code organizes and hosts a hackathon this semester.", category: "Clubs", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on event occurrence" },
      { title: "Will Anime Club get 50+ members?", description: "Resolves YES if Anime Club reaches 50 or more active members.", category: "Clubs", closeAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), resolutionRule: "Based on club roster" },
      { title: "Will STAR win at Science Olympiad regionals?", description: "Resolves YES if STAR places top 3 at Science Olympiad regionals.", category: "Clubs", closeAt: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000), resolutionRule: "Based on competition results" },
      { title: "Will Fashion Club's clothing swap have 100+ items?", description: "Resolves YES if the next Fashion Club clothing swap has over 100 items donated.", category: "Clubs", closeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), resolutionRule: "Based on item count" },
      { title: "Will K-pop Club host a dance cover event?", description: "Resolves YES if K-pop Club performs a dance cover at a school event.", category: "Clubs", closeAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), resolutionRule: "Based on event occurrence" },
      { title: "Will Menlo Fishing Club catch a 10lb+ fish?", description: "Resolves YES if any club member catches a fish weighing 10 pounds or more.", category: "Clubs", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on verified catch" },
      { title: "Will Climate Coalition plant 100+ trees?", description: "Resolves YES if Climate Coalition plants over 100 trees during EcoAct Week.", category: "Clubs", closeAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000), resolutionRule: "Based on planting records" },
      { title: "Will Video Game Club win the esports tournament?", description: "Resolves YES if Video Game Club wins first place in the inter-school esports tournament.", category: "Clubs", closeAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), resolutionRule: "Based on tournament results" },
      { title: "Will Menlo LitMag publish by spring?", description: "Resolves YES if Menlo's literary magazine is published before spring break.", category: "Clubs", closeAt: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), resolutionRule: "Based on publication date" },
      { title: "Will A Capella perform at assembly?", description: "Resolves YES if Menlo A Capella Club performs at a school-wide assembly this semester.", category: "Clubs", closeAt: new Date(Date.now() + 50 * 24 * 60 * 60 * 1000), resolutionRule: "Based on assembly schedule" },
      { title: "Will Physics Club launch a successful rocket?", description: "Resolves YES if Physics Club successfully launches and recovers a model rocket.", category: "Clubs", closeAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000), resolutionRule: "Based on launch outcome" },
      { title: "Will Red Cross raise $5000+ this semester?", description: "Resolves YES if Red Cross Club raises over $5000 for disaster relief.", category: "Clubs", closeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), resolutionRule: "Based on fundraising records" },
      { title: "Will Outdoor Club summit Mt. Tam?", description: "Resolves YES if Outdoor Club successfully completes a group hike to Mt. Tamalpais summit.", category: "Clubs", closeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), resolutionRule: "Based on trip completion" },
      { title: "Will Trivia Club win Quiz Bowl regionals?", description: "Resolves YES if Menlo Trivia Club places 1st at Quiz Bowl regionals.", category: "Clubs", closeAt: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000), resolutionRule: "Based on competition results" },
      { title: "Will HOSA qualify for nationals?", description: "Resolves YES if any HOSA member qualifies for the national competition.", category: "Clubs", closeAt: new Date(Date.now() + 70 * 24 * 60 * 60 * 1000), resolutionRule: "Based on HOSA results" },
      { title: "Will JCL win at state convention?", description: "Resolves YES if Menlo JCL wins any award at the California state convention.", category: "Clubs", closeAt: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000), resolutionRule: "Based on convention results" },
      { title: "Will Business Club launch a student startup?", description: "Resolves YES if Business & Entrepreneurship Club helps launch an actual student business.", category: "Clubs", closeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), resolutionRule: "Based on business launch" },
      // School-wide Events
      { title: "Will Spirit Week have 80%+ participation?", description: "Resolves YES if more than 80% of students participate in at least one Spirit Week event.", category: "Events", closeAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), resolutionRule: "Based on attendance records" },
      { title: "Will the average AP Calc score be above 4.0?", description: "Resolves YES if the class average on AP Calculus exam exceeds 4.0.", category: "Academics", closeAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), resolutionRule: "Based on College Board results" },
      { title: "Who will win student body president?", description: "Predict the outcome of the upcoming student body elections.", category: "Elections", closeAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official election results" },
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
        source: "INTERNAL",
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

    // Create stock markets - All Menlo School Clubs
    const stocks = [
      { ticker: "ANIME", name: "Anime Club", category: "Clubs", price: 28, description: "Watch anime with friends and have snacks. Meetings every Tuesday during lunch." },
      { ticker: "ART", name: "Art Club", category: "Clubs", price: 32, description: "Create art that raises awareness on important issues through different projects." },
      { ticker: "AWSC", name: "Athletic Wellness and Sports Club", category: "Clubs", price: 35, description: "Focus on mental health, physical wellness, and performance strategies for athletes." },
      { ticker: "BEES", name: "Beekeeping", category: "Clubs", price: 30, description: "Learn the art and science of beekeeping while supporting the environment." },
      { ticker: "BOARD", name: "Board Game Club", category: "Clubs", price: 25, description: "Meet new friends and play many new and fun board games!" },
      { ticker: "BIZ", name: "Business & Entrepreneurship Club", category: "Clubs", price: 42, description: "Explore what makes a business successful and learn how to start one." },
      { ticker: "FAITH", name: "Christian Club", category: "Clubs", price: 26, description: "A safe space to meet and learn more about religion and faith." },
      { ticker: "CLMT", name: "Climate Coalition", category: "Clubs", price: 38, description: "Focus on climate action, advocacy, and organizing events like EcoAct Week." },
      { ticker: "CLIMB", name: "Climbing Club", category: "Clubs", price: 33, description: "Introducing new climbers to the sport with a welcoming environment on campus." },
      { ticker: "WRITE", name: "Creative Writing Club", category: "Clubs", price: 29, description: "A welcoming space for writers of all levels to explore poetry, fiction, and scripts." },
      { ticker: "CURI", name: "Curieus", category: "Clubs", price: 31, description: "Provide science opportunities through volunteering across several high schools." },
      { ticker: "DRAMA", name: "Drama Club", category: "Clubs", price: 36, description: "Act, create, and help bring Menlo shows to life while connecting with fellow students." },
      { ticker: "ENGR", name: "Engineering Club", category: "Clubs", price: 45, description: "Build an electric go-cart that members will be able to ride." },
      { ticker: "F1", name: "F1 Club", category: "Clubs", price: 34, description: "Race recaps, sizzling drama, and fuel-epic discussions about Formula 1." },
      { ticker: "FASH", name: "Fashion Club", category: "Clubs", price: 32, description: "Passionate about fashion and design with semester clothing swaps." },
      { ticker: "FRNCH", name: "French Club", category: "Clubs", price: 27, description: "Discuss all things French, including TV shows, music, and culture." },
      { ticker: "GRDN", name: "Garden Club", category: "Clubs", price: 28, description: "Plant and harvest fruits, veggies, and flowers every Tuesday in the Menlo garden." },
      { ticker: "GIDAS", name: "GIDAS", category: "Clubs", price: 40, description: "Genes In Diseases And Symptoms - democratize medical research through Mircore." },
      { ticker: "GWC", name: "Girls Who Code", category: "Clubs", price: 38, description: "A fun place for girls who love STEM to discuss real world issues and homework." },
      { ticker: "HAPPY", name: "Happiness Club", category: "Clubs", price: 26, description: "Centered around community and joy, planning unique decorations and events." },
      { ticker: "HIST", name: "History Club", category: "Clubs", price: 29, description: "Explore the past beyond the classroom with NHD competitions and documentaries." },
      { ticker: "HOSA", name: "HOSA", category: "Clubs", price: 41, description: "Healthcare Occupations for Students of America - explore medical careers." },
      { ticker: "IGNT", name: "IGNITE", category: "Clubs", price: 35, description: "Women in Politics - political power in every young woman." },
      { ticker: "JEWL", name: "Jewelry Club", category: "Clubs", price: 30, description: "Design and create jewelry with us and enjoy amazing snacks." },
      { ticker: "KPOP", name: "K-pop Club", category: "Clubs", price: 33, description: "Listen to music and talk about the latest K-pop news!" },
      { ticker: "ACAP", name: "Menlo A capella Club", category: "Clubs", price: 34, description: "Meet new people and create music together with 4-part singing." },
      { ticker: "ETHIC", name: "Menlo Ethics Team", category: "Clubs", price: 36, description: "Debate real-world issues and sharpen critical thinking skills." },
      { ticker: "FISH", name: "Menlo Fishing Club", category: "Clubs", price: 28, description: "Explore different fishing techniques and possibly spark a new passion." },
      { ticker: "JCL", name: "Menlo Junior Classical League", category: "Clubs", price: 31, description: "Study the Classics as the largest Classical organization in the world." },
      { ticker: "LITM", name: "Menlo LitMag", category: "Clubs", price: 32, description: "A creative space for writers, poets, and artists to produce Menlo's literary magazine." },
      { ticker: "MRKT", name: "Menlo Marketing Club", category: "Clubs", price: 39, description: "Explore interest in business and marketing with bi-monthly meetings." },
      { ticker: "ROBOT", name: "Menlo Robotics Club", category: "Clubs", price: 48, description: "Have fun while tinkering and learning about engineering. Competes in VEX." },
      { ticker: "WSTEM", name: "Menlo Women in STEM", category: "Clubs", price: 37, description: "Menlo's official chapter of Women in STEM - an amazing supportive community." },
      { ticker: "MNTL", name: "Mental Health at Menlo", category: "Clubs", price: 30, description: "Discuss mental health topics and organize school-wide assemblies." },
      { ticker: "MICRO", name: "Microplastics In Daily Life", category: "Clubs", price: 29, description: "Explore the hidden world of microplastics and their impact on our lives." },
      { ticker: "MUN", name: "Model UN", category: "Clubs", price: 44, description: "Exercise vital skills like public speaking, debate, and negotiation." },
      { ticker: "MOVIE", name: "Movie Making Club", category: "Clubs", price: 35, description: "Learn all aspects of film production, storytelling, and visual arts." },
      { ticker: "FINDU", name: "OneUp FinEdu @Menlo", category: "Clubs", price: 40, description: "Learn investing and all things finance. Start your financial future." },
      { ticker: "OUTDR", name: "Outdoor Club", category: "Clubs", price: 33, description: "Learn about the outdoors and go on field trips around Northern California." },
      { ticker: "P2SC", name: "Page to Screen Critics!", category: "Clubs", price: 28, description: "Discuss on-screen adaptations of favorite novels and how they compare." },
      { ticker: "DEBAT", name: "Parliamentary Debate", category: "Clubs", price: 43, description: "Part of a debate team ranked top 20 in the country." },
      { ticker: "PTS", name: "Past the Screen", category: "Clubs", price: 31, description: "Help peers reclaim time from excessive screen use through the MAP method." },
      { ticker: "PHYS", name: "Physics Club", category: "Clubs", price: 36, description: "Get help with physics homework and learn how your favorite sci-fi movies work." },
      { ticker: "PICKLE", name: "Pickleball Club", category: "Clubs", price: 32, description: "Hang out and chat with friends while playing pickleball." },
      { ticker: "REBOOT", name: "Project Reboot", category: "Clubs", price: 34, description: "Discuss relationships with devices and how to better manage them." },
      { ticker: "PSYCH", name: "Psychology Club", category: "Clubs", price: 33, description: "A fun, relaxed way to interact with and learn about psychology." },
      { ticker: "REDX", name: "Red Cross Club", category: "Clubs", price: 38, description: "Make a difference through action and compassion with disaster relief fundraisers." },
      { ticker: "SAGE", name: "SAGExStanford Club", category: "Clubs", price: 42, description: "Work with scientists at Stanford's National Laboratory (SLAC)." },
      { ticker: "STAR", name: "STAR", category: "Clubs", price: 39, description: "Science, Technology, and Robotics - run fun STEM workshops for middle schoolers." },
      { ticker: "STEMR", name: "STEMers", category: "Clubs", price: 35, description: "Teach members about small or big STEM nonprofits and give back to the community." },
      { ticker: "SIP", name: "Students in Politics", category: "Clubs", price: 36, description: "Learn about the political climate and get involved in your community." },
      { ticker: "SURF", name: "Surfrider", category: "Clubs", price: 31, description: "Ocean conservation with the San Mateo Surfrider chapter. Beach cleanups on Sundays." },
      { ticker: "TEDX", name: "TEDx Menlo", category: "Clubs", price: 45, description: "Be part of the production team for Menlo's official TEDx event." },
      { ticker: "NHOOD", name: "The Neighborhood", category: "Clubs", price: 30, description: "Everything math and problem-solving! Meet to provide math peer tutoring." },
      { ticker: "TRIV", name: "Trivia Club", category: "Clubs", price: 29, description: "A community for those who revel in the acquisition of all facets of knowledge." },
      { ticker: "VIDGM", name: "Video Game Club", category: "Clubs", price: 34, description: "Play video games during lunch. Compete against/with your friends." },
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
        source: "INTERNAL",
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

    // Mark verified only. Starting credit is granted once at registration
    // (routes.ts), so verification must NOT touch the balance or wipe gains.
    const updatedUser = await this.updateUser(user.id, {
      status: "VERIFIED",
      emailVerifiedAt: new Date(),
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

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser & { id?: string }): Promise<User> {
    // Creates ONLY the user row. It does NOT grant a starting balance and does
    // NOT log any balance event — routes.ts grants the $1000 STARTING_CREDIT
    // exactly once at registration (this removes the previous double-credit).
    // The password is stored as provided: routes.ts hashes it before calling.
    const id = user.id || randomUUID();

    const result = await db.insert(users).values({
      id,
      email: user.email,
      password: user.password,
      displayName: user.displayName,
      grade: user.grade || null,
      role: "STUDENT",
      status: "PENDING_VERIFICATION",
      emailVerifiedAt: null,
      balance: 0,
      disclaimerAcceptedAt: null,
      lastBankruptcyReset: null,
      hasMkAiAccess: false,
    }).returning();

    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  /**
   * Execute a single trade inside ONE database transaction (CONTRACT §1).
   * The AMM applies price impact BEFORE the fill, fills on the adverse side, and
   * charges a taker fee, so an immediate buy -> sell round trip is strictly
   * loss-making. All money is rounded to cents.
   */
  async executeTrade(input: ExecuteTradeInput): Promise<ExecuteTradeResult> {
    const { userId, marketId, side } = input;
    const qty = input.qty;

    // Validate quantity: integer in [1, 1000].
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000) {
      throw new TradeError("INVALID_QTY", "Quantity must be a whole number between 1 and 1000");
    }

    return db.transaction(async (tx) => {
      // Re-read market fresh inside the transaction.
      const marketRows = await tx.select().from(markets).where(eq(markets.id, marketId)).limit(1);
      const market = marketRows[0];
      const now = new Date();
      if (
        !market ||
        market.status !== "OPEN" ||
        (market.closeAt && new Date(market.closeAt).getTime() <= now.getTime())
      ) {
        throw new TradeError("MARKET_CLOSED", "Market is not open for trading");
      }

      // Lock the user row FOR UPDATE so all of this user's concurrent trades
      // serialize: the read-modify-write of balance (and their per-user
      // positions) cannot interleave, which closes the double-spend / share
      // duplication window under READ COMMITTED.
      const userRows = await tx.select().from(users).where(eq(users.id, userId)).for("update").limit(1);
      const user = userRows[0];
      if (!user) {
        // Callers authenticate first; treat a missing user as a hard error.
        throw new Error("User not found");
      }

      let executedPrice: number;
      let priceAfter: number;
      let cashDelta: number; // +proceeds on SELL, -cost on BUY
      const outcomeId: string | null =
        market.type === "PREDICTION" ? input.outcomeId : null;

      if (market.type === "PREDICTION") {
        if (!outcomeId) {
          throw new TradeError("OUTCOME_NOT_FOUND", "Outcome is required for prediction markets");
        }
        const outcomeRows = await tx.select().from(outcomes)
          .where(and(eq(outcomes.id, outcomeId), eq(outcomes.marketId, marketId)))
          .limit(1);
        const outcome = outcomeRows[0];
        if (!outcome) {
          throw new TradeError("OUTCOME_NOT_FOUND", "Outcome not found");
        }

        const p = outcome.currentPrice;
        const impact = Math.min(PREDICTION_IMPACT_PER_SHARE * qty, PREDICTION_MAX_IMPACT);
        // Move the price first, then fill on the adverse (post-impact) side.
        priceAfter = side === "BUY" ? clampProb(p + impact) : clampProb(p - impact);
        executedPrice = priceAfter;
        const notional = qty * executedPrice;

        // Position (fresh, in-txn).
        const posRows = await tx.select().from(positions)
          .where(and(
            eq(positions.userId, userId),
            eq(positions.marketId, marketId),
            eq(positions.outcomeId, outcomeId),
          )).limit(1);
        const existing = posRows[0];

        if (side === "BUY") {
          const cost = round2(notional * (1 + TAKER_FEE));
          if (user.balance < cost) {
            throw new TradeError("INSUFFICIENT_BALANCE", "Insufficient balance");
          }
          cashDelta = -cost;
          const newQty = (existing?.qty ?? 0) + qty;
          const newAvgCost = existing
            ? round2((existing.qty * existing.avgCost + cost) / newQty)
            : round2(cost / qty);
          await this.writePosition(tx, existing?.id, {
            userId, marketId, outcomeId, qty: newQty, avgCost: newAvgCost,
          });
        } else {
          if (!existing || existing.qty < qty) {
            throw new TradeError("INSUFFICIENT_SHARES", "Insufficient shares");
          }
          const proceeds = round2(notional * (1 - TAKER_FEE));
          cashDelta = proceeds;
          const newQty = existing.qty - qty;
          await this.writePosition(tx, existing.id, {
            userId, marketId, outcomeId, qty: newQty, avgCost: existing.avgCost,
          });
        }

        // Update the traded outcome and keep a binary market summing to 1.
        await tx.update(outcomes).set({ currentPrice: round4(priceAfter) })
          .where(eq(outcomes.id, outcomeId));
        const others = await tx.select().from(outcomes)
          .where(and(eq(outcomes.marketId, marketId), ne(outcomes.id, outcomeId)));
        if (others.length === 1) {
          await tx.update(outcomes).set({ currentPrice: round4(1 - priceAfter) })
            .where(eq(outcomes.id, others[0].id));
        }
      } else if (market.type === "STOCK") {
        const metaRows = await tx.select().from(stockMetaTable)
          .where(eq(stockMetaTable.marketId, marketId)).limit(1);
        const meta = metaRows[0];
        if (!meta) {
          throw new TradeError("STOCK_NOT_FOUND", "Stock not found");
        }

        const p = meta.currentPrice;
        const pctImpact = Math.min(STOCK_IMPACT_PER_SHARE * qty, STOCK_MAX_IMPACT);
        priceAfter = side === "BUY"
          ? round2(p * (1 + pctImpact))
          : Math.max(0.01, round2(p * (1 - pctImpact)));
        executedPrice = priceAfter;
        const notional = qty * executedPrice;

        const posRows = await tx.select().from(positions)
          .where(and(
            eq(positions.userId, userId),
            eq(positions.marketId, marketId),
            isNull(positions.outcomeId),
          )).limit(1);
        const existing = posRows[0];

        if (side === "BUY") {
          const cost = round2(notional * (1 + TAKER_FEE));
          if (user.balance < cost) {
            throw new TradeError("INSUFFICIENT_BALANCE", "Insufficient balance");
          }
          cashDelta = -cost;
          const newQty = (existing?.qty ?? 0) + qty;
          const newAvgCost = existing
            ? round2((existing.qty * existing.avgCost + cost) / newQty)
            : round2(cost / qty);
          await this.writePosition(tx, existing?.id, {
            userId, marketId, outcomeId: null, qty: newQty, avgCost: newAvgCost,
          });
        } else {
          if (!existing || existing.qty < qty) {
            throw new TradeError("INSUFFICIENT_SHARES", "Insufficient shares");
          }
          const proceeds = round2(notional * (1 - TAKER_FEE));
          cashDelta = proceeds;
          const newQty = existing.qty - qty;
          await this.writePosition(tx, existing.id, {
            userId, marketId, outcomeId: null, qty: newQty, avgCost: existing.avgCost,
          });
        }

        await tx.update(stockMetaTable).set({ currentPrice: Math.max(0.01, priceAfter) })
          .where(eq(stockMetaTable.marketId, marketId));
      } else {
        throw new TradeError("MARKET_CLOSED", "Invalid market type");
      }

      // Record the trade.
      const tradeRows = await tx.insert(trades).values({
        id: randomUUID(),
        userId,
        marketId,
        outcomeId,
        side,
        qty,
        price: round2(executedPrice),
        total: round2(Math.abs(cashDelta)),
      }).returning();

      // Update balance and log exactly one TRADE ledger event.
      const newBalance = round2(user.balance + cashDelta);
      const updatedRows = await tx.update(users).set({ balance: newBalance })
        .where(eq(users.id, userId)).returning();

      await tx.insert(balanceEvents).values({
        id: randomUUID(),
        userId,
        type: "TRADE",
        amount: round2(cashDelta),
        note: `${side} ${qty} @ $${round2(executedPrice).toFixed(2)}`,
      });

      return {
        trade: tradeRows[0],
        user: updatedRows[0],
        executedPrice: round2(executedPrice),
        priceAfter,
      };
    });
  }

  // Atomic position write: UPDATE when the row exists, otherwise INSERT with an
  // ON CONFLICT fallback on the unique index (userId, marketId, outcomeKey) so
  // concurrent inserts never create duplicate rows. outcomeKey is a generated
  // STORED column = coalesce(outcome_id, '') — the ON CONFLICT target must be
  // outcomeKey (not the nullable outcomeId, whose NULLs are treated as distinct).
  private async writePosition(
    tx: any,
    existingId: string | undefined,
    values: { userId: string; marketId: string; outcomeId: string | null; qty: number; avgCost: number },
  ): Promise<void> {
    if (existingId) {
      await tx.update(positions)
        .set({ qty: values.qty, avgCost: values.avgCost })
        .where(eq(positions.id, existingId));
      return;
    }
    await tx.insert(positions)
      .values({ id: randomUUID(), ...values })
      .onConflictDoUpdate({
        target: [positions.userId, positions.marketId, positions.outcomeKey],
        set: { qty: values.qty, avgCost: values.avgCost },
      });
  }

  /**
   * Resolve a prediction market inside one transaction (CONTRACT §2).
   * Idempotent: does nothing if the market is already RESOLVED. Never double-pays.
   */
  async resolveMarket(
    marketId: string,
    opts: { winningOutcomeId?: string; voidRefund?: boolean },
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const marketRows = await tx.select().from(markets).where(eq(markets.id, marketId)).limit(1);
      const market = marketRows[0];
      if (!market) return;
      if (market.status === "RESOLVED") return; // idempotent, never double-pay

      // Guard against a concurrent resolution via the resolutions unique index.
      const existingResolution = await tx.select().from(resolutions)
        .where(eq(resolutions.marketId, marketId)).limit(1);
      if (existingResolution.length > 0) return;

      const marketOutcomes = await tx.select().from(outcomes)
        .where(eq(outcomes.marketId, marketId));
      const heldPositions = await tx.select().from(positions)
        .where(and(eq(positions.marketId, marketId), sql`${positions.qty} > 0`));

      const voidRefund = !!opts.voidRefund;
      const winningOutcomeId = opts.winningOutcomeId;

      for (const pos of heldPositions) {
        let payout = 0;
        if (voidRefund) {
          payout = round2(pos.qty * pos.avgCost);
        } else if (pos.outcomeId && pos.outcomeId === winningOutcomeId) {
          payout = round2(pos.qty * 1.0);
        }
        if (payout <= 0) continue;

        const userRows = await tx.select().from(users).where(eq(users.id, pos.userId)).limit(1);
        const holder = userRows[0];
        if (!holder) continue;

        await tx.update(users).set({ balance: round2(holder.balance + payout) })
          .where(eq(users.id, pos.userId));
        await tx.insert(balanceEvents).values({
          id: randomUUID(),
          userId: pos.userId,
          type: "RESOLUTION",
          amount: payout,
          note: voidRefund
            ? `Void refund for market ${marketId}`
            : `Payout for winning outcome ${winningOutcomeId}`,
        });
      }

      // Settle outcome prices: winner -> 1, losers -> 0 (unchanged on void).
      if (!voidRefund && winningOutcomeId) {
        for (const o of marketOutcomes) {
          await tx.update(outcomes)
            .set({ currentPrice: o.id === winningOutcomeId ? 1 : 0 })
            .where(eq(outcomes.id, o.id));
        }
      }

      await tx.update(markets).set({ status: "RESOLVED" }).where(eq(markets.id, marketId));

      await tx.insert(resolutions).values({
        id: randomUUID(),
        marketId,
        resolvedBy: market.createdBy,
        winningOutcomeId: winningOutcomeId ?? null,
        voidRefund: voidRefund ?? false,
        note: voidRefund ? "VOID_REFUND" : null,
      });
    });
  }

  /**
   * Reset a user to $100 only if total equity (cash + mark-to-market position
   * value) has fallen to zero or below and the 24h cooldown has elapsed
   * (CONTRACT §3). Returns the fresh user either way.
   */
  async maybeBankruptcyReset(userId: string): Promise<User> {
    return db.transaction(async (tx) => {
      const userRows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      const user = userRows[0];
      if (!user) throw new Error("User not found");

      const heldPositions = await tx.select().from(positions)
        .where(and(eq(positions.userId, userId), sql`${positions.qty} > 0`));

      let positionsValue = 0;
      for (const pos of heldPositions) {
        if (pos.outcomeId) {
          const oRows = await tx.select().from(outcomes).where(eq(outcomes.id, pos.outcomeId)).limit(1);
          if (oRows[0]) positionsValue += pos.qty * oRows[0].currentPrice;
        } else {
          const mRows = await tx.select().from(stockMetaTable)
            .where(eq(stockMetaTable.marketId, pos.marketId)).limit(1);
          if (mRows[0]) positionsValue += pos.qty * mRows[0].currentPrice;
        }
      }

      const equity = user.balance + positionsValue;
      const cooldownOk = !user.lastBankruptcyReset ||
        Date.now() - new Date(user.lastBankruptcyReset).getTime() > 24 * 60 * 60 * 1000;

      if (equity > 0 || !cooldownOk) {
        return user;
      }

      const credit = round2(100 - user.balance);
      const rows = await tx.update(users)
        .set({ balance: 100, lastBankruptcyReset: new Date() })
        .where(eq(users.id, userId))
        .returning();
      await tx.insert(balanceEvents).values({
        id: randomUUID(),
        userId,
        type: "BANKRUPTCY_RESET",
        amount: credit,
        note: "Automatic bankruptcy reset",
      });
      return rows[0];
    });
  }

  /**
   * Advance simulated stock prices based on elapsed time (CONTRACT §9).
   * Idempotent and cheap: safe to call on every stock read. A no-op when less
   * than the tick interval has passed since the last persisted update.
   */
  async maybeTickStockPrices(): Promise<void> {
    const now = Date.now();
    if (now - lastStockTickCheckAt < 60 * 1000) return;
    lastStockTickCheckAt = now;
    await maybeAdvanceStockPrices(5);
  }

  async createVerificationToken(userId: string): Promise<string> {
    const token = randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.insert(emailVerificationTokens).values({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return token;
  }

  async verifyToken(token: string): Promise<User | null> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await db.select().from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash)).limit(1);
    
    if (!result[0]) return null;
    const record = result[0];
    
    if (record.expiresAt < new Date() || record.usedAt) {
      return null;
    }
    
    const user = await this.getUser(record.userId);
    if (!user) return null;

    // Atomic single-use redemption: only the transaction that flips usedAt from
    // NULL wins. This marks the user verified WITHOUT resetting the balance
    // (resetting to 1000 would wipe any gains). Starting credit is granted once
    // at registration in routes.ts.
    const updatedUser = await db.transaction(async (tx) => {
      const claimed = await tx.update(emailVerificationTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.usedAt),
        ))
        .returning();

      if (claimed.length === 0) {
        // Already redeemed by a concurrent request.
        return undefined;
      }

      const rows = await tx.update(users)
        .set({ status: "VERIFIED", emailVerifiedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      return rows[0];
    });

    return updatedUser || null;
  }

  async createPasswordResetToken(userId: string): Promise<string> {
    const token = randomUUID();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return token;
  }

  async verifyPasswordResetToken(token: string): Promise<User | null> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const result = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash)).limit(1);
    
    if (!result[0]) return null;
    const record = result[0];
    
    if (record.expiresAt < new Date() || record.usedAt) {
      return null;
    }
    
    const user = await this.getUser(record.userId);
    return user || null;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
  }

  private async enrichMarket(market: Market): Promise<MarketWithDetails> {
    const creator = await this.getUser(market.createdBy);
    const marketOutcomes = market.type === "PREDICTION" 
      ? await this.getOutcomesByMarket(market.id) 
      : undefined;
    const stockMetaData = market.type === "STOCK" 
      ? await this.getStockMeta(market.id) 
      : undefined;

    return {
      ...market,
      outcomes: marketOutcomes,
      stockMeta: stockMetaData,
      creatorName: creator?.displayName,
    };
  }

  async getMarkets(type?: string): Promise<MarketWithDetails[]> {
    // Advance simulated prices (idempotent, self-throttled) before reading.
    await this.maybeTickStockPrices();

    let query = db.select().from(markets)
      .where(ne(markets.status, "HIDDEN"))
      .orderBy(desc(markets.createdAt));

    const result = await query;
    const filtered = type ? result.filter(m => m.type === type) : result;
    return Promise.all(filtered.map((m) => this.enrichMarket(m)));
  }

  async getMarket(id: string): Promise<MarketWithDetails | undefined> {
    await this.maybeTickStockPrices();
    const result = await db.select().from(markets).where(eq(markets.id, id)).limit(1);
    if (!result[0]) return undefined;
    return this.enrichMarket(result[0]);
  }

  async createMarket(market: Omit<Market, "id" | "createdAt">): Promise<Market> {
    const id = randomUUID();
    const result = await db.insert(markets).values({
      ...market,
      id,
    }).returning();
    return result[0];
  }

  async updateMarket(id: string, updates: Partial<Market>): Promise<Market | undefined> {
    const result = await db.update(markets).set(updates).where(eq(markets.id, id)).returning();
    return result[0];
  }

  async createOutcome(outcome: Omit<Outcome, "id">): Promise<Outcome> {
    const id = randomUUID();
    const result = await db.insert(outcomes).values({
      ...outcome,
      id,
    }).returning();
    return result[0];
  }

  async getOutcomesByMarket(marketId: string): Promise<Outcome[]> {
    return db.select().from(outcomes).where(eq(outcomes.marketId, marketId));
  }

  async updateOutcome(id: string, updates: Partial<Outcome>): Promise<Outcome | undefined> {
    const result = await db.update(outcomes).set(updates).where(eq(outcomes.id, id)).returning();
    return result[0];
  }

  async createStockMeta(stockMetaData: Omit<StockMeta, "id">): Promise<StockMeta> {
    const id = randomUUID();
    const result = await db.insert(stockMetaTable).values({
      ...stockMetaData,
      id,
    }).returning();
    return result[0];
  }

  async getStockMeta(marketId: string): Promise<StockMeta | undefined> {
    const result = await db.select().from(stockMetaTable)
      .where(eq(stockMetaTable.marketId, marketId)).limit(1);
    return result[0];
  }

  async updateStockMeta(marketId: string, updates: Partial<StockMeta>): Promise<StockMeta | undefined> {
    const result = await db.update(stockMetaTable)
      .set(updates)
      .where(eq(stockMetaTable.marketId, marketId))
      .returning();
    return result[0];
  }

  async createTrade(trade: Omit<Trade, "id" | "createdAt">): Promise<Trade> {
    const id = randomUUID();
    const result = await db.insert(trades).values({
      ...trade,
      id,
    }).returning();
    return result[0];
  }

  async getTradesByUser(userId: string): Promise<Trade[]> {
    return db.select().from(trades)
      .where(eq(trades.userId, userId))
      .orderBy(desc(trades.createdAt));
  }

  async getPosition(userId: string, marketId: string, outcomeId?: string): Promise<Position | undefined> {
    let result;
    if (outcomeId) {
      result = await db.select().from(positions)
        .where(and(
          eq(positions.userId, userId),
          eq(positions.marketId, marketId),
          eq(positions.outcomeId, outcomeId)
        )).limit(1);
    } else {
      result = await db.select().from(positions)
        .where(and(
          eq(positions.userId, userId),
          eq(positions.marketId, marketId),
          isNull(positions.outcomeId)
        )).limit(1);
    }
    return result[0];
  }

  async upsertPosition(position: Omit<Position, "id">): Promise<Position> {
    const existing = await this.getPosition(position.userId, position.marketId, position.outcomeId || undefined);
    
    if (existing) {
      const result = await db.update(positions)
        .set({ qty: position.qty, avgCost: position.avgCost })
        .where(eq(positions.id, existing.id))
        .returning();
      return result[0];
    }
    
    const id = randomUUID();
    const result = await db.insert(positions).values({
      ...position,
      id,
    }).returning();
    return result[0];
  }

  async getPositionsByUser(userId: string): Promise<Position[]> {
    return db.select().from(positions)
      .where(and(
        eq(positions.userId, userId),
        sql`${positions.qty} > 0`
      ));
  }

  async getCommentsByMarket(marketId: string): Promise<Comment[]> {
    return db.select().from(comments)
      .where(and(
        eq(comments.marketId, marketId),
        isNull(comments.hiddenAt)
      ))
      .orderBy(desc(comments.createdAt));
  }

  async createComment(comment: Omit<Comment, "id" | "createdAt" | "hiddenAt">): Promise<Comment> {
    const id = randomUUID();
    const result = await db.insert(comments).values({
      ...comment,
      id,
      hiddenAt: null,
    }).returning();
    return result[0];
  }

  async createReport(report: Omit<Report, "id" | "createdAt" | "status">): Promise<Report> {
    const id = randomUUID();
    const result = await db.insert(reports).values({
      ...report,
      id,
      status: "PENDING",
    }).returning();
    return result[0];
  }

  async getReports(): Promise<Report[]> {
    return db.select().from(reports).orderBy(desc(reports.createdAt));
  }

  async updateReport(id: string, updates: Partial<Report>): Promise<Report | undefined> {
    const result = await db.update(reports).set(updates).where(eq(reports.id, id)).returning();
    return result[0];
  }

  async logBalanceEvent(event: Omit<BalanceEvent, "id" | "createdAt">): Promise<BalanceEvent> {
    const id = randomUUID();
    const result = await db.insert(balanceEvents).values({
      ...event,
      id,
    }).returning();
    return result[0];
  }

  async getLeaderboard(timeFilter?: string, limit: number = 100): Promise<LeaderboardEntry[]> {
    // Refresh stock prices once before ranking.
    await this.maybeTickStockPrices();

    const allUsers = await db.select().from(users)
      .where(and(
        eq(users.status, "VERIFIED"),
        ne(users.role, "ADMIN")
      ));

    if (allUsers.length === 0) return [];

    // Batch-load everything up front to avoid N+1 queries.
    const [allPositions, allOutcomes, allStockMeta, allEvents] = await Promise.all([
      db.select().from(positions).where(sql`${positions.qty} > 0`),
      db.select().from(outcomes),
      db.select().from(stockMetaTable),
      db.select().from(balanceEvents),
    ]);

    const outcomePrice = new Map(allOutcomes.map((o) => [o.id, o.currentPrice]));
    const stockPrice = new Map(allStockMeta.map((s) => [s.marketId, s.currentPrice]));

    const positionsByUser = new Map<string, Position[]>();
    for (const pos of allPositions) {
      const list = positionsByUser.get(pos.userId) || [];
      list.push(pos);
      positionsByUser.set(pos.userId, list);
    }

    // Window for the selected time filter.
    const windowMs = timeFilter === "weekly"
      ? 7 * 24 * 60 * 60 * 1000
      : timeFilter === "monthly"
        ? 30 * 24 * 60 * 60 * 1000
        : null;
    const windowStart = windowMs ? Date.now() - windowMs : null;

    // Per-user baselines (net deposits) and windowed realized activity.
    const DEPOSIT_TYPES = new Set(["STARTING_CREDIT", "BANKRUPTCY_RESET", "ADMIN_ADJUST"]);
    const ACTIVITY_TYPES = new Set(["TRADE", "RESOLUTION"]);
    const baselineByUser = new Map<string, number>();
    const periodPnLByUser = new Map<string, number>();
    for (const ev of allEvents) {
      if (DEPOSIT_TYPES.has(ev.type)) {
        baselineByUser.set(ev.userId, (baselineByUser.get(ev.userId) || 0) + ev.amount);
      }
      if (windowStart && ACTIVITY_TYPES.has(ev.type) &&
          new Date(ev.createdAt).getTime() >= windowStart) {
        periodPnLByUser.set(ev.userId, (periodPnLByUser.get(ev.userId) || 0) + ev.amount);
      }
    }

    const entries: LeaderboardEntry[] = allUsers.map((user) => {
      const userPositions = positionsByUser.get(user.id) || [];
      let positionsValue = 0;
      for (const pos of userPositions) {
        if (pos.outcomeId) {
          positionsValue += pos.qty * (outcomePrice.get(pos.outcomeId) ?? 0);
        } else {
          positionsValue += pos.qty * (stockPrice.get(pos.marketId) ?? 0);
        }
      }

      const totalValue = round2(user.balance + positionsValue);
      // Baseline = actual net deposits (never a hardcoded $1000).
      const baseline = baselineByUser.get(user.id) || 1000;
      // changePercent is the all-time return on equity: (current equity - net
      // deposits) / net deposits. We deliberately do NOT derive a windowed
      // figure from raw TRADE cash-flow — a BUY's negative cash delta is not a
      // loss (it becomes position value), so summing cash-flow makes holders
      // look like they lost money. A correct windowed return needs a
      // start-of-window equity snapshot we don't persist yet, so weekly/monthly
      // rank on the same equity return (approximate) rather than show wrong
      // negatives.
      void windowStart; void periodPnLByUser;
      const changePercent = baseline > 0 ? ((totalValue - baseline) / baseline) * 100 : 0;

      return {
        rank: 0,
        userId: user.id,
        displayName: user.displayName,
        grade: user.grade || undefined,
        totalValue,
        cashBalance: user.balance,
        positionsValue: round2(positionsValue),
        changePercent,
      };
    });

    entries.sort((a, b) => b.totalValue - a.totalValue);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries.slice(0, limit);
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

    const userPositions = await this.getPositionsByUser(userId);
    const userTrades = await this.getTradesByUser(userId);

    const enrichedPositions: PositionWithDetails[] = await Promise.all(
      userPositions.map(async (pos) => {
        const market = await this.getMarket(pos.marketId);
        let currentPrice = 0;
        let outcome: Outcome | undefined;
        let stockMetaData: StockMeta | undefined;

        if (pos.outcomeId) {
          const outcomeResult = await db.select().from(outcomes)
            .where(eq(outcomes.id, pos.outcomeId)).limit(1);
          outcome = outcomeResult[0];
          currentPrice = outcome?.currentPrice ?? 0;
        } else {
          const stockMetaResult = await db.select().from(stockMetaTable)
            .where(eq(stockMetaTable.marketId, pos.marketId)).limit(1);
          stockMetaData = stockMetaResult[0];
          currentPrice = stockMetaData?.currentPrice ?? 0;
        }

        const currentValue = pos.qty * currentPrice;
        const costBasis = pos.qty * pos.avgCost;
        const pnl = currentValue - costBasis;

        return {
          ...pos,
          market,
          outcome,
          stockMeta: stockMetaData,
          currentValue,
          pnl,
        };
      })
    );

    const positionsValue = enrichedPositions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalValue = round2(user.balance + positionsValue);

    // P&L is measured against actual net deposits (starting credit + resets +
    // admin adjustments), not a hardcoded $1000 baseline.
    const depositEvents = await db.select().from(balanceEvents)
      .where(eq(balanceEvents.userId, userId));
    const DEPOSIT_TYPES = new Set(["STARTING_CREDIT", "BANKRUPTCY_RESET", "ADMIN_ADJUST"]);
    const baseline = depositEvents
      .filter((ev) => DEPOSIT_TYPES.has(ev.type))
      .reduce((sum, ev) => sum + ev.amount, 0) || 1000;
    const totalPnL = round2(totalValue - baseline);

    return {
      totalValue,
      cashBalance: user.balance,
      positionsValue: round2(positionsValue),
      totalPnL,
      positions: enrichedPositions,
      recentTrades: userTrades.slice(0, 20),
    };
  }

  async getStockCandles(marketId: string, limit: number = 100): Promise<StockCandle[]> {
    await this.maybeTickStockPrices();
    const result = await db.select().from(stockCandles)
      .where(eq(stockCandles.marketId, marketId))
      .orderBy(desc(stockCandles.timestamp))
      .limit(limit);

    return result.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async addStockCandle(candle: Omit<StockCandle, "id">): Promise<StockCandle> {
    const id = randomUUID();
    const result = await db.insert(stockCandles).values({
      ...candle,
      id,
    }).returning();
    return result[0];
  }

  async updateLatestCandle(marketId: string, price: number, volume: number): Promise<void> {
    const latestCandles = await db.select().from(stockCandles)
      .where(eq(stockCandles.marketId, marketId))
      .orderBy(desc(stockCandles.timestamp))
      .limit(1);

    if (latestCandles.length === 0) {
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

    const lastCandle = latestCandles[0];
    const now = new Date();
    const lastCandleTime = new Date(lastCandle.timestamp);
    const isSameDay = lastCandleTime.toDateString() === now.toDateString();

    if (isSameDay) {
      await db.update(stockCandles)
        .set({
          close: price,
          high: Math.max(lastCandle.high, price),
          low: Math.min(lastCandle.low, price),
          volume: lastCandle.volume + volume,
        })
        .where(eq(stockCandles.id, lastCandle.id));
    } else {
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
    const result = await db.select().from(marketCandles)
      .where(and(
        eq(marketCandles.marketId, marketId),
        eq(marketCandles.outcomeId, outcomeId)
      ))
      .orderBy(desc(marketCandles.timestamp))
      .limit(limit);

    return result.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  async createGame(game: Partial<Game>): Promise<Game> {
    const id = randomUUID();
    const result = await db.insert(games).values({
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
    }).returning();
    return result[0];
  }

  async getGame(id: string): Promise<Game | undefined> {
    const result = await db.select().from(games).where(eq(games.id, id)).limit(1);
    return result[0];
  }

  async getAllGames(): Promise<Game[]> {
    return db.select().from(games).orderBy(desc(games.gameDate));
  }

  async updateGame(id: string, updates: Partial<Game>): Promise<Game | undefined> {
    const result = await db.update(games).set(updates).where(eq(games.id, id)).returning();
    return result[0];
  }

  async deleteGame(id: string): Promise<boolean> {
    const result = await db.delete(games).where(eq(games.id, id)).returning();
    return result.length > 0;
  }

  async createPolymarketLink(link: Omit<PolymarketLink, "id" | "lastSynced">): Promise<PolymarketLink> {
    const id = randomUUID();
    const result = await db.insert(polymarketLinks).values({
      ...link,
      id,
      lastSynced: new Date(),
    }).returning();
    return result[0];
  }

  async getPolymarketLink(marketId: string): Promise<PolymarketLink | undefined> {
    const result = await db.select().from(polymarketLinks)
      .where(eq(polymarketLinks.marketId, marketId)).limit(1);
    return result[0];
  }

  async getPolymarketMarkets(): Promise<MarketWithDetails[]> {
    const links = await db.select().from(polymarketLinks);
    const polymarketMarketIds = new Set(links.map((link) => link.marketId));

    const allMarkets = await db.select().from(markets)
      .where(ne(markets.status, "HIDDEN"))
      .orderBy(desc(markets.createdAt));

    const filtered = allMarkets.filter(
      (m) => m.source === "POLYMARKET" || polymarketMarketIds.has(m.id)
    );

    return Promise.all(filtered.map((m) => this.enrichMarket(m)));
  }
}

// Database-backed storage. Seeding is handled exclusively by server/seed.ts
// (the single canonical seeder) and price simulation by storage.maybeTickStockPrices()
// plus an optional local-dev interval (stockSimulator.startStockSimulation, guarded
// off on Vercel). Nothing runs at module load.
const dbStorage = new DbStorage();

export const storage = dbStorage;
