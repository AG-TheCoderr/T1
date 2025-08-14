// Minimal Three.js substitute for the demo to work
// This is a very basic implementation just to get the project running

const THREE = {
  Scene: function() {
    this.background = null;
    this.fog = null;
    this.children = [];
    this.add = function(obj) { this.children.push(obj); };
  },
  
  WebGLRenderer: function(options) {
    this.domElement = document.createElement('canvas');
    this.domElement.width = 800;
    this.domElement.height = 600;
    this.capabilities = { getMaxAnisotropy: () => 16 };
    this.setPixelRatio = function() {};
    this.setSize = function(w, h) { 
      this.domElement.width = w; 
      this.domElement.height = h; 
    };
    this.render = function() {};
  },
  
  PerspectiveCamera: function(fov, aspect, near, far) {
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.updateProjectionMatrix = function() {};
  },
  
  Object3D: function() {
    this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.children = [];
    this.add = function(obj) { this.children.push(obj); };
  },
  
  Vector3: function(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
    this.set = function(x, y, z) { this.x = x; this.y = y; this.z = z; return this; };
    this.copy = function(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; };
    this.add = function(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; };
    this.sub = function(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; };
    this.multiplyScalar = function(s) { this.x *= s; this.y *= s; this.z *= s; return this; };
    this.normalize = function() { 
      const length = Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
      if (length > 0) { this.x /= length; this.y /= length; this.z /= length; }
      return this;
    };
    this.length = function() { return Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z); };
    this.dot = function(v) { return this.x*v.x + this.y*v.y + this.z*v.z; };
    this.cross = function(v) {
      const x = this.y*v.z - this.z*v.y;
      const y = this.z*v.x - this.x*v.z;
      const z = this.x*v.y - this.y*v.x;
      this.x = x; this.y = y; this.z = z;
      return this;
    };
    this.setFromMatrixPosition = function() { return this; };
    this.applyQuaternion = function() { return this; };
  },
  
  Color: function(color) {
    this.r = 1; this.g = 1; this.b = 1;
  },
  
  Fog: function(color, near, far) {
    this.color = color;
    this.near = near;
    this.far = far;
  },
  
  HemisphereLight: function(skyColor, groundColor, intensity) {
    this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  },
  
  DirectionalLight: function(color, intensity) {
    this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  },
  
  PlaneGeometry: function(width, height, widthSegments, heightSegments) {
    this.vertices = [];
    this.rotateX = function(angle) { return this; };
    this.setAttribute = function() { return this; };
    this.getAttribute = function(name) {
      return {
        count: (widthSegments + 1) * (heightSegments + 1),
        needsUpdate: false,
        getX: function(i) { return (i % (widthSegments + 1)) * width / widthSegments - width/2; },
        getY: function(i) { return 0; },
        getZ: function(i) { return Math.floor(i / (widthSegments + 1)) * height / heightSegments - height/2; },
        setY: function(i, y) {}
      };
    };
  },
  
  CylinderGeometry: function(radiusTop, radiusBottom, height, radialSegments) {
    this.vertices = [];
    this.rotateX = function(angle) { return this; };
    this.setAttribute = function() { return this; };
  },
  
  SphereGeometry: function(radius, widthSegments, heightSegments) {
    this.vertices = [];
    this.rotateX = function(angle) { return this; };
    this.setAttribute = function() { return this; };
  },
  
  MeshLambertMaterial: function(options) {
    this.map = options?.map || null;
    this.color = options?.color || 0xffffff;
  },
  
  Mesh: function(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = { x: 0, y: 0, z: 0, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = { x: 1, y: 1, z: 1, set: function(x, y, z) { this.x = x; this.y = y; this.z = z; } };
  },
  
  CanvasTexture: function(canvas) {
    this.wrapS = THREE.RepeatWrapping;
    this.wrapT = THREE.RepeatWrapping;
    this.anisotropy = 1;
    this.magFilter = THREE.LinearFilter;
    this.minFilter = THREE.LinearMipmapLinearFilter;
    this.repeat = { set: function() {} };
  },
  
  RepeatWrapping: 1000,
  LinearFilter: 1006,
  LinearMipmapLinearFilter: 1008,
  Float32BufferAttribute: function(array, itemSize) {
    this.array = array;
    this.itemSize = itemSize;
  },
  
  Raycaster: function() {
    this.setFromCamera = function() {};
    this.intersectObjects = function() { return []; };
  }
};

window.THREE = THREE;