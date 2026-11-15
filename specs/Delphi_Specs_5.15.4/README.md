# DELPHI Celestial Sound for Specs

This source asset pack targets **Lens Studio 5.15.4** and **Spectacles Interaction Kit 0.15.0**. Import it into the Specs Base Template in 5.15.4. For a project built with a newer Lens Studio, create the 5.15.4 project from its own Base Template and import these same source files. Scene objects, Inspector bindings, and prefabs are recreated in that editor.

- [Snap's 5.15 framework compatibility chart](https://www.developers.snap.com/spectacles/about-spectacles-features/connected-lenses/overview)
- [Specs Base Template walkthrough for Lens Studio 5.15.0 and later](https://developers.snap.com/spectacles/get-started/start-building/build-your-first-spectacles-lens-tutorial)
- [Snap glTF importer guide](https://www.developers.snap.com/lens-studio/4.55.1/references/guides/adding-content/3d/importing-content/gltf-import)
- [SIK hand tracking and keypoint example](https://developers.snap.com/spectacles/spectacles-frameworks/spectacles-interaction-kit/features/handtracking)

## Build the scene in 5.15.4

1. Create a Spectacles Base Template project. Verify Spectacles Interaction Kit 0.15.0 is present and its scene object is enabled. Import the Models, Audio, and Scripts files through the Asset Browser. Import Textures if you plan to add sprite effects.
2. Create an empty scene root named `Celestial Controller`. Keep its scale at 1 and place it in world space, outside the camera hierarchy. Attach `DelphiCelestial.js` to it. Create an empty `Cluster Origin` beneath it. Place the origin at a comfortable arm's reach, initially about 50–60 cm in front of the starting viewer and slightly below eye level. Add `Stardust_Cluster` as its visual child. Assign `Cluster Origin` to **Cluster**.
3. Create five empty star roots with a scale of 1. Give each its matching GLB as a visual child, centered at local origin. Add an Audio component to each star root and assign its corresponding MP3. Leave autoplay off and start at about 0.45 volume. Assign their roots to **Stars** and the Audio components to **Notes**, both in file order: C5, D5, E5, G5, A5. The script sets the starting socket positions when the Lens runs. Enable positional audio on these components if desired.
4. Put each effect GLB under an empty root at scale 1, centered at local origin. Create a Lens Studio prefab for each root and assign the three prefabs to **Place Burst**, **Note Pulse**, and **Held Trail**. Remove the source instances from the scene. The script allocates the instances once and shows them as needed.
5. Put the dust-skin Delphi dolphin GLB under an empty `Dolphin Motion` root and assign that root to **Dolphin**. Position it to one side of the cluster, outside the path of the user's hands. Set the child mesh orientation and size in Preview. If the importer creates an Animation Player for `Swim Cycle`, enable looping autoplay on it. The controller animates the wrapper so first pickup, placement, and note playback can add motion to the swim cycle. Place Delphinus and Leo behind or above the play area as optional constellation guides.

The GLBs use meters. After import, measure the visual bounds using the dimensions in `asset_manifest.json`. The cluster should be about 54 cm wide and each playable star about 3.6 cm tall. If the importer leaves meters as scene units, multiply **only the imported visual child's** scale by 100. If it already converts to centimeters, keep the imported scale. Leave the controller, cluster origin, and star wrappers at unit scale so the centimeter hit radii match.

## Materials and effects

The new GLBs use standard glTF 2.0 emissive material factors. Inspect the materials created by 5.15.4. If the material imports without the intended brightness, recreate it using an Unlit material in 5.15.4 and use its corresponding GLB material's `emissiveFactor` as the color reference. The cluster, stars, and effect dust use emissive geometry. The dolphin uses emissive geometry bound to its swim rig plus a faint blue veil using glTF alpha blending. If the veil looks opaque in the 5.15.4 import, set its material to transparent in that editor and start at 13% opacity. Inspect the eyes material separately and start at 32%. The two RGBA PNG sprites are available for optional use in a 5.15.4 additive material. The interactive effects animate mesh scale and position with JavaScript and use no serialized shader or VFX graphs.

## Play and verify

Approach a socket star with either hand. It grows as the pinch point approaches. Pinch, move the star, and open your hand to place it at its last tracked position. Move your hand away, then touch the placed star with an open index finger to play its note. You can touch several stars in succession or use both hands. Tracking loss leaves a held star in place and a fresh pinch requires an open hand after reacquisition. Restart the Lens to refill the cluster.

Verify in **Lens Studio 5.15.4** that all GLBs import at the intended size, the script resolves SIK, the notes play, and the dolphin's Swim Cycle imports. On Specs, test with both hands, including tracking loss during a grab. Check that touching a star fires a single note until you withdraw, that a placed piece stays put when you move your head, and that the stars and trails are visible against light and dark backgrounds. Use the preview sheet as a geometry reference. It illustrates glow and does not show the final glasses output.

`Source/build_assets.py` regenerates the new assets using Python 3 and FFmpeg with libmp3lame. The dolphin is a dust treatment of the existing Delphi swim rig. To regenerate it and the preview, run `python3 Source/build_dolphin.py /path/to/original/dolphin.glb /tmp/delphi_dust.json` and then `python3 Source/render_preview.py /tmp/delphi_dust.json` with Pillow available.
