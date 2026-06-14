import 'dotenv/config';
import dbConnect from '../config/db.js';
import SkillGap from '../models/SkillGap.js';
import ReadinessReport from '../models/ReadinessReport.js';
import { runPartialWorkflow } from '../langgraph/placementWorkflow.js';

async function run() {
  await dbConnect();
  const sessionId = '6a2cd92a38055f0328d01927';
  
  console.log("Clearing old cached records for session:", sessionId);
  await SkillGap.deleteOne({ sessionId });
  await ReadinessReport.deleteOne({ sessionId });
  
  console.log("Running partial workflow to regenerate skill gap and readiness with correct kb.chunkCount mapping...");
  const res = await runPartialWorkflow(sessionId, ['skillGap', 'readiness']);
  console.log("Refresh results:", JSON.stringify(res.results, null, 2));
  
  const report = await ReadinessReport.findOne({ sessionId });
  if (report) {
    console.log("New scores object in database:", report.scores);
  }
  process.exit(0);
}

run().catch(console.error);
