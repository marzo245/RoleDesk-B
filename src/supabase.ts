import { createClient } from '@supabase/supabase-js'

require('dotenv').config()

export const supabase = createClient(process.env.SUPABASE_URL!, process.env.SERVICE_ROLE!)
