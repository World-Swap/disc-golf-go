'use strict';

/**
 * Maps US state abbreviations to full state names.
 * Used to normalize course data — all state values in the DB should be full names.
 */
const STATE_ABBR_TO_NAME = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

/**
 * Normalize a state value to its full name.
 * - If input is a 2-letter abbreviation, returns the full state name.
 * - If input is already a full name, returns it trimmed.
 * - Case-insensitive for abbreviations (e.g., "ca" -> "California").
 *
 * @param {string} state - State abbreviation or full name
 * @returns {string} Full state name
 */
function normalizeState(state) {
  if (!state || typeof state !== 'string') return state;
  const trimmed = state.trim();
  const upper = trimmed.toUpperCase();
  if (STATE_ABBR_TO_NAME[upper]) {
    return STATE_ABBR_TO_NAME[upper];
  }
  // Already a full name — return as-is (trimmed)
  return trimmed;
}

module.exports = { normalizeState, STATE_ABBR_TO_NAME };
