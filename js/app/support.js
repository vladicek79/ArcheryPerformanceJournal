// Tip links (Settings support card, Dashboard row). Pure; unit-tested.

/** A PayPal.Me link, with the amount in euros filled in when one is given. */
export function paypalMeUrl(name, amount) {
  const base = `https://paypal.me/${encodeURIComponent(name)}`;
  return amount ? `${base}/${amount}EUR` : base;
}
