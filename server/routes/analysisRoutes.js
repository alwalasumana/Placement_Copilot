import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  runFullAnalysis,
  getAnalysisResults,
  getAnalysisStatus,
  refreshAnalysis,
  getSkillGap,
  getReadinessReport,
  resetAnalysis,
} from '../controllers/analysisController.js';

const runAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2, // Limit each IP to 2 requests per 15 minutes
  message: { success: false, error: 'Analysis rate limit exceeded. You can only run the analysis 2 times every 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post('/run',       runAnalysisLimiter, runFullAnalysis);
router.get('/results',    getAnalysisResults);
router.get('/status',     getAnalysisStatus);   // real-time agent progress
router.post('/refresh',   refreshAnalysis);
router.get('/skill-gap',  getSkillGap);
router.get('/readiness',  getReadinessReport);
router.post('/reset',     resetAnalysis);

export default router;
