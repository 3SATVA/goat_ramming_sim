# Billy Bash

A top-down arena brawler. You are a goat. Pull from anywhere on the field and ram the other goats before the fence catches fire.

## How to play

1. **Enter the ring** from the main menu. Choose a **2:00** or **3:00** round (3:00 is the default).
2. **Press and drag anywhere** on the field. You are the goat with the red collar and the dashed ring. Mouse and touch both work. Menu and HUD buttons still click normally.
3. **The pull sets the ram.** Launch direction is opposite your drag, and a longer drag (up to a max) means more speed, damage, and knockback. The aim arrow is drawn from your goat, not from your finger.
4. **Release** to fly. Hitting another goat deals damage based on impact speed and sends both of you bouncing. The white fence reflects you with a thud.
5. **Rivals telegraph** their rams. A red arrow and a **!** mean they are winding up — ram them first or launch out of the line. They aim ahead of you, sometimes bank off the fence, and sidestep when you aim at them.
6. **Last flock standing wins.** If the clock hits zero, whoever has more HP left takes the round (your HP versus the rivals' combined HP).
7. **Overtime** starts at **0:45**. The fence turns to fire. Touching it or bouncing off it burns: a chunk of damage on contact, then damage over time.
8. Win to go to the **next round**. Later rounds add a second rival (round 3) and a third (round 5). They wind up faster, lead their shots, and dodge more often.

Pause with the **Pause** button, **Esc**, or **P**. Leaving the tab also pauses.

## Customize

**Customize goat** on the main menu. Pick a coat swatch or use the color picker. The preview updates live, and the choice is saved in `localStorage` on this device, along with round length and mute.

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
