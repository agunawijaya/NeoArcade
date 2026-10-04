import type { Rng } from '@shared/rng';
import type { RegionId } from './regions';

/**
 * Truck stops: a name over the door, something on the specials board, and
 * one detail that makes the place itself. Built from a seed, so the same
 * stop on the same trip is always the same place.
 */
export interface Diner {
  name: string;
  special: string;
  /** Pie of the day, because there is always pie. */
  pie: string;
  detail: string;
  /** Colours for the sign and the awning. */
  neon: string;
  awning: string;
}

const OWNERS = [
  'Dot',
  'Sal',
  'Bud',
  'Earl',
  'Peggy',
  'Lou',
  'Rosie',
  'Hank',
  'Mabel',
  'Gus',
  'June',
  'Ray',
  'Velma',
  'Cliff',
  'Opal',
  'Moe',
  'Ida',
  'Buck',
  'Flo',
  'Walt',
];
const KINDS = [
  'Truck Stop',
  'Diner',
  'Fuel & Eats',
  'Café',
  'Truck Haven',
  'Travel Plaza',
  'Big Rig Stop',
  'Kitchen',
  'Grill',
];

const REGIONAL_NAMES: Partial<Record<RegionId, readonly string[]>> = {
  mojave: ['Joshua Tree Fuel & Eats', 'Desert Oasis Truck Stop', 'Mirage Café'],
  sonoran: ['Saguaro Truck Haven', 'Cactus Flats Diner', 'Sundown Grill'],
  mesas: ['Red Mesa Café', 'Painted Desert Truck Stop', 'Turquoise Trading Post & Fuel'],
  ponderosa: ['Tall Pines Truck Stop', 'Timberline Diner'],
  'high-plains': ['Blue Sky Travel Plaza', 'Coyote Café', 'Chile Pepper Diner'],
  'west-texas': ['Pumpjack Café', 'Lone Star Fuel & Eats', 'Big Sky Truck Stop'],
  panhandle: ['Windmill Truck Stop', 'Longhorn Café', 'Grain Elevator Grill'],
  prairie: ['Prairie Rose Diner', 'Wheatland Truck Stop', 'Bluestem Café'],
  ozarks: ['Hillbilly Holler Café', 'Ozark Oak Truck Stop'],
  farmland: ['Silo City Diner', 'Corn Crib Café', 'Harvest Moon Truck Stop'],
  'great-lakes': ['Lakeshore Truck Plaza', 'Steel City Diner'],
  appalachian: ['Mountain Laurel Diner', 'Hollow Ridge Truck Stop'],
  turnpike: ['Keystone Diner', 'Turnpike Travel Plaza', 'Dutch Country Kitchen'],
  jersey: ['Meadowlands Diner', 'Exit 13 Truck Stop'],
  rockies: ['Continental Divide Café', 'Snowcap Truck Stop', 'Elk Horn Grill'],
  'red-rock': ['Slickrock Café', 'Canyon Country Fuel'],
  'great-basin': ['Sagebrush Truck Stop', 'Silver State Café'],
  'deep-south': ['Magnolia Café', 'Dixie Truck Stop', 'Sweet Tea Diner'],
  bayou: ['Cypress Knee Café', 'Crawfish Corner Truck Stop', 'Bayou Belle Diner'],
  piedmont: ['Red Clay Diner', 'Tobacco Road Truck Stop', 'Peach Blossom Café'],
  florida: ['Orange Blossom Diner', 'Sunshine Truck Stop', 'Palmetto Café'],
  northwest: ['Evergreen Truck Stop', 'Rainy Day Café', 'Timber Town Diner'],
  sierra: ['Summit Café', 'Snowline Truck Stop'],
  'central-valley': ['Orchard Café', 'Valley Truck Plaza'],
  'northern-plains': ['Big Sky Café', 'Badlands Truck Stop', 'Prairie Wind Diner'],
  northwoods: ['North Star Café', 'Loon Lake Truck Stop', 'Birch Bark Diner'],
  'new-england': ['Yankee Diner', 'Village Green Café'],
  'mid-atlantic': ['Chesapeake Diner', 'Blue Ridge Truck Stop'],
  'upland-south': ['Bluegrass Café', 'Hollow Tree Truck Stop'],
};

const SPECIALS = [
  'chicken-fried steak with cream gravy',
  'meat loaf and mashed potatoes',
  'biscuits and sausage gravy',
  'chili with cornbread',
  'pancakes the size of hubcaps',
  'hot beef sandwich',
  'catfish basket',
  'green chile stew',
  'pot roast, like Mom’s',
  'ham and beans',
  'patty melt and fries',
  'country ham and eggs',
  'barbecue brisket',
  'split pea soup',
  'Denver omelet',
  'turkey and dressing',
  'grits, eggs and bacon',
  'Salisbury steak',
];

const PIES = [
  'apple',
  'cherry',
  'pecan',
  'coconut cream',
  'lemon meringue',
  'peach',
  'banana cream',
  'chocolate',
  'rhubarb',
  'sweet potato',
  'blueberry',
  'key lime',
];

const DETAILS = [
  'The waitress calls everybody “hon” and means it.',
  'A jukebox in the corner plays the same three songs.',
  'There is a phone booth with a line of drivers calling home.',
  'The coffee is free with a fill-up, and tastes like it.',
  'A sign says: “Showers 50¢. Towels extra.”',
  'The cook has a tattoo of a truck on each forearm.',
  'There is a rack of road maps and a rack of cassettes, both well thumbed.',
  'A bulletin board is covered in business cards and lost-dog notices.',
  'The counter stools spin, and everybody spins them.',
  'A hand-painted sign promises “World famous pie”. Nobody knows which world.',
  'The owner’s dog sleeps under the cash register.',
  'Trucks idle in long rows outside, their marker lights glowing.',
  'There is a TV over the counter showing the weather on mute.',
  'A gift shop sells postcards, belt buckles and rubber snakes.',
  'The windows are fogged and someone has drawn a truck on one.',
  'An old-timer at the counter tells the same story to everyone who sits down.',
];

const NEON = ['#ff4f5a', '#ff9d2e', '#4fd1ff', '#7dff8a', '#ff5fd2', '#ffd23a'];
const AWNINGS = ['#b3261e', '#1f6e45', '#2a4f8f', '#d17a14', '#6b2a5a', '#3a3a3a'];

export function dinerFor(rng: Rng, region: RegionId): Diner {
  const regional = REGIONAL_NAMES[region];
  const name =
    regional && rng.chance(0.55) ? rng.pick(regional) : `${rng.pick(OWNERS)}’s ${rng.pick(KINDS)}`;
  return {
    name,
    special: rng.pick(SPECIALS),
    pie: rng.pick(PIES),
    detail: rng.pick(DETAILS),
    neon: rng.pick(NEON),
    awning: rng.pick(AWNINGS),
  };
}
