local WidgetContainer = require("ui/widget/container/widgetcontainer")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local Screensaver = require("ui/screensaver")
local NetworkMgr = require("ui/network/manager")
local util = require("util")
local logger = require("logger")
local lfs = require("libs/libkoreader-lfs")
local Device = require("device")
local PluginShare = require("pluginshare")

local DIR = "/mnt/onboard/.adds/hearthglance"
local IMAGE = DIR .. "/images/family.png"
local config = dofile(DIR .. "/config.lua")
local PLUGIN = "/mnt/onboard/.adds/koreader/plugins/hearthglance.koplugin"
local Client = dofile(PLUGIN .. "/client.lua")
local Cache = dofile(PLUGIN .. "/cache.lua")
local json = require("json")
local WALL_IMAGE = DIR .. "/wall.png"
local BASE_URL = config.url:gsub("/family%.png$", "")
local Family = WidgetContainer:extend { name = "hearthglance", is_doc_only = false }

function Family:refresh(force)
    if Device.is_cover_closed or Device.screen_saver_mode then return false end
    if not force and not G_reader_settings:isTrue("hearthglance_sleep_enabled") then return false end
    if not NetworkMgr:isConnected() then return false end
    local stat = lfs.attributes(IMAGE)
    if not force then
        local interval=self:refreshInterval(self:isPowered())
        if interval==0 then return false end
        if stat and os.time()-stat.modification<interval then
            self._last_fetch=stat.modification
            return true
        end
    end
    local png = Client.request(config.url, config.token)
    if not Client.validPNG(png) then
        logger.warn("[Family] Image update failed; retaining last successful image")
        return false
    end
    self._last_fetch = os.time()
    local old = io.open(IMAGE, "rb")
    if old then
        local same = old:read("*all") == png
        old:close()
        if same then return true, false end
    end
    local file = io.open(IMAGE .. ".tmp", "wb")
    if not file then return false end
    local written = file:write(png)
    file:close()
    if not written then os.remove(IMAGE .. ".tmp"); return false end
    local renamed = os.rename(IMAGE .. ".tmp", IMAGE) ~= nil
    return renamed, renamed
end

function Family:readOfflineCache()
    if self._offline then return end
    local f=io.open(DIR.."/offline.json","rb")
    if f then self._offline=Cache.parse(f:read('*all'));f:close() end
    if self._offline then self._wall_refresh_at=self._offline.downloaded_at or 0 end
end

function Family:loadView(view, completion, fresh)
    view = view or { page="home", offset=0, group=0 }
    self:readOfflineCache()
    if fresh or completion then
        if not NetworkMgr:isConnected() then return false end
        if fresh then self._wall_refresh_at=os.time() end
        if completion then completion.offline=true end
        local body=Client.request(BASE_URL..(completion and '/complete' or '/offline?refresh=1'),
            config.token,completion,{timeout=60,max_bytes=12*1024*1024})
        local pack=Cache.parse(body)
        if not pack then return false end
        pack.downloaded_at=completion and self._wall_refresh_at or os.time()
        if not Cache.write(DIR..'/offline.json',json.encode(pack)) then return false end
        self._offline=pack
    end
    local bundle,png=Cache.view(self._offline,view)
    if not bundle and (fresh or completion) then bundle,png=Cache.view(self._offline,{page=view.page}) end
    if not bundle then return false end
    local changed=png~=self._wall_png
    if changed then
        local f=io.open(WALL_IMAGE..".tmp","wb")
        if not f then return false end
        local written=f:write(png);f:close()
        if not written or not os.rename(WALL_IMAGE..".tmp",WALL_IMAGE) then return false end
    end
    self._wall_png=png
    self.view=bundle.view
    self._wall_bundle=bundle
    Cache.write(DIR..'/wall.json',json.encode(bundle))
    if self.wall then self.wall:setBundle(bundle,changed) end
    return true
end

function Family:wallAction(action)
    if self._busy or Device.is_cover_closed or Device.screen_saver_mode then return end
    if action.type=="read" then self:closeWall();return end
    if action.type=="settings" then self:showSettings();return end
    if action.type=="view" then
        if not self:loadView(action) then
            UIManager:show(InfoMessage:new {modal=true,text="This view is not in the saved snapshot. Use Refresh to download it.",timeout=3})
        end
        return
    end
    if action.type=="refresh" then
        self:runWallRequest(function()
            local ok=self:loadView(self.view,nil,true)
            if not ok then self:showNetworkError(false)
            elseif self.wall then self.wall:refreshFull() end
        end,true,true)
        return
    end
    self:runWallRequest(function() self:performWallAction(action) end,true)
end

function Family:showNetworkError(completion)
    UIManager:show(InfoMessage:new { modal=true,text=completion
        and "Could not confirm completion. Reconnect and refresh before trying again."
        or "Could not refresh this page. The cached page is unchanged.", timeout=3 })
end

function Family:performWallAction(action)
    self._busy=true
    local ok
    if action.type=="complete" then
        ok=self:loadView(self.view,{entity=action.entity,uid=action.uid})
    elseif action.type=="view" then ok=self:loadView(action) end
    self._busy=false
    if not ok then
        self:showNetworkError(action.type=="complete")
    end
end

function Family:runWallRequest(callback, manual, refreshing)
    if not self.wall or self._network_pending then return end
    if refreshing then self._wall_refresh_at=os.time() end
    local wall=self.wall
    local function complete()
        if self.wall~=wall then return end
        self._network_pending=nil
        callback()
        self:releaseWallWifi()
        self:scheduleTick()
    end
    if NetworkMgr:isConnected() then complete();return end
    self._network_pending=true
    if not NetworkMgr:isWifiOn() then self._enabled_wifi=true end
    NetworkMgr:enableWifi(complete,false)
    UIManager:scheduleIn(15,function()
        if self.wall==wall and self._network_pending then
            self._network_pending=nil
            self:releaseWallWifi()
            self:scheduleTick()
            if manual then self:showNetworkError(false) end
        end
    end)
end

function Family:batterySaverActive()
    return self.wall and not self:isPowered()
        and G_reader_settings:nilOrTrue("hearthglance_battery_saver")
end

function Family:releaseWallWifi()
    if self:batterySaverActive() then
        self._battery_wifi_managed=true
        if NetworkMgr:isWifiOn() then NetworkMgr:disableWifi() end
        self._enabled_wifi=nil
    elseif not self:isPowered() and self._enabled_wifi and not self._wifi_was_on then
        NetworkMgr:disableWifi();self._enabled_wifi=nil
    end
end

function Family:updateBatteryMode(restore_wifi)
    local active=self:batterySaverActive()
    local standby=self.ui.autosuspend
    if active and standby and Device:canStandby() then
        if not self._previous_standby then
            self._previous_standby={plugin=standby,seconds=standby.auto_standby_timeout_seconds}
            -- Entering MTK standby can itself take several seconds. An alarm
            -- that fires during entry may leave us asleep until the next tap.
            -- AutoSuspend still adjusts its task queue after a skipped request,
            -- so clear the previous sleep duration as well.
            self._standby_hook=util.wrapMethod(Device,"standby",function(device,seconds)
                if seconds and seconds<15 then
                    device.last_standby_time=0
                    logger.info("[Family] Staying awake for imminent task in",seconds,"seconds")
                    return
                end
                return self._standby_hook:raw_call(device,seconds)
            end)
            standby:_unschedule_standby()
            standby.auto_standby_timeout_seconds=5
            standby:toggleStandbyHandler(true)
            standby:_start_standby()
            logger.info("[Family] Battery saver: 5-second standby; minute clock retained")
        end
    elseif self._previous_standby then
        local previous=self._previous_standby
        self._previous_standby=nil
        self._standby_hook:revert()
        self._standby_hook=nil
        previous.plugin:_unschedule_standby()
        previous.plugin.auto_standby_timeout_seconds=previous.seconds
        previous.plugin:toggleStandbyHandler(previous.plugin:_enabledStandby())
        previous.plugin:_start_standby()
    end
    if active then
        if not self._network_pending then self:releaseWallWifi() end
    elseif self._battery_wifi_managed then
        self._battery_wifi_managed=nil
        if restore_wifi~=false and self._wifi_was_on and not NetworkMgr:isWifiOn() then
            NetworkMgr:enableWifi(nil,false)
        end
    end
end

function Family:refreshInterval(powered)
    local key=powered and "hearthglance_refresh_plugged_minutes" or "hearthglance_refresh_battery_minutes"
    return math.max(0,math.min(1440,tonumber(G_reader_settings:readSetting(key)) or 60))*60
end

function Family:setRefreshInterval(powered, minutes)
    local key=powered and "hearthglance_refresh_plugged_minutes" or "hearthglance_refresh_battery_minutes"
    G_reader_settings:saveSetting(key,math.max(0,math.min(1440,math.floor(minutes))))
    G_reader_settings:flush()
    self._wall_refresh_at=os.time()
    self:scheduleTick()
end

function Family:editRefreshInterval(powered)
    local SpinWidget=require("ui/widget/spinwidget")
    local spinner=SpinWidget:new {
        modal=true,
        title_text=(powered and "Plugged-in" or "Battery").." refresh minutes (0 = manual only)",
        value=self:refreshInterval(powered)/60,
        value_min=0,value_max=1440,value_step=1,value_hold_step=60,
        default_value=60,ok_text="Save",
        callback=function(widget)
            self._settings_dialog=nil
            self:setRefreshInterval(powered,widget.value)
            UIManager:nextTick(function() self:showSettings() end)
        end,
    }
    self._settings_dialog=spinner
    UIManager:show(spinner)
end

function Family:showSettings()
    local ButtonDialog=require("ui/widget/buttondialog")
    if self._settings_dialog then UIManager:close(self._settings_dialog) end
    local function label(powered)
        local minutes=self:refreshInterval(powered)/60
        return minutes==0 and "Manual only" or minutes.." min"
    end
    local dialog
    local function close()
        UIManager:close(dialog)
        if self._settings_dialog==dialog then self._settings_dialog=nil end
    end
    local function toggle(key)
        close();G_reader_settings:flipNilOrTrue(key);G_reader_settings:flush()
        self:updateBatteryMode();self:showSettings()
    end
    dialog=ButtonDialog:new {
        modal=true,
        title="Family dashboard settings",
        buttons={
            {{text="Plugged-in refresh: "..label(true),callback=function()close();self:editRefreshInterval(true)end}},
            {{text="Battery refresh: "..label(false),callback=function()close();self:editRefreshInterval(false)end}},
            {{text=(G_reader_settings:nilOrTrue("hearthglance_battery_saver") and "✓ " or "○ ").."Battery saver: standby + Wi-Fi only for updates",
                callback=function()toggle("hearthglance_battery_saver")end}},
            {{text=(G_reader_settings:nilOrTrue("hearthglance_frontlight_off") and "✓ " or "○ ").."Frontlight off when dashboard opens",
                callback=function()toggle("hearthglance_frontlight_off")end}},
            {{text=(self:wallEnabled() and "✓ " or "○ ").."Open automatically while plugged in",
                callback=function()toggle("hearthglance_wall_enabled")end}},
            {{text="Done",callback=close}},
        },
    }
    self._settings_dialog=dialog
    UIManager:show(dialog)
    logger.info("[Family] Settings dialog opened above dashboard")
end

function Family:scheduleTick()
    UIManager:unschedule(self._refresh_tick)
    local delay=15
    if self.wall then
        local interval=self:refreshInterval(self:isPowered())
        delay=interval==0 and 86400 or math.max(1,interval-(os.time()-self._wall_refresh_at))
    end
    if self.wall then
        local interval=self:refreshInterval(self:isPowered())
        self.wall:setNextRefresh(interval>0 and self._wall_refresh_at+interval or nil)
    end
    UIManager:scheduleIn(delay,self._refresh_tick)
end

function Family:isPowered()
    -- Includes a full battery while the charging cable remains connected.
    return Device:getPowerDevice():isCharging()
end

function Family:wallEnabled()
    return G_reader_settings:nilOrTrue("hearthglance_wall_enabled")
end

function Family:openFromPower()
    if PluginShare.hearthglance_wall or Device.screen_saver_mode or Device.screen_saver_lock
        or Device.is_cover_closed or UIManager._entered_poweroff_stage then return false end
    UIManager:unschedule(UIManager.poweroff_action)
    self:showWall()
    return self.wall~=nil
end

function Family:showWall()
    if PluginShare.hearthglance_wall or Device.screen_saver_mode or Device.is_cover_closed then return end
    if not self:loadView(self.view) and not (NetworkMgr:isConnected() and not self._offline and self:loadView(self.view,nil,true)) then
        local cached=io.open(DIR.."/wall.json","rb")
        if cached then
            local bundle,png=Client.bundle(cached:read("*all"));cached:close()
            -- Recover image and hit targets from the same cached bundle, even if
            -- power was lost between the previous PNG and JSON replacements.
            if bundle then
                local f=io.open(WALL_IMAGE..".tmp","wb")
                if f then
                    local written=f:write(png);f:close()
                    if written and os.rename(WALL_IMAGE..".tmp",WALL_IMAGE) then
                        self._wall_bundle=bundle;self._wall_png=png;self.view=bundle.view
                    end
                end
            end
        end
    end
    if not self._wall_bundle then
        UIManager:show(InfoMessage:new { text="Connect Wi-Fi, then open Family dashboard again.", timeout=3 })
        return
    end
    local Wall = dofile(PLUGIN .. "/wall.lua")
    self._previous_pause = PluginShare.pause_auto_suspend
    PluginShare.pause_auto_suspend = true
    self.wall = Wall:new {
        file = WALL_IMAGE,
        bundle = self._wall_bundle,
        action_callback = function(action) self:wallAction(action) end,
    }
    PluginShare.hearthglance_wall=self
    local power=Device:getPowerDevice()
    self._frontlight_was_on=power:isFrontlightOn()
    if G_reader_settings:nilOrTrue("hearthglance_frontlight_off") then
        power:turnOffFrontlight()
    end
    self._wall_refresh_at = self._wall_refresh_at or 0
    self._wifi_was_on = NetworkMgr:isWifiOn()
    UIManager:show(self.wall)
    self:scheduleTick()
    if not self._offline then
        self:runWallRequest(function() self:loadView(self.view,nil,true) end,false,true)
    end
    self:updateBatteryMode()
    logger.info("[Family] Dashboard opened")
end

function Family:closeWall(suspending)
    if not self.wall then return end
    if self._settings_dialog then UIManager:close(self._settings_dialog);self._settings_dialog=nil end
    local wall = self.wall
    self.wall = nil
    if PluginShare.hearthglance_wall==self then PluginShare.hearthglance_wall=nil end
    UIManager:close(wall)
    self:updateBatteryMode(not suspending)
    PluginShare.pause_auto_suspend = self._previous_pause
    if self._frontlight_was_on then Device:getPowerDevice():turnOnFrontlight() end
    self._last_input = os.time()
    if self._enabled_wifi and not self._wifi_was_on then NetworkMgr:disableWifi() end
    self._enabled_wifi = nil
    self._network_pending=nil
    self:scheduleTick()
    logger.info("[Family] Wall dashboard closed; normal reading/sleep restored")
end

function Family:tick()
    if Device.screen_saver_mode or Device.is_cover_closed then
        self:onSuspend()
        return
    end
    local now = os.time()
    local powered = self:isPowered()
    if self.wall then
        local interval=self:refreshInterval(powered)
        if interval>0 and now-self._wall_refresh_at>=interval then
            self:runWallRequest(function()
                self:loadView(self.view,nil,true)
                self:refresh(false)
            end,false,true)
        end
    elseif powered and self:wallEnabled() and now - self._last_input >= 120
        and not Device.screen_saver_mode and not Device.is_cover_closed then
        self:showWall()
    elseif G_reader_settings:isTrue("hearthglance_sleep_enabled")
        and self:refreshInterval(powered)>0
        and now - (self._last_fetch or 0) >= self:refreshInterval(powered) then
        self:refresh(false)
    end
    self:scheduleTick()
end

function Family:init()
    -- Restore the normal lock screen after the original sleep-image prototype.
    if not G_reader_settings:readSetting("hearthglance_normal_sleep_v1") then
        G_reader_settings:saveSetting("hearthglance_sleep_enabled",false)
        G_reader_settings:saveSetting("hearthglance_normal_sleep_v1",true)
        G_reader_settings:flush()
    end
    -- Apply the agreed battery profile once; subsequent interval choices persist.
    if not G_reader_settings:readSetting("hearthglance_battery_profile_v1") then
        G_reader_settings:saveSetting("hearthglance_refresh_battery_minutes",60)
        G_reader_settings:saveSetting("hearthglance_battery_profile_v1",true)
        G_reader_settings:flush()
    end
    self.ui.menu:registerToMainMenu(self)
    self._last_input = os.time()
    self._refresh_tick = function() self:tick() end
    UIManager:scheduleIn(2, self._refresh_tick)
    -- Kobo sends both a short Power press and cover-close through Suspend.
    -- Intercept the actual button release so only a deliberate short press
    -- opens the dashboard. Cover and automatic Suspend stay native sleep.
    if UIManager.event_handlers and UIManager.event_handlers.PowerRelease then
        self._power_release_hook=util.wrapMethod(UIManager.event_handlers,"PowerRelease",function(...)
            if self:openFromPower() then return end
            return self._power_release_hook:raw_call(...)
        end)
    end
    self._power_hook = util.wrapMethod(Device, "onPowerEvent", function(device, event)
        if event=="Power" and not device.screen_saver_mode then
            if self:openFromPower() then return end
            event="Suspend" -- Do not let a hidden reader/file-manager instance launch instead.
        end
        if event=="Power" or event=="Suspend" then
            -- Tear down before Screensaver:setup/show, not after it is painted.
            -- Cover-close and automatic Suspend never use the button shortcut.
            self:onSuspend()
            if device.is_cover_closed then
                logger.info("[Family] Cover closed: dashboard timers stopped; normal lock screen requested")
            end
        end
        return self._power_hook:raw_call(device, event)
    end)
    self._setup_hook = util.wrapMethod(Screensaver, "setup", function(ss, event, message)
        if event or Device.is_cover_closed or not G_reader_settings:isTrue("hearthglance_sleep_enabled") then
            return self._setup_hook:raw_call(ss, event, message)
        end
        self:refresh(false) -- Only uses an already-connected network; never turns Wi-Fi on.
        if not lfs.attributes(IMAGE) then return self._setup_hook:raw_call(ss, event, message) end
        -- Override only this sleep-screen setup; preserve the user's regular preferences.
        local overrides = {
            screensaver_type = "random_image", screensaver_dir = DIR .. "/images",
            screensaver_show_message = false, screensaver_img_background = "white",
            screensaver_stretch_images = false, screensaver_rotate_auto_for_best_fit = false,
        }
        local previous = {}
        for key, value in pairs(overrides) do
            previous[key] = { value = G_reader_settings:readSetting(key) }
            G_reader_settings:saveSetting(key, value)
        end
        local ok, result = pcall(self._setup_hook.raw_call, self._setup_hook, ss, event, message)
        for key, old in pairs(previous) do
            if old.value == nil then G_reader_settings:delSetting(key)
            else G_reader_settings:saveSetting(key, old.value) end
        end
        if not ok then error(result) end
        return result
    end)
end

function Family:onNetworkConnected()
    UIManager:scheduleIn(1, function()
        if not self.wall and not Device.screen_saver_mode and not Device.is_cover_closed then self:refresh(false) end
    end)
end

function Family:onInputEvent()
    self._last_input = os.time()
end

function Family:onCharging()
    self._last_input = os.time()
    if self.wall then self:updateBatteryMode();self:scheduleTick() end
end

function Family:onNotCharging()
    if self.wall then
        self:updateBatteryMode()
        self:scheduleTick()
    end
end

function Family:onResume()
    self._last_input = os.time()
    UIManager:unschedule(self._refresh_tick)
    UIManager:scheduleIn(3, self._refresh_tick)
end

function Family:onSuspend()
    self:closeWall(true)
    UIManager:unschedule(self._refresh_tick)
end

function Family:onCloseWidget()
    self:closeWall(true)
    UIManager:unschedule(self._refresh_tick)
    if self._setup_hook then self._setup_hook:revert() end
    if self._power_hook then self._power_hook:revert() end
    if self._power_release_hook then self._power_release_hook:revert() end
end

function Family:addToMainMenu(items)
    items.hearthglance_sleep = {
        text = "Family dashboard",
        sorting_hint = "more_tools",
        sub_item_table = {
            {
                text = "Open dashboard now",
                callback = function() UIManager:nextTick(function() self:showWall() end) end,
            },
            {
                text = "Dashboard settings",
                callback = function() UIManager:nextTick(function() self:showSettings() end) end,
            },
            {
                text = "Use agenda and weather for uncovered sleep",
                checked_func = function() return G_reader_settings:isTrue("hearthglance_sleep_enabled") end,
                callback = function()
                    G_reader_settings:saveSetting("hearthglance_sleep_enabled",not G_reader_settings:isTrue("hearthglance_sleep_enabled"))
                    G_reader_settings:flush()
                end,
            },
            {
                text = "Refresh Family image now",
                callback = function()
                    local ok = self:refresh(true)
                    UIManager:show(InfoMessage:new { text = ok and "Family image updated. Put the Kobo to sleep to view it."
                        or "No update available. The last saved Family image is still available offline." })
                end,
            },
        },
    }
end

return Family
