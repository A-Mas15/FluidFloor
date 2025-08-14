# FluidFloor

This document outlines the progress for a real-time fluid simulation project built with Plain WebGL and GLSL. 



## Core Features (Phase 1)

1. **GPU wave simulation**
   - Implements the 2D wave equation via **Verlet integration** in `simulationFS.glsl`.
   - Uses **ping-pong** technique with two FBOs (`stateA`, `stateB`) at 256×256 resolution for stable, high-precision float state.
   - Stores **currentHeight** in `.r` and **previousHeight** in `.g` channels of a `gl.FLOAT` texture.

2. **Procedural water mesh**
   - Generates a planar grid of 128×128 segments in `createFloorGeometry()`. 
   - Vertex shader (`renderVS.glsl`) samples the height map (`u_heightMap`) to displace vertices along Y-axis.

3. **Accurate mouse interaction**
   - Click or drag applies an external force to the simulation: `u_mousePos` & `u_mouseForce`.
   - Coordinates mapped via:
     ```js
     const rect = canvas.getBoundingClientRect();
     const x = (e.clientX - rect.left) / rect.width;
     const y = (e.clientY - rect.top)  / rect.height;
     mousePos = [ x, 1.0 - y ];
     ```
   - Fixes offset, CSS scaling, and inverts Y for WebGL UV space.

4. **Camera & navigation**
   - `updateCamera(currentTime)` in `main.js` handles:
     - Orbit rotation via accumulated `cameraYaw` & `cameraPitch` from pressing R and moving the mouse.
     - WASD **free movement** adjusting `cameraPosition` with delta time.
     - Mouse wheel zoom adjusts FOV between 15° and 90°.
   - View and projection combined into `vpMatrix` for rendering.

5. **Shading & environment mapping**
   - **Lighting Model** in `renderFS.glsl`:
     - Computes normals per-pixel from neighboring texels (`u_pixelSize`, `u_poolDimension`).
     - Blinn-Phong diffuse + specular on base water color (RGB(143,240,220)).
     - Fresnel-based blending of **skybox** reflections (`samplerCube u_skybox`).
   - **Skybox** drawn first with `skyboxProgram` (vertex: `skyboxVS.glsl`, fragment: `skyboxFS.glsl`) using depth func **LEQUAL**.

## Interactive coloured torches (Phase 2)
This phase focuses on enhancing the scene's realism and interactivity by introducing dynamic, user-controlled point lights.

1. **Multiple point lights**
	- The rendering engine is extended to support multiple colored point lights.
	- Light data (position, color, intensity) is passed to the fragment shader (renderFS.glsl) using uniform arrays.
	- The Blinn-Phong lighting calculation is performed in a loop for each active light, and the results are additively blended to correctly illuminate the water surface.

2. **Interactive torches/teapots**
	- Simple 3D models for torches are added to the scene, each acting as a potential light source.
	- Mouse Raycasting is implemented to detect when a user clicks on a torch. A ray is cast from the camera through the mouse cursor's position into the 3D scene to test for intersection with the torch models.
	- Clicking a torch toggles its state (on/off). This state is managed in JavaScript and used to control which lights contribute to the scene's illumination.

3. **Dynamic reflections**
	- The reflections on the water are now more dynamic. The specular highlights from the Blinn-Phong model correctly reflect the color, position, and intensity of each active torch.
	- This creates a much more vibrant and visually complex scene, especially as the water ripples and distorts the colored reflections.

## Interactive physics ball (Phase 3)
This phase introduces a fully interactive and deformable physics-based ball that integrates with the existing fluid simulation.
1. **Mass-spring system**
   - The ball's physics is implemented in the PhysicsBall class and is based on a mass-spring system.
   - The initSprings() method builds a network of springs connecting adjacent vertices of the loaded .obj model, allowing the ball to deform realistically.
   - The simulation, handled in SimTimeStep(), uses Euler integration to update vertex positions and velocities, applying forces for gravity, elasticity (Hooke's law), and damping.
2. **Deformable mesh and rendering**
   - Since the ball is deformable, its vertex data changes every frame.
   - The updateMeshBuffers() method is called each simulation step to dynamically recalculate both the position buffer (vbo) and the normal buffer (nbo). Per-frame normal recalculation is crucial for ensuring correct lighting on the deformed surface.
   - The ball is rendered with its own dedicated shader program (ballVS.glsl, ballFS.glsl).
3. **User interaction**
   - The user can grab and drag any vertex of the ball.
   - On mousedown, the findClosestVertex() function identifies the vertex nearest to the cursor.
   - The startDrag, updateDrag, and endDrag methods handle the interaction logic, allowing the user to pull and stretch the ball dynamically.
4. **Water interaction**
   - The ball and water interact with each other.
   - The onBallCollision() callback function is triggered whenever a ball vertex drops below the water level.
   - This function calculates an impactForce based on the collision velocity and uses the same mechanism as a mouse click (u_mousePos, u_mouseForce) to generate a wave at the point of impact, creating a seamless integration between the two simulation systems.
## Next Steps

The project will now proceed to the next planned features:
-   **Step 3: interactive physics ball:** insert sliders to modify the ball's:
   - gravity;
   - mass;
   - stiffness;
   - damping.

-   **Step 4: swimming pool:** add a recessed "pool" area and a simple, procedurally animated character that can swim in it.

## How to Run

1.  A local web server is required. The recommended tool is the **Live Server** extension for Visual Studio Code.
2.  Open the project folder in VS Code and click the "Go Live" button in the status bar.
3.  The project will open in your default browser.

### Controls
- **Rotate camera**: R and move mouse.
- **Move**: W/A/S/D.
- **Zoom FOV**: mouse wheel.
- **Generate waves**: click on water.
- **Turn torches on/off**: click on torches/teapots.
- **Drag/toss ball**: click and drag ball.

# References
[Source 1] https://www.w3schools.com/colors/colors_converter.asp (colour converter, from hex to rgb)

[Source 2] TO RECOVER (image for the skybox)
