# Storytelling plan

Deadline: Sunday 15 November, 11:00. Version 2, Saturday afternoon.

## 1. The concept (the team's decisions)

- **You are the rover.** The viewer drives the real rover and sees what it sees, with the gym floor turned into Mars.
- **Mission Control tells the story.** People at NASA brief you, tell you when and where you land, and send instructions one mission at a time.
- **Two abandoned machines, two chapters:**
  - **Sojourner (1997):** drive to places and analyse rocks.
  - **InSight (2018):** carry an instrument and set it down. The cube becomes the instrument instead of a rock.
- **Audience:** ages 11 to 14.
- **Ending:** the mystery first (contact is lost), then the legacy.
- **Hardware:** the rover has a gripper. Every point and every object carries a marker. The viewing device has internet.

Two accuracy notes to keep the story honest:

- Sojourner never picked rocks up. It pressed an instrument against them. That is why carrying belongs to the InSight chapter.
- InSight was a lander that never moved. Its 1.8 m robotic arm lifted the instruments off its deck and set them on the ground. Your rover driving the instrument to its spot is the game's version of that arm; say so in one line on screen.

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

Dictionary `DICT_4X4_50`, split into two ranges:

| IDs | Used for | Size | Placement |
|---|---|---|---|
| 0 to 31 | Objects (rocks, instruments). Object `i` uses IDs `4i` to `4i+3`, one per side face | 8 cm | On the four sides of each 10 cm cube |
| 32 to 49 | Points (A, B, C, drop zones, start) | 15 to 20 cm | Upright on a stand or folded card at the point |

A carried object's marker may be hidden by the gripper. While the engine is in the "carrying" stage, the object's model is drawn at a fixed spot in front of the camera instead of on its marker.

## 5. The story

Message texts are drafts to rewrite in the team's own words. Anything marked **verify** is not confirmed and must not be shown as fact until it is.

### Chapter 1: Sojourner, 1997

| # | Type | Mission Control says (draft) | Target | Reward or result |
|---|---|---|---|---|
| 0 | Uplink | "Rover, this is Mission Control. You are about to become the first rover to drive on another planet. We planned for 7 days. Let's see how far you get." | – | – |
| 1 | Uplink | "Landing site: Ares Vallis, an ancient flood plain. You are wrapped in airbags and you are going to bounce." | – | Landed 4 July 1997 at about 14 m/s, bounced about 15 times, as high as 15 m |
| 2 | Go to | "Stand up to your full 30 cm and roll down the ramp to point A." | Point A | NASA media: Sojourner on the surface next to the lander. Caption: top speed 1 cm per second |
| 3 | Analyse | "Your first rock: Barnacle Bill. Press your spectrometer against it and hold still. A full reading takes 10 hours." | Rock: Barnacle Bill | About 58% silica, far more than expected, similar to andesite on Earth |
| 4 | Analyse | "Next is Yogi, a rock taller than you. Careful: when we did this for real, we drove too far and you ended up leaning on it." | Rock: Yogi | The real rover overshot and was left propped against Yogi; it was repositioned and analysed the rock on sol 10 |
| 5 | Go to | "Drive to point B, the Rock Garden. Look around when you get there." | Point B | NASA media: the Rock Garden mosaic with Shark, Half Dome, Wedge and Moe. Caption: rounded pebbles here suggested water once flowed |
| 6 | Signal lost | The message starts and breaks off. "NO SIGNAL FROM LANDER." | – | Last transmission 27 September 1997. Sojourner's last orders were to wait, then drive around the lander. Nobody knows if it did. Planned for 7 sols, it worked for 83 |

### Chapter 2: InSight, 2018

| # | Type | Mission Control says (draft) | Target | Reward or result |
|---|---|---|---|---|
| 7 | Uplink | "Twenty-one years later. New mission, new machine. InSight does not look at rocks. It listens to the planet itself. Landing site: Elysium Planitia." | – | Landed 26 November 2018 |
| 8 | Place | "Go to point C, the lander deck. Pick up the seismometer. Carry it to spot D and set it down gently. It has to sit flat." | Object: Seismometer, from Point C to Spot D | The real InSight used a 1.8 m robotic arm to lift its seismometer off the deck and set it on the ground. **verify:** first time an arm placed an instrument on another planet |
| 9 | Place (optional) | "Now the heat probe. Same again, to spot E." | Object: Heat probe, to Spot E | The real probe was meant to hammer itself into the ground. **verify** how far it got |
| 10 | Go to | "Drive back to point F and stay quiet. We are listening." | Point F | NASA media: a marsquake recording or its seismogram. **verify** date of the first marsquake and how many were detected |
| 11 | Signal lost | "Your solar panels are covered in dust. Power is dropping." Then nothing. | – | The mission ended on 15 December 2022 |

### Epilogue

| # | Type | Text (draft) |
|---|---|---|
| 12 | Epilogue | Present-day voice: "Both of you are still there. Sojourner near its lander in Ares Vallis, InSight under a layer of dust in Elysium Planitia. In 2006 an orbiter photographed something about 6 m south of the Pathfinder lander that may be Sojourner. It was never confirmed." |
| 13 | Epilogue | "Sojourner was named by Valerie Ambroise, who was 12. It proved rovers work: Spirit, Opportunity, Curiosity and Perseverance followed. InSight taught us what Mars is made of inside. Abandoned, but not forgotten." |

The shortest complete run is steps 0, 2, 3, 6, 7, 8, 11 and 13: one Go to, one Analyse, one Place, both endings.

## 6. What is on screen besides AR

- **Top bar:** chapter (Sojourner 1997 or InSight 2018), sol or date.
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
type Result = { text: string; source: string };

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

New models needed: a seismometer under its domed shield and a heat probe, both sized to hide a 10 cm cube like the rock covers. A dome is a natural fit for that shape.

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
- NASA, InSight mission: https://science.nasa.gov/mission/insight/
- NASA, Sojourner, Barnacle Bill and Yogi: https://science.nasa.gov/resource/sojourner-barnacle-bill-yogi/
- JPL, NASA names first rover to explore the surface of Mars: https://www.jpl.nasa.gov/news/nasa-names-first-rover-to-explore-the-surface-of-mars
- JPL, mosaic of Wedge, Shark, Half Dome, Moe and Flat Top: https://www.jpl.nasa.gov/images/pia00901-mosaic-of-wedge-shark-half-dome-moe-and-flat-top/
- HiRISE, Mars Pathfinder site: https://hirise.lpl.arizona.edu/PSP_001890_1995
- Nature, report on the first rock analyses: https://www.nature.com/articles/40712
- Wikipedia, Sojourner (rover): https://en.wikipedia.org/wiki/Sojourner_(rover)

Still to verify before use: the InSight details marked above (first marsquake, total count, heat probe outcome, the "first arm placement" claim), and the exact NASA media files for each Go to reward.
