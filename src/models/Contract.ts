import mongoose, { Schema, Document, Model } from "mongoose";

export type PlanType = "Basic" | "Basic with Interior" | "Ultimate" | "Ultimate with Interior";
export type ContractStatus = "active" | "expired" | "cancelled";

export interface IContractDocument extends Document {
  agreementId: string;        // e.g. "86119226-A"
  customerId: mongoose.Types.ObjectId;
  dealerId: mongoose.Types.ObjectId;
  vin?: string;
  plan: PlanType;
  status: ContractStatus;
  beginsAt: Date;
  endsAt: Date;
  purchaseDate: Date;
  homeKit: boolean;           // red dot indicator
  notes?: string;
  // Extended plan detail fields
  planCode?: string;          // SKU/code e.g. "15ZAKEQU"
  maxMileage?: number;        // Expiration mileage e.g. 100000
  beginMileage?: number;      // Odometer at time of purchase
  deductible?: number;        // Deductible amount (default 0)
  createdAt: Date;
  updatedAt: Date;
}

const ContractSchema = new Schema<IContractDocument>(
  {
    agreementId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dealerId: { type: Schema.Types.ObjectId, ref: "Dealer", required: true },
    vin: { type: String, uppercase: true, trim: true },
    plan: {
      type: String,
      enum: ["Basic", "Basic with Interior", "Ultimate", "Ultimate with Interior"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
    },
    beginsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    purchaseDate: { type: Date, required: true },
    homeKit: { type: Boolean, default: false },
    notes: { type: String },
    planCode: { type: String, trim: true },
    maxMileage: { type: Number },
    beginMileage: { type: Number },
    deductible: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ContractSchema.index({ customerId: 1 });
ContractSchema.index({ dealerId: 1 });
ContractSchema.index({ status: 1 });
ContractSchema.index({ endsAt: 1 });

const Contract: Model<IContractDocument> =
  mongoose.models.Contract ??
  mongoose.model<IContractDocument>("Contract", ContractSchema);

export default Contract;
