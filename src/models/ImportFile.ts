import mongoose, { Schema, Document, Model } from "mongoose";

export type FileType = "mpp" | "units" | "zie" | "billing" | "autopoint" | "contracts";
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
  errorMessage?: string;
  storagePath: string;
  createdAt: Date;
  updatedAt: Date;
}

const ImportFileSchema = new Schema<IImportFileDocument>(
  {
    filename: { type: String, required: true },
    fileType: {
      type: String,
      enum: ["mpp", "units", "zie", "billing", "autopoint", "contracts"],
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
    errorMessage: { type: String },
    storagePath: { type: String, required: true },
  },
  { timestamps: true }
);

ImportFileSchema.index({ fileType: 1, createdAt: -1 });
ImportFileSchema.index({ year: 1, month: 1, fileType: 1 });

const ImportFile: Model<IImportFileDocument> =
  mongoose.models.ImportFile ??
  mongoose.model<IImportFileDocument>("ImportFile", ImportFileSchema);

export default ImportFile;
