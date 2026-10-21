const numberFormat = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
const fields = [
  ['power', 'Current power', 'kW', {W: 0.001, kW: 1, MW: 1000}],
  ['today', 'Today', 'kWh', {Wh: 0.001, kWh: 1, MWh: 1000}],
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
.solar-panel{display:flex;align-items:center;gap:30px;flex-shrink:0;border:1px solid var(--line);background:var(--surface);border-radius:20px;padding:17px 22px}
.solar-header{flex-shrink:0;min-width:180px}.solar-header h2{display:flex;align-items:center;gap:9px;margin:0;font-size:17px;font-weight:600}.solar-header h2 svg{color:#b28b36;width:23px;height:23px}.solar-link{display:inline-flex;align-items:center;min-height:32px;margin-left:32px;font-size:12px;color:var(--accent);text-decoration:none}.solar-link:hover{text-decoration:underline}
.solar-metrics{display:grid;grid-template-columns:repeat(var(--solar-count),minmax(0,1fr));gap:24px;flex:1;min-width:0;margin:0}.solar-metric{min-width:0}.solar-metric dt{color:var(--muted);font-size:12px;line-height:1.4;margin-bottom:5px}.solar-metric dd{display:flex;align-items:baseline;gap:5px;margin:0;min-height:34px;flex-wrap:wrap;font-variant-numeric:tabular-nums}.solar-number{font-size:28px;line-height:1.15;font-weight:600;letter-spacing:-.7px}.solar-unit,.solar-status{font-size:12px;color:var(--muted)}
.phone .solar-panel{display:block;margin:4px 16px 18px;padding:18px 16px;border-radius:24px;background:var(--bg)}.phone .solar-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;min-width:0}.phone .solar-header h2{font-size:16px;gap:7px}.phone .solar-header h2 svg{width:21px;height:21px}.phone .solar-link{margin:0;font-size:12px;min-height:36px}.phone .solar-metrics{gap:12px}.phone .solar-metric dt{font-size:11px;min-height:30px;margin-bottom:4px}.phone .solar-metric dd{gap:4px;min-height:26px}.phone .solar-number{font-size:22px;letter-spacing:-.5px}.phone .solar-unit,.phone .solar-status{font-size:11px}
@media(max-width:360px){.phone .solar-number{font-size:20px}.phone .solar-unit,.phone .solar-status{font-size:10px}.phone .solar-metrics{gap:8px}.phone .solar-header h2{font-size:15px}}
`;
