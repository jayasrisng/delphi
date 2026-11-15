//@input SceneObject cluster
//@input SceneObject[] stars
//@input Component.AudioComponent[] notes
//@input Asset.ObjectPrefab placeBurst
//@input Asset.ObjectPrefab notePulse
//@input Asset.ObjectPrefab heldTrail
//@input SceneObject dolphin
//@input float grabRadiusCm = 4.5
//@input float touchRadiusCm = 2.8

// Lens Studio 5.15.x base template, Spectacles Interaction Kit 0.15.0.
var SIK = require("SpectaclesInteractionKit.lspkg/SIK").SIK;
var socketPositions = [[-18, 8, 1], [-9, -9, 5], [0, 13, 0], [9, -5, 6], [18, 6, -1]];
var stars = [];
var hands = [];
var dolphinTransform;
var dolphinHome;
var dolphinAge = 0;
var dolphinAccent = 0;
var firstGrab = true;

function scaled(vector, factor) {
    return new vec3(vector.x * factor, vector.y * factor, vector.z * factor);
}

function distanceSquared(a, b) {
    var x = a.x - b.x;
    var y = a.y - b.y;
    var z = a.z - b.z;
    return x * x + y * y + z * z;
}

function makeEffect(prefab) {
    var object = prefab.instantiate(script.getSceneObject());
    var transform = object.getTransform();
    object.enabled = false;
    return {object: object, transform: transform, size: transform.getLocalScale(), age: -1};
}

function showEffect(effect, position, size) {
    effect.transform.setWorldPosition(position);
    effect.transform.setLocalScale(scaled(effect.size, size));
    effect.age = 0;
    effect.object.enabled = true;
}

function updateEffect(effect, dt, duration, startSize, endSize) {
    if (effect.age < 0) {
        return;
    }
    effect.age += dt;
    var progress = effect.age / duration;
    if (progress >= 1) {
        effect.object.enabled = false;
        effect.age = -1;
        return;
    }
    var easeOut = 1 - (1 - progress) * (1 - progress);
    effect.transform.setLocalScale(scaled(effect.size, startSize + (endSize - startSize) * easeOut));
}

function playStar(star) {
    if (star.audio.isPlaying()) {
        star.audio.stop(false);
    }
    star.audio.play(1);
    showEffect(star.pulse, star.transform.getWorldPosition(), 0.55);
    dolphinAccent = 0.72;
}

function holdStar(hand, star, pinchPosition) {
    var position = star.transform.getWorldPosition();
    hand.offset = new vec3(position.x - pinchPosition.x, position.y - pinchPosition.y,
        position.z - pinchPosition.z);
    star.object.setParentPreserveWorldTransform(script.getSceneObject());
    star.size = scaled(star.transform.getLocalScale(), 1 / star.scale);
    hand.held = star;
    hand.hover = null;
    star.state = "held";
    showEffect(hand.trail, position, 0.55);
    if (firstGrab) {
        firstGrab = false;
        dolphinAccent = 0.60;
    }
}

function releaseStar(hand, tip) {
    var star = hand.held;
    hand.held = null;
    hand.trail.object.enabled = false;
    star.state = "placed";
    hand.contact[star.index] = !!tip &&
        distanceSquared(tip, star.transform.getWorldPosition()) <=
            Math.pow(script.touchRadiusCm + 1.1, 2);
    showEffect(star.burst, star.transform.getWorldPosition(), 0.47);
    dolphinAccent = 0.9;
}

function updateHand(hand, dt) {
    hand.hover = null;
    var input = hand.input;
    var indexTip = input.isTracked() && input.indexTip;
    var thumbTip = indexTip && input.thumbTip;
    var tip = indexTip && indexTip.position;
    var thumb = thumbTip && thumbTip.position;
    if (!tip || !thumb) {
        // Freeze a held star at its last tracked position. Require an open hand
        // after reacquisition before accepting another pinch.
        if (hand.held) {
            hand.held.state = "placed";
            hand.held = null;
        }
        hand.trail.object.enabled = false;
        hand.armed = false;
        hand.contactInitialized = false;
        return;
    }

    var pinching = input.isPinching();
    var pinchStarted = pinching && hand.armed;
    hand.armed = !pinching;
    var pinch = new vec3((tip.x + thumb.x) * 0.5, (tip.y + thumb.y) * 0.5,
        (tip.z + thumb.z) * 0.5);
    if (hand.held && pinching) {
        var target = new vec3(pinch.x + hand.offset.x, pinch.y + hand.offset.y,
            pinch.z + hand.offset.z);
        hand.held.transform.setWorldPosition(target);
        var trail = hand.trail.transform.getWorldPosition();
        var follow = 1 - Math.exp(-15 * dt);
        hand.trail.transform.setWorldPosition(new vec3(
            trail.x + (target.x - trail.x) * follow,
            trail.y + (target.y - trail.y) * follow,
            trail.z + (target.z - trail.z) * follow));
        return;
    }

    var justPlaced = !!hand.held;
    if (justPlaced) {
        releaseStar(hand, tip);
    }
    var bestGrab = Math.pow(script.grabRadiusCm, 2);
    var bestTouch = Math.pow(script.touchRadiusCm, 2);
    var exitDistance = Math.pow(script.touchRadiusCm + 1.1, 2);
    var touched = null;
    stars.forEach(function (star) {
        var world = star.transform.getWorldPosition();
        if (star.state === "socket") {
            var grabDistance = distanceSquared(pinch, world);
            if (grabDistance <= bestGrab) {
                bestGrab = grabDistance;
                hand.hover = star;
            }
        }
        if (star.state !== "placed") {
            hand.contact[star.index] = false;
            return;
        }

        var touchDistance = distanceSquared(tip, world);
        if (touchDistance > exitDistance) {
            hand.contact[star.index] = false;
        } else if (!hand.contact[star.index] &&
            touchDistance <= Math.pow(script.touchRadiusCm, 2)) {
            hand.contact[star.index] = true;
            if (hand.contactInitialized && !pinching && !justPlaced && touchDistance <= bestTouch) {
                bestTouch = touchDistance;
                touched = star;
            }
        }
    });
    hand.contactInitialized = true;
    if (pinchStarted && hand.hover) {
        holdStar(hand, hand.hover, pinch);
    } else if (touched && !touched.playedThisFrame) {
        touched.playedThisFrame = true;
        playStar(touched);
    }
}

function onUpdate() {
    var dt = Math.min(getDeltaTime(), 0.05);
    stars.forEach(function (star) {
        star.playedThisFrame = false;
    });
    hands.forEach(function (hand) {
        updateHand(hand, dt);
    });
    stars.forEach(function (star) {
        var hovered = hands.some(function (hand) { return hand.hover === star; });
        var desired = hovered && star.state === "socket" ? 1.34 : 1;
        star.scale += (desired - star.scale) * (1 - Math.exp(-15 * dt));
        star.transform.setLocalScale(scaled(star.size, star.scale));
        updateEffect(star.burst, dt, 0.39, 0.47, 2);
        updateEffect(star.pulse, dt, 0.28, 0.55, 1.46);
    });

    if (dolphinTransform) {
        dolphinAge += dt;
        var accentProgress = Math.max(0, 1 - dolphinAccent);
        var lift = dolphinAccent > 0 ? Math.sin(accentProgress * Math.PI) *
            Math.sin(dolphinAccent * Math.PI * 1.3) * 4.4 : 0;
        dolphinTransform.setLocalPosition(new vec3(
            dolphinHome.x + Math.sin(dolphinAge * 1.25) * 2,
            dolphinHome.y + Math.sin(dolphinAge * 2) * 1.15 + lift,
            dolphinHome.z));
    }
    dolphinAccent = Math.max(0, dolphinAccent - dt);
}

script.createEvent("OnStartEvent").bind(function () {
    if (!script.cluster || !script.placeBurst || !script.notePulse || !script.heldTrail ||
        !script.stars || !script.notes || script.stars.length !== socketPositions.length ||
        script.notes.length !== socketPositions.length ||
        script.stars.some(function (star) { return !star; }) ||
        script.notes.some(function (note) { return !note; })) {
        print("Delphi: assign the cluster, five star roots and Audio components, and three effect prefabs.");
        return;
    }
    socketPositions.forEach(function (socket, index) {
        var object = script.stars[index];
        object.setParent(script.cluster);
        var transform = object.getTransform();
        transform.setLocalPosition(new vec3(socket[0], socket[1], socket[2]));
        stars.push({
            index: index,
            object: object,
            transform: transform,
            size: transform.getLocalScale(),
            scale: 1,
            audio: script.notes[index],
            state: "socket",
            burst: makeEffect(script.placeBurst),
            pulse: makeEffect(script.notePulse)
        });
    });
    ["left", "right"].forEach(function (side) {
        hands.push({
            input: SIK.HandInputData.getHand(side),
            contact: [],
            armed: false,
            contactInitialized: false,
            trail: makeEffect(script.heldTrail)
        });
    });
    if (script.dolphin) {
        dolphinTransform = script.dolphin.getTransform();
        dolphinHome = dolphinTransform.getLocalPosition();
    }
    script.createEvent("UpdateEvent").bind(onUpdate);
});
