const $ = (id) => document.getElementById(id)

const SPECIAL_COSTS = { palm: 25, rush: 40, storm: 60 }

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'), menu: $('menu'), pause: $('pauseOverlay'), result: $('resultOverlay'),
      playerHealth: $('playerHealth'), playerLag: $('playerLag'),
      enemyHealth: $('enemyHealth'), enemyLag: $('enemyLag'),
      playerMeter: $('playerMeter'), enemyMeter: $('enemyMeter'),
      playerMeterValue: $('playerMeterValue'), enemyMeterValue: $('enemyMeterValue'),
      playerPips: $('playerPips'), enemyPips: $('enemyPips'),
      timer: $('timer'), roundLabel: $('roundLabel'),
      guardFill: $('guardFill'), guardIndicator: $('guardIndicator'),
      announcer: $('announcer'), sub: $('subAnnouncer'), damageLayer: $('damageLayer'),
      combo: $('comboBadge'), comboCount: $('comboCount'),
      touch: $('touchControls'), pauseBtn: $('pauseBtn'), rotate: $('rotateHint'),
      resultTitle: $('resultTitle'), resultSubtitle: $('resultSubtitle'),
      resultEyebrow: $('resultEyebrow'), resultRounds: $('resultRounds'),
      resultCombo: $('resultCombo'), resultChi: $('resultChi'),
      impact: $('impactFlash'), lightning: $('lightningFlash'), boot: $('bootLoader'),
    }
    this.cards = [...document.querySelectorAll('.special-card')]
    this.health = { player: 100, enemy: 100 }
    this.lag = { player: 100, enemy: 100 }
    this.lagTimer = 0
    this.announceTimeout = 0
    this.comboTimeout = 0
    this.touchMode = matchMedia('(pointer: coarse)').matches || innerWidth < 760
    if (this.touchMode) this.el.touch.classList.remove('is-hidden')
    this.el.touch.classList.toggle('is-hidden', !this.touchMode)
  }

  hideBoot() {
    this.el.boot.classList.add('done')
    setTimeout(() => this.el.boot.remove(), 800)
  }

  showMenu() {
    this.el.menu.classList.remove('is-hidden')
    this.el.hud.classList.add('is-hidden')
    this.el.pause.classList.add('is-hidden')
    this.el.result.classList.add('is-hidden')
    this.el.pauseBtn.classList.add('is-hidden')
  }

  showGame() {
    this.el.menu.classList.add('is-hidden')
    this.el.hud.classList.remove('is-hidden')
    this.el.result.classList.add('is-hidden')
    this.el.pauseBtn.classList.remove('is-hidden')
    this.el.pause.classList.add('is-hidden')
    if (this.touchMode) this.el.touch.classList.remove('is-hidden')
  }

  showPause(paused) {
    this.el.pause.classList.toggle('is-hidden', !paused)
  }

  setHealth(side, value) {
    const v = Math.max(0, Math.min(100, value))
    this.health[side] = v
    const fill = side === 'player' ? this.el.playerHealth : this.el.enemyHealth
    fill.style.transform = `scaleX(${v / 100})`
    this.lagTimer = .4
    const shell = fill.closest('.health-shell')
    shell.classList.toggle('critical', v <= 25 && v > 0)
  }

  setLag(values) {
    for (const side of ['player', 'enemy']) {
      const target = Math.max(0, Math.min(100, values[side]))
      this.lag[side] += (target - this.lag[side]) * .04
      const el = side === 'player' ? this.el.playerLag : this.el.enemyLag
      el.style.transform = `scaleX(${this.lag[side] / 100})`
    }
  }

  setEnergy(side, value) {
    const v = Math.max(0, Math.min(100, value))
    const fill = side === 'player' ? this.el.playerMeter : this.el.enemyMeter
    fill.style.transform = `scaleX(${v / 100})`
    const label = side === 'player' ? this.el.playerMeterValue : this.el.enemyMeterValue
    label.textContent = Math.floor(v)
    if (side === 'player') {
      for (const card of this.cards) {
        const cost = SPECIAL_COSTS[card.dataset.move]
        card.classList.toggle('ready', v >= cost)
      }
    }
  }

  setGuard(value) {
    this.el.guardFill.style.width = `${Math.max(0, value)}%`
    this.el.guardIndicator.classList.toggle('danger', value < 35)
  }

  setTimer(value) {
    this.el.timer.textContent = String(Math.max(0, Math.ceil(value))).padStart(2, '0')
    this.el.timer.parentElement.classList.toggle('danger', value <= 10)
  }

  setRound(round) {
    this.el.roundLabel.textContent = `ROUND ${round}`
  }

  setWins(wins) {
    ;[...this.el.playerPips.children].forEach((p, i) => p.classList.toggle('won', i < wins[0]))
    ;[...this.el.enemyPips.children].forEach((p, i) => p.classList.toggle('won', i < wins[1]))
  }

  specialActive(name, ms = 260) {
    const card = this.cards.find(c => c.dataset.move === name)
    if (!card) return
    card.classList.add('active')
    setTimeout(() => card.classList.remove('active'), ms)
  }

  specialDenied(name) {
    const card = this.cards.find(c => c.dataset.move === name)
    if (!card) return
    card.classList.remove('denied')
    void card.offsetWidth
    card.classList.add('denied')
  }

  announce(text, sub = '', kind = '') {
    this.el.announcer.textContent = text
    this.el.announcer.className = `announcer ${kind ? `kind-${kind}` : ''}`
    this.el.sub.textContent = sub
    this.el.sub.className = 'sub-announcer'
    void this.el.announcer.offsetWidth
    this.el.announcer.classList.add('show')
    if (sub) this.el.sub.classList.add('show')
    clearTimeout(this.announceTimeout)
    this.announceTimeout = setTimeout(() => {
      this.el.announcer.classList.remove('show')
      this.el.sub.classList.remove('show')
    }, kind === 'ko' ? 2200 : 1150)
  }

  flash(kind = 'impact') {
    const el = kind === 'lightning' ? this.el.lightning : this.el.impact
    el.classList.remove('fire')
    void el.offsetWidth
    el.classList.add('fire')
  }

  combo(hits) {
    if (hits < 2) {
      this.el.combo.classList.remove('show')
      return
    }
    this.el.comboCount.textContent = hits
    this.el.combo.classList.add('show')
    clearTimeout(this.comboTimeout)
    this.comboTimeout = setTimeout(() => this.el.combo.classList.remove('show'), 1100)
  }

  hideCombo() {
    this.el.combo.classList.remove('show')
  }

  damageAt(world, camera, amount, crit = false) {
    const v = world.clone().project(camera)
    const x = (v.x * .5 + .5) * innerWidth
    const y = (-v.y * .5 + .5) * innerHeight
    const el = document.createElement('div')
    el.className = `damage-number${crit ? ' crit' : ''}`
    el.textContent = amount
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.position = 'absolute'
    this.el.damageLayer.appendChild(el)
    setTimeout(() => el.remove(), 850)
  }

  showResult({ won, rounds, maxCombo, chi }) {
    this.el.result.classList.remove('is-hidden')
    this.el.pauseBtn.classList.add('is-hidden')
    this.el.resultTitle.textContent = won ? 'VICTORY' : 'DEFEAT'
    this.el.resultEyebrow.textContent = won ? 'MATCH COMPLETE · FLAWLESS STORM' : 'MATCH COMPLETE · THE STORM ENDURES'
    this.el.resultSubtitle.textContent = won ? 'The storm bows to the gale.' : 'The crown roof claims another challenger.'
    this.el.resultRounds.textContent = `${rounds[0]} — ${rounds[1]}`
    this.el.resultCombo.textContent = `${maxCombo} HITS`
    this.el.resultChi.textContent = chi
    this.el.result.querySelector('.result-panel').classList.toggle('defeat', !won)
  }

  hideResult() {
    this.el.result.classList.add('is-hidden')
  }

  setPaused(paused) {
    this.el.pause.classList.toggle('is-hidden', !paused)
  }
}
