/**
 * The notes on the back of the postcards: two sentences about each place,
 * written for the game. They stick to well-known, general facts and say
 * "is said to" where a town's story is its own. State lines collect a card
 * for the state being entered.
 */
export const PLACE_NOTES: Readonly<Record<string, string>> = {
  seattle:
    'Seattle grew up around its harbor on Puget Sound, and on a clear day Mount Rainier stands over the city. Lumber, ships and airplanes have all been built here.',
  'san-francisco':
    'San Francisco sits on hills at the tip of a peninsula, between the Pacific and its great bay. The Golden Gate Bridge, opened in 1937, links it to the north.',
  'los-angeles':
    'Los Angeles spreads across a wide basin between the mountains and the Pacific. Its ports and freeways make it one of the busiest freight centers in the country.',
  phoenix:
    'Phoenix lies in the Salt River Valley of the Sonoran Desert, where canals have watered farms since ancient times. Summers are long and very hot.',
  'salt-lake-city':
    'Salt Lake City was founded in 1847 by Mormon pioneers at the foot of the Wasatch Range. The Great Salt Lake, saltier than the ocean, lies just to the west.',
  denver:
    'Denver is the Mile High City: one step of the State Capitol sits 5,280 feet above sea level. The Rocky Mountains rise along its western edge.',
  dallas:
    'Dallas grew as a crossroads of railroads and later highways in North Texas. Cotton, oil and banking all helped build its skyline.',
  houston:
    'Houston reaches the Gulf of Mexico by its Ship Channel, which made it a great port and an oil and chemical center. Mission control for NASA’s crewed flights is here.',
  'kansas-city':
    'Kansas City straddles the Missouri–Kansas line where the Kansas River meets the Missouri. It is known for its stockyards history, jazz and barbecue.',
  'st-louis':
    'St. Louis stands just below where the Missouri River joins the Mississippi. The Gateway Arch, 630 feet tall, honors the city’s role as a gateway to the West.',
  minneapolis:
    'Minneapolis grew around the Falls of St. Anthony on the Mississippi, where mills once ground much of the nation’s flour. Its twin, St. Paul, lies just downriver.',
  chicago:
    'Chicago, on the shore of Lake Michigan, became the great rail hub of the nation in the 1800s. Its skyline helped give the world the skyscraper.',
  memphis:
    'Memphis sits on a bluff above the Mississippi in the southwest corner of Tennessee. It is famous for the blues on Beale Street and as a river, rail and trucking crossroads.',
  atlanta:
    'Atlanta began as a railroad junction and grew into the largest city in Georgia. Interstates 75, 85 and 20 all meet here.',
  miami:
    'Miami sits on Biscayne Bay at the southern end of Florida’s Atlantic coast. Warm winters and a busy port have made it a gateway to the Caribbean and Latin America.',
  charlotte:
    'Charlotte, the largest city in North Carolina, was named for Queen Charlotte, wife of King George III. Textiles and banking helped it grow.',
  'washington-dc':
    'Washington, D.C., was laid out as the nation’s capital on the Potomac River in the 1790s. Height limits keep its skyline low, so the Capitol and the Washington Monument stand out.',
  'new-york':
    'New York City grew around one of the world’s great natural harbors, at the mouth of the Hudson River. Trucks reach Manhattan by bridges and tunnels, and pay to get in.',
  boston:
    'Boston, founded in 1630, is one of the oldest cities in the United States. Its harbor and the Freedom Trail tie it closely to the American Revolution.',

  barstow:
    'Barstow grew up as a railroad town in the Mojave Desert, where the roads to Las Vegas and Arizona split. Trains still rumble through day and night.',
  needles:
    'Needles sits on the Colorado River at the Arizona line and is often one of the hottest places in the country. It was named for the sharp peaks across the river.',
  victorville:
    'Victorville lies on the Mojave River in the high desert above Cajon Pass. Old Route 66 ran right through town.',
  'cajon-pass':
    'Cajon Pass carries the highway and the railroads between the Los Angeles Basin and the Mojave Desert. The climb is steep and the winds can be fierce.',
  'san-bernardino':
    'San Bernardino sits at the foot of the San Bernardino Mountains on the eastern edge of the Los Angeles Basin. Railroads and Route 66 made it a crossroads.',
  baker:
    'Baker is a small desert stop on the way to Las Vegas, at the edge of the Mojave. Travelers know it for gas, food and summer heat.',
  'palm-springs':
    'Palm Springs lies at the foot of Mount San Jacinto in the Coachella Valley. Hot springs and winter sunshine made it a desert resort.',
  indio:
    'Indio, in the Coachella Valley, is known for its date palm groves. Most of the country’s dates are grown nearby.',
  'desert-center':
    'Desert Center is little more than a stop in the open desert along the interstate. For many miles in either direction there is not much else.',
  blythe:
    'Blythe is a farm town on the Colorado River at the Arizona border. River water turns the desert here green with alfalfa and cotton.',
  'santa-clarita':
    'The Santa Clarita Valley lies north of Los Angeles on the way to the Tejon Pass. Its ranches once served as backdrops for many western films.',
  grapevine:
    'The Grapevine is the steep stretch of Interstate 5 over the Tejon Pass, more than 4,000 feet up. Winter snow can close it, cutting the main road between Los Angeles and the valley.',
  buttonwillow:
    'Buttonwillow is a farm town at the south end of the San Joaquin Valley. It is said to take its name from a buttonwillow tree that once marked a meeting place.',
  'kettleman-city':
    'Kettleman City is a truck stop town on Interstate 5 in the San Joaquin Valley. Oil fields lie in the hills nearby.',
  coalinga:
    'Coalinga sits on the west side of the San Joaquin Valley near old oil fields. Its name is said to come from a railroad coaling station.',
  'santa-nella':
    'Santa Nella is a travelers’ stop where Interstate 5 meets the road to the coast. The California Aqueduct runs nearby, carrying water south.',
  tracy:
    'Tracy began as a railroad town on the edge of the San Joaquin Valley. It sits where roads from the Bay Area meet Interstate 5.',
  oakland:
    'Oakland faces San Francisco across the bay and is one of the busiest container ports on the West Coast. The Bay Bridge links the two cities.',
  vacaville:
    'Vacaville lies between the Bay Area and Sacramento, on the edge of farm country. It was named for the Vaca family, early settlers.',
  sacramento:
    'Sacramento, California’s capital, grew during the Gold Rush where the Sacramento and American Rivers meet. The first transcontinental railroad began building east from here.',
  dunnigan:
    'Dunnigan is a small stop in the Sacramento Valley where Interstates 5 and 505 meet. Rice fields and orchards stretch out on every side.',
  'red-bluff':
    'Red Bluff stands on the Sacramento River below the reddish bluffs that gave it its name. It has long been a ranching and river town.',
  redding:
    'Redding lies at the northern end of the Sacramento Valley, with Mount Shasta and Lassen Peak in view on clear days. Summers here are hot.',
  'mount-shasta':
    'The town of Mount Shasta lies below the 14,000-foot volcano of the same name. Snow stays on the peak most of the year.',
  'auburn-ca':
    'Auburn grew during the Gold Rush in the Sierra Nevada foothills. Its old town still has buildings from the 1850s.',
  'donner-summit':
    'Donner Summit is where Interstate 80 crosses the Sierra Nevada, more than 7,000 feet up. It is one of the snowiest highway passes in the country.',
  truckee:
    'Truckee is a mountain town near Lake Tahoe, built along the first transcontinental railroad. Its winters bring deep snow.',
  'las-vegas':
    'Las Vegas grew from a railroad stop in the Mojave Desert into a city of casinos and neon. Hoover Dam, finished in 1936, is not far away.',
  mesquite:
    'Mesquite is a small desert town on the Virgin River at the Arizona line. Farms here once grew melons and alfalfa.',
  reno: 'Reno sits in the Truckee Meadows at the foot of the Sierra Nevada. It calls itself the Biggest Little City in the World.',
  lovelock:
    'Lovelock is a farm and ranch town along the Humboldt River in northern Nevada. The emigrant trail to California once followed this valley.',
  winnemucca:
    'Winnemucca grew where the California Trail met the Humboldt River in northern Nevada. It is named for a Northern Paiute leader.',
  'battle-mountain':
    'Battle Mountain is a mining town in the high desert of northern Nevada. Copper and gold have been dug in the hills nearby.',
  elko: 'Elko is a ranching and mining center in northeastern Nevada, with the Ruby Mountains to the southeast. Basque settlers left their mark on its food.',
  wells:
    'Wells sits near the headwaters of the Humboldt River in northeastern Nevada. Its springs were a welcome stop for emigrant wagons.',
  wendover:
    'Wendover straddles the Nevada–Utah line at the edge of the Bonneville Salt Flats. Land-speed records have been set on the flats nearby.',
  quartzsite:
    'Quartzsite is a small Arizona desert town that fills with visitors every winter. Gem and mineral shows draw crowds from across the country.',
  'tonopah-az':
    'Tonopah is a speck of a town in the desert west of Phoenix. Its name is said to refer to the hot springs nearby.',
  tucson:
    'Tucson sits in a desert valley ringed by mountains, among forests of saguaro cactus. Spanish missionaries arrived here in the late 1600s.',
  benson:
    'Benson grew as a railroad town in the San Pedro River valley of southern Arizona. Cattle ranches spread across the grassland around it.',
  willcox:
    'Willcox is a ranching town on the high grasslands of southeastern Arizona. A large dry lake bed, the Willcox Playa, lies just south of town.',
  flagstaff:
    'Flagstaff sits at about 7,000 feet in one of the largest ponderosa pine forests in the world. The San Francisco Peaks, Arizona’s highest, rise north of town.',
  winslow:
    'Winslow is a railroad town on the high desert of northern Arizona. Meteor Crater lies a short drive to the west.',
  holbrook:
    'Holbrook is a gateway to the Petrified Forest, where fallen trees turned to stone millions of years ago. Old Route 66 runs through town.',
  gallup:
    'Gallup lies in red-rock country near the Navajo Nation and Zuni Pueblo. It is known for Native American jewelry and crafts.',
  grants:
    'Grants grew as a railroad town and later a uranium mining center in western New Mexico. Old lava flows lie just south of town.',
  albuquerque:
    'Albuquerque sits on the Rio Grande with the Sandia Mountains rising to the east. It was founded as a Spanish town in 1706.',
  'santa-fe':
    'Santa Fe, founded around 1610, is the oldest state capital in the United States. Its adobe buildings sit at about 7,000 feet.',
  'las-vegas-nm':
    'Las Vegas, New Mexico, was a stop on the Santa Fe Trail long before the Nevada city grew famous. Its old plaza and Victorian buildings remain.',
  raton:
    'Raton grew as a railroad and coal mining town just below Raton Pass. The pass was a hard climb on the Santa Fe Trail.',
  'raton-pass':
    'Raton Pass crosses the mountains between New Mexico and Colorado at nearly 7,800 feet. Wagon trains on the Santa Fe Trail struggled over it.',
  'clayton-nm':
    'Clayton is a ranching town on the high plains of northeastern New Mexico. Dinosaur footprints have been found at a lake nearby.',
  tucumcari:
    'Tucumcari grew up as a railroad town and a favorite stop on old Route 66. Tucumcari Mountain stands south of town.',
  lordsburg:
    'Lordsburg is a railroad and ranching town in the desert of southwestern New Mexico. Ghost towns from mining days lie nearby.',
  deming:
    'Deming is a farm and railroad town on the desert plains of southern New Mexico. The fields around it grow chile and pecans.',
  'las-cruces':
    'Las Cruces lies in the Mesilla Valley of the Rio Grande, with the jagged Organ Mountains to the east. Chile and pecans grow in the valley.',

  'st-george':
    'St. George sits among red cliffs in southwestern Utah, where mild winters earned the area the name Utah’s Dixie. Zion National Park is not far away.',
  'cedar-city':
    'Cedar City is a southern Utah town below high plateaus, near Cedar Breaks and Zion. It began with an iron works in the 1850s.',
  beaver:
    'Beaver is a small ranching town in a high valley of southwestern Utah. The snowy Tushar Mountains rise to the east.',
  'cove-fort':
    'Cove Fort is a stone fort built in 1867 to shelter travelers and mail riders. Here Single Haul’s northern route leaves the interstate for the long way east.',
  fillmore:
    'Fillmore was chosen as Utah’s first territorial capital, and its old statehouse still stands. The town lies in a farming valley below the Pahvant Range.',
  nephi:
    'Nephi is a farming town at the foot of Mount Nebo in central Utah. Wheat and hay fields surround it.',
  provo:
    'Provo sits on the shore of Utah Lake below the steep Wasatch Range. It is home to Brigham Young University.',
  ogden:
    'Ogden grew as a railroad hub soon after the transcontinental line was joined nearby in 1869. The Wasatch Range rises straight up behind the city.',
  tremonton:
    'Tremonton is a farm town in northern Utah’s Bear River Valley. Promontory, where the first transcontinental railroad was completed, lies to the west.',
  snowville:
    'Snowville is a tiny town near the Idaho line, named for an early Mormon leader, Lorenzo Snow, and not for the weather. Sagebrush flats stretch for miles around it.',
  'salina-ut':
    'Salina is a small town in central Utah named for the salt deposits nearby. On Single Haul’s northern route it is where the road turns east toward Colorado.',
  'grand-junction':
    'Grand Junction lies where the Gunnison River meets the Colorado, among orchards and red rock. The canyons of Colorado National Monument rise just west of town.',
  'park-city':
    'Park City was a silver mining town in the Wasatch Mountains east of Salt Lake City. Its old Main Street climbs up the hillside.',
  evanston:
    'Evanston grew as a railroad town in the southwest corner of Wyoming. Winters on this high plateau are long and windy.',
  'green-river-wy':
    'Green River, Wyoming, sits beneath tall sandstone buttes on the river of the same name. John Wesley Powell set off from here in 1869 to explore the canyons of the Colorado.',
  'rock-springs':
    'Rock Springs began as a coal mining town for the Union Pacific Railroad. Miners from dozens of countries settled here.',
  rawlins:
    'Rawlins is a railroad town on the high plains of south-central Wyoming. Its old territorial prison held inmates from 1901 to 1981.',
  laramie:
    'Laramie lies on a high plain between mountain ranges in southeastern Wyoming. The road east climbs over Sherman Summit, the highest point on Interstate 80.',
  cheyenne:
    'Cheyenne, Wyoming’s capital, grew up with the Union Pacific Railroad in 1867. Its summer rodeo, Frontier Days, is one of the oldest in the country.',
  'fort-collins':
    'Fort Collins began as a military post on the Cache la Poudre River in northern Colorado. It is home to Colorado State University.',
  'colorado-springs':
    'Colorado Springs lies at the foot of Pikes Peak, whose view inspired the song “America the Beautiful”. The Air Force Academy is nearby.',
  pueblo:
    'Pueblo grew around steel mills on the Arkansas River in southern Colorado. It was long called the Steel City of the West.',
  trinidad:
    'Trinidad lies at the foot of Raton Pass in southern Colorado, a stop on the old Santa Fe Trail. Coal mines once surrounded the town.',
  boise:
    'Boise, Idaho’s capital, sits on the Boise River at the edge of the Snake River Plain. French trappers are said to have named it for its trees.',
  'twin-falls':
    'Twin Falls lies beside the Snake River canyon in southern Idaho. Irrigation turned the surrounding desert into farmland.',
  'ontario-or':
    'Ontario sits on the Snake River where Oregon meets Idaho, and keeps Mountain time like its Idaho neighbors. Onions and potatoes grow in the fields around it.',
  'baker-city':
    'Baker City grew during a gold rush in the 1860s in the Blue Mountains of eastern Oregon. The Oregon Trail passed nearby.',
  'la-grande':
    'La Grande sits in the Grande Ronde Valley, ringed by the Blue Mountains of eastern Oregon. Oregon Trail wagons rested here before the climb west.',
  pendleton:
    'Pendleton is a ranching and wheat town in eastern Oregon. It is famous for its woolen mills and its September rodeo, the Round-Up.',

  tacoma:
    'Tacoma sits on Commencement Bay at the south end of Puget Sound. Mount Rainier towers to the southeast.',
  olympia:
    'Olympia, Washington’s capital, lies at the southern tip of Puget Sound. The Olympic Mountains rise to the northwest.',
  portland:
    'Portland grew where the Willamette River meets the Columbia, shipping lumber and wheat. It is known as the City of Roses.',
  salem:
    'Salem, Oregon’s capital, sits in the middle of the fertile Willamette Valley. Hops, berries and grass seed grow on the farms around it.',
  eugene:
    'Eugene lies at the southern end of the Willamette Valley, near where the McKenzie River joins the Willamette. It is home to the University of Oregon.',
  'grants-pass':
    'Grants Pass sits on the Rogue River in southern Oregon, among forested hills. It is said to be named for General Grant’s capture of Vicksburg.',
  'snoqualmie-pass':
    'Snoqualmie Pass carries Interstate 90 over the Cascade Range east of Seattle. It is a ski area in winter and often a snowy drive.',
  ellensburg:
    'Ellensburg is a ranching and college town in the Kittitas Valley, east of the Cascades. Its winds are famous among drivers.',
  yakima:
    'Yakima lies in a sunny valley east of the Cascades, where irrigation grows apples, cherries and hops. Much of the nation’s hops come from here.',
  'moses-lake':
    'Moses Lake is a farming town in central Washington, watered from the Columbia River. The lake itself is long and narrow.',
  spokane:
    'Spokane grew around the falls of the Spokane River in eastern Washington. It hosted a World’s Fair in 1974.',
  'coeur-d-alene':
    'Coeur d’Alene sits on a large lake of the same name in the Idaho Panhandle. Logging and mining built the area.',
  'lookout-pass':
    'Lookout Pass carries Interstate 90 over the Bitterroot Range between Idaho and Montana. Here the clock moves from Pacific to Mountain time.',
  missoula:
    'Missoula lies where five valleys meet in western Montana, along the Clark Fork River. It is home to the University of Montana.',
  butte:
    'Butte was built on copper, and its mines once made it one of the richest cities in the West. Mine headframes still stand over the town.',
  bozeman:
    'Bozeman sits in the Gallatin Valley of southwestern Montana, ringed by mountains. It is a gateway to Yellowstone National Park.',
  billings:
    'Billings, Montana’s largest city, lies on the Yellowstone River below sandstone cliffs called the Rimrocks. It grew with the Northern Pacific Railway.',
  'miles-city':
    'Miles City is a cattle town on the Yellowstone River in eastern Montana. Its spring bucking horse sale draws crowds every year.',
  glendive:
    'Glendive sits on the Yellowstone River among the badlands of eastern Montana. Dinosaur fossils have been found in the hills nearby.',
  dickinson:
    'Dickinson is a ranching and oil town in western North Dakota, near the badlands of Theodore Roosevelt National Park. German and Ukrainian settlers farmed the area.',
  bismarck:
    'Bismarck, North Dakota’s capital, sits on the Missouri River. The state capitol is a tall tower that can be seen for miles across the plains.',
  jamestown:
    'Jamestown is a farm town on the James River in North Dakota. A giant concrete buffalo stands on a hill above town.',
  fargo:
    'Fargo lies on the Red River of the North, across from Moorhead, Minnesota. The flat valley around it is some of the richest farmland in the country.',
  'fergus-falls':
    'Fergus Falls sits on the Otter Tail River in western Minnesota’s lake country. Farms and lakes surround the town.',
  'st-cloud':
    'St. Cloud lies on the Mississippi River in central Minnesota. Its granite quarries supplied stone for buildings far and wide.',

  'el-paso':
    'El Paso sits on the Rio Grande across from Ciudad Juárez, Mexico, where the river cuts through the mountains. It keeps Mountain time, unlike most of Texas.',
  'van-horn':
    'Van Horn is a small West Texas town where the clock moves from Mountain to Central time. Desert mountains rise on every side.',
  pecos:
    'Pecos is a ranch and oil town on the Pecos River in West Texas. It claims to have held the world’s first rodeo, in 1883.',
  odessa: 'Odessa grew with the Permian Basin oil boom. Pumpjacks nod in the fields all around it.',
  midland:
    'Midland got its name for lying midway between Fort Worth and El Paso on the railroad. Oil made it a business center for the Permian Basin.',
  'big-spring':
    'Big Spring is named for a spring that drew buffalo and travelers on the dry plains. Today it is a ranching and oil town.',
  sweetwater:
    'Sweetwater is a West Texas town known for its rattlesnake roundup each spring. Wind sweeps the plains around it.',
  abilene:
    'Abilene, Texas, began as a railroad shipping point for cattle in 1881. It was named after Abilene, Kansas, the old cow town.',
  weatherford:
    'Weatherford is a ranching town west of Fort Worth, known for its peaches and its cutting horses. Its courthouse square is a local landmark.',
  'fort-worth':
    'Fort Worth grew as a cow town on the Chisholm Trail, and its stockyards were once among the busiest anywhere. It calls itself the place where the West begins.',
  amarillo:
    'Amarillo grew as a railroad and cattle-shipping town on the flat Texas Panhandle. Old Route 66 and Interstate 40 both cross it.',
  dalhart:
    'Dalhart lies on the old range of the huge XIT Ranch in the Texas Panhandle. Wheat and cattle remain its business.',
  childress:
    'Childress is a railroad and ranching town in the Texas Panhandle on the road from Amarillo to Fort Worth. Cotton fields and pastures surround it.',
  'wichita-falls':
    'Wichita Falls lies near the Red River in North Texas, where an oil boom came in the early 1900s. The town’s namesake falls washed away in a flood long ago.',
  'decatur-tx':
    'Decatur is a small town north of Fort Worth on the road to Wichita Falls. Its old courthouse is built of pink granite.',
  'oklahoma-city':
    'Oklahoma City was founded in a single day during the Land Run of 1889. Oil wells have stood on the grounds of the State Capitol.',
  ennis:
    'Ennis is a railroad town south of Dallas, known for its spring bluebonnet trails. Czech settlers brought their customs and pastries here.',
  corsicana:
    'Corsicana is where oil was struck by accident in 1894 while drilling for water, starting the first Texas oil boom. It sits on the prairie south of Dallas.',
  'fairfield-tx':
    'Fairfield is a small town in the rolling post oak country of East Texas. Lakes and pastures surround it.',
  madisonville:
    'Madisonville is a small town on Interstate 45 between Dallas and Houston. The pine woods begin to thicken around it.',
  'huntsville-tx':
    'Huntsville was the home of Sam Houston, who led Texas to independence, and his grave is here. It is also the headquarters of the Texas prison system.',
  conroe:
    'Conroe grew from a sawmill town in the pine forests north of Houston. Oil was discovered nearby in the 1930s.',
  denton:
    'Denton is a college town north of Dallas, with two universities and a courthouse square. It sits where the prairie meets the Cross Timbers.',
  'gainesville-tx':
    'Gainesville lies just south of the Red River and the Oklahoma line. It grew as a stop for wagon trains and later a cattle town.',
  ardmore:
    'Ardmore is an oil and ranching town in southern Oklahoma, near the Arbuckle Mountains. It grew up with the Santa Fe railroad.',
  wichita:
    'Wichita grew as a cow town on the Chisholm Trail, then became a center of aircraft building. Several famous airplane makers started here.',
  emporia:
    'Emporia is a college town in the Flint Hills of eastern Kansas. Its newspaper editor William Allen White became famous nationwide.',
  'greenville-tx':
    'Greenville is a cotton town east of Dallas on the Blackland Prairie. Its fields were once among the richest cotton land in Texas.',
  'mount-pleasant':
    'Mount Pleasant is a market town in the piney woods of Northeast Texas. Poultry farms and lakes surround it.',
  texarkana:
    'Texarkana straddles the Texas–Arkansas line, with State Line Avenue running down the middle. Its federal building sits in both states at once.',
  hope: 'Hope is a small town in southwestern Arkansas known for its giant watermelons. Farms and pine woods surround it.',
  arkadelphia:
    'Arkadelphia sits on the Ouachita River in southwestern Arkansas. It is home to two colleges.',
  'little-rock':
    'Little Rock, Arkansas’s capital, is named for a small rock outcrop on the Arkansas River that guided early travelers. The Ouachita Mountains rise to the west.',
  'forrest-city':
    'Forrest City lies on Crowley’s Ridge, a long low ridge rising above the flat Arkansas Delta. Cotton and rice fields stretch out on both sides.',
  'west-memphis':
    'West Memphis sits across the Mississippi from Memphis in the flat Arkansas Delta. Trucks and trains cross the river here day and night.',
  beaumont:
    'Beaumont is where the Spindletop gusher came in on January 10, 1901, launching the Texas oil boom. Refineries still line the Neches River.',

  'lake-charles':
    'Lake Charles is a port and refinery city in southwestern Louisiana’s Cajun country. Rice fields and marshes stretch toward the Gulf.',
  'lafayette-la':
    'Lafayette is the heart of Cajun country, where French-speaking Acadians settled in the 1700s. Its music and food are famous.',
  atchafalaya:
    'The Atchafalaya Basin is the largest river swamp in the United States. Interstate 10 crosses it on a bridge about 18 miles long.',
  'baton-rouge':
    'Baton Rouge, Louisiana’s capital, stands on the Mississippi River. Its state capitol, built in the 1930s, is the tallest in the nation.',
  'new-orleans':
    'New Orleans was founded by the French in 1718 near the mouth of the Mississippi River. It is famous for jazz, its French Quarter and Mardi Gras.',
  gulfport:
    'Gulfport is a port city on the Mississippi Gulf Coast, built around a deepwater harbor. Long sand beaches line the coast.',
  mobile:
    'Mobile is Alabama’s port on Mobile Bay, founded by the French in 1702. The city says it held America’s first Mardi Gras celebrations.',
  montgomery:
    'Montgomery, Alabama’s capital, was the first capital of the Confederacy and later a birthplace of the civil rights movement. The 1955 bus boycott began here.',
  'auburn-al':
    'Auburn is a college town in eastern Alabama, home to Auburn University. Its streets are lined with oaks.',
  lagrange:
    'LaGrange is a textile town in west Georgia near the Alabama line. It was named for the French estate of the Marquis de Lafayette.',
  vicksburg:
    'Vicksburg stands on high bluffs above the Mississippi River. Its surrender in July 1863 gave the Union control of the river.',
  birmingham:
    'Birmingham grew from iron and steel, using the coal, iron ore and limestone found together nearby. A huge iron statue of Vulcan watches over the city.',
  'holly-springs':
    'Holly Springs is a north Mississippi town known for its antebellum homes. Cotton farms surround it.',
  tupelo:
    'Tupelo is a manufacturing town in northeastern Mississippi. Elvis Presley was born here in 1935.',
  'jasper-al':
    'Jasper is a coal mining town in the hills of northwestern Alabama. Its mines fed the furnaces of Birmingham.',
  anniston:
    'Anniston is an industrial town in the foothills of the Appalachians in eastern Alabama. Fort McClellan, an Army post, is its neighbor.',
  macon:
    'Macon sits on the Ocmulgee River in the middle of Georgia, near ancient Native American mounds. Its spring cherry blossoms are famous.',
  cordele:
    'Cordele calls itself the Watermelon Capital of the World. Peanuts and cotton grow on the farms around it.',
  tifton:
    'Tifton is a farm town in south Georgia where several highways and railroads cross. Peanuts, cotton and vegetables grow nearby.',
  valdosta:
    'Valdosta is the last big Georgia town before Florida on Interstate 75. It is surrounded by pine forests and farmland.',
  'lake-city':
    'Lake City is a north Florida town surrounded by lakes and pine forests. Many drivers stop here on the way south.',
  'gainesville-fl':
    'Gainesville is home to the University of Florida. Springs, sinkholes and live oaks dot the land around it.',
  ocala:
    'Ocala is horse country: its rolling pastures sit on limestone that is said to make strong bones. Clear springs bubble up nearby.',
  wildwood:
    'Wildwood is a junction town where Florida’s Turnpike begins its run south. Farms and forests surround it.',
  orlando:
    'Orlando was a quiet citrus and cattle town until big theme parks opened nearby in the early 1970s. Lakes are scattered all through the city.',
  'fort-pierce':
    'Fort Pierce is a coastal town on Florida’s Indian River, known for its citrus. A fort built here in the 1830s gave it its name.',
  'west-palm-beach':
    'West Palm Beach grew as the working town across the lagoon from the resort of Palm Beach. Palm trees line its waterfront.',
  'fort-lauderdale':
    'Fort Lauderdale is laced with canals and is called the Venice of America. Its beaches draw visitors all winter.',
  'daytona-beach':
    'Daytona Beach is famous for its hard-packed sand, where early automobiles raced along the shore. Its speedway hosts a great stock car race each February.',
  jacksonville:
    'Jacksonville, on the St. Johns River, covers more land than any other city in the lower 48 states. Its port ships cars and goods along the Atlantic coast.',
  savannah:
    'Savannah, founded in 1733, was laid out around a grid of shady squares that still survives. Its port on the Savannah River is one of the busiest in the South.',
  florence:
    'Florence grew as a railroad junction in the Pee Dee region of South Carolina. Tobacco was long the crop of the farms around it.',
  fayetteville:
    'Fayetteville sits on the Cape Fear River and is home to Fort Bragg, one of the largest Army posts in the world. It was named for the Marquis de Lafayette.',
  'rocky-mount':
    'Rocky Mount grew as a railroad and tobacco market town in eastern North Carolina. It takes its name from the rocks at the falls of the Tar River.',

  'gainesville-ga':
    'Gainesville, Georgia, calls itself the Poultry Capital of the World. Lake Lanier spreads out just to the west.',
  anderson:
    'Anderson is a textile town in the South Carolina upstate. It was among the first places in the South with electric power sent from a distance, and calls itself the Electric City.',
  'greenville-sc':
    'Greenville grew around the falls of the Reedy River and became a textile center of the upstate. The Blue Ridge rises to its north.',
  spartanburg:
    'Spartanburg is a textile and railroad town in upstate South Carolina, where several rail lines meet. Peach orchards grow nearby.',
  gaffney:
    'Gaffney is a small town on Interstate 85 known for its peaches. A water tower painted like a giant peach went up beside the highway in 1981.',
  gastonia:
    'Gastonia grew as a cotton mill town west of Charlotte. Crowders Mountain rises nearby.',
  'salisbury-nc':
    'Salisbury is one of the oldest towns in western North Carolina, with a historic downtown. A Civil War prison camp stood here.',
  greensboro:
    'Greensboro is a textile and tobacco town in the North Carolina Piedmont. In 1960 a lunch counter sit-in here helped spread the civil rights movement.',
  'burlington-nc':
    'Burlington grew as a textile mill town in the North Carolina Piedmont. Its factory outlets draw shoppers from far away.',
  durham:
    'Durham grew on tobacco, and its old brick warehouses still stand downtown. It is home to Duke University.',
  'south-hill':
    'South Hill is a small town in Southside Virginia, among tobacco farms. It sits where Interstate 85 meets U.S. 58.',
  petersburg:
    'Petersburg stands on the Appomattox River south of Richmond. The long siege here in 1864 and 1865 was one of the last chapters of the Civil War.',
  richmond:
    'Richmond, Virginia’s capital, sits at the falls of the James River. It was the capital of the Confederacy during the Civil War.',
  fredericksburg:
    'Fredericksburg lies on the Rappahannock River halfway between Richmond and Washington. George Washington spent part of his boyhood nearby.',
  baltimore:
    'Baltimore is a port city on the Chesapeake Bay, where the defense of Fort McHenry in 1814 inspired the national anthem. Its harbor has long shipped goods around the world.',
  'new-brunswick':
    'New Brunswick lies on the Raritan River and is home to Rutgers University. The New Jersey Turnpike passes just outside town.',
  newark:
    'Newark is New Jersey’s largest city, beside one of the busiest ports and airports in the region. Ships, planes and trucks crowd the meadows nearby.',
  'holland-tunnel':
    'The Holland Tunnel, opened in 1927, runs under the Hudson River between Jersey City and Manhattan. It was the first long tunnel built with fans to clear the exhaust.',
  'george-washington-bridge':
    'The George Washington Bridge crosses the Hudson River from Fort Lee, New Jersey, to upper Manhattan. When it opened in 1931 its main span was the longest in the world.',
  hagerstown:
    'Hagerstown is a crossroads in western Maryland’s Cumberland Valley, where Interstates 70 and 81 meet. It was founded in the 1760s.',
  frederick:
    'Frederick is a historic town in central Maryland, with church spires above its old brick streets. Civil War armies marched through here more than once.',
  hancock:
    'Hancock sits on the Potomac River at the narrowest point of Maryland, less than two miles wide. The C&O Canal runs alongside the town.',
  breezewood:
    'Breezewood is a town of motels and gas stations where travelers leave the Pennsylvania Turnpike to reach Interstate 70 south. Its short stretch of traffic lights is famous among drivers.',
  'allegheny-tunnel':
    'The Allegheny Mountain Tunnel carries the Pennsylvania Turnpike under a ridge of the Alleghenies. The turnpike opened in 1940 as America’s first long-distance superhighway.',
  somerset:
    'Somerset sits on a high plateau in the Laurel Highlands of southwestern Pennsylvania. Winters here are snowy.',
  'new-stanton':
    'New Stanton is where Interstate 70 joins the Pennsylvania Turnpike southeast of Pittsburgh. Rolling farmland and hills surround it.',
  harrisburg:
    'Harrisburg, Pennsylvania’s capital, stands on the Susquehanna River. Its capitol dome is said to be modeled on St. Peter’s in Rome.',
  wheeling:
    'Wheeling grew where the National Road crossed the Ohio River in West Virginia’s northern panhandle. Its suspension bridge, built in 1849, was once the longest in the world.',
  dubois:
    'DuBois is a small city in the forested hills of western Pennsylvania. Lumber and coal built the town.',
  bellefonte:
    'Bellefonte is a Victorian town in central Pennsylvania whose name is said to mean “beautiful fountain”, for its big spring. Penn State’s campus lies nearby.',
  milton:
    'Milton is a river town on the West Branch of the Susquehanna in central Pennsylvania. Farmland and wooded ridges surround it.',
  hazleton:
    'Hazleton sits high on a mountain in Pennsylvania’s anthracite coal region. Immigrants from many countries came to work its mines.',
  'east-stroudsburg':
    'East Stroudsburg is a gateway to the Pocono Mountains, near the Delaware Water Gap. Resorts and forests surround it.',
  stamford:
    'Stamford is a Connecticut city on Long Island Sound, close enough to New York for commuters. Many companies have their headquarters here.',
  'new-haven':
    'New Haven is home to Yale University, founded in 1701. Its harbor opens onto Long Island Sound.',
  'new-london':
    'New London is a port on the Thames River in Connecticut, with a long history of whaling and shipbuilding. Submarines are built across the river in Groton.',
  providence:
    'Providence, founded by Roger Williams in 1636, is Rhode Island’s capital. Its marble statehouse dome is among the largest of its kind.',
  worcester:
    'Worcester is a manufacturing city in the center of Massachusetts. Its factories have made everything from wire to valentine cards.',
  'springfield-ma':
    'Springfield is a city on the Connecticut River in western Massachusetts. Basketball was invented here in 1891.',
  albany:
    'Albany, New York’s capital, lies on the Hudson River near where the Erie Canal began its run west. Dutch traders settled here in the 1600s.',
  utica:
    'Utica grew along the Erie Canal in the Mohawk Valley. Textile mills once lined its river.',
  syracuse:
    'Syracuse was once famous for salt, boiled from springs around Onondaga Lake. The Erie Canal ran right through downtown.',
  rochester:
    'Rochester grew around the falls of the Genesee River and became known for flour, then for cameras and copiers.',
  buffalo:
    'Buffalo sits at the eastern end of Lake Erie, near Niagara Falls. Lake-effect snow can bury the city in a single storm.',
  erie: 'Erie is Pennsylvania’s port on Lake Erie. Presque Isle, a long sandy peninsula, shelters its harbor.',

  'terre-haute':
    'Terre Haute, French for “high land”, sits on the Wabash River in western Indiana. The National Road once ran through its downtown.',
  indianapolis:
    'Indianapolis was built as Indiana’s capital on a planned grid with a circle at its center. Its 500-mile race is held every Memorial Day weekend.',
  'columbus-oh':
    'Columbus, Ohio’s capital, sits where the Scioto and Olentangy Rivers meet. It is home to Ohio State University.',
  omaha:
    'Omaha grew as a river town on the Missouri and the starting point of the Union Pacific Railroad. Its stockyards were once among the largest anywhere.',
  'des-moines':
    'Des Moines, Iowa’s capital, lies where the Des Moines and Raccoon Rivers meet. Insurance companies make it a business center for the farm country.',
  gary: 'Gary was founded in 1906 as a steel town on the southern shore of Lake Michigan. The glow of its mills can be seen for miles at night.',
  cleveland:
    'Cleveland grew where the Cuyahoga River meets Lake Erie, shipping iron ore and making steel. Its lakefront and its orchestra are well known.',
  toledo:
    'Toledo is a port at the western end of Lake Erie, known for glassmaking. Cargo from ships and trains changes hands here.',
  youngstown:
    'Youngstown grew around steel mills in the Mahoning Valley of eastern Ohio. Many of the mills closed in the late 1970s.',
  'south-bend':
    'South Bend lies on a bend of the St. Joseph River in northern Indiana. Wagons and later cars were built here, and the University of Notre Dame is next door.',
  elkhart:
    'Elkhart is known for building recreational vehicles and band instruments. It sits where the Elkhart River meets the St. Joseph.',
  limon:
    'Limon is a crossroads on the high plains of eastern Colorado, where highways and railroads meet. On clear days Pikes Peak can be seen far to the west.',
  'burlington-co':
    'Burlington is the last Colorado town before Kansas on Interstate 70. Its carousel, built in 1905, still turns.',
  colby:
    'Colby is a farm town on the high plains of western Kansas, near where the clock moves from Mountain to Central time. Wheat stretches to the horizon.',
  wakeeney:
    'WaKeeney calls itself the Christmas City of the High Plains for its holiday lights. It sits about halfway between Kansas City and Denver.',
  hays: 'Hays grew around Fort Hays, a frontier army post on the Kansas plains. Buffalo Bill Cody and Wild Bill Hickok both passed through.',
  'salina-ks':
    'Salina, Kansas, is a farm and railroad town on the Smoky Hill River. Grain elevators tower over the town.',
  'abilene-ks':
    'Abilene, Kansas, was the end of the Chisholm Trail, where Texas cattle were loaded onto trains. President Eisenhower grew up here.',
  'junction-city':
    'Junction City lies where the Republican and Smoky Hill Rivers join to form the Kansas River. Fort Riley, an old cavalry post, is next door.',
  topeka:
    'Topeka, Kansas’s capital, sits on the Kansas River. The Supreme Court’s 1954 Brown v. Board of Education case began here.',
  lawrence:
    'Lawrence was founded by antislavery settlers in 1854 and is home to the University of Kansas. It lies along the Kansas River.',
  'columbia-mo':
    'Columbia, Missouri, is a college town halfway between Kansas City and St. Louis. The University of Missouri was founded here in 1839.',
  'kingdom-city':
    'Kingdom City is a truck stop crossroads in central Missouri. It is named for the “Kingdom of Callaway”, a county that is said to have once claimed to stand apart from the Union.',
  wentzville:
    'Wentzville is a small town west of St. Louis on Interstate 70. Rolling farmland surrounds it.',
  cameron:
    'Cameron is a small farm town in northwestern Missouri where highways cross. Rolling cornfields surround it.',
  bethany:
    'Bethany is a farm town in the rolling hills of northern Missouri. Cattle pastures and hay fields stretch around it.',
  ames: 'Ames is home to Iowa State University, founded in 1858 as a farm college. Research here helped shape modern farming.',
  'clear-lake':
    'Clear Lake is a resort town on a spring-fed lake in northern Iowa. Buddy Holly played his last show at the Surf Ballroom here in 1959.',
  'albert-lea':
    'Albert Lea sits among lakes in southern Minnesota, close to the Iowa line. Meatpacking and farming built the town.',
  owatonna:
    'Owatonna is a farm town in southern Minnesota known for a bank building designed by Louis Sullivan. Dairy and grain farms surround it.',
  'hudson-wi':
    'Hudson sits on the St. Croix River, the first Wisconsin town across from Minnesota. Its old octagon house is a local landmark.',
  'eau-claire':
    'Eau Claire grew as a lumber town where the Eau Claire River meets the Chippewa. Its name is French for “clear water”.',
  tomah:
    'Tomah is a small Wisconsin town where Interstates 90 and 94 meet. Cranberry bogs lie in the marshes nearby.',
  'wisconsin-dells':
    'Wisconsin Dells is named for the sandstone gorges of the Wisconsin River. Boat tours and water parks draw summer crowds.',
  madison:
    'Madison, Wisconsin’s capital, sits on a narrow strip of land between two lakes. Its capitol dome rises at the center of town.',
  rockford:
    'Rockford grew as a factory town on the Rock River in northern Illinois. Furniture, tools and machinery were made here.',
  litchfield:
    'Litchfield is a small town on old Route 66 in the farm country of central Illinois. Coal mines once worked nearby.',
  'springfield-il':
    'Springfield is Illinois’s capital and Abraham Lincoln’s hometown. His home and his tomb are here.',
  'lincoln-il':
    'Lincoln, Illinois, was named for Abraham Lincoln before he became president, with his help as a lawyer. It is said he christened it with watermelon juice.',
  'bloomington-il':
    'Bloomington, with its twin town Normal, is a center for insurance and farming in central Illinois. Corn and soybeans stretch in every direction.',
  'pontiac-il':
    'Pontiac is a small town on old Route 66 in Illinois, named for an Ottawa chief. Swinging footbridges cross its river.',
  joliet:
    'Joliet is an old canal and steel town southwest of Chicago. Its limestone prison is a local landmark.',
  'cape-girardeau':
    'Cape Girardeau is a river town on the Mississippi in southeastern Missouri. It began as a French trading post in the 1700s.',
  sikeston:
    'Sikeston is a farm town in Missouri’s Bootheel, where cotton grows. A local cafe is known for tossing dinner rolls across the room to its customers.',
  blytheville:
    'Blytheville is a cotton town in the flat Delta of northeastern Arkansas. An Air Force base stands nearby.',
  'lafayette-in':
    'Lafayette is a river town on the Wabash in Indiana, across from Purdue University. It was named for the Marquis de Lafayette.',
  'columbus-in':
    'Columbus, Indiana, is known for its many modern buildings designed by noted architects. Farm country surrounds it.',
  louisville:
    'Louisville grew at the Falls of the Ohio, the one place boats had to stop on the river. The Kentucky Derby has been run here every May since 1875.',
  elizabethtown:
    'Elizabethtown is a crossroads town in central Kentucky. Abraham Lincoln’s parents lived here for a time.',
  'bowling-green':
    'Bowling Green lies in the cave country of south-central Kentucky, near Mammoth Cave. A sports car factory opened here in 1981.',
  nashville:
    'Nashville, Tennessee’s capital, is the home of country music and the Grand Ole Opry. It sits on the Cumberland River.',
  monteagle:
    'Monteagle sits atop the Cumberland Plateau, where Interstate 24 drops steeply down the mountain. Truck drivers treat its long grade with great respect.',
  chattanooga:
    'Chattanooga lies in a bend of the Tennessee River, ringed by mountains. Lookout Mountain rises above the city.',
  dalton:
    'Dalton calls itself the Carpet Capital of the World, and much of America’s carpet is made nearby. It sits at the foot of the Appalachians in north Georgia.',
  kingman:
    'Kingman is a railroad town on old Route 66 in the desert of northwestern Arizona. Hoover Dam lies to the north.',
  'fort-smith':
    'Fort Smith grew from a frontier fort on the Arkansas River at the edge of Indian Territory. Judge Isaac Parker held court here.',
  'jackson-tn':
    'Jackson is a railroad town in west Tennessee, between Memphis and Nashville. Casey Jones, the famous engineer, lived here.',
  cookeville:
    'Cookeville sits on the Highland Rim of Tennessee, among waterfalls and lakes. It is home to Tennessee Tech.',
  knoxville:
    'Knoxville lies on the Tennessee River near the Great Smoky Mountains. 1982 is the year of its World’s Fair.',
  bristol:
    'Bristol straddles the Tennessee–Virginia line, with State Street dividing the two states. Some of the first country music records were made here in 1927.',
  roanoke:
    'Roanoke grew as a railroad town in the Blue Ridge of southwestern Virginia. A huge lighted star stands on Mill Mountain above the city.',
  staunton:
    'Staunton is a hilly town in Virginia’s Shenandoah Valley. President Woodrow Wilson was born here.',
  allentown:
    'Allentown is an industrial city in Pennsylvania’s Lehigh Valley. The Liberty Bell was hidden here during the Revolutionary War.',
};

/** Cards collected at state lines, by postal code: "Welcome to …". */
export const STATE_NOTES: Readonly<Record<string, string>> = {
  AL: 'Alabama stretches from the Gulf Coast to the foothills of the Appalachians. Cotton, iron and steel built much of the state.',
  AR: 'Arkansas runs from the flat Mississippi Delta in the east to the Ozark and Ouachita Mountains in the west. Rice and cotton grow in its lowlands.',
  AZ: 'Arizona is the Grand Canyon State. It keeps Mountain Standard Time all year round, even in summer.',
  CA: 'California grows much of the nation’s fruit and vegetables. Inspectors at its borders check vehicles for farm pests.',
  CO: 'Colorado has more peaks over 14,000 feet than any other state. Its high plains roll east toward Kansas.',
  CT: 'Connecticut is one of the original thirteen colonies, on Long Island Sound. Its turnpike runs along the shore.',
  DC: 'The District of Columbia is the nation’s capital and belongs to no state. It was carved out of land along the Potomac.',
  DE: 'Delaware was the first state to ratify the Constitution, in 1787. It is the second-smallest state.',
  FL: 'Florida is the Sunshine State, with more coastline than any other state but Alaska. Citrus groves cover its middle.',
  GA: 'Georgia is the largest state east of the Mississippi. It is known for peaches, peanuts and pine forests.',
  IA: 'Iowa lies between the Mississippi and Missouri Rivers and is among the top corn-growing states. Its farms are some of the most productive anywhere.',
  ID: 'Idaho is famous for potatoes grown on the Snake River Plain. Its north is mountains and lakes.',
  IL: 'Illinois is the Land of Lincoln, flat and fertile, with Chicago on Lake Michigan. Corn and soybeans cover much of it.',
  IN: 'Indiana calls itself the Crossroads of America, with many highways meeting in it. Much of the state stays on Eastern Standard Time all year.',
  KS: 'Kansas lies in the middle of the country and grows more wheat than almost any other state. Its plains rise gently toward the west.',
  KY: 'Kentucky is the Bluegrass State, known for horses and caves. The time zone line runs through the middle of it.',
  LA: 'Louisiana has parishes instead of counties, a legacy of its French and Spanish past. Bayous and marshes cover much of its south.',
  MA: 'Massachusetts is where the Pilgrims landed in 1620 and the American Revolution began. Its turnpike runs the width of the state.',
  MD: 'Maryland wraps around the Chesapeake Bay, famous for its blue crabs. Its narrow west reaches into the Appalachians.',
  MN: 'Minnesota calls itself the Land of 10,000 Lakes, and has more than that. The Mississippi River begins here.',
  MO: 'Missouri is the Show-Me State, where the Missouri River meets the Mississippi. Its south rises into the Ozarks.',
  MS: 'Mississippi takes its name from the great river along its western edge. Cotton and pine forests cover much of the state.',
  MT: 'Montana is Big Sky Country, with the Rockies in the west and plains in the east. It is the fourth-largest state.',
  NC: 'North Carolina runs from the Outer Banks to the Great Smoky Mountains. Tobacco and textiles long drove its economy.',
  ND: 'North Dakota is wheat and sunflower country on the northern plains. Its winters are among the coldest in the lower 48.',
  NE: 'Nebraska follows the Platte River across the plains, the route of the Oregon Trail and the first transcontinental railroad. Corn and cattle are its business.',
  NJ: 'New Jersey is the most densely populated state, between New York and Philadelphia. Its turnpike is one of the busiest roads in the country.',
  NM: 'New Mexico is the Land of Enchantment, with adobe towns, high deserts and mountains. Santa Fe is its capital.',
  NV: 'Nevada is mostly high desert, crossed by mountain ranges running north to south. Much of its land belongs to the federal government.',
  NY: 'New York runs from the Atlantic to the Great Lakes. The Erie Canal once carried trade across the state.',
  OH: 'Ohio lies between Lake Erie and the Ohio River. Its factories and farms made it an industrial heartland.',
  OK: 'Oklahoma was opened to settlers in land runs beginning in 1889. Oil and cattle built its towns.',
  OR: 'Oregon was the end of the Oregon Trail, and its Willamette Valley drew thousands of settlers. Forests cover the west, high desert the east.',
  PA: 'Pennsylvania was founded by William Penn and was home to the Declaration of Independence. Its turnpike was America’s first long-distance superhighway.',
  RI: 'Rhode Island is the smallest state, but has a long coastline on Narragansett Bay. It was founded by Roger Williams.',
  SC: 'South Carolina runs from the Atlantic beaches to the Blue Ridge. Textile mills line its upstate.',
  TN: 'Tennessee stretches from the Mississippi to the Great Smoky Mountains. It is the home of country music and the blues.',
  TX: 'Texas is the largest state in the lower 48 and was once its own republic. Most of it keeps Central time; El Paso keeps Mountain.',
  UT: 'Utah is a land of red rock canyons, the Wasatch Mountains and the Great Salt Lake. Mormon pioneers settled it in 1847.',
  VA: 'Virginia is where English settlers founded Jamestown in 1607, and eight presidents were born here. Radar detectors are illegal on its roads.',
  WA: 'Washington is the Evergreen State, with rain forests in the west and dry farmland in the east. Its apples are famous.',
  WI: 'Wisconsin is America’s Dairyland, with cheese, cranberries and many lakes. Its north is deep woods.',
  WV: 'West Virginia is the Mountain State, almost entirely within the Appalachians. Coal has long been its business.',
  WY: 'Wyoming is wide open plains between mountain ranges, with few people to share them. Yellowstone, the first national park, lies in its northwest.',
};
