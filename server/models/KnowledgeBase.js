import mongoose from 'mongoose';

const knowledgeBaseSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    extractedData: {
      importantTopics: [String],
      repeatedQuestions: [String],
      codingPatterns: [String],
      interviewPatterns: [String],
      frequentTechnologies: [String],
      oaPatterns: [String],
      keyConceptsByTopic: [{ topic: String, concepts: [String] }],
    },
    sourceFiles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'UploadedFile' }],
    lastIndexed: Date,
    totalChunks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('KnowledgeBase', knowledgeBaseSchema);
