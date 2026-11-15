//@input Component.ScriptComponent duet
//@input Component.Text statusText

// Attach only when testing microphone permission and ASR in the native Lens.
var asr;
var listening = false;
var generation = 0;

function status(message) {
    if (script.statusText) script.statusText.text = message;
}

function stop() {
    if (!listening) return;
    generation++;
    listening = false;
    try { Promise.resolve(asr.stopTranscribing()).catch(function () {}); } catch (error) { /* Already stopped. */ }
    status("Voice off");
}

function start() {
    if (listening || !script.duet) return;
    var run = ++generation;
    try {
        asr = asr || require("LensStudio:AsrModule");
        var options = AsrModule.AsrTranscriptionOptions.create();
        options.silenceUntilTerminationMs = 850;
        options.mode = AsrModule.AsrMode.HighAccuracy;
        options.onTranscriptionUpdateEvent.add(function (event) {
            if (!listening || run !== generation || !event.isFinal || !event.text) return;
            var text = event.text.trim();
            if (/^(?:hey[, ]+)?(?:delphi[, ]+)?(?:stop listening|turn voice off)[.!]?$/i.test(text)) {
                stop();
                return;
            }
            // Ignore background conversation and pass deliberately phrased commands.
            if (/^(?:hey|delphi|play|record|start recording|stop(?: playing| alternating| recording| delphi)?|end (?:the |this )?take|alternate|echo|harmonize)\b/i.test(text)) {
                script.duet.api.cue(text);
            }
        });
        options.onTranscriptionErrorEvent.add(function () {
            if (run !== generation) return;
            stop();
            status("Voice unavailable");
        });
        listening = true;
        asr.startTranscribing(options);
        status("Delphi is listening");
    } catch (error) {
        listening = false;
        status("Voice unavailable");
    }
}

script.api.startListening = start;
script.api.stopListening = stop;
script.api.toggleListening = function () { if (listening) stop(); else start(); };
script.createEvent("OnDisableEvent").bind(stop);
script.createEvent("OnDestroyEvent").bind(stop);
