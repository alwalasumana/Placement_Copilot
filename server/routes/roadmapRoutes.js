import { Router } from 'express';
import { getRoadmap, updateWeekProgress } from '../controllers/roadmapController.js';

const router = Router();

router.get('/',              getRoadmap);
router.patch('/progress',    updateWeekProgress);

export default router;
