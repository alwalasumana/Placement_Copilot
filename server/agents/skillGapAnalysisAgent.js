/**
 * Agent 5 -- Skill Gap Analysis (LangGraph)
 * 4-node StateGraph: dataValidator -> skillMatcher -> deepGapAnalyzer -> scoreReporter
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { generateJSON } from "../services/geminiService.js";
import SkillGap from "../models/SkillGap.js";

const SkillGapAgentState = Annotation.Root({
  sessionId:         Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  resumeResult:      Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  jdResult:          Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  kbResult:          Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  validatedData:     Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  skillMatchReport:  Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  deepGapAnalysis:   Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  skillGapResult:    Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  force:             Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  errors: Annotation({ reducer: (a, b) => [...(a || []), ...(b || [])], default: () => [] }),
});

// Node 1: Validate inputs
const dataValidatorNode = async (state) => {
  const { sessionId } = state;
  console.log("[SkillGapAgent] 1/4 Validating input data for session:", sessionId);
  try {
    const existing = await SkillGap.findOne({ sessionId });
    if (!state.force && existing && existing.overallMatchScore !== undefined && existing.overallMatchScore !== null) {
      console.log("[SkillGapAgent] 1/4 Cache hit");
      return {
        skillGapResult: {
          success: true, cached: true,
          overallMatchScore: existing.overallMatchScore,
          criticalGaps: existing.criticalGaps || [],
          strengths: existing.strengths || [],
          readinessLevel: existing.readinessLevel || "unknown",
        }
      };
    }
    const resumeSkills = state.resumeResult?.skills || state.resumeResult?.structured?.allSkills || [];
    const jdRequired   = state.jdResult?.requiredSkills || state.jdResult?.structured?.requiredSkills || [];
    const jdCritical   = state.jdResult?.criticalSkills || state.jdResult?.structured?.criticalSkills || [];
    if (resumeSkills.length === 0 && jdRequired.length === 0) {
      return { errors: [{ node: "dataValidator", error: "Neither resume skills nor JD requirements found. Run Resume and JD agents first." }] };
    }
    const validatedData = {
      resumeSkills:     resumeSkills.map(s => s.toLowerCase().trim()),
      jdRequired:       jdRequired.map(s => s.toLowerCase().trim()),
      jdCritical:       jdCritical.map(s => s.toLowerCase().trim()),
      role:             state.jdResult?.role || state.jdResult?.structured?.role || "Software Engineer",
      name:             state.resumeResult?.name || "Candidate",
      hasKB:            !!(state.kbResult?.success),
      kbTopics:         state.kbResult?.topics || [],
      experience:       (state.resumeResult?.structured?.experience || []).length > 0 ? "experienced" : "fresher",
      education:        (state.resumeResult?.structured?.education || []).map(e => e.degree || "").join("; "),
      certifications:   (state.resumeResult?.structured?.certifications || []).map(c => c.name || ""),
      projectCount:     (state.resumeResult?.structured?.projects || []).length,
    };
    console.log("[SkillGapAgent] 1/4 Validated:", validatedData.resumeSkills.length, "resume skills vs", validatedData.jdRequired.length, "JD skills");
    return { validatedData };
  } catch (err) {
    return { errors: [{ node: "dataValidator", error: err.message }] };
  }
};

const skillsMatch = (skillA, skillB) => {
  const normalize = (s) => {
    if (!s) return "";
    let val = s.toLowerCase().trim();
    if (val.endsWith(".js")) {
      val = val.slice(0, -3);
    } else if (val.endsWith("js") && val !== "javascript" && val.length > 2) {
      val = val.slice(0, -2);
    }
    return val.replace(/[\s\-\/]/g, ""); // keep + and #
  };

  const partsA = skillA.split(/[\/&,]/).map(normalize).filter(Boolean);
  const partsB = skillB.split(/[\/&,]/).map(normalize).filter(Boolean);

  for (const a of partsA) {
    for (const b of partsB) {
      if (a === b) return true;
    }
  }
  return false;
};

// Node 2: Compute skill match
const skillMatcherNode = async (state) => {
  if (state.skillGapResult?.cached || !state.validatedData) return {};
  if ((state.errors || []).some(e => e.node === "dataValidator")) return {};
  const d = state.validatedData;
  console.log("[SkillGapAgent] 2/4 Computing skill match...");
  try {
    const matched    = d.jdRequired.filter(req => d.resumeSkills.some(rs => skillsMatch(rs, req)));
    const missing    = d.jdRequired.filter(req => !d.resumeSkills.some(rs => skillsMatch(rs, req)));
    const critGaps   = d.jdCritical.filter(c  => !d.resumeSkills.some(rs => skillsMatch(rs, c)));
    const extraSkills = d.resumeSkills.filter(rs => !d.jdRequired.some(req => skillsMatch(rs, req)));
    const baseScore = d.jdRequired.length > 0 ? Math.round((matched.length / d.jdRequired.length) * 100) : 50;
    const critPenalty = critGaps.length * 5;
    const certBonus = d.certifications.length * 2;
    const projBonus = Math.min(d.projectCount * 3, 10);
    const overallMatchScore = Math.min(100, Math.max(0, baseScore - critPenalty + certBonus + projBonus));
    const skillMatchReport = {
      overallMatchScore, baseScore, matched, missing, critGaps, extraSkills,
      matchedCount: matched.length, missingCount: missing.length, criticalGapCount: critGaps.length,
      scoreBreakdown: { base: baseScore, critPenalty: -critPenalty, certBonus, projBonus, final: overallMatchScore },
    };
    console.log("[SkillGapAgent] 2/4 Match:", overallMatchScore + "% | Critical gaps:", critGaps.length);
    return { skillMatchReport };
  } catch (err) {
    console.error("[SkillGapAgent] 2/4 ERROR:", err.message);
    return { errors: [{ node: "skillMatcher", error: err.message }] };
  }
};

// Node 3: Deep gap analysis with AI
const deepGapAnalyzerNode = async (state) => {
  if (state.skillGapResult?.cached || !state.skillMatchReport) return {};
  const d  = state.validatedData;
  const sm = state.skillMatchReport;
  console.log("[SkillGapAgent] 3/4 Running deep AI gap analysis...");
  try {
    const deepGapAnalysis = await generateJSON(
      "You are a senior technical recruiter doing a skill gap analysis for a " + d.role + " position.\n\n" +
      "CANDIDATE PROFILE:\n" +
      "- Skills: " + d.resumeSkills.slice(0, 20).join(", ") + "\n" +
      "- Education: " + (d.education || "B.Tech CS") + "\n" +
      "- Experience: " + d.experience + "\n" +
      "- Projects: " + d.projectCount + " projects\n" +
      "- Certifications: " + (d.certifications.slice(0, 5).join(", ") || "None") + "\n\n" +
      "SKILL MATCH ANALYSIS:\n" +
      "- Overall Match: " + sm.overallMatchScore + "%\n" +
      "- Matched Skills: " + sm.matched.slice(0, 10).join(", ") + "\n" +
      "- Missing Required: " + sm.missing.slice(0, 10).join(", ") + "\n" +
      "- Critical Gaps: " + sm.critGaps.join(", ") + "\n" +
      "- Extra Skills: " + sm.extraSkills.slice(0, 8).join(", ") + "\n\n" +
      "Return EXACTLY this JSON:\n" +
      JSON.stringify({
        strengths: [{ skill: "Python", level: "advanced", evidence: "Multiple ML projects", relevance: "high" }],
        critical_gaps: [{ skill: "Kubernetes", severity: "high", why_important: "Core to the role", time_to_learn: "3-4 weeks", priority: 1 }],
        moderate_gaps: [{ skill: "Redis", severity: "medium", why_important: "Nice to have", time_to_learn: "1-2 weeks", priority: 2 }],
        transferable_skills: [{ candidate_skill: "Python data processing", maps_to: "Backend data pipelines", strength: "medium" }],
        quick_wins: ["Add Docker to portfolio", "Take AWS basics course"],
        key_insight: "Strong in core programming, weak on cloud/DevOps side.",
        interview_risk_areas: ["System design questions", "Cloud architecture basics"],
        confidence_boosters: ["Strong project portfolio", "Relevant internship"],
        readiness_level: "developing",
        hiring_probability_now: 35,
        hiring_probability_prepared: 72,
        weeks_to_ready: 10
      }),
      { temperature: 0.3, maxOutputTokens: 2000 }
    );
    console.log("[SkillGapAgent] 3/4 Deep analysis done -- readiness:", deepGapAnalysis.readiness_level);
    return { deepGapAnalysis };
  } catch (err) {
    console.error("[SkillGapAgent] 3/4 ERROR:", err.message);
    return { errors: [{ node: "deepGapAnalyzer", error: err.message }] };
  }
};

// Node 4: Compile final score report & save
const scoreReporterNode = async (state) => {
  if (state.skillGapResult?.cached) return {};
  console.log("[SkillGapAgent] 4/4 Compiling final skill gap report...");
  const { skillMatchReport: sm, deepGapAnalysis: dg, validatedData: d, sessionId } = state;
  const nodeErrors = state.errors || [];
  const matchReport = sm || {};
  const deepAnalysis = dg || {};
  const data = d || {};
  const docData = {
    sessionId, role: data.role || "Software Engineer", candidateName: data.name || "Candidate",
    overallMatchScore: matchReport.overallMatchScore || 0,
    readinessLevel: deepAnalysis.readiness_level || "unknown",
    strengths: deepAnalysis.strengths || [],
    criticalGaps: deepAnalysis.critical_gaps || [],
    moderateGaps: deepAnalysis.moderate_gaps || [],
    transferableSkills: deepAnalysis.transferable_skills || [],
    quickWins: deepAnalysis.quick_wins || [],
    keyInsight: deepAnalysis.key_insight || "",
    interviewRiskAreas: deepAnalysis.interview_risk_areas || [],
    confidenceBoosters: deepAnalysis.confidence_boosters || [],
    hiringProbabilityNow: deepAnalysis.hiring_probability_now || 0,
    hiringProbabilityPrepared: deepAnalysis.hiring_probability_prepared || 0,
    weeksToReady: deepAnalysis.weeks_to_ready || 8,
    matchedSkills: matchReport.matched || [],
    missingSkills: matchReport.missing || [],
    scoreBreakdown: matchReport.scoreBreakdown || {},
    analysisTimestamp: new Date().toISOString(),
    warnings: nodeErrors.map(e => e.error),
  };
  try {
    await SkillGap.findOneAndUpdate({ sessionId }, docData, { upsert: true, new: true });
    console.log("[SkillGapAgent] 4/4 Saved to MongoDB");
  } catch (dbErr) {
    nodeErrors.push({ node: "scoreReporter", error: "DB save: " + dbErr.message });
  }
  const skillGapResult = { success: true, cached: false, ...docData };
  console.log("[SkillGapAgent] Complete -- match:", matchReport.overallMatchScore + "% | readiness:", deepAnalysis.readiness_level);
  return { skillGapResult };
};

const graph = new StateGraph(SkillGapAgentState)
  .addNode("dataValidator",    dataValidatorNode)
  .addNode("skillMatcher",     skillMatcherNode)
  .addNode("deepGapAnalyzer",  deepGapAnalyzerNode)
  .addNode("scoreReporter",    scoreReporterNode)
  .addEdge(START,              "dataValidator")
  .addEdge("dataValidator",    "skillMatcher")
  .addEdge("skillMatcher",     "deepGapAnalyzer")
  .addEdge("deepGapAnalyzer",  "scoreReporter")
  .addEdge("scoreReporter",    END);

const compiledGraph = graph.compile();

export const runSkillGapAnalysisAgent = async (state) => {
  console.log("=== Skill Gap Analysis Agent Starting ===");
  const t0 = Date.now();
  try {
    const result = await compiledGraph.invoke({
      sessionId:    state.sessionId    || "",
      resumeResult: state.resumeResult || null,
      jdResult:     state.jdResult     || null,
      kbResult:     state.kbResult     || state.knowledgeBaseResult || null,
      force:        state.force        || false,
    });
    console.log("Skill Gap Analysis done in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
    return {
      skillGapResult: result.skillGapResult || {
        success: false,
        error: (result.errors || []).map(e => e.error).join("; ") || "Unknown error",
        errors: result.errors || [],
      },
    };
  } catch (err) {
    console.error("Skill Gap Analysis fatal:", err.message);
    return { skillGapResult: { success: false, error: err.message, errors: [{ node: "graph", error: err.message }] } };
  }
};

export default runSkillGapAnalysisAgent;
