import * as THREE from 'three'
import './style.css'

type BlockKind = 'grass' | 'soil' | 'stone' | 'sand' | 'wood'
type BlockPosition = { x: number; y: number; z: number }

const blockKinds: BlockKind[] = ['grass', 'soil', 'stone', 'sand', 'wood']
const blockLabels: Record<BlockKind, string> = {
  grass: '草',
  soil: '土',
  stone: '石',
  sand: '砂',
  wood: '木',
}
const world = new Map<string, BlockKind>()
const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`
const parseKey = (key: string): BlockPosition => {
  const [x, y, z] = key.split(',').map(Number)
  return { x, y, z }
}

const canvas = document.querySelector<HTMLCanvasElement>('#world')!
const game = document.querySelector<HTMLElement>('#game')!
const welcome = document.querySelector<HTMLElement>('#welcome')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const pauseIndicator = document.querySelector<HTMLElement>('#pause-indicator')!
const hotbar = document.querySelector<HTMLElement>('#hotbar')!
const coordinates = document.querySelector<HTMLElement>('#coordinates')!
const toast = document.querySelector<HTMLElement>('#toast')!
const saveState = document.querySelector<HTMLElement>('#save-state')!

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1

const scene = new THREE.Scene()
scene.background = new THREE.Color('#b9d9e8')
scene.fog = new THREE.Fog('#b9d9e8', 22, 54)

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 90)
camera.rotation.order = 'YXZ'
scene.add(new THREE.HemisphereLight('#eef8ff', '#71865f', 2.05))
const sunlight = new THREE.DirectionalLight('#fff2d5', 2.6)
sunlight.position.set(-18, 30, 12)
scene.add(sunlight)

const blockGeometry = new THREE.BoxGeometry(1, 1, 1)
const materialColors: Record<BlockKind, string> = {
  grass: '#6f9c59',
  soil: '#9c7049',
  stone: '#899596',
  sand: '#d8bd78',
  wood: '#a86e43',
}
const materials = Object.fromEntries(blockKinds.map((kind) => [
  kind,
  new THREE.MeshLambertMaterial({ color: materialColors[kind] }),
])) as Record<BlockKind, THREE.MeshLambertMaterial>
const blockMeshes = new Map<BlockKind, THREE.InstancedMesh>()
const blockLocations = new Map<BlockKind, BlockPosition[]>()
const instance = new THREE.Object3D()
const target = new THREE.Vector2(0, 0)
const raycaster = new THREE.Raycaster()
raycaster.far = 6

const player = { x: 0, y: 12, z: 0, velocityY: 0, grounded: false }
let yaw = 0
let pitch = 0
let selected = 0
let lastTime = 0
let toastTimer = 0
let saveTimer = 0
let worldSeed = 17

const saved = localStorage.getItem('moneycraft-world-v1')
if (saved) {
  try {
    const data = JSON.parse(saved) as { seed?: number; edits?: [string, BlockKind | null][] }
    if (Number.isInteger(data.seed)) worldSeed = data.seed!
    createTerrain(worldSeed)
    for (const [key, kind] of data.edits ?? []) {
      if (kind === null) world.delete(key)
      else if (blockKinds.includes(kind)) world.set(key, kind)
    }
  } catch {
    createTerrain(worldSeed)
  }
} else {
  createTerrain(worldSeed)
}

if (saved) {
  const feetY = surfaceAt(player.x, player.z) + 1
  player.y = Math.max(player.y, feetY)
} else {
  player.y = surfaceAt(player.x, player.z) + 1
}

function noise(x: number, z: number, seed: number) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

function terrainHeight(x: number, z: number, seed: number) {
  const broad = Math.sin((x + seed) * 0.22) * 1.65 + Math.cos((z - seed) * 0.19) * 1.5
  const detail = noise(Math.floor(x / 2), Math.floor(z / 2), seed) * 0.8
  return Math.max(2, Math.floor(5 + broad + detail))
}

function createTerrain(seed: number) {
  world.clear()
  for (let x = -18; x < 18; x++) {
    for (let z = -18; z < 18; z++) {
      const height = terrainHeight(x, z, seed)
      for (let y = 0; y <= height; y++) {
        const kind: BlockKind = y === height ? 'grass' : y > height - 3 ? 'soil' : 'stone'
        world.set(keyOf(x, y, z), kind)
      }
      if (height < 5 && noise(x, z, seed + 6) > 0.35) {
        world.set(keyOf(x, height, z), 'sand')
      }
    }
  }
  for (let x = -14; x <= 14; x++) {
    for (let z = -14; z <= 14; z++) {
      if (Math.abs(x) < 3 && Math.abs(z) < 3) continue
      if (noise(x, z, seed + 29) > 0.91) {
        const ground = terrainHeight(x, z, seed)
        for (let y = 1; y <= 3; y++) world.set(keyOf(x, ground + y, z), 'wood')
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = 2; dy <= 4; dy++) {
              if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - 3) <= 4) {
                world.set(keyOf(x + dx, ground + dy, z + dz), 'grass')
              }
            }
          }
        }
      }
    }
  }
}

function surfaceAt(x: number, z: number) {
  const blockX = Math.floor(x)
  const blockZ = Math.floor(z)
  for (let y = 40; y >= 0; y--) {
    if (world.has(keyOf(blockX, y, blockZ))) return y
  }
  return 0
}

function rebuildMeshes() {
  for (const mesh of blockMeshes.values()) {
    scene.remove(mesh)
    mesh.dispose()
  }
  blockMeshes.clear()
  blockLocations.clear()

  for (const kind of blockKinds) {
    const positions: BlockPosition[] = []
    for (const [key, blockKind] of world) {
      if (blockKind === kind) positions.push(parseKey(key))
    }
    if (!positions.length) continue
    const mesh = new THREE.InstancedMesh(blockGeometry, materials[kind], positions.length)
    mesh.userData.kind = kind
    mesh.userData.positions = positions
    positions.forEach(({ x, y, z }, index) => {
      instance.position.set(x + 0.5, y + 0.5, z + 0.5)
      instance.updateMatrix()
      mesh.setMatrixAt(index, instance.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    scene.add(mesh)
    blockMeshes.set(kind, mesh)
    blockLocations.set(kind, positions)
  }
}

function makeHotbar() {
  hotbar.replaceChildren()
  blockKinds.forEach((kind, index) => {
    const button = document.createElement('button')
    button.className = 'slot'
    button.type = 'button'
    button.title = `${index + 1}: ${blockLabels[kind]}`
    button.setAttribute('aria-label', `${index + 1}番、${blockLabels[kind]}`)
    button.innerHTML = `<span class="slot-number">${index + 1}</span><span class="block-chip ${kind}"></span><span class="slot-label">${blockLabels[kind]}</span>`
    button.addEventListener('click', () => selectBlock(index))
    hotbar.append(button)
  })
  updateHotbar()
}

function updateHotbar() {
  hotbar.querySelectorAll('.slot').forEach((slot, index) => {
    slot.classList.toggle('selected', index === selected)
    slot.setAttribute('aria-pressed', String(index === selected))
  })
}

function selectBlock(index: number) {
  selected = (index + blockKinds.length) % blockKinds.length
  updateHotbar()
}

function showToast(message: string) {
  toast.textContent = message
  toast.classList.add('visible')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 1200)
}

function saveWorld() {
  const edits: [string, BlockKind | null][] = []
  for (const [key, kind] of world) {
    const { x, y, z } = parseKey(key)
    const height = terrainHeight(x, z, worldSeed)
    const generatedKind = y === height ? 'grass' : y > height - 3 ? 'soil' : 'stone'
    const generated = y >= 0 && y <= height && x >= -18 && x < 18 && z >= -18 && z < 18
      ? generatedKind
      : null
    if (kind !== generated) edits.push([key, kind])
  }
  for (let x = -18; x < 18; x++) {
    for (let z = -18; z < 18; z++) {
      const height = terrainHeight(x, z, worldSeed)
      for (let y = 0; y <= height; y++) {
        const key = keyOf(x, y, z)
        if (!world.has(key)) edits.push([key, null])
      }
    }
  }
  localStorage.setItem('moneycraft-world-v1', JSON.stringify({ seed: worldSeed, edits }))
  saveState.textContent = 'LOCAL WORLD · SAVED'
  saveState.classList.remove('saving')
}

function blockIntersectsPlayer(x: number, y: number, z: number) {
  return x < player.x + 0.3 && x + 1 > player.x - 0.3
    && y < player.y + 1.72 && y + 1 > player.y
    && z < player.z + 0.3 && z + 1 > player.z
}

function collides(x: number, y: number, z: number) {
  for (let blockX = Math.floor(x - 0.3); blockX <= Math.floor(x + 0.3); blockX++) {
    for (let blockY = Math.floor(y); blockY <= Math.floor(y + 1.72); blockY++) {
      for (let blockZ = Math.floor(z - 0.3); blockZ <= Math.floor(z + 0.3); blockZ++) {
        if (world.has(keyOf(blockX, blockY, blockZ))) return true
      }
    }
  }
  return false
}

function getTargetBlock() {
  raycaster.setFromCamera(target, camera)
  const hits = raycaster.intersectObjects([...blockMeshes.values()], false)
  return hits.find((hit) => hit.instanceId !== undefined && hit.face !== null)
}

function interact(place: boolean) {
  const hit = getTargetBlock()
  if (!hit || hit.instanceId === undefined || !hit.face) return
  const kind = hit.object.userData.kind as BlockKind
  const positions = blockLocations.get(kind)
  const block = positions?.[hit.instanceId]
  if (!block) return

  if (place) {
    const x = block.x + Math.round(hit.face.normal.x)
    const y = block.y + Math.round(hit.face.normal.y)
    const z = block.z + Math.round(hit.face.normal.z)
    if (y < 0 || y > 40 || world.has(keyOf(x, y, z)) || blockIntersectsPlayer(x, y, z)) return
    world.set(keyOf(x, y, z), blockKinds[selected])
    showToast(`${blockLabels[blockKinds[selected]]}を置いた`)
  } else {
    world.delete(keyOf(block.x, block.y, block.z))
    showToast(`${blockLabels[kind]}を採掘した`)
  }
  rebuildMeshes()
  saveState.textContent = 'SAVING…'
  saveState.classList.add('saving')
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(saveWorld, 180)
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7))
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function update(time: number) {
  const delta = Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time

  if (document.pointerLockElement === canvas) {
    const keys = new Set(windowKeys)
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
    const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
    const length = Math.hypot(forward, sideways) || 1
    const speed = keys.has('ShiftLeft') ? 7.2 : 5.2
    const moveX = (Math.sin(yaw) * forward + Math.cos(yaw) * sideways) / length * speed * delta
    const moveZ = (-Math.cos(yaw) * forward + Math.sin(yaw) * sideways) / length * speed * delta

    if (!collides(player.x + moveX, player.y, player.z)) player.x += moveX
    if (!collides(player.x, player.y, player.z + moveZ)) player.z += moveZ
    if (keys.has('Space') && player.grounded) {
      player.velocityY = 8.5
      player.grounded = false
    }
    player.velocityY -= 22 * delta
    const nextY = player.y + player.velocityY * delta
    if (!collides(player.x, nextY, player.z)) {
      player.y = nextY
      player.grounded = false
    } else {
      if (player.velocityY < 0) player.grounded = true
      player.velocityY = 0
    }
    if (player.y < -10) {
      player.x = 0
      player.z = 0
      player.y = surfaceAt(0, 0) + 1
    }

    camera.position.set(player.x, player.y + 1.62, player.z)
    camera.rotation.set(pitch, yaw, 0)
    coordinates.textContent = `X ${Math.floor(player.x).toString().padStart(3, '0')} · Y ${Math.floor(player.y).toString().padStart(3, '0')} · Z ${Math.floor(player.z).toString().padStart(3, '0')}`
  }

  renderer.render(scene, camera)
  requestAnimationFrame(update)
}

const windowKeys = new Set<string>()
window.addEventListener('keydown', (event) => {
  windowKeys.add(event.code)
  if (event.code.startsWith('Digit')) {
    const digit = Number(event.code.slice(5))
    if (digit >= 1 && digit <= blockKinds.length) selectBlock(digit - 1)
  }
  if (event.code === 'Space') event.preventDefault()
})
window.addEventListener('keyup', (event) => windowKeys.delete(event.code))
window.addEventListener('blur', () => windowKeys.clear())
window.addEventListener('resize', resize)

startButton.addEventListener('click', () => canvas.requestPointerLock())
canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock()
})
canvas.addEventListener('contextmenu', (event) => event.preventDefault())
canvas.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement !== canvas) return
  if (event.button === 0) interact(false)
  if (event.button === 2) interact(true)
})
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return
  yaw -= event.movementX * 0.0022
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -Math.PI / 2 + 0.08, Math.PI / 2 - 0.08)
})
document.addEventListener('pointerlockchange', () => {
  const playing = document.pointerLockElement === canvas
  welcome.classList.toggle('hidden', playing)
  pauseIndicator.hidden = playing
  game.classList.toggle('playing', playing)
  if (!playing) windowKeys.clear()
})
pauseIndicator.addEventListener('click', () => canvas.requestPointerLock())

rebuildMeshes()
makeHotbar()
camera.position.set(player.x, player.y + 1.62, player.z)
requestAnimationFrame(update)