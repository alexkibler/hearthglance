-- Device-local display text. No server, network, snapshot, or HA dependencies.
local Clock={}
local weekdays={"Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"}
local months={"January","February","March","April","May","June","July","August","September","October","November","December"}

function Clock.ordinal(day)
    local last_two=day%100
    if last_two>=11 and last_two<=13 then return day.."th" end
    return day..(({[1]="st",[2]="nd",[3]="rd"})[day%10] or "th")
end

function Clock.time(timestamp)
    local t=os.date("*t",timestamp)
    local hour=t.hour%12
    if hour==0 then hour=12 end
    return string.format("%d:%02d %s",hour,t.min,t.hour<12 and "AM" or "PM")
end

function Clock.date(timestamp)
    local t=os.date("*t",timestamp)
    return string.format("%s %s %s %d",weekdays[t.wday],months[t.month],Clock.ordinal(t.day),t.year)
end

function Clock.format(timestamp)
    return Clock.time(timestamp).." "..Clock.date(timestamp)
end

function Clock.battery(power)
    local value=tonumber(power:getCapacity())
    return value and string.format("Battery %d%%",math.max(0,math.min(100,math.floor(value+.5)))) or "Battery —"
end

function Clock.nextMinute(timestamp)
    return 60-timestamp%60
end

return Clock
