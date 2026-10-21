const numberFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
const fields = [
  ['power', 'Now', 'kW', {W: 0.001, kW: 1, MW: 1000}],
  ['today', 'Today actual', 'kWh', {Wh: 0.001, kWh: 1, MWh: 1000}],
  ['forecast_today', 'Today forecast', 'kWh', {Wh: 0.001, kWh: 1, MWh: 1000}],
  ['forecast_tomorrow', 'Tomorrow forecast', 'kWh', {Wh: 0.001, kWh: 1, MWh: 1000}],
];

// Actual generation and forecast values deliberately come from separate sensors.
// Unknown values stay unavailable; they must never be displayed as zero.
export function solarReadings(config, states = {}, connected = true) {
  if (!config) return [];
  return fields.filter(([key]) => config[key]).map(([key, label, unit, factors]) => {
    const state = states?.[config[key]], raw = state?.state;
    const factor = factors[state?.attributes?.unit_of_measurement];
    const valid = connected !== false && typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)) && factor !== undefined;
    return {key, label, value: valid ? numberFormat.format(Number(raw) * factor) : '—',
      unit: valid ? unit : '', status: valid ? '' : connected === false ? 'Offline' : 'Unavailable'};
  });
}

export function solarStatesChanged(config, previous, next) {
  return Boolean(config && (previous?.connected !== next?.connected ||
    Object.values(config).some(id => previous?.states?.[id] !== next?.states?.[id])));
}

export const solarStyles = `
.page-head.with-solar{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"titles solar" "titles actions";gap:8px 24px}
.page-head.with-solar>div:first-child{grid-area:titles;align-self:start}.page-head.with-solar .head-actions{grid-area:actions;justify-self:end}.page-head.with-solar .solar-panel{grid-area:solar;align-self:start}
.solar-panel{display:flex;align-items:center;gap:10px;flex-shrink:0;min-width:0}
.solar-link{display:grid;place-items:center;width:32px;min-height:40px;color:#b28b36;text-decoration:none;flex-shrink:0}.solar-link svg{width:20px;height:20px}.solar-link:hover{color:var(--accent)}
.solar-metrics{display:grid;grid-template-columns:repeat(var(--solar-count),minmax(0,1fr));gap:18px;min-width:0;margin:0}.solar-metric{min-width:0}.solar-metric dt{color:var(--muted);font-size:10px;line-height:1.4;margin-bottom:3px;white-space:nowrap}.solar-metric dd{display:flex;align-items:baseline;gap:3px;margin:0;min-height:22px;flex-wrap:wrap;font-variant-numeric:tabular-nums}.solar-number{font-size:18px;line-height:1.2;font-weight:600;letter-spacing:-.3px}.solar-unit,.solar-status{font-size:10px;color:var(--muted)}
.phone .solar-panel{margin:4px 16px 0;padding:12px 0;border-bottom:1px solid var(--line)}.phone .solar-link{width:24px;min-height:44px}.phone .solar-link svg{width:18px;height:18px}.phone .solar-metrics{flex:1;gap:10px}.phone .solar-metric dt{font-size:9px;white-space:normal;min-height:26px}.phone .solar-number{font-size:17px}.phone .solar-unit,.phone .solar-status{font-size:9px}
@media(max-width:1000px){.page-head.with-solar{grid-template-columns:1fr;grid-template-areas:"solar" "titles" "actions";gap:10px}.page-head.with-solar .solar-panel{justify-self:end}}
@media(max-width:360px){.phone .solar-panel{gap:6px}.phone .solar-link{width:18px}.phone .solar-metrics{gap:7px}.phone .solar-number{font-size:15px}.phone .solar-unit,.phone .solar-status{font-size:8px}}
`;
