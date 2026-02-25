import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = join(process.cwd(), "uploads");

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
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
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

  // Save file to disk
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  await mkdir(UPLOAD_DIR, { recursive: true });
  const storagePath = join(UPLOAD_DIR, `${Date.now()}-${file.name}`);
  await writeFile(storagePath, buffer);

  await connectDB();

  const importFile = await ImportFile.create({
    filename: file.name,
    fileType,
    status: "pending",
    uploadedBy: session.user.id,
    year,
    month,
    storagePath,
  });

  return NextResponse.json(importFile, { status: 201 });
}
