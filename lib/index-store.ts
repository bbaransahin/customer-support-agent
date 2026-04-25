import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CSV_PATH } from "@/lib/csv";
import type { EmbeddingIndex, IndexStatus } from "@/lib/types";

export const DATA_DIR = path.join(process.cwd(), ".support-agent-data");
export const INDEX_PATH = path.join(DATA_DIR, "embedding-index.json");

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readIndex(): Promise<EmbeddingIndex | null> {
  try {
    const source = await fs.readFile(INDEX_PATH, "utf8");
    return JSON.parse(source) as EmbeddingIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeIndex(index: EmbeddingIndex) {
  await ensureDataDir();
  await fs.writeFile(INDEX_PATH, JSON.stringify(index), "utf8");
}

export async function getIndexStatus(csvPath = DEFAULT_CSV_PATH): Promise<IndexStatus> {
  const [csvStat, index] = await Promise.all([fs.stat(csvPath), readIndex()]);
  if (!index) {
    return {
      exists: false,
      isFresh: false,
      csvModifiedAt: new Date(csvStat.mtimeMs).toISOString(),
      indexGeneratedAt: null,
      warning: "No local index found. Run reindex before using grounded chat.",
    };
  }

  const isFresh = index.metadata.sourceCsvMtimeMs >= csvStat.mtimeMs;
  return {
    exists: true,
    isFresh,
    csvModifiedAt: new Date(csvStat.mtimeMs).toISOString(),
    indexGeneratedAt: index.metadata.generatedAt,
    warning: isFresh ? null : "CSV is newer than the current index. Rebuild before chatting.",
  };
}
