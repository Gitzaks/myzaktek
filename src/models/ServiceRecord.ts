import mongoose, { Schema, Document, Model } from "mongoose";

export interface IServiceRecordDocument extends Document {
  contractId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  dealerId: mongoose.Types.ObjectId;
  type: "exterior" | "interior" | "both";
  status: "scheduled" | "completed" | "cancelled" | "missed";
  scheduledDate: Date;
  completedDate?: Date;
  technicianName?: string;
  notes?: string;
  reminderSent: boolean;
  reminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceRecordSchema = new Schema<IServiceRecordDocument>(
  {
    contractId: { type: Schema.Types.ObjectId, ref: "Contract", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dealerId: { type: Schema.Types.ObjectId, ref: "Dealer", required: true },
    type: {
      type: String,
      enum: ["exterior", "interior", "both"],
      required: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled", "missed"],
      default: "scheduled",
    },
    scheduledDate: { type: Date, required: true },
    completedDate: { type: Date },
    technicianName: { type: String },
    notes: { type: String },
    reminderSent: { type: Boolean, default: false },
    reminderSentAt: { type: Date },
  },
  { timestamps: true }
);

ServiceRecordSchema.index({ customerId: 1 });
ServiceRecordSchema.index({ dealerId: 1 });
ServiceRecordSchema.index({ scheduledDate: 1 });
ServiceRecordSchema.index({ status: 1 });

const ServiceRecord: Model<IServiceRecordDocument> =
  mongoose.models.ServiceRecord ??
  mongoose.model<IServiceRecordDocument>("ServiceRecord", ServiceRecordSchema);

export default ServiceRecord;
