import * as THREE from 'three'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(.18, 'rgba(255,255,255,.85)')
  g.addColorStop(.5, 'rgba(255,255,255,.22)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

class ParticleField {
  constructor(scene, max = 700) {
    this.max = max
    this.cursor = 0
    this.positions = new Float32Array(max * 3)
    this.colors = new Float32Array(max * 3)
    this.sizes = new Float32Array(max)
    this.alphas = new Float32Array(max)
    this.vel = new Float32Array(max * 3)
    this.life = new Float32Array(max)
    this.maxLife = new Float32Array(max)
    this.gravity = new Float32Array(max)
    this.drag = new Float32Array(max)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1))
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPixel: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        varying vec3 vColor; varying float vAlpha;
        uniform float uPixel;
        void main(){
          vColor=color; vAlpha=aAlpha;
          vec4 mv=modelViewMatrix*vec4(position,1.);
          gl_PointSize=aSize*uPixel*220./max(1.,-mv.z);
          gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 p=gl_PointCoord-.5; float d=length(p);
          float a=smoothstep(.5,.05,d)*vAlpha;
          gl_FragColor=vec4(vColor,a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    scene.add(this.points)
    this.scene = scene
  }

  spawn(pos, color, { count = 10, speed = 5, size = .12, life = .5, gravity = -6, drag = 2.4, spread = 1, direction = null, ember = false } = {}) {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor
      this.cursor = (this.cursor + 1) % this.max
      let vx, vy, vz
      if (direction) {
        vx = direction.x + (Math.random() - .5) * spread
        vy = direction.y + (Math.random() - .5) * spread
        vz = direction.z + (Math.random() - .5) * spread
      } else {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const s = speed * (0.25 + Math.random() * .85)
        vx = Math.sin(phi) * Math.cos(theta) * s
        vy = Math.cos(phi) * s
        vz = Math.sin(phi) * Math.sin(theta) * s
      }
      this.positions[idx * 3] = pos.x + (Math.random() - .5) * .08
      this.positions[idx * 3 + 1] = pos.y + (Math.random() - .5) * .08
      this.positions[idx * 3 + 2] = pos.z + (Math.random() - .5) * .08
      this.vel[idx * 3] = vx
      this.vel[idx * 3 + 1] = vy
      this.vel[idx * 3 + 2] = vz
      const c = color.clone()
      if (ember) c.offsetHSL(0, 0, (Math.random() - .5) * .05)
      this.colors[idx * 3] = c.r
      this.colors[idx * 3 + 1] = c.g
      this.colors[idx * 3 + 2] = c.b
      this.sizes[idx] = size * (0.45 + Math.random() * 1.1)
      this.alphas[idx] = 1
      const l = life * (0.55 + Math.random() * .8)
      this.life[idx] = l
      this.maxLife[idx] = l
      this.gravity[idx] = gravity
      this.drag[idx] = drag
    }
  }

  update(dt) {
    const p = this.positions, v = this.vel
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alphas[i] = 0; continue }
      this.life[i] -= dt
      const l = Math.max(0, this.life[i])
      const d = Math.exp(-this.drag[i] * dt)
      v[i * 3] *= d
      v[i * 3 + 1] = v[i * 3 + 1] * d + this.gravity[i] * dt
      v[i * 3 + 2] *= d
      p[i * 3] += v[i * 3] * dt
      p[i * 3 + 1] += v[i * 3 + 1] * dt
      p[i * 3 + 2] += v[i * 3 + 2] * dt
      const t = l / this.maxLife[i]
      this.alphas[i] = Math.min(1, t * 2.2)
    }
    const g = this.points.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.color.needsUpdate = true
    g.attributes.aSize.needsUpdate = true
    g.attributes.aAlpha.needsUpdate = true
  }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene
    this.camera = camera
    this.particles = new ParticleField(scene)
    this.rings = []
    this.shockwaves = []
    this.slashes = []
    this.glowTex = glowTexture()
    this.projectiles = []
    this.bolts = []
  }

  burst(pos, color, opts = {}) {
    this.particles.spawn(pos, new THREE.Color(color), opts)
  }

  impact(pos, color = 0xffd27a, scale = 1, blocked = false) {
    const c = new THREE.Color(color)
    this.particles.spawn(pos, c, { count: blocked ? 12 : 26, speed: blocked ? 3 : 7, size: .13 * scale, life: .45, gravity: -8 })
    this.particles.spawn(pos, new THREE.Color(0xffffff), { count: 10, speed: 4.5, size: .08 * scale, life: .28, gravity: -3 })
    // Flash ring.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.17, .25, 28),
      new THREE.MeshBasicMaterial({ color: blocked ? 0x7febff : c, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    )
    ring.position.copy(pos)
    ring.position.z += .2
    ring.scale.setScalar(scale)
    ring.userData.life = .28
    ring.userData.maxLife = .28
    ring.userData.grow = 6 * scale
    this.scene.add(ring)
    this.rings.push(ring)
    // Star flare.
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: blocked ? 0x9ffaff : 0xffe0a0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    flare.position.copy(pos)
    flare.scale.setScalar(2.1 * scale)
    flare.userData.life = .17
    flare.userData.maxLife = .17
    flare.userData.flare = true
    this.scene.add(flare)
    this.rings.push(flare)
  }

  slash(pos, color, rotation = 0) {
    const geo = new THREE.RingGeometry(.55, .74, 28, 1, 0, Math.PI * 1.08)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    mesh.position.copy(pos)
    mesh.position.z += .4
    mesh.rotation.z = rotation
    mesh.userData.life = .3
    mesh.userData.maxLife = .3
    mesh.userData.grow = 3.5
    this.scene.add(mesh)
    this.slashes.push(mesh)
  }

  groundWave(x, z, color = 0xffb35e, scale = 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.7, .82, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, .045, z)
    ring.userData.life = .55
    ring.userData.maxLife = .55
    ring.userData.grow = 9 * scale
    this.scene.add(ring)
    this.shockwaves.push(ring)
    this.burst(new THREE.Vector3(x, .3, z), color, { count: 24, speed: 10, size: .14, life: .8, gravity: 3, drag: 2.2 })
  }

  dust(x, z, color = 0x8899aa) {
    this.particles.spawn(new THREE.Vector3(x, .16, z), new THREE.Color(color), { count: 5, speed: 1.8, size: .09, life: .5, gravity: 3, drag: 3 })
  }

  lightningStrike(x, z, color = 0xdbeaff) {
    const group = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const pts = []
      let px = x + (Math.random() - .5) * 3, py = 18, pz = z + (Math.random() - .5) * 2
      for (let j = 0; j < 12; j++) {
        pts.push(new THREE.Vector3(px, py, pz))
        px += (x - px) * .2 + (Math.random() - .5) * 1.1
        py -= 1.45
        pz += (z - pz) * .2 + (Math.random() - .5) * .8
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: i ? 0x7db6ff : color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      )
      group.add(line)
    }
    this.scene.add(group)
    this.bolts.push({ group, life: .24 })
    this.groundWave(x, z, color, 1.7)
    this.burst(new THREE.Vector3(x, 1.6, z), 0xffffff, { count: 45, speed: 12, size: .18, life: .7, gravity: -3, drag: 1.8 })
  }

  spawnProjectile(owner, fx = 1) {
    const color = owner.config.glow
    const g = new THREE.Group()
    const dir = owner.forward
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.19, 2), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }))
    g.add(core)
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(.33, 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    )
    g.add(shell)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    sprite.scale.setScalar(2.2)
    g.add(sprite)
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(.42 + i * .1, .018, 4, 26),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      )
      ring.rotation.x = Math.random() * Math.PI
      ring.rotation.y = Math.random() * Math.PI
      g.add(ring)
      g.userData[`ring${i}`] = ring
    }
    const light = new THREE.PointLight(color, 22, 4, 2)
    g.add(light)
    g.position.set(owner.x + dir * .6, 1.05, .1)
    this.scene.add(g)
    const p = { group: g, owner, dir, speed: 9.2 * fx, life: 2.2, hit: false, radius: .4, trail: 0 }
    this.projectiles.push(p)
    return p
  }

  update(dt, time) {
    this.particles.update(dt)
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]
      r.userData.life -= dt
      const t = Math.max(0, r.userData.life / r.userData.maxLife)
      if (r.userData.flare) {
        r.material.opacity = t
        r.scale.setScalar(2.1 + (1 - t) * 1.4)
      } else {
        r.material.opacity = t * .9
        const s = 1 + (1 - t) * r.userData.grow
        r.scale.set(s, s, s)
      }
      if (r.userData.life <= 0) { this.scene.remove(r); r.geometry?.dispose(); r.material.dispose(); this.rings.splice(i, 1) }
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const r = this.slashes[i]
      r.userData.life -= dt
      const t = Math.max(0, r.userData.life / r.userData.maxLife)
      r.material.opacity = t
      r.rotation.z += dt * 5
      const s = 1 + (1 - t) * r.userData.grow
      r.scale.set(s, s, s)
      if (r.userData.life <= 0) { this.scene.remove(r); r.geometry.dispose(); r.material.dispose(); this.slashes.splice(i, 1) }
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const r = this.shockwaves[i]
      r.userData.life -= dt
      const t = Math.max(0, r.userData.life / r.userData.maxLife)
      r.material.opacity = t * .9
      const s = 1 + (1 - t) * r.userData.grow
      r.scale.set(s, s, 1)
      if (r.userData.life <= 0) { this.scene.remove(r); r.geometry.dispose(); r.material.dispose(); this.shockwaves.splice(i, 1) }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.life -= dt
      b.group.children.forEach((l, j) => { l.material.opacity = clamp(b.life * (j ? 4 : 6), 0, 1) })
      if (b.life <= 0) {
        this.scene.remove(b.group)
        b.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose() })
        this.bolts.splice(i, 1)
      }
    }
    // Projectiles.
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      if (p.hit) continue
      p.life -= dt
      p.group.position.x += p.dir * p.speed * dt
      p.group.position.y = 1.05 + Math.sin(time * 12 + p.group.position.x) * .05
      p.group.children.forEach(o => {
        if (o.isMesh && o.geometry?.type === 'TorusGeometry') {
          o.rotation.x += dt * 7
          o.rotation.y += dt * 5
        }
        if (o.isMesh && o.geometry?.type === 'IcosahedronGeometry') {
          o.rotation.y += dt * 6
        }
      })
      p.trail -= dt
      if (p.trail <= 0) {
        p.trail = .028
        this.particles.spawn(p.group.position.clone(), new THREE.Color(p.owner.config.glow), { count: 2, speed: 1.2, size: .14, life: .35, gravity: 1.5, drag: 4 })
      }
      if (p.life <= 0 || Math.abs(p.group.position.x) > 9) {
        this.despawnProjectile(p)
        this.projectiles.splice(i, 1)
      }
    }
  }

  despawnProjectile(p) {
    if (!p || p.hit) return
    p.hit = true
    this.burst(p.group.position.clone(), p.owner?.config?.glow ?? 0xffaa55, { count: 18, speed: 4, size: .14, life: .5 })
    this.scene.remove(p.group)
    p.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose() })
  }

  clearProjectiles() {
    for (const p of this.projectiles) {
      if (!p.hit) {
        this.scene.remove(p.group)
        p.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose() })
      }
    }
    this.projectiles.length = 0
  }
}
