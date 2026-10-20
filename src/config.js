const palette = [
  ['#397f86', '#e8f2f2'], ['#9a6e8e', '#f3eaf1'],
  ['#b58437', '#faf1dc'], ['#527d59', '#eaf2e7'],
];
function entity(value, domain, field, optional = false) {
  if (optional && !value) return undefined;
  if (typeof value !== 'string' || !new RegExp(`^${domain}\\.[a-z0-9_]+$`).test(value)) {
    throw new Error(`Hearthglance: ${field} must be a ${domain} entity ID.`);
  }
  return value;
}
const color = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) throw new Error('Hearthglance: colors must be #RGB or #RRGGBB.');
  return value;
};
function array(value, field, required = false) {
  if (value == null && !required) return [];
  if (!Array.isArray(value) || (required && !value.length) || value.some(v => !v || typeof v !== 'object')) throw new Error(`Hearthglance: ${field} must be ${required ? 'a nonempty' : 'an'} array of objects.`);
  return value;
}
function distinct(values, field) {
  if (new Set(values).size !== values.length) throw new Error(`Hearthglance: ${field} must be unique.`);
}
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Hearthglance: provide a card configuration.');
  const people = array(raw.people, 'people', true).map((p, i) => {
    if (typeof p.id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(p.id) || p.id === 'all') throw new Error('Hearthglance: person IDs must start with a letter and contain lowercase letters, numbers, _ or -. The ID all is reserved.');
    if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('Hearthglance: each person needs a name.');
    return {id: p.id, name: p.name, initial: String(p.initial || p.name.trim()[0]), color: color(p.color, palette[i % 4][0]), pale: color(p.pale, palette[i % 4][1]), todo: entity(p.todo, 'todo', `people[${i}].todo`, true)};
  });
  distinct(people.map(p => p.id), 'person IDs');
  const calendars = array(raw.calendars, 'calendars', true).map((c, i) => {
    const id = entity(c.entity, 'calendar', `calendars[${i}].entity`);
    const person = c.person || people[0].id;
    if (!people.some(p => p.id === person)) throw new Error(`Hearthglance: calendar ${id} references an unknown person.`);
    if (c.kind && c.kind !== 'meals') throw new Error('Hearthglance: calendar kind can only be meals. Omit it for regular events.');
    return {entity: id, name: String(c.name || id.split('.')[1].replaceAll('_', ' ')), person, kind: c.kind, auxiliary: Boolean(c.auxiliary)};
  });
  distinct(calendars.map(c => c.entity), 'calendar entities');
  const lists = array(raw.lists, 'lists').map((l, i) => ({entity: entity(l.entity, 'todo', `lists[${i}].entity`), name: String(l.name || 'Shared list')}));
  const recipes = entity(raw.recipes, 'todo', 'recipes', true);
  distinct([...people.map(p => p.todo), ...lists.map(l => l.entity), recipes].filter(Boolean), 'to-do entities across people, lists, and recipes');
  const default_calendar = raw.default_calendar ? entity(raw.default_calendar, 'calendar', 'default_calendar') : calendars.find(c => !c.kind)?.entity;
  if (default_calendar && !calendars.some(c => c.entity === default_calendar && c.kind !== 'meals')) throw new Error('Hearthglance: default_calendar must be a configured regular calendar.');
  if (raw.storage_key != null && (typeof raw.storage_key !== 'string' || !raw.storage_key.trim())) throw new Error('Hearthglance: storage_key must be a nonempty string.');
  return {type: 'custom:hearthglance-card', household: String(raw.household || 'Our family'), people, calendars, lists, recipes, weather: entity(raw.weather, 'weather', 'weather', true), default_calendar, storage_key: raw.storage_key || calendars.map(c => c.entity).sort().join(':')};
}
export function enabledPages(config) {
  return ['home', 'calendar', ...(config.people.some(p => p.todo) ? ['tasks'] : []), ...(config.lists.length ? ['list'] : []), ...(config.calendars.some(c => c.kind === 'meals') ? ['meals'] : []), ...(config.recipes ? ['recipes'] : []), 'settings'];
}
