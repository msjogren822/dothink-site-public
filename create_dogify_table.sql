-- Create table for storing dogified images
-- Run this in your Supabase SQL editor

CREATE TABLE dogify_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Image data
  image_data BYTEA NOT NULL,
  image_format VARCHAR(10) DEFAULT 'jpeg' CHECK (image_format IN ('jpeg', 'png', 'webp')),
  image_size INTEGER NOT NULL, -- file size in bytes
  
  -- Image metadata
  width INTEGER DEFAULT 600,
  height INTEGER DEFAULT 600,
  
  -- Generation details (optional, for analytics/debugging)
  scene_analysis TEXT,
  generation_prompt TEXT,
  model_used VARCHAR(50),
  generation_time_seconds INTEGER,
  
  -- Optional user tracking (for future features)
  user_session VARCHAR(255), -- could store a session ID if needed
  user_agent TEXT,
  ip_address INET,
  
  -- Sharing metadata
  share_count INTEGER DEFAULT 0,
  last_shared_at TIMESTAMP WITH TIME ZONE
);

-- Create index for faster lookups
CREATE INDEX idx_dogify_images_created_at ON dogify_images(created_at DESC);
CREATE INDEX idx_dogify_images_user_session ON dogify_images(user_session) WHERE user_session IS NOT NULL;

-- Enable Row Level Security (RLS) for security
ALTER TABLE dogify_images ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to read images (for sharing)
CREATE POLICY "Allow public read access" ON dogify_images
  FOR SELECT USING (true);

-- Policy: Allow anyone to insert images (for creating new dogified images)
CREATE POLICY "Allow public insert" ON dogify_images
  FOR INSERT WITH CHECK (true);

-- Optional: Policy to prevent updates/deletes (images are immutable)
CREATE POLICY "Prevent updates" ON dogify_images
  FOR UPDATE USING (false);

CREATE POLICY "Prevent deletes" ON dogify_images
  FOR DELETE USING (false);

-- Create a function to serve images (returns base64 encoded data)
CREATE OR REPLACE FUNCTION get_dogify_image(image_id UUID)
RETURNS TABLE(
  image_data_base64 TEXT,
  content_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    encode(di.image_data, 'base64') as image_data_base64,
    CASE 
      WHEN di.image_format = 'jpeg' THEN 'image/jpeg'
      WHEN di.image_format = 'png' THEN 'image/png'
      WHEN di.image_format = 'webp' THEN 'image/webp'
      ELSE 'image/jpeg'
    END as content_type,
    di.created_at
  FROM dogify_images di
  WHERE di.id = image_id;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_dogify_image(UUID) TO anon, authenticated;

-- Optional: Create a cleanup function to remove old images (run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_dogify_images(days_old INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM dogify_images 
  WHERE created_at < NOW() - INTERVAL '1 day' * days_old;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Create a view for public image metadata (without binary data)
CREATE VIEW dogify_image_metadata AS
SELECT 
  id,
  created_at,
  image_format,
  image_size,
  width,
  height,
  model_used,
  generation_time_seconds,
  share_count,
  last_shared_at
FROM dogify_images;

-- Grant access to the view
GRANT SELECT ON dogify_image_metadata TO anon, authenticated;

-- Comment the table
COMMENT ON TABLE dogify_images IS 'Stores AI-generated dogified images with metadata';
COMMENT ON COLUMN dogify_images.image_data IS 'Binary image data (JPEG/PNG/WebP)';
COMMENT ON COLUMN dogify_images.scene_analysis IS 'AI analysis of the original scene';
COMMENT ON COLUMN dogify_images.generation_prompt IS 'Prompt used for AI image generation';
COMMENT ON COLUMN dogify_images.share_count IS 'Number of times this image has been shared';
