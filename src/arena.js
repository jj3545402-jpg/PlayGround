import * as THREE from 'three'

const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function radialGlowTexture() {
  return canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(.16, 'rgba(255,255,255,.7)')
    g.addColorStop(.42, 'rgba(255,255,255,.18)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  })
}

function windowTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#080b13'
    ctx.fillRect(0, 0, w, h)
    for (let y = 8; y < h - 8; y += 13) {
      for (let x = 5; x < w - 5; x += 11) {
        if (Math.random() < .33) {
          const colors = ['#7dcbff', '#ffbd76', '#a48cff', '#ff6d55', '#9ce9d6']
          ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)]
          ctx.globalAlpha = rand(.25, .9)
          ctx.fillRect(x, y, 5, 3)
        }
      }
    }
    ctx.globalAlpha = 1
  })
}

function stoneTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2
    const bg = ctx.createRadialGradient(cx, cy, 40, cx, cy, w * .54)
    bg.addColorStop(0, '#252330')
    bg.addColorStop(.44, '#171620')
    bg.addColorStop(.72, '#111018')
    bg.addColorStop(1, '#07070d')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    // Stone tiling.
    for (let i = 0; i < 90; i++) {
      const x = rand(0, w), y = rand(0, h), r = rand(25, 130)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${rand(.005, .025)})`
      ctx.fill()
    }
    // Concentric gold rings.
    for (const [radius, alpha, width] of [[398, .42, 3], [410, .13, 1], [345, .16, 1], [300, .52, 2], [210, .13, 1], [175, .34, 2]]) {
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(226,184,112,${alpha})`
      ctx.lineWidth = width
      ctx.stroke()
    }
    // Broken halo arcs.
    ctx.lineWidth = 7
    for (const [start, len] of [[.2, .9], [2.2, .55], [3.5, .75], [4.9, .32]]) {
      ctx.beginPath()
      ctx.arc(cx, cy, 455, start, start + len)
      ctx.strokeStyle = 'rgba(255,200,107,.13)'
      ctx.stroke()
    }
    // Center emblem — a sharp eight-point storm sigil.
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = 'rgba(255,200,107,.55)'
    ctx.lineWidth = 4
    ctx.rotate(Math.PI / 8)
    for (let i = 0; i < 8; i++) {
      ctx.beginPath()
      ctx.moveTo(0, 38)
      ctx.lineTo(10, 132)
      ctx.lineTo(0, 112)
      ctx.lineTo(-10, 132)
      ctx.closePath()
      ctx.stroke()
      ctx.rotate(Math.PI / 4)
    }
    ctx.beginPath()
    ctx.arc(0, 0, 28, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
    // Radial cracks and scoring.
    for (let i = 0; i < 22; i++) {
      const a = rand(0, Math.PI * 2), r0 = rand(50, 300)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
      for (let j = 1; j < 4; j++) {
        const rr = r0 + j * rand(20, 70)
        ctx.lineTo(cx + Math.cos(a + rand(-.04, .04)) * rr, cy + Math.sin(a + rand(-.04, .04)) * rr)
      }
      ctx.strokeStyle = 'rgba(0,0,0,.24)'
      ctx.lineWidth = rand(.5, 2)
      ctx.stroke()
    }
    // Wet glints.
    for (let i = 0; i < 60; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 500
      const g = ctx.createRadialGradient(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0, cx + Math.cos(a) * r, cy + Math.sin(a) * r, rand(5, 30))
      g.addColorStop(0, `rgba(160,200,255,${rand(.02, .09)})`)
      g.addColorStop(1, 'rgba(160,200,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  })
}

function neonSignTexture(glyph, color) {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.strokeStyle = color
    ctx.lineWidth = 7
    ctx.strokeRect(12, 12, w - 24, h - 24)
    ctx.shadowColor = color
    ctx.shadowBlur = 24
    ctx.fillStyle = color
    ctx.font = '230px "Bebas Neue", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyph, w / 2, h / 2)
    ctx.shadowBlur = 0
  })
}

export class Arena {
  constructor(scene, renderer) {
    this.scene = scene
    this.renderer = renderer
    this.time = 0
    this.flash = 0
    this.nextLightning = rand(8, 16)
    this.bolts = []
    this.embers = []
    this.buildLights()
    this.buildSky()
    this.buildCity()
    this.buildStage()
    this.buildTorii()
    this.buildProps()
    this.buildRain()
    this.buildLightning()
    this.buildMist()
  }

  buildLights() {
    const scene = this.scene
    scene.fog = new THREE.FogExp2(0x080a16, .018)
    const hemi = new THREE.HemisphereLight(0x5d7dff, 0x281a14, 1.1)
    scene.add(hemi)
    this.hemi = hemi
    const moon = new THREE.DirectionalLight(0x9ec4ff, 2.6)
    moon.position.set(-8, 13, -9)
    moon.castShadow = true
    moon.shadow.mapSize.set(1536, 1536)
    moon.shadow.camera.left = -10
    moon.shadow.camera.right = 10
    moon.shadow.camera.top = 12
    moon.shadow.camera.bottom = -3
    moon.shadow.camera.near = 1
    moon.shadow.camera.far = 40
    moon.shadow.bias = -.0008
    moon.shadow.normalBias = .02
    scene.add(moon)
    this.moonLight = moon
    const rim = new THREE.SpotLight(0xff4b2b, 70, 22, Math.PI * .22, .7, 1.6)
    rim.position.set(8, 7, -4)
    rim.target.position.set(0, 1.5, 0)
    scene.add(rim, rim.target)
    const fill = new THREE.SpotLight(0x33dcff, 55, 18, Math.PI * .28, .8, 1.8)
    fill.position.set(-7, 6, 5)
    fill.target.position.set(-1, 1.4, 0)
    scene.add(fill, fill.target)
    this.rim = rim
    this.fill = fill
    this.lanternLights = []
    for (const x of [-5.6, 5.6]) {
      const l = new THREE.PointLight(0xff7a32, 16, 8, 2)
      l.position.set(x, 3.3, -3.5)
      scene.add(l)
      this.lanternLights.push({ light: l, base: 16, seed: Math.random() * 10 })
    }
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(90, 32, 20)
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x02030a) },
        mid: { value: new THREE.Color(0x15132b) },
        horizon: { value: new THREE.Color(0x31213a) },
        moonDir: { value: new THREE.Vector3(-.45, .3, -.84).normalize() },
      },
      vertexShader: `varying vec3 vWorld; void main(){ vWorld=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec3 vWorld; uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 moonDir;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          float h=clamp(vWorld.y*.5+.5,0.,1.);
          vec3 col=mix(horizon,mid,smoothstep(.46,.67,h));
          col=mix(col,top,smoothstep(.64,.96,h));
          float moonDot=max(dot(vWorld,moonDir),0.);
          col+=vec3(.38,.46,.75)*pow(moonDot,90.)*.9;
          col+=vec3(.1,.12,.25)*pow(moonDot,12.)*.35;
          vec2 sp=vec2(atan(vWorld.z,vWorld.x),asin(clamp(vWorld.y,-1.,1.)))*vec2(38.,22.);
          float stars=step(.997,hash(floor(sp)))*smoothstep(.24,.72,h);
          col+=vec3(.7,.82,1.)*stars*.8;
          gl_FragColor=vec4(col,1.);
        }`
    })
    const sky = new THREE.Mesh(geo, mat)
    this.scene.add(sky)
    this.sky = sky

    const glowTex = radialGlowTexture()
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8aa5ff, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }))
    glow.scale.set(30, 30, 1)
    glow.position.set(-20, 15, -46)
    this.scene.add(glow)
    const moon = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ color: 0xbcd1ff, fog: false, toneMapped: false }))
    moon.position.set(-20, 15, -45)
    moon.lookAt(0, 3, 4)
    this.scene.add(moon)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ab8ff, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false }))
    halo.scale.set(17, 17, 1)
    halo.position.copy(moon.position)
    this.scene.add(halo)

    // Low storm clouds.
    this.clouds = []
    const cloudTex = canvasTexture(512, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < 70; i++) {
        const x = rand(0, w), y = rand(h * .25, h * .8), r = rand(18, 70)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(22,25,48,${rand(.08, .2)})`)
        g.addColorStop(1, 'rgba(10,11,25,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
    })
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rand(.5, .9), depthWrite: false }))
      s.scale.set(rand(30, 65), rand(12, 24), 1)
      s.position.set(rand(-55, 55), rand(14, 28), rand(-55, -20))
      this.scene.add(s)
      this.clouds.push({ sprite: s, speed: rand(.08, .22), baseY: s.position.y })
    }
  }

  buildCity() {
    this.city = new THREE.Group()
    this.scene.add(this.city)
    const windows = windowTexture()
    windows.wrapS = windows.wrapT = THREE.RepeatWrapping
    windows.repeat.set(2, 2)
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x141827, map: windows, emissive: 0xffffff, emissiveMap: windows,
      emissiveIntensity: .58, roughness: .82, metalness: .22,
    })
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x070912, roughness: .9, metalness: .1 })
    const placements = []
    for (let i = 0; i < 30; i++) {
      const angle = rand(-Math.PI * .98, Math.PI * .98)
      const radius = rand(20, 48)
      const x = Math.sin(angle) * radius
      const z = -Math.cos(angle) * radius - 8
      if (Math.abs(x) < 8 && z > -18) continue
      placements.push({ x, z, w: rand(3.2, 8), h: rand(8, 30), d: rand(3, 7) })
    }
    for (const p of placements) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), Math.random() < .8 ? buildingMat : darkMat)
      mesh.position.set(p.x, p.h / 2 - 1.5, p.z)
      mesh.castShadow = false
      this.city.add(mesh)
      if (Math.random() < .28) {
        const color = Math.random() < .5 ? 0xff4d2e : 0x58f4ff
        const strip = new THREE.Mesh(new THREE.BoxGeometry(.1, p.h * .66, .1), new THREE.MeshBasicMaterial({ color, toneMapped: false }))
        strip.position.set(p.x + p.w * .5 + .08, p.h * .52 - 1, p.z + p.d * .5 + .08)
        this.city.add(strip)
      }
      if (Math.random() < .3) {
        const signTex = neonSignTexture(Math.random() < .5 ? '雷' : '風', Math.random() < .5 ? '#ff513b' : '#67f6ff')
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 5), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
        sign.position.set(p.x + p.w * .5 + .2, p.h * .62, p.z + p.d * .5 + .1)
        this.city.add(sign)
      }
    }
    // Distant bridge lights.
    const dotGeo = new THREE.BufferGeometry()
    const dots = []
    for (let i = 0; i < 160; i++) dots.push(rand(-50, 50), rand(1, 4), rand(-55, -30))
    dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3))
    const dotMat = new THREE.PointsMaterial({ color: 0xffa65c, size: .18, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false })
    this.city.add(new THREE.Points(dotGeo, dotMat))
  }

  buildStage() {
    const stage = new THREE.Group()
    this.scene.add(stage)
    const tex = stoneTexture()
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    const topMat = new THREE.MeshPhysicalMaterial({
      map: tex, color: 0xffffff, roughness: .29, metalness: .26,
      clearcoat: .7, clearcoatRoughness: .25, envMapIntensity: .75,
    })
    const disk = new THREE.Mesh(new THREE.CircleGeometry(8.2, 96), topMat)
    disk.rotation.x = -Math.PI / 2
    disk.position.y = .01
    disk.receiveShadow = true
    stage.add(disk)
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x090a11, roughness: .52, metalness: .45 })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(8.22, 7.9, .72, 96), sideMat)
    base.position.y = -.36
    base.receiveShadow = true
    base.castShadow = true
    stage.add(base)
    // Golden lip.
    const lip = new THREE.Mesh(new THREE.TorusGeometry(8.2, .05, 6, 128), new THREE.MeshStandardMaterial({ color: 0xffc86b, emissive: 0xff9d2e, emissiveIntensity: 1.4, roughness: .3, metalness: .8, toneMapped: false }))
    lip.rotation.x = Math.PI / 2
    lip.position.y = .04
    stage.add(lip)
    // Under-glow ring.
    const under = new THREE.Mesh(new THREE.TorusGeometry(8.14, .12, 4, 128), new THREE.MeshBasicMaterial({ color: 0x28d8ff, toneMapped: false, transparent: true, opacity: .35 }))
    under.rotation.x = Math.PI / 2
    under.position.y = -.48
    stage.add(under)
    this.underRing = under
    // Outer ocean / sky deck.
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x03060e, roughness: .08, metalness: .72, clearcoat: 1, clearcoatRoughness: .06,
      envMapIntensity: 1.1,
    })
    const water = new THREE.Mesh(new THREE.CircleGeometry(58, 64), waterMat)
    water.rotation.x = -Math.PI / 2
    water.position.y = -.74
    water.receiveShadow = true
    stage.add(water)
    // Puddles on the stage.
    for (let i = 0; i < 6; i++) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(rand(.5, 1.6), 28), new THREE.MeshPhysicalMaterial({ color: 0x0a1220, roughness: .04, metalness: .55, transparent: true, opacity: .63, clearcoat: 1 }))
      puddle.rotation.x = -Math.PI / 2
      puddle.position.set(rand(-5.5, 5.5), .025, rand(-3.4, 3.4))
      puddle.scale.y = rand(.45, 1)
      puddle.receiveShadow = true
      stage.add(puddle)
    }
    // Floating dust/gold motes on the platform.
    const moteGeo = new THREE.BufferGeometry()
    const arr = []
    for (let i = 0; i < 120; i++) arr.push(rand(-7.5, 7.5), rand(.2, 4.5), rand(-5.5, 5.5))
    moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    const moteMat = new THREE.PointsMaterial({ color: 0xffc86b, size: .035, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false })
    this.motes = new THREE.Points(moteGeo, moteMat)
    stage.add(this.motes)
  }

  buildTorii() {
    const g = new THREE.Group()
    g.position.set(0, 0, -6.8)
    this.scene.add(g)
    const red = new THREE.MeshStandardMaterial({ color: 0x8b1b22, roughness: .46, metalness: .25 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x11101a, roughness: .4, metalness: .55 })
    const gold = new THREE.MeshStandardMaterial({ color: 0xffbd68, emissive: 0xff8c2c, emissiveIntensity: .9, roughness: .28, metalness: .8 })
    for (const x of [-3.1, 3.1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.23, .3, 5.3, 12), red)
      pillar.position.set(x, 2.55, 0)
      pillar.castShadow = true
      g.add(pillar)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, .3, 12), dark)
      base.position.set(x, .15, 0)
      g.add(base)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.34, .75, .34), new THREE.MeshStandardMaterial({ color: 0xffc86b, emissive: 0xff7a2e, emissiveIntensity: 2.4, roughness: .5, transparent: true, opacity: .9, toneMapped: false }))
      lamp.position.set(x, 4.35, 0)
      g.add(lamp)
    }
    const lower = new THREE.Mesh(new THREE.BoxGeometry(8.4, .28, .45), red)
    lower.position.y = 4.28
    lower.castShadow = true
    g.add(lower)
    const top = new THREE.Mesh(new THREE.BoxGeometry(10, .34, .55), red)
    top.position.y = 5.45
    top.rotation.z = .015
    top.castShadow = true
    g.add(top)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(10.8, .2, .68), dark)
    cap.position.y = 5.66
    cap.rotation.z = .015
    g.add(cap)
    const trim = new THREE.Mesh(new THREE.BoxGeometry(9.5, .035, .03), gold)
    trim.position.set(0, 5.27, .3)
    g.add(trim)
    // Hanging banners.
    for (const x of [-2.25, 2.25]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(.72, 1.6), new THREE.MeshStandardMaterial({ color: 0xd9d0bd, roughness: .9, side: THREE.DoubleSide }))
      banner.position.set(x, 3.35, .08)
      g.add(banner)
      const glyphTex = neonSignTexture(x < 0 ? '風' : '雷', '#181018')
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), new THREE.MeshBasicMaterial({ map: glyphTex, transparent: true }))
      glyph.position.set(x, 3.5, .09)
      g.add(glyph)
    }
    this.torii = g
  }

  buildProps() {
    const group = new THREE.Group()
    this.scene.add(group)
    const stone = new THREE.MeshStandardMaterial({ color: 0x171820, roughness: .7, metalness: .15 })
    const red = new THREE.MeshStandardMaterial({ color: 0x762026, roughness: .55 })
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc16b, emissive: 0xff862e, emissiveIntensity: 1.1, roughness: .4 })
    // Lantern posts.
    for (const x of [-5.6, 5.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, 2.4, 8), stone)
      post.position.set(x, 1.2, -3.5)
      group.add(post)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.86, .07, .07), stone)
      arm.position.set(x + (x > 0 ? -.25 : .25), 2.36, -3.5)
      group.add(arm)
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(.24, .19, .62, 8), gold)
      lantern.position.set(x + (x > 0 ? -.48 : .48), 2.05, -3.5)
      group.add(lantern)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(.32, .2, 8), stone)
      cap.position.set(lantern.position.x, 2.44, -3.5)
      group.add(cap)
    }
    // Bamboo clusters at the edges.
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0x1f3a2c, roughness: .7 })
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1
      const h = rand(2.4, 4.2)
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, h, 5), bambooMat)
      b.position.set(side * rand(6.5, 8.2), h / 2, rand(-5.5, -2.2))
      b.rotation.z = rand(-.08, .08)
      group.add(b)
    }
    // Training posts / carved stones.
    for (const [x, z, s] of [[-6.2, 1.5, .7], [6.4, .8, .9], [-6.5, -1.1, .4]]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), stone)
      rock.position.set(x, s * .45, z)
      rock.rotation.set(rand(0, 1), rand(0, 3), rand(0, 1))
      rock.scale.y = rand(.6, 1.1)
      group.add(rock)
    }
    // Floating banners left/right.
    for (const x of [-7.5, 7.5]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, 5.8, 6), stone)
      pole.position.set(x, 2.9, -1.5)
      group.add(pole)
      const flagTex = canvasTexture(256, 512, (ctx, w, h) => {
        ctx.fillStyle = x < 0 ? '#103849' : '#421016'
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = x < 0 ? '#54eaff' : '#ff513b'
        ctx.lineWidth = 4
        ctx.strokeRect(12, 12, w - 24, h - 24)
        ctx.fillStyle = x < 0 ? '#9ffaff' : '#ffb0a0'
        ctx.font = '180px "Bebas Neue", sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(x < 0 ? '風' : '雷', w / 2, h / 2)
      })
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.5), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: .95 }))
      flag.position.set(x + (x < 0 ? .58 : -.58), 4.3, -1.5)
      flag.userData.phase = rand(0, 5)
      group.add(flag)
      this.flags = this.flags || []
      this.flags.push(flag)
    }
  }

  buildRain() {
    const count = 1400
    const positions = new Float32Array(count * 6)
    this.rainDrops = []
    for (let i = 0; i < count; i++) {
      const x = rand(-18, 18), y = rand(0, 19), z = rand(-12, 15)
      const len = rand(.18, .55)
      positions[i * 6] = x
      positions[i * 6 + 1] = y
      positions[i * 6 + 2] = z
      positions[i * 6 + 3] = x - .035
      positions[i * 6 + 4] = y - len
      positions[i * 6 + 5] = z
      this.rainDrops.push({ x, y, z, len, speed: rand(13, 23) })
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const mat = new THREE.LineBasicMaterial({ color: 0x8db4ff, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false })
    this.rain = new THREE.LineSegments(geo, mat)
    this.rain.frustumCulled = false
    this.scene.add(this.rain)
    this.rainPositions = positions
  }

  buildLightning() {
    this.boltGroup = new THREE.Group()
    this.scene.add(this.boltGroup)
  }

  buildMist() {
    const tex = radialGlowTexture()
    this.mist = []
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x4466bb, transparent: true, opacity: rand(.035, .08), depthWrite: false }))
      s.scale.set(rand(14, 30), rand(3, 7), 1)
      s.position.set(rand(-12, 12), rand(.5, 2), rand(-3, 3))
      this.scene.add(s)
      this.mist.push(s)
    }
  }

  strikeLightning(intensity = 1) {
    if (!this.scene) return
    const materials = []
    const startX = rand(-14, 14)
    for (let b = 0; b < 3; b++) {
      const points = []
      let x = startX + rand(-3, 3), y = 21, z = rand(-24, -10)
      const targetX = rand(-5, 5), targetZ = rand(-9, -2)
      for (let i = 0; i < 13; i++) {
        points.push(new THREE.Vector3(x, y, z))
        x += (targetX - x) * .18 + rand(-1.2, 1.2)
        y -= 1.55
        z += (targetZ - z) * .14 + rand(-.5, .5)
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({ color: b === 0 ? 0xe7f2ff : 0x89b5ff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false })
      const line = new THREE.Line(geo, mat)
      this.boltGroup.add(line)
      materials.push({ mat, life: .28 + b * .05 })
    }
    this.bolts.push({ materials, life: .35 })
    this.flash = Math.max(this.flash, .9 * intensity)
    if (this.onFlash) this.onFlash(intensity)
  }

  update(dt, time, camera) {
    this.time = time
    // Rain.
    const arr = this.rainPositions
    const drops = this.rainDrops
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i]
      d.y -= d.speed * dt
      if (d.y < -.5) { d.y = rand(17, 21); d.x = rand(-18, 18); d.z = rand(-12, 15) }
      arr[i * 6] = d.x
      arr[i * 6 + 1] = d.y
      arr[i * 6 + 2] = d.z
      arr[i * 6 + 3] = d.x - .04
      arr[i * 6 + 4] = d.y - d.len
      arr[i * 6 + 5] = d.z
    }
    this.rain.geometry.attributes.position.needsUpdate = true

    // Clouds.
    for (const c of this.clouds) {
      c.sprite.position.x += c.speed * dt
      if (c.sprite.position.x > 58) c.sprite.position.x = -58
      c.sprite.position.y = c.baseY + Math.sin(time * .1 + c.speed * 10) * .5
    }
    // Neon flicker.
    this.rim.intensity = 70 + Math.sin(time * 1.3) * 5
    this.fill.intensity = 55 + Math.sin(time * .9 + 1) * 4
    for (const l of this.lanternLights) {
      l.light.intensity = l.base * (0.82 + Math.sin(time * 8 + l.seed) * .05 + Math.random() * .07)
    }
    this.underRing.material.opacity = .28 + Math.sin(time * 2.2) * .1
    // Mist drift.
    for (let i = 0; i < this.mist.length; i++) {
      const m = this.mist[i]
      m.position.x += (i % 2 ? 1 : -1) * dt * .23
      if (m.position.x > 15) m.position.x = -15
      if (m.position.x < -15) m.position.x = 15
    }
    // Flags.
    if (this.flags) {
      for (const f of this.flags) {
        f.rotation.y = Math.sin(time * 1.4 + f.userData.phase) * .15
        f.rotation.z = Math.sin(time * 1.8 + f.userData.phase) * .025
      }
    }
    // Embers / motes.
    const mp = this.motes.geometry.attributes.position
    for (let i = 0; i < mp.count; i++) {
      let y = mp.getY(i) + dt * .11
      if (y > 4.5) y = .2
      mp.setY(i, y)
    }
    mp.needsUpdate = true

    // Lightning lifecycle.
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]
      b.life -= dt
      for (const m of b.materials) m.mat.opacity = clamp(b.life * 2.4, 0, 1) * .9
      if (b.life <= 0) {
        this.boltGroup.clear()
        this.bolts.splice(i, 1)
      }
    }
    this.flash = Math.max(0, this.flash - dt * 3.8)
    this.moonLight.intensity = 2.6 + this.flash * 4
    this.hemi.intensity = 1.1 + this.flash * 1.6
    // Ambient occasional storm strike.
    this.nextLightning -= dt
    if (this.nextLightning <= 0) {
      this.strikeLightning(.7)
      this.nextLightning = rand(9, 19)
      if (this.onThunder) this.onThunder()
    }
  }
}
