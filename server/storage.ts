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
} from "@shared/schema";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { db } from "./db";
import { eq, and, desc, sql, ne, isNull } from "drizzle-orm";
import { generateHistoricalCandles, assignPatternType, startStockSimulation } from "./stockSimulator";
import { stockSimProfiles } from "@shared/schema";

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

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
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
    const id = user.id || randomUUID();
    const DEVELOPER_EMAILS = [
      "alex.kindler@menloschool.org",
      "lincoln.bott@menloschool.org",
    ];
    const isDeveloper = DEVELOPER_EMAILS.includes(user.email.toLowerCase());
    
    const result = await db.insert(users).values({
      id,
      email: user.email,
      password: hashPassword(user.password),
      displayName: user.displayName,
      grade: user.grade || null,
      role: "STUDENT",
      status: "VERIFIED",
      emailVerifiedAt: new Date(),
      balance: 1000,
      disclaimerAcceptedAt: null,
      lastBankruptcyReset: null,
      hasMkAiAccess: isDeveloper,
    }).returning();

    await this.logBalanceEvent({
      userId: id,
      type: "STARTING_CREDIT",
      amount: 1000,
      note: "Initial balance upon registration",
    });

    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
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

    const updatedUser = await this.updateUser(user.id, {
      status: "VERIFIED",
      emailVerifiedAt: new Date(),
      balance: 1000,
    });

    await this.logBalanceEvent({
      userId: user.id,
      type: "STARTING_CREDIT",
      amount: 1000,
      note: "Initial balance upon email verification",
    });

    await db.update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.tokenHash, tokenHash));

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
    let query = db.select().from(markets)
      .where(ne(markets.status, "HIDDEN"))
      .orderBy(desc(markets.createdAt));
    
    const result = await query;
    const filtered = type ? result.filter(m => m.type === type) : result;
    return Promise.all(filtered.map((m) => this.enrichMarket(m)));
  }

  async getMarket(id: string): Promise<MarketWithDetails | undefined> {
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

  async getLeaderboard(timeFilter?: string): Promise<LeaderboardEntry[]> {
    const allUsers = await db.select().from(users)
      .where(and(
        eq(users.status, "VERIFIED"),
        ne(users.role, "ADMIN")
      ));

    const entries: LeaderboardEntry[] = await Promise.all(
      allUsers.map(async (user) => {
        const userPositions = await this.getPositionsByUser(user.id);
        let positionsValue = 0;

        for (const pos of userPositions) {
          if (pos.outcomeId) {
            const outcomeResult = await db.select().from(outcomes)
              .where(eq(outcomes.id, pos.outcomeId)).limit(1);
            if (outcomeResult[0]) {
              positionsValue += pos.qty * outcomeResult[0].currentPrice;
            }
          } else {
            const stockMetaResult = await db.select().from(stockMetaTable)
              .where(eq(stockMetaTable.marketId, pos.marketId)).limit(1);
            if (stockMetaResult[0]) {
              positionsValue += pos.qty * stockMetaResult[0].currentPrice;
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
    const totalValue = user.balance + positionsValue;
    const totalPnL = totalValue - 1000;

    return {
      totalValue,
      cashBalance: user.balance,
      positionsValue,
      totalPnL,
      positions: enrichedPositions,
      recentTrades: userTrades.slice(0, 20),
    };
  }

  async getStockCandles(marketId: string, limit: number = 100): Promise<StockCandle[]> {
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

// Database seeding function - runs once if database is empty
async function seedDatabase(): Promise<void> {
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database with initial data...");

  // Create admin user
  const adminId = randomUUID();
  await db.insert(users).values({
    id: adminId,
    email: "admin@menloschool.org",
    password: hashPassword("admin123"),
    displayName: "Admin",
    grade: "Faculty",
    role: "ADMIN",
    status: "VERIFIED",
    emailVerifiedAt: new Date(),
    balance: 10000,
    disclaimerAcceptedAt: new Date(),
    hasMkAiAccess: false,
  });

  // Create demo student
  const studentId = randomUUID();
  await db.insert(users).values({
    id: studentId,
    email: "student@menloschool.org",
    password: hashPassword("student123"),
    displayName: "Demo Student",
    grade: "Junior",
    role: "STUDENT",
    status: "VERIFIED",
    emailVerifiedAt: new Date(),
    balance: 1250,
    disclaimerAcceptedAt: new Date(),
    hasMkAiAccess: false,
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

  for (let i = 0; i < demoUsers.length; i++) {
    const u = demoUsers[i];
    await db.insert(users).values({
      id: randomUUID(),
      email: `demo${i + 1}@menloschool.org`,
      password: hashPassword("demo123"),
      displayName: u.name,
      grade: u.grade,
      role: "STUDENT",
      status: "VERIFIED",
      emailVerifiedAt: new Date(),
      balance: u.balance,
      disclaimerAcceptedAt: new Date(),
      hasMkAiAccess: false,
    });
  }

  // Create prediction markets
  const predictionMarketsData = [
    { title: "Will Menlo Robotics win at VEX States?", description: "Resolves YES if Menlo Robotics Club places 1st at the VEX State Championship.", category: "Clubs", closeAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official VEX competition results" },
    { title: "Will Drama Club's spring show sell out?", description: "Resolves YES if all tickets for Drama Club's spring production are sold.", category: "Clubs", closeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), resolutionRule: "Based on ticket sales records" },
    { title: "Will Model UN win Best Delegation?", description: "Resolves YES if Menlo Model UN wins Best Delegation at the next major conference.", category: "Clubs", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official MUN awards" },
    { title: "Will Spirit Week have 80%+ participation?", description: "Resolves YES if more than 80% of students participate in at least one Spirit Week event.", category: "Events", closeAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), resolutionRule: "Based on attendance records" },
    { title: "Will the average AP Calc score be above 4.0?", description: "Resolves YES if the class average on AP Calculus exam exceeds 4.0.", category: "Academics", closeAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), resolutionRule: "Based on College Board results" },
  ];

  for (const m of predictionMarketsData) {
    const marketId = randomUUID();
    await db.insert(markets).values({
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
    });

    const yesPrice = 0.3 + Math.random() * 0.4;
    await db.insert(outcomes).values([
      { id: randomUUID(), marketId, label: "YES", currentPrice: yesPrice },
      { id: randomUUID(), marketId, label: "NO", currentPrice: 1 - yesPrice },
    ]);
  }

  // Create stock markets for all 56 clubs with different patterns
  const stocksData = [
    { ticker: "ANIME", name: "Anime Club", price: 28, description: "Watch anime with friends and have snacks." },
    { ticker: "ROBOT", name: "Menlo Robotics Club", price: 48, description: "Have fun while tinkering and learning about engineering." },
    { ticker: "MUN", name: "Model UN", price: 44, description: "Exercise vital skills like public speaking and debate." },
    { ticker: "DRAMA", name: "Drama Club", price: 36, description: "Act, create, and help bring Menlo shows to life." },
    { ticker: "DEBAT", name: "Parliamentary Debate", price: 43, description: "Part of a debate team ranked top 20 in the country." },
    { ticker: "TEDX", name: "TEDx Menlo", price: 45, description: "Be part of the production team for TEDx event." },
    { ticker: "ENGR", name: "Engineering Club", price: 45, description: "Build an electric go-cart." },
    { ticker: "GWC", name: "Girls Who Code", price: 38, description: "A fun place for girls who love STEM." },
    { ticker: "BIZ", name: "Business & Entrepreneurship Club", price: 42, description: "Learn how to start a business." },
    { ticker: "CLMT", name: "Climate Coalition", price: 38, description: "Focus on climate action and advocacy." },
    { ticker: "ENVIR", name: "Environmental Action", price: 35, description: "Take action on environmental issues at school." },
    { ticker: "SPCH", name: "Speech & Debate", price: 41, description: "Compete in public speaking and argumentation." },
    { ticker: "MATH", name: "Math Club", price: 39, description: "Solve challenging problems and compete in math olympiads." },
    { ticker: "CHEM", name: "Chemistry Club", price: 33, description: "Explore chemistry through experiments and competitions." },
    { ticker: "PHYS", name: "Physics Club", price: 34, description: "Discover the laws of the universe through hands-on projects." },
    { ticker: "BIO", name: "Biology Club", price: 32, description: "Study life sciences and environmental biology." },
    { ticker: "ASTRO", name: "Astronomy Club", price: 29, description: "Observe the night sky and learn about space." },
    { ticker: "CHESS", name: "Chess Club", price: 31, description: "Improve your strategic thinking through chess." },
    { ticker: "MUSIC", name: "Music Production Club", price: 37, description: "Create and produce original music." },
    { ticker: "PHOTO", name: "Photography Club", price: 30, description: "Capture moments and improve your photography skills." },
    { ticker: "FILM", name: "Film Club", price: 40, description: "Make short films and explore cinematography." },
    { ticker: "ART", name: "Art Club", price: 27, description: "Express yourself through various art mediums." },
    { ticker: "WRITE", name: "Creative Writing Club", price: 26, description: "Write poetry, stories, and creative pieces." },
    { ticker: "NEWS", name: "School Newspaper", price: 35, description: "Report on school events and student life." },
    { ticker: "YRBK", name: "Yearbook", price: 34, description: "Document the school year in photos and memories." },
    { ticker: "CULT", name: "Cultural Club", price: 33, description: "Celebrate diversity and cultural exchange." },
    { ticker: "SPAN", name: "Spanish Club", price: 28, description: "Practice Spanish and explore Hispanic culture." },
    { ticker: "FRNCH", name: "French Club", price: 27, description: "Learn French language and culture." },
    { ticker: "CHINA", name: "Chinese Club", price: 31, description: "Explore Chinese language and traditions." },
    { ticker: "KOREA", name: "Korean Club", price: 32, description: "Learn Korean language and K-culture." },
    { ticker: "JSA", name: "Junior State of America", price: 42, description: "Engage in political debate and civic education." },
    { ticker: "MOCK", name: "Mock Trial", price: 44, description: "Argue cases in simulated courtroom competitions." },
    { ticker: "ECON", name: "Economics Club", price: 40, description: "Study markets and economic principles." },
    { ticker: "INVEST", name: "Investment Club", price: 46, description: "Learn about stocks and portfolio management." },
    { ticker: "CODE", name: "Coding Club", price: 47, description: "Learn programming and build software projects." },
    { ticker: "CYBER", name: "Cybersecurity Club", price: 43, description: "Learn about digital security and ethical hacking." },
    { ticker: "AI", name: "AI & Machine Learning", price: 50, description: "Explore artificial intelligence and ML projects." },
    { ticker: "GAME", name: "Game Development Club", price: 38, description: "Design and create video games." },
    { ticker: "ESPORT", name: "Esports Club", price: 35, description: "Compete in competitive gaming tournaments." },
    { ticker: "COOK", name: "Cooking Club", price: 29, description: "Learn culinary skills and try new recipes." },
    { ticker: "GARDEN", name: "Garden Club", price: 25, description: "Grow plants and maintain the school garden." },
    { ticker: "YOGA", name: "Yoga & Wellness Club", price: 28, description: "Practice mindfulness and physical wellness." },
    { ticker: "RUN", name: "Running Club", price: 26, description: "Train for races and enjoy group runs." },
    { ticker: "HIKE", name: "Hiking Club", price: 27, description: "Explore local trails and nature." },
    { ticker: "VOLUN", name: "Community Service", price: 36, description: "Give back through volunteer opportunities." },
    { ticker: "TUTOR", name: "Peer Tutoring", price: 33, description: "Help fellow students succeed academically." },
    { ticker: "LEAD", name: "Leadership Council", price: 41, description: "Develop leadership skills and plan events." },
    { ticker: "STUCO", name: "Student Council", price: 45, description: "Represent student voice in school governance." },
    { ticker: "SPIRIT", name: "Spirit Committee", price: 34, description: "Boost school spirit and plan pep rallies." },
    { ticker: "DANCE", name: "Dance Team", price: 37, description: "Perform at games and school events." },
    { ticker: "ACAP", name: "A Cappella", price: 39, description: "Sing in harmony without instruments." },
    { ticker: "ORCH", name: "Orchestra", price: 38, description: "Play classical music in the school orchestra." },
    { ticker: "BAND", name: "Jazz Band", price: 36, description: "Perform jazz and contemporary music." },
    { ticker: "CHOIR", name: "Choir", price: 32, description: "Sing in the school's vocal ensemble." },
    { ticker: "THTR", name: "Theater Tech", price: 30, description: "Build sets and run tech for productions." },
    { ticker: "IMPROV", name: "Improv Comedy", price: 35, description: "Perform spontaneous comedy and sketches." },
  ];

  const createdMarketIds: { marketId: string; price: number; index: number }[] = [];

  for (let i = 0; i < stocksData.length; i++) {
    const s = stocksData[i];
    const marketId = randomUUID();
    await db.insert(markets).values({
      id: marketId,
      type: "STOCK",
      title: s.name,
      description: s.description,
      category: "Clubs",
      status: "OPEN",
      source: "INTERNAL",
      closeAt: null,
      resolveAt: null,
      resolutionRule: null,
      createdBy: adminId,
    });

    await db.insert(stockMetaTable).values({
      id: randomUUID(),
      marketId,
      ticker: s.ticker,
      initialPrice: s.price,
      currentPrice: s.price,
      floatSupply: 10000,
      virtualLiquidity: 100000,
    });

    createdMarketIds.push({ marketId, price: s.price, index: i });
  }

  console.log(`Created ${createdMarketIds.length} stock markets, generating historical data...`);

  for (const { marketId, price, index } of createdMarketIds) {
    const patternType = assignPatternType(index);
    await generateHistoricalCandles(marketId, price, patternType, 180);
  }

  console.log("Database seeding complete!");
}

// Initialize database storage and seed if needed
const dbStorage = new DbStorage();

// Export database storage
export const storage = dbStorage;

// Call seeding function on startup and always start simulation
seedDatabase().then(() => {
  startStockSimulation(5);
}).catch((err) => {
  console.error("Failed to seed database:", err);
});
