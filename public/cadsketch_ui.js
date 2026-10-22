/**
 * CADSketch UI Controller & Application Bridge
 * Fully connects every menu item, toolbar button, 3D ViewCube, Tray panel, and tool.
 * Developer: Aadesh Navade (+91 93411 02949)
 */

(function(window) {
  'use strict';

  const CADSketchUI = {
    model: null,
    viewport: null,
    toolManager: null,

    init() {
      const container = document.getElementById('threeCanvasContainer');
      if (!container) return;

      // 1. Initialize Model
      this.model = new CADSketch.CADSketchModel('Villa Project');

      // 2. Initialize Viewport
      this.viewport = new CADSketch.CADSketchViewport(
        container,
        (type, entity) => this.onEntitySelected(type, entity),
        (action, e, hit) => {
          if (this.toolManager) {
            this.toolManager.handleAction(action, e, hit);
            this.updateStats();
          }
          if (hit && hit.point) {
            this.updateCoords(hit.point);
          }
        },
        (degX, degY) => this.updateViewCubeAngle(degX, degY)
      );

      // 3. Initialize Tool Manager
      this.toolManager = new CADSketch.ToolManager(
        this.model,
        this.viewport,
        (msg) => this.setStatusPrompt(msg),
        (label, val) => this.setMeasurement(label, val)
      );

      // 4. Load Initial Sample Architectural Building
      this.model.loadSampleBuilding();
      this.viewport.setModel(this.model);

      // 5. Wire Up All UI Event Handlers
      this.initMenuBar();
      this.initToolbar();
      this.initLargeToolSet();
      this.initViewCube();
      this.initMaterialsPalette();
      this.initComponentsLibrary();
      this.initStylesPanel();
      this.initMeasurementsBox();
      this.initKeyboardShortcuts();
      this.initWindowResize();

      this.updateStats();
      this.setStatusPrompt('CADSketch Pro Ready. Click any face or tool to begin modeling.');
    },

    // ==========================================
    // MENU BAR
    // ==========================================
    initMenuBar() {
      const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn.call(this); });
      };

      bind('menuNew', () => this.newModel());
      bind('menuSample', () => this.loadSample());
      bind('menuSave', () => this.saveProject());
      bind('menuExportOBJ', () => this.exportOBJ());
      bind('menuScreenshot', () => this.takeScreenshot());

      bind('menuUndo', () => this.undo());
      bind('menuRedo', () => this.redo());
      bind('menuClear', () => this.clearModel());

      bind('menuToggleCuts', () => this.toggleSectionCuts());
      bind('menuTogglePlanes', () => this.toggleSectionPlanes());
      bind('menuStyleClassic', () => this.setStyle('classic'));
      bind('menuStyleShaded', () => this.setStyle('shaded'));
      bind('menuStyleMono', () => this.setStyle('monochrome'));
      bind('menuStyleXray', () => this.setStyle('xray'));
      bind('menuStyleWire', () => this.setStyle('blueprint'));

      bind('menuCamOrbit', () => this.setStatusPrompt('Orbit: Right-Click Drag or Shift + Middle-Click'));
      bind('menuCamPan', () => this.setStatusPrompt('Pan: Middle-Click Drag or Alt + Left-Click'));
      bind('menuCamZoom', () => this.setStatusPrompt('Zoom: Scroll Mouse Wheel'));
      bind('menuCamZoomExtents', () => this.zoomExtents());

      bind('menuViewIso', () => this.setView('iso'));
      bind('menuViewTop', () => this.setView('top'));
      bind('menuViewFront', () => this.setView('front'));
      bind('menuViewRight', () => this.setView('right'));
      bind('menuViewBack', () => this.setView('back'));
      bind('menuViewLeft', () => this.setView('left'));

      bind('menuDrawLine', () => this.selectTool('line'));
      bind('menuDrawArc', () => this.selectTool('arc'));
      bind('menuDrawRect', () => this.selectTool('rectangle'));
      bind('menuDrawCircle', () => this.selectTool('circle'));

      bind('menuToolSelect', () => this.selectTool('select'));
      bind('menuToolEraser', () => this.selectTool('eraser'));
      bind('menuToolPaint', () => this.selectTool('paint'));
      bind('menuToolPushPull', () => this.selectTool('pushpull'));
      bind('menuToolOffset', () => this.selectTool('offset'));
      bind('menuToolTape', () => this.selectTool('tape'));
      bind('menuToolSection', () => this.selectTool('section'));

      bind('menuToggleTray', () => this.toggleTray());
      bind('menuOpenEntityInfo', () => this.expandPanel('panelEntityInfo'));
      bind('menuOpenMaterials', () => this.expandPanel('panelMaterials'));
      bind('menuOpenComponents', () => this.expandPanel('panelComponents'));
      bind('menuOpenStyles', () => this.expandPanel('panelStyles'));
      bind('menuOpenModelInfo', () => this.expandPanel('panelModelInfo'));

      bind('menuAbout', () => {
        alert('CADSketch Pro 2026\nAuthentic Google SketchUp Architecture in WebGL.\nDeveloper: Aadesh Navade (+91 93411 02949)\n\nPure 3D B-Rep CAD Modeler with Revit Navigation, Interactive Push/Pull, 3D ViewCube, and Wavefront OBJ Export.');
      });
      bind('menuControls', () => {
        alert('Revit Mouse Controls:\n- Orbit: Right-Click Drag OR Shift + Middle Mouse Button\n- Pan: Middle Mouse Button Drag OR Alt + Left-Click\n- Zoom: Scroll Wheel\n- Tools: Left-Click to draw, extrude, and paint\n\nKeyboard Shortcuts:\nSpace: Select | L: Line | R: Rectangle | C: Circle | P: Push/Pull | B: Paint | E: Eraser | Shift+Z: Zoom Extents');
      });
    },

    // ==========================================
    // TOP TOOLBAR
    // ==========================================
    initToolbar() {
      const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn.call(this); });
      };

      bind('btnNew', () => this.newModel());
      bind('btnSample', () => this.loadSample());
      bind('btnSave', () => this.saveProject());
      bind('btnUndo', () => this.undo());
      bind('btnRedo', () => this.redo());

      bind('btnViewIso', () => this.setView('iso'));
      bind('btnViewTop', () => this.setView('top'));
      bind('btnViewFront', () => this.setView('front'));
      bind('btnViewRight', () => this.setView('right'));
      bind('btnViewBack', () => this.setView('back'));
      bind('btnViewLeft', () => this.setView('left'));

      bind('btnZoomExtents', () => this.zoomExtents());
      bind('btnToggleSectionCuts', () => this.toggleSectionCuts());
      bind('btnExportOBJ', () => this.exportOBJ());
      bind('btnScreenshot', () => this.takeScreenshot());

      const unitSel = document.getElementById('unitSelector');
      if (unitSel) {
        unitSel.addEventListener('change', (e) => {
          this.model.units = e.target.value;
          this.updateStats();
          this.setStatusPrompt(`Active unit system set to: ${e.target.value}`);
        });
      }
    },

    // ==========================================
    // LARGE TOOL SET (LEFT SIDEBAR)
    // ==========================================
    initLargeToolSet() {
      const toolsMap = [
        { id: 'toolSelect', name: 'select' },
        { id: 'toolEraser', name: 'eraser' },
        { id: 'toolPaint', name: 'paint' },
        { id: 'toolLine', name: 'line' },
        { id: 'toolArc', name: 'arc' },
        { id: 'toolRect', name: 'rectangle' },
        { id: 'toolCircle', name: 'circle' },
        { id: 'toolPushPull', name: 'pushpull' },
        { id: 'toolOffset', name: 'offset' },
        { id: 'toolMove', name: 'move' },
        { id: 'toolRotate', name: 'rotate' },
        { id: 'toolScale', name: 'scale' },
        { id: 'toolTape', name: 'tape' },
        { id: 'toolDimension', name: 'dimension' },
        { id: 'toolSection', name: 'section' }
      ];

      toolsMap.forEach(item => {
        const btn = document.getElementById(item.id);
        if (btn) {
          btn.addEventListener('click', () => {
            this.selectTool(item.name, btn);
          });
        }
      });

      const clearBtn = document.getElementById('toolClearCanvas');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => this.clearModel());
      }
    },

    selectTool(name, activeBtn) {
      if (!this.toolManager) return;
      this.toolManager.setTool(name);

      // Update Toolbar buttons active states
      document.querySelectorAll('.su-tool-btn').forEach(b => b.classList.remove('active'));
      if (activeBtn) {
        activeBtn.classList.add('active');
      } else {
        const idMap = {
          select: 'toolSelect', eraser: 'toolEraser', paint: 'toolPaint', line: 'toolLine',
          arc: 'toolArc', rectangle: 'toolRect', circle: 'toolCircle', pushpull: 'toolPushPull',
          offset: 'toolOffset', move: 'toolMove', rotate: 'toolRotate', scale: 'toolScale',
          tape: 'toolTape', dimension: 'toolDimension', section: 'toolSection'
        };
        const target = document.getElementById(idMap[name]);
        if (target) target.classList.add('active');
      }

      // Update HUD Badge
      const hudName = document.getElementById('hudToolName');
      if (hudName) {
        hudName.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      }
    },

    // ==========================================
    // 3D VIEWCUBE HUD
    // ==========================================
    initViewCube() {
      const faces = document.querySelectorAll('.viewcube-face');
      faces.forEach(face => {
        face.addEventListener('click', (e) => {
          e.stopPropagation();
          const view = face.getAttribute('data-view');
          if (view) this.setView(view);
        });
      });

      const homeBtn = document.getElementById('cubeHome');
      if (homeBtn) {
        homeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.setView('iso');
        });
      }
    },

    updateViewCubeAngle(degX, degY) {
      const cube = document.getElementById('viewCube3D');
      if (cube) {
        cube.style.transform = `rotateX(${-degX}deg) rotateY(${degY}deg)`;
      }
    },

    setView(viewName) {
      if (this.viewport) {
        this.viewport.setStandardView(viewName);
        this.setStatusPrompt(`Camera set to: ${viewName.toUpperCase()} view.`);
      }
    },

    zoomExtents() {
      if (!this.viewport || !this.model) return;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
      if (this.model.faces.length === 0) {
        this.viewport.setStandardView('iso');
        return;
      }
      this.model.faces.forEach(f => {
        f.points.forEach(p => {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });
      });
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const cz = (minZ + maxZ) / 2;
      this.viewport.target.set(cx, cy, cz);
      const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 8);
      this.viewport.camera.position.set(cx + span * 1.5, cy - span * 1.8, cz + span * 1.4);
      this.viewport.camera.lookAt(this.viewport.target);
      this.viewport.notifyViewCubeAngle();
      this.setStatusPrompt('Zoom Extents applied.');
    },

    // ==========================================
    // MATERIALS PALETTE
    // ==========================================
    initMaterialsPalette() {
      const container = document.getElementById('materialSwatchesContainer');
      const catSelect = document.getElementById('materialCategorySelect');
      if (!container || !CADSketch.CADSKETCH_MATERIALS) return;

      const renderSwatches = (category = 'all') => {
        container.innerHTML = '';
        const materials = CADSketch.CADSKETCH_MATERIALS;
        Object.keys(materials).forEach(key => {
          const mat = materials[key];
          if (category !== 'all' && mat.category !== category) return;

          const swatch = document.createElement('div');
          swatch.className = 'material-swatch-item';
          swatch.style.backgroundColor = mat.color;
          swatch.title = `${mat.name} (${mat.category})`;

          swatch.addEventListener('click', () => {
            document.querySelectorAll('.material-swatch-item').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            this.toolManager.activeMaterial = { ...mat };
            this.selectTool('paint');
            this.setStatusPrompt(`Active Paint: "${mat.name}". Click any face to paint.`);
          });

          container.appendChild(swatch);
        });
      };

      renderSwatches('all');

      if (catSelect) {
        catSelect.addEventListener('change', (e) => {
          renderSwatches(e.target.value);
        });
      }
    },

    // ==========================================
    // 3D COMPONENTS LIBRARY
    // ==========================================
    initComponentsLibrary() {
      const comps = CADSketch.CADSketchComponents;
      if (!comps) return;

      const bindComp = (id, name, inserter) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('click', () => {
            this.model.saveSnapshot(`Insert ${name}`);
            inserter();
            this.viewport.rebuildScene();
            this.updateStats();
            this.setStatusPrompt(`Inserted 3D component: ${name}.`);
          });
        }
      };

      bindComp('compDoor', 'Modern Door', () => {
        comps.insertDoor(this.model, new CADSketch.Point3D(3.2, 0, 0), 0.95, 2.15);
      });
      bindComp('compWindow', 'Glass Window', () => {
        comps.insertWindow(this.model, new CADSketch.Point3D(1.0, 0, 0), 1.6, 1.3, 0.9);
      });
      bindComp('compStairs', 'Straight Staircase', () => {
        comps.insertStairs(this.model, new CADSketch.Point3D(9.0, 1.0, 0), 10, 1.0, 0.26, 0.17);
      });
      bindComp('compKitchen', 'Kitchen Counter', () => {
        comps.insertKitchenCounter(this.model, new CADSketch.Point3D(9.0, 9.0, 0), 2.6, 0.65, 0.86);
      });
      bindComp('compBed', 'King Size Bed', () => {
        comps.insertKingBed(this.model, new CADSketch.Point3D(10.0, 1.5, 0), 1.9, 2.1);
      });
      bindComp('compPerson', 'Scale Figure', () => {
        comps.insertScaleFigure(this.model, new CADSketch.Point3D(4.0, 4.0, 0));
      });
    },

    // ==========================================
    // STYLES PANEL
    // ==========================================
    initStylesPanel() {
      const items = document.querySelectorAll('.style-item');
      items.forEach(item => {
        item.addEventListener('click', () => {
          items.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          const style = item.getAttribute('data-style');
          this.setStyle(style);
        });
      });
    },

    setStyle(styleName) {
      if (this.viewport) {
        this.viewport.currentStyle = styleName;
        this.viewport.rebuildScene();
        this.setStatusPrompt(`Visual Style set to: ${styleName.toUpperCase()}`);
      }
    },

    // ==========================================
    // MEASUREMENTS BOX (VCB)
    // ==========================================
    initMeasurementsBox() {
      const input = document.getElementById('measurementsInput');
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (this.toolManager && val) {
              this.toolManager.applyTypedInput(val);
              this.updateStats();
            }
          }
        });
      }
    },

    setMeasurement(label, val) {
      const lbl = document.getElementById('measurementsLabel');
      const inp = document.getElementById('measurementsInput');
      if (lbl) lbl.textContent = label;
      if (inp) inp.value = val;
    },

    // ==========================================
    // STATUS & COORDINATES
    // ==========================================
    setStatusPrompt(msg) {
      const prompt = document.getElementById('statusPrompt');
      if (prompt) prompt.textContent = msg;
    },

    updateCoords(pt) {
      const coords = document.getElementById('coordsReadout');
      if (coords && pt) {
        coords.innerHTML = `X: ${pt.x.toFixed(2)} &nbsp; Y: ${pt.y.toFixed(2)} &nbsp; Z: ${pt.z.toFixed(2)}`;
      }
    },

    updateStats() {
      if (!this.model) return;
      const f = document.getElementById('statFacesCount');
      const e = document.getElementById('statEdgesCount');
      const s = document.getElementById('statSectionsCount');
      const u = document.getElementById('statUnits');

      if (f) f.textContent = this.model.faces.length;
      if (e) e.textContent = this.model.edges.length;
      if (s) s.textContent = this.model.sectionPlanes.length;
      if (u) u.textContent = this.model.units === 'm' ? 'Meters (m)' : this.model.units;
    },

    onEntitySelected(type, entity) {
      const typeEl = document.getElementById('infoEntityType');
      const idEl = document.getElementById('infoEntityId');
      const areaEl = document.getElementById('infoEntityArea');
      const matEl = document.getElementById('infoEntityMat');

      if (!entity) {
        if (typeEl) typeEl.textContent = 'None';
        if (idEl) idEl.textContent = '—';
        if (areaEl) areaEl.textContent = '—';
        if (matEl) matEl.textContent = '—';
        return;
      }

      if (type === 'face') {
        if (typeEl) typeEl.textContent = 'Face (Surface)';
        if (idEl) idEl.textContent = entity.id;
        if (areaEl) areaEl.textContent = `${entity.area} ${this.model.units === 'ft' ? 'sq ft' : 'm²'}`;
        if (matEl) matEl.textContent = entity.material?.name || 'Default White';
      }
    },

    // ==========================================
    // ACTIONS & MODEL MANAGEMENT
    // ==========================================
    newModel() {
      if (confirm('Create a new blank model? Any unsaved edits will be cleared.')) {
        this.model.saveSnapshot('New Model');
        this.model.faces = [];
        this.model.edges = [];
        this.model.sectionPlanes = [];
        this.viewport.rebuildScene();
        this.updateStats();
        this.setStatusPrompt('Created new empty model.');
      }
    },

    loadSample() {
      this.model.loadSampleBuilding();
      this.viewport.rebuildScene();
      this.updateStats();
      this.zoomExtents();
      this.setStatusPrompt('Loaded sample villa project.');
    },

    saveProject() {
      const data = this.model.serialize();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.model.name.replace(/\s+/g, '_')}_CADSketch.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.setStatusPrompt('Project JSON saved successfully.');
    },

    exportOBJ() {
      const objData = CADSketch.OBJExporter.exportToOBJ(this.model);
      const blob = new Blob([objData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.model.name.replace(/\s+/g, '_')}.obj`;
      a.click();
      URL.revokeObjectURL(url);
      this.setStatusPrompt('Wavefront 3D OBJ exported successfully.');
    },

    takeScreenshot() {
      const dom = this.viewport.renderer.domElement;
      const dataUrl = dom.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `CADSketch_Screenshot_${Date.now()}.png`;
      a.click();
      this.setStatusPrompt('Screenshot captured.');
    },

    undo() {
      if (this.model.undo()) {
        this.viewport.rebuildScene();
        this.updateStats();
        this.setStatusPrompt('Undo executed.');
      } else {
        this.setStatusPrompt('Nothing to undo.');
      }
    },

    redo() {
      if (this.model.redo()) {
        this.viewport.rebuildScene();
        this.updateStats();
        this.setStatusPrompt('Redo executed.');
      } else {
        this.setStatusPrompt('Nothing to redo.');
      }
    },

    clearModel() {
      this.model.saveSnapshot('Clear Model');
      this.model.faces = [];
      this.model.edges = [];
      this.viewport.rebuildScene();
      this.updateStats();
      this.setStatusPrompt('Model cleared.');
    },

    toggleSectionCuts() {
      this.model.displaySectionCuts = !this.model.displaySectionCuts;
      this.viewport.rebuildScene();
      this.setStatusPrompt(`Section Cuts: ${this.model.displaySectionCuts ? 'ON' : 'OFF'}`);
    },

    toggleSectionPlanes() {
      this.model.displaySectionPlanes = !this.model.displaySectionPlanes;
      this.viewport.rebuildScene();
      this.setStatusPrompt(`Section Planes: ${this.model.displaySectionPlanes ? 'ON' : 'OFF'}`);
    },

    // ==========================================
    // TRAY & PANELS
    // ==========================================
    togglePanel(panelId) {
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.toggle('collapsed');
    },

    expandPanel(panelId) {
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.remove('collapsed');
    },

    toggleTray() {
      const tray = document.getElementById('defaultTray');
      if (tray) {
        tray.style.display = tray.style.display === 'none' ? 'flex' : 'none';
      }
    },

    // ==========================================
    // KEYBOARD SHORTCUTS
    // ==========================================
    initKeyboardShortcuts() {
      window.addEventListener('keydown', (e) => {
        // If typing in input box, ignore global shortcuts
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        const key = e.key.toUpperCase();

        if (e.ctrlKey || e.metaKey) {
          if (key === 'Z') { e.preventDefault(); this.undo(); return; }
          if (key === 'Y') { e.preventDefault(); this.redo(); return; }
          if (key === 'S') { e.preventDefault(); this.saveProject(); return; }
          if (key === 'N') { e.preventDefault(); this.newModel(); return; }
          if (key === 'O') { e.preventDefault(); this.loadSample(); return; }
        }

        if (e.shiftKey && key === 'Z') { e.preventDefault(); this.zoomExtents(); return; }
        if (e.shiftKey && key === 'C') { e.preventDefault(); this.toggleSectionCuts(); return; }

        switch (key) {
          case ' ':
            e.preventDefault();
            this.selectTool('select');
            break;
          case 'L':
            this.selectTool('line');
            break;
          case 'R':
            this.selectTool('rectangle');
            break;
          case 'C':
            this.selectTool('circle');
            break;
          case 'A':
            this.selectTool('arc');
            break;
          case 'P':
            this.selectTool('pushpull');
            break;
          case 'F':
            this.selectTool('offset');
            break;
          case 'E':
            this.selectTool('eraser');
            break;
          case 'B':
            this.selectTool('paint');
            break;
          case 'T':
            this.selectTool('tape');
            break;
          case 'DELETE':
          case 'BACKSPACE':
            if (this.viewport && this.viewport.selectedFaceId) {
              this.model.deleteFace(this.viewport.selectedFaceId);
              this.viewport.selectedFaceId = null;
              this.viewport.rebuildScene();
              this.updateStats();
              this.setStatusPrompt('Deleted selected face.');
            }
            break;
        }
      });
    },

    initWindowResize() {
      window.addEventListener('resize', () => {
        if (this.viewport) this.viewport.onResize();
      });
    }
  };

  // Expose CADSketchUI globally
  window.CADSketchUI = CADSketchUI;

  // Auto-boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CADSketchUI.init());
  } else {
    CADSketchUI.init();
  }

})(window);
