// @ts-check
// Factory layout model: terrain grid + placed entities.
// UI-independent so the planner can reuse it (also runs under Node for tests).

import {
  DIRS, STATIONS, ENTITY_KINDS, RECIPE_BY_ID, ITEM_BY_ID, EXTENSIONS, CHEST_LEVELS, POWER_COST, stationVariants, defaultVariant,
  BELT_ACCEPTS_FROM_SIDES, UNDERGROUND_GAP_MUST_BE_FLOOR, entityCells, recipesFor,
} from './catalog.js';

/** @typedef {import('./types.js').Dir} Dir */
/** @typedef {import('./types.js').Entity} Entity */
/** @typedef {import('./types.js').EntitySpec} EntitySpec */
/** @typedef {import('./types.js').StationType} StationType */
/** @typedef {import('./types.js').Terrain} Terrain */
/** @typedef {import('./types.js').PortDef} PortDef */
/** @typedef {import('./types.js').Port} Port */
/** @typedef {import('./types.js').Issue} Issue */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {[number, number]} XY */

/**
 * Planner settings saved with a layout (the planner panel fills in defaults).
 * @typedef {object} PlannerSettings
 * @property {Target[]} [targets]
 * @property {number} [timeSec]
 * @property {Partial<Record<StationType, number>>} [maxLevel]
 * @property {Record<string, string>} [recipeChoice]
 */

/**
 * @typedef {object} LayoutInit
 * @property {string} [name]
 * @property {number} [width]
 * @property {number} [height]
 * @property {Terrain[]} [terrain]
 * @property {Entity[]} [entities]
 * @property {number} [nextId]
 * @property {PlannerSettings} [planner]
 */

/**
 * Exported file format. Older files may lack fields, and their entities ids.
 * @typedef {object} LayoutJSON
 * @property {'factory-layout'} [format]
 * @property {number} [version]
 * @property {string} [name]
 * @property {number} [width]
 * @property {number} [height]
 * @property {Record<string, string>} [legend]
 * @property {string[]} terrain ASCII rows
 * @property {EntitySpec[]} [entities]
 * @property {PlannerSettings} [planner]
 */

/** @typedef {{ ok: boolean, reason?: string }} PlaceCheck */
/** @typedef {(severity: Issue['severity'], entity: Entity | null, message: string, cells?: XY[]) => void} AddIssue */

// A cell is either factory floor or not. Older files also had walls ('#') and
// columns ('O'); neither could hold pieces, so they load as outside.
export const VOID = ' ', FLOOR = '.';
/** @type {{ id: Terrain, name: string }[]} */
export const TERRAIN_TYPES = [
  { id: FLOOR, name: 'Floor' },
  { id: VOID, name: 'Outside' },
];
/** @type {Record<string, Terrain>} */
const TERRAIN_ALIASES = { '_': VOID, '#': VOID, 'O': VOID, 'o': VOID, '0': VOID };

export const FORMAT_VERSION = 1;

export class Layout {
  /** @param {LayoutInit} [init] */
  constructor({ name = 'Untitled factory', width, height, terrain, entities = [], nextId, planner } = {}) {
    this.name = name;
    this.planner = planner; // planner settings (targets, options), saved with the layout
    this.width = width;
    this.height = height;
    /** @type {Terrain[]} */
    this.terrain = terrain ?? new Array(width * height).fill(FLOOR);
    /** @type {Entity[]} */
    this.entities = entities.map((e) => ({ ...e }));
    this.nextId = nextId ?? this.entities.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    /** @type {Map<number, Entity> | null} */
    this._occ = null;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {Terrain} [fill]
   */
  static blank(width, height, fill = FLOOR) {
    return new Layout({ width, height, terrain: new Array(width * height).fill(fill) });
  }

  /** @returns {Layout} */
  clone() {
    return Layout.fromJSON(this.toJSON());
  }

  // ---- terrain -------------------------------------------------------------

  /**
   * @param {number} x
   * @param {number} y
   */
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  getTerrain(x, y) {
    return this.inBounds(x, y) ? this.terrain[y * this.width + x] : VOID;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {Terrain} t
   */
  setTerrain(x, y, t) {
    if (this.inBounds(x, y)) this.terrain[y * this.width + x] = t;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  isFloor(x, y) {
    return this.getTerrain(x, y) === FLOOR;
  }

  terrainToText() {
    const rows = [];
    for (let y = 0; y < this.height; y++) {
      rows.push(this.terrain.slice(y * this.width, (y + 1) * this.width).join(''));
    }
    return rows.join('\n');
  }

  // Replace terrain (and dimensions) from ASCII rows. Short rows are padded
  // with VOID so trailing-space trimming by text editors is harmless.
  /** @param {string} text */
  setTerrainFromText(text) {
    const rows = parseTerrainRows(text.replace(/\r/g, '').split('\n'));
    while (rows.length && rows[rows.length - 1].every((c) => c === VOID)) rows.pop();
    const width = Math.max(1, ...rows.map((r) => r.length));
    const height = Math.max(1, rows.length);
    this.width = width;
    this.height = height;
    this.terrain = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) this.terrain.push(rows[y]?.[x] ?? VOID);
    }
    this.entities = this.entities.filter((e) => entityCells(e).every((c) => this.inBounds(c.x, c.y)));
    this._occ = null;
  }

  // Grow (positive) or shrink (negative) each side. Entities are shifted and
  // those falling outside the new bounds are removed.
  /**
   * @param {{ left?: number, top?: number, right?: number, bottom?: number }} sides
   * @param {Terrain} [fill]
   */
  resize({ left = 0, top = 0, right = 0, bottom = 0 }, fill = VOID) {
    const nw = this.width + left + right;
    const nh = this.height + top + bottom;
    if (nw < 1 || nh < 1) throw new Error('Layout must be at least 1x1');
    const terrain = new Array(nw * nh).fill(fill);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const ox = x - left, oy = y - top;
        if (this.inBounds(ox, oy)) terrain[y * nw + x] = this.getTerrain(ox, oy);
      }
    }
    this.width = nw;
    this.height = nh;
    this.terrain = terrain;
    for (const e of this.entities) { e.x += left; e.y += top; }
    this.entities = this.entities.filter((e) => entityCells(e).every((c) => this.inBounds(c.x, c.y)));
    this._occ = null;
  }

  // ---- entities ------------------------------------------------------------

  // Occupied cells of an entity (underground gap cells excluded).
  /**
   * @param {EntitySpec} e
   * @returns {XY[]}
   */
  footprint(e) {
    return entityCells(e).filter((c) => !c.gap).map((c) => /** @type {XY} */ ([c.x, c.y]));
  }

  /** @returns {Map<number, Entity>} */
  _index() {
    if (!this._occ) {
      this._occ = new Map();
      /** @type {Map<number, Entity>} underground gap cells */
      this._gaps = new Map();
      for (const e of this.entities) {
        for (const c of entityCells(e)) {
          if (!this.inBounds(c.x, c.y)) continue;
          const map = c.gap ? this._gaps : this._occ;
          const k = c.y * this.width + c.x;
          if (!map.has(k)) map.set(k, e);
        }
      }
    }
    return this._occ;
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  entityAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this._index().get(y * this.width + x) ?? null;
  }

  // Underground conveyor whose gap is at (x, y), if any.
  /**
   * @param {number} x
   * @param {number} y
   */
  gapAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    this._index();
    return this._gaps.get(y * this.width + x) ?? null;
  }

  /**
   * @param {number} id
   * @returns {Entity | null}
   */
  getEntity(id) {
    return this.entities.find((e) => e.id === id) ?? null;
  }

  // Can `e` be placed here? `ignoreIds` are treated as absent (for moves/replacements).
  /**
   * @param {EntitySpec} e
   * @param {number[]} [ignoreIds]
   * @returns {PlaceCheck}
   */
  canPlace(e, ignoreIds = []) {
    /** @param {Entity | null} other */
    const live = (other) => other && !ignoreIds.includes(other.id) ? other : null;
    for (const c of entityCells(e)) {
      if (!this.inBounds(c.x, c.y)) return { ok: false, reason: 'Outside the layout' };
      const t = this.getTerrain(c.x, c.y);
      const occupant = live(this.entityAt(c.x, c.y));
      const gapOwner = live(this.gapAt(c.x, c.y));
      if (c.gap) {
        if (UNDERGROUND_GAP_MUST_BE_FLOOR && t !== FLOOR) return { ok: false, reason: 'Gap is off the factory floor' };
        if (occupant && occupant.kind !== 'belt') return { ok: false, reason: `Only a belt can cross the gap, not ${describeEntity(occupant)}` };
        if (gapOwner) return { ok: false, reason: `Gap overlaps the gap of ${describeEntity(gapOwner)}` };
        continue;
      }
      if (t !== FLOOR) return { ok: false, reason: 'Off the factory floor' };
      if (occupant) return { ok: false, reason: `Overlaps ${describeEntity(occupant)}` };
      if (gapOwner && e.kind !== 'belt') return { ok: false, reason: `Only a belt can cross the gap of ${describeEntity(gapOwner)}` };
    }
    return { ok: true };
  }

  /**
   * @param {EntitySpec} e
   * @returns {Entity}
   */
  add(e) {
    const { id: _, kind, ...rest } = e;
    const entity = normalizeEntity({ id: this.nextId++, kind, ...rest });
    this.entities.push(entity);
    this._occ = null;
    return entity;
  }

  /** @param {number} id */
  remove(id) {
    const n = this.entities.length;
    this.entities = this.entities.filter((e) => e.id !== id);
    this._occ = null;
    return this.entities.length !== n;
  }

  /**
   * @param {number} id
   * @param {Partial<Entity>} patch
   * @returns {Entity | null}
   */
  update(id, patch) {
    const e = this.getEntity(id);
    if (e) Object.assign(e, patch);
    this._occ = null;
    return e;
  }

  // Fixed world-space ports of an entity: [{kind, x, y, dir, nx, ny}], where
  // (nx, ny) is the neighbouring cell the port connects to. Chests have no fixed
  // ports (any side works); a belt's single port is its output.
  /**
   * @param {EntitySpec} e
   * @returns {Port[]}
   */
  ports(e) {
    /**
     * @param {PortDef['kind']} kind
     * @param {number} x
     * @param {number} y
     * @param {number} dir
     */
    const port = (kind, x, y, dir) => withNeighbour({ kind, x, y, dir: mod4(dir) });
    switch (e.kind) {
      case 'station':
        return (stationVariants(e.type)[e.variant] ?? stationVariants(e.type)[defaultVariant(e.type)]).ports
          .map((p) => port(p.kind, e.x + p.x, e.y + p.y, p.dir));
      case 'belt':
      case 'distributor':
        return [port('out', e.x, e.y, e.rot)];
      case 'supply_station':
        return [port('in', e.x, e.y, e.rot)];
      case 'splitter':
        return [port('in', e.x, e.y, e.rot + 2), port('out', e.x, e.y, e.rot + 1), port('out', e.x, e.y, e.rot + 3)];
      case 'underground': {
        const cells = entityCells(e);
        const exit = cells[cells.length - 1];
        return [port('in', e.x, e.y, e.rot + 2), port('out', exit.x, exit.y, e.rot)];
      }
      default:
        return [];
    }
  }

  // Does entity `t` accept items pushed into it from the neighbouring cell (fx, fy)?
  /**
   * @param {EntitySpec} t
   * @param {number} fx
   * @param {number} fy
   * @returns {boolean}
   */
  acceptsFrom(t, fx, fy) {
    if (t.kind === 'chest') return true;
    if (t.kind === 'belt') {
      const dir = DIRS.findIndex((d) => fx + d.dx === t.x && fy + d.dy === t.y);
      return dir === t.rot || (BELT_ACCEPTS_FROM_SIDES && dir !== mod4(t.rot + 2));
    }
    return this.ports(t).some((p) => p.kind === 'in' && p.nx === fx && p.ny === fy);
  }

  /**
   * Factory power the layout uses (POWER_COST per piece).
   * @returns {number}
   */
  power() {
    return powerOf(this.entities);
  }

  // ---- validation ----------------------------------------------------------

  /** @returns {Issue[]} */
  validate() {
    /** @type {Issue[]} */
    const issues = [];
    /**
     * @param {Issue['severity']} severity
     * @param {Entity | null} entity
     * @param {string} message
     * @param {XY[]} [cells] defaults to the entity's footprint
     */
    const add = (severity, entity, message, cells) =>
      issues.push({ severity, entityId: entity?.id ?? null, message, cells: cells ?? (entity ? this.footprint(entity) : []) });

    /** @type {Map<number, Entity>} */
    const seen = new Map();
    for (const e of this.entities) {
      for (const c of entityCells(e)) {
        const { x, y } = c;
        if (!this.inBounds(x, y)) { add('error', e, `${describeEntity(e)} is outside the layout`); break; }
        if (c.gap) {
          if (UNDERGROUND_GAP_MUST_BE_FLOOR && !this.isFloor(x, y)) add('error', e, `${describeEntity(e)}: gap is off the factory floor`, [[x, y]]);
          const crossing = this.entityAt(x, y);
          if (crossing && crossing.kind !== 'belt') add('error', e, `${describeEntity(crossing)} sits in the gap of ${describeEntity(e)}`, [[x, y]]);
          continue;
        }
        if (!this.isFloor(x, y)) { add('error', e, `${describeEntity(e)} is off the factory floor`, [[x, y]]); break; }
        const k = y * this.width + x;
        if (seen.has(k)) { add('error', e, `${describeEntity(e)} overlaps ${describeEntity(seen.get(k))}`, [[x, y]]); break; }
        seen.set(k, e);
      }

      if (ENTITY_KINDS[e.kind]?.hasMaterial && !ITEM_BY_ID[e.material]) {
        add('warning', e, `${describeEntity(e)} has no material set`);
      }
      if (e.kind === 'chest') {
        if (!CHEST_LEVELS[e.level]) add('error', e, `${describeEntity(e)}: unknown chest level ${e.level}`);
        for (const id of e.stock) if (!ITEM_BY_ID[id]) add('error', e, `${describeEntity(e)}: unknown stock item "${id}"`);
        for (const [side, id] of Object.entries(e.filters)) {
          if (!DIRS.some((d) => d.name === side)) add('error', e, `${describeEntity(e)}: unknown filter side "${side}"`);
          if (!ITEM_BY_ID[id]) add('error', e, `${describeEntity(e)}: unknown filter item "${id}" on side ${side}`);
        }
      }

      if (e.kind === 'station') {
        if (!STATIONS[e.type].levels.includes(e.level)) add('error', e, `${STATIONS[e.type].name} has no level ${e.level}`);
        if (!stationVariants(e.type)[e.variant]) add('error', e, `${describeEntity(e)}: unknown layout "${e.variant}"`);
        /** @type {Map<string, string>} extension slot -> extension id */
        const slots = new Map();
        for (const id of e.extensions) {
          const x = EXTENSIONS[id];
          if (!x) { add('error', e, `${describeEntity(e)}: unknown extension "${id}"`); continue; }
          if (x.station !== e.type) add('error', e, `${describeEntity(e)} can't take the ${x.name} extension`);
          else if (slots.has(x.slot)) add('error', e, `${describeEntity(e)}: ${EXTENSIONS[slots.get(x.slot)].name} and ${x.name} need the same ${x.slot} slot`);
          slots.set(x.slot, id);
        }
        const recipe = RECIPE_BY_ID[e.recipe];
        if (!e.recipe) add('info', e, `${describeEntity(e)} has no recipe assigned`);
        else if (!recipe) add('error', e, `${describeEntity(e)}: unknown recipe "${e.recipe}"`);
        else if (!recipesFor(e.type, e.level).some((r) => r.id === e.recipe)) {
          add('error', e, `${describeEntity(e)} cannot run recipe "${e.recipe}"`);
        } else if (recipe.extension && !e.extensions.includes(recipe.extension)) {
          add('error', e, `${describeEntity(e)} needs the ${EXTENSIONS[recipe.extension].name} extension for its recipe`);
        }
      }

      for (const p of this.ports(e)) this._validatePort(e, p, add);
    }
    return issues;
  }

  /**
   * @param {Entity} e
   * @param {Port} p
   * @param {AddIssue} add
   */
  _validatePort(e, p, add) {
    const what = e.kind === 'belt' ? `Belt at ${e.x},${e.y}` : describeEntity(e);
    if (!this.isFloor(p.nx, p.ny)) {
      add('warning', e, e.kind === 'belt' ? `${what} runs off the factory floor` : `${what}: ${p.kind === 'in' ? 'input' : 'output'} ${DIRS[p.dir].name} faces off the factory floor`, [[p.nx, p.ny]]);
      return;
    }
    if (p.kind === 'in') {
      // Chests only output onto belts: one placed against a station input does nothing.
      const source = this.entityAt(p.nx, p.ny);
      if (source?.kind === 'chest' && e.kind === 'station') {
        add('warning', e, `${describeEntity(source)} can't feed ${describeEntity(e)} directly — put a belt in between`, [[p.x, p.y], [p.nx, p.ny]]);
      }
      return;
    }
    const target = this.entityAt(p.nx, p.ny);
    if (e.kind === 'station' && target?.kind === 'chest' && DIRS[p.dir].dx !== 0) {
      add('warning', e, `${what}: a side output can't push straight into ${describeEntity(target)} — put a belt in between`, [[p.x, p.y], [p.nx, p.ny]]);
      return;
    }
    if (!target || this.acceptsFrom(target, p.x, p.y)) return;
    if (e.kind === 'belt' && target.kind === 'belt' && target.rot === mod4(e.rot + 2)) {
      add('warning', e, `Belts at ${e.x},${e.y} and ${p.nx},${p.ny} face each other`, [[e.x, e.y], [p.nx, p.ny]]);
    } else {
      add('warning', e, `${what} feeds ${describeEntity(target)} from a side with no input`, [[p.x, p.y], [p.nx, p.ny]]);
    }
  }

  // ---- serialization -------------------------------------------------------

  /** @returns {LayoutJSON & { entities: Entity[] }} */
  toJSON() {
    const rows = this.terrainToText().split('\n');
    return {
      format: 'factory-layout',
      version: FORMAT_VERSION,
      name: this.name,
      width: this.width,
      height: this.height,
      legend: { '.': 'floor', ' ': 'outside' },
      terrain: rows,
      entities: this.entities.map((e) => ({ ...e })),
      ...(this.planner ? { planner: structuredClone(this.planner) } : {}),
    };
  }

  /**
   * @param {string | LayoutJSON} json
   * @returns {Layout}
   */
  static fromJSON(json) {
    const data = /** @type {LayoutJSON} */ (typeof json === 'string' ? JSON.parse(json) : json);
    if (!Array.isArray(data.terrain)) throw new Error('Missing "terrain" rows');
    const layout = new Layout({ name: data.name, width: 1, height: 1, entities: [], planner: data.planner });
    layout.setTerrainFromText(data.terrain.join('\n'));
    if (data.width) layout.resize({ right: data.width - layout.width });
    if (data.height) layout.resize({ bottom: data.height - layout.height });
    for (const e of data.entities ?? []) {
      if (!ENTITY_KINDS[e.kind]) throw new Error(`Unknown entity kind "${e.kind}"`);
      if (e.kind === 'station' && !STATIONS[e.type]) throw new Error(`Unknown station type "${e.type}"`);
      // Ids missing from old files are assigned below.
      layout.entities.push(/** @type {Entity} */ (normalizeEntity({ ...e })));
    }
    layout.nextId = layout.entities.reduce((m, e) => Math.max(m, e.id ?? 0), 0) + 1;
    for (const e of layout.entities) if (e.id == null) e.id = layout.nextId++;
    layout._occ = null;
    return layout;
  }
}

// Fill defaults and migrate older files (stations no longer rotate; chests
// used to have a single material and output direction; stations had no
// extensions, so an old station gets the one its recipe needs).
/**
 * @template {EntitySpec} T
 * @param {T} e
 * @returns {T}
 */
function normalizeEntity(e) {
  e.locked ??= true;
  if (e.kind === 'station') {
    e.variant ??= defaultVariant(e.type);
    const needed = RECIPE_BY_ID[e.recipe]?.extension;
    e.extensions ??= needed ? [needed] : [];
    delete e.rot;
  } else if (e.kind === 'chest') {
    e.level ??= 1;
    e.stock ??= e.material ? [e.material] : [];
    e.filters ??= {};
    delete e.material;
    delete e.rot;
  } else {
    e.rot ??= 0;
  }
  return e;
}

/**
 * @param {number} v
 * @returns {Dir}
 */
function mod4(v) {
  return /** @type {Dir} */ (((v % 4) + 4) % 4);
}

/**
 * @param {PortDef} p
 * @returns {Port}
 */
function withNeighbour(p) {
  return { ...p, nx: p.x + DIRS[p.dir].dx, ny: p.y + DIRS[p.dir].dy };
}

/**
 * @param {string[]} lines
 * @returns {Terrain[][]}
 */
function parseTerrainRows(lines) {
  const valid = new Set([VOID, FLOOR]);
  return lines.map((line) =>
    [...line].map((c) => {
      const t = TERRAIN_ALIASES[c] ?? c;
      if (!valid.has(t)) throw new Error(`Unknown terrain character "${c}"`);
      return t;
    }),
  );
}

/**
 * Factory power a set of pieces uses.
 * @param {EntitySpec[]} entities
 * @returns {number}
 */
export function powerOf(entities) {
  return entities.reduce((n, e) => n + (POWER_COST[e.kind] ?? 0), 0);
}

/**
 * @param {Terrain} t
 * @returns {string}
 */
export function terrainName(t) {
  return TERRAIN_TYPES.find((tt) => tt.id === t)?.name ?? 'Unknown';
}

/**
 * @param {EntitySpec} e
 * @returns {string}
 */
export function describeEntity(e) {
  if (e.kind === 'station') {
    const roman = ['', 'I', 'II', 'III'][e.level] ?? e.level;
    return `${STATIONS[e.type]?.name ?? e.type} ${roman} at ${e.x},${e.y}`;
  }
  const items = e.kind === 'chest' ? e.stock ?? [] : e.material ? [e.material] : [];
  const mat = items.length ? ` (${items.map((id) => ITEM_BY_ID[id]?.name ?? id).join(', ')})` : '';
  return `${ENTITY_KINDS[e.kind]?.name ?? e.kind}${mat} at ${e.x},${e.y}`;
}
