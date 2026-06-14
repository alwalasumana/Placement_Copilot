/**
 * chromaService.js — Direct HTTP client for ChromaDB (all versions)
 *
 * Handles all ChromaDB server versions automatically:
 *
 *  Version       API prefix   Collections path
 *  ──────────    ──────────   ──────────────────────────────────────────────
 *  0.3.x / 0.4  /api/v1/     /api/v1/collections
 *  0.5.x        /api/v1/     /api/v1/tenants/<t>/databases/<d>/collections
 *  0.6.x+       /api/v2/     /api/v2/tenants/<t>/databases/<d>/collections
 *
 * Detection order:
 *   1. Ping /api/v1/heartbeat, then /api/v2/heartbeat  → sets _apiVersion
 *   2. Try GET /collections (simple path)              → sets _pathFormat = 'simple'
 *   3. Fallback to tenant-scoped path                  → sets _pathFormat = 'tenant'
 *
 * ChromaDB never serves a web page at /.
 * GET localhost:8000/ always returns 404 — that is NORMAL.
 */

import { generateEmbedding, generateEmbeddingsBatch } from './geminiService.js';
import { v4 as uuidv4 } from 'uuid';

// ─── Config ───────────────────────────────────────────────────────────────────

const CHROMA_BASE    = () => process.env.CHROMA_URL || 'http://localhost:8000';
const DEFAULT_TENANT = 'default_tenant';
const DEFAULT_DB     = 'default_database';

const COLLECTIONS = {
  knowledge: process.env.CHROMA_COLLECTION_KNOWLEDGE || 'placement_knowledge',
  resume:    process.env.CHROMA_COLLECTION_RESUME    || 'placement_resume',
  jd:        process.env.CHROMA_COLLECTION_JD        || 'placement_jd',
};

// ─── State ────────────────────────────────────────────────────────────────────

let _available   = null;      // null | true | false
let _apiVersion  = null;      // 'v1' | 'v2'
let _pathFormat  = null;      // 'simple' | 'tenant'
const _colIds    = new Map(); // collectionName → id cache

// ─── Internal helpers ─────────────────────────────────────────────────────────

const base = () => `${CHROMA_BASE()}/api/${_apiVersion || 'v1'}`;

/** Prefix for collection-related endpoints based on detected path format */
const colPrefix = () =>
  _pathFormat === 'tenant'
    ? `/tenants/${DEFAULT_TENANT}/databases/${DEFAULT_DB}/collections`
    : '/collections';

const colActionPath = (colId, action) =>
  _pathFormat === 'tenant'
    ? `/tenants/${DEFAULT_TENANT}/databases/${DEFAULT_DB}/collections/${colId}/${action}`
    : `/collections/${colId}/${action}`;

const chromaFetch = async (method, path, body = null) => {
  const url  = `${base()}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal:  AbortSignal.timeout(10_000),
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ChromaDB ${method} ${path} → ${res.status}: ${text.substring(0, 300)}`);
  }
  const text = await res.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
};

// ─── Step 1: detect API version (/api/v1 vs /api/v2) ─────────────────────────

const detectApiVersion = async () => {
  for (const ver of ['v1', 'v2']) {
    try {
      const res = await fetch(
        `${CHROMA_BASE()}/api/${ver}/heartbeat`,
        { signal: AbortSignal.timeout(3_000) }
      );
      if (res.ok) { _apiVersion = ver; return ver; }
    } catch { /* try next */ }
  }
  return null;
};

// ─── Step 2: detect path format (simple vs tenant-scoped) ────────────────────

const detectPathFormat = async () => {
  if (_pathFormat) return _pathFormat;

  // Try simple path first (older ChromaDB 0.4.x)
  try {
    const res = await fetch(
      `${base()}/collections`,
      { signal: AbortSignal.timeout(3_000) }
    );
    if (res.ok) { _pathFormat = 'simple'; return 'simple'; }
  } catch { /* try next */ }

  // Try tenant-scoped path (ChromaDB 0.5+ / 0.6+)
  try {
    const res = await fetch(
      `${base()}/tenants/${DEFAULT_TENANT}/databases/${DEFAULT_DB}/collections`,
      { signal: AbortSignal.timeout(3_000) }
    );
    if (res.ok) { _pathFormat = 'tenant'; return 'tenant'; }
  } catch { /* try next */ }

  // Neither worked — ChromaDB is running but incompatible
  return null;
};

// ─── Public: availability check ───────────────────────────────────────────────

export const isChromaAvailable = async () => {
  if (_available === true)  return true;
  if (_available === false) return false;

  const ver = await detectApiVersion();
  if (!ver) {
    _available = false;
    console.warn(`⚠️  ChromaDB not reachable at ${CHROMA_BASE()} — uploads still work (MongoDB only)`);
    return false;
  }

  const fmt = await detectPathFormat();
  if (!fmt) {
    _available = false;
    console.warn(`⚠️  ChromaDB reachable (API ${ver}) but no working collections endpoint found`);
    return false;
  }

  _available = true;
  console.log(`✅ ChromaDB connected — API ${_apiVersion}, path: ${fmt === 'tenant' ? 'tenant-scoped' : 'simple'}`);
  return true;
};

export const resetChromaState = (force = false) => {
  _available  = null;
  if (force) {
    _apiVersion = null;
    _pathFormat = null;
    _colIds.clear();
  }
};

// ─── Public: status for health endpoint ──────────────────────────────────────

export const getChromaStatus = async () => {
  resetChromaState();

  const ver = await detectApiVersion();
  if (!ver) {
    return {
      available: false,
      url:  CHROMA_BASE(),
      note: 'ChromaDB not reachable. Start it: chroma run --path ./chroma-data --port 8000',
      tip:  'GET localhost:8000/ always returns 404 — that is normal. Real endpoint: /api/v1/heartbeat',
    };
  }

  const fmt = await detectPathFormat();
  if (!fmt) {
    return {
      available:  false,
      url:        CHROMA_BASE(),
      apiVersion: ver,
      error:      `Heartbeat OK but no collections endpoint found (tried /collections and tenant-scoped path)`,
    };
  }

  try {
    const path = colPrefix();
    const cols = await chromaFetch('GET', path);
    const list = Array.isArray(cols) ? cols : (cols?.collections || []);
    _available = true;
    return {
      available:       true,
      url:             CHROMA_BASE(),
      apiVersion:      _apiVersion,
      pathFormat:      _pathFormat,
      collectionsPath: `${base()}${path}`,
      collectionCount: list.length,
      collections:     list.map(c => ({ name: c.name, id: c.id })),
      message:         `ChromaDB connected (API ${_apiVersion}, ${_pathFormat} paths). ${list.length} collection(s) found.`,
    };
  } catch (err) {
    _available = false;
    return { available: false, url: CHROMA_BASE(), apiVersion: ver, error: err.message };
  }
};

// ─── Get or create collection — returns collection ID ─────────────────────────

const getOrCreateCollection = async (collectionName) => {
  if (_colIds.has(collectionName)) return _colIds.get(collectionName);

  const prefix = colPrefix();

  // Try GET first
  try {
    const col = await chromaFetch('GET', `${prefix}/${encodeURIComponent(collectionName)}`);
    _colIds.set(collectionName, col.id);
    return col.id;
  } catch (err) {
    if (!err.message.includes('404') && !err.message.includes('does not exist')) throw err;
  }

  // Create
  const payload = { name: collectionName, metadata: { 'hnsw:space': 'cosine' } };

  // Newer ChromaDB requires get_or_create flag
  try {
    const col = await chromaFetch('POST', prefix, { ...payload, get_or_create: true });
    _colIds.set(collectionName, col.id);
    return col.id;
  } catch {
    // Fallback: create without flag
    const col = await chromaFetch('POST', prefix, payload);
    _colIds.set(collectionName, col.id);
    return col.id;
  }
};

// ─── Exported collection object (used by KB agent) ────────────────────────────

export const getCollection = async (collectionName) => {
  if (!(await isChromaAvailable())) throw new Error('ChromaDB unavailable');
  const id = await getOrCreateCollection(collectionName);
  return {
    id,
    name: collectionName,
    count: async () => {
      const res = await chromaFetch('GET', colActionPath(id, 'count'));
      return typeof res === 'number' ? res : 0;
    },
    add: async ({ ids, embeddings, documents, metadatas }) =>
      chromaFetch('POST', colActionPath(id, 'add'), { ids, embeddings, documents, metadatas }),
    query: async ({ queryEmbeddings, nResults }) =>
      chromaFetch('POST', colActionPath(id, 'query'), {
        query_embeddings: queryEmbeddings,
        n_results:        nResults,
      }),
  };
};

// ─── Index Chunks ─────────────────────────────────────────────────────────────

export const indexChunks = async (chunks, metadatas, collectionType, sessionId) => {
  if (!chunks?.length)             return 0;
  if (!(await isChromaAvailable())) return 0;

  const colName = `${COLLECTIONS[collectionType]}_${sessionId}`;
  const colId   = await getOrCreateCollection(colName);

  const BATCH = 20;
  let indexed = 0;

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batchChunks = chunks.slice(i, i + BATCH);
    const batchMeta   = metadatas.slice(i, i + BATCH);
    const embeddings  = await generateEmbeddingsBatch(batchChunks);
    const ids         = batchChunks.map(() => uuidv4());

    await chromaFetch('POST', colActionPath(colId, 'add'), {
      ids, embeddings, documents: batchChunks, metadatas: batchMeta,
    });
    indexed += batchChunks.length;
  }
  return indexed;
};

// ─── Query Collection ─────────────────────────────────────────────────────────

export const queryCollection = async (query, collectionType, sessionId, nResults = 10) => {
  const empty = { documents: [], metadatas: [], distances: [] };
  if (!(await isChromaAvailable())) return empty;

  const colName = `${COLLECTIONS[collectionType]}_${sessionId}`;
  try {
    const colId          = await getOrCreateCollection(colName);
    const queryEmbedding = await generateEmbedding(query);
    const results        = await chromaFetch('POST', colActionPath(colId, 'query'), {
      query_embeddings: [queryEmbedding],
      n_results:        nResults,
    });
    return {
      documents: results.documents?.[0] || [],
      metadatas: results.metadatas?.[0] || [],
      distances: results.distances?.[0] || [],
    };
  } catch (err) {
    console.error(`ChromaDB query error (${colName}):`, err.message);
    return empty;
  }
};

// ─── Multi-Query ──────────────────────────────────────────────────────────────

export const multiQuery = async (queries, collectionType, sessionId, nResultsEach = 5) => {
  if (!(await isChromaAvailable())) return { documents: [], metadatas: [] };
  const allDocs = new Map();
  for (const query of queries) {
    const { documents, metadatas } = await queryCollection(query, collectionType, sessionId, nResultsEach);
    documents.forEach((doc, i) => { if (doc && !allDocs.has(doc)) allDocs.set(doc, metadatas[i]); });
  }
  return { documents: [...allDocs.keys()], metadatas: [...allDocs.values()] };
};

// ─── Clear Collection ─────────────────────────────────────────────────────────

export const clearCollection = async (collectionType, sessionId) => {
  if (!(await isChromaAvailable())) return false;
  const colName = `${COLLECTIONS[collectionType]}_${sessionId}`;
  try {
    await chromaFetch('DELETE', `${colPrefix()}/${encodeURIComponent(colName)}`);
    _colIds.delete(colName);
    return true;
  } catch (err) {
    console.warn(`Could not clear ${colName}:`, err.message);
    return false;
  }
};

// ─── Collection Stats ─────────────────────────────────────────────────────────

export const getCollectionStats = async (collectionType, sessionId) => {
  const colName = `${COLLECTIONS[collectionType]}_${sessionId}`;
  if (!(await isChromaAvailable())) return { name: colName, count: 0, available: false };
  try {
    const colId = await getOrCreateCollection(colName);
    const count = await chromaFetch('GET', colActionPath(colId, 'count'));
    return { name: colName, count: typeof count === 'number' ? count : 0, available: true };
  } catch {
    return { name: colName, count: 0, available: false };
  }
};

// ─── List All Collections (used by /health/chroma) ───────────────────────────

export const listAllCollections = async () => {
  if (!(await isChromaAvailable())) return [];
  try {
    const cols = await chromaFetch('GET', colPrefix());
    return Array.isArray(cols) ? cols : (cols?.collections || []);
  } catch {
    return [];
  }
};
