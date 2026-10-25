# Orb polar pulse refinement

Replaces the white-centered polar billboard and singular angular starburst with a finite dark well, a narrow red lip and a smooth surface pulse. Longitude detail fades before the pole, and the pulse uses angular distance with derivative filtering. The core now uses a 96 x 64 sphere with smooth normals and a shallow sculpted polar recess. Matte material at the wells suppresses bright scene reflections. The two zero-area aura anchors still supply the shared mist field; they no longer draw white-centered sprites.

orb-in-motion.mp4 is a 16-second 1280x720 H.264 recording of the game renderer. The camera holds its initial position, approaches and then rises for a clear view of the polar well and pulse. video-frame-3.png, video-frame-9.png and video-frame-14.png are decoded from that saved MP4. pole-closeup.png is a direct view along the polar axis. before.png preserves the preceding effect.

Validation: npm run build; node tests/orb-lighting-browser.mjs; node tests/enemy-hit-flash-browser.mjs. All passed. The polar pixel check verifies a dark center against its red rim (well red 25/255 versus rim red 98/255 in the studio fixture). Spin, replay consistency, light count, bloom-independent emission and animation checks also passed. Video decode confirms 1280x720, 15.99 seconds, with no browser or shader errors. The production build retains its bundle-size advisory.

Recreate video: ORB_POLE_STUDY=1 ORB_FILM_DIR=artifacts/orb-poles node tools/record-orb-film.mjs
