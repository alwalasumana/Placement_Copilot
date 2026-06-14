import path from 'path';
import fs from 'fs';
import UploadedFile from '../models/UploadedFile.js';
import Resume from '../models/Resume.js';
import JobDescription from '../models/JobDescription.js';
import Roadmap from '../models/Roadmap.js';
import { parseFile, chunkText } from '../services/fileParserService.js';
import { indexChunks, clearCollection, getCollectionStats } from '../services/chromaService.js';

/**
 * Try ChromaDB indexing but NEVER fail the upload if it errors.
 * Returns { indexed: number, error: string|null }
 */
const tryIndex = async (chunks, metadatas, collectionType, sessionId) => {
  try {
    const count = await indexChunks(chunks, metadatas, collectionType, sessionId);
    return { indexed: count, error: null };
  } catch (err) {
    console.warn(`⚠️  ChromaDB indexing skipped (${collectionType}): ${err.message}`);
    return { indexed: 0, error: err.message };
  }
};

// ─── Upload Knowledge Base Files ─────────────────────────────────────────────
export const uploadKnowledgeFiles = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    if (!req.files?.length) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const results = [];

    for (const file of req.files) {
      try {
        // 1. Parse text from file
        const text = await parseFile(file.path, file.mimetype);

        // 2. Save to MongoDB (always succeeds even without ChromaDB)
        const dbFile = await UploadedFile.create({
          sessionId,
          originalName: file.originalname,
          storedName: file.filename,
          fileType: 'knowledge',
          mimeType: file.mimetype,
          size: file.size,
          extractedText: text,
          parsed: true,
          indexed: false,
        });

        // 3. Try ChromaDB indexing (optional — won't fail the upload)
        const chunks = chunkText(text);
        const metadatas = chunks.map((_, i) => ({
          fileId: dbFile._id.toString(),
          fileName: file.originalname,
          chunkIndex: i,
          sessionId,
          fileType: 'knowledge',
        }));

        const { indexed, error: indexError } = await tryIndex(chunks, metadatas, 'knowledge', sessionId);

        if (indexed > 0) {
          await UploadedFile.findByIdAndUpdate(dbFile._id, { indexed: true });
        }

        results.push({
          fileId: dbFile._id,
          originalName: file.originalname,
          size: file.size,
          textLength: text.length,
          chunks: indexed,
          indexed: indexed > 0,
          indexWarning: indexError,
          status: 'success',
        });
      } catch (fileError) {
        try { fs.unlinkSync(file.path); } catch {}
        results.push({
          originalName: file.originalname,
          error: fileError.message,
          status: 'failed',
        });
      }
    }

    const stats = await tryGetStats('knowledge', sessionId);
    const succeeded = results.filter(r => r.status === 'success').length;

    res.json({
      success: true,
      message: `Uploaded ${succeeded}/${req.files.length} files successfully`,
      results,
      chromaStats: stats,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Upload Resume ────────────────────────────────────────────────────────────
export const uploadResume = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const file = req.file;

    // 1. Parse text
    const text = await parseFile(file.path, file.mimetype);
    if (!text || text.length < 20) {
      return res.status(400).json({ success: false, error: 'Could not extract text from the file. Please upload a valid resume.' });
    }

    // 2. Save uploaded file record
    const dbFile = await UploadedFile.create({
      sessionId,
      originalName: file.originalname,
      storedName: file.filename,
      fileType: 'resume',
      mimeType: file.mimetype,
      size: file.size,
      extractedText: text,
      parsed: true,
      indexed: false,
    });

    // 3. Create/update resume record
    const resume = await Resume.findOneAndUpdate(
      { sessionId },
      { sessionId, fileId: dbFile._id, rawText: text, structured: {} },
      { upsert: true, new: true }
    );

    // 4. Try ChromaDB indexing (optional)
    const chunks = chunkText(text, 800, 100);
    const metadatas = chunks.map((_, i) => ({
      fileId: dbFile._id.toString(),
      type: 'resume',
      chunkIndex: i,
      sessionId,
    }));
    const { indexed } = await tryIndex(chunks, metadatas, 'resume', sessionId);
    if (indexed > 0) {
      await UploadedFile.findByIdAndUpdate(dbFile._id, { indexed: true });
    }

    res.json({
      success: true,
      message: 'Resume uploaded successfully. Run analysis to extract skills and data.',
      fileId: dbFile._id,
      resumeId: resume._id,
      textLength: text.length,
      preview: text.substring(0, 300),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Upload Job Description ───────────────────────────────────────────────────
export const uploadJobDescription = async (req, res) => {
  try {
    const sessionId = req.sessionId;

    let text = '';
    let fileId = null;

    if (req.file) {
      text = await parseFile(req.file.path, req.file.mimetype);

      const dbFile = await UploadedFile.create({
        sessionId,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        fileType: 'jd',
        mimeType: req.file.mimetype,
        size: req.file.size,
        extractedText: text,
        parsed: true,
        indexed: false,
      });
      fileId = dbFile._id;

      // Try to index
      const chunks = chunkText(text, 800, 100);
      const metadatas = chunks.map((_, i) => ({ type: 'jd', chunkIndex: i, sessionId }));
      const { indexed } = await tryIndex(chunks, metadatas, 'jd', sessionId);
      if (indexed > 0) {
        await UploadedFile.findByIdAndUpdate(dbFile._id, { indexed: true });
      }
    } else if (req.body?.text) {
      text = req.body.text.trim();
      if (text.length < 20) {
        return res.status(400).json({ success: false, error: 'Job description text is too short' });
      }

      // Index the text-only JD too
      const chunks = chunkText(text, 800, 100);
      const metadatas = chunks.map((_, i) => ({ type: 'jd', chunkIndex: i, sessionId }));
      await tryIndex(chunks, metadatas, 'jd', sessionId);
    } else {
      return res.status(400).json({ success: false, error: 'No file or text provided' });
    }

    const preparationTime = req.body?.preparationTime ? Number(req.body.preparationTime) : null;
    const preparationTimeUnit = req.body?.preparationTimeUnit || 'weeks';

    // Save/update JD record
    const jd = await JobDescription.findOneAndUpdate(
      { sessionId },
      { sessionId, fileId, rawText: text, structured: {}, preparationTime, preparationTimeUnit },
      { upsert: true, new: true }
    );

    // Delete existing roadmap since JD changed
    await Roadmap.deleteOne({ sessionId });

    res.json({
      success: true,
      message: 'Job description saved successfully. Run analysis to extract requirements.',
      jdId: jd._id,
      textLength: text.length,
      preview: text.substring(0, 300),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get Uploaded Files ───────────────────────────────────────────────────────
export const getUploadedFiles = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const files = await UploadedFile.find({ sessionId }).sort({ createdAt: -1 }).select('-extractedText');
    const knowledgeStats = await tryGetStats('knowledge', sessionId);
    res.json({ success: true, files, knowledgeStats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Delete File ──────────────────────────────────────────────────────────────
export const deleteFile = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { fileId } = req.params;

    const file = await UploadedFile.findOneAndDelete({ _id: fileId, sessionId });
    if (!file) return res.status(404).json({ success: false, error: 'File not found' });

    // Delete the physical file
    try {
      const { getUploadDir } = await import('../middleware/upload.js');
      const filePath = path.join(getUploadDir(), file.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Re-index Knowledge Base ──────────────────────────────────────────────────
export const reindexKnowledge = async (req, res) => {
  try {
    const sessionId = req.sessionId;

    try { await clearCollection('knowledge', sessionId); } catch {}

    const { getUploadDir } = await import('../middleware/upload.js');
    const uploadDir = getUploadDir();

    const files = await UploadedFile.find({ sessionId, fileType: 'knowledge' });
    let totalChunks = 0;
    let errors = 0;

    for (const file of files) {
      let text = file.extractedText;

      const isWarning = text && (
        text.includes('requires adm-zip package') ||
        text.includes('content could not be extracted') ||
        text.length < 50
      );

      if (!text || isWarning) {
        try {
          const filePath = path.join(uploadDir, file.storedName);
          if (fs.existsSync(filePath)) {
            const newText = await parseFile(filePath, file.mimeType);
            if (newText && newText.length >= 20 && !newText.includes('requires adm-zip package')) {
              text = newText;
              file.extractedText = newText;
              file.parsed = true;
              await file.save();
            }
          }
        } catch (err) {
          console.warn(`Failed to re-parse file ${file.originalName}:`, err.message);
        }
      }

      if (!text) continue;
      const chunks = chunkText(text);
      const metadatas = chunks.map((_, i) => ({
        fileId: file._id.toString(),
        fileName: file.originalName,
        chunkIndex: i,
        sessionId,
        fileType: 'knowledge',
      }));
      const { indexed } = await tryIndex(chunks, metadatas, 'knowledge', sessionId);
      if (indexed > 0) {
        await UploadedFile.findByIdAndUpdate(file._id, { indexed: true });
        totalChunks += indexed;
      } else {
        errors++;
      }
    }

    res.json({
      success: true,
      message: totalChunks > 0
        ? `Re-indexed ${files.length} files with ${totalChunks} chunks`
        : `Files saved but ChromaDB indexing failed (${errors} files). Ensure ChromaDB is running.`,
      filesProcessed: files.length,
      totalChunks,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get Resume Data ──────────────────────────────────────────────────────────
export const getResumeData = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const resume = await Resume.findOne({ sessionId }).select('-rawText');
    if (!resume) {
      return res.status(404).json({ success: false, error: 'No resume uploaded yet' });
    }
    res.json({ success: true, data: resume });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Get JD Data ──────────────────────────────────────────────────────────────
export const getJDData = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const jd = await JobDescription.findOne({ sessionId }).select('-rawText');
    if (!jd) {
      return res.status(404).json({ success: false, error: 'No job description uploaded yet' });
    }
    res.json({ success: true, data: jd });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─── Internal helper ──────────────────────────────────────────────────────────
const tryGetStats = async (collectionType, sessionId) => {
  try {
    return await getCollectionStats(collectionType, sessionId);
  } catch {
    return { count: 0 };
  }
};

// ─── Update JD Timeframe ──────────────────────────────────────────────────────
export const updateJDTimeframe = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { preparationTime, preparationTimeUnit } = req.body;

    if (preparationTime === undefined) {
      return res.status(400).json({ success: false, error: 'preparationTime is required' });
    }

    const jd = await JobDescription.findOneAndUpdate(
      { sessionId },
      { sessionId, preparationTime: Number(preparationTime), preparationTimeUnit: preparationTimeUnit || 'weeks' },
      { upsert: true, new: true }
    );

    // Delete existing roadmap since preparation timeframe changed
    await Roadmap.deleteOne({ sessionId });

    res.json({
      success: true,
      message: 'Preparation timeframe updated successfully. Please re-run analysis to generate new roadmap.',
      preparationTime: jd.preparationTime,
      preparationTimeUnit: jd.preparationTimeUnit
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
