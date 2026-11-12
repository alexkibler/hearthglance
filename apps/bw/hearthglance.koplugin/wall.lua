local InputContainer = require("ui/widget/container/inputcontainer")
local ImageWidget = require("ui/widget/imagewidget")
local Geom = require("ui/geometry")
local GestureRange = require("ui/gesturerange")
local UIManager = require("ui/uimanager")
local Device = require("device")
local Screen = Device.screen
local Font = require("ui/font")
local TextWidget = require("ui/widget/textwidget")
local ScrollTextWidget = require("ui/widget/scrolltextwidget")
local Blitbuffer = require("ffi/blitbuffer")
local Clock=dofile("/mnt/onboard/.adds/koreader/plugins/hearthglance.koplugin/clock.lua")

local Wall = InputContainer:extend {
    name = "FamilyWallDashboard",
    modal = true,
    covers_fullscreen = true,
}

function Wall:loadImage()
    return ImageWidget:new {
        file = self.file,
        file_do_cache = false, -- The filename stays the same after atomic replacement.
        width = Screen:getWidth(), height = Screen:getHeight(),
        scale_factor = 0,
        original_in_nightmode = false, -- Follow KOReader's inversion, like native text.
    }
end

function Wall:init()
    self[1] = self:loadImage()
    self.refreshes = 0
    self._local_tick=function()
        if self._closed then return end
        self:updateLocal(true)
        self:scheduleLocalTick()
    end
    self:updateLocal(false)
    self._scroll_positions={}
    self:updateScroll()
    self.ges_events.Tap = {
        GestureRange:new { ges="tap", range=Geom:new {
            x=0, y=0, w=Screen:getWidth(), h=Screen:getHeight(),
        } },
    }
end

function Wall:viewport()
    local scale=math.min(Screen:getWidth()/1072,Screen:getHeight()/1448)
    return scale,(Screen:getWidth()-1072*scale)/2,(Screen:getHeight()-1448*scale)/2
end

function Wall:localRegion(x,y,w,h)
    local scale,ox,oy=self:viewport()
    return Geom:new {x=math.floor(ox+x*scale),y=math.floor(oy+y*scale),
        w=math.ceil(w*scale),h=math.ceil(h*scale)}
end

function Wall:localText(text,pixels,width,bold)
    local scale=self:viewport()
    return TextWidget:new {
        text=text,face=Font:getFace("cfont",pixels*scale/Screen:scaleBySize(1)),
        padding=0,max_width=math.floor(width*scale),bold=bold or false,
        fgcolor=Blitbuffer.COLOR_BLACK,
    }
end

function Wall:updateLocal(dirty)
    local text=Clock.format(os.time())
    local date=Clock.date(os.time())
    local battery=Clock.battery(Device:getPowerDevice())
    local footer="Updated "..(self.bundle.updated_epoch and Clock.time(self.bundle.updated_epoch) or "—")
        ..(self.next_refresh_at and " · Next refresh at "..Clock.time(self.next_refresh_at) or " · Manual refresh")
    if footer~=self._footer_label then
        if self._footer_widget then self._footer_widget:free() end
        self._footer_label=footer
        self._footer_widget=self:localText(footer,20,730)
        if dirty then UIManager:setDirty(self,"ui",self:localRegion(64,1392,730,40)) end
    end
    local title=self.bundle.recipe_title
    if title~=self._recipe_title then
        if self._title_widget then self._title_widget:free();self._title_widget=nil end
        self._recipe_title=title
        if title then self._title_widget=self:localText(title,34,944,true) end
        if dirty then UIManager:setDirty(self,"ui",self:localRegion(64,302,944,58)) end
    end
    if text~=self._clock_label then
        if self._clock_widget then self._clock_widget:free() end
        self._clock_label=text
        self._clock_widget=self:localText(Clock.time(os.time()),200,944,true)
        if dirty and self.bundle.view.page=="home" then
            UIManager:setDirty(self,"ui",self:localRegion(64,198,944,245))
        end
    end
    if date~=self._date_label then
        if self._date_widget then self._date_widget:free() end
        self._date_label=date
        self._date_widget=self:localText(date,50,944)
        if dirty and self.bundle.view.page=="home" then
            UIManager:setDirty(self,"ui",self:localRegion(64,453,944,73))
        end
    end
    if battery~=self._battery_label then
        if self._battery_widget then self._battery_widget:free() end
        self._battery_label=battery
        self._battery_widget=self:localText(battery,25,318)
        if dirty then UIManager:setDirty(self,"ui",self:localRegion(690,36,318,48)) end
    end
end

function Wall:setNextRefresh(epoch)
    self.next_refresh_at=epoch
    self:updateLocal(true)
end

function Wall:updateScroll()
    local spec=self.bundle.scroll
    if self._scroll_spec and spec and self._scroll_spec.key==spec.key
        and self._scroll_spec.text==spec.text and self._scroll_spec.font_pixels==spec.font_pixels
        and table.concat(self._scroll_spec.rect,",")==table.concat(spec.rect,",") then return false end
    if self[2] then
        self[2]:free()
        self[2]=nil
    end
    self._scroll_spec=spec
    if not spec then return false end
    local scale=self:viewport()
    local region=self:localRegion(unpack(spec.rect))
    local position=self._scroll_positions[spec.key] or 0
    local widget=ScrollTextWidget:new {
        text=spec.text,
        face=Font:getFace("cfont",spec.font_pixels*scale/Screen:scaleBySize(1)),
        fgcolor=Blitbuffer.COLOR_BLACK,
        width=region.w,height=region.h,dialog=self,
        scroll_bar_width=math.max(8,math.floor(10*scale)),text_scroll_span=math.floor(14*scale),
        scroll_by_pan=true,
        scroll_callback=function(low)self._scroll_positions[spec.key]=low end,
    }
    self[2]=widget
    widget.dimen.x=region.x;widget.dimen.y=region.y
    if position>0 then widget:scrollToRatio(position,false) end
    return true
end

function Wall:scheduleLocalTick()
    UIManager:unschedule(self._local_tick)
    UIManager:scheduleIn(Clock.nextMinute(os.time()),self._local_tick)
end

function Wall:paintTo(bb,x,y)
    InputContainer.paintTo(self,bb,x,y)
    -- KOReader inverts the complete framebuffer in night mode. Keep all
    -- widgets in the same normal color space, including TextBoxWidget buffers.
    local background=Blitbuffer.COLOR_WHITE
    local function paint(widget,region,align)
        bb:paintRect(x+region.x,y+region.y,region.w,region.h,background)
        local size=widget:getSize()
        local tx=x+region.x+(align=="right" and region.w-size.w or align=="center" and math.floor((region.w-size.w)/2) or 0)
        local ty=y+region.y+math.floor((region.h-size.h)/2)
        widget:paintTo(bb,tx,ty)
    end
    paint(self._battery_widget,self:localRegion(690,36,318,48),"right")
    paint(self._footer_widget,self:localRegion(64,1392,730,40),"left")
    if self._title_widget then paint(self._title_widget,self:localRegion(64,302,944,58),"left") end
    if self.bundle.view.page=="home" then
        paint(self._clock_widget,self:localRegion(64,198,944,245),"center")
        paint(self._date_widget,self:localRegion(64,453,944,73),"center")
    end
    if self[2] then
        local region=self:localRegion(unpack(self._scroll_spec.rect))
        bb:paintRect(x+region.x,y+region.y,region.w,region.h,background)
        self[2]:paintTo(bb,x+region.x,y+region.y)
    end
end

function Wall:onShow()
    UIManager:setDirty(self, "full")
    self:scheduleLocalTick()
    return true
end

function Wall:setBundle(bundle, changed)
    self.bundle = bundle
    self:updateLocal(true)
    local scroll_changed=self:updateScroll()
    if changed then
        self[1]:free()
        self[1] = self:loadImage()
        self.refreshes = self.refreshes + 1
        UIManager:setDirty(self, self.refreshes % 15 == 0 and "full" or "ui")
    elseif scroll_changed and self._scroll_spec then
        UIManager:setDirty(self,"ui",self:localRegion(unpack(self._scroll_spec.rect)))
    end
end

function Wall:refreshFull()
    self.refreshes=0
    UIManager:setDirty(self,"full")
end

function Wall:onTap(_, gesture)
    local pos = gesture and gesture.pos
    if not pos then return true end
    -- Hit regions are authored in the PNG's native portrait coordinates.
    local scale=math.min(Screen:getWidth()/1072,Screen:getHeight()/1448)
    local x=(pos.x-(Screen:getWidth()-1072*scale)/2)/scale
    local y=(pos.y-(Screen:getHeight()-1448*scale)/2)/scale
    for _,hit in ipairs(self.bundle.hits) do
        local r=hit.rect
        if x>=r[1] and y>=r[2] and x<r[1]+r[3] and y<r[2]+r[4] then
            self.action_callback(hit.action)
            break
        end
    end
    return true
end

function Wall:onCloseWidget()
    self._closed=true
    UIManager:unschedule(self._local_tick)
    if self._clock_widget then self._clock_widget:free() end
    if self._date_widget then self._date_widget:free() end
    if self._battery_widget then self._battery_widget:free() end
    if self._footer_widget then self._footer_widget:free() end
    if self._title_widget then self._title_widget:free() end
    if self[2] then self[2]:free();self[2]=nil end
    self[1]:free()
    UIManager:setDirty(nil, "full")
end

return Wall
