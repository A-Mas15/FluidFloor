class Objects
{
	constructor()
	{
		this.vpos = [];	// vertex positions
		this.face = [];	// face vertex indices
		this.tpos = [];	// texture coordinates
		this.tfac = [];	// face texture coordinate indices
		this.norm = [];	// surface normals
		this.nfac = [];	// face surface normal indices
	}
	
	// To upload an object in the scene
	getIndexBuffers() {
	    const finalPositions = [];
        const finalTexcoords = [];
        const finalNormals = [];
        const finalIndices = [];
        const vertexCache = new Map();

        for (let i = 0; i < this.face.length; i++) {
            const face = this.face[i];
            const tface = this.tfac[i] || [];
            const nface = this.nfac[i] || [];
            const faceIndices = [];

            for (let j = 0; j < face.length; j++) {
                const posIndex = face[j];
                const texIndex = tface[j];
                const normIndex = nface[j];
                const vertexString = `${posIndex}/${texIndex}/${normIndex}`;
                
                if (vertexCache.has(vertexString)) {
                    faceIndices.push(vertexCache.get(vertexString));
                    continue;
                }

                const newIndex = finalPositions.length / 3;
                
                finalPositions.push(...this.vpos[posIndex]);
                if (texIndex !== undefined) finalTexcoords.push(...this.tpos[texIndex]);
                if (normIndex !== undefined) finalNormals.push(...this.norm[normIndex]);
                
                faceIndices.push(newIndex);
                vertexCache.set(vertexString, newIndex);
            }

            for (let k = 1; k < faceIndices.length - 1; ++k) {
                finalIndices.push(faceIndices[0], faceIndices[k], faceIndices[k + 1]);
            }
        }
	
	     return {
            positions: finalPositions.length > 0 ? new Float32Array(finalPositions) : null,
            texcoords: finalTexcoords.length > 0 ? new Float32Array(finalTexcoords) : null,
            normals: finalNormals.length > 0 ? new Float32Array(finalNormals) : null,
            indices: finalIndices.length > 0 ? new Uint32Array(finalIndices) : null,
        };
	}

	// Parses the contents of an obj file.
	parse( objdata )
	{
		var lines = objdata.split('\n');
		for ( var i=0; i<lines.length; ++i ) {
			var line = lines[i].trim();
			var elem = line.split(/\s+/);
			switch ( elem[0][0] ) {
				case 'v':
					switch ( elem[0].length ) {
						case 1:
							this.vpos.push( [ parseFloat(elem[1]), parseFloat(elem[2]), parseFloat(elem[3]) ] );
							break;
						case 2:
							switch ( elem[0][1] ) {
								case 't':
									this.tpos.push( [ parseFloat(elem[1]), parseFloat(elem[2]) ] );
									break;
								case 'n':
									this.norm.push( [ parseFloat(elem[1]), parseFloat(elem[2]), parseFloat(elem[3]) ] );
									break;
							}
							break;
					}
					break;
				case 'f':
					var f=[], tf=[], nf=[];
					for ( var j=1; j<elem.length; ++j ) {
						var ids = elem[j].split('/');
						var vid = parseInt(ids[0]);
						if ( vid < 0 ) vid = this.vpos.length + vid + 1;
						f.push( vid - 1 );
						if ( ids.length > 1 && ids[1] !== "" ) {
							var tid = parseInt(ids[1]);
							if ( tid < 0 ) tid = this.tpos.length + tid + 1;
							tf.push( tid - 1 );
						}
						if ( ids.length > 2 && ids[2] !== "" ) {
							var nid = parseInt(ids[2]);
							if ( nid < 0 ) nid = this.norm.length + nid + 1;
							nf.push( nid - 1 );
						}
					}
					this.face.push(f);
					if ( tf.length ) this.tfac.push(tf);
					if ( nf.length ) this.nfac.push(nf);
					break;
			}
		}
	}

	// Returns the bounding box of the object
	getBoundingBox()
	{
		if ( this.vpos.length == 0 ) return null;
		var min = [...this.vpos[0]];
		var max = [...this.vpos[0]];
		for ( var i=1; i<this.vpos.length; ++i ) {
			for ( var j=0; j<3; ++j ) {
				if ( min[j] > this.vpos[i][j] ) min[j] = this.vpos[i][j];
				if ( max[j] < this.vpos[i][j] ) max[j] = this.vpos[i][j];
			}
		}
		return { min: min, max: max };
	}
	
	shiftAndScale( shift, scale )
	{
		for ( var i=0; i<this.vpos.length; ++i ) {
			for ( var j=0; j<3; ++j ) {
				this.vpos[i][j] = (this.vpos[i][j] + shift[j]) * scale;
			}
		}
	}
	
	computeNormals()
	{
		function add( a, b ) {
			return [ a[0]+b[0], a[1]+b[1], a[2]+b[2] ];
		}

		function sub( a, b ) {
			return [ a[0]-b[0], a[1]-b[1], a[2]-b[2] ];
		}

		function dot( a, b ) {
			return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
		}

		function cross( a, b ) {
			return [ a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0] ];
		}
		
		function normalize( a ) {
			var len = Math.sqrt( dot(a,a) );
			return [ a[0]/len, a[1]/len, a[2]/len ];
		}
		
		if ( this.nfac.length == 0 || this.norm.length == 0 ) {
			this.nfac = this.face;
			this.norm.length = this.vpos.length;
		}
		for ( var i=0; i<this.norm.length; ++i ) this.norm[i] = [0,0,0];
		for ( var i=0; i<this.face.length; ++i ) {
			var f = this.face[i];
			var nf = this.nfac[i];
			var v0 = this.vpos[ f[0] ];
			for ( var j=1; j<f.length-1; ++j ) {
				var v1 = this.vpos[ f[j] ];
				var v2 = this.vpos[ f[j+1] ];
				var e0 = sub( v1, v0 );
				var e1 = sub( v2, v0 );
				var n  = cross( e0, e1 );
				n = normalize(n);
				this.norm[ nf[0  ] ] = add( this.norm[ nf[0  ] ], n );
				this.norm[ nf[j  ] ] = add( this.norm[ nf[j  ] ], n );
				this.norm[ nf[j+1] ] = add( this.norm[ nf[j+1] ], n );
			}
		}
		for ( var i=0; i<this.norm.length; ++i ) this.norm[i] = normalize(this.norm[i]);
	}
	
	getVertexBuffers()
	{
		function addTriangleToBuffers( mesh, fi, i, j, k )
		{
			var f  = mesh.face[fi];
			var tf = mesh.tfac[fi];
			var nf = mesh.nfac[fi];
			addTriangleToBuffer( vBuffer, mesh.vpos, f, i, j, k, addVertToBuffer3 );
			if ( tf ) {
				addTriangleToBuffer( tBuffer, mesh.tpos, tf, i, j, k, addVertToBuffer2 );
			}
			if ( nf ) {
				addTriangleToBuffer( nBuffer, mesh.norm, nf, i, j, k, addVertToBuffer3 );
			}
		}
		
		function addTriangleToBuffer( buffer, v, f, i, j, k, addVert )
		{
			addVert( buffer, v, f, i );
			addVert( buffer, v, f, j );
			addVert( buffer, v, f, k );
		}
		
		function addVertToBuffer3( buffer, v, f, i )
		{
			buffer.push( v[f[i]][0] );
			buffer.push( v[f[i]][1] );
			buffer.push( v[f[i]][2] );
		}

		function addVertToBuffer2( buffer, v, f, i )
		{
			buffer.push( v[f[i]][0] );
			buffer.push( v[f[i]][1] );
		}
	
		var vBuffer = [];
		var tBuffer = [];
		var nBuffer = [];
		
		for ( var i=0; i<this.face.length; ++i ) {
			if ( this.face[i].length < 3 ) continue;
			addTriangleToBuffers( this, i, 0, 1, 2 );
			for ( var j=3; j<this.face[i].length; ++j ) {
				addTriangleToBuffers( this, i, 0, j-1, j );
			}
		}
		
		return { positionBuffer: vBuffer, texCoordBuffer: tBuffer, normalBuffer: nBuffer };
	}
}
