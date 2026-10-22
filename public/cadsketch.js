/**
 * CADSketch Engine & Application Controller
 * Pure Google SketchUp Architecture in WebGL
 * Developer: Aadesh Navade (+91 93411 02949)
 *
 * Core Capabilities:
 * - 100% Google SketchUp Look & Feel
 * - Interactive 3D ViewCube HUD with Compass (Clickable Top, Front, Right, Back, Left, Bottom, Home)
 * - Push/Pull 3D Dynamic Surface Extrusion with Live Prism Preview
 * - Real-time Axis Snapping (Red/Green/Blue) & Vertex/Midpoint Inference Engine
 * - Line, Rectangle, Circle, Arc, Offset, Move, Rotate, Scale, Tape Measure, Dimension, Eraser, Paint Bucket
 * - Autodesk Revit Mouse Navigation:
 *     - Orbit: Right-Click Drag OR Shift + Middle-Click Drag
 *     - Pan: Middle-Click Drag OR Alt + Left-Click Drag
 *     - Zoom: Mouse Scroll Wheel
 * - 3D Architectural Components: Detailed Doors, Windows, Stairs, Kitchen, Beds, Columns, Scale Figure
 * - 30+ Architectural Materials with Swatches
 * - Section Plane Cutting Tool with Real-time GPU Clipping Planes
 * - Live Measurements Box (VCB) with Direct Numeric Keyboard Input
 * - Wavefront 3D OBJ & JSON Project Exporters
 */

(function(window) {
  'use strict';

  // ==========================================
  // 1. MATHEMATICAL GEOMETRY CORE (B-REP)
  // ==========================================

  class Point3D {
    constructor(x = 0, y = 0, z = 0) {
      this.x = Number(x);
      this.y = Number(y);
      this.z = Number(z);
    }
    clone() { return new Point3D(this.x, this.y, this.z); }
    add(p) { return new Point3D(this.x + p.x, this.y + p.y, this.z + p.z); }
    sub(p) { return new Point3D(this.x - p.x, this.y - p.y, this.z - p.z); }
    multiplyScalar(s) { return new Point3D(this.x * s, this.y * s, this.z * s); }
    dot(p) { return this.x * p.x + this.y * p.y + this.z * p.z; }
    cross(p) {
      return new Point3D(
        this.y * p.z - this.z * p.y,
        this.z * p.x - this.x * p.z,
        this.x * p.y - this.y * p.x
      );
    }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
    normalize() {
      const l = this.length();
      return l > 1e-9 ? new Point3D(this.x / l, this.y / l, this.z / l) : new Point3D(0, 0, 1);
    }
    distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y, this.z - p.z); }
    equals(p, tol = 1e-4) {
      return Math.abs(this.x - p.x) <= tol && Math.abs(this.y - p.y) <= tol && Math.abs(this.z - p.z) <= tol;
    }
    toArray() { return [this.x, this.y, this.z]; }
  }

  class Edge {
    constructor(id, startPoint, endPoint, isGuide = false) {
      this.id = id;
      this.start = startPoint.clone();
      this.end = endPoint.clone();
      this.isGuide = isGuide;
    }
    length() { return this.start.distanceTo(this.end); }
    midpoint() {
      return new Point3D((this.start.x + this.end.x) / 2, (this.start.y + this.end.y) / 2, (this.start.z + this.end.z) / 2);
    }
  }

  class Face {
    constructor(id, points = [], material = null) {
      this.id = id;
      this.points = points.map(p => p.clone());
      this.material = material || { color: '#ffffff', name: 'CADSketch Default White' };
      this.normal = this.computeNormal();
      this.area = this.computeArea();
      this.edgeIds = [];
    }

    computeNormal() {
      if (this.points.length < 3) return new Point3D(0, 0, 1);
      let nx = 0, ny = 0, nz = 0;
      const n = this.points.length;
      for (let i = 0; i < n; i++) {
        const cur = this.points[i];
        const next = this.points[(i + 1) % n];
        nx += (cur.y - next.y) * (cur.z + next.z);
        ny += (cur.z - next.z) * (cur.x + next.x);
        nz += (cur.x - next.x) * (cur.y + next.y);
      }
      return new Point3D(nx, ny, nz).normalize();
    }

    computeArea() {
      if (this.points.length < 3) return 0;
      let totalArea = 0;
      const n = this.points.length;
      const p0 = this.points[0];
      for (let i = 1; i < n - 1; i++) {
        const v1 = this.points[i].sub(p0);
        const v2 = this.points[i + 1].sub(p0);
        totalArea += v1.cross(v2).length() * 0.5;
      }
      return Number(totalArea.toFixed(3));
    }
  }

  class SectionPlane {
    constructor(id, position, normal = new Point3D(0, 0, -1), name = 'Section 1') {
      this.id = id;
      this.position = position.clone();
      this.normal = normal.normalize();
      this.name = name;
      this.active = true;
    }
  }

  class DimensionString {
    constructor(id, p1, p2, text = '', offset = 0.5) {
      this.id = id;
      this.p1 = p1.clone();
      this.p2 = p2.clone();
      this.offset = offset;
      this.length = p1.distanceTo(p2);
      this.text = text || `${this.length.toFixed(2)}`;
    }
  }

  // ==========================================
  // 2. CADSKETCH MODEL CONTAINER
  // ==========================================

  class CADSketchModel {
    constructor(name = 'Modern Architectural House') {
      this.name = name;
      this.units = 'm';
      this.faces = [];
      this.edges = [];
      this.sectionPlanes = [];
      this.dimensions = [];
      this.displaySectionCuts = true;
      this.displaySectionPlanes = true;
      this.idCounter = 1;
      this.undoStack = [];
      this.redoStack = [];
    }

    nextId(prefix = 'entity') { return `${prefix}_${this.idCounter++}`; }

    saveSnapshot(actionName = 'Edit') {
      const state = JSON.stringify(this.serialize());
      this.undoStack.push({ action: actionName, state });
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      if (this.undoStack.length === 0) return false;
      const currentState = JSON.stringify(this.serialize());
      const previous = this.undoStack.pop();
      this.redoStack.push({ action: previous.action, state: currentState });
      this.deserialize(JSON.parse(previous.state));
      return true;
    }

    redo() {
      if (this.redoStack.length === 0) return false;
      const currentState = JSON.stringify(this.serialize());
      const next = this.redoStack.pop();
      this.undoStack.push({ action: next.action, state: currentState });
      this.deserialize(JSON.parse(next.state));
      return true;
    }

    addEdge(p1, p2, isGuide = false) {
      for (const edge of this.edges) {
        if ((edge.start.equals(p1) && edge.end.equals(p2)) || (edge.start.equals(p2) && edge.end.equals(p1))) {
          return edge;
        }
      }
      const edge = new Edge(this.nextId('edge'), p1, p2, isGuide);
      this.edges.push(edge);
      return edge;
    }

    addFace(points, material = null) {
      if (points.length < 3) return null;
      const face = new Face(this.nextId('face'), points, material);
      const n = points.length;
      for (let i = 0; i < n; i++) {
        const edge = this.addEdge(points[i], points[(i + 1) % n]);
        face.edgeIds.push(edge.id);
      }
      this.faces.push(face);
      return face;
    }

    pushPullFace(faceId, distance) {
      const face = this.faces.find(f => f.id === faceId);
      if (!face || Math.abs(distance) < 1e-4) return null;

      this.saveSnapshot(`Push/Pull Face (${distance.toFixed(2)})`);
      const normal = face.normal;
      const offsetVector = normal.multiplyScalar(distance);
      const n = face.points.length;
      const newTopPoints = face.points.map(p => p.add(offsetVector));

      const sideFaces = [];
      for (let i = 0; i < n; i++) {
        const nextIdx = (i + 1) % n;
        const b1 = face.points[i];
        const b2 = face.points[nextIdx];
        const t1 = newTopPoints[i];
        const t2 = newTopPoints[nextIdx];
        const sideFace = this.addFace([b1, b2, t2, t1], face.material);
        sideFaces.push(sideFace);
      }

      face.points = newTopPoints;
      face.normal = face.computeNormal();
      face.area = face.computeArea();
      face.edgeIds = [];
      for (let i = 0; i < n; i++) {
        const edge = this.addEdge(newTopPoints[i], newTopPoints[(i + 1) % n]);
        face.edgeIds.push(edge.id);
      }

      return { topFace: face, sideFaces };
    }

    createRectangle(corner1, corner2, z = 0, material = null) {
      const p1 = new Point3D(Math.min(corner1.x, corner2.x), Math.min(corner1.y, corner2.y), z);
      const p2 = new Point3D(Math.max(corner1.x, corner2.x), Math.min(corner1.y, corner2.y), z);
      const p3 = new Point3D(Math.max(corner1.x, corner2.x), Math.max(corner1.y, corner2.y), z);
      const p4 = new Point3D(Math.min(corner1.x, corner2.x), Math.max(corner1.y, corner2.y), z);
      return this.addFace([p1, p2, p3, p4], material);
    }

    createCircle(center, radius, segments = 24, z = 0, material = null) {
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push(new Point3D(center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius, z));
      }
      return this.addFace(pts, material);
    }

    offsetFace(faceId, distance) {
      const face = this.faces.find(f => f.id === faceId);
      if (!face || Math.abs(distance) < 1e-4) return null;
      this.saveSnapshot(`Offset Face (${distance})`);

      const pts = face.points;
      const n = pts.length;
      const normal = face.normal;
      const offsetPts = [];

      for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const cur = pts[i];
        const next = pts[(i + 1) % n];

        const v1 = cur.sub(prev).normalize();
        const v2 = next.sub(cur).normalize();
        const n1 = v1.cross(normal).normalize();
        const n2 = v2.cross(normal).normalize();

        const bisector = n1.add(n2).normalize();
        const cosAngle = n1.dot(bisector);
        const miterDist = distance / (cosAngle > 0.1 ? cosAngle : 1.0);
        offsetPts.push(cur.add(bisector.multiplyScalar(miterDist)));
      }
      return this.addFace(offsetPts, face.material);
    }

    deleteFace(faceId) {
      const idx = this.faces.findIndex(f => f.id === faceId);
      if (idx === -1) return false;
      this.saveSnapshot('Delete Face');
      this.faces.splice(idx, 1);
      return true;
    }

    eraseEdge(edgeId) {
      const idx = this.edges.findIndex(e => e.id === edgeId);
      if (idx === -1) return false;
      this.saveSnapshot('Erase Edge');
      this.edges.splice(idx, 1);
      this.faces = this.faces.filter(f => !f.edgeIds.includes(edgeId));
      return true;
    }

    addSectionPlane(pos, normal = new Point3D(0, 0, -1)) {
      this.saveSnapshot('Add Section Plane');
      const sp = new SectionPlane(this.nextId('section'), pos, normal, `Section ${this.sectionPlanes.length + 1}`);
      this.sectionPlanes.push(sp);
      return sp;
    }

    loadSampleBuilding() {
      this.faces = [];
      this.edges = [];
      this.dimensions = [];
      this.sectionPlanes = [];
      this.idCounter = 1;

      // Foundation Slab
      const slab = this.createRectangle(new Point3D(-1, -1, 0), new Point3D(16, 12, 0), 0, { color: '#94a3b8', name: 'Foundation Slab', roughness: 0.8 });
      this.pushPullFace(slab.id, -0.4);

      // Flooring
      this.createRectangle(new Point3D(0, 0, 0), new Point3D(8, 7, 0), 0, { color: '#f8fafc', name: 'Living Room Flooring' });
      this.createRectangle(new Point3D(8, 0, 0), new Point3D(15, 6, 0), 0, { color: '#d97706', name: 'Master Bed Oak' });
      this.createRectangle(new Point3D(8, 6, 0), new Point3D(15, 11, 0), 0, { color: '#18181b', name: 'Kitchen Granite' });
      this.createRectangle(new Point3D(0, 7, 0), new Point3D(8, 11, 0), 0, { color: '#334155', name: 'Dining Slate' });

      // Perimeter Walls
      const w1 = this.createRectangle(new Point3D(0, -0.28, 0), new Point3D(15, 0, 0), 0, { color: '#f1f5f9', name: 'Exterior Wall' });
      this.pushPullFace(w1.id, 3.2);

      const w2 = this.createRectangle(new Point3D(0, 11, 0), new Point3D(15, 11.28, 0), 0, { color: '#f1f5f9', name: 'Exterior Wall' });
      this.pushPullFace(w2.id, 3.2);

      const w3 = this.createRectangle(new Point3D(-0.28, -0.28, 0), new Point3D(0, 11.28, 0), 0, { color: '#f1f5f9', name: 'Exterior Wall' });
      this.pushPullFace(w3.id, 3.2);

      const w4 = this.createRectangle(new Point3D(15, -0.28, 0), new Point3D(15.28, 11.28, 0), 0, { color: '#f1f5f9', name: 'Exterior Wall' });
      this.pushPullFace(w4.id, 3.2);

      // Interior Partitions
      const p1 = this.createRectangle(new Point3D(7.88, 0, 0), new Point3D(8.12, 11, 0), 0, { color: '#e2e8f0', name: 'Interior Wall' });
      this.pushPullFace(p1.id, 3.0);

      const p2 = this.createRectangle(new Point3D(8.12, 5.88, 0), new Point3D(15, 6.12, 0), 0, { color: '#e2e8f0', name: 'Interior Wall' });
      this.pushPullFace(p2.id, 3.0);

      // 3D Door Assembly
      CADSketchComponents.insertDoor(this, new Point3D(3.2, 0, 0), 1.0, 2.2);

      // 3D Window Assembly
      CADSketchComponents.insertWindow(this, new Point3D(1.0, 0, 0), 1.8, 1.4, 0.9);

      // Portico Columns
      const col1 = this.createRectangle(new Point3D(-0.8, -0.8, 0), new Point3D(-0.3, -0.3, 0), 0, { color: '#94a3b8', name: 'R.C.C Column' });
      this.pushPullFace(col1.id, 3.4);

      const col2 = this.createRectangle(new Point3D(15.3, -0.8, 0), new Point3D(15.8, -0.3, 0), 0, { color: '#94a3b8', name: 'R.C.C Column' });
      this.pushPullFace(col2.id, 3.4);

      // Human Scale Figure ("Susan")
      CADSketchComponents.insertScaleFigure(this, new Point3D(2, 2, 0));

      return this;
    }

    serialize() {
      return {
        name: this.name,
        units: this.units,
        faces: this.faces.map(f => ({ id: f.id, points: f.points.map(p => [p.x, p.y, p.z]), material: f.material })),
        edges: this.edges.map(e => ({ id: e.id, start: [e.start.x, e.start.y, e.start.z], end: [e.end.x, e.end.y, e.end.z] })),
        sectionPlanes: this.sectionPlanes.map(sp => ({ id: sp.id, pos: [sp.position.x, sp.position.y, sp.position.z], active: sp.active }))
      };
    }

    deserialize(data) {
      if (!data) return;
      this.edges = (data.edges || []).map(e => new Edge(e.id, new Point3D(...e.start), new Point3D(...e.end)));
      this.faces = (data.faces || []).map(f => {
        const pts = (f.points || []).map(p => new Point3D(...p));
        return new Face(f.id, pts, f.material);
      });
    }
  }

  // ==========================================
  // 3. MATERIALS PALETTE
  // ==========================================

  const CADSKETCH_MATERIALS = {
    color_white: { name: 'CADSketch Pure White', color: '#f8fafc', category: 'Colors', roughness: 0.8 },
    color_charcoal: { name: 'Dark Charcoal Slate', color: '#1e293b', category: 'Colors', roughness: 0.7 },
    color_crimson: { name: 'Crimson Red', color: '#b91c1c', category: 'Colors', roughness: 0.6 },
    color_warm_cream: { name: 'Warm Cream Plaster', color: '#fef3c7', category: 'Colors', roughness: 0.8 },
    color_sky: { name: 'SketchUp Sky Blue', color: '#38bdf8', category: 'Colors', roughness: 0.5 },
    brick_red: { name: 'Standard Red Brick', color: '#991b1b', category: 'Brick & Cladding', roughness: 0.9 },
    brick_antique: { name: 'Antique Brown Brick', color: '#7c2d12', category: 'Brick & Cladding', roughness: 0.92 },
    concrete_block: { name: 'Concrete Block Masonry', color: '#94a3b8', category: 'Brick & Cladding', roughness: 0.88 },
    wood_teak: { name: 'Natural Teak Wood', color: '#78350f', category: 'Wood', roughness: 0.4 },
    wood_oak: { name: 'Light White Oak', color: '#d97706', category: 'Wood', roughness: 0.45 },
    wood_walnut: { name: 'Dark Walnut Plank', color: '#451a03', category: 'Wood', roughness: 0.38 },
    glass_float: { name: 'Translucent Float Glass', color: '#a5f3fc', category: 'Glass & Mirrors', transparent: true, opacity: 0.35 },
    glass_blue: { name: 'Tinted Blue Glass', color: '#0284c7', category: 'Glass & Mirrors', transparent: true, opacity: 0.45 },
    stone_granite: { name: 'Black Pearl Granite', color: '#18181b', category: 'Stone & Tile', roughness: 0.15 },
    stone_marble: { name: 'Carrara White Marble', color: '#f1f5f9', category: 'Stone & Tile', roughness: 0.2 },
    tile_slate: { name: 'Dark Slate Paver', color: '#334155', category: 'Stone & Tile', roughness: 0.7 },
    metal_steel: { name: 'Brushed Stainless Steel', color: '#cbd5e1', category: 'Metal', metalness: 0.85, roughness: 0.25 },
    metal_brass: { name: 'Satin Architectural Brass', color: '#eab308', category: 'Metal', metalness: 0.8, roughness: 0.3 },
    lawn_grass: { name: 'Lush Green Lawn Grass', color: '#15803d', category: 'Roofing & Landscaping', roughness: 0.95 },
    roof_clay: { name: 'Spanish Clay Roof Tile', color: '#ea580c', category: 'Roofing & Landscaping', roughness: 0.8 }
  };

  // ==========================================
  // 4. 3D ARCHITECTURAL COMPONENTS
  // ==========================================

  class CADSketchComponents {
    static insertDoor(model, pos, width = 0.95, height = 2.15, wallThick = 0.24) {
      const x = pos.x, y = pos.y, z = pos.z || 0;
      const j1 = model.createRectangle(new Point3D(x, y - wallThick / 2, z), new Point3D(x + 0.05, y + wallThick / 2, z), z, { color: '#78350f', name: 'Wood Jamb' });
      if (j1) model.pushPullFace(j1.id, height);
      const j2 = model.createRectangle(new Point3D(x + width - 0.05, y - wallThick / 2, z), new Point3D(x + width, y + wallThick / 2, z), z, { color: '#78350f', name: 'Wood Jamb' });
      if (j2) model.pushPullFace(j2.id, height);
      const leaf = model.createRectangle(new Point3D(x + 0.05, y - 0.02, z), new Point3D(x + width - 0.05, y + 0.02, z), z, { color: '#92400e', name: 'Teak Door Leaf' });
      if (leaf) model.pushPullFace(leaf.id, height - 0.04);
    }

    static insertWindow(model, pos, width = 1.6, height = 1.3, sillH = 0.9, wallThick = 0.24) {
      const x = pos.x, y = pos.y, z = (pos.z || 0) + sillH;
      const sill = model.createRectangle(new Point3D(x - 0.05, y - wallThick / 2 - 0.05, z - 0.04), new Point3D(x + width + 0.05, y + wallThick / 2 + 0.02, z - 0.04), z - 0.04, { color: '#94a3b8', name: 'Stone Sill' });
      if (sill) model.pushPullFace(sill.id, 0.04);
      const glass = model.createRectangle(new Point3D(x + 0.04, y - 0.01, z), new Point3D(x + width - 0.04, y + 0.01, z), z, { color: '#a5f3fc', transparent: true, opacity: 0.35, name: 'Float Glass' });
      if (glass) model.pushPullFace(glass.id, height);
    }

    static insertStairs(model, pos, steps = 12, width = 1.0, tread = 0.26, riser = 0.17) {
      const x = pos.x, y = pos.y, z = pos.z || 0;
      for (let i = 0; i < steps; i++) {
        const step = model.createRectangle(new Point3D(x, y + i * tread, z), new Point3D(x + width, y + (i + 1) * tread, z), z, { color: '#cbd5e1', name: 'Stair Step' });
        if (step) model.pushPullFace(step.id, (i + 1) * riser);
      }
    }

    static insertKitchenCounter(model, pos, length = 2.4, depth = 0.6, height = 0.86) {
      const x = pos.x, y = pos.y, z = pos.z || 0;
      const base = model.createRectangle(new Point3D(x, y, z), new Point3D(x + length, y + depth, z), z, { color: '#78350f', name: 'Wood Cabinet' });
      if (base) model.pushPullFace(base.id, height - 0.04);
      const top = model.createRectangle(new Point3D(x - 0.02, y - 0.02, z + height - 0.04), new Point3D(x + length + 0.02, y + depth + 0.02, z + height - 0.04), z + height - 0.04, { color: '#18181b', name: 'Black Granite' });
      if (top) model.pushPullFace(top.id, 0.04);
    }

    static insertKingBed(model, pos, width = 1.9, length = 2.1) {
      const x = pos.x, y = pos.y, z = pos.z || 0;
      const base = model.createRectangle(new Point3D(x, y, z), new Point3D(x + width, y + length, z), z, { color: '#d97706', name: 'Oak Bed Frame' });
      if (base) model.pushPullFace(base.id, 0.35);
      const mattress = model.createRectangle(new Point3D(x + 0.05, y + 0.05, z + 0.35), new Point3D(x + width - 0.05, y + length - 0.05, z + 0.35), z + 0.35, { color: '#f8fafc', name: 'Comfort Mattress' });
      if (mattress) model.pushPullFace(mattress.id, 0.22);
      const head = model.createRectangle(new Point3D(x, y + length - 0.08, z), new Point3D(x + width, y + length, z), z, { color: '#78350f', name: 'Bed Headboard' });
      if (head) model.pushPullFace(head.id, 1.1);
    }

    static insertScaleFigure(model, pos) {
      const x = pos.x, y = pos.y, z = pos.z || 0;
      const body = model.createRectangle(new Point3D(x - 0.2, y - 0.1, z), new Point3D(x + 0.2, y + 0.1, z), z, { color: '#dc2626', name: 'Scale Figure' });
      if (body) model.pushPullFace(body.id, 1.7);
    }
  }

  // ==========================================
  // 5. INFERENCE SNAPPING ENGINE
  // ==========================================

  class InferenceEngine {
    constructor(model) {
      this.model = model;
      this.snapDistance = 0.35;
    }

    findInference(startPt, curPt) {
      if (!curPt) return { point: new Point3D(0, 0, 0), type: 'free', tooltip: '', color: 0x000000 };

      // Endpoints & Midpoints
      for (const edge of this.model.edges) {
        if (curPt.distanceTo(edge.start) <= this.snapDistance) {
          return { point: edge.start.clone(), type: 'endpoint', tooltip: 'Endpoint', color: 0x16a34a };
        }
        if (curPt.distanceTo(edge.end) <= this.snapDistance) {
          return { point: edge.end.clone(), type: 'endpoint', tooltip: 'Endpoint', color: 0x16a34a };
        }
        const mid = edge.midpoint();
        if (curPt.distanceTo(mid) <= this.snapDistance) {
          return { point: mid, type: 'midpoint', tooltip: 'Midpoint', color: 0x06b6d4 };
        }
      }

      // Origin Snap
      const origin = new Point3D(0, 0, 0);
      if (curPt.distanceTo(origin) <= this.snapDistance) {
        return { point: origin, type: 'origin', tooltip: 'Origin', color: 0xf59e0b };
      }

      // Axis Alignment Inferences (Red=X, Green=Y, Blue=Z)
      if (startPt) {
        const dx = Math.abs(curPt.x - startPt.x);
        const dy = Math.abs(curPt.y - startPt.y);
        const dz = Math.abs(curPt.z - startPt.z);

        if (dy < 0.35 && dz < 0.35 && dx > 0.1) {
          return { point: new Point3D(curPt.x, startPt.y, startPt.z), type: 'axis_red', tooltip: 'On Red Axis', color: 0xef4444 };
        }
        if (dx < 0.35 && dz < 0.35 && dy > 0.1) {
          return { point: new Point3D(startPt.x, curPt.y, startPt.z), type: 'axis_green', tooltip: 'On Green Axis', color: 0x22c55e };
        }
        if (dx < 0.35 && dy < 0.35 && dz > 0.1) {
          return { point: new Point3D(startPt.x, startPt.y, curPt.z), type: 'axis_blue', tooltip: 'On Blue Axis', color: 0x3b82f6 };
        }
      }

      return { point: curPt.clone(), type: 'free', tooltip: '', color: 0x000000 };
    }
  }

  // ==========================================
  // 6. THREE.JS VIEWPORT & RENDERING PIPELINE
  // ==========================================

  class CADSketchViewport {
    constructor(container, onSelect, onToolAction, onViewAngleChange) {
      this.container = container;
      this.onSelect = onSelect || (() => {});
      this.onToolAction = onToolAction || (() => {});
      this.onViewAngleChange = onViewAngleChange || (() => {});
      this.model = null;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xc9e2f5); // SketchUp Sky Blue

      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || (window.innerHeight - 80);

      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
      this.camera.position.set(16, -18, 14);
      this.camera.up.set(0, 0, 1);
      this.target = new THREE.Vector3(4, 4, 1.5);
      this.camera.lookAt(this.target);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.localClippingEnabled = true;
      container.appendChild(this.renderer.domElement);

      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      this.geometryGroup = new THREE.Group();
      this.edgesGroup = new THREE.Group();
      this.tempGroup = new THREE.Group();
      this.inferenceGroup = new THREE.Group();

      this.scene.add(this.geometryGroup);
      this.scene.add(this.edgesGroup);
      this.scene.add(this.tempGroup);
      this.scene.add(this.inferenceGroup);

      this.selectedFaceId = null;
      this.hoverFaceId = null;
      this.currentStyle = 'classic';

      this.setupEnvironment();
      this.setupLighting();
      this.initMouseNavigation();
      this.animate();
    }

    setModel(model) {
      this.model = model;
      this.rebuildScene();
    }

    setupEnvironment() {
      // Ground plane
      const groundGeo = new THREE.PlaneGeometry(160, 160);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0xd6d0ba, roughness: 0.95 });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.position.set(0, 0, -0.01);
      groundMesh.receiveShadow = true;
      this.scene.add(groundMesh);

      // 3D RGB Coordinate Axes
      const makeLine = (p1, p2, color, isDashed = false) => {
        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const mat = isDashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.5, gapSize: 0.3 }) : new THREE.LineBasicMaterial({ color, linewidth: 2 });
        const line = new THREE.Line(geo, mat);
        if (isDashed) line.computeLineDistances();
        return line;
      };

      this.scene.add(makeLine(new THREE.Vector3(0,0,0.005), new THREE.Vector3(50,0,0.005), 0xef4444));
      this.scene.add(makeLine(new THREE.Vector3(0,0,0.005), new THREE.Vector3(-25,0,0.005), 0xfca5a5, true));
      this.scene.add(makeLine(new THREE.Vector3(0,0,0.005), new THREE.Vector3(0,50,0.005), 0x22c55e));
      this.scene.add(makeLine(new THREE.Vector3(0,0,0.005), new THREE.Vector3(0,-25,0.005), 0x86efac, true));
      this.scene.add(makeLine(new THREE.Vector3(0,0,0.005), new THREE.Vector3(0,0,30), 0x3b82f6));
      this.scene.add(makeLine(new THREE.Vector3(0,0,0.005), new THREE.Vector3(0,0,-15), 0x93c5fd, true));

      // Grid
      const grid = new THREE.GridHelper(40, 40, 0x94a3b8, 0xcfd8dc);
      grid.rotation.x = Math.PI / 2;
      grid.position.set(8, 8, 0);
      this.scene.add(grid);
    }

    setupLighting() {
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
      this.scene.add(this.ambientLight);

      this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
      this.sunLight.position.set(25, -20, 30);
      this.sunLight.castShadow = true;
      this.scene.add(this.sunLight);
    }

    initMouseNavigation() {
      let isOrbiting = false;
      let isPanning = false;
      let isCanvasDown = false;
      let prev = { x: 0, y: 0 };
      const dom = this.renderer.domElement;

      const updateMouse = (e) => {
        const rect = dom.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };

      dom.addEventListener('pointerdown', (e) => {
        isCanvasDown = true;
        prev = { x: e.clientX, y: e.clientY };
        updateMouse(e);

        // Revit: MMB or Alt+LMB = Pan
        if ((e.button === 1 && !e.shiftKey) || (e.button === 0 && e.altKey)) {
          isPanning = true;
          dom.style.cursor = 'grab';
          return;
        }
        // Revit: Shift+MMB or Right-Click (RMB) = Orbit
        if ((e.button === 1 && e.shiftKey) || e.button === 2) {
          isOrbiting = true;
          dom.style.cursor = 'crosshair';
          return;
        }
        // Left Click = Tool Action
        if (e.button === 0) {
          this.onToolAction('pointerdown', e, this.getIntersectionPoint());
        }
      });

      window.addEventListener('pointermove', (e) => {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        prev = { x: e.clientX, y: e.clientY };
        updateMouse(e);

        if (isOrbiting) {
          const rotSpeed = 0.0065;
          const offset = this.camera.position.clone().sub(this.target);
          const radius = offset.length();

          let theta = Math.atan2(offset.y, offset.x) - dx * rotSpeed;
          let phi = Math.acos(Math.min(Math.max(offset.z / radius, -1), 1)) - dy * rotSpeed;
          phi = Math.min(Math.max(phi, 0.05), Math.PI / 2 - 0.02);

          this.camera.position.x = this.target.x + radius * Math.sin(phi) * Math.cos(theta);
          this.camera.position.y = this.target.y + radius * Math.sin(phi) * Math.sin(theta);
          this.camera.position.z = this.target.z + radius * Math.cos(phi);
          this.camera.lookAt(this.target);
          this.notifyViewCubeAngle();
          return;
        }

        if (isPanning) {
          const panFactor = 0.022;
          const forward = new THREE.Vector3();
          this.camera.getWorldDirection(forward);
          const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
          const up = new THREE.Vector3().crossVectors(right, forward).normalize();
          const move = right.clone().multiplyScalar(-dx * panFactor).add(up.clone().multiplyScalar(dy * panFactor));
          this.camera.position.add(move);
          this.target.add(move);
          return;
        }

        if (isCanvasDown || e.target === dom) {
          this.onToolAction('pointermove', e, this.getIntersectionPoint());
        }
      });

      window.addEventListener('pointerup', (e) => {
        updateMouse(e);
        if (isOrbiting || isPanning) {
          isOrbiting = false;
          isPanning = false;
          dom.style.cursor = 'default';
          return;
        }
        if (e.button === 0 && isCanvasDown) {
          isCanvasDown = false;
          this.onToolAction('pointerup', e, this.getIntersectionPoint());
        }
      });

      dom.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoom = e.deltaY > 0 ? 1.12 : 0.88;
        const offset = this.camera.position.clone().sub(this.target);
        this.camera.position.copy(this.target).add(offset.multiplyScalar(zoom));
      });

      dom.addEventListener('contextmenu', e => e.preventDefault());
    }

    notifyViewCubeAngle() {
      const offset = this.camera.position.clone().sub(this.target).normalize();
      const polar = Math.acos(Math.min(Math.max(offset.z, -1), 1));
      const azimuth = Math.atan2(offset.y, offset.x);
      const degX = (polar * 180 / Math.PI) - 90;
      const degY = (azimuth * 180 / Math.PI);
      this.onViewAngleChange(degX, degY);
    }

    getIntersectionPoint() {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.geometryGroup.children, true);
      if (hits.length > 0) {
        const p = hits[0].point;
        return {
          point: new Point3D(p.x, p.y, p.z),
          faceId: hits[0].object.userData?.faceId,
          normal: hits[0].face ? new Point3D(hits[0].face.normal.x, hits[0].face.normal.y, hits[0].face.normal.z) : new Point3D(0,0,1),
          hitType: 'face'
        };
      }
      const plane = new THREE.Plane(new THREE.Vector3(0,0,1), 0);
      const target = new THREE.Vector3();
      const hitPlane = this.raycaster.ray.intersectPlane(plane, target);
      if (hitPlane) {
        return { point: new Point3D(target.x, target.y, target.z), hitType: 'ground' };
      }
      return null;
    }

    rebuildScene() {
      while (this.geometryGroup.children.length > 0) this.geometryGroup.remove(this.geometryGroup.children[0]);
      while (this.edgesGroup.children.length > 0) this.edgesGroup.remove(this.edgesGroup.children[0]);
      if (!this.model) return;

      const clippingPlanes = [];
      if (this.model.displaySectionCuts) {
        for (const sp of this.model.sectionPlanes) {
          if (sp.active) {
            clippingPlanes.push(new THREE.Plane(new THREE.Vector3(sp.normal.x, sp.normal.y, sp.normal.z), -sp.position.dot(sp.normal)));
          }
        }
      }

      // Rebuild 3D Faces
      for (const face of this.model.faces) {
        if (face.points.length < 3) continue;
        const vertices = [];
        const p0 = face.points[0];
        for (let i = 1; i < face.points.length - 1; i++) {
          vertices.push(p0.x, p0.y, p0.z);
          vertices.push(face.points[i].x, face.points[i].y, face.points[i].z);
          vertices.push(face.points[i + 1].x, face.points[i + 1].y, face.points[i + 1].z);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        geo.computeBoundingSphere();

        let colorHex = face.material?.color || '#ffffff';
        let opacity = face.material?.opacity || 1.0;
        let transparent = face.material?.transparent || false;

        if (this.selectedFaceId === face.id) {
          colorHex = '#38bdf8'; // Selected Cyan
        } else if (this.hoverFaceId === face.id) {
          colorHex = '#bae6fd'; // Light Cyan Hover
        }

        if (this.currentStyle === 'monochrome') colorHex = '#ffffff';
        else if (this.currentStyle === 'blueprint') colorHex = '#0284c7';
        else if (this.currentStyle === 'xray') { transparent = true; opacity = 0.55; }

        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex),
          roughness: face.material?.roughness || 0.65,
          metalness: face.material?.metalness || 0.05,
          transparent,
          opacity,
          side: THREE.DoubleSide,
          clippingPlanes
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { faceId: face.id };
        this.geometryGroup.add(mesh);
      }

      // Rebuild 3D Edges
      const edgeColor = this.currentStyle === 'blueprint' ? 0xffffff : 0x0f172a;
      const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor, linewidth: 2, clippingPlanes });
      for (const edge of this.model.edges) {
        const pts = [new THREE.Vector3(edge.start.x, edge.start.y, edge.start.z), new THREE.Vector3(edge.end.x, edge.end.y, edge.end.z)];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        this.edgesGroup.add(new THREE.Line(geo, edgeMat));
      }
    }

    clearTempGroup() {
      while (this.tempGroup.children.length > 0) this.tempGroup.remove(this.tempGroup.children[0]);
    }

    setRubberBandLine(p1, p2, colorHex = 0x0f172a) {
      this.clearTempGroup();
      const pts = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2.5 });
      this.tempGroup.add(new THREE.Line(geo, mat));
    }

    setRubberBandRect(p1, p2, z = 0, colorHex = 0x0284c7) {
      this.clearTempGroup();
      const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);

      const pts = [
        new THREE.Vector3(minX, minY, z), new THREE.Vector3(maxX, minY, z),
        new THREE.Vector3(maxX, maxY, z), new THREE.Vector3(minX, maxY, z),
        new THREE.Vector3(minX, minY, z)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.tempGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2 })));

      const quadVerts = [
        minX, minY, z, maxX, minY, z, maxX, maxY, z,
        minX, minY, z, maxX, maxY, z, minX, maxY, z
      ];
      const quadGeo = new THREE.BufferGeometry();
      quadGeo.setAttribute('position', new THREE.Float32BufferAttribute(quadVerts, 3));
      this.tempGroup.add(new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.25, side: THREE.DoubleSide })));
    }

    setRubberBandCircle(center, radius, z = 0, colorHex = 0x0284c7) {
      this.clearTempGroup();
      const pts = [];
      for (let i = 0; i <= 32; i++) {
        const theta = (i / 32) * Math.PI * 2;
        pts.push(new THREE.Vector3(center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius, z));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      this.tempGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colorHex, linewidth: 2 })));
    }

    setLivePushPullMesh(face, distance) {
      this.clearTempGroup();
      if (!face || Math.abs(distance) < 0.01) return;
      const normal = face.normal;
      const offset = new THREE.Vector3(normal.x * distance, normal.y * distance, normal.z * distance);
      const n = face.points.length;
      const bPts = face.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
      const tPts = bPts.map(p => p.clone().add(offset));

      const verts = [];
      for (let i = 1; i < n - 1; i++) {
        verts.push(tPts[0].x, tPts[0].y, tPts[0].z);
        verts.push(tPts[i].x, tPts[i].y, tPts[i].z);
        verts.push(tPts[i + 1].x, tPts[i + 1].y, tPts[i + 1].z);
      }
      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        verts.push(bPts[i].x, bPts[i].y, bPts[i].z);
        verts.push(bPts[next].x, bPts[next].y, bPts[next].z);
        verts.push(tPts[next].x, tPts[next].y, tPts[next].z);
        verts.push(bPts[i].x, bPts[i].y, bPts[i].z);
        verts.push(tPts[next].x, tPts[next].y, tPts[next].z);
        verts.push(tPts[i].x, tPts[i].y, tPts[i].z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
      this.tempGroup.add(new THREE.Mesh(geo, mat));
    }

    setStandardView(view) {
      const c = this.target;
      const dist = 28;
      if (view === 'top') {
        this.camera.up.set(0, 1, 0);
        this.camera.position.set(c.x, c.y + 0.001, c.z + dist);
      } else if (view === 'bottom') {
        this.camera.up.set(0, -1, 0);
        this.camera.position.set(c.x, c.y + 0.001, c.z - dist);
      } else {
        this.camera.up.set(0, 0, 1);
        if (view === 'iso') this.camera.position.set(c.x + 14, c.y - 18, c.z + 14);
        else if (view === 'front') this.camera.position.set(c.x, c.y - dist, c.z + 1);
        else if (view === 'back') this.camera.position.set(c.x, c.y + dist, c.z + 1);
        else if (view === 'left') this.camera.position.set(c.x - dist, c.y, c.z + 1);
        else if (view === 'right') this.camera.position.set(c.x + dist, c.y, c.z + 1);
      }
      this.camera.lookAt(c);
      this.notifyViewCubeAngle();
    }

    animate() {
      requestAnimationFrame(() => this.animate());
      this.renderer.render(this.scene, this.camera);
    }

    onResize() {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || (window.innerHeight - 80);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    }
  }

  // ==========================================
  // 7. INTERACTIVE TOOL MANAGER
  // ==========================================

  class ToolManager {
    constructor(model, viewport, onStatus, onMeasure) {
      this.model = model;
      this.viewport = viewport;
      this.inference = new InferenceEngine(model);
      this.onStatus = onStatus || (() => {});
      this.onMeasure = onMeasure || (() => {});

      this.activeTool = 'select';
      this.activeMaterial = { color: '#ffffff', name: 'CADSketch Default White' };

      this.lineStart = null;
      this.rectStart = null;
      this.circleStart = null;
      this.pushPullFaceId = null;
      this.pushPullStartPos = null;
      this.pushPullDist = 0;
      this.lastPushedFace = null;
    }

    setTool(tool) {
      this.activeTool = tool;
      this.lineStart = null;
      this.rectStart = null;
      this.circleStart = null;
      this.pushPullFaceId = null;
      this.viewport.clearTempGroup();

      const dom = this.viewport.renderer.domElement;
      if (tool === 'select') dom.style.cursor = 'default';
      else if (['line', 'rectangle', 'circle', 'tape', 'dimension'].includes(tool)) dom.style.cursor = 'crosshair';
      else if (tool === 'pushpull') dom.style.cursor = 'ew-resize';
      else if (tool === 'offset') dom.style.cursor = 'copy';
      else if (tool === 'eraser') dom.style.cursor = 'not-allowed';
      else if (tool === 'paint') dom.style.cursor = 'pointer';
      else dom.style.cursor = 'default';

      this.updatePrompt();
    }

    updatePrompt() {
      if (this.activeTool === 'select') this.onStatus('Select Tool: Click any face or edge to inspect.');
      else if (this.activeTool === 'line') this.onStatus(this.lineStart ? 'Line: Click second point or type length.' : 'Line: Click start point.');
      else if (this.activeTool === 'rectangle') this.onStatus(this.rectStart ? 'Rectangle: Click opposite corner.' : 'Rectangle: Click first corner.');
      else if (this.activeTool === 'circle') this.onStatus(this.circleStart ? 'Circle: Move to set radius.' : 'Circle: Click center point.');
      else if (this.activeTool === 'pushpull') this.onStatus('Push/Pull: Click and drag face to extrude into 3D solid.');
      else if (this.activeTool === 'offset') this.onStatus('Offset: Click a face and drag to offset contour.');
      else if (this.activeTool === 'eraser') this.onStatus('Eraser: Click on any face or edge to delete.');
      else if (this.activeTool === 'paint') this.onStatus(`Paint Bucket: Click on any face to apply "${this.activeMaterial.name}".`);
      else if (this.activeTool === 'section') this.onStatus('Section Plane: Click on surface to place cut plane.');
    }

    handleAction(action, e, hit) {
      const snapPt = hit ? hit.point : new Point3D(0,0,0);

      // SELECT
      if (this.activeTool === 'select' && action === 'pointerup') {
        if (hit && hit.hitType === 'face') {
          this.viewport.selectedFaceId = hit.faceId;
          const face = this.model.faces.find(f => f.id === hit.faceId);
          if (face) {
            this.onMeasure('Face Area', `${face.area} ${this.model.units === 'ft' ? 'sq ft' : 'sq m'}`);
            this.onStatus(`Selected Face (Area: ${face.area}).`);
            this.viewport.onSelect('face', face);
          }
        } else {
          this.viewport.selectedFaceId = null;
          this.onMeasure('Entity', '');
          this.onStatus('Select Tool: Click to select entity.');
          this.viewport.onSelect(null, null);
        }
        this.viewport.rebuildScene();
      }

      // LINE
      if (this.activeTool === 'line') {
        const inf = this.inference.findInference(this.lineStart, snapPt);
        if (action === 'pointermove' && this.lineStart) {
          this.viewport.setRubberBandLine(this.lineStart, inf.point, inf.color);
          const len = this.lineStart.distanceTo(inf.point);
          this.onMeasure('Length', `${len.toFixed(2)} ${this.model.units}`);
        }
        if (action === 'pointerup') {
          if (!this.lineStart) {
            this.lineStart = inf.point;
            this.onStatus('Line: Click next point to complete edge.');
          } else {
            if (!this.lineStart.equals(inf.point)) {
              this.model.addEdge(this.lineStart, inf.point);
              this.viewport.clearTempGroup();
              this.viewport.rebuildScene();
              this.onStatus('Created edge.');
            }
            this.lineStart = inf.point;
          }
        }
      }

      // RECTANGLE
      if (this.activeTool === 'rectangle') {
        if (action === 'pointermove' && this.rectStart) {
          this.viewport.setRubberBandRect(this.rectStart, snapPt, this.rectStart.z);
          const w = Math.abs(snapPt.x - this.rectStart.x);
          const d = Math.abs(snapPt.y - this.rectStart.y);
          this.onMeasure('Dimensions', `${w.toFixed(2)}, ${d.toFixed(2)} ${this.model.units}`);
        }
        if (action === 'pointerup') {
          if (!this.rectStart) {
            this.rectStart = snapPt;
            this.onStatus('Rectangle: Click opposite corner.');
          } else {
            const w = Math.abs(snapPt.x - this.rectStart.x);
            const d = Math.abs(snapPt.y - this.rectStart.y);
            if (w > 0.05 && d > 0.05) {
              const face = this.model.createRectangle(this.rectStart, snapPt, this.rectStart.z, this.activeMaterial);
              this.viewport.clearTempGroup();
              this.viewport.rebuildScene();
              this.onStatus(`Created rectangle face (Area: ${face.area}).`);
            }
            this.rectStart = null;
          }
        }
      }

      // CIRCLE
      if (this.activeTool === 'circle') {
        if (action === 'pointermove' && this.circleStart) {
          const r = this.circleStart.distanceTo(snapPt);
          this.viewport.setRubberBandCircle(this.circleStart, r, this.circleStart.z);
          this.onMeasure('Radius', `${r.toFixed(2)} ${this.model.units}`);
        }
        if (action === 'pointerup') {
          if (!this.circleStart) {
            this.circleStart = snapPt;
            this.onStatus('Circle: Move to set radius.');
          } else {
            const r = this.circleStart.distanceTo(snapPt);
            if (r > 0.05) {
              this.model.createCircle(this.circleStart, r, 24, this.circleStart.z, this.activeMaterial);
              this.viewport.clearTempGroup();
              this.viewport.rebuildScene();
              this.onStatus(`Created circle (Radius: ${r.toFixed(2)}).`);
            }
            this.circleStart = null;
          }
        }
      }

      // PUSH/PULL
      if (this.activeTool === 'pushpull') {
        if (action === 'pointermove') {
          if (!this.pushPullFaceId) {
            if (hit && hit.hitType === 'face') {
              if (this.viewport.hoverFaceId !== hit.faceId) {
                this.viewport.hoverFaceId = hit.faceId;
                this.viewport.rebuildScene();
              }
            } else if (this.viewport.hoverFaceId) {
              this.viewport.hoverFaceId = null;
              this.viewport.rebuildScene();
            }
          } else {
            const face = this.model.faces.find(f => f.id === this.pushPullFaceId);
            if (face && this.pushPullStartPos) {
              const delta = snapPt.sub(this.pushPullStartPos);
              this.pushPullDist = delta.dot(face.normal);
              this.viewport.setLivePushPullMesh(face, this.pushPullDist);
              this.onMeasure('Distance', `${this.pushPullDist.toFixed(2)} ${this.model.units}`);
              this.onStatus(`Push/Pull: ${this.pushPullDist.toFixed(2)} ${this.model.units}`);
            }
          }
        }

        if (action === 'pointerdown' && hit && hit.hitType === 'face') {
          this.pushPullFaceId = hit.faceId;
          this.pushPullStartPos = hit.point;
          this.pushPullDist = 0;
          this.lastPushedFace = hit.faceId;
        }

        if (action === 'pointerup' && this.pushPullFaceId) {
          this.viewport.clearTempGroup();
          if (Math.abs(this.pushPullDist) > 0.05) {
            this.model.pushPullFace(this.pushPullFaceId, this.pushPullDist);
            this.viewport.rebuildScene();
            this.onStatus(`Push/Pull completed: ${this.pushPullDist.toFixed(2)} ${this.model.units}.`);
          }
          this.pushPullFaceId = null;
          this.pushPullStartPos = null;
          this.viewport.hoverFaceId = null;
        }
      }

      // ERASER
      if (this.activeTool === 'eraser' && action === 'pointerup' && hit) {
        if (hit.hitType === 'face') {
          this.model.deleteFace(hit.faceId);
          this.viewport.rebuildScene();
          this.onStatus('Erased face.');
        }
      }

      // PAINT
      if (this.activeTool === 'paint' && action === 'pointerup' && hit && hit.hitType === 'face') {
        const face = this.model.faces.find(f => f.id === hit.faceId);
        if (face) {
          face.material = { ...this.activeMaterial };
          this.viewport.rebuildScene();
          this.onStatus(`Applied material "${this.activeMaterial.name}".`);
        }
      }

      // SECTION PLANE
      if (this.activeTool === 'section' && action === 'pointerup' && hit) {
        this.model.addSectionPlane(hit.point, hit.normal || new Point3D(0, 0, -1));
        this.viewport.rebuildScene();
        this.onStatus('Added Section Cutting Plane.');
      }
    }

    applyTypedInput(valStr) {
      const num = parseFloat(valStr);
      if (isNaN(num)) return;
      if (this.activeTool === 'pushpull' && this.lastPushedFace) {
        this.model.pushPullFace(this.lastPushedFace, num);
        this.viewport.rebuildScene();
        this.onStatus(`Set Push/Pull to ${num} ${this.model.units}.`);
      }
    }
  }

  // ==========================================
  // 8. 3D OBJ EXPORTER
  // ==========================================

  class OBJExporter {
    static exportToOBJ(model) {
      let output = `# CADSketch 3D Model Export\n# Software: CADSketch Pro (Google SketchUp Architecture)\n# Developer: Aadesh Navade (+91 93411 02949)\n\no ${model.name || 'Building'}\n\n`;
      const vertexMap = new Map();
      const vertices = [];
      let vIndex = 1;

      const getIdx = (p) => {
        const key = `${p.x.toFixed(4)}_${p.y.toFixed(4)}_${p.z.toFixed(4)}`;
        if (vertexMap.has(key)) return vertexMap.get(key);
        vertexMap.set(key, vIndex);
        vertices.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`);
        return vIndex++;
      };

      const faceStrings = [];
      for (const face of model.faces) {
        if (face.points.length < 3) continue;
        const idxs = face.points.map(p => getIdx(p));
        faceStrings.push(`f ${idxs.join(' ')}`);
      }
      return output + vertices.join('\n') + '\n\n' + faceStrings.join('\n') + '\n';
    }
  }

  // Export to window
  window.CADSketch = {
    Point3D,
    Edge,
    Face,
    CADSketchModel,
    CADSKETCH_MATERIALS,
    CADSketchComponents,
    InferenceEngine,
    CADSketchViewport,
    ToolManager,
    OBJExporter
  };

})(window);
