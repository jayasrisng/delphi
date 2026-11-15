# DELPHI stardust integration

Use these transparent PNGs in the existing DELPHI Specs Lens Studio project. Target Lens Studio 5.15.4. Keep the existing project, dolphin rig, music and hand interaction. Ask the project owner before upgrading Lens Studio or changing package versions.

## Import and connect the textures

Copy the Images files into the existing project through the Asset Browser in Lens Studio 5.15.4. Find the existing scripts or Inspector events for hand proximity, pickup, movement while held, release, note playback, and dolphin reactions. Prefer the project's existing world-space effect materials, emitters, or billboards. Duplicate a material if changing a shared texture would affect other visuals. For a new material, choose the editor's stock Unlit material with the PNG as its texture and transparency enabled. Try additive blending for the smaller highlights. Check brightness against a real background before increasing opacity.

| Texture | Connect to | Initial treatment |
| --- | --- | --- |
| Dust_Mote.png | Idle star cluster or ambient particle emitter | Slow movement, varied size, sparse white and pale blue particles |
| Star_Flare.png | Existing star visual, hover cue, or note hit | Center it on the playable star. Briefly increase brightness or scale when hover starts. Keep the existing interaction target. |
| Patronus_Wisp.png | Dolphin wake or trailing a held star | The thicker part sits near the subject. Rotate or mirror it to follow motion. Layer it with motes for depth. |
| Stardust_Burst.png | Successful placement | Show once at the star's world position. Expand and fade over about 0.35 seconds. |
| Note_Ripple.png | Actual note playback | Show once at the note's world position. Expand and fade over about 0.25 seconds. |

The wisp, burst, and ripple are still images. Move, scale, and fade them through the project's existing effect logic or a simple timeline in 5.15.4. Use existing scene bindings for production integration. A texture swap should preserve pickup, placement, note timing, and dolphin animation.

## Verify in the host project

- Open in Lens Studio 5.15.4. Check texture alpha, material blending, scale, and placement in Preview.
- In the Specs test, pinch a star, move it, release it, then touch it to play a note. Confirm the wake follows the held star, the burst fires once on placement, and the ripple follows note playback.
- Check the dolphin wake against light and dark backgrounds. If larger sprites wash out the dolphin or hide playable stars, reduce their size or opacity first.
