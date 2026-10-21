import test from 'node:test';
import assert from 'node:assert/strict';
import {solarReadings, solarStatesChanged, solarForDate} from '../src/solar.js';
import {normalizeConfig} from '../src/config.js';
const sensor=(value,unit)=>({state:String(value),attributes:{unit_of_measurement:unit}});
const config={power:'sensor.solar_power',today:'sensor.solar_today',forecast_today:'sensor.solar_forecast_today',forecast_tomorrow:'sensor.solar_tomorrow'};
const base=()=>({people:[{id:'family',name:'Family'}],calendars:[{entity:'calendar.family'}]});
test('solar uses actual power, actual daily energy, and distinct today/tomorrow forecasts',()=>{
 const rows=solarReadings(config,{'sensor.solar_power':sensor(4415,'W'),'sensor.solar_today':sensor(6507,'Wh'),'sensor.solar_forecast_today':sensor(48.24,'kWh'),'sensor.solar_tomorrow':sensor(0.046188,'MWh')});
 assert.deepEqual(rows.map(r=>[r.key,r.value,r.unit]),[['power','4.42','kW'],['today','6.51','kWh'],['forecast_today','48.24','kWh'],['forecast_tomorrow','46.19','kWh']]);
 assert.equal(rows[2].label,'Today forecast');assert.equal(rows[3].label,'Tomorrow forecast');
 assert.deepEqual(normalizeConfig({...base(),solar:{forecast_today:config.forecast_today}}).solar,{forecast_today:config.forecast_today});
});
test('zero is a valid solar reading while missing, offline, and incompatible units are unavailable',()=>{
 assert.equal(solarReadings({power:config.power},{[config.power]:sensor(0,'kW')})[0].value,'0');
 for(const value of [undefined,sensor('unknown','kWh'),sensor('unavailable','kWh'),sensor('','kWh'),sensor('NaN','kWh'),sensor('12','W')]){
  const reading=solarReadings({today:config.today},{[config.today]:value})[0];assert.equal(reading.value,'—');assert.equal(reading.status,'Unavailable');
 }
 const offline=solarReadings({power:config.power},{[config.power]:sensor(4.5,'kW')},false)[0];assert.equal(offline.status,'Offline');assert.equal(offline.value,'—');
});
test('solar configuration is optional and only accepts explicit sensor sources',()=>{
 assert.equal(normalizeConfig(base()).solar,undefined);
 assert.deepEqual(normalizeConfig({...base(),solar:{power:'sensor.power'}}).solar,{power:'sensor.power'});
 for(const solar of [[],{},'sensor.power',{power:'calendar.wrong'},{power:''},{today:0}])assert.throws(()=>normalizeConfig({...base(),solar}),/Hearthglance:/);
 assert.deepEqual(solarReadings(undefined,{}),[]);
});
test('solar updates only when a configured entity or connection status changes',()=>{
 const power=sensor(4,'kW'),before={connected:true,states:{[config.power]:power}};
 assert.equal(solarStatesChanged(config,before,{...before,states:{...before.states,'sensor.unrelated':sensor(8,'W')}}),false);
 assert.equal(solarStatesChanged(config,before,{connected:true,states:{[config.power]:sensor(5,'kW')}}),true);
 assert.equal(solarStatesChanged(config,before,{...before,connected:false}),true);
 assert.equal(solarStatesChanged(undefined,before,before),false);
});

test('weather pairs actual and forecast today, shows only forecast tomorrow, and omits other dates',()=>{
 const today=new Date(2026,11,31),states={
  [config.today]:sensor(0,'kWh'),[config.forecast_today]:sensor(20,'kWh'),[config.forecast_tomorrow]:sensor(30,'kWh'),
 };
 const now=solarForDate(config,states,today,today);
 assert.equal(now.actual.value,'0');assert.equal(now.forecast.value,'20');
 const tomorrow=solarForDate(config,states,new Date(2027,0,1),today);
 assert.equal(tomorrow.actual,undefined);assert.equal(tomorrow.forecast.value,'30');
 assert.equal(solarForDate(config,states,new Date(2027,0,2),today),null);
 assert.equal(solarForDate(config,states,new Date(2026,11,30),today),null);
 assert.equal(solarForDate(undefined,states,today,today),null);
 assert.equal(solarForDate(config,states,today,today,false).actual.status,'Offline');
});
