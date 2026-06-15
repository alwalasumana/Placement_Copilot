/**
 * Agent 6 -- Roadmap Generator (LangGraph)
 * 4-node StateGraph: roadmapPlanner -> weeklyContentGenerator -> resourceEnhancer -> roadmapFinalizer
 * Respects user-defined preparation timeframe and aligns week count.
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { generateJSON } from "../services/geminiService.js";
import Roadmap from "../models/Roadmap.js";
import JobDescription from "../models/JobDescription.js";

const RoadmapAgentState = Annotation.Root({
  sessionId:        Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  skillGapResult:   Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  resumeResult:     Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  jdResult:         Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  kbResult:         Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  roadmapPlan:      Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  weeklyContent:    Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  enhancedResources: Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  roadmapResult:    Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  force:            Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  errors: Annotation({ reducer: (a, b) => [...(a || []), ...(b || [])], default: () => [] }),
});

// Node 1: Plan roadmap structure
const roadmapPlannerNode = async (state) => {
  const { sessionId } = state;
  console.log("[RoadmapAgent] 1/4 Planning roadmap for session:", sessionId);
  try {
    const existing = await Roadmap.findOne({ sessionId });
    if (!state.force && existing && existing.weeks && existing.weeks.length >= 4) {
      console.log("[RoadmapAgent] 1/4 Cache hit");
      return {
        roadmapResult: {
          success: true, cached: true, totalWeeks: existing.totalWeeks,
          totalDays: existing.totalDays, timeframeUnit: existing.timeframeUnit,
          weeks: existing.weeks, milestones: existing.milestones || [],
          role: existing.role, candidateName: existing.candidateName,
        }
      };
    }
    const sg = state.skillGapResult || {};
    const jd = state.jdResult?.structured || state.jdResult || {};
    const resume = state.resumeResult?.structured || state.resumeResult || {};
    const criticalGaps = sg.criticalGaps || [];
    const moderateGaps = sg.moderateGaps || [];
    const quickWins    = sg.quickWins    || [];
    
    // Load actual JD document from DB to check for user-defined preparation timeframe
    const jdDoc = await JobDescription.findOne({ sessionId });
    const userVal = jdDoc?.preparationTime;
    const unit = jdDoc?.preparationTimeUnit || 'weeks';
    
    const isDayWise = (unit === 'days');
    const totalDays = isDayWise ? Math.max(1, Math.min(userVal || 10, 30)) : 0;
    const weeksToReady = !isDayWise ? Math.max(1, Math.min(userVal || 10, 16)) : Math.max(1, Math.round(totalDays / 7));
    const totalCount = isDayWise ? totalDays : weeksToReady;
    const timeLabel = isDayWise ? "days" : "weeks";

    // Safely compute phase ranges
    let p1Range, p2Range, p3Range;
    let p1End = 1, p2End = 1;
    if (totalCount === 1) {
      p1Range = "1";
      p2Range = "1";
      p3Range = "1";
    } else if (totalCount === 2) {
      p1Range = "1";
      p2Range = "1";
      p3Range = "2";
      p1End = 1;
      p2End = 1;
    } else if (totalCount === 3) {
      p1Range = "1";
      p2Range = "2";
      p3Range = "3";
      p1End = 1;
      p2End = 2;
    } else {
      p1End = Math.max(1, Math.round(totalCount * 0.3));
      p2End = Math.max(p1End + 1, Math.round(totalCount * 0.7));
      if (p2End >= totalCount) {
        p2End = totalCount - 1;
      }
      p1Range = `1-${p1End}`;
      p2Range = `${p1End + 1}-${p2End}`;
      p3Range = `${p2End + 1}-${totalCount}`;
    }
    
    const matchScore   = sg.overallMatchScore || 50;
    const role = state.jdResult?.role || jd.role || "Software Engineer";
    const name = state.resumeResult?.name || resume.personalInfo?.name || "Candidate";
    
    const roadmapPlan = await generateJSON(
      "You are a career coach creating a structured preparation roadmap for a " + name + " targeting the role of " + role + ".\n\n" +
      "SKILL GAP SUMMARY:\n" +
      "- Current match: " + matchScore + "%\n" +
      "- Critical gaps: " + criticalGaps.map(g => g.skill || g).slice(0, 6).join(", ") + "\n" +
      "- Moderate gaps: " + moderateGaps.map(g => g.skill || g).slice(0, 6).join(", ") + "\n" +
      "- Quick wins: " + quickWins.slice(0, 4).join(", ") + "\n" +
      "- Recommended preparation time: " + totalCount + " " + timeLabel + "\n\n" +
      "Return EXACTLY this JSON structure. Set total_weeks or total_days dynamically to " + totalCount + " and adjust the phases (e.g. ranges like '" + p1Range + "', '" + p2Range + "', '" + p3Range + "') and success metrics accordingly. Set timeframe_unit to '" + timeLabel + "':\n" +
      JSON.stringify({
        total_weeks: isDayWise ? Math.max(1, Math.round(totalCount / 7)) : totalCount,
        total_days: isDayWise ? totalCount : null,
        timeframe_unit: timeLabel,
        overall_theme: "From " + matchScore + "% to 80%+ readiness for " + role,
        phases: [
          { phase: 1, name: "Foundation", weeks: p1Range, goal: "Fill critical skill gaps", focus_areas: ["DSA basics", "Core language"] },
          { phase: 2, name: "Development", weeks: p2Range, goal: "Build project portfolio and deepen JD skills", focus_areas: ["Framework mastery", "Projects"] },
          { phase: 3, name: "Interview Prep", weeks: p3Range, goal: "Mock interviews and company-specific prep", focus_areas: ["Mock tests", "System design", "HR prep"] }
        ],
        daily_schedule: { weekday_hours: 3, weekend_hours: 5, morning: "DSA practice (1hr)", afternoon: "Tech skill study (1.5hr)", evening: "Project work / review (0.5hr)" },
        success_metrics: { [isDayWise ? "day_" + p1End : "week_" + p1End]: "Critical gaps filled", [isDayWise ? "day_" + p2End : "week_" + p2End]: "2 projects complete", [isDayWise ? "day_" + totalCount : "week_" + totalCount]: "80%+ mock test score" },
        starting_score: matchScore, target_score: 82,
        hiring_probability_start: sg.hiringProbabilityNow || 30,
        hiring_probability_end: sg.hiringProbabilityPrepared || 75
      }),
      { temperature: 0.3, maxOutputTokens: 3000 }
    );
    console.log("[RoadmapAgent] 1/4 Plan created:", roadmapPlan.total_days || roadmapPlan.total_weeks, timeLabel, (roadmapPlan.phases || []).length, "phases");
    return { roadmapPlan: { ...roadmapPlan, role, name, criticalGaps, moderateGaps, quickWins } };
  } catch (err) {
    console.error("[RoadmapAgent] 1/4 ERROR:", err.message);
    return { errors: [{ node: "roadmapPlanner", error: err.message }] };
  }
};

// Node 2: Generate week-by-week content
const weeklyContentGeneratorNode = async (state) => {
  if (state.roadmapResult?.cached || !state.roadmapPlan) return {};
  if ((state.errors || []).some(e => e.node === "roadmapPlanner")) return {};
  const plan = state.roadmapPlan;
  const isDayWise = plan.timeframe_unit === 'days';
  const totalCount = isDayWise ? plan.total_days : plan.total_weeks;
  const timeLabel = isDayWise ? "days" : "weeks";
  console.log("[RoadmapAgent] 2/4 Generating content for", totalCount, timeLabel + "...");
  try {
    const weeklyContent = await generateJSON(
      isDayWise
        ? "You are an expert technical trainer creating a day-by-day study plan for a candidate targeting: " + plan.role + "\n\n" +
          "ROADMAP PHASES: " + (plan.phases || []).map(p => "Phase " + p.phase + ": " + p.name + " (Day " + p.weeks + ") - " + p.goal).join(" | ") + "\n" +
          "CRITICAL GAPS TO FIX: " + (plan.criticalGaps || []).map(g => g.skill || g).slice(0, 6).join(", ") + "\n" +
          "MODERATE GAPS: " + (plan.moderateGaps || []).map(g => g.skill || g).slice(0, 6).join(", ") + "\n" +
          "QUICK WINS: " + (plan.quickWins || []).slice(0, 4).join(", ") + "\n" +
          "TOTAL DAYS: " + totalCount + "\n\n" +
          "Generate EXACTLY " + totalCount + " daily plan entries under the 'weeks' array. Return this JSON structure. Ensure each entry has: 'week' (day number 1 to " + totalCount + "), 'phase' (string), 'title' (string), 'estimatedHours' (daily study hours, e.g. 2, 3, or 4), 'difficulty' (string), 'topics' (array of strings), 'learningObjectives' (array of strings), 'practiceGoals' (array of strings), and 'resources' (array of objects with 'type' and 'title'). Do NOT include 'dailyPlan' in daily entries.\n" +
          JSON.stringify({
            weeks: [{
              week: 1,
              phase: "Foundation",
              title: "Learn Arrays basics",
              estimatedHours: 3,
              difficulty: "beginner",
              topics: ["Arrays", "Traversal"],
              learningObjectives: ["Understand memory layouts of arrays", "Implement basic array search"],
              practiceGoals: ["Solve two-sum on LeetCode", "Complete 2 simple array drills"],
              resources: [
                { type: "practice", title: "LeetCode Arrays tag" },
                { type: "article", title: "GeeksforGeeks Array Basics" }
              ],
              checkInQuestion: "Can you iterate through an array and find the maximum element?"
            }],
            overall_milestones: [
              { week: Math.round(totalCount * 0.3), milestone: "Critical gaps filled", metric: "Explain basics clearly" },
              { week: totalCount, milestone: "Interview ready", metric: "Complete all preparation" }
            ]
          })
        : "You are an expert technical trainer creating a week-by-week study plan for a candidate targeting: " + plan.role + "\n\n" +
          "ROADMAP PHASES: " + (plan.phases || []).map(p => "Phase " + p.phase + ": " + p.name + " (" + p.weeks + ") - " + p.goal).join(" | ") + "\n" +
          "CRITICAL GAPS TO FIX: " + (plan.criticalGaps || []).map(g => g.skill || g).slice(0, 6).join(", ") + "\n" +
          "MODERATE GAPS: " + (plan.moderateGaps || []).map(g => g.skill || g).slice(0, 6).join(", ") + "\n" +
          "QUICK WINS: " + (plan.quickWins || []).slice(0, 4).join(", ") + "\n" +
          "TOTAL WEEKS: " + totalCount + "\n\n" +
          "Generate EXACTLY " + totalCount + " weekly plan entries. Return this JSON structure. Ensure each weekly entry in the 'weeks' array has: 'week' (number), 'phase' (string), 'title' (string), 'estimatedHours' (number), 'difficulty' (string), 'topics' (array of strings), 'learningObjectives' (array of strings), 'practiceGoals' (array of strings), and 'resources' (array of objects with 'type' and 'title' properties). Do NOT use 'goals', 'milestones', 'estimated_hours', or simple strings for resources. They must match this exact schema:\n" +
          JSON.stringify({
            weeks: [{
              week: 1,
              phase: "Foundation",
              title: "DSA Fundamentals",
              estimatedHours: 20,
              difficulty: "beginner",
              topics: ["Arrays", "Strings", "Two Pointers"],
              learningObjectives: [
                "Master array traversal and string manipulation algorithms",
                "Understand the two-pointer technique for efficient search in lists"
              ],
              practiceGoals: [
                "Solve 10 easy arrays & strings problems on LeetCode",
                "Implement two-sum and reverse-string without using external libraries"
              ],
              dailyPlan: [
                { day: "Day 1 (Mon)", focus: "Arrays basics", tasks: ["Study array operations", "Solve 3 easy array problems"] },
                { day: "Day 2 (Tue)", focus: "String manipulation", tasks: ["Study string methods", "Solve 3 string problems"] },
                { day: "Day 3 (Wed)", focus: "Two pointers", tasks: ["Learn two-pointer technique", "Solve two-sum variants"] },
                { day: "Day 4 (Thu)", focus: "Practice", tasks: ["Solve 5 mixed easy problems", "Review mistakes"] },
                { day: "Day 5 (Fri)", focus: "Deep dive", tasks: ["One medium problem", "Implement from scratch"] },
                { day: "Day 6 (Sat)", focus: "Project / build", tasks: ["Apply skills to mini project", "Document code"] },
                { day: "Day 7 (Sun)", focus: "Revision & rest", tasks: ["Review week notes", "Plan next week"] }
              ],
              resources: [
                { type: "practice", title: "LeetCode Arrays & Strings Tagged Questions" },
                { type: "video", title: "NeetCode Two Pointer Technique Walkthrough" },
                { type: "article", title: "GeeksforGeeks Array & String Basics Guide" }
              ],
              checkInQuestion: "Can you solve two-sum variations in O(n) time and O(n) space?"
            }],
            overall_milestones: [
              { week: 4, milestone: "Critical gaps filled", metric: "Can explain and implement critical skills" },
              { week: 8, milestone: "Portfolio complete", metric: "2+ projects on GitHub" },
              { week: 12, milestone: "Interview ready", metric: "80%+ on mock technical rounds" }
            ]
          }),
      { temperature: 0.4, maxOutputTokens: 3500 }
    );
    console.log("[RoadmapAgent] 2/4 Generated", (weeklyContent.weeks || []).length, "entries");
    return { weeklyContent };
  } catch (err) {
    console.error("[RoadmapAgent] 2/4 ERROR:", err.message);
    return { errors: [{ node: "weeklyContentGenerator", error: err.message }] };
  }
};

// Node 3: Enhance with curated resources
const resourceEnhancerNode = async (state) => {
  if (state.roadmapResult?.cached || !state.weeklyContent) return {};
  const plan = state.roadmapPlan || {};
  console.log("[RoadmapAgent] 3/4 Enhancing with curated resources...");
  try {
    const enhancedResources = await generateJSON(
      "You are a technical education curator. Provide the best free and paid resources for a candidate preparing for: " + (plan.role || "Software Engineer") + "\n\n" +
      "CRITICAL SKILLS TO LEARN: " + (plan.criticalGaps || []).map(g => g.skill || g).slice(0, 8).join(", ") + "\n\n" +
      "Return EXACTLY this JSON:\n" +
      JSON.stringify({
        dsa_resources: [
          { name: "NeetCode 150", type: "problem_set", url: "https://neetcode.io", cost: "free", estimated_hours: 80, difficulty: "beginner_to_advanced" },
          { name: "Strivers A2Z DSA Sheet", type: "problem_set", url: "https://takeuforward.org/strivers-a2z-dsa-course", cost: "free", estimated_hours: 100, difficulty: "beginner_to_advanced" }
        ],
        system_design: [
          { name: "System Design Primer", type: "github_repo", url: "https://github.com/donnemartin/system-design-primer", cost: "free", estimated_hours: 20, difficulty: "intermediate" }
        ],
        technical_skills: [
          { skill: "Python", resources: [{ name: "Python Official Docs", type: "docs", url: "https://docs.python.org", cost: "free" }] }
        ],
        mock_interview: [
          { name: "Pramp", type: "mock_interview_platform", url: "https://pramp.com", cost: "free" },
          { name: "LeetCode Mock", type: "mock_test", url: "https://leetcode.com/interview", cost: "free_tier" }
        ],
        communities: [
          { name: "r/cscareerquestions", type: "reddit", url: "https://reddit.com/r/cscareerquestions" }
        ],
        youtube_channels: [
          { name: "NeetCode", focus: "DSA", url: "https://youtube.com/@NeetCode" },
          { name: "TechWithTim", focus: "Python", url: "https://youtube.com/@TechWithTim" }
        ],
        books: [
          { name: "Cracking the Coding Interview", author: "Gayle McDowell", focus: "interviews", cost: "paid" }
        ]
      }),
      { temperature: 0.2, maxOutputTokens: 3000 }
    );
    console.log("[RoadmapAgent] 3/4 Resources enhanced");
    return { enhancedResources };
  } catch (err) {
    console.error("[RoadmapAgent] 3/4 ERROR:", err.message);
    return { errors: [{ node: "resourceEnhancer", error: err.message }] };
  }
};

// Node 4: Finalize & save roadmap
const roadmapFinalizerNode = async (state) => {
  if (state.roadmapResult?.cached) return {};
  console.log("[RoadmapAgent] 4/4 Finalizing roadmap...");
  const { roadmapPlan: plan, weeklyContent: wc, enhancedResources: er, sessionId } = state;
  const nodeErrors = state.errors || [];
  const p  = plan || {};
  const w  = wc   || {};
  const r  = er   || {};
  const docData = {
    sessionId, role: p.role || "Software Engineer", candidateName: p.name || "Candidate",
    totalWeeks: p.total_weeks || 12, overallTheme: p.overall_theme || "Interview Preparation",
    totalDays: p.total_days || null,
    timeframeUnit: p.timeframe_unit || 'weeks',
    preparationPhases: p.phases || [],
    dailySchedule: p.daily_schedule || {},
    milestones: w.overall_milestones || [],
    successMetrics: p.success_metrics || {},
    weeks: w.weeks || [],
    resources: r,
    startingScore: p.starting_score || 50,
    targetScore: p.target_score || 80,
    hiringProbabilityStart: p.hiring_probability_start || 30,
    hiringProbabilityEnd: p.hiring_probability_end || 75,
    generatedAt: new Date().toISOString(),
    warnings: nodeErrors.map(e => e.error),
  };
  try {
    await Roadmap.findOneAndUpdate({ sessionId }, docData, { upsert: true, new: true });
    console.log("[RoadmapAgent] 4/4 Saved roadmap to MongoDB");
  } catch (dbErr) {
    nodeErrors.push({ node: "roadmapFinalizer", error: "DB save: " + dbErr.message });
  }
  const roadmapResult = {
    success: true, cached: false, ...docData,
    weekCount: (w.weeks || []).length,
  };
  console.log("[RoadmapAgent] Complete --", (w.weeks || []).length, "entries |", p.timeframe_unit, "plan");
  return { roadmapResult };
};

const graph = new StateGraph(RoadmapAgentState)
  .addNode("roadmapPlanner",          roadmapPlannerNode)
  .addNode("weeklyContentGenerator",  weeklyContentGeneratorNode)
  .addNode("resourceEnhancer",        resourceEnhancerNode)
  .addNode("roadmapFinalizer",        roadmapFinalizerNode)
  .addEdge(START,                     "roadmapPlanner")
  .addEdge("roadmapPlanner",          "weeklyContentGenerator")
  .addEdge("weeklyContentGenerator",  "resourceEnhancer")
  .addEdge("resourceEnhancer",        "roadmapFinalizer")
  .addEdge("roadmapFinalizer",        END);

const compiledGraph = graph.compile();

export const runRoadmapGeneratorAgent = async (state) => {
  console.log("=== Roadmap Generator Agent Starting ===");
  const t0 = Date.now();
  try {
    const result = await compiledGraph.invoke({
      sessionId:      state.sessionId      || "",
      skillGapResult: state.skillGapResult || null,
      resumeResult:   state.resumeResult   || null,
      jdResult:       state.jdResult       || null,
      kbResult:       state.kbResult       || state.knowledgeBaseResult || null,
      force:          state.force          || false,
    });
    console.log("Roadmap Generator done in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
    return {
      roadmapResult: result.roadmapResult || {
        success: false,
        error: (result.errors || []).map(e => e.error).join("; ") || "Unknown error",
        errors: result.errors || [],
      },
    };
  } catch (err) {
    console.error("Roadmap Generator fatal:", err.message);
    return { roadmapResult: { success: false, error: err.message, errors: [{ node: "graph", error: err.message }] } };
  }
};

export default runRoadmapGeneratorAgent;
