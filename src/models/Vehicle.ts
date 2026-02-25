import mongoose, { Schema, Document, Model } from "mongoose";

export interface IVehicleDocument extends Document {
  customerId: mongoose.Types.ObjectId;
  vin: string;
  year: number;
  make: string;
  vehicleModel: string;
  color: string;
  dealerId: mongoose.Types.ObjectId;
  purchaseDate: Date;
  coverageType: "exterior" | "interior" | "both";
  warrantyExpiresAt: Date;
  active: boolean;
  removedByCustomer?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VehicleSchema = new Schema<IVehicleDocument>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vin: { type: String, required: true, uppercase: true, trim: true },
    year: { type: Number, required: true },
    make: { type: String, required: true, trim: true },
    vehicleModel: { type: String, required: true, trim: true },
    color: { type: String, required: true },
    dealerId: { type: Schema.Types.ObjectId, ref: "Dealer", required: true },
    purchaseDate: { type: Date, required: true },
    coverageType: {
      type: String,
      enum: ["exterior", "interior", "both"],
      required: true,
    },
    warrantyExpiresAt: { type: Date, required: true },
    active: { type: Boolean, default: true },
    removedByCustomer: { type: Boolean, default: false },
  },
  { timestamps: true }
);

VehicleSchema.index({ customerId: 1 });
VehicleSchema.index({ dealerId: 1 });
VehicleSchema.index({ vin: 1 }, { unique: true });

const Vehicle: Model<IVehicleDocument> =
  mongoose.models.Vehicle ?? mongoose.model<IVehicleDocument>("Vehicle", VehicleSchema);

export default Vehicle;
