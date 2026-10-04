/**
 * Channel 19: the voices on the CB. Every line is written for the game.
 * Tips name a place ({place}) and are only as good as the driver giving
 * them; chatter is just company on a long night. Nobody here is mean: it
 * is a road full of people looking out for each other, more or less
 * accurately.
 *
 * Placeholders: {place} a waypoint ahead, {price} a diesel price, {road}
 * the road being driven, {weather} a road condition, {city} the
 * destination.
 */
export interface Speaker {
  handle: string;
  /** How often their tips are right, 0–1. The player can learn it. */
  reliability: number;
  /** A few words on who they are, for the CB log. */
  about: string;
  /** Where they tend to be heard; empty means everywhere. */
  regions: readonly string[];
  /** Only on the air at night. */
  nightOnly?: boolean;
}

export const SPEAKERS: readonly Speaker[] = [
  {
    handle: 'Mama Bear',
    reliability: 0.95,
    about: 'Hauls furniture out of North Carolina; has never once been wrong about a scale.',
    regions: [],
  },
  {
    handle: 'Old Timer',
    reliability: 0.93,
    about: 'Forty years behind the wheel and still says "good buddy".',
    regions: [],
  },
  {
    handle: 'Preacher',
    reliability: 0.9,
    about: 'Reads scripture on Sundays and radar on the other six days.',
    regions: [],
  },
  {
    handle: 'Professor',
    reliability: 0.88,
    about: 'Knows the history of every town and most of the speed traps.',
    regions: [],
  },
  {
    handle: 'Big Iron',
    reliability: 0.86,
    about: 'Flatbed of steel coils out of Gary. Steady as his load.',
    regions: ['great-lakes', 'farmland', 'appalachian', 'turnpike'],
  },
  {
    handle: 'Cajun Queen',
    reliability: 0.85,
    about: 'Runs shrimp up from the Gulf and sings along to the radio.',
    regions: ['bayou', 'deep-south', 'piedmont', 'florida'],
  },
  {
    handle: 'Tumbleweed',
    reliability: 0.82,
    about: 'Desert rat. Has opinions about every truck stop west of Amarillo.',
    regions: [
      'mojave',
      'sonoran',
      'mesas',
      'high-plains',
      'west-texas',
      'great-basin',
      'red-rock',
      'ponderosa',
    ],
  },
  {
    handle: 'Yankee Doodle',
    reliability: 0.8,
    about: 'Talks fast, drives the Turnpike like he owns it.',
    regions: ['jersey', 'manhattan', 'new-england', 'mid-atlantic', 'turnpike'],
  },
  {
    handle: 'Night Owl',
    reliability: 0.8,
    about: 'Only ever heard after dark, always awake.',
    regions: [],
    nightOnly: true,
  },
  {
    handle: 'Dixie Peach',
    reliability: 0.78,
    about: 'Peaches out of Georgia, gossip from everywhere.',
    regions: ['piedmont', 'deep-south', 'upland-south', 'florida'],
  },
  {
    handle: 'Prairie Dog',
    reliability: 0.75,
    about: 'Grain hauler; sees a long way and reports most of it.',
    regions: ['prairie', 'panhandle', 'northern-plains', 'farmland'],
  },
  {
    handle: 'Coffee Pot',
    reliability: 0.74,
    about: 'Four cups a stop. Tips come out a little jittery.',
    regions: [],
  },
  {
    handle: 'Snowbird',
    reliability: 0.7,
    about: 'Follows the sun south every winter; guesses the weather more than reads it.',
    regions: [],
  },
  {
    handle: 'Lucky Penny',
    reliability: 0.65,
    about: 'Swears she has never had a ticket. Nobody believes her.',
    regions: [],
  },
  {
    handle: 'Big Foot',
    reliability: 0.6,
    about: 'Heavy right foot, light grip on the facts.',
    regions: [],
  },
  {
    handle: 'Sidewinder',
    reliability: 0.55,
    about: 'Enjoys a rumour. Enjoys starting one more.',
    regions: [],
  },
  {
    handle: 'Hot Rod Harry',
    reliability: 0.5,
    about: 'Has seen a bear behind every billboard in America, some of them real.',
    regions: [],
  },
  {
    handle: 'Silver Fox',
    reliability: 0.87,
    about: 'Retired schoolteacher who took up trucking at fifty-five. Precise.',
    regions: [],
  },
];

export type CbTopic =
  | 'radar-yes'
  | 'radar-no'
  | 'scale-open'
  | 'scale-closed'
  | 'work-yes'
  | 'work-no'
  | 'weather-bad'
  | 'weather-clear'
  | 'diesel-cheap'
  | 'diesel-dear'
  | 'hello'
  | 'day'
  | 'night'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'tired'
  | 'fast'
  | 'slow'
  | 'oranges'
  | 'mail'
  | 'freight'
  | 'nearly-there'
  | 'ticket'
  | 'blowout'
  | 'west'
  | 'south'
  | 'midwest'
  | 'northeast'
  | 'plains'
  | 'mountains'
  | 'jokes';

export const CB_LINES: Readonly<Record<CbTopic, readonly string[]>> = {
  'radar-yes': [
    'Breaker one-nine, Smokey’s taking pictures at {place}. Keep it legal.',
    'Bear in the bushes at {place}, eastbound and westbound both. Back it down.',
    'Kojak with a Kodak sitting pretty at {place}. Don’t give him a reason.',
    'Heads up: radar at {place}. He’s parked behind the billboard like it’s a hobby.',
    'County Mountie running radar at {place}. Smile for the camera, drivers.',
    'There’s a plain wrapper with a radar gun at {place}. Ease off before you get there.',
    'Smokey report: one bear, one gun, {place}. That’s a whole lot of attention.',
    'You got a full-grown bear at {place} and he looks hungry. Double nickel, friend.',
    'Take your foot out of the carburetor near {place}. Radar, and he’s awake.',
    'They set up a speed trap at {place}. Same spot as last week. Some things never change.',
    'Bear taking pictures at {place}. I’d keep it at fifty-five if I were you, and I am.',
    'Watch {place}. Brown-and-tan with a radar gun hiding in the median.',
  ],
  'radar-no': [
    'Come back, you’re clean and green all the way through {place}.',
    'No bears at {place} today. Must be doughnut hour.',
    'You got a clear shot past {place}. Not a Smokey in sight.',
    'Back door’s clear and the front door’s clear through {place}.',
    'All quiet at {place}. The usual radar fella took the day off.',
    'Nobody’s fishing at {place} this run. Clean and green.',
    'Checked {place} on my way through: empty median, no bears.',
    'You’re clear past {place}. Keep the shiny side up.',
  ],
  'scale-open': [
    'Chicken coop’s open at {place}. Have your paperwork ready.',
    'Scales are open at {place}, and they’re weighing everything with wheels.',
    'Heads up, the coop at {place} is lit up and taking customers.',
    'Weigh station open at {place}. Hope you didn’t top off that tank.',
    'They’ve got the coop open at {place}. Somebody had a long night.',
    'Open scales at {place}. Heavy load? Think about it now.',
    'Coop’s open at {place} and they’re in a mood.',
    'Scale house at {place} is open for business. Line’s short, at least.',
  ],
  'scale-closed': [
    'Chicken coop’s closed at {place}. Roll right on by.',
    'Scales at {place} are dark tonight. Lucky us.',
    'The coop at {place} is shut. Must be shift change.',
    'Closed coop at {place}. Free ride.',
    'Nobody home at the {place} scales.',
    'They closed the scales at {place}. Guess they got tired of weighing me.',
  ],
  'work-yes': [
    'Orange barrels at {place}. Thirty-five and stay in your lane.',
    'Construction at {place}. They’ve got it down to one lane and a fella with a flag.',
    'Road crew out at {place}. Slow it down, they’ve got families too.',
    'Watch the work zone at {place}. Barrels everywhere.',
    'They’re paving at {place}. Thirty-five, and they mean it.',
    'Flagman at {place} waving like his life depends on it, because it does. Slow down.',
    'Work zone at {place}. Smokey likes to sit right at the end of those.',
  ],
  'work-no': [
    'They finished the work at {place}. Smooth road.',
    'No barrels at {place} today. Crew’s off.',
    'Road’s open at {place}. They packed up the cones.',
  ],
  'weather-bad': [
    'It’s {weather} up around {place}. Take it easy out there.',
    'Heard {weather} near {place}. Fella ahead of me says it’s a mess.',
    'Watch it up ahead, {weather} past {place}. Leave yourself some room.',
    'Weather report from the windshield: {weather} near {place}.',
    'I just came through {place}: {weather}. Wouldn’t push it.',
    'They’re saying {weather} by {place}. Might be a good night for a long coffee.',
    'Turn your wipers on early. {weather} coming at {place}.',
  ],
  'weather-clear': [
    'Clear and dry all the way to {place}.',
    'Pretty driving past {place}. Sun’s out.',
    'Road’s dry to {place}. Enjoy it while it lasts.',
    'Not a cloud near {place}. Big sky out here.',
  ],
  'diesel-cheap': [
    'Diesel’s {price} at the next truck stop. Cheapest I’ve seen this week.',
    'Fill up at the next stop: {price} a gallon, and the pie is good.',
    'Next stop’s got diesel at {price}. Go ahead and top off.',
    'You can get fuel for {price} up ahead. That’s practically free.',
  ],
  'diesel-dear': [
    'Fuel’s {price} at the next stop. Highway robbery, but it’s the only game in town.',
    'Next truck stop wants {price} for diesel. Might wait if you can.',
    'Diesel’s dear up ahead: {price}. Buy what you need, not what you want.',
    'They’re charging {price} at the next stop. I bought ten gallons out of spite.',
  ],
  hello: [
    'Breaker one-nine, this is {handle}. Anybody out there on {road}?',
    'How ’bout it, eastbound? Got your ears on?',
    'Radio check, radio check. {handle} rolling on {road}.',
    'Good morning, good buddies. Coffee’s hot and the road’s long.',
    'Ten-four, I hear you loud and proud.',
    'Welcome to the parking lot, new guy. Ha. Just kidding, it moves.',
    'Who’s that big rig with the shiny stacks? Looking good, driver.',
    'You got {handle} on your back door. I’ll keep an eye out.',
    'Anybody got a radio check? I think my antenna’s bent.',
    'This is {handle}, heading for {city}? Same here, maybe. Small world.',
  ],
  day: [
    'Beautiful day to be paid to look out a window.',
    'Sun’s high and the road’s straight. Can’t complain. Well, I can, but I won’t.',
    'Saw a hawk riding the wind back there. Out-drove me for a mile.',
    'My lunch was a gas station burrito. Pray for me.',
    'Anybody know a good diner up ahead? The kind with real pie?',
    'Five hundred miles today and the radio’s still playing the same song.',
    'Truck stop coffee is just warm worry with sugar in it.',
    'Kids on the overpass want a horn. Somebody give ’em one.',
    'Passed a farmer on a tractor going twelve miles an hour. He waved like a king.',
    'Every billboard out here is for a motel or a snake farm.',
  ],
  night: [
    'Late night on the super slab. It’s just us and the moon.',
    'Those stars out here, man. You don’t get those in the city.',
    'Two in the morning and the radio’s playing gospel and polka. Choose your fighter.',
    'Night driving is ninety percent coffee and ten percent singing badly.',
    'Seen any jackrabbits? They’re the only traffic at this hour.',
    'Keep talking, everybody. Voices keep the eyelids up.',
    'Full moon tonight. Brings out the strange stuff and the stranger drivers.',
    'Diner lights up ahead look like a lighthouse.',
    'Quiet out here. Just the tires and the heater.',
    'If you see a set of headlights wandering, honk. It might be me.',
  ],
  rain: [
    'Rain’s coming down in buckets. Watch them puddles.',
    'Wet road, heavy load. Give yourself some room, drivers.',
    'Wipers on high and still can’t see. Slowing down.',
    'Rain makes everybody forget how to drive. Stay sharp.',
    'Hydroplaned a little back there. Fifty’s plenty in this.',
    'Spray off the four-wheelers is worse than the rain itself.',
  ],
  snow: [
    'Snow’s coming sideways. That ain’t a good sign.',
    'Chain law might be up ahead. Hope you packed ’em.',
    'Whiteout conditions, good buddy. Slow way down or pull off.',
    'Slick as a skating rink. I’m doing thirty and praying.',
    'Snowplow ahead. Stay behind him; he’s your best friend tonight.',
    'Blizzard got a fella in the ditch back there. He’s okay. Truck isn’t.',
  ],
  fog: [
    'Fog’s thick as pea soup. Can’t see my own hood ornament.',
    'Lights on, speed down. You can’t stop for what you can’t see.',
    'In this fog the only thing I trust is the white line.',
    'Pea soup out here. Thirty-five feels like a hundred.',
  ],
  tired: [
    'You sound tired, driver. Get some shut-eye at the next stop.',
    'Eyes getting heavy? Nothing out here is worth falling asleep for.',
    'Pull over and sleep. The load will wait. The ditch won’t.',
    'Seen too many good drivers nod off. Don’t be a story.',
    'Coffee helps a little. Sleep helps a lot.',
    'When the white lines start dancing, it’s bedtime.',
  ],
  fast: [
    'Whoa, who’s that flying by? Hammer down, but watch for bears.',
    'Easy on that pedal, friend. Smokeys love a show-off.',
    'You’re burning diesel like it’s free. Fifty-five is the money speed.',
    'Somebody’s got a heavy foot. Hope it’s worth the ticket.',
    'Saw you pass me like I was parked. Fines add up, good buddy.',
  ],
  slow: [
    'Taking it easy back there? Smart driving pays in the long run.',
    'Steady as she goes. Nothing wrong with slow and safe.',
    'You’re gonna make the speed limit look fast. Good for you.',
  ],
  oranges: [
    'Got a reefer load? Keep that unit humming; warm oranges don’t pay.',
    'Citrus run, huh? Mind the clock. Oranges don’t wait.',
    'Smells like orange juice back there, driver. Hope that’s a good thing.',
    'Reefer haul? Don’t let it sit long at the stops, it eats diesel.',
  ],
  mail: [
    'Hauling the U.S. Mail? Neither snow nor rain, right?',
    'Mail run. No hurry, just steady pay. Not a bad gig.',
    'Got letters back there? Tell my mother I said hello.',
  ],
  freight: [
    'Freight run? Dispatcher breathing down your neck, I bet.',
    'Late freight costs you ten percent. Ask me how I know.',
    'Hot load? Hammer down, but not too down.',
  ],
  'nearly-there': [
    'Almost home, driver. Don’t get careless at the end.',
    'Skyline’s coming up. Hold it steady the last few miles.',
    'Big city ahead. Watch the four-wheelers, they don’t know what brakes are.',
    'Smells like {city} from here. You’re close.',
  ],
  ticket: [
    'Saw Smokey got you back there. Happens to all of us.',
    'Paid the bear? That hurts. Keep it under the limit for a while.',
    'Tough break with the ticket, driver. Shake it off.',
  ],
  blowout: [
    'Heard you lost a tire. Spare’s a lifesaver until it isn’t.',
    'Blowout? You okay? Gators in the road everywhere today.',
  ],
  west: [
    'Nothing out here but sagebrush and sky.',
    'Saw a dust devil spinning out by the tracks. Bigger than my truck.',
    'Out here the next town is just a rumour.',
    'Desert’s pretty at dawn. Pink all over.',
    'Hot one today. My cab’s an oven with a radio.',
  ],
  south: [
    'Sweet tea at the next stop, if you know what’s good for you.',
    'Humidity’s so thick I could drink the air.',
    'Pine trees for a hundred miles. Pretty, if you like pine trees.',
    'Kudzu’s eating another barn up ahead.',
    'Saw a gator sunning on the shoulder. Gave him the right of way.',
  ],
  midwest: [
    'Corn to the left, corn to the right, corn in my dreams.',
    'Grain elevators every ten miles. Like lighthouses for farmers.',
    'Flat as a griddle out here. You can watch your dog run away for three days.',
    'Diner up ahead does a breakfast that’ll last you to Ohio.',
  ],
  northeast: [
    'Tolls, tolls and more tolls. They’ll charge you to breathe up here.',
    'Traffic’s backed up again. New Jersey special.',
    'Everybody’s in a hurry out here and nobody’s going anywhere.',
    'Skyline on the right. Never gets old.',
  ],
  plains: [
    'Wind’s blowing my trailer like a sail. Hold on tight.',
    'Wheat everywhere. Smells like bread when it’s cut.',
    'Big sky. I swear it gets bigger every mile.',
    'Prairie dogs watching the traffic like it’s television.',
  ],
  mountains: [
    'Long grade ahead. Gear down, save your brakes.',
    'Runaway truck ramp coming up. Hope nobody needs it.',
    'Thin air up here. My engine and me both feel it.',
    'Pretty pass, steep pass. Watch your brakes on the way down.',
    'Snow on the peaks already. Winter’s coming early this year.',
  ],
  jokes: [
    'What do you call a trucker with no truck? Unemployed. Get it? I’ll see myself out.',
    'My dispatcher says I’m his best driver. He says that to everybody.',
    'Truck stop shower had hot water today. I’m telling my grandkids.',
    'They say you should never trust a skinny cook. I trust this diner completely.',
    'I got two speeds: fifty-five, and fifty-five with the radio up.',
    'You’d make more money washing dishes, my wife says. She’s not wrong.',
    'DUMMY! Ran out of fuel again. Ha. Not today, friends, not today.',
    'My navigator is a paper map and a cup of coffee. Mostly the coffee.',
    'Seen a sign for the world’s largest ball of twine. Wasn’t that large.',
    'If you can read this, you’re too close to my back door.',
  ],
};
