/* ============================================================================
   MOCK INVENTORY — sample data only.

   NOTHING IN THIS FILE IS REAL. The dealers do not exist, the VINs are not
   valid, the stock numbers correspond to no vehicle anywhere. It exists so the
   app is demonstrable before an inventory API key is in place.

   Every listing produced here carries isMock: true, which the UI uses to stamp
   the card and show the site-wide banner. Delete this file once the live feed
   is connected and the fallback is no longer wanted.
   ============================================================================ */

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EXTERIOR_COLORS = [
  { name: "Midnight Black", hex: "#111318", group: "Black" },
  { name: "Glacier White",  hex: "#EDEEEA", group: "White" },
  { name: "Magnetic Gray",  hex: "#6B7178", group: "Gray" },
  { name: "Sonic Silver",   hex: "#B6BABD", group: "Silver" },
  { name: "Blueprint Blue", hex: "#2F5D9E", group: "Blue" },
  { name: "Cavalry Blue",   hex: "#41607D", group: "Blue" },
  { name: "Barcelona Red",  hex: "#9C2029", group: "Red" },
  { name: "Lunar Rock",     hex: "#B3B8AE", group: "Green" },
  { name: "Forest Green",   hex: "#27473B", group: "Green" },
];

const INTERIOR_COLORS = [
  { name: "Black", hex: "#1B1B1D" }, { name: "Graphite", hex: "#3A3D42" },
  { name: "Ash", hex: "#9B9A95" }, { name: "Macchiato", hex: "#8C6A4F" },
  { name: "Ivory", hex: "#DDD8CC" },
];

export const CATALOG = [
  { make: "Toyota", models: [
    { name: "RAV4", body: "suv", msrp: 30500, trims: ["LE", "XLE", "XLE Premium", "Limited"], engines: ["2.5L I4", "2.5L I4 Hybrid"], drivetrains: ["FWD", "AWD"], trans: ["8-Spd Automatic", "eCVT"] },
    { name: "Camry", body: "sedan", msrp: 29000, trims: ["LE", "SE", "XSE", "XLE"], engines: ["2.5L I4", "2.5L I4 Hybrid"], drivetrains: ["FWD", "AWD"], trans: ["8-Spd Automatic"] },
    { name: "Tacoma", body: "truck", msrp: 34500, trims: ["SR5", "TRD Sport", "TRD Off-Road", "Limited"], engines: ["2.4L Turbo I4"], drivetrains: ["RWD", "4WD"], trans: ["8-Spd Automatic"] },
  ]},
  { make: "Honda", models: [
    { name: "CR-V", body: "suv", msrp: 31200, trims: ["LX", "EX", "EX-L", "Sport Touring"], engines: ["1.5L Turbo I4", "2.0L I4 Hybrid"], drivetrains: ["FWD", "AWD"], trans: ["CVT", "eCVT"] },
    { name: "Accord", body: "sedan", msrp: 28900, trims: ["LX", "EX", "Sport", "Touring"], engines: ["1.5L Turbo I4", "2.0L I4 Hybrid"], drivetrains: ["FWD"], trans: ["CVT", "eCVT"] },
    { name: "Pilot", body: "suv", msrp: 40800, trims: ["Sport", "EX-L", "Touring", "Elite"], engines: ["3.5L V6"], drivetrains: ["FWD", "AWD"], trans: ["10-Spd Automatic"] },
  ]},
  { make: "Ford", models: [
    { name: "F-150", body: "truck", msrp: 41000, trims: ["XL", "XLT", "Lariat", "King Ranch", "Platinum"], engines: ["2.7L EcoBoost V6", "3.5L EcoBoost V6", "5.0L V8"], drivetrains: ["RWD", "4WD"], trans: ["10-Spd Automatic"] },
    { name: "Explorer", body: "suv", msrp: 39500, trims: ["Active", "ST-Line", "Platinum"], engines: ["2.3L EcoBoost I4", "3.0L EcoBoost V6"], drivetrains: ["RWD", "AWD"], trans: ["10-Spd Automatic"] },
    { name: "Bronco Sport", body: "suv", msrp: 32000, trims: ["Big Bend", "Outer Banks", "Badlands"], engines: ["1.5L EcoBoost I3", "2.0L EcoBoost I4"], drivetrains: ["AWD"], trans: ["8-Spd Automatic"] },
  ]},
  { make: "Subaru", models: [
    { name: "Outback", body: "suv", msrp: 30400, trims: ["Premium", "Limited", "Onyx XT", "Touring XT"], engines: ["2.5L H4", "2.4L Turbo H4"], drivetrains: ["AWD"], trans: ["CVT"] },
    { name: "Forester", body: "suv", msrp: 29300, trims: ["Base", "Premium", "Sport", "Limited"], engines: ["2.5L H4"], drivetrains: ["AWD"], trans: ["CVT"] },
  ]},
  { make: "Mazda", models: [
    { name: "CX-5", body: "suv", msrp: 30300, trims: ["S Select", "S Preferred", "S Carbon", "Turbo Premium"], engines: ["2.5L I4", "2.5L Turbo I4"], drivetrains: ["AWD"], trans: ["6-Spd Automatic"] },
    { name: "Mazda3", body: "sedan", msrp: 25500, trims: ["2.5 S", "Select Sport", "Preferred", "Turbo Premium"], engines: ["2.5L I4", "2.5L Turbo I4"], drivetrains: ["FWD", "AWD"], trans: ["6-Spd Automatic"] },
  ]},
  { make: "Hyundai", models: [
    { name: "Tucson", body: "suv", msrp: 29000, trims: ["SE", "SEL", "N Line", "Limited"], engines: ["2.5L I4", "1.6L Turbo I4 Hybrid"], drivetrains: ["FWD", "AWD"], trans: ["8-Spd Automatic"] },
    { name: "Santa Fe", body: "suv", msrp: 35800, trims: ["SEL", "XRT", "Calligraphy"], engines: ["2.5L Turbo I4"], drivetrains: ["FWD", "AWD"], trans: ["8-Spd DCT"] },
  ]},
  { make: "Chevrolet", models: [
    { name: "Silverado 1500", body: "truck", msrp: 40200, trims: ["WT", "Custom", "LT", "RST", "High Country"], engines: ["2.7L Turbo I4", "5.3L V8", "3.0L Duramax I6"], drivetrains: ["RWD", "4WD"], trans: ["10-Spd Automatic"] },
    { name: "Equinox", body: "suv", msrp: 28600, trims: ["LT", "RS", "Premier"], engines: ["1.5L Turbo I4"], drivetrains: ["FWD", "AWD"], trans: ["8-Spd Automatic"] },
  ]},
  { make: "Kia", models: [
    { name: "Telluride", body: "suv", msrp: 38800, trims: ["LX", "S", "EX", "SX Prestige"], engines: ["3.8L V6"], drivetrains: ["FWD", "AWD"], trans: ["8-Spd Automatic"] },
    { name: "Sportage", body: "suv", msrp: 27800, trims: ["LX", "EX", "X-Line", "SX Prestige"], engines: ["2.5L I4", "1.6L Turbo I4 Hybrid"], drivetrains: ["FWD", "AWD"], trans: ["8-Spd Automatic"] },
  ]},
];

/* Names are deliberately obvious placeholders — see the SAMPLE stamp on cards. */
const DEALERS = [
  { id: "d1", name: "Sample Motors North", city: "Sterling", state: "VA", rating: 4.6 },
  { id: "d2", name: "Sample Auto Group", city: "Alexandria", state: "VA", rating: 4.3 },
  { id: "d3", name: "Sample Certified Center", city: "Fairfax", state: "VA", rating: 4.8 },
  { id: "d4", name: "Sample Auto Mall", city: "Leesburg", state: "VA", rating: 4.1 },
  { id: "d5", name: "Sample Ridge Autos", city: "Bethesda", state: "MD", rating: 4.5 },
  { id: "d6", name: "Sample Import Center", city: "Rockville", state: "MD", rating: 4.0 },
  { id: "d7", name: "Sample Dominion Auto", city: "Manassas", state: "VA", rating: 4.4 },
  { id: "d8", name: "Sample Corner Select", city: "Vienna", state: "VA", rating: 4.7 },
  { id: "d9", name: "Sample Auto Works", city: "Washington", state: "DC", rating: 3.9 },
  { id: "d10", name: "Sample Prime Cars", city: "Chantilly", state: "VA", rating: 4.2 },
];

const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"; // no I, O, Q — as in a real VIN

function generate() {
  const rnd = mulberry32(20260803);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const out = [];
  let n = 0;

  CATALOG.forEach((brand) => {
    brand.models.forEach((m) => {
      // One listing per trim, plus extras, so an exact-trim search can succeed.
      m.trims.forEach((trim) => {
        for (let i = 0; i < 2; i++) {
          n++;
          const isNew = rnd() < 0.45;
          const isCpo = !isNew && rnd() < 0.35;
          const year = isNew ? 2026 : 2026 - (1 + Math.floor(rnd() * 5));
          const age = 2026 - year;
          const trimIndex = m.trims.indexOf(trim);
          const msrp = Math.round((m.msrp + trimIndex * 3400 + rnd() * 1800) / 10) * 10;
          const mileage = isNew ? Math.floor(rnd() * 40) : Math.floor((3000 + rnd() * 11000) * Math.max(age, 0.6));
          const depreciation = isNew ? 0 : 0.13 * age + (mileage / 100000) * 0.16;
          const swing = (rnd() - 0.45) * (isNew ? 0.05 : 0.07);
          let price = msrp * (1 - depreciation) * (1 + swing);
          if (isCpo) price *= 1.035;
          price = Math.round(price / 5) * 5;
          const dealer = pick(DEALERS);

          out.push({
            id: `v_${n}`,
            isMock: true,
            providerId: "mock",
            vin: Array.from({ length: 17 }, () => VIN_CHARS[Math.floor(rnd() * VIN_CHARS.length)]).join(""),
            stockNumber: `${brand.make.slice(0, 2).toUpperCase()}${Math.floor(10000 + rnd() * 89999)}`,
            condition: isNew ? "New" : isCpo ? "Certified" : "Used",
            year, make: brand.make, model: m.name, trim,
            bodyStyle: m.body, price, msrp, mileage,
            engine: pick(m.engines), drivetrain: pick(m.drivetrains), transmission: pick(m.trans),
            exteriorColor: pick(EXTERIOR_COLORS), interiorColor: pick(INTERIOR_COLORS),
            dealer: { ...dealer, distanceMi: Math.round((2 + rnd() * 58) * 10) / 10 },
            listedDaysAgo: Math.floor(1 + rnd() * 90),
            photos: [], vdpUrl: null,
          });
        }
      });
    });
  });
  return out;
}

export const MOCK_INVENTORY = generate();
export const ALL_MAKES = CATALOG.map((c) => c.make);
export const ALL_MODELS = CATALOG.flatMap((c) => c.models.map((m) => m.name));
export const modelsForMake = (make) => CATALOG.find((c) => c.make === make)?.models ?? [];
