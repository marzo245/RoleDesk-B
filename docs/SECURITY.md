# Security Guide - RoleDesk Backend

## Visión General de Seguridad

Este documento describe las medidas de seguridad implementadas y las mejores prácticas para mantener la integridad y seguridad del sistema RoleDesk.

### Modelo de Amenazas

| Amenaza | Riesgo | Mitigación |
|---------|--------|------------|
| **Injection Attacks** | Alto | Validación Zod + Prepared Statements |
| **Authentication Bypass** | Alto | JWT + Supabase Auth + Token Validation |
| **Authorization Errors** | Medio | Row Level Security + Middleware |
| **DDoS / Rate Limiting** | Medio | Rate Limiting + Connection Limits |
| **Data Exposure** | Alto | RLS + CORS + Input Sanitization |
| **Man-in-the-Middle** | Medio | HTTPS/WSS + Certificate Pinning |

## Autenticación y Autorización

### JWT Token Validation

```typescript
// Middleware de validación de tokens
async function validateAuthToken(token: string): Promise<User | null> {
    try {
        const { data: user, error } = await supabase.auth.getUser(token)
        
        if (error || !user.user) {
            logger.auth('Token validation failed:', error?.message)
            return null
        }
        
        // Verificar que el token no esté expirado
        const now = Math.floor(Date.now() / 1000)
        if (user.user.exp && user.user.exp < now) {
            logger.auth('Token expired for user:', user.user.id)
            return null
        }
        
        return user.user
    } catch (error) {
        logger.auth('Token validation error:', error)
        return null
    }
}

// Aplicación en Socket.IO
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token
        
        if (!token) {
            return next(new Error('No authentication token provided'))
        }
        
        const user = await validateAuthToken(token)
        
        if (!user) {
            return next(new Error('Invalid authentication token'))
        }
        
        socket.userId = user.id
        socket.userEmail = user.email
        next()
    } catch (error) {
        logger.auth('Socket authentication error:', error)
        next(new Error('Authentication failed'))
    }
})
```

### Row Level Security (RLS)

```sql
-- Política de seguridad estricta para realms
CREATE POLICY "realm_access_policy" ON realms
    FOR ALL USING (
        -- El usuario es el owner
        auth.uid() = owner_id 
        OR 
        -- El realm es público y tiene share_id válido
        (only_owner = false AND share_id IS NOT NULL)
    );

-- Política para profiles con acceso limitado
CREATE POLICY "profile_access_policy" ON profiles
    FOR SELECT USING (
        -- Propio perfil siempre visible
        auth.uid() = id
        OR
        -- Otros perfiles solo información básica
        true -- Pero limitado por SELECT específico
    );

-- Vista segura para perfiles públicos
CREATE VIEW public_profiles AS
SELECT 
    id,
    display_name,
    avatar_url,
    -- NO incluir información sensible
    created_at
FROM profiles;
```

### Authorization Middleware

```typescript
// Middleware para verificar permisos de realm
async function verifyRealmAccess(
    userId: string, 
    realmId: string, 
    shareId?: string
): Promise<boolean> {
    try {
        const { data: realm, error } = await supabase
            .from('realms')
            .select('owner_id, only_owner, share_id')
            .eq('id', realmId)
            .single()
        
        if (error || !realm) {
            logger.auth('Realm not found:', realmId)
            return false
        }
        
        // El owner siempre tiene acceso
        if (realm.owner_id === userId) {
            return true
        }
        
        // Si el realm es solo para el owner
        if (realm.only_owner) {
            logger.auth('Realm is owner-only:', realmId)
            return false
        }
        
        // Verificar share_id si es requerido
        if (shareId && realm.share_id !== shareId) {
            logger.auth('Invalid share_id for realm:', realmId)
            return false
        }
        
        return true
    } catch (error) {
        logger.auth('Realm access verification error:', error)
        return false
    }
}
```

## Validación de Entrada

### Schemas Zod Completos

```typescript
// Validación exhaustiva con sanitización
export const JoinRealmSchema = z.object({
    realmId: z.string()
        .uuid('Realm ID debe ser un UUID válido')
        .refine(
            val => val.length === 36,
            'UUID debe tener formato estándar'
        ),
    shareId: z.string()
        .uuid('Share ID debe ser un UUID válido')
        .optional()
        .or(z.literal(''))
        .transform(val => val === '' ? undefined : val)
})

export const MovePlayerSchema = z.object({
    x: z.number()
        .finite('Coordenada X debe ser un número finito')
        .min(-50000, 'Coordenada X fuera de rango')
        .max(50000, 'Coordenada X fuera de rango')
        .transform(val => Math.round(val * 100) / 100), // 2 decimales max
    y: z.number()
        .finite('Coordenada Y debe ser un número finito')
        .min(-50000, 'Coordenada Y fuera de rango')
        .max(50000, 'Coordenada Y fuera de rango')
        .transform(val => Math.round(val * 100) / 100)
})

export const ChatMessageSchema = z.string()
    .min(1, 'Mensaje no puede estar vacío')
    .max(500, 'Mensaje demasiado largo')
    .refine(
        msg => msg.trim().length > 0,
        'Mensaje no puede ser solo espacios'
    )
    .transform(msg => {
        // Sanitizar HTML y caracteres especiales
        return msg
            .replace(/<[^>]*>/g, '') // Remover HTML
            .replace(/[<>'"&]/g, '') // Remover caracteres peligrosos
            .trim()
    })

export const SkinSchema = z.string()
    .regex(/^[a-zA-Z0-9_-]+$/, 'Skin solo puede contener letras, números, _ y -')
    .min(1, 'Skin no puede estar vacío')
    .max(50, 'Skin demasiado largo')
```

### Sanitización Avanzada

```typescript
// Utilidades de sanitización
class InputSanitizer {
    static sanitizeString(input: string): string {
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]*>/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim()
    }
    
    static sanitizeNumber(input: number, min: number, max: number): number {
        if (!Number.isFinite(input)) {
            throw new Error('Número inválido')
        }
        
        return Math.max(min, Math.min(max, input))
    }
    
    static sanitizeJSON(input: any): any {
        const jsonString = JSON.stringify(input)
        
        // Verificar tamaño del JSON
        if (jsonString.length > 100000) { // 100KB max
            throw new Error('JSON demasiado grande')
        }
        
        // Verificar profundidad del objeto
        if (this.getObjectDepth(input) > 10) {
            throw new Error('Objeto JSON demasiado profundo')
        }
        
        return input
    }
    
    private static getObjectDepth(obj: any): number {
        if (typeof obj !== 'object' || obj === null) {
            return 0
        }
        
        let maxDepth = 0
        for (const key in obj) {
            const depth = this.getObjectDepth(obj[key])
            maxDepth = Math.max(maxDepth, depth)
        }
        
        return maxDepth + 1
    }
}
```

## Rate Limiting y DoS Protection

### Rate Limiting Avanzado

```typescript
interface RateLimitConfig {
    windowMs: number
    maxRequests: number
    skipSuccessful?: boolean
    keyGenerator?: (socket: Socket) => string
}

class AdvancedRateLimiter {
    private limits = new Map<string, RateLimitConfig>()
    private requests = new Map<string, Array<{ timestamp: number, success: boolean }>>()
    
    constructor() {
        // Configurar límites por evento
        this.limits.set('movePlayer', {
            windowMs: 1000,
            maxRequests: 60 // 60 FPS max
        })
        
        this.limits.set('sendMessage', {
            windowMs: 60000,
            maxRequests: 10, // 10 mensajes por minuto
            skipSuccessful: false
        })
        
        this.limits.set('joinRealm', {
            windowMs: 60000,
            maxRequests: 5 // 5 intentos de unión por minuto
        })
        
        this.limits.set('teleport', {
            windowMs: 1000,
            maxRequests: 2 // 2 teletransportes por segundo
        })
    }
    
    isRateLimited(socket: Socket, event: string): boolean {
        const config = this.limits.get(event)
        if (!config) return false
        
        const key = `${socket.userId || socket.id}:${event}`
        const now = Date.now()
        
        // Obtener historial de requests
        let history = this.requests.get(key) || []
        
        // Limpiar requests antiguos
        history = history.filter(req => 
            now - req.timestamp < config.windowMs
        )
        
        // Verificar límite
        const relevantRequests = config.skipSuccessful 
            ? history.filter(req => !req.success)
            : history
        
        if (relevantRequests.length >= config.maxRequests) {
            logger.security('Rate limit exceeded:', {
                userId: socket.userId,
                event,
                requests: relevantRequests.length,
                limit: config.maxRequests
            })
            return true
        }
        
        // Registrar nuevo request
        history.push({ timestamp: now, success: false })
        this.requests.set(key, history)
        
        return false
    }
    
    markSuccess(socket: Socket, event: string) {
        const key = `${socket.userId || socket.id}:${event}`
        const history = this.requests.get(key)
        
        if (history && history.length > 0) {
            history[history.length - 1].success = true
        }
    }
}

// Implementación en event handlers
const rateLimiter = new AdvancedRateLimiter()

socket.on('movePlayer', async (data) => {
    if (rateLimiter.isRateLimited(socket, 'movePlayer')) {
        socket.emit('error', {
            event: 'movePlayer',
            code: 'RATE_LIMITED',
            message: 'Demasiados movimientos por segundo'
        })
        return
    }
    
    try {
        // Procesar movimiento
        await handlePlayerMove(socket, data)
        rateLimiter.markSuccess(socket, 'movePlayer')
    } catch (error) {
        // Error handling
    }
})
```

### Connection Limiting

```typescript
class ConnectionManager {
    private connectionsByIP = new Map<string, Set<string>>()
    private connectionsByUser = new Map<string, Set<string>>()
    
    private readonly MAX_CONNECTIONS_PER_IP = 10
    private readonly MAX_CONNECTIONS_PER_USER = 3
    
    canConnect(socket: Socket): boolean {
        const ip = this.getClientIP(socket)
        const userId = socket.userId
        
        // Verificar límite por IP
        const ipConnections = this.connectionsByIP.get(ip) || new Set()
        if (ipConnections.size >= this.MAX_CONNECTIONS_PER_IP) {
            logger.security('Too many connections from IP:', ip)
            return false
        }
        
        // Verificar límite por usuario
        if (userId) {
            const userConnections = this.connectionsByUser.get(userId) || new Set()
            if (userConnections.size >= this.MAX_CONNECTIONS_PER_USER) {
                logger.security('Too many connections for user:', userId)
                return false
            }
        }
        
        return true
    }
    
    addConnection(socket: Socket) {
        const ip = this.getClientIP(socket)
        const userId = socket.userId
        const socketId = socket.id
        
        // Registrar por IP
        if (!this.connectionsByIP.has(ip)) {
            this.connectionsByIP.set(ip, new Set())
        }
        this.connectionsByIP.get(ip)!.add(socketId)
        
        // Registrar por usuario
        if (userId) {
            if (!this.connectionsByUser.has(userId)) {
                this.connectionsByUser.set(userId, new Set())
            }
            this.connectionsByUser.get(userId)!.add(socketId)
        }
    }
    
    removeConnection(socket: Socket) {
        const ip = this.getClientIP(socket)
        const userId = socket.userId
        const socketId = socket.id
        
        // Remover de IP
        const ipConnections = this.connectionsByIP.get(ip)
        if (ipConnections) {
            ipConnections.delete(socketId)
            if (ipConnections.size === 0) {
                this.connectionsByIP.delete(ip)
            }
        }
        
        // Remover de usuario
        if (userId) {
            const userConnections = this.connectionsByUser.get(userId)
            if (userConnections) {
                userConnections.delete(socketId)
                if (userConnections.size === 0) {
                    this.connectionsByUser.delete(userId)
                }
            }
        }
    }
    
    private getClientIP(socket: Socket): string {
        return socket.handshake.address ||
               socket.request.headers['x-forwarded-for'] as string ||
               socket.request.connection.remoteAddress ||
               'unknown'
    }
}
```

## Seguridad de Comunicación

### CORS Configuration

```typescript
// Configuración CORS estricta
const corsOptions = {
    origin: (origin: string | undefined, callback: Function) => {
        const allowedOrigins = [
            process.env.FRONTEND_URL,
            'https://roledesk.app',
            'https://www.roledesk.app'
        ]
        
        // Permitir requests sin origin (apps móviles, postman, etc.) solo en desarrollo
        if (!origin && process.env.NODE_ENV === 'development') {
            return callback(null, true)
        }
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true)
        } else {
            logger.security('CORS blocked origin:', origin)
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}

app.use(cors(corsOptions))

// Socket.IO CORS
const io = new SocketIOServer(server, {
    cors: {
        origin: corsOptions.origin,
        credentials: true
    }
})
```

### WebSocket Security

```typescript
// Validación de origen para WebSockets
io.use((socket, next) => {
    const origin = socket.handshake.headers.origin
    
    if (!origin) {
        return next(new Error('Origin header required'))
    }
    
    const allowedOrigins = [
        process.env.FRONTEND_URL,
        'https://roledesk.app'
    ]
    
    if (!allowedOrigins.includes(origin)) {
        logger.security('WebSocket blocked origin:', origin)
        return next(new Error('Origin not allowed'))
    }
    
    next()
})

// Timeout para conexiones inactivas
const INACTIVE_TIMEOUT = 30 * 60 * 1000 // 30 minutos

io.use((socket, next) => {
    let lastActivity = Date.now()
    
    // Actualizar actividad en cualquier evento
    socket.onAny(() => {
        lastActivity = Date.now()
    })
    
    // Verificar actividad periódicamente
    const activityCheck = setInterval(() => {
        if (Date.now() - lastActivity > INACTIVE_TIMEOUT) {
            logger.security('Disconnecting inactive socket:', socket.id)
            socket.disconnect(true)
            clearInterval(activityCheck)
        }
    }, 5 * 60 * 1000) // Verificar cada 5 minutos
    
    socket.on('disconnect', () => {
        clearInterval(activityCheck)
    })
    
    next()
})
```

## Logging y Monitoring de Seguridad

### Security Event Logging

```typescript
class SecurityLogger {
    private static logSecurityEvent(
        level: 'info' | 'warn' | 'error' | 'critical',
        event: string,
        details: object
    ) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            event,
            details,
            source: 'security'
        }
        
        console.log(`[SECURITY-${level.toUpperCase()}]`, JSON.stringify(logEntry))
        
        // En producción, enviar a servicio de logging
        if (process.env.NODE_ENV === 'production') {
            // sendToLoggingService(logEntry)
        }
    }
    
    static authFailure(reason: string, userId?: string, ip?: string) {
        this.logSecurityEvent('warn', 'AUTH_FAILURE', {
            reason, userId, ip
        })
    }
    
    static rateLimitExceeded(userId: string, event: string, ip: string) {
        this.logSecurityEvent('warn', 'RATE_LIMIT_EXCEEDED', {
            userId, event, ip
        })
    }
    
    static unauthorizedAccess(userId: string, resource: string, action: string) {
        this.logSecurityEvent('error', 'UNAUTHORIZED_ACCESS', {
            userId, resource, action
        })
    }
    
    static suspiciousActivity(userId: string, activity: string, details: object) {
        this.logSecurityEvent('critical', 'SUSPICIOUS_ACTIVITY', {
            userId, activity, details
        })
    }
}
```

### Anomaly Detection

```typescript
class AnomalyDetector {
    private userBehavior = new Map<string, {
        actions: Array<{ event: string, timestamp: number }>
        averageRate: number
        lastCalculation: number
    }>()
    
    recordAction(userId: string, event: string) {
        const now = Date.now()
        
        if (!this.userBehavior.has(userId)) {
            this.userBehavior.set(userId, {
                actions: [],
                averageRate: 0,
                lastCalculation: now
            })
        }
        
        const behavior = this.userBehavior.get(userId)!
        behavior.actions.push({ event, timestamp: now })
        
        // Mantener solo acciones de la última hora
        behavior.actions = behavior.actions.filter(
            action => now - action.timestamp < 3600000
        )
        
        // Calcular tasa promedio cada 5 minutos
        if (now - behavior.lastCalculation > 300000) {
            this.calculateAverageRate(userId)
            this.detectAnomalies(userId)
        }
    }
    
    private calculateAverageRate(userId: string) {
        const behavior = this.userBehavior.get(userId)!
        const now = Date.now()
        const recentActions = behavior.actions.filter(
            action => now - action.timestamp < 300000 // Últimos 5 minutos
        )
        
        behavior.averageRate = recentActions.length / 5 // Acciones por minuto
        behavior.lastCalculation = now
    }
    
    private detectAnomalies(userId: string) {
        const behavior = this.userBehavior.get(userId)!
        
        // Detectar picos de actividad anómalos
        if (behavior.averageRate > 100) { // Más de 100 acciones por minuto
            SecurityLogger.suspiciousActivity(userId, 'HIGH_ACTIVITY_RATE', {
                rate: behavior.averageRate,
                actionsCount: behavior.actions.length
            })
        }
        
        // Detectar patrones de spam
        const recentMessages = behavior.actions.filter(
            action => action.event === 'sendMessage' &&
                     Date.now() - action.timestamp < 60000
        )
        
        if (recentMessages.length > 20) { // Más de 20 mensajes por minuto
            SecurityLogger.suspiciousActivity(userId, 'MESSAGE_SPAM', {
                messageCount: recentMessages.length
            })
        }
    }
}

const anomalyDetector = new AnomalyDetector()

// Usar en event handlers
socket.on('sendMessage', (data) => {
    anomalyDetector.recordAction(socket.userId, 'sendMessage')
    // ... resto del handler
})
```

## Data Protection

### Sensitive Data Handling

```typescript
// Utilidades para manejo de datos sensibles
class DataProtection {
    static maskEmail(email: string): string {
        const [local, domain] = email.split('@')
        const maskedLocal = local.substring(0, 2) + '***'
        return `${maskedLocal}@${domain}`
    }
    
    static sanitizeUserData(user: any): any {
        return {
            id: user.id,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            // NO incluir email, tokens, o información sensible
        }
    }
    
    static sanitizeRealmData(realm: any): any {
        return {
            id: realm.id,
            map_data: realm.map_data,
            created_at: realm.created_at,
            // NO incluir owner_id en respuestas públicas
        }
    }
    
    static hashSensitiveData(data: string): string {
        const crypto = require('crypto')
        return crypto.createHash('sha256').update(data).digest('hex')
    }
}

// Aplicar en respuestas de API
app.get('/api/realms/:id', async (req, res) => {
    try {
        const realm = await getRealm(req.params.id)
        
        // Sanitizar datos antes de enviar
        const sanitizedRealm = DataProtection.sanitizeRealmData(realm)
        
        res.json(sanitizedRealm)
    } catch (error) {
        res.status(500).json({ error: 'Server error' })
    }
})
```

## Security Headers

```typescript
// Middleware de seguridad para headers HTTP
app.use((req, res, next) => {
    // Prevenir XSS
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-XSS-Protection', '1; mode=block')
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' wss: https:"
    )
    
    // HTTPS redirection
    if (process.env.NODE_ENV === 'production' && !req.secure) {
        return res.redirect(`https://${req.get('host')}${req.url}`)
    }
    
    next()
})
```

## Incident Response

### Security Incident Detection

```typescript
class IncidentResponse {
    private static incidents = new Map<string, {
        level: 'low' | 'medium' | 'high' | 'critical'
        count: number
        firstSeen: number
        lastSeen: number
    }>()
    
    static reportIncident(
        type: string,
        level: 'low' | 'medium' | 'high' | 'critical',
        details: object
    ) {
        const now = Date.now()
        
        if (!this.incidents.has(type)) {
            this.incidents.set(type, {
                level,
                count: 1,
                firstSeen: now,
                lastSeen: now
            })
        } else {
            const incident = this.incidents.get(type)!
            incident.count++
            incident.lastSeen = now
            
            // Escalar si hay muchos incidentes del mismo tipo
            if (incident.count > 10) {
                incident.level = 'high'
            }
        }
        
        // Notificar según la severidad
        this.handleIncident(type, level, details)
    }
    
    private static handleIncident(
        type: string,
        level: 'low' | 'medium' | 'high' | 'critical',
        details: object
    ) {
        SecurityLogger.suspiciousActivity('SYSTEM', type, details)
        
        if (level === 'critical') {
            // Alertas inmediatas para incidentes críticos
            this.sendCriticalAlert(type, details)
        }
        
        if (level === 'high' || level === 'critical') {
            // Auto-mitigación para incidentes graves
            this.autoMitigate(type, details)
        }
    }
    
    private static sendCriticalAlert(type: string, details: object) {
        // Implementar notificaciones (Slack, email, etc.)
        console.error('CRITICAL SECURITY INCIDENT:', { type, details })
    }
    
    private static autoMitigate(type: string, details: object) {
        // Implementar respuestas automáticas
        switch (type) {
            case 'MASS_FAILED_AUTH':
                // Temporal IP blocking
                break
            case 'DDoS_DETECTED':
                // Rate limiting agresivo
                break
            case 'DATA_BREACH_ATTEMPT':
                // Alertas y logging adicional
                break
        }
    }
}
```

## Security Checklist

### Pre-Deployment Security Audit

- [ ] **Authentication**
  - [ ] JWT tokens validados correctamente
  - [ ] Tokens expirados manejados apropiadamente
  - [ ] No hay hard-coded secrets

- [ ] **Authorization** 
  - [ ] Row Level Security habilitado
  - [ ] Permissions verificados en cada endpoint
  - [ ] No hay privilege escalation paths

- [ ] **Input Validation**
  - [ ] Todos los inputs validados con Zod
  - [ ] Sanitización de HTML/JS
  - [ ] Límites de tamaño implementados

- [ ] **Rate Limiting**
  - [ ] Rate limits configurados por endpoint
  - [ ] Connection limits implementados
  - [ ] DDoS protection activado

- [ ] **Data Protection**
  - [ ] Datos sensibles no loggeados
  - [ ] PII sanitizado en respuestas
  - [ ] Encryption configurado correctamente

- [ ] **Monitoring**
  - [ ] Security logging implementado
  - [ ] Anomaly detection configurado
  - [ ] Incident response procedures documentados

- [ ] **Network Security**
  - [ ] HTTPS/WSS enforced
  - [ ] CORS configurado correctamente
  - [ ] Security headers implementados

### Regular Security Maintenance

```bash
# Comandos para auditoría regular
npm audit                    # Vulnerabilidades en dependencias
npm outdated                 # Dependencias desactualizadas

# Análisis de código estático
npx eslint src/ --ext .ts    # Linting de seguridad

# Verificación de secrets
git secrets --scan          # Buscar secrets en código
```

## Emergency Procedures

### Security Breach Response

1. **Detección Inmediata**
   ```typescript
   // Trigger manual de emergencia
   app.post('/emergency/lockdown', adminAuth, (req, res) => {
       // Desconectar todos los usuarios
       io.disconnectSockets()
       
       // Deshabilitar nuevas conexiones
       process.env.EMERGENCY_MODE = 'true'
       
       res.json({ status: 'lockdown activated' })
   })
   ```

2. **Investigación**
   - Revisar logs de seguridad
   - Identificar vector de ataque
   - Evaluar datos comprometidos

3. **Mitigación**
   - Aplicar parches de emergencia
   - Revocar tokens comprometidos
   - Actualizar reglas de firewall

4. **Comunicación**
   - Notificar a usuarios afectados
   - Reportar a autoridades si es necesario
   - Documentar incidente

5. **Recovery**
   - Restaurar servicios gradualmente
   - Implementar monitoreo adicional
   - Revisar y actualizar procedimientos

---

**⚠️ Importante:** Este documento debe mantenerse actualizado y revisarse regularmente. La seguridad es un proceso continuo, no un estado final.
