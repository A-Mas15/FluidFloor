const { mat3, mat4, vec3, vec4 } = glMatrix;    // Exstract mat4 e vec3 from glMatrix
// Class for ball's physic
class PhysicsBall {
    constructor(glContext) {
        this.gl = glContext;
        this.gravity = vec3.fromValues(0, -9.8, 0);
        this.mass = 0.1;
        this.stiffness = 80.0;
        this.damping = 0.7;
        this.restitution = 0.5;

        this.pos = [];
        this.vel = [];
        this.springs = [];
        this.mesh = null;
        
        this.buffers = { vbo: null, nbo: null, numVertices: 0 };
    }

    setMesh(objdef) {
        this.mesh = new Objects();
        this.mesh.parse(objdef);
        this.mesh.computeNormals();
        const box = this.mesh.getBoundingBox();
        // Determine position and scale of the ball
        const shift = [
            -(box.min[0] + box.max[0])/2,
            0, // Ball position on top of water
            -(box.min[2] + box.max[2])/2,
        ];
        const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
        const maxSize = Math.max(size[0], size[1], size[2]);
        const scale = maxSize; //1.0 / maxSize;
        
        // Shift and scale vertices
        this.mesh.shiftAndScale(shift, scale);
        this.reset();
        this.initSprings();
    }

    initSprings() {
        this.springs = [];
        const edges = new Set();
        for (const face of this.mesh.face) {
            for (let i = 0; i < face.length; i++) {
                const p0_idx = face[i];
                const p1_idx = face[(i + 1) % face.length];
                const edgeKey = p0_idx < p1_idx ? `${p0_idx}-${p1_idx}` : `${p1_idx}-${p0_idx}`;
                if (!edges.has(edgeKey)) {
                    edges.add(edgeKey);
                    const r = vec3.distance(this.pos[p0_idx], this.pos[p1_idx]);
                    this.springs.push({ p0: p0_idx, p1: p1_idx, rest: r });
                }
            }
        }
    }

    reset() {
        this.pos = this.mesh.vpos.map(v => vec3.clone(v));
        this.vel = Array.from({ length: this.mesh.vpos.length }, () => vec3.create());
        
        const bufferData = this.mesh.getVertexBuffers();
        this.positionBufferData = new Float32Array(bufferData.positionBuffer);
        this.normalBufferData = new Float32Array(bufferData.normalBuffer);

        if (!this.buffers.vbo) this.buffers.vbo = this.gl.createBuffer();
        if (!this.buffers.nbo) this.buffers.nbo = this.gl.createBuffer();
        this.buffers.numVertices = bufferData.positionBuffer.length / 3;
    }

    // To update buffers
    updateMeshBuffers() {
        const flattenData = (targetBuffer, sourceData, faceIndices) => {
            let bufferIndex = 0;
            for (const face of faceIndices) {
                for (let i = 1; i < face.length - 1; i++) {
                    const v0_idx = face[0];
                    const v1_idx = face[i];
                    const v2_idx = face[i + 1];
                    
                    for (const index of [v0_idx, v1_idx, v2_idx]) {
                        targetBuffer[bufferIndex++] = sourceData[index][0];
                        targetBuffer[bufferIndex++] = sourceData[index][1];
                        targetBuffer[bufferIndex++] = sourceData[index][2];
                    }
                }
            }
        };

        // Calcolate normals
        const tempNormals = Array.from({ length: this.pos.length }, () => vec3.create());
        const e0 = vec3.create(), e1 = vec3.create(), n = vec3.create();
        for (let i = 0; i < this.mesh.face.length; ++i) {
            const f = this.mesh.face[i];
            const v0 = this.pos[f[0]];
            for (let j = 1; j < f.length - 1; ++j) {
                vec3.subtract(e0, this.pos[f[j]], v0);
                vec3.subtract(e1, this.pos[f[j+1]], v0);
                vec3.cross(n, e0, e1);
                vec3.add(tempNormals[f[0]], tempNormals[f[0]], n);
                vec3.add(tempNormals[f[j]], tempNormals[f[j]], n);
                vec3.add(tempNormals[f[j+1]], tempNormals[f[j+1]], n);
            }
        }
        tempNormals.forEach(norm => vec3.normalize(norm, norm));

        // Update buffers
        flattenData(this.positionBufferData, this.pos,       this.mesh.face);
        flattenData(this.normalBufferData,   tempNormals,    this.mesh.face);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.vbo);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.positionBufferData, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.nbo);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.normalBufferData, this.gl.DYNAMIC_DRAW);
    }
    
    simTimeStep(dt, onCollision) {
        if (this.holdVert) vec3.set(this.vel[this.selVert], 0, 0, 0);
        SimTimeStep(dt, this.pos, this.vel, this.springs, this.stiffness, this.damping, this.mass, this.gravity, this.restitution, 0.0, onCollision);
        if (this.holdVert) vec3.copy(this.pos[this.selVert], this.holdVert);
        this.updateMeshBuffers();
    }
    
    // Functions to interact with the ball
    findClosestVertex(mousePos, mvpMatrix) {
        this.selVert = undefined;
		let minDist = 0.05 * 0.05;

		for (let i=0; i<this.pos.length; ++i) {
			const p = this.pos[i];
            const pv = vec4.create();
            vec4.transformMat4(pv, [p[0], p[1], p[2], 1.0], mvpMatrix);

            if (pv[3] === 0) continue;
            const px = pv[0] / pv[3]; const py = pv[1] / pv[3];
			const dx = mousePos[0] - px; const dy = mousePos[1] - py;
			const len2 = dx*dx + dy*dy;
			if ( len2 < minDist ) {
				minDist = len2;
				this.selVert = i;
			}
		}
    }
    startDrag(mousePos, mvpMatrix) {
        if (this.selVert === undefined) return false;
        const invMvp = mat4.create(); mat4.invert(invMvp, mvpMatrix);
        const p = this.pos[this.selVert];
        const pv = vec4.create(); vec4.transformMat4(pv, [p[0], p[1], p[2], 1.0], mvpMatrix);
        
        this.holdVert = vec3.clone(p); // Salva la posizione del vertice che stiamo trascinando
        this.dragData = { invMvp, z: pv[2], w: pv[3] };
        return true;
    }
    updateDrag(mousePos) {
        if (!this.holdVert) return;
        const screenPos = vec4.fromValues(mousePos[0] * this.dragData.w, mousePos[1] * this.dragData.w, this.dragData.z, this.dragData.w);
        const worldPos = vec4.create();
        vec4.transformMat4(worldPos, screenPos, this.dragData.invMvp);
        if (worldPos[3] !== 0) {
            vec3.scale(this.holdVert, worldPos, 1.0 / worldPos[3]);
        }
    }
    endDrag() {
        this.holdVert = undefined;
        this.dragData = null;
    }
}

// Ball phisics
function SimTimeStep(dt, positions, velocities, springs, stiffness, damping, particleMass, gravity, restitution, waterLevel, onCollision) {
    const numParticles = positions.length;
    if (numParticles === 0) return;
    const deltaP = vec3.create();
    const deltaV = vec3.create();
    const dir = vec3.create();
    const Fs = vec3.create();
    const Fd = vec3.create();
    const F_total = vec3.create();
    const acc = vec3.create();
    const forces = Array.from({ length: numParticles }, () => vec3.create());

    //  Gravity
    for (let i = 0; i < numParticles; i++) {
        vec3.scaleAndAdd(forces[i], forces[i], gravity, particleMass);
    }

    // Springs
    for (const s of springs) {
        const p_i = positions[s.p0];
        const p_j = positions[s.p1];
        const v_i = velocities[s.p0];
        const v_j = velocities[s.p1];

        vec3.subtract(deltaP, p_j, p_i);
        vec3.subtract(deltaV, v_j, v_i);

        const dist = vec3.length(deltaP);
        if (dist === 0) continue;

        vec3.scale(dir, deltaP, 1 / dist);

        // Hooke's force
        const springForceMagnitude = stiffness * (dist - s.rest);
        vec3.scale(Fs, dir, springForceMagnitude);

        // Damping
        const dampingForceMagnitude = damping * vec3.dot(deltaV, dir);
        vec3.scale(Fd, dir, dampingForceMagnitude);

        // Total elastic force
        vec3.add(F_total, Fs, Fd);

        vec3.add(forces[s.p0], forces[s.p0], F_total);
        vec3.subtract(forces[s.p1], forces[s.p1], F_total);
    }

    // Euclidean integration
    for (let i = 0; i < numParticles; ++i) {
        // Integrazione
        vec3.scale(acc, forces[i], 1 / particleMass);
        vec3.scaleAndAdd(velocities[i], velocities[i], acc, dt);
        vec3.scaleAndAdd(positions[i], positions[i], velocities[i], dt);

        // Collision with water
        if (positions[i][1] < waterLevel) {
            positions[i][1] = waterLevel;
            if (velocities[i][1] < 0) {
                onCollision(positions[i], velocities[i]);
                velocities[i][1] *= -restitution;
            }
        }
    }
}