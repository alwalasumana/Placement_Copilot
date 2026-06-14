import mongoose from 'mongoose';

const uploadedFileSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    fileType: {
      type: String,
      enum: ['knowledge', 'resume', 'jd'],
      required: true,
    },
    mimeType: String,
    size: Number,
    parsed: { type: Boolean, default: false },
    indexed: { type: Boolean, default: false },
    extractedText: String,
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model('UploadedFile', uploadedFileSchema);
