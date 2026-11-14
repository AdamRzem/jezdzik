# Storytelling plan

Deadline: Sunday 15 November, 11:00. Version 4, Saturday evening.

## 1. The concept (the team's decisions)

- **You are Sojourner.** The viewer drives the real rover and sees what it sees, with the gym floor turned into Mars.
- **Mission Control tells the story.** People at NASA brief you, tell you when and where you land, and send instructions one mission at a time.
- **One story, one mission.** The Sojourner plan below is implemented at `/story`. InSight has a separate playable story at `/story?mission=insight`, using the same engine and HUD; its steps live in `src/lib/story/insight/story.ts`.
- **The rover has an arm**, and the story treats that as given. It is a demo, so the story does not comment on it.
- **Audience:** ages 11 to 14.
- **Ending:** the mystery first (contact is lost), then the legacy.
- **Hardware:** the rover has a gripper. Every point and every object carries a marker. The viewing device has internet.

### Real or imagined

Every message carries a REAL or IMAGINED tag, and every result card says what really happened and names its source. The one IMAGINED mission is carrying Yogi; its tag says only that it is part of the game.

## 2. Mission types

| Type | Instruction looks like | Done when | Then |
|---|---|---|---|
| **Go to** | "Drive to point A." | The rover is within 40 cm of point A's marker | A piece of NASA media plays (video, photo or sound), then a short caption |
| **Analyse** | "Drive to the rock Yogi and analyse it." | Within 40 cm of the rock's marker, then the analyse timer finishes | Result card: what the real rover found |
| **Place** | "Go to point B, pick up the seismometer and set it down at spot C." | The object's marker and spot C's marker are seen within 15 cm of each other for one second | Result card: what the real instrument did |

A Place mission has three stages shown one at a time in the goal strip: reach B, grab the object, deliver to C.

Every mission can also be completed with a key press, as a safety net during the demo.

## 3. What the viewer sees in AR

- **Waypoint beacon:** a tall column of light with a ring at its base and a large letter, drawn on the marker of the current target point. Only the current target has a beacon.
- **Name labels:** every rock and instrument has its name floating above it, always facing the camera. The current target's label is bright and pulses; the others are dim. This is how the driver tells which object to pick up.
- **Drop zone:** spot C shows a flat glowing ring on the floor, which turns green when the object is inside it.
- **Distance:** the goal strip shows the distance to the target whenever its marker is in view, and "Look around for point A" when it is not.

Because the rover does not track its own position, beacons and labels appear only while their marker is in the camera's view. The camera sees a narrow 42° cone, so the driver will have to turn to search. Two things make this easier:

- Make point markers large (15 to 20 cm) and stand them upright; a 16 cm marker can be read from about 8 m.
- Lay the course out so each next target is roughly ahead of the previous one.

## 4. Markers

Dictionary `DICT_4X4_100`. Object assignments are implemented; point markers are reserved for future story navigation:

| IDs | Used for | Size | Placement |
|---|---|---|---|
| 10 to 57 | Objects (nine rocks, then SEIS, SEIS shield, heat probe). Object `i` uses IDs `10+4i` to `13+4i`, one per side face | 8 cm | On the four sides of each 10 cm cube |
| 58 to 99 | Points (A, B, C, drop zones, start) | 15 to 20 cm | Upright on a stand or folded card at the point |

A carried object's marker may be hidden by the gripper. While the engine is in the "carrying" stage, the object's model is drawn at a fixed spot in front of the camera instead of on its marker.

## 5. The story

Message texts are drafts to rewrite in the team's own words. The live texts are in `src/lib/story/sojourner/story.ts`.

| # | Type | Mission Control says (draft) | Target | Reward or result |
|---|---|---|---|---|
| 0 | Uplink | "Sojourner, this is Mission Control. You are about to become the first rover to drive on another planet. We planned for 7 days. Let's see how far you get." | – | – |
| 1 | Uplink | "Landing site: Ares Vallis, an ancient flood plain. You are wrapped in airbags and you are going to bounce." | – | Landed 4 July 1997 at about 14 m/s, bounced about 15 times, as high as 15 m |
| 2 | Go to | "Stand up to your full 30 cm and roll down the ramp to point A." | Point A | NASA photo: the real Sojourner beside its lander on sol 2 |
| 3 | Analyse | "Your first rock: Barnacle Bill. Press your spectrometer against it and hold still. A full reading takes 10 hours." | Rock: Barnacle Bill, analysed where it stands | About 58% silica, far more than expected, similar to andesite on Earth |
| 4 | Carry, then analyse (IMAGINED) | "Next is Yogi. We want this one somewhere else. Pick it up, carry it out to point C and set it down. Then run your analysis there." | Rock: Yogi, carried to Point C (the rover's last known position) | The real rover reached Yogi on 9 July, overshot and leaned against it, then analysed it on sol 10. Point C marks where the rover was last seen, near the rock Chimp, about 12 m from the lander |
| 5 | Go to | "Drive to point B, the Rock Garden. Look around when you get there." | Point B | NASA photo: boulders at the landing site. Rounded pebbles suggested water once flowed here |
| 6 | Signal lost | The message starts and breaks off. "NO SIGNAL." | – | Last transmission 27 September 1997. Last orders: wait, then drive around the lander. Nobody knows if it did. Planned for 7 sols, it worked for 83 |
| 7 | Epilogue | "Sojourner never answered again. It is still in Ares Vallis, close to its lander. In 2006 an orbiter photographed something about 6 m south of the lander that may be Sojourner. It was never confirmed." | – | – |
| 8 | Epilogue | "Sojourner was named by Valerie Ambroise, who was 12. It proved that rovers work: Spirit, Opportunity, Curiosity and Perseverance followed its tracks." | – | – |

The Yogi mission has four stages: drive to the rock, pick it up, carry it to point C and set it down, then analyse it there.

One thing to consider: step 5 sends the rover to the Rock Garden after it has already reached its last known position. Swapping steps 4 and 5 would make the story end where the real one did. The order is just the order of entries in the story file.

## 6. What is on screen besides AR

- **Top bar:** chapter (Pathfinder, 1997), sol or date.
- **REAL / IMAGINED tag:** on every uplink and result card, in two clearly different colours.
- **Uplink box:** Mission Control's message, typed out letter by letter.
- **Goal strip:** current goal, stage for Place missions, distance to target.
- **Analyse bar:** fills during a scan, labelled in hours (one second is one hour).
- **Media panel:** NASA video, photo or audio with its credit line and a Continue button.
- **Result card:** two or three sentences, one number, the source.
- **Mission log:** completed missions as a checklist.
- **No-signal state:** the uplink box turns to static.

For ages 11 to 14: one idea per message, numbers with comparisons, no jargon without a short explanation, text readable from across a table.

## 7. How it is built

One data file drives everything, so text can be edited without touching code.

```ts
// src/lib/story/story.ts
type Media = { kind: 'video' | 'image' | 'audio'; url: string; credit: string; caption: string };
type Result = { text: string; source: string }; // result cards are always REAL

// Every step also has `real: boolean`, which sets its REAL or IMAGINED tag.

type Step =
	| { kind: 'uplink'; id: string; chapter: string; date?: string; message: string; result?: Result }
	| { kind: 'goto'; id: string; chapter: string; message: string; point: string; media: Media }
	| { kind: 'analyse'; id: string; chapter: string; message: string; object: string; scanHours: number; result: Result }
	| { kind: 'place'; id: string; chapter: string; message: string; object: string; from: string; to: string; result: Result }
	| { kind: 'signal-lost'; id: string; chapter: string; message: string; result: Result }
	| { kind: 'epilogue'; id: string; message: string };

// src/lib/story/world.ts
// Which marker IDs mean what, and which model and label each object shows.
type WorldObject = { id: string; label: string; markerIds: number[]; model: string };
type WorldPoint = { id: string; label: string; markerId: number };
```

- `engine.ts` holds the current step and stage and reacts to events: `advance` (key press), `seen(markerOwner, distance)`, `near(objectId, pointId)`, `scanDone`, `mediaClosed`. It knows nothing about cameras or markers.
- `Hud.svelte` draws section 6 from the engine's state.
- `ArLayer` (the video page) turns marker detections into `seen` and `near` events, and draws beacons, labels, drop zones and models (section 3).
- The same engine can run over the 3D site model with keyboard driving, which gives judges something to open from a public link.

Models for the seismometer, its dome shield and the heat probe already exist in `static/assets/models/cover/`, sized to hide a 10 cm cube like the rock covers.

## 8. The smallest AR that carries the story

| Needed | Not needed |
|---|---|
| Live video on the page (MediaMTX reading the camera directly) | Floor tracking and odometry |
| Marker detection with pose and distance | IMU |
| Models, labels and beacons drawn on detected markers | Occlusion |
| The story engine and HUD | Drift correction, frame stamps |

Everything is drawn at the pose each marker reports in the current frame, so nothing has to be remembered about where the rover is.

## 9. Order of work until 11:00

| By | Done |
|---|---|
| Sat 17:30 | Story data, engine and HUD working with key presses. All three mission types and all draft texts in. |
| Sat 19:00 | Live video behind the HUD. Markers made for at least 2 points and 2 objects. |
| Sat 22:00 | Markers detected; models, name labels and beacons drawn; Go to and Analyse missions completing for real. |
| Sun 00:00 | Place mission completing for real with the gripper. NASA media collected and playing. |
| Sun 02:00 | Signal-lost and epilogue screens. Texts rewritten by the team and fact-checked. |
| Sun 08:00 | Full run-through in the hall. Fix what breaks. |
| Sun 09:30 | 30-second video or 7 slides. Submission form filled in. |
| Sun 10:30 | Submitted. Half an hour spare. |

The first row does not need the rover, so it can start now.

## 10. Rules to keep in view

- **NASA data:** at least one NASA resource must be used. The Go to rewards are NASA media and the result cards rest on NASA's mission pages; list them in the "NASA Data" field.
- **References:** every source below, every media item with its credit line, plus three.js, OpenCV.js, MediaMTX and any marker library.
- **AI use:** the message drafts, the model generator and the 3D models were produced with an AI assistant. Say so in the form and in the repository. Rewrite the story texts yourselves.
- **Language:** everything in English.
- **People:** no recognisable person under 18 in the video or on the site.
- **Branding:** no NASA logos in generated content.

Sources for the facts above:

- NASA, Mars Pathfinder mission: https://science.nasa.gov/mission/mars-pathfinder/
- NASA, Sojourner, Barnacle Bill and Yogi: https://science.nasa.gov/resource/sojourner-barnacle-bill-yogi/
- JPL, NASA names first rover to explore the surface of Mars: https://www.jpl.nasa.gov/news/nasa-names-first-rover-to-explore-the-surface-of-mars
- JPL, mosaic of Wedge, Shark, Half Dome, Moe and Flat Top: https://www.jpl.nasa.gov/images/pia00901-mosaic-of-wedge-shark-half-dome-moe-and-flat-top/
- HiRISE, Mars Pathfinder site: https://hirise.lpl.arizona.edu/PSP_001890_1995
- Nature, report on the first rock analyses: https://www.nature.com/articles/40712
- Wikipedia, Sojourner (rover): https://en.wikipedia.org/wiki/Sojourner_(rover)

InSight dates, deployments, first likely marsquake, heat-probe outcome and retirement were checked against the NASA/JPL sources linked in its story. Mission Control dialogue is dramatized, not a historical transcript.


## InSight story

Open InSight in the mission explorer and choose **Play story**, or visit
`/story?mission=insight`. Add `&mode=live` for the connected rover. The original
`/story` address still opens Sojourner.

The nine steps follow landing, SEIS placement at D, shield placement at D,
heat-probe placement at E, listening at F, the unsuccessful mole experiment,
loss of contact, scientific results and the equipment left behind. The game
adapts a stationary lander's arm operations into driving and carrying objectives;
those objectives are labelled IMAGINED. Result cards explain the real events.
The first likely marsquake video is a sonification sped up 60 times, not a
microphone recording. Archive video needs an internet connection; Continue
remains available if it cannot load.

InSight uses object IDs 9 (SEIS), 10 (shield) and 11 (heat probe), plus waypoints
D, E and F. All are present in the simulated course and use the existing GLBs.
Controls match Sojourner: WASD drive, G grip, Space/Enter continue, arrows rehearse
steps, R restart. The loss-of-signal dialogue is intentionally interrupted.

Last contact was 15 December 2022; NASA declared the mission over on 21 December.
Sources: [retirement and 1,319 marsquakes](https://www.jpl.nasa.gov/news/nasa-retires-insight-mars-lander-mission-after-years-of-science/),
[first likely marsquake and audio processing](https://www.jpl.nasa.gov/images/pia23176-insights-sol-128-seismic-event/).
