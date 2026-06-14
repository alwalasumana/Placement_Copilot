import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAppStore = create(
  persist(
    (set, get) => ({
      // ── Auth ─────────────────────────────────────────────────────────────────
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: ({ user, token }) => set({ user, token, isAuthenticated: true }),
      clearAuth: () => set({ user: null, token: null, isAuthenticated: false }),

      // ── Theme ───────────────────────────────────────────────────────────────
      darkMode: true,
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

      // ── Upload State ─────────────────────────────────────────────────────────
      uploadedFiles: [],
      hasResume: false,
      hasJD: false,
      setUploadedFiles: (files) => set({ uploadedFiles: files }),
      setHasResume: (v) => set({ hasResume: v }),
      setHasJD: (v) => set({ hasJD: v }),

      // ── Analysis State ────────────────────────────────────────────────────────
      analysisRunning: false,
      analysisComplete: false,
      analysisError: null,
      lastAnalysisAt: null,
      setAnalysisRunning: (v) => set({ analysisRunning: v }),
      setAnalysisComplete: (results) =>
        set({
          analysisComplete: true,
          analysisRunning: false,
          analysisError: null,
          lastAnalysisAt: new Date().toISOString(),
          knowledgeBaseData: results?.knowledgeBase || null,
          resumeData: results?.resume || null,
          jdData: results?.jobDescription || null,
          skillGapData: results?.skillGap || null,
          roadmapData: results?.roadmap || null,
          readinessData: results?.readiness || null,
          mockTestData: results?.mockTest || null,
        }),
      setAnalysisError: (err) =>
        set({ analysisError: err, analysisRunning: false }),

      // ── Cached Results ────────────────────────────────────────────────────────
      knowledgeBaseData: null,
      resumeData: null,
      jdData: null,
      skillGapData: null,
      roadmapData: null,
      readinessData: null,
      mockTestData: null,

      setSkillGapData:  (d) => set({ skillGapData: d }),
      setRoadmapData:   (d) => set({ roadmapData: d }),
      setReadinessData: (d) => set({ readinessData: d }),
      setMockTestData:  (d) => set({ mockTestData: d }),

      // ── Mock Test ─────────────────────────────────────────────────────────────
      activeTest: null,
      testAnswers: {},
      testStartTime: null,
      testResult: null,

      setActiveTest: (test) =>
        set({ activeTest: test, testAnswers: {}, testStartTime: Date.now(), testResult: null }),
      setAnswer: (questionId, answer) =>
        set((s) => ({ testAnswers: { ...s.testAnswers, [questionId]: answer } })),
      setTestResult: (result) => set({ testResult: result, activeTest: null }),

      // ── Roadmap Progress ──────────────────────────────────────────────────────
      roadmapProgress: {},
      setWeekComplete: (week, completed) =>
        set((s) => ({ roadmapProgress: { ...s.roadmapProgress, [week]: completed } })),

      // ── Full Reset (on logout) ─────────────────────────────────────────────────
      resetAll: () =>
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          uploadedFiles: [],
          hasResume: false,
          hasJD: false,
          analysisComplete: false,
          analysisRunning: false,
          analysisError: null,
          knowledgeBaseData: null,
          resumeData: null,
          jdData: null,
          skillGapData: null,
          roadmapData: null,
          readinessData: null,
          mockTestData: null,
          activeTest: null,
          testAnswers: {},
          testResult: null,
          roadmapProgress: {},
        }),

      resetTargetPrep: () =>
        set({
          uploadedFiles: [],
          hasResume: false,
          hasJD: false,
          analysisComplete: false,
          analysisRunning: false,
          analysisError: null,
          knowledgeBaseData: null,
          resumeData: null,
          jdData: null,
          skillGapData: null,
          roadmapData: null,
          readinessData: null,
          mockTestData: null,
          activeTest: null,
          testAnswers: {},
          testResult: null,
          roadmapProgress: {},
        }),
    }),
    {
      name: 'placement-copilot-store',
      partialize: (state) => ({
        // persist auth + preferences + analysis cache
        user:             state.user,
        token:            state.token,
        isAuthenticated:  state.isAuthenticated,
        darkMode:         state.darkMode,
        hasResume:        state.hasResume,
        hasJD:            state.hasJD,
        analysisComplete: state.analysisComplete,
        knowledgeBaseData: state.knowledgeBaseData,
        resumeData:       state.resumeData,
        jdData:           state.jdData,
        skillGapData:     state.skillGapData,
        roadmapData:      state.roadmapData,
        readinessData:    state.readinessData,
        roadmapProgress:  state.roadmapProgress,
      }),
    }
  )
);

export default useAppStore;
