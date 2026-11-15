# Delphi duet for Spectacles 2024

Use this source kit with **Lens Studio 5.15.4** and an existing Spectacles 2024 Lens. It adapts the web Studio's four instruments, voice cues, and dolphin collaborator to the native scene. The scene setup and a real-glasses test are part of the integration. Open the kit on a branch or duplicate of the teammate's Lens. [Snap's 5.15.4 download](https://ar.snap.com/download/v5-15-4)

## What to import

Import the contents of `Assets/` into one folder in the Lens Asset Browser. Keep the `Scripts`, `Audio`, `Models`, and `Textures` folders as siblings so asset references resolve.

| Files | Use |
|---|---|
| `Scripts/DelphiDuet.js` | Attach to a controller object. It drives the sample banks, cue handling, phrase timing, and take state. |
| `Scripts/DuetRules.js`, `Scripts/SatieBank.js` | Import as script modules. The controller loads them. |
| `Scripts/DelphiMotion.js` | Attach to an optional motion controller. It drives the dolphin wrapper toward reply stars and lets it cruise and dive between notes. |
| `Scripts/DelphiVoice.js` | Optional ASR adapter. Attach for voice on/off and final transcripts. Typed or pinch cues can call the same controller without ASR. |
| `Audio/` | 44 MP3s baked from the same four Satie recordings as the web Studio, 11 pitch steps for each instrument. The bank loads them by path. |
| `Models/`, `Textures/` | Animated dolphin, four stars, Delphinus and Leo, stardust effects, transparent starfield, and seal. |

## Wire the existing Lens

1. Use the 5.15.4 Spectacles template and its compatible Spectacles Interaction Kit. Keep tracking, camera, permissions, and scene anchoring in the teammate's Lens. Disable any older controller that still owns these same stars or plays their old notes.
2. Create four pinchable roots in a comfortable reach zone, roughly 0.55–0.75 m in front of the wearer. Assign their visual children and order their **IDs** left to right. Keep each ID stable while it moves. Enable the correct SIK interactable and direct grab setup on the roots, and bind its events during scene start. [Spectacles Interaction Kit](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/overview)
3. Add **two distinct AudioComponents per root**. Assign four to the duet controller's `playerAudio` and four to `dolphinAudio` in root order. Use the same four roots for `DelphiMotion.starRoots`. Disable autoplay. Enable native spatial audio on these emitters if the existing rig has an Audio Listener. The controller selects samples and sets low-latency playback. [Spectacles audio](https://www.developers.snap.com/spectacles/about-spectacles-features/audio)
4. Put the dolphin GLB below an empty motion wrapper. Enable the imported `Swim Cycle` on the model child and orient that child to the wrapper's forward direction in Preview. Assign the wrapper and duet controller to `DelphiMotion`. Adjust the wrapper scale, facing, and nose offset on-device. Assign the note-pulse or trail effects from your scene to the event hooks below.
5. Match the web scene with a cool silver-blue transparent dolphin material, a faint centered seal, sparse sharp stars, and a trail that lingers behind the dolphin. Use the transparent starfield and stardust sprites with gentle alpha or additive blending so the room remains visible. Reserve brighter glows for the four playable stars. The browser's Fresnel shader and particle renderer use Three.js. Recreate their look with the existing Lens material and VFX graph. The Delphinus and Leo models are optional scenery.

## Connect hand interaction and visuals

On pinch start, call `updateStar(id,x,y,true)` and then `playPlayer(id,strength)` once. While held, call `updateStar(id,x,y,true)` as the star moves. On release or tracking loss, call `updateStar(id,lastX,lastY,false)` and leave the world position at its last valid point. Re-arm the grab after seeing an open hand. Preserve contact debouncing so hovering does not fire a note every frame.

Send normalized `x` and `y` in the composition area's fixed local frame, with **x increasing right** and **y increasing down**. Convert your world-space position into that frame first. Lens distance values are in centimeters. Height chooses a pentatonic step, and horizontal position chooses the sound:

| Normalized x | Instrument |
|---|---|
| 0–0.25 | Moon Harp |
| 0.25–0.50 | Soft Gong |
| 0.50–0.75 | Bellaton, the Satie Glass Bells recording |
| 0.75–1 | Water Glass |

The controller adds a small boundary hysteresis to avoid rapid switching. Keep an instrument name above each star. Update it through `onInstrument({star,name,zone,step})`. Also use `onPlayerNote` and `onDolphinNote({star,zone,step})` to pulse the star at the audible note. A spoken instrument may play through a different free star if its usual zone is occupied. In that case, briefly show the sound from the `onDolphinNote` event.

The supplied duet controller lets Delphi take a free star and answer on the player's recent pulse. Your Lens owns constellation connections. To match Studio, show a dotted preview only when release would create a link, then animate a traveling light on played edges. Keep this in the existing scene script so links can use the actual world positions.

### Script API

Call methods through the assigned ScriptComponent, for example `duet.api.cue("Play Moon Harp every two seconds")`. Callback slots can be assigned in your scene glue. If you use `DelphiMotion`, preserve its registered `onApproach` and `onDolphinNote` handlers when adding your own.

| Method or callback | Purpose |
|---|---|
| `updateStar(id,x,y,held)`, `playPlayer(id,strength)` | Drive the player voice through SIK geometry and grabbed state. |
| `cue(text)`, `stopDolphin()` | Pass a resolved cue or stop the current accompaniment. |
| `onApproach({star,at})`, `onApproach(null)` | Tell the dolphin where to swim. `at` is the Lens clock in seconds. |
| `onInstrument`, `onPlayerNote`, `onDolphinNote`, `onStatus` | Drive names, note pulses, and short prompts. |
| `beginTake()`, `finishTake()`, `onTakeState({active,seconds})` | Start or finish the 30-second Lens performance state. |
| `onCaptureRequested({seconds})` | Bridge a recording cue to a native capture implementation if your Lens already has a verified one. |

## Hands-free cues and the model

Wire a small **Cue Delphi** toggle to `DelphiVoice.api.toggleListening()`. Start only after the wearer chooses voice. ASR forwards finalized transcripts during the session. Wire your Home or exit action to `stopListening()`. Keep pinch controls for record, stop, and playing an instrument when ASR is unavailable. Snap lists ASR support from Lens Studio 5.9 and Spectacles OS 5.61, and its 2024 release notes flag voice problems in some Lenses. Test the English commands on your actual device. [Snap ASR module](https://www.developers.snap.com/spectacles/about-spectacles-features/apis/asr-module) · [Spectacles release notes](https://support.spectacles.com/hc/en-us/articles/30245157205652-Update-Release-Notes)

- **“Play Water Glass.”** Delphi answers with the specified sample family.
- **“Play Moon Harp every two seconds.”** Delphi keeps that pulse while you play.
- **“Play Soft Gong for one second, then Moon Harp.”** Delphi alternates until stopped.
- **“Play something at intervals.”** Adds a repeating harmony drawn from the recent notes.
- **“Play softly.”** Lowers Delphi's accompaniment level.
- **“Hey, start recording”** or **“stop recording.”** Controls the in-Lens take state and calls the capture hook on start.
- **“Stop listening.”** Turns off ASR. **“Stop Delphi”** and **“stop playing”** stop the current accompaniment. A pinch button can call `stopDolphin()`.

Local musical rules work without a model provider. To share the web model decisions, pass a function to `setPlanner` that posts its payload to `https://delphi.jayasrisng.com/api/accompany` and returns the parsed result. Keep provider keys on the server. Only recent note events and candidate stars go to that endpoint. ASR handles its own microphone permissions and pipeline. The Lens's native controller schedules playback on its local clock and uses the local choice if the result arrives after the decision window. See [shared web API notes](https://github.com/jayasrisng/spatial-sonic/blob/main/specs/Dolphin-Duet.md) and [Snap Internet access](https://www.developers.snap.com/spectacles/about-spectacles-features/apis/internet-access).

## Capture and share on the website

The supplied script starts a **30-second in-Lens take**. For native video, use the left temple capture button unless your Lens already has a working, version-tested recording bridge. A spoken cue can start the take timer and display “Press capture.” It does not automatically start the system camera in this kit. After capturing, import the clip through the Spectacles app and use [Upload](https://delphi.jayasrisng.com/upload). The website extracts a separate audio file from the clip. Verify on hardware what the native capture includes, including the instrument mix and any wearer mic audio. [Snap capture and share](https://support.spectacles.com/hc/en-us/articles/27749950007316-Capture-and-Share)

## Acceptance on glasses

- Start the Lens and play an unconnected star within 15 seconds. Cross all four zones, raise and lower a held star, and confirm each label follows the sound.
- Play a phrase and pause. Delphi approaches a free star and answers. Grab that star before the reply and confirm it yields. Disable networking and repeat.
- Cue Moon Harp at two-second intervals. Add notes with the other hand, then stop the pattern. Repeat using the pinch controls if ASR is unavailable.
- Record a 30-second clip with both musicians, import it through the mobile app, and upload it. Verify that the gallery video and extracted audio play on a second device.
- Check the starfield, dolphin, and labels against a bright background on the glasses. Check both hands and tracking loss during a grab.

This is a source and asset handoff. The music scheduler and cue paths were checked through simulated Lens APIs. Lens Studio import, on-device microphone capture, visuals, and native recording require teammate verification. `Satie-Sources.json` and `Sky-catalogue-LICENSE.txt` record the audio and starfield provenance.
