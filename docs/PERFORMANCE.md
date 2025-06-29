# Performance Optimization Guide

## Overview de Performance

RoleDesk Backend está optimizado para manejar múltiples salas simultáneas con cientos de usuarios concurrentes, manteniendo baja latencia y alto throughput en comunicación en tiempo real.

### Métricas de Performance Objetivo

| Métrica | Objetivo | Crítico |
|---------|----------|---------|
| **Latencia de WebSocket** | <50ms | <100ms |
| **Throughput de Eventos** | 10,000 eventos/s | 5,000 eventos/s |
| **Usuarios Concurrentes** | 1,000+ usuarios | 500+ usuarios |
| **Uso de Memoria** | <512MB | <1GB |
| **Tiempo de Respuesta HTTP** | <200ms | <500ms |
| **Uptime** | 99.9% | 99.5% |

## Optimizaciones de Memory Management

### Object Pooling para Eventos Frecuentes

```typescript
// Pool de objetos para reducir garbage collection
class ObjectPool<T> {
    private pool: T[] = []
    private createFn: () => T
    private resetFn: (obj: T) => void
    
    constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 10) {
        this.createFn = createFn
        this.resetFn = resetFn
        
        // Pre-crear objetos
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(createFn())
        }
    }
    
    acquire(): T {
        if (this.pool.length > 0) {
            return this.pool.pop()!
        }
        return this.createFn()
    }
    
    release(obj: T) {
        this.resetFn(obj)
        this.pool.push(obj)
    }
}

// Pool para eventos de movimiento
const moveEventPool = new ObjectPool(
    () => ({ playerId: '', x: 0, y: 0, timestamp: 0 }),
    (obj) => {
        obj.playerId = ''
        obj.x = 0
        obj.y = 0
        obj.timestamp = 0
    },
    100 // Pool inicial de 100 objetos
)

// Uso en event handlers
function handlePlayerMove(playerId: string, x: number, y: number) {
    const moveEvent = moveEventPool.acquire()
    
    moveEvent.playerId = playerId
    moveEvent.x = x
    moveEvent.y = y
    moveEvent.timestamp = Date.now()
    
    // Procesar evento...
    broadcastToRealm(realmId, 'playerMoved', moveEvent)
    
    // Liberar objeto de vuelta al pool
    moveEventPool.release(moveEvent)
}
```

### Memory-Efficient Data Structures

```typescript
// Estructura optimizada para gestión de jugadores
class OptimizedPlayerManager {
    // Arrays tipados para mejor performance
    private playerIds: Uint32Array
    private playerPositions: Float32Array // [x1, y1, x2, y2, ...]
    private playerRooms: Uint16Array
    private playerSkins: string[]
    
    // Maps para lookups rápidos
    private idToIndex = new Map<string, number>()
    private socketToId = new Map<string, string>()
    
    // Pool de índices libres para reuso
    private freeIndices: number[] = []
    private nextIndex = 0
    
    constructor(maxPlayers = 1000) {
        this.playerIds = new Uint32Array(maxPlayers)
        this.playerPositions = new Float32Array(maxPlayers * 2)
        this.playerRooms = new Uint16Array(maxPlayers)
        this.playerSkins = new Array(maxPlayers)
    }
    
    addPlayer(playerId: string, socketId: string, x: number, y: number): number {
        let index: number
        
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!
        } else {
            index = this.nextIndex++
        }
        
        const playerIdHash = this.hashPlayerId(playerId)
        
        this.playerIds[index] = playerIdHash
        this.playerPositions[index * 2] = x
        this.playerPositions[index * 2 + 1] = y
        this.playerRooms[index] = 0
        this.playerSkins[index] = '009'
        
        this.idToIndex.set(playerId, index)
        this.socketToId.set(socketId, playerId)
        
        return index
    }
    
    removePlayer(playerId: string, socketId: string) {
        const index = this.idToIndex.get(playerId)
        if (index === undefined) return
        
        // Limpiar datos
        this.playerIds[index] = 0
        this.playerPositions[index * 2] = 0
        this.playerPositions[index * 2 + 1] = 0
        this.playerRooms[index] = 0
        this.playerSkins[index] = ''
        
        // Liberar índice para reuso
        this.freeIndices.push(index)
        
        // Limpiar maps
        this.idToIndex.delete(playerId)
        this.socketToId.delete(socketId)
    }
    
    updatePosition(playerId: string, x: number, y: number): boolean {
        const index = this.idToIndex.get(playerId)
        if (index === undefined) return false
        
        this.playerPositions[index * 2] = x
        this.playerPositions[index * 2 + 1] = y
        
        return true
    }
    
    getPlayerPosition(playerId: string): { x: number, y: number } | null {
        const index = this.idToIndex.get(playerId)
        if (index === undefined) return null
        
        return {
            x: this.playerPositions[index * 2],
            y: this.playerPositions[index * 2 + 1]
        }
    }
    
    // Hash function para convertir UUID string a número
    private hashPlayerId(playerId: string): number {
        let hash = 0
        for (let i = 0; i < playerId.length; i++) {
            const char = playerId.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // Convertir a 32bit integer
        }
        return Math.abs(hash)
    }
}
```

## Optimización de Proximity Calculation

### Spatial Partitioning con QuadTree

```typescript
// QuadTree optimizado para cálculo de proximidad
class QuadTree {
    private maxObjects = 10
    private maxLevels = 5
    private level = 0
    private bounds: Rectangle
    private objects: Player[] = []
    private nodes: QuadTree[] = []
    
    constructor(bounds: Rectangle, maxObjects = 10, maxLevels = 5, level = 0) {
        this.bounds = bounds
        this.maxObjects = maxObjects
        this.maxLevels = maxLevels
        this.level = level
    }
    
    clear() {
        this.objects = []
        
        for (const node of this.nodes) {
            node.clear()
        }
        
        this.nodes = []
    }
    
    split() {
        const subWidth = this.bounds.width / 2
        const subHeight = this.bounds.height / 2
        const x = this.bounds.x
        const y = this.bounds.y
        
        this.nodes[0] = new QuadTree(
            { x: x + subWidth, y, width: subWidth, height: subHeight },
            this.maxObjects, this.maxLevels, this.level + 1
        )
        this.nodes[1] = new QuadTree(
            { x, y, width: subWidth, height: subHeight },
            this.maxObjects, this.maxLevels, this.level + 1
        )
        this.nodes[2] = new QuadTree(
            { x, y: y + subHeight, width: subWidth, height: subHeight },
            this.maxObjects, this.maxLevels, this.level + 1
        )
        this.nodes[3] = new QuadTree(
            { x: x + subWidth, y: y + subHeight, width: subWidth, height: subHeight },
            this.maxObjects, this.maxLevels, this.level + 1
        )
    }
    
    getIndex(player: Player): number {
        let index = -1
        const verticalMidpoint = this.bounds.x + this.bounds.width / 2
        const horizontalMidpoint = this.bounds.y + this.bounds.height / 2
        
        const topQuadrant = player.y < horizontalMidpoint && 
                           player.y + 1 < horizontalMidpoint
        const bottomQuadrant = player.y > horizontalMidpoint
        
        if (player.x < verticalMidpoint && player.x + 1 < verticalMidpoint) {
            if (topQuadrant) {
                index = 1
            } else if (bottomQuadrant) {
                index = 2
            }
        } else if (player.x > verticalMidpoint) {
            if (topQuadrant) {
                index = 0
            } else if (bottomQuadrant) {
                index = 3
            }
        }
        
        return index
    }
    
    insert(player: Player) {
        if (this.nodes.length > 0) {
            const index = this.getIndex(player)
            
            if (index !== -1) {
                this.nodes[index].insert(player)
                return
            }
        }
        
        this.objects.push(player)
        
        if (this.objects.length > this.maxObjects && this.level < this.maxLevels) {
            if (this.nodes.length === 0) {
                this.split()
            }
            
            let i = 0
            while (i < this.objects.length) {
                const index = this.getIndex(this.objects[i])
                if (index !== -1) {
                    this.nodes[index].insert(this.objects.splice(i, 1)[0])
                } else {
                    i++
                }
            }
        }
    }
    
    retrieve(player: Player): Player[] {
        const returnObjects: Player[] = []
        const index = this.getIndex(player)
        
        if (this.nodes.length > 0) {
            if (index !== -1) {
                returnObjects.push(...this.nodes[index].retrieve(player))
            }
        }
        
        returnObjects.push(...this.objects)
        return returnObjects
    }
}

// Gestor de proximidad optimizado
class OptimizedProximityManager {
    private quadTree: QuadTree
    private proximityThreshold = 150
    private lastUpdate = new Map<string, number>()
    private readonly UPDATE_INTERVAL = 100 // ms
    
    constructor(bounds: Rectangle) {
        this.quadTree = new QuadTree(bounds)
    }
    
    updateProximity(players: Player[]): Map<string, string[]> {
        const now = Date.now()
        const proximityUpdates = new Map<string, string[]>()
        
        // Limpiar y reconstruir QuadTree
        this.quadTree.clear()
        for (const player of players) {
            this.quadTree.insert(player)
        }
        
        // Calcular proximidad solo para jugadores que necesitan actualización
        for (const player of players) {
            const lastUpdateTime = this.lastUpdate.get(player.id) || 0
            
            if (now - lastUpdateTime < this.UPDATE_INTERVAL) {
                continue // Skip si fue actualizado recientemente
            }
            
            const nearbyPlayers = this.quadTree.retrieve(player)
            const proximePlayers: string[] = []
            
            for (const nearbyPlayer of nearbyPlayers) {
                if (nearbyPlayer.id === player.id) continue
                
                const distance = this.calculateDistance(player, nearbyPlayer)
                if (distance <= this.proximityThreshold) {
                    proximePlayers.push(nearbyPlayer.id)
                }
            }
            
            proximityUpdates.set(player.id, proximePlayers)
            this.lastUpdate.set(player.id, now)
        }
        
        return proximityUpdates
    }
    
    private calculateDistance(player1: Player, player2: Player): number {
        const dx = player1.x - player2.x
        const dy = player1.y - player2.y
        return Math.sqrt(dx * dx + dy * dy)
    }
}

interface Rectangle {
    x: number
    y: number
    width: number
    height: number
}

interface Player {
    id: string
    x: number
    y: number
}
```

## Database Performance

### Connection Pooling Optimization

```typescript
// Configuración optimizada de Supabase cliente
import { createClient } from '@supabase/supabase-js'

const supabaseConfig = {
    auth: {
        autoRefreshToken: true,
        persistSession: false // Servidor no necesita persistir sesiones
    },
    db: {
        schema: 'public'
    },
    global: {
        headers: {
            'X-Client-Info': 'roledesk-backend/1.0.0'
        }
    },
    // Configuración de pooling
    poolConfig: {
        max: 20, // Máximo 20 conexiones
        min: 5,  // Mínimo 5 conexiones
        idleTimeoutMillis: 30000, // 30s timeout para conexiones idle
        connectionTimeoutMillis: 2000 // 2s timeout para nuevas conexiones
    }
}

export const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SERVICE_ROLE!,
    supabaseConfig
)
```

### Query Optimization

```typescript
// Cache para queries frecuentes
class QueryCache {
    private cache = new Map<string, { data: any, expiry: number }>()
    private readonly TTL = 5 * 60 * 1000 // 5 minutos
    
    get(key: string): any | null {
        const cached = this.cache.get(key)
        
        if (!cached) return null
        
        if (Date.now() > cached.expiry) {
            this.cache.delete(key)
            return null
        }
        
        return cached.data
    }
    
    set(key: string, data: any) {
        this.cache.set(key, {
            data,
            expiry: Date.now() + this.TTL
        })
    }
    
    invalidate(pattern: string) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key)
            }
        }
    }
}

const queryCache = new QueryCache()

// Funciones de DB optimizadas
export async function getRealmOptimized(realmId: string, shareId?: string) {
    const cacheKey = `realm:${realmId}:${shareId || 'no-share'}`
    
    // Intentar obtener de cache primero
    let realm = queryCache.get(cacheKey)
    if (realm) {
        return realm
    }
    
    // Query optimizada con índices
    const { data, error } = await supabase
        .from('realms')
        .select(`
            id,
            owner_id,
            map_data,
            share_id,
            only_owner,
            created_at,
            profiles!inner(display_name, avatar_url)
        `)
        .eq('id', realmId)
        .single()
    
    if (error) throw error
    
    // Cachear resultado
    queryCache.set(cacheKey, data)
    
    return data
}

// Batch updates para mejor performance
export async function updateMultiplePlayerSkins(updates: Array<{id: string, skin: string}>) {
    const { error } = await supabase.rpc('update_player_skins_batch', {
        updates_json: JSON.stringify(updates)
    })
    
    if (error) throw error
    
    // Invalidar cache relacionado
    for (const update of updates) {
        queryCache.invalidate(`profile:${update.id}`)
    }
}
```

### Database Function para Batch Operations

```sql
-- Función SQL para batch updates de skins
CREATE OR REPLACE FUNCTION update_player_skins_batch(updates_json TEXT)
RETURNS VOID AS $$
DECLARE
    update_record RECORD;
BEGIN
    FOR update_record IN 
        SELECT * FROM json_to_recordset(updates_json::json) 
        AS x(id UUID, skin TEXT)
    LOOP
        UPDATE profiles 
        SET skin = update_record.skin, updated_at = NOW()
        WHERE id = update_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Función para cleanup de realms inactivos
CREATE OR REPLACE FUNCTION cleanup_inactive_realms()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM realms 
    WHERE updated_at < NOW() - INTERVAL '7 days'
    AND id NOT IN (
        SELECT DISTINCT realm_id 
        FROM active_sessions 
        WHERE last_activity > NOW() - INTERVAL '1 day'
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

## Socket.IO Performance Optimization

### Event Batching

```typescript
// Batching de eventos para reducir overhead
class EventBatcher {
    private batches = new Map<string, any[]>()
    private timers = new Map<string, NodeJS.Timeout>()
    private readonly BATCH_SIZE = 50
    private readonly BATCH_TIMEOUT = 16 // ~60fps
    
    add(realmId: string, event: string, data: any) {
        const key = `${realmId}:${event}`
        
        if (!this.batches.has(key)) {
            this.batches.set(key, [])
        }
        
        const batch = this.batches.get(key)!
        batch.push(data)
        
        // Enviar inmediatamente si alcanza el tamaño del batch
        if (batch.length >= this.BATCH_SIZE) {
            this.flush(realmId, event)
            return
        }
        
        // Configurar timer si no existe
        if (!this.timers.has(key)) {
            const timer = setTimeout(() => {
                this.flush(realmId, event)
            }, this.BATCH_TIMEOUT)
            
            this.timers.set(key, timer)
        }
    }
    
    private flush(realmId: string, event: string) {
        const key = `${realmId}:${event}`
        const batch = this.batches.get(key)
        
        if (!batch || batch.length === 0) return
        
        // Enviar batch a todos en el realm
        io.to(realmId).emit(`${event}Batch`, batch)
        
        // Limpiar
        this.batches.delete(key)
        
        const timer = this.timers.get(key)
        if (timer) {
            clearTimeout(timer)
            this.timers.delete(key)
        }
    }
}

const eventBatcher = new EventBatcher()

// Uso en handlers
function broadcastPlayerMovement(realmId: string, playerId: string, x: number, y: number) {
    eventBatcher.add(realmId, 'playerMoved', {
        playerId,
        x,
        y,
        timestamp: Date.now()
    })
}
```

### Connection Optimization

```typescript
// Configuración optimizada de Socket.IO
const io = new SocketIOServer(server, {
    // Optimizaciones de transporte
    transports: ['websocket', 'polling'],
    
    // Configuración de ping/pong
    pingTimeout: 60000,
    pingInterval: 25000,
    
    // Optimizaciones de memoria
    maxHttpBufferSize: 1e6, // 1MB máximo por mensaje
    
    // Compresión
    compression: true,
    
    // Configuración de rooms/namespaces
    adapter: redisAdapter, // Usar Redis adapter para clustering
    
    // Socket.IO specific optimizations
    allowEIO3: false, // Solo Engine.IO v4
    
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
    }
})

// Middleware de performance
io.use((socket, next) => {
    // Marcar timestamp de conexión
    socket.connectedAt = Date.now()
    
    // Configurar limites por socket
    socket.setMaxListeners(20)
    
    next()
})

// Optimización de rooms
io.use((socket, next) => {
    // Configurar auto-leave para rooms inactivas
    socket.on('disconnecting', () => {
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                // Verificar si room queda vacía y hacer cleanup
                const roomSockets = io.sockets.adapter.rooms.get(room)
                if (roomSockets && roomSockets.size === 1) {
                    // Esta es la última conexión en el room
                    performRoomCleanup(room)
                }
            }
        }
    })
    
    next()
})

function performRoomCleanup(roomId: string) {
    // Limpiar estado de la session
    sessionManager.terminateSession(roomId, 'Empty room cleanup')
    
    // Limpiar cache relacionado
    queryCache.invalidate(roomId)
    
    logger.performance(`Room cleaned up: ${roomId}`)
}
```

## Monitoring y Profiling

### Performance Metrics Collection

```typescript
class PerformanceMonitor {
    private metrics = {
        socketConnections: 0,
        activeRealms: 0,
        eventsPerSecond: 0,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime()
    }
    
    private eventCounter = 0
    private lastEventReset = Date.now()
    
    constructor() {
        // Actualizar métricas cada segundo
        setInterval(() => {
            this.updateMetrics()
        }, 1000)
        
        // Reset contador de eventos cada segundo
        setInterval(() => {
            this.metrics.eventsPerSecond = this.eventCounter
            this.eventCounter = 0
            this.lastEventReset = Date.now()
        }, 1000)
    }
    
    recordEvent() {
        this.eventCounter++
    }
    
    updateMetrics() {
        this.metrics.socketConnections = io.engine.clientsCount
        this.metrics.activeRealms = sessionManager.getActiveSessionsCount()
        this.metrics.memoryUsage = process.memoryUsage()
        this.metrics.cpuUsage = process.cpuUsage()
        this.metrics.uptime = process.uptime()
    }
    
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: Date.now()
        }
    }
    
    // Detectar problemas de performance
    checkPerformanceIssues() {
        const issues: string[] = []
        
        // Memoria alta
        if (this.metrics.memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
            issues.push('High memory usage')
        }
        
        // Muchas conexiones
        if (this.metrics.socketConnections > 1000) {
            issues.push('High connection count')
        }
        
        // Eventos por segundo muy altos
        if (this.metrics.eventsPerSecond > 5000) {
            issues.push('High event rate')
        }
        
        return issues
    }
}

const performanceMonitor = new PerformanceMonitor()

// Endpoint para métricas
app.get('/debug/metrics', (req, res) => {
    const metrics = performanceMonitor.getMetrics()
    const issues = performanceMonitor.checkPerformanceIssues()
    
    res.json({
        metrics,
        issues,
        healthy: issues.length === 0
    })
})
```

### Memory Leak Detection

```typescript
// Detector de memory leaks
class MemoryLeakDetector {
    private snapshots: any[] = []
    private readonly MAX_SNAPSHOTS = 10
    
    takeSnapshot() {
        const usage = process.memoryUsage()
        const timestamp = Date.now()
        
        this.snapshots.push({
            timestamp,
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            rss: usage.rss
        })
        
        // Mantener solo las últimas snapshots
        if (this.snapshots.length > this.MAX_SNAPSHOTS) {
            this.snapshots.shift()
        }
    }
    
    detectLeaks(): boolean {
        if (this.snapshots.length < 5) return false
        
        // Verificar tendencia creciente en heap usage
        const recent = this.snapshots.slice(-5)
        let increasing = 0
        
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].heapUsed > recent[i-1].heapUsed) {
                increasing++
            }
        }
        
        // Si 80% de las muestras muestran crecimiento, posible leak
        return increasing >= 4
    }
    
    getMemoryTrend() {
        if (this.snapshots.length < 2) return 0
        
        const first = this.snapshots[0]
        const last = this.snapshots[this.snapshots.length - 1]
        
        return (last.heapUsed - first.heapUsed) / (last.timestamp - first.timestamp)
    }
}

const memoryLeakDetector = new MemoryLeakDetector()

// Tomar snapshots periódicamente
setInterval(() => {
    memoryLeakDetector.takeSnapshot()
    
    if (memoryLeakDetector.detectLeaks()) {
        logger.warning('Potential memory leak detected')
        
        // Forzar garbage collection si está disponible
        if (global.gc) {
            global.gc()
        }
    }
}, 30000) // Cada 30 segundos
```

## Load Testing

### Artillery.io Configuration

```yaml
# artillery-load-test.yml
config:
  target: 'http://localhost:3001'
  socketio:
    transports: ['websocket']
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120  
      arrivalRate: 50
      name: "Ramp up load"
    - duration: 300
      arrivalRate: 100
      name: "Sustained load"

scenarios:
  - name: "Join realm and move around"
    weight: 70
    engine: socketio
    flow:
      - emit:
          channel: "joinRealm"
          data:
            realmId: "{{ $randomUUID }}"
      - think: 1
      - loop:
          - emit:
              channel: "movePlayer" 
              data:
                x: "{{ $randomInt(0, 800) }}"
                y: "{{ $randomInt(0, 600) }}"
          - think: 0.1
        count: 100
        
  - name: "Chat messages"
    weight: 20
    engine: socketio
    flow:
      - emit:
          channel: "joinRealm"
          data:
            realmId: "test-realm-id"
      - think: 2
      - loop:
          - emit:
              channel: "sendMessage"
              data: "Test message {{ $randomInt(1, 1000) }}"
          - think: 5
        count: 10
        
  - name: "Skin changes"
    weight: 10
    engine: socketio
    flow:
      - emit:
          channel: "joinRealm"
          data:
            realmId: "test-realm-id"
      - think: 3
      - emit:
          channel: "changedSkin"
          data: "skin_{{ $randomInt(1, 50) }}"
```

### Benchmark Scripts

```bash
#!/bin/bash
# benchmark.sh

echo "Starting RoleDesk Backend Performance Tests"

# Warm up server
echo "Warming up server..."
curl -s http://localhost:3001/health > /dev/null

# Run load tests
echo "Running load tests..."
artillery run artillery-load-test.yml --output test-results.json

# Generate HTML report
artillery report test-results.json --output test-report.html

# Check memory usage during test
echo "Memory usage during test:"
ps -o pid,rss,vsz,comm -p $(pgrep node)

# Check for memory leaks
echo "Checking for memory leaks..."
curl -s http://localhost:3001/debug/metrics | jq .

echo "Performance test completed. Check test-report.html for results."
```

## Production Optimizations

### Process Management with PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'roledesk-backend',
    script: './dist/index.js',
    instances: 'max', // Una instancia por CPU core
    exec_mode: 'cluster',
    
    // Memory management
    max_memory_restart: '1G',
    
    // Environment
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    
    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    
    // Auto restart
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    
    // Performance monitoring
    monitoring: true,
    
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 3000
  }]
}
```

### Redis Adapter para Clustering

```typescript
// Configuración Redis para Socket.IO clustering
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'

const pubClient = createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    // Configuraciones de performance
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null
})

const subClient = pubClient.duplicate()

Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
        io.adapter(createAdapter(pubClient, subClient))
        logger.info('Redis adapter connected successfully')
    })
    .catch((err) => {
        logger.error('Redis adapter connection failed:', err)
        // Fallback a in-memory adapter
    })

// Configurar Redis para cache de sesiones
const sessionRedis = createClient({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: 1 // Usar DB diferente para sesiones
})

// Implementar cache distribuido de sesiones
class DistributedSessionManager extends SessionManager {
    async createSession(realmId: string): Promise<Session> {
        const session = await super.createSession(realmId)
        
        // Persistir en Redis
        await sessionRedis.setex(
            `session:${realmId}`,
            3600, // 1 hora TTL
            JSON.stringify(session.serialize())
        )
        
        return session
    }
    
    async getSession(realmId: string): Promise<Session | null> {
        // Intentar obtener de memoria primero
        let session = super.getSession(realmId)
        
        if (!session) {
            // Fallback a Redis
            const cached = await sessionRedis.get(`session:${realmId}`)
            if (cached) {
                session = Session.deserialize(JSON.parse(cached))
                this.sessions.set(realmId, session)
            }
        }
        
        return session
    }
}
```

### CDN y Caching Strategy

```typescript
// Headers de cache para assets estáticos
app.use('/static', express.static('public', {
    maxAge: '1y', // Cache por 1 año
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // Configurar headers específicos según tipo de archivo
        if (path.endsWith('.js') || path.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=3600')
        }
    }
}))

// API response caching
const NodeCache = require('node-cache')
const apiCache = new NodeCache({
    stdTTL: 300, // 5 minutos por defecto
    checkperiod: 120 // Verificar TTL cada 2 minutos
})

function cacheMiddleware(duration: number) {
    return (req: Request, res: Response, next: NextFunction) => {
        const key = req.originalUrl
        const cached = apiCache.get(key)
        
        if (cached) {
            res.setHeader('X-Cache', 'HIT')
            return res.json(cached)
        }
        
        res.setHeader('X-Cache', 'MISS')
        
        // Override res.json para cachear respuesta
        const originalJson = res.json
        res.json = function(data: any) {
            apiCache.set(key, data, duration)
            return originalJson.call(this, data)
        }
        
        next()
    }
}

// Aplicar cache a endpoints específicos
app.get('/api/realms/:id', cacheMiddleware(300), getRealmHandler)
```

## Performance Checklist

### Pre-Production Checklist

- [ ] **Memory Management**
  - [ ] Object pooling implementado para eventos frecuentes
  - [ ] Memory leak detection configurado
  - [ ] Garbage collection optimizada

- [ ] **Database Performance**
  - [ ] Connection pooling configurado
  - [ ] Query cache implementado
  - [ ] Índices optimizados en Supabase

- [ ] **Socket.IO Optimization**
  - [ ] Event batching implementado
  - [ ] Redis adapter configurado para clustering
  - [ ] Connection limits establecidos

- [ ] **Monitoring**
  - [ ] Performance metrics endpoint activo
  - [ ] Logging de performance configurado
  - [ ] Alertas automáticas configuradas

- [ ] **Load Testing**
  - [ ] Tests de carga ejecutados
  - [ ] Benchmark de latencia completado
  - [ ] Capacidad máxima determinada

- [ ] **Production Setup**
  - [ ] PM2 configurado para clustering
  - [ ] CDN configurado para assets
  - [ ] Rate limiting en producción

### Monitoring en Tiempo Real

```bash
# Comandos útiles para monitoreo
watch -n 1 'curl -s http://localhost:3001/debug/metrics | jq'
pm2 monit
htop
iotop -o
```

---

**🎯 Objetivo:** Mantener latencia <50ms y soporte para 1000+ usuarios concurrentes con el stack actual.

*Última actualización: 28 de junio de 2025*
