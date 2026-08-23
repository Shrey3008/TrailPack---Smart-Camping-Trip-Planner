/* =============================================================================
   Curated trail-access anchors — 50 states plus the District of Columbia.

   Bundled deliberately. Selecting a state resolves entirely in the browser
   against this table, so picking "Montana" costs no network request at all.
   That also keeps us clear of the Nominatim usage policy, which forbids
   client-side autocomplete against the public instance and caps the whole
   application at one request per second.

   These are anchors, not centroids, and the difference is the point. The
   geographic centre of Colorado is empty high plains an hour from a trailhead;
   "trails near the centre of Colorado" would be a poor first impression of a
   feature meant to sell the state. Each row below is instead a place people
   actually start a hike from — a park gateway town, a canyon, a range's front
   door — so a state pick opens somewhere worth looking at. The radius slider
   then works outward from there, and the user can move the pin.

   Every coordinate in this table is verified by reverse geocoding to fall
   inside the state it claims (see __tests__/stateAnchors.test.js, which
   re-checks containment against bundled state bounding boxes on every run).

   Bump ANCHORS_VERSION when a row changes, so anything caching a resolved
   anchor can tell.
   ========================================================================== */

const ANCHORS_VERSION = 1;

const STATE_ANCHORS = [
  { code: 'AL', name: 'Alabama',              anchor: 'Little River Canyon',            lat: 34.3920, lon: -85.6360 },
  { code: 'AK', name: 'Alaska',               anchor: 'Denali National Park entrance',  lat: 63.7283, lon: -148.8859 },
  { code: 'AZ', name: 'Arizona',              anchor: 'Flagstaff',                      lat: 35.1983, lon: -111.6513 },
  { code: 'AR', name: 'Arkansas',             anchor: 'Ponca, Buffalo National River',  lat: 36.0223, lon: -93.3660 },
  { code: 'CA', name: 'California',           anchor: 'Yosemite Valley',                lat: 37.7456, lon: -119.5936 },
  { code: 'CO', name: 'Colorado',             anchor: 'Estes Park',                     lat: 40.3772, lon: -105.5217 },
  { code: 'CT', name: 'Connecticut',          anchor: 'Kent',                           lat: 41.7237, lon: -73.4773 },
  { code: 'DE', name: 'Delaware',             anchor: 'White Clay Creek, Newark',       lat: 39.7180, lon: -75.7600 },
  { code: 'DC', name: 'District of Columbia', anchor: 'Rock Creek Park',                lat: 38.9560, lon: -77.0500 },
  { code: 'FL', name: 'Florida',              anchor: 'Ocala National Forest',          lat: 29.1872, lon: -81.7401 },
  { code: 'GA', name: 'Georgia',              anchor: 'Amicalola Falls',                lat: 34.5620, lon: -84.2477 },
  { code: 'HI', name: 'Hawaii',               anchor: 'Volcano, Hawaii',                lat: 19.4300, lon: -155.2400 },
  { code: 'ID', name: 'Idaho',                anchor: 'Ketchum, Sawtooths',             lat: 43.6805, lon: -114.3637 },
  { code: 'IL', name: 'Illinois',             anchor: 'Shawnee National Forest',        lat: 37.6167, lon: -89.2131 },
  { code: 'IN', name: 'Indiana',              anchor: 'Brown County State Park',        lat: 39.1560, lon: -86.2270 },
  { code: 'IA', name: 'Iowa',                 anchor: 'Effigy Mounds, McGregor',        lat: 43.0169, lon: -91.1813 },
  { code: 'KS', name: 'Kansas',               anchor: 'Tallgrass Prairie Preserve',     lat: 38.4320, lon: -96.5580 },
  { code: 'KY', name: 'Kentucky',             anchor: 'Red River Gorge',                lat: 37.8180, lon: -83.6260 },
  { code: 'LA', name: 'Louisiana',            anchor: 'Kisatchie National Forest',      lat: 31.4500, lon: -92.8900 },
  { code: 'ME', name: 'Maine',                anchor: 'Bar Harbor, Acadia',             lat: 44.3876, lon: -68.2039 },
  { code: 'MD', name: 'Maryland',             anchor: 'Cumberland, C&O Canal',          lat: 39.6529, lon: -78.7625 },
  { code: 'MA', name: 'Massachusetts',        anchor: 'North Adams, Mount Greylock',    lat: 42.7009, lon: -73.1087 },
  { code: 'MI', name: 'Michigan',             anchor: 'Munising, Pictured Rocks',       lat: 46.4111, lon: -86.6486 },
  { code: 'MN', name: 'Minnesota',            anchor: 'Lutsen, Superior Hiking Trail',  lat: 47.6494, lon: -90.6712 },
  { code: 'MS', name: 'Mississippi',          anchor: 'Natchez Trace, Tupelo',          lat: 34.2576, lon: -88.7034 },
  { code: 'MO', name: 'Missouri',             anchor: 'Eminence, Ozark Riverways',      lat: 37.1509, lon: -91.3568 },
  { code: 'MT', name: 'Montana',              anchor: 'West Glacier',                   lat: 48.4959, lon: -113.9812 },
  { code: 'NE', name: 'Nebraska',             anchor: 'Chadron, Pine Ridge',            lat: 42.8294, lon: -103.0002 },
  { code: 'NV', name: 'Nevada',               anchor: 'Red Rock Canyon',                lat: 36.1359, lon: -115.4276 },
  { code: 'NH', name: 'New Hampshire',        anchor: 'North Conway, White Mountains',  lat: 44.0537, lon: -71.1281 },
  { code: 'NJ', name: 'New Jersey',           anchor: 'High Point State Park',          lat: 41.3218, lon: -74.6618 },
  { code: 'NM', name: 'New Mexico',           anchor: 'Taos, Carson National Forest',   lat: 36.4072, lon: -105.5731 },
  { code: 'NY', name: 'New York',             anchor: 'Lake Placid, High Peaks',        lat: 44.2795, lon: -73.9799 },
  { code: 'NC', name: 'North Carolina',       anchor: 'Asheville, Pisgah',              lat: 35.5951, lon: -82.5515 },
  { code: 'ND', name: 'North Dakota',         anchor: 'Medora, Theodore Roosevelt NP',  lat: 46.9139, lon: -103.5263 },
  { code: 'OH', name: 'Ohio',                 anchor: 'Cuyahoga Valley',                lat: 41.2808, lon: -81.5678 },
  { code: 'OK', name: 'Oklahoma',             anchor: 'Beavers Bend State Park',        lat: 34.1382, lon: -94.6858 },
  { code: 'OR', name: 'Oregon',               anchor: 'Bend, Deschutes',                lat: 44.0582, lon: -121.3153 },
  { code: 'PA', name: 'Pennsylvania',         anchor: 'Ohiopyle State Park',            lat: 39.8695, lon: -79.4928 },
  { code: 'RI', name: 'Rhode Island',         anchor: 'Arcadia Management Area',        lat: 41.5560, lon: -71.7160 },
  { code: 'SC', name: 'South Carolina',       anchor: 'Table Rock State Park',          lat: 35.0270, lon: -82.7000 },
  { code: 'SD', name: 'South Dakota',         anchor: 'Custer, Black Hills',            lat: 43.7666, lon: -103.5988 },
  { code: 'TN', name: 'Tennessee',            anchor: 'Gatlinburg, Smokies',            lat: 35.7143, lon: -83.5102 },
  { code: 'TX', name: 'Texas',                anchor: 'Big Bend National Park',         lat: 29.3280, lon: -103.2050 },
  { code: 'UT', name: 'Utah',                 anchor: 'Moab',                           lat: 38.5733, lon: -109.5498 },
  { code: 'VT', name: 'Vermont',              anchor: 'Stowe, Green Mountains',         lat: 44.4654, lon: -72.6874 },
  { code: 'VA', name: 'Virginia',             anchor: 'Shenandoah National Park',       lat: 38.5290, lon: -78.4370 },
  { code: 'WA', name: 'Washington',           anchor: 'Mount Rainier, Ashford',         lat: 46.7530, lon: -121.8100 },
  { code: 'WV', name: 'West Virginia',        anchor: 'Davis, Canaan Valley',           lat: 39.1290, lon: -79.4650 },
  { code: 'WI', name: 'Wisconsin',            anchor: 'Bayfield, Apostle Islands',      lat: 46.8110, lon: -90.8190 },
  { code: 'WY', name: 'Wyoming',              anchor: 'Jackson, Tetons',                lat: 43.4799, lon: -110.7624 }
];

/* Node (tests) and the browser both load this file. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STATE_ANCHORS, ANCHORS_VERSION };
}
