// Load .env from the same directory as this file (not CWD)
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

import { config } from 'dotenv';
config({ path: join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import authRoutes    from './routes/authRoutes.js';
import uploadRoutes  from './routes/uploadRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import mockTestRoutes from './routes/mockTestRoutes.js';
import roadmapRoutes  from './routes/roadmapRoutes.js';
import { protect }   from './middleware/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
await connectDB();

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'Too many analysis requests. Please wait 15 minutes.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { success: false, error: 'Too many upload requests.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'Too many auth attempts. Please wait.' },
});

// ─── Parsing Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'Placement Copilot API',
  });
});

// ─── Grok / AI Key Test (public, for debugging) ───────────────────────────────
app.get('/health/gemini', async (_req, res) => {
  try {
    const { validateGrokKey } = await import('./services/geminiService.js');
    const result = await validateGrokKey();
    res.json({
      grok: result.valid ? '✅ Grok API key valid' : '❌ Grok API key invalid',
      grokKey: process.env.GROK_API_KEY ? '✅ GROK_API_KEY set' : '❌ GROK_API_KEY not set',
      geminiKey: process.env.GEMINI_API_KEY ? '✅ GEMINI_API_KEY set (used for embeddings)' : '⚠️  GEMINI_API_KEY not set (ChromaDB indexing will fail)',
      error: result.error || null,
      hint: result.valid ? null : 'Get a free Groq API key (gsk_...) at https://console.groq.com/',
    });
  } catch (e) {
    res.json({ grok: '❌ Error', error: e.message });
  }
});

// ─── ChromaDB Health Check (public, for debugging) ────────────────────────────
// NOTE: GET localhost:8000/ always returns 404 in ChromaDB — that is NORMAL.
// The real API is at /api/v1/heartbeat. This endpoint tests that correctly.
app.get('/health/chroma', async (_req, res) => {
  try {
    const { getChromaStatus, resetChromaState } = await import('./services/chromaService.js');
    resetChromaState(); // force a fresh check every time
    const status = await getChromaStatus();
    res.json(status);
  } catch (e) {
    res.json({ available: false, error: e.message });
  }
});

// ─── Public Auth Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);

// ─── Protected API Routes (require valid JWT) ─────────────────────────────────
app.use('/api/upload',    protect, uploadLimiter,   uploadRoutes);
app.use('/api/analysis',  protect, analysisLimiter, analysisRoutes);
app.use('/api/mock-test', protect,                  mockTestRoutes);
app.use('/api/roadmap',   protect,                  roadmapRoutes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.url} not found` });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Placement Copilot Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment  : ${process.env.NODE_ENV || 'development'}`);
  console.log(`🤖 Grok API     : ${process.env.GROK_API_KEY    ? '✅ configured' : '❌ NOT SET — set GROK_API_KEY in .env'}`);
  console.log(`🔑 Gemini API   : ${process.env.GEMINI_API_KEY  ? '✅ configured (embeddings only)' : '⚠️  not set (ChromaDB indexing disabled)'}`);
  console.log(`🔐 JWT Secret   : ${process.env.JWT_SECRET      ? '✅ configured' : '❌ NOT SET'}`);
  console.log(`🗄️  MongoDB      : ${process.env.MONGODB_URI     ? '✅ configured' : '❌ NOT SET'}`);
  console.log(`🧠 ChromaDB     : ${process.env.CHROMA_URL || 'http://localhost:8000'}\n`);
});

export default app;
