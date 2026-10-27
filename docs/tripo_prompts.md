# Tripo3D prompts (studio.tripo3d.ai)

Limits: prompt ≤ 1024 chars, negative ≤ 255. Export **GLB** (quad mode forces FBX). CT = British WWI, T = German WWII (user's choice;
the map's T weapons are WWI — for a WWI German swap the helmet/tunic/boots for M1916 Stahlhelm, M1915 Bluse, 1909 leather belt + 3-cell
rifle pouches, ankle boots, and drop "WWII/Wehrmacht/1943").

## Player models
Settings: PBR on, Smart Low Poly, 15,000 tris (or 8,000 quads), then humanoid Auto Rig. Part segmentation can split the head for face swaps.
Long coats are avoided (a coat skirt between the legs breaks rigging).
Note: tw16/17 removed SetModel agents because the local body drew in first person — build these on a decompiled stock agent vmdl
(cs2mapping docs/creation/models.md, "CS:GO player models rebuilt as CS2 agents") so first-person arms/body hiding come from the template.

### CT – British 1916
```
Full-body realistic game character, WWI British Army infantry private, 1916 Western Front trench soldier, adult male, realistic human proportions, neutral calm face, clean-shaven. Strict symmetrical A-pose: standing straight, feet shoulder-width apart flat on ground, arms straight and angled 45 degrees down from shoulders, palms facing down, fingers straight and slightly spread, thumbs apart, arms not touching torso, head facing forward. Brodie Mk I steel helmet, wide flat brim, khaki hessian cover, leather chinstrap. Khaki wool 1902 Pattern service dress tunic, four flapped pockets, brass buttons. Khaki wool trousers, khaki puttees wrapped ankle to knee, brown leather hobnailed ammunition boots. 1908 Pattern khaki cotton webbing: waist belt, crossed shoulder braces, five-cell ammunition pouches on each side of chest, water bottle on right hip, haversack and entrenching tool on left hip, gas respirator bag slung at left side. Worn faded fabric, dried mud on boots and puttees. Empty hands, no weapon.
```

### CT – British 1918 winter (alt)
```
Full-body realistic game character, WWI British Army infantry corporal, 1918 Western Front winter trench soldier, weathered adult male, realistic human proportions, thick moustache, light stubble, tired neutral face. Strict symmetrical A-pose: standing straight, feet shoulder-width apart flat on ground, arms straight and angled 45 degrees down from shoulders, palms facing down, fingers straight and slightly spread, thumbs apart, arms not touching torso, head facing forward. Brodie Mk I steel helmet, wide flat brim, rough sandbag hessian cover with frayed edges, leather chinstrap. Sleeveless brown leather jerkin buttoned over khaki wool service dress tunic. Khaki wool trousers, khaki puttees ankle to knee, brown hobnailed ammunition boots. Khaki 1908 Pattern webbing belt with ammunition pouches, brown leather 1903 bandolier across left shoulder, small box respirator haversack worn high on chest, water bottle on right hip. Heavy mud on lower legs, stained worn cloth. Empty hands, no weapon.
```

### T – German 1943
```
Full-body realistic game character, WWII German Wehrmacht Heer infantry soldier, 1943 trench soldier, adult male, realistic human proportions, neutral calm face, clean-shaven. Strict symmetrical A-pose: standing straight, feet shoulder-width apart flat on ground, arms straight and angled 45 degrees down from shoulders, palms facing down, fingers straight and slightly spread, thumbs apart, arms not touching torso, head facing forward. M40 Stahlhelm steel helmet, matte field-grey, flared skirt, leather chinstrap. Field-grey wool M40 Feldbluse tunic, four pleated patch pockets with scalloped flaps, plain collar, grey buttons. Field-grey trousers tucked into black jackboots. Black leather Y-straps, belt with plain buckle, two triple-cell black ammunition pouches on front belt, bread bag and felt-covered canteen at right rear hip, entrenching tool and bayonet scabbard on left hip, fluted cylindrical gas mask canister on lower back. Worn wool, muddy boots. Empty hands, no weapon, no insignia or emblems.
```

### T – German 1944 veteran (alt)
```
Full-body realistic game character, WWII German Wehrmacht Heer infantry soldier, 1944 veteran trench soldier, weathered adult male, realistic human proportions, light stubble, gaunt neutral face. Strict symmetrical A-pose: standing straight, feet shoulder-width apart flat on ground, arms straight and angled 45 degrees down from shoulders, palms facing down, fingers straight and slightly spread, thumbs apart, arms not touching torso, head facing forward. M42 Stahlhelm steel helmet, rough matte field-grey, straight-cut rim, leather chinstrap. Field-grey wool M43 Feldbluse tunic, straight-flap pockets, plain collar. Field-grey M43 trousers, short brown leather ankle boots with field-grey canvas gaiters. Black leather Y-straps and belt, two triple-cell ammunition pouches, bread bag and canteen at right hip, folding entrenching tool in leather carrier on left hip, rolled tent quarter, fluted gas mask canister on lower back. Faded worn wool, dried mud on boots. Empty hands, no weapon, no insignia or emblems.
```

### Negative (player models)
```
weapon, rifle, gun, props in hands, T-pose, crossed arms, arms touching body, fused fingers, merged limbs, extra limbs, asymmetric pose, pedestal, base, cartoon, chibi, stylized, low detail, swastika, eagle emblem, camouflage, blurry texture
```

## First-person arms
Settings: PBR on, Smart Low Poly, 8,000 tris, **no Auto Rig** — the mesh is split at the cuff into gloves_arms + sleeves and skinned to the
stock agent's first-person arm bones (same two-DMX layout as a decompiled agent).

### CT – British
```
Realistic game asset, first-person arms for a WWI British infantry soldier, 1916 Western Front: a matched left and right human arm, each from shoulder to fingertips, no torso, no head. Both arms laid flat side by side, parallel and horizontal, pointing forward, 15 cm gap between them, elbows straight, palms facing down, fingers straight and slightly spread, thumbs apart from fingers, wrists straight, perfectly symmetrical mirror pair. Sleeves of khaki wool serge 1902 Pattern service dress tunic, coarse visible weave, plain pointed cuff ending at the wrist with clean edge, slight fabric folds at the elbow. Bare adult male hands, realistic anatomy, defined knuckles, short fingernails, weathered sun-tanned skin, light dirt and dried mud on fingers and knuckles, mud stains on the cuffs. Clear separation between sleeve cloth and skin at the cuff. High detail on hands and fingers. No gloves, no weapon, no jewellery.
```

### T – German
```
Realistic game asset, first-person arms for a WWII German Wehrmacht infantry soldier, 1943: a matched left and right human arm, each from shoulder to fingertips, no torso, no head. Both arms laid flat side by side, parallel and horizontal, pointing forward, 15 cm gap between them, elbows straight, palms facing down, fingers straight and slightly spread, thumbs apart from fingers, wrists straight, perfectly symmetrical mirror pair. Sleeves of field-grey wool M40 Feldbluse tunic, coarse visible weave, plain straight cuff with small slit and one grey button, ending at the wrist with clean edge, slight fabric folds at the elbow. Bare adult male hands, realistic anatomy, defined knuckles, short fingernails, pale weathered skin, light dirt and dried mud on fingers and knuckles, mud stains on the cuffs. Clear separation between sleeve cloth and skin at the cuff. High detail on hands and fingers. No gloves, no weapon, no jewellery, no insignia.
```

### Negative (arms)
```
torso, head, body, legs, weapon, gun, gloves, fused fingers, extra fingers, missing fingers, bent fingers, fist, merged arms, arms touching, asymmetric, cartoon, stylized, low detail, blurry texture, base, pedestal, rings, watch
```
