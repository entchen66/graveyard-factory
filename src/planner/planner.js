// @ts-check
// Layout planner: places the stations a production plan needs, routes belts
// between them, and improves the placement by simulated annealing.
//
// A placement is scored by routing every connection from scratch: the sum of
// route costs (belts, turns, undergrounds, splitters, chests) plus a large
// penalty per connection that could not be routed.

import { STATIONS, RECIPE_BY_ID, DIRS, CAROUSEL_SIZE, entityCells, stationVariants, isSupplyItem } from '../catalog.js';
import { RouteGrid, DX, DY, COST } from './router.js';
import { powerOf, powerSupply } from '../model.js';

/** @typedef {import('../types.js').StationType} StationType */
/** @typedef {import('../types.js').EntitySpec} EntitySpec */
/** @typedef {import('../types.js').ProductionPlan} ProductionPlan */
/** @typedef {import('../model.js').Layout} Layout */
/** @typedef {import('./router.js').RouteStart} RouteStart */
/** @typedef {import('./router.js').RouteTarget} RouteTarget */

/**
 * One station to build.
 * @typedef {object} StationInstance
 * @property {number} idx
 * @property {string} recipe
 * @property {StationType} type
 * @property {number | null} level
 * @property {string} item output
 * @property {{ item: string, rate: number }[]} ingredients per minute, one per input port
 * @property {number} outRate per minute
 * @property {number} depth crafting steps above raw supply
 */

/** Where a station goes; swap exchanges its two input ports. @typedef {{ x: number, y: number, variant: string, swap: boolean }} Placement */

/** A station port in world coordinates; (nx, ny) is its access cell. @typedef {{ x: number, y: number, dir: number, nx: number, ny: number }} PlacedPort */
/** @typedef {PlacedPort & { item: string, port: number }} PlacedInput */

/**
 * @typedef {object} PlannerOptions
 * @property {number} [seed]
 * @property {number} [gap] free cells kept between stations
 * @property {number} [failCost] penalty per unrouted connection
 * @property {number} [supplyCornerCost] extra cost per cell from the supply corner
 * @property {number} [timeMs] search budget (used by the worker)
 */

/**
 * One end of a connection: a station port, distributor, supply chest or final
 * output. Which fields are set depends on the kind.
 * @typedef {object} Endpoint
 * @property {string} id
 * @property {string} [item]
 * @property {number} [rate]
 * @property {number} [n] access cell
 * @property {number} [stub] cell held free straight out of the port (-1: none)
 * @property {number[]} [stubs] distributor stubs
 * @property {number} [d] output direction
 * @property {number} [P] input port cell
 * @property {number} [into] direction of travel into an input port
 * @property {number} [station]
 * @property {boolean} [chest] hand-stocked supply chest
 * @property {boolean} [final] final output
 * @property {number} [left] rate not yet assigned to an edge
 */

/** @typedef {{ src: Endpoint, sink: Endpoint, item: string, rate?: number, est?: number }} Edge */

/** @typedef {{ reason?: 'no room', station?: number, item?: string, from?: string, to?: string }} Failure */

/** @typedef {{ score: number, failed: number, failures: Failure[], grid: RouteGrid, edges: number, power: number, missingCarousels: number }} Evaluation */
/** @typedef {{ placements: Placement[], score: number, failed: number }} SearchState */

/**
 * @typedef {object} PlanResult
 * @property {EntitySpec[]} entities
 * @property {Placement[]} placements
 * @property {Failure[]} failures
 * @property {number} score
 * @property {{ stations: number, belts: number, undergrounds: number, splitters: number, chests: number, supplyStations: number, power: number, zombies: number, carousels: number, carouselsNotPlaced: number, connections: number, iterations: number }} stats
 */

// Penalty per unrouted connection, far above any realistic belt cost so that
// routing everything always wins.
export const FAIL_COST = 1000;
// Score per zombie carousel a plan needs beyond those it has: about the power
// one carousel gives (28, or 40 with Belt Master) in belts, so the search trades
// belts to stay under a carousel, and the planner places the ones still needed.
const CAROUSEL_COST = 30;
// "Supply: ..." outputs end in a supply station, preferably near the floor's
// top-right corner: this much extra cost per cell away from it, and how many of
// the nearest free cells are offered.
const SUPPLY_CORNER_COST = 2;
const SUPPLY_CANDIDATES = 40;
const sizeOf = (/** @type {StationInstance} */ s) => STATIONS[s.type].size;
const variantsOf = (/** @type {StationInstance} */ s) => Object.keys(stationVariants(s.type));
// Do two station footprints come closer than `gap` free cells?
/**
 * @param {{ x: number, y: number }} a
 * @param {number} sa
 * @param {{ x: number, y: number }} b
 * @param {number} sb
 * @param {number} gap
 */
const near = (a, sa, b, sb, gap) => a.x < b.x + sb + gap && b.x < a.x + sa + gap && a.y < b.y + sb + gap && b.y < a.y + sa + gap;
const rev = (/** @type {number} */ d) => (d + 2) % 4;

// One entry per station to build, with the ingredients it needs per minute.
/**
 * @param {ProductionPlan} production
 * @returns {StationInstance[]}
 */
export function stationInstances(production) {
  /** @type {Map<string, number>} */
  const depth = new Map();
  for (const item of Object.keys(production.supply)) depth.set(item, 0);
  for (const r of production.recipes) { // producers come first
    const inputs = Object.keys(r.inputs);
    depth.set(r.item, 1 + Math.max(0, ...inputs.map((i) => depth.get(i) ?? 0)));
  }
  /** @type {StationInstance[]} */
  const out = [];
  for (const r of production.recipes) {
    const recipe = RECIPE_BY_ID[r.recipe];
    let left = r.crafts;
    for (let i = 0; i < r.stations; i++) {
      const crafts = Math.min(r.craftsPerStation, left);
      left -= crafts;
      out.push({
        idx: out.length, recipe: r.recipe, type: r.station, level: r.level, item: r.item,
        ingredients: Object.entries(recipe.inputs).map(([item, qty]) => ({ item, rate: qty * crafts })),
        outRate: recipe.outputs[r.item] * crafts,
        depth: depth.get(r.item),
      });
    }
  }
  return out;
}

// Mulberry32: small seeded PRNG so runs are reproducible.
/**
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Planner {
  // layout: the base Layout (terrain + entities to keep); planned entities should
  // already be removed. production: result of planProduction().
  /**
   * @param {Layout} layout
   * @param {ProductionPlan} production
   * @param {PlannerOptions} [options]
   */
  constructor(layout, production, options = {}) {
    this.layout = layout;
    this.production = production;
    this.options = options;
    this.random = rng(options.seed ?? 1);
    this.stations = stationInstances(production);
    // Power the kept pieces already use, and the carousels already on the floor.
    this.basePower = powerOf(layout.entities);
    this.baseCarousels = layout.entities.filter((e) => e.kind === 'carousel').length;
    this.beltMaster = !!layout.beltMaster;
    this._buildBase();
    this._buildAprons();
    this._buildSupplyCells();
    this.iterations = 0;
  }

  // ---- static obstacles from the base layout --------------------------------

  _buildBase() {
    const l = this.layout;
    const g = new RouteGrid(l.width, l.height);
    /** @type {Map<string, { k: number, d: number }>} distributor output access cell by material */
    this.distributors = new Map();
    for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) g.floor[g.key(x, y)] = l.isFloor(x, y) ? 1 : 0;
    for (const e of l.entities) {
      const cells = entityCells(e);
      if (e.kind === 'belt') {
        const k = g.key(e.x, e.y);
        g.occ[k] = 2;
        g.rot[k] = e.rot;
        continue;
      }
      for (const c of cells) {
        if (!l.inBounds(c.x, c.y)) continue;
        const k = g.key(c.x, c.y);
        if (c.gap) g.gap[k] = e.rot; else g.block(k);
      }
      // A chest outputs from its filtered sides, or from every side if it has none.
      if (e.kind === 'chest') {
        const filtered = /** @type {const} */ (['N', 'E', 'S', 'W']).map((n, d) => (e.filters?.[n] ? 1 << d : 0)).reduce((a, b) => a | b, 0);
        g.addChestAt(g.key(e.x, e.y), filtered || 0b1111);
      }
      // Keep port access cells of existing pieces clear.
      for (const p of l.ports(e)) {
        if (!l.inBounds(p.nx, p.ny)) continue;
        const k = g.key(p.nx, p.ny);
        if (g.occ[k] === 0) g.reserved[k] = 0;
        if (e.kind === 'distributor' && p.kind === 'out') this.distributors.set(e.material, { k, d: p.dir });
      }
    }
    this.base = g;
    // Footprint positions free of obstacles, per station size.
    /** @type {Record<number, { x: number, y: number }[]>} */
    this.spots = {};
    const free = (/** @type {number} */ k) => g.floor[k] && g.occ[k] === 0 && g.reserved[k] === -1 && g.gap[k] === -1;
    for (const size of new Set(this.stations.map(sizeOf))) {
      /** @type {{ x: number, y: number }[]} */
      const spots = this.spots[size] = [];
      for (let y = 0; y + size <= l.height; y++) {
        for (let x = 0; x + size <= l.width; x++) {
          let ok = true;
          for (let dy = 0; dy < size && ok; dy++) for (let dx = 0; dx < size && ok; dx++) ok = free(g.key(x + dx, y + dy));
          if (ok) spots.push({ x, y });
        }
      }
    }
  }

  // Cells in front of each distributor the plan uses, where no station may go:
  // 3 wide and 4 deep, so the supply line can leave and turn.
  _buildAprons() {
    const g = this.base;
    this.apron = new Uint8Array(g.W * g.H);
    for (const [item, sup] of Object.entries(this.production.supply)) {
      const dist = sup.source === 'distributor' && this.distributors.get(item);
      if (!dist) continue;
      const [nx, ny] = g.xy(dist.k);
      const px = DY[dist.d], py = -DX[dist.d]; // perpendicular
      for (let i = 0; i < 4; i++) for (let j = -1; j <= 1; j++) {
        const x = nx + DX[dist.d] * i + px * j, y = ny + DY[dist.d] * i + py * j;
        if (x >= 0 && y >= 0 && x < g.W && y < g.H) this.apron[g.key(x, y)] = 1;
      }
    }
  }

  // Where supply stations may go: the free floor cells nearest the top-right
  // corner of the floor (outside distributor aprons), with their distance to it.
  // Existing supply stations are targets too.
  _buildSupplyCells() {
    const g = this.base, l = this.layout;
    let cx = -1, cy = Infinity;
    for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
      if (l.isFloor(x, y)) { cx = Math.max(cx, x); cy = Math.min(cy, y); }
    }
    this.corner = { x: cx, y: cy };
    /** @param {number} x @param {number} y */
    const dist = (x, y) => Math.abs(cx - x) + Math.abs(cy - y);
    const cells = [];
    for (let y = 0; y < l.height; y++) for (let x = 0; x < l.width; x++) {
      const k = g.key(x, y);
      if (g.floor[k] && g.occ[k] === 0 && g.reserved[k] === -1 && g.gap[k] === -1 && !this.apron[k]) cells.push({ k, dist: dist(x, y) });
    }
    cells.sort((a, b) => a.dist - b.dist);
    this.supplyCells = cells.slice(0, SUPPLY_CANDIDATES);
    this.supplyStations = l.entities.filter((e) => e.kind === 'supply_station').map((e) => ({
      k: g.key(e.x, e.y), into: rev(e.rot), access: g.key(e.x + DIRS[e.rot].dx, e.y + DIRS[e.rot].dy), dist: dist(e.x, e.y),
    }));
  }

  // Route targets for a "Supply: ..." output: a new supply station on a free
  // candidate cell (entered from any side), or an existing station's input.
  /**
   * @param {RouteGrid} g
   * @param {Map<number, RouteTarget>} targets
   * @param {Set<number>} allow
   */
  _supplyTargets(g, targets, allow) {
    for (const c of this.supplyCells) {
      if (g.occ[c.k] !== 0 || g.reserved[c.k] !== -1 || g.gap[c.k] !== -1) continue;
      targets.set(c.k, { mask: 0b1111, cost: (this.options.supplyCornerCost ?? SUPPLY_CORNER_COST) * c.dist, end: { type: 'newSupply' } });
    }
    for (const st of this.supplyStations) {
      if (st.access < 0 || g.occ[st.access] !== 0) continue;
      targets.set(st.k, { mask: 1 << st.into, cost: (this.options.supplyCornerCost ?? SUPPLY_CORNER_COST) * st.dist, end: { type: 'port' } });
      allow.add(st.access);
    }
  }

  // ---- station geometry ---------------------------------------------------

  // Ports used by station s at placement p: inputs per ingredient, and the output.
  /**
   * @param {StationInstance} s
   * @param {Placement} p
   * @returns {{ inputs: PlacedInput[], output: PlacedPort }}
   */
  ports(s, p) {
    const def = stationVariants(s.type)[p.variant].ports;
    const ins = def.filter((q) => q.kind === 'in');
    const out = def.find((q) => q.kind === 'out');
    /** @param {import('../types.js').PortDef} q @returns {PlacedPort} */
    const at = (q) => {
      const x = p.x + q.x, y = p.y + q.y;
      return { x, y, dir: q.dir, nx: x + DX[q.dir], ny: y + DY[q.dir] };
    };
    const inputs = s.ingredients.map((ing, i) => ({ ...at(ins[p.swap ? 1 - i : i]), item: ing.item, port: p.swap ? 1 - i : i }));
    return { inputs, output: at(out) };
  }

  // Is placement p for station s compatible with the base and the other placements?
  /**
   * @param {StationInstance} s
   * @param {Placement} p
   * @param {(Placement | null)[]} placements
   */
  valid(s, p, placements) {
    const g = this.base;
    /** @param {number} x @param {number} y */
    const cellFree = (x, y) => {
      if (x < 0 || y < 0 || x >= g.W || y >= g.H) return false;
      const k = g.key(x, y);
      return g.floor[k] && g.occ[k] === 0 && g.reserved[k] === -1 && g.gap[k] === -1;
    };
    const size = sizeOf(s);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (!cellFree(p.x + dx, p.y + dy) || this.apron[g.key(p.x + dx, p.y + dy)]) return false;
      }
    }
    const { inputs, output } = this.ports(s, p);
    const access = [...inputs, output].map((q) => [q.nx, q.ny]);
    for (const [x, y] of access) if (!cellFree(x, y)) return false;
    for (let i = 0; i < placements.length; i++) {
      const o = placements[i];
      if (!o || i === s.idx) continue;
      // Keep free rows/columns between stations for belts.
      if (near(p, size, o, sizeOf(this.stations[i]), this.options.gap ?? 1)) return false;
      const other = this.ports(this.stations[i], o);
      for (const q of [...other.inputs, other.output]) {
        if (access.some(([x, y]) => x === q.nx && y === q.ny)) return false;
      }
    }
    return true;
  }

  // ---- initial placement ----------------------------------------------------

  // Start from `initial` placements (to continue an earlier search) when they
  // still fit, otherwise from a greedy placement.
  /**
   * @param {(Placement | null)[] | null} [initial]
   * @returns {SearchState}
   */
  init(initial = null) {
    const order = [...this.stations].sort((a, b) => a.depth - b.depth || a.idx - b.idx);
    /** @type {Placement[]} */
    const placements = new Array(this.stations.length).fill(null);
    if (initial?.length === this.stations.length) {
      initial.forEach((p, i) => { if (p && this.valid(this.stations[i], p, placements)) placements[i] = p; });
    }
    for (const s of order) if (!placements[s.idx]) placements[s.idx] = this._bestSpot(s, placements);
    /** @type {SearchState} */
    this.current = { placements, ...this.evaluate(placements) };
    /** @type {SearchState} */
    this.best = this.current;
    return this.best;
  }

  /**
   * @param {StationInstance} s
   * @param {(Placement | null)[]} placements
   * @returns {Placement | null}
   */
  _bestSpot(s, placements) {
    const placed = placements.map((p, i) => p && { p, s: this.stations[i] }).filter(Boolean);
    const cx = placed.length ? placed.reduce((a, o) => a + o.p.x, 0) / placed.length : null;
    const cy = placed.length ? placed.reduce((a, o) => a + o.p.y, 0) / placed.length : null;
    const outputs = placed.map((o) => ({ item: o.s.item, port: this.ports(o.s, o.p).output }));
    /** @type {Placement | null} */
    let best = null, bestCost = Infinity;
    for (const spot of this.spots[sizeOf(s)]) {
      for (const variant of variantsOf(s)) {
        for (const swap of [false, true]) {
          const p = { x: spot.x, y: spot.y, variant, swap };
          if (!this.valid(s, p, placements)) continue;
          const { inputs } = this.ports(s, p);
          let cost = 0;
          for (const q of inputs) {
            const dist = this.distributors.get(q.item);
            if (dist) {
              const [dx, dy] = this.base.xy(dist.k);
              cost += Math.abs(dx - q.nx) + Math.abs(dy - q.ny);
            } else {
              let m = Infinity;
              for (const o of outputs) if (o.item === q.item) m = Math.min(m, Math.abs(o.port.nx - q.nx) + Math.abs(o.port.ny - q.ny));
              if (m < Infinity) cost += m;
            }
          }
          if (cx != null) cost += 0.3 * (Math.abs(cx - spot.x) + Math.abs(cy - spot.y));
          // Makers of a final "Supply: ..." item start near the supply corner.
          if (this.production.final[s.item] && isSupplyItem(s.item)) {
            const out = this.ports(s, p).output;
            cost += Math.abs(this.corner.x - out.nx) + Math.abs(this.corner.y - out.ny);
          }
          // Leave room for belts: a one-cell gap fits a single belt only.
          for (const o of placed) {
            if (near(spot, sizeOf(s), o.p, sizeOf(o.s), 2)) cost += 6;
          }
          if (cost < bestCost) { bestCost = cost; best = p; }
        }
      }
    }
    return best;
  }

  // ---- evaluation: route everything for a placement ------------------------

  // Route everything for a placement.
  /**
   * @overload
   * @param {(Placement | null)[]} placements
   * @param {false} [collect]
   * @returns {{ score: number, failed: number }}
   */
  /**
   * @overload
   * @param {(Placement | null)[]} placements
   * @param {true} collect
   * @returns {Evaluation}
   */
  /**
   * @param {(Placement | null)[]} placements
   * @param {boolean} [collect]
   */
  evaluate(placements, collect = false) {
    const r = this._evaluate(placements);
    if (!collect) return { score: r.score, failed: r.failures.length };
    return r;
  }

  /**
   * @param {(Placement | null)[]} placements
   * @returns {Evaluation}
   */
  _evaluate(placements) {
    const b = this.base;
    const g = new RouteGrid(b.W, b.H);
    for (const f of /** @type {const} */ (['floor', 'occ', 'rot', 'gap', 'reserved', 'chestFeeds'])) g[f].set(b[f]);

    // Stations and their port access cells. Each port also holds the next cell
    // straight out (a "stub") until it is connected, so passing belts can't box
    // it in.
    /** @type {Endpoint[]} */
    const sinks = [], producers = /** @type {Endpoint[]} */ ([]);
    /** @type {number[]} */
    const stubs = [];
    /** @param {number} n @param {number} d */
    const stub = (n, d) => {
      const k = g.step(n, d);
      if (k < 0 || !g.floor[k] || g.occ[k] !== 0 || g.reserved[k] !== -1 || g.gap[k] !== -1) return -1;
      stubs.push(k);
      g.reserved[k] = 2;
      return k;
    };
    const release = (/** @type {number} */ k) => { if (k >= 0 && g.occ[k] === 0) g.reserved[k] = -1; };
    /** @type {Failure[]} */
    const failures = [];
    this.stations.forEach((s, i) => {
      const p = placements[i];
      if (!p) {
        failures.push({ reason: 'no room', station: i });
        return;
      }
      for (let dy = 0; dy < sizeOf(s); dy++) for (let dx = 0; dx < sizeOf(s); dx++) g.block(g.key(p.x + dx, p.y + dy));
      const { inputs, output } = this.ports(s, p);
      inputs.forEach((q, j) => {
        const n = g.key(q.nx, q.ny);
        g.reserved[n] = 1;
        sinks.push({ id: `s${i}i${j}`, item: q.item, rate: s.ingredients[j].rate, n, stub: stub(n, q.dir), P: g.key(q.x, q.y), into: rev(q.dir), station: i });
      });
      const n = g.key(output.nx, output.ny);
      g.reserved[n] = 1;
      producers.push({ id: `s${i}o`, item: s.item, rate: s.outRate, n, stub: stub(n, output.dir), d: output.dir, station: i });
    });

    // Distributors the plan uses keep two cells straight out free until connected:
    // they sit side by side along a wall and are easily boxed in.
    const supply = this.production.supply;
    /** @type {Map<string, number[]>} */
    const distStub = new Map();
    for (const [item, sup] of Object.entries(supply)) {
      const dist = sup.source === 'distributor' && this.distributors.get(item);
      if (!dist) continue;
      const a = stub(dist.k, dist.d);
      distStub.set(item, [a, a >= 0 ? stub(a, dist.d) : -1]);
    }

    // Who feeds whom.
    /** @type {Edge[]} */
    const edges = [];
    /** @type {Endpoint[]} */
    const finals = Object.entries(this.production.final).map(([item, rate]) => ({ id: `final:${item}`, item, rate, final: true }));
    for (const sk of sinks) {
      const sup = supply[sk.item];
      if (!sup) continue;
      const dist = sup.source === 'distributor' && this.distributors.get(sk.item);
      if (dist) edges.push({ src: { id: `dist:${sk.item}`, n: dist.k, d: dist.d, stubs: distStub.get(sk.item) }, sink: sk, item: sk.item });
      else edges.push({ src: { id: 'chest', chest: true }, sink: sk, item: sk.item });
    }
    /** @type {Map<string, { producers: Endpoint[], consumers: Endpoint[] }>} */
    const byItem = new Map();
    for (const pr of producers) {
      if (!byItem.has(pr.item)) byItem.set(pr.item, { producers: [], consumers: [] });
      byItem.get(pr.item).producers.push({ ...pr, left: pr.rate });
    }
    for (const c of [...sinks.filter((sk) => !supply[sk.item]), ...finals]) {
      byItem.get(c.item)?.consumers.push({ ...c, left: c.rate });
    }
    for (const { producers: ps, consumers: cs } of byItem.values()) {
      // Greedy: nearest producer/consumer pairs first.
      /** @type {{ p: Endpoint, c: Endpoint, dist: number }[]} */
      const pairs = [];
      for (const p of ps) for (const c of cs) pairs.push({ p, c, dist: c.final ? 3 : this._dist(p.n, c.n) });
      pairs.sort((a, z) => a.dist - z.dist);
      for (const { p, c } of pairs) {
        if (p.left <= 1e-9 || c.left <= 1e-9) continue;
        const amount = Math.min(p.left, c.left);
        p.left -= amount;
        c.left -= amount;
        edges.push({ src: p, sink: c, item: c.item, rate: amount });
      }
    }
    for (const e of edges) e.est = e.src.chest ? 2 : e.sink.final ? 3 : this._dist(e.src.n, e.sink.n);
    /** @type {Map<string, number>} */
    const fanout = new Map();
    for (const e of edges) fanout.set(e.src.id, (fanout.get(e.src.id) ?? 0) + 1);
    edges.sort((a, z) => a.est - z.est);

    // Route in order.
    const usedSrc = /** @type {Set<string>} */ (new Set()), connected = /** @type {Set<string>} */ (new Set()), finalChest = /** @type {Map<string, number>} */ (new Map());
    let cost = 0;
    for (const e of edges) {
      const { src, sink, item } = e;
      const allow = new Set(), exempt = new Map(), targets = new Map();
      /** @type {RouteStart[]} */
      let starts;
      if (src.chest) {
        starts = g.chestStarts(item, sink.n, 6);
      } else if (!usedSrc.has(src.id)) {
        // A station output facing left or right needs a belt: it can't push
        // straight into a chest (a top output can).
        const sideOutput = src.station != null && src.d % 2 === 1;
        starts = [{ k: src.n, d: src.d, cost: 0, noChest: sideOutput, origin: { type: 'port' } }];
        allow.add(src.n);
        // Or a chest hub right on the output, worth it when the source feeds several consumers.
        if (!sink.final && !sideOutput && g.chestOk(src.n, src.d, allow, true)) {
          const hubCost = (fanout.get(src.id) ?? 1) > 1 ? 1 : COST.hub;
          for (let d = 0; d < 4; d++) {
            if (d === rev(src.d)) continue;
            starts.push({ k: g.step(src.n, d), d, cost: hubCost, straight: true, origin: { type: 'portHub', k: src.n } });
          }
        }
        if (src.stub >= 0) allow.add(src.stub);
        for (const k of src.stubs ?? []) if (k >= 0) allow.add(k);
      } else {
        starts = g.branchStarts(item, src.id);
      }
      for (const s of starts) if (['existingHub', 'portHub'].includes(s.origin.type) && s.k >= 0) exempt.set(s.k, 1 << s.d);
      let flexChest = false;
      if (sink.final && isSupplyItem(item)) {
        this._supplyTargets(g, targets, allow);
        g.mergeTargets(item, sink.id, targets);
      } else if (sink.final) {
        const ck = finalChest.get(sink.id);
        if (ck == null) flexChest = true;
        else { g.chestTarget(ck, targets); g.mergeTargets(item, sink.id, targets); }
      } else if (!connected.has(sink.id)) {
        targets.set(sink.P, { mask: 1 << sink.into, end: { type: 'port' } });
        allow.add(sink.n);
        if (sink.stub >= 0) allow.add(sink.stub);
      } else {
        g.mergeTargets(item, sink.id, targets);
      }
      const res = starts.length && (flexChest || targets.size)
        ? g.routeSound({ starts, targets, flexChest, allow, exempt, goalCells: flexChest ? null : [...targets.keys()] })
        : null;
      if (!res) {
        failures.push({ item, from: src.id, to: sink.id });
        continue;
      }
      g.apply(res, item, src.id, sink.id);
      cost += res.cost;
      if (!src.chest) release(src.stub);
      for (const k of src.stubs ?? []) release(k);
      if (!sink.final) release(sink.stub);
      if (!src.chest) usedSrc.add(src.id);
      connected.add(sink.id);
      if (res.goal.type === 'newChest') finalChest.set(sink.id, res.goal.k);
    }

    const placedStations = placements.filter(Boolean).length;
    const power = this.basePower + placedStations + powerOf([...g.placed.values()]);
    const { missingCarousels } = powerSupply(power, this.baseCarousels, this.beltMaster);
    const score = cost + (this.options.failCost ?? FAIL_COST) * failures.length + CAROUSEL_COST * missingCarousels;
    return { score, failed: failures.length, failures, grid: g, edges: edges.length, power, missingCarousels };
  }

  /** @param {number} a @param {number} b */
  _dist(a, b) {
    const [ax, ay] = this.base.xy(a), [bx, by] = this.base.xy(b);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  // ---- simulated annealing --------------------------------------------------

  // Run `n` iterations; `progress` in [0, 1] sets the temperature.
  /**
   * @param {number} n
   * @param {number} progress
   * @returns {SearchState}
   */
  step(n, progress) {
    const T = 30 * Math.pow(0.02, progress);
    for (let it = 0; it < n; it++) {
      this.iterations++;
      const placements = this._neighbour(this.current.placements);
      if (!placements) continue;
      const r = this.evaluate(placements);
      const delta = r.score - this.current.score;
      if (delta <= 0 || this.random() < Math.exp(-delta / T)) {
        this.current = { placements, ...r };
        if (r.score < this.best.score) this.best = this.current;
      }
    }
    return this.best;
  }

  /**
   * @param {Placement[]} placements
   * @returns {Placement[] | null}
   */
  _neighbour(placements) {
    const n = this.stations.length;
    if (!n) return null;
    const next = placements.slice();
    const i = Math.floor(this.random() * n);
    const s = this.stations[i];
    const cur = placements[i];
    const move = this.random();
    /** @type {Placement} */
    let p;
    if (!cur || move < 0.45) {
      // Relocate: usually nearby, sometimes anywhere.
      if (cur && this.random() < 0.75) {
        const r = 1 + Math.floor(this.random() * 6);
        p = { ...cur, x: cur.x + Math.round((this.random() * 2 - 1) * r), y: cur.y + Math.round((this.random() * 2 - 1) * r) };
      } else {
        const spots = this.spots[sizeOf(s)];
        const spot = spots[Math.floor(this.random() * spots.length)];
        if (!spot) return null;
        p = { x: spot.x, y: spot.y, variant: cur?.variant ?? variantsOf(s)[0], swap: cur?.swap ?? false };
      }
    } else if (move < 0.7) {
      const variants = variantsOf(s);
      p = { ...cur, variant: variants[Math.floor(this.random() * variants.length)] };
    } else if (move < 0.8) {
      p = { ...cur, swap: !cur.swap };
    } else {
      // Swap positions with another station.
      const j = Math.floor(this.random() * n);
      if (j === i || !placements[j]) return null;
      const a = { ...cur, x: placements[j].x, y: placements[j].y };
      const b = { ...placements[j], x: cur.x, y: cur.y };
      next[i] = null; next[j] = null;
      if (!this.valid(s, a, next)) return null;
      next[i] = a;
      if (!this.valid(this.stations[j], b, next)) return null;
      next[j] = b;
      return next;
    }
    next[i] = null;
    if (!this.valid(s, p, next)) return null;
    next[i] = p;
    return next;
  }

  // ---- result ---------------------------------------------------------------

  // Entities for the best placement found, ready to add to the layout.
  /** @returns {PlanResult} */
  /**
   * Zombie carousels for the power a plan still lacks: on free 3x3 floor, the
   * most tucked-away spots first (fewest free cells around them).
   * @param {RouteGrid} g routed grid (carousels are blocked into it)
   * @param {number} n
   * @returns {EntitySpec[]}
   */
  _placeCarousels(g, n) {
    /** @type {EntitySpec[]} */
    const out = [];
    const S = CAROUSEL_SIZE;
    const free = (/** @type {number} */ x, /** @type {number} */ y) => {
      if (x < 0 || y < 0 || x >= g.W || y >= g.H) return false;
      const k = g.key(x, y);
      return !!g.floor[k] && g.occ[k] === 0 && g.reserved[k] === -1 && g.gap[k] === -1;
    };
    for (let i = 0; i < n; i++) {
      let best = null, bestOpen = Infinity;
      for (let y = 0; y + S <= g.H; y++) {
        for (let x = 0; x + S <= g.W; x++) {
          let ok = true;
          for (let dy = 0; dy < S && ok; dy++) for (let dx = 0; dx < S && ok; dx++) ok = free(x + dx, y + dy);
          if (!ok) continue;
          let open = 0;
          for (let d = -1; d <= S; d++) open += +free(x + d, y - 1) + +free(x + d, y + S) + (d >= 0 && d < S ? +free(x - 1, y + d) + +free(x + S, y + d) : 0);
          if (open < bestOpen) { bestOpen = open; best = { x, y }; }
        }
      }
      if (!best) break;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) g.block(g.key(best.x + dx, best.y + dy));
      out.push({ kind: 'carousel', x: best.x, y: best.y });
    }
    return out;
  }

  result() {
    const { placements } = this.best;
    const r = this.evaluate(placements, true);
    /** @type {EntitySpec[]} */
    const entities = [];
    this.stations.forEach((s, i) => {
      const p = placements[i];
      if (!p) return;
      const { inputs } = this.ports(s, p);
      /** @type {(string | null)[]} */
      const byPort = [null, null];
      for (const q of inputs) byPort[q.port] = q.item;
      entities.push({ kind: 'station', type: s.type, level: s.level, variant: p.variant, x: p.x, y: p.y, recipe: s.recipe, extensions: RECIPE_BY_ID[s.recipe]?.extension ? [RECIPE_BY_ID[s.recipe].extension] : [], inputs: byPort });
    });
    for (const e of r.grid.placed.values()) entities.push({ ...e });
    const carousels = this._placeCarousels(r.grid, r.missingCarousels);
    entities.push(...carousels);
    for (const e of entities) { e.planned = true; e.locked = false; }
    const supply = powerSupply(this.basePower + powerOf(entities), this.baseCarousels + carousels.length, this.beltMaster);
    const count = (/** @type {string} */ kind) => entities.filter((e) => e.kind === kind).length;
    return {
      entities,
      placements,
      failures: r.failures,
      score: r.score,
      stats: {
        stations: count('station'), belts: count('belt'), undergrounds: count('underground'),
        splitters: count('splitter'), chests: count('chest'), supplyStations: count('supply_station'), power: supply.used, zombies: supply.zombies,
        carousels: carousels.length, carouselsNotPlaced: r.missingCarousels - carousels.length, connections: r.edges,
        iterations: this.iterations,
      },
    };
  }
}
