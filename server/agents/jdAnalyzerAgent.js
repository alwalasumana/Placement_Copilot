/**
 * Agent 3 -- JD Analyzer (LangGraph)
 * 4-node StateGraph: jdLoader -> jdParser -> requirementsAnalyzer -> finalJDReport
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { generateJSON } from "../services/geminiService.js";
import JobDescription from "../models/JobDescription.js";

const JDAgentState = Annotation.Root({
  sessionId:          Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  rawText:            Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  jdId:               Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  parsedJD:           Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  rankedRequirements: Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  jdResult:           Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  errors: Annotation({ reducer: (a, b) => [...(a || []), ...(b || [])], default: () => [] }),
});

// Node 1: Load JD from DB
const jdLoaderNode = async (state) => {
  const { sessionId, force } = state;
  console.log("[JDAgent] 1/4 Loading JD for session:", sessionId);
  try {
    const jd = await JobDescription.findOne({ sessionId });
    if (!jd) {
      return { errors: [{ node: "jdLoader", error: "No job description found. Upload a JD first." }] };
    }
    if (!force && jd.structured && jd.structured.requiredSkills && jd.structured.requiredSkills.length > 0 && jd.structured.interviewTopics) {
      console.log("[JDAgent] 1/4 Cache hit");
      return {
        jdId: jd._id.toString(), rawText: jd.rawText || "",
        jdResult: {
          success: true, cached: true, structured: jd.structured,
          role: jd.structured.role || "Unknown",
          requiredSkills: jd.structured.requiredSkills || [],
          interviewTopics: jd.structured.interviewTopics || [],
        },
      };
    }
    console.log("[JDAgent] 1/4 Loaded", (jd.rawText || "").length, "chars");
    return { jdId: jd._id.toString(), rawText: jd.rawText || "" };
  } catch (err) {
    return { errors: [{ node: "jdLoader", error: err.message }] };
  }
};

// Node 2: Parse JD text
const jdParserNode = async (state) => {
  if (state.jdResult?.cached || !state.rawText) return {};
  if ((state.errors || []).some(e => e.node === "jdLoader")) return {};
  console.log("[JDAgent] 2/4 Parsing job description...");
  try {
    const parsedJD = await generateJSON(
      "You are an expert job description analyst. Extract ALL relevant information from this JD.\n\nJD TEXT:\n\"\"\"\n" +
      state.rawText.substring(0, 6000) +
      "\n\"\"\"\n\nReturn EXACTLY this JSON (use null for missing, [] for empty arrays):\n" +
      JSON.stringify({
        role: "Software Engineer", company: null, location: null,
        employment_type: "Full-time", experience_required: "Fresher",
        package: null, about_company: null, role_summary: "Brief role description",
        required_skills: { programming_languages: [], frameworks: [], databases: [], tools: [], cloud: [], concepts: [], other: [] },
        preferred_skills: [], responsibilities: [], qualifications: { education: "B.Tech CS", min_cgpa: null, graduation_year: null, branches: [], certifications_preferred: [] },
        selection_process: [], perks: [], keywords: []
      }),
      { temperature: 0.1, maxOutputTokens: 2500 }
    );
    console.log("[JDAgent] 2/4 Parsed role:", parsedJD.role);
    return { parsedJD };
  } catch (err) {
    console.error("[JDAgent] 2/4 ERROR:", err.message);
    return { errors: [{ node: "jdParser", error: err.message }] };
  }
};

// Node 3: Rank requirements & predict interview topics
const requirementsAnalyzerNode = async (state) => {
  if (state.jdResult?.cached || !state.parsedJD) return {};
  console.log("[JDAgent] 3/4 Ranking requirements & predicting interview topics...");
  try {
    const jd = state.parsedJD;
    const allRequired = [
      ...(jd.required_skills?.programming_languages || []),
      ...(jd.required_skills?.frameworks || []),
      ...(jd.required_skills?.databases || []),
      ...(jd.required_skills?.tools || []),
      ...(jd.required_skills?.cloud || []),
      ...(jd.required_skills?.concepts || []),
      ...(jd.required_skills?.other || []),
    ];
    const rankedRequirements = await generateJSON(
      "You are a senior technical recruiter analyzing a job description for \"" + jd.role + "\" at \"" + (jd.company || "a company") + "\".\n\n" +
      "JOB DETAILS:\n- Role: " + jd.role + "\n- Experience: " + (jd.experience_required || "Fresher") + "\n- Required Skills: " + allRequired.join(", ") + "\n- Preferred Skills: " + (jd.preferred_skills || []).join(", ") + "\n- Selection Process: " + (jd.selection_process || []).join(" -> ") + "\n\n" +
      "Return EXACTLY this JSON:\n" +
      JSON.stringify({
        skill_priority: {
          critical: [{ skill: "Java", reason: "Core language", weight: 95 }],
          important: [{ skill: "Spring Boot", reason: "Primary framework", weight: 75 }],
          nice_to_have: [{ skill: "Kubernetes", reason: "Preferred", weight: 40 }]
        },
        hidden_requirements: ["Strong DSA implied", "Communication skills needed"],
        interview_topics: [
          { topic: "Data Structures & Algorithms", probability: 95, subtopics: ["Arrays", "Trees", "DP"], likely_format: "Online coding test" },
          { topic: "Core Language Concepts", probability: 90, subtopics: ["OOP", "Collections", "Multithreading"], likely_format: "Technical interview" },
          { topic: "Database & SQL", probability: 80, subtopics: ["Joins", "Indexes", "Transactions"], likely_format: "Technical interview" },
          { topic: "HR & Behavioral", probability: 100, subtopics: ["Why this company", "Strengths", "Situational"], likely_format: "HR round" }
        ],
        minimum_viable_skills: ["Java", "Data Structures", "SQL", "Git"],
        role_difficulty: "medium",
        preparation_timeline: "8-12 weeks for a fresher",
        role_insights: "Focus on DSA fundamentals and the required tech stack."
      }),
      { temperature: 0.2, maxOutputTokens: 3000 }
    );
    console.log("[JDAgent] 3/4 Analyzed", (rankedRequirements.interview_topics || []).length, "interview topics");
    return { rankedRequirements };
  } catch (err) {
    console.error("[JDAgent] 3/4 ERROR:", err.message);
    return { errors: [{ node: "requirementsAnalyzer", error: err.message }] };
  }
};

// Node 4: Assemble final JD report & save
const finalJDReportNode = async (state) => {
  if (state.jdResult?.cached) return {};
  console.log("[JDAgent] 4/4 Assembling final JD report...");
  const { parsedJD, rankedRequirements, sessionId, jdId } = state;
  const nodeErrors = state.errors || [];
  const jd = parsedJD || {};
  const rr = rankedRequirements || {};
  const allRequired = [
    ...(jd.required_skills?.programming_languages || []),
    ...(jd.required_skills?.frameworks || []),
    ...(jd.required_skills?.databases || []),
    ...(jd.required_skills?.tools || []),
    ...(jd.required_skills?.cloud || []),
    ...(jd.required_skills?.concepts || []),
    ...(jd.required_skills?.other || []),
  ];
  const structured = {
    ...jd, rankedRequirements: rr,
    requiredSkills: allRequired,
    criticalSkills: (rr.skill_priority?.critical || []).map(s => s.skill),
    importantSkills: (rr.skill_priority?.important || []).map(s => s.skill),
    interviewTopics: rr.interview_topics || [],
    minViableSkills: rr.minimum_viable_skills || [],
    hiddenRequirements: rr.hidden_requirements || [],
    prepTimeline: rr.preparation_timeline || "8 weeks",
    roleDifficulty: rr.role_difficulty || "medium",
    analysisTimestamp: new Date().toISOString(),
  };
  try {
    if (jdId) {
      await JobDescription.findByIdAndUpdate(jdId, { structured, analyzedAt: new Date(), skillCount: allRequired.length });
      console.log("[JDAgent] 4/4 Saved to MongoDB");
    }
  } catch (dbErr) {
    nodeErrors.push({ node: "finalJDReport", error: "DB save: " + dbErr.message });
  }
  const jdResult = {
    success: true, cached: false, sessionId, structured,
    role: jd.role || "Unknown Role", company: jd.company || null,
    requiredSkills: allRequired, criticalSkills: structured.criticalSkills,
    interviewTopics: structured.interviewTopics, skillCount: allRequired.length,
    warnings: nodeErrors.map(e => e.error),
  };
  console.log("[JDAgent] Complete -- role:", jd.role, "| required skills:", allRequired.length);
  return { jdResult };
};

const graph = new StateGraph(JDAgentState)
  .addNode("jdLoader",             jdLoaderNode)
  .addNode("jdParser",             jdParserNode)
  .addNode("requirementsAnalyzer", requirementsAnalyzerNode)
  .addNode("finalJDReport",        finalJDReportNode)
  .addEdge(START,                  "jdLoader")
  .addEdge("jdLoader",             "jdParser")
  .addEdge("jdParser",             "requirementsAnalyzer")
  .addEdge("requirementsAnalyzer", "finalJDReport")
  .addEdge("finalJDReport",        END);

const compiledGraph = graph.compile();

export const runJDAnalyzerAgent = async (state) => {
  console.log("=== JD Analyzer Agent Starting ===");
  const t0 = Date.now();
  try {
    const result = await compiledGraph.invoke({
      sessionId: state.sessionId || "",
      force: state.force || false,
    });
    console.log("JD Analyzer Agent done in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
    return {
      jdResult: result.jdResult || {
        success: false,
        error: (result.errors || []).map(e => e.error).join("; ") || "Unknown error",
        errors: result.errors || [],
      },
    };
  } catch (err) {
    console.error("JD Analyzer Agent fatal:", err.message);
    return { jdResult: { success: false, error: err.message, errors: [{ node: "graph", error: err.message }] } };
  }
};

export default runJDAnalyzerAgent;
