# Billy Bash

A top-down arena brawler. You are a goat. Pull from anywhere on the field and ram the other goats before the fence catches fire.

## How to play

1. **Story Mode** walks a lineup of levels. They unlock in order. Rivals and bosses grow tougher as the chapters go on, and they answer a heavily upgraded goat so a maxed Billy does not walk through the last pen. **Quick Fight** rolls a fresh arena each time: size, shape (square, rectangle, circle, or oval), and a yard, ice, or desert theme with that chapter's weather. Up to four enemies scale to your upgrades and split their strength across the flock, so four goats are not four copies of you. Quick fights use the round length on the main menu (2:00 or 3:00). Story levels set their own clock.
2. **Press and drag anywhere** on the field. You are the goat with the red collar and the dashed ring. Mouse and touch both work. Menu and HUD buttons still click normally.
3. **The pull sets the ram.** Launch direction is opposite your drag, and a longer drag means more speed and knockback. The aim arrow is drawn from your goat. You can pull again the moment you let go.
4. **Only the goat being hit takes ram damage.** The rammer does not. The same rule applies when an enemy hits you. If both closing speeds are nearly the same, nobody takes ram damage unless one of you is still in the ram and the other is not. Knockback still happens, and a heavier goat shoves harder.
5. **Rivals telegraph** their rams. A bright arrow and a **!** mean they are winding up. A short arrow is a tap. A long one is a full charge. They aim ahead of you and only sometimes bank off the fence.
6. **Last flock standing wins.** If the clock hits zero, whoever has more HP left takes the round (your HP versus the rivals' combined HP).
7. **Overtime** starts at **0:45**. The fence turns to fire. Touching it burns whoever is there, you included. Fire resistance reduces that.
8. **Wins pay coins.** The first clear of a story level pays the full purse. A replay pays about 40%. Spend coins in **Upgrades** on ram power, stamina, weight, launch speed, and fire resistance. Costs climb each rank. Coins and upgrades stay on this device.

Pause with the **Pause** button, **Esc**, or **P**. Leaving the tab also pauses.

## Story chapters

Chapters are a list in the game data. Each one names its field, its levels, and its hazards, so another chapter can be added by appending to that list.

1. **The Yard** is the grassy field and the white fence. Later levels add boulders, then spike clusters. It ends with **Gnasher**, who opens with three rapid charges and finishes with a freight-train ram. Boss rams hit much harder than a rival's, and the last bosses carry far more HP, mass, and aggression than the first kids.
2. **Icebound** is snow and ice. Rams slide. A snowstorm whites out the pen, shoves everyone with gusts that change direction, and slows how fast rivals recover. It ends with **Frostbite**, who breathes a freezing cone (an ice patch that slows whoever stands on it) and then rides a glacier charge.
3. **The Dunes** is sand and drifts that drag at your hooves. Spike clusters stay bright on the sand. A sandstorm pushes one way, stings anyone out in the open, and weakens a full pull. Rocks shelter you from the sting. It ends with **Duneking**, who marks a sand vortex that pulls goats in, jabs, and then kicks up a personal gale.

The pen gets bigger as the story goes, and every story pen still fits on screen. Quick Fight reuses those three grounds, including snowstorms and sandstorms, and scatters rocks and spike clusters in amounts that grow with the map. The biggest quick arenas are larger than the view. The camera follows your goat, stays inside the fence, and arrows at the edge point at goats you cannot see. Aim and the pull tether use the same camera, so a drag still launches you the way the arrow shows.

## Customize

**Customize goat** on the main menu. Pick a coat swatch or use the color picker. The preview updates live. Coat, quick-fight length, and mute are saved separately from coins and upgrades.

## Controls

| Action | Mouse | Touch |
| --- | --- | --- |
| Wind up a ram | Press anywhere and drag | Same, with a finger |
| Launch | Release | Lift |
| Pause | Pause button, Esc, or P | Pause button |

A tiny pull is ignored, so a mis-tap does not launch you.

## Develop

```bash
npm install
npm run dev
```

Production build (static files in `dist/`):

```bash
npm run build
npm run preview
```

## Deploy

The app is a static Vite site. On Vercel, import the repo and keep the Vite defaults: build command `npm run build`, output directory `dist`. `vercel.json` records that setup.
