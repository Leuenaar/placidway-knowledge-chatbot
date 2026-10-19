/* ============================================================================
 * PETA FILE
 * FILE    : packages/embed/src/e5.ts
 * TUJUAN  : Embedder asli: multilingual-e5-small versi ONNX (384 dimensi,
 *           sekitar 100 bahasa), jalan di CPU mesin sendiri lewat
 *           @huggingface/transformers. Tidak ada teks yang keluar dari mesin.
 *           Model dimuat pada pemakaian pertama (unduh sekitar 118 MB untuk
 *           q8).
 * BAGIAN  : (di kode, cari tulisan BAGIAN n dengan Ctrl+F)
 *    1. Awalan wajib e5: 'passage: ' untuk teks, 'query: ' untuk pertanyaan
 *    2. Opsi: model, presisi (q8 atau fp32), folder cache, ukuran batch
 *    3. Tipe pembantu pipeline
 *    4. Pembuat embedder e5: memuat model, memproses batch, normalisasi
 * KALAU DIMINTA MENGUBAH:
 *    - Mengganti model atau presisi (q8 ke fp32): lihat nilai bawaan di
 *      createE5Embedder (BAGIAN 4)
 * ============================================================================ */

import { l2normalize } from "./math.js";
import { DB_VECTOR_DIMS, type Embedder } from "./types.js";

// ===== BAGIAN 1: Awalan wajib e5: 'passage: ' untuk teks, 'query: ' untuk pertanyaan =====
/** multilingual-e5 needs these prefixes: "passage: " in front of stored text and "query: " in front of a question. */
export const PASSAGE_PREFIX = "passage: ";
export const QUERY_PREFIX = "query: ";

// ===== BAGIAN 2: Opsi: model, presisi (q8 atau fp32), folder cache, ukuran batch =====
export interface E5Options {
  /** Hugging Face model id. Default is the ONNX build of multilingual-e5-small (384 dimensions, about 100 languages). */
  model?: string;
  /** "q8" (default) is a 118 MB file; "fp32" is the most exact but 470 MB, which matters on a small server. */
  dtype?: "fp32" | "q8";
  /** Folder where the model files are kept after the first download. */
  cacheDir?: string;
  /** How many texts go through the model at once. */
  batchSize?: number;
}

// ===== BAGIAN 3: Tipe pembantu pipeline =====
type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

// ===== BAGIAN 4: Pembuat embedder e5: memuat model, memproses batch, normalisasi =====
/**
 * The real embedder. The model is loaded the first time it is used (a few seconds, plus a download of
 * about 118 MB on the very first run with the default q8), and runs on the CPU of this machine. No text leaves the machine.
 */
export function createE5Embedder(options: E5Options = {}): Embedder {
  const model = options.model ?? "Xenova/multilingual-e5-small";
  const dtype = options.dtype ?? "q8";
  const batchSize = options.batchSize ?? 16;
  let loading: Promise<Extractor> | undefined;

  const load = (): Promise<Extractor> => {
    loading ??= (async () => {
      const tf = await import("@huggingface/transformers");
      if (options.cacheDir) tf.env.cacheDir = options.cacheDir;
      return (await tf.pipeline("feature-extraction", model, { dtype })) as unknown as Extractor;
    })();
    return loading;
  };

  const run = async (inputs: string[]): Promise<number[][]> => {
    const extractor = await load();
    const out: number[][] = [];
    for (let i = 0; i < inputs.length; i += batchSize) {
      const res = await extractor(inputs.slice(i, i + batchSize), { pooling: "mean", normalize: true });
      for (const row of res.tolist()) {
        if (row.length !== DB_VECTOR_DIMS) throw new Error(`model returned ${row.length} dimensions, the database expects ${DB_VECTOR_DIMS}`);
        out.push(l2normalize(row));
      }
    }
    return out;
  };

  return {
    model: `${model}@${dtype}`,
    dims: DB_VECTOR_DIMS,
    embedPassages: (texts) => run(texts.map((t) => PASSAGE_PREFIX + t)),
    embedQuery: async (text) => (await run([QUERY_PREFIX + text]))[0]!,
  };
}
