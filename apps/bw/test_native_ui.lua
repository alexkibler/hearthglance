-- Real KOReader text rendering and gesture dispatch into an off-screen buffer.
-- No framebuffer/input-device initialization or changes to reader preferences.
require('setupkoenv')
G_reader_settings=require('luasettings'):open('settings.reader.lua')
G_defaults=require('luadefaults'):open()
local screen={night_mode=false,getWidth=function()return 1072 end,getHeight=function()return 1448 end,
 scaleBySize=function(_,n)return n end,scaleByDPI=function(_,n)return n end,
 getDPI=function()return 300 end,
 isColorEnabled=function()return false end}
local device={screen=screen,input={group={}},isTouchDevice=function()return true end,
 hasKeys=function()return false end,isKindle=function()return false end,
 getPowerDevice=function()return {getCapacity=function()return 80 end}end}
for _,cap in ipairs{'isAndroid','isDesktop','isEmulator','isPocketBook','hasSystemFonts','hasBGRFrameBuffer','hasEinkScreen','canHWDither'}do
 device[cap]=function()return false end
end
package.loaded.device=device
require('document/canvascontext'):init(device)
-- Only PNGs are used here; avoid loading unrelated document viewers/UI.
package.loaded['document/documentregistry']={isImageFile=function(_,path)return path:match('%.png$')~=nil end}
local dirty={}
package.loaded['ui/uimanager']={setDirty=function(_,widget,mode,region)dirty[#dirty+1]={mode,region}end,
 scheduleIn=function()end,unschedule=function()end}
local BB=require('ffi/blitbuffer')
local Geom=require('ui/geometry')
local Event=require('ui/event')
local Wall=dofile('plugins/hearthglance.koplugin/wall.lua')
local text={}
for i=1,100 do text[#text+1]='Line '..i..': Test recipe ingredient and directions.' end
local bundle={view={page='recipes'},recipe_title='Offline recipe title',updated_epoch=os.time(),
 hits={{rect={64,1320,308,70},action={type='read'}}},
 scroll={key='test-recipe',rect={64,475,944,680},font_pixels=30,text=table.concat(text,'\n')}}
local w=Wall:new{file='/mnt/onboard/.adds/hearthglance/wall.png',bundle=bundle,
 action_callback=function()error('Scroll gesture reached page action')end}
local bb=BB.new(1072,1448,BB.TYPE_BB8)
w:setNextRefresh(os.time()+3600)
assert(w._title_widget and w._title_widget.text=='Offline recipe title','Offline recipe title must render locally')
assert(w._footer_label:find('Next refresh at',1,true),'Schedule footer must render locally')
bb:fill(BB.COLOR_WHITE)
w:paintTo(bb,0,0)
assert(w[1].original_in_nightmode==false,'Background image must follow KOReader night mode')
assert(w[2].text_widget.fgcolor==BB.COLOR_BLACK,'Native text must use normal foreground colors')
assert(w[2].v_scroll_bar.enable,'Long text must have an enabled scrollbar')
assert(bb:getPixel(80,480):getColor8().a>240,'Scroll background must be white before screen inversion')
local function dark_pixels()
 local count=0
 for y=480,1100,3 do for x=70,970,3 do
  if bb:getPixel(x,y):getColor8().a<100 then count=count+1 end
 end end
 return count
end
local ink=dark_pixels()
assert(ink>200 and ink<20000,'Rendered scroll area must contain readable ink, not a solid rectangle')
local function gesture(kind,extra)
 local ges={ges=kind,pos=Geom:new{x=500,y=700},direction='north',relative={x=0,y=-180}}
 for k,v in pairs(extra or {})do ges[k]=v end
 return w:handleEvent(Event:new('Gesture',ges))
end
local top=w[2].text_widget.virtual_line_num
assert(gesture('swipe'),'Swipe must be consumed by native scroll widget')
assert(w[2].text_widget.virtual_line_num>top,'Swipe must move down through full text')
local after_swipe=w[2].text_widget.virtual_line_num
assert(gesture('pan') and gesture('pan_release'),'Drag must be handled')
assert(w[2].text_widget.virtual_line_num>after_swipe,'Drag must scroll by lines')
w:paintTo(bb,0,0)
local bar=w[2].v_scroll_bar.touch_dimen
assert(gesture('tap',{pos=Geom:new{x=bar.x+bar.w/2,y=bar.y+bar.h*.8}}),'Scrollbar tap must be handled')
assert(w[2].prev_low>.5,'Scrollbar tap must move near the requested position')
-- In night mode the complete logical framebuffer is inverted by KOReader.
-- ImageWidget must not cancel inversion for its page image; native widgets
-- must retain their ordinary black-on-white buffer in both modes.
screen.night_mode=true
w:paintTo(bb,0,0)
assert(bb:getPixel(80,480):getColor8().a>240,'Night mode must not make native buffer white-on-white')
bb:invert()
assert(bb:getPixel(80,480):getColor8().a<15,'Night display must have a dark background')
assert(bb:getPixel(20,300):getColor8().a<15,'Page image must follow night inversion too')
bb:invert()
if os.getenv('HG_NATIVE_PREVIEW') then bb:writePNG('/tmp/hearthglance-native-day.png');bb:invert();bb:writePNG('/tmp/hearthglance-native-night.png') end
w:onCloseWidget();bb:free()
print('PASS: real native text/scrollbar rendering, swipe and drag dispatch, scrollbar taps, day/night color consistency')
