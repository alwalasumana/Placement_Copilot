import mongoose from 'mongoose';

const mockTestSchema = new mongoose.Schema(
  {
    sessionId:    { type: String, required: true, index: true },
    testId:       { type: String, unique: true, sparse: true },
    title:        String,
    role:         String,
    company:      String,
    // LangGraph agent saves richer sections and questions here
    sections:     { type: mongoose.Schema.Types.Mixed, default: {} },
    allQuestions: { type: mongoose.Schema.Types.Mixed, default: [] },
    metadata:     { type: mongoose.Schema.Types.Mixed, default: {} },
    totalQuestions: Number,
    totalMarks:     Number,
    totalTimeMinutes: Number,
    status: { type: String, enum: ['generated', 'taken', 'archived'], default: 'generated' },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model('MockTest', mockTestSchema);
