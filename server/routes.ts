import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "./db";
import { storage, TradeError } from "./storage";
import { insertUserSchema, loginSchema, insertTradeSchema, insertCommentSchema, insertReportSchema, insertGameSchema } from "@shared/schema";
import { hashPassword, verifyPassword, isLegacyHash } from "./auth";
import { sendVerificationEmail, sendPasswordResetEmail } from "./email";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const PgStore = pgSession(session);

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

// Regenerate the session id and bind it to the given user (prevents session
// fixation). Resolves once the new session has been persisted.
function loginSession(req: Request, userId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((regenErr) => {
      if (regenErr) return reject(regenErr);
      req.session.userId = userId;
      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve();
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Tiny in-memory rate limiter (no new dependency).
// Keyed by route + client IP. NOTE: on serverless this is per-instance, so it
// is best-effort only — acceptable for abuse mitigation, not a hard guarantee.
// ---------------------------------------------------------------------------
function createRateLimiter(opts: { windowMs: number; max: number; key: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    // Lazy prune to keep the map from growing unbounded.
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const mapKey = `${opts.key}:${ip}`;
    let entry = hits.get(mapKey);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(mapKey, entry);
    }
    entry.count++;
    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({ message: "Too many requests, please try again later." });
    }
    next();
  };
}

// Auth endpoints: generous per-IP cap because an entire school shares one NAT
// egress IP, so the whole student body draws from a single budget. 300 / 15 min
// keeps onboarding waves working while still bounding runaway abuse. (Residual
// per-account brute force is mitigated by scrypt hashing; a future hardening is
// to add a per-email login limiter.)
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 300, key: "auth" });
// MK-AI endpoints: 20 requests / minute per IP (LLM calls are expensive).
const mkAiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20, key: "mk-ai" });

// Clamp a ?limit query param to a sane positive range for candle endpoints.
function clampLimit(raw: unknown, fallback = 100, max = 500): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
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
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user || user.status === "SUSPENDED") {
      return res.status(403).json({ message: "Account not permitted" });
    }
    if (user.status !== "VERIFIED") {
      return res.status(403).json({ message: "Email verification required" });
    }
    next();
  } catch (error) {
    console.error("requireVerified error:", error);
    return res.status(500).json({ message: "Authorization check failed" });
  }
}

// Middleware to require admin
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user || user.role !== "ADMIN" || user.status === "SUSPENDED") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  } catch (error) {
    console.error("requireAdmin error:", error);
    return res.status(500).json({ message: "Authorization check failed" });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Require a real session secret in production; allow a dev fallback locally.
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  const sessionSecret = process.env.SESSION_SECRET || "campus-kalshi-dev-secret";

  // Session middleware with PostgreSQL store for persistence across restarts
  app.use(
    session({
      secret: sessionSecret,
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
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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

  app.post("/api/auth/register", authLimiter, async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const existing = await storage.getUserByEmail(parsed.data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // storage.createUser creates ONLY the user row (no balance, no event).
      // Hash the password here (scrypt) before storage persists it verbatim.
      const user = await storage.createUser({
        ...parsed.data,
        password: hashPassword(parsed.data.password),
      });

      // Developer emails become ADMIN at creation — the ONLY path to admin.
      const isDeveloper = DEVELOPER_EMAILS.includes(parsed.data.email.toLowerCase());

      // Grant the single starting credit and (optionally) admin role here, so
      // there is exactly ONE STARTING_CREDIT event per account.
      await storage.updateUser(user.id, {
        status: "VERIFIED",
        balance: 1000,
        role: isDeveloper ? "ADMIN" : "STUDENT",
        hasMkAiAccess: isDeveloper,
      });
      await storage.logBalanceEvent({
        userId: user.id,
        type: "STARTING_CREDIT",
        amount: 1000,
        note: "Welcome bonus - starting balance",
      });

      const updatedUser = await storage.getUser(user.id);
      await loginSession(req, user.id);
      res.json({ user: { ...updatedUser, password: undefined } });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const user = await storage.getUserByEmail(parsed.data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (!verifyPassword(parsed.data.password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      if (user.status === "SUSPENDED") {
        return res.status(403).json({ message: "Account suspended" });
      }

      // Transparently upgrade legacy (unsalted sha256) hashes to salted scrypt.
      if (isLegacyHash(user.password)) {
        try {
          await storage.updateUser(user.id, { password: hashPassword(parsed.data.password) });
        } catch (upgradeErr) {
          console.error("Password hash upgrade failed:", upgradeErr);
        }
      }

      await loginSession(req, user.id);
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

  app.post("/api/auth/verify-email", authLimiter, async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ message: "Token required" });
      }

      const user = await storage.verifyToken(token);
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }

      await loginSession(req, user.id);
      res.json({ user: { ...user, password: undefined } });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verification", authLimiter, requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.status === "VERIFIED") {
        return res.status(400).json({ message: "Already verified" });
      }

      const token = await storage.createVerificationToken(user.id);

      // Send verification email. If it fails, we do NOT print the live link to
      // the console (leaking it would let anyone with log access take over the
      // account). The email pipeline is the only delivery channel.
      await sendVerificationEmail(user.email, token);

      res.json({ success: true });
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to resend verification" });
    }
  });

  // ==================== PASSWORD RESET ROUTES ====================

  app.post("/api/auth/forgot-password", authLimiter, async (req, res) => {
    try {
      // Normalize to lowercase to match register/login (which lowercase via the
      // insert schema). Without this, a mixed-case address silently never
      // matches and password reset fails.
      const email = String(req.body.email ?? "").trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ message: "Email required" });
      }

      const user = await storage.getUserByEmail(email);

      // Always return success to prevent email enumeration attacks
      if (!user) {
        return res.json({ success: true, message: "If an account exists with this email, a reset link will be sent." });
      }

      const token = await storage.createPasswordResetToken(user.id);

      // Send the reset email only. Never print the live reset link to the
      // console — log access would allow account takeover.
      await sendPasswordResetEmail(user.email, token);

      res.json({ success: true, message: "If an account exists with this email, a reset link will be sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
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
      const limit = clampLimit(req.query.limit);
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
      const limit = clampLimit(req.query.limit);
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

      // All trade logic (fresh price re-read, AMM impact BEFORE fill, balance /
      // share checks, position upsert, price update) runs atomically inside
      // storage.executeTrade (CONTRACT §1).
      const result = await storage.executeTrade({
        userId: req.session.userId!,
        marketId,
        outcomeId: outcomeId ?? null,
        side,
        qty,
      });

      // After a trade, apply the bankruptcy-reset rule and return the POST-reset
      // balance (CONTRACT §3).
      const freshUser = await storage.maybeBankruptcyReset(req.session.userId!);

      res.json({
        trade: result.trade,
        newBalance: freshUser.balance,
        executedPrice: result.executedPrice,
        priceAfter: result.priceAfter,
      });
    } catch (error: any) {
      if (error instanceof TradeError) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Trade error:", error);
      res.status(500).json({ message: "Trade failed" });
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
            // Tie game — void the market and refund every holder at avg cost.
            await storage.resolveMarket(game.marketId, { voidRefund: true });
          } else {
            // Resolve and pay out the winning outcome (CONTRACT §2).
            const menloWon = menloScore > opponentScore;
            const winningOutcome = menloWon ? yesOutcome : noOutcome;
            await storage.resolveMarket(game.marketId, { winningOutcomeId: winningOutcome.id });
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

  app.post("/api/mk-ai/purchase", mkAiLimiter, requireVerified, async (req, res) => {
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

      // Split revenue evenly; distribute the floor remainder so no play-money
      // is dropped. A developer without an account is skipped (their share is
      // simply not minted — nothing is deducted from anyone).
      const devCount = MK_AI_DEVELOPER_EMAILS.length;
      const baseShare = Math.floor(MK_AI_PRICE / devCount);
      let remainder = MK_AI_PRICE - baseShare * devCount;
      for (const devEmail of MK_AI_DEVELOPER_EMAILS) {
        const share = baseShare + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        const developer = await storage.getUserByEmail(devEmail);
        if (developer) {
          await storage.updateUser(developer.id, { balance: developer.balance + share });
          await storage.logBalanceEvent({
            userId: developer.id,
            type: "ADMIN_ADJUST",
            amount: share,
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

  // MK AI Advisor - full trading assistant with function calling
  app.post("/api/mk-ai/advisor", mkAiLimiter, requireVerified, async (req, res) => {
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

      // Get user's portfolio for context
      const positions = await storage.getPositionsByUser(user.id);
      const trades = await storage.getTradesByUser(user.id);
      const allStocks = await storage.getMarkets("STOCK");
      const allPredictions = await storage.getMarkets("PREDICTION");

      // Build comprehensive context
      let context = `You are MK AI, the ultimate trading assistant for Trading Knights (a Menlo School prediction market with play money). You have FULL access to execute trades and manage the user's portfolio.

USER PROFILE:
- Name: ${user.displayName || user.email.split('@')[0]}
- Balance: $${user.balance.toFixed(2)}
- Account Status: ${user.status}

USER'S CURRENT PORTFOLIO:`;

      if (positions.length === 0) {
        context += `\n- No positions yet (empty portfolio)`;
      } else {
        for (const pos of positions) {
          const market = allStocks.find(s => s.id === pos.marketId) || allPredictions.find(p => p.id === pos.marketId);
          if (market && pos.qty > 0) {
            // Mark to market: stocks use the current stock price; predictions use
            // the current price of the held outcome (not avgCost, which zeroes P&L).
            let currentPrice = pos.avgCost;
            if (market.type === "STOCK") {
              currentPrice = market.stockMeta?.currentPrice ?? pos.avgCost;
            } else if (market.type === "PREDICTION") {
              const outcome = market.outcomes?.find((o) => o.id === pos.outcomeId);
              currentPrice = outcome?.currentPrice ?? pos.avgCost;
            }
            const pnl = (currentPrice - pos.avgCost) * pos.qty;
            const ticker = market.type === "STOCK" ? market.stockMeta?.ticker : market.title.slice(0, 10);
            context += `\n- ${ticker}: ${pos.qty} shares @ $${pos.avgCost.toFixed(2)} avg (Current: $${currentPrice.toFixed(2)}, P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`;
          }
        }
      }

      context += `\n\nRECENT TRADES (last 10):`;
      const recentTrades = trades.slice(-10).reverse();
      if (recentTrades.length === 0) {
        context += `\n- No trades yet`;
      } else {
        for (const trade of recentTrades) {
          const market = allStocks.find(s => s.id === trade.marketId);
          const ticker = market?.stockMeta?.ticker || "UNKNOWN";
          context += `\n- ${trade.side} ${trade.qty}x ${ticker} @ $${trade.price.toFixed(2)}`;
        }
      }

      context += `\n\nAVAILABLE STOCKS (${allStocks.length} total):`;
      for (const stock of allStocks.slice(0, 56)) {
        if (stock.stockMeta) {
          const change = stock.stockMeta.currentPrice - stock.stockMeta.initialPrice;
          const pctChange = ((change / stock.stockMeta.initialPrice) * 100).toFixed(1);
          context += `\n- ${stock.stockMeta.ticker} (ID: ${stock.id}): $${stock.stockMeta.currentPrice.toFixed(2)} (${change >= 0 ? '+' : ''}${pctChange}%) - ${stock.title}`;
        }
      }

      if (mode === "sports") {
        context += `\n\nSPORTS BETTING MODE: `;
        try {
          const polyResponse = await fetch("https://gamma-api.polymarket.com/events?closed=false&limit=50&active=true");
          const events = await polyResponse.json();
          const sportsEvents = events.filter((e: any) => {
            const slug = (e.slug || "").toLowerCase();
            const text = (e.title + " " + (e.description || "")).toLowerCase();
            return ["nba", "nfl", "mlb", "nhl", "super-bowl", "champions-league", "world-cup", "tennis", "golf", "masters", "ufc"].some(k => slug.includes(k) || text.includes(k));
          }).slice(0, 15);
          
          context += `Current live sports markets from Polymarket:`;
          for (const event of sportsEvents) {
            context += `\n- ${event.title}`;
            if (event.markets?.[0]) {
              try {
                const prices = JSON.parse(event.markets[0].outcomePrices || "[]");
                context += ` (YES: ${(parseFloat(prices[0]) * 100).toFixed(0)}%, NO: ${(parseFloat(prices[1]) * 100).toFixed(0)}%)`;
              } catch {}
            }
          }
        } catch {
          context += "Unable to fetch live sports data.";
        }
      }

      if (stockId) {
        const currentStock = allStocks.find(s => s.id === stockId);
        if (currentStock?.stockMeta) {
          context += `\n\nCURRENTLY VIEWING: ${currentStock.stockMeta.ticker} (${currentStock.title}) at $${currentStock.stockMeta.currentPrice.toFixed(2)}`;
        }
      }

      context += `

CAPABILITIES:
You can execute trades for the user by calling the buy_stock or sell_stock functions. When the user asks to buy or sell, USE the function - don't just describe it.

TRADING RULES:
- Minimum trade: 1 share, Maximum: 1000 shares per trade
- User cannot spend more than their balance
- User cannot sell more shares than they own
- Always confirm the trade details before executing

Be confident, give specific recommendations with reasoning. When appropriate, proactively suggest trades. You are the user's personal trading advisor and can take action on their behalf.`;

      // Set up SSE for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // If no OpenAI key is configured, respond with a clean SSE error rather
      // than crashing (CONTRACT §7).
      if (!process.env.OPENAI_API_KEY) {
        res.write(`data: ${JSON.stringify({ error: "AI is not configured. Please try again later." })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        return res.end();
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
      });

      // Define trading functions
      const tools: any[] = [
        {
          type: "function",
          function: {
            name: "buy_stock",
            description: "Buy shares of a stock for the user. Use this when the user wants to purchase shares.",
            parameters: {
              type: "object",
              properties: {
                marketId: { type: "string", description: "The market/stock ID to buy" },
                ticker: { type: "string", description: "The stock ticker symbol for confirmation" },
                quantity: { type: "number", description: "Number of shares to buy (1-1000)" },
              },
              required: ["marketId", "ticker", "quantity"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "sell_stock",
            description: "Sell shares of a stock for the user. Use this when the user wants to sell shares they own.",
            parameters: {
              type: "object",
              properties: {
                marketId: { type: "string", description: "The market/stock ID to sell" },
                ticker: { type: "string", description: "The stock ticker symbol for confirmation" },
                quantity: { type: "number", description: "Number of shares to sell (1-1000)" },
              },
              required: ["marketId", "ticker", "quantity"],
            },
          },
        },
      ];

      // First call - might include function calls
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: context },
          { role: "user", content: message },
        ],
        tools,
        tool_choice: "auto",
      });

      const responseMessage = response.choices[0].message;
      const toolCalls = responseMessage.tool_calls;

      // Process function calls if any
      if (toolCalls && toolCalls.length > 0) {
        const functionResults: string[] = [];
        
        for (const toolCall of toolCalls) {
          const tc = toolCall as any;
          const functionName = tc.function?.name;

          if (functionName === "buy_stock" || functionName === "sell_stock") {
            const side = functionName === "buy_stock" ? "BUY" : "SELL";
            let ticker = "the stock";
            try {
              // Parse the model-supplied arguments inside the try so malformed
              // JSON produces a graceful per-tool error instead of aborting.
              const args = JSON.parse(tc.function?.arguments || "{}");
              const marketId: string = args.marketId;
              ticker = args.ticker || ticker;

              // Defensively validate/clamp qty BEFORE calling executeTrade — the
              // model must never be able to mint money with a bad quantity.
              const quantity = Math.floor(Number(args.quantity));
              if (!Number.isFinite(quantity) || quantity < 1 || quantity > 1000) {
                functionResults.push(`Failed to ${side.toLowerCase()} ${ticker}: quantity must be a whole number between 1 and 1000.`);
                continue;
              }
              if (!marketId) {
                functionResults.push(`Failed to ${side.toLowerCase()} ${ticker}: missing market ID.`);
                continue;
              }

              // Single source of truth for trade execution (CONTRACT §1) — the
              // AMM impact is applied before the fill, so no riskless round trip.
              const result = await storage.executeTrade({
                userId: user.id,
                marketId,
                outcomeId: null,
                side,
                qty: quantity,
              });

              // Keep the local balance copy in sync for later context / messaging.
              user.balance = result.user.balance;

              functionResults.push(`Successfully ${side === "BUY" ? "bought" : "sold"} ${quantity} shares of ${ticker} at $${result.executedPrice.toFixed(2)}. New balance: $${result.user.balance.toFixed(2)}`);
            } catch (error: any) {
              if (error instanceof TradeError) {
                functionResults.push(`Failed to ${side.toLowerCase()} ${ticker}: ${error.message}`);
              } else {
                console.error("MK AI trade error:", error);
                functionResults.push(`Trade error for ${ticker}: could not complete the trade.`);
              }
            }
          }
        }

        // Stream the follow-up response with trade results
        const followUpMessages: any[] = [
          { role: "system", content: context },
          { role: "user", content: message },
          responseMessage,
          ...toolCalls.map((tc, i) => ({
            role: "tool" as const,
            tool_call_id: tc.id,
            content: functionResults[i] || "Trade processed",
          })),
        ];

        const followUpStream = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: followUpMessages,
          stream: true,
          max_completion_tokens: 500,
        });

        for await (const chunk of followUpStream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }
      } else {
        // No function calls - just stream the response
        if (responseMessage.content) {
          res.write(`data: ${JSON.stringify({ content: responseMessage.content })}\n\n`);
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
  // Verified students use this from the MK Parlay page's "Bet Now" button to
  // open (auto-importing if needed) a market for a live sports event. It must
  // NOT be admin-only or the whole student-facing betting flow 403s.
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
