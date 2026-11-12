-- Native header behavior without networking or a physical screen refresh.
require('setupkoenv')
local Clock=dofile('plugins/hearthglance.koplugin/clock.lua')
local suffixes={[1]='1st',[2]='2nd',[3]='3rd',[4]='4th',[11]='11th',[12]='12th',[13]='13th',[21]='21st',[22]='22nd',[23]='23rd',[29]='29th',[31]='31st'}
for day,label in pairs(suffixes)do assert(Clock.ordinal(day)==label)end
local now=os.time{year=2026,month=10,day=29,hour=11,min=5,sec=22}
assert(Clock.format(now)=='11:05 AM Thursday October 29th 2026')
assert(Clock.time(now)=='11:05 AM' and Clock.date(now)=='Thursday October 29th 2026')
assert(Clock.format(os.time{year=2026,month=10,day=29,hour=0,min=0,sec=0}):match('^12:00 AM'))
assert(Clock.format(os.time{year=2026,month=10,day=29,hour=12,min=0,sec=0}):match('^12:00 PM'))
assert(Clock.nextMinute(now)==38)
local time_original=os.time;os.time=function()return now end
local battery=88
local screen={getWidth=function()return 1072 end,getHeight=function()return 1448 end,
 scaleBySize=function(_,size)return size*1.5 end}
package.loaded.device={screen=screen,getPowerDevice=function()return {getCapacity=function()return battery end}end}
local Input={};function Input:extend(x)return x end;function Input:paintTo()end
package.loaded['ui/widget/container/inputcontainer']=Input
local images=0
package.loaded['ui/widget/imagewidget']={new=function()images=images+1;return {free=function()end}end}
local scrolls=0
package.loaded['ui/widget/scrolltextwidget']={new=function(_,x)
 scrolls=scrolls+1;x.dimen={};x.free=function()end
 x.scrollToRatio=function(self,ratio)self.scroll_callback(ratio)end
 x.paintTo=function()end
 return x
end}
package.loaded['ui/geometry']={new=function(_,x)return x end}
package.loaded['ui/gesturerange']={new=function(_,x)return x end}
package.loaded['ui/font']={getFace=function(_,name,size)return {size=screen:scaleBySize(size)}end}
package.loaded['ffi/blitbuffer']={COLOR_WHITE='white',COLOR_BLACK='black'}
package.loaded['ui/widget/textwidget']={new=function(_,x)
 x.free=function()end
 x.getSize=function(self)return {w=#self.text*self.face.size*.5,h=self.face.size}end
 x.paintTo=function(self,bb,tx,ty)
  assert(tx>=0 and ty>=0 and tx+self:getSize().w<=1072,'Text exceeds screen width')
  bb.texts[#bb.texts+1]=self.text
 end
 return x
end}
local tasks,dirty={},{}
package.loaded['ui/uimanager']={scheduleIn=function(_,delay,task)tasks[task]=delay end,
 unschedule=function(_,task)tasks[task]=nil end,
 setDirty=function(_,widget,mode,region)dirty[#dirty+1]={mode=mode,region=region}end}
-- Any attempted clock network activity must fail this test.
package.loaded['socket.http']={request=function()error('Local UI must not use HTTP')end}
local Wall=dofile('plugins/hearthglance.koplugin/wall.lua')
local w=setmetatable({file='unused',ges_events={},bundle={view={page='home'},hits={}}},{__index=Wall})
w:init();w:onShow()
assert(w._clock_label=='11:05 AM Thursday October 29th 2026' and w._battery_label=='Battery 88%')
assert(tasks[w._local_tick]==38)
local bb={texts={},paintRect=function(_,x,y,width,height)assert(x>=0 and y>=0 and x+width<=1072 and y+height<=1448)end}
w:paintTo(bb,0,0);assert(#bb.texts==4)
dirty={};w:setNextRefresh(now+3600)
assert(w._footer_label:find('Next refresh at 12:05 PM',1,true),'Footer must show device-local next refresh time')
assert(#dirty==1 and dirty[1].region.y==1392,'Schedule changes must repaint only the footer')
w:setNextRefresh(nil);assert(w._footer_label:find('Manual refresh',1,true))
assert(w._clock_widget.face.size==200 and w._date_widget.face.size==50,'Clock must have two large rows')
now=now+38;dirty={};w._local_tick()
assert(w._clock_label=='11:06 AM Thursday October 29th 2026')
assert(images==1,'Minute tick must not reload a page image')
assert(#dirty==1 and dirty[1].region.y==198 and dirty[1].mode=='ui','Clock redraw must stay in its header region')
battery=87;now=now+60;w._local_tick();assert(w._battery_label=='Battery 87%')
w.bundle.view.page='chores';dirty={};now=now+60;w._local_tick()
assert(#dirty==0,'Non-home page headings must not be overwritten by clock ticks')
local spec={key='recipe:one:ingredients',rect={64,475,944,680},text=string.rep('Long ingredients\n',100),font_pixels=30}
w:setBundle({view={page='recipes'},hits={},scroll=spec},false)
assert(w[2].scroll_by_pan==true and w[2].height==680 and w[2].text==spec.text)
assert(scrolls==1 and images==1,'Scrollable text must not require a tall page image')
w[2]:scrollToRatio(.55,false)
w:setBundle({view={page='recipes'},hits={},scroll=spec},false)
assert(scrolls==1,'Unchanged data must preserve the native scroller')
local other={key='recipe:one:instructions',rect={64,475,944,680},text='Directions',font_pixels=30}
w:setBundle({view={page='recipes'},hits={},scroll=other},false)
w:setBundle({view={page='recipes'},hits={},scroll=spec},false)
assert(w._scroll_positions[spec.key]==.55,'Returning to a recipe section must restore its scrollbar position')
w:onCloseWidget();assert(tasks[w._local_tick]==nil,'Clock timer must stop on exit')
os.time=time_original
print('PASS: two-row large clock, ordinals, offline minute tick/battery, bounded header painting, native scrolling/pan, restored section position, no image reload or HTTP, timer cleanup')
