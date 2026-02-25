import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/types";

export interface IUserDocument extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  dealerIds: mongoose.Types.ObjectId[];  // supports 1-many dealerships
  regionId?: string;
  active: boolean;
  lastLogin?: Date;
  // Customer contact fields (populated on import)
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["customer", "dealer", "regional", "admin"],
      required: true,
      default: "customer",
    },
    dealerIds: [{ type: Schema.Types.ObjectId, ref: "Dealer" }],
    regionId: { type: String },
    active: { type: Boolean, default: true },
    lastLogin: { type: Date },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

const User: Model<IUserDocument> =
  mongoose.models.User ?? mongoose.model<IUserDocument>("User", UserSchema);

export default User;
