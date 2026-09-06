// Single source of truth for certificate prices — never hardcode a price in
// a controller. LC/Bonafide come from certificate_pricing; ID Card (soft
// copy, which is what the cart/request flows sell) comes from the existing
// id_card_pricing table so there is only ever one authoritative idcard price.
const { pool } = require('../config/db');

const VALID_TYPES = ['lc', 'bonafide', 'idcard'];
// Used only if a price row is somehow missing — keeps the app usable rather
// than crashing certificate generation over a data problem.
const FALLBACK_PRICES = { lc: 50, bonafide: 30, idcard: 20 };

function isValidType(type) {
  return VALID_TYPES.includes(type);
}

async function getPriceForType(type) {
  if (!isValidType(type)) return null;
  if (type === 'idcard') {
    const [rows] = await pool.query("SELECT price FROM id_card_pricing WHERE copy_type = 'soft'");
    return rows.length ? Number(rows[0].price) : FALLBACK_PRICES.idcard;
  }
  const [rows] = await pool.query('SELECT price FROM certificate_pricing WHERE type = ?', [type]);
  return rows.length ? Number(rows[0].price) : FALLBACK_PRICES[type];
}

// Hard copy has its own, higher price row in the same id_card_pricing table
// (copy_type='hard') — used when an ID card cart item is the physical/hard
// copy variant rather than the default soft (PDF-only) copy.
async function getIdCardPrice(copyType) {
  const type = copyType === 'hard' ? 'hard' : 'soft';
  const [rows] = await pool.query('SELECT price FROM id_card_pricing WHERE copy_type = ?', [type]);
  return rows.length ? Number(rows[0].price) : (type === 'hard' ? 100 : FALLBACK_PRICES.idcard);
}

module.exports = { VALID_TYPES, FALLBACK_PRICES, isValidType, getPriceForType, getIdCardPrice };
