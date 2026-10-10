const mongoose = require('mongoose');

// All user data lives in the "diarybyte" database, one collection per feature.
// strict: false so future app-side fields survive round-trips.
const COLLECTIONS = {
  movies: {
    fields: [
      'id',
      'title',
      'platform',
      'type',
      'status',
      'addedAt',
      'tmdbId',
      'mediaType',
      'posterPath',
      'rating',
      'releaseDate',
    ],
  },
  passwords: {
    fields: ['id', 'site', 'username', 'password', 'createdAt'],
  },
  banking: {
    fields: [
      'id',
      'bankName',
      'accountType',
      'accountNumber',
      'ifsc',
      'upiId',
      'createdAt',
    ],
  },
  diary: {
    fields: ['id', 'title', 'content', 'mood', 'date', 'createdAt'],
  },
};

const modelCache = {};

function getCollectionNames() {
  return Object.keys(COLLECTIONS);
}

function getModel(name) {
  if (!COLLECTIONS[name]) {
    throw new Error(`Unknown collection: ${name}`);
  }
  if (!modelCache[name]) {
    const schema = new mongoose.Schema(
      {
        id: { type: String, required: true, unique: true },
      },
      // No mongoose timestamps — the app manages createdAt/addedAt itself
      // and we want its values preserved exactly on round-trips.
      { strict: false, collection: name }
    );
    modelCache[name] = mongoose.model(name, schema);
  }
  return modelCache[name];
}

function sanitize(name, raw) {
  const clean = {};
  COLLECTIONS[name].fields.forEach((field) => {
    if (raw[field] !== undefined) {
      clean[field] = raw[field];
    }
  });
  return clean;
}

module.exports = { COLLECTIONS, getCollectionNames, getModel, sanitize };
