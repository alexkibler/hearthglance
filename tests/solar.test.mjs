import test from 'node:test';
import assert from 'node:assert/strict';
import {solarReadings, solarStatesChanged} from '../src/solar.js';
import {normalizeConfig} from '../src/config.js';
const sensor=(value,unit)=>({state:String(value),attributes:{unit_of_measurement:unit}});
const config={power:'sensor.solar_power',today:'sensor.solar_today',forecast_tomorrow:'sensor.solar_tomorrow'};
const base=()=>({people:[{id:'family',name:'Family'}],calendars:[{entity:'calendar.family'}]});
test('solar uses actual power, actual daily energy, and a distinct tomorrow forecast',()=>{
 const rows=solarReadings(config,{'sensor.solar_power':sensor(4415,'W'),'sensor.solar_today':sensor(6507,'Wh'),'sensor.solar_tomorrow':sensor(0.046188,'MWh')});
 assert.deepEqual(rows.map(r=>[r.key,r.value,r.unit]),[['power','4.42','kW'],['today','6.51','kWh'],['forecast_tomorrow','46.19','kWh']]);
 assert.equal(rows[2].label,'Tomorrow forecast');
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
