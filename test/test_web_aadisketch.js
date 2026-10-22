/**
 * Comprehensive Automated Test Suite for AadiSketch Web CAD Engine
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runTests() {
  console.log('====================================================');
  console.log('  RUNNING AADISKETCH WEB ENGINE RIGOROUS TEST SUITE ');
  console.log('====================================================\n');

  // 1. Mock Browser Environment
  const mockWindow = {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  // Mock Three.js essentials
  const mockThree = {
    Scene: class {
      constructor() { this.children = []; this.background = null; }
      add(obj) { this.children.push(obj); }
      remove(obj) { const idx = this.children.indexOf(obj); if (idx !== -1) this.children.splice(idx, 1); }
    },
    Group: class {
      constructor() { this.children = []; }
      add(obj) { this.children.push(obj); }
      remove(obj) { const idx = this.children.indexOf(obj); if (idx !== -1) this.children.splice(idx, 1); }
    },
    PerspectiveCamera: class {
      constructor() {
        this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, clone() { return { x: this.x, y: this.y, z: this.z, sub: (t) => ({ length: () => 10, normalize: () => ({ z: 0.5, y: 0.5, x: 0.5 }) }) }; } };
        this.up = { set: () => {} };
        this.lookAt = () => {};
        this.updateProjectionMatrix = () => {};
      }
    },
    WebGLRenderer: class {
      constructor() {
        this.domElement = {
          clientWidth: 800, clientHeight: 500,
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }),
          addEventListener: () => {},
          style: {}
        };
        this.shadowMap = {};
      }
      setSize() {}
      setPixelRatio() {}
      render() {}
    },
    Vector2: class { constructor(x=0, y=0) { this.x = x; this.y = y; } },
    Vector3: class {
      constructor(x=0, y=0, z=0) { this.x = x; this.y = y; this.z = z; }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
      clone() { return new mockThree.Vector3(this.x, this.y, this.z); }
      add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
      sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
      normalize() { return this; }
      multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
      crossVectors() { return this; }
    },
    Color: class { constructor(c) { this.color = c; } },
    PlaneGeometry: class {},
    BufferGeometry: class {
      setFromPoints() { return this; }
      setAttribute() { return this; }
      computeVertexNormals() {}
      computeBoundingBox() {}
      computeBoundingSphere() {}
    },
    Float32BufferAttribute: class {},
    MeshStandardMaterial: class {},
    MeshBasicMaterial: class {},
    LineBasicMaterial: class {},
    LineDashedMaterial: class {},
    Line: class { constructor(g, m) { this.geo = g; this.mat = m; this.position = new mockThree.Vector3(); } computeLineDistances() {} },
    Mesh: class { constructor(g, m) { this.geo = g; this.mat = m; this.userData = {}; this.position = new mockThree.Vector3(); } },
    GridHelper: class { constructor() { this.rotation = { x: 0 }; this.position = { set: () => {} }; } },
    AmbientLight: class {},
    DirectionalLight: class { constructor() { this.position = { set: () => {} }; } },
    Raycaster: class {
      constructor() { this.ray = { intersectPlane: () => ({ x: 0, y: 0, z: 0 }) }; }
      setFromCamera() {}
      intersectObjects() { return []; }
    },
    Plane: class {},
    DoubleSide: 2,
    PCFSoftShadowMap: 1
  };

  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'aadisketch_web.js'), 'utf8');
  const context = {
    window: mockWindow,
    THREE: mockThree,
    console,
    Math,
    Number,
    JSON,
    parseFloat,
    isNaN,
    requestAnimationFrame: () => {}
  };
  vm.createContext(context);
  vm.runInContext(code, context);

  const { Point3D, SketchUpModel, SketchUpViewport, ToolManager } = mockWindow.AadiSketchWeb;

  let passed = 0;
  let total = 0;
  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  âœ“ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  âœ— [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // TEST 1: Math Point3D Core
  const p1 = new Point3D(2, 4, 6);
  const p2 = new Point3D(1, 1, 1);
  assert(p1.add(p2).equals(new Point3D(3, 5, 7)), 'Point3D.add works accurately');
  assert(p1.sub(p2).equals(new Point3D(1, 3, 5)), 'Point3D.sub works accurately');
  assert(Math.abs(p1.dot(p2) - 12) < 1e-4, 'Point3D.dot product calculates correctly');
  assert(new Point3D(3, 0, 0).distanceTo(new Point3D(0, 4, 0)) === 5, 'Point3D.distanceTo calculates 3-4-5 triangle');

  // TEST 2: Model & 2D Rectangle Construction
  const model = new SketchUpModel('Test Model');
  const rectFace = model.createRectangle(new Point3D(0, 0, 0), new Point3D(10, 5, 0), 0);
  assert(rectFace !== null, 'Model creates 2D planar rectangle');
  assert(rectFace.points.length === 4, 'Rectangle has 4 corner vertices');
  assert(Math.abs(rectFace.area - 50) < 1e-3, `Rectangle surface area is exactly 50 sq ft/m (got ${rectFace.area})`);
  assert(model.faces.length === 1, 'Model contains 1 face');
  assert(model.edges.length === 4, 'Model contains 4 boundary edges');

  // TEST 3: Google SketchUp 3D Push/Pull Extrusion
  const extrusion = model.pushPullFace(rectFace.id, 3.5);
  assert(extrusion !== null, 'Push/Pull extrudes planar face into 3D volume');
  assert(extrusion.sideFaces.length === 4, 'Push/Pull creates 4 side prismatic faces');
  assert(model.faces.length === 5, 'Solid now contains 5 faces (1 top + 4 sides)');
  assert(extrusion.topFace.points[0].z === 3.5, 'Top face pushed up to Z=3.5');

  // TEST 4: Undo & Redo History
  const undoOk = model.undo();
  assert(undoOk === true, 'Model.undo reverts Push/Pull operation');
  assert(model.faces.length === 1, 'Model restored back to 1 flat face after undo');
  const redoOk = model.redo();
  assert(redoOk === true, 'Model.redo re-applies Push/Pull extrusion');
  assert(model.faces.length === 5, 'Model restored to 5 solid faces after redo');

  // TEST 5: Circle Creation
  const circleFace = model.createCircle(new Point3D(20, 20, 0), 4, 24, 0);
  assert(circleFace !== null, 'Circle generator creates circular face');
  assert(circleFace.points.length === 24, 'Circle segmented into 24 polygonal vertices');
  assert(circleFace.area > 48 && circleFace.area < 51, `Circle area ~ pi*r^2 = 50.26 (got ${circleFace.area})`);

  // TEST 6: Pre-engineered 3D Architectural Sample Building
  const archModel = new SketchUpModel('Architectural Model');
  archModel.loadSampleBuilding();
  assert(archModel.faces.length >= 25, `loadSampleBuilding generates rich architectural scene with >=25 faces (got ${archModel.faces.length})`);
  assert(archModel.edges.length >= 40, `loadSampleBuilding generates >=40 structural edges (got ${archModel.edges.length})`);

  // TEST 7: ToolManager Selection & Inspection
  const mockContainer = { clientWidth: 800, clientHeight: 500, appendChild: () => {} };
  let statusMsg = '';
  let measureLabel = '';
  let measureVal = '';
  const onStatus = (m) => { statusMsg = m; };
  const onMeasure = (l, v) => { measureLabel = l; measureVal = v; };

  const viewport = new SketchUpViewport(mockContainer, () => {}, () => {}, () => {});
  viewport.setModel(archModel);
  const toolMgr = new ToolManager(archModel, viewport, onStatus, onMeasure);

  toolMgr.setTool('select');
  assert(toolMgr.activeTool === 'select', 'ToolManager sets active tool to select');

  const targetFace = archModel.faces[0];
  toolMgr.handleAction('pointerup', {}, { hitType: 'face', faceId: targetFace.id, point: targetFace.points[0] });
  assert(viewport.selectedFaceId === targetFace.id, 'Select tool sets viewport.selectedFaceId');
  assert(measureLabel === 'Face Area', 'Select tool triggers live area measurement');

  // TEST 8: Push/Pull Tool Lifecycle
  toolMgr.setTool('pushpull');
  assert(toolMgr.activeTool === 'pushpull', 'ToolManager activates pushpull');
  const initFaceCount = archModel.faces.length;
  // Hover face
  toolMgr.handleAction('pointermove', {}, { hitType: 'face', faceId: targetFace.id, point: new Point3D(0, 0, 0) });
  assert(viewport.hoverFaceId === targetFace.id, 'Push/Pull hover highlights target face');
  // Pointerdown
  toolMgr.handleAction('pointerdown', {}, { hitType: 'face', faceId: targetFace.id, point: new Point3D(0, 0, 0) });
  // Pointermove with displacement
  toolMgr.handleAction('pointermove', {}, { hitType: 'ground', point: new Point3D(0, 0, 2.5) });
  // Pointerup to commit
  toolMgr.handleAction('pointerup', {}, null);
  assert(archModel.faces.length > initFaceCount, 'Push/Pull tool commits new side faces to model');

  // TEST 9: Eraser Tool
  toolMgr.setTool('eraser');
  const faceToDelete = archModel.faces[archModel.faces.length - 1];
  const countBeforeErase = archModel.faces.length;
  toolMgr.handleAction('pointerup', {}, { hitType: 'face', faceId: faceToDelete.id });
  assert(archModel.faces.length === countBeforeErase - 1, 'Eraser tool deletes clicked face');

  // TEST 10: Paint Tool
  toolMgr.setTool('paint');
  toolMgr.activeMaterial = { color: '#b91c1c', name: 'Exposed Red Brick' };
  const faceToPaint = archModel.faces[0];
  toolMgr.handleAction('pointerup', {}, { hitType: 'face', faceId: faceToPaint.id });
  assert(faceToPaint.material.color === '#b91c1c', 'Paint bucket applies selected material color');

  // TEST 11: Typed Measurement Input
  toolMgr.setTool('pushpull');
  toolMgr.lastPushedFace = archModel.faces[1].id;
  const preTypedCount = archModel.faces.length;
  toolMgr.applyTypedInput('1.85');
  assert(archModel.faces.length > preTypedCount, 'Typed numerical input directly executes push/pull');

  console.log(`\n====================================================`);
  console.log(`  TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log(`====================================================\n`);

  if (passed === total) {
    console.log('âœ… ALL 11 WEB CAD ENGINE TESTS COMPLETED WITH 100% SUCCESS.');
  } else {
    console.error('âŒ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTests();
