export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string
          user_id: string
          title: string
          raw_description: string
          images: string[]
          group_urls: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          title: string
          raw_description?: string
          images?: string[]
          group_urls?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          raw_description?: string
          images?: string[]
          group_urls?: string[]
          updated_at?: string
        }
      }
      generated_posts: {
        Row: {
          id: string
          property_id: string
          title: string
          content: string
          style: string
          variant_index: number
          selected_images: string[]
          is_approved: boolean
          status: 'draft' | 'approved' | 'scheduled'
          created_at: string
        }
        Insert: {
          id?: string
          property_id: string
          title: string
          content: string
          style: string
          variant_index: number
          selected_images?: string[]
          is_approved?: boolean
          status?: 'draft' | 'approved' | 'scheduled'
          created_at?: string
        }
        Update: {
          title?: string
          content?: string
          style?: string
          selected_images?: string[]
          is_approved?: boolean
          status?: 'draft' | 'approved' | 'scheduled'
        }
      }
      schedules: {
        Row: {
          id: string
          user_id: string
          post_id: string
          property_id: string
          target_group_url: string
          scheduled_at: string
          status: 'pending' | 'posting' | 'success' | 'failed'
          error_log: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          post_id: string
          property_id: string
          target_group_url: string
          scheduled_at: string
          status?: 'pending' | 'posting' | 'success' | 'failed'
          error_log?: string | null
          created_at?: string
        }
        Update: {
          status?: 'pending' | 'posting' | 'success' | 'failed'
          error_log?: string | null
        }
      }
      posting_logs: {
        Row: {
          id: string
          schedule_id: string
          posted_at: string | null
          result: 'success' | 'failed'
          error_message: string | null
          screenshot_url: string | null
        }
        Insert: {
          id?: string
          schedule_id: string
          posted_at?: string | null
          result: 'success' | 'failed'
          error_message?: string | null
          screenshot_url?: string | null
        }
        Update: {
          posted_at?: string | null
          result?: 'success' | 'failed'
          error_message?: string | null
        }
      }
      app_settings: {
        Row: {
          user_id: string
          fb_connected: boolean
          extension_token: string | null
          extension_connected: boolean
          default_golden_hours: string[]
          agent_name: string
          agent_phone: string
          extension_visible_mode: boolean
          custom_system_prompt: string | null
          updated_at: string
        }
        Insert: {
          user_id: string
          fb_connected?: boolean
          extension_token?: string | null
          extension_connected?: boolean
          default_golden_hours?: string[]
          agent_name?: string
          agent_phone?: string
          extension_visible_mode?: boolean
          custom_system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          fb_connected?: boolean
          extension_token?: string | null
          extension_connected?: boolean
          default_golden_hours?: string[]
          agent_name?: string
          agent_phone?: string
          extension_visible_mode?: boolean
          custom_system_prompt?: string | null
          updated_at?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}

// Convenience types
export type Property = Database['public']['Tables']['properties']['Row']
export type PropertyInsert = Database['public']['Tables']['properties']['Insert']
export type PropertyUpdate = Database['public']['Tables']['properties']['Update']

export type GeneratedPost = Database['public']['Tables']['generated_posts']['Row']
export type GeneratedPostInsert = Database['public']['Tables']['generated_posts']['Insert']

export type Schedule = Database['public']['Tables']['schedules']['Row']
export type ScheduleInsert = Database['public']['Tables']['schedules']['Insert']

export type PostingLog = Database['public']['Tables']['posting_logs']['Row']
export type AppSettings = Database['public']['Tables']['app_settings']['Row']

export type ScheduleStatus = Schedule['status']
export type PostStatus = GeneratedPost['status']
