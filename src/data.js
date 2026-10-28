// Static game data: world layout, needs, furniture catalog, names, jobs.
// World units are pixels in an 800x430 side view; the canvas scales them.

export const WORLD = { w: 800, h: 430 };

// Feet baseline for each floor (0 = ground floor, 1 = upstairs).
export const FLOORS = [360, 210];
export const FLOOR_H = 150;
export const HOUSE = { left: 140, right: 780 };
export const STAIRS = { x: 735, w: 70 };
export const DOOR_X = 140;
export const EXIT_X = 40;            // bus stop, where Ogonz leave for work
export const BUILD_MIN = HOUSE.left + 8;
export const BUILD_MAX = STAIRS.x - STAIRS.w / 2 - 6;

export const WALK = 60;              // px per game minute
export const CLIMB_MINUTES = 3;
export const MAX_OGONZ = 6;
export const START_MONEY = 1500;

export const NEEDS = ['hunger', 'energy', 'bladder', 'hygiene', 'fun', 'social'];
export const NEED_LABELS = {
  hunger: 'Hunger', energy: 'Energy', bladder: 'Bladder',
  hygiene: 'Hygiene', fun: 'Fun', social: 'Social'
};

// Need loss per game minute (negative = gain).
export const DECAY = {
  awake: { hunger: 0.12, energy: 0.09, bladder: 0.18, hygiene: 0.06, fun: 0.1, social: 0.07 },
  sleep: { hunger: 0.06, energy: 0, bladder: 0.09, hygiene: 0.03, fun: 0, social: 0.02 },
  work:  { hunger: 0.1, energy: 0.07, bladder: 0, hygiene: 0.08, fun: 0.15, social: -0.05 }
};

// gains: need points per minute while using. minutes: max use time.
export const CATALOG = {
  fridge:    { name: 'Fridge',    cost: 300, w: 40, h: 70, verb: 'Eat',        minutes: 30,  gains: { hunger: 3 } },
  bed:       { name: 'Bed',       cost: 400, w: 84, h: 34, verb: 'Sleep',      minutes: 600, gains: { energy: 0.21 }, sleep: true },
  toilet:    { name: 'Toilet',    cost: 150, w: 30, h: 36, verb: 'Use toilet', minutes: 10,  gains: { bladder: 10 } },
  shower:    { name: 'Shower',    cost: 250, w: 40, h: 90, verb: 'Shower',     minutes: 20,  gains: { hygiene: 5 } },
  tv:        { name: 'TV',        cost: 200, w: 56, h: 44, verb: 'Watch TV',   minutes: 60,  gains: { fun: 1.5 } },
  sofa:      { name: 'Sofa',      cost: 220, w: 74, h: 34, verb: 'Relax',      minutes: 45,  gains: { fun: 0.6, energy: 0.15 } },
  bookshelf: { name: 'Bookshelf', cost: 180, w: 44, h: 80, verb: 'Read',       minutes: 60,  gains: { fun: 0.9 } },
  plant:     { name: 'Plant',     cost: 60,  w: 24, h: 40 }
};

export const NAMES = ['Abi', 'Bo', 'Cass', 'Dex', 'Eli', 'Fen', 'Gus', 'Hana', 'Ivo', 'Juno', 'Kai',
  'Lia', 'Milo', 'Nia', 'Oz', 'Pip', 'Quin', 'Rae', 'Sol', 'Tam', 'Uma', 'Vik', 'Wren', 'Zed'];
export const COLORS = ['#f06595', '#4dabf7', '#51cf66', '#fcc419', '#9775fa', '#ff922b', '#20c997', '#e64980'];

// Workdays are Mon-Fri (weekday 0-4). Hours are 0-24.
export const JOBS = [
  { title: 'Barista', start: 6, end: 13, pay: 160 },
  { title: 'Coder', start: 9, end: 17, pay: 300 },
  { title: 'Nurse', start: 7, end: 15, pay: 260 },
  { title: 'Chef', start: 11, end: 19, pay: 220 },
  { title: 'Teacher', start: 8, end: 15, pay: 240 }
];

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
