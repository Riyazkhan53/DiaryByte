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
      'balance',
      'createdAt',
    ],
  },
  diary: {
    fields: ['id', 'title', 'content', 'mood', 'date', 'createdAt'],
  },
  vault: {
    fields: ['id', 'title', 'content', 'createdAt'],
  },
  todo: {
    fields: ['id', 'title', 'note', 'done', 'createdAt', 'completedAt'],
  },
  expenditure: {
    // sourceId links an expense to the EMI/bill in "debts" it pays.
    fields: ['id', 'title', 'amount', 'category', 'month', 'date', 'createdAt', 'sourceId'],
  },
  cards: {
    fields: [
      'id',
      'name',
      'number',
      'expiry',
      'cvv',
      'cardType',
      'bankName',
      'brand',
      'grid',
      'createdAt',
    ],
  },
  investments: {
    fields: [
      'id',
      'category',
      'name',
      'invested',
      'current',
      'detail',
      'note',
      'createdAt',
      'updatedAt',
      // mutual funds linked to a scheme: current = units × latest NAV
      'schemeCode',
      'units',
      'nav',
      'navDate',
      // digital gold: current = grams × rate (₹/g, set by the user)
      'grams',
      'rate',
      'rateDate',
      'rateSource',
      // stocks: market 'IN' | 'US'; current = quantity × price (× usdInr for US)
      'market',
      'symbol',
      'exchange',
      'quantity',
      'price',
      'priceCurrency',
      'priceDate',
      'usdInr',
      // US stocks entered in dollars: $ invested, ₹/$ paid, $ value (if typed)
      'investedUsd',
      'investRate',
      'currentUsd',
      // monthly SIP: sip { amount, day, startMonth, endMonth? }, custom
      // amounts per month and the installments already recorded
      'sip',
      'sipAmounts',
      'sipDone',
    ],
  },
  debts: {
    fields: [
      'id',
      'name',
      'type',
      'principal',
      'outstanding',
      'emi',
      'dueDate',
      'note',
      'remainingEmis',
      'interestRate',
      'updatedAt',
      'createdAt',
      // section: 'emi' (loans) | 'card' (credit card bills) | 'bill' (other bills)
      'section',
      // EMI schedule
      'manual',
      'tenure',
      'startMonth',
      'emiDay',
      'paidMonths',
      // credit card / other bills
      'amount',
      'minDue',
      'billType',
      'month',
      'paid',
      'paidAt',
      // monthly bills: due on dueDay every month from startMonth (to endMonth);
      // amounts holds each month's actual figure when it varies
      'recurring',
      'variable',
      'dueDay',
      'endMonth',
      'amounts',
      // credit card bill linked to a card saved in "cards" (no full number)
      'cardId',
      'cardLast4',
    ],
  },
  autopays: {
    fields: [
      'id',
      'name',
      'amount',
      'recurrence',
      'startDate',
      'dates',
      'ackDue',
      'createdAt',
    ],
  },
  tickets: {
    fields: [
      'id',
      'type',
      'title',
      'from',
      'to',
      'venue',
      'date',
      'time',
      'seat',
      'bookingRef',
      'note',
      'image',
      'createdAt',
    ],
  },
  dates: {
    fields: ['id', 'title', 'date', 'section', 'note', 'updatedAt', 'createdAt'],
  },
  // One document per month ('YYYY-MM'), holding that month's income entries
  // and how any shortfall was covered (borrowed / savings / extra income).
  months: {
    fields: ['id', 'month', 'incomes', 'adjustments', 'createdAt'],
  },
  // Setup Check log: a stock's indicator readings, the score and signal.
  setups: {
    fields: [
      'id',
      'symbol',
      'name',
      'market',
      'price',
      'inputs',
      'threshold',
      'signal',
      'bullPct',
      'bearPct',
      'note',
      'createdAt',
    ],
  },
  // Total Spend: what was spent in a month and what it was paid from.
  // source: card | cred | icici | canara | jupiter | cash | other
  spends: {
    fields: [
      'id',
      'title',
      'amount',
      'month',
      'date',
      'source',
      'cardId',
      'cardLabel',
      'sourceNote',
      'category',
      'addToExpenses',
      // could have been avoided; adds to the month's "Can be saved"
      'avoidable',
      'note',
      'createdAt',
      'updatedAt',
    ],
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

// Items deleted from any collection are kept here for 30 days so they can
// be restored. MongoDB removes them automatically after that.
const TRASH_DAYS = 30;
let trashModel = null;

function getTrashModel() {
  if (!trashModel) {
    const schema = new mongoose.Schema(
      {
        section: { type: String, required: true, index: true },
        itemId: { type: String, required: true },
        item: { type: mongoose.Schema.Types.Mixed, required: true },
        deletedAt: { type: Date, default: Date.now, expires: TRASH_DAYS * 24 * 60 * 60 },
      },
      { collection: 'trash' }
    );
    trashModel = mongoose.model('trash', schema);
  }
  return trashModel;
}

// Drop Mongo's own fields so an item looks exactly as the app stored it.
function toItem(doc) {
  const item = {};
  Object.keys(doc).forEach((key) => {
    if (key !== '_id' && key !== '__v') item[key] = doc[key];
  });
  return item;
}

module.exports = {
  COLLECTIONS,
  TRASH_DAYS,
  getCollectionNames,
  getModel,
  getTrashModel,
  sanitize,
  toItem,
};
