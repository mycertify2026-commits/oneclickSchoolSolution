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

module.exports = { VALID_TYPES, FALLBACK_PRICES, isValidType, getPriceForType };
