import mongoose from 'mongoose';

const readinessReportSchema = new mongoose.Schema(
  {
    sessionId:     { type: String, required: true, index: true },
    candidateName: String,
    role:          String,
    company:       String,

    // Composite score
    compositeReadiness: Number,
    readinessTier: {
      type: String,
      enum: ['interview_ready', 'near_ready', 'developing', 'early_stage', 'needs_foundation'],
    },

    // Sub-scores
    scores: {
      resume:         Number,
      skillMatch:     Number,
      criticalSkills: Number,
      kb:             Number,
      mockTest:       Number,
      roadmap:        Number,
    },

    // Analysis
    executiveSummary:        String,
    readinessBreakdown:      { type: mongoose.Schema.Types.Mixed, default: {} },
    topStrengths:            { type: mongoose.Schema.Types.Mixed, default: [] },
    criticalGapsToFix:       { type: mongoose.Schema.Types.Mixed, default: [] },
    immediateActions:        { type: mongoose.Schema.Types.Mixed, default: [] },
    interviewRoundReadiness: { type: mongoose.Schema.Types.Mixed, default: {} },
    timelineToReadiness:     { type: mongoose.Schema.Types.Mixed, default: {} },
    motivationalNote:        String,

    // Probabilities
    hiringProbabilityNow:      Number,
    hiringProbabilityPrepared: Number,

    generatedAt: String,
    warnings:    { type: [String], default: [] },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model('ReadinessReport', readinessReportSchema);
