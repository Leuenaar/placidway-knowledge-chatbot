/* ============================================================================
 * FILE MAP
 * FILE    : packages/embed/src/e5.ts
 * PURPOSE : Real embedder: the ONNX version of multilingual-e5-small (384
 *           dimensions, about 100 languages), running on the CPU of the
 *           machine itself through @huggingface/transformers. No text leaves
 *           the machine. The model is loaded on first use (a download of about
 *           118 MB for q8).
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Required e5 prefixes: 'passage: ' for text, 'query: ' for questions
 *    2. Options: model, precision (q8 or fp32), cache folder, batch size
 *    3. Pipeline helper types
 *    4. Builder of the e5 embedder: load the model, process batches, normalise
 * IF ASKED TO CHANGE:
 *    - Change the model or the precision (q8 to fp32): see the defaults in
 *      createE5Embedder (PART 4)
 * ============================================================================ */

import { l2normalize } from "./math.js";
import { DB_VECTOR_DIMS, type Embedder } from "./types.js";

// ===== PART 1: Required e5 prefixes: 'passage: ' for text, 'query: ' for questions =====
/** multilingual-e5 needs these prefixes: "passage: " in front of stored text and "query: " in front of a question. */
export const PASSAGE_PREFIX = "passage: ";
export const QUERY_PREFIX = "query: ";

// ===== PART 2: Options: model, precision (q8 or fp32), cache folder, batch size =====
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

// ===== PART 3: Pipeline helper types =====
type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

// ===== PART 4: Builder of the e5 embedder: load the model, process batches, normalise =====
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
