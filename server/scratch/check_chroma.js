import 'dotenv/config';
import { getChromaStatus, listAllCollections, getCollection } from '../services/chromaService.js';

async function run() {
  console.log('=== Checking ChromaDB Contents ===');
  
  const status = await getChromaStatus();
  console.log('ChromaDB Status:', JSON.stringify(status, null, 2));

  if (!status.available) {
    console.error('ChromaDB is not available. Make sure Chroma is running.');
    process.exit(1);
  }

  const collections = await listAllCollections();
  console.log(`\nFound ${collections.length} Collections:`);
  for (const col of collections) {
    console.log(` - Name: ${col.name} (ID: ${col.id})`);
    
    try {
      // Query collection size
      const colInst = await getCollection(col.name);
      const count = await colInst.count();
      console.log(`   Total items: ${count}`);

      // Fetch the actual documents stored in the collection
      // ChromaDB REST API `/collections/{id}/get` allows fetching documents
      // Let's use chromaFetch internally or perform direct fetch
      const url = `${process.env.CHROMA_URL || 'http://localhost:8000'}/api/v2/tenants/default_tenant/databases/default_database/collections/${col.id}/get`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }) // fetch first 5 documents
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log(`   Sample Documents (up to 5):`);
        if (data.documents && data.documents.length > 0) {
          data.documents.forEach((doc, idx) => {
            console.log(`     [${idx + 1}] Metadata:`, JSON.stringify(data.metadatas?.[idx] || {}));
            console.log(`         Content: "${doc.substring(0, 150)}..."`);
          });
        } else {
          console.log(`     No documents found.`);
        }
      } else {
        // Try fallback to v1 path
        const fallbackUrl = `${process.env.CHROMA_URL || 'http://localhost:8000'}/api/v1/collections/${col.id}/get`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 5 })
        });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          console.log(`   Sample Documents (up to 5):`);
          data.documents?.forEach((doc, idx) => {
            console.log(`     [${idx + 1}] Metadata:`, JSON.stringify(data.metadatas?.[idx] || {}));
            console.log(`         Content: "${doc.substring(0, 150)}..."`);
          });
        } else {
          console.log(`   Failed to retrieve documents: HTTP ${res.status}`);
        }
      }
    } catch (err) {
      console.error(`   Error querying collection details:`, err.message);
    }
    console.log('-'.repeat(50));
  }

  process.exit(0);
}

run().catch(console.error);
