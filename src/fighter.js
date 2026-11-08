import * as THREE from 'three'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt))
const lerp = THREE.MathUtils.lerp

function radialTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(0,0,0,.8)')
  g.addColorStop(.45, 'rgba(0,0,0,.42)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

let shadowMap = null

function capsule(r, length, material, segments = 12) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, length, 4, segments), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function sphere(r, material, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), material)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function cone(r, h, material, seg = 8) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material)
  m.castShadow = true
  return m
}

export const FIGHTERS = {
  kaze: {
    id: 'kaze', name: 'KAZE', title: 'THE GALE', glyph: '風',
    cloth: 0x0b6175, clothDark: 0x081a25, skin: 0xc98f68, hair: 0x101018,
    trim: 0xffc86b, glow: 0x58f4ff, accent: 0x2ee7ff, sash: 0xe7e1d2,
    light: 0x58f4ff, moveColor: 0x58f4ff,
  },
  shogun: {
    id: 'shogun', name: 'SHOGUN', title: 'THE TEMPEST', glyph: '雷',
    cloth: 0x77151f, clothDark: 0x1b080d, skin: 0xa86b4b, hair: 0xd9d2c3,
    trim: 0xffb35e, glow: 0xff4d2e, accent: 0xff8c4a, sash: 0x171018,
    light: 0xff4d2e, moveColor: 0xff4d2e,
  },
}

export class Fighter {
  constructor(config, { x = 0, facing = 1, isPlayer = false } = {}) {
    this.config = config
    this.isPlayer = isPlayer
    this.x = x
    this.y = 0
    this.vy = 0
    this.vx = 0
    this.facing = facing
    this.homeX = x
    this.maxHealth = 100
    this.health = 100
    this.energy = 34
    this.maxEnergy = 100
    this.guard = 100
    this.grounded = true
    this.state = 'idle'
    this.stateTime = 0
    this.stateDuration = 0
    this.attack = null
    this.hitStun = 0
    this.blocking = false
    this.moveDir = 0
    this.invulnerable = false
    this.comboHits = 0
    this.lastHitAt = -10
    this.wins = 0
    this.koTimer = 0
    this.flash = 0
    this.walkPhase = Math.random() * 10
    this.aura = 0
    this.root = new THREE.Group()
    this.root.name = config.id
    this.rig = new THREE.Group()
    this.root.add(this.rig)
    this._buildMaterials()
    this._buildModel()
    this._buildShadow()
    this.root.position.x = x
    this.root.rotation.y = facing > 0 ? 0 : Math.PI
    this.anim = this._blankPose()
    this.target = this._blankPose()
    this.trailTimer = 0
    this.afterimages = []
  }

  _buildMaterials() {
    const c = this.config
    const std = (color, opts = {}) => new THREE.MeshStandardMaterial({
      color, roughness: .62, metalness: .08, envMapIntensity: .55, ...opts,
    })
    this.mat = {
      cloth: std(c.cloth, { roughness: .72 }),
      clothDark: std(c.clothDark, { roughness: .78 }),
      skin: std(c.skin, { roughness: .58, metalness: .02 }),
      hair: std(c.hair, { roughness: .85 }),
      trim: std(c.trim, { roughness: .34, metalness: .72, envMapIntensity: 1.1 }),
      metal: std(0x252936, { roughness: .32, metalness: .82, envMapIntensity: 1.15 }),
      sash: std(c.sash, { roughness: .8 }),
      glow: std(c.glow, { color: c.glow, emissive: c.glow, emissiveIntensity: 3.2, roughness: .3, toneMapped: false }),
      glowSoft: std(c.glow, { color: c.glow, emissive: c.glow, emissiveIntensity: 1.25, roughness: .45, transparent: true, opacity: .5, toneMapped: false }),
      dark: std(0x0c0e15, { roughness: .6 }),
      eye: std(0xffffff, { color: 0xffffff, emissive: c.glow, emissiveIntensity: 5, toneMapped: false }),
    }
  }

  _buildModel() {
    const M = this.mat
    // Body pivot — animations lean from the hips.
    this.body = new THREE.Group()
    this.body.position.y = 1.02
    this.rig.add(this.body)

    // Hips + belt + flowing waist cloth.
    const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(.28, .3, .26, 8), M.clothDark)
    pelvis.scale.z = 1.25
    pelvis.castShadow = true
    this.body.add(pelvis)
    const belt = new THREE.Mesh(new THREE.TorusGeometry(.31, .045, 6, 20), M.trim)
    belt.rotation.x = Math.PI / 2
    belt.scale.z = .86
    belt.position.y = .12
    belt.castShadow = true
    this.body.add(belt)
    this.waistTail = new THREE.Group()
    this.waistTail.position.set(-.18, .1, -.12)
    this.body.add(this.waistTail)
    const tailA = box(.035, .52, .26, M.cloth, 0, -.26, 0)
    const tailB = box(.03, .38, .18, M.cloth, -.04, -.2, .2)
    this.waistTail.add(tailA, tailB)

    // Chest group for torso twist.
    this.chest = new THREE.Group()
    this.chest.position.y = .18
    this.body.add(this.chest)

    const torsoGeo = new THREE.CylinderGeometry(.36, .29, .7, 7)
    const torso = new THREE.Mesh(torsoGeo, M.cloth)
    torso.scale.z = .72
    torso.position.y = .35
    torso.castShadow = true
    torso.receiveShadow = true
    this.chest.add(torso)
    const chestPlate = box(.14, .42, .32, M.clothDark, .22, .42, 0)
    chestPlate.rotation.z = -.06
    this.chest.add(chestPlate)
    const plateEdge = box(.026, .34, .25, M.trim, .296, .42, 0)
    this.chest.add(plateEdge)
    // Emissive core seam.
    const seam = box(.012, .33, .032, M.glow, .307, .43, 0)
    this.chest.add(seam)
    // Shoulder yolk.
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(.33, .06, 5, 16, Math.PI), M.clothDark)
    yoke.position.y = .66
    yoke.rotation.x = Math.PI / 2
    yoke.rotation.z = Math.PI
    yoke.scale.z = .8
    this.chest.add(yoke)

    // Head.
    this.head = new THREE.Group()
    this.head.position.y = .93
    this.chest.add(this.head)
    const skull = sphere(.205, M.skin, 1, 1.08, .94)
    skull.position.y = .06
    this.head.add(skull)
    const jaw = sphere(.155, M.skin, 1.1, .82, .88)
    jaw.position.set(.025, -.05, 0)
    this.head.add(jaw)
    // Mask / face plate.
    const maskMat = this.config.id === 'shogun' ? M.dark : M.clothDark
    const mask = box(.11, .19, .25, maskMat, .139, .03, 0)
    mask.rotation.z = .03
    this.head.add(mask)
    for (const z of [-.075, .075]) {
      const eye = box(.035, .028, .052, M.eye, .2, .065, z)
      this.head.add(eye)
    }
    const brow = box(.035, .018, .3, M.trim, .185, .115, 0)
    brow.rotation.z = -.13
    this.head.add(brow)
    // Hair.
    const hair = sphere(.218, M.hair, 1.02, 1.05, 1)
    hair.position.set(-.02, .12, 0)
    hair.scale.y = .9
    this.head.add(hair)
    if (this.config.id === 'kaze') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(.21, .028, 5, 18), M.trim)
      band.rotation.y = Math.PI / 2
      band.position.y = .13
      band.scale.z = .97
      this.head.add(band)
      this.bandTail = new THREE.Group()
      this.bandTail.position.set(-.17, .12, .05)
      this.head.add(this.bandTail)
      this.bandTail.add(box(.42, .045, .012, M.trim, -.21, -.03, 0), box(.3, .035, .01, M.trim, -.16, -.11, .04))
      // Spiky hair.
      for (let i = 0; i < 5; i++) {
        const spike = cone(.07, .26 + (i % 2) * .08, M.hair, 5)
        spike.position.set(-.12 + i * .035, .2 + (i % 2) * .05, -.13 + i * .065)
        spike.rotation.z = .55 + i * .22
        spike.rotation.x = -.3 + i * .18
        this.head.add(spike)
      }
    } else {
      // Shogun's horned helmet / topknot.
      const cap = sphere(.225, M.clothDark, 1, .85, 1)
      cap.position.y = .16
      this.head.add(cap)
      for (const z of [-1, 1]) {
        const horn = cone(.045, .42, M.trim, 5)
        horn.position.set(-.03, .35, z * .19)
        horn.rotation.z = -.38
        horn.rotation.x = z * -.38
        this.head.add(horn)
      }
      const crest = box(.04, .2, .04, M.glow, -.12, .25, 0)
      crest.rotation.z = -.4
      this.head.add(crest)
      this.hairTail = new THREE.Group()
      this.hairTail.position.set(-.18, .18, 0)
      this.head.add(this.hairTail)
      const ht = box(.08, .38, .08, M.hair, -.14, -.18, 0)
      ht.rotation.z = .2
      this.hairTail.add(ht)
    }

    // Arms.
    this.arms = []
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group()
      shoulder.position.set(0, .63, side * .335)
      this.chest.add(shoulder)
      const pad = sphere(.135, M.clothDark, 1.15, .8, 1)
      pad.position.set(0, .01, side * .02)
      shoulder.add(pad)
      const upper = capsule(.085, .27, M.cloth)
      upper.position.y = -.2
      upper.scale.z = .95
      shoulder.add(upper)
      const bicepBand = new THREE.Mesh(new THREE.TorusGeometry(.09, .02, 5, 12), M.trim)
      bicepBand.rotation.x = Math.PI / 2
      bicepBand.position.y = -.32
      shoulder.add(bicepBand)
      const elbow = new THREE.Group()
      elbow.position.y = -.4
      shoulder.add(elbow)
      const joint = sphere(.082, M.clothDark)
      elbow.add(joint)
      const fore = capsule(.07, .25, M.clothDark)
      fore.position.y = -.19
      elbow.add(fore)
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(.079, .068, .18, 8), M.sash)
      wrap.position.y = -.29
      elbow.add(wrap)
      const stripe = box(.012, .2, .075, M.glow, .0, -.29, side * .052)
      elbow.add(stripe)
      const hand = sphere(.092, M.skin, .88, 1.1, .9)
      hand.position.y = -.39
      elbow.add(hand)
      // Knuckle guard.
      const knuckle = box(.09, .055, .13, M.metal, .035, -.42, 0)
      elbow.add(knuckle)
      this.arms.push({ shoulder, elbow, hand, side })
    }

    // Legs.
    this.legs = []
    for (const side of [-1, 1]) {
      const hip = new THREE.Group()
      hip.position.set(0, -.01, side * .17)
      this.rig.add(hip)
      const thigh = capsule(.105, .29, M.clothDark)
      thigh.position.y = -.2
      hip.add(thigh)
      const thighArmor = box(.16, .3, .16, M.cloth, .04, -.2, 0)
      thighArmor.rotation.z = -.06
      hip.add(thighArmor)
      const knee = new THREE.Group()
      knee.position.y = -.43
      hip.add(knee)
      const kneeJoint = sphere(.09, M.metal)
      knee.add(kneeJoint)
      const shin = capsule(.082, .28, M.clothDark)
      shin.position.y = -.19
      knee.add(shin)
      const shinPlate = box(.12, .27, .12, M.cloth, .045, -.2, 0)
      shinPlate.rotation.z = -.03
      knee.add(shinPlate)
      const shinGlow = box(.012, .24, .04, M.glow, .105, -.2, side * .02)
      knee.add(shinGlow)
      const ankle = new THREE.Group()
      ankle.position.y = -.41
      knee.add(ankle)
      const foot = box(.27, .11, .15, M.dark, .08, -.01, 0)
      ankle.add(foot)
      const toeCap = box(.09, .06, .13, M.trim, .225, .01, 0)
      ankle.add(toeCap)
      this.legs.push({ hip, knee, ankle, side })
    }

    // Scarf / sash tails: animated cloth planes.
    this.scarf = new THREE.Group()
    this.scarf.position.set(-.19, .83, 0)
    this.chest.add(this.scarf)
    const scarfMat = new THREE.MeshStandardMaterial({
      color: this.config.trim, roughness: .82, side: THREE.DoubleSide,
      emissive: this.config.glow, emissiveIntensity: .06,
    })
    this.scarfMesh = box(.02, .72, .14, scarfMat, -.22, -.3, 0)
    this.scarfMesh.rotation.z = .12
    this.scarf.add(this.scarfMesh)
    this.scarfMesh2 = box(.015, .52, .1, scarfMat, -.42, -.2, -.07)
    this.scarfMesh2.rotation.z = -.3
    this.scarf.add(this.scarfMesh2)

    // Aura shell for specials.
    this.auraMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: this.config.glow, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      })
    )
    this.auraMesh.position.y = 1.1
    this.auraMesh.scale.set(.75, 1.25, .75)
    this.rig.add(this.auraMesh)
  }

  _buildShadow() {
    if (!shadowMap) shadowMap = radialTexture()
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.2),
      new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, opacity: .56, depthWrite: false })
    )
    this.shadow.rotation.x = -Math.PI / 2
    this.shadow.position.y = .015
    this.shadow.renderOrder = 1
    this.root.add(this.shadow)
  }

  _blankPose() {
    return {
      bodyY: 1.02, bodyLean: 0, bodyRoll: 0, bodyYaw: 0, bodyScale: 1,
      chestYaw: 0, chestPitch: 0, headYaw: 0, headPitch: 0,
      armL: [0, 0, -.2], armR: [0, 0, -.2],
      foreL: [0, 0, 0], foreR: [0, 0, 0],
      legL: [0, 0, 0], legR: [0, 0, 0],
      kneeL: [0, 0, 0], kneeR: [0, 0, 0],
      ankleL: [0, 0, 0], ankleR: [0, 0, 0],
      rootYaw: 0, rootTilt: 0, rootY: 0,
    }
  }

  setPose(target) {
    this.target = target
  }

  updateAnimation(dt, t) {
    const p = this._blankPose()
    const s = this.state
    const st = this.stateTime
    const walking = this.moveDir !== 0 && this.grounded && ['idle', 'walk'].includes(s)
    const guard = this.blocking && this.grounded
    const breathe = Math.sin(t * 2.2 + (this.isPlayer ? 0 : 1.7))

    // Base idle.
    p.bodyY = 1.02 + breathe * .012
    p.bodyLean = -.055 + breathe * .012
    p.bodyYaw = 0
    p.headYaw = Math.sin(t * .7) * .05
    p.armL = [.16, 0, .72]
    p.armR = [-.1, 0, .58]
    p.foreL = [0, 0, 1.92]
    p.foreR = [0, 0, 1.82]
    p.legL = [0, 0, -.39]
    p.legR = [0, 0, .47]
    p.kneeL = [0, 0, .52]
    p.kneeR = [0, 0, .38]
    p.ankleL = [0, 0, -.12]
    p.ankleR = [0, 0, -.06]

    if (walking) {
      this.walkPhase += dt * 9.5
      const w = Math.sin(this.walkPhase)
      p.bodyY += Math.abs(w) * .028
      p.bodyLean = -.14
      p.legL[2] = -.4 + w * .46
      p.legR[2] = .47 - w * .46
      p.kneeL[2] = .55 + Math.max(0, -w) * .45
      p.kneeR[2] = .38 + Math.max(0, w) * .45
      p.armL[2] = .72 - w * .14
      p.armR[2] = .58 + w * .12
      p.chestYaw = -.08 + w * .05
    }

    if (!this.grounded) {
      p.bodyY = 1.02
      p.bodyLean = -.18
      p.legL[2] = .95
      p.legR[2] = -.5
      p.kneeL[2] = 1.3
      p.kneeR[2] = .5
      p.armL[2] = 1.05
      p.armR[2] = 1.15
      p.foreL[2] = 1.4
      p.foreR[2] = 1.5
      p.bodyRoll = -.1
      if (this.vy > 1) p.bodyLean = -.05
    }

    if (guard) {
      p.bodyY = .9
      p.bodyLean = -.1
      p.armL = [.35, 0, 1.17]
      p.armR = [-.3, 0, 1.28]
      p.foreL = [0, 0, 2.17]
      p.foreR = [0, 0, 2.05]
      p.legL[2] = -.48
      p.legR[2] = .55
      p.kneeL[2] = .7
      p.kneeR[2] = .55
      p.headPitch = .08
      p.bodyRoll = .06
    }

    if (this.hitStun > 0 && !['ko', 'attack'].includes(s)) {
      const k = Math.min(1, this.hitStun * 5)
      p.bodyLean = .2 * k
      p.bodyRoll = .12 * k
      p.headPitch = -.28 * k
      p.armL = [.4, 0, .2]
      p.armR = [-.35, 0, .1]
      p.foreL = [0, 0, .7]
      p.foreR = [0, 0, .5]
    }

    if (s === 'attack' && this.attack) {
      const a = this.attack
      const total = a.startup + a.active + a.recovery
      const phase = st / total
      const activeStart = a.startup / total
      const activeEnd = (a.startup + a.active) / total
      const punchArm = a.kind === 'punch' ? 1 : -1
      const front = this.arms[1]
      const back = this.arms[0]
      if (a.kind === 'punch') {
        const wind = st < a.startup ? st / a.startup : 1
        const strike = st >= a.startup && st < a.startup + a.active
          ? 1 : st >= a.startup + a.active ? Math.max(0, 1 - (st - a.startup - a.active) / a.recovery) : 0
        const reach = strike > 0 ? 1.52 + strike * .15 : .55 + wind * .4
        p.armR = [-.08, 0, reach]
        p.foreR = [0, 0, strike > 0 ? .05 : 2.3]
        p.armL = [.28, 0, .95]
        p.foreL = [0, 0, 2.2]
        p.chestYaw = -.28 * strike + .08 * wind
        p.bodyLean = -.08 - strike * .1
        p.bodyY = 1.0 - strike * .02
        p.legL[2] = -.6
        p.legR[2] = .7
        p.kneeL[2] = .55
        p.kneeR[2] = .35
      } else if (a.kind === 'kick') {
        const strike = st >= a.startup && st < a.startup + a.active ? 1
          : st >= a.startup + a.active ? Math.max(0, 1 - (st - a.startup - a.active) / a.recovery) : 0
        const wind = Math.min(1, st / a.startup)
        p.legR[2] = .5 + (strike > 0 ? 1.05 : wind * .45)
        p.kneeR[2] = strike > 0 ? .12 : 1.1
        p.ankleR[2] = strike > 0 ? .1 : -.2
        p.legL[2] = -.35
        p.kneeL[2] = .45 + strike * .15
        p.bodyLean = .16 - strike * .05
        p.bodyRoll = -.08
        p.bodyY = 1.03
        p.armL = [.32, 0, 1.1]
        p.armR = [-.4, 0, .35]
        p.foreL = [0, 0, 1.9]
        p.foreR = [0, 0, 1.2]
        p.chestYaw = .14
      } else if (a.kind === 'palm') {
        const ready = Math.min(1, st / Math.max(.12, a.startup))
        const push = st >= a.startup ? 1 : 0
        const settle = Math.max(0, 1 - st / total)
        p.bodyY = .97 - ready * .06 + push * .04
        p.bodyLean = -.23 - push * .2
        p.armL = [.22, 0, .14 + ready * 1.42]
        p.armR = [-.22, 0, .14 + ready * 1.42]
        p.foreL = [0, 0, .3 + ready * .25]
        p.foreR = [0, 0, .3 + ready * .25]
        p.legL[2] = -.58
        p.legR[2] = .66
        p.kneeL[2] = .75
        p.kneeR[2] = .4
        p.chestYaw = 0
        p.headPitch = -.03
        this.aura = Math.max(this.aura, ready * .55)
        if (push) this.aura = Math.max(this.aura, settle * .7)
      } else if (a.kind === 'rush') {
        const run = st < a.startup + a.active ? 1 : 0
        p.bodyY = .9
        p.bodyLean = -.45
        p.bodyRoll = -.05
        p.chestYaw = -.38
        p.armR = [-.1, 0, 1.5]
        p.foreR = [0, 0, .12]
        p.armL = [.4, 0, .1]
        p.foreL = [0, 0, .55]
        p.legL[2] = -.8
        p.legR[2] = 1.0
        p.kneeL[2] = .8
        p.kneeR[2] = .4
        p.ankleR[2] = .3
        this.aura = Math.max(this.aura, run * .65)
      } else if (a.kind === 'storm') {
        const wind = Math.min(1, st / a.startup)
        const rise = st >= a.startup && st < a.startup + a.active ? 1 : 0
        const settle = Math.max(0, 1 - (st - a.startup - a.active) / Math.max(.01, a.recovery))
        p.bodyLean = -.35 - rise * .2
        p.bodyRoll = -.18 * rise
        p.rootYaw = st < a.startup ? Math.sin(st * 22) * .1 * wind : (st - a.startup) * 10
        p.bodyY = 1.02 + rise * .28 * Math.sin(Math.min(1, st / (a.startup + a.active)) * Math.PI)
        p.armR = [-.2, 0, .2 + rise * 1.3]
        p.foreR = [0, 0, .2]
        p.armL = [.4, 0, .25 + rise * .65]
        p.foreL = [0, 0, .9]
        p.legL[2] = -.3
        p.legR[2] = rise ? -0.1 : .6
        p.kneeL[2] = rise ? 1.1 : .6
        p.kneeR[2] = rise ? .7 : .4
        p.ankleL[2] = .2
        this.aura = Math.max(this.aura, .55 + wind * .45)
      }
    }

    if (s === 'ko') {
      const k = clamp(this.koTimer / 1.1, 0, 1)
      const ease = 1 - Math.pow(1 - k, 3)
      p.rootTilt = -1.38 * ease
      p.rootY = -.05 + .0 * ease
      p.bodyY = 1.02 - ease * .15
      p.bodyLean = .2 + ease * .3
      p.bodyRoll = .2
      p.armL = [.4, 0, .15]
      p.armR = [-.5, 0, .05]
      p.foreL = [0, 0, .3]
      p.foreR = [0, 0, .2]
      p.legL[2] = .4
      p.legR[2] = -.2
      p.kneeL[2] = .7
      p.kneeR[2] = .3
      p.headPitch = -.3
      p.headYaw = .3
    }

    if (s === 'victory') {
      const v = Math.sin(t * 5) * .06
      p.bodyY = 1.03 + v
      p.bodyLean = .04
      p.armR = [-.2, 0, 3.03]
      p.foreR = [0, 0, .15]
      p.armL = [.2, 0, 2.7]
      p.foreL = [0, 0, .2]
      p.chestYaw = .12
      p.headPitch = -.15
      p.legL[2] = -.32
      p.legR[2] = .4
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 7)
    }

    this.setPose(p)
  }

  applyPose(dt) {
    const p = this.target, a = this.anim
    const keys = ['bodyY', 'bodyLean', 'bodyRoll', 'bodyYaw', 'bodyScale', 'chestYaw', 'chestPitch', 'headYaw', 'headPitch', 'rootYaw', 'rootTilt', 'rootY']
    for (const k of keys) a[k] = damp(a[k], p[k], 18, dt)
    for (const k of ['armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'kneeL', 'kneeR', 'ankleL', 'ankleR']) {
      for (let i = 0; i < 3; i++) a[k][i] = damp(a[k][i], p[k][i], 22, dt)
    }
    this.body.position.y = a.bodyY
    this.body.rotation.z = a.bodyLean
    this.body.rotation.x = a.bodyRoll
    this.body.rotation.y = a.bodyYaw
    this.chest.rotation.y = a.chestYaw
    this.chest.rotation.x = a.chestPitch
    this.head.rotation.y = a.headYaw
    this.head.rotation.x = a.headPitch
    this.arms[0].shoulder.rotation.set(a.armL[0], a.armL[1], a.armL[2])
    this.arms[1].shoulder.rotation.set(a.armR[0], a.armR[1], a.armR[2])
    this.arms[0].elbow.rotation.set(a.foreL[0], a.foreL[1], a.foreL[2])
    this.arms[1].elbow.rotation.set(a.foreR[0], a.foreR[1], a.foreR[2])
    this.legs[0].hip.rotation.set(a.legL[0], a.legL[1], a.legL[2])
    this.legs[1].hip.rotation.set(a.legR[0], a.legR[1], a.legR[2])
    this.legs[0].knee.rotation.set(a.kneeL[0], a.kneeL[1], a.kneeL[2])
    this.legs[1].knee.rotation.set(a.kneeR[0], a.kneeR[1], a.kneeR[2])
    this.legs[0].ankle.rotation.set(a.ankleL[0], a.ankleL[1], a.ankleL[2])
    this.legs[1].ankle.rotation.set(a.ankleR[0], a.ankleR[1], a.ankleR[2])
    this.rig.rotation.y = a.rootYaw
    this.root.rotation.z = a.rootTilt
    this.root.rotation.y = (this.facing > 0 ? 0 : Math.PI) + a.rootYaw * 0
    this.rig.position.y = a.rootY
    // Aura + flash.
    this.aura = damp(this.aura, 0, 5, dt)
    this.auraMesh.material.opacity = this.aura * .23
    this.auraMesh.scale.set(.78 + this.aura * .3, 1.28 + this.aura * .32, .78 + this.aura * .3)
    if (this.auraMesh.material.opacity < .003) this.auraMesh.visible = false
    else this.auraMesh.visible = true
    const flashOn = this.flash > 0 ? 1 : 0
    for (const m of [this.mat.cloth, this.mat.clothDark, this.mat.skin]) {
      m.emissiveIntensity = flashOn * .8
      m.emissive.setHex(flashOn ? 0xff6b45 : 0x000000)
    }
    // Cloth sway.
    const sway = Math.sin(performance.now() * .006 + this.walkPhase) * .12
    this.scarf.rotation.z = -.2 + sway
    this.scarf.rotation.x = .18 + Math.sin(performance.now() * .004) * .06
    this.waistTail.rotation.z = .12 + sway * .7
    if (this.bandTail) this.bandTail.rotation.z = .18 + Math.sin(performance.now() * .009) * .18
    if (this.hairTail) this.hairTail.rotation.z = .28 + Math.sin(performance.now() * .004) * .08
    // Shadow follows jump height.
    this.shadow.position.y = .016 - this.y
    const sh = clamp(1 - this.y * .22, .45, 1)
    this.shadow.scale.set(sh, sh, 1)
    this.shadow.material.opacity = .5 * sh
    // Root transform.
    this.root.position.x = this.x
    this.root.position.y = this.y
    this.root.rotation.y = this.facing > 0 ? 0 : Math.PI
  }

  setState(state, duration = 0) {
    this.state = state
    this.stateTime = 0
    this.stateDuration = duration
  }

  reset(x, facing, health = 100) {
    this.x = x
    this.homeX = x
    this.y = 0
    this.vy = 0
    this.vx = 0
    this.facing = facing
    this.health = health
    this.energy = Math.max(this.energy, 25)
    this.guard = 100
    this.grounded = true
    this.state = 'idle'
    this.stateTime = 0
    this.attack = null
    this.hitStun = 0
    this.blocking = false
    this.invulnerable = false
    this.flash = 0
    this.aura = 0
    this.koTimer = 0
    this.root.rotation.set(0, facing > 0 ? 0 : Math.PI, 0)
    this.root.position.set(x, 0, 0)
  }

  get forward() {
    return this.facing > 0 ? 1 : -1
  }
}
