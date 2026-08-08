/* ============================================================================
   VEHICLE CATALOG — US market, current model years.

   Format is deliberately terse so the whole lineup stays readable and editable:

       "Model Name": ["bodyStyle", "Trim", "Trim", ...]

   The FIRST array element is always the body style (sedan | suv | truck | van |
   coupe). Everything after it is a trim.

   ── Why this is a static file ────────────────────────────────────────────────
   Trims change every model year, and no free API returns them. NHTSA's vPIC is
   free and authoritative for makes and models but does NOT carry trim. auto.dev
   returns a trim per LISTING, but you can't ask it "what trims does an F-150
   come in" before you search.

   So: this file is the picker's source of truth, and free text is always
   accepted alongside it. A trim we don't list still searches fine — the user
   types it, and matching is containment-based, so "King Ranch" matches a feed
   that says "King Ranch 4dr SuperCrew 4WD".

   ── Maintenance ─────────────────────────────────────────────────────────────
   Review each August/September as next-year lineups are announced. Adding a
   trim is one string. If this ever becomes a burden, the upgrade path is
   MarketCheck's facets: their search API can return the distinct trims present
   in live inventory for a make/model, which is better than any static list
   because it reflects what's actually for sale near the buyer.
   ============================================================================ */

export const CATALOG = {
  Acura: {
    "ADX": ["suv", "Standard", "A-Spec", "A-Spec Advance"],
    "Integra": ["sedan", "Integra", "A-Spec", "A-Spec Tech", "Type S"],
    "MDX": ["suv", "Base", "Technology", "A-Spec", "Advance", "Type S"],
    "RDX": ["suv", "Base", "Technology", "A-Spec", "Advance"],
    "TLX": ["sedan", "Base", "Technology", "A-Spec", "Type S"],
    "ZDX": ["suv", "A-Spec", "Type S"],
  },
  "Alfa Romeo": {
    "Giulia": ["sedan", "Sprint", "Ti", "Veloce", "Quadrifoglio"],
    "Stelvio": ["suv", "Sprint", "Ti", "Veloce", "Quadrifoglio"],
    "Tonale": ["suv", "Sprint", "Ti", "Veloce"],
  },
  "Audi": {
    "A3": ["sedan", "Premium", "Premium Plus", "Prestige"],
    "A4": ["sedan", "Premium", "Premium Plus", "Prestige"],
    "A5": ["coupe", "Premium", "Premium Plus", "Prestige"],
    "A6": ["sedan", "Premium", "Premium Plus", "Prestige"],
    "A7": ["sedan", "Premium Plus", "Prestige"],
    "A8": ["sedan", "L", "L 60 TFSI"],
    "Q3": ["suv", "Premium", "Premium Plus"],
    "Q4 e-tron": ["suv", "Premium", "Premium Plus", "Prestige"],
    "Q5": ["suv", "Premium", "Premium Plus", "Prestige"],
    "Q7": ["suv", "Premium", "Premium Plus", "Prestige"],
    "Q8": ["suv", "Premium", "Premium Plus", "Prestige"],
    "Q8 e-tron": ["suv", "Premium", "Premium Plus", "Prestige"],
    "e-tron GT": ["sedan", "Premium Plus", "Prestige", "RS"],
    "S3": ["sedan", "Premium Plus", "Prestige"],
    "S5": ["coupe", "Premium Plus", "Prestige"],
    "SQ5": ["suv", "Premium Plus", "Prestige"],
  },
  "BMW": {
    "2 Series": ["coupe", "230i", "M240i"],
    "3 Series": ["sedan", "330i", "330e", "M340i"],
    "4 Series": ["coupe", "430i", "M440i"],
    "5 Series": ["sedan", "530i", "540i", "550e"],
    "7 Series": ["sedan", "740i", "760i", "i7"],
    "8 Series": ["coupe", "840i", "M850i"],
    "X1": ["suv", "xDrive28i", "M35i"],
    "X2": ["suv", "xDrive28i", "M35i"],
    "X3": ["suv", "30 xDrive", "M50 xDrive"],
    "X4": ["suv", "xDrive30i", "M40i"],
    "X5": ["suv", "sDrive40i", "xDrive40i", "xDrive50e", "M60i"],
    "X6": ["suv", "xDrive40i", "M60i"],
    "X7": ["suv", "xDrive40i", "M60i"],
    "i4": ["sedan", "eDrive35", "eDrive40", "xDrive40", "M50"],
    "i5": ["sedan", "eDrive40", "M60"],
    "iX": ["suv", "xDrive50", "M70"],
    "M3": ["sedan", "Base", "Competition", "CS"],
    "M5": ["sedan", "Base"],
  },
  "Buick": {
    "Enclave": ["suv", "Preferred", "Sport Touring", "Avenir"],
    "Encore GX": ["suv", "Preferred", "Sport Touring", "Avenir"],
    "Envision": ["suv", "Preferred", "Sport Touring", "Avenir"],
    "Envista": ["suv", "Preferred", "Sport Touring", "Avenir"],
  },
  "Cadillac": {
    "CT4": ["sedan", "Luxury", "Premium Luxury", "Sport", "V-Series"],
    "CT5": ["sedan", "Luxury", "Premium Luxury", "Sport", "V-Series"],
    "Escalade": ["suv", "Luxury", "Premium Luxury", "Sport", "Premium Luxury Platinum", "Sport Platinum", "V-Series"],
    "Escalade IQ": ["suv", "Luxury 1", "Luxury 2", "Sport 1", "Sport 2"],
    "LYRIQ": ["suv", "Tech", "Luxury", "Sport", "V"],
    "OPTIQ": ["suv", "Luxury", "Sport"],
    "VISTIQ": ["suv", "Luxury", "Sport", "Premium Luxury"],
    "XT4": ["suv", "Luxury", "Premium Luxury", "Sport"],
    "XT5": ["suv", "Luxury", "Premium Luxury", "Sport"],
    "XT6": ["suv", "Luxury", "Premium Luxury", "Sport"],
  },
  "Chevrolet": {
    "Blazer": ["suv", "LT", "RS", "Premier"],
    "Blazer EV": ["suv", "LT", "RS", "SS"],
    "Camaro": ["coupe", "LS", "LT", "SS", "ZL1"],
    "Colorado": ["truck", "WT", "LT", "Trail Boss", "Z71", "ZR2"],
    "Corvette": ["coupe", "Stingray 1LT", "Stingray 2LT", "Stingray 3LT", "E-Ray", "Z06", "ZR1"],
    "Equinox": ["suv", "LT", "RS", "Activ", "Premier"],
    "Equinox EV": ["suv", "LT", "RS"],
    "Malibu": ["sedan", "LS", "RS", "LT", "Premier"],
    "Silverado 1500": ["truck", "WT", "Custom", "Custom Trail Boss", "LT", "RST", "LT Trail Boss", "LTZ", "High Country", "ZR2"],
    "Silverado 2500HD": ["truck", "WT", "Custom", "LT", "LTZ", "High Country"],
    "Silverado EV": ["truck", "WT", "LT", "RST"],
    "Suburban": ["suv", "LS", "LT", "RST", "Z71", "Premier", "High Country"],
    "Tahoe": ["suv", "LS", "LT", "RST", "Z71", "Premier", "High Country"],
    "Trailblazer": ["suv", "LS", "LT", "Activ", "RS"],
    "Traverse": ["suv", "LS", "LT", "Z71", "RS", "High Country"],
    "Trax": ["suv", "LS", "1RS", "LT", "2RS", "Activ"],
  },
  "Chrysler": {
    "Pacifica": ["van", "Touring", "Touring L", "Limited", "Pinnacle"],
    "Voyager": ["van", "LX"],
  },
  "Dodge": {
    "Charger": ["coupe", "Daytona R/T", "Daytona Scat Pack", "SIXPACK S.O.", "SIXPACK H.O."],
    "Durango": ["suv", "SXT", "GT", "R/T", "Citadel", "SRT 392", "SRT Hellcat"],
    "Hornet": ["suv", "GT", "GT Plus", "R/T", "R/T Plus"],
  },
  "Ford": {
    "Bronco": ["suv", "Base", "Big Bend", "Black Diamond", "Outer Banks", "Heritage", "Badlands", "Wildtrak", "Raptor"],
    "Bronco Sport": ["suv", "Big Bend", "Heritage", "Outer Banks", "Badlands"],
    "Edge": ["suv", "SE", "SEL", "ST-Line", "Titanium"],
    "Escape": ["suv", "Base", "Active", "ST-Line", "ST-Line Select", "Platinum"],
    "Expedition": ["suv", "XL", "XLT", "Active", "Limited", "King Ranch", "Platinum", "Tremor"],
    "Explorer": ["suv", "Active", "ST-Line", "ST", "Platinum"],
    "F-150": ["truck", "XL", "STX", "XLT", "Tremor", "Lariat", "King Ranch", "Platinum", "Raptor"],
    "F-150 Lightning": ["truck", "Pro", "XLT", "Flash", "Lariat", "Platinum"],
    "F-250 Super Duty": ["truck", "XL", "XLT", "Lariat", "King Ranch", "Platinum", "Limited"],
    "F-350 Super Duty": ["truck", "XL", "XLT", "Lariat", "King Ranch", "Platinum", "Limited"],
    "Maverick": ["truck", "XL", "XLT", "Lariat", "Tremor", "Lobo"],
    "Mustang": ["coupe", "EcoBoost", "EcoBoost Premium", "GT", "GT Premium", "Dark Horse"],
    "Mustang Mach-E": ["suv", "Select", "Premium", "GT", "Rally"],
    "Ranger": ["truck", "XL", "XLT", "Lariat", "Raptor"],
    "Transit": ["van", "Cargo", "Crew", "Passenger"],
  },
  "Genesis": {
    "G70": ["sedan", "2.5T", "3.3T Sport Prestige"],
    "G80": ["sedan", "2.5T", "3.5T Sport", "Electrified"],
    "G90": ["sedan", "3.5T", "3.5T E-Supercharger"],
    "GV60": ["suv", "Advanced", "Performance", "Magma"],
    "GV70": ["suv", "2.5T", "3.5T Sport", "Electrified"],
    "GV80": ["suv", "2.5T", "3.5T", "Coupe"],
  },
  "GMC": {
    "Acadia": ["suv", "Elevation", "AT4", "Denali"],
    "Canyon": ["truck", "Elevation", "AT4", "AT4X", "Denali"],
    "Hummer EV Pickup": ["truck", "2X", "3X"],
    "Hummer EV SUV": ["suv", "2X", "3X"],
    "Sierra 1500": ["truck", "Pro", "SLE", "Elevation", "SLT", "AT4", "Denali", "AT4X", "Denali Ultimate"],
    "Sierra 2500HD": ["truck", "Pro", "SLE", "SLT", "AT4", "Denali"],
    "Sierra EV": ["truck", "Elevation", "Denali"],
    "Terrain": ["suv", "Elevation", "AT4", "Denali"],
    "Yukon": ["suv", "Elevation", "SLT", "AT4", "Denali", "Denali Ultimate"],
  },
  "Honda": {
    "Accord": ["sedan", "LX", "SE", "EX", "Sport Hybrid", "EX-L Hybrid", "Sport-L Hybrid", "Touring Hybrid"],
    "Civic": ["sedan", "LX", "Sport", "Sport Hybrid", "EX", "Sport Touring Hybrid", "Si", "Type R"],
    "CR-V": ["suv", "LX", "EX", "EX-L", "Sport Hybrid", "Sport-L Hybrid", "Sport Touring Hybrid"],
    "HR-V": ["suv", "LX", "Sport", "EX-L"],
    "Odyssey": ["van", "EX", "EX-L", "Sport-L", "Touring", "Elite"],
    "Passport": ["suv", "RTL", "TrailSport", "TrailSport Elite"],
    "Pilot": ["suv", "Sport", "EX-L", "TrailSport", "Touring", "Elite", "Black Edition"],
    "Prologue": ["suv", "EX", "Touring", "Elite"],
    "Ridgeline": ["truck", "Sport", "RTL", "TrailSport", "Black Edition"],
  },
  "Hyundai": {
    "Elantra": ["sedan", "SE", "SEL", "Limited", "N Line", "N"],
    "IONIQ 5": ["suv", "SE Standard Range", "SE", "SEL", "Limited", "XRT", "N"],
    "IONIQ 6": ["sedan", "SE Standard Range", "SE", "SEL", "Limited"],
    "IONIQ 9": ["suv", "SE", "SEL", "Performance Limited", "Calligraphy"],
    "Kona": ["suv", "SE", "SEL", "N Line", "Limited"],
    "Palisade": ["suv", "SE", "SEL", "XRT Pro", "Limited", "Calligraphy"],
    "Santa Cruz": ["truck", "SE", "SEL", "XRT", "Limited"],
    "Santa Fe": ["suv", "SE", "SEL", "XRT", "Limited", "Calligraphy"],
    "Sonata": ["sedan", "SE", "SEL", "N Line", "Limited"],
    "Tucson": ["suv", "SE", "SEL", "XRT", "N Line", "Limited"],
    "Venue": ["suv", "SE", "SEL", "Limited"],
  },
  "INFINITI": {
    "QX50": ["suv", "Pure", "Luxe", "Sport", "Autograph"],
    "QX55": ["suv", "Luxe", "Essential", "Sport"],
    "QX60": ["suv", "Pure", "Luxe", "Sport", "Autograph"],
    "QX80": ["suv", "Pure", "Luxe", "Sport", "Autograph"],
  },
  "Jaguar": {
    "F-PACE": ["suv", "P250 S", "P400 R-Dynamic S", "SVR"],
    "I-PACE": ["suv", "EV400 S", "EV400 HSE"],
  },
  "Jeep": {
    "Compass": ["suv", "Sport", "Latitude", "Limited", "Trailhawk"],
    "Gladiator": ["truck", "Sport S", "Willys", "Nighthawk", "Rubicon", "Mojave"],
    "Grand Cherokee": ["suv", "Laredo", "Altitude", "Limited", "Trailhawk", "Overland", "Summit", "Summit Reserve"],
    "Grand Wagoneer": ["suv", "Series II", "Obsidian", "Series III"],
    "Wagoneer": ["suv", "Series II", "Carbide", "Series III"],
    "Wagoneer S": ["suv", "Launch Edition", "Limited"],
    "Wrangler": ["suv", "Sport", "Sport S", "Willys", "Sahara", "Rubicon", "Rubicon 392"],
  },
  "Kia": {
    "Carnival": ["van", "LX", "EX", "SX", "SX Prestige"],
    "EV6": ["suv", "Light", "Wind", "GT-Line", "GT"],
    "EV9": ["suv", "Light", "Wind", "Land", "GT-Line"],
    "Forte": ["sedan", "LX", "LXS", "GT-Line", "GT"],
    "K4": ["sedan", "LX", "LXS", "EX", "GT-Line", "GT-Line Turbo"],
    "K5": ["sedan", "LXS", "GT-Line", "EX", "GT"],
    "Niro": ["suv", "LX", "EX", "EX Touring", "SX Touring"],
    "Seltos": ["suv", "LX", "S", "EX", "SX"],
    "Sorento": ["suv", "LX", "S", "EX", "SX", "SX Prestige", "X-Pro"],
    "Soul": ["suv", "LX", "S", "GT-Line", "EX"],
    "Sportage": ["suv", "LX", "S", "EX", "X-Line", "SX Prestige", "X-Pro Prestige"],
    "Telluride": ["suv", "LX", "S", "EX", "SX", "SX Prestige", "X-Line", "X-Pro"],
  },
  "Land Rover": {
    "Defender": ["suv", "90 S", "110 S", "110 X-Dynamic SE", "130 Outbound", "110 V8"],
    "Discovery": ["suv", "S", "Dynamic SE", "Metropolitan Edition"],
    "Discovery Sport": ["suv", "S", "Dynamic SE"],
    "Range Rover": ["suv", "SE", "Autobiography", "SV"],
    "Range Rover Evoque": ["suv", "S", "Dynamic SE", "Dynamic HSE"],
    "Range Rover Sport": ["suv", "SE", "Dynamic SE", "Autobiography", "SV"],
    "Range Rover Velar": ["suv", "S", "Dynamic SE", "Autobiography"],
  },
  "Lexus": {
    "ES": ["sedan", "250", "300h", "350", "350 F Sport"],
    "GX": ["suv", "Premium", "Premium+", "Overtrail", "Overtrail+", "Luxury", "Luxury+"],
    "IS": ["sedan", "300", "350 F Sport", "500 F Sport Performance"],
    "LC": ["coupe", "500", "500h", "500 Convertible"],
    "LS": ["sedan", "500", "500h"],
    "LX": ["suv", "600 Premium", "600 F Sport", "600 Luxury", "700h Overtrail"],
    "NX": ["suv", "250", "350", "350h", "450h+", "350 F Sport"],
    "RX": ["suv", "350", "350h", "450h+", "500h F Sport"],
    "RZ": ["suv", "300e", "450e", "550e F Sport"],
    "TX": ["suv", "350", "500h F Sport", "550h+"],
    "UX": ["suv", "300h", "300h F Sport"],
  },
  "Lincoln": {
    "Aviator": ["suv", "Premiere", "Reserve", "Black Label"],
    "Corsair": ["suv", "Premiere", "Reserve", "Grand Touring"],
    "Nautilus": ["suv", "Premiere", "Reserve", "Black Label"],
    "Navigator": ["suv", "Premiere", "Reserve", "Black Label"],
  },
  "Lucid": {
    "Air": ["sedan", "Pure", "Touring", "Grand Touring", "Sapphire"],
    "Gravity": ["suv", "Touring", "Grand Touring"],
  },
  "Mazda": {
    "CX-30": ["suv", "S Select", "S Preferred", "S Carbon Edition", "Turbo Premium Plus"],
    "CX-5": ["suv", "S Select", "S Preferred", "S Carbon Edition", "S Premium", "Turbo Premium Plus"],
    "CX-50": ["suv", "S Select", "S Preferred", "S Premium", "Turbo Meridian", "Turbo Premium Plus"],
    "CX-70": ["suv", "S Preferred", "S Premium", "PHEV Premium Plus"],
    "CX-90": ["suv", "S Select", "S Preferred", "S Premium", "PHEV Premium Plus", "Turbo S"],
    "Mazda3": ["sedan", "2.5 S", "2.5 S Select Sport", "2.5 S Preferred", "2.5 S Carbon Edition", "2.5 Turbo Premium Plus"],
    "MX-5 Miata": ["coupe", "Sport", "Club", "Grand Touring"],
  },
  "Mercedes-Benz": {
    "A-Class": ["sedan", "A 220"],
    "C-Class": ["sedan", "C 300", "AMG C 43", "AMG C 63 S E Performance"],
    "E-Class": ["sedan", "E 350", "E 450", "AMG E 53"],
    "S-Class": ["sedan", "S 500", "S 580", "AMG S 63 E Performance", "Maybach S 580"],
    "CLA": ["sedan", "CLA 250", "AMG CLA 35", "AMG CLA 45"],
    "EQB": ["suv", "250+", "300 4MATIC", "350 4MATIC"],
    "EQE SUV": ["suv", "350+", "350 4MATIC", "500 4MATIC", "AMG EQE"],
    "EQS SUV": ["suv", "450+", "450 4MATIC", "580 4MATIC", "Maybach EQS 680"],
    "GLA": ["suv", "GLA 250", "AMG GLA 35"],
    "GLB": ["suv", "GLB 250", "AMG GLB 35"],
    "GLC": ["suv", "GLC 300", "AMG GLC 43", "AMG GLC 63 S E Performance"],
    "GLE": ["suv", "GLE 350", "GLE 450", "GLE 580", "AMG GLE 53", "AMG GLE 63 S"],
    "GLS": ["suv", "GLS 450", "GLS 580", "AMG GLS 63", "Maybach GLS 600"],
    "G-Class": ["suv", "G 550", "AMG G 63", "G 580 with EQ"],
    "Sprinter": ["van", "Cargo", "Crew", "Passenger"],
  },
  "MINI": {
    "Countryman": ["suv", "S ALL4", "John Cooper Works", "SE ALL4"],
    "Hardtop 2 Door": ["coupe", "Cooper", "Cooper S", "John Cooper Works"],
    "Hardtop 4 Door": ["sedan", "Cooper", "Cooper S"],
  },
  "Mitsubishi": {
    "Eclipse Cross": ["suv", "ES", "LE", "SE", "SEL"],
    "Outlander": ["suv", "ES", "SE", "SEL", "Platinum Edition"],
    "Outlander PHEV": ["suv", "ES", "SE", "SEL"],
    "Outlander Sport": ["suv", "ES", "SE", "SEL"],
  },
  "Nissan": {
    "Altima": ["sedan", "S", "SV", "SR", "SL"],
    "Ariya": ["suv", "Engage", "Venture+", "Evolve+", "Empower+", "Platinum+"],
    "Armada": ["suv", "SV", "SL", "Platinum", "Platinum Reserve"],
    "Frontier": ["truck", "S", "SV", "Nismo", "PRO-4X", "PRO-X", "SL"],
    "Kicks": ["suv", "S", "SV", "SR"],
    "Leaf": ["sedan", "S", "SV Plus"],
    "Murano": ["suv", "SV", "SL", "Platinum"],
    "Pathfinder": ["suv", "S", "SV", "SL", "Rock Creek", "Platinum"],
    "Rogue": ["suv", "S", "SV", "SL", "Rock Creek", "Platinum"],
    "Sentra": ["sedan", "S", "SV", "SR"],
    "Titan": ["truck", "S", "SV", "PRO-4X", "Platinum Reserve"],
    "Versa": ["sedan", "S", "SV", "SR"],
    "Z": ["coupe", "Sport", "Performance", "Nismo"],
  },
  "Polestar": {
    "Polestar 2": ["sedan", "Long Range Single Motor", "Long Range Dual Motor"],
    "Polestar 3": ["suv", "Long Range Single Motor", "Long Range Dual Motor"],
    "Polestar 4": ["suv", "Long Range Single Motor", "Long Range Dual Motor"],
  },
  "Porsche": {
    "911": ["coupe", "Carrera", "Carrera T", "Carrera S", "Carrera 4S", "Targa 4", "Turbo", "Turbo S", "GT3", "GT3 RS"],
    "718 Cayman": ["coupe", "Base", "S", "GTS 4.0", "GT4 RS"],
    "Cayenne": ["suv", "Base", "S", "E-Hybrid", "GTS", "Turbo E-Hybrid"],
    "Macan": ["suv", "Base", "S", "GTS", "Turbo Electric"],
    "Panamera": ["sedan", "Base", "4", "4S E-Hybrid", "GTS", "Turbo E-Hybrid"],
    "Taycan": ["sedan", "Base", "4S", "GTS", "Turbo", "Turbo S"],
  },
  "Ram": {
    "1500": ["truck", "Tradesman", "Big Horn", "Laramie", "Rebel", "Limited Longhorn", "Limited", "Tungsten", "RHO"],
    "2500": ["truck", "Tradesman", "Big Horn", "Laramie", "Power Wagon", "Limited Longhorn", "Limited"],
    "3500": ["truck", "Tradesman", "Big Horn", "Laramie", "Limited Longhorn", "Limited"],
    "ProMaster": ["van", "Cargo", "Window", "Chassis Cab"],
  },
  "Rivian": {
    "R1S": ["suv", "Dual Standard", "Dual Large", "Tri Max", "Quad Max"],
    "R1T": ["truck", "Dual Standard", "Dual Large", "Tri Max", "Quad Max"],
  },
  "Subaru": {
    "Ascent": ["suv", "Base", "Premium", "Onyx Edition", "Limited", "Touring"],
    "BRZ": ["coupe", "Premium", "Limited", "tS"],
    "Crosstrek": ["suv", "Base", "Premium", "Sport", "Limited", "Wilderness"],
    "Forester": ["suv", "Base", "Premium", "Sport", "Limited", "Touring", "Wilderness"],
    "Impreza": ["sedan", "Base", "Sport", "RS"],
    "Legacy": ["sedan", "Base", "Premium", "Sport", "Limited", "Touring XT"],
    "Outback": ["suv", "Base", "Premium", "Onyx Edition XT", "Limited", "Touring XT", "Wilderness"],
    "Solterra": ["suv", "Premium", "Limited", "Touring"],
    "WRX": ["sedan", "Base", "Premium", "Limited", "GT", "tS"],
  },
  "Tesla": {
    "Model 3": ["sedan", "Standard", "Premium", "Long Range AWD", "Performance"],
    "Model S": ["sedan", "Long Range AWD", "Plaid"],
    "Model X": ["suv", "Long Range AWD", "Plaid"],
    "Model Y": ["suv", "Standard", "Premium", "Long Range AWD", "Performance"],
    "Cybertruck": ["truck", "Long Range RWD", "All-Wheel Drive", "Cyberbeast"],
  },
  "Toyota": {
    "4Runner": ["suv", "SR5", "TRD Sport", "TRD Off-Road", "Limited", "Platinum", "TRD Pro", "Trailhunter"],
    "bZ4X": ["suv", "XLE", "Limited"],
    "Camry": ["sedan", "LE", "SE", "XLE", "XSE"],
    "Corolla": ["sedan", "LE", "SE", "XSE", "Nightshade"],
    "Corolla Cross": ["suv", "L", "LE", "XLE", "Nightshade"],
    "Crown": ["sedan", "XLE", "Limited", "Platinum"],
    "GR Corolla": ["sedan", "Core", "Premium", "Premium Plus"],
    "GR Supra": ["coupe", "2.0", "3.0", "3.0 Premium"],
    "Grand Highlander": ["suv", "LE", "XLE", "Limited", "Platinum", "Nightshade"],
    "Highlander": ["suv", "LE", "XLE", "XSE", "Limited", "Platinum"],
    "Land Cruiser": ["suv", "1958", "Land Cruiser", "First Edition"],
    "Prius": ["sedan", "LE", "XLE", "Limited", "Nightshade"],
    "RAV4": ["suv", "LE", "XLE", "XLE Premium", "Woodland", "TRD Off-Road", "Limited", "Platinum"],
    "Sequoia": ["suv", "SR5", "Limited", "Platinum", "TRD Pro", "Capstone"],
    "Sienna": ["van", "LE", "XLE", "XSE", "Woodland", "Limited", "Platinum"],
    "Tacoma": ["truck", "SR", "SR5", "TRD PreRunner", "TRD Sport", "TRD Off-Road", "Limited", "Trailhunter", "TRD Pro"],
    "Tundra": ["truck", "SR", "SR5", "Limited", "Platinum", "1794 Edition", "TRD Pro", "Capstone"],
  },
  "Volkswagen": {
    "Atlas": ["suv", "SE", "SE with Technology", "Peak Edition SE", "SEL", "SEL Premium R-Line"],
    "Atlas Cross Sport": ["suv", "SE", "SE with Technology", "SEL", "SEL Premium R-Line"],
    "Golf GTI": ["coupe", "S", "SE", "Autobahn"],
    "Golf R": ["coupe", "Base"],
    "ID.4": ["suv", "Standard", "S", "Pro", "Pro S", "Pro S Plus"],
    "ID. Buzz": ["van", "Pro S", "Pro S Plus", "1st Edition"],
    "Jetta": ["sedan", "S", "Sport", "SE", "SEL", "GLI Autobahn"],
    "Taos": ["suv", "S", "SE", "SEL"],
    "Tiguan": ["suv", "S", "SE", "SE R-Line Black", "SEL R-Line"],
  },
  "Volvo": {
    "EX30": ["suv", "Core", "Plus", "Ultra"],
    "EX90": ["suv", "Plus", "Ultra"],
    "S60": ["sedan", "Core", "Plus", "Ultimate"],
    "S90": ["sedan", "Plus", "Ultimate"],
    "XC40": ["suv", "Core", "Plus", "Ultimate"],
    "EC40": ["suv", "Core", "Plus", "Ultimate"],
    "XC60": ["suv", "Core", "Plus", "Ultimate"],
    "XC90": ["suv", "Core", "Plus", "Ultimate"],
  },
};

export const ALL_MAKES = Object.keys(CATALOG).sort((a, b) => a.localeCompare(b));

export const modelsForMake = (make) =>
  Object.keys(CATALOG[make] || {}).sort((a, b) => a.localeCompare(b));

export const trimsFor = (make, model) => (CATALOG[make]?.[model] || []).slice(1);

export const bodyStyleFor = (make, model) => CATALOG[make]?.[model]?.[0] || "sedan";

export const ALL_MODELS = Object.values(CATALOG).flatMap((m) => Object.keys(m));

/* Every trim string anywhere, for free-text matching during intake. */
export const ALL_TRIMS = [
  ...new Set(Object.values(CATALOG).flatMap((models) => Object.values(models).flatMap((a) => a.slice(1)))),
];
