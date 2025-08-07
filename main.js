// Some constants
const { mat4, vec3 } = glMatrix; // Exstract mat4 e vec3 from glMatrix
const floorSegments = 128; 
const simResolution = 256; 
const poolDimension = 50.0;     // Pool dimensions
const MAX_LIGHTS = 4;            // Max number of torches
// To add checkbox and slider
const reflectionCheckbox = document.getElementById('reflection-checkbox');
const dampingSlider = document.getElementById('damping-slider');
const dampingValueSpan = document.getElementById('damping-value');
const forceSlider = document.getElementById('force-slider');
const forceValueSpan = document.getElementById('force-value');

// Shaders
const renderVS = `
    attribute vec3 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    uniform sampler2D u_heightMap;      // Texture with waves heightss
    uniform mat4 u_modelMatrix;         // Matrix model
    uniform mat4 u_vp;                  // Combined view and projection matrix
    varying vec3 v_worldPosition;

    void main(){
        v_uv = a_uv;
        float height = texture2D(u_heightMap, v_uv).r; 
        vec3 displacedPosition = a_position + vec3(0.0, height * 0.5, 0.0);
        gl_Position = u_vp  * u_modelMatrix * vec4(displacedPosition, 1.0);
        // Determine position in world frame
        v_worldPosition = (u_modelMatrix * vec4(displacedPosition, 1.0)).xyz;
    }
`;


const renderFS = `
    precision highp float;
    varying vec2 v_uv;
    uniform sampler2D u_heightMap;
    uniform vec2 u_pixelSize;
    varying vec3 v_worldPosition;       // Vector shader position in world frame
    uniform vec3 u_cameraPos;
    uniform samplerCube u_skybox;       // Cubemap for sky
    uniform bool u_showReflections;     // Checkbox to add reflections or not 
    uniform float u_poolDimension;
    // Add different lights for the 4 torches
    uniform vec3 u_lightPositions[${MAX_LIGHTS}];
    uniform vec3 u_lightColors[${MAX_LIGHTS}];

    void main(){
        // Water color rgb(143, 240, 220) - [Source 1]
        float r = 143.0/255.0;
        float g = 240.0/255.0;
        float b = 220.0/255.0;
        vec3 baseColor = vec3(r, g, b);

        // Heights of neighboring textels
        float hL = texture2D(u_heightMap, v_uv - vec2(u_pixelSize.x, 0.0)).r;
        float hR = texture2D(u_heightMap, v_uv + vec2(u_pixelSize.x, 0.0)).r;
        float hD = texture2D(u_heightMap, v_uv - vec2(0.0, u_pixelSize.y)).r;
        float hU = texture2D(u_heightMap, v_uv + vec2(0.0, u_pixelSize.y)).r;

        float worldTexelSize =  u_poolDimension / 256.0;
        vec3 normal = normalize(vec3(hL - hR, 2.0 * worldTexelSize, hD - hU));
        // Blinn-Phong illumination
        vec3 viewDir = normalize(u_cameraPos - v_worldPosition);

        // Model for more lights
        vec3 totalDiffuse = vec3(0.0);
        vec3 totalSpecular = vec3(0.0);
        for(int i = 0; i < ${MAX_LIGHTS}; i++){
            vec3 lightDir = normalize(u_lightPositions[i] - v_worldPosition);
            vec3 lightColor = u_lightColors[i];
            // Diffusion
            float diffuse = max(0.0, dot(normal, lightDir));
            totalDiffuse += lightColor*diffuse;
            // Specular
            vec3 halfwayDir = normalize(lightDir + viewDir);
            float spec = pow(max(dot(normal, halfwayDir), 0.0), 64.0);  // 64 = maxShiniess
            totalSpecular += lightColor*spec;      
        }

        vec3 lightingColor = baseColor * 0.2 + baseColor * totalDiffuse;
        vec3 finalColor = lightingColor;

        if(u_showReflections){
            vec3 reflectDir = reflect(-viewDir, normal);
            vec4 reflectionColor = textureCube(u_skybox, reflectDir);
            
            // Fresnel effect
            float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 5.0);
            
            // Mix water color with reflected environment
            finalColor = mix(lightingColor, reflectionColor.rgb, fresnel);
        }
        
        finalColor += totalSpecular;
        gl_FragColor = vec4(finalColor, 1.0); 
    }
`;

const simulationVS = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

const simulationFS = `
    precision highp float;
    varying vec2 v_uv;
    
    uniform sampler2D u_state; // Previous state
    uniform vec2 u_pixelSize; // 1.0 / simResolution
    uniform vec2 u_mousePos;  // Mouse position in in UV [0, 1]
    uniform float u_mouseForce;
    uniform float u_damping;


    void main() {
        vec4 prevState = texture2D(u_state, v_uv);
        float currentHeight = prevState.r;      // .r indicates current state
        float previousHeight = prevState.g;     // .g indicates previous state
        // Consider all neighbors to have a spheric wave
        float N = texture2D(u_state, v_uv + vec2(0.0, u_pixelSize.y)).r;
        float S = texture2D(u_state, v_uv - vec2(0.0, u_pixelSize.y)).r;
        float E = texture2D(u_state, v_uv + vec2(u_pixelSize.x, 0.0)).r;
        float W = texture2D(u_state, v_uv - vec2(u_pixelSize.x, 0.0)).r;
        float NE = texture2D(u_state, v_uv + u_pixelSize).r;
        float NW = texture2D(u_state, v_uv + vec2(-u_pixelSize.x, u_pixelSize.y)).r;
        float SE = texture2D(u_state, v_uv + vec2(u_pixelSize.x, -u_pixelSize.y)).r;
        float SW = texture2D(u_state, v_uv - u_pixelSize).r;
        float neighborsHeight = (N + S + E + W + NE + NW + SE + SW) / 8.0;

        // Wave equation (Verlet integration)
        float newHeight = (2.0 * currentHeight - previousHeight) + (neighborsHeight - currentHeight) * 1.5;
        
        // Damping
        newHeight *= u_damping;

        // External force (mouse)        
        float dist = distance(v_uv, u_mousePos);
        if (dist < 0.05) {
            newHeight += u_mouseForce * smoothstep(0.05, 0.0,dist);
        }

        gl_FragColor = vec4(newHeight, currentHeight, 0.0, 1.0);  // New state
    }
`;

const skyboxVS = `
    attribute vec3 a_position;
    varying vec3 v_texCoord;

    uniform mat4 u_projectionMatrix;
    uniform mat4 u_viewMatrix;

    void main() {
        v_texCoord = a_position;
        
        // This allows the camera to rotatate without translating, creating the illusion of an infinite space
        mat4 viewRotationOnly = mat4(mat3(u_viewMatrix));

        vec4 pos = u_projectionMatrix * viewRotationOnly * vec4(a_position, 1.0);

        // The sky is pushed to the furthest point
        gl_Position = pos.xyww;
    }
`;

const skyboxFS = `
    precision mediump float;
    varying vec3 v_texCoord;
    uniform samplerCube u_skybox;

    void main() {
        gl_FragColor = textureCube(u_skybox, v_texCoord);
    }
`;

// Helper functions
function createShader(gl, type, source){
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
        return shader;
    }
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

function createProgram(gl, vertexShader, fragmentShader){
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        return program;
    }
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
}

// Create a cubemap to have the sky
const skyboxVertices = new Float32Array([
    //   X,    Y,    Z
    -1.0, -1.0,  1.0, // 0
     1.0, -1.0,  1.0, // 1
    -1.0,  1.0,  1.0, // 2
     1.0,  1.0,  1.0, // 3
    -1.0, -1.0, -1.0, // 4
     1.0, -1.0, -1.0, // 5
    -1.0,  1.0, -1.0, // 6
     1.0,  1.0, -1.0, // 7
]);

const skyboxIndices = new Uint16Array([
    // Positive Z
    0, 1, 2,   2, 1, 3,
    // Positive X
    1, 5, 3,   3, 5, 7,
    // Negative Z
    5, 4, 7,   7, 4, 6,
    // Negative X
    4, 0, 6,   6, 0, 2,
    // Positive Y
    2, 3, 6,   6, 3, 7,
    // Negative Y
    4, 5, 0,   0, 5, 1,
]);
 
 function loadCubeMap(gl, imageUrl, callback) {
     const image = new Image();
     // image.crossOrigin = "anonymous"; // Has to do with accesses
     image.src = imageUrl;
 
     image.addEventListener('load', () => {
         const faceSize = image.width / 4; 
 
         // Create a temporary canvas to cut the image
         const tempCanvas = document.createElement('canvas');
         tempCanvas.width = faceSize;
         tempCanvas.height = faceSize;
         const ctx = tempCanvas.getContext('2d');
 
         const texture = gl.createTexture();
         gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
 
         const faceInfos = [
             { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, x: 2 * faceSize, y: 1 * faceSize },
             { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, x: 0 * faceSize, y: 1 * faceSize },
             { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, x: 1 * faceSize, y: 0 * faceSize },
             { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, x: 1 * faceSize, y: 2 * faceSize },
             { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, x: 1 * faceSize, y: 1 * faceSize },
             { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, x: 3 * faceSize, y: 1 * faceSize },
         ];
 
         faceInfos.forEach((faceInfo) => {
             const { target, x, y } = faceInfo;
             
             // Draw and upload the cut-up image on the cubemap
             ctx.drawImage(image, x, y, faceSize, faceSize, 0, 0, faceSize, faceSize);
             gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
         });
 
         gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
         gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
         
         if (callback) callback(texture);
     });
 
     return gl.createTexture();
 }

// Initialize gl
const canvas = document.getElementById('webgl-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
	throw new Error("[INIT] Unable to initialize WebGL. Your browser or machine may not support it.");
}

// Extensions for FBO
const floatLinearExt = gl.getExtension('OES_texture_float_linear');
const floatTextureExt = gl.getExtension('OES_texture_float');
if(!floatTextureExt){
    throw new Error("[INIT] Unable to add float texture. Your browser or machine may not support it.");
}

// Variables to control camera
let cameraPosition = vec3.fromValues(0, 2, 15); // Starting psoition
let cameraYaw = 0.0;                            //  Horizzontal rotation
let cameraPitch = 0.0;                          // Vertical rotation
const keysPressed = {};                         // List of pressed keys
let lastMouseX = 0;                             // Last position of the mouse on the x axis
let lastMouseY = 0;                             // Last position of the mouse on the y axis
let mousePos = [-1, -1];                        // Start with mouse outside of camera
let mouseForce = 0;                             // Mouse is not applying force at the begenning
let force = 0.3;                                // Starting mouse forced
let damping = 0.985;                            // Damping 
let lastTime = 0;                               // Time in seconds
let fov_degrees = 45.0;                         // Field of View in degrees °

// To add lights
const lights = [
    { position: vec3.fromValues(-5.0, 1.5, -5.0), color: vec3.fromValues(1.0, 0.5, 0.5) }, // Red       rgb(255, 127, 127)
    { position: vec3.fromValues(5.0, 1.5, -5.0), color: vec3.fromValues(0.5, 1.0, 0.5) },  // Green     rgb(127, 255, 127)
    { position: vec3.fromValues(0.0, 1.5, 5.0), color: vec3.fromValues(0.5, 0.5, 1.0) },   // Purple    rgb(127, 127, 225)
    { position: vec3.fromValues(-5.0, 1.5, 5.0), color: vec3.fromValues(1.0, 1.0, 0.5) }   // Yellow    rgb(225, 225, 127)
];

// Adapt canvas size to window dimensions
function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Add sky
let skyboxTexture = null;
// Image path 
const skyboxUrls = '/skybox/Untitled.png';
loadCubeMap(gl, skyboxUrls, (texture) => {
    skyboxTexture = texture;
});

// Event listener for sliders
dampingSlider.addEventListener('input', (e) =>{
    damping = e.target.value/ 1000.0;
    dampingValueSpan.textContent = damping.toFixed(3);
});
forceSlider.addEventListener('input', (e) =>{
    force = e.target.value/ 100.0;
    forceValueSpan.textContent = force.toFixed(2);
});

// Floor geometry
gl.enable(gl.DEPTH_TEST);
const floorGeometry = createFloorGeometry(poolDimension, poolDimension, floorSegments, floorSegments);
const quadPositions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

// Buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, floorGeometry.positions, gl.STATIC_DRAW);

const uvBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
gl.bufferData(gl.ARRAY_BUFFER, floorGeometry.uvs, gl.STATIC_DRAW);

const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, floorGeometry.indices, gl.STATIC_DRAW);

const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, quadPositions, gl.STATIC_DRAW);

const skyboxBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, skyboxBuffer);
gl.bufferData(gl.ARRAY_BUFFER, skyboxVertices, gl.STATIC_DRAW);

const skyboxIndexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyboxIndexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, skyboxIndices, gl.STATIC_DRAW);

// Render program
const renderProgram = createProgram(gl, 
    createShader(gl, gl.VERTEX_SHADER, renderVS),
    createShader(gl, gl.FRAGMENT_SHADER, renderFS)
);

const renderAttribs = {
    position: gl.getAttribLocation(renderProgram, 'a_position'),
    uv: gl.getAttribLocation(renderProgram, 'a_uv'), 
};
const renderUniforms = {
    modelMatrix: gl.getUniformLocation(renderProgram, 'u_modelMatrix'),
    vp: gl.getUniformLocation(renderProgram, 'u_vp'),
    cameraPos: gl.getUniformLocation(renderProgram, 'u_cameraPos'),
    heightMap: gl.getUniformLocation(renderProgram, 'u_heightMap'), 
    pixelSize: gl.getUniformLocation(renderProgram, 'u_pixelSize'), 
    lightPositions: [],
    lightColors: [],
    showReflections: gl.getUniformLocation(renderProgram, 'u_showReflections'),
    skybox: gl.getUniformLocation(renderProgram, 'u_skybox'),
    poolDimension: gl.getUniformLocation(renderProgram, 'u_poolDimension'),
};
// Add uniform
for(let i = 0; i < MAX_LIGHTS; i++){
    renderUniforms.lightPositions.push(gl.getUniformLocation(renderProgram, `u_lightPositions[${i}]`));
    renderUniforms.lightColors.push(gl.getUniformLocation(renderProgram, `u_lightColors[${i}]`));
}
const simProgram = createProgram(gl,
    createShader(gl, gl.VERTEX_SHADER, simulationVS),
    createShader(gl, gl.FRAGMENT_SHADER, simulationFS)
);
const simAttribs = {
    position: gl.getAttribLocation(simProgram, 'a_position'),
};
const simUniforms = {
    state: gl.getUniformLocation(simProgram, 'u_state'),
    pixelSize: gl.getUniformLocation(simProgram, 'u_pixelSize'),
    mousePos: gl.getUniformLocation(simProgram, 'u_mousePos'),
    mouseForce: gl.getUniformLocation(simProgram, 'u_mouseForce'),
    damping: gl.getUniformLocation(simProgram, 'u_damping'),
};

const skyboxProgram = createProgram(gl,
    createShader(gl, gl.VERTEX_SHADER, skyboxVS),
    createShader(gl, gl.FRAGMENT_SHADER, skyboxFS)
);
const skyboxAttribs = {
    position: gl.getAttribLocation(skyboxProgram, 'a_position'),
};
const skyboxUniforms = {
    projectionMatrix: gl.getUniformLocation(skyboxProgram, 'u_projectionMatrix'),
    viewMatrix: gl.getUniformLocation(skyboxProgram, 'u_viewMatrix'),
    skybox: gl.getUniformLocation(skyboxProgram, 'u_skybox'),
};

// FBO setup for simulation
let stateA = createFBO(gl, simResolution, simResolution, gl.RGBA, gl.FLOAT);
let stateB = createFBO(gl, simResolution, simResolution, gl.RGBA, gl.FLOAT);


// Event listeners 
canvas.addEventListener('mousedown', (e) =>{
    isMouseDown = true;
    canvas.requestPointerLock();      // This hides the pointer, for now it is more confusing than anything...
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    // Some mapping  is necessary since there is a discrpancy in the center
    const rect = canvas.getBoundingClientRect();
    const normalizedX = (e.clientX - rect.left) / rect.width;
    const normalizedY = (e.clientY - rect.top) / rect.height;
    mousePos = [1.0 - normalizedX, 1.0 - normalizedY]; 
    mouseForce = force;   // Apply force when clicking - value from slider
});
canvas.addEventListener('mouseup', () =>{
    isMouseDown = false;
    mouseForce = 0;
    mousePos = [-1, -1];

});
// Stop rotation if the mouse leaves the frame
canvas.addEventListener('mouseleave', () => {
    isMouseDown = false;
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
        cameraYaw -= e.movementX * 0.002;
        cameraPitch -= e.movementY * 0.002;
        // To avoid problem with the camera, this limits the velocity 
        const maxPitch = Math.PI / 2 - 0.1;
        cameraPitch = Math.max(-maxPitch, Math.min(maxPitch, cameraPitch));
    }
    if (!isMouseDown) return;
    const rect = canvas.getBoundingClientRect();
    const normalizedX = (e.clientX - rect.left) / rect.width;
    const normalizedY = (e.clientY - rect.top)  / rect.height;
    mousePos = [normalizedX, 1.0 - normalizedY];
});
canvas.addEventListener('wheel', (e) => {
    // e.deltaY è positivo quando si scorre verso il basso (zoom out)
    // e negativo quando si scorre verso l'alto (zoom in)
    fov_degrees += e.deltaY * 0.05; // La costante 0.05 controlla la velocità dello zoom

    // Aggiungiamo dei limiti per evitare uno zoom eccessivo
    // (es. tra 15 e 90 gradi)
    fov_degrees = Math.max(15, Math.min(90, fov_degrees));
});
// Event listeners to move in the space
window.addEventListener('keydown', (e) =>{
    keysPressed[e.code] = true;
});
window.addEventListener('keyup', (e) =>{
    keysPressed[e.code] = false;
});


// Main rendering loop
function render(currentTime){
    updateCamera(currentTime);
    // Simulation step
    gl.useProgram(simProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, stateB.fbo);
    gl.viewport(0, 0, simResolution, simResolution);

    gl.activeTexture(gl.TEXTURE0);                      // Texture 0 is water texture
    gl.bindTexture(gl.TEXTURE_2D, stateA.texture);
    gl.uniform1i(simUniforms.state, 0);
    
    gl.uniform2f(simUniforms.pixelSize, 1 / simResolution, 1 / simResolution);
    gl.uniform2fv(simUniforms.mousePos, mousePos);
    gl.uniform1f(simUniforms.mouseForce, mouseForce);
    gl.uniform1f(simUniforms.damping, damping);
    //gl.uniform1f(renderUniforms.poolDimension, poolDimension);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(simAttribs.position);
    gl.vertexAttribPointer(simAttribs.position, 2, gl.FLOAT, false, 0, 0); 
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    mouseForce = 0; // After having applied it, reste force
    [stateA, stateB] = [stateB, stateA]; // Swap buffers

    // Rendering step
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Clean canvas
    resizeCanvas();
    // Water color rgb(143, 240, 220) - [Source 1]
    let r = 143.0/255.0;
    let g = 240.0/255.0;
    let b = 220.0/255.0;
    gl.clearColor(r, g, b, 1.0); // rgba 
    gl.clear(gl.COLOR_BUFFER_BIT| gl.DEPTH_BUFFER_BIT);
    
    // Matrices
    // Projection matrix
    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, fov_degrees * Math.PI / 180, gl.canvas.clientWidth / gl.canvas.clientHeight, 0.1, 100.0);
    // View matrix - dynamic since it needs to change while the user is moving
    const viewMatrix = mat4.create();
    const cameraTarget = mat4.create();
    const forward = vec3.fromValues(Math.sin(cameraYaw), Math.sin(cameraPitch), Math.cos(cameraYaw));
    vec3.normalize(forward, forward);
    vec3.add(cameraTarget, cameraPosition, forward);
    mat4.lookAt(viewMatrix, cameraPosition, cameraTarget, [0, 1, 0]);

    // Model matrix
    const modelMatrix = mat4.create();
    // View projection matrix
    const vpMatrix = mat4.create();
    mat4.multiply(vpMatrix, projectionMatrix, viewMatrix);
    // Draw skybox
    if (skyboxTexture) {
        gl.depthFunc(gl.LEQUAL);
        gl.useProgram(skyboxProgram);
        gl.uniformMatrix4fv(skyboxUniforms.projectionMatrix, false, projectionMatrix);
        gl.uniformMatrix4fv(skyboxUniforms.viewMatrix, false, viewMatrix);
        gl.activeTexture(gl.TEXTURE1);                                                      // Texture 1 is skybox texture
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);
        gl.uniform1i(skyboxUniforms.skybox, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, skyboxBuffer);
        gl.enableVertexAttribArray(skyboxAttribs.position);
        gl.vertexAttribPointer(skyboxAttribs.position, 3, gl.FLOAT, false, 0, 0);        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyboxIndexBuffer);
        gl.drawElements(gl.TRIANGLES, skyboxIndices.length, gl.UNSIGNED_SHORT, 0);
        gl.depthFunc(gl.LESS);
    }
    
    // Draw water texture
    gl.useProgram(renderProgram);

    // Send matrices
    gl.uniformMatrix4fv(renderUniforms.modelMatrix, false, modelMatrix);
    gl.uniformMatrix4fv(renderUniforms.vp, false, vpMatrix);
    gl.uniform3fv(renderUniforms.cameraPos, cameraPosition);
    // Send torches data to shader
    lights.forEach((light, i) =>{
        gl.uniform3fv(renderUniforms.lightPositions[i], light.position);
        gl.uniform3fv(renderUniforms.lightColors[i], light.color);
    });
    gl.uniform2f(renderUniforms.pixelSize, 1 / simResolution, 1 / simResolution);
    gl.uniform1i(renderUniforms.heightMap, 0);
    gl.uniform1i(renderUniforms.skybox, 1);
    
    // Add textures
    gl.uniform1f(renderUniforms.poolDimension, poolDimension);

    // Connect texture to checkbox
    gl.uniform1i(renderUniforms.showReflections, reflectionCheckbox.checked);
    // Connect cubemap to texture unit 1
    if (skyboxTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);
    }

    // Buffers
    gl.enableVertexAttribArray(renderAttribs.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(renderAttribs.position, 3, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(renderAttribs.uv);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.vertexAttribPointer(renderAttribs.uv, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, floorGeometry.indices.length, gl.UNSIGNED_SHORT, 0);


    requestAnimationFrame(render);
}

// Start the rendering loop
requestAnimationFrame(render);

// To create the floor
function createFloorGeometry(width, height, segX, segY){
    const positions = [];   // Verteces position
    const normals = [];     // Normal
    const uvs = [];         // UV coordinates
    const indices = [];     // Verteces indices

    const stepX = width/segX;
    const stepY = height/segY;

    for (let i = 0; i <= segY; i++) {
        for (let j = 0; j <= segX; j++) {
            const x = j * stepX - width / 2;
            const z = i * stepY - height / 2;
            
            positions.push(x, 0, z); 
            normals.push(0, 1, 0);   
            uvs.push(j / segX, i / segY); 
        }
    }

    for(let i = 0; i < segY; i ++){
        for(let j = 0; j < segX; j++){
            const a = j + (i+1)*(segX +1);
            const b = j + i *(segX + 1);
            const c = (j+1) + i *(segX +1);
            const d = (j+1) + (i+1)*(segX +1);

            indices.push(b, a , c);
            indices.push(c, a, d);
        }
    }
    return{
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        indices: new Uint16Array(indices)
    };
}

// FBO and texture
function createFBO(gl, width, height, format, type){
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Check if FBO has been correctly created
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('[FBO] Something went wrong: ' + status.toString());
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo: fbo, texture: texture };
}

const floatTexturesExt = gl.getExtension('OES_texture_float');
if (!floatTexturesExt) {
    throw new Error('[Float Texture] Something went wrong: browser does not support textures');
}


function updateCamera(currentTime){
    const deltaTime = (currentTime - lastTime)/1000;    // Time in seconds
    lastTime = currentTime;
    const speed = 5.0 * deltaTime;  
    // Determines movement based on yaw
    const forward = vec3.fromValues(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
    const right = vec3.fromValues(forward[2], 0, -forward[0]);

    // Move by pressing keybord
    if (keysPressed['KeyW']) {
        vec3.scaleAndAdd(cameraPosition, cameraPosition, forward, speed);
    }
    if (keysPressed['KeyA']) {
        vec3.scaleAndAdd(cameraPosition, cameraPosition, right, speed);
    }
    if (keysPressed['KeyS']) {
        vec3.scaleAndAdd(cameraPosition, cameraPosition, forward, -speed);
    }
    if (keysPressed['KeyD']) {
        vec3.scaleAndAdd(cameraPosition, cameraPosition, right, -speed);
    }
}