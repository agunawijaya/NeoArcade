/**
 * The landscapes the rig drives through. Each place on the map belongs to
 * one; the side diorama paints a leg of road with the landscape of the place
 * it leads to, and the cab view tints its scenery the same way. How each one
 * is drawn lives in `render/landscapes.ts`.
 */
export type RegionId =
  | 'la-basin'
  | 'mojave'
  | 'sonoran'
  | 'ponderosa'
  | 'mesas'
  | 'high-plains'
  | 'west-texas'
  | 'panhandle'
  | 'prairie'
  | 'ozarks'
  | 'farmland'
  | 'great-lakes'
  | 'appalachian'
  | 'turnpike'
  | 'jersey'
  | 'manhattan'
  | 'rockies'
  | 'red-rock'
  | 'great-basin'
  | 'deep-south'
  | 'bayou'
  | 'piedmont'
  | 'florida'
  | 'northwest'
  | 'sierra'
  | 'central-valley'
  | 'bay-area'
  | 'northern-plains'
  | 'northwoods'
  | 'new-england'
  | 'mid-atlantic'
  | 'upland-south';

export interface Region {
  id: RegionId;
  name: string;
  /** One line for the album and the diorama's caption. */
  blurb: string;
}

export const REGIONS: Readonly<Record<RegionId, Region>> = {
  'la-basin': {
    id: 'la-basin',
    name: 'Los Angeles Basin',
    blurb: 'Palms, freeways and hills in the haze.',
  },
  mojave: { id: 'mojave', name: 'Mojave Desert', blurb: 'Joshua trees, creosote and heat.' },
  sonoran: { id: 'sonoran', name: 'Sonoran Desert', blurb: 'Saguaros standing guard.' },
  ponderosa: {
    id: 'ponderosa',
    name: 'Arizona high country',
    blurb: 'Ponderosa pines at seven thousand feet.',
  },
  mesas: { id: 'mesas', name: 'Arizona mesas', blurb: 'Red tables of rock under a big sky.' },
  'high-plains': {
    id: 'high-plains',
    name: 'New Mexico high plains',
    blurb: 'Yucca, grass and blue mountains far away.',
  },
  'west-texas': {
    id: 'west-texas',
    name: 'West Texas',
    blurb: 'Pumpjacks nodding in the scrub.',
  },
  panhandle: {
    id: 'panhandle',
    name: 'Texas Panhandle',
    blurb: 'Flat as a table, windmills and grain elevators.',
  },
  prairie: {
    id: 'prairie',
    name: 'Great Plains',
    blurb: 'Rolling grass and wheat to the horizon.',
  },
  ozarks: { id: 'ozarks', name: 'Ozarks', blurb: 'Oak hills and rock cuts.' },
  farmland: { id: 'farmland', name: 'Midwest farmland', blurb: 'Corn, silos and red barns.' },
  'great-lakes': {
    id: 'great-lakes',
    name: 'Great Lakes shore',
    blurb: 'Steel mills and a horizon of water.',
  },
  appalachian: {
    id: 'appalachian',
    name: 'Appalachians',
    blurb: 'Wooded ridges, one after another.',
  },
  turnpike: {
    id: 'turnpike',
    name: 'Pennsylvania Turnpike',
    blurb: 'Farm valleys, long ridges and tunnels through them.',
  },
  jersey: {
    id: 'jersey',
    name: 'New Jersey Turnpike',
    blurb: 'Marshes, refineries and the skyline ahead.',
  },
  manhattan: {
    id: 'manhattan',
    name: 'New York City',
    blurb: 'The skyline at the end of the road.',
  },
  rockies: { id: 'rockies', name: 'Rocky Mountains', blurb: 'Snowy peaks and long grades.' },
  'red-rock': { id: 'red-rock', name: 'Utah canyon country', blurb: 'Red cliffs and empty miles.' },
  'great-basin': {
    id: 'great-basin',
    name: 'Great Basin',
    blurb: 'Sagebrush valleys between bare ranges.',
  },
  'deep-south': {
    id: 'deep-south',
    name: 'Deep South',
    blurb: 'Pine woods, kudzu and cotton.',
  },
  bayou: { id: 'bayou', name: 'Gulf bayous', blurb: 'Cypress, moss and slow water.' },
  piedmont: { id: 'piedmont', name: 'Piedmont', blurb: 'Red clay, pines and tobacco barns.' },
  florida: { id: 'florida', name: 'Florida', blurb: 'Palms, orange groves and flat green land.' },
  northwest: {
    id: 'northwest',
    name: 'Pacific Northwest',
    blurb: 'Tall firs, rain and a volcano on the skyline.',
  },
  sierra: { id: 'sierra', name: 'Sierra and Cascades', blurb: 'Big conifers and snowy passes.' },
  'central-valley': {
    id: 'central-valley',
    name: 'Central Valley',
    blurb: 'Orchards in long straight rows.',
  },
  'bay-area': { id: 'bay-area', name: 'San Francisco Bay', blurb: 'Hills, fog and a red bridge.' },
  'northern-plains': {
    id: 'northern-plains',
    name: 'Northern Plains',
    blurb: 'Big sky, wheat and badlands.',
  },
  northwoods: { id: 'northwoods', name: 'North Woods', blurb: 'Lakes, birches and dairy barns.' },
  'new-england': {
    id: 'new-england',
    name: 'New England',
    blurb: 'Stone walls, maples and white steeples.',
  },
  'mid-atlantic': {
    id: 'mid-atlantic',
    name: 'Mid-Atlantic',
    blurb: 'Woods, rivers and brick cities.',
  },
  'upland-south': {
    id: 'upland-south',
    name: 'Kentucky and Tennessee hills',
    blurb: 'Rolling hills, board fences and hollows.',
  },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];
