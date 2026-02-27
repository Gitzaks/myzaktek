import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAutoPointExportDocument extends Document {
  filename: string;            // AP-YYYYMMDDHHMMSS.csv
  generatedBy: mongoose.Types.ObjectId;
  recordCount: number;
  storagePath: string;
  fileData?: Buffer;           // CSV stored in MongoDB (Vercel has no persistent filesystem)
  createdAt: Date;
}

const AutoPointExportSchema = new Schema<IAutoPointExportDocument>(
  {
    filename: { type: String, required: true, unique: true },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recordCount: { type: Number, required: true, default: 0 },
    storagePath: { type: String, required: true },
    fileData: { type: Buffer },
  },
  { timestamps: true }
);

AutoPointExportSchema.index({ createdAt: -1 });

const AutoPointExport: Model<IAutoPointExportDocument> =
  mongoose.models.AutoPointExport ??
  mongoose.model<IAutoPointExportDocument>("AutoPointExport", AutoPointExportSchema);

export default AutoPointExport;
