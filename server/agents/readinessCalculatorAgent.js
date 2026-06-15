/**
 * Agent 7 -- Readiness Calculator (LangGraph)
 * 3-node StateGraph: scoreAggregator -> readinessAnalyzer -> reportAssembler
 * Composite score weights: skillMatch 35%, criticalSkills 25%, resume 15%, kb 10%, mockTest 10%, roadmap 5%
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { generateJSON } from "../services/geminiService.js";
import ReadinessReport from "../models/ReadinessReport.js";

const ReadinessAgentState = Annotation.Root({
  sessionId:       Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  resumeResult:    Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  jdResult:        Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  kbResult:        Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  mockTestResult:  Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  skillGapResult:  Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  roadmapResult:   Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  aggregatedScores: Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  readinessReport:  Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  readinessResult:  Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  force:           Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  errors: Annotation({ reducer: (a, b) => [...(a || []), ...(b || [])], default: () => [] }),
});

// Node 1: Aggregate all scores into composite
const scoreAggregatorNode = async (state) => {
  const { sessionId } = state;
  console.log("[ReadinessAgent] 1/3 Aggregating scores for session:", sessionId);
  try {
    const existing = await ReadinessReport.findOne({ sessionId });
    if (!state.force && existing && existing.compositeReadiness !== undefined && existing.compositeReadiness !== null) {
      console.log("[ReadinessAgent] 1/3 Cache hit");
      return {
        readinessResult: {
          success: true, cached: true,
          compositeReadiness: existing.compositeReadiness,
          readinessTier: existing.readinessTier,
          executiveSummary: existing.executiveSummary || "",
        }
      };
    }
    const sg = state.skillGapResult || {};
    const resume = state.resumeResult || {};
    const jd = state.jdResult || {};
    const kb = state.kbResult || {};
    const mt = state.mockTestResult || {};
    const rm = state.roadmapResult || {};

    // Extract sub-scores
    let skillMatchScore = Math.min(100, Math.max(0, sg.overallMatchScore || 0));
    if (skillMatchScore === 0) {
      try {
        const SkillGap = (await import("../models/SkillGap.js")).default;
        const sgDoc = await SkillGap.findOne({ sessionId });
        if (sgDoc) {
          skillMatchScore = Math.min(100, Math.max(0, sgDoc.overallMatchScore || 0));
        }
      } catch (err) {
        console.error("SkillGap fallback error:", err.message);
      }
    }

    // Critical skills score: percentage of JD critical skills the candidate has
    let criticalSkills = jd.criticalSkills || jd.structured?.criticalSkills || [];
    let resumeSkills = resume.skills || resume.structured?.allSkills || [];
    
    if (criticalSkills.length === 0) {
      try {
        const JobDescription = (await import("../models/JobDescription.js")).default;
        const jdDoc = await JobDescription.findOne({ sessionId });
        if (jdDoc) {
          criticalSkills = jdDoc.criticalSkills || jdDoc.structured?.criticalSkills || [];
        }
      } catch (err) {
        console.error("JD critical skills fallback error:", err.message);
      }
    }
    if (resumeSkills.length === 0) {
      try {
        const Resume = (await import("../models/Resume.js")).default;
        const resumeDoc = await Resume.findOne({ sessionId });
        if (resumeDoc) {
          resumeSkills = resumeDoc.skills || resumeDoc.structured?.allSkills || [];
        }
      } catch (err) {
        console.error("Resume skills fallback error:", err.message);
      }
    }

    // JD Match: load base required skill match score from SkillGap
    let criticalSkillsScore = sg.scoreBreakdown?.base || 0;
    if (criticalSkillsScore === 0) {
      try {
        const SkillGap = (await import("../models/SkillGap.js")).default;
        const sgDoc = await SkillGap.findOne({ sessionId });
        if (sgDoc) {
          criticalSkillsScore = sgDoc.scoreBreakdown?.base || sgDoc.overallMatchScore || 50;
        } else {
          criticalSkillsScore = skillMatchScore;
        }
      } catch (err) {
        console.error("SkillGap fallback error for JD Match:", err.message);
        criticalSkillsScore = skillMatchScore;
      }
    }

    // Resume score: ATS score from resume agent, blended with skill match score for dynamic evaluation
    let resumeBaseScore = resume.score || resume.structured?.overallScore || 0;
    if (resumeBaseScore === 0) {
      try {
        const ResumeModel = (await import("../models/Resume.js")).default;
        const resumeDoc = await ResumeModel.findOne({ sessionId });
        if (resumeDoc) {
          resumeBaseScore = resumeDoc.score || resumeDoc.structured?.overallScore || 50;
        } else {
          resumeBaseScore = 50;
        }
      } catch (err) {
        console.error("Resume score fallback error:", err.message);
        resumeBaseScore = 50;
      }
    }
    const resumeScore = Math.round((resumeBaseScore * 0.7) + (skillMatchScore * 0.3));

    // KB score: based on KB chunk coverage
    let totalChunks = kb.chunkCount || kb.chunks || kb.totalChunks || 0;
    if (totalChunks === 0) {
      try {
        const KnowledgeBase = (await import("../models/KnowledgeBase.js")).default;
        const kbDoc = await KnowledgeBase.findOne({ sessionId });
        if (kbDoc) {
          totalChunks = kbDoc.totalChunks || 0;
        }
      } catch (err) {
        console.error("KnowledgeBase fallback error:", err.message);
      }
    }
    const kbScore = totalChunks > 50 ? 90 : totalChunks > 20 ? 75 : totalChunks > 5 ? 60 : totalChunks > 0 ? 40 : 0;

    // Mock test score: calculate average from all TestResult documents, fallback to state
    let mockTestScore = 0;
    try {
      const TestResult = (await import("../models/TestResult.js")).default;
      const testResults = await TestResult.find({ sessionId });
      if (testResults.length > 0) {
        const totalPct = testResults.reduce((acc, r) => acc + (r.scores?.overall?.percentage || 0), 0);
        mockTestScore = Math.round(totalPct / testResults.length);
      } else if (mt && mt.success) {
        mockTestScore = mt.averageScore || 50;
      }
    } catch (err) {
      console.error("TestResult fallback error:", err.message);
      if (mt && mt.success) {
        mockTestScore = mt.averageScore || 50;
      }
    }

    // Roadmap score: has roadmap = bonus
    let hasRoadmap = rm && rm.success;
    if (!hasRoadmap) {
      try {
        const Roadmap = (await import("../models/Roadmap.js")).default;
        const roadmapDoc = await Roadmap.findOne({ sessionId });
        if (roadmapDoc) {
          hasRoadmap = true;
        }
      } catch (err) {
        console.error("Roadmap fallback error:", err.message);
      }
    }
    const roadmapScore = hasRoadmap ? 80 : 0;

    // Calculate programmatic interview round readiness scores
    const onlineAssessment = Math.min(100, Math.round((mockTestScore * 0.4) + (skillMatchScore * 0.4) + (criticalSkillsScore * 0.2)));
    const technicalInterview = Math.min(100, Math.round((skillMatchScore * 0.4) + (criticalSkillsScore * 0.3) + (kbScore * 0.2) + (mockTestScore * 0.1)));
    const hrRound = Math.min(100, Math.round((resumeBaseScore * 0.5) + (mockTestScore * 0.3) + 20));
    const codingRound = Math.min(100, Math.round((mockTestScore * 0.5) + (skillMatchScore * 0.3) + (criticalSkillsScore * 0.2)));

    // Composite (Mock Test excluded from readiness calculation):
    // skillMatch 40%, criticalSkills 30%, resume 15%, kb 10%, roadmap 5%
    const compositeReadiness = Math.round(
      (skillMatchScore     * 0.40) +
      (criticalSkillsScore * 0.30) +
      (resumeScore         * 0.15) +
      (kbScore             * 0.10) +
      (roadmapScore        * 0.05)
    );

    const aggregatedScores = {
      composite: compositeReadiness,
      breakdown: {
        skillMatch:     { score: skillMatchScore,     weight: 40, weighted: Math.round(skillMatchScore * 0.40) },
        criticalSkills: { score: criticalSkillsScore, weight: 30, weighted: Math.round(criticalSkillsScore * 0.30) },
        resume:         { score: resumeScore,         weight: 15, weighted: Math.round(resumeScore * 0.15) },
        kb:             { score: kbScore,             weight: 10, weighted: Math.round(kbScore * 0.10) },
        mockTest:       { score: mockTestScore,       weight:  0, weighted: 0 },
        roadmap:        { score: roadmapScore,        weight:  5, weighted: Math.round(roadmapScore * 0.05) },
      },
      context: {
        role: jd.role || jd.structured?.role || "Software Engineer",
        name: resume.name || resume.structured?.personalInfo?.name || "Candidate",
        company: jd.company || jd.structured?.company || null,
        criticalGaps: sg.criticalGaps || [],
        strengths: sg.strengths || [],
        quickWins: sg.quickWins || [],
        interviewTopics: jd.interviewTopics || jd.structured?.interviewTopics || [],
        weeksToReady: sg.weeksToReady || rm.totalWeeks || 10,
        hiringProbabilityNow: sg.hiringProbabilityNow || 30,
        hiringProbabilityPrepared: sg.hiringProbabilityPrepared || 70,
        calculatedInterviewReadiness: {
          onlineAssessment,
          technicalInterview,
          hrRound,
          codingRound
        }
      }
    };
    console.log("[ReadinessAgent] 1/3 Composite readiness:", compositeReadiness + "%");
    return { aggregatedScores };
  } catch (err) {
    return { errors: [{ node: "scoreAggregator", error: err.message }] };
  }
};

// Node 2: AI-powered readiness analysis
const readinessAnalyzerNode = async (state) => {
  if (state.readinessResult?.cached || !state.aggregatedScores) return {};
  if ((state.errors || []).some(e => e.node === "scoreAggregator")) return {};
  const agg = state.aggregatedScores;
  const ctx = agg.context;
  const br  = agg.breakdown;
  console.log("[ReadinessAgent] 2/3 Running AI readiness analysis...");
  try {
    const readinessReport = await generateJSON(
      "You are a senior placement officer providing a final readiness assessment for a candidate.\n\n" +
      "CANDIDATE: " + ctx.name + " targeting " + ctx.role + (ctx.company ? " at " + ctx.company : "") + "\n\n" +
      "COMPOSITE READINESS SCORE: " + agg.composite + "/100\n\n" +
      "SCORE BREAKDOWN:\n" +
      "- Skill Match: " + br.skillMatch.score + "% (40% weight) = " + br.skillMatch.weighted + " pts\n" +
      "- Critical Skills (JD Match): " + br.criticalSkills.score + "% (30% weight) = " + br.criticalSkills.weighted + " pts\n" +
      "- Resume Quality: " + br.resume.score + "% (15% weight) = " + br.resume.weighted + " pts\n" +
      "- Knowledge Base (Company Match): " + br.kb.score + "% (10% weight) = " + br.kb.weighted + " pts\n" +
      "- Roadmap: " + br.roadmap.score + "% (5% weight) = " + br.roadmap.weighted + " pts\n\n" +
      "STRENGTHS: " + (ctx.strengths || []).map(s => s.skill || s).slice(0, 5).join(", ") + "\n" +
      "CRITICAL GAPS: " + (ctx.criticalGaps || []).map(g => g.skill || g).slice(0, 5).join(", ") + "\n" +
      "QUICK WINS: " + (ctx.quickWins || []).slice(0, 4).join(", ") + "\n" +
      "WEEKS TO READY: " + ctx.weeksToReady + "\n" +
      "HIRING PROBABILITY NOW: " + ctx.hiringProbabilityNow + "%\n" +
      "HIRING PROBABILITY PREPARED: " + ctx.hiringProbabilityPrepared + "%\n\n" +
      "PROGRAMMATIC INTERVIEW ROUND SCORES (DO NOT CHANGE THESE SCORE VALUES IN YOUR OUTPUT):\n" +
      "- Online Assessment: " + ctx.calculatedInterviewReadiness?.onlineAssessment + "%\n" +
      "- Technical Interview: " + ctx.calculatedInterviewReadiness?.technicalInterview + "%\n" +
      "- HR Round: " + ctx.calculatedInterviewReadiness?.hrRound + "%\n" +
      "- Coding Round: " + ctx.calculatedInterviewReadiness?.codingRound + "%\n\n" +
      "Return EXACTLY this JSON:\n" +
      "IMPORTANT: Use the ACTUAL scores provided above in SCORE BREAKDOWN — do NOT invent new scores. " +
      "The readiness_breakdown scores below must match the values given in SCORE BREAKDOWN.\n\n" +
      JSON.stringify({
        readiness_tier: "developing",
        executive_summary: "Write 2-3 sentences assessing this specific candidate based on the data above.",
        readiness_breakdown: {
          skill_match:      { score: 0, status: "developing", note: "Write a specific note about skill match." },
          critical_skills:  { score: 0, status: "weak",       note: "Write a specific note about critical skills." },
          resume_quality:   { score: 0, status: "moderate",   note: "Write a specific note about resume quality." },
          knowledge_base:   { score: 0, status: "weak",       note: "Write a specific note about knowledge base." },
          mock_performance: { score: 0, status: "not_taken",  note: "Write a specific note about mock test performance." },
          roadmap_presence: { score: 0, status: "good",       note: "Write a specific note about roadmap." }
        },
        top_strengths: [{ strength: "Specific strength from resume", impact: "high", evidence: "Specific evidence" }],
        critical_gaps_to_fix: [{ gap: "Specific gap from JD", severity: "high", fix: "Specific action", time_required: "X weeks" }],
        immediate_actions: [{ action: "Specific action item", timeframe: "This week", impact: "high", effort: "medium" }],
        interview_round_readiness: {
          online_assessment:   { ready: false, score: 0, gaps: ["Specific gap"] },
          technical_interview: { ready: false, score: 0, gaps: ["Specific gap"] },
          hr_round:            { ready: true,  score: 0, gaps: [] },
          coding_round:        { ready: false, score: 0, gaps: ["Specific gap"] }
        },
        timeline_to_readiness: { weeks_needed: 8, key_milestones: [{ week: 4, milestone: "Core skills ready" }, { week: 8, milestone: "Interview ready" }] },
        motivational_note: "Write an encouraging, specific motivational note for this candidate.",
        hiring_probability_now: 0,
        hiring_probability_prepared: 0
      }),
      { temperature: 0.3, maxOutputTokens: 2000 }
    );
    console.log("[ReadinessAgent] 2/3 Readiness tier:", readinessReport.readiness_tier);
    return { readinessReport };
  } catch (err) {
    console.error("[ReadinessAgent] 2/3 ERROR:", err.message);
    return { errors: [{ node: "readinessAnalyzer", error: err.message }] };
  }
};

// Node 3: Assemble final report & save
const reportAssemblerNode = async (state) => {
  if (state.readinessResult?.cached) return {};
  console.log("[ReadinessAgent] 3/3 Assembling final readiness report...");
  const { aggregatedScores: agg, readinessReport: rr, sessionId } = state;
  const nodeErrors = state.errors || [];
  const a = agg || { composite: 0, breakdown: {}, context: {} };
  const r = rr  || {};
  const ctx = a.context || {};
  const br  = a.breakdown || {};

  // Map tier string to schema enum
  const tierMap = {
    interview_ready: "interview_ready", near_ready: "near_ready",
    developing: "developing", early_stage: "early_stage", needs_foundation: "needs_foundation"
  };
  const rawTier = r.readiness_tier || (
    a.composite >= 80 ? "interview_ready" :
    a.composite >= 65 ? "near_ready" :
    a.composite >= 45 ? "developing" :
    a.composite >= 25 ? "early_stage" : "needs_foundation"
  );
  const readinessTier = tierMap[rawTier] || "developing";

  const calculated = ctx.calculatedInterviewReadiness || {};
  const onlineAssessment = calculated.onlineAssessment || 0;
  const technicalInterview = calculated.technicalInterview || 0;
  const hrRound = calculated.hrRound || 0;
  const codingRound = calculated.codingRound || 0;

  const interviewRoundReadiness = {
    online_assessment: {
      ready: onlineAssessment >= 70,
      score: onlineAssessment,
      gaps: r.interview_round_readiness?.online_assessment?.gaps || []
    },
    technical_interview: {
      ready: technicalInterview >= 70,
      score: technicalInterview,
      gaps: r.interview_round_readiness?.technical_interview?.gaps || []
    },
    hr_round: {
      ready: hrRound >= 70,
      score: hrRound,
      gaps: r.interview_round_readiness?.hr_round?.gaps || []
    },
    coding_round: {
      ready: codingRound >= 70,
      score: codingRound,
      gaps: r.interview_round_readiness?.coding_round?.gaps || []
    }
  };

  const docData = {
    sessionId, candidateName: ctx.name || "Candidate",
    role: ctx.role || "Software Engineer", company: ctx.company || null,
    compositeReadiness: a.composite,
    readinessTier,
    scores: {
      resume:         br.resume?.score         || 0,
      skillMatch:     br.skillMatch?.score     || 0,
      criticalSkills: br.criticalSkills?.score || 0,
      kb:             br.kb?.score             || 0,
      mockTest:       br.mockTest?.score       || 0,
      roadmap:        br.roadmap?.score        || 0,
    },
    executiveSummary:        r.executive_summary         || "Assessment pending.",
    readinessBreakdown:      r.readiness_breakdown       || {},
    topStrengths:            r.top_strengths             || [],
    criticalGapsToFix:       r.critical_gaps_to_fix      || [],
    immediateActions:        r.immediate_actions         || [],
    interviewRoundReadiness: interviewRoundReadiness,
    timelineToReadiness:     r.timeline_to_readiness     || {},
    motivationalNote:        r.motivational_note         || "",
    hiringProbabilityNow:    r.hiring_probability_now    || ctx.hiringProbabilityNow || 30,
    hiringProbabilityPrepared: r.hiring_probability_prepared || ctx.hiringProbabilityPrepared || 70,
    generatedAt: new Date().toISOString(),
    warnings: nodeErrors.map(e => e.error),
  };
  try {
    await ReadinessReport.findOneAndUpdate({ sessionId }, docData, { upsert: true, new: true });
    console.log("[ReadinessAgent] 3/3 Saved readiness report to MongoDB");
  } catch (dbErr) {
    nodeErrors.push({ node: "reportAssembler", error: "DB save: " + dbErr.message });
  }
  const readinessResult = { success: true, cached: false, ...docData };
  console.log("[ReadinessAgent] Complete -- composite:", a.composite + "% | tier:", readinessTier);
  return { readinessResult };
};

const graph = new StateGraph(ReadinessAgentState)
  .addNode("scoreAggregator",  scoreAggregatorNode)
  .addNode("readinessAnalyzer", readinessAnalyzerNode)
  .addNode("reportAssembler",  reportAssemblerNode)
  .addEdge(START,              "scoreAggregator")
  .addEdge("scoreAggregator",  "readinessAnalyzer")
  .addEdge("readinessAnalyzer", "reportAssembler")
  .addEdge("reportAssembler",  END);

const compiledGraph = graph.compile();

export const runReadinessCalculatorAgent = async (state) => {
  console.log("=== Readiness Calculator Agent Starting ===");
  const t0 = Date.now();
  try {
    const result = await compiledGraph.invoke({
      sessionId:      state.sessionId      || "",
      resumeResult:   state.resumeResult   || null,
      jdResult:       state.jdResult       || null,
      kbResult:       state.kbResult       || state.knowledgeBaseResult || null,
      mockTestResult: state.mockTestResult || null,
      skillGapResult: state.skillGapResult || null,
      roadmapResult:  state.roadmapResult  || null,
      force:          state.force          || false,
    });
    console.log("Readiness Calculator done in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
    return {
      readinessResult: result.readinessResult || {
        success: false,
        error: (result.errors || []).map(e => e.error).join("; ") || "Unknown error",
        errors: result.errors || [],
      },
    };
  } catch (err) {
    console.error("Readiness Calculator fatal:", err.message);
    return { readinessResult: { success: false, error: err.message, errors: [{ node: "graph", error: err.message }] } };
  }
};

export default runReadinessCalculatorAgent;
