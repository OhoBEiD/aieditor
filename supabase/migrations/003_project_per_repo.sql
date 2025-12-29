-- Migration: Add project-per-repo support
-- Run this in Supabase SQL Editor

-- 1. Add user_id column to link projects to users
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.clients(id) ON DELETE CASCADE;

-- 2. Add source_type to distinguish new vs imported projects
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'new' CHECK (source_type IN ('new', 'imported'));

-- 3. Add index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_sites_user_id ON public.sites(user_id);

-- 4. Optional: Add a description column for projects
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS description TEXT;
