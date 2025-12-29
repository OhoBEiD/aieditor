-- Migration: Add github_username column to sites table
-- Run this in Supabase SQL Editor

-- Add column to track which GitHub user has been linked as collaborator
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS github_username TEXT;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sites_github_username ON public.sites(github_username);
