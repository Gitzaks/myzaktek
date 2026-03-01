import mongoose, { Schema, Document, Model } from "mongoose";

export type FileType = "mpp" | "units" | "zie" | "billing" | "autopoint" | "contracts" | "dealers";
export type ImportStatus = "pending" | "imported" | "import_failed" | "processing";

export interface IImportFileDocument extends Document {
  filename: string;
  fileType: FileType;
  status: ImportStatus;
  uploadedBy: mongoose.Types.ObjectId;
  year?: number;
  month?: number;
  recordsTotal?: number;
  recordsImported?: number;
  processedRows?: number;
  statusMessage?: string;
  errorMessage?: string;
  importErrors?: string[];
  storagePath: string;
  fileData?: Buffer;
  /** Which Inngest step is currently running: "dealers" | "customers" | "contracts" */
  currentStep?: string;
  /** 0-100 progress within the current step (resets to 0 at each step start) */
  stepPct?: number;
  /** Timestamped debug log entries written throughout the Inngest import */
  debugLog?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ImportFileSchema = new Schema<IImportFileDocument>(
  {
    filename: { type: String, required: true },
    fileType: {
      type: String,
      enum: ["mpp", "units", "zie", "billing", "autopoint", "contracts", "dealers"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "imported", "import_failed", "processing"],
      default: "pending",
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number },
    month: { type: Number, min: 1, max: 12 },
    recordsTotal: { type: Number },
    recordsImported: { type: Number },
    processedRows: { type: Number },
    statusMessage: { type: String },
    errorMessage: { type: String },
    importErrors: [{ type: String }],
    storagePath: { type: String, required: true },
    fileData: { type: Buffer },
    currentStep: { type: String },
    stepPct: { type: Number },
    debugLog: [{ type: String }],
  },
  { timestamps: true }
);

ImportFileSchema.index({ fileType: 1, createdAt: -1 });
ImportFileSchema.index({ year: 1, month: 1, fileType: 1 });

const ImportFile: Model<IImportFileDocument> =
  mongoose.models.ImportFile ??
  mongoose.model<IImportFileDocument>("ImportFile", ImportFileSchema);

export default ImportFile;
