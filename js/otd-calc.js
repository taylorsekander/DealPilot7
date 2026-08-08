/* ============================================================================
   OUT-THE-DOOR CALCULATOR + STATE FEE TABLE

   Lives in js/ rather than shared/ for one deliberate reason: .assetsignore
   blocks shared/** from being served to the browser, but the OTD calculator has
   to run on BOTH sides —

     · in the Worker, to seed the dashboard's opening scenario
     · in the browser, so dragging a slider recalculates instantly instead of
       round-tripping to the server on every keystroke

   Duplicating the math would guarantee the two copies drift, and a financing
   number that differs between screens is worse than a slow one. One module,
   two importers. Nothing secret is in here.
   ============================================================================ */

const $ = (n) => "$" + Math.round(n).toLocaleString();

/* ----------------------------------------------------------------------------
   STATE FEE TABLE  ⚠️ VERIFY BEFORE LAUNCH

   Out-the-door price = vehicle + doc fee + taxes + title/registration.
   These are ESTIMATES and are labelled as such everywhere they surface. Rates
   change, counties add local tax, and states differ on trade-in treatment. A
   wrong rate makes every OTD figure wrong and the buyer discovers it at the
   finance desk — the worst possible moment.

   tradeInCredit: whether the state taxes the price AFTER deducting trade value.
   Worth real money, and most buyers have never heard of it.
---------------------------------------------------------------------------- */
const STATE_FEES = {
  VA: { taxRate: 0.0415, docFee: 899, docCap: null, titleReg: 150, tradeInCredit: false, note: "Virginia doesn't cap doc fees; $700–$1,000 is typical and it is negotiable. Trade-in does not reduce the taxable price." },
  MD: { taxRate: 0.06, docFee: 500, docCap: 500, titleReg: 200, tradeInCredit: true, note: "Maryland caps the dealer processing charge. Trade-in value reduces the taxable amount." },
  DC: { taxRate: 0.06, docFee: 300, docCap: null, titleReg: 175, tradeInCredit: false, note: "DC excise tax varies by vehicle weight and efficiency — treat this as rough." },
  PA: { taxRate: 0.06, docFee: 449, docCap: 449, titleReg: 120, tradeInCredit: true, note: "Pennsylvania caps doc fees by dealer type." },
  NY: { taxRate: 0.08, docFee: 175, docCap: 175, titleReg: 140, tradeInCredit: true, note: "New York caps doc fees at $175 statewide — among the strictest caps in the country." },
  NJ: { taxRate: 0.06625, docFee: 499, docCap: null, titleReg: 145, tradeInCredit: true, note: "New Jersey doc fees are uncapped." },
  CA: { taxRate: 0.0825, docFee: 85, docCap: 85, titleReg: 400, tradeInCredit: false, note: "California caps doc fees very low, but registration is among the highest." },
  TX: { taxRate: 0.0625, docFee: 225, docCap: null, titleReg: 100, tradeInCredit: true, note: "Texas doc fees are uncapped but customarily modest." },
  FL: { taxRate: 0.06, docFee: 999, docCap: null, titleReg: 400, tradeInCredit: true, note: "Florida doc fees are uncapped and often exceed $900. Negotiate this line specifically." },
  NC: { taxRate: 0.03, docFee: 699, docCap: null, titleReg: 130, tradeInCredit: true, note: "North Carolina charges a 3% Highway Use Tax instead of standard sales tax." },
  GA: { taxRate: 0.07, docFee: 599, docCap: null, titleReg: 100, tradeInCredit: true, note: "Georgia's Title Ad Valorem Tax replaces sales tax and is assessed on fair market value." },
  IL: { taxRate: 0.0725, docFee: 347, docCap: 347, titleReg: 300, tradeInCredit: true, note: "Illinois caps doc fees and adjusts the cap annually." },
  OH: { taxRate: 0.0575, docFee: 250, docCap: 250, titleReg: 85, tradeInCredit: true, note: "Ohio caps doc fees." },
  MI: { taxRate: 0.06, docFee: 260, docCap: 260, titleReg: 250, tradeInCredit: true, note: "Michigan caps doc fees and adjusts annually." },
  WA: { taxRate: 0.0885, docFee: 200, docCap: null, titleReg: 200, tradeInCredit: true, note: "Washington's combined rate is high and local rates vary significantly by city." },
  AZ: { taxRate: 0.056, docFee: 499, docCap: null, titleReg: 175, tradeInCredit: true, note: "Arizona doc fees are uncapped." },
  CO: { taxRate: 0.029, docFee: 699, docCap: null, titleReg: 550, tradeInCredit: true, note: "Colorado's state rate is low but local rates and registration are substantial." },
  DEFAULT: { taxRate: 0.065, docFee: 500, docCap: null, titleReg: 200, tradeInCredit: true, note: "Approximate national averages — we don't have a rate table for this state. Confirm locally before relying on these figures." },
};

export function feesFor(stateCode) {
  const code = String(stateCode || "").toUpperCase();
  const known = STATE_FEES[code];
  return { ...(known || STATE_FEES.DEFAULT), state: known ? code : "DEFAULT", isKnownState: !!known };
}

/* ----------------------------------------------------------------------------
   OUT-THE-DOOR CALCULATOR

   Deliberately itemized. The most effective thing a buyer can do is demand the
   OTD number in writing, because that's where dealer profit hides — not in the
   vehicle line, which everyone negotiates, but in the lines below it, which
   most people never read.

   Every input is editable in the UI. Nothing here is fixed.
---------------------------------------------------------------------------- */
export function calculateOTD(input) {
  const {
    vehiclePrice = 0, dealerDiscount = 0, incentives = 0, tradeValue = 0, tradePayoff = 0,
    docFee = 0, titleReg = 0, dealerAccessories = 0, otherDealerFees = 0,
    taxRate = 0, tradeInCredit = true,
    downPayment = 0, apr = 6.9, termMonths = 60,
  } = input;

  const netVehicle = Math.max(0, vehiclePrice - dealerDiscount - incentives);

  // In credit states the trade-in is deducted BEFORE tax, often worth several
  // hundred dollars on its own.
  const tradeOffset = tradeInCredit ? Math.min(tradeValue, netVehicle) : 0;
  const taxableBase = Math.max(0, netVehicle + dealerAccessories + docFee - tradeOffset);
  const taxes = taxableBase * taxRate;

  const otd = netVehicle + dealerAccessories + docFee + otherDealerFees + titleReg + taxes;

  // Equity can be negative. Rolling an underwater loan into a new deal is one
  // of the most expensive mistakes in car buying, so we surface it loudly.
  const tradeEquity = tradeValue - tradePayoff;
  const amountDue = otd - tradeEquity;
  const amountFinanced = Math.max(0, amountDue - downPayment);

  const r = apr / 100 / 12;
  const monthly = amountFinanced <= 0 ? 0
    : r === 0 ? amountFinanced / termMonths
    : (amountFinanced * r) / (1 - Math.pow(1 + r, -termMonths));
  const totalFinanceCost = monthly * termMonths - amountFinanced;

  return {
    lines: [
      { key: "vehiclePrice", label: "Vehicle price", amount: vehiclePrice, provenance: "measured" },
      { key: "dealerDiscount", label: "Dealer discount", amount: -dealerDiscount, provenance: "input", negative: true },
      { key: "incentives", label: "Manufacturer incentives", amount: -incentives, provenance: "input", negative: true },
      { key: "dealerAccessories", label: "Dealer-added accessories", amount: dealerAccessories, provenance: "input", warn: dealerAccessories > 0 },
      { key: "docFee", label: "Documentation fee", amount: docFee, provenance: "estimated" },
      { key: "otherDealerFees", label: "Other dealer fees", amount: otherDealerFees, provenance: "input", warn: otherDealerFees > 0 },
      { key: "titleReg", label: "Title & registration", amount: titleReg, provenance: "estimated" },
      { key: "taxes", label: "Sales tax", amount: taxes, provenance: "estimated",
        sub: tradeOffset > 0 ? `Trade-in reduced the taxable amount by ${$(tradeOffset)}` : null },
    ],
    netVehicle, taxableBase, taxes, otd,
    tradeValue, tradePayoff, tradeEquity, amountDue,
    downPayment, amountFinanced, apr, termMonths,
    monthlyPayment: monthly, totalFinanceCost,
    totalCost: otd + totalFinanceCost,
    negativeEquity: tradeEquity < 0,
  };
}

