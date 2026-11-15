# Delphi Web Studio

The website lives in this directory and runs independently of Unity and the Spectacles Lens. The site-level constellation QR points to the current public host when served over HTTPS. Performance pages share ordinary links.

## Local preview

Install Node 22.13+ and FFmpeg with FFprobe. From this directory run `npm ci` and `npm run dev -- --port 4177`. Open [the Studio](http://localhost:4177/). Camera permissions require localhost or HTTPS. Without configuration, publishing uses SQLite and disk under the ignored `.data/` directory. A second browser session can open a published page on the same server. A physical device needs a reachable host in its share URL.

- **Studio** uses the generated scene and Web Audio mix for recording. The camera is requested with audio disabled and a detached video element feeds the hand tracker. Studio renders tracked hand landmarks as stardust. The recording captures only the Three.js scene, where tracked hands appear as stardust. Use **Hide controls** to expand the desktop stage. **Enter VR** starts an immersive WebXR session on a supported headset browser; aim and trigger to grab, squeeze the grip for drums. **Ask Delphi** accepts “play the drums,” “echo me,” or “harmonize.” Supported browsers can use on-device English speech with **Speak a cue**. Recording is a desktop Studio feature. The supplied dolphin GLB plays its swim animation in Studio. Accompaniment requests carry a short set of pitch, timing, zone and star IDs. The browser schedules the chosen action. Local accompaniment works without credentials.
- **Upload** previews the local clip before transferring it. FFmpeg checks the media and writes an H.264/AAC video, separate M4A audio and a JPEG thumbnail. Clips need an audio track. The limit is 50 MB and 3 minutes.
- **Gallery** serves only published performances. Device-local downloads are available from the Studio review without publication. A browser ID in local storage controls the single reversible like and the author's comment removal.

## Deployment for delphi.jayasrisng.com

The Vercel project serves the Vite build and runs the Node media worker in `api/router.js`. Supabase persists performances, likes, comments and private media. The live deployment uses a narrowly scoped Edge Function so the Vercel server only has a Delphi worker credential.

1. Create a Supabase project and apply the migrations in `supabase/migrations/`. Deploy `supabase/functions/delphi-storage/index.ts` with gateway JWT verification disabled. The function verifies the worker credential against a SHA-256 digest in the service-role-only `delphi_worker_credentials` table.
2. Set `SUPABASE_URL`, `DELPHI_WORKER_KEY` and `PUBLISH_SECRET` as Vercel production environment variables. Use a distinct 48-byte random hex value for the worker key, and store only the digest of its hex text in the database. For external moderation, configure a separate `MODERATION_TOKEN` you can access securely. To enable remote accompaniment, set `AI_API_KEY` and `AI_MODEL`.
3. Deploy the `web/` directory. Vercel installs the FFmpeg binaries and uses `/tmp` for scratch files. Add `delphi.jayasrisng.com` to the project, configure the CNAME in authoritative DNS, and verify HTTPS. The default Vercel URL works before DNS is connected.
4. Set cleanup for abandoned uploads and a shared rate limiter as traffic grows. Successful publishes already clean out their staged inputs.
5. Test recording and sharing across two browsers and test an imported Spectacles clip on a phone.

For a standalone Node host, install FFmpeg and FFprobe, run `npm ci`, `npm run build`, and `npm start`. Set `HOST` and a writable `MEDIA_DATA_DIR` as needed. The standalone server also supports a server-only `SUPABASE_SERVICE_ROLE_KEY` in place of the Edge Function.

To remove an abusive comment, a moderator can send `DELETE /api/performance/<slug>/comments/<id>` with `Authorization: Bearer <moderation token>`. Comment IDs are available in the performance API response. The server applies basic rate limiting, blocks URLs and checks a honeypot field.
