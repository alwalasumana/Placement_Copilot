import mongoose from 'mongoose';

const roadmapSchema = new mongoose.Schema(
  {
    sessionId:      { type: String, required: true, index: true },
    candidateName:  String,
    role:           String,
    company:        String,
    totalWeeks:     Number,
    overallTheme:   String,

    // LangGraph agent saves rich nested data here
    preparationPhases: { type: mongoose.Schema.Types.Mixed, default: [] },
    dailySchedule:     { type: mongoose.Schema.Types.Mixed, default: {} },
    milestones:        { type: mongoose.Schema.Types.Mixed, default: [] },
    successMetrics:    { type: mongoose.Schema.Types.Mixed, default: {} },
    weeks:             { type: mongoose.Schema.Types.Mixed, default: [] },
    resources:         { type: mongoose.Schema.Types.Mixed, default: {} },

    // Probability trajectory
    startingScore:           Number,
    targetScore:             Number,
    hiringProbabilityStart:  Number,
    hiringProbabilityEnd:    Number,

    // Progress tracking
    currentWeek:         { type: Number, default: 1 },
    progressPercentage:  { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active' },

    generatedAt: String,
    warnings:    { type: [String], default: [] },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model('Roadmap', roadmapSchema);
