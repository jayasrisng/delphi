//@input Component.ScriptComponent duet
//@input SceneObject dolphinRoot
//@input SceneObject[] starRoots
//@input float noseOffsetCm = 12.0

// Keep the asset's Swim Cycle on a child of dolphinRoot. Face the child forward
// relative to the wrapper so the imported model can keep its own animation.
var position, home, velocity, transform, target;
var latchUntil = 0;
var began = 0;
var up = new vec3(0,1,0);

function tick() {
    var time = getTime() - began;
    var dt = Math.min(0.05,getDeltaTime());
    var orbit = time*0.58;
    var phase = (time+1.1)%9.4;
    var arch = phase < 2.55 ? Math.pow(Math.sin(phase*Math.PI/2.55),2) : 0;
    var aim = new vec3(home.x+Math.sin(orbit)*18,
        home.y+Math.sin(orbit*1.7)*3+arch*12,home.z+Math.cos(orbit)*7-arch*4);

    var visiting = target && (latchUntil === 0 || getTime() < latchUntil);
    if (visiting) {
        var point = target.getTransform().getWorldPosition();
        var side = Math.sign(home.x-point.x) || 1;
        aim = new vec3(point.x+side*script.noseOffsetCm,point.y+2,point.z-4);
    }

    var dx=aim.x-position.x, dy=aim.y-position.y, dz=aim.z-position.z;
    var blend = 1-Math.exp(-(visiting ? 5.4 : 3.7)*dt);
    velocity.x += (dx*3.4-velocity.x)*blend;
    velocity.y += (dy*3.4-velocity.y)*blend;
    velocity.z += (dz*3.4-velocity.z)*blend;
    position = new vec3(position.x+velocity.x*dt,position.y+velocity.y*dt,position.z+velocity.z*dt);
    transform.setWorldPosition(position);

    var forward = visiting && dx*dx+dy*dy+dz*dz < 36
        ? new vec3(point.x-position.x,point.y-position.y,point.z-position.z)
        : new vec3(velocity.x,velocity.y,velocity.z);
    var horizontal = Math.hypot(forward.x,forward.z);
    if (horizontal > 0.2) {
        forward.y = Math.max(-horizontal*0.7,Math.min(horizontal*0.7,forward.y));
        var unit = forward.normalize();
        var bank = Math.max(-0.28,Math.min(0.28,dx*0.012));
        var desired = quat.angleAxis(bank,unit).multiply(quat.lookAt(unit,up));
        transform.setWorldRotation(quat.slerp(transform.getWorldRotation(),desired,1-Math.exp(-4.2*dt)));
    }
}

script.createEvent("OnStartEvent").bind(function () {
    if (!script.duet || !script.dolphinRoot || !script.starRoots || script.starRoots.length !== 4) {
        print("Delphi: assign the duet, dolphin wrapper, and the four star roots.");
        return;
    }
    transform = script.dolphinRoot.getTransform();
    home = transform.getWorldPosition();
    position = home;
    velocity = new vec3(0,0,0);
    began = getTime();
    var api = script.duet.api;
    var priorApproach = api.onApproach;
    var priorNote = api.onDolphinNote;
    api.onApproach = function (event) {
        if (event) {
            target = script.starRoots[event.star];
            latchUntil = 0;
        } else if (getTime() >= latchUntil) target = null;
        if (priorApproach) priorApproach(event);
    };
    api.onDolphinNote = function (event) {
        target = script.starRoots[event.star];
        latchUntil = getTime()+0.35;
        if (priorNote) priorNote(event);
    };
    script.createEvent("UpdateEvent").bind(tick);
});
