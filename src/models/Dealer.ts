import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDealerDocument extends Document {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  regionId?: string;
  coordinates?: { lat: number; lng: number };
  active: boolean;
  dealerCode: string;
  // Customer-facing fields
  serviceUrl?: string;          // Service scheduling URL ("Visit Dealership Website")
  logoUrl?: string;             // Dealer logo image URL
  whatToExpect?: string;        // HTML content for "What to expect" page
  serviceReminderPdfUrl?: string; // PDF mailer per dealer
  fullWarrantyPdfUrl?: string;  // Full warranty PDF
  createdAt: Date;
  updatedAt: Date;
}

const DealerSchema = new Schema<IDealerDocument>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, lowercase: true },
    regionId: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    active: { type: Boolean, default: true },
    dealerCode: { type: String, required: true, unique: true },
    serviceUrl: { type: String },
    logoUrl: { type: String },
    whatToExpect: { type: String },
    serviceReminderPdfUrl: { type: String },
    fullWarrantyPdfUrl: { type: String },
  },
  { timestamps: true }
);

DealerSchema.index({ coordinates: "2dsphere" });

const Dealer: Model<IDealerDocument> =
  mongoose.models.Dealer ?? mongoose.model<IDealerDocument>("Dealer", DealerSchema);

export default Dealer;
