import { Router } from 'express';
import { upload } from '../middleware/upload.js';
import {
  uploadKnowledgeFiles,
  uploadResume,
  uploadJobDescription,
  getUploadedFiles,
  deleteFile,
  reindexKnowledge,
  getResumeData,
  getJDData,
  updateJDTimeframe,
} from '../controllers/uploadController.js';

const router = Router();

// Knowledge base
router.post('/knowledge',  upload.array('files', 10), uploadKnowledgeFiles);
router.post('/reindex',                                reindexKnowledge);

// Resume
router.post('/resume',     upload.single('file'),      uploadResume);
router.get('/resume',                                  getResumeData);

// Job Description
router.post('/jd',         upload.single('file'),      uploadJobDescription);
router.post('/jd/timeframe',                           updateJDTimeframe);
router.get('/jd',                                      getJDData);

// File management
router.get('/',                                        getUploadedFiles);
router.delete('/:fileId',                              deleteFile);

export default router;
