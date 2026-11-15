# Delphi: Play the stars

Delphi is a spatial music playground. We’re building it so someone can make a small piece of music with their hands and feel a partner answer. Move a star to find a note, link stars into a loop, and ask Delphi, a dolphin, to play the drums, echo your phrase, or harmonize while you keep playing.

| Path | What’s here | Status |
| --- | --- | --- |
| [web/](web/) | Three.js Studio with desktop mouse, optional webcam hand tracking, and WebXR VR controller input. The web app also has recording and sharing. | Run locally now. The headset path needs a physical test. |
| [specs/Delphi_Specs_5.15.4/](specs/Delphi_Specs_5.15.4/) | Editable asset pack: a swimming dolphin, five stars, note samples, constellations, effects, and a starter interaction script. | Import into the Specs Base Template with Lens Studio 5.15.4 and SIK 0.15.0. Scene assembly and testing on glasses are pending. |
| [specs/Dolphin-Duet.md](specs/Dolphin-Duet.md) | Musical behavior, web endpoint contract, and device acceptance steps for the native Lens. | The web app implements the duet. The native Lens still needs the duet and command wiring. |

## Run the web Studio

With Node 22.13+ and FFmpeg/FFprobe installed:

```sh
cd web
npm ci
npm run dev -- --port 4177
```

Open [localhost:4177](http://localhost:4177/) and choose **Play with mouse** or **Enable camera & sound**. Grab a star, move it vertically to change pitch, and release near another to start a loop. Choose **Play drums** or type a cue in **Ask Delphi**. In browsers that support on-device English speech recognition, **Speak a cue** lets you say the same phrases. The microphone is used only for that optional cue; recordings capture the generated music.

On a headset browser over HTTPS, **Enter VR** appears when immersive VR is supported. Aim a controller at a star, hold the trigger to move it, and squeeze the grip to ask for drums. The headset browser needs to reach the web host; localhost on your computer is not the headset’s localhost. See the [web setup and deployment notes](web/README.md).

## Interaction specifications

- The Studio has four movable stars and four horizontal instrument zones: lyre, drums, flute, and harp. Height selects one of 15 pentatonic steps. Notes play immediately; loops and dolphin replies use the Web Audio clock.
- Delphi responds to player notes, can play on a free star, and swims toward the star before it pulses. A drum cue uses drum timbre even if the drum-zone star is held. If every star is held, Delphi waits.
- Typed and spoken cues and controller drum cues select the reply locally. Automatic replies can also use an optional server model. If it’s unconfigured or unreachable, the local rules still play. The model receives musical events and candidate stars; camera frames and voice cues stay on the device.
- The Specs starter uses five fixed-pitch stars. Its asset import and device checks are in the [Specs setup guide](specs/Delphi_Specs_5.15.4/README.md); matching the browser duet is a separate native implementation step.

The earlier Unity/XREAL prototype and working design bundles remain local. The shared source is the web app and the Specs pack; installed SDKs, generated builds, and credentials stay out of Git.
