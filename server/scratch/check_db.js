import 'dotenv/config';
import dbConnect from '../config/db.js';
import Resume from '../models/Resume.js';
import JobDescription from '../models/JobDescription.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import SkillGap from '../models/SkillGap.js';
import MockTest from '../models/MockTest.js';
import Roadmap from '../models/Roadmap.js';
import ReadinessReport from '../models/ReadinessReport.js';

async function run() {
  await dbConnect();
  const sessionId = '6a2cd92a38055f0328d01927';
  
  const resume = await Resume.findOne({ sessionId });
  const jd = await JobDescription.findOne({ sessionId });
  const kb = await KnowledgeBase.findOne({ sessionId });
  const skillGap = await SkillGap.findOne({ sessionId });
  const mockTest = await MockTest.findOne({ sessionId });
  const roadmap = await Roadmap.findOne({ sessionId });
  const report = await ReadinessReport.findOne({ sessionId });
  
  const TestResult = (await import('../models/TestResult.js')).default;
  const testResults = await TestResult.find({ sessionId });

  console.log("Session ID:", sessionId);
  console.log("Resume found:", !!resume, resume ? {
    score: resume.score || resume.structured?.overallScore,
    allSkills: resume.structured?.allSkills,
    skillsField: resume.structured?.skills
  } : null);
  console.log("JD found:", !!jd, jd ? {
    company: jd.structured?.company,
    role: jd.structured?.role,
    requiredSkills: jd.structured?.requiredSkills,
    criticalSkills: jd.structured?.criticalSkills,
    skillsField: jd.structured?.skills
  } : null);
  console.log("KB found:", !!kb, kb ? { totalChunks: kb.totalChunks, keys: Object.keys(kb.extractedData || {}) } : null);
  console.log("SkillGap found:", !!skillGap, skillGap ? {
    overallMatchScore: skillGap.overallMatchScore,
    matchedSkills: skillGap.matchedSkills,
    missingSkills: skillGap.missingSkills,
    criticalGaps: skillGap.criticalGaps
  } : null);
  console.log("MockTest found:", !!mockTest, mockTest ? { generated: mockTest.status } : null);
  console.log("TestResults count:", testResults.length, testResults.map(r => r.scores?.overall?.percentage));
  console.log("Roadmap found:", !!roadmap, roadmap ? { totalWeeks: roadmap.totalWeeks } : null);
  console.log("ReadinessReport found:", !!report, report ? { composite: report.compositeReadiness, scores: report.scores } : null);

  process.exit(0);
}

run().catch(console.error);
