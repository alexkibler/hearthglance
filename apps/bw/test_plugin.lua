-- Real Kobo network/cache with UI, charging, and frontlight objects stubbed.
require('setupkoenv')
local Widget={};function Widget:extend(class)return class end
package.loaded['ui/widget/container/widgetcontainer']=Widget
local connected,powered,wifi_on,light,can_connect=true,true,true,true,true
local last_widget,last_delay,network_stops,flushes=nil,nil,0,0
local tasks={}
package.loaded['ui/uimanager']={scheduleIn=function(_,delay,callback)last_delay=delay;tasks[callback]=delay end,
 unschedule=function(_,callback)tasks[callback]=nil end,
 nextTick=function(_,cb)cb()end,show=function(_,widget)last_widget=widget end,close=function()end}
for _,name in ipairs({'infomessage','buttondialog','spinwidget'})do
 package.loaded['ui/widget/'..name]={new=function(_,x)return x end}
end
package.loaded['ui/network/manager']={isConnected=function()return connected end,
 isWifiOn=function()return wifi_on end,
 enableWifi=function(_,cb)if can_connect then connected=true;wifi_on=true;if cb then cb()end end end,
 disableWifi=function()network_stops=network_stops+1;wifi_on=false;connected=false end}
package.loaded.logger={warn=function()end,info=function()end}
local power_calls,standby_calls=0,0
local power={isCharging=function()return powered end,isFrontlightOn=function()return light end,
 turnOffFrontlight=function()light=false end,turnOnFrontlight=function()light=true end}
local stock_standby=function(self,seconds)standby_calls=standby_calls+1;self.last_standby_time=seconds end
local device={getPowerDevice=function()return power end,onPowerEvent=function()power_calls=power_calls+1 end,
 standby=stock_standby,
 canStandby=function()return true end}
package.loaded.device=device
local uim=package.loaded['ui/uimanager']
uim.poweroff_action=function()end
uim.event_handlers={
 Suspend=function()device:onPowerEvent('Suspend')end,
 Resume=function()device:onPowerEvent('Resume')end,
}
local stock_release=function()
 if not uim._entered_poweroff_stage then
  uim:unschedule(uim.poweroff_action)
  if device.screen_saver_mode then uim.event_handlers.Resume() else uim.event_handlers.Suspend() end
 end
end
uim.event_handlers.PowerRelease=stock_release
local shared={};package.loaded.pluginshare=shared
local state={screensaver_type='cover',screensaver_show_message=false,auto_standby_timeout_seconds=-1,
 hearthglance_refresh_battery_minutes=5,hearthglance_refresh_plugged_minutes=1}
G_reader_settings={readSetting=function(_,k)return state[k]end,saveSetting=function(_,k,v)state[k]=v end,
 delSetting=function(_,k)state[k]=nil end,nilOrTrue=function(_,k)return state[k]~=false end,
 isFalse=function(_,k)return state[k]==false end,flush=function()flushes=flushes+1 end,
 isTrue=function(_,k)return state[k]==true end,
 flipNilOrTrue=function(_,k)state[k]=state[k]==false end}
local called,last_sleep_type=0,nil
local ss={setup=function()called=called+1;last_sleep_type=state.screensaver_type end}
package.loaded['ui/screensaver']=ss
local original_dofile=dofile
local manual_redraws=0
local MockWall={new=function(_,x)
 x.setBundle=function(self,bundle)self.bundle=bundle end
 x.refreshFull=function()manual_redraws=manual_redraws+1 end
 x.setNextRefresh=function(self,epoch)self.next_refresh_at=epoch end
 return x
end}
dofile=function(path)if path:match('/wall.lua$')then return MockWall end;return original_dofile(path)end
local Family=dofile('plugins/hearthglance.koplugin/main.lua')
local standby={auto_standby_timeout_seconds=-1,_unschedule_standby=function()end,
 toggleStandbyHandler=function(self,on)self.enabled=on end,
 _enabledStandby=function(self)return self.auto_standby_timeout_seconds>0 end,
 _start_standby=function(self)self.scheduled=self.auto_standby_timeout_seconds>0 end}
local function new()local x=setmetatable({ui={autosuspend=standby,menu={registerToMainMenu=function()end}}},{__index=Family});x:init();return x end
local instance=new()
assert(state.hearthglance_sleep_enabled==false,'Normal lock screen must be restored by default')
ss:setup();assert(last_sleep_type=='cover','Default sleep must retain the normal lock screen')
assert(instance:refreshInterval(true)==60 and instance:refreshInterval(false)==3600,'Profile must set battery to one hour and preserve plugged-in choice')
instance:setRefreshInterval(true,60)
assert(instance:refresh(true),'Live image download failed')
local function bytes(path)local f=assert(io.open(path,'rb'));local x=f:read('*all');f:close();return x end
local image='/mnt/onboard/.adds/hearthglance/images/family.png';local good=bytes(image)
local http=require('socket.http');local request=http.request
http.request=function(req)req.sink('not a PNG');return 1,200 end
assert(not instance:refresh(true));assert(bytes(image)==good)
local requests,last_url=0,nil
http.request=function(req)requests=requests+1;last_url=req.url;return request(req)end
assert(instance:loadView({page='chores'},nil,true),'Live offline snapshot download failed')
state.hearthglance_sleep_enabled=false;assert(not instance:refresh(false));state.hearthglance_sleep_enabled=nil
connected=false;assert(not instance:refresh(true));state.hearthglance_sleep_enabled=true;ss:setup()
assert(last_sleep_type=='random_image' and state.screensaver_type=='cover' and state.screensaver_dir==nil)
device.is_cover_closed=true;ss:setup()
assert(last_sleep_type=='cover','Closing cover must bypass even an explicitly enabled agenda sleep image')
device.is_cover_closed=false;state.hearthglance_sleep_enabled=false
connected=true
instance:showWall();assert(instance.wall and shared.pause_auto_suspend==true and not light)
local before_nav,deadline=requests,instance._wall_refresh_at
connected=false;wifi_on=false
local Cache=original_dofile('plugins/hearthglance.koplugin/cache.lua')
for _,page in ipairs{'home','calendar','chores','lists','meals','recipes'}do
 instance:wallAction({type='view',page=page,offset=0,group=0})
 assert(instance.view.page==page,'Every tab must open offline')
end
for _,bundle in pairs(instance._offline.views)do
 for _,hit in ipairs(bundle.hits)do
  if hit.action.type=='view' then
   assert(Cache.view(instance._offline,hit.action),'Every pagination/filter/recipe target must exist locally')
  end
 end
end
for id in pairs(instance._offline.recipes)do
 for _,section in ipairs{'ingredients','instructions','notes'}do
  assert(instance:loadView({page='recipes',recipe=id,section=section}),'Recipe sections must open offline')
 end
end
assert(requests==before_nav and not wifi_on and instance._wall_refresh_at==deadline,'Browsing must not use HTTP/Wi-Fi or postpone scheduled refresh')
connected=true;wifi_on=true
instance:wallAction({type='view',page='recipes',offset=0});assert(instance.view.page=='recipes')
instance._wall_refresh_at=os.time()-61;local count=requests;instance:tick()
assert(requests==count,'Default mode must not refresh after one minute')
instance:setRefreshInterval(true,1);assert(instance:refreshInterval(false)==3600,'Intervals must be independent')
instance._wall_refresh_at=os.time()-61;instance:tick()
assert(requests>count and instance.view.page=='recipes','Configured refresh must retain selected tab')
instance:wallAction({type='refresh'});assert(last_url:find('refresh=1',1,true),'Manual refresh must bypass server cache')
assert(manual_redraws>0,'Manual refresh should also clear ghosting')
instance:wallAction({type='settings'});assert(last_widget.title=='Family dashboard settings')
assert(last_widget.modal==true,'Settings must stack above the modal full-screen dashboard')
last_widget.buttons[2][1].callback();assert(last_widget.value==60)
assert(last_widget.modal==true,'Interval picker must also stack above the dashboard')
last_widget.value=120;last_widget.callback(last_widget)
assert(instance:refreshInterval(false)==7200 and flushes>0,'Battery interval must persist')
instance:setRefreshInterval(true,0);instance._wall_refresh_at=os.time()-7200
count=requests;instance:tick();assert(requests==count,'Manual-only must not refresh automatically')
instance:wallAction({type='refresh'});assert(requests>count,'Manual refresh must work with timer disabled')
instance:setRefreshInterval(true,60)
local before_power=power_calls
uim.event_handlers.PowerRelease()
assert(not instance.wall and power_calls==before_power+1,'Second Power press must delegate to normal sleep')
uim.event_handlers.PowerRelease()
assert(instance.wall and power_calls==before_power+1,'Power from reading must open dashboard on external power')
powered=false;instance:onNotCharging()
assert(instance.wall and shared.pause_auto_suspend==true and not light,'Unplug must keep dashboard open')
assert(last_delay>7000,'Unplug must apply battery interval')
assert(not wifi_on and standby.auto_standby_timeout_seconds==5 and standby.enabled,'Battery profile must turn off pre-existing Wi-Fi and enable five-second standby')
assert(state.auto_standby_timeout_seconds==-1,'Dashboard standby must not change global reading preference')
local before_standby=standby_calls
device.last_standby_time=42
for _,seconds in ipairs{1,3,12,14}do
 device:standby(seconds)
 assert(standby_calls==before_standby and device.last_standby_time==0,'Imminent tasks must skip standby without shifting timers by the previous sleep')
end
device:standby(15);device:standby(59)
assert(standby_calls==before_standby+2 and device.last_standby_time==59,'Safe minute-clock standby must still use native wake alarms')
instance:wallAction({type='view',page='home',offset=0})
assert(instance.view.page=='home' and not wifi_on,'Tab changes must remain offline')
powered=true;instance:onCharging()
assert(wifi_on and standby.auto_standby_timeout_seconds==-1 and not standby.enabled,'Plugging in must restore prior standby and Wi-Fi state')
assert(device.standby==stock_standby,'Charging must restore native standby')
powered=false;instance:onNotCharging()
before_power=power_calls
device:onPowerEvent('Power');assert(power_calls==before_power+1,'Second battery Power must allow normal suspend')
assert(not instance.wall and shared.pause_auto_suspend==nil,'Real sleep must close dashboard before stock power handling')
instance:onSuspend();assert(not instance.wall and shared.pause_auto_suspend==nil and light,'Exit must restore light and suspend')
assert(not wifi_on and standby.auto_standby_timeout_seconds==-1,'Suspend must restore standby without reconnecting Wi-Fi')
instance:showWall();assert(instance.wall and not light,'Manual battery opening must work')
G_reader_settings:saveSetting('hearthglance_battery_saver',false);instance:updateBatteryMode()
assert(standby.auto_standby_timeout_seconds==-1,'Battery saver must be switchable off')
assert(device.standby==stock_standby,'Disabling battery saver must remove the wake guard')
G_reader_settings:saveSetting('hearthglance_battery_saver',true);instance:updateBatteryMode()
instance:wallAction({type='read'});assert(not instance.wall and light)
assert(standby.auto_standby_timeout_seconds==-1,'Return to reading must restore standby')
assert(device.standby==stock_standby,'Reading and normal sleep must keep native standby')
-- Returning to reading restores Wi-Fi only when it was on at entry.
connected=true;wifi_on=true;instance:showWall();assert(not wifi_on)
instance:wallAction({type='read'});assert(wifi_on,'Return to reading must restore prior Wi-Fi')
-- A failed connection must also release Wi-Fi and leave hourly scheduling intact.
connected=false;wifi_on=false;can_connect=false
local callbacks={}
local uim=package.loaded['ui/uimanager'];local schedule=uim.scheduleIn
uim.scheduleIn=function(_,delay,callback)if delay==15 then callbacks[#callbacks+1]=callback end;last_delay=delay end
instance:showWall();instance:wallAction({type='refresh'});assert(instance._network_pending)
callbacks[1]();assert(not instance._network_pending and not wifi_on,'Failed request must not leave Wi-Fi on')
instance:closeWall();uim.scheduleIn=schedule;can_connect=true
light=false;instance:showWall();instance:closeWall();assert(not light,'Initially off light must stay off')
-- Cover close must bypass the powered-dashboard shortcut, stop all work before
-- native sleep, and leave the normal cover image even with legacy opt-in set.
powered=true;connected=true;wifi_on=true;instance:showWall()
local before_cover,power_before=requests,power_calls
state.hearthglance_sleep_enabled=true;device.is_cover_closed=true
device:onPowerEvent('Suspend')
assert(not instance.wall and power_calls==power_before+1 and shared.pause_auto_suspend==nil,'Cover-close must always delegate to native sleep, including plugged in')
assert(tasks[instance._refresh_tick]==nil,'Dashboard refresh task must stop before native sleep')
ss:setup();assert(last_sleep_type=='cover','Case-close must show normal lock screen')
instance:showWall();instance:tick();instance:wallAction({type='refresh'})
assert(not instance.wall and requests==before_cover and tasks[instance._refresh_tick]==nil,'Closed cover must prevent dashboard entry, requests, and timer restart')
device.is_cover_closed=false;device.screen_saver_mode=true;instance:showWall();instance:tick()
assert(not instance.wall and requests==before_cover,'Sleep must never reopen or refresh dashboard')
device.screen_saver_mode=false;state.hearthglance_sleep_enabled=false;powered=false
-- Manual Power launch is independent of plugged-in automatic launch.
state.hearthglance_wall_enabled=false;before_power=power_calls
uim.event_handlers.PowerRelease()
assert(instance.wall and power_calls==before_power,'Short battery Power must open dashboard even when automatic launch is disabled')
uim.event_handlers.PowerRelease()
assert(not instance.wall and power_calls==before_power+1,'Next short battery Power must sleep')
device.screen_saver_mode=true;uim.event_handlers.PowerRelease()
assert(not instance.wall and power_calls==before_power+2,'Power from sleep must retain native wake behavior')
device.screen_saver_mode=false;uim._entered_poweroff_stage=true;uim.event_handlers.PowerRelease()
assert(not instance.wall and power_calls==before_power+2,'Long-press shutdown must not launch dashboard')
uim._entered_poweroff_stage=false
uim.event_handlers.Suspend()
assert(not instance.wall and power_calls==before_power+3,'Automatic suspend must never launch dashboard')
state.hearthglance_wall_enabled=nil
-- Reader and file-manager plugins can coexist. A second press must not open
-- the hidden instance's dashboard while trying to sleep the visible one.
local nested=new();before_power=power_calls
uim.event_handlers.PowerRelease();assert(nested.wall and not instance.wall)
uim.event_handlers.PowerRelease()
assert(not nested.wall and not instance.wall and power_calls==before_power+1,'Second press must sleep, not launch a hidden dashboard')
device:onPowerEvent('Power');assert(nested.wall and not instance.wall)
device:onPowerEvent('Power')
assert(not nested.wall and not instance.wall and power_calls==before_power+2,'Direct Power must also preserve sleep across stacked hooks')
nested:onCloseWidget()
instance:onCloseWidget()
assert(uim.event_handlers.PowerRelease==stock_release,'Closing plugin must restore native Power handler')
-- Recover matched image/hits after interrupted write, then briefly connect on battery.
connected=false;wifi_on=false
local wall_image='/mnt/onboard/.adds/hearthglance/wall.png'
local f=assert(io.open(wall_image,'wb'));f:write('interrupted image write');f:close()
local recovered=new();recovered:showWall()
assert(recovered.wall and bytes(wall_image)==recovered._wall_png,'Cache must recover PNG and hits together')
assert(not connected and network_stops>0,'Plugin-owned Wi-Fi must turn back off on battery')
recovered:onCloseWidget();dofile=original_dofile;http.request=request
assert(state.hearthglance_refresh_battery_minutes==120,'Profile migration must not reset later user interval choices')
print('PASS: short Power opens dashboard on battery/AC with auto-launch disabled, second press sleeps, native wake/long-press/cover/automatic sleep preserved; offline navigation and battery lifecycle')
