import 'dotenv/config';
import dbConnect from '../config/db.js';
import { runPlacementWorkflow } from '../langgraph/placementWorkflow.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import ReadinessReport from '../models/ReadinessReport.js';

async function run() {
  await dbConnect();
  const sessionId = '6a2cd92a38055f0328d01927';
  
  console.log("Running full placement workflow for session:", sessionId);
  const result = await runPlacementWorkflow(sessionId);
  console.log("Workflow success:", result.success);
  console.log("Errors:", result.errors);

  const kbDoc = await KnowledgeBase.findOne({ sessionId });
  console.log("KB document found after run:", !!kbDoc, kbDoc ? { totalChunks: kbDoc.totalChunks } : null);

  const readinessDoc = await ReadinessReport.findOne({ sessionId });
  console.log("Readiness scores after run:", readinessDoc ? readinessDoc.scores : null);
  console.log("Readiness composite score:", readinessDoc ? readinessDoc.compositeReadiness : null);

  process.exit(0);
}

run().catch(console.error);
