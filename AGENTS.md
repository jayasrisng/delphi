# DELPHI

The shared project contains the browser Studio in `web/` and the Lens Studio source assets in `specs/`. Keep browser input, rendering, and audio scheduling local; provider calls can choose musical replies without blocking play. Treat desktop, WebXR headset, and native Specs checks as separate. Do not commit WebXR builds, Lens Studio SDKs, private media, or environment values.

## Local Unity prototype

The local Unity 2022.3 prototype is kept for reference and is excluded from new shared commits. Use the built-in render pipeline and keep the default checkout playable in the Editor without proprietary SDKs. Import XREAL 3.1.0 locally for Android. Keep SDK archives, signing material, credentials, build outputs, and absolute package paths out of Git.

## Ownership

- `Assets/Delphi/Input` translates the two XR Hands streams or the Editor mouse into world-space poses. The gameplay layer depends on `HandState`.
- `Assets/Delphi/Core` owns onboarding, star interactions, feedback routing, and JSON/SVG export.
- `Assets/Delphi/Music` owns pitch, graph traversal, DSP scheduling, and audio providers. Interactive preview is immediate. Loop steps use the DSP clock.
- `Assets/Delphi/Art` owns shared shaders, hand links, trails, bursts, and atmosphere. Treat the Android render budget and optical see-through readability as constraints.
- `Assets/Delphi/Integrations` owns the dolphin hook and world-provider boundary. Preserve the guide component and replace its visual child or wire the five inspector events on a replacement prefab.
- `Assets/Delphi/Editor` builds the simulator scene, device scene copy, and placeholder assets. Keep changes to generated scenes separate from work on the original vendor rig.

Use the `Delphi` namespace. Express gameplay distances in meters. Keep network work out of interaction and audio callbacks. Exercise independent systems in isolation and report Editor, simulator, and hardware checks separately.

## Acceptance checks

- Generate the simulator, enter Play Mode, and touch the first star within 15 seconds. Confirm the guide and hand visuals respond before the mode selector.
- Try both modes. Grab a star, move up and down while listening for pentatonic steps, release near a second star, and verify repeatable playback. Check tracking recovery while holding a star.
- Save an edited and connected constellation. Open its JSON and SVG and compare their star and connection counts with the scene.
- Use the validated HelloMR baseline to check the same flow on Air 2 Ultra with a supported Android host. Record both-hand behavior, frame rate, launch-to-first-note time, and readability against real backgrounds.
- Confirm the full demo with no sponsor credentials. Test any live provider separately using locally configured access.
