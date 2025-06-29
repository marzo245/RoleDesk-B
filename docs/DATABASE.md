# Database Schema Documentation

## Configuración de Supabase

### Tablas Requeridas

#### 1. Tabla `realms`
```sql
CREATE TABLE realms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  share_id UUID DEFAULT gen_random_uuid(),
  map_data JSONB NOT NULL DEFAULT '{}',
  only_owner BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para optimización
CREATE INDEX idx_realms_owner_id ON realms(owner_id);
CREATE INDEX idx_realms_share_id ON realms(share_id);
CREATE INDEX idx_realms_created_at ON realms(created_at);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_realms_updated_at BEFORE UPDATE
    ON realms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 2. Tabla `profiles`
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  skin TEXT DEFAULT '009',
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger para crear perfil automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE
    ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Row Level Security (RLS)

#### Realms Security
```sql
-- Habilitar RLS
ALTER TABLE realms ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver sus propios realms
CREATE POLICY "Users can view own realms" ON realms
    FOR SELECT USING (auth.uid() = owner_id);

-- Política: Los usuarios pueden crear realms
CREATE POLICY "Users can create realms" ON realms
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Política: Los usuarios pueden actualizar sus propios realms
CREATE POLICY "Users can update own realms" ON realms
    FOR UPDATE USING (auth.uid() = owner_id);

-- Política: Los usuarios pueden eliminar sus propios realms
CREATE POLICY "Users can delete own realms" ON realms
    FOR DELETE USING (auth.uid() = owner_id);

-- Política: Acceso público para realms compartidos (solo lectura)
CREATE POLICY "Public access to shared realms" ON realms
    FOR SELECT USING (share_id IS NOT NULL AND only_owner = false);
```

#### Profiles Security
```sql
-- Habilitar RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver su propio perfil
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);

-- Política: Los usuarios pueden actualizar su propio perfil
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Política: Acceso público de lectura a perfiles (para mostrar otros usuarios)
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);
```

### Funciones de Base de Datos

#### 1. Función para obtener realm por share_id
```sql
CREATE OR REPLACE FUNCTION get_realm_by_share_id(share_uuid UUID)
RETURNS TABLE (
    id UUID,
    owner_id UUID,
    share_id UUID,
    map_data JSONB,
    only_owner BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    owner_display_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.owner_id,
        r.share_id,
        r.map_data,
        r.only_owner,
        r.created_at,
        r.updated_at,
        p.display_name as owner_display_name
    FROM realms r
    LEFT JOIN profiles p ON r.owner_id = p.id
    WHERE r.share_id = share_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 2. Función para limpiar realms antiguos
```sql
CREATE OR REPLACE FUNCTION cleanup_old_realms()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM realms 
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND owner_id NOT IN (
        SELECT id FROM auth.users WHERE last_sign_in_at > NOW() - INTERVAL '30 days'
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Triggers de Notificación en Tiempo Real

#### Notificación de cambios en realms
```sql
-- Trigger para notificar cambios en realms
CREATE OR REPLACE FUNCTION notify_realm_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        PERFORM pg_notify('realm_updated', 
            json_build_object(
                'old', row_to_json(OLD),
                'new', row_to_json(NEW)
            )::text
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM pg_notify('realm_deleted', 
            json_build_object('old', row_to_json(OLD))::text
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER realm_changes_trigger
    AFTER UPDATE OR DELETE ON realms
    FOR EACH ROW EXECUTE FUNCTION notify_realm_changes();
```

### Configuración de Variables de Entorno

```env
# Supabase Configuration
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
SERVICE_ROLE=tu_service_role_key_aqui

# Database Connection (si necesitas acceso directo)
DATABASE_URL=postgresql://postgres:password@db.supabase.co:5432/postgres
```

### Migración de Datos

#### Script de migración inicial
```sql
-- Migración v1.0.0 - Estructura básica
BEGIN;

-- Crear extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Crear tablas
-- (aquí van las tablas ya mostradas arriba)

-- Insertar datos de prueba (opcional)
INSERT INTO realms (owner_id, map_data) VALUES 
(
    (SELECT id FROM auth.users LIMIT 1),
    '{"name": "Sala de Prueba", "dimensions": {"width": 800, "height": 600}}'::jsonb
);

COMMIT;
```

### Backup y Restauración

#### Backup automatizado
```bash
# Backup completo
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup solo de datos
pg_dump --data-only $DATABASE_URL > data_backup_$(date +%Y%m%d).sql

# Backup de estructura
pg_dump --schema-only $DATABASE_URL > schema_backup.sql
```

#### Restauración
```bash
# Restaurar backup completo
psql $DATABASE_URL < backup_file.sql

# Restaurar solo datos
psql $DATABASE_URL < data_backup.sql
```

### Monitoreo y Performance

#### Consultas útiles para monitoreo
```sql
-- Ver realms más activos
SELECT 
    r.id,
    r.map_data->>'name' as realm_name,
    p.display_name as owner_name,
    r.created_at,
    r.updated_at
FROM realms r
JOIN profiles p ON r.owner_id = p.id
ORDER BY r.updated_at DESC
LIMIT 10;

-- Estadísticas de uso
SELECT 
    COUNT(*) as total_realms,
    COUNT(DISTINCT owner_id) as unique_owners,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as created_today,
    COUNT(CASE WHEN updated_at > NOW() - INTERVAL '24 hours' THEN 1 END) as active_today
FROM realms;

-- Tamaño de la base de datos
SELECT 
    schemaname,
    tablename,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size_pretty
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;
```

### Troubleshooting Común

#### Problemas de conexión
```sql
-- Verificar conexiones activas
SELECT count(*) as active_connections 
FROM pg_stat_activity 
WHERE state = 'active';

-- Ver consultas lentas
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

#### Optimización de índices
```sql
-- Encontrar tablas sin índices en columnas frecuentemente consultadas
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE schemaname = 'public' 
AND n_distinct > 100;

-- Analizar uso de índices
SELECT 
    indexrelname as index_name,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

### Configuración de Desarrollo vs Producción

#### Desarrollo
- Logs de queries habilitados
- Row Level Security relajado para testing
- Seeds de datos de prueba

#### Producción  
- Row Level Security estricto
- Backups automatizados diarios
- Monitoreo de performance
- Límites de conexión configurados
- SSL obligatorio
