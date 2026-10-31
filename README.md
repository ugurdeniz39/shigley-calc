# shigley-calc

Small, dependency-free JavaScript calculators for a few classic machine-element problems, written in the
notation that most machine-design courses use (Shigley-style symbols):

- **Endurance limit**: the uncorrected endurance limit and the Marin modification factors.
- **Fatigue criteria**: factors of safety for fluctuating stress (Goodman, Soderberg, Gerber, ASME-elliptic,
  Langer first-cycle yield) and the von Mises combination of bending and torsion.
- **Shafts**: static (distortion-energy) and fatigue (DE-Goodman, DE-Soderberg, DE-Gerber, DE-ASME-elliptic)
  diameters for a target factor of safety, and the factor of safety for a given diameter.
- **Bolt groups**: an eccentrically loaded bolt (or rivet) group in shear: centroid, primary and secondary
  shear, resultant on every bolt, and the critical bolt.

It is plain ES modules with JSDoc, no build step and no runtime dependencies. There is also a single-file
offline demo page (`index.html`) with a form for each calculator that shows the intermediate values.

> **Educational tool.** Read the [disclaimer](#disclaimer) before relying on any number from this library.

## Requirements

Node.js 22 or newer (for `node --test` and ES modules) or any current browser.

## Use

Clone the repository and import from `src/index.mjs`:

```js
import { enduranceLimit, deGoodmanDiameter } from './src/index.mjs';
```

Every function is pure and throws a `RangeError` with a message naming the offending parameter when an input
is invalid (negative stress, unknown surface finish, diameter outside the validity range, and so on).

### Units

Everything is SI with the units that keep the arithmetic consistent (N/mm² = MPa), so there are no hidden
conversions inside the library.

| Quantity | Unit |
| --- | --- |
| stress, strength | MPa |
| length, diameter, coordinates | mm |
| force | N |
| moment, torque | N·mm (the demo page converts from N·m) |
| temperature | °C |
| factors (`ka`, `n`, `Kf`, ...) | dimensionless |

## Examples

### Endurance limit (`endurance.mjs`)

```js
import { enduranceLimit } from './src/index.mjs';

const marin = enduranceLimit({
  Sut: 700,            // MPa
  finish: 'machined',  // 'ground' | 'machined' | 'cold-drawn' | 'hot-rolled' | 'as-forged'
  d: 25,               // mm, rotating round (use `de` for an effective diameter instead)
  load: 'bending',     // 'bending' | 'axial' | 'torsion'
  reliability: 0.95,   // fraction; tabulated values only
});
// { SePrime: 350, ka: 0.7947, kb: 0.8806, kc: 1, kd: 1, ke: 0.868, kMisc: 1, de: 25, Se: 212.62 }
```

The individual factors are exported too: `uncorrectedEnduranceLimit`, `surfaceFactor`, `sizeFactor`,
`equivalentDiameterRound`, `equivalentDiameterRectangle`, `loadFactor`, `temperatureFactor`,
`reliabilityFactor`, `reliabilityFactorFromZ` and `correctedEnduranceLimit`.

### Fatigue criteria (`fatigue.mjs`)

```js
import { stressComponents, fluctuatingSafetyFactors } from './src/index.mjs';

const { sigmaA, sigmaM } = stressComponents(150, 10); // sigmaMax, sigmaMin  ->  70, 80 MPa
fluctuatingSafetyFactors({ sigmaA, sigmaM, Se: 212.6, Sut: 700, Sy: 560 });
// { goodman: 2.25, soderberg: 2.12, gerber: 2.74, asmeElliptic: 2.79, langer: 3.73 }
```

`vonMisesComponents({ sigmaA, sigmaM, tauA, tauM, Kf, Kfs })` combines bending and torsion, and
`fatigueConcentrationFactor(Kt, q)` gives `Kf = 1 + q (Kt - 1)`.

### Shafts (`shaft.mjs`)

```js
import { staticShaftDiameter, deGoodmanDiameter, shaftFatigueSafetyFactor, enduranceLimit } from './src/index.mjs';

// Static: moments in N*mm
staticShaftDiameter({ M: 100e3, T: 200e3, Sy: 350, n: 2.5 }).d;      // 24.41 mm

// Fatigue with a known Se
const loads = { Ma: 100e3, Tm: 60e3, Kf: 1.6, Kfs: 1.4, n: 2, Sut: 500 };
deGoodmanDiameter({ ...loads, Se: 150 }).d;                           // 29.12 mm

// Fatigue where Se depends on the diameter: pass a function, the diameter is iterated
deGoodmanDiameter({
  ...loads,
  Se: (d) => enduranceLimit({ Sut: 500, finish: 'machined', d, reliability: 0.99 }).Se,
});
// { criterion: 'goodman', d: 28.94, A: 320000, B: 145492, Se: 153.29, iterations: 8 }

// Factors of safety at a chosen diameter
shaftFatigueSafetyFactor({ Ma: 100e3, Tm: 60e3, Kf: 1.6, Kfs: 1.4, d: 30, Se: 150, Sut: 500, Sy: 380 }).n;
// { goodman: 2.19, soderberg: 2.11, gerber: 2.44, asmeElliptic: 2.45, langer: 4.33, yield: 5.73 }
```

`deSoderbergDiameter`, `deGerberDiameter` and `deAsmeEllipticDiameter` take the same arguments.
`staticShaftSafetyFactor({ M, T, d, Sy })` and `roundShaftStresses({ M, T, d })` cover the static check.

### Bolt group (`bolts.mjs`)

```js
import { eccentricBoltGroup, boltShearStress } from './src/index.mjs';

const group = eccentricBoltGroup({
  bolts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], // mm; add `area` for unequal bolts
  load: { Fx: 0, Fy: -6000, x: 300, y: 0 },                    // N, and a point on the line of action (mm)
  // couple: 0                                                 // optional extra pure couple, N*mm (CCW +)
});
group.centroid;                      // { x: 100, y: 0 }
group.moment;                        // -1.2e6 N*mm (clockwise)
group.critical;                      // { index: 2, resultant: { x: 0, y: -8000, magnitude: 8000 } }
boltShearStress(group.critical.resultant.magnitude, 12); // 70.7 MPa for a 12 mm bolt
```

Each entry of `group.bolts` carries its position relative to the centroid, the primary (`F'`), secondary
(`F''`) and resultant forces as `{ x, y, magnitude }`.

## Equations

Symbols follow the usual textbook notation. Stresses and strengths are in MPa, lengths in mm.

### Endurance limit

```
Se  = ka kb kc kd ke kMisc Se'

Se' = 0.5 Sut             for Sut <= 1400 MPa
Se' = 700 MPa             for Sut >  1400 MPa
ka  = a Sut^b             (a, b by surface finish, below)
kb  = (de / 7.62)^-0.107  for 2.79 <= de <= 51 mm
kb  = 1.51 de^-0.157      for 51 < de <= 254 mm          (rotating round, bending or torsion)
kb  = 1                   for axial loading
de  = d (rotating round) | 0.370 d (non-rotating round) | 0.808 sqrt(h b) (rectangle)
kc  = 1 (bending) | 0.85 (axial) | 0.59 (torsion)
kd  = table of tensile-strength ratio vs temperature, linearly interpolated (20-600 degC)
ke  = table of reliability factors, or 1 - 0.08 za
```

| symbol | meaning | unit |
| --- | --- | --- |
| `Sut` | ultimate tensile strength | MPa |
| `Se'` | endurance limit of the rotating-beam specimen | MPa |
| `Se` | corrected endurance limit of the part | MPa |
| `ka`, `kb`, `kc`, `kd`, `ke` | surface, size, load, temperature, reliability factors | – |
| `kMisc` | miscellaneous-effects factor (Shigley's lower-case `k_f`; renamed to avoid a clash with `Kf`) | – |
| `de` | effective diameter | mm |
| `za` | standard normal deviate of the target reliability | – |

Surface finish coefficients for `ka = a Sut^b` (Sut in MPa):

| finish | `a` (MPa) | `b` |
| --- | --- | --- |
| ground | 1.58 | -0.085 |
| machined, cold-drawn | 4.51 | -0.265 |
| hot-rolled | 57.7 | -0.718 |
| as-forged | 272 | -0.995 |

Reliability factors: 50 % → 1.000, 90 % → 0.897, 95 % → 0.868, 99 % → 0.814, 99.9 % → 0.753,
99.99 % → 0.702, 99.999 % → 0.659, 99.9999 % → 0.620.

`kc = 0.59` is for pure torsional fatigue. When bending and torsion act together and are combined through the
von Mises expressions below, use `load: 'bending'` (`kc = 1`) so the torsion is not penalised twice.

### Fluctuating stress

```
sigmaA = |sigmaMax - sigmaMin| / 2           sigmaM = (sigmaMax + sigmaMin) / 2

Goodman     1/n = sigmaA/Se + sigmaM/Sut
Soderberg   1/n = sigmaA/Se + sigmaM/Sy
Gerber      n sigmaA/Se + (n sigmaM/Sut)^2 = 1
ASME        (n sigmaA/Se)^2 + (n sigmaM/Sy)^2 = 1
Langer      n = Sy / (sigmaA + sigmaM)                       (first-cycle yield)

Kf = 1 + q (Kt - 1)
sigmaA' = sqrt((Kf sigmaA)^2 + 3 (Kfs tauA)^2)      sigmaM' = sqrt((Kf sigmaM)^2 + 3 (Kfs tauM)^2)
```

| symbol | meaning | unit |
| --- | --- | --- |
| `sigmaA`, `sigmaM` | alternating and mean normal stress | MPa |
| `tauA`, `tauM` | alternating and mean shear stress | MPa |
| `Sy` | yield strength | MPa |
| `n` | factor of safety | – |
| `Kt`, `q`, `Kf`, `Kfs` | theoretical concentration factor, notch sensitivity, fatigue concentration factors (bending, torsion) | – |
| `sigmaA'`, `sigmaM'` | von Mises alternating and mean stress | MPa |

The criteria describe the first quadrant of the mean/alternating plane, so both stress components must be
non-negative. The Gerber factor is evaluated in an algebraically equivalent form that stays accurate when
`sigmaM` is tiny.

### Solid round shaft

```
sigma = 32 M / (pi d^3)        tau = 16 T / (pi d^3)

static:  sigma' = (16 / (pi d^3)) sqrt(4 M^2 + 3 T^2)       n = Sy / sigma'
         d = [ (16 n / (pi Sy)) sqrt(4 M^2 + 3 T^2) ]^(1/3)

A = sqrt(4 (Kf Ma)^2 + 3 (Kfs Ta)^2)        B = sqrt(4 (Kf Mm)^2 + 3 (Kfs Tm)^2)
sigmaA' = 16 A / (pi d^3)                   sigmaM' = 16 B / (pi d^3)

DE-Goodman    d = [ (16 n / pi) (A/Se + B/Sut) ]^(1/3)
DE-Soderberg  d = [ (16 n / pi) (A/Se + B/Sy) ]^(1/3)
DE-Gerber     d = [ (8 n A / (pi Se)) (1 + sqrt(1 + (2 B Se / (A Sut))^2)) ]^(1/3)
DE-ASME       d = [ (16 n / pi) sqrt((A/Se)^2 + (B/Sy)^2) ]^(1/3)

first-cycle yield:  sigmaMax' = (16 / (pi d^3)) sqrt(4 (Kf (Ma+Mm))^2 + 3 (Kfs (Ta+Tm))^2),  n = Sy / sigmaMax'
```

| symbol | meaning | unit |
| --- | --- | --- |
| `M`, `T` | steady bending moment, steady torque | N·mm |
| `Ma`, `Mm`, `Ta`, `Tm` | alternating / mean bending moment and torque | N·mm |
| `d` | shaft diameter | mm |
| `A`, `B` | alternating and mean load terms | N·mm |

The DE-Gerber diameter is computed from the equivalent form `K = ½ (A/Se + sqrt((A/Se)² + 4 (B/Sut)²))`,
`d = [(16 n / π) K]^(1/3)`, which stays finite when `A = 0`. When `Se` is a function of `d`, the diameter is
found by fixed-point iteration (it throws if it fails to converge within 100 steps).

### Bolt group in shear

```
(xbar, ybar) = area-weighted centroid of the bolts
M       = (xF - xbar) Fy - (yF - ybar) Fx + couple          (about the centroid, CCW positive)
F'_i    = F A_i / sum(A)                                    primary (direct) shear
F''_i   = M A_i r_i / sum(A_j r_j^2), perpendicular to r_i  secondary (moment) shear
R_i     = F'_i + F''_i  (vector sum)                        critical bolt: largest |R_i|

tau     = R / (pi d^2 / 4)         sigma_b = R / (d t)
```

| symbol | meaning | unit |
| --- | --- | --- |
| `F`, `Fx`, `Fy` | applied force and components | N |
| `(xF, yF)` | any point on the line of action | mm |
| `A_i` | shear-area weight of bolt *i* (all 1 for identical bolts) | – |
| `r_i` | distance from the centroid to bolt *i* | mm |
| `M` | moment about the centroid | N·mm |
| `F'`, `F''`, `R` | primary, secondary, resultant bolt force | N |
| `tau`, `sigma_b` | bolt shear stress, bearing stress | MPa |
| `d`, `t` | bolt diameter, plate thickness | mm |

Assumptions: rigid joint plate, all bolts in single shear, equal shear stiffness per unit area, and no
friction between the plates.

## Demo page

`index.html` is a single static page with a form per calculator. It makes no network requests and picks its
light or dark theme from `prefers-color-scheme`.

Browsers refuse to load ES modules from `file://` URLs, so serve the folder over http:

```sh
npm start                      # node scripts/serve.mjs, http://127.0.0.1:8080/
# or any static server, for example:
python3 -m http.server 8080
```

If the modules cannot be loaded the page shows a banner that explains this. The page also works unchanged on
any static host such as GitHub Pages.

## Tests

```sh
npm test      # node --test
```

The tests are written with `node:test`. Each expected value comes with its hand calculation (inputs,
intermediate values, result) in a comment and is asserted within a stated tolerance. There are also invariant
checks (round-trip diameter/factor of safety, Soderberg ≤ Goodman ≤ Gerber, force and moment equilibrium of
bolt groups) and edge-case tests for invalid input.

## Sources

The equations are standard machine-design theory. The tabulated factors follow the 10th edition of
*Shigley's Mechanical Engineering Design* (R. G. Budynas and J. K. Nisbett, McGraw-Hill); other editions
may renumber tables and equations or revise coefficients, so check your own edition.

- Chapter 6, fatigue failure resulting from variable loading:
  the endurance limit and its 700 MPa cap for high-strength steel; the Marin factors section,
  with **Table 6-2** (surface-factor parameters `a`, `b`), the size-factor expressions and
  effective-diameter rules, the load factors, **Table 6-4** (effect of operating temperature on the
  tensile strength of steel) and **Table 6-5** (reliability factors); the notch-sensitivity relation
  `Kf = 1 + q (Kt - 1)`; and the failure criteria for fluctuating stress (Goodman, Soderberg, Gerber,
  ASME-elliptic, Langer).
- Chapter 7, shafts and shaft components: the von Mises stresses for bending plus torsion, the
  DE-Goodman, DE-Gerber, DE-ASME-elliptic and DE-Soderberg diameter expressions (Eqs. 7-8, 7-10, 7-12 and
  7-14 in the 10th edition) and the first-cycle yield check.
- Chapter 8, bolted and riveted joints loaded in shear: the primary/secondary shear treatment of
  eccentric loading and the bearing check.

Only numerical values and equations are used here; no text, figures or problems from the book.

## Limitations

- Steel only for the temperature and endurance-limit relations.
- `enduranceLimit` defaults to `reliability: 0.5`, which gives `ke = 1`, a mean value rather than a conservative one. Set the reliability explicitly for design work.
- Tabulated reliability values only (use `reliabilityFactorFromZ` for others).
- `ka` is not capped at 1; a ground finish on a very low-strength steel can give a value marginally above 1.
- The size factor is defined for 2.79–254 mm and throws outside that range instead of clamping.
- Compressive mean stress is not handled by the fatigue criteria.
- No stress-concentration charts, shaft deflection, critical speed, bolt preload or tension joints.

## Disclaimer

This library is for education and quick sanity checks. It comes without warranty of any kind (see
[LICENSE](LICENSE)). Machine elements fail in ways that a handful of closed-form equations do not capture.
Verify every result by hand, against the governing standards and with a qualified engineer before using it for
a real design.

This project is not affiliated with, endorsed by or sponsored by the authors or publisher of any textbook it
cites.

## License

[MIT](LICENSE) © 2026 Yuroka Studio
