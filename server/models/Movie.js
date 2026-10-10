const mongoose = require('mongoose');

// strict: false so future app-side fields survive round-trips
const movieSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    platform: String,
    type: String,
    status: String,
    addedAt: String,
    tmdbId: Number,
    mediaType: String,
    posterPath: String,
    rating: Number,
    releaseDate: String,
  },
  { strict: false, timestamps: true }
);

movieSchema.index({ tmdbId: 1, mediaType: 1 }, { sparse: true });

module.exports = mongoose.model('Movie', movieSchema);
