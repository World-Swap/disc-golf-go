// src/modules/market/market.catalog.ts — what the Market offers to browse.
//
// These are SEARCH PRESETS, not a catalogue we maintain. Each one is a query
// run against the shops exactly as if it had been typed, so a department can
// never go stale or promise stock that is not there -- if nobody stocks it,
// the department comes back empty and says so, which is the truth.
//
// They exist because a marketplace you can only use by already knowing what
// to type is a search box with a wider margin. The departments are the way in
// for the player this pivot is aimed at: someone who has just been told by
// the training library what they are missing and does not yet know what to
// buy, which is why `why` is written for a beginner rather than as a label.

export type Department = {
  readonly key: string;
  readonly label: string;
  /** The query actually run. */
  readonly query: string;
  /** One line, in the player's terms, on who this is for. */
  readonly why: string;
  /**
   * The NAME of a drawing, not a character.
   *
   * These were emoji and two of them were plainly wrong: Baskets carried
   * U+1F3C0, a BASKETBALL, and Accessories carried U+1F9FA, a wicker laundry
   * basket (fairway drivers had a bow and arrow). That is not a matter of
   * taste and no substitution fixes it: Unicode has exactly one disc golf
   * character, the disc U+1F94F, and NO disc golf basket at all, so any emoji
   * for Baskets can only be the wrong object.
   *
   * So the glyphs are drawn, in the logo's own vocabulary -- the same decision
   * the notification bell reached when U+25C9 read as a record button. The
   * drawing lives in web/market.html keyed by this name, which also means the
   * API carries data rather than markup: this value used to be interpolated
   * into the page as raw HTML, the one unescaped field on that tile.
   */
  readonly icon: DepartmentIcon;
};

/** Every name here must have a drawing in web/market.html; a test pins both ways. */
export type DepartmentIcon =
  | 'discs'
  | 'putter'
  | 'midrange'
  | 'fairway'
  | 'distance'
  | 'bag'
  | 'basket'
  | 'shirt'
  | 'mini'
  | 'towel';

export const DEPARTMENTS: readonly Department[] = [
  { key: 'starter',   label: 'Starter sets',     query: 'beginner starter set',  icon: 'discs',    why: 'Three discs and nothing you do not need yet' },
  { key: 'putters',   label: 'Putters',          query: 'putter',                icon: 'putter',   why: 'The disc that takes the most strokes off a round' },
  { key: 'midranges', label: 'Midranges',        query: 'midrange',              icon: 'midrange', why: 'Straight, predictable, the one to learn lines with' },
  { key: 'fairway',   label: 'Fairway drivers',  query: 'fairway driver',        icon: 'fairway',  why: 'Control first. Most players should be here, not in distance' },
  { key: 'distance',  label: 'Distance drivers', query: 'distance driver',       icon: 'distance', why: 'Only once you can throw a fairway flat' },
  { key: 'bags',      label: 'Bags',             query: 'disc golf bag',         icon: 'bag',      why: 'Carries the discs, the water and the scorecard' },
  { key: 'baskets',   label: 'Baskets',          query: 'practice basket',       icon: 'basket',   why: 'Putting practice at home is the cheapest improvement there is' },
  { key: 'apparel',   label: 'Apparel',          query: 'disc golf apparel',     icon: 'shirt',    why: 'Pockets, sun and rain' },
  { key: 'minis',     label: 'Minis & markers',  query: 'mini marker',           icon: 'mini',     why: 'You need one to mark your lie. They cost almost nothing' },
  { key: 'towels',    label: 'Accessories',      query: 'disc golf towel',       icon: 'towel',    why: 'Towels, chalk bags, retrievers' },
];

export const DEPARTMENT_BY_KEY: ReadonlyMap<string, Department> = new Map(
  DEPARTMENTS.map((d) => [d.key, d])
);

/**
 * What the Market opens on. Rotated by day so the front page is not identical
 * every visit, and drawn from the departments so it can never name something
 * the shops do not sell.
 */
export function featuredDepartment(date = new Date()): Department {
  const day = Math.floor(date.getTime() / 86_400_000);
  return DEPARTMENTS[day % DEPARTMENTS.length]!;
}
