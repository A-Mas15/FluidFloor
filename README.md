# FluidFloor

This document outlines the progress for a real-time fluid simulation project built with Plain WebGL and GLSL. 

## Step 1

The project currently features a dynamic, interactive 3D water surface. The user can orbit the camera around a centrally-located water plane. Clicking on the surface creates a ripple effect that propagates outwards in a circular wave and realistically dampens over time.

The water surface is shaded using a Blinn-Phong lighting model, giving it specular highlights that react to the wave's geometry. The surface also reflects a dynamic skybox, with the reflection intensity modulated by the Fresnel effect, making it look more realistic at grazing angles.

## Core Features Implemented

-   **Dynamic Plane Geometry:** A highly-segmented 3D plane is generated procedurally in JavaScript to serve as the water surface.
-   **GPU-Based Wave Simulation:**
    -   A simplified 2D wave equation is simulated entirely on the GPU using GLSL fragment shaders.
    -   The simulation uses the **ping-pong buffer** technique (swapping between two Frame Buffer Objects - FBOs) to pass state from one frame to the next.
    -   The simulation state (`currentHeight`, `previousHeight`) is stored in floating-point textures, enabling high precision.
-   **Interactive Input:** User mouse clicks are passed to the simulation shader as a `uniform`, applying an external force that generates waves at the cursor's location.
-   **3D Rendering & Shading:**
    -   The simulation's output (a heightmap texture) is used in the rendering vertex shader to displace the plane's vertices, creating the 3D wave geometry.
    -   Surface normals are calculated in real-time in the fragment shader based on the height differences of neighboring texels.
    -   **Blinn-Phong lighting** is applied for realistic diffuse and specular reflections from a directional light source.
    -   **Environment Mapping** using a Cubemap (`samplerCube`) provides realistic sky reflections.
    -   A **Fresnel effect** is implemented to blend the water's base color with the reflected sky color, enhancing realism.
-   **Orbit Camera Controls:** The user can click and drag the mouse to rotate the camera around the scene.

## Key Challenges & Solutions

During development, several significant technical hurdles were encountered and overcome.

### 1. Challenge: `gl-matrix` Library Integration (`mat4 is not defined`)

-   **Difficulty:** After adding the `gl-matrix` library to perform matrix calculations, the browser threw a `ReferenceError: mat4 is not defined`, even though the script file was being loaded correctly (HTTP Status `200 OK`).
-   **Troubleshooting:**
    1.  We first suspected a loading order issue, which was corrected by using the `defer` attribute in the `<script>` tags.
    2.  When the error persisted, we investigated network issues, discovering a `302 redirect` that pointed towards a potential network/firewall problem.
    3.  The final solution was to host the library file locally, which confirmed the file was being served correctly, yet the error remained.
-   **Solution:** The root cause was identified as a change in the `gl-matrix` library's API (version 3+). Instead of populating the global namespace, it now exports a single global object, `glMatrix`. The solution was to **destructure** the required modules at the beginning of `main.js`, making them available to the rest of the script:
    ```javascript
    const { mat4, vec3 } = glMatrix;
    ```

### 2. Challenge: FBO Incompleteness on Floating-Point Textures

-   **Difficulty:** The initial attempt to render the simulation into a floating-point texture failed with a `FRAMEBUFFER_INCOMPLETE_ATTACHMENT` error (code `36054`). The `OES_texture_float` extension guarantees the *use* of float textures as inputs, but not necessarily as rendering targets.
-   **Analysis:** This indicated that the hardware/browser combination had limited support for rendering to float textures, a common issue in WebGL 1.
-   **Solution:** We enabled an additional, crucial WebGL extension: `WEBGL_color_buffer_float`. This specifically grants the ability to attach floating-point textures as color attachments to an FBO. By checking for both extensions, we could confidently use the cleaner `gl.FLOAT` approach, avoiding the more complex float-to-RGBA encoding/decoding workaround.

### 3. Challenge: Simulation Instability and Unrealistic Wave Propagation

-   **Difficulty:** The initial simulation was unstable. The waves would "explode," growing infinitely instead of dampening, and they did not originate correctly from the mouse click.
-   **Analysis:** The core issue was a flawed implementation of the Verlet integration physics. The simulation requires both the current state (`currentHeight`) and the previous state (`previousHeight`) to determine velocity and direction. A simplification in the code (`previousHeight = currentHeight`) removed this "memory," causing numerical errors to compound and add energy to the system uncontrollably.
-   **Solution:**
    1.  The simulation state was correctly defined to include both values, storing them in the `.r` and `.g` channels of the state texture: `gl_FragColor = vec4(newHeight, currentHeight, 0.0, 1.0);`.
    2.  The simulation shader was updated to read both values from the previous frame's texture, restoring the correct physics.
    3.  The wave propagation was improved to be more circular by sampling all 8 neighboring texels (including diagonals) instead of just 4.
    4.  The damping parameter (`u_damping`) became effective once the simulation was stable.

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

-   **Rotate Camera:** Click and drag the left mouse button.
-   **Create Waves:** Click anywhere on the water surface.

# References
[Source 1] https://www.w3schools.com/colors/colors_converter.asp (colour converter, from hex to rgb)
