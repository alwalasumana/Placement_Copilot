import 'dotenv/config';
import dbConnect from '../config/db.js';
import MockTest from '../models/MockTest.js';
import TestResult from '../models/TestResult.js';
import { runMockTestGeneratorAgent } from '../agents/mockTestGeneratorAgent.js';
import Resume from '../models/Resume.js';
import JobDescription from '../models/JobDescription.js';

async function run() {
  await dbConnect();
  const sessionId = '6a2cd92a38055f0328d01927';

  // Load context
  const resume = await Resume.findOne({ sessionId });
  const jd = await JobDescription.findOne({ sessionId });

  const state = {
    sessionId,
    resumeResult: {
      success: true,
      structured: resume.structured,
      skills: resume.structured?.allSkills || [],
      name: resume.structured?.personalInfo?.name || "Candidate",
    },
    jdResult: {
      success: true,
      structured: jd.structured,
      role: jd.structured?.role || "ReactJS Developer",
      requiredSkills: jd.structured?.requiredSkills || [],
      criticalSkills: jd.structured?.criticalSkills || [],
      interviewTopics: jd.structured?.interviewTopics || [],
    },
    force: true
  };

  console.log("Checking initial count...");
  const initialCount = await MockTest.countDocuments({ sessionId });
  console.log("Initial MockTest count:", initialCount);

  console.log("Generating Test 1...");
  const test1 = await runMockTestGeneratorAgent(state);
  const q1 = test1.mockTestResult?.allQuestions?.map(q => q.question).slice(0, 3) || [];
  console.log("Test 1 testId:", test1.mockTestResult?.testId);
  console.log("Test 1 title:", test1.mockTestResult?.title);
  console.log("Test 1 sample questions:", q1);

  console.log("\nGenerating Test 2 (forcing new generation)...");
  const test2 = await runMockTestGeneratorAgent(state);
  const q2 = test2.mockTestResult?.allQuestions?.map(q => q.question).slice(0, 3) || [];
  console.log("Test 2 testId:", test2.mockTestResult?.testId);
  console.log("Test 2 title:", test2.mockTestResult?.title);
  console.log("Test 2 sample questions:", q2);

  const finalCount = await MockTest.countDocuments({ sessionId });
  console.log("\nFinal MockTest count in DB:", finalCount);
  console.log("Expected increase: 2");

  const overlap = q1.filter(q => q2.includes(q));
  console.log("\nOverlapping questions:", overlap.length, overlap);

  process.exit(0);
}

run().catch(console.error);
