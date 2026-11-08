import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Arena } from './arena.js'
import { FX } from './fx.js'
import { Fighter, FIGHTERS } from './fighter.js'
import { UI } from './ui.js'
import { SoundEngine } from './audio.js'

const ui = new UI()
const sound = new SoundEngine()
const canvas = document.getElementById('stage')

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  alpha: false,
})
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760
const maxDpr = isMobile ? 1.35 : 1.5
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr))
renderer.setSize(innerWidth, innerHeight, false)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, .1, 160)
camera.position.set(0, 3.1, 10.8)

const pmrem = new THREE.PMREMGenerator(renderer)
const envTex = pmrem.fromScene(new RoomEnvironment(), .04).texture
scene.environment = envTex
scene.environmentIntensity = .28
pmrem.dispose()

const arena = new Arena(scene, renderer)
const fx = new FX(scene, camera)

const player = new Fighter(FIGHTERS.kaze, { x: -2.35, facing: 1, isPlayer: true })
const enemy = new Fighter(FIGHTERS.shogun, { x: 2.35, facing: -1 })
scene.add(player.root, enemy.root)

// Cinematic rim cards floating behind the fighters.
const cardGroup = new THREE.Group()
scene.add(cardGroup)
function makeGlowCard(color, x) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.8), mat)
  mesh.position.set(x, 3.3, -8.5)
  mesh.rotation.z = -.12
  cardGroup.add(mesh)
  return mesh
}
const menuCards = [makeGlowCard(0x28d8ff, -4.2), makeGlowCard(0xff3b24, 4.2)]

// Post-processing: restrained bloom for the neon and chi effects.
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .62, .55, .78)
bloom.resolution.set(Math.max(320, innerWidth * .55), Math.max(200, innerHeight * .55))
composer.addPass(bloom)
composer.addPass(new OutputPass())

const MOVES = {
  punch: { kind: 'punch', startup: .095, active: .09, recovery: .18, damage: 5.4, range: 1.34, push: .18, gain: 6, label: 'STRIKE' },
  kick: { kind: 'kick', startup: .16, active: .11, recovery: .29, damage: 8.6, range: 1.72, push: .34, gain: 9, label: 'KICK' },
  palm: { kind: 'palm', startup: .32, active: .05, recovery: .47, damage: 11.5, cost: 25, range: 9, push: .45, gain: 8, special: true },
  rush: { kind: 'rush', startup: .12, active: .28, recovery: .38, damage: 15.5, cost: 40, range: 2.1, push: .6, gain: 11, special: true, dash: 7.6 },
  storm: { kind: 'storm', startup: .43, active: .24, recovery: .56, damage: 23, cost: 60, range: 1.9, push: .8, gain: 14, special: true, ultimate: true },
}

const game = {
  mode: 'menu',
  previousMode: 'fight',
  round: 1,
  wins: [0, 0],
  timer: 99,
  introTime: 0,
  introStage: 0,
  roundEndTimer: 0,
  resultTimer: 0,
  paused: false,
  hitstop: 0,
  slowmo: 0,
  shake: 0,
  shakeDecay: 0,
  time: 0,
  menuTime: 0,
  menuDemo: 3.2,
  combo: 0,
  comboTimer: 0,
  maxCombo: 0,
  chiBurned: 0,
  lastHitter: null,
  matchWinner: null,
  demoShot: 0,
}

const keys = Object.create(null)
const playerInput = { move: 0, block: false }
const ai = {
  think: .4,
  intent: 0,
  blockTimer: 0,
  cooldown: .7,
  specialTimer: 2.4,
  jumpTimer: 0,
}

function resetArenaCards() {
  menuCards.forEach((c, i) => { c.material.opacity = .16; c.position.x = i ? 4.2 : -4.2 })
}

function startMatch() {
  game.round = 1
  game.wins = [0, 0]
  game.combo = 0
  game.maxCombo = 0
  game.chiBurned = 0
  game.lastHitter = null
  game.matchWinner = null
  player.wins = 0
  enemy.wins = 0
  ui.hideResult()
  ui.setWins(game.wins)
  ui.showGame()
  startRound()
}

function startRound() {
  game.mode = 'intro'
  game.introTime = 0
  game.introStage = 0
  game.timer = 99
  game.hitstop = 0
  game.slowmo = 0
  game.combo = 0
  game.comboTimer = 0
  game.lastHitter = null
  game.roundEndTimer = 0
  ui.hideCombo()
  ui.setRound(game.round)
  ui.setTimer(game.timer)
  ui.setHealth('player', 100)
  ui.setHealth('enemy', 100)
  ui.lag = { player: 100, enemy: 100 }
  ui.setEnergy('player', 34)
  ui.setEnergy('enemy', 34)
  ui.setGuard(100)
  ui.setWins(game.wins)
  player.reset(-2.35, 1, 100)
  enemy.reset(2.35, -1, 100)
  player.energy = 34
  enemy.energy = 34
  ai.think = .55
  ai.cooldown = .45
  ai.blockTimer = 0
  ai.intent = 0
  ai.specialTimer = 2.6
  fx.clearProjectiles()
  ui.announce(`ROUND ${game.round}`, game.round === 3 ? 'FINAL ROUND' : 'FIGHT WITH HONOR', '')
  sound.bell()
  camera.position.set(-3.6, 3.8, 12.5)
}

function beginFight() {
  if (game.mode !== 'intro') return
  game.mode = 'fight'
  ui.announce('FIGHT!', '', 'special')
  sound.bell()
}

function triggerAttack(fighter, kind) {
  const move = MOVES[kind]
  if (!move || fighter.state === 'ko' || fighter.state === 'hit' || fighter.state === 'victory') return false
  if (['attack'].includes(fighter.state)) return false
  if (move.cost && fighter.energy < move.cost) {
    if (fighter === player) {
      ui.specialDenied(kind)
      sound.uiClick()
    }
    return false
  }
  if (fighter.hitStun > 0) return false
  fighter.blocking = false
  fighter.attack = { ...move, t: 0, fired: false, hit: false, announced: false }
  fighter.setState('attack', move.startup + move.active + move.recovery)
  if (move.cost) {
    fighter.energy -= move.cost
    if (fighter === player) {
      game.chiBurned += move.cost
      ui.setEnergy('player', fighter.energy)
      ui.specialActive(kind, 380)
    } else {
      ui.setEnergy('enemy', fighter.energy)
    }
    sound.charge(kind === 'storm' ? .7 : .35, kind === 'storm' ? 110 : 180)
    if (kind === 'storm') ui.flash('lightning')
  }
  if (kind === 'punch' || kind === 'kick') sound.whoosh(fighter === player ? -.3 : .3)
  return true
}

function doJump(fighter) {
  if (!fighter.grounded || fighter.state === 'ko' || fighter.state === 'attack' || fighter.state === 'hit') return
  fighter.vy = 6.4
  fighter.grounded = false
  fighter.y = .02
  sound.whoosh(fighter === player ? -.4 : .4)
}

function startMenu() {
  sound.resume()
  ui.hideBoot()
  startMatch()
}

// ── Input ─────────────────────────────────────────────────────────
function handleKey(code, down, repeat = false) {
  keys[code] = down
  if (!down) {
    if (code === 'KeyS') playerInput.block = false
    return
  }
  if (repeat) return
  if (code === 'Escape' || code === 'KeyP') {
    if (game.mode === 'menu' || game.mode === 'matchEnd') return
    togglePause()
    return
  }
  if (game.mode === 'menu') {
    if (code === 'Enter' || code === 'Space') startMenu()
    return
  }
  if (game.mode !== 'fight') return
  if (code === 'KeyW' || code === 'Space' || code === 'ShiftLeft') doJump(player)
  if (code === 'KeyJ') triggerAttack(player, 'punch')
  if (code === 'KeyK') triggerAttack(player, 'kick')
  if (code === 'KeyQ') triggerAttack(player, 'palm')
  if (code === 'KeyE') triggerAttack(player, 'rush')
  if (code === 'KeyR') triggerAttack(player, 'storm')
}

addEventListener('keydown', e => {
  const blocked = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)
  if (blocked) e.preventDefault()
  handleKey(e.code, true, e.repeat)
})
addEventListener('keyup', e => handleKey(e.code, false))

function togglePause() {
  if (['menu', 'matchEnd'].includes(game.mode)) return
  if (!game.paused) {
    game.previousMode = game.mode
    game.paused = true
    game.mode = 'paused'
    ui.setPaused(true)
    sound.uiClick()
  } else {
    game.paused = false
    game.mode = game.previousMode
    ui.setPaused(false)
    sound.uiClick()
  }
}

document.getElementById('startBtn').addEventListener('click', startMenu)
document.getElementById('soundBtn').addEventListener('click', e => {
  const on = e.currentTarget.classList.toggle('is-muted') === false
  sound.setEnabled(on)
  e.currentTarget.setAttribute('aria-pressed', String(on))
  sound.resume()
})
document.getElementById('pauseBtn').addEventListener('click', togglePause)
document.getElementById('resumeBtn').addEventListener('click', togglePause)
document.getElementById('restartBtn').addEventListener('click', () => {
  game.paused = false
  game.mode = 'fight'
  ui.setPaused(false)
  startMatch()
})
document.getElementById('quitBtn').addEventListener('click', () => {
  game.paused = false
  game.mode = 'menu'
  ui.setPaused(false)
  ui.showMenu()
  resetFightersForMenu()
})
document.getElementById('rematchBtn').addEventListener('click', () => {
  sound.uiClick()
  startMatch()
})
document.getElementById('titleBtn').addEventListener('click', () => {
  game.mode = 'menu'
  ui.showMenu()
  resetFightersForMenu()
})
document.getElementById('pauseOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) togglePause()
})

function resetFightersForMenu() {
  player.reset(-2.35, 1, 100)
  enemy.reset(2.35, -1, 100)
  player.state = 'idle'
  enemy.state = 'idle'
  fx.clearProjectiles()
  game.combo = 0
  ui.hideCombo()
  ui.showMenu()
}

// Touch controls.
for (const btn of document.querySelectorAll('[data-key]')) {
  const code = btn.dataset.key
  const press = e => {
    e.preventDefault()
    btn.classList.add('is-down')
    handleKey(code, true)
  }
  const release = e => {
    e.preventDefault()
    btn.classList.remove('is-down')
    handleKey(code, false)
  }
  btn.addEventListener('pointerdown', press)
  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('pointerleave', e => { if (e.buttons) release(e) })
  btn.addEventListener('contextmenu', e => e.preventDefault())
}

addEventListener('blur', () => {
  for (const k of Object.keys(keys)) keys[k] = false
  playerInput.block = false
  if (game.mode === 'fight') {
    game.previousMode = game.mode
    game.paused = true
    game.mode = 'paused'
    ui.setPaused(true)
  }
})

// ── Simulation ────────────────────────────────────────────────────
function rectDistance(a, b) {
  return Math.abs(a.x - b.x)
}

function updateControls(dt) {
  if (game.mode !== 'fight') {
    playerInput.move = 0
    playerInput.block = false
    return
  }
  const left = keys['KeyA'] || keys['ArrowLeft']
  const right = keys['KeyD'] || keys['ArrowRight']
  playerInput.move = (right ? 1 : 0) - (left ? 1 : 0)
  playerInput.block = Boolean(keys['KeyS'] || keys['ArrowDown'])
}

function updateFighter(f, dt, opponent) {
  if (f.state === 'ko') {
    f.koTimer += dt
    if (!f.grounded) {
      f.vy -= 15 * dt
      f.y = Math.max(0, f.y + f.vy * dt)
      if (f.y <= 0) { f.y = 0; f.vy = 0; f.grounded = true }
    }
  }
  f.stateTime += dt
  f.hitStun = Math.max(0, f.hitStun - dt)

  // Attack progression.
  if (f.state === 'attack' && f.attack) {
    const a = f.attack
    const t = f.stateTime
    const total = a.startup + a.active + a.recovery
    if (a.kind === 'rush' && t > a.startup * .65 && t < a.startup + a.active) {
      const envelope = Math.sin(Math.min(1, (t - a.startup * .65) / (a.active + a.startup * .35)) * Math.PI)
      f.x += f.forward * a.dash * envelope * dt
      f.vx = f.forward * a.dash * envelope
      if (Math.random() < .35) fx.burst(new THREE.Vector3(f.x - f.forward * .5, 1.0, .1), f.config.glow, { count: 2, speed: 1.5, size: .08, life: .3, gravity: 1 })
    }
    if (a.kind === 'palm' && !a.fired && t >= a.startup * .82) {
      a.fired = true
      fx.spawnProjectile(f, 1)
      fx.burst(new THREE.Vector3(f.x + f.forward * .8, 1.12, .1), f.config.glow, { count: 22, speed: 4.5, size: .16, life: .5, gravity: 1 })
      sound.zap()
      game.shake = Math.max(game.shake, .14)
    }
    if (a.kind === 'storm' && !a.announced && t >= a.startup * .7) {
      a.announced = true
      ui.announce("HEAVEN'S WRATH", f.isPlayer ? 'THE STORM BREAKS' : 'SHOGUN UNLEASHES THE TEMPEST', 'special')
      sound.charge(1.0, 70)
      game.shake = Math.max(game.shake, .28)
      ui.flash('lightning')
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          fx.lightningStrike(opponent.x + (Math.random() - .5) * 1.4, .2 + (Math.random() - .5) * .8, f.config.glow)
        }, i * 95)
      }
    }
    if (t >= total) {
      f.setState('idle')
      f.attack = null
      f.vx *= .5
    }
  } else if (f.state === 'hit' && f.stateTime >= f.stateDuration) {
    f.setState(f.grounded ? 'idle' : 'air')
  } else if (f.state === 'victory' && f.stateTime > 4) {
    // Stay in victory pose.
  }

  // Jump physics.
  if (!f.grounded && f.state !== 'ko') {
    f.vy -= 17.5 * dt
    f.y += f.vy * dt
    if (f.y <= 0) {
      f.y = 0
      f.vy = 0
      f.grounded = true
      if (f.state === 'air') f.setState('idle')
      if (f.state !== 'attack' && f.state !== 'hit') f.setState('idle')
      fx.dust(f.x, .06, f.isPlayer ? 0x5be6ff : 0xff6a4a)
    }
  }

  // Movement.
  const busy = f.state === 'attack' || f.state === 'hit' || f.state === 'ko' || f.state === 'victory'
  f.blocking = false
  if (game.mode === 'fight' && !busy) {
    let move = 0
    let blocking = false
    if (f.isPlayer) {
      move = playerInput.move
      blocking = playerInput.block && f.grounded
    } else {
      move = ai.intent
      blocking = ai.blockTimer > 0 && f.grounded
    }
    f.moveDir = move
    f.blocking = blocking
    if (blocking) {
      f.state = 'idle'
      f.x += move * 1.15 * dt
    } else if (move !== 0) {
      const towards = Math.sign(opponent.x - f.x) * move > 0
      f.x += move * (towards ? 3.55 : 2.85) * dt
      f.state = f.grounded ? 'walk' : 'air'
    } else {
      if (f.grounded) f.state = 'idle'
      else f.state = 'air'
    }
    // Guard regeneration.
    if (!blocking) f.guard = Math.min(100, f.guard + 15 * dt)
  } else if (f.state !== 'attack' && f.state !== 'hit' && f.state !== 'ko' && f.state !== 'victory' && f.state !== 'air') {
    f.moveDir = 0
    f.state = 'idle'
    f.guard = Math.min(100, f.guard + 8 * dt)
  }
  if (f.state === 'attack') f.moveDir = 0

  // Energy always builds slowly (except during KO screen where it makes no difference).
  if (game.mode === 'fight') {
    f.energy = Math.min(f.maxEnergy, f.energy + (f.isPlayer ? 5.2 : 4.6) * dt)
  }

  // Facing.
  if (!busy && game.mode !== 'menu') {
    f.facing = opponent.x >= f.x ? 1 : -1
  }
  // Keep the duel inside the ring.
  f.x = Math.max(-5.9, Math.min(5.9, f.x))
}

function resolveSpacing() {
  const min = .82
  const delta = enemy.x - player.x
  if (Math.abs(delta) < min) {
    const push = (min - Math.abs(delta)) * .5
    const s = delta >= 0 ? 1 : -1
    player.x -= push * s
    enemy.x += push * s
  }
  if (Math.abs(player.x) > 5.92) player.x = Math.sign(player.x) * 5.92
  if (Math.abs(enemy.x) > 5.92) enemy.x = Math.sign(enemy.x) * 5.92
}

function activePhase(f, a) {
  return f.stateTime >= a.startup && f.stateTime <= a.startup + a.active
}

function checkAttackHit(attacker, defender) {
  if (attacker.state !== 'attack' || !attacker.attack) return
  const a = attacker.attack
  if (a.hit || !activePhase(attacker, a)) return
  if (a.kind === 'palm') return
  const d = rectDistance(attacker, defender)
  const range = a.kind === 'rush' ? 1.85 : a.range
  const vertical = Math.abs(attacker.y - defender.y)
  if (d <= range && vertical < 1.5) {
    a.hit = true
    applyHit(attacker, defender, a)
  }
}

function applyHit(attacker, defender, move, projectile = false) {
  if (defender.state === 'ko' || defender.invulnerable) return
  const blocked = defender.blocking && defender.grounded && defender.guard > 0 && !move.ultimate
  const hitPos = new THREE.Vector3(
    defender.x - defender.forward * .18,
    defender.y + 1.25,
    .32
  )
  const color = attacker.config.glow
  const damageScale = 1 - Math.min(.34, Math.max(0, attacker.comboHits - 1) * .035)
  let damage = move.damage * damageScale

  if (blocked) {
    defender.guard = Math.max(0, defender.guard - move.damage * 2.2)
    defender.hitStun = Math.max(defender.hitStun, .12)
    defender.x += attacker.forward * (move.push || .2) * .38
    damage *= .1
    defender.health = Math.max(0, defender.health - damage)
    attacker.energy = Math.min(100, attacker.energy + (move.gain || 5) * .5)
    fx.impact(hitPos, 0x8ceaff, .8, true)
    sound.block()
    sound.hit(.45, true)
    game.shake = Math.max(game.shake, .1)
    game.hitstop = Math.max(game.hitstop, .035)
    ui.setHealth(defender.isPlayer ? 'player' : 'enemy', defender.health)
    ui.damageAt(hitPos, camera, 'BLOCK', false)
    if (defender.guard <= 0) {
      defender.blocking = false
      defender.hitStun = .62
      defender.setState('hit', .62)
      ui.announce('GUARD BREAK', 'DEFENSE SHATTERED', '')
      game.shake = Math.max(game.shake, .3)
      sound.hit(1.2)
    }
    return
  }

  const isUltimate = Boolean(move.ultimate)
  attacker.comboHits = (game.time - attacker.lastHitAt < 1.15) ? attacker.comboHits + 1 : 1
  attacker.lastHitAt = game.time
  attacker.health = attacker.health
  attacker.energy = Math.min(100, attacker.energy + (move.gain || 5))
  defender.energy = Math.min(100, defender.energy + (move.gain || 5) * .55)
  defender.health = Math.max(0, defender.health - damage)
  defender.flash = .16
  defender.hitStun = .22 + damage * .014
  defender.setState('hit', defender.hitStun)
  defender.x += attacker.forward * (move.push || .24)
  if (isUltimate) {
    defender.grounded = false
    defender.vy = 5.4
    defender.y = .08
    defender.setState('hit', .7)
    game.slowmo = Math.max(game.slowmo, .55)
  }
  game.hitstop = Math.max(game.hitstop, isUltimate ? .11 : .055)
  game.shake = Math.max(game.shake, isUltimate ? .55 : .16 + damage * .007)
  sound.hit(isUltimate ? 1.7 : .8 + damage * .04)
  fx.impact(hitPos, isUltimate ? 0xffe0a0 : color, isUltimate ? 1.8 : 1, false)
  fx.slash(hitPos, isUltimate ? 0xffe0a0 : color, Math.random() * Math.PI)
  if (isUltimate) {
    fx.groundWave(defender.x, .15, 0xffc86b, 1.4)
    ui.flash('lightning')
    arena.strikeLightning(1)
  } else {
    ui.flash('impact')
  }
  ui.setHealth(defender.isPlayer ? 'player' : 'enemy', defender.health)
  ui.damageAt(hitPos, camera, Math.round(damage), isUltimate || attacker.comboHits >= 4)
  if (attacker.comboHits >= 2) ui.combo(attacker.comboHits)
  if (attacker.isPlayer) {
    game.combo = attacker.comboHits
    game.maxCombo = Math.max(game.maxCombo, attacker.comboHits)
  }
  game.lastHitter = attacker
  if (attacker.isPlayer) ui.setEnergy('player', attacker.energy)
  else ui.setEnergy('enemy', attacker.energy)
  if (defender.health <= 0) endRound(attacker, 'ko')
}

function handleProjectiles(dt) {
  for (let i = fx.projectiles.length - 1; i >= 0; i--) {
    const p = fx.projectiles[i]
    if (p.hit) continue
    const target = p.owner === player ? enemy : player
    const pos = p.group.position
    const d = Math.abs(pos.x - target.x)
    if (d < .58 + p.radius && Math.abs(pos.y - (target.y + 1.1)) < 1.25 && target.state !== 'ko') {
      p.hit = true
      applyHit(p.owner, target, MOVES.palm, true)
      fx.despawnProjectile(p)
      fx.projectiles.splice(i, 1)
      continue
    }
    // Projectiles clash in the middle.
    const other = fx.projectiles.find(o => o !== p && o.owner !== p.owner && !o.hit && Math.abs(o.group.position.x - pos.x) < .55)
    if (other) {
      p.hit = true
      other.hit = true
      const mid = p.group.position.clone().add(other.group.position).multiplyScalar(.5)
      fx.impact(mid, 0xffffff, 1.7)
      sound.zap()
      game.shake = Math.max(game.shake, .25)
      fx.despawnProjectile(p)
      fx.despawnProjectile(other)
    }
  }
}

function updateAI(dt) {
  if (game.mode !== 'fight') return
  if (enemy.state === 'ko' || enemy.state === 'victory' || enemy.state === 'attack' || enemy.state === 'hit') {
    if (enemy.state !== 'attack') ai.intent = 0
    return
  }
  ai.think -= dt
  ai.cooldown = Math.max(0, ai.cooldown - dt)
  ai.specialTimer = Math.max(0, ai.specialTimer - dt)
  ai.blockTimer = Math.max(0, ai.blockTimer - dt)
  const dist = Math.abs(player.x - enemy.x)
  const dir = Math.sign(player.x - enemy.x) || 1

  // React to incoming projectiles.
  for (const p of fx.projectiles) {
    if (p.owner === player && !p.hit && Math.sign(enemy.x - p.group.position.x) === Math.sign(p.dir)) {
      const closing = Math.abs(enemy.x - p.group.position.x)
      if (closing < 4 && closing > .8) {
        if (Math.random() < .5) ai.blockTimer = .45
        else if (Math.random() < .35 && enemy.grounded) {
          doJump(enemy)
          ai.intent = dir
        }
        ai.think = .2
        return
      }
    }
  }

  // Don't be rude — the AI also has to breathe.
  if (ai.think > 0) {
    if (dist > 3.6) ai.intent = dir
    else if (dist < 1.2) ai.intent = -dir * .6
    else ai.intent = 0
    return
  }

  // Block when the player starts an attack in range.
  if (player.state === 'attack' && dist < 2.2 && Math.random() < .38) {
    ai.blockTimer = .4
    ai.think = .22
    ai.intent = 0
    return
  }

  if (dist > 4.4) {
    ai.intent = dir
    if (enemy.energy >= 25 && ai.specialTimer <= 0 && Math.random() < .52) {
      triggerAttack(enemy, 'palm')
      ai.specialTimer = 2.7
      ai.think = .55
      return
    }
  } else if (dist > 2.5) {
    ai.intent = dir
    if (enemy.energy >= 40 && ai.specialTimer <= 0 && Math.random() < .45) {
      triggerAttack(enemy, 'rush')
      ai.specialTimer = 2.9
      ai.think = .5
      return
    } else if (enemy.energy >= 25 && ai.specialTimer <= 0 && Math.random() < .22) {
      triggerAttack(enemy, 'palm')
      ai.specialTimer = 2.6
      ai.think = .5
      return
    } else if (dist < 2.05 && ai.cooldown <= 0) {
      triggerAttack(enemy, Math.random() < .5 ? 'punch' : 'kick')
      ai.cooldown = Math.random() * .35 + .35
      ai.think = .2
      return
    }
  } else {
    // Close range pressure: strike, guard, or step back.
    const r = Math.random()
    if (enemy.energy >= 60 && ai.specialTimer <= 0 && r < .45) {
      triggerAttack(enemy, 'storm')
      ai.specialTimer = 4.8
      ai.think = .7
      return
    } else if (player.state === 'attack' && r < .32) {
      ai.blockTimer = .38
      ai.intent = 0
      ai.think = .2
      return
    } else if (ai.cooldown <= 0 && r < .8) {
      triggerAttack(enemy, Math.random() < .57 ? 'punch' : 'kick')
      ai.cooldown = Math.random() * .45 + .28
      ai.think = .2
      return
    } else if (r < .9) {
      ai.intent = -dir
      ai.think = .18
      return
    }
  }

  if (dist < 1.9) {
    ai.intent = Math.random() < .3 ? -dir : 0
    ai.think = .12
  } else if (dist > 3.2) {
    ai.intent = dir
    ai.think = .18
  } else {
    ai.intent = 0
    ai.think = .16
  }
}

function updateMenu(dt) {
  game.menuTime += dt
  game.menuDemo -= dt
  // Shadowboxing behind the title: keeps the arena alive without simulating a match.
  if (game.menuDemo <= 0) {
    const f = Math.random() < .5 ? player : enemy
    if (f.state === 'idle' && f.grounded) {
      triggerAttack(f, Math.random() < .55 ? 'punch' : 'kick')
    }
    game.menuDemo = 1.4 + Math.random() * 2.3
  }
  const t = game.menuTime
  player.facing = 1
  enemy.facing = -1
  player.x = -2.15 + Math.sin(t * .3) * .06
  enemy.x = 2.15 + Math.cos(t * .27) * .06
  // Glyph cards breathe.
  menuCards.forEach((c, i) => {
    c.material.opacity = .1 + (Math.sin(t * .6 + i) * .5 + .5) * .11
    c.position.y = 3.1 + Math.sin(t * .5 + i * 2) * .18
  })
}

function updateComboTimer(dt) {
  if (game.comboTimer > 0) {
    game.comboTimer -= dt
    if (game.comboTimer <= 0) {
      player.comboHits = 0
      enemy.comboHits = 0
      game.combo = 0
    }
  }
}

function endRound(winner, reason = 'ko') {
  if (game.mode !== 'fight') return
  game.mode = 'roundEnd'
  game.roundEndTimer = 0
  game.slowmo = .75
  game.hitstop = Math.max(game.hitstop, .13)
  const loser = winner === player ? enemy : player
  if (winner) {
    winner.setState('victory')
    game.wins[winner === player ? 0 : 1]++
    ui.setWins(game.wins)
  }
  if (loser) {
    loser.setState('ko')
    loser.koTimer = 0
    loser.blocking = false
    loser.attack = null
    loser.vy = Math.max(loser.vy, 2.8)
    loser.grounded = false
    fx.groundWave(loser.x, .2, winner?.config.glow ?? 0xffc86b, 1.5)
  }
  const label = reason === 'time' ? 'TIME UP' : 'K.O.'
  ui.announce(label, winner ? `${winner.config.name} TAKES THE ROUND` : 'DOUBLE KNOCKOUT', 'ko')
  sound.ko()
  ui.flash('lightning')
  arena.strikeLightning(1)
  if (game.wins[0] >= 2 || game.wins[1] >= 2) {
    // The final round continues to breathe for a beat before the result panel.
    setTimeout(() => {
      if (game.mode === 'roundEnd') finishMatch()
    }, 2600)
  }
}

function finishMatch() {
  const won = game.wins[0] > game.wins[1]
  game.mode = 'matchEnd'
  game.matchWinner = won ? player : enemy
  player.setState(won ? 'victory' : 'ko')
  enemy.setState(won ? 'ko' : 'victory')
  if (!won) game.wins[1] = Math.max(game.wins[1], 2)
  else game.wins[0] = Math.max(game.wins[0], 2)
  ui.setWins(game.wins)
  ui.showResult({ won, rounds: game.wins, maxCombo: game.maxCombo, chi: game.chiBurned })
  fx.clearProjectiles()
  sound.bell()
}

function updateRoundEnd(dt) {
  if (game.mode !== 'roundEnd') return
  game.roundEndTimer += dt
  if (game.roundEndTimer > 3.2) {
    if (game.wins[0] >= 2 || game.wins[1] >= 2) {
      finishMatch()
    } else {
      game.round++
      startRound()
    }
  }
}

function updateIntro(dt) {
  if (game.mode !== 'intro') return
  game.introTime += dt
  if (game.introStage === 0 && game.introTime > 1.15) {
    game.introStage = 1
    ui.announce('FIGHT!', '', 'special')
    sound.bell()
  }
  if (game.introTime > 1.52) {
    game.mode = 'fight'
    game.introTime = 0
  }
}

// ── Camera direction ──────────────────────────────────────────────
const targetCam = new THREE.Vector3(0, 3.2, 11)
const targetLook = new THREE.Vector3(0, 1.4, 0)
const currentLook = new THREE.Vector3(0, 1.4, 0)

function updateCamera(dt) {
  const aspect = camera.aspect
  let fov = 44
  let desired
  let look
  if (game.mode === 'menu' || game.mode === 'paused' && game.previousMode === 'menu') {
    fov = aspect < .8 ? 54 : 44
    const t = game.menuTime
    desired = new THREE.Vector3(1.4 + Math.sin(t * .17) * .8, 3.15 + Math.sin(t * .33) * .16, 11.1)
    look = new THREE.Vector3(.55, 1.55 + Math.sin(t * .24) * .05, 0)
  } else {
    const mid = (player.x + enemy.x) * .5
    const sep = Math.abs(player.x - enemy.x)
    fov = aspect < .75 ? 60 : aspect < 1.1 ? 52 : 44
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) * .5) * aspect)
    let wantedWidth = sep + (aspect < .8 ? 3.3 : 4.2)
    let fit = wantedWidth / (2 * Math.tan(hFov * .5))
    let z = Math.max(9.3 + Math.max(0, sep - 2.4) * .13, fit * .94)
    let y = aspect < .8 ? 3.5 : 2.85
    let camX = mid + (aspect < .8 ? .8 : 1.05) + Math.sin(game.time * .4) * .03
    let lookY = 1.3 + Math.max(0, (player.y + enemy.y) * .12)
    if (game.mode === 'roundEnd' || game.mode === 'matchEnd') {
      const fallen = player.state === 'ko' ? player : enemy.state === 'ko' ? enemy : player.health < enemy.health ? player : enemy
      look = new THREE.Vector3(fallen.x * .82, 1.08, 0)
      z *= .8
      y = 2.25
      camX = fallen.x * .72 + 1.1
    } else {
      look = new THREE.Vector3(mid * .84, lookY, 0)
    }
    desired = new THREE.Vector3(camX, y, z)
  }
  if (Math.abs(camera.fov - fov) > .01) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
  const smooth = 1 - Math.exp(-3.2 * dt)
  targetCam.lerp(desired, smooth)
  targetLook.lerp(look, 1 - Math.exp(-4.2 * dt))
  currentLook.lerp(targetLook, smooth)
  camera.position.copy(targetCam)
  const shake = game.shake
  if (shake > .001) {
    camera.position.x += (Math.random() - .5) * shake
    camera.position.y += (Math.random() - .5) * shake * .65
    camera.position.z += (Math.random() - .5) * shake * .35
  }
  camera.position.y += Math.sin(game.time * 1.7) * .008
  camera.lookAt(currentLook.x + (Math.random() - .5) * shake * .2, currentLook.y + (Math.random() - .5) * shake * .15, currentLook.z)
  game.shake *= Math.exp(-7.5 * dt)
  if (game.shake < .0015) game.shake = 0
}

// ── UI sync ───────────────────────────────────────────────────────
let lastEnergy = [-1, -1]
let lastTimer = -1
function syncHUD() {
  const p = Math.round(player.energy)
  const e = Math.round(enemy.energy)
  if (p !== lastEnergy[0]) { ui.setEnergy('player', player.energy); lastEnergy[0] = p }
  if (e !== lastEnergy[1]) { ui.setEnergy('enemy', enemy.energy); lastEnergy[1] = e }
  if (Math.ceil(game.timer) !== lastTimer) { ui.setTimer(game.timer); lastTimer = Math.ceil(game.timer) }
  ui.setGuard(player.guard)
  ui.setLag({ player: player.health, enemy: enemy.health })
}

function simulate(dt) {
  updateIntro(dt)
  updateControls(dt)
  updateAI(dt)
  if (game.mode === 'fight') {
    game.timer -= dt
    if (game.timer <= 0) {
      game.timer = 0
      const diff = player.health - enemy.health
      const winner = diff > 0 ? player : diff < 0 ? enemy : null
      endRound(winner, 'time')
    }
  }
  updateFighter(player, dt, enemy)
  updateFighter(enemy, dt, player)
  resolveSpacing()
  if (game.mode === 'fight') {
    checkAttackHit(player, enemy)
    checkAttackHit(enemy, player)
  }
  handleProjectiles(dt)
  updateRoundEnd(dt)
  updateComboTimer(dt)
  // Animate real-time skeleton.
  player.updateAnimation(dt, game.time)
  enemy.updateAnimation(dt, game.time)
  player.applyPose(dt)
  enemy.applyPose(dt)
}

// ── Main loop ─────────────────────────────────────────────────────
const clock = new THREE.Clock()
let elapsed = 0

function frame() {
  requestAnimationFrame(frame)
  const raw = Math.min(clock.getDelta(), .05)
  elapsed += raw
  game.time += raw
  const frozen = game.paused
  if (!frozen) {
    if (game.mode === 'menu') {
      updateMenu(raw)
    }
    if (game.hitstop > 0) game.hitstop = Math.max(0, game.hitstop - raw)
    if (game.slowmo > 0) game.slowmo = Math.max(0, game.slowmo - raw)
    const speed = game.hitstop > 0 ? .045 : game.slowmo > 0 ? .33 : 1
    const dt = raw * speed
    if (game.mode === 'paused') {
      // Paused frames still animate the idle timer and camera below.
    } else {
      simulate(dt)
      fx.update(dt, game.time)
    }
    arena.update(raw, game.time, camera)
    if (game.mode !== 'paused') syncHUD()
  }
  updateCamera(frozen ? 0 : raw)
  composer.render()
}

addEventListener('resize', () => {
  const w = innerWidth, h = innerHeight
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr))
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  bloom.resolution.set(Math.max(320, w * .55), Math.max(200, h * .55))
  ui.touchMode = matchMedia('(pointer: coarse)').matches || w < 760
  ui.el.touch.classList.toggle('is-hidden', !ui.touchMode || ui.el.hud.classList.contains('is-hidden'))
  if (ui.touchMode && game.mode !== 'menu') ui.el.touch.classList.remove('is-hidden')
})

// Pause when the tab loses focus, but don't interrupt the title screen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'fight') togglePause()
})

// Build the scene and render the first frame behind the boot card.
player.updateAnimation(0, 0)
enemy.updateAnimation(0, 0)
player.applyPose(1)
enemy.applyPose(1)
updateCamera(1)
renderer.compile(scene, camera)
ui.hideBoot()
console.info('NEON FIST ready — arena, fighters, three special arts.')
frame()

// Keep the title screen tidy on first load.
ui.showMenu()
