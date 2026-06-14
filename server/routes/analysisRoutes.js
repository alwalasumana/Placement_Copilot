import { Router } from 'express';
import {
  runFullAnalysis,
  getAnalysisResults,
  refreshAnalysis,
  getSkillGap,
  getReadinessReport,
  resetAnalysis,
} from '../controllers/analysisController.js';

const router = Router();

router.post('/run',       runFullAnalysis);
router.get('/results',    getAnalysisResults);
router.post('/refresh',   refreshAnalysis);
router.get('/skill-gap',  getSkillGap);
router.get('/readiness',  getReadinessReport);
router.post('/reset',     resetAnalysis);

export default router;
