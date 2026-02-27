import mongoose, { Schema, Document, Model } from "mongoose";

interface IChunkBuffer extends Document {
  uploadId: string;
  chunkIndex: number;
  data: Buffer;
  createdAt: Date;
}

const ChunkBufferSchema = new Schema<IChunkBuffer>(
  {
    uploadId: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true }
);

// Compound index covers the find+sort by uploadId/chunkIndex without in-memory sort
ChunkBufferSchema.index({ uploadId: 1, chunkIndex: 1 });
// Auto-expire chunks after 1 hour to clean up abandoned uploads
ChunkBufferSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

const ChunkBuffer: Model<IChunkBuffer> =
  mongoose.models.ChunkBuffer ??
  mongoose.model<IChunkBuffer>("ChunkBuffer", ChunkBufferSchema);

export default ChunkBuffer;
