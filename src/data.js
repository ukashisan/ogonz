// Static data: building layout, needs, furniture, personalities, names, jobs.
// World units are pixels in a 1200x720 side view; the canvas scales them.

export const WORLD = { w: 1200, h: 720 };

// Feet baseline for each floor (0 = ground floor).
export const FLOOR_H = 140;
export const FLOORS = [660, 520, 380, 240];
export const ROOF_Y = FLOORS[3] - FLOOR_H;
export const BUILDING = { left: 80, right: 1160 };
export const ELEVATOR = { x: 620, w: 64 };
export const EXIT_X = 30;              // bus stop, where residents leave the building
export const DOOR_X = BUILDING.left;

// Rooms. Apartments are on floors 1-3; the ground floor is shared.
const LEFT = { l: BUILDING.left + 10, r: ELEVATOR.x - ELEVATOR.w / 2 - 8 };
const RIGHT = { l: ELEVATOR.x + ELEVATOR.w / 2 + 8, r: BUILDING.right - 10 };
export const ROOMS = [
  { id: 'cafe', name: 'Café', floor: 0, ...LEFT, common: true, wall: '#f6e3c8' },
  { id: 'party', name: 'Party room', floor: 0, ...RIGHT, common: true, wall: '#2d2347' }
];
const WALLS = ['#f3e9d2', '#e3eef5', '#e8f4e1', '#f7e1e6', '#ece4f7', '#fff2cc'];
for (let f = 1; f <= 3; f++) {
  ROOMS.push({ id: f + 'A', name: 'Apt ' + f + 'A', floor: f, ...LEFT, wall: WALLS[(f - 1) * 2] });
  ROOMS.push({ id: f + 'B', name: 'Apt ' + f + 'B', floor: f, ...RIGHT, wall: WALLS[(f - 1) * 2 + 1] });
}
export const APARTMENTS = ROOMS.filter(r => !r.common).map(r => r.id);
export const MAX_PER_APARTMENT = 3;

// Furniture placed in every room: [type, x offset from the room's left edge].
export const APARTMENT_LAYOUT = [
  ['toilet', 22], ['shower', 66], ['fridge', 114], ['tv', 168], ['bed', 252], ['bed', 346], ['crib', 428]
];
export const COMMON_LAYOUT = {
  cafe: [['counter', 60], ['counter', 120], ['sofa', 230], ['arcade', 320], ['bookshelf', 400]],
  party: [['toilet', 26], ['jukebox', 100], ['sofa', 200], ['plant', 290], ['arcade', 360], ['plant', 450]]
};

export const WALK = 60;                 // px per game minute
export const RIDE_MINUTES = 2;          // elevator, per floor
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

// gains: need points per minute while using. minutes: max use time.
export const CATALOG = {
  fridge:    { name: 'Fridge',    w: 40, h: 70, verb: 'Eat',          minutes: 30,  gains: { hunger: 3 } },
  counter:   { name: 'Café',      w: 50, h: 56, verb: 'Eat at the café', minutes: 30, gains: { hunger: 3, social: 0.3 } },
  bed:       { name: 'Bed',       w: 84, h: 34, verb: 'Sleep',        minutes: 600, gains: { energy: 0.21 }, sleep: true },
  crib:      { name: 'Kid bed',   w: 44, h: 30, verb: 'Sleep',        minutes: 600, gains: { energy: 0.25 }, sleep: true, kids: true },
  toilet:    { name: 'Toilet',    w: 30, h: 36, verb: 'Use toilet',   minutes: 10,  gains: { bladder: 10 } },
  shower:    { name: 'Shower',    w: 40, h: 90, verb: 'Shower',       minutes: 20,  gains: { hygiene: 5 } },
  tv:        { name: 'TV',        w: 56, h: 44, verb: 'Watch TV',     minutes: 60,  gains: { fun: 1.5 } },
  sofa:      { name: 'Sofa',      w: 74, h: 34, verb: 'Relax',        minutes: 45,  gains: { fun: 0.6, energy: 0.15 } },
  bookshelf: { name: 'Bookshelf', w: 44, h: 80, verb: 'Read',         minutes: 60,  gains: { fun: 0.9 } },
  arcade:    { name: 'Arcade',    w: 40, h: 76, verb: 'Play arcade',  minutes: 45,  gains: { fun: 1.8 } },
  jukebox:   { name: 'Jukebox',   w: 40, h: 70, verb: 'Dance',        minutes: 40,  gains: { fun: 1.6, social: 0.4 } },
  plant:     { name: 'Plant',     w: 24, h: 40 }
};

// Personalities. Each resident gets two.
export const TRAITS = {
  cheerful:   'Cheerful',
  grumpy:     'Grumpy',
  romantic:   'Romantic',
  prankster:  'Prankster',
  dramatic:   'Dramatic',
  gossip:     'Gossip',
  shy:        'Shy',
  sleepy:     'Sleepy',
  party:      'Party animal',
  conspiracy: 'Conspiracy theorist'
};
// How well two traits get along (-1..1); symmetric, missing pairs are 0.
export const CHEMISTRY = {
  'cheerful+cheerful': 0.6, 'cheerful+grumpy': -0.7, 'grumpy+grumpy': 0.3, 'grumpy+prankster': -0.9,
  'grumpy+party': -0.6, 'romantic+romantic': 0.7, 'romantic+cheerful': 0.4, 'prankster+prankster': 0.8,
  'prankster+dramatic': -0.6, 'dramatic+dramatic': -0.4, 'dramatic+gossip': 0.5, 'gossip+gossip': 0.7,
  'gossip+shy': -0.5, 'shy+shy': 0.5, 'shy+party': -0.5, 'sleepy+sleepy': 0.6, 'sleepy+party': -0.7,
  'party+party': 0.8, 'party+cheerful': 0.5, 'conspiracy+conspiracy': 0.9, 'conspiracy+grumpy': 0.3,
  'conspiracy+cheerful': -0.3, 'shy+romantic': 0.3, 'grumpy+sleepy': 0.4
};

export const NAMES = ['Abi', 'Bo', 'Cass', 'Dex', 'Eli', 'Fen', 'Gus', 'Hana', 'Ivo', 'Juno', 'Kai', 'Lia',
  'Milo', 'Nia', 'Oz', 'Pip', 'Quin', 'Rae', 'Sol', 'Tam', 'Uma', 'Vik', 'Wren', 'Zed', 'Bobo', 'Glimp',
  'Noodle', 'Trix', 'Mopsy', 'Zork', 'Fizz', 'Wobble', 'Pickle', 'Gizmo', 'Sprout', 'Bean', 'Nugget', 'Dot'];
export const COLORS = ['#f06595', '#4dabf7', '#51cf66', '#fcc419', '#9775fa', '#ff922b', '#20c997',
  '#e64980', '#74c0fc', '#a9e34b', '#ffa8a8', '#868e96'];
export const SKINS = ['#f1d3b3', '#e0ac69', '#8d5524', '#c68642', '#b5e48c', '#a5d8ff', '#ffc9e3'];
export const HATS = [null, null, 'beanie', 'tophat', 'cap', 'flower', 'antenna', 'crown', 'bow'];

// Weekday jobs (hours 0-24). Nobody here has a normal job.
export const JOBS = [
  { title: 'Cloud Inspector', start: 7, end: 14 },
  { title: 'Professional Napper', start: 10, end: 16 },
  { title: 'Sock Detective', start: 9, end: 17 },
  { title: 'Bubble Wrap Tester', start: 8, end: 15 },
  { title: 'Pigeon Translator', start: 6, end: 13 },
  { title: 'Spoon Polisher', start: 9, end: 16 },
  { title: 'Moon Accountant', start: 11, end: 19 },
  { title: 'Puddle Consultant', start: 8, end: 14 },
  { title: 'Snack Philosopher', start: 10, end: 18 }
];
export const SCHOOL = { title: 'School', start: 8, end: 15 };

// Life: everyone ages this many years per game day.
export const YEARS_PER_DAY = 1;
export const SCHOOL_AGE = 6;
export const ADULT_AGE = 18;
export const ELDER_AGE = 64;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
