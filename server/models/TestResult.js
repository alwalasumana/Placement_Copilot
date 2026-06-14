import mongoose from 'mongoose';

const testResultSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    testId: { type: String, required: true },
    mockTestRef: { type: mongoose.Schema.Types.ObjectId, ref: 'MockTest' },
    answers: [
      {
        questionId: String,
        userAnswer: String,
        isCorrect: Boolean,
        timeTaken: Number, // seconds
      },
    ],
    scores: {
      mcq: { obtained: Number, total: Number, percentage: Number },
      coding: { obtained: Number, total: Number, percentage: Number },
      aptitude: { obtained: Number, total: Number, percentage: Number },
      hr: { obtained: Number, total: Number, percentage: Number },
      technical: { obtained: Number, total: Number, percentage: Number },
      overall: { obtained: Number, total: Number, percentage: Number },
    },
    timeTaken: Number, // total seconds
    analysis: String, // AI-generated performance analysis
    weakTopics: [String],
    strongTopics: [String],
  },
  { timestamps: true }
);

export default mongoose.model('TestResult', testResultSchema);
