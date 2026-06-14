import { Router } from 'express';
import {
  generateTest,
  getTest,
  listTests,
  submitTest,
  getTestResults,
  deleteTest,
} from '../controllers/mockTestController.js';

const router = Router();

router.post('/generate',         generateTest);
router.get('/',                  listTests);
router.get('/:testId',           getTest);
router.post('/submit',           submitTest);
router.get('/results/:testId',   getTestResults);
router.get('/results',           getTestResults);
router.delete('/:testId',        deleteTest);

export default router;
