import { runPlacementWorkflow, runPartialWorkflow, getWorkflowStatus } from '../langgraph/placementWorkflow.js';
import Resume from '../models/Resume.js';
import JobDescription from '../models/JobDescription.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import SkillGap from '../models/SkillGap.js';
import ReadinessReport from '../models/ReadinessReport.js';
import Roadmap from '../models/Roadmap.js';
import MockTest from '../models/MockTest.js';
import TestResult from '../models/TestResult.js';
import UploadedFile from '../models/UploadedFile.js';
import path from 'path';
import fs from 'fs';

// ─── Run Full Analysis ────────────────────────────────────────────────────────
export const runFullAnalysis = async (req, res) => {
  try {
    const sessionId = req.sessionId; // set by auth middleware
    const result = await runPlacementWorkflow(sessionId);
    res.json(result);
  } catch (error) {
    console.error('Full analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get Analysis Status / Results ───────────────────────────────────────────
export const getAnalysisResults = async (req, res) => {
  try {
    const sessionId = req.sessionId;

    const [resume, jd, skillGap, readiness] = await Promise.all([
      Resume.findOne({ sessionId }).select('-rawText'),
      JobDescription.findOne({ sessionId }).select('-rawText'),
      SkillGap.findOne({ sessionId }),
      ReadinessReport.findOne({ sessionId }),
    ]);

    res.json({
      success: true,
      data: {
        hasResume: !!resume,
        hasJD: !!jd,
        hasSkillGap: !!skillGap,
        hasReadiness: !!readiness,
        resume: resume?.structured,
        jd: jd?.structured,
        preparationTime: jd?.preparationTime,
        preparationTimeUnit: jd?.preparationTimeUnit || 'weeks',
        skillGap,
        readiness,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Partial Refresh ─────────────────────────────────────────────────────────
export const refreshAnalysis = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { agents } = req.body;

    if (!agents?.length) return res.status(400).json({ success: false, error: 'Specify agents to refresh' });

    // Clear existing documents in MongoDB to bypass cache
    if (agents.includes('resume')) await Resume.updateOne({ sessionId }, { $set: { structured: {} } });
    if (agents.includes('jd')) await JobDescription.updateOne({ sessionId }, { $set: { structured: {} } });
    if (agents.includes('skillGap')) await SkillGap.deleteOne({ sessionId });
    if (agents.includes('roadmap')) await Roadmap.deleteOne({ sessionId });
    if (agents.includes('readiness')) await ReadinessReport.deleteOne({ sessionId });

    const result = await runPartialWorkflow(sessionId, agents);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get Workflow Progress (real-time polling) ────────────────────────────────
export const getAnalysisStatus = (req, res) => {
  const sessionId = req.sessionId;
  const status = getWorkflowStatus(sessionId);
  res.json({ success: true, ...status });
};

// ─── Get Skill Gap ────────────────────────────────────────────────────────────
export const getSkillGap = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const data = await SkillGap.findOne({ sessionId });
    if (!data) return res.status(404).json({ success: false, error: 'No skill gap analysis found. Run analysis first.' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get Readiness Report ─────────────────────────────────────────────────────
export const getReadinessReport = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const data = await ReadinessReport.findOne({ sessionId });
    if (!data) return res.status(404).json({ success: false, error: 'No readiness report found. Run analysis first.' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Reset Target Company Data (Now resets EVERYTHING, including Resume) ───────
export const resetAnalysis = async (req, res) => {
  try {
    const sessionId = req.sessionId;

    // 1. Delete JD, Knowledge, and Resume Files from UploadedFile and disk
    const files = await UploadedFile.find({ sessionId, fileType: { $in: ['jd', 'knowledge', 'resume'] } });
    const { getUploadDir } = await import('../middleware/upload.js');
    const uploadDir = getUploadDir();
    for (const file of files) {
      try {
        const filePath = path.join(uploadDir, file.storedName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
    await UploadedFile.deleteMany({ sessionId, fileType: { $in: ['jd', 'knowledge', 'resume'] } });

    // 2. Delete DB records for Resume, JD, KB, SkillGap, Roadmap, MockTest, TestResult, ReadinessReport
    await Resume.deleteOne({ sessionId });
    await JobDescription.deleteOne({ sessionId });
    await KnowledgeBase.deleteOne({ sessionId });
    await SkillGap.deleteOne({ sessionId });
    await Roadmap.deleteOne({ sessionId });
    await MockTest.deleteMany({ sessionId });
    await TestResult.deleteMany({ sessionId });
    await ReadinessReport.deleteOne({ sessionId });

    // 3. Clear ChromaDB collections (including resume)
    try {
      const { clearCollection } = await import('../services/chromaService.js');
      await clearCollection('jd', sessionId);
      await clearCollection('knowledge', sessionId);
      await clearCollection('resume', sessionId);
    } catch {}

    res.json({ success: true, message: 'All preparation data, resume, and results reset successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
