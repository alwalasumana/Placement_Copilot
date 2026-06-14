import mongoose from 'mongoose';

const skillGapSchema = new mongoose.Schema(
  {
    sessionId:     { type: String, required: true, index: true },
    candidateName: String,
    role:          String,
    company:       String,

    // Core skill lists
    resumeSkills:       { type: [String], default: [] },
    jdSkills:           { type: [String], default: [] },
    matchedSkills:      { type: mongoose.Schema.Types.Mixed, default: [] },
    partialMatches:     { type: mongoose.Schema.Types.Mixed, default: [] },
    missingCritical:    { type: mongoose.Schema.Types.Mixed, default: [] },
    missingPreferred:   { type: mongoose.Schema.Types.Mixed, default: [] },
    extraSkills:        { type: [String], default: [] },

    // Scores
    matchPercentage:          Number,
    criticalMatchPercentage:  Number,
    compositeScore:           Number,
    overallFit:               String,

    // Analysis
    gapCategories:             { type: mongoose.Schema.Types.Mixed, default: {} },
    priorityGaps:              { type: mongoose.Schema.Types.Mixed, default: [] },
    strengthsToLeverage:       { type: mongoose.Schema.Types.Mixed, default: [] },
    quickWins:                 { type: mongoose.Schema.Types.Mixed, default: [] },
    redFlags:                  { type: [String], default: [] },
    preparationAdvice:         String,
    hiringProbabilityNow:      Number,
    hiringProbabilityPrepared: Number,

    analysisTimestamp: String,
    warnings:          { type: [String], default: [] },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model('SkillGap', skillGapSchema);
