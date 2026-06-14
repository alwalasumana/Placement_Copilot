/**
 * Agent 2 -- Resume Analyzer (LangGraph)
 * 4-node StateGraph: resumeLoader -> resumeParser -> skillCategorizer -> finalResumeReport
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { generateJSON } from "../services/geminiService.js";
import Resume from "../models/Resume.js";

const ResumeAgentState = Annotation.Root({
  sessionId:         Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  rawText:           Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  resumeId:          Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  parsedResume:      Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  categorizedSkills: Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  resumeResult:      Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  errors: Annotation({ reducer: (a, b) => [...(a || []), ...(b || [])], default: () => [] }),
});

// Node 1: Load resume from DB
const resumeLoaderNode = async (state) => {
  const { sessionId, force } = state;
  console.log("[ResumeAgent] 1/4 Loading resume for session:", sessionId);
  try {
    const resume = await Resume.findOne({ sessionId });
    if (!resume) {
      return { errors: [{ node: "resumeLoader", error: "No resume found. Upload a resume first." }] };
    }
    if (!force && resume.structured && resume.structured.allSkills && resume.structured.overallScore) {
      console.log("[ResumeAgent] 1/4 Cache hit");
      return {
        resumeId: resume._id.toString(),
        rawText: resume.rawText || "",
        resumeResult: {
          success: true, cached: true,
          structured: resume.structured,
          score: resume.structured.overallScore,
          skills: resume.structured.allSkills || [],
          name: resume.structured.personalInfo?.name || "Candidate",
        },
      };
    }
    console.log("[ResumeAgent] 1/4 Loaded", (resume.rawText || "").length, "chars");
    return { resumeId: resume._id.toString(), rawText: resume.rawText || "" };
  } catch (err) {
    return { errors: [{ node: "resumeLoader", error: err.message }] };
  }
};

// Node 2: Deep parse resume text via Groq
const resumeParserNode = async (state) => {
  if (state.resumeResult?.cached || !state.rawText) return {};
  if ((state.errors || []).some(e => e.node === "resumeLoader")) return {};
  console.log("[ResumeAgent] 2/4 Deep parsing resume...");
  try {
    const parsedResume = await generateJSON(
      "You are an expert resume parser. Extract ALL information from this resume text into structured JSON.\n\nRESUME TEXT:\n\"\"\"\n" +
      state.rawText.substring(0, 6000) +
      "\n\"\"\"\n\nReturn EXACTLY this JSON (use null for missing fields, [] for empty arrays):\n{\n  \"personalInfo\": { \"name\": \"Full Name\", \"email\": \"email@example.com\", \"phone\": null, \"location\": null, \"linkedin\": null, \"github\": null, \"portfolio\": null },\n  \"summary\": null,\n  \"education\": [{ \"degree\": \"B.Tech CS\", \"institution\": \"University\", \"year\": \"2024\", \"cgpa\": null, \"relevant_courses\": [] }],\n  \"experience\": [{ \"title\": \"SWE Intern\", \"company\": \"Company\", \"duration\": \"Jun-Aug 2023\", \"location\": null, \"responsibilities\": [], \"technologies\": [], \"impact\": null }],\n  \"projects\": [{ \"name\": \"Project\", \"description\": \"What it does\", \"technologies\": [], \"link\": null, \"highlights\": [] }],\n  \"skills\": { \"programming_languages\": [], \"frameworks\": [], \"databases\": [], \"tools\": [], \"cloud\": [], \"other\": [] },\n  \"certifications\": [{ \"name\": \"Cert\", \"issuer\": \"Issuer\", \"year\": \"2023\", \"link\": null }],\n  \"achievements\": [],\n  \"languages\": [],\n  \"activities\": []\n}",
      { temperature: 0.1, maxOutputTokens: 2500 }
    );
    console.log("[ResumeAgent] 2/4 Parsed", Object.keys(parsedResume).length, "sections");
    return { parsedResume };
  } catch (err) {
    console.error("[ResumeAgent] 2/4 ERROR:", err.message);
    return { errors: [{ node: "resumeParser", error: err.message }] };
  }
};

// Node 3: Categorize & score skills
const skillCategorizerNode = async (state) => {
  if (state.resumeResult?.cached || !state.parsedResume) return {};
  console.log("[ResumeAgent] 3/4 Categorizing skills...");
  try {
    const p = state.parsedResume;
    const allSkills = [
      ...(p.skills?.programming_languages || []),
      ...(p.skills?.frameworks || []),
      ...(p.skills?.databases || []),
      ...(p.skills?.tools || []),
      ...(p.skills?.cloud || []),
      ...(p.skills?.other || []),
    ];
    const educationSummary = (p.education || []).map(e => `${e.degree} from ${e.institution} (${e.year})`).join("; ");
    const experienceSummary = (p.experience || []).length > 0
      ? (p.experience || []).map(e => `${e.title} at ${e.company}`).join("; ")
      : "No work experience (fresher)";
    const categorizedSkills = await generateJSON(
      "You are a senior technical recruiter evaluating a candidate resume.\n\nCANDIDATE PROFILE:\n- Education: " + educationSummary + "\n- Experience: " + experienceSummary + "\n- All skills: " + allSkills.join(", ") + "\n- Projects: " + (p.projects || []).length + " projects\n- Certifications: " + (p.certifications || []).map(c => c.name).join(", ") + "\n\nReturn EXACTLY this JSON:\n{\n  \"technical\": { \"core_languages\": [{\"skill\":\"Python\",\"proficiency\":\"advanced\",\"confidence\":85}], \"frameworks_libraries\": [], \"databases\": [], \"devops_tools\": [], \"cloud_platforms\": [] },\n  \"domain_knowledge\": [\"Web Development\"],\n  \"soft_skills\": [\"Problem Solving\"],\n  \"standout_skills\": [\"Python\"],\n  \"skill_gaps_visible\": [\"No cloud certification\"],\n  \"ats_keywords\": [\"REST API\",\"CI/CD\",\"Agile\"],\n  \"resume_quality\": { \"ats_score\": 72, \"format_score\": 80, \"completeness_score\": 75, \"has_summary\": true, \"has_quantified_achievements\": false, \"has_action_verbs\": true, \"keyword_density\": \"medium\", \"improvements\": [\"Add quantified metrics\",\"Add LinkedIn URL\"] }\n}",
      { temperature: 0.1, maxOutputTokens: 3000 }
    );
    console.log("[ResumeAgent] 3/4 Categorized", allSkills.length, "skills, ATS:", categorizedSkills.resume_quality?.ats_score);
    return { categorizedSkills };
  } catch (err) {
    console.error("[ResumeAgent] 3/4 ERROR:", err.message);
    return { errors: [{ node: "skillCategorizer", error: err.message }] };
  }
};

// Node 4: Assemble final report & save to DB
const finalResumeReportNode = async (state) => {
  if (state.resumeResult?.cached) return {};
  console.log("[ResumeAgent] 4/4 Assembling final report...");
  const { parsedResume, categorizedSkills, sessionId, resumeId } = state;
  const nodeErrors = state.errors || [];
  const p = parsedResume || {};
  const allSkills = [
    ...(p.skills?.programming_languages || []),
    ...(p.skills?.frameworks || []),
    ...(p.skills?.databases || []),
    ...(p.skills?.tools || []),
    ...(p.skills?.cloud || []),
    ...(p.skills?.other || []),
  ];
  const atsScore = categorizedSkills?.resume_quality?.ats_score || 50;
  const structured = {
    personalInfo: p.personalInfo || {},
    summary: p.summary || null,
    education: p.education || [],
    experience: p.experience || [],
    projects: p.projects || [],
    skills: p.skills || {},
    certifications: p.certifications || [],
    achievements: p.achievements || [],
    languages: p.languages || [],
    activities: p.activities || [],
    categorizedSkills: categorizedSkills || null,
    allSkills,
    overallScore: atsScore,
    resumeStrength: atsScore >= 80 ? "strong" : atsScore >= 65 ? "moderate" : atsScore >= 50 ? "developing" : "weak",
    analysisTimestamp: new Date().toISOString(),
  };
  try {
    if (resumeId) {
      await Resume.findByIdAndUpdate(resumeId, { structured, analyzedAt: new Date(), skillCount: allSkills.length });
      console.log("[ResumeAgent] 4/4 Saved to MongoDB");
    }
  } catch (dbErr) {
    nodeErrors.push({ node: "finalResumeReport", error: "DB save failed: " + dbErr.message });
  }
  const resumeResult = {
    success: true, cached: false, sessionId, structured,
    score: atsScore, skills: allSkills, skillCount: allSkills.length,
    name: p.personalInfo?.name || "Candidate",
    warnings: nodeErrors.map(e => e.error),
  };
  console.log("[ResumeAgent] Complete -- ATS score:", atsScore, "skills:", allSkills.length);
  return { resumeResult };
};

const graph = new StateGraph(ResumeAgentState)
  .addNode("resumeLoader",      resumeLoaderNode)
  .addNode("resumeParser",      resumeParserNode)
  .addNode("skillCategorizer",  skillCategorizerNode)
  .addNode("finalResumeReport", finalResumeReportNode)
  .addEdge(START, "resumeLoader")
  .addEdge("resumeLoader",      "resumeParser")
  .addEdge("resumeParser",      "skillCategorizer")
  .addEdge("skillCategorizer",  "finalResumeReport")
  .addEdge("finalResumeReport", END);

const compiledGraph = graph.compile();

export const runResumeAnalyzerAgent = async (state) => {
  console.log("=== Resume Analyzer Agent Starting ===");
  const t0 = Date.now();
  try {
    const result = await compiledGraph.invoke({
      sessionId: state.sessionId || "",
      force: state.force || false,
    });
    console.log("Resume Analyzer Agent done in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
    return {
      resumeResult: result.resumeResult || {
        success: false,
        error: (result.errors || []).map(e => e.error).join("; ") || "Unknown error",
        errors: result.errors || [],
      },
    };
  } catch (err) {
    console.error("Resume Analyzer Agent fatal:", err.message);
    return { resumeResult: { success: false, error: err.message, errors: [{ node: "graph", error: err.message }] } };
  }
};

export default runResumeAnalyzerAgent;
