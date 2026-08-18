import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// This dashboard is meant to run locally, next to the rest of the Sentinel
// repo (`cd dashboard && npm run dev`) — it shells out to the already-tested
// `sentinel-scan` CLI rather than re-implementing scan logic here, so the
// dashboard and CLI can never drift out of sync with each other.
const REPO_ROOT = path.resolve(process.cwd(), "..");
const CLI_PATH = path.join(REPO_ROOT, "bin", "sentinel-scan.js");

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const targetDir =
    typeof body.targetDir === "string" && body.targetDir.trim() ? body.targetDir.trim() : "sample-app";
  const checkPackages = body.checkPackages !== false;
  const minConfidence = typeof body.minConfidence === "number" ? body.minConfidence : 0.5;

  // Scanning is a filesystem read of whatever path is given, same as running
  // the CLI directly by hand — this route is for local/trusted use only and
  // should not be exposed to untrusted users without adding access control.
  const resolvedTarget = path.isAbsolute(targetDir) ? targetDir : path.join(REPO_ROOT, targetDir);

  const args = [CLI_PATH, resolvedTarget, "--format", "json", "--min-confidence", String(minConfidence)];
  if (!checkPackages) args.push("--no-packages");

  try {
    const { stdout } = await execFileAsync("node", args, { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    return Response.json(JSON.parse(stdout));
  } catch (err) {
    // sentinel-scan exits 1 when CRITICAL findings are present — that's a
    // successful scan with bad news, not a failure. Node's promisified
    // execFile still attaches stdout/stderr to the rejection in that case.
    if (err.stdout) {
      try {
        return Response.json(JSON.parse(err.stdout));
      } catch {
        // fall through — stdout wasn't valid JSON, treat as a real failure
      }
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}
