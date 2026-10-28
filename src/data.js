// Static data for Sunset Trailer Haven: map layout, needs, amenities,
// get-rich-quick schemes, personalities, names.
// World units are pixels of a 640x360 pixel-art map, scaled up on screen.

export const WORLD = { w: 640, h: 360 };
export const PARK = { left: 8, right: 632, top: 44, bottom: 340 };
export const GATE = { x: 320, y: 352 };           // entrance arch; residents leave the park here

// Homes. x, y = middle of the trailer's front edge (where it meets the ground).
export const TRAILER = { w: 54, face: 16, roof: 12 };
export const TRAILER_SPOTS = [
  { x: 48, y: 84 }, { x: 140, y: 76 }, { x: 430, y: 76 }, { x: 520, y: 84 }, { x: 596, y: 140 },
  { x: 44, y: 150 }, { x: 44, y: 222 }, { x: 160, y: 300 }, { x: 410, y: 312 }, { x: 600, y: 222 },
  { x: 250, y: 236 }, { x: 520, y: 340 }
];
export const MAX_PER_TRAILER = 3;
export const TRAILER_COLORS = ['#c9cfd6', '#e8d9b5', '#b5d6a7', '#f2a7b8', '#9fc5e8', '#c5a3d9',
  '#f4b183', '#d9c27a', '#88b7b5', '#e6b0aa'];

// Shared things around the park. slots = how many can use it at once.
export const AMENITIES = [
  { type: 'bbq',     x: 196, y: 214, slots: 4, dy: 12, spread: 24 },
  { type: 'hottub',  x: 300, y: 262, slots: 4, dy: -3, spread: 26 },
  { type: 'potty',   x: 252, y: 316, slots: 1, dy: 4 },
  { type: 'track',   x: 300, y: 158, slots: 4, dy: 34, spread: 40 },
  { type: 'laundry', x: 470, y: 222, slots: 3, dy: 10, spread: 40 },
  { type: 'snails',  x: 572, y: 290, slots: 3, dy: 26, spread: 50 },
  { type: 'trampoline', x: 52, y: 322, slots: 1, dy: -2 },
  { type: 'catapult', x: 102, y: 334, slots: 1, dy: 6 },
  { type: 'podium',  x: 560, y: 186, slots: 0 }
];
export const AMENITY_INFO = {
  bbq:        { name: 'BBQ',          verb: 'Grilling',          minutes: 35, gains: { hunger: 2.6, social: 0.6 } },
  hottub:     { name: 'Hot tub',      verb: 'Soaking in the hot tub', minutes: 40, gains: { hygiene: 1.6, fun: 1 } },
  potty:      { name: 'Porta-potty',  verb: 'Using the porta-potty', minutes: 8, gains: { bladder: 12 } },
  track:      { name: 'Cart track',   verb: 'Racing shopping carts', minutes: 30, gains: { fun: 2 } },
  laundry:    { name: 'Cats Laundry', verb: 'Doing laundry (cats help)', minutes: 30, gains: { hygiene: 2.2 } },
  snails:     { name: 'Snail racing', verb: 'Betting on snails',  minutes: 30, gains: { fun: 1.6, social: 0.4 } },
  trampoline: { name: 'Trampoline',   verb: 'Bouncing',          minutes: 15, gains: { fun: 2.4 } },
  catapult:   { name: 'Catapult',     verb: 'Getting catapulted', minutes: 6, gains: { fun: 6 } },
  podium:     { name: 'Seminar podium' }
};

// Things done inside your own trailer.
export const INDOOR = {
  eat:    { verb: 'Eating inside',        minutes: 30,  gains: { hunger: 3 } },
  toilet: { verb: 'On the toilet',        minutes: 10,  gains: { bladder: 10 } },
  shower: { verb: 'Showering (cold)',     minutes: 20,  gains: { hygiene: 5 } },
  tv:     { verb: 'Watching TV inside',   minutes: 60,  gains: { fun: 1.3 } },
  sleep:  { verb: 'Sleeping',             minutes: 600, gains: { energy: 0.21 }, sleep: true }
};

// Get-rich-quick schemes. Each adult runs one at a stall next to their trailer.
// price: what a customer pays. scam: customers may later feel cheated.
export const SCHEMES = {
  lemonade: { name: 'Lemonade $20', sign: ['LEMONADE', '$20 A CUP'], price: 20, gains: { hunger: 25 } },
  crypto:   { name: 'Crypto mine', sign: ['CRYPTO', 'MINE'], price: 30, gains: { fun: 10 }, scam: true },
  pyramid:  { name: 'Pyramid scheme', sign: ['PYRAMID', '= PROFIT!!!'], price: 50, gains: { fun: 15 }, scam: true },
  alien:    { name: 'Alien urine', sign: ['ALIEN URINE', '$100'], price: 100, gains: { fun: 20 }, scam: true },
  oil:      { name: 'Oil well', sign: ['DIGGING FOR', 'OIL IN MY YARD'], price: 25, gains: { fun: 8 } },
  air:      { name: 'Air for sale', sign: ['SELL', 'AIR'], price: 15, gains: { fun: 6 }, scam: true },
  fish:     { name: 'Fish farm', sign: ['FISH FARM', 'FUTURE MILLIONS'], price: 20, gains: { hunger: 15 } },
  worms:    { name: 'Worm farm', sign: ['WORMS', '$$$'], price: 10, gains: { fun: 5 } },
  nft:      { name: 'NFT rocks', sign: ['NFT ROCKS', 'OWN THE ROCK'], price: 60, gains: { fun: 12 }, scam: true },
  tonic:    { name: 'Hair tonic', sign: ['MIRACLE', 'HAIR TONIC'], price: 40, gains: { hygiene: 20 }, scam: true },
  robot:    { name: 'Robot startup', sign: ['INVEST IN', 'MY ROBOT'], price: 50, gains: { fun: 12 }, scam: true },
  tanning:  { name: 'Tanning bed', sign: ['TANNING', 'BED'], price: 15, gains: { fun: 8, energy: 10 } },
  casino:   { name: 'Cart casino', sign: ['CART', 'CASINO'], price: 5, gains: { fun: 14 } }
};
export const SCHEME_HOURS = { start: 9, end: 18 };

export const WALK = 14;                 // px per game minute
export const CHAT_MINUTES = 20;

export const NEEDS = ['hunger', 'energy', 'bladder', 'hygiene', 'fun', 'social'];
export const NEED_LABELS = {
  hunger: 'Hunger', energy: 'Energy', bladder: 'Bladder',
  hygiene: 'Hygiene', fun: 'Fun', social: 'Social'
};

// Need loss per game minute (negative = gain).
export const DECAY = {
  awake: { hunger: 0.12, energy: 0.09, bladder: 0.18, hygiene: 0.06, fun: 0.1, social: 0.12 },
  sleep: { hunger: 0.06, energy: 0, bladder: 0.09, hygiene: 0.03, fun: 0, social: 0.02 },
  out:   { hunger: 0.1, energy: 0.07, bladder: 0, hygiene: 0.08, fun: 0.15, social: -0.05 }
};

// Personalities. Each resident gets two.
export const TRAITS = {
  cheerful:   'Cheerful',
  grumpy:     'Grumpy',
  romantic:   'Romantic',
  prankster:  'Prankster',
  dramatic:   'Dramatic',
  gossip:     'Gossip',
  hustler:    'Hustler',
  gullible:   'Gullible',
  sleepy:     'Sleepy',
  party:      'Party animal',
  conspiracy: 'Conspiracy theorist'
};
// How well two traits get along (-1..1); symmetric, missing pairs are 0.
export const CHEMISTRY = {
  'cheerful+cheerful': 0.6, 'cheerful+grumpy': -0.7, 'grumpy+grumpy': 0.3, 'grumpy+prankster': -0.9,
  'grumpy+party': -0.6, 'romantic+romantic': 0.7, 'romantic+cheerful': 0.4, 'prankster+prankster': 0.8,
  'prankster+dramatic': -0.6, 'dramatic+dramatic': -0.4, 'dramatic+gossip': 0.5, 'gossip+gossip': 0.7,
  'hustler+hustler': -0.6, 'hustler+gullible': 0.5, 'gullible+gullible': 0.6, 'hustler+grumpy': -0.4,
  'sleepy+sleepy': 0.6, 'sleepy+party': -0.7, 'party+party': 0.8, 'party+cheerful': 0.5,
  'conspiracy+conspiracy': 0.9, 'conspiracy+grumpy': 0.3, 'conspiracy+cheerful': -0.3,
  'conspiracy+gullible': 0.4, 'grumpy+sleepy': 0.4
};

export const NAMES = ['Dale', 'Earl', 'Bev', 'Tammy', 'Cletus', 'Darlene', 'Randy', 'Crystal', 'Bubba',
  'Lurleen', 'Skeeter', 'Wanda', 'Chet', 'Brandi', 'Duane', 'Rhonda', 'Gus', 'Peaches', 'Buck', 'Loretta',
  'Travis', 'Starla', 'Hank', 'Misty', 'Jimbo', 'Dottie', 'Wade', 'Candy', 'Boone', 'Trixie', 'Moose',
  'Velma', 'Rusty', 'Pam', 'Dwayne', 'Glenda'];
export const SHIRTS = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#7048e8', '#f783ac', '#fab005',
  '#495057', '#e8590c', '#0c8599', '#f1f3f5', '#862e9c'];
export const SKINS = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#f5d6c0', '#a5673f'];
export const HAIRS = ['#3b2314', '#8b5a2b', '#e8c55a', '#d9480f', '#212529', '#adb5bd'];
export const HATS = [null, null, null, 'cap', 'cowboy', 'beanie', 'mohawk', 'bandana'];
export const OUTFITS = ['shirt', 'shirt', 'tank', 'tank', 'robe'];

// Life: everyone ages this many years per game day.
export const YEARS_PER_DAY = 1;
export const SCHOOL_AGE = 6;
export const ADULT_AGE = 18;
export const ELDER_AGE = 64;
export const SCHOOL = { start: 8, end: 15 };

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
