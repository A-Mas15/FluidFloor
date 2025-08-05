const { mat4, vec3 } = glMatrix; // Exstract mat4 e vec3 from glMatrix

// Shaders
const renderVS = `
    attribute vec3 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    uniform sampler2D u_heightMap;   // Textrure with waves height
    uniform mat4 u_modelMatrix;     // Matrix model
    uniform mat4 u_vp;              // Combined view and projection matrix
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
    uniform vec3 u_lightDir;
    varying vec3 v_worldPosition;   // Vector shader position in world frame
    uniform vec3 u_cameraPos;

    void main(){
        // Water color rgb(143, 240, 220) - [Source 1]
        float r = 143.0/255.0;
        float g = 240.0/255.0;
        float b = 220.0/255.0;

        // Heights of neighboring textels
        float hL = texture2D(u_heightMap, v_uv - vec2(u_pixelSize.x, 0.0)).r;
        float hR = texture2D(u_heightMap, v_uv + vec2(u_pixelSize.x, 0.0)).r;
        float hD = texture2D(u_heightMap, v_uv - vec2(0.0, u_pixelSize.y)).r;
        float hU = texture2D(u_heightMap, v_uv + vec2(0.0, u_pixelSize.y)).r;

        float worldTexelSize = 10.0 / 256.0;
        vec3 normal = normalize(vec3(hL - hR, 2.0 * worldTexelSize, hD - hU));
        // Blinn-Phong illumination
        vec3 lightDir = normalize(u_lightDir);
        vec3 viewDir = normalize(u_cameraPos - v_worldPosition);

        // Diffusion
        float diffuse = max(0.0, dot(normal, lightDir));
        vec3 baseColor = vec3(r, g, b);
        vec3 diffuseColor = baseColor * diffuse;

        // Specular
        vec3 halfwayDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfwayDir), 0.0), 64.0);  // 64 = maxShiniess
        vec3 specularColor = vec3(1.0, 1.0, 1.0)*spec;              // Add white reflexes

        vec3 finalColor = baseColor * 0.2 + diffuseColor + specularColor; 
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

// Initialize gl
const canvas = document.getElementById('webgl-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
	throw new Error("[INIT] Unable to initialize WebGL. Your browser or machine may not support it.");
}

// Extensions for FBO
const floatLinearExt = gl.getExtension('OES_texture_float_linear');
const floatTextrueExt = gl.getExtension('OES_texture_float');
if(!floatTextrueExt){
    throw new Error("[INIT] Unable to add float texture. Your browser or machine may not support it.");
}

// Variables to control camera
let rotX = 0.5;
let rotY = -0.5;
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mousePos = [-1, -1]; // Start with mouse outside of camera
let mouseForce = 0; // Mouse is not applying force at the begenning

// Adapt canvas size to window dimensions
function resizeCanvas(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Floor geometry
gl.enable(gl.DEPTH_TEST);
const floorSegments = 128;
const floorGeometry = createFloorGeometry(10, 10, floorSegments, floorSegments);
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
    lightDir: gl.getUniformLocation(renderProgram, 'u_lightDir'),   
};

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

// FBO setup for simulation
const simResolution = 256;
let stateA = createFBO(gl, simResolution, simResolution, gl.RGBA, gl.FLOAT);
let stateB = createFBO(gl, simResolution, simResolution, gl.RGBA, gl.FLOAT);


// Event listeners 
canvas.addEventListener('mousedown', (e) =>{
    isMouseDown = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    mouseForce = 0.5;   // Apply force when clicking
});
canvas.addEventListener('mouseup', () =>{
    isMouseDown = false;
});
// Stop rotation if the mouse leaves the frame
canvas.addEventListener('mouseleave', () => {
    isMouseDown = false;
});
canvas.addEventListener('mousemove', (e) => {
    mousePos = [e.clientX / canvas.width, 1.0 - e.clientY / canvas.height];
    if (!isMouseDown) 
        return;
    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    rotY += deltaX * 0.01;
    rotX += deltaY * 0.01;
    // To avoid problem with the camera, this limits the velocity along X axis
    const maxRotX = Math.PI / 2 - 0.1;
    rotX = Math.max(-maxRotX, Math.min(maxRotX, rotX));
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});


// Main rendering loop
function render(){
    // Simulation step
    gl.useProgram(simProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, stateB.fbo);
    gl.viewport(0, 0, simResolution, simResolution);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateA.texture);
    gl.uniform1i(simUniforms.state, 0);
    
    gl.uniform2f(simUniforms.pixelSize, 1 / simResolution, 1 / simResolution);
    gl.uniform2fv(simUniforms.mousePos, mousePos);
    gl.uniform1f(simUniforms.mouseForce, mouseForce);
    gl.uniform1f(simUniforms.damping, 0.985);

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
    gl.clearColor(1.0, 1.0 , 1.0, 0.5); // rgba - [Source 1]
    gl.clear(gl.COLOR_BUFFER_BIT| gl.DEPTH_BUFFER_BIT);
    gl.useProgram(renderProgram);

    // Matrices
    // Projection matrix
    const projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, 45 * Math.PI / 180, gl.canvas.clientWidth / gl.canvas.clientHeight, 0.1, 100.0);
    // View matrix
    const viewMatrix = mat4.create();
    mat4.lookAt(viewMatrix, [0, 5, 10], [0, 0, 0], [0, 1, 0]); // Camera is at (0,5,10) and it's looking at origin (0,0,0)
    // Model matrix
    const modelMatrix = mat4.create();
    mat4.rotate(modelMatrix, modelMatrix, rotX, [1, 0, 0]);
    mat4.rotate(modelMatrix, modelMatrix, rotY, [0, 1, 0]);
    // View projection mmatrix
    const vpMatrix = mat4.create();
    mat4.multiply(vpMatrix, projectionMatrix, viewMatrix);

    gl.uniformMatrix4fv(renderUniforms.modelMatrix, false, modelMatrix);
    gl.uniformMatrix4fv(renderUniforms.vp, false, vpMatrix);
    gl.uniform3fv(renderUniforms.cameraPos, [0, 5, 10]);
    gl.uniform3fv(renderUniforms.lightDir, vec3.normalize(vec3.create(), [0.5, 1.0, 0.7]));
    gl.uniform2f(renderUniforms.pixelSize, 1 / simResolution, 1 / simResolution);


    // Add textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateA.texture);
    gl.uniform1i(renderUniforms.heightMap, 0);

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


