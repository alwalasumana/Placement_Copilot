/**
 * ============================================================
 * Agent 1 — Knowledge Base Agentic RAG
 * ============================================================
 *
 * A true multi-step RAG agent built with LangGraph StateGraph.
 * Performs ITERATIVE retrieval (up to 3 rounds) before
 * extracting knowledge, generating questions, mining patterns,
 * scoring topics, and returning a structured report.
 *
 * LangGraph Flow:
 *
 *   START
 *     │
 *   retrievalPlanner      ← decides what to look for, generates queries
 *     │
 *   chromaRetriever       ← executes queries against ChromaDB, deduplicates
 *     │
 *   retrievalEvaluator    ← judges sufficiency; generates extra queries if needed
 *     │
 *     ├── [insufficient & iter < 3] ──→ chromaRetriever (loop)
 *     │
 *     └── [sufficient OR iter ≥ 3]
 *           │
 *         knowledgeExtractor   ← mines topics, questions, patterns from docs
 *           │
 *         mockTestGenerator    ← generates grounded MCQs / coding / HR / aptitude
 *           │
 *         patternMiner         ← finds repeated DSA / OA / behavioral patterns
 *           │
 *         knowledgeScorer      ← scores each topic by frequency + importance
 *           │
 *         finalReport          ← assembles structured JSON output
 *           │
 *          END
 *
 * Rules enforced:
 *  • Never hallucinate — every insight must cite retrieved text
 *  • Stop retrieval when confidence > 80% or after 3 iterations
 *  • Each node is independent and stateless except for state reads/writes
 * ============================================================
 */

import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { generateJSON } from '../services/geminiService.js';
import { queryCollection, getCollectionStats } from '../services/chromaService.js';
import KnowledgeBase from '../models/KnowledgeBase.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS      = 3;
const CONFIDENCE_THRESHOLD = 80;   // 0-100
const TOP_K_PER_QUERY     = 8;
const MAX_CONTEXT_CHUNKS  = 20;    // sent to Gemini at once

// ─── State Schema ─────────────────────────────────────────────────────────────
//
//  Rules for reducers:
//   • "last-write-wins"  → used for scalars, objects: (_, b) => b ?? _
//   • "accumulate-unique"→ used for retrievedChunks: merges new + deduplicates
//   • "append"           → used for errors: always appends new entries
//
const KBAgentState = Annotation.Root({
  // ── Input ──────────────────────────────────────────────────────────────────
  sessionId:         Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),

  // ── Retrieval Planning ─────────────────────────────────────────────────────
  retrievalGoal:     Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),
  retrievalQueries:  Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),
  // pendingQueries: what the retriever should use next (set by planner OR evaluator)
  pendingQueries:    Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),

  // ── Retrieved Chunks (ACCUMULATES across iterations, deduplicates by content)
  retrievedChunks: Annotation({
    reducer: (existing, incoming) => {
      if (!incoming || !Array.isArray(incoming) || incoming.length === 0) {
        return existing || [];
      }
      const current = existing || [];
      // Fingerprint by first 100 chars of content
      const seen = new Set(current.map(c => c?.content?.substring(0, 100) ?? ''));
      const unique = incoming.filter(c => {
        if (!c?.content) return false;
        const fp = c.content.substring(0, 100);
        if (seen.has(fp)) return false;
        seen.add(fp);
        return true;
      });
      return [...current, ...unique];
    },
    default: () => [],
  }),

  // ── Retrieval Control ──────────────────────────────────────────────────────
  retrievalIteration:  Annotation({ reducer: (_, b) => b ?? _, default: () => 0 }),
  contextSufficient:   Annotation({ reducer: (_, b) => b ?? _, default: () => false }),
  retrievalReason:     Annotation({ reducer: (_, b) => b ?? _, default: () => '' }),

  // ── Intermediate Results ────────────────────────────────────────────────────
  extractedKnowledge:  Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  mockAssessment:      Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  patterns:            Annotation({ reducer: (_, b) => b ?? _, default: () => null }),
  topicScores:         Annotation({ reducer: (_, b) => b ?? _, default: () => [] }),

  // ── Final Output ───────────────────────────────────────────────────────────
  knowledgeBaseResult: Annotation({ reducer: (_, b) => b ?? _, default: () => null }),

  // ── Error Accumulator ──────────────────────────────────────────────────────
  errors: Annotation({
    reducer: (a, b) => [...(a || []), ...(b || [])],
    default: () => [],
  }),
});

// ─── Helper: Format chunks for Gemini prompts ─────────────────────────────────

const formatChunksForPrompt = (chunks, limit = MAX_CONTEXT_CHUNKS) =>
  chunks
    .slice(0, limit)
    .map((c, i) => `[Doc ${i + 1}]${c.metadata?.fileName ? ` (${c.metadata.fileName})` : ''}:\n${c.content}`)
    .join('\n\n---\n\n');

// ─── Node 1: Retrieval Planner ────────────────────────────────────────────────
//
// Analyses the goal and generates 6 targeted search queries to kick off
// the retrieval loop.
// ─────────────────────────────────────────────────────────────────────────────

const retrievalPlannerNode = async (state) => {
  console.log('\n📋 [KB Agent] Node 1/8 — Retrieval Planner');

  const prompt = `You are a placement preparation analyst planning a document retrieval strategy.

The goal is to retrieve relevant content from a vector database that may contain:
- Company-specific interview questions (technical, HR, behavioral)
- Online Assessment (OA) papers and problems
- Coding challenges and DSA problems
- Interview experiences and feedback from candidates
- Placement preparation guides and notes
- Job descriptions and company expectations

Generate exactly 6 specific search queries that together cover:
1. Technical interview questions (algorithms, data structures, system design)
2. Online Assessment patterns (MCQ, coding, aptitude structure)
3. Coding problems (DSA topics, patterns, difficulty levels)
4. HR and behavioral questions (culture fit, situational)
5. Company-specific expectations and interview rounds
6. Technologies and tech stack mentioned

Return ONLY valid JSON:
{
  "goal": "Analyze uploaded placement materials to extract company-specific preparation insights",
  "queries": [
    "technical interview questions algorithms data structures",
    "online assessment OA coding problems MCQ",
    "DSA patterns dynamic programming graph trees sorting",
    "HR behavioral interview questions tell me about yourself",
    "company interview process rounds expectations culture",
    "programming languages frameworks technologies stack"
  ]
}`;

  try {
    const result = await generateJSON(prompt, { maxOutputTokens: 512 });
    const queries = Array.isArray(result.queries) ? result.queries : [];
    console.log(`   Generated ${queries.length} retrieval queries`);
    return {
      retrievalGoal: result.goal || 'Analyze placement preparation materials',
      retrievalQueries: queries,
      pendingQueries: queries,
      retrievalIteration: 0,
      contextSufficient: false,
      retrievedChunks: [],  // initialise accumulator
    };
  } catch (err) {
    // Fallback to hardcoded queries so the agent still runs
    console.warn('   Planner used fallback queries:', err.message);
    const fallback = [
      'technical interview questions algorithms data structures',
      'online assessment OA coding MCQ aptitude',
      'DSA dynamic programming graph trees sorting',
      'HR behavioral interview questions',
      'company interview rounds process expectations',
      'technologies stack programming languages',
    ];
    return {
      retrievalGoal: 'Analyze placement preparation materials',
      retrievalQueries: fallback,
      pendingQueries: fallback,
      retrievalIteration: 0,
      contextSufficient: false,
      retrievedChunks: [],
    };
  }
};

// ─── Node 2: ChromaDB Retriever ───────────────────────────────────────────────
//
// Executes all pending queries against the ChromaDB knowledge collection,
// deduplicates within the batch, and stores results in state (the state
// reducer handles cross-iteration deduplication automatically).
// ─────────────────────────────────────────────────────────────────────────────

const chromaRetrieverNode = async (state) => {
  const iter = (state.retrievalIteration || 0) + 1;
  const queries = state.pendingQueries || state.retrievalQueries || [];
  console.log(`\n🔍 [KB Agent] Node 2/8 — ChromaDB Retriever (iteration ${iter}/${MAX_ITERATIONS})`);
  console.log(`   Running ${queries.length} queries...`);

  const batchChunks = [];
  const seenInBatch = new Set();

  for (const query of queries) {
    if (!query?.trim()) continue;
    try {
      const results = await queryCollection(query.trim(), 'knowledge', state.sessionId, TOP_K_PER_QUERY);
      const docs     = results.documents  || [];
      const metas    = results.metadatas  || [];
      const dists    = results.distances  || [];

      for (let i = 0; i < docs.length; i++) {
        const content = docs[i];
        if (!content || content.length < 30) continue;
        const fp = content.substring(0, 100);
        if (seenInBatch.has(fp)) continue;
        seenInBatch.add(fp);
        batchChunks.push({
          content,
          metadata: metas[i] || {},
          relevanceScore: Math.max(0, 1 - (dists[i] || 0.5)),
          sourceQuery: query,
        });
      }
    } catch (err) {
      console.warn(`   ⚠️  Query failed: "${query}" → ${err.message}`);
    }
  }

  // Sort by relevance (best first)
  batchChunks.sort((a, b) => b.relevanceScore - a.relevanceScore);

  console.log(`   Retrieved ${batchChunks.length} new unique chunks`);

  // Return new chunks — the Annotation reducer accumulates them with existing ones
  return {
    retrievedChunks:   batchChunks,   // reducer merges with prior iterations
    retrievalIteration: iter,
    pendingQueries:    [],             // consumed; evaluator will set new ones if needed
  };
};

// ─── Node 3: Retrieval Evaluator ─────────────────────────────────────────────
//
// Uses Gemini to judge whether the accumulated chunks contain sufficient
// placement preparation content. If not, generates 3 targeted follow-up
// queries and routes back to the retriever (up to MAX_ITERATIONS times).
// ─────────────────────────────────────────────────────────────────────────────

const retrievalEvaluatorNode = async (state) => {
  const chunks    = state.retrievedChunks || [];
  const iteration = state.retrievalIteration || 0;
  console.log(`\n⚖️  [KB Agent] Node 3/8 — Retrieval Evaluator`);
  console.log(`   Chunks so far: ${chunks.length} | Iteration: ${iteration}/${MAX_ITERATIONS}`);

  // Hard stop: max iterations or no chunks at all
  if (iteration >= MAX_ITERATIONS || chunks.length === 0) {
    const reason = iteration >= MAX_ITERATIONS
      ? `Max iterations (${MAX_ITERATIONS}) reached`
      : 'No chunks retrieved — proceeding with empty knowledge base';
    console.log(`   → ${reason}`);
    return { contextSufficient: true, retrievalReason: reason };
  }

  // Sample the top-8 chunks for Gemini to evaluate
  const sample = chunks
    .slice(0, 8)
    .map((c, i) => `[Sample ${i + 1}]: ${c.content.substring(0, 300)}`)
    .join('\n\n');

  const prompt = `You are evaluating whether retrieved documents contain sufficient information for company-specific placement preparation analysis.

Retrieved ${chunks.length} document chunks. Evaluate this sample:

${sample}

Assess:
1. hasInterviewQuestions  — do any chunks contain actual interview/OA questions?
2. hasCodingContent       — do any chunks contain coding problems or DSA topics?
3. hasCompanyContext      — do chunks mention company-specific details, processes, or culture?
4. confidenceScore        — 0-100: how confident you are that analysis will produce useful output
5. sufficient             — true if confidenceScore >= ${CONFIDENCE_THRESHOLD} OR chunks clearly contain good prep material

If NOT sufficient (need more data), provide 3 highly specific follow-up queries that target information gaps.

Return ONLY valid JSON:
{
  "hasInterviewQuestions": boolean,
  "hasCodingContent": boolean,
  "hasCompanyContext": boolean,
  "confidenceScore": number,
  "sufficient": boolean,
  "reasoning": "one sentence explanation",
  "additionalQueries": ["query1", "query2", "query3"]
}`;

  try {
    const evaluation = await generateJSON(prompt, { maxOutputTokens: 512 });
    const sufficient = !!(evaluation.sufficient || (evaluation.confidenceScore ?? 0) >= CONFIDENCE_THRESHOLD);

    console.log(`   Confidence: ${evaluation.confidenceScore ?? '?'}% | Sufficient: ${sufficient}`);
    console.log(`   Reason: ${evaluation.reasoning || 'N/A'}`);

    if (sufficient) {
      return { contextSufficient: true, retrievalReason: evaluation.reasoning || '' };
    }

    // Not sufficient — provide follow-up queries for next retrieval
    const additionalQueries = Array.isArray(evaluation.additionalQueries)
      ? evaluation.additionalQueries.filter(Boolean)
      : [];

    return {
      contextSufficient: false,
      retrievalReason: evaluation.reasoning || '',
      pendingQueries: additionalQueries,
    };
  } catch (err) {
    // On evaluation error, just proceed — never block extraction
    console.warn('   Evaluator failed, proceeding:', err.message);
    return {
      contextSufficient: true,
      retrievalReason: `Evaluation error (${err.message}), proceeding with ${chunks.length} chunks`,
    };
  }
};

// ─── Conditional Edge Routing ─────────────────────────────────────────────────
//
// Called by LangGraph after retrievalEvaluator to decide the next node.
// ─────────────────────────────────────────────────────────────────────────────

const routeAfterEvaluation = (state) => {
  const sufficient   = state.contextSufficient || false;
  const iteration    = state.retrievalIteration || 0;
  const hasPending   = (state.pendingQueries || []).length > 0;

  if (sufficient || iteration >= MAX_ITERATIONS || !hasPending) {
    return 'proceed_to_extraction';
  }
  return 'continue_retrieval';
};

// ─── Node 4: Knowledge Extraction Agent ──────────────────────────────────────
//
// Extracts structured placement intelligence from the accumulated chunks.
// Uses ONLY retrieved text — no hallucination.
// ─────────────────────────────────────────────────────────────────────────────

const knowledgeExtractorNode = async (state) => {
  const chunks = state.retrievedChunks || [];
  console.log(`\n🧠 [KB Agent] Node 4/8 — Knowledge Extractor (${chunks.length} chunks)`);

  if (chunks.length === 0) {
    return {
      extractedKnowledge: {
        importantTopics: [], repeatedQuestions: [], codingPatterns: [],
        oaPatterns: [], interviewRoundStructure: [], technologies: [],
        companyExpectations: [], keyInsights: [], hasContent: false,
      },
    };
  }

  // Use top chunks ranked by relevance
  const topChunks = [...chunks]
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, MAX_CONTEXT_CHUNKS);

  const context = formatChunksForPrompt(topChunks);

  const prompt = `You are an expert placement preparation analyst.

Analyze ONLY the following retrieved company preparation documents.
Do NOT add any generic knowledge. Every field must be directly traceable to the documents below.

===== RETRIEVED DOCUMENTS =====
${context}
===== END OF DOCUMENTS =====

Extract and return ONLY valid JSON:
{
  "importantTopics": ["topic directly mentioned in docs"],
  "repeatedQuestions": [
    { "question": "exact or paraphrased question from docs", "frequency": "high|medium|low", "source": "Doc N" }
  ],
  "codingPatterns": [
    { "pattern": "e.g. Two Pointers, DP, BFS", "examples": ["problem name if mentioned"], "difficulty": "easy|medium|hard" }
  ],
  "oaPatterns": [
    { "type": "e.g. 2 coding + 20 MCQ", "description": "details from docs", "timeLimit": "if mentioned", "questionTypes": ["..."] }
  ],
  "interviewRoundStructure": ["Round 1: ...", "Round 2: ..."],
  "technologies": ["tech directly mentioned in docs"],
  "companyExpectations": ["expectation extracted from docs"],
  "keyInsights": ["insight traceable to retrieved docs"],
  "hasContent": true
}

Rules:
- If something is NOT mentioned in the documents, use an empty array.
- Do NOT invent company names, question texts, or technologies.
- "repeatedQuestions" should only contain questions that genuinely appear in docs.`;

  try {
    const knowledge = await generateJSON(prompt, { maxOutputTokens: 4096 });
    knowledge.hasContent = (knowledge.importantTopics?.length || 0) > 0;
    console.log(`   Extracted: ${knowledge.importantTopics?.length || 0} topics, ${knowledge.repeatedQuestions?.length || 0} repeated questions`);
    return { extractedKnowledge: knowledge };
  } catch (err) {
    console.error('   Knowledge extraction error:', err.message);
    return {
      extractedKnowledge: {
        importantTopics: [], repeatedQuestions: [], codingPatterns: [],
        oaPatterns: [], interviewRoundStructure: [], technologies: [],
        companyExpectations: [], keyInsights: [], hasContent: false, error: err.message,
      },
      errors: [`KnowledgeExtractor: ${err.message}`],
    };
  }
};

// ─── Node 5: Mock Test Generator ─────────────────────────────────────────────
//
// Generates company-specific assessment questions grounded in the retrieved
// documents. Every question cites a source document.
// ─────────────────────────────────────────────────────────────────────────────

const mockTestGeneratorNode = async (state) => {
  const chunks    = state.retrievedChunks || [];
  const knowledge = state.extractedKnowledge || {};
  console.log(`\n📝 [KB Agent] Node 5/8 — Mock Test Generator`);

  if (chunks.length === 0 || !knowledge.hasContent) {
    return {
      mockAssessment: {
        mcqs: [], codingQuestions: [], technicalQuestions: [], hrQuestions: [],
        aptitudeQuestions: [], note: 'No documents available for grounded question generation.',
      },
    };
  }

  const topChunks = [...chunks]
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, 15);

  const context      = formatChunksForPrompt(topChunks, 15);
  const topicsStr    = (knowledge.importantTopics  || []).slice(0, 8).join(', ') || 'general programming';
  const techStr      = (knowledge.technologies     || []).slice(0, 8).join(', ') || 'general';
  const patternsStr  = (knowledge.codingPatterns   || []).slice(0, 5).map(p => p.pattern || p).join(', ') || 'general';

  const prompt = `You are generating a company-specific mock assessment.

Base EVERY question ONLY on the retrieved documents below.
If a question topic is not present in the documents, do NOT include it.

Topics found in documents: ${topicsStr}
Technologies found: ${techStr}
Coding patterns found: ${patternsStr}

===== RETRIEVED DOCUMENTS =====
${context}
===== END =====

Generate a mock assessment and return ONLY valid JSON:
{
  "mcqs": [
    {
      "id": "mcq_1",
      "question": "question text",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": "A",
      "explanation": "why A is correct",
      "difficulty": "easy|medium|hard",
      "topic": "topic name",
      "sourceEvidence": "Doc N mentions..."
    }
  ],
  "codingQuestions": [
    {
      "id": "code_1",
      "title": "Problem title",
      "description": "Full problem statement",
      "examples": [{ "input": "...", "output": "...", "explanation": "..." }],
      "constraints": "1 <= n <= 10^5",
      "difficulty": "easy|medium|hard",
      "expectedApproach": "approach description",
      "timeComplexity": "O(n log n)",
      "spaceComplexity": "O(n)",
      "sourceEvidence": "Based on Doc N which mentions..."
    }
  ],
  "technicalQuestions": [
    {
      "id": "tech_1",
      "question": "technical question",
      "expectedAnswer": "detailed answer",
      "followUps": ["follow-up 1", "follow-up 2"],
      "difficulty": "easy|medium|hard",
      "topic": "topic",
      "sourceEvidence": "Doc N mentions..."
    }
  ],
  "hrQuestions": [
    {
      "id": "hr_1",
      "question": "HR question",
      "tips": "how to answer",
      "sampleAnswer": "sample answer structure",
      "sourceEvidence": "Relevant to company context in Doc N"
    }
  ],
  "aptitudeQuestions": [
    {
      "id": "apt_1",
      "question": "aptitude question",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": "B",
      "explanation": "step-by-step solution",
      "difficulty": "easy|medium|hard",
      "category": "quantitative|logical|verbal"
    }
  ]
}

Target counts (minimum): 5 MCQs, 3 coding problems, 4 technical questions, 3 HR questions, 3 aptitude questions.
Only include question types if the documents support them.`;

  try {
    const assessment = await generateJSON(prompt, { maxOutputTokens: 2500 });
    console.log(`   Generated: ${assessment.mcqs?.length || 0} MCQs, ${assessment.codingQuestions?.length || 0} coding, ${assessment.technicalQuestions?.length || 0} technical`);
    return { mockAssessment: assessment };
  } catch (err) {
    console.error('   Mock test generation error:', err.message);
    return {
      mockAssessment: {
        mcqs: [], codingQuestions: [], technicalQuestions: [], hrQuestions: [],
        aptitudeQuestions: [], error: err.message,
      },
      errors: [`MockTestGenerator: ${err.message}`],
    };
  }
};

// ─── Node 6: Pattern Mining Agent ────────────────────────────────────────────
//
// Identifies patterns that repeat across the retrieved documents:
// DSA topic frequency, OA structure, behavioral question patterns.
// ─────────────────────────────────────────────────────────────────────────────

const patternMinerNode = async (state) => {
  const chunks    = state.retrievedChunks || [];
  const knowledge = state.extractedKnowledge || {};
  console.log(`\n🔬 [KB Agent] Node 6/8 — Pattern Miner`);

  if (chunks.length === 0) {
    return { patterns: { mostRepeatedConcepts: [], dsaTopics: [], oaStructures: [], behavioralPatterns: [], highPriorityAreas: [] } };
  }

  const context      = formatChunksForPrompt(chunks.slice(0, 15), 15);
  const knownTopics  = (knowledge.importantTopics || []).slice(0, 10).join(', ');

  const prompt = `You are a placement preparation pattern analyst.

Find patterns ONLY from the documents below. Do NOT add generic knowledge.
Already extracted topics: ${knownTopics || 'none yet'}

===== RETRIEVED DOCUMENTS =====
${context}
===== END =====

Identify patterns and return ONLY valid JSON:
{
  "mostRepeatedConcepts": [
    { "concept": "concept name", "occurrences": 3, "evidence": "found in Doc 1, Doc 3, Doc 5" }
  ],
  "dsaTopics": [
    { "topic": "Arrays", "frequency": "high|medium|low", "specificProblems": ["two sum", "..."], "importance": 9 }
  ],
  "oaStructures": [
    {
      "structure": "e.g. 3 coding + 20 MCQ + 15 aptitude",
      "description": "description from docs",
      "timeLimit": "if mentioned",
      "questionTypes": ["coding", "mcq"],
      "difficulty": "medium"
    }
  ],
  "behavioralPatterns": [
    { "pattern": "tell me about yourself", "frequency": "high|medium|low", "example": "from Doc N" }
  ],
  "highPriorityAreas": ["area1 based on document frequency", "area2"],
  "difficultyDistribution": { "easy": 3, "medium": 7, "hard": 2 },
  "preparationRecommendations": [
    "recommendation derived directly from documents"
  ]
}`;

  try {
    const patterns = await generateJSON(prompt, { maxOutputTokens: 2048 });
    console.log(`   Found: ${patterns.mostRepeatedConcepts?.length || 0} concepts, ${patterns.dsaTopics?.length || 0} DSA topics, ${patterns.highPriorityAreas?.length || 0} priority areas`);
    return { patterns };
  } catch (err) {
    console.error('   Pattern mining error:', err.message);
    return {
      patterns: {
        mostRepeatedConcepts: [], dsaTopics: [], oaStructures: [],
        behavioralPatterns: [], highPriorityAreas: [], preparationRecommendations: [],
        error: err.message,
      },
      errors: [`PatternMiner: ${err.message}`],
    };
  }
};

// ─── Node 7: Knowledge Scoring Agent ─────────────────────────────────────────
//
// Scores every unique topic by how frequently it appears in documents
// and how important it is for placement success.
// ─────────────────────────────────────────────────────────────────────────────

const knowledgeScorerNode = async (state) => {
  const chunks    = state.retrievedChunks || [];
  const knowledge = state.extractedKnowledge || {};
  const patterns  = state.patterns || {};
  console.log(`\n🎯 [KB Agent] Node 7/8 — Knowledge Scorer`);

  // Collect all unique topic names from knowledge + patterns
  const rawTopics = [
    ...(knowledge.importantTopics || []),
    ...(patterns.dsaTopics || []).map(d => (typeof d === 'string' ? d : d?.topic) || ''),
    ...(patterns.highPriorityAreas || []),
  ];
  const uniqueTopics = [...new Set(rawTopics.filter(t => typeof t === 'string' && t.length > 0))].slice(0, 20);

  if (uniqueTopics.length === 0) {
    return { topicScores: [] };
  }

  const contextSample = formatChunksForPrompt(chunks.slice(0, 8), 8);

  const prompt = `Score these topics for placement preparation based on the retrieved documents.

Topics to score: ${uniqueTopics.join(' | ')}

Document sample (for evidence):
${contextSample}

For each topic, assess:
- frequencyScore (1-10): how many times it appears across documents
- importanceScore (1-10): how critical it is for placement (based on doc context)
- confidenceScore (0.0-1.0): how confident you are this topic matters (evidence quality)
- overallPriority: "critical" | "high" | "medium" | "low"

Return ONLY valid JSON:
{
  "topicScores": [
    {
      "topic": "topic name",
      "frequencyScore": 8,
      "importanceScore": 9,
      "confidenceScore": 0.85,
      "overallPriority": "critical",
      "evidence": "brief mention of supporting evidence from docs"
    }
  ],
  "overallConfidence": 0.78,
  "topFocusAreas": ["highest priority topic 1", "topic 2", "topic 3"]
}`;

  try {
    const scoring = await generateJSON(prompt, { maxOutputTokens: 2048 });
    const scores = scoring.topicScores || uniqueTopics.map(t => ({
      topic: t, frequencyScore: 5, importanceScore: 5, confidenceScore: 0.5,
      overallPriority: 'medium', evidence: 'Auto-scored',
    }));
    console.log(`   Scored ${scores.length} topics`);
    return { topicScores: scores };
  } catch (err) {
    console.error('   Scoring error:', err.message);
    const fallback = uniqueTopics.map(t => ({
      topic: t, frequencyScore: 5, importanceScore: 5,
      confidenceScore: 0.5, overallPriority: 'medium', evidence: 'Scoring unavailable',
    }));
    return {
      topicScores: fallback,
      errors: [`KnowledgeScorer: ${err.message}`],
    };
  }
};

// ─── Node 8: Final Report Agent ───────────────────────────────────────────────
//
// Assembles the complete structured output. Maintains backward-compatible
// field names used by downstream agents (skillGap, roadmap, mockTest).
// ─────────────────────────────────────────────────────────────────────────────

const finalReportNode = async (state) => {
  console.log('\n📊 [KB Agent] Node 8/8 — Final Report');

  const { sessionId } = state;
  const chunks    = state.retrievedChunks  || [];
  const knowledge = state.extractedKnowledge || {};
  const assessment= state.mockAssessment   || {};
  const patterns  = state.patterns         || {};
  const scores    = state.topicScores      || [];

  // Count unique source documents
  const documentSet = new Set(
    chunks
      .map(c => c.metadata?.fileId || c.metadata?.fileName)
      .filter(Boolean)
  );
  const documentCount = documentSet.size || Math.min(chunks.length, 10);

  // Build preparation strategy from patterns + insights
  const prepStrategy = [
    ...(patterns.preparationRecommendations || []),
    ...(patterns.highPriorityAreas || []).map(a => `Focus heavily on: ${a}`),
    ...(knowledge.keyInsights || []),
  ].filter(Boolean).slice(0, 10);

  // Backward-compatible aliases for downstream agents
  const frequentTechnologies = knowledge.technologies || [];
  const repeatedQuestionsFlat = (knowledge.repeatedQuestions || []).map(q =>
    typeof q === 'string' ? q : q?.question || ''
  ).filter(Boolean);
  const codingPatternsFlat = (knowledge.codingPatterns || []).map(p =>
    typeof p === 'string' ? p : p?.pattern || ''
  ).filter(Boolean);
  const oaPatternsFlat = (knowledge.oaPatterns || []).map(p =>
    typeof p === 'string' ? p : p?.type || p?.structure || ''
  ).filter(Boolean);

  const hasContent = chunks.length > 0 && knowledge.hasContent;

  const summary = hasContent
    ? `Analyzed ${documentCount} document(s) across ${state.retrievalIteration || 1} retrieval iteration(s). ` +
      `Found ${(knowledge.importantTopics || []).length} key topics, ` +
      `${repeatedQuestionsFlat.length} repeated questions, and ` +
      `${codingPatternsFlat.length} coding patterns. ` +
      `Generated ${assessment.mcqs?.length || 0} MCQs, ` +
      `${assessment.codingQuestions?.length || 0} coding problems, ` +
      `${assessment.technicalQuestions?.length || 0} technical questions.`
    : 'No documents found in the knowledge base. Please upload company preparation materials (PDFs, DOCX, TXT) using the Knowledge Base page first.';

  const result = {
    // ── Core (backward-compatible) ──────────────────────────────────────────
    hasKnowledgeBase:          hasContent,
    knowledgeBaseFound:        hasContent,
    documentCount,
    chunkCount:                chunks.length,
    retrievalIterations:       state.retrievalIteration || 1,
    summary,

    // ── Extracted Knowledge ──────────────────────────────────────────────────
    importantTopics:           knowledge.importantTopics           || [],
    repeatedQuestions:         repeatedQuestionsFlat,
    repeatedQuestionsDetailed: knowledge.repeatedQuestions         || [],
    codingPatterns:            codingPatternsFlat,
    codingPatternsDetailed:    knowledge.codingPatterns            || [],
    oaPatterns:                oaPatternsFlat,
    oaPatternsDetailed:        knowledge.oaPatterns                || [],
    interviewPatterns:         knowledge.interviewRoundStructure   || [],
    technologies:              knowledge.technologies              || [],
    frequentTechnologies,                                            // alias for downstream agents
    companyExpectations:       knowledge.companyExpectations       || [],
    keyInsights:               knowledge.keyInsights               || [],

    // ── Scoring ──────────────────────────────────────────────────────────────
    topicScores: scores,

    // ── Mock Assessment ───────────────────────────────────────────────────────
    mockAssessment: {
      mcqs:                 assessment.mcqs              || [],
      codingQuestions:      assessment.codingQuestions   || [],
      technicalQuestions:   assessment.technicalQuestions|| [],
      hrQuestions:          assessment.hrQuestions       || [],
      aptitudeQuestions:    assessment.aptitudeQuestions || [],
    },

    // ── Patterns ──────────────────────────────────────────────────────────────
    patterns: {
      mostRepeatedConcepts:  patterns.mostRepeatedConcepts   || [],
      dsaTopics:             patterns.dsaTopics              || [],
      oaStructures:          patterns.oaStructures           || [],
      behavioralPatterns:    patterns.behavioralPatterns     || [],
      difficultyDistribution:patterns.difficultyDistribution || {},
      highPriorityAreas:     patterns.highPriorityAreas      || [],
    },

    // ── Preparation Strategy ──────────────────────────────────────────────────
    preparationStrategy: prepStrategy,
    highPriorityAreas:   patterns.highPriorityAreas || [],

    // ── Meta ──────────────────────────────────────────────────────────────────
    agentErrors: state.errors || [],
    generatedAt: new Date().toISOString(),
  };

  console.log(`   ✅ Report assembled — hasKnowledgeBase: ${result.hasKnowledgeBase}`);
  
  if (hasContent) {
    try {
      const docData = {
        sessionId,
        extractedData: {
          importantTopics:           result.importantTopics,
          repeatedQuestions:         result.repeatedQuestions,
          codingPatterns:            result.codingPatterns,
          interviewPatterns:         result.interviewPatterns,
          frequentTechnologies:      result.frequentTechnologies,
          oaPatterns:                result.oaPatterns,
          keyConceptsByTopic:        knowledge.keyConceptsByTopic || [],
        },
        totalChunks:                 result.chunkCount,
        lastIndexed:                 new Date(),
      };
      await KnowledgeBase.findOneAndUpdate({ sessionId }, docData, { upsert: true, new: true });
      console.log('   💾 Saved KnowledgeBase analysis to MongoDB');
    } catch (dbErr) {
      console.error('   ❌ Error saving KnowledgeBase to MongoDB:', dbErr.message);
      state.errors.push(`KnowledgeBase DB save: ${dbErr.message}`);
    }
  }

  return { knowledgeBaseResult: result };
};

// ─── Build LangGraph StateGraph ───────────────────────────────────────────────

const buildKBAgentGraph = () => {
  const g = new StateGraph(KBAgentState);

  // Register all 8 nodes
  g.addNode('retrievalPlanner',    retrievalPlannerNode);
  g.addNode('chromaRetriever',     chromaRetrieverNode);
  g.addNode('retrievalEvaluator',  retrievalEvaluatorNode);
  g.addNode('knowledgeExtractor',  knowledgeExtractorNode);
  g.addNode('mockTestGenerator',   mockTestGeneratorNode);
  g.addNode('patternMiner',        patternMinerNode);
  g.addNode('knowledgeScorer',     knowledgeScorerNode);
  g.addNode('finalReport',         finalReportNode);

  // ── Linear edges ───────────────────────────────────────────────────────────
  g.addEdge(START,               'retrievalPlanner');
  g.addEdge('retrievalPlanner',  'chromaRetriever');
  g.addEdge('chromaRetriever',   'retrievalEvaluator');

  // ── Conditional edge: loop back to retriever OR proceed to extraction ──────
  g.addConditionalEdges(
    'retrievalEvaluator',
    routeAfterEvaluation,
    {
      'continue_retrieval':   'chromaRetriever',     // not enough context yet
      'proceed_to_extraction':'knowledgeExtractor',  // context sufficient
    }
  );

  // ── Extraction pipeline (linear) ───────────────────────────────────────────
  g.addEdge('knowledgeExtractor', 'mockTestGenerator');
  g.addEdge('mockTestGenerator',  'patternMiner');
  g.addEdge('patternMiner',       'knowledgeScorer');
  g.addEdge('knowledgeScorer',    'finalReport');
  g.addEdge('finalReport',        END);

  return g.compile();
};

// ─── Module-level cached graph singleton ─────────────────────────────────────
let cachedGraph = null;

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * runKnowledgeExtractionAgent
 *
 * Called by placementWorkflow.js (in the parallel node).
 * Returns: { knowledgeBaseResult: { ... } }
 */
export const runKnowledgeExtractionAgent = async (state) => {
  if (!cachedGraph) cachedGraph = buildKBAgentGraph();

  const { sessionId } = state;
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`📚 Knowledge Base Agentic RAG  |  session: ${sessionId}`);
  console.log(`${'═'.repeat(55)}`);

  // Verify there are actually documents in this session's collection
  let hasDocuments = false;
  try {
    const stats = await getCollectionStats('knowledge', sessionId);
    hasDocuments = (stats?.count || 0) > 0;
    console.log(`Collection stats: ${stats?.count || 0} chunks in ChromaDB`);
  } catch {
    // ChromaDB might not be running — agent will handle gracefully
    console.warn('Could not check ChromaDB stats; proceeding anyway');
    hasDocuments = true; // let the agent try
  }

  if (!hasDocuments) {
    console.log('⚠️  No documents in knowledge base — returning empty result');
    try {
      await KnowledgeBase.findOneAndUpdate(
        { sessionId },
        {
          sessionId,
          extractedData: {
            importantTopics: [], repeatedQuestions: [], codingPatterns: [],
            interviewPatterns: [], frequentTechnologies: [], oaPatterns: [],
            keyConceptsByTopic: []
          },
          totalChunks: 0,
          lastIndexed: new Date()
        },
        { upsert: true }
      );
    } catch (err) {
      console.error('   ❌ Error saving empty KnowledgeBase to MongoDB:', err.message);
    }
    return {
      knowledgeBaseResult: {
        hasKnowledgeBase:   false,
        knowledgeBaseFound: false,
        documentCount: 0, chunkCount: 0, retrievalIterations: 0,
        importantTopics: [], repeatedQuestions: [], codingPatterns: [],
        oaPatterns: [], interviewPatterns: [], technologies: [],
        frequentTechnologies: [], companyExpectations: [], keyInsights: [],
        topicScores: [],
        mockAssessment: { mcqs: [], codingQuestions: [], technicalQuestions: [], hrQuestions: [], aptitudeQuestions: [] },
        patterns: { mostRepeatedConcepts: [], dsaTopics: [], oaStructures: [], behavioralPatterns: [], highPriorityAreas: [] },
        preparationStrategy: [],
        highPriorityAreas: [],
        summary: 'No documents found in the knowledge base. Upload company preparation materials (PDF, DOCX, TXT) on the Knowledge Base page first.',
        agentErrors: [],
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // Initial state — only set what the planner doesn't override
  const initialState = {
    sessionId,
    retrievalIteration: 0,
    contextSufficient: false,
    retrievedChunks: [],
    errors: [],
  };

  try {
    const startTime = Date.now();

    // recursionLimit covers: planner(1) + up to 3×(retriever+evaluator)(6) + 5 extraction nodes(5) = 12 max
    const finalState = await cachedGraph.invoke(initialState, { recursionLimit: 30 });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ KB Agent done in ${elapsed}s | iterations: ${finalState.retrievalIteration} | chunks: ${finalState.retrievedChunks?.length}`);

    return { knowledgeBaseResult: finalState.knowledgeBaseResult };
  } catch (error) {
    console.error('KB Agent fatal error:', error.message);
    return {
      knowledgeBaseResult: {
        hasKnowledgeBase: false, knowledgeBaseFound: false,
        documentCount: 0, chunkCount: 0, retrievalIterations: 0,
        importantTopics: [], repeatedQuestions: [], codingPatterns: [],
        oaPatterns: [], interviewPatterns: [], technologies: [],
        frequentTechnologies: [], companyExpectations: [], keyInsights: [],
        topicScores: [],
        mockAssessment: { mcqs: [], codingQuestions: [], technicalQuestions: [], hrQuestions: [], aptitudeQuestions: [] },
        patterns: { mostRepeatedConcepts: [], dsaTopics: [], oaStructures: [], behavioralPatterns: [], highPriorityAreas: [] },
        preparationStrategy: [],
        highPriorityAreas: [],
        summary: `Agent error: ${error.message}`,
        agentErrors: [error.message],
        generatedAt: new Date().toISOString(),
      },
    };
  }
};
