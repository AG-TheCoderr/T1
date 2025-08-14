// Comprehensive Three.js substitute for the demo to work
// This implements the minimal API needed by the application

const THREE = {
  // Math utilities
  MathUtils: {
    lerp: function(x, y, t) { return x * (1 - t) + y * t; },
    clamp: function(value, min, max) { return Math.max(min, Math.min(max, value)); },
    degToRad: function(degrees) { return degrees * Math.PI / 180; },
    radToDeg: function(radians) { return radians * 180 / Math.PI; }
  },
  
  // Core classes
  Scene: function() {
    this.background = null;
    this.fog = null;
    this.children = [];
    this.add = function(obj) { 
      this.children.push(obj); 
      obj.parent = this;
    };
    this.remove = function(obj) {
      const index = this.children.indexOf(obj);
      if (index > -1) {
        this.children.splice(index, 1);
        obj.parent = null;
      }
    };
  },
  
  WebGLRenderer: function(options) {
    this.domElement = document.createElement('canvas');
    this.domElement.width = 800;
    this.domElement.height = 600;
    this.domElement.style.width = '100%';
    this.domElement.style.height = '100%';
    this.capabilities = { getMaxAnisotropy: () => 16 };
    this.setPixelRatio = function(ratio) { this.pixelRatio = ratio; };
    this.setSize = function(w, h) { 
      this.domElement.width = w; 
      this.domElement.height = h; 
      this.domElement.style.width = w + 'px';
      this.domElement.style.height = h + 'px';
    };
    this.render = function(scene, camera) {
      // Minimal render - just clear to show it's working
      const ctx = this.domElement.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0b0f16';
        ctx.fillRect(0, 0, this.domElement.width, this.domElement.height);
        
        // Draw simple representation of animals if any exist
        if (typeof animals !== 'undefined') {
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.fillText(`Animals: ${animals.length}`, 10, 30);
        }
      }
    };
  },
  
  PerspectiveCamera: function(fov, aspect, near, far) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.updateProjectionMatrix = function() {};
  },
  
  Object3D: function() {
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.add = function(obj) { 
      this.children.push(obj); 
      obj.parent = this;
    };
    this.remove = function(obj) {
      const index = this.children.indexOf(obj);
      if (index > -1) {
        this.children.splice(index, 1);
        obj.parent = null;
      }
    };
  },
  
  Vector3: function(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.set = function(x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
    this.setX = function(x) { this.x = x; return this; };
    this.setY = function(y) { this.y = y; return this; };
    this.setZ = function(z) { this.z = z; return this; };
    this.copy = function(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
    this.clone = function() { return new THREE.Vector3(this.x, this.y, this.z); };
    this.add = function(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
    this.addScaledVector = function(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; };
    this.sub = function(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; };
    this.subVectors = function(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; };
    this.multiply = function(v) { this.x *= v.x; this.y *= v.y; this.z *= v.z; return this; };
    this.multiplyScalar = function(s) { this.x *= s; this.y *= s; this.z *= s; return this; };
    this.divide = function(v) { this.x /= v.x; this.y /= v.y; this.z /= v.z; return this; };
    this.divideScalar = function(s) { return this.multiplyScalar(1/s); };
    this.normalize = function() { 
      const length = this.length();
      if (length > 0) { this.divideScalar(length); }
      return this;
    };
    this.length = function() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); };
    this.lengthSq = function() { return this.x*this.x + this.y*this.y + this.z*this.z; };
    this.distanceTo = function(v) { return Math.sqrt((this.x-v.x)**2 + (this.y-v.y)**2 + (this.z-v.z)**2); };
    this.dot = function(v) { return this.x*v.x + this.y*v.y + this.z*v.z; };
    this.cross = function(v) {
      const x = this.y*v.z - this.z*v.y;
      const y = this.z*v.x - this.x*v.z;
      const z = this.x*v.y - this.y*v.x;
      this.x = x; this.y = y; this.z = z;
      return this;
    };
    this.setFromMatrixPosition = function(m) { return this; };
    this.applyQuaternion = function(q) { return this; };
    this.applyAxisAngle = function(axis, angle) { return this; };
  },
  
  Euler: function(x, y, z, order) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.order = order || 'XYZ';
  },
  
  Matrix4: function() {
    this.elements = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    this.makeRotationY = function(angle) { return this; };
    this.multiply = function(m) { return this; };
    this.makeScale = function(x, y, z) { return this; };
    this.setPosition = function(x, y, z) { return this; };
    this.compose = function(pos, quat, scale) { return this; };
    this.clone = function() { return new THREE.Matrix4(); };
  },
  
  Quaternion: function(x, y, z, w) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.w = w !== undefined ? w : 1;
    this.set = function(x, y, z, w) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      return this;
    };
    this.setFromEuler = function(euler) { return this; };
  },
  
  Color: function(color) {
    this.r = 1; this.g = 1; this.b = 1;
    this.setHex = function(hex) {
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
      return this;
    };
    if (typeof color === 'number') {
      this.setHex(color);
    }
  },
  
  Fog: function(color, near, far) {
    this.color = new THREE.Color(color);
    this.near = near;
    this.far = far;
  },
  
  // Lights
  HemisphereLight: function(skyColor, groundColor, intensity) {
    this.position = new THREE.Vector3();
  },
  
  DirectionalLight: function(color, intensity) {
    this.position = new THREE.Vector3();
  },
  
  // Geometries
  PlaneGeometry: function(width, height, widthSegments, heightSegments) {
    this.type = 'PlaneGeometry';
    this.parameters = { width, height, widthSegments, heightSegments };
    this.rotateX = function(angle) { return this; };
    this.setAttribute = function(name, attribute) { return this; };
    this.computeVertexNormals = function() { return this; };
    this.getAttribute = function(name) {
      if (name === 'position') {
        const segments = widthSegments || 1;
        const count = (segments + 1) * (segments + 1);
        return {
          count: count,
          needsUpdate: false,
          getX: function(i) { return ((i % (segments + 1)) / segments - 0.5) * width; },
          getY: function(i) { return 0; },
          getZ: function(i) { return ((Math.floor(i / (segments + 1)) / segments) - 0.5) * height; },
          setY: function(i, y) { /* terrain height setting */ }
        };
      }
      return { count: 0, getX: () => 0, getY: () => 0, getZ: () => 0, setY: () => {} };
    };
    this.dispose = function() {};
  },
  
  BoxGeometry: function(width, height, depth, widthSegments, heightSegments, depthSegments) {
    this.type = 'BoxGeometry';
    this.dispose = function() {};
  },
  
  CylinderGeometry: function(radiusTop, radiusBottom, height, radialSegments) {
    this.type = 'CylinderGeometry';
    this.rotateX = function(angle) { return this; };
    this.setAttribute = function() { return this; };
    this.dispose = function() {};
  },
  
  SphereGeometry: function(radius, widthSegments, heightSegments) {
    this.type = 'SphereGeometry';
    this.rotateX = function(angle) { return this; };
    this.setAttribute = function() { return this; };
    this.dispose = function() {};
  },
  
  IcosahedronGeometry: function(radius, detail) {
    this.type = 'IcosahedronGeometry';
    this.dispose = function() {};
  },
  
  // Materials
  MeshLambertMaterial: function(options) {
    options = options || {};
    this.map = options.map || null;
    this.color = new THREE.Color(options.color || 0xffffff);
    this.dispose = function() {};
  },
  
  // Mesh
  Mesh: function(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler();
    this.scale = new THREE.Vector3(1, 1, 1);
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
    this.parent = null;
  },
  
  InstancedMesh: function(geometry, material, count) {
    this.geometry = geometry;
    this.material = material;
    this.count = count;
    this.instanceMatrix = { needsUpdate: false };
    this.setMatrixAt = function(index, matrix) {};
  },
  
  // Textures
  CanvasTexture: function(canvas) {
    this.wrapS = THREE.RepeatWrapping;
    this.wrapT = THREE.RepeatWrapping;
    this.anisotropy = 1;
    this.magFilter = THREE.LinearFilter;
    this.minFilter = THREE.LinearMipmapLinearFilter;
    this.needsUpdate = false;
    this.repeat = { 
      set: function(x, y) {
        this.x = x;
        this.y = y;
      },
      x: 1,
      y: 1
    };
  },
  
  // Constants
  RepeatWrapping: 1000,
  LinearFilter: 1006,
  LinearMipmapLinearFilter: 1008,
  
  // Buffer attributes
  Float32BufferAttribute: function(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
  },
  
  // Raycaster
  Raycaster: function() {
    this.setFromCamera = function() {};
    this.intersectObjects = function() { return []; };
  }
};

window.THREE = THREE;