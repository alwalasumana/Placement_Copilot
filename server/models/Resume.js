import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    sessionId:    { type: String, required: true, index: true },
    fileId:       { type: mongoose.Schema.Types.ObjectId, ref: 'UploadedFile' },
    rawText:      String,
    // LangGraph agent saves full rich structured object here
    structured:   { type: mongoose.Schema.Types.Mixed, default: null },
    // Convenience top-level fields for quick queries
    analyzedAt:   Date,
    skillCount:   Number,
    chromaIndexed:{ type: Boolean, default: false },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model('Resume', resumeSchema);
