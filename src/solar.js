import {dateKey, addDays} from './model.js';

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

// Daily forecasts are date-specific: never repeat tomorrow's estimate on later days.
export function solarForDate(config, states, date, today = new Date(), connected = true) {
  const key = dateKey(date), current = key === dateKey(today);
  if (!current && key !== dateKey(addDays(today, 1))) return null;
  const readings = solarReadings(config, states, connected);
  const actual = current ? readings.find(r => r.key === 'today') : undefined;
  const forecast = readings.find(r => r.key === (current ? 'forecast_today' : 'forecast_tomorrow'));
  return actual || forecast ? {actual, forecast} : null;
}

export const solarStyles = `
.weather-solar{display:block;margin-top:5px;color:var(--accent);white-space:nowrap;line-height:1.3;text-align:left}.weather-solar small{display:block;font-size:9px;font-weight:400;color:var(--muted)}.weather-solar b{display:block;font-size:11px;font-weight:600}.weather-solar .solar-unit{font-size:9px;font-weight:400;margin-left:3px}.forecast-day .weather-solar{text-align:center}.topbar:has(.weather-solar){padding-top:10px;padding-bottom:10px}.weather:has(.weather-solar) .forecast-day{line-height:1.3}.weather:has(.weather-solar) .forecast-day .weather-icon{line-height:1.4}
.phone-weather-strip{display:flex;align-items:center;gap:22px;overflow-x:auto;margin:4px 16px 0;padding:12px 0;border-bottom:1px solid var(--line);scrollbar-width:thin}.phone-weather-strip:empty{display:none}.phone .phone-weather-strip .weather-now{padding:0;border:0;gap:10px;flex-shrink:0}.phone .phone-weather-strip .weather-temp{font-size:21px}.phone .phone-weather-strip .weather-label{font-size:10px}.phone .phone-weather-strip .weather-icon{font-size:24px}.phone .phone-weather-strip .forecast{display:flex;gap:20px}.phone .phone-weather-strip .forecast-day{display:block;font-size:10px;flex-shrink:0}.phone .phone-weather-strip .forecast-day .weather-icon{font-size:20px;line-height:1.3}.phone .phone-weather-strip .weather-solar b{font-size:11px}.phone .phone-weather-strip .weather-solar small{font-size:9px}
`;
