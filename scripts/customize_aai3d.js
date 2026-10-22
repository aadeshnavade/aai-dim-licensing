const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../public/index.html');
let html = fs.readFileSync(filePath, 'utf-8');

// Title & Meta
html = html.replace(/<title>.*?<\/title>/g, '<title>AAI 3D | Autonomous Architectural Modeling, BIM & Licensing Platform</title>');

// Brand & Headers
html = html.replace(/AAI DIM/g, 'AAI 3D');
html = html.replace(/aai-dim-licensing/g, 'aai-3d-licensing');
html = html.replace(/Revit 2024 • 2025 • 2026 • 2027\+/g, 'Windows 11 / 10 • Native 64-bit Desktop');
html = html.replace(/Autonomous Dimensioning &amp; Licensing Platform/g, 'Autonomous Architectural Modeling & BIM Platform');
html = html.replace(/Autonomous BIM Dimensioning &amp; <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">Digital Twin AI<\/span> for Autodesk Revit/g, 'Autonomous 3D Architectural Modeler &amp; <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500">Vastu-Aware BIM Engine<\/span>');
html = html.replace(/Draft entire floor plans, inclined facades, openings, and elevations with a single click. Powered by true aligned geometry analysis and conversational AI./g, 'SketchUp-style direct on-screen Push/Pull modeling combined with Revit-style precision detailing, auto-dimensioning, 9-zone Vastu Shastra analysis, and buildingSMART IFC 4.3 export.');

// Features
html = html.replace(/Aligned &amp; Inclined Walls/g, 'SketchUp-Style Push/Pull');
html = html.replace(/Creates true aligned dimensions parallel to angled walls instead of chord distortions./g, 'Click directly on any wall face to pull or push thickness and height in real-time with dynamic dimension adjustment.');

html = html.replace(/AAI Conversational Copilot/g, 'AI Architectural Copilot');
html = html.replace(/Type plain English instructions to auto-dimension facades, clear, offset, or sync elements./g, 'Type plain English prompts like "Move wall 300 mm east", "Change kitchen to bedroom", or "Design a 30x40 2 BHK".');

html = html.replace(/Dynamic Live Sync/g, 'Revit-Style Detailing &amp; Scale');
html = html.replace(/Dynamic model updater re-adjusts dimensions when doors, windows, or walls are modified./g, 'Multi-tier associative dimensions with anti-overlap collision avoidance and customizable annotation scales (1:50, 1:100).');

html = html.replace(/Multi-Version Ready/g, 'Vastu Shastra Intelligence');
html = html.replace(/Single one-click installer compatible with Revit 2024 through Revit 2027\+./g, '9-zone directional scoring (SW Master Bed, SE Kitchen, NE Pooja) with transparent scorecard and user override capability.');

// File names
html = html.replace(/AAI_DIM_v1\.1\.0_Setup\.zip/g, 'AAI 3D Setup 1.0.0.exe');
html = html.replace(/AAI_DIM_v1\.0\.0_Setup\.zip/g, 'AAI 3D Setup 1.0.0.exe');

fs.writeFileSync(filePath, html, 'utf-8');
console.log('Updated public/index.html with AAI 3D branding and features.');
