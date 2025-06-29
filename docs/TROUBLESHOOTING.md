# Troubleshooting Guide - RoleDesk Backend

## Problemas Comunes y Soluciones

Esta guía proporciona soluciones paso a paso para los problemas más frecuentes en el backend de RoleDesk.

## 🔐 Problemas de Autenticación

### "Invalid access token or uid"

**Síntomas:**
- Usuarios no pueden conectarse via WebSocket
- Error 401 en requests API
- Token rechazado por Supabase

**Diagnóstico:**
```bash
# Verificar token manualmente
curl -H "Authorization: Bearer <token>" \
     -H "apikey: <anon_key>" \
     https://tu-proyecto.supabase.co/auth/v1/user
```

**Soluciones:**

1. **Token Expirado**
   ```typescript
   // Verificar expiración del token
   const payload = JSON.parse(atob(token.split('.')[1]))
   const now = Math.floor(Date.now() / 1000)
   if (payload.exp < now) {
       console.log('Token expired, needs refresh')
   }
   ```

2. **Variables de Entorno Incorrectas**
   ```bash
   # Verificar variables
   echo $SUPABASE_URL
   echo $SERVICE_ROLE
   
   # Actualizar .env
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SERVICE_ROLE=tu_service_role_key_aqui
   ```

3. **RLS Policies Incorrectas**
   ```sql
   -- Verificar políticas en Supabase
   SELECT * FROM pg_policies WHERE tablename = 'realms';
   
   -- Recrear política si es necesario
   DROP POLICY IF EXISTS "realm_access_policy" ON realms;
   CREATE POLICY "realm_access_policy" ON realms
       FOR ALL USING (auth.uid() = owner_id OR only_owner = false);
   ```

### "User not found in session"

**Síntomas:**
- Socket conecta pero eventos fallan
- Usuario aparece como undefined en logs

**Soluciones:**

1. **Middleware de Autenticación**
   ```typescript
   // Verificar orden de middlewares
   io.use(async (socket, next) => {
       const token = socket.handshake.auth.token
       if (!token) {
           return next(new Error('No token provided'))
       }
       
       try {
           const { data: user } = await supabase.auth.getUser(token)
           socket.userId = user.user?.id
           next()
       } catch (error) {
           next(new Error('Authentication failed'))
       }
   })
   ```

2. **Verificar Headers del Cliente**
   ```javascript
   // Cliente debe enviar token correctamente
   const socket = io('http://localhost:3001', {
       auth: {
           token: 'tu_jwt_token_aqui'
       }
   })
   ```

## 🔌 Problemas de Conexión WebSocket

### "Connection refused" o "Failed to connect"

**Síntomas:**
- Cliente no puede conectar al servidor
- Timeouts en conexión
- CORS errors

**Diagnóstico:**
```bash
# Verificar si el servidor está escuchando
netstat -tulpn | grep :3001

# Test básico de conectividad
curl http://localhost:3001/health

# Verificar logs del servidor
tail -f logs/combined.log
```

**Soluciones:**

1. **Puerto Ocupado**
   ```bash
   # Encontrar proceso usando el puerto
   lsof -i :3001
   
   # Terminar proceso si es necesario
   kill -9 <PID>
   
   # O cambiar puerto
   PORT=3002 npm run dev
   ```

2. **Configuración CORS**
   ```typescript
   // Verificar configuración CORS
   const io = new SocketIOServer(server, {
       cors: {
           origin: process.env.FRONTEND_URL || "http://localhost:3000",
           methods: ["GET", "POST"],
           credentials: true
       }
   })
   ```

3. **Firewall/Proxy Issues**
   ```bash
   # Verificar firewall (Linux)
   sudo ufw status
   
   # Abrir puerto si es necesario
   sudo ufw allow 3001
   
   # Para Windows
   netsh advfirewall firewall add rule name="RoleDesk Backend" dir=in action=allow protocol=TCP localport=3001
   ```

### "WebSocket connection failed"

**Síntomas:**
- Conexión se establece pero se desconecta inmediatamente
- Fallback a polling pero es inestable

**Soluciones:**

1. **Aumentar Timeouts**
   ```typescript
   const io = new SocketIOServer(server, {
       pingTimeout: 60000,
       pingInterval: 25000,
       upgradeTimeout: 30000,
       allowUpgrades: true
   })
   ```

2. **Verificar Load Balancer**
   ```nginx
   # Configuración Nginx para WebSockets
   location /socket.io/ {
       proxy_pass http://localhost:3001;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

## 📊 Problemas de Base de Datos

### "Connection to database failed"

**Síntomas:**
- Errores al crear/obtener realms
- Timeouts en queries
- Connection pool exhausted

**Diagnóstico:**
```typescript
// Test de conexión a Supabase
async function testDatabaseConnection() {
    try {
        const { data, error } = await supabase
            .from('realms')
            .select('count(*)', { count: 'exact' })
        
        if (error) {
            console.error('Database error:', error)
        } else {
            console.log('Database connected, realms count:', data)
        }
    } catch (err) {
        console.error('Connection failed:', err)
    }
}
```

**Soluciones:**

1. **Verificar Credenciales**
   ```bash
   # Test manual de conexión
   curl -H "apikey: <service_role_key>" \
        -H "Authorization: Bearer <service_role_key>" \
        https://tu-proyecto.supabase.co/rest/v1/realms?select=count
   ```

2. **Connection Pool Issues**
   ```typescript
   // Configurar pool de conexiones
   const supabase = createClient(url, key, {
       db: {
           schema: 'public'
       },
       global: {
           headers: { 'x-my-custom-header': 'my-app-name' }
       }
   })
   ```

3. **Queries Lentas**
   ```sql
   -- Verificar queries lentas en Supabase Dashboard
   -- O usar explain analyze
   EXPLAIN ANALYZE SELECT * FROM realms WHERE owner_id = 'uuid';
   
   -- Crear índices si es necesario
   CREATE INDEX IF NOT EXISTS idx_realms_owner_id ON realms(owner_id);
   CREATE INDEX IF NOT EXISTS idx_realms_share_id ON realms(share_id);
   ```

### "Row Level Security policy violation"

**Síntomas:**
- Usuarios no pueden acceder a sus propios datos
- Error 403 en operaciones permitidas

**Soluciones:**

1. **Verificar Políticas RLS**
   ```sql
   -- Ver políticas actuales
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
   FROM pg_policies WHERE tablename IN ('realms', 'profiles');
   
   -- Recrear política básica
   CREATE POLICY "Enable read access for users" ON realms
       FOR SELECT USING (auth.uid() = owner_id);
   ```

2. **Usar Service Role para Operaciones del Servidor**
   ```typescript
   // Crear cliente con service role para operaciones internas
   const adminSupabase = createClient(
       process.env.SUPABASE_URL!,
       process.env.SERVICE_ROLE!, // Service role key
       {
           auth: {
               autoRefreshToken: false,
               persistSession: false
           }
       }
   )
   
   // Usar para operaciones que requieren permisos elevados
   const { data } = await adminSupabase
       .from('realms')
       .select('*')
       .eq('id', realmId)
   ```

## ⚡ Problemas de Performance

### "High Memory Usage"

**Síntomas:**
- Servidor usa >1GB RAM
- Out of memory errors
- Performance degradada

**Diagnóstico:**
```bash
# Monitorear memoria
watch -n 1 'ps -o pid,rss,vsz,comm -p $(pgrep node)'

# Heap dump para análisis
kill -USR2 <node_pid>

# Verificar métricas internas
curl http://localhost:3001/debug/metrics | jq '.metrics.memoryUsage'
```

**Soluciones:**

1. **Memory Leaks en Sessions**
   ```typescript
   // Limpiar sesiones inactivas
   setInterval(() => {
       const now = Date.now()
       for (const [realmId, session] of sessionManager.sessions) {
           if (now - session.lastActivity > 30 * 60 * 1000) { // 30 min
               sessionManager.terminateSession(realmId, 'Inactive cleanup')
           }
       }
   }, 5 * 60 * 1000) // Cada 5 minutos
   ```

2. **Event Listener Leaks**
   ```typescript
   // Limpiar listeners en disconnect
   socket.on('disconnect', () => {
       socket.removeAllListeners()
       userManager.removeUser(socket.id)
   })
   ```

3. **Configurar Límites**
   ```typescript
   // Límites de conexión
   const MAX_CONNECTIONS = 1000
   let currentConnections = 0
   
   io.use((socket, next) => {
       if (currentConnections >= MAX_CONNECTIONS) {
           return next(new Error('Server at capacity'))
       }
       currentConnections++
       
       socket.on('disconnect', () => {
           currentConnections--
       })
       
       next()
   })
   ```

### "High CPU Usage"

**Síntomas:**
- CPU usage >80%
- Response times altos
- Event lag

**Diagnóstico:**
```bash
# Profiling con clinic.js
npm install -g clinic
clinic doctor -- node dist/index.js

# O usar built-in profiler
node --prof dist/index.js
```

**Soluciones:**

1. **Optimizar Proximity Calculations**
   ```typescript
   // Rate limit proximity updates
   const PROXIMITY_UPDATE_INTERVAL = 100 // ms
   const lastProximityUpdate = new Map<string, number>()
   
   function updateProximity(playerId: string) {
       const now = Date.now()
       const lastUpdate = lastProximityUpdate.get(playerId) || 0
       
       if (now - lastUpdate < PROXIMITY_UPDATE_INTERVAL) {
           return // Skip update
       }
       
       // Perform proximity calculation
       lastProximityUpdate.set(playerId, now)
   }
   ```

2. **Event Batching**
   ```typescript
   // Agrupar eventos para reducir processing
   const eventQueue = new Map<string, any[]>()
   
   setInterval(() => {
       for (const [realmId, events] of eventQueue) {
           if (events.length > 0) {
               io.to(realmId).emit('batchEvents', events)
               eventQueue.set(realmId, [])
           }
       }
   }, 16) // ~60fps
   ```

## 🐛 Problemas de Sincronización

### "Players not syncing"

**Síntomas:**
- Movimientos de jugadores no se ven
- Estados inconsistentes entre clientes
- Jugadores "fantasma"

**Diagnóstico:**
```typescript
// Debug de sincronización
socket.on('movePlayer', (data) => {
    console.log(`Player ${socket.userId} moved to:`, data)
    
    // Verificar que el evento se propaga
    socket.to(realmId).emit('playerMoved', {
        playerId: socket.userId,
        ...data
    })
})

// Verificar estado de sesión
app.get('/debug/session/:realmId', (req, res) => {
    const session = sessionManager.getSession(req.params.realmId)
    res.json({
        exists: !!session,
        playerCount: session?.players.length || 0,
        players: session?.players.map(p => ({
            id: p.id,
            x: p.x,
            y: p.y
        })) || []
    })
})
```

**Soluciones:**

1. **Verificar Room Membership**
   ```typescript
   // Asegurar que el socket está en el room correcto
   socket.on('joinRealm', async (data) => {
       // Leave previous rooms
       for (const room of socket.rooms) {
           if (room !== socket.id) {
               socket.leave(room)
           }
       }
       
       // Join new room
       socket.join(data.realmId)
       
       // Verificar membership
       console.log('Socket rooms:', Array.from(socket.rooms))
   })
   ```

2. **State Reconciliation**
   ```typescript
   // Periódicamente sincronizar estado completo
   setInterval(() => {
       for (const [realmId, session] of sessionManager.sessions) {
           const players = session.getAllPlayers()
           io.to(realmId).emit('fullStateSync', { players })
       }
   }, 30000) // Cada 30 segundos
   ```

3. **Handle Disconnections**
   ```typescript
   socket.on('disconnect', (reason) => {
       console.log(`Socket ${socket.id} disconnected: ${reason}`)
       
       // Notificar a otros jugadores
       const user = userManager.getUserBySocketId(socket.id)
       if (user) {
           socket.to(user.currentRealm).emit('playerLeft', {
               playerId: user.id,
               reason: 'disconnect'
           })
       }
       
       // Cleanup
       userManager.removeUser(socket.id)
   })
   ```

### "Proximity not working"

**Síntomas:**
- Video chat no se activa automáticamente
- Jugadores cercanos no detectados
- Falsas proximidades

**Soluciones:**

1. **Verificar Algoritmo de Distancia**
   ```typescript
   function calculateDistance(player1: Player, player2: Player): number {
       const dx = player1.x - player2.x
       const dy = player1.y - player2.y
       return Math.sqrt(dx * dx + dy * dy)
   }
   
   function isInProximity(player1: Player, player2: Player): boolean {
       const distance = calculateDistance(player1, player2)
       const threshold = 150 // pixels
       
       console.log(`Distance between ${player1.id} and ${player2.id}: ${distance}`)
       return distance <= threshold
   }
   ```

2. **Debug Proximity Updates**
   ```typescript
   socket.on('movePlayer', (data) => {
       // ... update position ...
       
       // Calculate and log proximity
       const nearbyPlayers = calculateNearbyPlayers(socket.userId)
       console.log(`${socket.userId} nearby players:`, nearbyPlayers)
       
       socket.emit('proximityUpdate', { nearbyPlayers })
   })
   ```

## 🚀 Problemas de Deployment

### "Production build fails"

**Síntomas:**
- `npm run build` falla
- TypeScript compilation errors
- Missing dependencies

**Soluciones:**

1. **TypeScript Errors**
   ```bash
   # Verificar errores de tipos
   npm run type-check
   
   # Limpiar y reconstruir
   rm -rf dist/
   npm run build
   ```

2. **Missing Dependencies**
   ```bash
   # Verificar dependencias
   npm audit
   npm install
   
   # Limpiar node_modules si es necesario
   rm -rf node_modules/
   npm install
   ```

3. **Environment Variables**
   ```bash
   # Verificar que todas las env vars estén definidas
   node -e "
   const required = ['SUPABASE_URL', 'SERVICE_ROLE', 'FRONTEND_URL'];
   required.forEach(key => {
     if (!process.env[key]) {
       console.error(\`Missing: \${key}\`);
       process.exit(1);
     }
   });
   console.log('All env vars present');
   "
   ```

### "Server crashes in production"

**Síntomas:**
- Process exits unexpectedly
- PM2 restart loops
- Memory errors

**Diagnóstico:**
```bash
# Verificar logs de PM2
pm2 logs roledesk-backend

# Ver estado de procesos
pm2 status

# Monitorear en tiempo real
pm2 monit
```

**Soluciones:**

1. **Configurar Error Handling**
   ```typescript
   // Global error handlers
   process.on('uncaughtException', (error) => {
       logger.error('Uncaught Exception:', error)
       // Graceful shutdown
       server.close(() => {
           process.exit(1)
       })
   })
   
   process.on('unhandledRejection', (reason, promise) => {
       logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
   })
   ```

2. **Configurar PM2 Correctamente**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'roledesk-backend',
       script: './dist/index.js',
       instances: 1, // Empezar con 1 instancia
       max_memory_restart: '1G',
       error_file: './logs/error.log',
       out_file: './logs/out.log',
       log_file: './logs/combined.log',
       kill_timeout: 5000
     }]
   }
   ```

3. **Health Checks**
   ```typescript
   // Endpoint de health check robusto
   app.get('/health', (req, res) => {
       const healthCheck = {
           uptime: process.uptime(),
           message: 'OK',
           timestamp: Date.now(),
           memory: process.memoryUsage(),
           database: 'checking...'
       }
       
       // Test database connection
       supabase.from('realms').select('count').limit(1)
           .then(() => {
               healthCheck.database = 'connected'
               res.status(200).json(healthCheck)
           })
           .catch(() => {
               healthCheck.database = 'disconnected'
               res.status(503).json(healthCheck)
           })
   })
   ```

## 🔍 Tools de Debugging

### Logging Avanzado

```typescript
// Logger configurado para debugging
import winston from 'winston'

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
})

// Usar en el código
logger.info('Player joined realm', { playerId, realmId })
logger.error('Database connection failed', { error: err.message })
```

### Debug Commands

```bash
# Verificar estado del servidor
curl http://localhost:3001/health

# Ver métricas en tiempo real
watch -n 1 'curl -s http://localhost:3001/debug/metrics | jq'

# Test de conectividad WebSocket
wscat -c ws://localhost:3001/socket.io/?EIO=4&transport=websocket

# Monitorear conexiones de red
netstat -an | grep :3001

# Ver procesos Node.js
ps aux | grep node

# Monitorear archivos abiertos
lsof -p $(pgrep node)
```

### Remote Debugging

```bash
# Iniciar servidor con debug
node --inspect=0.0.0.0:9229 dist/index.js

# Conectar desde Chrome DevTools
# chrome://inspect

# O usar VS Code para remote debugging
```

## 📞 Contacto y Soporte

Si los problemas persisten después de seguir esta guía:

1. **Verificar Issues en GitHub**: [Repository Issues](https://github.com/tu-repo/issues)
2. **Crear Issue Nuevo**: Incluir logs, pasos para reproducir, y configuración
3. **Discord/Slack**: Para soporte en tiempo real
4. **Email**: support@roledesk.app

### Template de Issue

```markdown
## Descripción del Problema
[Descripción clara del problema]

## Pasos para Reproducir
1. 
2. 
3. 

## Comportamiento Esperado
[Qué debería pasar]

## Comportamiento Actual  
[Qué está pasando]

## Información del Sistema
- OS: [Windows/macOS/Linux]
- Node.js: [versión]
- NPM: [versión]
- Navegador: [si aplica]

## Logs
```
[Incluir logs relevantes]
```

## Configuración
```env
# Variables de entorno (sin secrets)
NODE_ENV=development
PORT=3001
```
```

---

**💡 Tip:** La mayoría de problemas se resuelven verificando logs, variables de entorno y configuración de red. Siempre empezar con lo básico.

*Última actualización: 28 de junio de 2025*
