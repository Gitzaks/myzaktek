import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import ChunkBuffer from "@/models/ChunkBuffer";

export const maxDuration = 300;

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const files = await ImportFile.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ files });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await connectDB();

    const formData = await req.formData();

    const uploadId = formData.get("uploadId") as string | null;

    // ── Finalize request ──────────────────────────────────────────────────────
    // Sent after all chunks are stored. Creates an ImportFile with status
    // "pending" and returns the fileId immediately. The client then opens an
    // SSE connection to /api/admin/files/[id]/import/stream which assembles
    // the chunks and runs the import with live progress.
    if (uploadId && formData.get("finalize") === "true") {
      const filename = formData.get("filename") as string;
      const fileType = formData.get("fileType") as string;

      const fnLower = filename?.toLowerCase();
      if (!filename || (!fnLower.endsWith(".csv") && !fnLower.endsWith(".xls") && !fnLower.endsWith(".xlsx"))) {
        await ChunkBuffer.deleteMany({ uploadId });
        return NextResponse.json({ error: "Only .csv, .xls, and .xlsx files are allowed" }, { status: 400 });
      }
      if (!fileType) {
        await ChunkBuffer.deleteMany({ uploadId });
        return NextResponse.json({ error: "fileType is required" }, { status: 400 });
      }

      const year  = formData.get("year")  ? Number(formData.get("year"))  : undefined;
      const month = formData.get("month") ? Number(formData.get("month")) : undefined;

      const importFile = await ImportFile.create({
        filename,
        fileType,
        status: "pending",   // SSE stream route will set this to "processing"
        uploadedBy: session.user.id,
        year,
        month,
        storagePath: `mongodb-chunk:${uploadId}`,
      });

      // Return fileId so the client can open the SSE stream immediately
      return NextResponse.json(
        { processing: true, fileId: String(importFile._id) },
        { status: 202 },
      );
    }

    // ── Chunk storage ─────────────────────────────────────────────────────────
    const chunkIndexStr = formData.get("chunkIndex") as string | null;
    if (uploadId && chunkIndexStr !== null) {
      const chunk = formData.get("chunk") as File | null;
      if (!chunk) {
        return NextResponse.json({ error: "chunk is required" }, { status: 400 });
      }
      const chunkIndex = Number(chunkIndexStr);
      const chunkData  = Buffer.from(await chunk.arrayBuffer());
      await ChunkBuffer.create({ uploadId, chunkIndex, data: chunkData });
      return NextResponse.json({ received: chunkIndex + 1 }, { status: 200 });
    }

    // ── Legacy non-chunked path ───────────────────────────────────────────────
    // Kept for backwards compatibility; new uploads always use chunks.
    const file     = formData.get("file") as File | null;
    const fileType = formData.get("fileType") as string;
    const year     = formData.get("year")  ? Number(formData.get("year"))  : undefined;
    const month    = formData.get("month") ? Number(formData.get("month")) : undefined;

    if (!file || !fileType) {
      return NextResponse.json({ error: "file and fileType are required" }, { status: 400 });
    }

    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith(".csv") && !nameLower.endsWith(".xls") && !nameLower.endsWith(".xlsx")) {
      return NextResponse.json({ error: "Only .csv, .xls, and .xlsx files are allowed" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const importFile = await ImportFile.create({
      filename: file.name,
      fileType,
      status: "pending",
      uploadedBy: session.user.id,
      year,
      month,
      storagePath: `mongodb-direct:${Date.now()}`,
      fileData: buffer,
    });

    return NextResponse.json(
      { processing: true, fileId: String(importFile._id) },
      { status: 202 },
    );
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
