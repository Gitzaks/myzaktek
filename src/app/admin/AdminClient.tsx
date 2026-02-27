"use client";
import { useState, useEffect, useCallback, useRef } from "react";

type FileType = "mpp" | "units" | "zie" | "billing" | "autopoint" | "contracts" | "dealers";
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
  processedRows?: number;
  errorMessage?: string;
  importErrors?: string[];
  createdAt: string;
}

interface AutoPointExport {
  _id: string;
  filename: string;
  recordCount: number;
  createdAt: string;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function parseYearMonthFromFilename(filename: string): { year: number; month: number } | null {
  let m = filename.match(/(?<!\d)(\d{2})\.(\d{4})(?!\d)/);
  if (m) {
    const month = parseInt(m[1]), year = parseInt(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  m = filename.match(/(\d{4})[-_](\d{2})/);
  if (m) {
    const year = parseInt(m[1]), month = parseInt(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  m = filename.match(/(?<!\d)(\d{4})(\d{2})(?!\d)/);
  if (m) {
    const year = parseInt(m[1]), month = parseInt(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  return null;
}

const FILE_TYPE_LABELS: Record<FileType, string> = {
  dealers: "Dealer List",
  contracts: "Customer Contracts",
  mpp: "MPP",
  units: "Units",
  zie: "ZIE",
  billing: "Billing",
  autopoint: "AutoPoint Results",
};

const FILE_TYPE_HAS_DATE: Record<FileType, boolean> = {
  dealers: false, contracts: false, mpp: false,
  units: true, zie: true, billing: true, autopoint: true,
};

const FILE_TYPE_YEAR_ONLY = new Set<FileType>(["autopoint"]);

function parseYearFromFilename(filename: string): number | null {
  const m = filename.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1]) : null;
}

function parseFileTypeFromFilename(filename: string): FileType | null {
  const upper = filename.toUpperCase();
  if (upper.includes("ZAKCNTRCTS") || upper.includes("CONTRACTS") || upper.includes("CNTRCTS")) return "contracts";
  if (upper.includes("DEALERS") || upper.includes("DEALER_MASTER") || upper.includes("DEALERMASTER")) return "dealers";
  if (upper.includes("AUTOPOINT") || upper.includes("AUTOPNT") || upper.includes("AUTO_POINT")) return "autopoint";
  if (upper.includes("BILLING")) return "billing";
  if (upper.includes("UNITS") || upper.includes("UNIT_")) return "units";
  if (upper.includes("_ZIE") || upper.includes("ZIE_") || /[^A-Z]ZIE[^A-Z]/.test(upper) || upper.startsWith("ZIE") || upper.endsWith("ZIE.CSV") || upper.endsWith("ZIE.XLSX")) return "zie";
  if (upper.includes("MPP")) return "mpp";
  return null;
}

// ── SSE Progress types ──────────────────────────────────────────────────────

interface StreamState {
  fileId: string;
  pct: number;
  message: string;
}

// ── Chunk upload helper ─────────────────────────────────────────────────────

async function uploadChunks(
  file: File,
  fileType: string,
  hasDate: boolean,
  hasYearOnly: boolean,
  parsedDate: { year: number; month: number } | null,
  detectedYear: number | null,
  onChunkProgress: (label: string) => void,
): Promise<string> {
  const CHUNK_SIZE  = 1 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId    = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (let ci = 0; ci < totalChunks; ci++) {
    onChunkProgress(`chunk ${ci + 1}/${totalChunks}`);
    const start = ci * CHUNK_SIZE;
    const form  = new FormData();
    form.append("chunk", file.slice(start, Math.min(start + CHUNK_SIZE, file.size)), file.name);
    form.append("uploadId", uploadId);
    form.append("chunkIndex", String(ci));
    form.append("fileType", fileType);
    const res = await fetch("/api/admin/files", { method: "POST", body: form });
    if (!res.ok) {
      let msg = `chunk ${ci + 1}/${totalChunks} failed (HTTP ${res.status})`;
      try { const d = await res.json(); msg = d.error ?? msg; } catch { /* ignore */ }
      throw new Error(msg);
    }
  }

  onChunkProgress("Finalizing upload…");
  const finalizeForm = new FormData();
  finalizeForm.append("uploadId", uploadId);
  finalizeForm.append("finalize", "true");
  finalizeForm.append("filename", file.name);
  finalizeForm.append("fileType", fileType);
  if (hasDate && parsedDate) {
    finalizeForm.append("year", String(parsedDate.year));
    finalizeForm.append("month", String(parsedDate.month));
  } else if (hasYearOnly) {
    const yr = detectedYear ?? parsedDate?.year;
    if (yr) finalizeForm.append("year", String(yr));
  }

  const finalizeRes = await fetch("/api/admin/files", { method: "POST", body: finalizeForm });
  if (!finalizeRes.ok) {
    let msg = `Finalize failed (HTTP ${finalizeRes.status})`;
    try { const d = await finalizeRes.json(); msg = d.error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = await finalizeRes.json() as { fileId: string };
  return data.fileId;
}

// ── SSE helper ──────────────────────────────────────────────────────────────

function openImportStream(
  fileId: string,
  onProgress: (state: StreamState) => void,
  onDone: () => void,
  onError: (msg: string) => void,
): EventSource {
  const es = new EventSource(`/api/admin/files/${fileId}/import/stream`);

  es.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data) as {
        type: string;
        pct?: number;
        message?: string;
        recordsImported?: number;
        recordsTotal?: number;
      };
      if (ev.type === "progress") {
        onProgress({ fileId, pct: ev.pct ?? 0, message: ev.message ?? "Importing…" });
      } else if (ev.type === "done" || ev.type === "start") {
        if (ev.type === "done") { es.close(); onDone(); }
      } else if (ev.type === "error") {
        es.close();
        onError(ev.message ?? "Import failed");
      }
    } catch { /* ignore parse errors */ }
  };

  es.onerror = () => {
    es.close();
    onError("Connection to import stream lost — check the status table.");
  };

  return es;
}

// ── BatchUploadSection ──────────────────────────────────────────────────────

interface BatchItem {
  file: File;
  detectedType: FileType | null;
  detectedDate: { year: number; month: number } | null;
  result: null | "uploading" | "importing" | "done" | string;
  pct?: number;
}

function BatchUploadSection({ onRefresh }: { onRefresh: () => void }) {
  const [items, setItems]               = useState<BatchItem[]>([]);
  const [uploading, setUploading]       = useState(false);
  const [currentIdx, setCurrentIdx]     = useState<number>(-1);
  const [chunkProgress, setChunkProgress] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setItems(list.map((file) => ({
      file,
      detectedType: parseFileTypeFromFilename(file.name),
      detectedDate: parseYearMonthFromFilename(file.name),
      result: null,
    })));
    e.target.value = "";
  }

  function setItemType(idx: number, type: FileType) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, detectedType: type } : it));
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadOneFile(item: BatchItem, idx: number) {
    const { file, detectedType, detectedDate } = item;
    const fileType    = detectedType!;
    const hasDate     = FILE_TYPE_HAS_DATE[fileType] && !FILE_TYPE_YEAR_ONLY.has(fileType);
    const hasYearOnly = FILE_TYPE_YEAR_ONLY.has(fileType);

    const fileId = await uploadChunks(
      file, fileType, hasDate, hasYearOnly, detectedDate, parseYearFromFilename(file.name),
      (label) => setChunkProgress(label),
    );

    // Open SSE stream and wait for completion
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, result: "importing", pct: 0 } : it));
    await new Promise<void>((resolve, reject) => {
      const es = openImportStream(
        fileId,
        ({ pct }) => {
          setItems((prev) => prev.map((it, i) => i === idx ? { ...it, pct } : it));
          setChunkProgress(`${pct}%`);
        },
        () => { resolve(); },
        (msg) => { reject(new Error(msg)); },
      );
      // Store so we can close on unmount if needed
      return es;
    });
  }

  async function handleUpload() {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.detectedType) {
        alert(`Cannot detect file type for "${it.file.name}". Please select it manually.`);
        return;
      }
      if (FILE_TYPE_HAS_DATE[it.detectedType] && !FILE_TYPE_YEAR_ONLY.has(it.detectedType) && !it.detectedDate) {
        alert(`Cannot detect month/year from "${it.file.name}". Rename to include MM.YYYY (e.g. 05.2025_ZIE.csv).`);
        return;
      }
    }

    setUploading(true);
    setCurrentIdx(0);

    for (let i = 0; i < items.length; i++) {
      setCurrentIdx(i);
      setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, result: "uploading" } : it));
      try {
        await uploadOneFile(items[i], i);
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, result: "done" } : it));
        onRefresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, result: msg } : it));
      }
    }

    setUploading(false);
    setCurrentIdx(-1);
    setChunkProgress("");
  }

  const readyCount = items.filter((it) => {
    if (!it.detectedType) return false;
    if (!FILE_TYPE_HAS_DATE[it.detectedType]) return true;
    if (FILE_TYPE_YEAR_ONLY.has(it.detectedType)) return true;
    return !!it.detectedDate;
  }).length;

  return (
    <div className="mb-8">
      <div className="bg-[#1565a8] text-white font-bold italic text-lg px-4 py-3 rounded-t">
        Batch Upload (Multiple Files)
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b p-4 bg-white">
        <p className="text-sm text-gray-600 mb-3">
          Select multiple files at once. File type and month/year are auto-detected from the filename
          (e.g. <span className="font-mono">05.2025_ZIE.csv</span>). You can override the type manually before uploading.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <label className="cursor-pointer border border-gray-300 rounded px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
            Select Files
            <input type="file" accept=".csv,.xls,.xlsx" multiple className="hidden"
              onChange={handleFileChange} disabled={uploading} />
          </label>
          {items.length > 0 && (
            <button onClick={handleUpload} disabled={uploading || readyCount === 0}
              className="bg-[#1565a8] text-white px-4 py-2 rounded text-sm hover:bg-[#0f4f8a] disabled:opacity-50">
              {uploading
                ? `${currentIdx + 1}/${items.length} — ${chunkProgress}`
                : `Upload ${readyCount} file${readyCount !== 1 ? "s" : ""}`}
            </button>
          )}
          {items.length > 0 && !uploading && (
            <button onClick={() => setItems([])} className="text-sm text-gray-500 hover:text-gray-700 underline">
              Clear
            </button>
          )}
        </div>

        {items.length > 0 && (
          <table className="min-w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead>
              <tr className="bg-gray-100 text-gray-600">
                <th className="px-3 py-2 text-left font-semibold">Filename</th>
                <th className="px-3 py-2 text-left font-semibold">File Type</th>
                <th className="px-3 py-2 text-left font-semibold">Period</th>
                <th className="px-3 py-2 text-center font-semibold">Status</th>
                <th className="px-3 py-2 text-center font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={it.file.name}>
                    {it.file.name}
                    <span className="ml-1 text-xs text-gray-400">
                      ({(it.file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <select value={it.detectedType ?? ""} onChange={(e) => setItemType(i, e.target.value as FileType)}
                      disabled={uploading}
                      className={`border rounded px-2 py-1 text-xs focus:outline-none ${it.detectedType ? "border-gray-300 text-gray-700" : "border-red-400 text-red-600"}`}>
                      {!it.detectedType && <option value="">— select type —</option>}
                      {(Object.keys(FILE_TYPE_LABELS) as FileType[]).map((t) => (
                        <option key={t} value={t}>{FILE_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {it.detectedType && FILE_TYPE_HAS_DATE[it.detectedType] ? (
                      FILE_TYPE_YEAR_ONLY.has(it.detectedType) ? (
                        <span className="text-green-700">
                          {it.detectedDate?.year ?? parseYearFromFilename(it.file.name) ?? "year?"} — months from tabs
                        </span>
                      ) : it.detectedDate ? (
                        <span className="text-green-700">{MONTH_NAMES[it.detectedDate.month - 1]} {it.detectedDate.year}</span>
                      ) : (
                        <span className="text-red-600">not detected</span>
                      )
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-xs">
                    {it.result === null     && <span className="text-gray-400">Pending</span>}
                    {it.result === "uploading" && <span className="text-blue-600">Uploading…</span>}
                    {it.result === "importing" && (
                      <span className="text-blue-600">Importing… {it.pct ?? 0}%</span>
                    )}
                    {it.result === "done"   && <span className="text-green-700">Done</span>}
                    {it.result !== null && it.result !== "uploading" && it.result !== "importing" && it.result !== "done" && (
                      <span className="text-red-600" title={it.result}>Failed</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {!uploading && (
                      <button onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700 text-xs">
                        Remove
                      </button>
                    )}
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

// ── FileSection ─────────────────────────────────────────────────────────────

function FileSection({
  title, fileType, hasYearMonth = false, hasYearOnly = false, files, onRefresh,
}: {
  title: string;
  fileType: FileType;
  hasYearMonth?: boolean;
  hasYearOnly?: boolean;
  files: ImportFile[];
  onRefresh: () => void;
}) {
  const [parsedDate, setParsedDate]       = useState<{ year: number; month: number } | null>(null);
  const [detectedYear, setDetectedYear]   = useState<number | null>(null);
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [showErrorsId, setShowErrorsId]   = useState<string | null>(null);
  const [error, setError]                 = useState("");
  const [stream, setStream]               = useState<StreamState | null>(null);
  const esRef                             = useRef<EventSource | null>(null);

  // Cleanup EventSource on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  // Light poll only for files that are "processing" without an active SSE stream
  // (e.g. page was refreshed mid-import from a previous session).
  const typeFiles     = files.filter((f) => f.fileType === fileType);
  const stuckProcessing = typeFiles.some(
    (f) => f.status === "processing" && stream?.fileId !== f._id,
  );
  useEffect(() => {
    if (!stuckProcessing) return;
    const id = setInterval(() => { onRefresh(); }, 5000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stuckProcessing]);

  function connectStream(fileId: string) {
    esRef.current?.close();
    setStream({ fileId, pct: 0, message: "Starting import…" });

    const es = openImportStream(
      fileId,
      (s) => setStream(s),
      () => { esRef.current = null; setStream(null); onRefresh(); },
      (msg) => {
        esRef.current = null;
        setStream(null);
        setError(msg);
        onRefresh();
      },
    );
    esRef.current = es;
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (error) return;
    if (hasYearMonth && !parsedDate) {
      setError("Could not detect month/year — rename the file to include YYYYMM.");
      return;
    }
    setUploading(true);
    setUploadProgress("");
    setError("");

    try {
      const fileId = await uploadChunks(
        selectedFile, fileType, hasYearMonth, hasYearOnly, parsedDate, detectedYear,
        (label) => setUploadProgress(label),
      );
      setSelectedFile(null);
      onRefresh();
      connectStream(fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setUploading(false);
    setUploadProgress("");
  }

  async function handleImport(fileId: string) {
    const res = await fetch(`/api/admin/files/${fileId}/import`, { method: "POST" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setError(d.error ?? `Import failed (HTTP ${res.status})`);
      return;
    }
    onRefresh();
    connectStream(fileId);
  }

  async function handleReset(fileId: string) {
    await fetch(`/api/admin/files/${fileId}`, { method: "PATCH" });
    onRefresh();
  }

  async function handleRemove(fileId: string) {
    if (!confirm("Delete this import record?")) return;
    await fetch(`/api/admin/files/${fileId}`, { method: "DELETE" });
    onRefresh();
  }

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
        {hasYearMonth && selectedFile && (
          <div className="mb-2 text-xs">
            {parsedDate
              ? <span className="text-green-700">Detected: {MONTH_NAMES[parsedDate.month - 1]} {parsedDate.year}</span>
              : <span className="text-red-600">Could not detect month/year — rename file to include YYYYMM (e.g. FILE_202501.csv)</span>}
          </div>
        )}
        {hasYearOnly && selectedFile && (
          <div className="mb-2 text-xs">
            {detectedYear
              ? <span className="text-green-700">Year {detectedYear} detected — months will be read from each sheet tab</span>
              : <span className="text-gray-500">No year detected in filename — year will be read from sheet tab names</span>}
          </div>
        )}
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
          <span>You must select a single .csv, .xls, or .xlsx file</span>
          <label className="cursor-pointer border border-gray-300 rounded px-3 py-1 hover:bg-gray-50 text-gray-700">
            Select File
            <input type="file" accept=".csv,.xls,.xlsx" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setSelectedFile(f);
                setError("");
                if (f) {
                  if (hasYearMonth) setParsedDate(parseYearMonthFromFilename(f.name));
                  if (hasYearOnly)  setDetectedYear(parseYearFromFilename(f.name));
                  const detected = parseFileTypeFromFilename(f.name);
                  if (detected && detected !== fileType) {
                    setError(`Wrong file: "${f.name}" looks like a ${FILE_TYPE_LABELS[detected]} file. This section is for ${FILE_TYPE_LABELS[fileType]} files.`);
                  }
                }
              }} />
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
              <button onClick={handleUpload} disabled={uploading || !!error}
                className="bg-[#1565a8] text-white px-3 py-1 rounded text-sm hover:bg-[#0f4f8a] disabled:opacity-50">
                {uploading
                  ? uploadProgress || "Uploading…"
                  : "Upload"}
              </button>
            </>
          )}
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

        {/* Files table */}
        <p className="font-semibold text-gray-700 mt-4 mb-2">{title} Uploaded</p>
        {typeFiles.length === 0 ? (
          <p className="text-sm text-gray-400">No files uploaded yet.</p>
        ) : (
          <table className="min-w-full text-sm border border-gray-200 rounded overflow-hidden">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                <th className="px-4 py-2 text-left font-semibold">Filename</th>
                <th className="px-4 py-2 text-left font-semibold">Uploaded</th>
                <th className="px-4 py-2 text-center font-semibold">Status</th>
                <th className="px-4 py-2 text-center font-semibold">Import</th>
                <th className="px-4 py-2 text-center font-semibold">Remove</th>
              </tr>
            </thead>
            <tbody>
              {typeFiles.map((f, i) => {
                const isStreaming = stream?.fileId === f._id;
                const timedOut   =
                  f.status === "processing" &&
                  !isStreaming &&
                  Date.now() - new Date(f.createdAt).getTime() > 10 * 60 * 1000;

                return (
                  <tr key={f._id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2 text-gray-700">{f.filename}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(f.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {/* Status text */}
                      {(() => {
                        const dbPct =
                          !isStreaming &&
                          f.status === "processing" &&
                          f.recordsTotal &&
                          f.processedRows != null
                            ? Math.round((f.processedRows / f.recordsTotal) * 100)
                            : null;
                        return (
                          <>
                            <span className={
                              f.status === "imported"      ? "text-gray-500" :
                              f.status === "import_failed" ? "text-red-600"  :
                              timedOut                     ? "text-orange-500":
                              isStreaming || f.status === "processing" ? "text-blue-600" :
                              "text-gray-400"
                            }>
                              {f.status === "imported"
                                ? `Imported (${f.recordsImported ?? 0}${f.recordsTotal != null ? `/${f.recordsTotal}` : ""})`
                                : f.status === "import_failed" ? "Import Failed"
                                : timedOut ? "Timed out — click Import to retry"
                                : isStreaming
                                  ? `Importing… ${stream.pct}%`
                                : f.status === "processing"
                                  ? dbPct != null ? `Processing… ${dbPct}%` : "Processing…"
                                : "Pending"}
                            </span>

                            {/* Progress bar — live when streaming, DB-backed when polling */}
                            {(isStreaming || (f.status === "processing" && !isStreaming && dbPct != null)) && (
                              <div className="mt-1.5 w-full min-w-[220px]">
                                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-300 ${isStreaming ? "bg-[#1565a8]" : "bg-blue-300"}`}
                                    style={{ width: `${isStreaming ? stream.pct : dbPct}%` }}
                                  />
                                </div>
                                {isStreaming && stream.message && (
                                  <div className="text-xs text-gray-500 mt-0.5 text-left truncate max-w-[260px]"
                                    title={stream.message}>
                                    {stream.message}
                                  </div>
                                )}
                                {!isStreaming && dbPct != null && (
                                  <div className="text-xs text-gray-400 mt-0.5 text-left">
                                    Running in background — refreshing…
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}

                      {timedOut && (
                        <button onClick={() => handleReset(f._id)}
                          className="ml-2 text-orange-600 hover:underline text-xs font-semibold">
                          Reset
                        </button>
                      )}

                      {f.errorMessage && (
                        <div className="text-xs text-red-400 mt-0.5">
                          {f.errorMessage}
                          {f.importErrors && f.importErrors.length > 0 && (
                            <button
                              onClick={() => setShowErrorsId(showErrorsId === f._id ? null : f._id)}
                              className="ml-2 underline text-red-500 hover:text-red-700">
                              {showErrorsId === f._id ? "Hide" : "View"}
                            </button>
                          )}
                        </div>
                      )}
                      {showErrorsId === f._id && f.importErrors && (
                        <div className="text-left mt-1 max-h-40 overflow-y-auto bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 space-y-0.5">
                          {f.importErrors.map((e, idx) => <div key={idx}>{e}</div>)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => handleImport(f._id)}
                        disabled={isStreaming || f.status === "processing"}
                        className="text-[#1565a8] hover:underline font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                        Import
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleRemove(f._id)}
                        className="text-red-500 hover:underline font-semibold">
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── AutoPointSection ────────────────────────────────────────────────────────

function AutoPointSection({ exports, onRefresh }: { exports: AutoPointExport[]; onRefresh: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState("");

  async function generate() {
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/admin/autopoint/generate", { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setGenError((d as { error?: string }).error ?? `Generation failed (HTTP ${res.status})`);
        return;
      }
      const data = await res.json() as { _id: string; filename: string };
      await handleDownload(data._id, data.filename);
      onRefresh();
    } catch (err) {
      setGenError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(id: string, filename: string) {
    const res  = await fetch(`/api/admin/autopoint/${id}/download`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
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
          <button onClick={generate} disabled={generating}
            className="border border-gray-300 rounded px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
            {generating ? "Generating…" : "Generate AutoPoint"}
          </button>
        </div>
        {genError && <p className="text-red-600 text-sm mb-4">{genError}</p>}

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
                    <button onClick={() => handleRemove(f._id)}
                      className="text-[#1565a8] hover:underline font-semibold">Remove</button>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => handleDownload(f._id, f.filename)}
                      className="text-[#1565a8] hover:underline font-semibold">Download</button>
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

// ── AdminClient (root) ──────────────────────────────────────────────────────

export default function AdminClient() {
  const [files, setFiles]         = useState<ImportFile[]>([]);
  const [apExports, setApExports] = useState<AutoPointExport[]>([]);
  const [fixingNames, setFixingNames]   = useState(false);
  const [fixNamesResult, setFixNamesResult] = useState("");

  const refresh = useCallback(async () => {
    const [filesRes, apRes] = await Promise.all([
      fetch("/api/admin/files"),
      fetch("/api/admin/autopoint"),
    ]);
    const filesData = await filesRes.json() as { files?: ImportFile[] };
    const apData    = await apRes.json()    as { exports?: AutoPointExport[] };
    setFiles(filesData.files ?? []);
    setApExports(apData.exports ?? []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function fixDealerNames() {
    setFixingNames(true);
    setFixNamesResult("");
    try {
      const res  = await fetch("/api/admin/migrate/fix-dealer-names", { method: "POST" });
      const data = await res.json() as { message?: string };
      setFixNamesResult(data.message ?? (res.ok ? "Done." : "Failed."));
    } catch {
      setFixNamesResult("Network error.");
    }
    setFixingNames(false);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Account Management */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-gray-700 mb-3">Account Management Actions</h2>
        <div className="flex gap-4">
          <a href="/admin/users/new"
            className="bg-[#1565a8] text-white font-medium px-8 py-3 rounded hover:bg-[#0f4f8a] transition-colors">
            Create a User
          </a>
          <a href="/admin/dealers/new"
            className="bg-[#1565a8] text-white font-medium px-8 py-3 rounded hover:bg-[#0f4f8a] transition-colors">
            Create a Dealership
          </a>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={fixDealerNames} disabled={fixingNames}
            className="bg-orange-600 text-white font-medium px-6 py-2 rounded hover:bg-orange-700 disabled:opacity-50 text-sm">
            {fixingNames ? "Fixing…" : "Fix Dealer Names"}
          </button>
          {fixNamesResult && <span className="text-sm text-gray-600">{fixNamesResult}</span>}
        </div>
      </div>

      {/* File upload sections */}
      <FileSection title="Dealer List"                      fileType="dealers"   files={files} onRefresh={refresh} />
      <FileSection title="Customer Contracts (ZAKCNTRCTS)" fileType="contracts" files={files} onRefresh={refresh} />
      <FileSection title="MPP Files"                        fileType="mpp"       files={files} onRefresh={refresh} />
      <FileSection title="Units Files"    hasYearMonth      fileType="units"     files={files} onRefresh={refresh} />
      <FileSection title="ZIE Files"      hasYearMonth      fileType="zie"       files={files} onRefresh={refresh} />
      <FileSection title="Billing Files"  hasYearMonth      fileType="billing"   files={files} onRefresh={refresh} />
      <FileSection title="AutoPoint Results" hasYearOnly    fileType="autopoint" files={files} onRefresh={refresh} />

      {/* Batch upload */}
      <BatchUploadSection onRefresh={refresh} />

      {/* AutoPoint generation */}
      <AutoPointSection exports={apExports} onRefresh={refresh} />
    </div>
  );
}
