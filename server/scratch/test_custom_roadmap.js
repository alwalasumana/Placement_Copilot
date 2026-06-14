import 'dotenv/config';
import dbConnect from '../config/db.js';
import JobDescription from '../models/JobDescription.js';
import Roadmap from '../models/Roadmap.js';
import SkillGap from '../models/SkillGap.js';
import Resume from '../models/Resume.js';
import { runRoadmapGeneratorAgent } from '../agents/roadmapGeneratorAgent.js';

async function run() {
  await dbConnect();
  const sessionId = '6a2cd92a38055f0328d01927';

  // 1. Force JobDescription preparationTime to 15 days
  console.log("Forcing JobDescription preparationTime to 15 days for testing...");
  const jd = await JobDescription.findOneAndUpdate(
    { sessionId },
    { $set: { preparationTime: 15, preparationTimeUnit: 'days' } },
    { new: true }
  );
  console.log("Updated JobDescription details:", { sessionId: jd.sessionId, preparationTime: jd.preparationTime, preparationTimeUnit: jd.preparationTimeUnit });

  // 2. Load other context from DB
  const resume = await Resume.findOne({ sessionId });
  const sg = await SkillGap.findOne({ sessionId });

  const state = {
    sessionId,
    force: true,
    resumeResult: {
      success: true,
      structured: resume.structured,
    },
    jdResult: {
      success: true,
      structured: jd.structured,
      role: jd.structured?.role || "Software Engineer",
    },
    skillGapResult: sg || {
      success: true,
      overallMatchScore: 60,
      criticalGaps: [],
      moderateGaps: [],
      quickWins: []
    }
  };

  console.log("\nRunning Roadmap Generator Agent with force=true...");
  const agentRes = await runRoadmapGeneratorAgent(state);

  if (!agentRes.roadmapResult || agentRes.roadmapResult.success === false) {
    console.error("Roadmap Agent failed:", agentRes.roadmapResult?.error || agentRes);
    process.exit(1);
  }

  const roadmap = agentRes.roadmapResult;
  console.log("\n=================== GENERATED ROADMAP ===================");
  console.log("title     :", roadmap.title || "Roadmap Title");
  console.log("totalWeeks:", roadmap.totalWeeks);
  console.log("theme     :", roadmap.overallTheme);
  console.log("weeksCount:", roadmap.weeks?.length);
  console.log("=========================================================\n");

  if (roadmap.weeks && roadmap.weeks.length > 0) {
    const w1 = roadmap.weeks[0];
    console.log("Week 1 details:");
    console.log("- title             :", w1.title);
    console.log("- estimatedHours    :", w1.estimatedHours);
    console.log("- topics            :", w1.topics);
    console.log("- learningObjectives:", w1.learningObjectives);
    console.log("- practiceGoals     :", w1.practiceGoals);
    console.log("- resources         :", w1.resources);
    console.log("- difficulty        :", w1.difficulty);
  } else {
    console.warn("No weeks generated in roadmap!");
  }

  process.exit(0);
}

run().catch(console.error);
