# CampusKalshi Design Guidelines

## Design Approach
**Reference-Based Approach** drawing from modern fintech and prediction market platforms:
- **Kalshi/Polymarket**: Clean market card layouts, data visualization
- **Robinhood**: Simplified trading interfaces, portfolio views
- **Linear**: Modern dashboard aesthetics, typography hierarchy
- **Notion**: Information density with breathing room

Core principle: Make complex financial data digestible and engaging for students while maintaining professional trading platform aesthetics.

## Typography System

**Font Families** (Google Fonts):
- Primary: Inter (UI, data, body text) - weights 400, 500, 600, 700
- Accent: JetBrains Mono (tickers, prices, numbers) - weight 500

**Hierarchy**:
- Page Titles: text-3xl to text-4xl, font-bold
- Section Headers: text-2xl, font-semibold
- Card Titles: text-lg, font-semibold
- Market Data/Prices: text-xl to text-2xl, font-mono, font-medium
- Body Text: text-base, font-normal
- Metadata/Labels: text-sm, font-medium
- Tiny Labels: text-xs

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16, 20
- Tight spacing: p-2, gap-2 (within cards, compact lists)
- Standard spacing: p-4, gap-4 (card padding, form fields)
- Section spacing: p-8, gap-8 (between major sections)
- Large gaps: gap-12, gap-16 (dashboard modules)

**Grid Patterns**:
- Market cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Portfolio assets: grid-cols-1 lg:grid-cols-2
- Leaderboard + charts: Single column with max-w-6xl
- Trading view: Two-column split (chart left, trade widget right) on desktop

## Component Library

### Navigation
Top navbar with logo left, nav items center, user menu right. Include:
- CampusKalshi logo
- Markets, Stocks, Portfolio, Leaderboard tabs
- Search bar (expandable on mobile)
- Balance display (prominent, monospace font)
- Profile dropdown with verification badge

### Market Cards (Prediction Markets)
Compact cards (p-4) displaying:
- Category badge (top-left, small pill)
- Market title (font-semibold, text-lg)
- Current YES/NO prices in large monospace (text-2xl)
- Price change indicators with arrows
- Volume, closes-in timer (text-sm, muted)
- Micro sparkline chart (optional visual interest)
- Hover: subtle lift effect

### Stock Listing Cards
Similar layout with:
- Ticker symbol (large, monospace, font-bold)
- Company/item name below
- Current price (text-2xl, monospace)
- Percentage change (with color-coded indicator)
- Market cap, volume (text-sm)
- Mini price chart

### Trading Widget
Compact panel with:
- Buy/Sell toggle tabs
- Quantity input with max button
- Price display (calculated total)
- Estimated return/payout
- Large primary action button
- Balance remaining shown below

### Leaderboard Component
Full-width table with rankings:
- Rank number (bold, large for top 3)
- User display name + grade badge
- Total portfolio value (large, monospace)
- Gain/loss percentage
- Top 3: Distinctive badges/icons (🥇🥈🥉)
- Current user row: highlighted/bordered
- Pagination for 50+ users
- Filter tabs: All Time, This Week, This Month

### Portfolio Dashboard
Grid layout with modules:
- Net worth card (prominent, top)
- Cash balance card
- Positions table (sortable)
- Recent transactions list
- Performance chart
- Quick stats: Win rate, total trades, best performer

### Chart Components
Use library like recharts/lightweight-charts:
- Clean line charts for price history
- Candlestick for stock detail pages
- Time range selector (1D, 1W, 1M, All)
- Minimal grid lines, clear axes
- Responsive, touch-friendly on mobile

### Admin Panel
Sidebar navigation with sections:
- Pending approvals queue (count badge)
- Reports dashboard
- User management table
- Market resolution interface (large workflow cards)
- Analytics overview

### Forms & Inputs
- Generous padding (p-3)
- Clear labels above inputs
- Validation messages inline
- Multi-step creation wizards for markets/stocks
- Auto-save drafts

### Content Moderation UI
Report button (flag icon) on all user content
- Lightbox modal with reason selection
- Admin queue shows content preview cards
- One-click actions: Hide, Delete, Suspend

## Verification & Onboarding

Email verification waiting page:
- Centered card with icon
- Clear instructions
- Resend button
- Dev mode: Display token link prominently

Disclaimer modal:
- Full-screen overlay
- Scrollable terms
- "Fake money only" emphasized
- Required checkbox + accept button

## Mobile Responsiveness

- Navbar collapses to hamburger
- Market cards: single column
- Trading widget: bottom sheet on mobile
- Charts: simplified on small screens
- Tables: horizontal scroll or card view
- Bottom navigation for key sections

## Visual Enhancements

**Micro-interactions** (subtle only):
- Card hover lift
- Button press states
- Loading spinners on data fetch
- Success checkmarks on trades
- Balance updates: brief highlight

**Data Visualization**:
- Price changes: directional arrows
- Trend indicators: mini sparklines
- Progress bars for market close countdowns
- Percentage badges with appropriate styling

**Icons**: Use Heroicons (outline for navigation, solid for actions)

## Images

No hero image required. This is a data-dense trading platform focused on functionality over marketing aesthetics. Avatar placeholders for user profiles only.