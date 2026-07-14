export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      creator_revenue_rules: {
        Row: {
          created_at: string
          id: string
          note: string | null
          share_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          share_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          share_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          balance_after: number
          created_by: string | null
          created_at: string
          delta: number
          id: string
          note: string | null
          reason: string
          ref_id: string | null
          ref_type: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_by?: string | null
          created_at?: string
          delta: number
          id?: string
          note?: string | null
          reason: string
          ref_id?: string | null
          ref_type?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_by?: string | null
          created_at?: string
          delta?: number
          id?: string
          note?: string | null
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_orders: {
        Row: {
          amount_usd: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          credits: number
          currency: string
          id: string
          network: string
          note: string | null
          package_id: string
          refunded_at: string | null
          refund_reason: string | null
          status: Database["public"]["Enums"]["credit_order_status"]
          tx_hash: string | null
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          amount_usd: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          credits: number
          currency: string
          id?: string
          network: string
          note?: string | null
          package_id: string
          refunded_at?: string | null
          refund_reason?: string | null
          status?: Database["public"]["Enums"]["credit_order_status"]
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          amount_usd?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          network?: string
          note?: string | null
          package_id?: string
          refunded_at?: string | null
          refund_reason?: string | null
          status?: Database["public"]["Enums"]["credit_order_status"]
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      home_placements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          slot: Database["public"]["Enums"]["home_slot"]
          sort_order: number
          story_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          slot: Database["public"]["Enums"]["home_slot"]
          sort_order?: number
          story_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          slot?: Database["public"]["Enums"]["home_slot"]
          sort_order?: number
          story_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_placements_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_api_providers: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          last_reset_at: string
          model: string | null
          monthly_token_quota: number
          notes: string | null
          priority: number
          provider: string
          reset_day_of_month: number
          updated_at: string
          used_tokens: number
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          last_reset_at?: string
          model?: string | null
          monthly_token_quota?: number
          notes?: string | null
          priority?: number
          provider?: string
          reset_day_of_month?: number
          updated_at?: string
          used_tokens?: number
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          last_reset_at?: string
          model?: string | null
          monthly_token_quota?: number
          notes?: string | null
          priority?: number
          provider?: string
          reset_day_of_month?: number
          updated_at?: string
          used_tokens?: number
        }
        Relationships: []
      }
      llm_usage_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          provider_id: string | null
          purpose: string | null
          succeeded: boolean
          tokens_used: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          purpose?: string | null
          succeeded?: boolean
          tokens_used?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          purpose?: string | null
          succeeded?: boolean
          tokens_used?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_log_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "llm_api_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          asset_type: string
          beat_id: string | null
          chapter_id: string | null
          content_hash: string
          created_at: string
          file_name: string
          file_size: number
          id: string
          metadata: Json
          mime_type: string
          status: string
          storage_path: string
          story_id: string | null
          tags: string[]
          updated_at: string
          user_id: string
          validation_errors: string[]
        }
        Insert: {
          asset_type: string
          beat_id?: string | null
          chapter_id?: string | null
          content_hash: string
          created_at?: string
          file_name: string
          file_size?: number
          id?: string
          metadata?: Json
          mime_type: string
          status?: string
          storage_path: string
          story_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
          validation_errors?: string[]
        }
        Update: {
          asset_type?: string
          beat_id?: string | null
          chapter_id?: string | null
          content_hash?: string
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          metadata?: Json
          mime_type?: string
          status?: string
          storage_path?: string
          story_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
          validation_errors?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      media_unlocks: {
        Row: {
          beat_id: string
          created_at: string
          credits_spent: number
          heat_tier: string
          id: string
          story_id: string
          unlocked_via: string
          user_id: string
        }
        Insert: {
          beat_id: string
          created_at?: string
          credits_spent?: number
          heat_tier: string
          id?: string
          story_id: string
          unlocked_via?: string
          user_id: string
        }
        Update: {
          beat_id?: string
          created_at?: string
          credits_spent?: number
          heat_tier?: string
          id?: string
          story_id?: string
          unlocked_via?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          age_verified: boolean
          avatar_url: string | null
          created_at: string
          credits: number
          display_name: string | null
          id: string
          is_subscribed: boolean
          subscription_expires_at: string | null
          updated_at: string
        }
        Insert: {
          age_verified?: boolean
          avatar_url?: string | null
          created_at?: string
          credits?: number
          display_name?: string | null
          id: string
          is_subscribed?: boolean
          subscription_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          age_verified?: boolean
          avatar_url?: string | null
          created_at?: string
          credits?: number
          display_name?: string | null
          id?: string
          is_subscribed?: boolean
          subscription_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      saved_endings: {
        Row: {
          created_at: string
          ending_id: string
          ending_kind: string | null
          ending_title: string
          id: string
          session_id: string | null
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ending_id: string
          ending_kind?: string | null
          ending_title: string
          id?: string
          session_id?: string | null
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          ending_id?: string
          ending_kind?: string | null
          ending_title?: string
          id?: string
          session_id?: string | null
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_endings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      story_affection: {
        Row: {
          affection: number
          created_at: string
          story_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affection?: number
          created_at?: string
          story_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affection?: number
          created_at?: string
          story_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_affection_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_chat_messages: {
        Row: {
          affection_at: number | null
          content: string
          created_at: string
          id: string
          role: string
          scene_offset: number | null
          story_id: string
          user_id: string
        }
        Insert: {
          affection_at?: number | null
          content: string
          created_at?: string
          id?: string
          role: string
          scene_offset?: number | null
          story_id: string
          user_id: string
        }
        Update: {
          affection_at?: number | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          scene_offset?: number | null
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_chat_messages_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_choices: {
        Row: {
          affection_delta: number
          arousal_delta: number
          choice_id: string
          choice_label: string
          created_at: string
          id: string
          node_id: string
          session_id: string
          trust_delta: number
          user_id: string
        }
        Insert: {
          affection_delta?: number
          arousal_delta?: number
          choice_id: string
          choice_label: string
          created_at?: string
          id?: string
          node_id: string
          session_id: string
          trust_delta?: number
          user_id: string
        }
        Update: {
          affection_delta?: number
          arousal_delta?: number
          choice_id?: string
          choice_label?: string
          created_at?: string
          id?: string
          node_id?: string
          session_id?: string
          trust_delta?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_choices_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      story_messages: {
        Row: {
          background_url: string | null
          content: string
          created_at: string
          emotion: string | null
          id: string
          node_id: string | null
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          background_url?: string | null
          content: string
          created_at?: string
          emotion?: string | null
          id?: string
          node_id?: string | null
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          background_url?: string | null
          content?: string
          created_at?: string
          emotion?: string | null
          id?: string
          node_id?: string | null
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      story_purchases: {
        Row: {
          author_share: number
          buyer_id: string
          created_at: string
          id: string
          price_credits_paid: number
          story_id: string
        }
        Insert: {
          author_share?: number
          buyer_id: string
          created_at?: string
          id?: string
          price_credits_paid?: number
          story_id: string
        }
        Update: {
          author_share?: number
          buyer_id?: string
          created_at?: string
          id?: string
          price_credits_paid?: number
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_purchases_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sessions: {
        Row: {
          affection: number
          arousal: number
          character_id: string | null
          created_at: string
          current_node: string
          ending_id: string | null
          id: string
          is_bookmarked: boolean
          is_completed: boolean
          last_played_at: string
          mode: string
          story_id: string
          trust: number
          updated_at: string
          user_id: string
        }
        Insert: {
          affection?: number
          arousal?: number
          character_id?: string | null
          created_at?: string
          current_node?: string
          ending_id?: string | null
          id?: string
          is_bookmarked?: boolean
          is_completed?: boolean
          last_played_at?: string
          mode?: string
          story_id: string
          trust?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          affection?: number
          arousal?: number
          character_id?: string | null
          created_at?: string
          current_node?: string
          ending_id?: string | null
          id?: string
          is_bookmarked?: boolean
          is_completed?: boolean
          last_played_at?: string
          mode?: string
          story_id?: string
          trust?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      story_versions: {
        Row: {
          beats: Json
          character_card: Json
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          story_id: string
          title: string
        }
        Insert: {
          beats: Json
          character_card: Json
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          story_id: string
          title: string
        }
        Update: {
          beats?: Json
          character_card?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          story_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_versions_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "user_stories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stories: {
        Row: {
          asset_slots: Json
          audience: string
          beats: Json
          body_text: string | null
          character_card: Json
          compose_step: string
          cover_url: string | null
          created_at: string
          id: string
          is_listed: boolean
          is_public: boolean
          logline: string | null
          max_heat: string
          model: string | null
          price_credits: number
          source_prompt: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_slots?: Json
          audience?: string
          beats?: Json
          body_text?: string | null
          character_card?: Json
          compose_step?: string
          cover_url?: string | null
          created_at?: string
          id?: string
          is_listed?: boolean
          is_public?: boolean
          logline?: string | null
          max_heat?: string
          model?: string | null
          price_credits?: number
          source_prompt: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_slots?: Json
          audience?: string
          beats?: Json
          body_text?: string | null
          character_card?: Json
          compose_step?: string
          cover_url?: string | null
          created_at?: string
          id?: string
          is_listed?: boolean
          is_public?: boolean
          logline?: string | null
          max_heat?: string
          model?: string | null
          price_credits?: number
          source_prompt?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_confirm_credit_order: {
        Args: { _note?: string; _order_id: string; _tx_hash: string }
        Returns: {
          amount_usd: number
          created_at: string
          credits: number
          currency: string
          id: string
          network: string
          note: string | null
          package_id: string
          status: Database["public"]["Enums"]["credit_order_status"]
          tx_hash: string | null
          updated_at: string
          user_id: string
          wallet_address: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bump_story_affection: {
        Args: { _delta: number; _story_id: string }
        Returns: number
      }
      consume_credits: {
        Args: {
          _amount: number
          _reason: string
          _ref_id?: string
          _ref_type?: string
        }
        Returns: number
      }
      get_marketplace_story_meta: {
        Args: { _id: string }
        Returns: {
          audience: string
          author_id: string
          author_name: string
          beats_count: number
          character_card: Json
          cover_url: string
          created_at: string
          id: string
          logline: string
          max_heat: string
          preview: Json
          price_credits: number
          tags: string[]
          title: string
        }[]
      }
      get_playable_user_story: {
        Args: { _id: string }
        Returns: {
          asset_slots: Json
          audience: string
          beats: Json
          body_text: string | null
          character_card: Json
          compose_step: string
          cover_url: string | null
          created_at: string
          id: string
          is_listed: boolean
          is_public: boolean
          logline: string | null
          max_heat: string
          model: string | null
          price_credits: number
          source_prompt: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_stories"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_home_placements: {
        Args: { _slot: Database["public"]["Enums"]["home_slot"] }
        Returns: {
          audience: string
          author_id: string
          author_name: string
          cover_url: string
          created_at: string
          id: string
          logline: string
          max_heat: string
          price_credits: number
          slot: Database["public"]["Enums"]["home_slot"]
          sort_order: number
          story_id: string
          tags: string[]
          title: string
        }[]
      }
      list_marketplace_stories: {
        Args: {
          _audience?: string
          _limit?: number
          _max_heat?: string
          _q?: string
          _tags?: string[]
        }
        Returns: {
          audience: string
          author_id: string
          author_name: string
          beats_count: number
          cover_url: string
          created_at: string
          id: string
          logline: string
          max_heat: string
          price_credits: number
          tags: string[]
          title: string
        }[]
      }
      list_my_purchased_stories: {
        Args: never
        Returns: {
          author_name: string
          cover_url: string
          id: string
          logline: string
          price_credits_paid: number
          purchased_at: string
          title: string
        }[]
      }
      pick_next_llm_provider: {
        Args: never
        Returns: {
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          last_reset_at: string
          model: string | null
          monthly_token_quota: number
          notes: string | null
          priority: number
          provider: string
          reset_day_of_month: number
          updated_at: string
          used_tokens: number
        }
        SetofOptions: {
          from: "*"
          to: "llm_api_providers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purchase_user_story: {
        Args: { _story_id: string }
        Returns: {
          author_share: number
          buyer_id: string
          created_at: string
          id: string
          price_credits_paid: number
          story_id: string
        }
        SetofOptions: {
          from: "*"
          to: "story_purchases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_llm_usage: {
        Args: {
          _error?: string
          _provider_id: string
          _purpose?: string
          _succeeded?: boolean
          _tokens: number
        }
        Returns: {
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          last_reset_at: string
          model: string | null
          monthly_token_quota: number
          notes: string | null
          priority: number
          provider: string
          reset_day_of_month: number
          updated_at: string
          used_tokens: number
        }
        SetofOptions: {
          from: "*"
          to: "llm_api_providers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_llm_provider_quota: {
        Args: { _provider_id: string }
        Returns: {
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          last_reset_at: string
          model: string | null
          monthly_token_quota: number
          notes: string | null
          priority: number
          provider: string
          reset_day_of_month: number
          updated_at: string
          used_tokens: number
        }
        SetofOptions: {
          from: "*"
          to: "llm_api_providers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unlock_beat_media: {
        Args: {
          _beat_id: string
          _cost: number
          _heat_tier: string
          _story_id: string
        }
        Returns: {
          beat_id: string
          created_at: string
          credits_spent: number
          heat_tier: string
          id: string
          story_id: string
          unlocked_via: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "media_unlocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "editor"
      credit_order_status: "pending" | "submitted" | "confirmed" | "failed" | "refunded"
      home_slot: "hero" | "trending" | "new" | "all"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user", "editor"],
      credit_order_status: ["pending", "submitted", "confirmed", "failed", "refunded"],
      home_slot: ["hero", "trending", "new", "all"],
    },
  },
} as const
