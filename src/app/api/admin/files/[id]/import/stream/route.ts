import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import ChunkBuffer from "@/models/ChunkBuffer";
import { runImport } from "@/lib/importers";

// 300 s is the Vercel Pro maximum; on self-hosted Node.js there is no cap.
export const maxDuration = 300;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { id } = await params;
  const importFile = await ImportFile.findById(id);
  if (!importFile) {
    return NextResponse.json({ error: "Import record not found" }, { status: 404 });
  }

  // Assemble buffer from chunked upload or existing fileData
  let buffer: Buffer | undefined;
  if (importFile.storagePath?.startsWith("mongodb-chunk:")) {
    const uploadId = importFile.storagePath.replace("mongodb-chunk:", "");
    const chunks = await ChunkBuffer.find({ uploadId }).sort({ chunkIndex: 1 });
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "File chunks not found — please re-upload the file." },
        { status: 404 },
      );
    }
    buffer = Buffer.concat(chunks.map((c) => c.data));
    // Clean up chunks immediately — they're no longer needed
    await ChunkBuffer.deleteMany({ uploadId });
  } else if (importFile.fileData) {
    buffer = Buffer.from(importFile.fileData);
  } else {
    return NextResponse.json(
      { error: "File data not found — please re-upload the file." },
      { status: 404 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Helper — swallows errors if the client has already disconnected
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected — continue importing silently
        }
      }

      let lastDbSave = Date.now();

      try {
        importFile.status = "processing";
        importFile.processedRows = 0;
        importFile.errorMessage = undefined;
        await importFile.save();

        send({ type: "start" });

        const result = await runImport(
          importFile,
          buffer,
          async (processed, total, message) => {
            // Skip sending if client disconnected (but still update DB)
            if (!req.signal?.aborted) {
              send({
                type: "progress",
                processed,
                total,
                pct: total > 0 ? Math.round((processed / total) * 100) : 0,
                message: message ?? `Processing ${processed.toLocaleString()} / ${total.toLocaleString()} rows`,
              });
            }
            // Throttle DB saves to every 5 seconds
            importFile.processedRows = processed;
            if (!importFile.recordsTotal && total) importFile.recordsTotal = total;
            if (Date.now() - lastDbSave >= 5000) {
              await importFile.save();
              lastDbSave = Date.now();
            }
          },
        );

        importFile.status = "imported";
        importFile.recordsImported = result.recordsImported;
        importFile.recordsTotal = result.recordsTotal;
        importFile.processedRows = result.recordsTotal;
        importFile.importErrors = result.errors ?? [];
        importFile.errorMessage =
          result.errors && result.errors.length > 0
            ? `${result.errors.length} row(s) had errors`
            : undefined;
        await importFile.save();

        send({
          type: "done",
          recordsImported: result.recordsImported,
          recordsTotal: result.recordsTotal,
          errors: result.errors,
        });
      } catch (err) {
        importFile.status = "import_failed";
        importFile.errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        await importFile.save();
        send({ type: "error", message: importFile.errorMessage });
      }

      try {
        controller.close();
      } catch {
        // Already closed if client disconnected
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
