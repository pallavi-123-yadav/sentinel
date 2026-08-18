"use client";

import { useState } from "react";

const SEVERITY_STYLES = {
  CRITICAL:
    "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  MEDIUM:
    "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  LOW: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

export default function Home() {
  const [targetDir, setTargetDir] = useState("sample-app");
  const [checkPackages, setCheckPackages] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  async function runScan(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDir, checkPackages }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Scan failed.");
      setData(json);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const counts = data ? countBySeverity(data.confident) : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        <header>
          <p className="font-mono text-sm tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
            Sentinel &middot; Guardian
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Security Scan Dashboard</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Scans a project for hardcoded secrets, missing auth checks, and hallucinated packages.
          </p>
        </header>

        <form
          onSubmit={runScan}
          className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-sm font-medium" htmlFor="targetDir">
              Folder to scan (relative to the repo root)
            </label>
            <input
              id="targetDir"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder="sample-app"
              className="w-full rounded border border-slate-300 bg-transparent px-3 py-2 font-mono text-sm dark:border-slate-700"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checkPackages}
              onChange={(e) => setCheckPackages(e.target.checked)}
            />
            Check for hallucinated packages (needs internet)
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Run scan"}
          </button>
        </form>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total issues" value={data.confident.length} />
              <StatCard label="Critical" value={counts.CRITICAL || 0} />
              <StatCard label="High" value={counts.HIGH || 0} />
              <StatCard label="Review manually" value={data.lowConfidence.length} />
            </div>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Findings</h2>
              <FindingsTable findings={data.confident} />
            </section>

            {data.lowConfidence.length > 0 && (
              <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <summary className="cursor-pointer font-medium">
                  {data.lowConfidence.length} low-confidence finding(s) — likely false positives
                </summary>
                <div className="mt-4">
                  <FindingsTable findings={data.lowConfidence} compact />
                </div>
              </details>
            )}

            {data.unverified.length > 0 && (
              <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <summary className="cursor-pointer font-medium">
                  {data.unverified.length} package(s) could not be verified
                </summary>
                <ul className="mt-3 space-y-1 font-mono text-sm">
                  {data.unverified.map(({ pkg, error: pkgError }, i) => (
                    <li key={i}>
                      {pkg.name} ({pkg.ecosystem}): {pkgError}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {data.confident.length === 0 && data.lowConfidence.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400">No issues found. Clean scan.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function countBySeverity(findings) {
  return findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function FindingsTable({ findings, compact }) {
  if (findings.length === 0) {
    return <p className="text-slate-500 dark:text-slate-400">No issues found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <tr>
            <th className="px-4 py-2">Severity</th>
            <th className="px-4 py-2">Finding</th>
            <th className="px-4 py-2">Location</th>
            {!compact && <th className="px-4 py-2">Confidence</th>}
          </tr>
        </thead>
        <tbody>
          {findings.map((f, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td className="px-4 py-2">
                <SeverityBadge severity={f.severity} />
              </td>
              <td className="px-4 py-2">{f.label}</td>
              <td className="px-4 py-2 font-mono text-xs">
                {f.file}
                {f.line ? `:${f.line}` : ""}
              </td>
              {!compact && <td className="px-4 py-2">{Math.round((f.confidence ?? 1) * 100)}%</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeverityBadge({ severity }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLES[severity] || ""}`}
    >
      {severity}
    </span>
  );
}
