import { db } from "./db";
import { markets, outcomes, stockMeta, stockCandles, marketCandles, users } from "@shared/schema";
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

async function seed() {
  console.log("Starting database seed...");

  // Check if already seeded by looking for stocks
  const existingStocks = await db.select().from(markets).where(eq(markets.type, "STOCK")).limit(1);
  if (existingStocks.length > 0) {
    console.log("Database already has stocks. Checking if we need to add more...");
    const allStocks = await db.select().from(markets).where(eq(markets.type, "STOCK"));
    console.log(`Found ${allStocks.length} existing stocks`);
    if (allStocks.length >= 50) {
      console.log("Database already seeded with clubs. Skipping...");
      return;
    }
  }

  // Create or get admin user
  let adminId: string;
  const existingAdmin = await db.select().from(users).where(eq(users.email, "admin@menloschool.org")).limit(1);

  if (existingAdmin.length > 0) {
    adminId = existingAdmin[0].id;
    console.log("Using existing admin user");
  } else {
    adminId = randomUUID();
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
    });
    console.log("Created admin user");
  }

  // All Menlo School Clubs - comprehensive list
  const clubs = [
    // Academic & Competition Clubs
    { ticker: "MUN", name: "Model UN", category: "Clubs", price: 44, description: "Exercise vital skills like public speaking, debate, and negotiation at conferences worldwide." },
    { ticker: "DEBAT", name: "Parliamentary Debate", category: "Clubs", price: 43, description: "Part of a debate team ranked top 20 in the country. Compete in tournaments nationwide." },
    { ticker: "MOCK", name: "Mock Trial", category: "Clubs", price: 42, description: "Practice courtroom procedures and compete in regional and state competitions." },
    { ticker: "STAR", name: "STAR (Science Olympiad)", category: "Clubs", price: 39, description: "Science, Technology, and Robotics - compete in Science Olympiad and run STEM workshops." },
    { ticker: "TRIV", name: "Quiz Bowl/Trivia Club", category: "Clubs", price: 29, description: "A community for those who revel in the acquisition of all facets of knowledge." },
    { ticker: "JCL", name: "Junior Classical League", category: "Clubs", price: 31, description: "Study the Classics as part of the largest Classical organization in the world." },
    { ticker: "HIST", name: "History Club", category: "Clubs", price: 29, description: "Explore the past beyond the classroom with NHD competitions and documentaries." },
    { ticker: "HOSA", name: "HOSA (Health Occupations)", category: "Clubs", price: 41, description: "Healthcare Occupations for Students of America - explore medical careers and compete." },
    { ticker: "DECA", name: "DECA", category: "Clubs", price: 40, description: "Business competition club - compete at state and international conferences." },

    // STEM & Technology Clubs
    { ticker: "ROBOT", name: "Menlo Robotics", category: "Clubs", price: 48, description: "Have fun while tinkering and learning about engineering. Competes in VEX Robotics." },
    { ticker: "ENGR", name: "Engineering Club", category: "Clubs", price: 45, description: "Build projects like electric go-karts and learn hands-on engineering skills." },
    { ticker: "CODE", name: "Coding Club", category: "Clubs", price: 47, description: "Learn programming languages and work on software projects together." },
    { ticker: "GWC", name: "Girls Who Code", category: "Clubs", price: 38, description: "A fun place for girls who love STEM to discuss real world issues and code together." },
    { ticker: "CYBER", name: "Cybersecurity Club", category: "Clubs", price: 43, description: "Learn about digital security, ethical hacking, and compete in CTF competitions." },
    { ticker: "AIML", name: "AI & Machine Learning", category: "Clubs", price: 50, description: "Explore artificial intelligence and build machine learning projects." },
    { ticker: "PHYS", name: "Physics Club", category: "Clubs", price: 36, description: "Get help with physics homework and learn how your favorite sci-fi movies work." },
    { ticker: "MAKER", name: "Maker Club", category: "Clubs", price: 35, description: "Create, build, and innovate using the makerspace and 3D printers." },
    { ticker: "GIDAS", name: "GIDAS (Medical Research)", category: "Clubs", price: 40, description: "Genes In Diseases And Symptoms - democratize medical research through technology." },
    { ticker: "WSTEM", name: "Women in STEM", category: "Clubs", price: 37, description: "Menlo's official chapter of Women in STEM - an amazing supportive community." },
    { ticker: "SAGE", name: "SAGExStanford", category: "Clubs", price: 42, description: "Work with scientists at Stanford's National Laboratory (SLAC)." },
    { ticker: "ETHIC", name: "Ethics in Technology", category: "Clubs", price: 36, description: "Debate real-world technology ethics issues and sharpen critical thinking skills." },

    // Business & Finance Clubs
    { ticker: "BIZ", name: "Business & Entrepreneurship", category: "Clubs", price: 42, description: "Explore what makes a business successful and learn how to start one." },
    { ticker: "INVST", name: "Investment Club", category: "Clubs", price: 46, description: "Learn stock market fundamentals and manage a virtual portfolio." },
    { ticker: "FINDU", name: "Financial Education Club", category: "Clubs", price: 40, description: "Learn investing and all things finance. Start your financial future." },
    { ticker: "MRKT", name: "Marketing Club", category: "Clubs", price: 39, description: "Explore interest in business and marketing with bi-monthly meetings." },

    // Arts & Performance Clubs
    { ticker: "DRAMA", name: "Drama Club", category: "Clubs", price: 36, description: "Act, create, and help bring Menlo shows to life while connecting with fellow students." },
    { ticker: "ACAP", name: "A Cappella Club", category: "Clubs", price: 34, description: "Meet new people and create music together with 4-part singing." },
    { ticker: "MOVIE", name: "Film/Movie Making Club", category: "Clubs", price: 35, description: "Learn all aspects of film production, storytelling, and visual arts." },
    { ticker: "ART", name: "Art Club", category: "Clubs", price: 32, description: "Create art that raises awareness on important issues through different projects." },
    { ticker: "FASH", name: "Fashion Club", category: "Clubs", price: 32, description: "Passionate about fashion and design with semester clothing swaps." },
    { ticker: "WRITE", name: "Creative Writing Club", category: "Clubs", price: 29, description: "A welcoming space for writers of all levels to explore poetry, fiction, and scripts." },
    { ticker: "LITM", name: "LitMag (Literary Magazine)", category: "Clubs", price: 32, description: "A creative space for writers, poets, and artists to produce Menlo's literary magazine." },
    { ticker: "JEWL", name: "Jewelry Club", category: "Clubs", price: 30, description: "Design and create jewelry with us and enjoy amazing snacks." },
    { ticker: "PHOTO", name: "Photography Club", category: "Clubs", price: 31, description: "Explore photography techniques and share your best shots." },

    // Service & Activism Clubs
    { ticker: "CLMT", name: "Climate Coalition", category: "Clubs", price: 38, description: "Focus on climate action, advocacy, and organizing events like EcoAct Week." },
    { ticker: "REDX", name: "Red Cross Club", category: "Clubs", price: 38, description: "Make a difference through action and compassion with disaster relief fundraisers." },
    { ticker: "SURF", name: "Surfrider Foundation", category: "Clubs", price: 31, description: "Ocean conservation with the San Mateo Surfrider chapter. Beach cleanups on Sundays." },
    { ticker: "SIP", name: "Students in Politics", category: "Clubs", price: 36, description: "Learn about the political climate and get involved in your community." },
    { ticker: "IGNT", name: "IGNITE (Women in Politics)", category: "Clubs", price: 35, description: "Political power in every young woman - advocacy and civic engagement." },
    { ticker: "MNTL", name: "Mental Health at Menlo", category: "Clubs", price: 30, description: "Discuss mental health topics and organize school-wide assemblies." },
    { ticker: "MICRO", name: "Microplastics Awareness", category: "Clubs", price: 29, description: "Explore the hidden world of microplastics and their impact on our lives." },
    { ticker: "CURI", name: "Curieus", category: "Clubs", price: 31, description: "Provide science opportunities through volunteering across several high schools." },

    // Culture & Identity Clubs
    { ticker: "ANIME", name: "Anime Club", category: "Clubs", price: 28, description: "Watch anime with friends and have snacks. Meetings every Tuesday during lunch." },
    { ticker: "KPOP", name: "K-pop Club", category: "Clubs", price: 33, description: "Listen to music and talk about the latest K-pop news!" },
    { ticker: "FRNCH", name: "French Club", category: "Clubs", price: 27, description: "Discuss all things French, including TV shows, music, and culture." },
    { ticker: "SPAN", name: "Spanish Club", category: "Clubs", price: 27, description: "Celebrate Hispanic culture through food, music, and conversation." },
    { ticker: "CHINA", name: "Chinese Culture Club", category: "Clubs", price: 28, description: "Explore Chinese traditions, language, and celebrate festivals." },
    { ticker: "FAITH", name: "Interfaith Club", category: "Clubs", price: 26, description: "A safe space to meet and learn more about different religions and faith traditions." },
    { ticker: "JSA", name: "Jewish Student Association", category: "Clubs", price: 27, description: "Celebrate Jewish culture, traditions, and holidays together." },
    { ticker: "BSU", name: "Black Student Union", category: "Clubs", price: 30, description: "Celebrate Black culture and create a supportive community." },
    { ticker: "ASA", name: "Asian Student Association", category: "Clubs", price: 29, description: "Celebrate Asian cultures and build community among Asian students." },

    // Recreation & Hobby Clubs
    { ticker: "CHESS", name: "Chess Club", category: "Clubs", price: 28, description: "Play chess, learn strategies, and compete in tournaments." },
    { ticker: "BOARD", name: "Board Game Club", category: "Clubs", price: 25, description: "Meet new friends and play many new and fun board games!" },
    { ticker: "VIDGM", name: "Video Game Club", category: "Clubs", price: 34, description: "Play video games during lunch. Compete against/with your friends in esports." },
    { ticker: "OUTDR", name: "Outdoor Club", category: "Clubs", price: 33, description: "Learn about the outdoors and go on field trips around Northern California." },
    { ticker: "CLIMB", name: "Climbing Club", category: "Clubs", price: 33, description: "Introducing new climbers to the sport with a welcoming environment on campus." },
    { ticker: "FISH", name: "Fishing Club", category: "Clubs", price: 28, description: "Explore different fishing techniques and possibly spark a new passion." },
    { ticker: "PICKLE", name: "Pickleball Club", category: "Clubs", price: 32, description: "Hang out and chat with friends while playing pickleball." },
    { ticker: "F1", name: "Formula 1 Club", category: "Clubs", price: 34, description: "Race recaps, sizzling drama, and fuel-epic discussions about Formula 1." },
    { ticker: "P2SC", name: "Page to Screen Critics", category: "Clubs", price: 28, description: "Discuss on-screen adaptations of favorite novels and how they compare." },
    { ticker: "BEES", name: "Beekeeping Club", category: "Clubs", price: 30, description: "Learn the art and science of beekeeping while supporting the environment." },
    { ticker: "GRDN", name: "Garden Club", category: "Clubs", price: 28, description: "Plant and harvest fruits, veggies, and flowers every Tuesday in the Menlo garden." },

    // Wellness & Support Clubs
    { ticker: "HAPPY", name: "Happiness Club", category: "Clubs", price: 26, description: "Centered around community and joy, planning unique decorations and events." },
    { ticker: "AWSC", name: "Athletic Wellness Club", category: "Clubs", price: 35, description: "Focus on mental health, physical wellness, and performance strategies for athletes." },
    { ticker: "PTS", name: "Past the Screen", category: "Clubs", price: 31, description: "Help peers reclaim time from excessive screen use through the MAP method." },
    { ticker: "REBOOT", name: "Project Reboot", category: "Clubs", price: 34, description: "Discuss relationships with devices and how to better manage them." },
    { ticker: "PSYCH", name: "Psychology Club", category: "Clubs", price: 33, description: "A fun, relaxed way to interact with and learn about psychology." },
    { ticker: "NHOOD", name: "The Neighborhood (Math Tutoring)", category: "Clubs", price: 30, description: "Everything math and problem-solving! Meet to provide math peer tutoring." },

    // Student Government & Leadership
    { ticker: "STUGO", name: "Student Council", category: "Clubs", price: 45, description: "Elected student representatives who organize events and represent student voice." },
    { ticker: "KVISION", name: "Knight Vision (Newspaper)", category: "Clubs", price: 36, description: "Menlo's student newspaper - report on school news and current events." },
    { ticker: "TEDX", name: "TEDx Menlo", category: "Clubs", price: 45, description: "Be part of the production team for Menlo's official TEDx event." },
    { ticker: "YRBK", name: "Yearbook", category: "Clubs", price: 34, description: "Document the school year through photography and design." },

    // Sports-Related Clubs (non-varsity)
    { ticker: "ATHLET", name: "Athlete Empowerment", category: "Clubs", price: 32, description: "Support athletes' mental health and overall well-being." },
    { ticker: "SPRTMN", name: "Sports Management", category: "Clubs", price: 33, description: "Learn about the business side of sports and athletics." },
  ];

  console.log(`Seeding ${clubs.length} clubs...`);

  for (const club of clubs) {
    // Check if this stock already exists
    const existing = await db.select().from(stockMeta).where(eq(stockMeta.ticker, club.ticker)).limit(1);
    if (existing.length > 0) {
      console.log(`Skipping ${club.ticker} - already exists`);
      continue;
    }

    const marketId = randomUUID();

    // Create market
    await db.insert(markets).values({
      id: marketId,
      type: "STOCK",
      title: club.name,
      description: club.description,
      category: club.category,
      status: "OPEN",
      source: "INTERNAL",
      createdBy: adminId,
      createdAt: new Date(),
    });

    // Create stock meta
    const priceVariation = club.price * (0.9 + Math.random() * 0.2);
    await db.insert(stockMeta).values({
      id: randomUUID(),
      marketId,
      ticker: club.ticker,
      initialPrice: club.price,
      currentPrice: priceVariation,
      floatSupply: 10000,
      virtualLiquidity: 100000,
    });

    // Generate historical candle data (90 days)
    const now = new Date();
    let currentPrice = club.price;

    for (let i = 89; i >= 0; i--) {
      const candleDate = new Date(now);
      candleDate.setDate(candleDate.getDate() - i);
      candleDate.setHours(9, 30, 0, 0);

      const volatility = 0.06;
      const changePercent = (Math.random() - 0.5) * volatility;
      const open = currentPrice;
      const close = Math.max(5, currentPrice * (1 + changePercent));
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);
      const volume = Math.floor(50 + Math.random() * 500);

      await db.insert(stockCandles).values({
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

    console.log(`Created ${club.ticker} - ${club.name}`);
  }

  // Seed prediction markets
  const predictionMarkets = [
    { title: "Will Menlo Robotics win at VEX States?", description: "Resolves YES if Menlo Robotics Club places 1st at the VEX State Championship.", category: "Clubs", closeAt: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official VEX competition results" },
    { title: "Will Drama Club's spring show sell out?", description: "Resolves YES if all tickets for Drama Club's spring production are sold.", category: "Clubs", closeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), resolutionRule: "Based on ticket sales records" },
    { title: "Will Model UN win Best Delegation?", description: "Resolves YES if Menlo Model UN wins Best Delegation at the next major conference.", category: "Clubs", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official MUN awards" },
    { title: "Will Parliamentary Debate reach nationals?", description: "Resolves YES if Menlo's debate team qualifies for the national tournament.", category: "Clubs", closeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), resolutionRule: "Based on qualification results" },
    { title: "Will DECA advance to ICDC?", description: "Resolves YES if any Menlo DECA member qualifies for the International Career Development Conference.", category: "Clubs", closeAt: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), resolutionRule: "Based on DECA competition results" },
    { title: "Will TEDx Menlo have 200+ attendees?", description: "Resolves YES if TEDx Menlo event has over 200 attendees.", category: "Events", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on event attendance records" },
    { title: "Will Spirit Week have 80%+ participation?", description: "Resolves YES if more than 80% of students participate in at least one Spirit Week event.", category: "Events", closeAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), resolutionRule: "Based on attendance records" },
    { title: "Will the average AP Calc score be above 4.0?", description: "Resolves YES if the class average on AP Calculus exam exceeds 4.0.", category: "Academics", closeAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), resolutionRule: "Based on College Board results" },
    { title: "Will Menlo Basketball win CCS?", description: "Resolves YES if Menlo's varsity basketball team wins the CCS Championship.", category: "Sports", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on CCS results" },
    { title: "Will Girls Who Code host a hackathon?", description: "Resolves YES if Girls Who Code organizes and hosts a hackathon this semester.", category: "Clubs", closeAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), resolutionRule: "Based on event occurrence" },
    { title: "Will Climate Coalition plant 100+ trees?", description: "Resolves YES if Climate Coalition plants over 100 trees during EcoAct Week.", category: "Clubs", closeAt: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000), resolutionRule: "Based on planting records" },
    { title: "Will Video Game Club win esports tournament?", description: "Resolves YES if Video Game Club wins first place in the inter-school esports tournament.", category: "Clubs", closeAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), resolutionRule: "Based on tournament results" },
    { title: "Will Senior Prom have record attendance?", description: "Resolves YES if Senior Prom 2026 has the highest attendance in 5 years.", category: "Events", closeAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), resolutionRule: "Based on ticket sales" },
    { title: "Will Menlo Soccer go undefeated at home?", description: "Resolves YES if varsity soccer doesn't lose any home games this season.", category: "Sports", closeAt: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), resolutionRule: "Based on game results" },
    { title: "Will the new campus construction finish on time?", description: "Resolves YES if the construction project completes by the announced deadline.", category: "Events", closeAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), resolutionRule: "Based on official announcement" },
  ];

  console.log(`Seeding ${predictionMarkets.length} prediction markets...`);

  for (const m of predictionMarkets) {
    // Check if this market already exists by title
    const existing = await db.select().from(markets).where(eq(markets.title, m.title)).limit(1);
    if (existing.length > 0) {
      console.log(`Skipping "${m.title}" - already exists`);
      continue;
    }

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
      createdAt: new Date(),
    });

    // Create YES/NO outcomes
    const yesPrice = 0.3 + Math.random() * 0.4;
    const yesId = randomUUID();
    const noId = randomUUID();

    await db.insert(outcomes).values([
      { id: yesId, marketId, label: "YES", currentPrice: yesPrice },
      { id: noId, marketId, label: "NO", currentPrice: 1 - yesPrice },
    ]);

    // Generate historical candle data for both outcomes (30 days)
    const now = new Date();
    let currentYesPrice = yesPrice;

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

      await db.insert(marketCandles).values([
        { id: randomUUID(), marketId, outcomeId: yesId, open, high, low, close, volume, timestamp: candleDate },
        { id: randomUUID(), marketId, outcomeId: noId, open: 1 - open, high: 1 - low, low: 1 - high, close: 1 - close, volume, timestamp: candleDate },
      ]);

      currentYesPrice = close;
    }

    console.log(`Created market: ${m.title}`);
  }

  console.log("Seed complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
