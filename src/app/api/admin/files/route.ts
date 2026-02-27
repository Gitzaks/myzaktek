import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import { writeFile, mkdir, readFile, appendFile, rm } from "fs/promises";
import { join } from "path";
import { runImport } from "@/lib/importers";


// On Vercel (and other serverless platforms) the app root is read-only.
// Only /tmp is writable at runtime.
const UPLOAD_DIR = process.env.NODE_ENV === "production"
  ? "/tmp/myzaktek-uploads"
  : join(process.cwd(), "uploads");

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
  console.log("[upload] content-length:", req.headers.get("content-length"), "bytes");
  try {
    const session = await auth();
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();

    // Chunked upload path
    const uploadId = formData.get("uploadId") as string | null;
    const chunkIndexStr = formData.get("chunkIndex") as string | null;
    const totalChunksStr = formData.get("totalChunks") as string | null;

    if (uploadId && chunkIndexStr !== null && totalChunksStr !== null) {
      const chunk = formData.get("chunk") as File | null;
      if (!chunk) {
        return NextResponse.json({ error: "chunk is required" }, { status: 400 });
      }

      const chunkIndex = Number(chunkIndexStr);
      const totalChunks = Number(totalChunksStr);
      const filename = chunk.name;

      const chunkDir = join(UPLOAD_DIR, "chunks", uploadId);
      await mkdir(chunkDir, { recursive: true });
      await writeFile(
        join(chunkDir, `chunk-${chunkIndex}`),
        Buffer.from(await chunk.arrayBuffer()),
      );

      // Not the last chunk — acknowledge and wait for more
      if (chunkIndex < totalChunks - 1) {
        return NextResponse.json({ received: chunkIndex + 1 }, { status: 200 });
      }

      // Last chunk — validate, assemble, persist
      if (!filename.endsWith(".csv")) {
        await rm(chunkDir, { recursive: true, force: true });
        return NextResponse.json({ error: "Only .csv files are allowed" }, { status: 400 });
      }

      const fileType = formData.get("fileType") as string;
      if (!fileType) {
        await rm(chunkDir, { recursive: true, force: true });
        return NextResponse.json({ error: "fileType is required" }, { status: 400 });
      }

      const year = formData.get("year") ? Number(formData.get("year")) : undefined;
      const month = formData.get("month") ? Number(formData.get("month")) : undefined;

      await mkdir(UPLOAD_DIR, { recursive: true });
      const storagePath = join(UPLOAD_DIR, `${Date.now()}-${filename}`);

      for (let i = 0; i < totalChunks; i++) {
        const chunkData = await readFile(join(chunkDir, `chunk-${i}`));
        if (i === 0) {
          await writeFile(storagePath, chunkData);
        } else {
          await appendFile(storagePath, chunkData);
        }
      }

      await rm(chunkDir, { recursive: true, force: true });

      await connectDB();
      const importFile = await ImportFile.create({
        filename,
        fileType,
        status: "processing",
        uploadedBy: session.user.id,
        year,
        month,
        storagePath,
      });

      // Run the import in the same request so the file is available in /tmp
      try {
        const result = await runImport(importFile);
        importFile.status = "imported";
        importFile.recordsImported = result.recordsImported;
        importFile.recordsTotal = result.recordsTotal;
        if (result.errors && result.errors.length > 0) {
          importFile.errorMessage = result.errors.slice(0, 5).join(" | ");
        } else {
          importFile.errorMessage = undefined;
        }
      } catch (err) {
        importFile.status = "import_failed";
        importFile.errorMessage = err instanceof Error ? err.message : "Unknown error";
      }
      await importFile.save();

      return NextResponse.json(importFile, { status: 201 });
    }

    // Legacy non-chunked path
    const file = formData.get("file") as File | null;
    const fileType = formData.get("fileType") as string;
    const year = formData.get("year") ? Number(formData.get("year")) : undefined;
    const month = formData.get("month") ? Number(formData.get("month")) : undefined;

    if (!file || !fileType) {
      return NextResponse.json({ error: "file and fileType are required" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "Only .csv files are allowed" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await mkdir(UPLOAD_DIR, { recursive: true });
    const storagePath = join(UPLOAD_DIR, `${Date.now()}-${file.name}`);
    await writeFile(storagePath, buffer);

    await connectDB();
    const importFile = await ImportFile.create({
      filename: file.name,
      fileType,
      status: "processing",
      uploadedBy: session.user.id,
      year,
      month,
      storagePath,
    });

    // Run the import in the same request so the file is available in /tmp
    try {
      const result = await runImport(importFile);
      importFile.status = "imported";
      importFile.recordsImported = result.recordsImported;
      importFile.recordsTotal = result.recordsTotal;
      if (result.errors && result.errors.length > 0) {
        importFile.errorMessage = result.errors.slice(0, 5).join(" | ");
      } else {
        importFile.errorMessage = undefined;
      }
    } catch (err) {
      importFile.status = "import_failed";
      importFile.errorMessage = err instanceof Error ? err.message : "Unknown error";
    }
    await importFile.save();

    return NextResponse.json(importFile, { status: 201 });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
