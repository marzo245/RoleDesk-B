# API Reference Documentation

## Visión General

RoleDesk Backend proporciona una API REST para gestionar espacios virtuales (realms), usuarios y configuraciones, junto con una API WebSocket para comunicación en tiempo real.

**Base URL:** `http://localhost:3001` (desarrollo) | `https://api.roledesk.app` (producción)

**Versión API:** v1.0

## Autenticación

### Esquema de Autenticación

La API utiliza **JWT Bearer Tokens** proporcionados por Supabase Auth.

```http
Authorization: Bearer <jwt_token>
```

### Flujo de Autenticación

1. El cliente se autentica con Supabase Auth
2. Obtiene un JWT token válido
3. Incluye el token en todas las requests a la API
4. El servidor valida el token con Supabase

### Errores de Autenticación

| Código | Descripción | Solución |
|--------|-------------|----------|
| `401` | Token inválido o expirado | Renovar token |
| `403` | Sin permisos para el recurso | Verificar ownership |

## REST API Endpoints

### Health Check

Verifica el estado del servidor.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-06-28T10:30:00Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

**Status Codes:**
- `200` - Servidor funcionando correctamente
- `503` - Servidor con problemas

---

### Realms (Espacios Virtuales)

#### Crear Nuevo Realm

Crea un nuevo espacio virtual.

```http
POST /api/realms
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "map_data": {
    "name": "Mi Espacio Virtual",
    "description": "Un espacio para colaborar",
    "dimensions": {
      "width": 1200,
      "height": 800
    },
    "rooms": [
      {
        "id": "room1",
        "name": "Sala Principal",
        "x": 0,
        "y": 0,
        "width": 600,
        "height": 400,
        "background": "default"
      }
    ],
    "objects": [
      {
        "id": "obj1",
        "type": "table",
        "x": 300,
        "y": 200,
        "width": 100,
        "height": 60
      }
    ],
    "spawn_points": [
      {
        "x": 100,
        "y": 100,
        "room_id": "room1"
      }
    ]
  },
  "only_owner": false,
  "share_id": "custom-share-id" // Opcional
}
```

**Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "660e8400-e29b-41d4-a716-446655440001",
  "share_id": "770e8400-e29b-41d4-a716-446655440002",
  "map_data": { /* mismo objeto enviado */ },
  "only_owner": false,
  "created_at": "2025-06-28T10:30:00Z",
  "updated_at": "2025-06-28T10:30:00Z"
}
```

**Errores:**
- `400` - Datos inválidos en map_data
- `401` - Token inválido
- `413` - map_data demasiado grande (>1MB)

---

#### Obtener Realm por ID

Obtiene los datos de un espacio virtual específico.

```http
GET /api/realms/{realm_id}
Authorization: Bearer <jwt_token>
```

**Parameters:**
- `realm_id` (string, required) - UUID del realm

**Query Parameters:**
- `share_id` (string, optional) - Share ID para acceso público

**Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "660e8400-e29b-41d4-a716-446655440001",
  "share_id": "770e8400-e29b-41d4-a716-446655440002",
  "map_data": {
    "name": "Mi Espacio Virtual",
    "dimensions": {
      "width": 1200,
      "height": 800
    },
    "rooms": [...],
    "objects": [...],
    "spawn_points": [...]
  },
  "only_owner": false,
  "created_at": "2025-06-28T10:30:00Z",
  "updated_at": "2025-06-28T10:30:00Z",
  "owner": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "display_name": "Juan Pérez",
    "avatar_url": "https://example.com/avatar.jpg"
  }
}
```

**Errores:**
- `404` - Realm no encontrado
- `403` - Sin permisos para acceder (realm privado)

---

#### Actualizar Realm

Actualiza los datos de un espacio virtual existente.

```http
PUT /api/realms/{realm_id}
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "map_data": {
    // Nuevos datos del mapa
  },
  "only_owner": true,
  "share_id": "new-share-id" // Opcional
}
```

**Response (200):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "updated_at": "2025-06-28T11:30:00Z",
  "message": "Realm updated successfully"
}
```

**Errores:**
- `404` - Realm no encontrado
- `403` - Solo el owner puede actualizar
- `400` - Datos inválidos

---

#### Eliminar Realm

Elimina un espacio virtual.

```http
DELETE /api/realms/{realm_id}
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "message": "Realm deleted successfully"
}
```

**Errores:**
- `404` - Realm no encontrado
- `403` - Solo el owner puede eliminar

---

#### Listar Realms del Usuario

Obtiene todos los realms del usuario autenticado.

```http
GET /api/realms
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `limit` (number, optional) - Número máximo de resultados (default: 50, max: 100)
- `offset` (number, optional) - Número de resultados a omitir (default: 0)
- `order` (string, optional) - Campo de ordenamiento: `created_at`, `updated_at`, `name` (default: `updated_at`)
- `direction` (string, optional) - Dirección: `asc`, `desc` (default: `desc`)

**Response (200):**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "map_data": {
        "name": "Mi Primer Espacio"
      },
      "created_at": "2025-06-28T10:30:00Z",
      "updated_at": "2025-06-28T11:30:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1,
    "has_more": false
  }
}
```

---

### Profiles (Perfiles de Usuario)

#### Obtener Perfil

Obtiene el perfil de un usuario.

```http
GET /api/profiles/{user_id}
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "display_name": "Juan Pérez",
  "avatar_url": "https://example.com/avatar.jpg",
  "skin": "009",
  "created_at": "2025-06-01T10:00:00Z",
  "updated_at": "2025-06-28T10:30:00Z"
}
```

**Errores:**
- `404` - Usuario no encontrado
- `403` - Sin permisos para ver el perfil

---

#### Actualizar Perfil Propio

Actualiza el perfil del usuario autenticado.

```http
PUT /api/profiles/me
Content-Type: application/json
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "display_name": "Juan Carlos Pérez",
  "skin": "012",
  "avatar_url": "https://example.com/new-avatar.jpg"
}
```

**Response (200):**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "display_name": "Juan Carlos Pérez",
  "skin": "012",
  "updated_at": "2025-06-28T11:30:00Z"
}
```

**Errores:**
- `400` - Datos inválidos
- `413` - display_name demasiado largo (>100 chars)

---

### Analytics (Solo Admin)

#### Obtener Estadísticas del Sistema

```http
GET /api/admin/analytics
Authorization: Bearer <admin_jwt_token>
```

**Response (200):**
```json
{
  "users": {
    "total": 1250,
    "active_today": 45,
    "active_week": 180
  },
  "realms": {
    "total": 320,
    "created_today": 5,
    "active_sessions": 12
  },
  "events": {
    "total_today": 15000,
    "messages_today": 850,
    "movements_today": 12500
  }
}
```

---

## WebSocket API

### Conexión

```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: 'jwt_token_aqui'
  }
})
```

### Eventos Cliente → Servidor

#### joinRealm

Unirse a un espacio virtual.

**Payload:**
```javascript
socket.emit('joinRealm', {
  realmId: '550e8400-e29b-41d4-a716-446655440000',
  shareId: '770e8400-e29b-41d4-a716-446655440002' // Opcional
})
```

**Validación:**
- `realmId`: UUID válido requerido
- `shareId`: UUID válido opcional

**Respuestas:**
- `realmJoined` - Éxito al unirse
- `error` - Fallo en validación o permisos

---

#### movePlayer

Actualizar posición del jugador.

**Payload:**
```javascript
socket.emit('movePlayer', {
  x: 245.6,
  y: 180.2
})
```

**Validación:**
- `x`: Número entre -10000 y 10000
- `y`: Número entre -10000 y 10000

**Rate Limit:** 60 eventos por segundo

---

#### teleport

Teletransportar jugador.

**Payload:**
```javascript
socket.emit('teleport', {
  x: 400,
  y: 300,
  roomIndex: 1
})
```

**Validación:**
- `x`, `y`: Números válidos
- `roomIndex`: Entero >= 0

**Rate Limit:** 2 eventos por segundo

---

#### changedSkin

Cambiar apariencia del jugador.

**Payload:**
```javascript
socket.emit('changedSkin', 'avatar_002')
```

**Validación:**
- String de 1-50 caracteres
- Solo caracteres alfanuméricos, guiones y guiones bajos

**Rate Limit:** 1 evento por segundo

---

#### sendMessage

Enviar mensaje de chat.

**Payload:**
```javascript
socket.emit('sendMessage', '¡Hola a todos!')
```

**Validación:**
- String de 1-500 caracteres
- No puede ser solo espacios en blanco

**Rate Limit:** 10 mensajes por minuto

---

### Eventos Servidor → Cliente

#### realmJoined

Confirmación de unión exitosa al realm.

**Payload:**
```javascript
socket.on('realmJoined', (data) => {
  console.log(data)
  // {
  //   realm: {
  //     id: '550e8400-e29b-41d4-a716-446655440000',
  //     map_data: { ... },
  //     owner_id: '660e8400-e29b-41d4-a716-446655440001'
  //   },
  //   player: {
  //     id: '660e8400-e29b-41d4-a716-446655440001',
  //     x: 100,
  //     y: 100,
  //     skin: '009',
  //     displayName: 'Juan Pérez'
  //   },
  //   roomIndex: 0
  // }
})
```

---

#### playersInRealm

Lista de jugadores actuales en el realm.

**Payload:**
```javascript
socket.on('playersInRealm', (data) => {
  console.log(data)
  // {
  //   players: [
  //     {
  //       id: '660e8400-e29b-41d4-a716-446655440001',
  //       x: 150,
  //       y: 200,
  //       skin: '009',
  //       displayName: 'Juan Pérez',
  //       roomIndex: 0
  //     }
  //   ]
  // }
})
```

---

#### playerJoined

Nuevo jugador se unió al realm.

**Payload:**
```javascript
socket.on('playerJoined', (data) => {
  console.log(data)
  // {
  //   player: {
  //     id: '770e8400-e29b-41d4-a716-446655440002',
  //     x: 100,
  //     y: 100,
  //     skin: '012',
  //     displayName: 'María García',
  //     roomIndex: 0
  //   }
  // }
})
```

---

#### playerLeft

Jugador abandonó el realm.

**Payload:**
```javascript
socket.on('playerLeft', (data) => {
  console.log(data)
  // {
  //   playerId: '770e8400-e29b-41d4-a716-446655440002',
  //   reason: 'disconnect'
  // }
})
```

**Razones posibles:**
- `disconnect` - Desconexión del cliente
- `kicked` - Expulsado por moderador
- `realm_changed` - Se movió a otro realm

---

#### playerMoved

Otro jugador se movió.

**Payload:**
```javascript
socket.on('playerMoved', (data) => {
  console.log(data)
  // {
  //   playerId: '770e8400-e29b-41d4-a716-446655440002',
  //   x: 200,
  //   y: 150,
  //   timestamp: 1719575400000
  // }
})
```

---

#### proximityUpdate

Actualización de jugadores cercanos para video chat.

**Payload:**
```javascript
socket.on('proximityUpdate', (data) => {
  console.log(data)
  // {
  //   nearbyPlayers: [
  //     '770e8400-e29b-41d4-a716-446655440002',
  //     '880e8400-e29b-41d4-a716-446655440003'
  //   ],
  //   disconnectedPlayers: [
  //     '990e8400-e29b-41d4-a716-446655440004'
  //   ]
  // }
})
```

---

#### messageReceived

Nuevo mensaje de chat.

**Payload:**
```javascript
socket.on('messageReceived', (data) => {
  console.log(data)
  // {
  //   id: 'msg_123456',
  //   senderId: '770e8400-e29b-41d4-a716-446655440002',
  //   senderName: 'María García',
  //   message: '¡Hola a todos!',
  //   timestamp: 1719575400000,
  //   roomIndex: 0
  // }
})
```

---

#### sessionTerminated

Sesión terminada por el servidor.

**Payload:**
```javascript
socket.on('sessionTerminated', (data) => {
  console.log(data)
  // {
  //   reason: 'This realm has been changed by the owner.',
  //   code: 'REALM_UPDATED'
  // }
})
```

**Códigos de terminación:**
- `REALM_UPDATED` - Realm modificado por owner
- `REALM_DELETED` - Realm eliminado
- `OWNER_KICKED` - Expulsado por owner
- `SERVER_RESTART` - Mantenimiento del servidor

---

#### error

Error en procesamiento de eventos.

**Payload:**
```javascript
socket.on('error', (data) => {
  console.log(data)
  // {
  //   event: 'movePlayer',
  //   message: 'Coordenada X fuera de rango',
  //   code: 'VALIDATION_ERROR',
  //   details: {
  //     field: 'x',
  //     value: 15000,
  //     max: 10000
  //   }
  // }
})
```

**Códigos de error:**
- `VALIDATION_ERROR` - Datos inválidos
- `AUTH_ERROR` - Problema de autenticación
- `PERMISSION_ERROR` - Sin permisos
- `SERVER_ERROR` - Error interno del servidor
- `RATE_LIMITED` - Límite de rate excedido

---

## Rate Limiting

### Límites por Endpoint REST

| Endpoint | Límite | Ventana |
|----------|--------|---------|
| `POST /api/realms` | 10 requests | 1 hora |
| `PUT /api/realms/:id` | 30 requests | 1 hora |
| `GET /api/realms` | 100 requests | 10 minutos |
| `GET /api/realms/:id` | 200 requests | 10 minutos |

### Límites por Evento WebSocket

| Evento | Límite | Ventana |
|--------|--------|---------|
| `movePlayer` | 60 eventos | 1 segundo |
| `sendMessage` | 10 mensajes | 1 minuto |
| `joinRealm` | 5 intentos | 1 minuto |
| `teleport` | 2 eventos | 1 segundo |
| `changedSkin` | 1 evento | 1 segundo |

### Headers de Rate Limiting

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1719575400
```

---

## Códigos de Error

### HTTP Status Codes

| Código | Significado | Uso Común |
|--------|-------------|-----------|
| `200` | OK | Request exitoso |
| `201` | Created | Recurso creado exitosamente |
| `400` | Bad Request | Datos inválidos |
| `401` | Unauthorized | Token inválido/expirado |
| `403` | Forbidden | Sin permisos |
| `404` | Not Found | Recurso no encontrado |
| `413` | Payload Too Large | Datos demasiado grandes |
| `429` | Too Many Requests | Rate limit excedido |
| `500` | Internal Server Error | Error del servidor |
| `503` | Service Unavailable | Servidor temporalmente no disponible |

### Estructura de Error Estándar

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Los datos proporcionados no son válidos",
  "details": {
    "field": "map_data",
    "issue": "El campo 'name' es requerido"
  },
  "timestamp": "2025-06-28T11:30:00Z",
  "path": "/api/realms",
  "method": "POST"
}
```

---

## Ejemplos de Integración

### JavaScript/TypeScript

```typescript
// Configuración del cliente
import { io, Socket } from 'socket.io-client'

interface RealmData {
  id: string
  map_data: object
  owner_id: string
}

interface Player {
  id: string
  x: number
  y: number
  skin: string
  displayName: string
}

class RoleDeskClient {
  private socket: Socket
  private currentRealm: string | null = null
  
  constructor(serverUrl: string, token: string) {
    this.socket = io(serverUrl, {
      auth: { token }
    })
    
    this.setupEventListeners()
  }
  
  private setupEventListeners() {
    this.socket.on('realmJoined', (data: { realm: RealmData, player: Player }) => {
      this.currentRealm = data.realm.id
      console.log('Joined realm:', data.realm.id)
    })
    
    this.socket.on('playerMoved', (data: { playerId: string, x: number, y: number }) => {
      console.log(`Player ${data.playerId} moved to (${data.x}, ${data.y})`)
    })
    
    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error)
    })
  }
  
  async joinRealm(realmId: string, shareId?: string) {
    return new Promise((resolve, reject) => {
      this.socket.emit('joinRealm', { realmId, shareId })
      
      this.socket.once('realmJoined', resolve)
      this.socket.once('error', reject)
    })
  }
  
  movePlayer(x: number, y: number) {
    if (!this.currentRealm) {
      throw new Error('Not in a realm')
    }
    
    this.socket.emit('movePlayer', { x, y })
  }
  
  sendMessage(message: string) {
    this.socket.emit('sendMessage', message)
  }
}

// Uso
const client = new RoleDeskClient('http://localhost:3001', 'jwt_token_aqui')

async function main() {
  try {
    await client.joinRealm('550e8400-e29b-41d4-a716-446655440000')
    client.movePlayer(200, 150)
    client.sendMessage('¡Hola mundo!')
  } catch (error) {
    console.error('Error:', error)
  }
}
```

### React Hook

```typescript
// useRoleDesk.ts
import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseRoleDeskOptions {
  serverUrl: string
  token: string
  realmId?: string
}

export function useRoleDesk({ serverUrl, token, realmId }: UseRoleDeskOptions) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  
  useEffect(() => {
    const newSocket = io(serverUrl, {
      auth: { token }
    })
    
    newSocket.on('connect', () => {
      setConnected(true)
      setSocket(newSocket)
    })
    
    newSocket.on('disconnect', () => {
      setConnected(false)
    })
    
    newSocket.on('realmJoined', (data) => {
      setCurrentPlayer(data.player)
    })
    
    newSocket.on('playersInRealm', (data) => {
      setPlayers(data.players)
    })
    
    newSocket.on('playerJoined', (data) => {
      setPlayers(prev => [...prev, data.player])
    })
    
    newSocket.on('playerLeft', (data) => {
      setPlayers(prev => prev.filter(p => p.id !== data.playerId))
    })
    
    return () => {
      newSocket.close()
    }
  }, [serverUrl, token])
  
  useEffect(() => {
    if (socket && connected && realmId) {
      socket.emit('joinRealm', { realmId })
    }
  }, [socket, connected, realmId])
  
  const movePlayer = (x: number, y: number) => {
    socket?.emit('movePlayer', { x, y })
  }
  
  const sendMessage = (message: string) => {
    socket?.emit('sendMessage', message)
  }
  
  return {
    connected,
    players,
    currentPlayer,
    movePlayer,
    sendMessage
  }
}
```

---

## Testing de la API

### Jest Tests

```typescript
// api.test.ts
import request from 'supertest'
import { app } from '../src/index'

describe('API Endpoints', () => {
  let authToken: string
  
  beforeAll(async () => {
    // Obtener token de test
    authToken = await getTestToken()
  })
  
  describe('GET /health', () => {
    it('should return server status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200)
      
      expect(response.body).toHaveProperty('status', 'ok')
      expect(response.body).toHaveProperty('timestamp')
    })
  })
  
  describe('POST /api/realms', () => {
    it('should create a new realm', async () => {
      const realmData = {
        map_data: {
          name: 'Test Realm',
          dimensions: { width: 800, height: 600 }
        }
      }
      
      const response = await request(app)
        .post('/api/realms')
        .set('Authorization', `Bearer ${authToken}`)
        .send(realmData)
        .expect(201)
      
      expect(response.body).toHaveProperty('id')
      expect(response.body.map_data.name).toBe('Test Realm')
    })
    
    it('should reject invalid map_data', async () => {
      const invalidData = {
        map_data: null
      }
      
      await request(app)
        .post('/api/realms')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400)
    })
  })
})
```

### Postman Collection

```json
{
  "info": {
    "name": "RoleDesk API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3001"
    },
    {
      "key": "authToken",
      "value": "your_jwt_token_here"
    }
  ],
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/health",
          "host": ["{{baseUrl}}"],
          "path": ["health"]
        }
      }
    },
    {
      "name": "Create Realm",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{authToken}}"
          },
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"map_data\": {\n    \"name\": \"Test Realm\",\n    \"dimensions\": {\n      \"width\": 800,\n      \"height\": 600\n    }\n  }\n}"
        },
        "url": {
          "raw": "{{baseUrl}}/api/realms",
          "host": ["{{baseUrl}}"],
          "path": ["api", "realms"]
        }
      }
    }
  ]
}
```

---

## Versionado de API

### Esquema de Versionado

La API sigue [Semantic Versioning](https://semver.org/):

- **MAJOR**: Cambios incompatibles en la API
- **MINOR**: Nuevas funcionalidades compatibles hacia atrás  
- **PATCH**: Bug fixes compatibles

### Versión Actual: v1.0.0

### Headers de Versión

```http
API-Version: 1.0.0
```

### Deprecación

Las características deprecadas incluirán el header:

```http
Deprecated: true
Sunset: Sat, 01 Jan 2026 00:00:00 GMT
```

---

## Soporte y Recursos

- **Documentación**: [docs.roledesk.app](https://docs.roledesk.app)
- **GitHub**: [github.com/roledesk/backend](https://github.com/roledesk/backend)
- **Issues**: [github.com/roledesk/backend/issues](https://github.com/roledesk/backend/issues)
- **Discord**: [discord.gg/roledesk](https://discord.gg/roledesk)

---

*Última actualización: 28 de junio de 2025*
