import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Loads apps/server/.env.test BEFORE any test file (or its imports) touches
 * src/config/env.ts. env.ts parses process.env at import time, so this must
 * run first — hence it's wired as a vitest `setupFiles` entry rather than
 * being loaded lazily from within a test.
 *
 * We use `dotenv` directly (not `dotenv-cli`, which isn't a dependency here)
 * because dotenv-cli's `dotenv -e .env.test -- <cmd>` shells out to a
 * subprocess and can't inject vars into the same Node process vitest already
 * booted. Loading the file in-process via `config({ path })` is the simplest
 * approach that actually works with what's installed.
 */
const envTestPath = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../.env.test");
config({ path: envTestPath });
