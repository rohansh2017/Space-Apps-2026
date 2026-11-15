import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Eye, Mountain, Pin, PinOff, Target } from 'lucide-react'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import type { Dataset, Point, Relief, Site } from './data'
import { dataUrl, loadHeightmap } from './data'
import type { Constraints } from './engine/engine'
import { EPHEM_STRIDE, R_MOON_KM, siteFrame } from './engine/engine'
import type { GridStats, ReliefGrid, Verdict, Vec3 } from './moon'
import { contourInterval, easeInOut, flyPose, latLonToMe, meToThree, packRG8, pickGrid, reliefAt, siteHillshade, threeToMe, xyToMe } from './moon'
import { starField } from './starfield'
import { LABELS } from './presets'
import { EARTH_RAMP, SUN_RAMP, colour } from './ramp'

const RAD = Math.PI / 180
const km = (v: number) => v / R_MOON_KM // kilometres in units of the lunar radius
const POLE = new THREE.Vector3(0, -1, 0) // the south pole in three.js axes
const FLY_MS = 1100
const NEAR_POLE = 0.005
const NEAR_SITE = 0.0002
const DROP = 0.1 // the orbit centre sits this share of the height below the middle, clear of the cards along the top
const GRAB_PX = 18 // a press this close to the landing marker drags it instead of orbiting
// Display aid: before the relief loads, the night side is drawn at a quarter of the day side's brightness so its relief stays readable.
const NIGHT = 0.25
// Display aids on the real-Sun relief (D67, named in About the data): an exposure curve 1 - exp(-k x reflectance), and
// ground the Sun does not reach drawn from the fixed-light hillshade at this share, so craters in shadow keep their shape.
const EXPOSURE = 3
const SHADOW_FLOOR = 0.14
const SUN = '#f0b955'
const EARTH = '#5fa8ff'
const OK = '#86d3a1'
const BAD = '#ff8f84'
const TEXT = '#ece8e1'

type Layer = 'sun' | 'earth' | 'verdict'
type Dir = 'N' | 'E' | 'S' | 'W'

export interface MoonPin {
  site: Site
  verdict: Verdict | null // null while the site's terrain loads, or when the mission window runs past the table
}
export interface MoonBadge {
  key: string
  kind: 'tray' | 'result' // tray: the column's letter; result: the finder rank in a dashed ring
  text: string
  lat: number
  lon: number
}

interface Props {
  data: Dataset
  hour: number // ephemeris row that lights the sphere (landing hour + scrubber)
  when: string // the landing date the verdicts are for, for labels
  zoomed: boolean // region level (false = pole level)
  focus: Site // the site whose 10 km grid is shown at region level
  marker: Point | null // the landing point
  draggable: boolean // false while an alternative, not the plan, is shown
  pins: MoonPin[]
  grid: GridStats | null // per-point results for the focus site's grid
  badges: MoonBadge[]
  constraints: Constraints
  sunEl: number // at the bearing lines' origin (the pole, or the landing point once zoomed in), from the engine
  earthEl: number
  onSite: (id: string) => void
  onBack: () => void
  onPick: (lat: number, lon: number, outside: boolean) => void
  onNudge: (dir: Dir) => void
  onStand: () => void
  onStandAt: (siteId: string) => void // a pin's own 3D button: stand on that site's point in one click
  onPin: () => void // pin (or unpin) what is in view
  viewPinned: boolean
  canPin: boolean
  sky: { matrix: number[]; stars: Float32Array } | null // ICRF -> three.js axes at this hour (engine orientation), and the BSC5 catalogue
  host: HTMLElement | null // the overlay layer the view's bar is drawn in, above the status card
  children?: React.ReactNode // notes shown above the view's bar
}

interface Pose {
  pos: THREE.Vector3
  target: THREE.Vector3 // a point on the unit sphere
  up: THREE.Vector3 // the outward normal there
}

/** Above the pole, tilted so longitude 0 (the Earth side) is at the top, like the flat map. */
function polePose(): Pose {
  const [d, tilt] = [0.4, 35 * RAD]
  return { target: POLE.clone(), up: POLE.clone(), pos: POLE.clone().multiplyScalar(1 + d * Math.cos(tilt)).add(new THREE.Vector3(-d * Math.sin(tilt), 0, 0)) }
}

/** Above a site, tilted to look across it toward the pole; `lift` is the raised ground's radius there (1 = the sphere). */
function sitePose(lat: number, lon: number, lift = 1): Pose {
  const f = siteFrame(lat, lon, 0)
  const n = new THREE.Vector3(...meToThree(f.up))
  const north = new THREE.Vector3(...meToThree(f.north))
  const [d, tilt] = [km(17), 42 * RAD]
  return { target: n.clone().multiplyScalar(lift), up: n.clone(), pos: n.clone().multiplyScalar(lift + d * Math.cos(tilt)).add(north.multiplyScalar(d * Math.sin(tilt))) }
}

// Terrain draped on the sphere and, once the relief grids arrive (D67), raised by their heights (x exag) and lit by the
// hour's real Sun with cast shadows. Texture coordinates come from the point's own direction through the stereographic
// projection (no trigonometry, precise near the pole), so they do not depend on the meshes' UVs.
// Relief textures are RG8 (high byte, low byte of the 16-bit grid, moon.ts packRG8), the image's row 0 at v = 0.
const R_M = R_MOON_KM * 1000
const RELIEF_GLSL = `
  uniform sampler2D rGlobe; uniform sampler2D rPole; uniform sampler2D rCtx; uniform sampler2D rSite;
  uniform float hasRGlobe; uniform float hasRPole; uniform float hasRCtx; uniform float hasRSite;
  uniform vec2 osGlobe; uniform vec2 osPole; uniform vec2 osCtx; uniform vec2 osSite; // offset_m, scale_m
  uniform vec4 cells; // pixel size in metres: globe, pole, context, site
  uniform float hwPole; uniform float hwContext; uniform vec2 centre;
  uniform sampler2D rCap; uniform float hasRCap; uniform vec2 osCap; uniform float hwCap; uniform float cellCap; // the 75S cap (D71)
  uniform vec3 siteC; uniform vec3 siteE; uniform vec3 siteN; uniform float sitePx; uniform float siteSpan;
  float rg(sampler2D t, vec2 uv, vec2 os) { vec2 c = texture2D(t, uv).rg; return os.x + (c.r * 65280.0 + c.g * 255.0) * os.y; }
  // height in metres above R of a unit MOON_ME direction: the finest loaded grid, blended over its edge; cell = its pixel size
  float relief(vec3 me, out float cell) {
    float h = 0.0;
    cell = cells.x;
    if (hasRGlobe > 0.5) h = rg(rGlobe, vec2(fract(atan(me.y, me.x) / 6.2831853), 0.5 - asin(clamp(me.z, -1.0, 1.0)) / 3.1415927), osGlobe);
    if (me.z > -0.5) return h;
    vec2 st = 2.0 * vec2(me.y, me.x) / (1.0 - me.z);
    vec2 uv = (st + hwCap) / (2.0 * hwCap);
    vec2 e = min(uv, 1.0 - uv);
    float w = hasRCap * smoothstep(0.0, 0.04, min(e.x, e.y));
    if (w > 0.0) { h = mix(h, rg(rCap, vec2(uv.x, 1.0 - uv.y), osCap), w); cell = mix(cell, cellCap, w); }
    uv = (st + hwPole) / (2.0 * hwPole);
    e = min(uv, 1.0 - uv);
    w = hasRPole * smoothstep(0.0, 0.04, min(e.x, e.y));
    if (w > 0.0) { h = mix(h, rg(rPole, vec2(uv.x, 1.0 - uv.y), osPole), w); cell = mix(cell, cells.y, w); }
    uv = (st - centre + hwContext) / (2.0 * hwContext);
    e = min(uv, 1.0 - uv);
    w = hasRCtx * smoothstep(0.0, 0.03, min(e.x, e.y));
    if (w > 0.0) { h = mix(h, rg(rCtx, vec2(uv.x, 1.0 - uv.y), osCtx), w); cell = mix(cell, cells.z, w); }
    if (hasRSite > 0.5) {
      vec3 d = me - siteC;
      float c = siteSpan / (sitePx - 1.0);
      vec2 u3 = vec2((dot(d, siteE) * ${R_M.toFixed(1)} + siteSpan * 0.5) / c + 0.5, (siteSpan * 0.5 - dot(d, siteN) * ${R_M.toFixed(1)}) / c + 0.5) / sitePx;
      e = min(u3, 1.0 - u3);
      w = smoothstep(0.0, 0.03, min(e.x, e.y));
      if (w > 0.0) { h = mix(h, rg(rSite, u3, osSite), w); cell = mix(cell, cells.w, w); }
    }
    return h;
  }`

const globeShader = () => ({
  uniforms: {
    poleMap: { value: null as THREE.Texture | null }, regionMap: { value: null as THREE.Texture | null }, hasPole: { value: 0 }, hasRegion: { value: 0 },
    hwPole: { value: 1 }, hwRegion: { value: 1 }, centre: { value: new THREE.Vector2() }, sunDir: { value: new THREE.Vector3(1, 0, 0) },
    globeMap: { value: null as THREE.Texture | null }, hasGlobe: { value: 0 },
    contextMap: { value: null as THREE.Texture | null }, hasContext: { value: 0 }, hwContext: { value: 1 },
    siteMap: { value: null as THREE.Texture | null }, hasSite: { value: 0 }, siteC: { value: new THREE.Vector3() }, siteE: { value: new THREE.Vector3() },
    siteN: { value: new THREE.Vector3() }, sitePx: { value: 1 }, siteSpan: { value: 1 },
    rGlobe: { value: null as THREE.Texture | null }, rPole: { value: null as THREE.Texture | null }, rCtx: { value: null as THREE.Texture | null }, rSite: { value: null as THREE.Texture | null },
    hasRGlobe: { value: 0 }, hasRPole: { value: 0 }, hasRCtx: { value: 0 }, hasRSite: { value: 0 },
    rCap: { value: null as THREE.Texture | null }, hasRCap: { value: 0 }, osCap: { value: new THREE.Vector2() }, hwCap: { value: 1 }, cellCap: { value: 480 }, capMesh: { value: 0 },
    osGlobe: { value: new THREE.Vector2() }, osPole: { value: new THREE.Vector2() }, osCtx: { value: new THREE.Vector2() }, osSite: { value: new THREE.Vector2() },
    cells: { value: new THREE.Vector4(10_000, 600, 62.5, 5) },
    exag: { value: 1 }, steps: { value: 40 }, ctxMesh: { value: 0 },
    topo: { value: 0 }, contour: { value: 500 }, topoRange: { value: new THREE.Vector2(-8000, 8000) },
  },
  vertexShader: `${RELIEF_GLSL}
    uniform float exag; varying vec3 p; varying vec3 wpos;
    void main() {
      vec3 q = normalize(position);
      float cell;
      float h = hasRPole + hasRGlobe > 0.0 ? relief(vec3(q.x, -q.z, q.y), cell) : 0.0;
      p = q;
      wpos = q * (1.0 + exag * h / ${R_M.toFixed(1)});
      gl_Position = projectionMatrix * modelViewMatrix * vec4(wpos, 1.0);
    }`,
  fragmentShader: `${RELIEF_GLSL}
    uniform sampler2D poleMap; uniform sampler2D regionMap; uniform float hasPole; uniform float hasRegion;
    uniform float hwRegion; uniform vec3 sunDir; varying vec3 p; varying vec3 wpos;
    uniform sampler2D globeMap; uniform float hasGlobe; uniform sampler2D contextMap; uniform float hasContext;
    uniform sampler2D siteMap; uniform float hasSite;
    uniform float clip; uniform float ctxMesh; uniform float capMesh; uniform int steps; uniform float topo; uniform float contour; uniform vec2 topoRange;
    const float R = ${R_M.toFixed(1)};
    // visible fraction of the Sun's 0.53 degree disk over the terrain toward it (the same disk model as the engine's masks)
    float sunVisible(vec3 me, float h0, vec3 sun, float alt, float cell) {
      if (alt < -0.09) return 0.0; // more than 5 degrees below the level horizon: no polar peak sees it
      vec3 dir = normalize(sun - dot(sun, me) * me);
      float d = cell;
      float f = pow(200000.0 / cell, 1.0 / float(max(steps - 1, 1)));
      float best = -1.0;
      for (int i = 0; i < 64; i++) {
        if (i >= steps) break;
        float c;
        float hh = relief(normalize(me + dir * (d / R)), c);
        best = max(best, (hh - h0 - d * d / (2.0 * R)) / d);
        if (atan(best) > alt + 0.0047) return 0.0;
        d *= f;
      }
      return clamp((alt - atan(best)) / 0.00925 + 0.5, 0.0, 1.0);
    }
    void main() {
      vec3 q = normalize(p);
      vec3 me = vec3(q.x, -q.z, q.y); // three.js axes to MOON_ME
      vec2 st = 2.0 * vec2(me.y, me.x) / max(1.0 - me.z, 0.25); // south polar stereographic, units of R
      // each mesh leaves the inside of the next finer one to it (D67, D71): globe < 75S cap < polar patch < context patch
      if (clip < 0.5 && me.z < 0.0 && max(abs(st.x), abs(st.y)) < (capMesh > 0.5 ? hwCap : hwPole) * 0.97) discard;
      if (clip > 0.5 && clip < 1.5 && max(abs(st.x), abs(st.y)) < hwPole * 0.97) discard;
      if (clip > 1.5 && clip < 2.5 && ctxMesh > 0.5 && max(abs(st.x - centre.x), abs(st.y - centre.y)) < hwContext * 0.97) discard;
      // the whole Moon (LOLA LDEM_16, equirectangular): of two longitude seams take the one that does not jump here,
      // so mipmapping draws no line along 0 or 180 degrees (moon.ts globeUV)
      float lon = atan(me.y, me.x) / 6.2831853;
      float u1 = fract(lon);
      float u2 = fract(lon + 0.5) - 0.5;
      float gu = fwidth(u1) <= fwidth(u2) + 1e-7 ? u1 : u2;
      float shade = mix(0.11, texture2D(globeMap, vec2(gu, 0.5 + asin(clamp(me.z, -1.0, 1.0)) / 3.1415927)).r, hasGlobe);
      vec2 uv = (st + hwPole) / (2.0 * hwPole);
      vec2 edge = min(uv, 1.0 - uv);
      shade = mix(shade, texture2D(poleMap, uv).r, hasPole * smoothstep(0.0, 0.04, min(edge.x, edge.y)) * step(0.0, -me.z));
      // the site's context (20 m DEM, +-32 km), then its 10 km region map: same centre, same axes
      vec2 uvc = (st - centre + hwContext) / (2.0 * hwContext);
      vec2 edgec = min(uvc, 1.0 - uvc);
      shade = mix(shade, texture2D(contextMap, uvc).r, hasContext * smoothstep(0.0, 0.03, min(edgec.x, edgec.y)));
      vec2 uv2 = (st - centre + hwRegion) / (2.0 * hwRegion);
      vec2 edge2 = min(uv2, 1.0 - uv2);
      float wRegion = hasRegion * smoothstep(0.0, 0.02, min(edge2.x, edge2.y));
      shade = mix(shade, texture2D(regionMap, uv2).r, wRegion);
      // the site's own heightmap (5 m where PGDA has a site DEM), shaded in the browser (moon.ts siteUV, siteHillshade)
      vec3 d = me - siteC;
      float cell = siteSpan / (sitePx - 1.0);
      vec2 uv3 = vec2((dot(d, siteE) * R + siteSpan * 0.5) / cell + 0.5, (siteSpan * 0.5 - dot(d, siteN) * R) / cell + 0.5) / sitePx;
      vec2 edge3 = min(uv3, 1.0 - uv3);
      float wSite = hasSite * smoothstep(0.0, 0.02, min(edge3.x, edge3.y));
      shade = mix(shade, texture2D(siteMap, uv3).r, wSite);
      vec3 sun = vec3(sunDir.x, -sunDir.z, sunDir.y);
      vec3 colour;
      float h0 = 0.0;
      float hs = 0.0; // h0 smoothed over its 4 neighbours a pixel away, for the Topo layer
      float hcell = cells.x;
      if (hasRPole + hasRGlobe < 0.5) {
        // no relief yet: the fixed-light hillshade, day and night split on the smooth sphere
        float lit = smoothstep(-0.0046, 0.0046, dot(q, sunDir)); // the Sun is a 0.53 degree disk
        colour = vec3(1.0, 0.985, 0.96) * shade * mix(${NIGHT.toFixed(2)}, 1.0, lit);
      } else {
        // the real Sun on the LOLA relief: Lommel-Seeliger reflectance on the slope, the Sun's disk over the terrain toward it
        h0 = relief(me, hcell);
        vec3 t1 = normalize(cross(abs(me.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0), me));
        vec3 t2 = cross(me, t1);
        float a = hcell / R;
        float c;
        float e1 = relief(me + t1 * a, c);
        float w1 = relief(me - t1 * a, c);
        float e2 = relief(me + t2 * a, c);
        float w2 = relief(me - t2 * a, c);
        float g1 = (e1 - w1) / (2.0 * hcell);
        float g2 = (e2 - w2) / (2.0 * hcell);
        hs = (2.0 * h0 + e1 + w1 + e2 + w2) / 6.0;
        vec3 n = normalize(me - g1 * t1 - g2 * t2);
        vec3 eye = normalize(vec3(cameraPosition.x, -cameraPosition.z, cameraPosition.y) - vec3(wpos.x, -wpos.z, wpos.y));
        float mu0 = dot(n, sun);
        float mu = max(dot(n, eye), 0.05);
        float alt = asin(clamp(dot(me, sun), -1.0, 1.0));
        float vis = mu0 > 0.0 ? sunVisible(me, h0 + 2.0, sun, alt, hcell) : 0.0;
        float ls = mu0 > 0.0 ? mu0 / (mu0 + mu) : 0.0;
        // display aids (About the data): an exposure curve, and ground out of the Sun drawn dim with the basemaps' fixed
        // light (from the image's upper left at 35 degrees, relief x3), from these heights, or from the 20 m region map
        // and the 5 m site heightmap's shading where those are loaded
        vec3 lh = vec3(0.7071, -0.7071, 0.0) - (0.7071 * me.x - 0.7071 * me.y) * me; // stereographic upper left, along the ground
        vec3 light = normalize(0.8192 * lh / max(length(lh), 1e-4) + 0.5736 * me);
        float fixedLit = pow(clamp(dot(normalize(me - 3.0 * (g1 * t1 + g2 * t2)), light), 0.0, 1.0), 2.2); // decoded like the PNGs
        float floorShade = mix(fixedLit, shade, max(wRegion, wSite));
        float v = max(1.0 - exp(-${EXPOSURE.toFixed(1)} * ls * vis), ${SHADOW_FLOOR.toFixed(2)} * floorShade);
        colour = vec3(1.0, 0.985, 0.96) * v;
      }
      if (topo > 0.5 && hasRPole + hasRGlobe > 0.5) {
        // Topo layer (D68): violet bands one contour apart, contour lines, every fifth one heavier
        float iv = hcell < 30.0 ? contour / 5.0 : contour;
        float band = clamp((floor(hs / iv) * iv - topoRange.x) / (topoRange.y - topoRange.x), 0.0, 1.0);
        float lum = clamp(dot(colour, vec3(0.333)), 0.0, 1.0);
        vec3 ramp = mix(vec3(0.024, 0.012, 0.089), vec3(0.6, 0.54, 0.9), band); // #2b1c54 to #cbc2f3, linear
        colour = ramp * (0.7 + 0.4 * lum); // the light stays readable under the bands
        // lines a pixel wide, faded out where they would crowd closer than a few pixels (no speckle)
        float fw = max(fwidth(hs), 1e-3);
        float line = (1.0 - smoothstep(0.5, 1.4, abs(fract(hs / iv + 0.5) - 0.5) * iv / fw)) * clamp(iv / (fw * 5.0) - 0.5, 0.0, 1.0);
        float major = (1.0 - smoothstep(1.0, 2.2, abs(fract(hs / (5.0 * iv) + 0.5) - 0.5) * 5.0 * iv / fw)) * clamp(iv / fw - 0.5, 0.0, 1.0);
        vec3 ink = band > 0.55 ? vec3(0.02, 0.01, 0.06) : vec3(0.95, 0.92, 1.0); // dark lines on light bands, light on dark
        colour = mix(colour, ink, max(line * 0.55, major * 0.9));
      }
      gl_FragColor = vec4(colour, 1.0);
      #include <colorspace_fragment>
    }`,
})
type Uniforms = ReturnType<typeof globeShader>['uniforms']

function useHillshade(file: string | undefined, onLoad: (t: THREE.Texture) => void) {
  const invalidate = useThree((s) => s.invalidate)
  const max = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  useEffect(() => {
    if (!file) return
    let live = true
    new THREE.TextureLoader().load(dataUrl(file), (t) => {
      if (!live) return t.dispose()
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = Math.min(8, max)
      onLoad(t)
      invalidate()
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])
}

/** A 16-bit relief grid as a linear RG8 texture (no mipmaps: they would round the high byte, moon.ts packRG8). */
function reliefTexture(values: Uint16Array, w: number, h: number, wrap: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(packRG8(values), w, h, THREE.RGFormat, THREE.UnsignedByteType)
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = false
  t.unpackAlignment = 2
  t.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}

/** A relief grid fetched and decoded once `file` is set; a failure leaves the coarser layers (nothing is lost). */
function useRelief(file: string | undefined, w: number, h: number, onLoad: (values: Uint16Array) => void) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!file) return
    let live = true
    loadHeightmap(file, w, h).then((v) => {
      if (!live) return
      onLoad(v)
      invalidate()
    }, () => undefined)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])
}

/** A square patch of the unit sphere in stereographic x/y (metres) around (cx, cy), n x n quads: dense where it is looked at. */
function stereoPatch(cx: number, cy: number, half: number, n: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, n, n)
  const pos = g.attributes.position as THREE.BufferAttribute
  for (let k = 0; k < pos.count; k++) pos.setXYZ(k, ...meToThree(xyToMe(cx + pos.getX(k) * 2 * half, cy + pos.getY(k) * 2 * half)))
  g.deleteAttribute('normal')
  g.computeBoundingSphere()
  return g
}

/** The relief grids loaded so far, coarse to fine, for picking and placing things on the raised terrain. */
export interface ReliefGrids {
  globe: ReliefGrid | null
  cap: ReliefGrid | null // the 75S polar DEM (D71)
  pole: ReliefGrid | null
  context: ReliefGrid | null
  site: ReliefGrid | null
}

function Globe({ data, hour, region, exag, topo, grids, onGrids }: {
  data: Dataset; hour: number; region: Site | null; exag: number; topo: boolean; grids: React.RefObject<ReliefGrids>; onGrids: () => void
}) {
  const relief = data.basemap.relief
  const materials = useMemo(() => {
    const base = globeShader()
    // one uniform set, four clip modes (globe, 75S cap, polar patch, context): each leaves the inside of the next finer one to it
    return [0, 1, 2, 3].map((clip) => new THREE.ShaderMaterial({ ...base, uniforms: { ...base.uniforms, clip: { value: clip } }, side: clip ? THREE.DoubleSide : THREE.FrontSide }))
  }, [])
  const material = materials[0]
  // a software renderer (CI, old machines) gets coarser patches and a short shadow march; GPUs get the full detail
  const gl = useThree((s) => s.gl)
  const soft = useMemo(() => {
    const ctx = gl.getContext()
    const info = ctx.getExtension('WEBGL_debug_renderer_info')
    return /swiftshader|llvmpipe|software/i.test(String(info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)))
  }, [gl])
  const segs = soft ? 160 : 512
  // Rotated so the mesh's own poles (where its triangles pinch) sit on the lunar equator, not under the view. 1 degree
  // facets for the whole Moon (2 on software renderers); the polar caps and a site's context have dense patches (D67, D71).
  const geometry = useMemo(() => (soft ? new THREE.SphereGeometry(1, 180, 90) : new THREE.SphereGeometry(1, 360, 180)).rotateX(Math.PI / 2), [soft])
  const capPatch = useMemo(() => (relief?.cap ? stereoPatch(0, 0, relief.cap.half_width_m, segs) : null), [relief, segs])
  const polePatch = useMemo(() => stereoPatch(0, 0, data.basemap.pole.half_width_m, segs), [data, segs])
  const ctxPatch = useMemo(() => {
    if (!region) return null
    const [x, y] = xyOf(region)
    return stereoPatch(x, y, data.basemap.context?.half_width_m ?? relief?.context.half_width_m ?? 32_000, segs)
  }, [region, data, relief, segs])
  useEffect(() => () => ctxPatch?.dispose(), [ctxPatch])
  useEffect(() => () => capPatch?.dispose(), [capPatch])
  useEffect(() => () => {
    geometry.dispose()
    polePatch.dispose()
    materials.forEach((m) => m.dispose())
  }, [geometry, polePatch, materials])
  const uniforms = useCallback(() => material.uniforms as Uniforms, [material])
  const invalidate = useThree((s) => s.invalidate)
  const [poleReady, setPoleReady] = useState(false)
  const [poleRelief, setPoleRelief] = useState(false)
  const textures = useRef<THREE.Texture[]>([])
  useEffect(() => {
    const loaded = textures.current
    return () => loaded.forEach((t) => t.dispose())
  }, [])
  useLayoutEffect(() => {
    uniforms().steps.value = soft ? 6 : 40
  }, [soft, uniforms])
  useLayoutEffect(() => {
    const u = uniforms()
    u.hwPole.value = data.basemap.pole.half_width_m / R_M
    u.hwRegion.value = data.basemap.regions.half_width_m / R_M
    u.hwContext.value = (data.basemap.context?.half_width_m ?? relief?.context.half_width_m ?? 1) / R_M
    u.hwCap.value = (relief?.cap?.half_width_m ?? R_M) / R_M
    u.capMesh.value = relief?.cap ? 1 : 0
    // the ephemeris is already in MOON_ME: only the change of axes is applied
    const i = hour * EPHEM_STRIDE
    u.sunDir.value.set(...meToThree([data.ephemeris[i], data.ephemeris[i + 1], data.ephemeris[i + 2]]))
    u.exag.value = exag
    u.ctxMesh.value = region ? 1 : 0
    // Topo layer: contours and the colour ramp's range follow the level (D68)
    u.topo.value = topo ? 1 : 0
    u.contour.value = contourInterval(region ? 'site' : 'pole')
    const r = topoRange(relief, region)
    u.topoRange.value.set(r[0], r[1])
    invalidate()
  }, [uniforms, data, hour, exag, topo, region, relief, invalidate])
  useHillshade(data.basemap.pole.file, (t) => {
    const u = uniforms()
    u.poleMap.value = t
    textures.current.push(t)
    u.hasPole.value = 1
    setPoleReady(true)
  })
  // the whole Moon (about 2 MB) only after the polar map: the first frame does not wait for it
  useHillshade(poleReady && !relief ? data.basemap.globe?.file : undefined, (t) => {
    const u = uniforms()
    t.wrapS = THREE.RepeatWrapping // the shader's second longitude seam runs from -0.5 to 0.5
    u.globeMap.value = t
    textures.current.push(t)
    u.hasGlobe.value = 1
  })
  // relief (D67): the polar cap's grid after the polar map, the whole Moon's after that
  useRelief(poleReady ? relief?.pole.file : undefined, relief?.pole.size_px ?? 0, relief?.pole.size_px ?? 0, (v) => {
    const u = uniforms()
    const p = relief!.pole
    const t = reliefTexture(v, p.size_px, p.size_px, false)
    textures.current.push(t)
    u.rPole.value = t
    u.osPole.value.set(p.offset_m, p.scale_m)
    u.cells.value.y = (2 * p.half_width_m) / p.size_px
    u.hasRPole.value = 1
    grids.current.pole = { kind: 'stereo', values: v, n: p.size_px, cx: 0, cy: 0, half: p.half_width_m, offset: p.offset_m, scale: p.scale_m }
    setPoleRelief(true)
    onGrids()
  })
  // then the 75S cap (D71), about 5 MB, which carries the terrain out to 75S at 480 m
  const [capRelief, setCapRelief] = useState(false)
  useRelief(poleRelief ? relief?.cap?.file : undefined, relief?.cap?.size_px ?? 0, relief?.cap?.size_px ?? 0, (v) => {
    const u = uniforms()
    const c = relief!.cap!
    const t = reliefTexture(v, c.size_px, c.size_px, false)
    textures.current.push(t)
    u.rCap.value = t
    u.osCap.value.set(c.offset_m, c.scale_m)
    u.cellCap.value = (2 * c.half_width_m) / c.size_px
    u.hasRCap.value = 1
    grids.current.cap = { kind: 'stereo', values: v, n: c.size_px, cx: 0, cy: 0, half: c.half_width_m, offset: c.offset_m, scale: c.scale_m }
    setCapRelief(true)
    onGrids()
  })
  const [gw, gh] = relief ? globeSize(relief) : [0, 0]
  useRelief((relief?.cap ? capRelief : poleRelief) ? relief?.globe.file : undefined, gw, gh, (v) => {
    const u = uniforms()
    const g = relief!.globe
    const t = reliefTexture(v, gw, gh, true)
    textures.current.push(t)
    u.rGlobe.value = t
    u.osGlobe.value.set(g.offset_m, g.scale_m)
    u.cells.value.x = (2 * Math.PI * R_M) / gw
    u.hasRGlobe.value = 1
    grids.current.globe = { kind: 'globe', values: v, w: gw, h: gh, offset: g.offset_m, scale: g.scale_m }
    onGrids()
  })
  // the site's heightmap (about 2 MB), shaded here like the basemaps and used as the finest relief, only once the
  // camera comes within about 8 km of the site: from farther away the 20 m maps already match the screen (D62)
  const hm = region?.heightmap ?? null
  const [closeTo, setCloseTo] = useState<string | null>(null)
  const siteVec = useMemo(() => (region ? new THREE.Vector3(...meToThree(latLonToMe(region.lat, region.lon))) : null), [region])
  useFrame(({ camera }) => {
    // the camera rides higher over raised terrain: the distance allows for the exaggerated height
    if (region && siteVec && closeTo !== region.id && camera.position.distanceTo(siteVec) < (8 + 3 * exag) / R_MOON_KM) setCloseTo(region.id)
  })
  const near = Boolean(region && closeTo === region.id)
  useEffect(() => {
    const u = uniforms()
    u.hasSite.value = 0
    u.hasRSite.value = 0
    grids.current.site = null
    if (!region || !hm || !near) return
    let live = true
    loadHeightmap(hm.file, hm.size_px).then((heights) => {
      if (!live) return
      const n = hm.size_px
      const grey = siteHillshade(heights, n, hm.span_m / (n - 1), hm.scale_m, region.lon)
      const rgba = new Uint8Array(n * n * 4)
      for (let k = 0; k < n * n; k++) rgba.set([grey[k], grey[k], grey[k], 255], k * 4)
      const t = new THREE.DataTexture(rgba, n, n, THREE.RGBAFormat)
      t.colorSpace = THREE.SRGBColorSpace // decoded like the PNG basemaps, so the layers match
      t.generateMipmaps = true
      t.minFilter = THREE.LinearMipmapLinearFilter
      t.magFilter = THREE.LinearFilter
      t.needsUpdate = true
      const f = siteFrame(region.lat, region.lon, 0)
      ;(u.siteMap.value as THREE.Texture | null)?.dispose()
      ;(u.rSite.value as THREE.Texture | null)?.dispose()
      u.siteMap.value = t
      u.rSite.value = reliefTexture(heights, n, n, false)
      u.osSite.value.set(hm.offset_m, hm.scale_m)
      u.cells.value.w = hm.span_m / (n - 1)
      const c = latLonToMe(region.lat, region.lon)
      u.siteC.value.set(...c)
      u.siteE.value.set(...f.east)
      u.siteN.value.set(...f.north)
      u.sitePx.value = n
      u.siteSpan.value = hm.span_m
      u.hasSite.value = 1
      u.hasRSite.value = 1
      grids.current.site = { kind: 'site', values: heights, n, frame: f, centre: c, span: hm.span_m, offset: hm.offset_m, scale: hm.scale_m }
      onGrids()
      invalidate()
    }, () => undefined) // without it the 20 m region map stays: nothing is lost
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, hm, near, uniforms, invalidate])
  // a new site: hide the old site's context and region maps and relief until the new ones arrive (they share one centre)
  const regionId = region?.id
  useLayoutEffect(() => {
    const u = uniforms()
    u.hasContext.value = 0
    u.hasRegion.value = 0
    u.hasRCtx.value = 0
    grids.current.context = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId, uniforms])
  const setCentre = (s: Site) => {
    const [x, y] = xyOf(s)
    uniforms().centre.value.set(x / R_M, y / R_M)
  }
  // the site's context map, fetched when the site is flown to
  useHillshade(region && !relief ? data.basemap.context?.files[region.id] : undefined, (t) => {
    const u = uniforms()
    setCentre(region!)
    u.contextMap.value = t
    textures.current.push(t)
    u.hasContext.value = 1
  })
  // and its context relief (+-32 km at 62.5 m)
  const ctxFile = region ? relief?.context.files[region.id] : undefined
  useRelief(ctxFile?.file, relief?.context.size_px ?? 0, relief?.context.size_px ?? 0, (v) => {
    const u = uniforms()
    const c = relief!.context
    const [x, y] = xyOf(region!)
    setCentre(region!)
    ;(u.rCtx.value as THREE.Texture | null)?.dispose()
    u.rCtx.value = reliefTexture(v, c.size_px, c.size_px, false)
    u.osCtx.value.set(ctxFile!.offset_m, ctxFile!.scale_m)
    u.cells.value.z = (2 * c.half_width_m) / c.size_px
    u.hasRCtx.value = 1
    grids.current.context = { kind: 'stereo', values: v, n: c.size_px, cx: x, cy: y, half: c.half_width_m, offset: ctxFile!.offset_m, scale: ctxFile!.scale_m }
    onGrids()
  })
  // one region's hillshade at a time, fetched when its site is first flown to
  useHillshade(region ? data.basemap.regions.files[region.id] : undefined, (t) => {
    const u = uniforms()
    setCentre(region!)
    u.regionMap.value = t // the previous region's texture is released with the view
    textures.current.push(t)
    u.hasRegion.value = 1
  })
  return (
    <>
      <mesh geometry={geometry} material={materials[0]} frustumCulled={false} />
      {capPatch && <mesh geometry={capPatch} material={materials[1]} frustumCulled={false} />}
      <mesh geometry={polePatch} material={materials[2]} frustumCulled={false} />
      {ctxPatch && <mesh geometry={ctxPatch} material={materials[3]} frustumCulled={false} />}
    </>
  )
}

/** The globe relief grid's size: equirectangular, 2:1. */
const globeSize = (r: Relief): [number, number] => [r.globe.width_px, r.globe.width_px / 2]

/** The Topo ramp's height range: the polar grid's at pole level, the site's context grid's once flown down. */
function topoRange(relief: Relief | undefined, region: Site | null): [number, number] {
  const f = region ? relief?.context.files[region.id] : relief?.pole
  return f ? [f.offset_m, f.max_m] : [-8000, 8000]
}

/** Stereographic x/y in metres of a site, through the same vector the shader uses. */
const xyOf = (s: { lat: number; lon: number }): [number, number] => {
  const m = latLonToMe(s.lat, s.lon)
  return [(2 * R_MOON_KM * 1000 * m[1]) / (1 - m[2]), (2 * R_MOON_KM * 1000 * m[0]) / (1 - m[2])]
}
const vecOf = (lat: number, lon: number) => new THREE.Vector3(...meToThree(latLonToMe(lat, lon)))

type Controls = { enabled: boolean }

/** Camera: orbit at the current level, and the fly between levels. Controls are rebuilt per level, because they read `camera.up` once. */
function Rig({ dest, destKey, zoomed, controls, ground }: {
  dest: Pose; destKey: string; zoomed: boolean; controls: React.RefObject<Controls | null>
  ground: React.RefObject<(dir: THREE.Vector3) => number> // radius of the raised ground under a direction
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const invalidate = useThree((s) => s.invalidate)
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    camera.setViewOffset(size.width, size.height, 0, -DROP * size.height, size.width, size.height)
    invalidate()
  }, [camera, size, invalidate])
  const [settled, setSettled] = useState<string | null>(null)
  const look = useRef(POLE.clone())
  const flight = useRef<{ from: Pose; to: Pose; t0: number | null; key: string; pole: boolean } | null>(null)
  const first = useRef(true)

  useLayoutEffect(() => {
    const near = (v: number) => {
      camera.near = v
      camera.updateProjectionMatrix()
    }
    const place = (to: Pose) => {
      camera.position.copy(to.pos)
      camera.up.copy(to.up)
      camera.lookAt(to.target)
      look.current.copy(to.target)
    }
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // the view opens at the pole; opened straight onto a site ("Show on the Moon"), it flies down from there
    if (first.current && zoomed && !still) place(polePose())
    if ((first.current && !zoomed) || still) {
      flight.current = null
      place(dest)
      near(zoomed ? NEAR_SITE : NEAR_POLE)
      setSettled(destKey)
    } else {
      flight.current = { from: { pos: camera.position.clone(), target: look.current.clone(), up: camera.up.clone() }, to: dest, t0: null, key: destKey, pole: !zoomed }
      near(NEAR_SITE)
      setSettled(null)
    }
    first.current = false
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destKey])

  // the raised ground moved under a settled view (the height slider): carry the camera with its target
  const lastTarget = useRef(dest.target.clone())
  useLayoutEffect(() => {
    if (settled === destKey && !flight.current && !lastTarget.current.equals(dest.target)) {
      camera.position.add(dest.target.clone().sub(lastTarget.current))
      invalidate()
    }
    lastTarget.current.copy(dest.target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dest])

  useFrame(() => {
    const f = flight.current
    if (!f) {
      // never below the raised terrain: the camera stays 300 m over the ground under it
      const floor = ground.current(camera.position.clone().normalize()) + km(0.3)
      if (camera.position.length() < floor) {
        camera.position.setLength(floor)
        invalidate()
      }
      return
    }
    f.t0 ??= performance.now()
    const t = Math.min(1, (performance.now() - f.t0) / FLY_MS)
    const e = easeInOut(t)
    const [a, b] = [f.from.pos, f.to.pos]
    // direction linear, altitude geometric: it reads as a zoom, not a slide
    camera.position.set(...flyPose(a.clone().normalize().toArray(), a.length() - 1, b.clone().normalize().toArray(), b.length() - 1, e))
    camera.up.lerpVectors(f.from.up, f.to.up, e).normalize()
    look.current.lerpVectors(f.from.target, f.to.target, e).normalize()
    camera.lookAt(look.current)
    if (t < 1) return invalidate()
    flight.current = null
    if (f.pole) {
      camera.near = NEAR_POLE
      camera.updateProjectionMatrix()
    }
    setSettled(f.key)
  })

  if (settled !== destKey) return null
  return (
    <OrbitControls key={destKey} ref={controls as never} target={dest.target} enablePan={false} enableDamping={false}
      minDistance={zoomed ? km(2.6) : 0.12} maxDistance={zoomed ? km(60) : 2.4} maxPolarAngle={zoomed ? 1.38 : 1.3} zoomSpeed={zoomed ? 0.8 : 0.6} />
  )
}

/**
 * The BSC5 star field around the camera, turned into the Moon's axes for the hour (positions and brightness are
 * data; colours approximate, as in the ground view). Drawn first without depth, so the Moon covers it like a sky.
 */
function Stars({ sky }: { sky: { matrix: number[]; stars: Float32Array } }) {
  const group = useMemo(() => {
    const g = starField(sky.stars, 5)
    g.renderOrder = -1
    g.traverse((o) => {
      const m = (o as THREE.Points).material as THREE.PointsMaterial | undefined
      if (m) {
        m.depthTest = false
        m.depthWrite = false
      }
      o.renderOrder = -1
    })
    return g
  }, [sky.stars])
  useEffect(() => () => group.traverse((o) => {
    const p = o as THREE.Points
    p.geometry?.dispose()
    ;(p.material as THREE.Material | undefined)?.dispose()
  }), [group])
  const invalidate = useThree((s) => s.invalidate)
  const m = sky.matrix
  const rotation = useMemo(() => new THREE.Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1), [m])
  useEffect(() => invalidate(), [rotation, invalidate])
  const live = useRef<THREE.Group>(null)
  useFrame(({ camera }) => {
    const g = live.current
    if (!g) return
    g.matrix.copy(rotation).setPosition(camera.position) // stars are infinitely far: they move with the eye
    g.matrixWorldNeedsUpdate = true
  }, -1)
  return <primitive ref={live} object={group} />
}

type Paint = (camera: THREE.Camera, size: { width: number; height: number }) => void

/** Runs the 2D overlay after the camera has moved, and asks for a frame whenever the view's props change. */
function Painter({ paint }: { paint: React.RefObject<Paint | null> }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate())
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld()
    paint.current?.(camera, size)
  })
  return null
}

// Hand-tuned label offsets (px from the pin's true position; negative x puts the label on the left). The Shackleton rim
// site and the peak beside it are 400 m apart, so their labels hang below, one to each side.
const LABEL_AT: Record<string, [number, number]> = {
  'change7-shackleton-rim': [12, 20], 'peak-near-shackleton': [-12, 20], 'connecting-ridge': [-14, -4], 'faustini-rim-a': [14, 0],
  haworth: [-14, 0], 'malapert-massif': [-12, -12], 'im2-mons-mouton': [12, -14], 'nobile-rim-1': [14, 6], 'nobile-rim-2': [14, 0],
}
const km1 = (m: number) => `${(m / 1000).toFixed(1).replace('-', '−')} km`
const short = (name: string) => name.replace(/ \(.*\)$/, '')

function failing(v: Verdict): string[] {
  return Object.entries(v.evaluation.passes).filter(([, ok]) => !ok).map(([id]) => LABELS[id].name)
}

/** The numbers for one point, all from the engine. */
function Numbers({ v }: { v: Verdict }) {
  const fails = failing(v)
  return (
    <>
      <span>Sunlit {v.metrics.sunlitPct.toFixed(1)}% · Earth {v.metrics.earthPct.toFixed(1)}% · longest dark {v.metrics.longestDarkH} h</span>
      <span className={fails.length ? 'bad' : 'ok'}>{fails.length ? `Fails: ${fails.join(', ')}` : 'Meets every constraint'}</span>
    </>
  )
}

/**
 * The south polar region as an orbitable globe: every curated site is a pin, a pin flies down to its 10 km search grid,
 * and the landing point is dragged on the grid. The renderer supplies positions only; colours, labels and numbers
 * come from the engine through the props.
 */
function MoonView({ data, hour, when, zoomed, focus, marker, draggable, pins, grid, badges, constraints, sunEl, earthEl, onSite, onBack, onPick, onNudge, onStand, onStandAt, onPin, viewPinned, canPin, sky, host, children }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const markerEl = useRef<HTMLButtonElement>(null)
  const sunLabel = useRef<HTMLSpanElement>(null)
  const earthLabel = useRef<HTMLSpanElement>(null)
  const pinEls = useRef<Record<string, HTMLElement | null>>({})
  const cam = useRef<THREE.Camera | null>(null)
  const controls = useRef<Controls | null>(null)
  const paint = useRef<Paint | null>(null)
  const markerAt = useRef<[number, number] | null>(null)
  const dotAt = useRef<(index: number) => readonly [number, number] | null>(() => null)
  const [layer, setLayer] = useState<Layer>('verdict')
  const [exag, setExag] = useState(1) // relief height exaggeration (D67; true height by default, D71): geometry only, never a number
  const [topo, setTopo] = useState(false) // Topo layer (D68)
  const cursorEl = useRef<HTMLSpanElement>(null)
  // the relief grids loaded so far (Globe fills them), and a counter that re-places everything when one arrives
  const grids = useRef<ReliefGrids>({ globe: null, cap: null, pole: null, context: null, site: null })
  const [gridsVersion, setGridsVersion] = useState(0)
  const onGrids = useCallback(() => setGridsVersion((k) => k + 1), [])
  const raised = gridsVersion > 0 && Boolean(grids.current.pole || grids.current.cap || grids.current.globe)
  const lift = raised ? exag : 0 // the exaggeration the meshes are drawn with right now
  /** Height in metres of the finest loaded grid under a MOON_ME direction. */
  const heightAt = useCallback((me: Vec3) => {
    const g = grids.current
    return reliefAt([g.globe, g.cap, g.pole, g.context, g.site], me)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridsVersion])
  /** A unit-sphere point raised onto the drawn terrain, by a known height in metres or the grids' own. */
  const raise = useCallback(
    (v: THREE.Vector3, heightM?: number) => v.clone().multiplyScalar(1 + (lift * (heightM ?? heightAt(threeToMe(v.toArray() as Vec3)) ?? 0)) / R_M),
    [lift, heightAt],
  )
  const ground = useRef<(dir: THREE.Vector3) => number>(() => 1)
  useLayoutEffect(() => {
    ground.current = (dir) => 1 + (lift * (heightAt(threeToMe(dir.toArray() as Vec3)) ?? 0)) / R_M
  }, [lift, heightAt])
  const [hover, setHover] = useState<{ index: number; x: number; y: number; up: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)

  const [poleVisit, setPoleVisit] = useState(0) // the Pole button at pole level flies back to the home pose after an orbit
  const focusElev = useMemo(
    () => data.points.find((p) => p.region === focus.id && p.index === data.centreIndex)?.elev_m ?? heightAt(latLonToMe(focus.lat, focus.lon)) ?? 0,
    [data, focus, heightAt],
  )
  const dest = useMemo(() => (zoomed ? sitePose(focus.lat, focus.lon, 1 + (lift * focusElev) / R_M) : polePose()), [zoomed, focus, lift, focusElev])
  const destKey = zoomed ? focus.id : `pole${poleVisit}`
  const toPole = () => (zoomed ? onBack() : setPoleVisit((n) => n + 1))
  const centre = useMemo(() => xyOf(focus), [focus])
  const pinVecs = useMemo(() => new Map(data.sites.map((s) => [s.id, raise(vecOf(s.lat, s.lon))])), [data, raise])
  const n = 2 * data.centreIndex + 1
  const side = Math.sqrt(n)
  /** The focus site's grid points by index, on the unit sphere. */
  const dots = useMemo(() => {
    const out: (THREE.Vector3 | null)[] = new Array(n).fill(null)
    const point: Point[] = new Array(n)
    const cells: THREE.Vector3[][] = new Array(n)
    const half = 250 // half a grid step: a point's cell
    for (const p of data.points) if (p.region === focus.id) {
      // on the raised terrain, at the point's own LOLA height
      out[p.index] = raise(new THREE.Vector3(...meToThree(xyToMe(p.x, p.y))), p.elev_m)
      point[p.index] = p
      cells[p.index] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => raise(new THREE.Vector3(...meToThree(xyToMe(p.x + sx * half, p.y + sy * half))), p.elev_m))
    }
    return { vec: out, point, cells }
  }, [data, focus, n, raise])
  const badgeVecs = useMemo(() => badges.map((b) => raise(vecOf(b.lat, b.lon))), [badges, raise])
  const rings = useMemo(() => [-85, -88].map((lat) => ({ lat, line: Array.from({ length: 121 }, (_, k) => raise(vecOf(lat, k * 3))) })), [raise])
  const stats = zoomed && grid?.region === focus.id ? grid : null

  // --- the 2D overlay and the projected DOM elements, redrawn after every camera move
  useLayoutEffect(() => {
  paint.current = (camera, size) => {
    const cv = overlay.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const [w, h] = [Math.round(size.width * dpr), Math.round(size.height * dpr)]
    if (cv.width !== w || cv.height !== h) [cv.width, cv.height] = [w, h]
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, size.width, size.height)
    const eye = camera.position
    const v = new THREE.Vector3()
    /** Screen position of a point on the (raised) surface, or null behind the limb or the camera. */
    const at = (p: THREE.Vector3): readonly [number, number] | null => {
      if (p.dot(eye) < p.lengthSq()) return null
      v.copy(p).project(camera)
      if (v.z < -1 || v.z > 1) return null
      return [(v.x * 0.5 + 0.5) * size.width, (0.5 - v.y * 0.5) * size.height]
    }
    const place = (el: HTMLElement | null, xy: readonly [number, number] | null) => {
      if (!el) return
      el.style.visibility = xy ? 'visible' : 'hidden'
      if (xy) el.style.transform = `translate(${xy[0].toFixed(1)}px, ${xy[1].toFixed(1)}px)`
    }
    const halo = (text: string, x: number, y: number, fill: string) => {
      g.lineWidth = 3
      g.strokeStyle = 'rgb(5 6 8 / 85%)'
      g.strokeText(text, x, y)
      g.fillStyle = fill
      g.fillText(text, x, y)
    }
    g.font = '600 11px "Public Sans", system-ui, sans-serif'
    g.textBaseline = 'middle'

    if (!zoomed) {
      // latitude circles for scale, and the pole itself
      g.lineWidth = 1
      for (const r of rings) {
        g.strokeStyle = 'rgb(236 232 225 / 16%)'
        g.beginPath()
        let pen = false
        for (const p of r.line) {
          const xy = at(p)
          if (xy && pen) g.lineTo(xy[0], xy[1])
          else if (xy) g.moveTo(xy[0], xy[1])
          pen = Boolean(xy)
        }
        g.stroke()
        const top = at(r.line[0])
        if (top) halo(`${-r.lat}°S`, top[0] + 5, top[1] - 8, 'rgb(236 232 225 / 60%)')
      }
    }

    // grid dots: colour from the engine's per-point results, position from the grid
    const c0 = at(dots.vec[data.centreIndex] ?? POLE)
    const c1 = at(dots.vec[data.centreIndex + 1] ?? POLE)
    const spacing = c0 && c1 ? Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) : 0
    const r = Math.min(8, Math.max(1.6, spacing * 0.27))
    dotAt.current = (index) => (dots.vec[index] ? at(dots.vec[index]!) : null)
    if (stats && spacing >= 4) {
      for (let k = 0; k < n; k++) {
        const p = dots.vec[k]
        const xy = p && at(p)
        if (!xy) continue
        const verdict = stats.verdicts[k]
        if (layer !== 'verdict') {
          // the heat map (F15): each 500 m cell filled with its engine value, the terrain showing through, a hairline gap
          const corners = dots.cells[k]?.map(at)
          if (!corners || corners.some((c) => !c)) continue
          const [cx, cy] = [corners.reduce((a, c) => a + c![0], 0) / 4, corners.reduce((a, c) => a + c![1], 0) / 4]
          g.beginPath()
          corners.forEach((c, j) => (j ? g.lineTo : g.moveTo).call(g, cx + (c![0] - cx) * 0.94, cy + (c![1] - cy) * 0.94))
          g.closePath()
          g.globalAlpha = 0.72
          g.fillStyle = layer === 'sun' ? colour(stats.sun[k], 100, SUN_RAMP) : colour(stats.earth[k], 100, EARTH_RAMP)
          g.fill()
          g.globalAlpha = 1
          continue
        }
        g.beginPath()
        g.arc(xy[0], xy[1], r, 0, 2 * Math.PI)
        {
          // pass = solid, fail = hollow: the shape carries it, not only the colour
          if (verdict && verdict.evaluation.fails === 0) {
            g.fillStyle = OK
            g.fill()
          } else {
            g.lineWidth = Math.max(1.2, r * 0.3)
            g.strokeStyle = verdict ? BAD : 'rgb(236 232 225 / 40%)'
            g.stroke()
          }
        }
      }
      if (hover) {
        const xy = dotAt.current(hover.index)
        if (xy) {
          g.beginPath()
          g.arc(xy[0], xy[1], r + 3, 0, 2 * Math.PI)
          g.lineWidth = 1.5
          g.strokeStyle = TEXT
          g.stroke()
        }
      }
    }

    // Sun and Earth bearings from the pole, or from the landing point once zoomed in; the elevations beside them are the engine's
    const origin = zoomed && marker ? dots.vec[marker.index] ?? POLE : POLE
    const o = at(origin)
    const length = zoomed ? km(3.2) : 0.055
    const bearing = (offset: number, el: HTMLElement | null, stroke: string, below: boolean) => {
      const d = new THREE.Vector3(...meToThree([data.ephemeris[hour * EPHEM_STRIDE + offset], data.ephemeris[hour * EPHEM_STRIDE + offset + 1], data.ephemeris[hour * EPHEM_STRIDE + offset + 2]]))
      d.addScaledVector(origin, -d.dot(origin)).normalize() // the direction along the ground
      const tip = at(d.multiplyScalar(length).add(origin).setLength(origin.length()))
      if (o && tip) {
        g.setLineDash(below ? [4, 4] : []) // dashed while the body is below the level horizon
        g.lineWidth = 2
        g.strokeStyle = stroke
        g.beginPath()
        g.moveTo(o[0], o[1])
        g.lineTo(tip[0], tip[1])
        g.stroke()
        g.setLineDash([])
      }
      place(el, o && tip)
    }
    bearing(0, sunLabel.current, SUN, sunEl < 0)
    bearing(3, earthLabel.current, EARTH, earthEl < 0)

    // finder results (rank in a dashed ring) and tray pins (column letter); ones that would land on top of each other are skipped
    const drawn: (readonly [number, number])[] = []
    badges.forEach((b, k) => {
      const xy = at(badgeVecs[k])
      if (!xy) return
      if (b.kind === 'result') {
        if (drawn.some((d) => Math.hypot(d[0] - xy[0], d[1] - xy[1]) < 20)) return
        drawn.push(xy)
        g.setLineDash([3, 3])
        g.lineWidth = 1.5
        g.strokeStyle = TEXT
        g.beginPath()
        g.arc(xy[0], xy[1], 11, 0, 2 * Math.PI)
        g.stroke()
        g.setLineDash([])
        halo(b.text, xy[0] + 13, xy[1] - 11, TEXT)
      } else {
        // letters of pins at (nearly) the same place sit side by side
        const near = badges.slice(0, k).filter((q, j) => {
          const other = q.kind === 'tray' ? at(badgeVecs[j]) : null
          return other !== null && Math.hypot(other[0] - xy[0], other[1] - xy[1]) < 12
        }).length
        const x = xy[0] - 22 - 18 * near
        g.strokeStyle = TEXT
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(xy[0], xy[1])
        g.lineTo(x + 8, xy[1] + 14)
        g.stroke()
        g.fillStyle = TEXT
        g.beginPath()
        g.roundRect(x, xy[1] + 6, 16, 16, 4)
        g.fill()
        g.fillStyle = '#141416'
        g.textAlign = 'center'
        g.fillText(b.text, x + 8, xy[1] + 14.5)
        g.textAlign = 'left'
      }
    })

    // site pins: a dot at the true position, a leader to the label
    for (const p of pins) {
      const xy = zoomed && p.site.id === focus.id ? null : at(pinVecs.get(p.site.id)!)
      place(pinEls.current[p.site.id] ?? null, xy)
      if (!xy) continue
      const [dx, dy] = LABEL_AT[p.site.id] ?? [14, 0]
      g.strokeStyle = 'rgb(236 232 225 / 55%)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(xy[0], xy[1])
      g.lineTo(xy[0] + dx, xy[1] + dy)
      g.stroke()
      g.fillStyle = TEXT
      g.beginPath()
      g.arc(xy[0], xy[1], 2.5, 0, 2 * Math.PI)
      g.fill()
    }

    const m = zoomed && marker && dots.vec[marker.index] ? at(dots.vec[marker.index]!) : null
    markerAt.current = m ? [m[0], m[1]] : null
    place(markerEl.current, m)
  }
  })

  // --- picking: ray through the pointer onto the exact unit sphere, then the 500 m grid
  const pick = (e: { clientX: number; clientY: number }) => {
    const camera = cam.current
    const box = root.current?.getBoundingClientRect()
    if (!camera || !box) return null
    const far = new THREE.Vector3(((e.clientX - box.left) / box.width) * 2 - 1, 1 - ((e.clientY - box.top) / box.height) * 2, 0.5).unproject(camera)
    // on the terrain as drawn: the ray meets the raised ground, not the sphere under it (D67)
    return pickGrid(camera.position.toArray(), far.sub(camera.position).normalize().toArray(), centre[0], centre[1], side, 500, raised ? heightAt : undefined, lift)
  }
  /** The Topo legend's height under the pointer: LOLA, from the finest loaded grid. */
  const showHeight = (e: { clientX: number; clientY: number } | null) => {
    const el = cursorEl.current
    if (!el) return
    const p = e && pick(e)
    const h = p ? heightAt(latLonToMe(p.lat, p.lon)) : null
    el.textContent = h === null ? 'point at the terrain for its height' : `${Math.round(h).toLocaleString('en-US').replace('-', '−')} m under the pointer`
  }
  const live = useRef({ pick, onPick, zoomed, draggable, showHeight })
  useLayoutEffect(() => {
    live.current = { pick, onPick, zoomed, draggable, showHeight }
  })

  useEffect(() => {
    const el = root.current!
    let drag = false
    let last = ''
    let downAt: [number, number] | null = null
    const onCanvas = (t: EventTarget | null) => t instanceof Element && !t.closest('button')
    const down = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY]
      const m = markerAt.current
      const box = el.getBoundingClientRect()
      const { zoomed, draggable } = live.current
      if (!zoomed || !draggable || !m || e.button !== 0) return
      if (Math.hypot(e.clientX - box.left - m[0], e.clientY - box.top - m[1]) > GRAB_PX) return
      if (!(onCanvas(e.target) || (e.target as Element).closest('.moon-marker'))) return
      // the marker beats the orbit controls: they never see this press
      e.stopImmediatePropagation()
      e.preventDefault()
      if (controls.current) controls.current.enabled = false
      el.setPointerCapture(e.pointerId)
      markerEl.current?.focus({ preventScroll: true })
      drag = true
      last = ''
      setDragging(true)
      setHover(null)
    }
    const move = (e: PointerEvent) => {
      const { zoomed, pick, onPick, showHeight } = live.current
      if (!e.buttons) showHeight(onCanvas(e.target) ? e : null)
      if (drag) {
        const p = pick(e)
        if (!p || `${p.index}:${p.outside}` === last) return
        last = `${p.index}:${p.outside}`
        return onPick(p.lat, p.lon, p.outside)
      }
      if (!zoomed || e.buttons || !onCanvas(e.target)) return setHover(null)
      const p = pick(e)
      const xy = p && !p.outside ? dotAt.current(p.index) : null
      setHover((h) => (p && xy ? (h?.index === p.index ? h : { index: p.index, x: xy[0], y: xy[1], up: xy[1] > el.clientHeight / 2 }) : null))
    }
    const up = (e: PointerEvent) => {
      if (!drag) return
      drag = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (controls.current) controls.current.enabled = true
      setDragging(false)
    }
    // a click (not an orbit drag) on a grid dot moves the landing point there
    const click = (e: MouseEvent) => {
      const { zoomed, draggable, pick, onPick } = live.current
      if (!zoomed || !draggable || !downAt || !onCanvas(e.target) || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return
      const p = pick(e)
      if (p && !p.outside) onPick(p.lat, p.lon, false)
    }
    const leave = () => {
      setHover(null)
      live.current.showHeight(null)
    }
    el.addEventListener('pointerdown', down, true)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('click', click)
    return () => {
      el.removeEventListener('pointerdown', down, true)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('click', click)
    }
  }, [])

  const markerKey = (e: React.KeyboardEvent) => {
    const dir = ({ ArrowUp: 'N', ArrowRight: 'E', ArrowDown: 'S', ArrowLeft: 'W' } as const)[e.key as 'ArrowUp']
    if (dir && draggable) {
      e.preventDefault()
      onNudge(dir)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onStand()
    }
  }

  const relief = data.basemap.relief
  const range = topoRange(relief, zoomed ? focus : null)
  const interval = contourInterval(zoomed ? 'site' : 'pole')
  const foot = (
    <div className="moon-foot">
      <div className="moon-notes">{children}</div>
      {topo && relief && (
        <span className="note moon-topo" data-testid="moon-topo-legend">
          {'Height above 1737.4 km '}
          <span className="legend" aria-hidden="true">{km1(range[0])} <i className="topo-ramp" /> {km1(range[1])}</span>
          {` · contours every ${interval} m${zoomed ? ` (${interval / 5} m on the 5 km site patch)` : ''}, heavy every ${(5 * interval).toLocaleString('en-US')} m · `}
          <span ref={cursorEl} data-testid="moon-topo-height">point at the terrain for its height</span>
        </span>
      )}
      <div className="moon-bar" role="group" aria-label="Moon view">
        <button type="button" onClick={toPole} data-testid="moon-back" title={zoomed ? 'Fly back to the pole' : 'Back to the starting view of the pole'}>
          <Target size={15} aria-hidden="true" />Pole
        </button>
        <div className="modes" role="group" aria-label={zoomed ? 'Colour the grid by' : 'Colour the site pins by'}>
          {(['verdict', 'sun', 'earth'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={layer === l} onClick={() => setLayer(l)}>{l === 'sun' ? 'Sunlight' : l === 'earth' ? 'Earth' : 'Verdict'}</button>
          ))}
        </div>
        <span className="note moon-legend" data-testid="moon-legend">
          {zoomed && !stats ? 'Loading the grid…' : layer === 'verdict' ? (
            <><i className="pass" aria-hidden="true" /> meets every constraint <i className="fail" aria-hidden="true" /> fails one or more</>
          ) : (
            <>
              {layer === 'sun' ? 'Sunlit' : 'Earth in view'} <span className="legend" aria-hidden="true">0% <i style={{ background: `linear-gradient(90deg, ${(layer === 'sun' ? SUN_RAMP : EARTH_RAMP).join(',')})` }} /> 100%</span> of the mission{zoomed ? ', per 500 m cell' : ', at each site'}
            </>
          )}
        </span>
        <button type="button" onClick={() => setTopo((t) => !t)} aria-pressed={topo} disabled={!data.basemap.relief} data-testid="moon-topo"
          title="Colour the terrain by height and draw contour lines (LOLA)"><Mountain size={15} aria-hidden="true" />Topo</button>
        <label className="moon-exag" title="Raise the terrain's height for the eye. Every number stays at true height.">
          Height <input type="range" min={1} max={5} step={0.5} value={exag} onChange={(e) => setExag(Number(e.target.value))}
            disabled={!data.basemap.relief} data-testid="moon-exag" aria-valuetext={`${exag} times`} />
          <span className="moon-exag-value" aria-hidden="true">×{exag}</span>
        </label>
        <button type="button" onClick={onPin} disabled={!canPin} aria-pressed={viewPinned} data-testid="moon-pin-view">
          {viewPinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}{viewPinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" className="primary" onClick={onStand} data-testid="moon-stand" data-tour="stand" aria-label="Stand here: view the landing point in 3D"><Eye size={15} aria-hidden="true" />Stand here</button>
      </div>
    </div>
  )
  const hovered = hover && stats ? { point: dots.point[hover.index], v: stats.verdicts[hover.index] } : null
  const dur = Number(constraints.mission_duration_days)
  return (
    <div className={`moon${dragging ? ' dragging' : ''}`} ref={root} role="group" aria-label="Moon view: the south polar region and its sites" data-testid="moon-view" data-level={zoomed ? 'site' : 'pole'} data-exag={exag} data-relief={raised ? 'loaded' : 'none'} data-topo={topo ? 'on' : 'off'} data-stars={sky ? sky.stars.length / 5 : 0}>
      <Canvas className="scene" frameloop="demand" dpr={[1, 2]} camera={{ fov: 40, near: NEAR_POLE, far: 10, position: [0, -1.5, 0] }}
        onCreated={(s) => { cam.current = s.camera }}>
        <color attach="background" args={['#000']} />
        {sky && <Stars sky={sky} />}
        <Globe data={data} hour={hour} region={zoomed ? focus : null} exag={exag} topo={topo} grids={grids} onGrids={onGrids} />
        <Rig dest={dest} destKey={destKey} zoomed={zoomed} controls={controls} ground={ground} />
        <Painter paint={paint} />
      </Canvas>
      <canvas className="moon-overlay" ref={overlay} aria-hidden="true" />

      <span className="moon-bearing sunlit" ref={sunLabel} data-testid="moon-sun">Sun {sunEl.toFixed(2)}°</span>
      <span className="moon-bearing earthlit" ref={earthLabel} data-testid="moon-earth">Earth {earthEl.toFixed(2)}°</span>

      {pins.map(({ site, verdict }) => {
        const pass = verdict ? verdict.evaluation.fails === 0 : null
        // which constraints fail is in the description: their names here would collide with the constraint inputs' labels
        const state = pass === null ? 'not evaluated yet' : pass ? 'solid pin, meets every constraint' : `hollow pin, fails ${verdict!.evaluation.fails} of ${Object.keys(verdict!.evaluation.passes).length} constraints`
        const [dx, dy] = LABEL_AT[site.id] ?? [14, 0]
        // the pin's dot follows the layer: verdict = solid/hollow, sunlight/Earth = the site's own % from the engine
        const tint = verdict && layer !== 'verdict'
          ? colour(layer === 'sun' ? verdict.metrics.sunlitPct : verdict.metrics.earthPct, 100, layer === 'sun' ? SUN_RAMP : EARTH_RAMP)
          : null
        return (
          <span key={site.id} className={`moon-pin-wrap${dx < 0 ? ' left' : ''}`} ref={(el) => { pinEls.current[site.id] = el }}
            style={{ visibility: 'hidden', translate: `${dx < 0 ? `calc(${dx}px - 100%)` : `${dx}px`} calc(${dy}px - 50%)` }}>
            <button type="button" data-testid={`moon-pin-${site.id}`} data-tour={site.id === focus.id ? 'site-pin' : undefined} data-verdict={pass === null ? 'pending' : pass ? 'pass' : 'fail'}
              className={site.id === focus.id ? 'moon-pin selected' : 'moon-pin'}
              aria-label={`${site.name}: ${state} for a ${dur}-day mission landing ${when} UTC${verdict ? `, sunlit ${verdict.metrics.sunlitPct.toFixed(0)}%, Earth ${verdict.metrics.earthPct.toFixed(0)}%` : ''}. Fly to its search grid.`}
              aria-describedby={`${id}-${site.id}`} onClick={() => onSite(site.id)}>
              {tint ? <i className="tinted" style={{ background: tint }} aria-hidden="true" /> : <i className={pass === null ? 'pending' : pass ? 'pass' : 'fail'} aria-hidden="true" />}
              {short(site.name)}
              <span className="moon-tip" id={`${id}-${site.id}`}>
                <strong>{site.name}</strong>
                {verdict ? <Numbers v={verdict} /> : <span>Not evaluated: its terrain is still loading, or the mission window runs past 2035.</span>}
                <span className="dim">{dur}-day mission landing {when} UTC</span>
              </span>
            </button>
            <button type="button" className="moon-pin-stand" data-testid={`moon-stand-${site.id}`} aria-label={`Stand at ${site.name} in 3D`} title="Stand here in 3D"
              onClick={() => onStandAt(site.id)}><Eye size={13} aria-hidden="true" /></button>
          </span>
        )
      })}

      {zoomed && marker && (
        <button type="button" className={`moon-marker${draggable ? '' : ' fixed'}`} ref={markerEl} data-testid="moon-marker" data-point={marker.id} style={{ visibility: 'hidden' }}
          aria-label={draggable
            ? `Landing point at ${marker.lat.toFixed(4)}°, ${marker.lon.toFixed(3)}°E. Drag it, or use the arrow keys to move it 500 m (up is north, right is east). Enter views it in 3D.`
            : `Landing point of the alternative on show, at ${marker.lat.toFixed(4)}°, ${marker.lon.toFixed(3)}°E. Enter views it in 3D.`}
          onKeyDown={markerKey}><i aria-hidden="true" /></button>
      )}

      {hover && hovered?.v && !dragging && (
        <div className={hover.up ? 'moon-tip dot up' : 'moon-tip dot'} style={{ left: hover.x, top: hover.y }} data-testid="moon-dot-tip">
          <strong>{hovered.point.lat.toFixed(4)}°, {hovered.point.lon.toFixed(3)}°E</strong>
          <Numbers v={hovered.v} />
          {draggable && <span className="dim">Click to land here</span>}
        </div>
      )}

      {host && createPortal(foot, host)}
    </div>
  )
}

export default memo(MoonView)
