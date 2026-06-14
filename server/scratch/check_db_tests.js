import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

import { config } from 'dotenv';
config({ path: join(__dirname, '../.env') });

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import UploadedFile from '../models/UploadedFile.js';

await connectDB();

const files = await UploadedFile.find({});
console.log(`\n--- UPLOADED FILES (${files.length}) ---`);
for (const f of files) {
  console.log(`- Name: ${f.originalName}, Type: ${f.fileType}, Session: ${f.sessionId}, Indexed: ${f.indexed}, Size: ${f.size}, CreatedAt: ${f.createdAt}`);
}

mongoose.connection.close();
