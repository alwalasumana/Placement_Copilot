import MockTest from '../models/MockTest.js';
import TestResult from '../models/TestResult.js';
import ReadinessReport from '../models/ReadinessReport.js';
import { runMockTestGeneratorAgent } from '../agents/mockTestGeneratorAgent.js';
import { runKnowledgeExtractionAgent } from '../agents/knowledgeExtractionAgent.js';
import { runResumeAnalyzerAgent } from '../agents/resumeAnalyzerAgent.js';
import { runJDAnalyzerAgent } from '../agents/jdAnalyzerAgent.js';
import { generateJSON } from '../services/geminiService.js';

// ─── Generate Test ────────────────────────────────────────────────────────────
export const generateTest = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { numQuestions, difficulty, questionTypes, topics } = req.body;

    const validatedOptions = {
      numQuestions: typeof numQuestions === 'number' && numQuestions > 0 ? Math.min(numQuestions, 30) : 15,
      difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
      questionTypes: Array.isArray(questionTypes) && questionTypes.length > 0 ? questionTypes : ['mcq', 'typing', 'coding'],
      topics: Array.isArray(topics) ? topics : []
    };

    let state = { 
      sessionId, 
      errors: [], 
      force: true,
      customOptions: validatedOptions
    };

    const kbRes = await runKnowledgeExtractionAgent(state);
    Object.assign(state, kbRes);

    const resumeRes = await runResumeAnalyzerAgent(state);
    Object.assign(state, resumeRes);

    const jdRes = await runJDAnalyzerAgent(state);
    Object.assign(state, jdRes);

    const testRes = await runMockTestGeneratorAgent(state);
    Object.assign(state, testRes);

    if (state.mockTestResult?.error || state.mockTestResult?.success === false) {
      return res.status(500).json({
        success: false,
        error: state.mockTestResult?.error || "Mock test generation failed due to rate limits or API issues."
      });
    }

    res.json({
      success: true,
      message: 'Mock test generated',
      testId: state.mockTestResult?.testId,
      testMongoId: state.mockTestResult?.testMongoId,
      title: state.mockTestResult?.title,
      totalQuestions: state.mockTestResult?.totalQuestions,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get Test ─────────────────────────────────────────────────────────────────
export const getTest = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { testId } = req.params;

    const test = testId
      ? await MockTest.findOne({ testId, sessionId })
      : await MockTest.findOne({ sessionId }).sort({ createdAt: -1 });

    if (!test) return res.status(404).json({ success: false, error: 'Test not found' });
    res.json({ success: true, data: test });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── List Tests ───────────────────────────────────────────────────────────────
export const listTests = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const tests = await MockTest.find({ sessionId })
      .sort({ createdAt: -1 })
      .select('testId title totalQuestions generatedFrom status createdAt');
    
    // Disable Express ETag generation for this request to prevent 304 response caching issues
    res.set('ETag', false);
    // Strict headers to prevent client and proxy caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({ success: true, data: tests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Submit Test ──────────────────────────────────────────────────────────────
export const submitTest = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { testId, answers, timeTaken } = req.body;

    if (!testId || !answers) {
      return res.status(400).json({ success: false, error: 'testId and answers required' });
    }

    const test = await MockTest.findOne({ testId, sessionId });
    if (!test) return res.status(404).json({ success: false, error: 'Test not found' });

    // Build a flat question map from all sections
    const questionMap = new Map();
    const allSections = ['mcqs', 'coding', 'aptitude', 'hr', 'technical'];
    for (const section of allSections) {
      for (const q of test.sections[section] || []) {
        const rawQ = q.toObject ? q.toObject() : q;
        questionMap.set(q.questionId, { ...rawQ, sectionType: section });
      }
    }

    // Score ALL questions in the test (both answered and unanswered)
    const scored = [];
    for (const [qId, q] of questionMap.entries()) {
      const a = answers.find(ans => ans.questionId === qId);
      if (!a) {
        // Unanswered question
        scored.push({
          questionId: qId,
          userAnswer: '',
          isCorrect: false,
        });
      } else {
        const type = q.type;
        let isCorrect = false;
        if (type === 'mcq' || type === 'aptitude') {
          const correct = q.correctAnswer?.trim().toUpperCase().charAt(0);
          const given   = a.userAnswer?.trim().toUpperCase().charAt(0);
          isCorrect = !!(correct && given && correct === given);
        } else {
          // coding / hr / technical — give credit if non-empty answer of decent length
          isCorrect = !!(a.userAnswer && a.userAnswer.trim().length > 10);
        }
        scored.push({
          ...a,
          isCorrect,
        });
      }
    }

    // Section scores
    const sectionScores = {};
    for (const section of allSections) {
      const sectionQuestions = scored.filter(a => questionMap.get(a.questionId)?.sectionType === section);
      const total    = sectionQuestions.length;
      const obtained = sectionQuestions.filter(a => a.isCorrect).length;
      sectionScores[section === 'mcqs' ? 'mcq' : section] = {
        obtained,
        total,
        percentage: total > 0 ? Math.round((obtained / total) * 100) : 0,
      };
    }

    const totalObtained = scored.filter(a => a.isCorrect).length;
    const totalQuestions = scored.length || 1;
    sectionScores.overall = {
      obtained: totalObtained,
      total: totalQuestions,
      percentage: Math.round((totalObtained / totalQuestions) * 100),
    };

    // AI post-test analysis
    const analysisPrompt = `
A candidate completed a placement mock test.
Score: ${totalObtained}/${totalQuestions} (${sectionScores.overall.percentage}%)
Section scores: ${JSON.stringify(sectionScores)}
Return JSON: { "analysis": "2 paragraph performance analysis", "weakTopics": ["topic1","topic2"], "strongTopics": ["topic1","topic2"] }`;

    const aiAnalysis = await generateJSON(analysisPrompt, { temperature: 0.3 }).catch(() => ({
      analysis: 'Test completed successfully.',
      weakTopics: [],
      strongTopics: [],
    }));

    const result = await TestResult.create({
      sessionId,
      testId,
      mockTestRef: test._id,
      answers: scored,
      scores: sectionScores,
      timeTaken,
      analysis: aiAnalysis.analysis,
      weakTopics: aiAnalysis.weakTopics || [],
      strongTopics: aiAnalysis.strongTopics || [],
    });

    await MockTest.findByIdAndUpdate(test._id, { status: 'taken' });

    // Recalculate readiness scores based on new mock test result
    await recalculateReadinessScores(sessionId);

    res.json({
      success: true,
      message: 'Test submitted successfully',
      resultId: result._id,
      scores: sectionScores,
      analysis: aiAnalysis.analysis,
      weakTopics: result.weakTopics,
      strongTopics: result.strongTopics,
      answers: result.answers,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get Test Results ─────────────────────────────────────────────────────────
export const getTestResults = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { testId } = req.params;

    const result = testId
      ? await TestResult.findOne({ testId, sessionId })
      : await TestResult.findOne({ sessionId }).sort({ createdAt: -1 });

    if (!result) return res.status(404).json({ success: false, error: 'No results found' });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Delete Test ──────────────────────────────────────────────────────────────
export const deleteTest = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { testId } = req.params;

    if (!testId) {
      return res.status(400).json({ success: false, error: 'testId is required' });
    }

    const test = await MockTest.findOneAndDelete({ testId, sessionId });
    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    // Also delete any associated test results
    await TestResult.deleteMany({ testId, sessionId });

    // Recalculate readiness scores based on deleted mock test
    await recalculateReadinessScores(sessionId);

    res.json({ success: true, message: 'Mock test and associated results deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Recalculate Readiness Scores Helper ──────────────────────────────────────
export const recalculateReadinessScores = async (sessionId) => {
  try {
    const report = await ReadinessReport.findOne({ sessionId });
    if (!report) {
      console.log(`[ReadinessRecalculator] No readiness report found for session ${sessionId}, skipping recalculation.`);
      return;
    }

    // 1. Calculate mock test average from actual results
    const testResults = await TestResult.find({ sessionId });
    let mockTestScore = 0;
    if (testResults.length > 0) {
      const totalPct = testResults.reduce((acc, r) => acc + (r.scores?.overall?.percentage || 0), 0);
      mockTestScore = Math.round(totalPct / testResults.length);
    }

    // 2. Update scores
    report.scores = report.scores || {};
    report.scores.mockTest = mockTestScore;

    // 3. Recalculate composite score using standard weights:
    // skillMatch 40%, criticalSkills 30%, resume 15%, kb 10%, roadmap 5% (mockTest excluded)
    const resumeVal = report.scores.resume || 0;
    const skillMatchVal = report.scores.skillMatch || 0;
    const criticalSkillsVal = report.scores.criticalSkills || 0;
    const kbVal = report.scores.kb || 0;
    const roadmapVal = report.scores.roadmap || 0;

    const composite = Math.round(
      (skillMatchVal      * 0.40) +
      (criticalSkillsVal   * 0.30) +
      (resumeVal          * 0.15) +
      (kbVal              * 0.10) +
      (roadmapVal         * 0.05)
    );

    report.compositeReadiness = composite;

    // 4. Update tier
    const rawTier = (
      composite >= 80 ? "interview_ready" :
      composite >= 65 ? "near_ready" :
      composite >= 45 ? "developing" :
      composite >= 25 ? "early_stage" : "needs_foundation"
    );
    report.readinessTier = rawTier;

    await report.save();
    console.log(`[ReadinessRecalculator] Successfully updated mockTest score to ${mockTestScore}% and composite to ${composite}% for session ${sessionId}`);
  } catch (err) {
    console.error('Failed to recalculate readiness score:', err.message);
  }
};
