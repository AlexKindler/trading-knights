import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import { insertUserSchema, loginSchema, insertTradeSchema, insertCommentSchema, insertReportSchema, insertGameSchema } from "@shared/schema";
import { createHash } from "crypto";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const PgStore = pgSession(session);

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// Middleware to require authentication
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

// Middleware to require verified user
async function requireVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.status !== "VERIFIED") {
    return res.status(403).json({ message: "Email verification required" });
  }
  next();
}

// Middleware to require admin
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session middleware with PostgreSQL store for persistence across restarts
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "campus-kalshi-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new PgStore({
        pool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: "lax",
      },
    })
  );

  // ==================== AUTH ROUTES ====================

  // Developer emails - these accounts receive MK AI revenue split
  // Once registered, these emails are protected and cannot be re-registered
  const DEVELOPER_EMAILS = [
    "alex.kindler@menloschool.org",
    "lincoln.bott@menloschool.org",
  ];

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const existing = await storage.getUserByEmail(parsed.data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = await storage.createUser(parsed.data);
      
      // Auto-verify all users and give starting balance
      await storage.updateUser(user.id, { status: "VERIFIED", balance: 1000 });
      await storage.logBalanceEvent({
        userId: user.id,
        type: "STARTING_CREDIT",
        amount: 1000,
        note: "Welcome bonus - starting balance",
      });

      const updatedUser = await storage.getUser(user.id);
      req.session.userId = user.id;
      res.json({ user: { ...updatedUser, password: undefined } });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const user = await storage.getUserByEmail(parsed.data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const hashedPassword = hashPassword(parsed.data.password);
      if (user.password !== hashedPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.status === "SUSPENDED") {
        return res.status(403).json({ message: "Account suspended" });
      }

      req.session.userId = user.id;
      res.json({ user: { ...user, password: undefined } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ user: { ...user, password: undefined } });
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token required" });
      }

      const user = await storage.verifyToken(token);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      req.session.userId = user.id;
      res.json({ user: { ...user, password: undefined } });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.status === "VERIFIED") {
        return res.status(400).json({ message: "Already verified" });
      }

      const token = await storage.createVerificationToken(user.id);

      // Send verification email
      const emailSent = await sendVerificationEmail(user.email, token);
      
      if (!emailSent) {
        console.log("\n========================================");
        console.log("📧 VERIFICATION LINK (Email failed to send):");
        console.log(`   ${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000'}/verify-email?token=${token}`);
        console.log("========================================\n");
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification" });
    }
  });

  // ==================== PASSWORD RESET ROUTES ====================

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email required" });
      }

      const user = await storage.getUserByEmail(email);
      
      // Always return success to prevent email enumeration attacks
      if (!user) {
        return res.json({ success: true, message: "If an account exists with this email, a reset link will be sent." });
      }

      const token = await storage.createPasswordResetToken(user.id);
      
      const emailSent = await sendPasswordResetEmail(user.email, token);
      
      if (!emailSent) {
        console.log("\n========================================");
        console.log("🔑 PASSWORD RESET LINK (Email failed to send):");
        console.log(`   ${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:5000'}/reset-password?token=${token}`);
        console.log("========================================\n");
      }

      res.json({ success: true, message: "If an account exists with this email, a reset link will be sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const user = await storage.verifyPasswordResetToken(token);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Update password
      await storage.updateUser(user.id, {
        password: hashPassword(newPassword),
      });

      // Mark token as used
      await storage.markPasswordResetTokenUsed(token);

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ==================== MARKETS ROUTES ====================

  app.get("/api/markets", async (req, res) => {
    try {
      const markets = await storage.getMarkets("PREDICTION");
      res.json(markets);
    } catch (error) {
      console.error("Get markets error:", error);
      res.status(500).json({ message: "Failed to fetch markets" });
    }
  });

  app.get("/api/markets/:id", async (req, res) => {
    try {
      const market = await storage.getMarket(req.params.id);
      if (!market) {
        return res.status(404).json({ message: "Market not found" });
      }
      res.json(market);
    } catch (error) {
      console.error("Get market error:", error);
      res.status(500).json({ message: "Failed to fetch market" });
    }
  });

  app.get("/api/markets/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByMarket(req.params.id);
      res.json(comments);
    } catch (error) {
      console.error("Get comments error:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.get("/api/markets/:id/outcomes/:outcomeId/candles", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const candles = await storage.getMarketCandles(req.params.id, req.params.outcomeId, limit);
      res.json(candles);
    } catch (error) {
      console.error("Get market candles error:", error);
      res.status(500).json({ message: "Failed to fetch candles" });
    }
  });

  // ==================== STOCKS ROUTES ====================

  app.get("/api/stocks", async (req, res) => {
    try {
      const stocks = await storage.getMarkets("STOCK");
      res.json(stocks);
    } catch (error) {
      console.error("Get stocks error:", error);
      res.status(500).json({ message: "Failed to fetch stocks" });
    }
  });

  app.get("/api/stocks/:id", async (req, res) => {
    try {
      const stock = await storage.getMarket(req.params.id);
      if (!stock || stock.type !== "STOCK") {
        return res.status(404).json({ message: "Stock not found" });
      }
      res.json(stock);
    } catch (error) {
      console.error("Get stock error:", error);
      res.status(500).json({ message: "Failed to fetch stock" });
    }
  });

  app.get("/api/stocks/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByMarket(req.params.id);
      res.json(comments);
    } catch (error) {
      console.error("Get comments error:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.get("/api/stocks/:id/candles", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const candles = await storage.getStockCandles(req.params.id, limit);
      res.json(candles);
    } catch (error) {
      console.error("Get candles error:", error);
      res.status(500).json({ message: "Failed to fetch candles" });
    }
  });

  // ==================== TRADING ROUTES ====================

  app.post("/api/trades", requireVerified, async (req, res) => {
    try {
      const parsed = insertTradeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { marketId, outcomeId, side, qty } = parsed.data;
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const market = await storage.getMarket(marketId);
      if (!market || market.status !== "OPEN") {
        return res.status(400).json({ message: "Market not available for trading" });
      }

      // Get current price
      let currentPrice: number;
      if (market.type === "PREDICTION" && outcomeId) {
        const outcomes = market.outcomes;
        const outcome = outcomes?.find((o) => o.id === outcomeId);
        if (!outcome) {
          return res.status(400).json({ message: "Outcome not found" });
        }
        currentPrice = outcome.currentPrice;
      } else if (market.type === "STOCK") {
        const stockMeta = market.stockMeta;
        if (!stockMeta) {
          return res.status(400).json({ message: "Stock not found" });
        }
        currentPrice = stockMeta.currentPrice;
      } else {
        return res.status(400).json({ message: "Invalid trade" });
      }

      const total = qty * currentPrice;

      // Check balance for buy
      if (side === "BUY") {
        if (user.balance < total) {
          return res.status(400).json({ message: "Insufficient balance" });
        }
      }

      // Check position for sell
      if (side === "SELL") {
        const position = await storage.getPosition(user.id, marketId, outcomeId);
        if (!position || position.qty < qty) {
          return res.status(400).json({ message: "Insufficient shares" });
        }
      }

      // Execute trade
      const trade = await storage.createTrade({
        userId: user.id,
        marketId,
        outcomeId: outcomeId || null,
        side,
        qty,
        price: currentPrice,
        total,
      });

      // Update user balance
      const newBalance =
        side === "BUY" ? user.balance - total : user.balance + total;
      await storage.updateUser(user.id, { balance: newBalance });

      // Log balance event
      await storage.logBalanceEvent({
        userId: user.id,
        type: "TRADE",
        amount: side === "BUY" ? -total : total,
        note: `${side} ${qty} shares at $${currentPrice.toFixed(2)}`,
      });

      // Update position
      const existingPosition = await storage.getPosition(user.id, marketId, outcomeId);
      if (side === "BUY") {
        if (existingPosition) {
          const newQty = existingPosition.qty + qty;
          const newAvgCost =
            (existingPosition.qty * existingPosition.avgCost + qty * currentPrice) /
            newQty;
          await storage.upsertPosition({
            userId: user.id,
            marketId,
            outcomeId: outcomeId || null,
            qty: newQty,
            avgCost: newAvgCost,
          });
        } else {
          await storage.upsertPosition({
            userId: user.id,
            marketId,
            outcomeId: outcomeId || null,
            qty,
            avgCost: currentPrice,
          });
        }
      } else {
        // SELL
        if (existingPosition) {
          const newQty = existingPosition.qty - qty;
          await storage.upsertPosition({
            userId: user.id,
            marketId,
            outcomeId: outcomeId || null,
            qty: newQty,
            avgCost: existingPosition.avgCost,
          });
        }
      }

      // Simple AMM price update
      if (market.type === "PREDICTION" && outcomeId) {
        const priceChange = side === "BUY" ? 0.02 : -0.02;
        const outcome = market.outcomes?.find((o) => o.id === outcomeId);
        if (outcome) {
          const newPrice = Math.max(0.01, Math.min(0.99, outcome.currentPrice + priceChange));
          await storage.updateOutcome(outcomeId, { currentPrice: newPrice });

          // Update opposite outcome
          const otherOutcome = market.outcomes?.find((o) => o.id !== outcomeId);
          if (otherOutcome) {
            await storage.updateOutcome(otherOutcome.id, { currentPrice: 1 - newPrice });
          }
        }
      } else if (market.type === "STOCK") {
        const priceChange = side === "BUY" ? currentPrice * 0.01 : -currentPrice * 0.01;
        await storage.updateStockMeta(marketId, {
          currentPrice: Math.max(0.01, currentPrice + priceChange),
        });
      }

      // Check for bankruptcy reset
      const updatedUser = await storage.getUser(user.id);
      if (updatedUser && updatedUser.balance <= 0) {
        const canReset =
          !updatedUser.lastBankruptcyReset ||
          Date.now() - new Date(updatedUser.lastBankruptcyReset).getTime() >
            24 * 60 * 60 * 1000;
        if (canReset) {
          await storage.updateUser(user.id, {
            balance: 100,
            lastBankruptcyReset: new Date(),
          });
          await storage.logBalanceEvent({
            userId: user.id,
            type: "BANKRUPTCY_RESET",
            amount: 100,
            note: "Automatic bankruptcy reset",
          });
        }
      }

      res.json({ trade, newBalance });
    } catch (error: any) {
      console.error("Trade error:", error);
      console.error("Trade error stack:", error?.stack);
      res.status(500).json({ message: error?.message || "Trade failed" });
    }
  });

  // ==================== PORTFOLIO ROUTES ====================

  app.get("/api/portfolio", requireAuth, async (req, res) => {
    try {
      const portfolio = await storage.getPortfolio(req.session.userId!);
      res.json(portfolio);
    } catch (error) {
      console.error("Get portfolio error:", error);
      res.status(500).json({ message: "Failed to fetch portfolio" });
    }
  });

  // ==================== LEADERBOARD ROUTES ====================

  app.get("/api/leaderboard", async (req, res) => {
    try {
      const timeFilter = req.query.timeFilter as string | undefined;
      const leaderboard = await storage.getLeaderboard(timeFilter);
      res.json(leaderboard);
    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/leaderboard/:timeFilter", async (req, res) => {
    try {
      const leaderboard = await storage.getLeaderboard(req.params.timeFilter);
      res.json(leaderboard);
    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // ==================== COMMENTS ROUTES ====================

  app.post("/api/comments", requireVerified, async (req, res) => {
    try {
      const parsed = insertCommentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const comment = await storage.createComment({
        userId: req.session.userId!,
        marketId: parsed.data.marketId,
        text: parsed.data.text,
      });

      res.json(comment);
    } catch (error) {
      console.error("Create comment error:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // ==================== REPORTS ROUTES ====================

  app.post("/api/reports", requireVerified, async (req, res) => {
    try {
      const parsed = insertReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const report = await storage.createReport({
        reporterId: req.session.userId!,
        targetType: parsed.data.targetType,
        targetId: parsed.data.targetId,
        reason: parsed.data.reason,
      });

      res.json(report);
    } catch (error) {
      console.error("Create report error:", error);
      res.status(500).json({ message: "Failed to create report" });
    }
  });

  // ==================== ADMIN ROUTES ====================

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users.map((u) => ({ ...u, password: undefined })));
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:id/suspend", requireAdmin, async (req, res) => {
    try {
      const user = await storage.updateUser(req.params.id, { status: "SUSPENDED" });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error) {
      console.error("Suspend user error:", error);
      res.status(500).json({ message: "Failed to suspend user" });
    }
  });

  app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    try {
      const reports = await storage.getReports();
      res.json(reports);
    } catch (error) {
      console.error("Get reports error:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.post("/api/admin/reports/:id/resolve", requireAdmin, async (req, res) => {
    try {
      const { action } = req.body;
      const status = action === "dismiss" ? "DISMISSED" : "REVIEWED";
      const report = await storage.updateReport(req.params.id, { status });
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      res.json(report);
    } catch (error) {
      console.error("Resolve report error:", error);
      res.status(500).json({ message: "Failed to resolve report" });
    }
  });

  app.get("/api/admin/markets/pending", requireAdmin, async (req, res) => {
    try {
      // For now, just return empty array as we don't have pending approval flow
      res.json([]);
    } catch (error) {
      console.error("Get pending markets error:", error);
      res.status(500).json({ message: "Failed to fetch pending markets" });
    }
  });

  // ==================== GAMES ROUTES ====================

  app.get("/api/admin/games", requireAdmin, async (req, res) => {
    try {
      const games = await storage.getAllGames();
      res.json(games);
    } catch (error) {
      console.error("Get games error:", error);
      res.status(500).json({ message: "Failed to fetch games" });
    }
  });

  app.post("/api/admin/games", requireAdmin, async (req, res) => {
    try {
      const parsed = insertGameSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const game = await storage.createGame({
        ...parsed.data,
        createdBy: req.session.userId!,
      });

      res.json(game);
    } catch (error) {
      console.error("Create game error:", error);
      res.status(500).json({ message: "Failed to create game" });
    }
  });

  app.post("/api/admin/games/:id/create-market", requireAdmin, async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      if (game.marketId) {
        return res.status(400).json({ message: "Market already exists for this game" });
      }

      const sportName = game.sport.charAt(0) + game.sport.slice(1).toLowerCase();
      const market = await storage.createMarket({
        type: "PREDICTION",
        title: `Menlo ${sportName} vs ${game.opponent}: Will Menlo win?`,
        description: `Prediction market for the ${sportName} game against ${game.opponent}. Resolves YES if Menlo wins, NO if Menlo loses or ties.`,
        category: "Sports",
        status: "OPEN",
        source: "INTERNAL",
        closeAt: game.gameDate,
        resolveAt: new Date(new Date(game.gameDate).getTime() + 24 * 60 * 60 * 1000),
        resolutionRule: "Based on official game results",
        createdBy: req.session.userId!,
      });

      await storage.createOutcome({
        marketId: market.id,
        label: "Yes",
        currentPrice: 0.5,
      });

      await storage.createOutcome({
        marketId: market.id,
        label: "No",
        currentPrice: 0.5,
      });

      await storage.updateGame(game.id, { marketId: market.id });

      res.json({ game: { ...game, marketId: market.id }, market });
    } catch (error) {
      console.error("Create market for game error:", error);
      res.status(500).json({ message: "Failed to create market" });
    }
  });

  // POST /api/admin/games/import-csv - Bulk import games from CSV data
  app.post("/api/admin/games/import-csv", requireAdmin, async (req, res) => {
    try {
      const { games } = req.body;
      if (!Array.isArray(games)) {
        return res.status(400).json({ message: "Invalid games data" });
      }

      const results = [];
      for (const gameData of games) {
        try {
          const game = await storage.createGame({
            ...gameData,
            createdBy: req.session.userId!,
            gameDate: new Date(gameData.gameDate),
          });
          results.push({ success: true, game });
        } catch (error) {
          results.push({ success: false, error: String(error), data: gameData });
        }
      }

      res.json({ imported: results.filter(r => r.success).length, total: games.length, results });
    } catch (error) {
      console.error("Import CSV games error:", error);
      res.status(500).json({ message: "Failed to import games" });
    }
  });

  app.post("/api/admin/games/:id/score", requireAdmin, async (req, res) => {
    try {
      const { menloScore, opponentScore } = req.body;
      if (typeof menloScore !== "number" || typeof opponentScore !== "number") {
        return res.status(400).json({ message: "Invalid scores" });
      }

      const game = await storage.getGame(req.params.id);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }

      const updatedGame = await storage.updateGame(game.id, {
        menloScore,
        opponentScore,
        status: "COMPLETED",
      });

      if (game.marketId) {
        const market = await storage.getMarket(game.marketId);
        if (market && market.status === "OPEN") {
          const outcomes = await storage.getOutcomesByMarket(game.marketId);
          const yesOutcome = outcomes.find((o) => o.label === "Yes");
          const noOutcome = outcomes.find((o) => o.label === "No");

          if (!yesOutcome || !noOutcome) {
            console.warn("Market missing expected Yes/No outcomes, skipping resolution");
          } else if (menloScore === opponentScore) {
            // Tie game - don't resolve market, mark as cancelled
            await storage.updateMarket(game.marketId, { status: "CLOSED" });
            // Refund logic would go here in a real system
            console.log("Game tied - market closed without resolution");
          } else {
            // Resolve market based on winner
            await storage.updateMarket(game.marketId, { status: "RESOLVED" });
            const menloWon = menloScore > opponentScore;
            const winningOutcome = menloWon ? yesOutcome : noOutcome;
            const losingOutcome = menloWon ? noOutcome : yesOutcome;

            await storage.updateOutcome(winningOutcome.id, { currentPrice: 1 });
            await storage.updateOutcome(losingOutcome.id, { currentPrice: 0 });
          }
        }
      }

      res.json(updatedGame);
    } catch (error) {
      console.error("Update game score error:", error);
      res.status(500).json({ message: "Failed to update score" });
    }
  });

  app.delete("/api/admin/games/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteGame(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Game not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete game error:", error);
      res.status(500).json({ message: "Failed to delete game" });
    }
  });

  // ==================== MK AI ROUTES ====================

  const MK_AI_PRICE = 10000;

  const MK_AI_DEVELOPER_EMAILS = [
    "alex.kindler@menloschool.org",
    "lincoln.bott@menloschool.org",
  ];

  app.get("/api/mk-ai/access", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Developers always have free access
      const isDeveloper = MK_AI_DEVELOPER_EMAILS.includes(user.email.toLowerCase());
      res.json({ hasAccess: user.hasMkAiAccess || isDeveloper });
    } catch (error) {
      console.error("Get MK AI access error:", error);
      res.status(500).json({ message: "Failed to check access" });
    }
  });

  app.post("/api/mk-ai/purchase", requireVerified, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.hasMkAiAccess) {
        return res.status(400).json({ message: "You already have MK AI access" });
      }

      if (user.balance < MK_AI_PRICE) {
        return res.status(400).json({ message: "Insufficient balance. You need $10,000 to purchase MK AI." });
      }

      const newBalance = user.balance - MK_AI_PRICE;
      await storage.updateUser(user.id, {
        balance: newBalance,
        hasMkAiAccess: true,
      });

      await storage.logBalanceEvent({
        userId: user.id,
        type: "MK_AI_PURCHASE",
        amount: -MK_AI_PRICE,
        note: "Purchased MK AI access",
      });

      const sharePerDeveloper = Math.floor(MK_AI_PRICE / MK_AI_DEVELOPER_EMAILS.length);
      for (const devEmail of MK_AI_DEVELOPER_EMAILS) {
        const developer = await storage.getUserByEmail(devEmail);
        if (developer) {
          const devNewBalance = developer.balance + sharePerDeveloper;
          await storage.updateUser(developer.id, { balance: devNewBalance });
          await storage.logBalanceEvent({
            userId: developer.id,
            type: "ADMIN_ADJUST",
            amount: sharePerDeveloper,
            note: `MK AI revenue share from ${user.email}`,
          });
        }
      }

      res.json({ success: true, newBalance, hasAccess: true });
    } catch (error) {
      console.error("Purchase MK AI error:", error);
      res.status(500).json({ message: "Failed to purchase MK AI" });
    }
  });

  // MK AI Advisor - contextual stock/sports predictions
  app.post("/api/mk-ai/advisor", requireVerified, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Developers always have free access
      const isDeveloper = MK_AI_DEVELOPER_EMAILS.includes(user.email.toLowerCase());
      if (!user.hasMkAiAccess && !isDeveloper) {
        return res.status(403).json({ message: "MK AI access required" });
      }

      const { message, stockId, mode } = req.body;
      if (!message) {
        return res.status(400).json({ message: "Message required" });
      }

      // Get context based on mode
      let context = "";
      
      if (mode === "sports") {
        // Fetch sports markets from Polymarket for context
        try {
          const polyResponse = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=50&active=true");
          const events = await polyResponse.json();
          const sportsEvents = events.filter((e: any) => {
            const slug = (e.slug || "").toLowerCase();
            const text = (e.title + " " + (e.description || "")).toLowerCase();
            return ["nba", "nfl", "mlb", "nhl", "super-bowl", "champions-league", "world-cup", "tennis", "golf", "masters", "ufc"].some(k => slug.includes(k) || text.includes(k));
          }).slice(0, 10);
          
          context = `You are MK AI, a sports betting advisor for Trading Knights (a Menlo School prediction market). Here are the current live sports markets from Polymarket:\n\n`;
          for (const event of sportsEvents) {
            context += `- ${event.title} (Volume: $${(event.volume || 0).toLocaleString()})\n`;
            if (event.markets?.[0]) {
              try {
                const prices = JSON.parse(event.markets[0].outcomePrices || "[]");
                context += `  YES: ${(parseFloat(prices[0]) * 100).toFixed(0)}%, NO: ${(parseFloat(prices[1]) * 100).toFixed(0)}%\n`;
              } catch {}
            }
          }
          context += `\nGive betting advice based on odds and value. Be specific about which outcomes look favorable.`;
        } catch {
          context = "You are MK AI, a sports betting advisor. Give general sports betting advice.";
        }
      } else {
        // Stock mode - get all stocks for context
        const allStocks = await storage.getMarkets("STOCK");
        context = `You are MK AI, a stock trading advisor for Trading Knights (a Menlo School prediction market with fake money). Here are all the current stocks:\n\n`;
        
        for (const stock of allStocks.slice(0, 30)) {
          if (stock.stockMeta) {
            const change = stock.stockMeta.currentPrice - stock.stockMeta.initialPrice;
            const pctChange = ((change / stock.stockMeta.initialPrice) * 100).toFixed(1);
            context += `- ${stock.stockMeta.ticker}: $${stock.stockMeta.currentPrice.toFixed(2)} (${change >= 0 ? '+' : ''}${pctChange}%) - ${stock.title}\n`;
          }
        }

        if (stockId) {
          const currentStock = allStocks.find(s => s.id === stockId);
          if (currentStock?.stockMeta) {
            context += `\nThe user is currently viewing: ${currentStock.stockMeta.ticker} (${currentStock.title}) at $${currentStock.stockMeta.currentPrice.toFixed(2)}\n`;
          }
        }

        context += `\nGive specific buy/sell recommendations with reasoning. Be confident and decisive.`;
      }

      // Set up SSE for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const stream = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: context },
          { role: "user", content: message },
        ],
        stream: true,
        max_completion_tokens: 500,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("MK AI advisor error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to get AI response" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Failed to get response" })}\n\n`);
        res.end();
      }
    }
  });

  // ==================== POLYMARKET ROUTES ====================

  app.get("/api/polymarket/sports", async (req, res) => {
    try {
      // Fetch more events to find sports-related ones
      const response = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=100&active=true");
      const events = await response.json();
      
      // Sports-specific slugs and keywords - more precise matching
      const sportsSlugPatterns = [
        "nba", "nfl", "mlb", "nhl", "mls", "premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1",
        "super-bowl", "world-series", "stanley-cup", "champions-league", "world-cup", "euro-", "copa-america",
        "wimbledon", "us-open", "french-open", "australian-open", "masters", "pga", "f1-", "formula-1",
        "nascar", "ufc", "boxing", "golf", "tennis", "soccer", "football-", "basketball", "baseball", "hockey"
      ];
      
      // Keywords for title/description matching
      const sportsKeywords = [
        "nba", "nfl", "mlb", "nhl", "mls", "premier league", "la liga", "bundesliga", "serie a", "ligue 1",
        "super bowl", "world series", "stanley cup", "champions league", "world cup", "wimbledon",
        "us open", "french open", "australian open", "the masters", "pga tour", "lpga", "f1 ", "formula 1",
        "nascar", "indy 500", "march madness", "ncaa", "college football", "mvp award", "heisman",
        "ufc ", "boxing", "mma", "golf", "tennis", "soccer", "football game", "basketball", "baseball", "hockey"
      ];
      
      // Exclude keywords to filter out false positives
      const excludeKeywords = [
        "president", "election", "trump", "biden", "political", "congress", "parliament",
        "macron", "ukraine", "nato", "war", "tariff", "recession", "inflation", "fed ", "rates"
      ];
      
      const sportsEvents = events.filter((event: any) => {
        const slug = (event.slug || "").toLowerCase();
        const text = (event.title + " " + (event.description || "")).toLowerCase();
        
        // Check if slug matches sports patterns
        const slugMatch = sportsSlugPatterns.some(pattern => slug.includes(pattern));
        
        // Check if title/description matches sports keywords
        const keywordMatch = sportsKeywords.some(keyword => text.includes(keyword));
        
        // Exclude political/economic events
        const isExcluded = excludeKeywords.some(keyword => text.includes(keyword));
        
        return (slugMatch || keywordMatch) && !isExcluded;
      });
      
      // Format events for display
      const formattedEvents = sportsEvents.map((event: any) => ({
        id: event.id,
        slug: event.slug,
        title: event.title,
        description: event.description,
        image: event.image || event.icon,
        endDate: event.endDate,
        volume: event.volume,
        liquidity: event.liquidity,
        markets: event.markets?.map((m: any) => ({
          id: m.id,
          question: m.question,
          outcomePrices: m.outcomePrices,
          outcomes: m.outcomes,
        })) || [],
      }));
      
      res.json(formattedEvents);
    } catch (error) {
      console.error("Polymarket fetch error:", error);
      res.status(500).json({ message: "Failed to fetch sports markets" });
    }
  });

  // Auto-import or get existing polymarket market for betting
  app.post("/api/polymarket/bet-on", requireAuth, requireVerified, async (req, res) => {
    try {
      const { eventId } = req.body;
      
      if (!eventId) {
        return res.status(400).json({ message: "Missing event ID" });
      }

      // Check if already imported
      const existingMarkets = await storage.getPolymarketMarkets();
      const allLinks = await Promise.all(
        existingMarkets.map(async (m) => {
          const link = await storage.getPolymarketLink(m.id);
          return { market: m, link };
        })
      );
      const existing = allLinks.find(item => item.link?.polymarketEventId === eventId);
      
      if (existing) {
        return res.json({ marketId: existing.market.id, isNew: false });
      }

      // Fetch event details from Polymarket to validate and get trusted data
      const pmResponse = await fetch(`https://gamma-api.polymarket.com/events/${eventId}`);
      if (!pmResponse.ok) {
        return res.status(404).json({ message: "Event not found on Polymarket" });
      }
      const pmEvent = await pmResponse.json();
      
      if (!pmEvent || !pmEvent.title) {
        return res.status(400).json({ message: "Invalid Polymarket event data" });
      }

      // Validate that this is a sports event using the same criteria as /api/polymarket/sports
      const sportsSlugPatterns = [
        "nba", "nfl", "mlb", "nhl", "mls", "premier-league", "la-liga", "bundesliga", "serie-a", "ligue-1",
        "super-bowl", "world-series", "stanley-cup", "champions-league", "world-cup", "euro-", "copa-america",
        "wimbledon", "us-open", "french-open", "australian-open", "masters", "pga", "f1-", "formula-1",
        "nascar", "ufc", "boxing", "golf", "tennis", "soccer", "football-", "basketball", "baseball", "hockey"
      ];
      const sportsKeywords = [
        "nba", "nfl", "mlb", "nhl", "mls", "premier league", "la liga", "bundesliga", "serie a", "ligue 1",
        "super bowl", "world series", "stanley cup", "champions league", "world cup", "wimbledon",
        "us open", "french open", "australian open", "the masters", "pga tour", "lpga", "f1 ", "formula 1",
        "nascar", "indy 500", "march madness", "ncaa", "college football", "mvp award", "heisman",
        "ufc ", "boxing", "mma", "golf", "tennis", "soccer", "football game", "basketball", "baseball", "hockey"
      ];
      const excludeKeywords = [
        "president", "election", "trump", "biden", "political", "congress", "parliament",
        "macron", "ukraine", "nato", "war", "tariff", "recession", "inflation", "fed ", "rates"
      ];
      
      const eventSlug = (pmEvent.slug || "").toLowerCase();
      const eventText = (pmEvent.title + " " + (pmEvent.description || "")).toLowerCase();
      const slugMatch = sportsSlugPatterns.some(pattern => eventSlug.includes(pattern));
      const keywordMatch = sportsKeywords.some(keyword => eventText.includes(keyword));
      const isExcluded = excludeKeywords.some(keyword => eventText.includes(keyword));
      
      if (!(slugMatch || keywordMatch) || isExcluded) {
        return res.status(400).json({ message: "This event is not a sports market" });
      }

      // Use verified data from Polymarket
      const title = pmEvent.title;
      const description = pmEvent.description || `Imported from Polymarket: ${title}`;
      const slug = pmEvent.slug || eventId;
      const image = pmEvent.image || pmEvent.icon || null;

      // Auto-import the market
      const market = await storage.createMarket({
        type: "PREDICTION",
        title,
        description,
        category: "Sports",
        status: "OPEN",
        source: "POLYMARKET",
        closeAt: null,
        resolveAt: null,
        resolutionRule: "Based on Polymarket resolution",
        createdBy: req.session.userId!,
      });

      await storage.createOutcome({
        marketId: market.id,
        label: "YES",
        currentPrice: 0.5,
      });

      await storage.createOutcome({
        marketId: market.id,
        label: "NO",
        currentPrice: 0.5,
      });

      await storage.createPolymarketLink({
        marketId: market.id,
        polymarketEventId: eventId,
        polymarketSlug: slug,
        polymarketImage: image || null,
      });

      res.json({ marketId: market.id, isNew: true });
    } catch (error) {
      console.error("Polymarket bet-on error:", error);
      res.status(500).json({ message: "Failed to prepare market for betting" });
    }
  });

  app.get("/api/polymarket-markets", async (req, res) => {
    try {
      const markets = await storage.getPolymarketMarkets();
      const marketsWithLinks = await Promise.all(
        markets.map(async (market) => {
          const link = await storage.getPolymarketLink(market.id);
          return { ...market, polymarketLink: link };
        })
      );
      res.json(marketsWithLinks);
    } catch (error) {
      console.error("Get polymarket markets error:", error);
      res.status(500).json({ message: "Failed to fetch polymarket markets" });
    }
  });

  app.post("/api/admin/import-polymarket", requireAdmin, async (req, res) => {
    try {
      const { title, description, slug, eventId, image } = req.body;
      
      if (!title || !slug || !eventId) {
        return res.status(400).json({ message: "Missing required fields: title, slug, eventId" });
      }

      const existingMarkets = await storage.getPolymarketMarkets();
      const alreadyImported = existingMarkets.some(async (m) => {
        const link = await storage.getPolymarketLink(m.id);
        return link?.polymarketEventId === eventId;
      });

      const allLinks = await Promise.all(
        existingMarkets.map(m => storage.getPolymarketLink(m.id))
      );
      const existingLink = allLinks.find(l => l?.polymarketEventId === eventId);
      
      if (existingLink) {
        return res.status(400).json({ message: "This event has already been imported" });
      }

      const market = await storage.createMarket({
        type: "PREDICTION",
        title,
        description: description || `Imported from Polymarket: ${title}`,
        category: "Sports",
        status: "OPEN",
        source: "POLYMARKET",
        closeAt: null,
        resolveAt: null,
        resolutionRule: "Based on Polymarket resolution",
        createdBy: req.session.userId!,
      });

      await storage.createOutcome({
        marketId: market.id,
        label: "YES",
        currentPrice: 0.5,
      });

      await storage.createOutcome({
        marketId: market.id,
        label: "NO",
        currentPrice: 0.5,
      });

      const polymarketLink = await storage.createPolymarketLink({
        marketId: market.id,
        polymarketEventId: eventId,
        polymarketSlug: slug,
        polymarketImage: image || null,
      });

      const enrichedMarket = await storage.getMarket(market.id);
      res.json({ market: enrichedMarket, polymarketLink });
    } catch (error) {
      console.error("Import polymarket error:", error);
      res.status(500).json({ message: "Failed to import polymarket event" });
    }
  });

  return httpServer;
}
