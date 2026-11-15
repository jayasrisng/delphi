# DELPHI voice duet for Spectacles (2024)

Target Lens Studio 5.15.4. Bring these three scripts into the existing Lens. Keep the same dolphin, stars, and audio already in your scene.

1. Add `DelphiDuet.js` and `DelphiVoice.js` to separate Script Components. Assign the duet Script Component to the voice component's **Duet** input. Assign optional **Status Text** to show “Delphi is listening.”
2. Call `duet.api.updateStar(id, x, y, held)` as stars move. IDs are 0–3. Coordinates are normalized within the Lens's play area, with x growing right and y growing down. Call `duet.api.playerPlayed(id, strength)` after each real player note. Leave your existing pinch and playback code in place.
3. Attach your playback to `duet.api.onDolphinNote = function (note) { … }`. Play the instrument indexed by `note.zone`, even if Delphi reaches another free star. Zones 0–3 are Moon Harp, Soft Gong, Bellaton, Water Glass. The payload also supplies `star`, pentatonic `step` (0–10 after clamping in your playback engine), `gain` (0–1) and optional `duration` in seconds. Use a separate audio voice from the player's. Stop those voices on `duet.api.onStop`. Use `onApproach({star, at})` to drive the existing dolphin animation, where `at` is a Lens `getTime()` timestamp. A null event clears the target.
4. Hook `duet.api.onStatus` to the same prompt area for clarifications. Wire a mic toggle to `voice.api.toggleListening()` and a pinch command to `duet.api.cue("Play Water Glass")` for microphone fallback.

Speech starts on Lens open, subject to Spectacles microphone permissions and ASR availability. The wearer can say “stop listening” or use the mic toggle. Disabling or destroying the Lens stops ASR. The adapter acts on final transcripts.

Try “Hey Delphi, play Water Glass,” “Play Moon Harp every two seconds,” “Play Soft Gong for one second, then Moon Harp,” and “Stop Delphi.” Play any star, then say “play that” to cue its instrument. Delphi can also answer short phrases without a spoken command. The rules run locally with no model credentials.

Test startup, speech recognition, the named instrument, and stopping/restarting the mic on the actual glasses. ASR integration targets the native module available from Lens Studio 5.9 with Snap OS 5.61 or later. [Snap ASR documentation](https://developers.snap.com/spectacles/about-spectacles-features/apis/asr-module)
