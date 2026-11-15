// Host Lens owns star movement and audio. This script only decides what Delphi plays.
var music = require("./DuetRules");
var stars = [];
var notes = [];
var queued = [];
var nextAnswer = Infinity;
var lastPlayed = 0;
var previous;
var pattern;
var gain = 1;
var planner;
var revision = 0;
var pendingPlan;
var ready = false;

function notify(name, payload) {
    if (typeof script.api[name] === "function") script.api[name](payload);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function beatSeconds() {
    var gaps = notes.slice(1).map(function (note) { return note.ms; })
        .filter(function (ms) { return ms >= 170 && ms <= 1250; })
        .sort(function (a, b) { return a - b; });
    return gaps.length ? clamp(gaps[Math.floor(gaps.length / 2)] / 1000, 0.26, 0.95) : 0.47;
}

function heldIds() {
    return stars.filter(function (star) { return star.held; })
        .map(function (star) { return star.id; });
}

function targetFor(zone) {
    var occupied = heldIds();
    var open = stars.filter(function (star) { return !star.held; });
    if (zone == null) return music.availableStars(stars, occupied, notes)[0];
    return open.find(function (star) { return star.zone === zone; })
        || open.find(function (star) { return star.id === zone; }) || open[0];
}

function stopDolphin() {
    revision++;
    pendingPlan = null;
    pattern = null;
    queued = [];
    notify("onStop");
    nextAnswer = Infinity;
    notify("onApproach", null);
}

function queueNote(star, note, due) {
    queued.push({ star:star, note:note, due:due });
    if (queued.length === 1) notify("onApproach", { star:star.id, at:due });
}

function onPlayer(id, strength) {
    var star = stars[id];
    if (!ready || !star) return;
    var now = getTime();
    var amount = typeof strength === "number" && isFinite(strength) ? clamp(strength, 0.15, 0.9) : 0.53;
    star.gain = amount;
    if (notes.length === 12) notes.shift();
    notes.push({ id:id, zone:star.zone, step:star.step, gain:amount,
        ms:lastPlayed ? Math.round((now-lastPlayed)*1000) : 0 });
    lastPlayed = now;
    if (!pattern && nextAnswer === Infinity) nextAnswer = now + 0.28;
    notify("onPlayerNote", { star:id, zone:star.zone, step:star.step });
}

function updateStar(id, x, y, held) {
    var star = stars[id];
    if (!ready || !star || !isFinite(x) || !isFinite(y)) return;
    var zone = music.zoneAt(x, star.zone);
    var step = clamp(Math.round((0.8-y)*14),0,10);
    var changed = zone !== star.zone || step !== star.step;
    star.zone = zone;
    star.step = step;
    star.held = Boolean(held);
    if (changed) notify("onInstrument", { star:id,name:music.voices[zone].name,zone:zone,step:step });
}

function runCue(text) {
    if (!ready || typeof text !== "string") return false;
    var spoken = text.toLowerCase().replace(/[^a-z ]/g, " ").trim().replace(/ +/g, " ")
        .replace(/^(?:hey(?: (?:delphi|delfi|delphy))?|delphi) /, "");
    if (/^stop(?: playing| alternating| delphi)?(?: please)?$/.test(spoken)) { stopDolphin(); return true; }
    if (/water gong/.test(spoken)) { notify("onStatus", "Soft Gong or Water Glass?"); return false; }

    var interval = music.alternatingCue(text) || music.repeatCue(text);
    if (interval) {
        stopDolphin();
        interval.index = 0;
        interval.next = getTime()+0.65;
        pattern = interval;
        return true;
    }

    var that = /^play (?:this|that)(?: one| star)?(?: please)?$/.test(spoken);
    if (that && !notes.length) { notify("onStatus", "Play a star first"); return false; }
    var zone = that ? notes[notes.length-1].zone : music.instrumentCue(text);
    var quiet = /^(?:play softly|play soft songs|play something soft|play a soft melody)$/.test(spoken);
    var action = music.parseCue(text) || music.parseCue(spoken);
    if (zone == null && !quiet && !action) return false;
    stopDolphin();
    if (quiet) gain = 0.55;
    var target = targetFor(zone == null && quiet && !notes.length ? 0 : zone);
    if (!target) return false;
    var phrase = notes.slice(-6);
    if (!phrase.length) phrase.push({ step:target.step,ms:0,gain:0.48 });
    var beat = beatSeconds();
    var response = music.replyNotes({action:action || "echo",star:target.id},phrase,[target],beat*1000);
    var start = getTime()+0.65;
    response.forEach(function (note) {
        queueNote(target,{ zone:zone == null ? note.zone : zone,step:note.step,
            gain:note.gain*gain },start+note.beat*beat);
    });
    return true;
}

function requestAnswer(now) {
    if (pattern || queued.length || pendingPlan || !notes.length || now < nextAnswer || now-lastPlayed > 4.6) return;
    nextAnswer = now+3.2;
    var phrase = notes.slice(-6);
    var beat = beatSeconds();
    var candidates = music.availableStars(stars,heldIds(),phrase).map(function (star) {
        return { id:star.id,zone:star.zone,step:star.step };
    });
    if (!candidates.length) return;
    var anchor = lastPlayed;
    var lead = now+0.65;
    var due = anchor + Math.max(1,Math.ceil((lead-anchor)/beat))*beat;
    var result = { phrase:phrase,candidates:candidates,beat:beat,due:due,decisionAt:now+(planner ? 0.24 : 0),choice:null };
    pendingPlan = result;
    if (planner) {
        var run = revision;
        Promise.resolve().then(function () {
            return planner({ version:1,events:phrase,stars:candidates,beatMs:Math.round(beat*1000),
                looping:false,previous:previous && previous.action });
        }).then(function (choice) {
            if (revision === run && pendingPlan === result && music.validChoice(choice,candidates)) result.choice = choice;
        }).catch(function () { /* Keep the local musical answer. */ });
    }
}

function update() {
    var now = getTime();
    if (pattern && !queued.length && pattern.next <= now+0.66) {
        if (pattern.next < now-0.12) pattern.next = now+0.12;
        var zone = pattern.zones[pattern.index];
        var target = targetFor(zone);
        if (target) {
            var latest = notes[notes.length-1];
            var step = zone == null && latest ? clamp(latest.step+2,0,10) : target.step;
            queueNote(target,{ zone:zone == null ? target.zone : zone,step:step,
                gain:0.38*gain,duration:pattern.duration },pattern.next);
        }
        pattern.index = (pattern.index+1)%pattern.zones.length;
        pattern.next += pattern.interval || pattern.duration;
    }
    requestAnswer(now);
    if (pendingPlan && now >= pendingPlan.decisionAt) {
        var pending = pendingPlan;
        pendingPlan = null;
        var candidates = pending.candidates.filter(function (star) { return !stars[star.id].held; });
        var reply = music.validChoice(pending.choice,candidates) ? pending.choice
            : music.chooseReply(pending.phrase,candidates,pending.beat*1000,previous);
        previous = reply;
        music.replyNotes(reply,pending.phrase,candidates,pending.beat*1000).forEach(function (note) {
            queueNote(stars[note.id],{ zone:note.zone,step:note.step,gain:note.gain*gain },
                pending.due+note.beat*pending.beat);
        });
    }
    if (!queued.length || now < queued[0].due) return;
    var entry = queued.shift();
    if (!entry.star.held) {
        notify("onDolphinNote",{ star:entry.star.id,zone:entry.note.zone,step:entry.note.step,
            gain:entry.note.gain,duration:entry.note.duration });
    }
    notify("onApproach",queued.length ? { star:queued[0].star.id,at:queued[0].due } : null);
}

script.api.updateStar = updateStar;
script.api.playerPlayed = onPlayer;
script.api.cue = runCue;
script.api.stopDolphin = stopDolphin;
script.api.setPlanner = function (callback) { planner = typeof callback === "function" ? callback : null; };
script.createEvent("OnStartEvent").bind(function () {
    [0,1,2,3].forEach(function (id) {
        stars.push({id:id,zone:id,step:5,gain:0.53,held:false,sounding:false});
    });
    ready = true;
    script.createEvent("UpdateEvent").bind(update);
});
