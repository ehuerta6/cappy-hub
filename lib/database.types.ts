export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      branches: {
        Row: {
          created_at: string;
          id: number;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      event_branches: {
        Row: {
          branch_id: number;
          event_id: number;
        };
        Insert: {
          branch_id: number;
          event_id: number;
        };
        Update: {
          branch_id?: number;
          event_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_branches_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_officers: {
        Row: {
          event_id: number;
          officer_id: number;
        };
        Insert: {
          event_id: number;
          officer_id: number;
        };
        Update: {
          event_id?: number;
          officer_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_officers_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_officers_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_officers_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          created_at: string;
          description: string;
          ends_at: string;
          id: number;
          location: string | null;
          name: string;
          starts_at: string;
          status: string;
          type: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          ends_at: string;
          id?: number;
          location?: string | null;
          name: string;
          starts_at: string;
          status?: string;
          type: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          ends_at?: string;
          id?: number;
          location?: string | null;
          name?: string;
          starts_at?: string;
          status?: string;
          type?: string;
        };
        Relationships: [];
      };
      officer_branches: {
        Row: {
          branch_id: number;
          officer_id: number;
        };
        Insert: {
          branch_id: number;
          officer_id: number;
        };
        Update: {
          branch_id?: number;
          officer_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "officer_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "officer_branches_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "officer_branches_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      officers: {
        Row: {
          classification: string | null;
          created_at: string;
          id: number;
          name: string;
          personal_email: string | null;
          position_id: number;
          status: string;
          utep_email: string | null;
        };
        Insert: {
          classification?: string | null;
          created_at?: string;
          id?: number;
          name: string;
          personal_email?: string | null;
          position_id: number;
          status?: string;
          utep_email?: string | null;
        };
        Update: {
          classification?: string | null;
          created_at?: string;
          id?: number;
          name?: string;
          personal_email?: string | null;
          position_id?: number;
          status?: string;
          utep_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "officers_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      point_transactions: {
        Row: {
          award_type: string;
          created_at: string;
          created_by: string | null;
          event_id: number | null;
          id: number;
          officer_id: number;
          points: number;
          reason: string;
        };
        Insert: {
          award_type: string;
          created_at?: string;
          created_by?: string | null;
          event_id?: number | null;
          id?: number;
          officer_id: number;
          points: number;
          reason: string;
        };
        Update: {
          award_type?: string;
          created_at?: string;
          created_by?: string | null;
          event_id?: number | null;
          id?: number;
          officer_id?: number;
          points?: number;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: "point_transactions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      positions: {
        Row: {
          can_manage_branch_events: boolean;
          created_at: string;
          id: number;
          name: string;
        };
        Insert: {
          can_manage_branch_events?: boolean;
          created_at?: string;
          id?: number;
          name: string;
        };
        Update: {
          can_manage_branch_events?: boolean;
          created_at?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      dashboard_summary: {
        Row: {
          active_officer_count: number | null;
          half_year_points: number | null;
          upcoming_event_count: number | null;
        };
        Relationships: [];
      };
      officer_point_totals: {
        Row: {
          id: number | null;
          name: string | null;
          total_points: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      change_event_signup: {
        Args: { p_event_id: number; p_officer_id: number; p_remove?: boolean };
        Returns: undefined;
      };
      process_completed_events: {
        Args: { p_points_per_hour: number };
        Returns: number;
      };
      save_event: {
        Args: {
          p_branch_ids: number[];
          p_description: string;
          p_ends_at: string;
          p_event_id?: number;
          p_location: string;
          p_name: string;
          p_starts_at: string;
          p_type: string;
        };
        Returns: number;
      };
      save_officer: {
        Args: {
          p_branch_ids: number[];
          p_classification?: string;
          p_name: string;
          p_officer_id?: number;
          p_personal_email?: string;
          p_position_id: number;
          p_status: string;
          p_utep_email?: string;
        };
        Returns: number;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
