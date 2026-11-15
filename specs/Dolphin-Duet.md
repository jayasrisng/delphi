# Dolphin duet integration for Spectacles 2024

Target Lens Studio **5.15.4** and validate on the glasses. The browser Studio and Lens own their respective tracking, visuals, audio scheduling, and recording. Share the musical decisions through the HTTPS endpoint and keep the same offline rules on both clients.

## Start with a single duet

1. Bring the dolphin in and present the same four interactive stars the player can grab.
2. Let the player produce the first phrase. Collect only player notes, including pitch, instrument zone, gain, and elapsed milliseconds since the previous player note.
3. Offer the dolphin eligible stars. Exclude held stars and prefer another star over the player's last star. Give the dolphin a visible swim target just beside that star, aim its nose at the star, and pulse the star when the scheduled note sounds. Recheck eligibility if the player grabs the star during the approach.
4. Schedule locally on the next playable beat with sufficient lead time for the animation. Echo the player's motif on the target instrument, harmonize a short phrase, play a drum accent, or rest. Never count the dolphin's own notes as player events.

## HTTPS contract

POST `/api/accompany` on the web app's configured HTTPS origin. Use the Lens InternetModule in 5.15.4 and check the real device's internet permission and endpoint reachability. Localhost on a laptop is for web development.

Example request:

```json
{
  "version": 1,
  "beatMs": 470,
  "looping": false,
  "previous": "beat",
  "events": [
    {"id": 0, "step": 5, "zone": 0, "ms": 0, "gain": 0.45},
    {"id": 0, "step": 8, "zone": 0, "ms": 470, "gain": 0.53}
  ],
  "stars": [
    {"id": 1, "step": 6, "zone": 1},
    {"id": 2, "step": 7, "zone": 2},
    {"id": 3, "step": 8, "zone": 3}
  ]
}
```

Example response: `{"action":"echo","star":2}`. A rest response is `{"action":"rest"}`. Valid actions are `echo`, `harmonize`, `beat`, and `rest`. Star IDs are stable integers 0–3 and zone indexes correspond to lyre, drum, flute, harp. Pitch is a pentatonic scale index 0–14 using semitone offsets [0,2,4,7,9] per octave. `ms` is an inter-note interval. `previous` is optional. Candidate pitches describe each star's current state. A reply can use any candidate, including a star the player has never touched.

The browser's [shared duet rules](../web/src/duet.js) are plain JavaScript with no browser or Three.js dependencies. Port these small functions into the 5.15.4 Lens's script module for candidate selection, offline choice, and note expansion. `replyNotes` returns a target ID, zone, pitch step, gain, and beat offset per note. Translate beat offsets into local audio scheduling. Tune physical swimming distances and the animation to the Lens scene itself.

Send at most one pending request per session. Use a short deadline, fall back to `chooseReply` on timeouts and non-2xx responses, and discard stale responses when the session resets. Use only the candidate IDs still allowed at playback. Keep provider credentials on the web server. Configure `AI_API_KEY` and `AI_MODEL` there to enable model-directed decisions. The endpoint and Studio can both supply playable local decisions without credentials.

## Device acceptance

Play two or three notes on lyre and pause with that star held. Confirm the dolphin approaches a different star, the star lights up with its audible reply, and you can keep playing during the reply. Grab the dolphin's chosen star during a subsequent approach and confirm it yields. Repeat without networking, then record a short duet and check the exported clip for both voices.

## Direct player cues

The web Studio recognizes “play the drums,” “echo me” or “play that back,” and “harmonize.” The VR controller grip requests a drum reply. Direct cues take precedence over the next automatic reply and use the same local scheduler. On Specs, the first implementation can use a visible drum control and the same local rules. Add spoken cues only after the target device and Lens Studio version are verified.
