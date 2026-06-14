/**
 * Placement Workflow – LangGraph StateGraph
 *
 * Architecture (linear, no broken fan-in):
 *
 *   START
 *     │
 *   supervisor  ──── sets startedAt
 *     │
 *   parallelNode ─── runs KB + Resume + JD concurrently via Promise.all
 *     │
 *   mockTestNode
 *     │
 *   skillGapNode
 *     │
 *   roadmapNode
 *     │
 *   readinessNode
 *     │
 *   finalNode ───── sets completedAt, gathers errors
 *     │
 *    END
 */

import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { runKnowledgeExtractionAgent } from '../agents/knowledgeExtractionAgent.js';
import { runResumeAnalyzerAgent }      from '../agents/resumeAnalyzerAgent.js';
import { runJDAnalyzerAgent }          from '../agents/jdAnalyzerAgent.js';
import { runMockTestGeneratorAgent }   from '../agents/mockTestGeneratorAgent.js';
import { runSkillGapAnalysisAgent }    from '../agents/skillGapAnalysisAgent.js';
import { runRoadmapGeneratorAgent }    from '../agents/roadmapGeneratorAgent.js';
import { runReadinessCalculatorAgent } from '../agents/readinessCalculatorAgent.js';

import Resume from '../models/Resume.js';
import JobDescription from '../models/JobDescription.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import MockTest from '../models/MockTest.js';
import SkillGap from '../models/SkillGap.js';
import Roadmap from '../models/Roadmap.js';
import ReadinessReport from '../models/ReadinessReport.js';
import TestResult from '../models/TestResult.js';

// ─── State Schema ─────────────────────────────────────────────────────────────
// Each field uses a "last-write-wins" reducer so any node can update it.

const PlacementState = Annotation.Root({
  sessionId:           Annotation({ reducer: (_, b) => b ?? _ }),
  force:               Annotation({ reducer: (_, b) => b ?? _ }),
  startedAt:           Annotation({ reducer: (_, b) => b ?? _ }),
  completedAt:         Annotation({ reducer: (_, b) => b ?? _ }),
  knowledgeBaseResult: Annotation({ reducer: (_, b) => b ?? _ }),
  resumeResult:        Annotation({ reducer: (_, b) => b ?? _ }),
  jdResult:            Annotation({ reducer: (_, b) => b ?? _ }),
  mockTestResult:      Annotation({ reducer: (_, b) => b ?? _ }),
  skillGapResult:      Annotation({ reducer: (_, b) => b ?? _ }),
  roadmapResult:       Annotation({ reducer: (_, b) => b ?? _ }),
  readinessResult:     Annotation({ reducer: (_, b) => b ?? _ }),
  errors:              Annotation({ reducer: (a, b) => [...(a || []), ...(b || [])] }),
});

// ─── Node: Supervisor ─────────────────────────────────────────────────────────
const supervisorNode = async (state) => {
  console.log('\n🤖 [Supervisor] Placement workflow initialising');
  return { startedAt: new Date().toISOString() };
};

// ─── Node: Parallel (KB + Resume + JD via Promise.all) ───────────────────────
const parallelNode = async (state) => {
  console.log('⚡ [Parallel] Running Knowledge, Resume, JD agents concurrently');

  const [kbState, resumeState, jdState] = await Promise.all([
    runKnowledgeExtractionAgent(state).catch((e) => {
      console.error('KB agent error:', e.message);
      return { knowledgeBaseResult: { error: e.message, hasKnowledgeBase: false, importantTopics: [] } };
    }),
    runResumeAnalyzerAgent(state).catch((e) => {
      console.error('Resume agent error:', e.message);
      return { resumeResult: { error: e.message, found: false, structured: null } };
    }),
    runJDAnalyzerAgent(state).catch((e) => {
      console.error('JD agent error:', e.message);
      return { jdResult: { error: e.message, found: false, structured: null } };
    }),
  ]);

  return {
    knowledgeBaseResult: kbState.knowledgeBaseResult,
    resumeResult:        resumeState.resumeResult,
    jdResult:            jdState.jdResult,
  };
};

// ─── Node: Mock Test ──────────────────────────────────────────────────────────
const mockTestNode = async (state) => {
  console.log('📝 [MockTest] Generating company-specific mock test');
  try {
    const result = await runMockTestGeneratorAgent(state);
    return { mockTestResult: result.mockTestResult };
  } catch (e) {
    return { mockTestResult: { generated: false, error: e.message } };
  }
};

// ─── Node: Skill Gap ──────────────────────────────────────────────────────────
const skillGapNode = async (state) => {
  console.log('🔬 [SkillGap] Analysing skill gaps');
  try {
    const result = await runSkillGapAnalysisAgent(state);
    return { skillGapResult: result.skillGapResult };
  } catch (e) {
    return { skillGapResult: { error: e.message, scores: { overallReadinessScore: 0, skillMatchPercentage: 0 } } };
  }
};

// ─── Node: Roadmap ────────────────────────────────────────────────────────────
const roadmapNode = async (state) => {
  console.log('🗺️  [Roadmap] Building personalised roadmap');
  try {
    const result = await runRoadmapGeneratorAgent(state);
    return { roadmapResult: result.roadmapResult };
  } catch (e) {
    return { roadmapResult: { generated: false, error: e.message } };
  }
};

// ─── Node: Readiness ──────────────────────────────────────────────────────────
const readinessNode = async (state) => {
  console.log('🎯 [Readiness] Calculating interview readiness');
  try {
    const result = await runReadinessCalculatorAgent(state);
    return { readinessResult: result.readinessResult };
  } catch (e) {
    return { readinessResult: { error: e.message, scores: { overallReadiness: 0 } } };
  }
};

// ─── Node: Final Supervisor ───────────────────────────────────────────────────
const finalNode = async (state) => {
  const errs = [];
  if (state.knowledgeBaseResult?.error) errs.push(`KB: ${state.knowledgeBaseResult.error}`);
  if (state.resumeResult?.error)        errs.push(`Resume: ${state.resumeResult.error}`);
  if (state.jdResult?.error)            errs.push(`JD: ${state.jdResult.error}`);
  if (state.mockTestResult?.error)      errs.push(`MockTest: ${state.mockTestResult.error}`);
  if (state.skillGapResult?.error)      errs.push(`SkillGap: ${state.skillGapResult.error}`);
  if (state.roadmapResult?.error)       errs.push(`Roadmap: ${state.roadmapResult.error}`);
  if (state.readinessResult?.error)     errs.push(`Readiness: ${state.readinessResult.error}`);

  if (errs.length) console.warn('⚠️  [Final] Partial errors:', errs.join(' | '));
  else console.log('✅ [Final] All agents completed successfully');

  return { completedAt: new Date().toISOString(), errors: errs };
};

// ─── Build Graph ──────────────────────────────────────────────────────────────
const buildGraph = () => {
  const g = new StateGraph(PlacementState);

  // Register nodes
  g.addNode('supervisor',   supervisorNode);
  g.addNode('parallel',     parallelNode);
  g.addNode('skillGap',     skillGapNode);
  g.addNode('roadmap',      roadmapNode);
  g.addNode('readiness',    readinessNode);
  g.addNode('finalSupervisor', finalNode);

  // Linear edges
  g.addEdge(START,          'supervisor');
  g.addEdge('supervisor',   'parallel');
  g.addEdge('parallel',     'skillGap');
  g.addEdge('skillGap',     'roadmap');
  g.addEdge('roadmap',      'readiness');
  g.addEdge('readiness',    'finalSupervisor');
  g.addEdge('finalSupervisor', END);

  return g.compile();
};

// ─── Cached compiled graph ────────────────────────────────────────────────────
let compiledGraph;

// ─── Public: Run Full Workflow ────────────────────────────────────────────────
export const runPlacementWorkflow = async (sessionId) => {
  if (!compiledGraph) compiledGraph = buildGraph();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀  Placement Workflow  |  session: ${sessionId}`);
  console.log(`${'═'.repeat(60)}\n`);

  const initialState = { sessionId, errors: [], force: true };

  const finalState = await compiledGraph.invoke(initialState, { recursionLimit: 50 });

  const duration = finalState.startedAt && finalState.completedAt
    ? Math.round((new Date(finalState.completedAt) - new Date(finalState.startedAt)) / 1000)
    : 0;

  console.log(`\n✅  Workflow done in ${duration}s`);

  return {
    success: true,
    sessionId,
    duration,
    results: {
      knowledgeBase: finalState.knowledgeBaseResult,
      resume:        finalState.resumeResult,
      jobDescription: finalState.jdResult,
      mockTest:      finalState.mockTestResult,
      skillGap:      finalState.skillGapResult,
      roadmap:       finalState.roadmapResult,
      readiness:     finalState.readinessResult,
    },
    errors: finalState.errors || [],
  };
};

// ─── Public: Run Partial Workflow (selective agent refresh) ───────────────────
export const runPartialWorkflow = async (sessionId, agents = []) => {
  const state = { sessionId, errors: [], force: true };

  // Pre-populate state from MongoDB to prevent downstream calculation errors
  try {
    const [resume, jd, kb, mockTest, skillGap, roadmap, readiness, testResults] = await Promise.all([
      Resume.findOne({ sessionId }),
      JobDescription.findOne({ sessionId }),
      KnowledgeBase.findOne({ sessionId }),
      MockTest.findOne({ sessionId }),
      SkillGap.findOne({ sessionId }),
      Roadmap.findOne({ sessionId }),
      ReadinessReport.findOne({ sessionId }),
      TestResult.find({ sessionId }),
    ]);

    if (resume) {
      state.resumeResult = {
        success: true,
        structured: resume.structured,
        score: resume.score || resume.structured?.overallScore || 50,
        skills: resume.structured?.allSkills || [],
        name: resume.structured?.personalInfo?.name || "Candidate",
      };
    }
    if (jd) {
      state.jdResult = {
        success: true,
        structured: jd.structured,
        role: jd.structured?.role || "Software Engineer",
        requiredSkills: jd.structured?.requiredSkills || [],
        criticalSkills: jd.structured?.criticalSkills || [],
        interviewTopics: jd.structured?.interviewTopics || [],
        company: jd.structured?.company || null,
        preparationTime: jd.preparationTime,
        preparationTimeUnit: jd.preparationTimeUnit || 'weeks',
      };
    }
    if (kb) {
      state.kbResult = {
        success: true,
        hasKnowledgeBase: true,
        knowledgeBaseFound: true,
        chunkCount: kb.totalChunks || 0,
        totalChunks: kb.totalChunks || 0,
        importantTopics: kb.extractedData?.importantTopics || [],
        repeatedQuestions: kb.extractedData?.repeatedQuestions || [],
        codingPatterns: kb.extractedData?.codingPatterns || [],
        oaPatterns: kb.extractedData?.oaPatterns || [],
        interviewPatterns: kb.extractedData?.interviewPatterns || [],
        technologies: kb.extractedData?.frequentTechnologies || [],
        frequentTechnologies: kb.extractedData?.frequentTechnologies || [],
      };
      state.knowledgeBaseResult = state.kbResult;
    }
    if (testResults && testResults.length > 0) {
      const totalPct = testResults.reduce((acc, r) => acc + (r.scores?.overall?.percentage || 0), 0);
      const avgScore = Math.round(totalPct / testResults.length);
      state.mockTestResult = {
        success: true,
        averageScore: avgScore,
      };
    } else if (mockTest) {
      state.mockTestResult = {
        success: false,
        averageScore: 0,
      };
    }
    if (skillGap) {
      state.skillGapResult = {
        success: true,
        overallMatchScore: skillGap.overallMatchScore || 0,
        criticalGaps: skillGap.criticalGaps || [],
        strengths: skillGap.strengths || [],
        readinessLevel: skillGap.readinessLevel || "unknown",
      };
    }
    if (roadmap) {
      state.roadmapResult = {
        success: true,
        totalWeeks: roadmap.totalWeeks || 12,
      };
    }
    if (readiness) {
      state.readinessResult = {
        success: true,
        compositeReadiness: readiness.compositeReadiness || 0,
        readinessTier: readiness.readinessTier || "developing",
        executiveSummary: readiness.executiveSummary || "",
      };
    }
  } catch (err) {
    console.error('Error pre-populating partial workflow state:', err.message);
  }

  const results = {};

  for (const agent of agents) {
    try {
      switch (agent) {
        case 'knowledge': {
          const s = await runKnowledgeExtractionAgent(state);
          results.knowledgeBase = s.knowledgeBaseResult;
          Object.assign(state, s);
          break;
        }
        case 'resume': {
          const s = await runResumeAnalyzerAgent(state);
          results.resume = s.resumeResult;
          Object.assign(state, s);
          break;
        }
        case 'jd': {
          const s = await runJDAnalyzerAgent(state);
          results.jobDescription = s.jdResult;
          Object.assign(state, s);
          break;
        }
        case 'skillGap': {
          const s = await runSkillGapAnalysisAgent(state);
          results.skillGap = s.skillGapResult;
          Object.assign(state, s);
          break;
        }
        case 'roadmap': {
          const s = await runRoadmapGeneratorAgent(state);
          results.roadmap = s.roadmapResult;
          Object.assign(state, s);
          break;
        }
        case 'readiness': {
          const s = await runReadinessCalculatorAgent(state);
          results.readiness = s.readinessResult;
          Object.assign(state, s);
          break;
        }
        default:
          console.warn(`Unknown agent: ${agent}`);
      }
    } catch (e) {
      console.error(`Partial workflow error (${agent}):`, e.message);
      results[agent] = { error: e.message };
    }
  }

  return { success: true, sessionId, results };
};
