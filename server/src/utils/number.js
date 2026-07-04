export function toNumber(value) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function money(value) {
  return Number(Number(value || 0).toFixed(2));
}
