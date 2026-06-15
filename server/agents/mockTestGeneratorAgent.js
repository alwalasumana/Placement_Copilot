/**
 * Agent 4 -- Mock Test Generator (LangGraph)
 * 4-node StateGraph: contextAssembler -> mcqAptitudeGenerator -> codingHRGenerator -> testAssembler
 * Generates custom test based on user-supplied options (count, difficulty, formats, topics)
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { generateJSON } from "../services/geminiService.js";
import MockTest from "../models/MockTest.js";
import { v4 as uuidv4 } from 'uuid';
import { multiQuery } from "../services/chromaService.js";

// Helper function to distribute total question count across requested categories
export const distributeQuestions = (numQuestions, selectedTypes) => {
  const counts = {
    technical_mcq: 0,
    aptitude_mcq: 0,
    coding: 0,
    technical_conceptual: 0,
    hr_behavioral: 0
  };
  
  if (!selectedTypes || selectedTypes.length === 0) {
    selectedTypes = ['mcq', 'typing', 'coding'];
  }
  
  let remaining = numQuestions;
  let categoryIdx = 0;
  
  let mcqSubIdx = 0;
  let typingSubIdx = 0;
  
  while (remaining > 0) {
    const cat = selectedTypes[categoryIdx % selectedTypes.length];
    if (cat === 'mcq') {
      // 70% tech_mcq, 30% apt_mcq (out of every 3 MCQs, 2 are technical_mcq, 1 is aptitude_mcq)
      if (mcqSubIdx % 3 < 2) {
        counts.technical_mcq++;
      } else {
        counts.aptitude_mcq++;
      }
      mcqSubIdx++;
    } else if (cat === 'typing') {
      // 50% tech_conceptual, 50% hr_behavioral
      if (typingSubIdx % 2 === 0) {
        counts.technical_conceptual++;
      } else {
        counts.hr_behavioral++;
      }
      typingSubIdx++;
    } else if (cat === 'coding') {
      counts.coding++;
    }
    remaining--;
    categoryIdx++;
  }
  
  return counts;
};

const MockTestAgentState = Annotation.Root({
  sessionId:           Annotation({ reducer: (_, b) => b ?? _, default: () => "" }),
  kbResult:            Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  resumeResult:        Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  jdResult:            Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  testContext:         Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  mcqAptitudeSection:  Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  codingHRSection:     Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  mockTestResult:      Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  force:               Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  customOptions:       Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  errors: Annotation({ reducer: (a, b) => [...(a || []), ...(b || [])], default: () => [] }),
});

// Node 1: Assemble context from prior agent results
const contextAssemblerNode = async (state) => {
  const { sessionId } = state;
  console.log("[MockTestAgent] 1/4 Assembling context for session:", sessionId);
  try {
    const existing = await MockTest.findOne({ sessionId });
    // Bypass cache check if customOptions are provided so a fresh custom test is generated
    if (!state.force && !state.customOptions && existing && existing.allQuestions && existing.allQuestions.length >= 20 && existing.sections && existing.sections.mcqs) {
      console.log("[MockTestAgent] 1/4 Cache hit");
      let finalTestId = existing.testId;
      if (!finalTestId) {
        finalTestId = uuidv4();
        existing.testId = finalTestId;
        if (!existing.title) {
          const _c = existing.company; const _r = existing.role || "Software Engineer";
          existing.title = _c ? `Mock Test for ${_c} - ${_r}` : `Mock Test for ${_r}`;
        }
        await existing.save();
      }
      return {
        mockTestResult: {
          success: true,
          cached: true,
          testId: finalTestId,
          testMongoId: existing._id.toString(),
          title: existing.title || `Mock Test for ${existing.role || "Software Engineer"}`,
          sections: existing.sections, 
          allQuestions: existing.allQuestions, 
          totalQuestions: existing.totalQuestions 
        } 
      };
    }
    const resume = state.resumeResult?.structured || {};
    const jd = state.jdResult?.structured || {};
    const kb = state.kbResult || state.knowledgeBaseResult || {};
    const skills = state.resumeResult?.skills || resume.allSkills || [];
    const requiredSkills = state.jdResult?.requiredSkills || jd.requiredSkills || [];
    const criticalSkills = state.jdResult?.criticalSkills || jd.criticalSkills || requiredSkills.slice(0, 5);
    const role = state.jdResult?.role || jd.role || "Software Engineer";
    const name = state.resumeResult?.name || resume.personalInfo?.name || "Candidate";
    const interviewTopics = state.jdResult?.interviewTopics || jd.interviewTopics || [];

    const kbInfo = {
      importantTopics: kb.importantTopics || kb.extractedData?.importantTopics || [],
      repeatedQuestions: kb.repeatedQuestions || kb.extractedData?.repeatedQuestions || [],
      codingPatterns: kb.codingPatterns || kb.extractedData?.codingPatterns || [],
      oaPatterns: kb.oaPatterns || kb.extractedData?.oaPatterns || [],
      technologies: kb.technologies || kb.frequentTechnologies || kb.extractedData?.frequentTechnologies || [],
    };

    // Query ChromaDB for actual relevant company extracts based on JD critical skills and role
    let retrievedKBChunks = [];
    if (kb.hasKnowledgeBase || kb.success) {
      try {
        const queryTerms = [...criticalSkills, role].slice(0, 5);
        console.log("[MockTestAgent] Querying ChromaDB for knowledge base using terms:", queryTerms);
        const searchResults = await multiQuery(queryTerms, 'knowledge', sessionId, 3);
        const docs = searchResults.documents || [];
        const metas = searchResults.metadatas || [];
        retrievedKBChunks = docs.map((doc, idx) => ({
          content: doc,
          fileName: metas[idx]?.fileName || "Knowledge Base"
        }));
      } catch (searchErr) {
        console.warn("[MockTestAgent] ChromaDB query skipped:", searchErr.message);
      }
    }

    const testContext = {
      role, name, skills, requiredSkills, criticalSkills,
      topicsToTest: state.customOptions?.topics && state.customOptions.topics.length > 0
        ? state.customOptions.topics
        : interviewTopics.slice(0, 6).map(t => t.topic || t),
      hasKnowledge: kb.hasKnowledgeBase || (kb.chunks || kb.totalChunks || 0) > 0,
      education: (resume.education || []).map(e => e.degree + " from " + e.institution).join("; "),
      experience: (resume.experience || []).length > 0 ? "Has internship/work experience" : "Fresher",
      kbInfo,
      kbChunks: retrievedKBChunks.slice(0, 8),
    };
    console.log("[MockTestAgent] 1/4 Context assembled -- role:", role, "| skills:", skills.length, "| KB chunks retrieved:", retrievedKBChunks.length);
    return { testContext };
  } catch (err) {
    return { errors: [{ node: "contextAssembler", error: err.message }] };
  }
};

// Node 2: Generate Tech MCQ + Aptitude questions
const mcqAptitudeGeneratorNode = async (state) => {
  if (state.mockTestResult?.cached || !state.testContext) return {};
  if ((state.errors || []).some(e => e.node === "contextAssembler")) return {};
  
  const ctx = state.testContext;
  const customOptions = state.customOptions || {};
  const numQuestions = customOptions.numQuestions || 15;
  const difficulty = customOptions.difficulty || 'medium';
  const questionTypes = customOptions.questionTypes || ['mcq', 'typing', 'coding'];
  const counts = distributeQuestions(numQuestions, questionTypes);

  // If no MCQs or Aptitude are requested, bypass node
  if (counts.technical_mcq === 0 && counts.aptitude_mcq === 0) {
    return { mcqAptitudeSection: { technical_mcq: [], aptitude_mcq: [] } };
  }

  console.log(`[MockTestAgent] 2/4 Generating MCQ (${counts.technical_mcq} tech, ${counts.aptitude_mcq} apt) at ${difficulty} level...`);
  try {
    const targetTopics = state.customOptions?.topics || [];
    const topicsConstraint = targetTopics.length > 0
      ? `CRITICAL INSTRUCTION: You MUST generate technical questions ONLY for the following selected topics: ${targetTopics.join(", ")}. Do NOT generate questions on any other technologies, frameworks, or skills.\n\n`
      : "";

    const mcqAptitudeSection = await generateJSON(
      "You are an expert technical interviewer creating a placement test for a " + ctx.role + " role. " +
      "The target difficulty level for all questions MUST be strictly: " + difficulty.toUpperCase() + ".\n\n" +
      topicsConstraint +
      "CANDIDATE: Skills: " + ctx.skills.slice(0, 15).join(", ") + " | Education: " + (ctx.education || "B.Tech CS") + "\n" +
      "JD REQUIREMENTS: Required: " + ctx.requiredSkills.slice(0, 10).join(", ") + " | Critical: " + ctx.criticalSkills.slice(0, 5).join(", ") + "\n" +
      "TOPICS TO COVER: " + ctx.topicsToTest.slice(0, 6).join(", ") + "\n\n" +
      (ctx.kbInfo?.importantTopics?.length > 0 ? "COMPANY KNOWLEDGE BASE TOPICS: " + ctx.kbInfo.importantTopics.join(", ") + "\n" : "") +
      (ctx.kbInfo?.repeatedQuestions?.length > 0 ? "COMPANY PREVIOUS REPEATED QUESTIONS/TOPICS: " + ctx.kbInfo.repeatedQuestions.slice(0, 10).join("; ") + "\n" : "") +
      (ctx.kbChunks?.length > 0 ? "COMPANY KNOWLEDGE BASE EXTRACTS:\n" + ctx.kbChunks.map((c, i) => `Snippet ${i+1} (from file: ${c.fileName}): ${c.content}`).join("\n") + "\n\n" : "") +
      "UNIQUE SEED: " + Math.random().toString(36).substring(7) + "\n" +
      "IMPORTANT: You MUST align technical questions directly with the critical skills from the JD AND base them on the topics, repeated questions, patterns, and context retrieved from the uploaded company Knowledge Base materials. Avoid general questions; ground them in the provided extracts and JD requirements.\n\n" +
      "For each question, you MUST include a 'source' property. For technical MCQs: if grounded in a Knowledge Base snippet, set 'source' to 'Knowledge Base: [fileName]'. If based on a JD critical skill or required skill, set 'source' to 'Job Description: [skillName]'. Otherwise, set it to 'Job Description'. For aptitude MCQs, set 'source' to 'Aptitude'.\n\n" +
      "Generate EXACTLY " + (counts.technical_mcq + counts.aptitude_mcq) + " questions:\n" +
      "- EXACTLY " + counts.technical_mcq + " technical MCQ (testing JD requirements and grounded in the retrieved company materials, difficulty: " + difficulty + ")\n" +
      "- EXACTLY " + counts.aptitude_mcq + " logical reasoning / aptitude MCQ (difficulty: " + difficulty + ")\n\n" +
      "Return this JSON structure containing exactly " + counts.technical_mcq + " technical_mcq and " + counts.aptitude_mcq + " aptitude_mcq questions:\n" +
      JSON.stringify({
        technical_mcq: [{
          id: "t1", question: "What is the time complexity of binary search?",
          options: { A: "O(n)", B: "O(log n)", C: "O(n log n)", D: "O(1)" },
          correct_answer: "B", explanation: "Binary search halves the search space each step.",
          difficulty: difficulty, topic: "Data Structures", skill_tested: "DSA",
          source: "Knowledge Base: dsa_notes.pdf"
        }],
        aptitude_mcq: [{
          id: "a1", question: "If 6 men can do a job in 10 days, how many days will 4 men take?",
          options: { A: "12", B: "15", C: "18", D: "20" },
          correct_answer: "B", explanation: "6x10 = 60 man-days / 4 = 15 days.",
          difficulty: difficulty, topic: "Time and Work", skill_tested: "Logical Reasoning",
          source: "Aptitude"
        }]
      }),
      { temperature: 0.4, maxOutputTokens: 4000 }
    );
    const techCount = (mcqAptitudeSection.technical_mcq || []).length;
    const aptCount = (mcqAptitudeSection.aptitude_mcq || []).length;
    console.log("[MockTestAgent] 2/4 Generated", techCount, "tech MCQ +", aptCount, "aptitude");
    return { mcqAptitudeSection };
  } catch (err) {
    console.error("[MockTestAgent] 2/4 ERROR:", err.message);
    return { errors: [{ node: "mcqAptitudeGenerator", error: err.message }] };
  }
};

// Node 3: Generate Coding + Technical Conceptual + HR questions
const codingHRGeneratorNode = async (state) => {
  if (state.mockTestResult?.cached || !state.testContext) return {};
  
  const ctx = state.testContext;
  const customOptions = state.customOptions || {};
  const numQuestions = customOptions.numQuestions || 15;
  const difficulty = customOptions.difficulty || 'medium';
  const questionTypes = customOptions.questionTypes || ['mcq', 'typing', 'coding'];
  const counts = distributeQuestions(numQuestions, questionTypes);

  // If no coding, conceptual, or HR questions are requested, bypass node
  if (counts.coding === 0 && counts.technical_conceptual === 0 && counts.hr_behavioral === 0) {
    return { codingHRSection: { coding: [], technical_conceptual: [], hr_behavioral: [] } };
  }

  console.log(`[MockTestAgent] 3/4 Generating coding/conceptual/HR (${counts.coding} coding, ${counts.technical_conceptual} tech, ${counts.hr_behavioral} HR) at ${difficulty} level...`);
  try {
    const targetTopics = state.customOptions?.topics || [];
    const topicsConstraint = targetTopics.length > 0
      ? `CRITICAL INSTRUCTION: You MUST generate coding and technical conceptual questions ONLY for the following selected topics: ${targetTopics.join(", ")}. Do NOT generate questions on any other technologies, frameworks, or skills.\n\n`
      : "";

    const codingHRSection = await generateJSON(
      "You are an expert technical interviewer creating advanced questions for a " + ctx.role + " candidate. " +
      "The target difficulty level for all questions MUST be strictly: " + difficulty.toUpperCase() + ".\n\n" +
      topicsConstraint +
      "CANDIDATE SKILLS: " + ctx.skills.slice(0, 12).join(", ") + "\n" +
      "CRITICAL SKILLS FROM JD: " + ctx.criticalSkills.slice(0, 5).join(", ") + "\n" +
      "TOPICS TO COVER: " + ctx.topicsToTest.slice(0, 6).join(", ") + "\n\n" +
      "EXPERIENCE LEVEL: " + (ctx.experience || "Fresher") + "\n\n" +
      (ctx.kbInfo?.codingPatterns?.length > 0 ? "COMPANY CODING/OA PATTERNS: " + ctx.kbInfo.codingPatterns.join(", ") + "\n" : "") +
      (ctx.kbInfo?.oaPatterns?.length > 0 ? "COMPANY ONLINE ASSESSMENT PATTERNS: " + ctx.kbInfo.oaPatterns.join(", ") + "\n" : "") +
      (ctx.kbChunks?.length > 0 ? "COMPANY KNOWLEDGE BASE EXTRACTS:\n" + ctx.kbChunks.map((c, i) => `Snippet ${i+1} (from file: ${c.fileName}): ${c.content}`).join("\n") + "\n\n" : "") +
      "UNIQUE SEED: " + Math.random().toString(36).substring(7) + "\n" +
      "IMPORTANT: You MUST ground coding questions in the coding patterns, OA patterns, and repeated problems from the uploaded company Knowledge Base extracts. Align technical conceptual questions with critical skills from the JD and retrieved material.\n\n" +
      "For each question, you MUST include a 'source' property. For coding: if grounded in a Knowledge Base snippet, set 'source' to 'Knowledge Base: [fileName]'. If based on a JD requirement, set 'source' to 'Job Description: [codingRequirement]'. Otherwise, set it to 'Job Description'. For technical conceptual: if grounded in Knowledge Base, set 'source' to 'Knowledge Base: [fileName]'. If based on JD critical skill, set 'source' to 'Job Description: [skillName]'. For HR behavioral, set 'source' to 'HR Behavioral'.\n\n" +
      "Generate EXACTLY " + (counts.coding + counts.technical_conceptual + counts.hr_behavioral) + " questions:\n" +
      "- EXACTLY " + counts.coding + " coding problems (LeetCode-style, difficulty: " + difficulty + ", grounded in company OA patterns)\n" +
      "- EXACTLY " + counts.technical_conceptual + " technical conceptual typing/short-answer questions (difficulty: " + difficulty + ", explain concepts, system design, best practices)\n" +
      "- EXACTLY " + counts.hr_behavioral + " HR behavioral typing/situational questions (competency-based)\n\n" +
      "Return this JSON structure containing exactly " + counts.coding + " coding, " + counts.technical_conceptual + " technical_conceptual, and " + counts.hr_behavioral + " hr_behavioral questions:\n" +
      JSON.stringify({
        coding: [{
          id: "c1", question: "Write a function to reverse a linked list.",
          difficulty: difficulty, topic: "Linked Lists", skill_tested: "DSA",
          hints: ["Think about iterative vs recursive approach"],
          expected_approach: "Iterative with prev/curr/next pointers",
          time_complexity: "O(n)", space_complexity: "O(1)",
          sample_input: "1->2->3->4->5", sample_output: "5->4->3->2->1",
          source: "Knowledge Base: coding_patterns.pdf"
        }],
        technical_conceptual: [{
          id: "tc1", question: "Explain the difference between SQL and NoSQL databases.",
          difficulty: difficulty, topic: "Databases", skill_tested: "Database Knowledge",
          key_points: ["ACID vs BASE", "Schema flexibility", "Horizontal vs vertical scaling"],
          ideal_answer_length: "2-3 paragraphs", follow_up: "When would you choose MongoDB over PostgreSQL?",
          source: "Job Description: database knowledge"
        }],
        hr_behavioral: [{
          id: "hr1", question: "Tell me about a time you faced a challenging technical problem. How did you solve it?",
          category: "Problem Solving", evaluation_criteria: ["Situation clarity", "Technical depth", "Outcome"],
          what_to_look_for: "STAR method usage, ownership, learning mindset",
          red_flags: "Blaming others, no concrete outcome mentioned",
          source: "HR Behavioral"
        }]
      }),
      { temperature: 0.5, maxOutputTokens: 3500 }
    );
    const codingCount = (codingHRSection.coding || []).length;
    const hrCount = (codingHRSection.hr_behavioral || []).length;
    console.log("[MockTestAgent] 3/4 Generated", codingCount, "coding +", hrCount, "HR questions");
    return { codingHRSection };
  } catch (err) {
    console.error("[MockTestAgent] 3/4 ERROR:", err.message);
    return { errors: [{ node: "codingHRGenerator", error: err.message }] };
  }
};

// Node 4: Assemble complete test & save to DB
const testAssemblerNode = async (state) => {
  if (state.mockTestResult?.cached) return {};
  console.log("[MockTestAgent] 4/4 Assembling final mock test...");
  const { mcqAptitudeSection, codingHRSection, testContext, sessionId } = state;
  const nodeErrors = state.errors || [];
  const maq = mcqAptitudeSection || {};
  const chq = codingHRSection || {};
  const ctx = testContext || {};

  const customOptions = state.customOptions || {};
  const numQuestions = customOptions.numQuestions || 15;
  const difficulty = customOptions.difficulty || 'medium';
  const questionTypes = customOptions.questionTypes || ['mcq', 'typing', 'coding'];
  const counts = distributeQuestions(numQuestions, questionTypes);

  const formatMCQOptions = (options) => {
    if (Array.isArray(options)) return options;
    if (typeof options === 'object' && options !== null) {
      return [
        options.A || options.a || "",
        options.B || options.b || "",
        options.C || options.c || "",
        options.D || options.d || ""
      ].map(o => String(o));
    }
    return [];
  };

  const techMCQ    = (maq.technical_mcq    || []).slice(0, counts.technical_mcq).map((q, i) => {
    const qid = "t" + (i + 1);
    return {
      ...q,
      id: qid,
      questionId: qid,
      type: "mcq",
      options: formatMCQOptions(q.options),
      correctAnswer: q.correct_answer || q.correctAnswer
    };
  });
  const aptMCQ     = (maq.aptitude_mcq     || []).slice(0, counts.aptitude_mcq).map((q, i) => {
    const qid = "a" + (i + 1);
    return {
      ...q,
      id: qid,
      questionId: qid,
      type: "aptitude",
      options: formatMCQOptions(q.options),
      correctAnswer: q.correct_answer || q.correctAnswer
    };
  });
  const coding     = (chq.coding           || []).slice(0, counts.coding).map((q, i) => {
    const qid = "c" + (i + 1);
    return {
      ...q,
      id: qid,
      questionId: qid,
      type: "coding"
    };
  });
  const techConc   = (chq.technical_conceptual || []).slice(0, counts.technical_conceptual).map((q, i) => {
    const qid = "tc" + (i + 1);
    return {
      ...q,
      id: qid,
      questionId: qid,
      type: "technical"
    };
  });
  const hrBehav    = (chq.hr_behavioral    || []).slice(0, counts.hr_behavioral).map((q, i) => {
    const qid = "hr" + (i + 1);
    return {
      ...q,
      id: qid,
      questionId: qid,
      type: "hr"
    };
  });

  const allQuestions = [...techMCQ, ...aptMCQ, ...coding, ...techConc, ...hrBehav];

  if (allQuestions.length === 0) {
    const errorMsg = "JSON generation failed: " + (nodeErrors.map(e => e.error).join("; ") || "No questions were generated due to rate limits or API issues.");
    console.error("[MockTestAgent] 4/4 Failed to generate questions:", errorMsg);
    return {
      mockTestResult: {
        success: false,
        error: errorMsg,
        errors: nodeErrors
      }
    };
  }

  const sections = {
    mcqs:      techMCQ,
    coding:    coding,
    aptitude:  aptMCQ,
    hr:        hrBehav,
    technical: techConc
  };
  const totalQuestions = allQuestions.length;
  
  // Calculate dynamic duration in minutes
  const totalDuration = Math.ceil(
    (techMCQ.length * 1.5) + 
    (aptMCQ.length * 2) + 
    (coding.length * 20) + 
    (techConc.length * 5) + 
    (hrBehav.length * 3)
  ) || 30;

  let finalTestId = uuidv4();
  
  // Use real company name from JD; fall back to role-based label (never "Target Company")
  const companyName = ctx.company || null;
  const roleName = ctx.role || "Software Engineer";
  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
  const targetLabel = companyName ? `${companyName} - ${roleName}` : roleName;

  let finalTitle = "";
  if (state.customOptions) {
    let topicsStr = "";
    if (state.customOptions.topics && state.customOptions.topics.length > 0) {
      topicsStr = ` (${state.customOptions.topics.slice(0, 2).join(", ")}${state.customOptions.topics.length > 2 ? "..." : ""})`;
    }
    finalTitle = `Custom ${diffLabel} Mock Test${topicsStr} for ${targetLabel}`;
  } else {
    finalTitle = `Mock Test for ${targetLabel}`;
  }

  let updatedDocId = "";
  try {
    const existingCount = await MockTest.countDocuments({ sessionId });
    if (existingCount > 0) {
      finalTitle = `${finalTitle} #${existingCount + 1}`;
    }

    const created = await MockTest.create({
      sessionId,
      testId: finalTestId,
      title: finalTitle,
      role: roleName,
      company: companyName,
      candidateName: ctx.name || "Candidate",
      sections,
      allQuestions,
      totalQuestions,
      totalDuration,
      generatedAt: new Date().toISOString(),
      generatedFrom: state.customOptions ? "Custom Generation" : "Auto Generated",
      warnings: nodeErrors.map(e => e.error)
    });
    updatedDocId = created._id.toString();
    console.log("[MockTestAgent] 4/4 Created new mock test", finalTestId, "with", totalQuestions, "questions in MongoDB");
  } catch (dbErr) {
    nodeErrors.push({ node: "testAssembler", error: "DB save: " + dbErr.message });
  }
  const mockTestResult = {
    success: true,
    cached: false,
    sessionId,
    testId: finalTestId,
    testMongoId: updatedDocId,
    title: finalTitle,
    sections,
    allQuestions,
    totalQuestions,
    totalDuration,
    role: roleName,
    breakdown: { technical_mcq: techMCQ.length, aptitude_mcq: aptMCQ.length, coding: coding.length, technical_conceptual: techConc.length, hr_behavioral: hrBehav.length },
    warnings: nodeErrors.map(e => e.error),
  };
  console.log("[MockTestAgent] Complete --", totalQuestions, "questions |", totalDuration, "min total");
  return { mockTestResult };
};

const graph = new StateGraph(MockTestAgentState)
  .addNode("contextAssembler",      contextAssemblerNode)
  .addNode("mcqAptitudeGenerator",  mcqAptitudeGeneratorNode)
  .addNode("codingHRGenerator",     codingHRGeneratorNode)
  .addNode("testAssembler",         testAssemblerNode)
  .addEdge(START,                   "contextAssembler")
  .addEdge("contextAssembler",      "mcqAptitudeGenerator")
  .addEdge("mcqAptitudeGenerator",  "codingHRGenerator")
  .addEdge("codingHRGenerator",     "testAssembler")
  .addEdge("testAssembler",         END);

const compiledGraph = graph.compile();

export const runMockTestGeneratorAgent = async (state) => {
  console.log("=== Mock Test Generator Agent Starting ===");
  const t0 = Date.now();
  try {
    const result = await compiledGraph.invoke({
      sessionId:    state.sessionId    || "",
      kbResult:     state.kbResult     || state.knowledgeBaseResult || null,
      resumeResult: state.resumeResult || null,
      jdResult:     state.jdResult     || null,
      force:        state.force        || false,
      customOptions: state.customOptions || null,
    });
    console.log("Mock Test Generator done in", ((Date.now() - t0) / 1000).toFixed(1) + "s");
    return {
      mockTestResult: result.mockTestResult || {
        success: false,
        error: (result.errors || []).map(e => e.error).join("; ") || "Unknown error",
        errors: result.errors || [],
      },
    };
  } catch (err) {
    console.error("Mock Test Generator fatal:", err.message);
    return { mockTestResult: { success: false, error: err.message, errors: [{ node: "graph", error: err.message }] } };
  }
};

export default runMockTestGeneratorAgent;
