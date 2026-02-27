"use client";
import { useState, useEffect, useCallback } from "react";

type FileType = "mpp" | "units" | "zie" | "billing" | "autopoint" | "contracts";
type ImportStatus = "pending" | "imported" | "import_failed" | "processing";

interface ImportFile {
  _id: string;
  filename: string;
  fileType: FileType;
  status: ImportStatus;
  year?: number;
  month?: number;
  recordsTotal?: number;
  recordsImported?: number;
  errorMessage?: string;
  createdAt: string;
}

interface AutoPointExport {
  _id: string;
  filename: string;
  recordCount: number;
  createdAt: string;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

function YearMonthPicker({
  year, month, onChange,
}: {
  year: number; month: number;
  onChange: (y: number, m: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <select
        value={year}
        onChange={(e) => onChange(Number(e.target.value), month)}
        className="border border-gray-300 rounded px-1 py-0.5 text-xs"
      >
        {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange(year, Number(e.target.value))}
        className="border border-gray-300 rounded px-1 py-0.5 text-xs"
      >
        {MONTH_NAMES.map((m, i) => (
          <option key={i + 1} value={i + 1}>{m}</option>
        ))}
      </select>
    </span>
  );
}

function FileSection({
  title,
  fileType,
  hasYearMonth = false,
  files,
  onRefresh,
}: {
  title: string;
  fileType: FileType;
  hasYearMonth?: boolean;
  files: ImportFile[];
  onRefresh: () => void;
}) {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress("");
    setError("");

    const CHUNK_SIZE = 1 * 1024 * 1024; // 1 MB per chunk
    const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        setUploadProgress(`${chunkIndex + 1}/${totalChunks}`);

        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
        const chunkBlob = selectedFile.slice(start, end); // lazy slice — only this 1MB is sent

        const form = new FormData();
        form.append("chunk", chunkBlob, selectedFile.name);
        form.append("uploadId", uploadId);
        form.append("chunkIndex", String(chunkIndex));
        form.append("totalChunks", String(totalChunks));
        form.append("fileType", fileType);
        if (hasYearMonth) {
          form.append("year", String(year));
          form.append("month", String(month));
        }

        // Last chunk triggers import on the server — may take longer
        if (chunkIndex === totalChunks - 1) {
          setUploadProgress("Importing…");
        }

        const res = await fetch("/api/admin/files", { method: "POST", body: form });
        if (!res.ok) {
          let errorMsg = `Chunk ${chunkIndex + 1}/${totalChunks} failed (HTTP ${res.status})`;
          try {
            const d = await res.json();
            errorMsg = d.error ?? errorMsg;
          } catch {
            const text = await res.text().catch(() => "");
            errorMsg = `Chunk ${chunkIndex + 1}/${totalChunks} failed (HTTP ${res.status}): ${text.slice(0, 200)}`;
          }
          setError(errorMsg);
          setUploading(false);
          setUploadProgress("");
          return;
        }
      }
      setSelectedFile(null);
      onRefresh();
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setUploading(false);
    setUploadProgress("");
  }

  async function handleImport(fileId: string) {
    await fetch(`/api/admin/files/${fileId}/import`, { method: "POST" });
    onRefresh();
  }

  const typeFiles = files.filter((f) => f.fileType === fileType);

  return (
    <div className="mb-8">
      <div className="bg-[#1565a8] text-white font-bold italic text-lg px-4 py-3 rounded-t">
        {title}
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b p-4 bg-white">
        {/* Upload area */}
        <p className="font-semibold text-gray-700 mb-2">
          Upload {hasYearMonth ? "a" : "an"} {title.replace(" Files", "")} file
        </p>
        {hasYearMonth && (
          <div className="mb-2">
            <YearMonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
          <span>You must select a single file with a *.csv extension</span>
          <label className="cursor-pointer border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 text-gray-700">
            Select File
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {selectedFile && (
            <>
              <span className="text-gray-700 font-medium">
                {selectedFile.name}{" "}
                <span className="text-xs text-gray-400">
                  ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB,{" "}
                  {Math.ceil(selectedFile.size / (1 * 1024 * 1024))} chunk
                  {Math.ceil(selectedFile.size / (1 * 1024 * 1024)) !== 1 ? "s" : ""})
                </span>
              </span>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="bg-[#1565a8] text-white px-3 py-1 rounded text-sm hover:bg-[#0f4f8a] disabled:opacity-50"
              >
                {uploading
                  ? uploadProgress === "Importing…"
                    ? "Importing…"
                    : uploadProgress
                      ? `Uploading… (${uploadProgress})`
                      : "Uploading…"
                  : "Upload"}
              </button>
            </>
          )}
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

        {/* Uploaded files table */}
        <p className="font-semibold text-gray-700 mt-4 mb-2">{title} Uploaded</p>
        {typeFiles.length === 0 ? (
          <p className="text-sm text-gray-400">No files uploaded yet.</p>
        ) : (
          <table className="min-w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                <th className="px-4 py-2 text-left font-semibold">Filename</th>
                <th className="px-4 py-2 text-center font-semibold">Status</th>
                <th className="px-4 py-2 text-center font-semibold">Import</th>
              </tr>
            </thead>
            <tbody>
              {typeFiles.map((f, i) => (
                <tr key={f._id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2 text-gray-700">{f.filename}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={
                      f.status === "imported" ? "text-gray-500" :
                      f.status === "import_failed" ? "text-red-600" :
                      f.status === "processing" ? "text-blue-600" :
                      "text-gray-400"
                    }>
                      {f.status === "imported"
                        ? `Imported (${f.recordsImported ?? 0}${f.recordsTotal != null ? `/${f.recordsTotal}` : ""})`
                        : f.status === "import_failed" ? "Import Failed"
                        : f.status === "processing" ? "Processing…"
                        : "Pending"}
                    </span>
                    {f.errorMessage && (
                      <div className="text-xs text-red-400 mt-0.5">{f.errorMessage}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleImport(f._id)}
                      className="text-[#1565a8] hover:underline font-semibold"
                    >
                      Import
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AutoPointSection({ exports, onRefresh }: { exports: AutoPointExport[]; onRefresh: () => void }) {
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    await fetch("/api/admin/autopoint/generate", { method: "POST" });
    setGenerating(false);
    onRefresh();
  }

  async function handleDownload(id: string, filename: string) {
    const res = await fetch(`/api/admin/autopoint/${id}/download`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove this AutoPoint file?")) return;
    await fetch(`/api/admin/autopoint/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="mb-8">
      <div className="bg-[#1565a8] text-white font-bold italic text-lg px-4 py-3 rounded-t">
        Generate an AutoPoint file
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b p-4 bg-white">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm text-gray-600">Click this button to generate an AutoPoint file:</span>
          <button
            onClick={generate}
            disabled={generating}
            className="border border-gray-300 rounded px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate AutoPoint"}
          </button>
        </div>

        <p className="font-semibold text-gray-700 mb-2">AutoPoint Files</p>
        {exports.length === 0 ? (
          <p className="text-sm text-gray-400">No files generated yet.</p>
        ) : (
          <table className="min-w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                <th className="px-4 py-2 text-left font-semibold">Filename</th>
                <th className="px-4 py-2 text-center font-semibold">Remove</th>
                <th className="px-4 py-2 text-center font-semibold">Download</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((f, i) => (
                <tr key={f._id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2 text-gray-700">{f.filename}</td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleRemove(f._id)}
                      className="text-[#1565a8] hover:underline font-semibold"
                    >
                      Remove
                    </button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => handleDownload(f._id, f.filename)}
                      className="text-[#1565a8] hover:underline font-semibold"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function AdminClient() {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [apExports, setApExports] = useState<AutoPointExport[]>([]);

  const refresh = useCallback(async () => {
    const [filesRes, apRes] = await Promise.all([
      fetch("/api/admin/files"),
      fetch("/api/admin/autopoint"),
    ]);
    const filesData = await filesRes.json();
    const apData = await apRes.json();
    setFiles(filesData.files ?? []);
    setApExports(apData.exports ?? []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Account Management */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-700 mb-3">Account Management Actions</h2>
        <div className="flex gap-4">
          <a
            href="/admin/users/new"
            className="bg-[#1565a8] text-white font-medium px-8 py-3 rounded hover:bg-[#0f4f8a] transition-colors"
          >
            Create a User
          </a>
          <a
            href="/admin/dealers/new"
            className="bg-[#1565a8] text-white font-medium px-8 py-3 rounded hover:bg-[#0f4f8a] transition-colors"
          >
            Create a Dealership
          </a>
        </div>
      </div>

      {/* File upload sections */}
      <FileSection title="Customer Contracts (ZAKCNTRCTS)" fileType="contracts" files={files} onRefresh={refresh} />
      <FileSection title="MPP Files" fileType="mpp" files={files} onRefresh={refresh} />
      <FileSection title="Units Files" fileType="units" hasYearMonth files={files} onRefresh={refresh} />
      <FileSection title="ZIE Files" fileType="zie" hasYearMonth files={files} onRefresh={refresh} />
      <FileSection title="Billing Files" fileType="billing" hasYearMonth files={files} onRefresh={refresh} />
      <FileSection title="AutoPoint Results" fileType="autopoint" hasYearMonth files={files} onRefresh={refresh} />

      {/* AutoPoint generation */}
      <AutoPointSection exports={apExports} onRefresh={refresh} />
    </div>
  );
}
