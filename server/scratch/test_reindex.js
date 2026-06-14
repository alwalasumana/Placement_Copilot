import 'dotenv/config';
import dbConnect from '../config/db.js';
import { reindexKnowledge } from '../controllers/uploadController.js';
import UploadedFile from '../models/UploadedFile.js';

async function run() {
  await dbConnect();
  const sessionId = '6a2cd92a38055f0328d01927';

  console.log('Before Re-indexing:');
  const filesBefore = await UploadedFile.find({ sessionId, fileType: 'knowledge' });
  console.log(filesBefore.map(f => ({ name: f.originalName, textLength: f.extractedText?.length || 0, indexed: f.indexed })));

  console.log('\nRunning reindexKnowledge...');
  // Mock req and res
  const req = { sessionId };
  const res = {
    json: (data) => {
      console.log('Response received:', data);
    },
    status: (code) => {
      console.log('Status code set:', code);
      return res;
    }
  };

  await reindexKnowledge(req, res);

  console.log('\nAfter Re-indexing:');
  const filesAfter = await UploadedFile.find({ sessionId, fileType: 'knowledge' });
  console.log(filesAfter.map(f => ({ name: f.originalName, textLength: f.extractedText?.length || 0, indexed: f.indexed })));

  process.exit(0);
}

run().catch(console.error);
