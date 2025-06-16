# RoleDesk Backend 🖥️

Backend del proyecto **RoleDesk**, una plataforma colaborativa en tiempo real que simula una oficina virtual. Este repositorio contiene la API REST, servicios WebSocket y lógica de negocio que permiten el registro de usuarios, la visualización de presencia, chat en tiempo real, control remoto opcional y más.

---

## 🚀 Comenzando

Sigue estos pasos para levantar el backend localmente, compilarlo y ejecutarlo.

### ✅ Requisitos previos

```bash
Node.js >= 18
MongoDB (o cuenta en MongoDB Atlas)
Git
```

---

## 💻 Instalación

Clona el repositorio y entra al directorio del backend:

```bash
git clone https://github.com/tuusuario/roledesk-backend.git
cd roledesk-backend
```

Instala las dependencias:

```bash
npm install
```

Configura las variables de entorno en un archivo `.env`:

```
PORT=4000
MONGO_URI=mongodb+srv://<usuario>:<password>@cluster.mongodb.net/roledesk
JWT_SECRET=una_clave_secreta_segura
```

Ejecuta el servidor de desarrollo:

```bash
npm run dev
```

---

## 📂 Estructura del Proyecto

```
├── src
│   ├── controllers      # Lógica de negocio
│   ├── models           # Modelos de datos (MongoDB)
│   ├── routes           # Rutas REST
│   ├── services         # Servicios auxiliares (auth, presencia...)
│   ├── socket           # WebSocket Gateway
│   └── index.js         # Punto de entrada
├── tests                # Pruebas unitarias e integración
├── .env.example         # Ejemplo de variables de entorno
├── package.json         # Configuración del proyecto
└── README.md
```

---

## 📡 API REST y Eventos

* Autenticación JWT
* CRUD de usuarios y espacios virtuales
* WebSocket para chat, presencia y control remoto

Consulta [`docs/api.md`](docs/api.md) y [`docs/ws-events.md`](docs/ws-events.md) para más detalles.

---

## 🧪 Pruebas

Las pruebas están escritas con **Jest**.

Para ejecutarlas:

```bash
npm test
```

Consulta [`docs/pruebas.md`](docs/pruebas.md) para ver:

* Casos de prueba
* Mock de servicios externos
* Cobertura y métricas

---

## 📐 Diseño y Arquitectura

Consulta [`docs/diseño.md`](docs/diseño.md) y [`docs/arquitectura.md`](docs/arquitectura.md) para conocer:

* Diagrama de clases/servicios
* Esquema de base de datos
* Arquitectura hexagonal y separación de responsabilidades

---

## ☁️ Despliegue en AWS

El backend está diseñado para ser desplegado en AWS:

* EC2: Instancia de servidor Node.js
* MongoDB Atlas o Amazon DocumentDB
* S3: Almacenamiento de archivos (futuros adjuntos)
* IAM: Control de accesos

Próximamente en el repositorio [`infra/`](infra/) se documentarán scripts y plantillas de infraestructura como código (IaC).

---

## ✅ Integración continua

Usamos **GitHub Actions** para ejecutar:

* Tests automatizados
* Linter y validaciones de estilo
* Deploy opcional a entorno de staging

---

## 👤 Autor

**Diego Chicuazuque**
[marzo245](https://github.com/marzo245)

---

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

---

## 📚 Documentación complementaria

* [`docs/diseño.md`](docs/diseño.md)
* [`docs/pruebas.md`](docs/pruebas.md)
* [`docs/ws-events.md`](docs/ws-events.md)
* [`docs/api.md`](docs/api.md)
* [`docs/arquitectura.md`](docs/arquitectura.md)
