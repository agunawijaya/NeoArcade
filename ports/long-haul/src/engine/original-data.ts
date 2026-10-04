/**
 * The route tables of Trucker, copied character for character from its DATA
 * lines 9030–9700, typos and all. Each table opens with the number of
 * waypoints and the trip's length in miles; each waypoint is the mile it
 * stands at (from Los Angeles), its name, the road that leads to it, and a
 * code whose whole part is an event and whose fraction is that event's odds
 * or toll. New York is mile 9999 because the trip ends on the length, never
 * on the last waypoint.
 *
 * Nothing reads these directly during play: `routes.ts` decodes them, applies
 * the corrections listed in docs/games/long-haul.md, and gives each waypoint
 * its place on the map. Keeping the tables verbatim lets the tests prove the
 * decoding is faithful.
 */
export type OriginalWaypoint = readonly [mile: number, name: string, road: string, code: number];

export interface OriginalTable {
  /** The program's route index RT: 0 middle, 1 north, 2 south. */
  index: 0 | 1 | 2;
  count: number;
  miles: number;
  waypoints: readonly OriginalWaypoint[];
}

export const MIDDLE_TABLE: OriginalTable = {
  index: 0,
  count: 21,
  miles: 2850,
  waypoints: [
    [90, 'Barstow', 'I-15 in California', 7.8],
    [225, 'Needles', 'I-40 in California', 1],
    [440, 'Flagstaff', 'I-40 in California', 3.65],
    [620, 'Gallup', 'I-40 in Arizona', 5.5],
    [760, 'Albuquerque', 'I-40 in New Mexico', 3.35],
    [930, 'Tucumcari', 'I-40 in New Mexico', 1],
    [1040, 'Amarillo', 'I-40 in Texas', 7.8],
    [1155, 'Oklahoma border', 'I-40 in Texas', 5.5],
    [1305, 'Oklahoma City', 'I-40 in Oklahoma', 2.65],
    [1530, 'Missouri border', 'Oklahoma Turnpike', 2.4],
    [1815, 'St. Louis', 'I-44 in Missouri', 0],
    [1980, 'Terre Haute', 'I-70 in Illinois', 5.5],
    [2050, 'Indianapolis', 'I-70 in Indianna', 0],
    [2115, 'Ohio border', 'I-70 in Indianna', 1],
    [2220, 'Columbus', 'I-70 in Ohio', 5.5],
    [2350, 'Wheeling West Virginia', 'I-70 in Ohio', 4.25],
    [2410, 'New Stanton', 'I-70 in Pennsylvania', 6.75],
    [2570, 'Harrisburg', 'Pennsylvania Turnpike', 3.75],
    [2760, 'New Jersey border', 'Pennsylvania Turnpike', 2.95],
    [2840, 'Holland Tunnel', 'I-70 in New Jersey', 2.4],
    [9999, 'New York', 'New York streets', 0],
  ],
};

export const NORTH_TABLE: OriginalTable = {
  index: 1,
  count: 18,
  miles: 2710,
  waypoints: [
    [90, 'Barstow', 'I-15 in California', 7.8],
    [245, 'Las Vegas', 'I-15 in California', 1],
    [365, 'Utah border', 'I-15 in Arizona', 0],
    [500, 'End of Interstate', 'I-15 in Utah', 3.2],
    [555, 'Salina', 'US-89 in Utah', 4.5],
    [760, 'Grand Junction', 'I-70 in Utah', 5.4],
    [1010, 'Denver', 'I-70 in Colorado', 3.75],
    [1190, 'Nebraska border', 'I-76 in Colorado', 1],
    [1450, 'Omaha', 'I-80 in Nebraska', 5.5],
    [1590, 'Demoines', 'I-80 in Iowa', 4.75],
    [1750, 'Illinois border', 'I-80 in Iowa', 5.6],
    [1910, 'Gary', 'I-80 in Illinois', 2.5],
    [2050, 'Ohio border', 'Indianna Turnpike', 2.45],
    [2215, 'Cleveland', 'Ohio Turnpike', 2.8],
    [2280, 'Pennsylvania border', 'I-80 in Ohio', 4.16],
    [2615, 'East Stroudsberg', 'I-80 in Pennsylvania', 3.33],
    [2675, 'Washington Bridge', 'I-80 in New Jersey', 2.2],
    [9999, 'New York', 'city streets', 0],
  ],
};

export const SOUTH_TABLE: OriginalTable = {
  index: 2,
  count: 25,
  miles: 3120,
  waypoints: [
    [75, 'Palm Springs', 'I-10 in California', 0],
    [225, 'Blythe', 'I-10 in California', 1],
    [375, 'Phoenix', 'I-10 in Arizona', 0],
    [495, 'Tucson', 'I-10 in Arizona', 7.9],
    [650, 'Lordsburg', 'I-10 in Arizona', 5.75],
    [795, 'El Paso', 'I-10 in New Mexico', 0],
    [965, 'Pecos', 'I-10 in Texas', 1],
    [1080, 'Odessa', 'I-20 in Texas', 0],
    [1250, 'Abilene', 'I-20 in Texas', 3.8],
    [1439, 'Dallas', 'I-20 in Texas', 0],
    [1610, 'Louisiana border', 'I-20 in Texas', 5],
    [1785, 'Vicksburg', 'I-20 in Louisiana', 0],
    [1965, 'Alabama border', 'I-20 in Mississippi', 1],
    [2100, 'Birmingham', 'I-20 in Alabama', 4.25],
    [2200, 'Georgia border', 'I-20 in Alabama', 0],
    [2255, 'Atlanta', 'I-20 in Georgia', 0],
    [2320, 'Carolina border', 'I-85 in Georgia', 5.75],
    [2565, 'Greensboro', 'I-85 in Carolina', 3.8],
    [2680, 'Virginia border', 'I-85 in North Carolina', 7.85],
    [2775, 'Richmond', 'I-85 in Virginia', 0],
    [2880, 'Washington D.C.', 'I-95 in Virginia', 0],
    [2920, 'Baltimore', 'I-95 in Maryland', 2.3],
    [2990, 'New Lersey border', 'I-95 in Delaware', 2.25],
    [3110, 'Holland Tunnel', 'New Jersey Turnpike', 2.4],
    [9999, 'New York', 'city streets', 0],
  ],
};

/** The order the program READs them in, which is also RT. */
export const ORIGINAL_TABLES = [MIDDLE_TABLE, NORTH_TABLE, SOUTH_TABLE] as const;
