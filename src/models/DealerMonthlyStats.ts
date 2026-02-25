import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMonthlyStatEntry {
  // Units source
  newUnits?: number;
  usedUnits?: number;
  units?: number;

  // ZIE source
  exteriorUnits?: number;
  interiorUnits?: number;
  totalRevenue?: number;
  avgRevenue?: number;

  // Billing source
  minimum?: number;
  ZAKTEKbilling?: number;
  StoneEaglebilling?: number;

  // AutoPoint source
  list?: number;
  ROs?: number;
  response?: number;
  responseRate?: number;
  avgCPAmount?: number;
  avgWPAmount?: number;
  avgROTotalPay?: number;
  cpAmount?: number;
  wpAmount?: number;
  fixedOpsRevenue?: number;
  campaignInvest?: number;
  salesRoi?: number;

  // Flags
  missingData?: boolean; // true if one or more source is missing this month
}

export interface IDealerMonthlyStatsDocument extends Document {
  dealerId: mongoose.Types.ObjectId;
  year: number;
  month: number; // 1-12
  stats: IMonthlyStatEntry;
  createdAt: Date;
  updatedAt: Date;
}

const MonthlyStatEntrySchema = new Schema<IMonthlyStatEntry>(
  {
    // Units
    newUnits: Number,
    usedUnits: Number,
    units: Number,
    // ZIE
    exteriorUnits: Number,
    interiorUnits: Number,
    totalRevenue: Number,
    avgRevenue: Number,
    // Billing
    minimum: Number,
    ZAKTEKbilling: Number,
    StoneEaglebilling: Number,
    // AutoPoint
    list: Number,
    ROs: Number,
    response: Number,
    responseRate: Number,
    avgCPAmount: Number,
    avgWPAmount: Number,
    avgROTotalPay: Number,
    cpAmount: Number,
    wpAmount: Number,
    fixedOpsRevenue: Number,
    campaignInvest: Number,
    salesRoi: Number,
    // Flags
    missingData: { type: Boolean, default: false },
  },
  { _id: false }
);

const DealerMonthlyStatsSchema = new Schema<IDealerMonthlyStatsDocument>(
  {
    dealerId: { type: Schema.Types.ObjectId, ref: "Dealer", required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    stats: { type: MonthlyStatEntrySchema, required: true, default: {} },
  },
  { timestamps: true }
);

// Unique constraint: one record per dealer per month/year
DealerMonthlyStatsSchema.index({ dealerId: 1, year: 1, month: 1 }, { unique: true });

const DealerMonthlyStats: Model<IDealerMonthlyStatsDocument> =
  mongoose.models.DealerMonthlyStats ??
  mongoose.model<IDealerMonthlyStatsDocument>("DealerMonthlyStats", DealerMonthlyStatsSchema);

export default DealerMonthlyStats;
