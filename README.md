# RoleDesk Backend

Servidor backend para el clon de Gather construido con Node.js, TypeScript y Socket.IO que maneja espacios virtuales colaborativos, movimiento de jugadores en tiempo real y video chat por proximidad.

## 🚀 Características

- **API REST**: Autenticación y gestión de espacios virtuales
- **WebSocket en tiempo real**: Sincronización de movimiento de jugadores
- **Sistema de proximidad**: Lógica de proximidad para video chat automático
- **Gestión de sesiones**: Manejo de múltiples salas y jugadores
- **Autenticación**: Integración con Supabase Auth
- **Sistema de salas**: Soporte para múltiples salas con teletransporte
- **Events System**: Chat, cambio de skins y movimiento en tiempo real

## �️ Tecnologías

- **Runtime**: [Node.js 18+](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Lenguaje**: [TypeScript](https://www.typescriptlang.org/)
- **Real-time**: [Socket.IO](https://socket.io/)
- **Base de datos**: [Supabase](https://supabase.com/)
- **Validación**: [Zod](https://zod.dev/)
- **Autenticación**: Supabase Auth
- **Herramientas**: ts-node, nodemon

## 📋 Requisitos Previos

- Node.js 18+
- npm o yarn
- Cuenta de Supabase configurada
- Proyecto Supabase con tablas configuradas

## � Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd gather-clone/RoleDesk_B
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   # o
   yarn install
   ```

3. **Configurar variables de entorno**
   
   Crea un archivo `.env` en la raíz del proyecto:
   ```env
   # Puerto del servidor
   PORT=3001
   
   # Supabase
   SUPABASE_URL=tu_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=tu_supabase_service_role_key
   
   # CORS (opcional)
   ALLOWED_ORIGINS=http://localhost:3000
   ```

4. **Ejecutar en modo desarrollo**
   ```bash
   npm run dev
   # o
   yarn dev
   ```

   El servidor estará disponible en `http://localhost:3001`

## 🏗️ Estructura del Proyecto

```
RoleDesk_B/
├── src/
│   ├── index.ts              # Punto de entrada del servidor
│   ├── supabase.ts          # Configuración de Supabase
│   ├── session.ts           # Gestión de sesiones y jugadores
│   ├── Users.ts             # Gestión de usuarios en memoria
│   ├── utils.ts             # Utilidades generales
│   ├── routes/              # Rutas REST
│   │   ├── routes.ts        # Definición de rutas
│   │   └── route-types.ts   # Tipos para rutas
│   └── sockets/             # Sistema WebSocket
│       ├── sockets.ts       # Manejadores de eventos Socket.IO
│       ├── socket-types.ts  # Tipos y esquemas de validación
│       └── helpers.ts       # Funciones auxiliares
├── package.json             # Configuración del proyecto
├── tsconfig.json           # Configuración de TypeScript
└── .env.example            # Ejemplo de variables de entorno
```

## 🎮 Funcionalidades

### Sistema de Espacios Virtuales
- Creación y gestión de espacios (realms)
- Validación de permisos y links compartidos
- Soporte para mapas personalizados

### Movimiento en Tiempo Real
- Sincronización de posiciones de jugadores
- Sistema de proximidad para video chat
- Teletransporte entre salas

### Eventos Socket.IO
- `joinRealm`: Unirse a un espacio virtual
- `movePlayer`: Movimiento de jugadores
- `teleport`: Teletransporte entre salas
- `changedSkin`: Cambio de apariencia
- `sendMessage`: Chat en tiempo real
- `proximityUpdate`: Actualizaciones de proximidad

### Gestión de Sesiones
- Múltiples jugadores por sesión
- Manejo de desconexiones
- Prevención de múltiples conexiones

## 🔧 Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Inicia el servidor con ts-node y nodemon

# Construcción
npm run build        # Compila TypeScript a JavaScript
npm run start        # Inicia el servidor compilado

# Utilidades
npm run type-check   # Verifica tipos de TypeScript
npm run clean        # Limpia archivos compilados
```

## 🗄️ Base de Datos

### Tablas de Supabase

**realms**
```sql
CREATE TABLE realms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id),
  share_id UUID,
  map_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**profiles**
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  skin TEXT DEFAULT '009',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## � Autenticación

El servidor utiliza Supabase Auth para validar tokens de acceso:

1. El cliente envía el token en el header `Authorization: Bearer <token>`
2. El servidor valida el token con Supabase
3. Se establecen las sesiones Socket.IO autenticadas

## 🐛 Solución de Problemas

### Problemas Comunes

**Error: "Invalid access token or uid"**
- Verifica que el token de Supabase sea válido
- Asegúrate de que el UID coincida con el usuario autenticado

**Jugadores no se sincronizan**
- Verifica que los eventos Socket.IO se estén emitiendo correctamente
- Revisa los logs del servidor para errores de sesión

**Base de datos no conecta**
- Verifica las credenciales de Supabase en `.env`
- Asegúrate de que las tablas existan

### Logs de Debug

El servidor incluye logs detallados:
- `Backend -` para logs generales del servidor
- `Session -` para gestión de sesiones
- `Socket -` para eventos WebSocket

## 📡 API REST

### Endpoints Principales

```
GET  /health              # Estado del servidor
POST /api/realms          # Crear nuevo espacio
GET  /api/realms/:id      # Obtener datos del espacio
PUT  /api/realms/:id      # Actualizar espacio
```

## 🚀 Despliegue

### Railway/Heroku
1. Configura las variables de entorno en el dashboard
2. Conecta tu repositorio
3. Despliega automáticamente

### VPS/Servidor Dedicado
```bash
npm run build
npm start
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["npm", "start"]
```

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -m 'Agrega nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

### Estándares de Código
- Usa TypeScript para todo el código nuevo
- Valida datos de entrada con Zod
- Mantén funciones pequeñas y enfocadas
- Documenta APIs y funciones complejas
- Maneja errores apropiadamente

## 🧪 Testing

```bash
# Instalar dependencias de testing
npm install --save-dev jest @types/jest ts-jest

# Ejecutar tests
npm test

# Coverage
npm run test:coverage
```

## � Licencia

Este proyecto está licenciado bajo la GNU General Public License v3.0 - ver el archivo [LICENSE](LICENSE) para más detalles.

### GPL v3.0
Esta es una licencia de software libre que garantiza:
- ✅ Libertad para usar el software para cualquier propósito
- ✅ Libertad para estudiar y modificar el código fuente
- ✅ Libertad para redistribuir copias
- ✅ Libertad para distribuir versiones modificadas
- ⚠️ Cualquier trabajo derivado debe usar la misma licencia GPL

## 👤 Autor

**Diego Chicuazuque**
- GitHub: [@diego-chicuazuque](https://github.com/diego-chicuazuque)
- Email: diego.chicuazuque@email.com

## 🙏 Agradecimientos

- [Socket.IO](https://socket.io/) por el excelente framework de WebSockets
- [Supabase](https://supabase.com/) por la infraestructura de backend
- La comunidad de Node.js y TypeScript
- Contribuidores del proyecto open source

## 📊 Estado del Proyecto

🟢 **Activo**: En desarrollo activo con nuevas características siendo agregadas regularmente.

### Roadmap
- [ ] Sistema de moderación
- [ ] Rate limiting avanzado
- [ ] Métricas y monitoring
- [ ] Clustering para escalabilidad
- [ ] Sistema de plugins
- [ ] API GraphQL

## 🔗 Enlaces Relacionados

- [Frontend RoleDesk](../RoleDesk_F/README.md)
- [Documentación de Supabase](https://supabase.com/docs)
- [Documentación de Socket.IO](https://socket.io/docs/)

---

Made with ❤️ by Diego Chicuazuque
