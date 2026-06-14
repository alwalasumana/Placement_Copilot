import 'dotenv/config';
import dbConnect from '../config/db.js';
import MockTest from '../models/MockTest.js';
import Resume from '../models/Resume.js';
import JobDescription from '../models/JobDescription.js';
import { runMockTestGeneratorAgent } from '../agents/mockTestGeneratorAgent.js';

async function run() {
  await dbConnect();
  const sessionId = '6a2cd92a38055f0328d01927';

  // Load context from DB
  const resume = await Resume.findOne({ sessionId });
  const jd = await JobDescription.findOne({ sessionId });

  const customOptions = {
    numQuestions: 5,
    difficulty: 'hard',
    questionTypes: ['mcq', 'coding'],
    topics: ['React', 'Redux', 'JavaScript']
  };

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
    force: true,
    customOptions
  };

  console.log("Generating Custom Hard Mock Test (5 questions: MCQ + Coding)...");
  const res = await runMockTestGeneratorAgent(state);
  
  if (!res.mockTestResult || res.mockTestResult.success === false) {
    console.error("Mock Test Generation failed:", res.mockTestResult?.error || res.mockTestResult);
    process.exit(1);
  }

  const test = res.mockTestResult;
  console.log("\n=================== GENERATED CUSTOM MOCK TEST ===================");
  console.log("testId        :", test.testId);
  console.log("title         :", test.title);
  console.log("totalQuestions:", test.totalQuestions);
  console.log("totalDuration :", test.totalDuration, "minutes");
  console.log("role          :", test.role);
  console.log("breakdown     :", test.breakdown);
  console.log("==================================================================\n");

  console.log("Questions list:");
  test.allQuestions.forEach((q, idx) => {
    console.log(`\n[${idx + 1}] Type: ${q.type.toUpperCase()} | Topic: ${q.topic} | Difficulty: ${q.difficulty} | Source: ${q.source}`);
    console.log(`Question: ${q.question}`);
    if (q.options && q.options.length > 0) {
      console.log(`Options: A) ${q.options[0]} | B) ${q.options[1]} | C) ${q.options[2]} | D) ${q.options[3]}`);
      console.log(`Correct Answer: ${q.correctAnswer}`);
    }
    if (q.expected_approach) {
      console.log(`Expected Approach: ${q.expected_approach}`);
    }
  });

  process.exit(0);
}

run().catch(console.error);
