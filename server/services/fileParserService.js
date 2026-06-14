import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * Parse a file and extract its text content.
 * Supports PDF, DOCX, DOC, and TXT.
 * @param {string} filePath - absolute path on disk
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
export const parseFile = async (filePath, mimeType) => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf' || mimeType === 'application/pdf') {
    return parsePDF(filePath);
  }

  if (
    ext === '.docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return parseDOCX(filePath);
  }

  if (ext === '.doc' || mimeType === 'application/msword') {
    return parseDOCX(filePath); // mammoth also handles older .doc partially
  }

  if (ext === '.txt' || mimeType === 'text/plain') {
    return parseTXT(filePath);
  }

  if (ext === '.pptx') {
    return parsePPTX(filePath);
  }

  // Fallback: try as text
  try {
    return parseTXT(filePath);
  } catch {
    throw new Error(`Unsupported file format: ${ext}`);
  }
};

const parsePDF = async (filePath) => {
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  return cleanText(data.text);
};

const parseDOCX = async (filePath) => {
  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  if (result.messages.length > 0) {
    console.warn('DOCX parse warnings:', result.messages);
  }
  return cleanText(result.value);
};

const parseTXT = async (filePath) => {
  const content = await readFile(filePath, 'utf-8');
  return cleanText(content);
};

const parsePPTX = async (filePath) => {
  // mammoth doesn't support pptx — we do a best-effort text extraction
  // using the raw XML inside the PPTX zip. For production, use a dedicated library.
  try {
    const { default: AdmZip } = await import('adm-zip').catch(() => ({ default: null }));
    if (!AdmZip) return 'PPTX parsing requires adm-zip package.';

    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    let text = '';
    for (const entry of entries) {
      if (entry.entryName.startsWith('ppt/slides/slide') && entry.entryName.endsWith('.xml')) {
        const content = entry.getData().toString('utf-8');
        // Extract text from XML tags
        const matches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        for (const m of matches) {
          text += m.replace(/<[^>]+>/g, '') + ' ';
        }
      }
    }
    return cleanText(text);
  } catch (err) {
    console.warn('PPTX parsing error:', err.message);
    return 'PPTX content could not be extracted.';
  }
};

const cleanText = (text) => {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

/**
 * Chunk text into overlapping segments for embedding
 * @param {string} text
 * @param {number} chunkSize  - characters per chunk
 * @param {number} overlap    - characters overlap between chunks
 * @returns {string[]}
 */
export const chunkText = (text, chunkSize = 1500, overlap = 200) => {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // Try to break at sentence boundary
    if (end < text.length) {
      const boundary = text.lastIndexOf('. ', end);
      if (boundary > start + chunkSize / 2) {
        end = boundary + 1;
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }
    start = end - overlap;
  }

  return chunks;
};
