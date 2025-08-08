# FluidFloor

This document outlines the progress for a real-time fluid simulation project built with Plain WebGL and GLSL. 



## Core Features (Phase 1)

1. **GPU Wave Simulation**
   - Implements the 2D wave equation via **Verlet integration** in `simulationFS.glsl`.
   - Uses **ping-pong** technique with two FBOs (`stateA`, `stateB`) at 256×256 resolution for stable, high-precision float state.
   - Stores **currentHeight** in `.r` and **previousHeight** in `.g` channels of a `gl.FLOAT` texture.

2. **Procedural Water Mesh**
   - Generates a planar grid of 128×128 segments in `createFloorGeometry()`. 
   - Vertex shader (`renderVS.glsl`) samples the height map (`u_heightMap`) to displace vertices along Y-axis.

3. **Accurate Mouse Interaction**
   - Click or drag applies an external force to the simulation: `u_mousePos` & `u_mouseForce`.
   - Coordinates mapped via:
     ```js
     const rect = canvas.getBoundingClientRect();
     const x = (e.clientX - rect.left) / rect.width;
     const y = (e.clientY - rect.top)  / rect.height;
     mousePos = [ x, 1.0 - y ];
     ```
   - Fixes offset, CSS scaling, and inverts Y for WebGL UV space.

4. **Camera & Navigation**
   - `updateCamera(currentTime)` in `main.js` handles:
     - Orbit rotation via accumulated `cameraYaw` & `cameraPitch` from click-drag.
     - WASD **free movement** adjusting `cameraPosition` with delta time.
     - Mouse wheel zoom adjusts FOV between 15° and 90°.
   - View and projection combined into `vpMatrix` for rendering.

5. **Shading & Environment Mapping**
   - **Lighting Model** in `renderFS.glsl`:
     - Computes normals per-pixel from neighboring texels (`u_pixelSize`, `u_poolDimension`).
     - Blinn-Phong diffuse + specular on base water color (RGB(143,240,220)).
     - Fresnel-based blending of **skybox** reflections (`samplerCube u_skybox`).
   - **Skybox** drawn first with `skyboxProgram` (vertex: `skyboxVS.glsl`, fragment: `skyboxFS.glsl`) using depth func **LEQUAL**.


## Next Steps

With the core water system in place, the project will now proceed to the next planned features:
-   **Step 2: Colored Torches:** Implement multiple point lights with different colors that are reflected on the water surface.
-   **Step 3: Interactive Physics Ball:** Introduce a deformable, bouncing ball based on a mass-spring system that also creates waves upon impact.
-   **Step 4: Swimming Pool:** Add a recessed "pool" area and a simple, procedurally animated character that can swim in it.

## How to Run

1.  A local web server is required. The recommended tool is the **Live Server** extension for Visual Studio Code.
2.  Open the project folder in VS Code and click the "Go Live" button in the status bar.
3.  The project will open in your default browser.

### Controls
- **Rotate Camera**: R and move mouse
- **Move**: W/A/S/D
- **Zoom FOV**: Mouse wheel
- **Ripple Water**: Click or drag on water

# References
[Source 1] https://www.w3schools.com/colors/colors_converter.asp (colour converter, from hex to rgb)
