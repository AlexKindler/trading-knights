# MK Markets

## Overview

MK Markets is a school-only prediction market and fake stock trading platform designed for Menlo School students. The application allows students to create and trade on prediction markets for school events (sports, elections, clubs) and fictional stocks representing school-related entities. Built with fake money only for educational purposes - no real gambling, cash-out, or prizes.

Key features include:
- Prediction markets (Kalshi-style) for school outcomes
- Fake stock market for student-created listings
- Email verification restricted to @menloschool.org accounts
- Play money system with bankruptcy protection
- Content moderation and admin controls
- Leaderboard and portfolio tracking

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Build Tool**: Vite with React plugin
- **Path Aliases**: `@/` maps to client/src, `@shared/` maps to shared/

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Session Management**: express-session with MemoryStore (in-memory for development)
- **Authentication**: Custom session-based auth with email verification
- **API Design**: RESTful endpoints under `/api/` prefix

### Data Storage
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with migrations output to `./migrations`
- **Current Storage**: In-memory storage implementation in `server/storage.ts` (can be upgraded to PostgreSQL)

### Key Design Patterns
- **Monorepo Structure**: Client, server, and shared code in single repository
- **Schema Sharing**: Zod schemas generated from Drizzle for validation on both ends
- **AMM Trading**: Automated Market Maker model for both prediction markets and stocks (simpler than order book)
- **Middleware Chain**: Authentication (`requireAuth`), verification (`requireVerified`), and admin (`requireAdmin`) middleware layers

### Authentication Flow
1. Registration with @menloschool.org email only
2. Email verification token (hashed, 24hr expiry)
3. Dev mode logs verification link to console if email not configured
4. Verified users receive 1000 play dollars starting balance
5. Bankruptcy reset to 100 if balance reaches 0 (24hr cooldown)

## External Dependencies

### Database
- **PostgreSQL**: Primary database (configured via `DATABASE_URL` environment variable)
- **connect-pg-simple**: PostgreSQL session store (available but MemoryStore used in dev)

### UI Components
- **Radix UI**: Full primitive component suite (dialog, dropdown, tabs, etc.)
- **shadcn/ui**: Pre-built component library on top of Radix
- **Recharts**: Data visualization for price charts
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component

### Form & Validation
- **Zod**: Schema validation
- **React Hook Form**: Form handling with `@hookform/resolvers`
- **drizzle-zod**: Generates Zod schemas from Drizzle tables

### Utilities
- **date-fns**: Date manipulation
- **clsx/tailwind-merge**: Class name utilities
- **nanoid**: ID generation
- **cmdk**: Command palette component

### Development Tools
- **Vite**: Development server and bundler
- **esbuild**: Production server bundling
- **Drizzle Kit**: Database migrations and schema push
- **TypeScript**: Full type coverage across codebase